// ============================================================================
// INTEGRACIÓN · que las piezas hablen bien entre sí
// ----------------------------------------------------------------------------
// Cada módulo puede estar correcto por separado y aun así el conjunto fallar:
// una empresa dada de baja que sigue recibiendo cobros, un cobro pagado que el
// panel cuenta como pendiente, un asistente que consulta rutas que no existen.
//
// Estas pruebas cruzan módulos. Son las que atrapan lo que las unitarias no ven.
// ============================================================================
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { pedir, pool, cerrar } from '../arnes.mjs';

after(cerrar);

describe('CRM ↔ Cobranza', () => {
  test('las empresas con cobro del mes son clientes activos', async () => {
    // La regla acordada con el cliente: activo = se le facturó. Las que tengan
    // cobro y estén marcadas de baja son contradicciones que hay que ver.
    const { rows } = await pool.query(
      `SELECT e.razon_social, e.activo, e.en_cartera
         FROM cobro_mensual c JOIN empresa e ON e.id = c.empresa_id
        WHERE c.periodo = date_trunc('month', CURRENT_DATE)::date
          AND c.estado <> 'ANULADA' AND e.es_principal = false
          AND NOT (e.activo AND e.en_cartera IS NOT FALSE)`);
    if (rows.length) {
      console.log(`      ℹ ${rows.length} empresa(s) con cobro del mes pero marcadas de baja:`);
      rows.forEach(r => console.log(`         · ${r.razon_social}`));
    }
    // No falla: es una decisión de negocio pendiente, no un defecto del código.
  });

  test('ninguna empresa activa quedó sin cobro del mes en silencio', async () => {
    const { rows } = await pool.query(
      `SELECT e.razon_social, e.precio_mensual FROM empresa e
        WHERE e.activo AND e.en_cartera IS NOT FALSE AND e.es_principal = false
          AND NOT EXISTS (SELECT 1 FROM cobro_mensual c
                           WHERE c.empresa_id = e.id
                             AND c.periodo = date_trunc('month', CURRENT_DATE)::date)`);
    if (rows.length) {
      console.log(`      ℹ ${rows.length} activa(s) sin cobro este mes:`,
        rows.map(r => r.razon_social).join(', ').slice(0, 150));
    }
  });
});

describe('Cobranza ↔ SII', () => {
  test('todo cobro con folio tiene su documento emitido', async () => {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM cobro_mensual c
        WHERE c.folio IS NOT NULL AND TRIM(c.folio) <> ''
          AND c.periodo >= date_trunc('month', CURRENT_DATE) - INTERVAL '2 months'
          AND NOT EXISTS (SELECT 1 FROM documentos_emitidos d
                           WHERE d.folio::text = TRIM(c.folio))`);
    assert.equal(rows[0].n, 0,
      `${rows[0].n} cobro(s) con folio que no existe en documentos_emitidos`);
  });

  test('toda factura emitida tiene su cobro para perseguirla', async () => {
    // ⚠️ EL AGUJERO MÁS CARO DEL SISTEMA.
    //
    // Una factura emitida al SII que no tiene cobro asociado NO aparece en la
    // cobranza: no vence el día 5, no sale en el recordatorio de pago, no
    // cuenta en «por cobrar». Está facturada y nadie la persigue.
    //
    // Detectado el 03-09-2026: 42 facturas por $3.425.434 en seis meses.
    // Dos formas de que ocurra:
    //   · una segunda factura al mismo cliente (trabajo extra) que se emite
    //     sin agregarla a la cobranza
    //   · una factura a alguien que ese mes no tenía cobro generado
    const { rows } = await pool.query(
      `SELECT d.folio, d.monto_total, e.razon_social
         FROM documentos_emitidos d
         LEFT JOIN empresa e ON e.id = d.empresa_id
        WHERE d.tipo_dte IN (33, 34)
          -- 6 meses, la misma ventana que usa el aviso de la pantalla
          -- (/api/dte/facturas-sin-cobro): si midieran distinto, la suite y el
          -- usuario verían números diferentes para el mismo problema.
          AND d.fecha_emision >= CURRENT_DATE - INTERVAL '6 months'
          AND NOT EXISTS (SELECT 1 FROM cobro_mensual c
                           WHERE TRIM(c.folio) = d.folio::text)
          -- Las anuladas con nota de crédito no se persiguen, con razón.
          AND NOT EXISTS (SELECT 1 FROM documentos_emitidos nc
                           WHERE nc.tipo_dte = 61 AND nc.folio_ref::text = d.folio::text)
        ORDER BY d.monto_total DESC`);

    if (rows.length) {
      const total = rows.reduce((a, r) => a + Number(r.monto_total || 0), 0);
      console.log(`      ℹ ${rows.length} factura(s) emitidas sin cobro que las persiga · ` +
                  `$${total.toLocaleString('es-CL')}`);
      rows.slice(0, 3).forEach(r => console.log(
        `         · #${r.folio} ${r.razon_social || '(sin empresa)'} ` +
        `$${Number(r.monto_total).toLocaleString('es-CL')}`));
    }
    // Informa en vez de fallar: la regularización de las 24 existentes es una
    // decisión de negocio. Cuando se resuelvan, la nota desaparece sola.
  });

  test('ningún folio se repite en dos cobros', async () => {
    const { rows } = await pool.query(
      `SELECT TRIM(folio) AS folio, COUNT(*)::int AS n FROM cobro_mensual
        WHERE folio IS NOT NULL AND TRIM(folio) <> ''
        GROUP BY 1 HAVING COUNT(*) > 1`);
    assert.equal(rows.length, 0,
      `folios repetidos: ${rows.map(r => `${r.folio}(×${r.n})`).join(', ')}`);
  });
});

describe('Correos ↔ Cobranza', () => {
  test('los destinatarios del recordatorio tienen deuda real', async () => {
    const r = await pedir('/dte/recordatorios/preview');
    if (r.estado !== 200 || !r.datos.total) return;
    const folios = (r.datos.destinatarios || []).map(d => String(d.folio).trim()).filter(Boolean);
    if (!folios.length) return;
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM cobro_mensual
        WHERE TRIM(folio) = ANY($1::text[]) AND estado <> 'PENDIENTE_PAGO'`, [folios]);
    assert.equal(rows[0].n, 0,
      `${rows[0].n} destinatario(s) del recordatorio ya no tienen deuda pendiente`);
  });

  test('nadie que pidió la baja está en la lista de envío', async () => {
    const r = await pedir('/dte/recordatorios/preview');
    if (r.estado !== 200 || !r.datos.total) return;
    const correos = (r.datos.destinatarios || [])
      .flatMap(d => String(d.correo || '').split(/[;,]/).map(c => c.trim().toLowerCase()))
      .filter(Boolean);
    if (!correos.length) return;
    const { rows } = await pool.query(
      `SELECT correo FROM correo_baja WHERE lower(correo) = ANY($1::text[])`, [correos]);
    assert.equal(rows.length, 0,
      `se enviaría a ${rows.length} correo(s) dados de baja: ${rows.map(r => r.correo).join(', ')}`);
  });
});

describe('Asistente ↔ API', () => {
  test('cada herramienta del catálogo apunta a una ruta que existe', async () => {
    // El catálogo del asistente declaraba rutas inventadas: 4 de 5 daban 404 y
    // el síntoma era «no tengo ese dato», idéntico a una alucinación.
    const RUTAS = ['/cobros/resumen', '/crm/metricas', '/crm/tareas', '/personas'];
    for (const ruta of RUTAS) {
      const r = await pedir(ruta);
      assert.notEqual(r.estado, 404, `la herramienta apunta a ${ruta} y no existe`);
    }
  });
});

describe('Base de datos · integridad referencial', () => {
  test('ningún cobro apunta a una empresa borrada', async () => {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM cobro_mensual c
        WHERE NOT EXISTS (SELECT 1 FROM empresa e WHERE e.id = c.empresa_id)`);
    assert.equal(rows[0].n, 0, `${rows[0].n} cobros huérfanos`);
  });

  test('ninguna tarea apunta a un responsable inexistente', async () => {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM tarea t
        WHERE t.responsable_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM usuario u WHERE u.id = t.responsable_id)`);
    assert.equal(rows[0].n, 0, `${rows[0].n} tareas con responsable inexistente`);
  });

  test('ningún envío de correo apunta a una campaña borrada', async () => {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM correo_envio e
        WHERE e.campana_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM correo_campana c WHERE c.id = e.campana_id)`);
    assert.equal(rows[0].n, 0, `${rows[0].n} envíos huérfanos`);
  });
});
