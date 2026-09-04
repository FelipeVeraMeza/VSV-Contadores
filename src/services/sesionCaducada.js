// =====================================================================
// CUANDO LA SESIÓN CADUCA · un solo lugar donde se decide qué hacer
// ---------------------------------------------------------------------
// EL PROBLEMA
// La sesión dura 24 horas y se renueva sola mientras uno la use, así que
// caducar no es lo raro. Lo malo era lo que pasaba DESPUÉS: `fetchWithAuth`
// recibía el 401, lo escribía en la consola y devolvía la respuesta como si
// nada.
//
// La pantalla se quedaba ahí, con los datos viejos en memoria. Uno seguía
// pulsando y no respondía nada — o peor, aparecían listas vacías, que se leen
// como «se borraron mis datos» y no como «se cayó la sesión». Nadie avisaba.
// La única forma de enterarse era cerrar sesión y volver a entrar a mano, que
// es exactamente lo que se reportó el 04-09-2026.
//
// LA REGLA
// Un 401 significa una cosa sola: esta sesión ya no sirve. Se limpia y se
// vuelve al login diciendo por qué. Va acá y no dentro de cada servicio para
// que haya UNA respuesta y no quince: hoy `apiClient`, `asistenteService` y
// `dteConsultasService` hacían cada uno algo distinto con el mismo 401.
//
// POR QUÉ NO ES UN HOOK
// Lo llama `fetchWithAuth`, que es una función suelta y no un componente: no
// puede usar `useAuth` ni `useNavigate`. Por eso limpia el almacenamiento y
// navega con `window.location`, que además fuerza una recarga completa y deja
// el estado de React en blanco — que es justo lo que se quiere cuando la
// sesión ya no vale.
// =====================================================================

// Una sola vez. Con varias peticiones en vuelo —y siempre las hay: la campana,
// el panel, la lista— el 401 llega repetido, y sin esta marca cada una
// intentaría redirigir y limpiar por su cuenta.
let yaAvisado = false;

/** Para las pruebas y para el arranque de sesión: vuelve a armar el aviso. */
export const reiniciarAvisoSesion = () => { yaAvisado = false; };

/**
 * Cierra la sesión caducada y lleva al login explicando qué pasó.
 * Devuelve `true` si fue esta llamada la que lo hizo.
 */
export const sesionCaducada = () => {
    if (yaAvisado) return false;
    yaAvisado = true;

    try {
        localStorage.clear();
        sessionStorage.clear();
    } catch { /* si el navegador lo bloquea, igual hay que salir */ }

    // `?expired=true` es lo que ya entendía el login para explicar el motivo:
    // se reutiliza en vez de inventar otro parámetro (ver useAuth.logout).
    try {
        const yaEnLogin = window.location.pathname.startsWith('/login');
        if (!yaEnLogin) window.location.href = '/login?expired=true';
    } catch { /* fuera del navegador (pruebas) no hay a dónde ir */ }

    return true;
};
