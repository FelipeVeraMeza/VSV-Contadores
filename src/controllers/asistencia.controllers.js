// ============================================================================
// MÓDULO DE REMUNERACIONES — Asistencia (registro de jornada por período)
//
// Resumen mensual por trabajador (días trabajados, ausencias, atrasos, horas
// extra). Registro informativo; no altera la liquidación automáticamente.
// Multi-tenant: todo verifica organizacion_id del usuario. Solo admin.
// ============================================================================
import { pool } from '../database/db.js';

const primerDia = (periodo) => {
  const m = String(periodo || '').match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-01` : null;
};

const cargarTrabajador = async (req, trabajadorId) => {
  if (!trabajadorId) return null;
  const { rows } = await pool.query('SELECT * FROM rem_trabajador WHERE id = $1', [trabajadorId]);
  const t = rows[0];
  if (!t || (t.organizacion_id || null) !== (req.user?.organizacionId || null)) return null;
  return t;
};

const aFila = (r) => ({
  id: r.id, trabajadorId: r.trabajador_id, periodo: r.periodo,
  diasTrabajados: Number(r.dias_trabajados), diasAusente: Number(r.dias_ausente),
  atrasosMin: Number(r.atrasos_min), horasExtra: Number(r.horas_extra), obs: r.obs || '',
});

// Lista la asistencia: por trabajador, o consolidada por empresa/organización.
export const listAsistencia = async (req, res) => {
  try {
    const orgId = req.user?.organizacionId || null;
    if (req.query.trabajadorId) {
      const t = await cargarTrabajador(req, req.query.trabajadorId);
      if (!t) return res.status(404).json({ message: 'Trabajador no encontrado' });
      const { rows } = await pool.query(
        'SELECT * FROM rem_asistencia_periodo WHERE trabajador_id = $1 ORDER BY periodo DESC',
        [t.id]
      );
      return res.status(200).json(rows.map(aFila));
    }
    const empresaId = (req.query.empresaId && req.query.empresaId !== 'undefined') ? req.query.empresaId : null;
    const col = empresaId ? 'a.empresa_id' : 'a.organizacion_id';
    const params = [empresaId || orgId];
    let filtro = '';
    const periodoDate = primerDia(req.query.periodo);
    if (periodoDate) { params.push(periodoDate); filtro = ' AND a.periodo = $2'; }
    const { rows } = await pool.query(
      `SELECT a.*, t.nombres, t.apellido_paterno, t.apellido_materno, e.razon_social AS empresa_nombre
       FROM rem_asistencia_periodo a JOIN rem_trabajador t ON t.id = a.trabajador_id
       LEFT JOIN empresa e ON e.id = a.empresa_id
       WHERE ${col} = $1${filtro}
       ORDER BY a.periodo DESC, t.nombres LIMIT 1000`,
      params
    );
    return res.status(200).json(rows.map(r => ({
      ...aFila(r),
      empleado: [r.nombres, r.apellido_paterno, r.apellido_materno].filter(Boolean).join(' ').trim(),
      empresa: r.empresa_nombre || '',
    })));
  } catch (e) {
    console.error('❌ listAsistencia:', e.message);
    return res.status(500).json({ message: 'Error al listar la asistencia' });
  }
};

// Crea o actualiza el registro de asistencia de un trabajador en el período.
export const upsertAsistencia = async (req, res) => {
  try {
    const b = req.body || {};
    const periodoDate = primerDia(b.periodo);
    if (!periodoDate) return res.status(400).json({ message: 'Período inválido (use YYYY-MM)' });
    const t = await cargarTrabajador(req, b.trabajadorId);
    if (!t) return res.status(404).json({ message: 'Trabajador no encontrado' });

    const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
    const { rows } = await pool.query(
      `INSERT INTO rem_asistencia_periodo
         (organizacion_id, empresa_id, trabajador_id, periodo, dias_trabajados, dias_ausente, atrasos_min, horas_extra, obs, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (trabajador_id, periodo) DO UPDATE SET
         dias_trabajados = EXCLUDED.dias_trabajados, dias_ausente = EXCLUDED.dias_ausente,
         atrasos_min = EXCLUDED.atrasos_min, horas_extra = EXCLUDED.horas_extra,
         obs = EXCLUDED.obs, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [t.organizacion_id, t.empresa_id, t.id, periodoDate,
       Math.min(31, Math.max(0, num(b.diasTrabajados, 30))), Math.max(0, num(b.diasAusente)),
       Math.max(0, Math.round(num(b.atrasosMin))), Math.max(0, num(b.horasExtra)), b.obs || null,
       req.user?.usuarioId || null]
    );
    return res.status(200).json({ success: true, asistencia: aFila(rows[0]) });
  } catch (e) {
    console.error('❌ upsertAsistencia:', e.message);
    return res.status(500).json({ message: 'Error al guardar la asistencia' });
  }
};

export const deleteAsistencia = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.id FROM rem_asistencia_periodo a JOIN rem_trabajador t ON t.id = a.trabajador_id
       WHERE a.id = $1 AND t.organizacion_id IS NOT DISTINCT FROM $2`,
      [req.params.id, req.user?.organizacionId || null]
    );
    if (!rows.length) return res.status(404).json({ message: 'Registro no encontrado' });
    await pool.query('DELETE FROM rem_asistencia_periodo WHERE id = $1', [req.params.id]);
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('❌ deleteAsistencia:', e.message);
    return res.status(500).json({ message: 'Error al eliminar el registro' });
  }
};
