// ============================================================================
// HASTA DÓNDE HACIA ATRÁS BAJA EL ROBOT DEL SII
// ----------------------------------------------------------------------------
// QUÉ RESUELVE
// Los dos orquestadores —emitidos y recibidos— recorren la tabla del SII de lo
// más nuevo a lo más viejo y se detienen al llegar a cierta fecha. Ese corte
// estaba escrito a mano en cada archivo:
//
//     const fechaLimite = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
//
// O sea: UN mes hacia atrás, fijo, y repetido en dos lugares. Para bajar el
// historial de tres meses había que editar el código y volver a desplegar, y
// era fácil cambiar uno y olvidar el otro —quedando las ventas y las compras
// con rangos distintos sin que nadie se diera cuenta—.
//
// Ahora el rango se configura con `SII_MESES_ATRAS` (en Railway, si es
// producción) y vale para los dos robots.
//
// POR QUÉ NO MÁS MESES POR OMISIÓN
// Cada mes extra son más páginas que recorrer en el portal, y el SII es lento y
// corta sesiones largas. Un mes cubre el caso de todos los días —lo que se
// facturó desde la última vez— y quien necesite más lo pide explícitamente.
// El tope de 24 no es un capricho: más que eso conviene hacerlo por rango
// acotado desde la pantalla de extracción manual, que existe para eso.
// ============================================================================

const POR_OMISION = 1;
const TOPE = 24;

/**
 * Cuántos meses hacia atrás se baja. Se lee del entorno; si el valor no sirve
 * —vacío, texto, negativo— se usa el de siempre en vez de fallar: quedarse sin
 * sincronizar por una variable mal escrita es peor que traer un mes.
 */
export const mesesAtras = () => {
    const crudo = process.env.SII_MESES_ATRAS;
    const n = Number.parseInt(crudo, 10);
    if (!Number.isFinite(n) || n < 1) return POR_OMISION;
    return Math.min(n, TOPE);
};

/**
 * El día 1 del mes hasta el que se baja, con la hora en cero.
 *
 * Con `meses = 1` devuelve el día 1 del mes pasado, que es exactamente lo que
 * hacía el código anterior: el comportamiento por omisión no cambia.
 */
export const fechaLimiteSii = (meses = mesesAtras()) => {
    const hoy = new Date();
    const limite = new Date(hoy.getFullYear(), hoy.getMonth() - meses, 1);
    limite.setHours(0, 0, 0, 0);
    return limite;
};

/** Para el log: «desde el 1 de julio de 2026 (2 meses atrás)». */
export const describirRango = (meses = mesesAtras()) => {
    const d = fechaLimiteSii(meses);
    const texto = d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
    return `desde el ${texto} (${meses} ${meses === 1 ? 'mes' : 'meses'} atrás)`;
};
