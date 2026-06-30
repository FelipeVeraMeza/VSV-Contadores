import { pool } from '../database/db.js';

const normEmp = (empresaId) =>
  (!empresaId || empresaId === 'ALL' || empresaId === 'undefined' || empresaId === 'null') ? null : empresaId;

// Registrar recaudación (cobro a cliente) o pago (a proveedor)
export const crearMovimientoCaja = async (req, res) => {
  const { empresaId, tipo, fecha, rut, nombre, folio_asociado, monto, medio_pago, glosa } = req.body;
  const usuario = req.user || {};
  const empId = normEmp(empresaId);

  if (!tipo || !(Number(monto) > 0)) {
    return res.status(400).json({ ok: false, error: 'tipo y monto (> 0) son requeridos' });
  }

  try {
    const { rows: [m] } = await pool.query(
      `INSERT INTO movimientos_caja
         (id, empresa_id, tipo, fecha, rut, nombre, folio_asociado, monto, medio_pago, glosa, creado_por)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [empId, tipo, fecha ? new Date(fecha) : new Date(), rut || '', nombre || '', folio_asociado || '',
       Number(monto) || 0, medio_pago || 'efectivo', glosa || '', usuario.nombre || null]
    );
    return res.json({ ok: true, movimiento: m });
  } catch (error) {
    console.error('❌ Error registrando caja:', error.message);
    return res.status(500).json({ ok: false, error: 'Error al registrar el movimiento.' });
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
      const { rows: [m] } = await client.query(
        `INSERT INTO movimientos_caja
           (id, empresa_id, tipo, fecha, rut, nombre, folio_asociado, monto, medio_pago, glosa, creado_por)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [empId, tipo, mv.fecha ? new Date(mv.fecha) : new Date(), mv.rut || '', mv.nombre || '',
         mv.folio_asociado || '', Number(mv.monto) || 0, mv.medio_pago || 'efectivo', mv.glosa || '', usuario.nombre || null]
      );
      creados.push(m);
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

export const eliminarMovimientoCaja = async (req, res) => {
  const { id } = req.params;
  try {
    const { rowCount } = await pool.query(`DELETE FROM movimientos_caja WHERE id = $1`, [id]);
    if (!rowCount) return res.status(404).json({ ok: false, error: 'Movimiento no encontrado.' });
    return res.json({ ok: true });
  } catch (error) {
    console.error('❌ Error eliminando caja:', error.message);
    return res.status(500).json({ ok: false, error: 'Error al eliminar.' });
  }
};
