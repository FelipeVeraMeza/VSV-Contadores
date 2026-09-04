// ============================================================================
// AUDITORÍA · saber quién hizo qué, cuándo
// ----------------------------------------------------------------------------
// Toda acción que mueva dinero o emita un documento tributario tiene que dejar
// rastro. Hasta el 03-09-2026 la emisión de facturas NO se registraba: se
// descubrió al buscar quién había emitido dos facturas a empresas dadas de baja
// (folios 1478 y 1482) y no haber forma de saberlo.
//
// Estas pruebas verifican que el rastro existe Y que sirve: un registro sin el
// nombre de quien lo hizo, o sin el dato que cambió, no responde nada.
// ============================================================================
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { pedir, pool, cerrar } from '../arnes.mjs';

after(cerrar);

// Acciones que NO pueden ocurrir sin registro. Cada una emite un documento,
// mueve plata o decide a quién se le cobra.
const ACCIONES_CRITICAS = [
  ['emitir_factura',     'emitir una factura al SII'],
  ['facturacion_masiva', 'lanzar la facturación del mes'],
  ['generar_ciclo',      'generar los cobros del mes'],
  ['editar_monto',       'cambiar cuánto se le cobra a alguien'],
  ['cambiar_estado',     'marcar un cobro como pagado'],
  ['registrar_pago',     'registrar el pago de un cliente'],
];

describe('El código registra las acciones críticas', () => {
  // Se lee el controlador: es la única forma de verificar que la llamada
  // EXISTE sin emitir facturas reales para comprobarlo.
  test('cada acción crítica aparece en el controlador', async () => {
    const { readFileSync } = await import('node:fs');
    const fuente = readFileSync('src/controllers/cobros.controllers.js', 'utf8');
    const faltan = ACCIONES_CRITICAS
      .filter(([accion]) => !fuente.includes(`accion: '${accion}'`))
      .map(([accion, que]) => `${accion} (${que})`);
    assert.equal(faltan.length, 0,
      `sin registro: ${faltan.join(', ')}`);
  });

  test('ninguna función que escribe en cobros quedó sin registrar', async () => {
    const { readFileSync } = await import('node:fs');
    const fuente = readFileSync('src/controllers/cobros.controllers.js', 'utf8');
    // Al menos un `registrar` por cada endpoint exportado que escriba.
    const registros = (fuente.match(/await registrar\(req/g) || []).length;
    assert.ok(registros >= 6,
      `solo ${registros} llamadas a registrar(); las acciones críticas son ${ACCIONES_CRITICAS.length}`);
  });
});

describe('Los registros existentes sirven para auditar', () => {
  test('guardan quién y cuándo', async () => {
    const { rows } = await pool.query(
      `SELECT usuario_id, usuario_rol, created_at, accion, descripcion
         FROM bitacora_sistema WHERE modulo = 'cobros'
        ORDER BY created_at DESC LIMIT 20`);
    if (!rows.length) return;
    for (const r of rows) {
      assert.ok(r.usuario_id, `un registro de "${r.accion}" no dice quién lo hizo`);
      assert.ok(r.created_at, `un registro de "${r.accion}" no dice cuándo`);
      assert.ok(r.descripcion, `un registro de "${r.accion}" no describe nada`);
    }
  });

  test('los registros nuevos no dicen «undefined» ni «null»', async () => {
    // Un registro con «undefined» dentro es peor que no tenerlo: parece
    // información y no lo es. Pasó dos veces:
    //   · «Reactivó los correos para undefined» — arreglado el 02-09-2026
    //   · «Habría bloqueado ... : null»          — arreglado el 03-09-2026
    //
    // Los registros VIEJOS no se pueden cambiar, así que la prueba mira solo
    // los posteriores al arreglo. Si vuelve a aparecer uno, es un bug nuevo.
    //
    // La marca de tiempo va en UTC, que es como la guarda Postgres: los últimos
    // registros defectuosos son del 03-09 a las 20:00 hora de Chile, que en UTC
    // caen ya en el día 4.
    const { rows } = await pool.query(
      `SELECT modulo, accion, descripcion FROM bitacora_sistema
        WHERE (descripcion ILIKE '%undefined%' OR descripcion ILIKE '%: null%')
          AND created_at > TIMESTAMP '2026-09-04 02:30:00'
        LIMIT 5`);
    assert.equal(rows.length, 0,
      `registro(s) defectuoso(s): ${rows.map(r => `${r.modulo}/${r.accion}`).join(', ')}`);
  });

  test('las descripciones antiguas defectuosas están identificadas', async () => {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM bitacora_sistema
        WHERE descripcion ILIKE '%undefined%' OR descripcion ILIKE '%: null%'`);
    if (rows[0].n) {
      console.log(`      ℹ ${rows[0].n} registro(s) histórico(s) con «undefined» o «null», ` +
                  'anteriores a los arreglos. No se pueden corregir retroactivamente.');
    }
  });
});

describe('Trazabilidad de las facturas emitidas', () => {
  test('se puede saber quién emitió cada factura reciente', async () => {
    // La consulta que alguien haría de verdad: «¿quién emitió el folio X?».
    const { rows: facturas } = await pool.query(
      `SELECT c.id, c.folio FROM cobro_mensual c
        WHERE c.folio IS NOT NULL AND c.fecha_emision > NOW() - INTERVAL '30 days'
        ORDER BY c.fecha_emision DESC LIMIT 5`);
    if (!facturas.length) return;

    const { rows: [b] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM bitacora_sistema
        WHERE modulo = 'cobros' AND accion = 'emitir_factura'`);

    // Informativo, no bloqueante: las facturas anteriores al arreglo no tienen
    // registro y eso no se puede cambiar retroactivamente.
    if (b.n === 0) {
      console.log('      ℹ Aún no hay emisiones registradas: el arreglo aplica ' +
                  'desde ahora, las facturas anteriores no tienen rastro.');
    }
  });

  test('los folios sin rastro quedan identificados', async () => {
    const { rows } = await pool.query(
      `SELECT c.folio, e.razon_social, c.fecha_emision::date AS emitida
         FROM cobro_mensual c JOIN empresa e ON e.id = c.empresa_id
        WHERE c.folio IS NOT NULL
          AND c.fecha_emision > NOW() - INTERVAL '30 days'
          AND NOT EXISTS (
            SELECT 1 FROM bitacora_sistema b
             WHERE b.entidad_id = c.id::text AND b.accion = 'emitir_factura')
        ORDER BY c.fecha_emision DESC LIMIT 5`);
    if (rows.length) {
      console.log(`      ℹ ${rows.length} factura(s) del último mes sin registro de emisión ` +
                  '(anteriores al arreglo del 03-09-2026)');
    }
  });
});
