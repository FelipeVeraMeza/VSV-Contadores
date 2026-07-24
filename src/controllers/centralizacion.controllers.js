// ============================================================================
// MÓDULO DE REMUNERACIONES — Centralización contable (Fase 4)
//
// Toma las liquidaciones APROBADAS de un período y genera UN comprobante en
// `comprobantes` (+ `comprobantes_detalle`), reutilizando el correlativo por
// empresa del sistema. Idempotente por (empresa, período) vía rem_centralizacion.
//
// Asiento:
//   DEBE  Remuneraciones (gasto)         = Σ haberes
//   DEBE  Aportes patronales (gasto)     = Σ aportes (SIS + AFC empleador + mutual)
//   HABER Líquido por pagar              = Σ líquidos
//   HABER AFP/previsión por pagar        = Σ desc. AFP + SIS
//   HABER Salud por pagar                = Σ desc. salud (7% + 2%)
//   HABER Cesantía por pagar             = Σ cesantía trabajador + AFC empleador
//   HABER Impuesto único por pagar       = Σ impuesto
//   HABER Mutual por pagar               = Σ mutual
//   HABER Otros descuentos por pagar     = Σ otros descuentos
// (Σ debe = Σ haber por construcción; igual se valida antes de contabilizar.)
// ============================================================================
import { pool } from '../database/db.js';
import { siguienteNumeroComprobante } from '../utils/comprobantes.js';

const primerDia = (periodo) => {
  const m = String(periodo || '').match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-01` : null;
};
const ultimoDia = (periodoDate) => {
  const [y, m] = periodoDate.split('-').map(Number);
  const d = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};
const nombrePeriodo = (periodoDate) => {
  const [y, m] = periodoDate.split('-').map(Number);
  return `${String(m).padStart(2, '0')}/${y}`;
};
const round = (v) => Math.round(Number(v) || 0);

const empresaEnOrg = async (req, empresaId) => {
  if (!empresaId) return null;
  const { rows } = await pool.query('SELECT id, organizacion_id FROM empresa WHERE id = $1', [empresaId]);
  const e = rows[0];
  if (!e || (e.organizacion_id || null) !== (req.user?.organizacionId || null)) return null;
  return e;
};

// Agrega el detalle de las liquidaciones aprobadas del período y arma el asiento.
const construirAsiento = async (empresaId, periodoDate) => {
  const [{ rows: det }, { rows: cab }, { rows: cfgRows }] = await Promise.all([
    pool.query(
      `SELECT d.naturaleza, d.codigo, COALESCE(SUM(d.monto),0) AS total
       FROM rem_liquidacion_detalle d
       JOIN rem_liquidacion l ON l.id = d.liquidacion_id
       WHERE l.empresa_id = $1 AND l.periodo = $2 AND l.estado IN ('aprobada','pagada')
       GROUP BY d.naturaleza, d.codigo`,
      [empresaId, periodoDate]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(liquido_pagar),0) AS liquido
       FROM rem_liquidacion
       WHERE empresa_id = $1 AND periodo = $2 AND estado IN ('aprobada','pagada')`,
      [empresaId, periodoDate]
    ),
    pool.query('SELECT * FROM rem_config_empresa WHERE empresa_id = $1', [empresaId]),
  ]);

  const cfg = cfgRows[0] || {};
  const cantidad = cab[0]?.n || 0;

  const suma = (nat, pred) => det.filter(r => r.naturaleza === nat && pred(r.codigo)).reduce((s, r) => s + Number(r.total), 0);
  const H = suma('HABER', () => true);
  const descAfp = suma('DESCUENTO', c => c === '200');
  const descSalud = suma('DESCUENTO', c => c === '201' || c === '202');
  const descCesTrab = suma('DESCUENTO', c => c === 'AFC');
  const descImp = suma('DESCUENTO', c => c === '205');
  const otrosCodes = new Set(['200', '201', '202', 'AFC', '205']);
  const descOtros = suma('DESCUENTO', c => !otrosCodes.has(c));
  const apSis = suma('APORTE', c => c === 'SIS');
  const apAfc = suma('APORTE', c => c === 'AFC-E');
  const apMut = suma('APORTE', c => c === 'MUT');
  const D = descAfp + descSalud + descCesTrab + descImp + descOtros;
  const L = H - D;
  const A = apSis + apAfc + apMut;

  const lineas = [
    { cuenta: cfg.cuenta_sueldos, descripcion: 'Remuneraciones (gasto)', debe: H, haber: 0 },
    { cuenta: cfg.cuenta_aportes, descripcion: 'Aportes patronales (gasto)', debe: A, haber: 0 },
    { cuenta: cfg.cuenta_liquido_pagar, descripcion: 'Líquido por pagar', debe: 0, haber: L },
    { cuenta: cfg.cuenta_afp, descripcion: 'AFP / previsión por pagar', debe: 0, haber: descAfp + apSis },
    { cuenta: cfg.cuenta_salud, descripcion: 'Salud por pagar', debe: 0, haber: descSalud },
    { cuenta: cfg.cuenta_cesantia, descripcion: 'Seguro de cesantía por pagar', debe: 0, haber: descCesTrab + apAfc },
    { cuenta: cfg.cuenta_impuesto, descripcion: 'Impuesto único por pagar', debe: 0, haber: descImp },
    { cuenta: cfg.cuenta_mutual, descripcion: 'Mutual por pagar', debe: 0, haber: apMut },
    { cuenta: cfg.cuenta_otros_desc, descripcion: 'Otros descuentos por pagar', debe: 0, haber: descOtros },
  ].map(l => ({ ...l, debe: round(l.debe), haber: round(l.haber) }))
   .filter(l => l.debe > 0 || l.haber > 0);

  const faltantes = lineas.filter(l => !l.cuenta || !String(l.cuenta).trim()).map(l => l.descripcion);
  const totalDebe = lineas.reduce((s, l) => s + l.debe, 0);
  const totalHaber = lineas.reduce((s, l) => s + l.haber, 0);

  return { cantidad, lineas, faltantes, totalDebe, totalHaber, cuadra: totalDebe === totalHaber };
};

const centralizacionExistente = async (empresaId, periodoDate) => {
  const { rows } = await pool.query(
    `SELECT c.id, c.numero_comprobante, c.comprobante_id, c.total_debe, c.total_haber, c.created_at
     FROM rem_centralizacion c WHERE c.empresa_id = $1 AND c.periodo = $2`,
    [empresaId, periodoDate]
  );
  return rows[0] || null;
};

// ── PREVIEW: arma el asiento sin contabilizar ───────────────────────────────
export const previewCentralizacion = async (req, res) => {
  try {
    const empresaId = req.query.empresaId;
    const periodoDate = primerDia(req.query.periodo);
    if (!periodoDate) return res.status(400).json({ message: 'Período inválido (use YYYY-MM)' });
    const emp = await empresaEnOrg(req, empresaId);
    if (!emp) return res.status(404).json({ message: 'Empresa no encontrada en tu organización' });

    const asiento = await construirAsiento(empresaId, periodoDate);
    const ya = await centralizacionExistente(empresaId, periodoDate);
    return res.status(200).json({
      periodo: periodoDate,
      ...asiento,
      yaCentralizado: ya ? { numero: ya.numero_comprobante, totalDebe: Number(ya.total_debe), fecha: ya.created_at } : null,
    });
  } catch (e) {
    console.error('❌ previewCentralizacion:', e.message);
    return res.status(500).json({ message: 'Error al calcular la centralización' });
  }
};

// ── ESTADO: ¿ya está centralizado el período? ───────────────────────────────
export const getCentralizacion = async (req, res) => {
  try {
    const empresaId = req.query.empresaId;
    const periodoDate = primerDia(req.query.periodo);
    if (!periodoDate) return res.status(400).json({ message: 'Período inválido' });
    const emp = await empresaEnOrg(req, empresaId);
    if (!emp) return res.status(404).json({ message: 'Empresa no encontrada' });
    const ya = await centralizacionExistente(empresaId, periodoDate);
    return res.status(200).json(ya ? { centralizado: true, numero: ya.numero_comprobante, totalDebe: Number(ya.total_debe), fecha: ya.created_at } : { centralizado: false });
  } catch (e) {
    console.error('❌ getCentralizacion:', e.message);
    return res.status(500).json({ message: 'Error al consultar la centralización' });
  }
};

// ── CENTRALIZAR: crea el comprobante contable ───────────────────────────────
export const centralizarPeriodo = async (req, res) => {
  const client = await pool.connect();
  try {
    const empresaId = req.body?.empresaId || req.query.empresaId;
    const periodoDate = primerDia(req.body?.periodo || req.query.periodo);
    if (!periodoDate) return res.status(400).json({ message: 'Período inválido (use YYYY-MM)' });
    const emp = await empresaEnOrg(req, empresaId);
    if (!emp) return res.status(404).json({ message: 'Empresa no encontrada en tu organización' });

    if (await centralizacionExistente(empresaId, periodoDate)) {
      return res.status(409).json({ message: 'Este período ya está centralizado. Reviértelo primero si necesitas rehacerlo.' });
    }
    const asiento = await construirAsiento(empresaId, periodoDate);
    if (asiento.cantidad === 0) return res.status(400).json({ message: 'No hay liquidaciones aprobadas en este período.' });
    if (asiento.faltantes.length) return res.status(400).json({ message: `Faltan cuentas contables por configurar: ${asiento.faltantes.join(', ')}.` });
    if (!asiento.cuadra) return res.status(400).json({ message: `El asiento no cuadra (debe ${asiento.totalDebe} ≠ haber ${asiento.totalHaber}).` });

    await client.query('BEGIN');
    const numero = await siguienteNumeroComprobante(client, empresaId);
    const glosa = `Centralización de remuneraciones ${nombrePeriodo(periodoDate)}`;
    const { rows: [comp] } = await client.query(
      `INSERT INTO comprobantes
         (id, empresa_id, numero_comprobante, fecha, tipo, glosa, estado, clase,
          contabilizado_por, contabilizado_por_id, contabilizado_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'TRASPASO', $4, 'Contabilizado', 'remuneraciones', $5, $6, NOW())
       RETURNING id`,
      [empresaId, numero, ultimoDia(periodoDate), glosa, req.user?.nombre || null, req.user?.usuarioId || null]
    );
    for (const l of asiento.lineas) {
      await client.query(
        `INSERT INTO comprobantes_detalle (id, comprobante_id, cuenta_codigo, rut_asociado, debe, haber)
         VALUES (gen_random_uuid(), $1, $2, NULL, $3, $4)`,
        [comp.id, l.cuenta, l.debe, l.haber]
      );
    }
    await client.query(
      `INSERT INTO rem_centralizacion
         (organizacion_id, empresa_id, periodo, comprobante_id, numero_comprobante, total_debe, total_haber, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [emp.organizacion_id, empresaId, periodoDate, comp.id, numero, asiento.totalDebe, asiento.totalHaber, req.user?.usuarioId || null]
    );
    await client.query('COMMIT');
    return res.status(200).json({ success: true, numero, comprobanteId: comp.id, totalDebe: asiento.totalDebe });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ centralizarPeriodo:', e.message);
    return res.status(500).json({ message: 'Error al centralizar el período' });
  } finally {
    client.release();
  }
};

// ── REVERSAR: elimina el comprobante y libera el período ────────────────────
export const reversarCentralizacion = async (req, res) => {
  const client = await pool.connect();
  try {
    const empresaId = req.body?.empresaId || req.query.empresaId;
    const periodoDate = primerDia(req.body?.periodo || req.query.periodo);
    if (!periodoDate) return res.status(400).json({ message: 'Período inválido' });
    const emp = await empresaEnOrg(req, empresaId);
    if (!emp) return res.status(404).json({ message: 'Empresa no encontrada' });

    const ya = await centralizacionExistente(empresaId, periodoDate);
    if (!ya) return res.status(404).json({ message: 'Este período no está centralizado.' });

    await client.query('BEGIN');
    // Borrar el comprobante arrastra su detalle y la fila de rem_centralizacion (FK ON DELETE CASCADE).
    await client.query('DELETE FROM comprobantes_detalle WHERE comprobante_id = $1', [ya.comprobante_id]);
    await client.query('DELETE FROM comprobantes WHERE id = $1', [ya.comprobante_id]);
    await client.query('DELETE FROM rem_centralizacion WHERE id = $1', [ya.id]);
    await client.query('COMMIT');
    return res.status(200).json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ reversarCentralizacion:', e.message);
    return res.status(500).json({ message: 'Error al reversar la centralización' });
  } finally {
    client.release();
  }
};
