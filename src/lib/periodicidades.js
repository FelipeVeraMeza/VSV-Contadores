// ============================================================================
// CADA CUÁNTO SE COBRA UN SERVICIO
// ----------------------------------------------------------------------------
// Estaba escrita a mano en tres lugares —el validador del servidor y dos
// desplegables— y por eso faltaba «una sola vez» justo donde más se nota: los
// trámites que se cobran UNA vez (inicio de actividades, constitución de la
// sociedad) no son mensuales ni anuales, y hasta ahora había que elegirles una
// periodicidad falsa.
//
// El código ya daba por hecho que existía: en el modal de crear cliente hay un
// comentario que dice «los servicios de una vez (Inicio de Actividades) no
// entran en el cobro del mes», pero la opción no estaba en ninguna lista.
//
// EL VALOR QUE SE GUARDA Y EL TEXTO QUE SE LEE VAN SEPARADOS. Las pantallas
// mostraban el valor crudo con `capitalize`, que con «una_vez» daría «Una_vez».
// ============================================================================

export const PERIODICIDADES = [
    { valor: 'mensual',       label: 'Mensual' },
    { valor: 'bimensual',     label: 'Bimensual' },
    { valor: 'trimestral',    label: 'Trimestral' },
    { valor: 'cuatrimestral', label: 'Cuatrimestral' },
    { valor: 'semestral',     label: 'Semestral' },
    { valor: 'anual',         label: 'Anual' },
    { valor: 'una_vez',       label: 'Una sola vez' },
];

export const VALORES_PERIODICIDAD = PERIODICIDADES.map(p => p.valor);

/** El texto que se muestra. Si llega un valor desconocido, se muestra tal cual. */
export const etiquetaPeriodicidad = (valor) =>
    PERIODICIDADES.find(p => p.valor === valor)?.label || valor || 'Mensual';

/**
 * ¿Este servicio suma al cobro DEL MES?
 *
 * Solo lo mensual. Un servicio anual o de una sola vez se cobra aparte: meterlo
 * en el total mensual infla el honorario del cliente todos los meses por algo
 * que se cobró una vez.
 */
export const sumaAlMes = (periodicidad) => (periodicidad || 'mensual') === 'mensual';
