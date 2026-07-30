// ============================================================================
// Movimientos de caja (recaudaciones y pagos) + su asiento.
// ----------------------------------------------------------------------------
// Vive acá y no dentro de caja.controllers.js porque hay dos entradas al mismo
// flujo: el módulo de Recaudaciones/Pagos ("hacer efectivo", suelto o en lote) y
// el interruptor "pago recibido" al contabilizar un documento. Las dos deben
// producir exactamente el mismo movimiento y el mismo asiento.
//
// Todas las funciones reciben un `client` con una transacción YA abierta por
// quien llama: así el asiento del documento y el de la recaudación se confirman
// o se deshacen juntos, nunca a medias.
// ============================================================================
import { siguienteNumeroComprobante } from './comprobantes.js';

// ── Cuentas para la centralización de cobranzas y pagos ──────────────────────
export const CTA_CAJA        = '1101-01'; // CUENTA CAJA
export const CTA_BANCO       = '1101-02'; // BANCO
export const CTA_CLIENTES    = '1104-01'; // DEUDORES CLIENTES (por cobrar)
export const CTA_PROVEEDORES = '2116-01'; // FACTURAS POR PAGAR (proveedores)

// El medio de pago decide la cuenta de dinero: efectivo → Caja, resto → Banco
export const cuentaDinero = (medio) => (medio === 'efectivo' ? CTA_CAJA : CTA_BANCO);

/**
 * Asiento contable de un movimiento de caja. Devuelve el id del comprobante.
 *   Recaudación (cobro): Debe Banco/Caja · Haber Deudores Clientes
 *   Pago:                Debe Facturas por pagar · Haber Banco/Caja
 */
export async function crearAsientoCaja(client, { empId, tipo, fecha, folio, rut, nombre, monto, medio, usuario }) {
  const esRecaudacion = tipo === 'recaudacion';
  const ctaDinero = cuentaDinero(medio);
  const ctaContraparte = esRecaudacion ? CTA_CLIENTES : CTA_PROVEEDORES;

  // Líneas del asiento (siempre cuadrado: debe = haber = monto)
  const lineas = esRecaudacion
    ? [ { cuenta: ctaDinero,      debe: monto, haber: 0     },
        { cuenta: ctaContraparte, debe: 0,     haber: monto } ]
    : [ { cuenta: ctaContraparte, debe: monto, haber: 0     },
        { cuenta: ctaDinero,      debe: 0,     haber: monto } ];

  // Un movimiento de caja no es un documento tributario: se deja `folio` en NULL
  // para que no entre en la deduplicación por documento (el índice único es
  // parcial, sobre folio NOT NULL). El folio del documento cobrado o pagado va
  // en la glosa como referencia legible.
  const glosa = `${esRecaudacion ? 'Cobro' : 'Pago'} folio #${folio || 's/f'}${nombre ? ` — ${nombre}` : ''}`;
  const tipoDb = esRecaudacion ? 'INGRESO' : 'EGRESO';

  const numero = await siguienteNumeroComprobante(client, empId);

  const { rows: [comp] } = await client.query(
    `INSERT INTO comprobantes (id, empresa_id, numero_comprobante, fecha, tipo, glosa, estado,
            clase, contabilizado_por, contabilizado_por_id, contabilizado_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'Contabilizado', 'caja', $6, $7, NOW()) RETURNING id`,
    [empId, numero, fecha, tipoDb, glosa, usuario?.nombre || null, usuario?.usuarioId || null]
  );

  for (const l of lineas) {
    await client.query(
      `INSERT INTO comprobantes_detalle (id, comprobante_id, cuenta_codigo, rut_asociado, debe, haber)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
      [comp.id, l.cuenta, rut || null, l.debe, l.haber]
    );
  }
  return comp.id;
}

/** Borra el asiento vinculado a un movimiento (detalle + comprobante). */
export async function borrarAsientoCaja(client, comprobanteId) {
  if (!comprobanteId) return;
  await client.query(`DELETE FROM comprobantes_detalle WHERE comprobante_id = $1`, [comprobanteId]);
  await client.query(`DELETE FROM comprobantes WHERE id = $1`, [comprobanteId]);
}

/**
 * Registra un movimiento de caja con su asiento, dentro de la transacción de
 * quien llama. Devuelve { movimiento, comprobanteId }.
 */
export async function registrarMovimientoCaja(client, {
  empId, tipo, fecha, rut, nombre, folioAsociado, monto, medio, glosa, usuario = {},
}) {
  const medioFinal = medio || 'transferencia';
  const fechaFinal = fecha ? new Date(fecha) : new Date();

  const { rows: [m] } = await client.query(
    `INSERT INTO movimientos_caja
       (id, empresa_id, tipo, fecha, rut, nombre, folio_asociado, monto, medio_pago, glosa, creado_por, organizacion_id)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [empId, tipo, fechaFinal, rut || '', nombre || '', folioAsociado || '',
     Number(monto) || 0, medioFinal, glosa || '', usuario.nombre || null, usuario.organizacionId || null]
  );

  const comprobanteId = await crearAsientoCaja(client, {
    empId, tipo, fecha: fechaFinal, folio: folioAsociado, rut, nombre,
    monto: Number(monto), medio: medioFinal, usuario,
  });

  await client.query(`UPDATE movimientos_caja SET comprobante_id = $1 WHERE id = $2`, [comprobanteId, m.id]);

  return { movimiento: { ...m, comprobante_id: comprobanteId }, comprobanteId };
}
