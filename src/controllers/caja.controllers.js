import { pool } from '../database/db.js';
// La lógica de movimientos + asiento vive en utils/caja.js porque también la usa
// el interruptor "pago recibido" al contabilizar un documento, y ambas entradas
// deben generar exactamente el mismo movimiento y el mismo asiento.
import { crearAsientoCaja, borrarAsientoCaja } from '../utils/caja.js';
import { empresaPermitida, empresasVisibles, veSoloAsignadas } from '../utils/scope.js';

const normEmp = (empresaId) =>
  (!empresaId || empresaId === 'ALL' || empresaId === 'undefined' || empresaId === 'null') ? null : empresaId;

// Portero, igual que en Contabilidad: null si puede seguir, o el motivo.
const puedeVerEmpresa = async (req, empId) => {
  if (!empId) return null;                       // vista global: se acota aparte
  return (await empresaPermitida(req, empId)) ? null : 'No tienes acceso a la caja de esa empresa.';
};
const sinAcceso = (res, motivo) => res.status(403).json({ ok: false, error: motivo });

// Editar y eliminar reciben solo el id del movimiento. Antes se hacía el UPDATE
// o el DELETE directo contra ese id, sin mirar de quién era: con el id a mano se
// podía tocar la caja de otra organización. Ahora se lee primero el dueño.
const movimientoFueraDeAlcance = async (req, id) => {
  let m;
  try { ({ rows: [m] } = await pool.query(
    'SELECT empresa_id, organizacion_id FROM movimientos_caja WHERE id = $1', [id])); }
  catch { return null; }                         // id inválido: lo resuelve el 404
  if (!m) return null;
  if ((m.organizacion_id || null) !== (req.user?.organizacionId || null)) {
    return 'Ese movimiento no es de tu organización.';
  }
  if (m.empresa_id) return await puedeVerEmpresa(req, m.empresa_id);
  // Movimiento sin empresa: es de la caja global de la firma.
  return veSoloAsignadas(req) ? 'Ese movimiento no es de tus empresas.' : null;
};

// Registrar recaudación (cobro a cliente) o pago (a proveedor)
export const crearMovimientoCaja = async (req, res) => {
  const { empresaId, tipo, fecha, rut, nombre, folio_asociado, monto, medio_pago, glosa } = req.body;
  const usuario = req.user || {};
  const empId = normEmp(empresaId);

  if (!tipo || !(Number(monto) > 0)) {
    return res.status(400).json({ ok: false, error: 'tipo y monto (> 0) son requeridos' });
  }
  const motivo = await puedeVerEmpresa(req, empId);
  if (motivo) return sinAcceso(res, motivo);
  if (!empId && veSoloAsignadas(req)) {
    return sinAcceso(res, 'Selecciona una de tus empresas antes de registrar el movimiento.');
  }

  const medio = medio_pago || 'transferencia';
  const fechaFinal = fecha ? new Date(fecha) : new Date();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [m] } = await client.query(
      `INSERT INTO movimientos_caja
         (id, empresa_id, tipo, fecha, rut, nombre, folio_asociado, monto, medio_pago, glosa, creado_por, organizacion_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [empId, tipo, fechaFinal, rut || '', nombre || '', folio_asociado || '',
       Number(monto) || 0, medio, glosa || '', usuario.nombre || null, usuario.organizacionId || null]
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
  const motivo = await puedeVerEmpresa(req, empId);
  if (motivo) return sinAcceso(res, motivo);
  if (!empId && veSoloAsignadas(req)) {
    return sinAcceso(res, 'Selecciona una de tus empresas antes de registrar los movimientos.');
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
           (id, empresa_id, tipo, fecha, rut, nombre, folio_asociado, monto, medio_pago, glosa, creado_por, organizacion_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [empId, tipo, fechaFinal, mv.rut || '', mv.nombre || '',
         mv.folio_asociado || '', Number(mv.monto) || 0, medio, mv.glosa || '', usuario.nombre || null,
         usuario.organizacionId || null]
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
  const motivo = await puedeVerEmpresa(req, empId);
  if (motivo) return sinAcceso(res, motivo);
  const cond = [];
  const params = [];
  // Aislamiento por tenant. Sin esto, `empresa_id IS NULL` ("movimientos de la
  // propia firma") no distinguía de qué organización eran y una organización
  // nueva veía los de la firma anterior.
  cond.push(`organizacion_id IS NOT DISTINCT FROM $${params.push(req.user?.organizacionId || null)}::uuid`);
  if (empId !== null) {
    cond.push(`empresa_id = $${params.push(empId)}`);
  } else {
    // Sin empresa elegida, la vista global es la caja de la firma
    // (`empresa_id IS NULL`). Para quien solo ve lo asignado esa caja no es
    // suya: se le muestra la de SUS empresas, y si no tiene ninguna, nada.
    const visibles = await empresasVisibles(req);
    if (visibles) {
      if (!visibles.length) return res.json({ ok: true, movimientos: [] });
      cond.push(`empresa_id = ANY($${params.push(visibles)}::uuid[])`);
    } else {
      cond.push('empresa_id IS NULL');
    }
  }
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
  const motivo = await movimientoFueraDeAlcance(req, id);
  if (motivo) return sinAcceso(res, motivo);

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
  const motivo = await movimientoFueraDeAlcance(req, id);
  if (motivo) return sinAcceso(res, motivo);
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
