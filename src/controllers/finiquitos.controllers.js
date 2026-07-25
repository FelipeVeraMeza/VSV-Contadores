// ============================================================================
// MÓDULO DE REMUNERACIONES — Vacaciones y Finiquitos (Fase 6)
//
// Vacaciones: saldo = devengado (según antigüedad y zona extrema) − tomadas
//             (ficha + consumos registrados). Registro de consumos.
// Finiquitos: cálculo (vac. proporcionales + indemnizaciones), guardado y
//             consulta. El cálculo vive en src/services/finiquito.service.js.
// ============================================================================
import { pool } from '../database/db.js';
import { calcularFiniquito, CAUSALES, mesesEntre } from '../services/finiquito.service.js';
import { decrypt } from '../utils/crypto.js';
import { formatRut } from '../lib/rut.js';

const primerDia = (d) => { const m = String(d || '').match(/^(\d{4})-(\d{2})/); return m ? `${m[1]}-${m[2]}-01` : null; };
const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const nombreTrab = (t) => [t.nombres, t.apellido_paterno, t.apellido_materno].filter(Boolean).join(' ').trim();

const cargarTrabajador = async (req, id) => {
  const { rows } = await pool.query('SELECT * FROM rem_trabajador WHERE id = $1', [id]);
  const t = rows[0];
  if (!t || (t.organizacion_id || null) !== (req.user?.organizacionId || null)) return null;
  return t;
};

const empresaEnOrg = async (req, empresaId) => {
  if (!empresaId) return null;
  const { rows } = await pool.query('SELECT organizacion_id FROM empresa WHERE id = $1', [empresaId]);
  const e = rows[0];
  if (!e || (e.organizacion_id || null) !== (req.user?.organizacionId || null)) return null;
  return e;
};

// Devengado/tomadas/saldo de un trabajador a una fecha de corte.
const infoVacaciones = (t, consumo, ajuste, corte) => {
  const anoDias = t.vacaciones_zona_extrema ? 20 : 15;
  const meses = mesesEntre(t.fecha_ingreso, corte || new Date());
  const devengado = round2((anoDias / 12) * meses);
  const tomadas = round2(Number(t.dias_vacaciones_tomadas || 0) + Number(consumo || 0));
  const saldo = round2(devengado + Number(ajuste || 0) - tomadas);
  return { devengado, tomadas, saldo, anoDias };
};

// ── Catálogo de causales (para el formulario de finiquito) ──────────────────
export const getCausales = async (_req, res) => res.status(200).json(CAUSALES);

// ============================================================================
// VACACIONES
// ============================================================================
export const getVacaciones = async (req, res) => {
  try {
    const orgId = req.user?.organizacionId || null;
    const empresaId = (req.query.empresaId && req.query.empresaId !== 'undefined') ? req.query.empresaId : null;
    if (empresaId && !(await empresaEnOrg(req, empresaId))) return res.status(404).json({ message: 'Empresa no encontrada en tu organización' });
    const col = empresaId ? 't.empresa_id' : 't.organizacion_id';
    const val = empresaId || orgId;
    const { rows } = await pool.query(
      `SELECT t.id, t.nombres, t.apellido_paterno, t.apellido_materno, t.cargo, t.fecha_ingreso,
              t.dias_vacaciones_tomadas, t.vacaciones_zona_extrema, e.razon_social AS empresa_nombre,
              COALESCE((SELECT SUM(dias) FROM rem_vacaciones v WHERE v.trabajador_id = t.id AND v.tipo='consumo'),0) AS consumo,
              COALESCE((SELECT SUM(dias) FROM rem_vacaciones v WHERE v.trabajador_id = t.id AND v.tipo='ajuste'),0) AS ajuste
       FROM rem_trabajador t LEFT JOIN empresa e ON e.id = t.empresa_id
       WHERE ${col} = $1 AND t.estado_contrato = 'activo'
       ORDER BY t.nombres, t.apellido_paterno LIMIT 1000`,
      [val]
    );
    const filas = rows.map(r => {
      const v = infoVacaciones(r, r.consumo, r.ajuste);
      return {
        id: r.id, empleado: nombreTrab(r), cargo: r.cargo || '—', empresa: r.empresa_nombre || '',
        ingreso: r.fecha_ingreso, zonaExtrema: !!r.vacaciones_zona_extrema,
        devengado: v.devengado, tomadas: v.tomadas, saldo: v.saldo,
      };
    });
    return res.status(200).json(filas);
  } catch (e) {
    console.error('❌ getVacaciones:', e.message);
    return res.status(500).json({ message: 'Error al cargar vacaciones' });
  }
};

export const registrarVacaciones = async (req, res) => {
  try {
    const b = req.body || {};
    const t = await cargarTrabajador(req, b.trabajadorId);
    if (!t) return res.status(404).json({ message: 'Trabajador no encontrado' });
    const dias = Number(b.dias);
    if (!Number.isFinite(dias) || dias === 0) return res.status(400).json({ message: 'Días inválidos' });
    const tipo = b.tipo === 'ajuste' ? 'ajuste' : 'consumo';
    const { rows } = await pool.query(
      `INSERT INTO rem_vacaciones (organizacion_id, empresa_id, trabajador_id, tipo, dias, fecha_desde, fecha_hasta, glosa, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [t.organizacion_id, t.empresa_id, t.id, tipo, dias, b.fechaDesde || null, b.fechaHasta || null, b.glosa || null, req.user?.usuarioId || null]
    );
    return res.status(201).json({ success: true, id: rows[0].id });
  } catch (e) {
    console.error('❌ registrarVacaciones:', e.message);
    return res.status(500).json({ message: 'Error al registrar vacaciones' });
  }
};

export const getVacacionesTrabajador = async (req, res) => {
  try {
    const t = await cargarTrabajador(req, req.params.id);
    if (!t) return res.status(404).json({ message: 'Trabajador no encontrado' });
    const { rows } = await pool.query(
      `SELECT id, tipo, dias, fecha_desde, fecha_hasta, glosa, created_at
       FROM rem_vacaciones WHERE trabajador_id = $1 ORDER BY created_at DESC`,
      [t.id]
    );
    return res.status(200).json(rows);
  } catch (e) {
    console.error('❌ getVacacionesTrabajador:', e.message);
    return res.status(500).json({ message: 'Error al cargar los movimientos' });
  }
};

// ============================================================================
// FINIQUITOS
// ============================================================================
const armarFiniquito = async (req, b) => {
  const t = await cargarTrabajador(req, b.trabajadorId);
  if (!t) return { error: 404 };
  const fechaTermino = String(b.fechaTermino || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaTermino)) return { error: 400, msg: 'Fecha de término inválida' };
  if (!CAUSALES.find(c => c.codigo === b.causal)) return { error: 400, msg: 'Causal inválida' };

  const param = (await pool.query('SELECT uf FROM rem_parametro_previsional WHERE periodo <= $1 ORDER BY periodo DESC LIMIT 1', [primerDia(fechaTermino)])).rows[0];
  const uf = param?.uf || 0;

  const vac = (await pool.query(
    `SELECT COALESCE(SUM(dias) FILTER (WHERE tipo='consumo'),0) consumo, COALESCE(SUM(dias) FILTER (WHERE tipo='ajuste'),0) ajuste
     FROM rem_vacaciones WHERE trabajador_id = $1`, [t.id]
  )).rows[0];
  const info = infoVacaciones(t, vac.consumo, vac.ajuste, fechaTermino);

  const calc = calcularFiniquito({
    trabajador: t, uf, fechaTermino, causal: b.causal, dioAviso: !!b.dioAviso,
    diasVacPendientes: Math.max(0, info.saldo), otrosHaberes: Number(b.otrosHaberes) || 0, descuentos: Number(b.descuentos) || 0,
  });
  return { t, fechaTermino, calc, uf };
};

export const previewFiniquito = async (req, res) => {
  try {
    const r = await armarFiniquito(req, req.body || {});
    if (r.error) return res.status(r.error).json({ message: r.msg || 'Trabajador no encontrado' });
    return res.status(200).json({ trabajador: { id: r.t.id, nombre: nombreTrab(r.t) }, fechaTermino: r.fechaTermino, ...r.calc });
  } catch (e) {
    console.error('❌ previewFiniquito:', e.message);
    return res.status(500).json({ message: 'Error al calcular el finiquito' });
  }
};

export const guardarFiniquito = async (req, res) => {
  try {
    const b = req.body || {};
    const r = await armarFiniquito(req, b);
    if (r.error) return res.status(r.error).json({ message: r.msg || 'Trabajador no encontrado' });
    const c = r.calc;
    const { rows } = await pool.query(
      `INSERT INTO rem_finiquito
         (organizacion_id, empresa_id, trabajador_id, fecha_termino, causal, dio_aviso,
          meses_servicio, anos_servicio, dias_vac_pendientes, vac_proporcional, indem_anos, indem_aviso,
          otros_haberes, descuentos, total, snapshot, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [r.t.organizacion_id, r.t.empresa_id, r.t.id, r.fechaTermino, b.causal, !!b.dioAviso,
       c.mesesServicio, c.anosServicio, c.diasVacPendientes, c.vacProporcional, c.indemAnos, c.indemAviso,
       c.otrosHaberes, c.descuentos, c.total, JSON.stringify(c), req.user?.usuarioId || null]
    );
    return res.status(200).json({ success: true, id: rows[0].id, total: c.total });
  } catch (e) {
    console.error('❌ guardarFiniquito:', e.message);
    return res.status(500).json({ message: 'Error al guardar el finiquito' });
  }
};

export const listFiniquitos = async (req, res) => {
  try {
    const orgId = req.user?.organizacionId || null;
    const empresaId = (req.query.empresaId && req.query.empresaId !== 'undefined') ? req.query.empresaId : null;
    if (empresaId && !(await empresaEnOrg(req, empresaId))) return res.status(404).json({ message: 'Empresa no encontrada' });
    const col = empresaId ? 'f.empresa_id' : 'f.organizacion_id';
    const val = empresaId || orgId;
    const { rows } = await pool.query(
      `SELECT f.id, f.fecha_termino, f.causal, f.total, f.estado, f.created_at,
              t.nombres, t.apellido_paterno, t.apellido_materno, t.cargo, e.razon_social AS empresa_nombre
       FROM rem_finiquito f JOIN rem_trabajador t ON t.id = f.trabajador_id
       LEFT JOIN empresa e ON e.id = f.empresa_id
       WHERE ${col} = $1 ORDER BY f.created_at DESC LIMIT 500`,
      [val]
    );
    return res.status(200).json(rows.map(r => ({
      id: r.id, fechaTermino: r.fecha_termino, causal: r.causal,
      causalLabel: CAUSALES.find(c => c.codigo === r.causal)?.label || r.causal,
      empleado: nombreTrab(r), cargo: r.cargo || '—', empresa: r.empresa_nombre || '',
      total: Number(r.total), estado: r.estado,
    })));
  } catch (e) {
    console.error('❌ listFiniquitos:', e.message);
    return res.status(500).json({ message: 'Error al listar finiquitos' });
  }
};

export const getFiniquito = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT f.*, t.nombres, t.apellido_paterno, t.apellido_materno, t.cargo, t.rut_encrypted, t.fecha_ingreso, e.razon_social AS empresa_nombre
       FROM rem_finiquito f JOIN rem_trabajador t ON t.id = f.trabajador_id
       LEFT JOIN empresa e ON e.id = f.empresa_id WHERE f.id = $1`,
      [req.params.id]
    );
    const f = rows[0];
    if (!f || (f.organizacion_id || null) !== (req.user?.organizacionId || null)) return res.status(404).json({ message: 'Finiquito no encontrado' });
    const rutClaro = decrypt(f.rut_encrypted);
    return res.status(200).json({
      id: f.id, estado: f.estado, fechaTermino: f.fecha_termino, causal: f.causal,
      causalLabel: CAUSALES.find(c => c.codigo === f.causal)?.label || f.causal, dioAviso: f.dio_aviso,
      empleado: nombreTrab(f), cargo: f.cargo, empresa: f.empresa_nombre || '',
      rut: rutClaro ? formatRut(rutClaro) : '—', fechaIngreso: f.fecha_ingreso,
      ...(f.snapshot || {}),
    });
  } catch (e) {
    console.error('❌ getFiniquito:', e.message);
    return res.status(500).json({ message: 'Error al obtener el finiquito' });
  }
};
