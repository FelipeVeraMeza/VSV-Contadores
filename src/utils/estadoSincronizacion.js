// ============================================================================
// ESTADO DE LA SINCRONIZACIÓN CON EL SII
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE
// «Sincronizar Todo el SII» dispara DOS robots en cadena —ventas y compras—
// que abren un navegador, entran al portal y bajan el historial. Eso tarda
// minutos, no segundos.
//
// Hasta ahora todo eso pasaba DENTRO de la petición HTTP: el navegador se
// quedaba esperando la respuesta con un spinner, sin decir en qué iba. Y si el
// usuario cerraba la pestaña, cambiaba de sección o se le caía la conexión, se
// quedaba sin saber si la sincronización había terminado o no —el robot seguía
// corriendo en el servidor, invisible—. Con un proxy de por medio (Railway), la
// petición además se corta sola por timeout aunque el trabajo siga vivo.
//
// Ahora la petición vuelve al toque y el progreso se consulta aparte, igual que
// el facturador masivo, que ya funcionaba así.
//
// POR QUÉ UN OBJETO EN MEMORIA Y NO UNA TABLA
// Es el mismo criterio que `estadoRobot` del facturador: el progreso solo
// interesa mientras corre. Si el servidor se reinicia, la sincronización se
// perdió igual, así que guardarla en la base no la salvaría —solo dejaría una
// fila mintiendo que algo sigue activo—. `iniciado` permite detectar eso.
// ============================================================================

export const estadoSincronizacion = {
    activo: false,
    // 'ventas' | 'compras' | null — en cuál de los dos robots va.
    etapa: null,
    paso: 0,            // 1 o 2, para poder mostrar "1 de 2"
    total: 2,
    mensaje: '',
    // Cómo terminó la última corrida. Se conserva DESPUÉS de terminar para que
    // la pantalla pueda mostrar el resultado aunque el usuario haya estado en
    // otra sección mientras corría.
    ok: null,           // true | false | null (nunca corrió)
    error: null,
    iniciado: null,
    terminado: null,
    // Quién la lanzó: si dos personas aprietan el botón, la segunda tiene que
    // saber que ya hay una corriendo y de quién.
    lanzadoPor: null,
    // Cuántos meses hacia atrás se pidió. Va acá para poder decirlo en pantalla
    // —«bajando 3 meses»— y que quien llegue después sepa qué se está trayendo.
    meses: null,
};

export const comenzarSincronizacion = (nombreUsuario) => {
    estadoSincronizacion.activo = true;
    estadoSincronizacion.etapa = null;
    estadoSincronizacion.paso = 0;
    estadoSincronizacion.mensaje = 'Preparando el robot…';
    estadoSincronizacion.ok = null;
    estadoSincronizacion.error = null;
    estadoSincronizacion.iniciado = new Date().toISOString();
    estadoSincronizacion.terminado = null;
    estadoSincronizacion.lanzadoPor = nombreUsuario || null;
};

export const avanzarSincronizacion = (etapa, paso, mensaje) => {
    estadoSincronizacion.etapa = etapa;
    estadoSincronizacion.paso = paso;
    estadoSincronizacion.mensaje = mensaje;
};

export const terminarSincronizacion = (ok, mensaje, error = null) => {
    estadoSincronizacion.activo = false;
    estadoSincronizacion.etapa = null;
    estadoSincronizacion.paso = ok ? estadoSincronizacion.total : estadoSincronizacion.paso;
    estadoSincronizacion.ok = ok;
    estadoSincronizacion.mensaje = mensaje;
    estadoSincronizacion.error = error;
    estadoSincronizacion.terminado = new Date().toISOString();
};
