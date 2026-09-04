// ============================================================================
// VALIDAR EL SQL EMBEBIDO
// ----------------------------------------------------------------------------
// `node --check` no ve los errores DENTRO de una plantilla de SQL: para él es
// una cadena de texto. La única forma de saber si una consulta es válida sin
// ejecutarla es prepararla contra Postgres.
//
// Se usa después de tocar cualquier consulta del backend.
//   node qa/validar-sql.mjs
// ============================================================================
import 'dotenv/config';
import { pool } from '../src/database/db.js';

// Consultas que se modificaron y hay que verificar. Se copian TAL CUAL del
// controlador: si se reescriben aquí, se valida otra cosa.
const CONSULTAS = [
  ['editarMontoCobro', `
    UPDATE cobro_mensual c
       SET monto_esperado = $2, updated_at = NOW()
      FROM (SELECT id, monto_esperado AS antes FROM cobro_mensual WHERE id = $1) v
     WHERE c.id = v.id AND ($3::uuid IS NULL OR c.organizacion_id = $3)
    RETURNING c.id, c.empresa_id, c.periodo, v.antes`],

  ['emitirCobro', `
    UPDATE cobro_mensual
       SET folio = COALESCE($2, folio),
           monto_facturado = COALESCE($3, monto_facturado),
           tipo_dte = COALESCE($4, tipo_dte),
           estado = 'PENDIENTE_PAGO',
           fecha_emision = NOW(),
           updated_at = NOW()
     WHERE id = $1
       AND ($5::uuid IS NULL OR organizacion_id = $5)
    RETURNING id, empresa_id, periodo, monto_esperado, monto_facturado`],

  ['razon social de empresa', `SELECT razon_social FROM empresa WHERE id = $1`],

  ['facturasSinCobro', `
    SELECT d.folio, d.fecha_emision::date AS "fechaEmision", d.monto_total AS "montoTotal",
           d.tipo_dte AS "tipoDte",
           COALESCE(e.razon_social, d.razon_social_cliente, '(sin vincular)') AS "razonSocial",
           e.id AS "empresaId", (e.activo AND e.en_cartera IS NOT FALSE) AS "empresaActiva",
           e.email_corporativo AS "correo",
           (date_trunc('month', d.fecha_emision) + INTERVAL '1 month'
                                                 + INTERVAL '4 days')::date AS "vence",
           EXISTS (SELECT 1 FROM cobro_mensual c
                    WHERE c.empresa_id = d.empresa_id
                      AND c.periodo = date_trunc('month', d.fecha_emision)::date) AS "esExtra"
      FROM documentos_emitidos d
      LEFT JOIN empresa e ON e.id = d.empresa_id
     WHERE d.tipo_dte IN (33, 34)
       AND d.fecha_emision >= CURRENT_DATE - ($1 || ' months')::interval
       AND NOT EXISTS (SELECT 1 FROM cobro_mensual c WHERE TRIM(c.folio) = d.folio::text)
       AND NOT EXISTS (SELECT 1 FROM documentos_emitidos nc
                        WHERE nc.tipo_dte = 61 AND nc.folio_ref::text = d.folio::text)
     ORDER BY d.fecha_emision DESC`],

  ['cobro al emitir', `
    INSERT INTO cobro_mensual
       (organizacion_id, empresa_id, periodo, monto_esperado, monto_facturado,
        folio, tipo_dte, estado, fecha_emision, fecha_vencimiento)
    VALUES ($1, $2, $3, $4, $4, $5, $6, 'PENDIENTE_PAGO', $7, $8)
    ON CONFLICT (empresa_id, periodo, TRIM(folio))
         WHERE folio IS NOT NULL AND TRIM(folio) <> ''
    DO NOTHING
    RETURNING id`],
];

const cliente = await pool.connect();
let fallos = 0;

for (const [nombre, sql] of CONSULTAS) {
  const etiqueta = `qa_${nombre.replace(/\W/g, '_')}`;
  try {
    // PREPARE valida sintaxis, tablas, columnas y tipos SIN ejecutar nada.
    await cliente.query(`PREPARE ${etiqueta} AS ${sql}`);
    await cliente.query(`DEALLOCATE ${etiqueta}`);
    console.log(`  ✓ ${nombre}`);
  } catch (e) {
    fallos++;
    console.log(`  ✗ ${nombre}`);
    console.log(`      ${e.message.split('\n')[0]}`);
  }
}

cliente.release();
await pool.end();
console.log('');
process.exit(fallos ? 1 : 0);
