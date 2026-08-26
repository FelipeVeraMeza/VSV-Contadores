// ============================================================================
// LA HORA DEL SERVIDOR ES LA HORA DE CHILE
// ----------------------------------------------------------------------------
// EL PROBLEMA
// El servidor corre en UTC, y varias respuestas traen la fecha YA ESCRITA por
// el backend —`new Date(x).toLocaleString('es-CL')` en los comentarios de una
// tarea, en las notas del cliente, en la bandeja—. El `'es-CL'` de ahí solo
// elige el FORMATO (día-mes-año, a. m./p. m.); la HORA sigue siendo la del
// servidor. Resultado: todo salía 4 horas adelantado.
//
// Se vio el 26-08-2026 en un comentario guardado a las 14:32 de Chile que la
// pantalla mostraba como «6:32:03 p. m.». La fecha en la base estaba bien
// (18:32 UTC es 14:32 en Chile): lo que mentía era cómo se escribía.
//
// POR QUÉ ACÁ Y NO EN CADA LLAMADA
// Son decenas de sitios los que formatean fechas. Ir uno por uno agregando
// `{ timeZone: 'America/Santiago' }` deja el problema latente para el siguiente
// que se escriba. Poniendo la zona del proceso, todo el backend habla en hora
// de Chile de una vez, que es la única hora que le importa a esta oficina.
//
// Node relee `process.env.TZ` en caliente (v16+), pero igual este módulo se
// importa PRIMERO en `server.js`: en ESM los módulos se ejecutan en el orden en
// que se importan, así que nada alcanza a formatear una fecha antes.
//
// OJO SI ALGÚN DÍA SE REACTIVAN LOS CRON: `node-cron` programa en la hora local
// del proceso. Hoy están todos comentados en `server.js`; cuando se enciendan,
// sus horarios se leen como hora de Chile —que es lo que uno quiere decir al
// escribir «a las 2 de la mañana»—, no como UTC.
//
// Lo que NO cambia: la base guarda `timestamptz` (siempre en UTC por dentro) y
// `toISOString()` sigue devolviendo UTC. Esto es solo cómo se ESCRIBE la hora.
// ============================================================================
// Se fija SIEMPRE, sin respetar un TZ heredado: las plataformas de despliegue
// suelen traer TZ=UTC puesto de fábrica, y con un `||` el arreglo no serviría
// justo donde hace falta. Para cambiarla, se cambia acá.
process.env.TZ = 'America/Santiago';
