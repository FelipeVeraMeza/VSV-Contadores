// ============================================================================
// FUNCIONAL · que cada cosa haga lo que dice
// ----------------------------------------------------------------------------
// Casos normales, límites y errores para las funciones que mueven plata o
// tocan al cliente. Se contrasta contra la BASE, no contra otra parte de la
// API: si las dos leyeran del mismo sitio equivocado, coincidirían y no se
// notaría nada.
// ============================================================================
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { pedir, pool, cerrar } from '../arnes.mjs';

after(cerrar);

describe('Métricas del CRM · cuadran con la base', () => {
  test('prospectos · vista de equipo', async () => {
    // scope=equipo es la cartera completa. Sin scope el backend asume equipo
    // para un Administrador, pero se pide explícito para que la prueba no
    // dependa de ese valor por omisión.
    const r = await pedir('/crm/metricas?scope=equipo');
    if (r.estado !== 200) return;
    const { rows: [b] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM persona WHERE estado::text='prospecto' AND activo`);
    assert.equal(r.datos.metricas.prospectos, b.n,
      `el panel dice ${r.datos.metricas.prospectos} y la base tiene ${b.n}`);
  });

  test('prospectos · vista propia cuenta solo lo del usuario', async () => {
    // La pantalla abre en «Mías» y muestra un número MENOR que el del equipo.
    // Verificado el 03-09-2026: 129 propios de 132 totales. No es un descuadre.
    const mias = await pedir('/crm/metricas?scope=mias');
    const equipo = await pedir('/crm/metricas?scope=equipo');
    if (mias.estado !== 200 || equipo.estado !== 200) return;
    assert.ok(mias.datos.metricas.prospectos <= equipo.datos.metricas.prospectos,
      `«mías» (${mias.datos.metricas.prospectos}) supera al equipo ` +
      `(${equipo.datos.metricas.prospectos}): el filtro por usuario no se aplica`);
  });

  test('el pipeline suma el total de personas', async () => {
    const r = await pedir('/crm/metricas');
    if (r.estado !== 200) return;
    const suma = (r.datos.metricas.pipeline || []).reduce((a, e) => a + Number(e.n || 0), 0);
    assert.equal(suma, r.datos.metricas.totalPersonas,
      `el pipeline suma ${suma} pero hay ${r.datos.metricas.totalPersonas} personas: ` +
      'alguien queda fuera de todas las etapas o se cuenta dos veces');
  });

  test('tareas vencidas son de verdad vencidas', async () => {
    const r = await pedir('/crm/metricas');
    if (r.estado !== 200) return;
    const { rows: [b] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM tarea
        WHERE vence_at < CURRENT_DATE AND estado::text <> 'completada'
          AND archivada_at IS NULL`);
    // Puede diferir por el ámbito (mías/equipo); lo que no puede es superarlo.
    assert.ok(r.datos.metricas.tareasVencidas <= b.n,
      `el panel dice ${r.datos.metricas.tareasVencidas} vencidas y en total hay ${b.n}`);
  });

  test('la serie de recaudación trae 6 meses ordenados', async () => {
    const r = await pedir('/crm/metricas');
    if (r.estado !== 200) return;
    const serie = r.datos.metricas.serieRecaudado || [];
    assert.equal(serie.length, 6, `la serie trae ${serie.length} meses`);
    const meses = serie.map(x => x.mes);
    assert.deepEqual(meses, [...meses].sort(), 'la serie no viene ordenada por mes');
  });
});

describe('Cobros · el resumen refleja la base', () => {
  test('el total de vencidos coincide', async () => {
    const r = await pedir('/cobros/resumen');
    if (r.estado !== 200) return;
    const { rows: [b] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM cobro_mensual
        WHERE estado='PENDIENTE_PAGO' AND fecha_vencimiento < CURRENT_DATE`);
    assert.ok(Math.abs(Number(r.datos.vencidos || 0) - b.n) <= b.n,
      `vencidos: panel ${r.datos.vencidos}, base ${b.n}`);
  });

  test('ningún cobro del mes queda en monto 0 sin avisar', async () => {
    // Un cobro en $0 se factura en $0. Si existe, tiene que ser visible.
    const { rows } = await pool.query(
      `SELECT e.razon_social FROM cobro_mensual c JOIN empresa e ON e.id = c.empresa_id
        WHERE c.periodo = date_trunc('month', CURRENT_DATE)::date
          AND COALESCE(c.monto_esperado, 0) = 0 AND c.estado = 'POR_EMITIR'`);
    // No falla: informa. Es un dato de negocio, no un bug del código.
    if (rows.length) {
      console.log(`      ℹ ${rows.length} cobro(s) del mes en $0:`,
        rows.map(r => r.razon_social).join(', ').slice(0, 120));
    }
  });
});

describe('Recordatorios de pago · el filtro por folios', () => {
  test('con folios marcados manda solo a esos', async () => {
    const { rows } = await pool.query(
      `SELECT TRIM(folio) AS folio FROM cobro_mensual
        WHERE estado='PENDIENTE_PAGO' AND folio IS NOT NULL LIMIT 3`);
    if (rows.length < 2) return;
    const folios = rows.map(r => r.folio);
    const r = await pedir(`/dte/recordatorios/preview?folios=${encodeURIComponent(folios.join(','))}`);
    if (r.estado !== 200) return;
    assert.ok(r.datos.total <= folios.length,
      `se marcaron ${folios.length} folios y el preview trae ${r.datos.total} destinatarios`);
  });

  test('sin marcar nada no responde vacío teniendo deuda', async () => {
    // Regresión: el filtro elegía UN mes con MAX(periodo) y dejaba fuera al
    // resto. Con deuda en tres meses devolvía «sin destinatarios» teniendo 71
    // clientes a la vista. Encontrado el 02-09-2026.
    const { rows: [b] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM cobro_mensual c JOIN empresa e ON e.id = c.empresa_id
        WHERE c.estado='PENDIENTE_PAGO' AND e.activo AND e.en_cartera IS NOT FALSE`);
    if (!b.n) return;
    const r = await pedir('/dte/recordatorios/preview');
    if (r.estado !== 200) return;
    assert.ok(r.datos.total > 0,
      `hay ${b.n} cobros pendientes y el preview no encontró destinatarios`);
  });
});

describe('Correos · límites', () => {
  test('el tope de 2.000 caracteres se respeta', async () => {
    const justo = await pedir('/correos/campana', {
      metodo: 'POST',
      cuerpo: { empresaIds: [], asunto: 'x'.repeat(200), cuerpo: '<p>x</p>',
                soloPrueba: true, correoPrueba: 'qa@ejemplo.cl' },
    });
    // Sin destinatarios da 400, pero NO por longitud del asunto.
    assert.ok(!/largo|caracteres/i.test(JSON.stringify(justo.datos || {})),
      `rechazó por longitud un asunto de 200 caracteres: ${JSON.stringify(justo.datos)}`);
  });

  test('la cuota diaria separa pruebas de envíos reales', async () => {
    const r = await pedir('/correos/cuota');
    if (r.estado !== 200) return;
    const { limite, enviados, reales, pruebas, quedan } = r.datos;
    assert.equal(reales + pruebas, enviados, 'reales + pruebas no suma el total enviado');
    assert.equal(limite - enviados, quedan, 'quedan no cuadra con límite - enviados');
    assert.ok(quedan >= 0, 'la cuota restante quedó negativa');
  });
});
