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
import { enviarCorreo } from '../utils/mailer.js';

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
  const [param, afp, salud, movs, fijos, licencias, config] = await Promise.all([
    pool.query('SELECT * FROM rem_parametro_previsional WHERE periodo <= $1 ORDER BY periodo DESC LIMIT 1', [periodoDate]),
    trabajador.afp_id ? pool.query('SELECT tasa_comision FROM rem_afp WHERE id = $1', [trabajador.afp_id]) : { rows: [] },
    trabajador.salud_id ? pool.query('SELECT tipo FROM rem_salud WHERE id = $1', [trabajador.salud_id]) : { rows: [] },
    // Novedades MENSUALES (variables de este mes)
    pool.query(
      `SELECT m.codigo, m.cantidad, m.monto, m.glosa,
              c.naturaleza, c.imponible, c.tributable, c.afecta_gratificacion, c.descripcion AS cdesc
       FROM rem_movimiento_periodo m
       LEFT JOIN rem_concepto c ON c.id = m.concepto_id
       WHERE m.trabajador_id = $1 AND m.periodo = $2`,
      [trabajador.id, periodoDate]
    ),
    // Haberes / descuentos FIJOS (recurrentes) vigentes en el período
    pool.query(
      `SELECT f.codigo, f.monto, f.glosa,
              c.naturaleza, c.imponible, c.tributable, c.afecta_gratificacion, c.descripcion AS cdesc
       FROM rem_haber_descuento_fijo f
       LEFT JOIN rem_concepto c ON c.id = f.concepto_id
       WHERE f.trabajador_id = $1 AND f.activo
         AND (f.vigencia_desde IS NULL OR f.vigencia_desde <= $2)
         AND (f.vigencia_hasta IS NULL OR f.vigencia_hasta >= $2)`,
      [trabajador.id, periodoDate]
    ),
    // Licencias médicas del período → días no trabajados
    pool.query(
      'SELECT COALESCE(SUM(dias),0) AS dias FROM rem_licencia_medica WHERE trabajador_id = $1 AND periodo = $2',
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

  const aMovimiento = (m) => ({
    codigo: m.codigo,
    descripcion: m.cdesc || m.glosa || 'Movimiento',
    naturaleza: m.naturaleza || 'HABER',
    imponible: !!m.imponible,
    tributable: !!m.tributable,
    afectaGratificacion: !!m.afecta_gratificacion,
    cantidad: m.cantidad,
    monto: m.monto,
  });
  // Fijos + mensuales entran al motor como una sola lista de novedades.
  const movimientos = [...fijos.rows.map(aMovimiento), ...movs.rows.map(aMovimiento)];
  const diasLicencia = Math.min(30, Number(licencias.rows[0]?.dias) || 0);

  return {
    parametro,
    afp: afp.rows[0] || null,
    saludEsIsapre: salud.rows[0]?.tipo === 'ISAPRE',
    movimientos,
    diasLicencia,
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
    // Los días de licencia médica descuentan del período (30 base − licencia).
    const diasBase = b.diasTrabajados != null ? Number(b.diasTrabajados) : 30;
    const diasTrabajados = Math.max(0, diasBase - insumos.diasLicencia);
    const resultado = calcularLiquidacion({ trabajador: t, ...insumos, diasTrabajados });
    return res.status(200).json({
      trabajador: { id: t.id, nombre: nombreTrab(t) },
      periodo: periodoDate,
      diasLicencia: insumos.diasLicencia,
      diasTrabajados,
      ...resultado,
    });
  } catch (e) {
    console.error('❌ previewLiquidacion:', e.message);
    return res.status(500).json({ message: 'Error al calcular la liquidación' });
  }
};

// Calcula y persiste (upsert) la liquidación de un trabajador. Maneja su propia
// transacción. Reutilizado por el guardado individual y por la generación masiva.
// `diasBase` = días contractuales (30 por defecto); las licencias del período se
// descuentan dentro. Devuelve { id, totales, diasLicencia }.
const computeAndUpsert = async (t, periodoDate, diasBase = 30) => {
  const insumos = await armarInsumos(t, periodoDate);
  if (!insumos.parametro) {
    const err = new Error('No hay indicadores previsionales para ese período.');
    err.code = 'SIN_PARAMETRO';
    throw err;
  }
  const dias = Math.max(0, (diasBase != null ? Number(diasBase) : 30) - insumos.diasLicencia);
  const { detalles, totales } = calcularLiquidacion({ trabajador: t, ...insumos, diasTrabajados: dias });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
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
    return { id: liqId, totales, diasLicencia: insumos.diasLicencia };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
};

// Guardar: calcula y persiste cabecera + detalle (upsert por trabajador+período).
export const guardarLiquidacion = async (req, res) => {
  try {
    const b = req.body || {};
    const periodoDate = primerDia(b.periodo);
    if (!periodoDate) return res.status(400).json({ message: 'Período inválido (use YYYY-MM)' });
    const t = await cargarTrabajador(req, b.trabajadorId);
    if (!t) return res.status(404).json({ message: 'Trabajador no encontrado' });

    // No sobrescribir liquidaciones ya aprobadas o pagadas.
    const prev = await pool.query(
      'SELECT estado FROM rem_liquidacion WHERE trabajador_id = $1 AND periodo = $2',
      [t.id, periodoDate]
    );
    if (prev.rows[0] && ['aprobada', 'pagada'].includes(prev.rows[0].estado)) {
      return res.status(409).json({ message: `La liquidación está ${prev.rows[0].estado} y no puede recalcularse. Reábrela primero.` });
    }

    const { id, totales } = await computeAndUpsert(t, periodoDate, b.diasTrabajados);
    return res.status(200).json({ success: true, id, totales });
  } catch (e) {
    if (e.code === 'SIN_PARAMETRO') return res.status(400).json({ message: e.message });
    console.error('❌ guardarLiquidacion:', e.message);
    return res.status(500).json({ message: 'Error al guardar la liquidación' });
  }
};

// Generación masiva: calcula y guarda la liquidación de varios trabajadores del
// período (uno, una selección o todos los activos de la empresa). No pisa las que
// ya están aprobadas o pagadas.
export const generarMasivo = async (req, res) => {
  try {
    const orgId = req.user?.organizacionId || null;
    const b = req.body || {};
    const periodoDate = primerDia(b.periodo);
    if (!periodoDate) return res.status(400).json({ message: 'Período inválido (use YYYY-MM)' });

    const empresaId = (b.empresaId && b.empresaId !== 'undefined') ? b.empresaId : null;
    if (empresaId) {
      const emp = await pool.query('SELECT organizacion_id FROM empresa WHERE id = $1', [empresaId]);
      if (!emp.rows[0] || (emp.rows[0].organizacion_id || null) !== orgId) {
        return res.status(404).json({ message: 'Empresa no encontrada en tu organización' });
      }
    }

    // Universo de trabajadores: IDs explícitos, o todos los activos del alcance.
    let trabajadores;
    if (Array.isArray(b.trabajadorIds) && b.trabajadorIds.length) {
      const q = await pool.query(
        `SELECT * FROM rem_trabajador WHERE id = ANY($1::uuid[]) AND organizacion_id IS NOT DISTINCT FROM $2`,
        [b.trabajadorIds, orgId]
      );
      trabajadores = q.rows;
    } else {
      const col = empresaId ? 'empresa_id' : 'organizacion_id';
      const val = empresaId || orgId;
      const q = await pool.query(
        `SELECT * FROM rem_trabajador WHERE ${col} = $1 AND estado_contrato = 'activo'`,
        [val]
      );
      trabajadores = q.rows;
    }
    if (!trabajadores.length) return res.status(200).json({ success: true, generadas: 0, omitidas: 0, errores: [], total: 0 });

    // Estados previos para saltar aprobadas/pagadas.
    const ids = trabajadores.map(t => t.id);
    const prev = await pool.query(
      'SELECT trabajador_id, estado FROM rem_liquidacion WHERE trabajador_id = ANY($1::uuid[]) AND periodo = $2',
      [ids, periodoDate]
    );
    const bloqueadas = new Set(prev.rows.filter(r => ['aprobada', 'pagada'].includes(r.estado)).map(r => r.trabajador_id));

    let generadas = 0, omitidas = 0;
    const errores = [];
    for (const t of trabajadores) {
      if (bloqueadas.has(t.id)) { omitidas++; continue; }
      try {
        await computeAndUpsert(t, periodoDate, 30);
        generadas++;
      } catch (e) {
        errores.push({ trabajador: nombreTrab(t), motivo: e.message });
      }
    }
    return res.status(200).json({ success: true, total: trabajadores.length, generadas, omitidas, errores });
  } catch (e) {
    console.error('❌ generarMasivo:', e.message);
    return res.status(500).json({ message: 'Error en la generación masiva' });
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

// ============================================================================
// LIQUIDACIÓN IMPRIMIBLE (payslip) — descarga y envío por correo
// ============================================================================
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const periodoLargo = (d) => {
  const s = String(d).slice(0, 10).split('-');
  return s.length === 3 ? `${MESES[Number(s[1]) - 1]} ${s[0]}` : String(d);
};
const clpFmt = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(Number(v) || 0);
const nfmt = (v) => new Intl.NumberFormat('es-CL').format(Math.round(Number(v) || 0)); // 350000 → "350.000"
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Convierte un entero a palabras en español (para la línea "SON: … PESOS").
const numeroALetras = (n) => {
  n = Math.round(Math.abs(Number(n) || 0));
  if (n === 0) return 'CERO';
  const U = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE'];
  const D = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const C = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
  const centena = (x) => {
    if (x === 0) return '';
    if (x === 100) return 'CIEN';
    const c = Math.floor(x / 100), dd = x % 100, d = Math.floor(dd / 10), u = dd % 10;
    let r = c ? C[c] + ' ' : '';
    if (dd <= 20) r += U[dd];
    else if (dd < 30) r += 'VEINTI' + U[u];
    else { r += D[d]; if (u) r += ' Y ' + U[u]; }
    return r.trim();
  };
  const grupo = (x, sing, plur) => x === 1 ? sing : centena(x) + ' ' + plur;
  const millones = Math.floor(n / 1000000), miles = Math.floor((n % 1000000) / 1000), resto = n % 1000;
  let r = '';
  if (millones) r += grupo(millones, 'UN MILLON', 'MILLONES') + ' ';
  if (miles) r += grupo(miles, 'MIL', 'MIL') + ' ';
  if (resto) r += centena(resto);
  return r.trim().replace(/UNO MIL/g, 'UN MIL').replace(/UNO MILLON/g, 'UN MILLON');
};

// Carga todos los datos que necesita una liquidación imprimible.
const cargarPayslip = async (id, orgId) => {
  const { rows } = await pool.query(
    `SELECT l.*, t.nombres, t.apellido_paterno, t.apellido_materno, t.cargo, t.rut_encrypted,
            t.cargas_normales, t.cargas_maternales, t.cargas_invalidas,
            t.plan_isapre_monto, t.plan_isapre_moneda,
            af.nombre AS afp_nombre, af.tasa_comision AS afp_comision,
            s.nombre AS salud_nombre, s.tipo AS salud_tipo,
            e.razon_social AS empresa_nombre, e.rut_encrypted AS empresa_rut_enc
     FROM rem_liquidacion l JOIN rem_trabajador t ON t.id = l.trabajador_id
     LEFT JOIN rem_afp af ON af.id = t.afp_id
     LEFT JOIN rem_salud s ON s.id = t.salud_id
     LEFT JOIN empresa e ON e.id = l.empresa_id
     WHERE l.id = $1`,
    [id]
  );
  const l = rows[0];
  if (!l || (l.organizacion_id || null) !== (orgId || null)) return null;
  const det = await pool.query(
    'SELECT codigo, descripcion, naturaleza, imponible, monto FROM rem_liquidacion_detalle WHERE liquidacion_id = $1 ORDER BY orden',
    [id]
  );
  const rutClaro = decrypt(l.rut_encrypted);
  // Último día del período (para la fecha del documento).
  const p = String(l.periodo).slice(0, 10).split('-');
  const ultimoDia = p.length === 3 ? new Date(Number(p[0]), Number(p[1]), 0).getDate() : 30;
  return {
    id: l.id,
    periodo: l.periodo,
    periodoTexto: periodoLargo(l.periodo),
    fechaDoc: p.length === 3 ? `${String(ultimoDia).padStart(2, '0')}/${p[1]}/${p[0]}` : '',
    estado: l.estado,
    empleado: [l.nombres, l.apellido_paterno, l.apellido_materno].filter(Boolean).join(' ').trim(),
    rut: rutClaro ? formatRut(rutClaro) : '—',
    cargo: l.cargo || '—',
    empresa: l.empresa_nombre || '',
    empresaRut: l.empresa_rut_enc ? (formatRut(decrypt(l.empresa_rut_enc)) || '') : '',
    afp: l.afp_nombre || '', afpComision: Number(l.afp_comision) || 0,
    salud: l.salud_nombre || '', saludTipo: l.salud_tipo || '',
    planIsapre: Number(l.plan_isapre_monto) || 0, planIsapreMoneda: l.plan_isapre_moneda || 'UF',
    cargas: (Number(l.cargas_normales) || 0) + (Number(l.cargas_maternales) || 0) + (Number(l.cargas_invalidas) || 0),
    diasTrabajados: Number(l.dias_trabajados),
    totales: {
      total_imponible: Number(l.total_imponible),
      total_no_imponible: Number(l.total_no_imponible),
      total_haberes: Number(l.total_haberes),
      base_tributable: Number(l.base_tributable),
      total_descuentos: Number(l.total_descuentos),
      liquido_pagar: Number(l.liquido_pagar),
      aportes_patronales: Number(l.aportes_patronales),
    },
    haberes: det.rows.filter(d => d.naturaleza === 'HABER').map(d => ({ ...d, monto: Number(d.monto), imponible: !!d.imponible })),
    descuentos: det.rows.filter(d => d.naturaleza === 'DESCUENTO').map(d => ({ ...d, monto: Number(d.monto) })),
  };
};

// Genera el HTML de la liquidación en formato clásico chileno (imprimir / correo).
const payslipHtml = (d) => {
  const t = d.totales;
  const habImp = d.haberes.filter(h => h.imponible);
  const habNoImp = d.haberes.filter(h => !h.imponible);
  const CODS_LEGALES = ['200', '201', '202', 'AFC', '205'];
  const totLegales = d.descuentos.filter(x => CODS_LEGALES.includes(x.codigo)).reduce((s, x) => s + x.monto, 0);
  const totOtros = d.descuentos.filter(x => !CODS_LEGALES.includes(x.codigo)).reduce((s, x) => s + x.monto, 0);

  const linea = (desc, monto) => `<tr><td>${esc(desc)}</td><td class="n">${nfmt(monto)}</td></tr>`;
  const habImpHtml = habImp.map(h => linea(h.descripcion, h.monto)).join('') || '<tr><td colspan="2">&nbsp;</td></tr>';
  const habNoImpHtml = habNoImp.map(h => linea(h.descripcion, h.monto)).join('');
  const descHtml = d.descuentos.map(x => linea(x.descripcion, x.monto)).join('') || '<tr><td colspan="2">&nbsp;</td></tr>';

  const isapre = d.saludTipo === 'ISAPRE';
  const planTxt = isapre && d.planIsapre > 0
    ? (d.planIsapreMoneda === 'CLP' ? nfmt(d.planIsapre) : `${d.planIsapre} UF`) + ' · 7%'
    : '7%';

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Liquidación ${esc(d.empleado)} — ${esc(d.periodoTexto)}</title>
<style>
  @page{size:A4;margin:14mm}
  *{box-sizing:border-box} body{font-family:'Courier New',monospace;color:#111;margin:0;padding:20px;background:#fff;font-size:12px;line-height:1.35}
  .doc{max-width:720px;margin:0 auto}
  h1{text-align:center;font-size:15px;letter-spacing:1px;margin:0 0 2px}
  .mes{margin:0 0 8px}
  .hr{border:0;border-top:1.5px solid #000;margin:6px 0}
  .row{display:flex;justify-content:space-between;gap:20px} .k{font-weight:bold} .mut{color:#333}
  table.grid{width:100%;border-collapse:collapse;margin:2px 0} table.grid td{padding:1px 4px}
  .cols{display:flex;border-top:1.5px solid #000;border-bottom:1.5px solid #000}
  .col{flex:1;padding:6px 10px} .col.l{border-right:1px solid #000}
  .col h2{font-size:12px;text-align:center;margin:0 0 6px}
  table.d{width:100%;border-collapse:collapse} table.d td{padding:1px 2px}
  table.d td.n{text-align:right;white-space:nowrap} .tot td{font-weight:bold;border-top:1px solid #000}
  .big{display:flex;justify-content:space-between;font-weight:bold;font-size:13px;margin-top:8px}
  .son{margin:10px 0;font-weight:bold}
  .leg{font-size:11px;margin:14px 0 0;line-height:1.5}
  .firmas{display:flex;justify-content:space-between;gap:60px;margin-top:70px;text-align:center}
  .firmas div{flex:1;border-top:1px solid #000;padding-top:4px;font-size:11px}
</style></head><body><div class="doc">
  <h1>LIQUIDACION DE SUELDO</h1>
  <p class="mes">REMUNERACIONES MES DE: ${esc(d.periodoTexto.toUpperCase())}</p>
  <hr class="hr">
  <div class="row"><span><span class="k">RAZON SOCIAL:</span> ${esc(d.empresa)}</span><span><span class="k">RUT EMPRESA:</span> ${esc(d.empresaRut || '—')}</span></div>
  <hr class="hr">
  <div class="row"><span><span class="k">R.U.T.:</span> ${esc(d.rut)}</span><span><span class="k">TRABAJADOR:</span> ${esc(d.empleado)}</span></div>
  <hr class="hr">
  <div class="row"><span><span class="k">A.F.P.:</span> ${esc(d.afp || '—')} <span class="mut">${d.afpComision ? d.afpComision + '%' : ''}</span></span><span><span class="k">${isapre ? 'ISAPRE' : 'SALUD'}:</span> ${esc(d.salud || '—')} <span class="mut">${planTxt}</span></span></div>
  <hr class="hr">
  <table class="grid"><tr>
    <td class="k">DIAS</td><td>${d.diasTrabajados}</td>
    <td class="k">CARGAS</td><td>${d.cargas}</td>
    <td class="k">IMPONIBLE</td><td style="text-align:right">${nfmt(t.total_imponible)}</td>
    <td class="k">TRIBUTABLE</td><td style="text-align:right">${nfmt(t.base_tributable)}</td>
  </tr></table>
  <div class="cols">
    <div class="col l">
      <h2>HABERES</h2>
      <table class="d">${habImpHtml}
        <tr class="tot"><td>TOTAL IMPONIBLE</td><td class="n">${nfmt(t.total_imponible)}</td></tr>
        ${habNoImpHtml}
        <tr class="tot"><td>TOTAL NO IMPONIBLE</td><td class="n">${nfmt(t.total_no_imponible)}</td></tr>
      </table>
    </div>
    <div class="col">
      <h2>DESCUENTOS</h2>
      <table class="d">${descHtml}
        <tr class="tot"><td>TOTAL DESC. LEGALES</td><td class="n">${nfmt(totLegales)}</td></tr>
        <tr><td>TOTAL OTROS DESC.</td><td class="n">${nfmt(totOtros)}</td></tr>
      </table>
    </div>
  </div>
  <div class="big"><span>TOTAL HABERES: ${nfmt(t.total_haberes)}</span><span>TOTAL DESCUENTOS: ${nfmt(t.total_descuentos)}</span></div>
  <div class="big"><span>FECHA: ${esc(d.fechaDoc)}</span><span>ALCANCE LIQUIDO: ${nfmt(t.liquido_pagar)}</span></div>
  <p class="son">SON: ${numeroALetras(t.liquido_pagar)} PESOS.</p>
  <hr class="hr">
  <p class="leg">Recibí conforme el alcance líquido de la presente liquidación, no teniendo cargo o cobro alguno que hacer por otro concepto.</p>
  <div class="firmas"><div>FIRMA DEL EMPLEADOR</div><div>FIRMA DEL TRABAJADOR</div></div>
</div></body></html>`;
};

// Devuelve el HTML imprimible de una liquidación (el front lo abre e imprime → PDF).
export const getPayslip = async (req, res) => {
  try {
    const d = await cargarPayslip(req.params.id, req.user?.organizacionId || null);
    if (!d) return res.status(404).json({ message: 'Liquidación no encontrada' });
    return res.status(200).json({ html: payslipHtml(d), empleado: d.empleado, periodo: d.periodoTexto });
  } catch (e) {
    console.error('❌ getPayslip:', e.message);
    return res.status(500).json({ message: 'Error al generar la liquidación imprimible' });
  }
};

// Envía la liquidación por correo al trabajador (o a un destinatario indicado).
export const enviarLiquidacion = async (req, res) => {
  try {
    const d = await cargarPayslip(req.params.id, req.user?.organizacionId || null);
    if (!d) return res.status(404).json({ message: 'Liquidación no encontrada' });
    // Email destino: el del cuerpo (override) o el del trabajador.
    let destino = req.body?.email;
    if (!destino) {
      const t = await pool.query(
        'SELECT t.email FROM rem_liquidacion l JOIN rem_trabajador t ON t.id = l.trabajador_id WHERE l.id = $1',
        [req.params.id]
      );
      destino = t.rows[0]?.email;
    }
    if (!destino) return res.status(400).json({ message: 'El trabajador no tiene correo registrado. Agrégalo en su ficha o indícalo al enviar.' });

    await enviarCorreo({
      to: destino,
      subject: `Liquidación de sueldo · ${d.periodoTexto}`,
      html: payslipHtml(d),
    });
    return res.status(200).json({ success: true, email: destino });
  } catch (e) {
    if (e.code === 'MAIL_NO_CONFIG') return res.status(503).json({ message: e.message });
    console.error('❌ enviarLiquidacion:', e.message);
    return res.status(500).json({ message: 'No se pudo enviar el correo. Revisa la configuración de correo.' });
  }
};

// ============================================================================
// HABERES / DESCUENTOS FIJOS (recurrentes por trabajador)
// ============================================================================
export const listFijos = async (req, res) => {
  try {
    const t = await cargarTrabajador(req, req.query.trabajadorId);
    if (!t) return res.status(404).json({ message: 'Trabajador no encontrado' });
    const { rows } = await pool.query(
      `SELECT f.id, f.codigo, f.monto, f.glosa, f.vigencia_desde, f.vigencia_hasta, f.activo, f.concepto_id,
              c.descripcion, c.naturaleza
       FROM rem_haber_descuento_fijo f LEFT JOIN rem_concepto c ON c.id = f.concepto_id
       WHERE f.trabajador_id = $1
       ORDER BY c.naturaleza NULLS LAST, c.codigo`,
      [t.id]
    );
    return res.status(200).json(rows.map(r => ({
      id: r.id, conceptoId: r.concepto_id, codigo: r.codigo,
      descripcion: r.descripcion || r.glosa || 'Concepto',
      naturaleza: r.naturaleza || 'HABER',
      monto: Number(r.monto), glosa: r.glosa || '',
      vigenciaDesde: r.vigencia_desde, vigenciaHasta: r.vigencia_hasta, activo: r.activo,
    })));
  } catch (e) {
    console.error('❌ listFijos:', e.message);
    return res.status(500).json({ message: 'Error al listar los conceptos fijos' });
  }
};

export const createFijo = async (req, res) => {
  try {
    const b = req.body || {};
    const t = await cargarTrabajador(req, b.trabajadorId);
    if (!t) return res.status(404).json({ message: 'Trabajador no encontrado' });
    if (!b.conceptoId) return res.status(400).json({ message: 'Selecciona un concepto' });

    const c = await pool.query('SELECT codigo FROM rem_concepto WHERE id = $1', [b.conceptoId]);
    const codigo = c.rows[0]?.codigo || null;

    const { rows } = await pool.query(
      `INSERT INTO rem_haber_descuento_fijo
         (organizacion_id, empresa_id, trabajador_id, concepto_id, codigo, monto, glosa, vigencia_desde, vigencia_hasta, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [t.organizacion_id, t.empresa_id, t.id, b.conceptoId, codigo,
       Number(b.monto) || 0, b.glosa || null, b.vigenciaDesde || null, b.vigenciaHasta || null, req.user?.usuarioId || null]
    );
    return res.status(201).json({ success: true, id: rows[0].id });
  } catch (e) {
    console.error('❌ createFijo:', e.message);
    return res.status(500).json({ message: 'Error al agregar el concepto fijo' });
  }
};

export const deleteFijo = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT f.id FROM rem_haber_descuento_fijo f JOIN rem_trabajador t ON t.id = f.trabajador_id
       WHERE f.id = $1 AND t.organizacion_id IS NOT DISTINCT FROM $2`,
      [req.params.id, req.user?.organizacionId || null]
    );
    if (!rows.length) return res.status(404).json({ message: 'Concepto no encontrado' });
    await pool.query('DELETE FROM rem_haber_descuento_fijo WHERE id = $1', [req.params.id]);
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('❌ deleteFijo:', e.message);
    return res.status(500).json({ message: 'Error al eliminar el concepto fijo' });
  }
};

// ============================================================================
// LICENCIAS MÉDICAS
// ============================================================================
const TIPOS_LICENCIA = ['comun', 'maternal', 'laboral', 'prorroga'];

export const listLicencias = async (req, res) => {
  try {
    const orgId = req.user?.organizacionId || null;
    // Por trabajador (ficha) o consolidado por empresa/organización.
    if (req.query.trabajadorId) {
      const t = await cargarTrabajador(req, req.query.trabajadorId);
      if (!t) return res.status(404).json({ message: 'Trabajador no encontrado' });
      const { rows } = await pool.query(
        'SELECT * FROM rem_licencia_medica WHERE trabajador_id = $1 ORDER BY periodo DESC, fecha_inicio DESC',
        [t.id]
      );
      return res.status(200).json(rows.map(aLicencia));
    }
    const empresaId = (req.query.empresaId && req.query.empresaId !== 'undefined') ? req.query.empresaId : null;
    const col = empresaId ? 'l.empresa_id' : 'l.organizacion_id';
    const params = [empresaId || orgId];
    let filtro = '';
    const periodoDate = primerDia(req.query.periodo);
    if (periodoDate) { params.push(periodoDate); filtro = ' AND l.periodo = $2'; }
    const { rows } = await pool.query(
      `SELECT l.*, t.nombres, t.apellido_paterno, t.apellido_materno, e.razon_social AS empresa_nombre
       FROM rem_licencia_medica l JOIN rem_trabajador t ON t.id = l.trabajador_id
       LEFT JOIN empresa e ON e.id = l.empresa_id
       WHERE ${col} = $1${filtro}
       ORDER BY l.periodo DESC, l.fecha_inicio DESC LIMIT 1000`,
      params
    );
    return res.status(200).json(rows.map(r => ({
      ...aLicencia(r),
      empleado: [r.nombres, r.apellido_paterno, r.apellido_materno].filter(Boolean).join(' ').trim(),
      empresa: r.empresa_nombre || '',
    })));
  } catch (e) {
    console.error('❌ listLicencias:', e.message);
    return res.status(500).json({ message: 'Error al listar licencias médicas' });
  }
};

const aLicencia = (r) => ({
  id: r.id, trabajadorId: r.trabajador_id, periodo: r.periodo, tipo: r.tipo, folio: r.folio || '',
  fechaInicio: r.fecha_inicio, fechaFin: r.fecha_fin, dias: Number(r.dias), glosa: r.glosa || '',
});

export const createLicencia = async (req, res) => {
  try {
    const b = req.body || {};
    const periodoDate = primerDia(b.periodo);
    if (!periodoDate) return res.status(400).json({ message: 'Período inválido (use YYYY-MM)' });
    const t = await cargarTrabajador(req, b.trabajadorId);
    if (!t) return res.status(404).json({ message: 'Trabajador no encontrado' });
    const dias = Number(b.dias);
    if (!(dias > 0)) return res.status(400).json({ message: 'Indica los días de licencia' });
    const tipo = TIPOS_LICENCIA.includes(b.tipo) ? b.tipo : 'comun';

    const { rows } = await pool.query(
      `INSERT INTO rem_licencia_medica
         (organizacion_id, empresa_id, trabajador_id, periodo, tipo, folio, fecha_inicio, fecha_fin, dias, glosa, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [t.organizacion_id, t.empresa_id, t.id, periodoDate, tipo, b.folio || null,
       b.fechaInicio || null, b.fechaFin || null, dias, b.glosa || null, req.user?.usuarioId || null]
    );
    return res.status(201).json({ success: true, licencia: aLicencia(rows[0]) });
  } catch (e) {
    console.error('❌ createLicencia:', e.message);
    return res.status(500).json({ message: 'Error al registrar la licencia médica' });
  }
};

export const deleteLicencia = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT l.id FROM rem_licencia_medica l JOIN rem_trabajador t ON t.id = l.trabajador_id
       WHERE l.id = $1 AND t.organizacion_id IS NOT DISTINCT FROM $2`,
      [req.params.id, req.user?.organizacionId || null]
    );
    if (!rows.length) return res.status(404).json({ message: 'Licencia no encontrada' });
    await pool.query('DELETE FROM rem_licencia_medica WHERE id = $1', [req.params.id]);
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('❌ deleteLicencia:', e.message);
    return res.status(500).json({ message: 'Error al eliminar la licencia médica' });
  }
};

// ============================================================================
// CERTIFICADOS (antigüedad laboral / renta) — HTML imprimible
// ============================================================================
const hoyLargo = () => {
  const d = new Date();
  return `${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()} de ${d.getFullYear()}`;
};

const certificadoHtml = (titulo, cuerpoHtml, empresa) => `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(titulo)}</title>
<style>
  body{font-family:'Times New Roman',Georgia,serif;color:#1a1a1a;margin:0;padding:48px;background:#fff;line-height:1.7}
  .doc{max-width:720px;margin:0 auto}
  .hd{text-align:center;border-bottom:2px solid #1a1a1a;padding-bottom:16px;margin-bottom:28px}
  .hd .emp{font-size:15px;font-weight:bold;text-transform:uppercase;letter-spacing:.03em}
  h1{font-size:18px;text-align:center;text-transform:uppercase;letter-spacing:.08em;margin:28px 0}
  p{font-size:15px;text-align:justify;margin:14px 0}
  table{width:100%;border-collapse:collapse;margin:18px 0;font-size:14px}
  th,td{border:1px solid #999;padding:6px 10px;text-align:left} th{background:#f0f0f0}
  td.n{text-align:right;font-variant-numeric:tabular-nums}
  .firma{margin-top:64px;text-align:center} .firma .l{border-top:1px solid #1a1a1a;width:260px;margin:0 auto;padding-top:6px;font-size:13px}
  .pie{margin-top:40px;font-size:12px;color:#666;text-align:center}
</style></head><body><div class="doc">
  <div class="hd"><div class="emp">${esc(empresa || '')}</div></div>
  <h1>${esc(titulo)}</h1>
  ${cuerpoHtml}
  <div class="firma"><div class="l">Representante Legal / Empleador</div></div>
  <div class="pie">Documento emitido el ${hoyLargo()} · VS Consultores — Remuneraciones</div>
</div></body></html>`;

export const getCertificado = async (req, res) => {
  try {
    const tipo = (req.query.tipo === 'renta') ? 'renta' : 'antiguedad';
    const t = await cargarTrabajador(req, req.params.trabajadorId);
    if (!t) return res.status(404).json({ message: 'Trabajador no encontrado' });

    const emp = await pool.query('SELECT razon_social, rut_encrypted FROM empresa WHERE id = $1', [t.empresa_id]);
    const empresa = emp.rows[0]?.razon_social || '';
    const empresaRut = emp.rows[0]?.rut_encrypted ? (formatRut(decrypt(emp.rows[0].rut_encrypted)) || '') : '';
    const nombre = [t.nombres, t.apellido_paterno, t.apellido_materno].filter(Boolean).join(' ').trim();
    const rutClaro = decrypt(t.rut_encrypted);
    const rut = rutClaro ? formatRut(rutClaro) : '—';
    const cargo = t.cargo || 'trabajador(a)';

    let titulo, cuerpo;
    if (tipo === 'renta') {
      const liq = await pool.query(
        `SELECT periodo, total_imponible, total_haberes, liquido_pagar
         FROM rem_liquidacion WHERE trabajador_id = $1 AND estado IN ('aprobada','pagada')
         ORDER BY periodo DESC LIMIT 6`,
        [t.id]
      );
      const filas = liq.rows.map(r =>
        `<tr><td>${periodoLargo(r.periodo)}</td><td class="n">${clpFmt(r.total_imponible)}</td><td class="n">${clpFmt(r.total_haberes)}</td><td class="n">${clpFmt(r.liquido_pagar)}</td></tr>`
      ).join('');
      const prom = liq.rows.length ? Math.round(liq.rows.reduce((s, r) => s + Number(r.liquido_pagar), 0) / liq.rows.length) : 0;
      titulo = 'Certificado de Renta';
      cuerpo = `
        <p>La empresa <b>${esc(empresa)}</b>${empresaRut ? `, RUT ${esc(empresaRut)},` : ''} certifica que
        <b>${esc(nombre)}</b>, RUT <b>${esc(rut)}</b>, registra las siguientes remuneraciones
        en los períodos indicados:</p>
        ${liq.rows.length
          ? `<table><thead><tr><th>Período</th><th class="n">Imponible</th><th class="n">Total haberes</th><th class="n">Líquido</th></tr></thead><tbody>${filas}</tbody></table>
             <p>Promedio de líquido de los últimos ${liq.rows.length} período(s): <b>${clpFmt(prom)}</b>.</p>`
          : `<p><i>El trabajador no registra liquidaciones aprobadas o pagadas a la fecha.</i></p>`}
        <p>Se extiende el presente certificado a solicitud del interesado para los fines que estime convenientes.</p>`;
    } else {
      const desde = t.fecha_ingreso ? periodoLargo(t.fecha_ingreso) : '—';
      const fi = t.fecha_ingreso ? String(t.fecha_ingreso).slice(0, 10).split('-').reverse().join('/') : '—';
      titulo = 'Certificado de Antigüedad Laboral';
      cuerpo = `
        <p>La empresa <b>${esc(empresa)}</b>${empresaRut ? `, RUT ${esc(empresaRut)},` : ''} certifica que
        <b>${esc(nombre)}</b>, RUT <b>${esc(rut)}</b>, presta servicios en esta empresa
        desempeñando el cargo de <b>${esc(cargo)}</b>, desde el <b>${fi}</b> (${esc(desde)})
        ${t.tipo_contrato ? `bajo contrato de tipo <b>${esc(t.tipo_contrato)}</b>` : ''}.</p>
        <p>Se extiende el presente certificado a solicitud del interesado para los fines que estime convenientes.</p>`;
    }
    return res.status(200).json({ html: certificadoHtml(titulo, cuerpo, empresa), nombre, tipo, titulo });
  } catch (e) {
    console.error('❌ getCertificado:', e.message);
    return res.status(500).json({ message: 'Error al generar el certificado' });
  }
};
