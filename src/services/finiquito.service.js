// ============================================================================
// MOTOR DE CÁLCULO DE FINIQUITO (Chile) — función pura, sin I/O.
//
// ⚠️ CÁLCULO BASE (Código del Trabajo, simplificado). Validar con abogado/
// contador antes de emitir el documento legal: topes 90 UF / 11 años, semana
// corrida sobre la base, última remuneración pendiente, feriado progresivo, etc.
// ============================================================================

// Causales de término y si dan derecho a indemnización por años de servicio.
export const CAUSALES = [
  { codigo: 'art_159_2', label: 'Renuncia voluntaria (art. 159 N°2)', indemniza: false },
  { codigo: 'art_159_1', label: 'Mutuo acuerdo de las partes (art. 159 N°1)', indemniza: false },
  { codigo: 'art_159_4', label: 'Vencimiento del plazo convenido (art. 159 N°4)', indemniza: false },
  { codigo: 'art_159_5', label: 'Conclusión del trabajo o servicio (art. 159 N°5)', indemniza: false },
  { codigo: 'art_160',   label: 'Caducidad — causal imputable / falta grave (art. 160)', indemniza: false },
  { codigo: 'art_161_1', label: 'Necesidades de la empresa (art. 161 inc. 1)', indemniza: true },
  { codigo: 'art_161_2', label: 'Desahucio del empleador (art. 161 inc. 2)', indemniza: true },
];

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round = (v) => Math.round(num(v));

const parse = (d) => {
  if (d instanceof Date) return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
  const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number);
  return { y, m, d: dd };
};
// Meses completos entre dos fechas (no cuenta el mes si no se cumplió el día).
export const mesesEntre = (ini, fin) => {
  if (!ini || !fin) return 0;
  const a = parse(ini), b = parse(fin);
  let m = (b.y - a.y) * 12 + (b.m - a.m);
  if (b.d < a.d) m -= 1;
  return Math.max(0, m);
};

/**
 * @param {object} input
 * @param {object} input.trabajador      fila rem_trabajador
 * @param {number} input.uf              UF del período (para topes)
 * @param {string} input.fechaTermino    'YYYY-MM-DD'
 * @param {string} input.causal          código de CAUSALES
 * @param {boolean} input.dioAviso       ¿se dio el aviso de 30 días?
 * @param {number} input.diasVacPendientes  días de vacaciones pendientes
 * @param {number} [input.otrosHaberes=0]
 * @param {number} [input.descuentos=0]
 */
export function calcularFiniquito({ trabajador, uf, fechaTermino, causal, dioAviso = false, diasVacPendientes = 0, otrosHaberes = 0, descuentos = 0 }) {
  const sueldoBase = num(trabajador?.sueldo_base);
  const ufv = num(uf);
  const topeSueldo = ufv > 0 ? Math.min(sueldoBase, round(90 * ufv)) : sueldoBase; // tope 90 UF
  const valorDia = sueldoBase / 30;

  const meses = mesesEntre(trabajador?.fecha_ingreso, fechaTermino);
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;

  const vacProporcional = round(num(diasVacPendientes) * valorDia);

  const info = CAUSALES.find(c => c.codigo === causal);
  const indemniza = !!info?.indemniza;

  let indemAnos = 0, indemAviso = 0, anosIndem = 0;
  if (indemniza) {
    // Indemnización sustitutiva del aviso previo: 1 sueldo si NO se dio aviso.
    indemAviso = dioAviso ? 0 : round(topeSueldo);
    // Indemnización por años de servicio: 1 sueldo por año, fracción > 6 meses = 1 año, tope 11.
    if (anos >= 1) {
      anosIndem = Math.min(anos + (resto > 6 ? 1 : 0), 11);
      indemAnos = round(anosIndem * topeSueldo);
    }
  }

  const oh = round(otrosHaberes), desc = round(descuentos);
  const total = vacProporcional + indemAnos + indemAviso + oh - desc;

  return {
    mesesServicio: meses, anosServicio: anos, restoMeses: resto,
    sueldoBase: round(sueldoBase), topeSueldo, valorDia: round(valorDia),
    causalLabel: info?.label || causal, indemniza,
    diasVacPendientes: num(diasVacPendientes), vacProporcional,
    anosIndemnizables: anosIndem, indemAnos, indemAviso,
    otrosHaberes: oh, descuentos: desc,
    total,
  };
}
