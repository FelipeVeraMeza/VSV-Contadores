import { pool } from '../database/db.js';
import { siguienteNumeroComprobante } from '../utils/comprobantes.js';

const normEmp = (empresaId) =>
  (!empresaId || empresaId === 'ALL' || empresaId === 'undefined' || empresaId === 'null') ? null : empresaId;

// ── Cuentas para la centralización de cobranzas y pagos ──────────────────────
const CTA_CAJA        = '1101-01'; // CUENTA CAJA
const CTA_BANCO       = '1101-02'; // BANCO
const CTA_CLIENTES    = '1104-01'; // DEUDORES CLIENTES (por cobrar)
const CTA_PROVEEDORES = '2116-01'; // FACTURAS POR PAGAR (proveedores)

// El medio de pago decide la cuenta de dinero: efectivo → Caja, resto → Banco
const cuentaDinero = (medio) => (medio === 'efectivo' ? CTA_CAJA : CTA_BANCO);

// Genera el asiento contable de un movimiento de caja y devuelve el id del comprobante.
//   Recaudación (cobro): Debe Banco/Caja · Haber Deudores Clientes
//   Pago:                Debe Facturas por pagar · Haber Banco/Caja
async function crearAsientoCaja(client, { empId, tipo, fecha, folio, rut, nombre, monto, medio, usuario }) {
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

// Borra el asiento vinculado a un movimiento (detalle + comprobante).
async function borrarAsientoCaja(client, comprobanteId) {
  if (!comprobanteId) return;
  await client.query(`DELETE FROM comprobantes_detalle WHERE comprobante_id = $1`, [comprobanteId]);
  await client.query(`DELETE FROM comprobantes WHERE id = $1`, [comprobanteId]);
}

// Registrar recaudación (cobro a cliente) o pago (a proveedor)
export const crearMovimientoCaja = async (req, res) => {
  const { empresaId, tipo, fecha, rut, nombre, folio_asociado, monto, medio_pago, glosa } = req.body;
  const usuario = req.user || {};
  const empId = normEmp(empresaId);

  if (!tipo || !(Number(monto) > 0)) {
    return res.status(400).json({ ok: false, error: 'tipo y monto (> 0) son requeridos' });
  }

  const medio = medio_pago || 'transferencia';
  const fechaFinal = fecha ? new Date(fecha) : new Date();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [m] } = await client.query(
      `INSERT INTO movimientos_caja
         (id, empresa_id, tipo, fecha, rut, nombre, folio_asociado, monto, medio_pago, glosa, creado_por)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [empId, tipo, fechaFinal, rut || '', nombre || '', folio_asociado || '',
       Number(monto) || 0, medio, glosa || '', usuario.nombre || null]
    );

    const compId = await crearAsientoCaja(client, {
      empId, tipo, fecha: fechaFinal, folio: folio_asociado, rut, nombre, monto: Number(monto), medio, usuario,
    });
    await client.query(`UPDATE movimientos_caja SET comprobante_id = $1 WHERE id = $2`, [compId, m.id]);

    await client.query('COMMIT');
    return res.json({ ok: true, movimiento: { ...m, comprobante_id: compId } });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error registrando caja:', error.message);
    return res.status(500).json({ ok: false, error: 'Error al registrar el movimiento.' });
  } finally {
    client.release();
  }
};

// Registrar varios movimientos de una sola vez ("hacer efectivo" en lote)
export const crearMovimientosCajaLote = async (req, res) => {
  const { empresaId, tipo, movimientos } = req.body;
  const usuario = req.user || {};
  const empId = normEmp(empresaId);

  if (!tipo || !Array.isArray(movimientos) || movimientos.length === 0) {
    return res.status(400).json({ ok: false, error: 'tipo y movimientos[] (no vacío) son requeridos' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const creados = [];
    for (const mv of movimientos) {
      if (!(Number(mv.monto) > 0)) continue;
      const medio = mv.medio_pago || 'transferencia';
      const fechaFinal = mv.fecha ? new Date(mv.fecha) : new Date();
      const { rows: [m] } = await client.query(
        `INSERT INTO movimientos_caja
           (id, empresa_id, tipo, fecha, rut, nombre, folio_asociado, monto, medio_pago, glosa, creado_por)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [empId, tipo, fechaFinal, mv.rut || '', mv.nombre || '',
         mv.folio_asociado || '', Number(mv.monto) || 0, medio, mv.glosa || '', usuario.nombre || null]
      );

      const compId = await crearAsientoCaja(client, {
        empId, tipo, fecha: fechaFinal, folio: mv.folio_asociado, rut: mv.rut, nombre: mv.nombre,
        monto: Number(mv.monto), medio, usuario,
      });
      await client.query(`UPDATE movimientos_caja SET comprobante_id = $1 WHERE id = $2`, [compId, m.id]);

      creados.push({ ...m, comprobante_id: compId });
    }
    await client.query('COMMIT');
    return res.json({ ok: true, creados });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error registrando caja (lote):', error.message);
    return res.status(500).json({ ok: false, error: 'Error al registrar los movimientos.' });
  } finally {
    client.release();
  }
};

// Listar recaudaciones o pagos (por empresa, tipo y rango de fechas)
export const listarMovimientosCaja = async (req, res) => {
  const { empresaId, tipo, desde, hasta } = req.query;
  const empId = normEmp(empresaId);
  const cond = [];
  const params = [];
  cond.push(empId === null ? 'empresa_id IS NULL' : `empresa_id = $${params.push(empId)}`);
  if (tipo) cond.push(`tipo = $${params.push(tipo)}`);
  if (desde && hasta) cond.push(`fecha::date BETWEEN $${params.push(desde)} AND $${params.push(hasta)}`);

  try {
    const { rows } = await pool.query(
      `SELECT * FROM movimientos_caja WHERE ${cond.join(' AND ')} ORDER BY fecha DESC, created_at DESC`,
      params
    );
    return res.json({ ok: true, movimientos: rows });
  } catch (error) {
    console.error('❌ Error listando caja:', error.message);
    return res.status(500).json({ ok: false, error: 'Error al listar los movimientos.' });
  }
};

// Editar un movimiento existente (medio de pago, y opcionalmente monto/fecha/glosa).
// Regenera el asiento contable para que el Balance General siga cuadrando.
export const editarMovimientoCaja = async (req, res) => {
  const { id } = req.params;
  const { medio_pago, monto, fecha, glosa } = req.body;
  const usuario = req.user || {};

  const campos = [];
  const params = [];
  if (medio_pago !== undefined) campos.push(`medio_pago = $${params.push(medio_pago)}`);
  if (monto !== undefined && Number(monto) >= 0) campos.push(`monto = $${params.push(Number(monto))}`);
  if (fecha !== undefined && fecha) campos.push(`fecha = $${params.push(new Date(fecha))}`);
  if (glosa !== undefined) campos.push(`glosa = $${params.push(glosa)}`);

  if (campos.length === 0) {
    return res.status(400).json({ ok: false, error: 'No hay campos para actualizar.' });
  }

  // Cambios que afectan el asiento (medio de pago, monto o fecha)
  const regeneraAsiento = medio_pago !== undefined || monto !== undefined || fecha !== undefined;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [m] } = await client.query(
      `UPDATE movimientos_caja SET ${campos.join(', ')} WHERE id = $${params.push(id)} RETURNING *`,
      params
    );
    if (!m) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Movimiento no encontrado.' });
    }

    if (regeneraAsiento) {
      await borrarAsientoCaja(client, m.comprobante_id);
      const compId = await crearAsientoCaja(client, {
        empId: m.empresa_id, tipo: m.tipo, fecha: m.fecha, folio: m.folio_asociado,
        rut: m.rut, nombre: m.nombre, monto: Number(m.monto), medio: m.medio_pago, usuario,
      });
      await client.query(`UPDATE movimientos_caja SET comprobante_id = $1 WHERE id = $2`, [compId, m.id]);
      m.comprobante_id = compId;
    }

    await client.query('COMMIT');
    return res.json({ ok: true, movimiento: m });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error editando caja:', error.message);
    return res.status(500).json({ ok: false, error: 'Error al actualizar el movimiento.' });
  } finally {
    client.release();
  }
};

// Eliminar un movimiento y su asiento contable (deshacer pago/cobro)
export const eliminarMovimientoCaja = async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [m] } = await client.query(`SELECT comprobante_id FROM movimientos_caja WHERE id = $1`, [id]);
    if (!m) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Movimiento no encontrado.' });
    }
    await borrarAsientoCaja(client, m.comprobante_id);
    await client.query(`DELETE FROM movimientos_caja WHERE id = $1`, [id]);
    await client.query('COMMIT');
    return res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error eliminando caja:', error.message);
    return res.status(500).json({ ok: false, error: 'Error al eliminar.' });
  } finally {
    client.release();
  }
};
