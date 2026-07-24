// ============================================================================
// MÓDULO DE REMUNERACIONES — Liquidaciones (Fase 2)
//
// Novedades del mes + cálculo, guardado y consulta de liquidaciones.
// El cálculo vive en src/services/liquidacion.service.js (función pura); aquí
// solo se arman los insumos desde la BD y se persiste el resultado.
//
// Multi-tenant: todo verifica organizacion_id del usuario. Fase 2 = solo admin.
// ============================================================================
import { pool } from '../database/db.js';
import { calcularLiquidacion } from '../services/liquidacion.service.js';
import { decrypt } from '../utils/crypto.js';
import { formatRut } from '../lib/rut.js';

// Normaliza 'YYYY-MM' o 'YYYY-MM-DD' → primer día del mes 'YYYY-MM-01'.
const primerDia = (periodo) => {
  const m = String(periodo || '').match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-01` : null;
};

// Carga el trabajador y verifica que sea de la organización del usuario.
const cargarTrabajador = async (req, trabajadorId, client = pool) => {
  const { rows } = await client.query('SELECT * FROM rem_trabajador WHERE id = $1', [trabajadorId]);
  const t = rows[0];
  if (!t || (t.organizacion_id || null) !== (req.user?.organizacionId || null)) return null;
  return t;
};

// Arma todos los insumos que necesita el motor para un trabajador y período.
const armarInsumos = async (trabajador, periodoDate) => {
  const [param, afp, salud, movs, config] = await Promise.all([
    pool.query('SELECT * FROM rem_parametro_previsional WHERE periodo <= $1 ORDER BY periodo DESC LIMIT 1', [periodoDate]),
    trabajador.afp_id ? pool.query('SELECT tasa_comision FROM rem_afp WHERE id = $1', [trabajador.afp_id]) : { rows: [] },
    trabajador.salud_id ? pool.query('SELECT tipo FROM rem_salud WHERE id = $1', [trabajador.salud_id]) : { rows: [] },
    pool.query(
      `SELECT m.codigo, m.cantidad, m.monto, m.glosa,
              c.naturaleza, c.imponible, c.tributable, c.afecta_gratificacion, c.descripcion AS cdesc
       FROM rem_movimiento_periodo m
       LEFT JOIN rem_concepto c ON c.id = m.concepto_id
       WHERE m.trabajador_id = $1 AND m.periodo = $2`,
      [trabajador.id, periodoDate]
    ),
    pool.query('SELECT * FROM rem_config_empresa WHERE empresa_id = $1', [trabajador.empresa_id]),
  ]);

  const parametro = param.rows[0] || null;
  const periodoParam = parametro?.periodo || periodoDate;
  const [imp, af] = await Promise.all([
    pool.query('SELECT * FROM rem_impuesto_tramo WHERE periodo <= $1 ORDER BY periodo DESC, tramo ASC', [periodoParam]),
    pool.query('SELECT * FROM rem_asignacion_familiar_tramo WHERE periodo <= $1 ORDER BY periodo DESC', [periodoParam]),
  ]);
  // Nos quedamos solo con el período más reciente disponible de cada tabla.
  const ultimoPeriodo = (rows) => {
    if (!rows.length) return [];
    const top = rows[0].periodo?.toISOString?.() || String(rows[0].periodo);
    return rows.filter(r => (r.periodo?.toISOString?.() || String(r.periodo)) === top);
  };

  const movimientos = movs.rows.map(m => ({
    codigo: m.codigo,
    descripcion: m.cdesc || m.glosa || 'Movimiento',
    naturaleza: m.naturaleza || 'HABER',
    imponible: !!m.imponible,
    tributable: !!m.tributable,
    afectaGratificacion: !!m.afecta_gratificacion,
    cantidad: m.cantidad,
    monto: m.monto,
  }));

  return {
    parametro,
    afp: afp.rows[0] || null,
    saludEsIsapre: salud.rows[0]?.tipo === 'ISAPRE',
    movimientos,
    impuestoTramos: ultimoPeriodo(imp.rows),
    afTramos: ultimoPeriodo(af.rows),
    config: config.rows[0] || null,
  };
};

const nombreTrab = (t) =>
  [t.nombres, t.apellido_paterno, t.apellido_materno].filter(Boolean).join(' ').trim();

// ============================================================================
// NOVEDADES DEL PERÍODO
// ============================================================================
export const listMovimientos = async (req, res) => {
  try {
    const { trabajadorId, periodo } = req.query;
    const periodoDate = primerDia(periodo);
    if (!periodoDate) return res.status(400).json({ message: 'Período inválido (use YYYY-MM)' });
    const t = await cargarTrabajador(req, trabajadorId);
    if (!t) return res.status(404).json({ message: 'Trabajador no encontrado' });

    const { rows } = await pool.query(
      `SELECT m.id, m.codigo, m.cantidad, m.monto, m.glosa, m.concepto_id,
              c.descripcion, c.naturaleza
       FROM rem_movimiento_periodo m
       LEFT JOIN rem_concepto c ON c.id = m.concepto_id
       WHERE m.trabajador_id = $1 AND m.periodo = $2
       ORDER BY m.created_at`,
      [trabajadorId, periodoDate]
    );
    return res.status(200).json(rows);
  } catch (e) {
    console.error('❌ listMovimientos:', e.message);
    return res.status(500).json({ message: 'Error al listar novedades' });
  }
};

export const createMovimiento = async (req, res) => {
  try {
    const b = req.body || {};
    const periodoDate = primerDia(b.periodo);
    if (!periodoDate) return res.status(400).json({ message: 'Período inválido (use YYYY-MM)' });
    const t = await cargarTrabajador(req, b.trabajadorId);
    if (!t) return res.status(404).json({ message: 'Trabajador no encontrado' });

    let codigo = b.codigo || null;
    if (b.conceptoId && !codigo) {
      const c = await pool.query('SELECT codigo FROM rem_concepto WHERE id = $1', [b.conceptoId]);
      codigo = c.rows[0]?.codigo || null;
    }

    const { rows } = await pool.query(
      `INSERT INTO rem_movimiento_periodo
         (organizacion_id, empresa_id, trabajador_id, periodo, concepto_id, codigo, cantidad, monto, glosa, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [t.organizacion_id, t.empresa_id, t.id, periodoDate, b.conceptoId || null, codigo,
       b.cantidad ?? null, b.monto ?? null, b.glosa || null, req.user?.usuarioId || null]
    );
    return res.status(201).json({ success: true, movimiento: rows[0] });
  } catch (e) {
    console.error('❌ createMovimiento:', e.message);
    return res.status(500).json({ message: 'Error al registrar la novedad' });
  }
};

export const deleteMovimiento = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT m.id FROM rem_movimiento_periodo m
       JOIN rem_trabajador t ON t.id = m.trabajador_id
       WHERE m.id = $1 AND t.organizacion_id IS NOT DISTINCT FROM $2`,
      [id, req.user?.organizacionId || null]
    );
    if (!rows.length) return res.status(404).json({ message: 'Novedad no encontrada' });
    await pool.query('DELETE FROM rem_movimiento_periodo WHERE id = $1', [id]);
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('❌ deleteMovimiento:', e.message);
    return res.status(500).json({ message: 'Error al eliminar la novedad' });
  }
};

// ============================================================================
// CÁLCULO
// ============================================================================
// Preview: calcula sin persistir.
export const previewLiquidacion = async (req, res) => {
  try {
    const b = req.body || {};
    const periodoDate = primerDia(b.periodo);
    if (!periodoDate) return res.status(400).json({ message: 'Período inválido (use YYYY-MM)' });
    const t = await cargarTrabajador(req, b.trabajadorId);
    if (!t) return res.status(404).json({ message: 'Trabajador no encontrado' });

    const insumos = await armarInsumos(t, periodoDate);
    if (!insumos.parametro) {
      return res.status(400).json({ message: 'No hay indicadores previsionales para ese período. Cárgalos primero.' });
    }
    const resultado = calcularLiquidacion({
      trabajador: t, ...insumos, diasTrabajados: b.diasTrabajados ?? 30,
    });
    return res.status(200).json({
      trabajador: { id: t.id, nombre: nombreTrab(t) },
      periodo: periodoDate,
      ...resultado,
    });
  } catch (e) {
    console.error('❌ previewLiquidacion:', e.message);
    return res.status(500).json({ message: 'Error al calcular la liquidación' });
  }
};

// Guardar: calcula y persiste cabecera + detalle (upsert por trabajador+período).
export const guardarLiquidacion = async (req, res) => {
  const client = await pool.connect();
  try {
    const b = req.body || {};
    const periodoDate = primerDia(b.periodo);
    if (!periodoDate) return res.status(400).json({ message: 'Período inválido (use YYYY-MM)' });
    const t = await cargarTrabajador(req, b.trabajadorId, client);
    if (!t) return res.status(404).json({ message: 'Trabajador no encontrado' });

    // No sobrescribir liquidaciones ya aprobadas o pagadas.
    const prev = await client.query(
      'SELECT id, estado FROM rem_liquidacion WHERE trabajador_id = $1 AND periodo = $2',
      [t.id, periodoDate]
    );
    if (prev.rows[0] && ['aprobada', 'pagada'].includes(prev.rows[0].estado)) {
      return res.status(409).json({ message: `La liquidación está ${prev.rows[0].estado} y no puede recalcularse. Reábrela primero.` });
    }

    const insumos = await armarInsumos(t, periodoDate);
    if (!insumos.parametro) {
      return res.status(400).json({ message: 'No hay indicadores previsionales para ese período.' });
    }
    const { detalles, totales } = calcularLiquidacion({
      trabajador: t, ...insumos, diasTrabajados: b.diasTrabajados ?? 30,
    });

    await client.query('BEGIN');
    // Upsert de cabecera
    const cab = await client.query(
      `INSERT INTO rem_liquidacion
         (organizacion_id, empresa_id, trabajador_id, periodo, estado, dias_trabajados,
          total_imponible, total_no_imponible, total_haberes, base_tributable,
          total_descuentos, liquido_pagar, aportes_patronales, parametro_snapshot, calculado_at)
       VALUES ($1,$2,$3,$4,'borrador',$5,$6,$7,$8,$9,$10,$11,$12,$13, CURRENT_TIMESTAMP)
       ON CONFLICT (trabajador_id, periodo) DO UPDATE SET
          estado = 'borrador', dias_trabajados = EXCLUDED.dias_trabajados,
          total_imponible = EXCLUDED.total_imponible, total_no_imponible = EXCLUDED.total_no_imponible,
          total_haberes = EXCLUDED.total_haberes, base_tributable = EXCLUDED.base_tributable,
          total_descuentos = EXCLUDED.total_descuentos, liquido_pagar = EXCLUDED.liquido_pagar,
          aportes_patronales = EXCLUDED.aportes_patronales, parametro_snapshot = EXCLUDED.parametro_snapshot,
          calculado_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [t.organizacion_id, t.empresa_id, t.id, periodoDate, totales.dias_trabajados,
       totales.total_imponible, totales.total_no_imponible, totales.total_haberes, totales.base_tributable,
       totales.total_descuentos, totales.liquido_pagar, totales.aportes_patronales,
       JSON.stringify(insumos.parametro)]
    );
    const liqId = cab.rows[0].id;

    // Reemplaza el detalle
    await client.query('DELETE FROM rem_liquidacion_detalle WHERE liquidacion_id = $1', [liqId]);
    for (const d of detalles) {
      await client.query(
        `INSERT INTO rem_liquidacion_detalle
           (liquidacion_id, codigo, descripcion, naturaleza, imponible, tributable, monto, orden)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [liqId, d.codigo, d.descripcion, d.naturaleza, d.imponible, d.tributable, d.monto, d.orden]
      );
    }
    await client.query('COMMIT');
    return res.status(200).json({ success: true, id: liqId, totales });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ guardarLiquidacion:', e.message);
    return res.status(500).json({ message: 'Error al guardar la liquidación' });
  } finally {
    client.release();
  }
};

// ============================================================================
// CONSULTA
// ============================================================================
export const listLiquidaciones = async (req, res) => {
  try {
    const orgId = req.user?.organizacionId || null;
    const empresaId = (req.query.empresaId && req.query.empresaId !== 'undefined') ? req.query.empresaId : null;
    if (empresaId) {
      const emp = await pool.query('SELECT organizacion_id FROM empresa WHERE id = $1', [empresaId]);
      if (!emp.rows[0] || (emp.rows[0].organizacion_id || null) !== orgId) {
        return res.status(404).json({ message: 'Empresa no encontrada en tu organización' });
      }
    }
    const col = empresaId ? 'l.empresa_id' : 'l.organizacion_id';
    const params = [empresaId || orgId];
    let filtro = '';
    const periodoDate = primerDia(req.query.periodo);
    if (periodoDate) { params.push(periodoDate); filtro = ' AND l.periodo = $2'; }

    const { rows } = await pool.query(
      `SELECT l.id, l.periodo, l.estado, l.liquido_pagar, l.total_haberes, l.total_descuentos,
              t.nombres, t.apellido_paterno, t.apellido_materno, t.cargo, e.razon_social AS empresa_nombre
       FROM rem_liquidacion l
       JOIN rem_trabajador t ON t.id = l.trabajador_id
       LEFT JOIN empresa e ON e.id = l.empresa_id
       WHERE ${col} = $1${filtro}
       ORDER BY l.periodo DESC, t.nombres
       LIMIT 1000`,
      params
    );
    return res.status(200).json(rows.map(r => ({
      id: r.id,
      periodo: r.periodo,
      empleado: [r.nombres, r.apellido_paterno, r.apellido_materno].filter(Boolean).join(' ').trim(),
      cargo: r.cargo || '—',
      estado: r.estado,
      empresa: r.empresa_nombre || '',
      liquido: Number(r.liquido_pagar),
      totalHaberes: Number(r.total_haberes),
      totalDescuentos: Number(r.total_descuentos),
    })));
  } catch (e) {
    console.error('❌ listLiquidaciones:', e.message);
    return res.status(500).json({ message: 'Error al listar liquidaciones' });
  }
};

// Transiciones de estado permitidas.
const TRANSICIONES = {
  borrador: ['revisada', 'aprobada', 'anulada'],
  revisada: ['aprobada', 'borrador', 'anulada'],
  aprobada: ['pagada', 'borrador', 'anulada'], // borrador = reabrir
  pagada: ['anulada'],
  anulada: ['borrador'],
};

// Cambia el estado de una liquidación respetando las transiciones válidas.
export const cambiarEstadoLiquidacion = async (req, res) => {
  try {
    const { id } = req.params;
    const nuevo = String(req.body?.estado || '').toLowerCase();
    if (!TRANSICIONES[nuevo] && !['borrador', 'revisada', 'aprobada', 'pagada', 'anulada'].includes(nuevo)) {
      return res.status(400).json({ message: 'Estado inválido' });
    }
    const { rows } = await pool.query('SELECT id, estado, organizacion_id FROM rem_liquidacion WHERE id = $1', [id]);
    const l = rows[0];
    if (!l || (l.organizacion_id || null) !== (req.user?.organizacionId || null)) {
      return res.status(404).json({ message: 'Liquidación no encontrada' });
    }
    if (l.estado === nuevo) {
      return res.status(200).json({ success: true, estado: nuevo });
    }
    const permitidas = TRANSICIONES[l.estado] || [];
    if (!permitidas.includes(nuevo)) {
      return res.status(409).json({ message: `No se puede pasar de "${l.estado}" a "${nuevo}".` });
    }

    // Al aprobar se registra quién y cuándo; al reabrir (→borrador) se limpia.
    if (nuevo === 'aprobada') {
      await pool.query(
        `UPDATE rem_liquidacion SET estado = $1, aprobado_por = $2,
                aprobado_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
        [nuevo, req.user?.usuarioId || null, id]
      );
    } else if (nuevo === 'borrador') {
      await pool.query(
        `UPDATE rem_liquidacion SET estado = $1, aprobado_por = NULL,
                aprobado_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [nuevo, id]
      );
    } else {
      await pool.query(
        `UPDATE rem_liquidacion SET estado = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [nuevo, id]
      );
    }
    return res.status(200).json({ success: true, estado: nuevo });
  } catch (e) {
    console.error('❌ cambiarEstadoLiquidacion:', e.message);
    return res.status(500).json({ message: 'Error al cambiar el estado' });
  }
};

// Elimina una liquidación (no permitido si está aprobada o pagada).
export const deleteLiquidacion = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT id, estado, organizacion_id FROM rem_liquidacion WHERE id = $1', [id]);
    const l = rows[0];
    if (!l || (l.organizacion_id || null) !== (req.user?.organizacionId || null)) {
      return res.status(404).json({ message: 'Liquidación no encontrada' });
    }
    if (['aprobada', 'pagada'].includes(l.estado)) {
      return res.status(409).json({ message: `No se puede eliminar una liquidación ${l.estado}. Anúlala o reábrela primero.` });
    }
    await pool.query('DELETE FROM rem_liquidacion WHERE id = $1', [id]);
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('❌ deleteLiquidacion:', e.message);
    return res.status(500).json({ message: 'Error al eliminar la liquidación' });
  }
};

// ============================================================================
// LIBRO DE REMUNERACIONES (reporte del período)
// ============================================================================
export const libroRemuneraciones = async (req, res) => {
  try {
    const orgId = req.user?.organizacionId || null;
    const empresaId = (req.query.empresaId && req.query.empresaId !== 'undefined') ? req.query.empresaId : null;
    const periodoDate = primerDia(req.query.periodo);
    if (!periodoDate) return res.status(400).json({ message: 'Período requerido (YYYY-MM)' });
    if (empresaId) {
      const emp = await pool.query('SELECT organizacion_id FROM empresa WHERE id = $1', [empresaId]);
      if (!emp.rows[0] || (emp.rows[0].organizacion_id || null) !== orgId) {
        return res.status(404).json({ message: 'Empresa no encontrada en tu organización' });
      }
    }
    const col = empresaId ? 'empresa_id' : 'organizacion_id';
    const val = empresaId || orgId;

    const [{ rows }, { rows: dets }] = await Promise.all([
      pool.query(
        `SELECT l.trabajador_id, l.dias_trabajados, t.nombres, t.apellido_paterno, t.apellido_materno,
                t.cargo, t.rut_encrypted, t.banco, t.tipo_cuenta, t.numero_cuenta, t.tipo_pago,
                af.nombre AS afp_nombre, s.nombre AS salud_nombre, e.razon_social AS empresa_nombre,
                l.total_imponible, l.total_no_imponible, l.total_haberes, l.base_tributable,
                l.total_descuentos, l.liquido_pagar, l.aportes_patronales, l.estado
         FROM rem_liquidacion l JOIN rem_trabajador t ON t.id = l.trabajador_id
         LEFT JOIN rem_afp af ON af.id = t.afp_id
         LEFT JOIN rem_salud s ON s.id = t.salud_id
         LEFT JOIN empresa e ON e.id = l.empresa_id
         WHERE l.${col} = $1 AND l.periodo = $2
         ORDER BY e.razon_social, t.nombres, t.apellido_paterno`,
        [val, periodoDate]
      ),
      pool.query(
        `SELECT l.trabajador_id, d.naturaleza, d.codigo, SUM(d.monto) AS total
         FROM rem_liquidacion_detalle d JOIN rem_liquidacion l ON l.id = d.liquidacion_id
         WHERE l.${col} = $1 AND l.periodo = $2
         GROUP BY l.trabajador_id, d.naturaleza, d.codigo`,
        [val, periodoDate]
      ),
    ]);

    const detBy = new Map();
    for (const d of dets) {
      if (!detBy.has(d.trabajador_id)) detBy.set(d.trabajador_id, []);
      detBy.get(d.trabajador_id).push(d);
    }
    const pick = (arr, nat, pred) => (arr || []).filter(r => r.naturaleza === nat && pred(r.codigo)).reduce((s, r) => s + Number(r.total), 0);

    const filas = rows.map(r => {
      const rutClaro = decrypt(r.rut_encrypted);
      const arr = detBy.get(r.trabajador_id);
      return {
        empleado: [r.nombres, r.apellido_paterno, r.apellido_materno].filter(Boolean).join(' ').trim(),
        rut: rutClaro ? formatRut(rutClaro) : '—',
        cargo: r.cargo || '—',
        empresa: r.empresa_nombre || '',
        dias: Number(r.dias_trabajados),
        banco: r.banco || '', tipoCuenta: r.tipo_cuenta || '', numeroCuenta: r.numero_cuenta || '', tipoPago: r.tipo_pago || '',
        afp: r.afp_nombre || '', salud: r.salud_nombre || '',
        imponible: Number(r.total_imponible),
        noImponible: Number(r.total_no_imponible),
        haberes: Number(r.total_haberes),
        tributable: Number(r.base_tributable),
        descuentos: Number(r.total_descuentos),
        liquido: Number(r.liquido_pagar),
        aportes: Number(r.aportes_patronales),
        estado: r.estado,
        sueldoBase: pick(arr, 'HABER', c => c === '100'),
        gratificacion: pick(arr, 'HABER', c => c === '115'),
        asignacionFamiliar: pick(arr, 'HABER', c => c === '102' || c === '105'),
        descAfp: pick(arr, 'DESCUENTO', c => c === '200'),
        descSalud: pick(arr, 'DESCUENTO', c => c === '201' || c === '202'),
        descCesantia: pick(arr, 'DESCUENTO', c => c === 'AFC'),
        impuesto: pick(arr, 'DESCUENTO', c => c === '205'),
        aporteSis: pick(arr, 'APORTE', c => c === 'SIS'),
        aporteAfc: pick(arr, 'APORTE', c => c === 'AFC-E'),
        aporteMutual: pick(arr, 'APORTE', c => c === 'MUT'),
      };
    });

    const totales = filas.reduce((a, f) => ({
      imponible: a.imponible + f.imponible, noImponible: a.noImponible + f.noImponible,
      haberes: a.haberes + f.haberes, tributable: a.tributable + f.tributable,
      descuentos: a.descuentos + f.descuentos, liquido: a.liquido + f.liquido, aportes: a.aportes + f.aportes,
    }), { imponible: 0, noImponible: 0, haberes: 0, tributable: 0, descuentos: 0, liquido: 0, aportes: 0 });

    return res.status(200).json({ periodo: periodoDate, filas, totales, cantidad: filas.length });
  } catch (e) {
    console.error('❌ libroRemuneraciones:', e.message);
    return res.status(500).json({ message: 'Error al generar el libro de remuneraciones' });
  }
};

// Marca como pagadas todas las liquidaciones APROBADAS del período.
export const marcarPeriodoPagado = async (req, res) => {
  try {
    const orgId = req.user?.organizacionId || null;
    const empresaId = (req.query.empresaId && req.query.empresaId !== 'undefined') ? req.query.empresaId : null;
    const periodoDate = primerDia(req.query.periodo);
    if (!periodoDate) return res.status(400).json({ message: 'Período requerido (YYYY-MM)' });
    if (empresaId) {
      const emp = await pool.query('SELECT organizacion_id FROM empresa WHERE id = $1', [empresaId]);
      if (!emp.rows[0] || (emp.rows[0].organizacion_id || null) !== orgId) {
        return res.status(404).json({ message: 'Empresa no encontrada en tu organización' });
      }
    }
    const col = empresaId ? 'empresa_id' : 'organizacion_id';
    const val = empresaId || orgId;
    const { rowCount } = await pool.query(
      `UPDATE rem_liquidacion SET estado = 'pagada', updated_at = CURRENT_TIMESTAMP
       WHERE ${col} = $1 AND periodo = $2 AND estado = 'aprobada'`,
      [val, periodoDate]
    );
    return res.status(200).json({ success: true, actualizadas: rowCount });
  } catch (e) {
    console.error('❌ marcarPeriodoPagado:', e.message);
    return res.status(500).json({ message: 'Error al marcar el período como pagado' });
  }
};

export const getLiquidacion = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT l.*, t.nombres, t.apellido_paterno, t.apellido_materno, t.cargo
       FROM rem_liquidacion l JOIN rem_trabajador t ON t.id = l.trabajador_id
       WHERE l.id = $1`,
      [id]
    );
    const l = rows[0];
    if (!l || (l.organizacion_id || null) !== (req.user?.organizacionId || null)) {
      return res.status(404).json({ message: 'Liquidación no encontrada' });
    }
    const det = await pool.query(
      'SELECT codigo, descripcion, naturaleza, imponible, tributable, monto, orden FROM rem_liquidacion_detalle WHERE liquidacion_id = $1 ORDER BY orden',
      [id]
    );
    return res.status(200).json({
      id: l.id,
      periodo: l.periodo,
      estado: l.estado,
      empleado: [l.nombres, l.apellido_paterno, l.apellido_materno].filter(Boolean).join(' ').trim(),
      cargo: l.cargo,
      totales: {
        dias_trabajados: Number(l.dias_trabajados),
        total_imponible: Number(l.total_imponible),
        total_no_imponible: Number(l.total_no_imponible),
        total_haberes: Number(l.total_haberes),
        base_tributable: Number(l.base_tributable),
        total_descuentos: Number(l.total_descuentos),
        liquido_pagar: Number(l.liquido_pagar),
        aportes_patronales: Number(l.aportes_patronales),
      },
      detalles: det.rows.map(d => ({ ...d, monto: Number(d.monto) })),
    });
  } catch (e) {
    console.error('❌ getLiquidacion:', e.message);
    return res.status(500).json({ message: 'Error al obtener la liquidación' });
  }
};
