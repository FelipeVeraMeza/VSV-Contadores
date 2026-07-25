// ============================================================================
// Estructura de navegación del módulo de Remuneraciones (RRHH).
//
// El SIDEBAR muestra solo las SECCIONES (Dashboard, Trabajadores, …). Las
// sub-páginas de cada sección se muestran como PESTAÑAS dentro de la página,
// no como desplegable en el menú.
//
// Compartido por MainPage (sidebar) y RecursosHumanos (pestañas + ruteo).
// ============================================================================
import { LayoutDashboard, Users, Coins, Umbrella, FileText, PieChart, Settings } from 'lucide-react';

export const RRHH_SECCIONES = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, landing: 'dashboard', items: [
    { id: 'dashboard', label: 'Dashboard' },
  ] },
  { id: 'trabajadores', label: 'Trabajadores', icon: Users, landing: 'trabajadores', items: [
    { id: 'trabajadores',   label: 'Trabajadores' },
    { id: 'cargas',         label: 'Cargas familiares' },
    { id: 'contratos',      label: 'Contratos' },
    { id: 'cargos',         label: 'Cargos y Departamentos' },
    { id: 'doc-trabajador', label: 'Documentos' },
    { id: 'historial',      label: 'Historial' },
  ] },
  { id: 'remuneraciones', label: 'Remuneraciones', icon: Coins, landing: 'haberes', items: [
    { id: 'haberes',        label: 'Haberes y Descuentos' },
    { id: 'novedades',      label: 'Novedades del período' },
    { id: 'liquidaciones',  label: 'Liquidaciones' },
    { id: 'centralizacion', label: 'Centralización' },
  ] },
  { id: 'laboral', label: 'Gestión Laboral', icon: Umbrella, landing: 'vacaciones', items: [
    { id: 'vacaciones',     label: 'Vacaciones' },
    { id: 'licencias',      label: 'Licencias Médicas' },
    { id: 'finiquitos',     label: 'Finiquitos' },
    { id: 'asistencia',     label: 'Asistencia' },
  ] },
  { id: 'documentos', label: 'Documentos', icon: FileText, landing: 'doc-libro', items: [
    { id: 'doc-laborales',   label: 'Documentos laborales' },
    { id: 'doc-libro',       label: 'Libro de Remuneraciones' },
    { id: 'doc-previred',    label: 'PREVIRED' },
    { id: 'doc-lre',         label: 'Libro DT (LRE)' },
    { id: 'doc-nomina',      label: 'Nómina Bancaria' },
    { id: 'doc-certificados',label: 'Certificados' },
    { id: 'doc-envios',      label: 'Envíos' },
  ] },
  { id: 'reportes', label: 'Reportes', icon: PieChart, landing: 'reportes', items: [
    { id: 'reportes',       label: 'Reportes' },
    { id: 'estadisticas',   label: 'Estadísticas' },
    { id: 'exportaciones',  label: 'Exportaciones' },
  ] },
  { id: 'configuracion', label: 'Configuración', icon: Settings, landing: 'cfg-empresa', items: [
    { id: 'cfg-empresa',      label: 'Empresa' },
    { id: 'cfg-parametros',   label: 'Parámetros previsionales' },
    { id: 'cfg-afp',          label: 'AFP' },
    { id: 'cfg-salud',        label: 'Salud' },
    { id: 'cfg-mutual',       label: 'Mutual' },
    { id: 'cfg-conceptos',    label: 'Conceptos' },
    { id: 'cfg-contabilidad', label: 'Contabilidad' },
    { id: 'cfg-plantillas',   label: 'Plantillas' },
  ] },
];

// Sub-páginas del sidebar: una entrada por sección (ítem plano que navega al landing).
export const subRRHH = RRHH_SECCIONES.map(s => ({
  id: s.landing,
  name: s.label,
  icon: s.icon,
  match: s.items.map(i => i.id),   // resalta la sección si el ?sub= actual le pertenece
}));

// Devuelve la sección a la que pertenece una sub-página.
export const seccionDeSub = (subId) =>
  RRHH_SECCIONES.find(s => s.items.some(i => i.id === subId)) || RRHH_SECCIONES[0];
