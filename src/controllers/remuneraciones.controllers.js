// ============================================================================
// MÓDULO DE REMUNERACIONES — Controlador (Fase 1: ficha de trabajadores)
//
// Reemplaza la maqueta de rrhh.controllers.js con datos reales sobre las
// tablas rem_* (ver migración 2026-07-23_remuneraciones_fase0.sql).
//
// Reglas transversales:
//   • Multi-tenant: todo filtra por organizacion_id (del usuario) y empresa_id.
//     Ningún actor accede a datos fuera de su organización.
//   • RUT cifrado con el mismo esquema del sistema (encrypt + generateHash).
//   • Fase 1 = solo admin (las rutas montan requireAdmin).
// ============================================================================
import { pool } from '../database/db.js';
import { encrypt, decrypt, generateHash } from '../utils/crypto.js';
import { cleanRut, formatRut } from '../lib/rut.js';
import { empresaPermitida, empresasVisibles } from '../utils/scope.js';

const esAdmin = (req) => req.user?.rol === 'Administrador';

// Verifica que la empresa exista, pertenezca a la organización del usuario y —si
// el usuario solo ve lo asignado— que la tenga en `audita`.
//
// Esta función vivía acá y comprobaba SOLO la organización. Como quien entra al
// equipo desde cero está en la misma organización que todos, siempre pasaba: el
// 19-08-2026 se midió que podía pedir los trabajadores y los indicadores de
// sueldos de cualquier empresa de la oficina y el servidor respondía 200. Le
// faltaba una condición, no una reescritura.
//
// Ahora vive en `utils/scope.js` y la comparten Contabilidad y Remuneraciones,
// para que la regla no vuelva a existir en dos versiones distintas.
// (El import está arriba, junto a los demás.)

// Normaliza un valor contra una lista de opciones permitidas (o null).
const enumOrNull = (val, permitidos) => {
  if (val == null) return null;
  const v = String(val).trim().toLowerCase();
  return permitidos.includes(v) ? v : null;
};

const numOrNull = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const boolOr = (v, def = false) => (typeof v === 'boolean' ? v : def);

const nombreCompleto = (t) =>
  [t.nombres, t.apellido_paterno, t.apellido_materno].filter(Boolean).join(' ').trim();

const rutLegible = (rutEncrypted) => {
  const claro = decrypt(rutEncrypted);
  return claro ? formatRut(claro) : null;
};

// Resumen para el listado (columnas de la tabla del frontend).
const CONTRATO_LABEL = { indefinido: 'Indefinido', plazo_fijo: 'Plazo Fijo', por_obra: 'Obra o Faena' };
const aResumen = (t) => ({
  id: t.id,
  nombre: nombreCompleto(t),
  rut: rutLegible(t.rut_encrypted),
  email: t.email || '',
  cargo: t.cargo || '—',
  departamento: t.departamento || '—',
  tipoContrato: t.tipo_contrato || null,
  tipoContratoLabel: CONTRATO_LABEL[t.tipo_contrato] || '—',
  fechaIngreso: t.fecha_ingreso || null,
  estado: t.estado_contrato === 'activo' ? 'Activo' : 'Inactivo',
});

// ── Mapea el payload (camelCase) a columnas de rem_trabajador ────────────────
const CONTRATOS = ['plazo_fijo', 'indefinido', 'por_obra'];
const CIVILES = ['soltero', 'casado', 'divorciado', 'viudo', 'conviviente', 'separado'];
const SUELDOS = ['mes', 'mes_comision', 'empresarial', 'horas', 'horas_horas', 'dias'];
const GRATIF = ['no', 'porcentaje', 'tope_475'];
const PAGOS = ['efectivo', 'transferencia', 'cheque', 'otro'];

// Normaliza el tipo de contrato aceptando etiquetas de la UI ("Plazo Fijo").
const normContrato = (v) => {
  const map = {
    'indefinido': 'indefinido',
    'plazo fijo': 'plazo_fijo', 'plazo_fijo': 'plazo_fijo',
    'obra o faena': 'por_obra', 'por_obra': 'por_obra', 'obra': 'por_obra',
  };
  return map[String(v || '').trim().toLowerCase()] || null;
};

// Normaliza 'YYYY-MM' o 'YYYY-MM-DD' → primer día del mes.
const primerDia = (periodo) => {
  const m = String(periodo || '').match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-01` : null;
};

// ============================================================================
// MÉTRICAS REALES DEL MÓDULO (dashboard RRHH)
// ============================================================================
export const getMetrics = async (req, res) => {
  try {
    const { empresaId } = req.query;
    const empresa = await empresaPermitida(req, empresaId);
    if (!empresa) return res.status(404).json({ message: 'Empresa no encontrada en tu organización' });

    const { rows } = await pool.query(
      `SELECT
         count(*) FILTER (WHERE estado_contrato = 'activo')                                        AS activos,
         COALESCE(SUM(sueldo_base) FILTER (WHERE estado_contrato = 'activo'), 0)                    AS masa,
         count(*) FILTER (WHERE date_trunc('month', fecha_ingreso) = date_trunc('month', CURRENT_DATE)) AS nuevos,
         count(*) FILTER (WHERE date_trunc('month', fecha_termino) = date_trunc('month', CURRENT_DATE)) AS finiquitos
       FROM rem_trabajador WHERE empresa_id = $1`,
      [empresaId]
    );
    const r = rows[0];
    return res.status(200).json({
      totalEmpleados: Number(r.activos),
      masaSalarial: Number(r.masa),
      nuevosContratos: Number(r.nuevos),
      finiquitos: Number(r.finiquitos),
      variacionEmpleados: Number(r.nuevos) ? `+${r.nuevos}` : '+0',
      variacionMasa: 'este mes',
    });
  } catch (error) {
    console.error('❌ getMetrics:', error.message);
    return res.status(500).json({ message: 'Error al cargar métricas de remuneraciones' });
  }
};

// ============================================================================
// DASHBOARD AGREGADO (KPIs, estado, resumen, alertas, evolución, actividad)
// ============================================================================
export const getDashboard = async (req, res) => {
  try {
    const orgId = req.user?.organizacionId || null;
    const empresaId = (req.query.empresaId && req.query.empresaId !== 'undefined') ? req.query.empresaId : null;
    const periodoDate = primerDia(req.query.periodo) || primerDia(new Date().toISOString());
    // Con empresa: vista de una empresa. Sin empresa: consolidado de toda la organización.
    if (empresaId) {
      const empresa = await empresaPermitida(req, empresaId);
      if (!empresa) return res.status(404).json({ message: 'Empresa no encontrada en tu organización' });
    }
    const col = empresaId ? 'empresa_id' : 'organizacion_id';
    const val = empresaId || orgId;

    const [trab, liqEstado, cot, evol, act] = await Promise.all([
      pool.query(
        `SELECT
           count(*) FILTER (WHERE estado_contrato='activo')::int AS activos,
           count(*) FILTER (WHERE date_trunc('month',fecha_ingreso)=date_trunc('month',$2::date))::int AS nuevos,
           count(*) FILTER (WHERE afp_id IS NULL AND estado_contrato='activo')::int AS sin_afp,
           count(*) FILTER (WHERE salud_id IS NULL AND estado_contrato='activo')::int AS sin_salud,
           count(*) FILTER (WHERE tipo_pago='transferencia' AND (numero_cuenta IS NULL OR numero_cuenta='') AND estado_contrato='activo')::int AS sin_cuenta,
           count(*) FILTER (WHERE date_trunc('month',fecha_termino)=date_trunc('month',$2::date))::int AS contratos_vencen
         FROM rem_trabajador WHERE ${col}=$1`,
        [val, periodoDate]
      ),
      pool.query(
        `SELECT estado, count(*)::int n, COALESCE(SUM(liquido_pagar),0) liquido,
                COALESCE(SUM(total_haberes),0) haberes, COALESCE(SUM(total_descuentos),0) descuentos
         FROM rem_liquidacion WHERE ${col}=$1 AND periodo=$2 GROUP BY estado`,
        [val, periodoDate]
      ),
      pool.query(
        `SELECT COALESCE(SUM(d.monto),0) cotizaciones
         FROM rem_liquidacion_detalle d JOIN rem_liquidacion l ON l.id=d.liquidacion_id
         WHERE l.${col}=$1 AND l.periodo=$2 AND d.naturaleza='DESCUENTO' AND d.codigo IN ('200','201','202','AFC')`,
        [val, periodoDate]
      ),
      pool.query(
        `SELECT to_char(periodo,'YYYY-MM') mes, COALESCE(SUM(liquido_pagar),0) liquido
         FROM rem_liquidacion
         WHERE ${col}=$1 AND periodo > (date_trunc('month',$2::date) - interval '11 months') AND periodo <= date_trunc('month',$2::date)
         GROUP BY periodo ORDER BY periodo`,
        [val, periodoDate]
      ),
      pool.query(
        `(SELECT 'trabajador' tipo, TRIM(COALESCE(nombres,'')||' '||COALESCE(apellido_paterno,'')) texto, COALESCE(cargo,'') detalle, created_at fecha
            FROM rem_trabajador WHERE ${col}=$1 ORDER BY created_at DESC LIMIT 5)
         UNION ALL
         (SELECT 'centralizacion' tipo, 'Centralización N° '||numero_comprobante texto, to_char(periodo,'MM/YYYY') detalle, created_at fecha
            FROM rem_centralizacion WHERE ${col}=$1 ORDER BY created_at DESC LIMIT 5)
         UNION ALL
         (SELECT 'liquidacion' tipo, 'Liquidación de '||TRIM(t.nombres||' '||COALESCE(t.apellido_paterno,''))||' — '||l.estado texto, to_char(l.periodo,'MM/YYYY') detalle, l.updated_at fecha
            FROM rem_liquidacion l JOIN rem_trabajador t ON t.id=l.trabajador_id
            WHERE l.${col}=$1 AND l.estado IN ('aprobada','pagada') ORDER BY l.updated_at DESC LIMIT 5)
         ORDER BY fecha DESC LIMIT 8`,
        [val]
      ),
    ]);

    const t = trab.rows[0];
    const est = { borrador: 0, revisada: 0, aprobada: 0, pagada: 0, anulada: 0 };
    let totalLiq = 0, liquidoPeriodo = 0, haberes = 0, descuentos = 0;
    for (const r of liqEstado.rows) {
      est[r.estado] = r.n;
      totalLiq += r.n;
      liquidoPeriodo += Number(r.liquido);
      haberes += Number(r.haberes);
      descuentos += Number(r.descuentos);
    }
    const aprobadas = est.aprobada + est.pagada;
    const pendientes = est.borrador + est.revisada;
    const baseLiq = totalLiq || 1;

    // Evolución: rellenar 12 meses
    const [yy, mm] = periodoDate.split('-').map(Number);
    const meses = [];
    for (let i = 11; i >= 0; i--) { const d = new Date(yy, mm - 1 - i, 1); meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
    const evMap = new Map(evol.rows.map(r => [r.mes, Number(r.liquido)]));
    const evolucion = meses.map(m => ({ mes: m, liquido: evMap.get(m) || 0 }));
    const cur = evolucion[11].liquido, prev = evolucion[10].liquido;
    const liquidoVarPct = prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : 0;

    return res.status(200).json({
      periodo: periodoDate,
      consolidado: !empresaId,
      kpis: {
        activos: t.activos, nuevos: t.nuevos,
        liquidoPeriodo, liquidoVarPct,
        aprobadas, totalTrabajadores: t.activos, pendientes,
        aprobadasPct: t.activos ? Math.round((aprobadas / t.activos) * 100) : 0,
        pendientesPct: totalLiq ? Math.round((pendientes / totalLiq) * 1000) / 10 : 0,
      },
      estado: {
        borrador: est.borrador, revisada: est.revisada, aprobada: est.aprobada, pagada: est.pagada,
        total: totalLiq, progresoPct: Math.round((aprobadas / baseLiq) * 100),
      },
      resumen: { haberes, descuentos, cotizaciones: Number(cot.rows[0].cotizaciones), liquido: liquidoPeriodo },
      alertas: { sinAfp: t.sin_afp, sinSalud: t.sin_salud, sinCuenta: t.sin_cuenta, contratosVencen: t.contratos_vencen, sinAprobar: pendientes },
      evolucion,
      actividad: act.rows.map(a => ({ tipo: a.tipo, texto: a.texto, detalle: a.detalle, fecha: a.fecha })),
    });
  } catch (e) {
    console.error('❌ getDashboard:', e.message);
    return res.status(500).json({ message: 'Error al cargar el dashboard' });
  }
};

// ============================================================================
// INDICADORES PREVISIONALES (parámetros del período) — editables
// ============================================================================
// GET /rrhh/parametros?periodo=YYYY-MM → el del período exacto o el último ≤.
export const getParametros = async (req, res) => {
  try {
    const periodoDate = primerDia(req.query.periodo) || primerDia(new Date().toISOString());
    const exacto = await pool.query('SELECT * FROM rem_parametro_previsional WHERE periodo = $1', [periodoDate]);
    if (exacto.rows[0]) {
      return res.status(200).json({ parametro: exacto.rows[0], esDelPeriodo: true });
    }
    const previo = await pool.query(
      'SELECT * FROM rem_parametro_previsional WHERE periodo <= $1 ORDER BY periodo DESC LIMIT 1', [periodoDate]
    );
    return res.status(200).json({
      parametro: previo.rows[0] ? { ...previo.rows[0], periodo: periodoDate } : { periodo: periodoDate },
      esDelPeriodo: false,
    });
  } catch (error) {
    console.error('❌ getParametros:', error.message);
    return res.status(500).json({ message: 'Error al cargar los indicadores' });
  }
};

// PUT /rrhh/parametros → upsert de los indicadores de un período.
export const upsertParametros = async (req, res) => {
  try {
    const b = req.body || {};
    const periodoDate = primerDia(b.periodo);
    if (!periodoDate) return res.status(400).json({ message: 'Período inválido (use YYYY-MM)' });
    const { rows } = await pool.query(
      `INSERT INTO rem_parametro_previsional
         (periodo, uf, utm, uta, sueldo_minimo, tope_imponible_afp_uf, tope_imponible_cesantia_uf,
          tasa_sis, tasa_cesantia_trabajador, tasa_cesantia_empleador_indef, tasa_cesantia_empleador_plazo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (periodo) DO UPDATE SET
         uf = EXCLUDED.uf, utm = EXCLUDED.utm, uta = EXCLUDED.uta, sueldo_minimo = EXCLUDED.sueldo_minimo,
         tope_imponible_afp_uf = EXCLUDED.tope_imponible_afp_uf, tope_imponible_cesantia_uf = EXCLUDED.tope_imponible_cesantia_uf,
         tasa_sis = EXCLUDED.tasa_sis, tasa_cesantia_trabajador = EXCLUDED.tasa_cesantia_trabajador,
         tasa_cesantia_empleador_indef = EXCLUDED.tasa_cesantia_empleador_indef,
         tasa_cesantia_empleador_plazo = EXCLUDED.tasa_cesantia_empleador_plazo
       RETURNING *`,
      [periodoDate, numOrNull(b.uf), numOrNull(b.utm), numOrNull(b.uta), numOrNull(b.sueldoMinimo),
       numOrNull(b.topeImponibleAfpUf), numOrNull(b.topeImponibleCesantiaUf), numOrNull(b.tasaSis),
       numOrNull(b.tasaCesantiaTrabajador), numOrNull(b.tasaCesantiaEmpleadorIndef), numOrNull(b.tasaCesantiaEmpleadorPlazo)]
    );
    return res.status(200).json({ success: true, parametro: rows[0] });
  } catch (error) {
    console.error('❌ upsertParametros:', error.message);
    return res.status(500).json({ message: 'Error al guardar los indicadores' });
  }
};

// PUT /rrhh/afp/:id → actualiza la comisión de administración de una AFP.
export const updateAfpComision = async (req, res) => {
  try {
    const { id } = req.params;
    const tasa = numOrNull(req.body?.tasaComision);
    if (tasa == null) return res.status(400).json({ message: 'Comisión inválida' });
    const { rowCount } = await pool.query('UPDATE rem_afp SET tasa_comision = $1 WHERE id = $2', [tasa, id]);
    if (!rowCount) return res.status(404).json({ message: 'AFP no encontrada' });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ updateAfpComision:', error.message);
    return res.status(500).json({ message: 'Error al actualizar la AFP' });
  }
};

// ============================================================================
// CONFIGURACIÓN CONTABLE POR EMPRESA (mapeo de cuentas) + plan de cuentas
// ============================================================================
export const getConfigEmpresa = async (req, res) => {
  try {
    const { empresaId } = req.query;
    const empresa = await empresaPermitida(req, empresaId);
    if (!empresa) return res.status(404).json({ message: 'Empresa no encontrada en tu organización' });
    const { rows } = await pool.query('SELECT * FROM rem_config_empresa WHERE empresa_id = $1', [empresaId]);
    return res.status(200).json(rows[0] || { empresa_id: empresaId });
  } catch (e) {
    console.error('❌ getConfigEmpresa:', e.message);
    return res.status(500).json({ message: 'Error al cargar la configuración' });
  }
};

export const updateConfigEmpresa = async (req, res) => {
  try {
    const b = req.body || {};
    const { empresaId } = { empresaId: b.empresaId || req.query.empresaId };
    const empresa = await empresaPermitida(req, empresaId);
    if (!empresa) return res.status(404).json({ message: 'Empresa no encontrada en tu organización' });

    // Merge parcial: se guarda por secciones (Mutual, Mapeo, Empresa…), así que
    // solo se pisan los campos ENVIADOS; el resto conserva su valor actual.
    const prev = (await pool.query('SELECT * FROM rem_config_empresa WHERE empresa_id = $1', [empresaId])).rows[0] || {};
    const pick = (bodyKey, col, fallback = null) => (b[bodyKey] !== undefined ? b[bodyKey] : (prev[col] ?? fallback));
    const pickNum = (bodyKey, col) => (b[bodyKey] !== undefined ? (numOrNull(b[bodyKey]) || 0) : (prev[col] ?? 0));

    const v = {
      mutual: pick('mutual', 'mutual'),
      tasa_mutual: pickNum('tasaMutual', 'tasa_mutual'),
      moneda: pick('moneda', 'moneda', 'CLP') || 'CLP',
      gratificacion_default: pick('gratificacionDefault', 'gratificacion_default', 'tope_475') || 'tope_475',
      cuenta_sueldos: pick('cuentaSueldos', 'cuenta_sueldos'),
      cuenta_aportes: pick('cuentaAportes', 'cuenta_aportes'),
      cuenta_liquido_pagar: pick('cuentaLiquidoPagar', 'cuenta_liquido_pagar'),
      cuenta_afp: pick('cuentaAfp', 'cuenta_afp'),
      cuenta_salud: pick('cuentaSalud', 'cuenta_salud'),
      cuenta_cesantia: pick('cuentaCesantia', 'cuenta_cesantia'),
      cuenta_impuesto: pick('cuentaImpuesto', 'cuenta_impuesto'),
      cuenta_mutual: pick('cuentaMutual', 'cuenta_mutual'),
      cuenta_otros_desc: pick('cuentaOtrosDesc', 'cuenta_otros_desc'),
    };

    const { rows } = await pool.query(
      `INSERT INTO rem_config_empresa
         (empresa_id, organizacion_id, mutual, tasa_mutual, moneda, gratificacion_default,
          cuenta_sueldos, cuenta_aportes, cuenta_liquido_pagar, cuenta_afp, cuenta_salud,
          cuenta_cesantia, cuenta_impuesto, cuenta_mutual, cuenta_otros_desc)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (empresa_id) DO UPDATE SET
         mutual = EXCLUDED.mutual, tasa_mutual = EXCLUDED.tasa_mutual, moneda = EXCLUDED.moneda,
         gratificacion_default = EXCLUDED.gratificacion_default,
         cuenta_sueldos = EXCLUDED.cuenta_sueldos, cuenta_aportes = EXCLUDED.cuenta_aportes,
         cuenta_liquido_pagar = EXCLUDED.cuenta_liquido_pagar, cuenta_afp = EXCLUDED.cuenta_afp,
         cuenta_salud = EXCLUDED.cuenta_salud, cuenta_cesantia = EXCLUDED.cuenta_cesantia,
         cuenta_impuesto = EXCLUDED.cuenta_impuesto, cuenta_mutual = EXCLUDED.cuenta_mutual,
         cuenta_otros_desc = EXCLUDED.cuenta_otros_desc, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [empresaId, empresa.organizacion_id, v.mutual, v.tasa_mutual, v.moneda, v.gratificacion_default,
       v.cuenta_sueldos, v.cuenta_aportes, v.cuenta_liquido_pagar, v.cuenta_afp, v.cuenta_salud,
       v.cuenta_cesantia, v.cuenta_impuesto, v.cuenta_mutual, v.cuenta_otros_desc]
    );
    return res.status(200).json({ success: true, config: rows[0] });
  } catch (e) {
    console.error('❌ updateConfigEmpresa:', e.message);
    return res.status(500).json({ message: 'Error al guardar la configuración' });
  }
};

export const getPlanCuentas = async (req, res) => {
  try {
    const { empresaId } = req.query;
    const empresa = await empresaPermitida(req, empresaId);
    if (!empresa) return res.status(404).json({ message: 'Empresa no encontrada en tu organización' });
    const { rows } = await pool.query(
      'SELECT codigo, descripcion, tipo_cuenta FROM plan_cuentas WHERE empresa_id = $1 ORDER BY codigo',
      [empresaId]
    );
    return res.status(200).json(rows);
  } catch (e) {
    console.error('❌ getPlanCuentas:', e.message);
    return res.status(500).json({ message: 'Error al cargar el plan de cuentas' });
  }
};

// ============================================================================
// CATÁLOGOS (para poblar los selects del formulario)
// ============================================================================
export const getCatalogos = async (req, res) => {
  try {
    const orgId = req.user?.organizacionId || null;
    const [afp, salud, conceptos, parametro] = await Promise.all([
      pool.query('SELECT id, nombre, tasa_comision FROM rem_afp WHERE activo ORDER BY nombre'),
      pool.query('SELECT id, nombre, tipo FROM rem_salud WHERE activo ORDER BY tipo DESC, nombre'),
      pool.query(
        `SELECT id, codigo, descripcion, naturaleza, imponible, tributable,
                afecta_gratificacion, obsoleto, activo
         FROM rem_concepto
         WHERE activo AND (organizacion_id IS NULL OR organizacion_id = $1)
         ORDER BY naturaleza, codigo`,
        [orgId]
      ),
      pool.query('SELECT * FROM rem_parametro_previsional ORDER BY periodo DESC LIMIT 1'),
    ]);
    return res.status(200).json({
      afp: afp.rows,
      salud: salud.rows,
      conceptos: conceptos.rows,
      parametro: parametro.rows[0] || null,
    });
  } catch (error) {
    console.error('❌ getCatalogos:', error.message);
    return res.status(500).json({ message: 'Error al cargar catálogos de remuneraciones' });
  }
};

// ============================================================================
// LISTAR TRABAJADORES
// ============================================================================
export const listTrabajadores = async (req, res) => {
  try {
    const orgId = req.user?.organizacionId || null;
    const empresaId = (req.query.empresaId && req.query.empresaId !== 'undefined') ? req.query.empresaId : null;
    if (empresaId) {
      const empresa = await empresaPermitida(req, empresaId);
      if (!empresa) return res.status(404).json({ message: 'Empresa no encontrada en tu organización' });
    }
    // Sin empresa elegida se lista toda la organización. Para quien solo ve lo
    // asignado, eso serían los trabajadores de las 99 empresas de la oficina: se
    // acota a las suyas, y si no tiene ninguna, la lista va vacía.
    let cond, val;
    if (empresaId) {
      cond = 't.empresa_id = $1'; val = empresaId;
    } else {
      const visibles = await empresasVisibles(req);
      if (visibles) {
        if (!visibles.length) return res.status(200).json([]);
        cond = 't.empresa_id = ANY($1::uuid[])'; val = visibles;
      } else {
        cond = 't.organizacion_id = $1'; val = orgId;
      }
    }
    const { rows } = await pool.query(
      `SELECT t.*, e.razon_social AS empresa_nombre
       FROM rem_trabajador t LEFT JOIN empresa e ON e.id = t.empresa_id
       WHERE ${cond}
       ORDER BY t.estado_contrato ASC, t.created_at DESC
       LIMIT 1000`,
      [val]
    );
    return res.status(200).json(rows.map(r => ({ ...aResumen(r), empresa: r.empresa_nombre || '' })));
  } catch (error) {
    console.error('❌ listTrabajadores:', error.message);
    return res.status(500).json({ message: 'Error al listar trabajadores' });
  }
};

// ============================================================================
// OBTENER UN TRABAJADOR (ficha completa)
// ============================================================================
export const getTrabajador = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM rem_trabajador WHERE id = $1', [id]);
    const t = rows[0];
    if (!t || (t.organizacion_id || null) !== (req.user?.organizacionId || null)) {
      return res.status(404).json({ message: 'Trabajador no encontrado' });
    }
    // Reemplaza el RUT cifrado por el legible antes de responder.
    const { rut_encrypted, rut_hash, ...resto } = t;
    return res.status(200).json({ ...resto, rut: rutLegible(rut_encrypted) });
  } catch (error) {
    console.error('❌ getTrabajador:', error.message);
    return res.status(500).json({ message: 'Error al obtener el trabajador' });
  }
};

// ============================================================================
// CREAR TRABAJADOR
// ============================================================================
export const createTrabajador = async (req, res) => {
  try {
    const b = req.body || {};
    const empresaId = b.empresaId || req.query.empresaId || req.user?.empresaId;

    const empresa = await empresaPermitida(req, empresaId);
    if (!empresa) return res.status(404).json({ message: 'Empresa no encontrada en tu organización' });

    if (!b.nombres || !String(b.nombres).trim()) {
      return res.status(400).json({ message: 'El nombre del trabajador es obligatorio' });
    }
    if (!b.rut || !String(b.rut).trim()) {
      return res.status(400).json({ message: 'El RUT del trabajador es obligatorio' });
    }

    const rutClaro = cleanRut(b.rut);
    const rutHash = generateHash(rutClaro);
    const rutEnc = encrypt(rutClaro);

    // Un RUT no se repite dentro de la misma empresa.
    const dup = await pool.query(
      'SELECT id FROM rem_trabajador WHERE empresa_id = $1 AND rut_hash = $2',
      [empresaId, rutHash]
    );
    if (dup.rows.length) {
      return res.status(409).json({ message: 'Ya existe un trabajador con ese RUT en esta empresa' });
    }

    const { rows } = await pool.query(
      `INSERT INTO rem_trabajador (
         organizacion_id, empresa_id, persona_id,
         nombres, apellido_paterno, apellido_materno, rut_encrypted, rut_hash,
         fecha_nacimiento, estado_civil, direccion, comuna, telefono, email, discapacidad,
         salud_id, plan_isapre_monto, plan_isapre_moneda, afp_id,
         fecha_ingreso, fecha_termino, tipo_contrato, estado_contrato, departamento, cargo,
         ajuste_ley_20281, semana_corrida, cargo_excepcional_ley_21561,
         tipo_sueldo_base, sueldo_base, zona_extrema_pct, gratificacion_tipo, gratificacion_pct,
         asignacion_familiar_tramo, cargas_normales, cargas_maternales, cargas_invalidas,
         jubilado, afecto_seguro_accidentes, seguro_cesantia, apv_individual, apv_colectivo,
         tipo_pago, banco, tipo_cuenta, numero_cuenta, creado_por
       ) VALUES (
         $1,$2,$3,
         $4,$5,$6,$7,$8,
         $9,$10,$11,$12,$13,$14,$15,
         $16,$17,$18,$19,
         $20,$21,$22,$23,$24,$25,
         $26,$27,$28,
         $29,$30,$31,$32,$33,
         $34,$35,$36,$37,
         $38,$39,$40,$41,$42,
         $43,$44,$45,$46,$47
       ) RETURNING *`,
      [
        empresa.organizacion_id, empresaId, b.personaId || null,
        String(b.nombres).trim(), b.apellidoPaterno || null, b.apellidoMaterno || null, rutEnc, rutHash,
        b.fechaNacimiento || null, enumOrNull(b.estadoCivil, CIVILES), b.direccion || null,
        b.comuna || null, b.telefono || null, b.email || null, boolOr(b.discapacidad),
        b.saludId || null, numOrNull(b.planIsapreMonto), (enumOrNull(b.planIsapreMoneda, ['uf', 'clp']) || 'uf').toUpperCase(), b.afpId || null,
        b.fechaIngreso || null, b.fechaTermino || null, normContrato(b.tipoContrato),
        enumOrNull(b.estadoContrato, ['activo', 'inactivo']) || 'activo', b.departamento || null, b.cargo || null,
        boolOr(b.ajusteLey20281), boolOr(b.semanaCorrida), boolOr(b.cargoExcepcionalLey21561),
        enumOrNull(b.tipoSueldoBase, SUELDOS) || 'mes', numOrNull(b.sueldoBase) || 0, numOrNull(b.zonaExtremaPct) || 0,
        enumOrNull(b.gratificacionTipo, GRATIF) || 'no', numOrNull(b.gratificacionPct),
        b.asignacionFamiliarTramo || null, numOrNull(b.cargasNormales) || 0, numOrNull(b.cargasMaternales) || 0, numOrNull(b.cargasInvalidas) || 0,
        boolOr(b.jubilado), boolOr(b.afectoSeguroAccidentes, true), boolOr(b.seguroCesantia, true), boolOr(b.apvIndividual), boolOr(b.apvColectivo),
        enumOrNull(b.tipoPago, PAGOS), b.banco || null, b.tipoCuenta || null, b.numeroCuenta || null,
        req.user?.usuarioId || null,
      ]
    );
    return res.status(201).json({ success: true, trabajador: aResumen(rows[0]) });
  } catch (error) {
    console.error('❌ createTrabajador:', error.message);
    return res.status(500).json({ message: 'Error al registrar el trabajador' });
  }
};

// ============================================================================
// ACTUALIZAR TRABAJADOR (con historial de cambios)
// ============================================================================
// Campos editables → columna. Se registra en historial cada cambio real.
const EDITABLES = {
  nombres: 'nombres', apellidoPaterno: 'apellido_paterno', apellidoMaterno: 'apellido_materno',
  fechaNacimiento: 'fecha_nacimiento', estadoCivil: 'estado_civil', direccion: 'direccion',
  comuna: 'comuna', telefono: 'telefono', email: 'email', discapacidad: 'discapacidad',
  saludId: 'salud_id', planIsapreMonto: 'plan_isapre_monto', planIsapreMoneda: 'plan_isapre_moneda',
  afpId: 'afp_id', fechaIngreso: 'fecha_ingreso', fechaTermino: 'fecha_termino',
  tipoContrato: 'tipo_contrato', estadoContrato: 'estado_contrato', departamento: 'departamento', cargo: 'cargo',
  ajusteLey20281: 'ajuste_ley_20281', semanaCorrida: 'semana_corrida', cargoExcepcionalLey21561: 'cargo_excepcional_ley_21561',
  tipoSueldoBase: 'tipo_sueldo_base', sueldoBase: 'sueldo_base', zonaExtremaPct: 'zona_extrema_pct',
  gratificacionTipo: 'gratificacion_tipo', gratificacionPct: 'gratificacion_pct',
  asignacionFamiliarTramo: 'asignacion_familiar_tramo', cargasNormales: 'cargas_normales',
  cargasMaternales: 'cargas_maternales', cargasInvalidas: 'cargas_invalidas',
  jubilado: 'jubilado', afectoSeguroAccidentes: 'afecto_seguro_accidentes', seguroCesantia: 'seguro_cesantia',
  apvIndividual: 'apv_individual', apvColectivo: 'apv_colectivo',
  tipoPago: 'tipo_pago', banco: 'banco', tipoCuenta: 'tipo_cuenta', numeroCuenta: 'numero_cuenta',
};

// Saneo por columna para respetar los CHECK del esquema.
const sanearColumna = (col, val) => {
  switch (col) {
    case 'estado_civil': return enumOrNull(val, CIVILES);
    case 'tipo_contrato': return normContrato(val);
    case 'estado_contrato': return enumOrNull(val, ['activo', 'inactivo']) || 'activo';
    case 'tipo_sueldo_base': return enumOrNull(val, SUELDOS) || 'mes';
    case 'gratificacion_tipo': return enumOrNull(val, GRATIF) || 'no';
    case 'plan_isapre_moneda': return enumOrNull(val, ['uf', 'clp']) ? String(val).toUpperCase() : 'UF';
    case 'tipo_pago': return enumOrNull(val, PAGOS);
    case 'sueldo_base': case 'zona_extrema_pct': case 'plan_isapre_monto': case 'gratificacion_pct':
      return numOrNull(val);
    case 'cargas_normales': case 'cargas_maternales': case 'cargas_invalidas':
      return numOrNull(val) || 0;
    case 'discapacidad': case 'ajuste_ley_20281': case 'semana_corrida': case 'cargo_excepcional_ley_21561':
    case 'jubilado': case 'afecto_seguro_accidentes': case 'seguro_cesantia':
    case 'apv_individual': case 'apv_colectivo':
      return boolOr(val);
    default: return val === '' ? null : val;
  }
};

export const updateTrabajador = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const b = req.body || {};

    const { rows: existRows } = await client.query('SELECT * FROM rem_trabajador WHERE id = $1', [id]);
    const actual = existRows[0];
    if (!actual || (actual.organizacion_id || null) !== (req.user?.organizacionId || null)) {
      client.release();
      return res.status(404).json({ message: 'Trabajador no encontrado' });
    }

    const sets = [];
    const vals = [];
    const cambios = []; // { campo, anterior, nuevo }
    let i = 1;

    for (const [key, col] of Object.entries(EDITABLES)) {
      if (!(key in b)) continue;
      const nuevo = sanearColumna(col, b[key]);
      const anterior = actual[col];
      // Comparación laxa (string) para no registrar cambios espurios.
      if (String(anterior ?? '') === String(nuevo ?? '')) continue;
      sets.push(`${col} = $${i++}`);
      vals.push(nuevo);
      cambios.push({ campo: col, anterior, nuevo });
    }

    if (!sets.length) {
      client.release();
      return res.status(200).json({ success: true, message: 'Sin cambios', cambios: 0 });
    }

    await client.query('BEGIN');
    sets.push(`updated_at = CURRENT_TIMESTAMP`);
    vals.push(id);
    const { rows } = await client.query(
      `UPDATE rem_trabajador SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      vals
    );

    for (const c of cambios) {
      await client.query(
        `INSERT INTO rem_trabajador_historial
           (trabajador_id, campo, valor_anterior, valor_nuevo, usuario_id, usuario_nombre)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, c.campo, c.anterior == null ? null : String(c.anterior),
         c.nuevo == null ? null : String(c.nuevo), req.user?.usuarioId || null, req.user?.nombre || null]
      );
    }

    await client.query('COMMIT');
    return res.status(200).json({ success: true, trabajador: aResumen(rows[0]), cambios: cambios.length });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ updateTrabajador:', error.message);
    return res.status(500).json({ message: 'Error al actualizar el trabajador' });
  } finally {
    client.release();
  }
};

// ============================================================================
// ELIMINAR TRABAJADOR (definitivo — solo admin)
// ============================================================================
export const deleteTrabajador = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      'SELECT id, organizacion_id FROM rem_trabajador WHERE id = $1',
      [id]
    );
    const t = rows[0];
    if (!t || (t.organizacion_id || null) !== (req.user?.organizacionId || null)) {
      return res.status(404).json({ message: 'Trabajador no encontrado' });
    }
    await pool.query('DELETE FROM rem_trabajador WHERE id = $1', [id]);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ deleteTrabajador:', error.message);
    return res.status(500).json({ message: 'Error al eliminar el trabajador' });
  }
};
