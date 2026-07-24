// ============================================================================
// MOTOR DE CÁLCULO DE LIQUIDACIONES (Chile) — función pura, sin I/O.
//
// calcularLiquidacion(input) → { detalles[], totales{} }
//
// ⚠️ MOTOR BASE para validación. Antes de habilitar pago real, el contador
// debe validar: los flags imponible/tributable de rem_concepto, las tasas
// (AFP/SIS/cesantía/mutual) y los tramos de impuesto único y asignación
// familiar (hoy sembrados como PLACEHOLDER). Todo es parametrizable en BD.
//
// Los valores numéricos de PostgreSQL (tipo numeric) llegan como string; se
// normalizan con num().
// ============================================================================

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round = (v) => Math.round(num(v)); // a peso

/**
 * @param {object} input
 * @param {object} input.trabajador  fila rem_trabajador
 * @param {object} input.parametro   fila rem_parametro_previsional del período
 * @param {object|null} input.afp    fila rem_afp del trabajador ({ tasa_comision })
 * @param {boolean} input.saludEsIsapre  si la institución de salud es isapre
 * @param {Array}  input.movimientos novedades: { codigo, descripcion, naturaleza,
 *                                    imponible, tributable, afectaGratificacion,
 *                                    cantidad, monto }
 * @param {Array}  input.impuestoTramos  filas rem_impuesto_tramo (asc por tramo)
 * @param {Array}  input.afTramos    filas rem_asignacion_familiar_tramo
 * @param {object|null} input.config fila rem_config_empresa ({ tasa_mutual })
 * @param {number} [input.diasTrabajados=30]
 */
export function calcularLiquidacion({
  trabajador, parametro, afp, saludEsIsapre = false,
  movimientos = [], impuestoTramos = [], afTramos = [], config = null,
  diasTrabajados = 30,
}) {
  const p = {
    uf: num(parametro?.uf),
    utm: num(parametro?.utm),
    sueldoMinimo: num(parametro?.sueldo_minimo),
    topeAfpUf: num(parametro?.tope_imponible_afp_uf),
    topeCesantiaUf: num(parametro?.tope_imponible_cesantia_uf),
    tasaSis: num(parametro?.tasa_sis),
    tasaCesTrab: num(parametro?.tasa_cesantia_trabajador),
    tasaCesEmpIndef: num(parametro?.tasa_cesantia_empleador_indef),
    tasaCesEmpPlazo: num(parametro?.tasa_cesantia_empleador_plazo),
  };

  const detalles = [];
  const add = (naturaleza, codigo, descripcion, monto, { imponible = false, tributable = false } = {}) => {
    if (round(monto) === 0 && naturaleza !== 'HABER') return; // omite descuentos/aportes en 0
    detalles.push({ naturaleza, codigo, descripcion, monto: round(monto), imponible, tributable, orden: detalles.length });
  };

  const prop = Math.min(Math.max(num(diasTrabajados), 0), 30) / 30;

  // ── 1. Sueldo base (proporcional a días trabajados) ──────────────────────
  const sueldoBase = round(num(trabajador?.sueldo_base) * prop);
  add('HABER', '100', 'Sueldo base', sueldoBase, { imponible: true, tributable: true });

  // ── 2. Haberes desde novedades ───────────────────────────────────────────
  let movImpTrib = 0;     // imponibles y tributables
  let baseGratExtra = 0;  // imponibles que afectan gratificación
  let movNoImp = 0;       // no imponibles
  const descuentosMov = [];

  for (const m of movimientos) {
    const monto = round(num(m.monto));
    if (m.naturaleza === 'DESCUENTO') { descuentosMov.push({ ...m, monto }); continue; }
    // HABER
    add('HABER', m.codigo || null, m.descripcion || 'Haber', monto,
      { imponible: !!m.imponible, tributable: !!m.tributable });
    if (m.imponible) {
      if (m.tributable) movImpTrib += monto;
      if (m.afectaGratificacion) baseGratExtra += monto;
    } else {
      movNoImp += monto;
    }
  }

  // ── 3. Gratificación legal ───────────────────────────────────────────────
  const baseGrat = sueldoBase + baseGratExtra;
  let gratificacion = 0;
  const gratTipo = trabajador?.gratificacion_tipo || 'no';
  if (gratTipo === 'tope_475') {
    const topeMensual = round((4.75 * p.sueldoMinimo) / 12);
    gratificacion = Math.min(round(baseGrat * 0.25), topeMensual);
  } else if (gratTipo === 'porcentaje') {
    gratificacion = round(sueldoBase * (num(trabajador?.gratificacion_pct) / 100));
  }
  if (gratificacion > 0) {
    add('HABER', '115', 'Gratificación legal', gratificacion, { imponible: true, tributable: true });
  }

  // ── 4. Totales imponibles y topes ────────────────────────────────────────
  const totalImponible = sueldoBase + movImpTrib + gratificacion;
  const topeAfp = round(p.topeAfpUf * p.uf);
  const topeCesantia = round(p.topeCesantiaUf * p.uf);
  const baseAfp = Math.min(totalImponible, topeAfp);
  const baseCesantia = Math.min(totalImponible, topeCesantia);

  // ── 5. Descuentos previsionales obligatorios ─────────────────────────────
  const tasaAfp = (10 + num(afp?.tasa_comision)) / 100;
  const descAfp = round(baseAfp * tasaAfp);
  add('DESCUENTO', '200', 'Previsión AFP', descAfp);

  const salud7 = round(baseAfp * 0.07);
  let descSalud = salud7;
  if (saludEsIsapre && num(trabajador?.plan_isapre_monto) > 0) {
    const planPesos = (trabajador?.plan_isapre_moneda === 'CLP')
      ? round(num(trabajador.plan_isapre_monto))
      : round(num(trabajador.plan_isapre_monto) * p.uf);
    descSalud = Math.max(salud7, planPesos);
  }
  add('DESCUENTO', '201', 'Salud (7% / plan)', descSalud);

  const esIndefinido = trabajador?.tipo_contrato === 'indefinido';
  let descCesantia = 0;
  if (trabajador?.seguro_cesantia && esIndefinido) {
    descCesantia = round(baseCesantia * (p.tasaCesTrab / 100));
    add('DESCUENTO', 'AFC', 'Seguro de cesantía (trabajador)', descCesantia);
  }

  const cotizaciones = descAfp + descSalud + descCesantia;

  // ── 6. Base tributable e impuesto único de 2ª categoría ──────────────────
  const tributableHaberes = sueldoBase + movImpTrib + gratificacion; // imponible+tributable
  const baseTributable = Math.max(0, tributableHaberes - cotizaciones);
  const enUtm = p.utm > 0 ? baseTributable / p.utm : 0;
  let impuesto = 0;
  const tramo = [...impuestoTramos]
    .sort((a, b) => num(a.tramo) - num(b.tramo))
    .find(t => enUtm >= num(t.desde_utm) && (t.hasta_utm == null || enUtm <= num(t.hasta_utm)));
  if (tramo) {
    impuesto = Math.max(0, round(baseTributable * num(tramo.factor) - num(tramo.rebaja_utm) * p.utm));
  }
  add('DESCUENTO', '205', 'Impuesto único 2ª categoría', impuesto);

  // ── 7. Asignación familiar (haber no imponible) ──────────────────────────
  const totalCargas = num(trabajador?.cargas_normales) + num(trabajador?.cargas_maternales) + num(trabajador?.cargas_invalidas);
  let asignacionFamiliar = 0;
  if (totalCargas > 0 && afTramos.length) {
    const letra = (trabajador?.asignacion_familiar_tramo || '').toUpperCase();
    let t = afTramos.find(x => x.tramo === letra);
    if (!t) {
      // Sin tramo declarado: se determina por la renta imponible.
      t = [...afTramos]
        .sort((a, b) => (num(a.renta_max) || Infinity) - (num(b.renta_max) || Infinity))
        .find(x => x.renta_max == null || totalImponible <= num(x.renta_max));
    }
    asignacionFamiliar = round(num(t?.monto) * totalCargas);
    if (asignacionFamiliar > 0) {
      add('HABER', '102', 'Asignación familiar', asignacionFamiliar, { imponible: false, tributable: false });
    }
  }

  // ── 8. Otros descuentos (novedades) ──────────────────────────────────────
  let otrosDescuentos = 0;
  for (const d of descuentosMov) {
    add('DESCUENTO', d.codigo || null, d.descripcion || 'Descuento', d.monto);
    otrosDescuentos += d.monto;
  }

  // ── 9. Aportes patronales (informativos, no afectan el líquido) ──────────
  const aporteSis = round(baseAfp * (p.tasaSis / 100));
  add('APORTE', 'SIS', 'Seguro de invalidez y sobrevivencia (empleador)', aporteSis);
  const tasaCesEmp = esIndefinido ? p.tasaCesEmpIndef : p.tasaCesEmpPlazo;
  const aporteAfc = round(baseCesantia * (tasaCesEmp / 100));
  add('APORTE', 'AFC-E', 'Aporte empleador seguro de cesantía', aporteAfc);
  const aporteMutual = round(baseAfp * (num(config?.tasa_mutual) / 100));
  add('APORTE', 'MUT', 'Mutual / seguro de accidentes (empleador)', aporteMutual);
  const aportesPatronales = aporteSis + aporteAfc + aporteMutual;

  // ── 10. Totales ──────────────────────────────────────────────────────────
  const totalNoImponible = movNoImp + asignacionFamiliar;
  const totalHaberes = totalImponible + totalNoImponible;
  const totalDescuentos = cotizaciones + impuesto + otrosDescuentos;
  const liquidoPagar = totalHaberes - totalDescuentos;

  return {
    detalles,
    totales: {
      dias_trabajados: num(diasTrabajados),
      total_imponible: round(totalImponible),
      total_no_imponible: round(totalNoImponible),
      total_haberes: round(totalHaberes),
      base_tributable: round(baseTributable),
      total_descuentos: round(totalDescuentos),
      liquido_pagar: round(liquidoPagar),
      aportes_patronales: round(aportesPatronales),
    },
  };
}
