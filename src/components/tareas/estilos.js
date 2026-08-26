// =====================================================================
// EL LENGUAJE VISUAL DEL MÓDULO DE TAREAS
// ---------------------------------------------------------------------
// Una tarea se dibuja en cinco pantallas —la lista, el tablero, el árbol,
// Inicio y el panel de detalle— y hasta ahora cada una tenía su propia copia
// de los colores. Cuatro copias del mismo mapa.
//
// Y ya se habían separado: la del árbol no tenía `media`, así que una tarea de
// prioridad media salía SIN marca ahí y CON marca en las otras cuatro. Nadie lo
// notó porque el error no rompe nada, solo miente en silencio.
//
// Acá viven una sola vez.
// =====================================================================

// LA PRIORIDAD, COMO BARRA EN EL MARGEN.
//
// Es la forma preferida. De pastilla se lee una por una; de barra en el borde
// izquierdo se lee la columna entera de un vistazo vertical, que es como uno
// pregunta «¿qué hay urgente?». Además devuelve al título el ancho que la
// pastilla ocupaba, y el título es lo único que uno lee de verdad.
export const PRIO_BARRA = {
    critica: 'bg-red-600',
    alta:    'bg-orange-500',
    media:   'bg-amber-400',
    baja:    'bg-slate-300',
};

// La pastilla. Se conserva para donde una barra no se puede colgar de nada —un
// aviso suelto, una fila fuera de lista— pero NO es la forma por omisión.
export const PRIO = {
    critica: 'text-red-700 bg-red-600/15 border-red-600/40',
    alta:    'text-orange-600 bg-orange-500/10 border-orange-500/30',
    media:   'text-amber-600 bg-amber-500/10 border-amber-500/30',
    baja:    'text-slate-500 bg-slate-500/10 border-slate-400/30',
};

// EL ESTADO, COMO PUNTO DE COLOR.
//
// «ACTIVA» en mayúsculas y negrita, repetido diez veces hacia abajo, compite
// con el título. Un punto dice lo mismo sin gritar.
export const ESTADO_PUNTO = {
    pendiente:   'bg-blue-500',
    en_proceso:  'bg-orange-500',
    en_revision: 'bg-violet-500',
    completada:  'bg-emerald-500',
    cancelada:   'bg-slate-300',
};

// Iniciales para el círculo del responsable. Es como se distingue a una persona
// de un vistazo en Asana, Jira, Linear y GitHub: «VV» se reconoce sin leer,
// «VICTOR IGNACIO VOLLAIRE SILVA» hay que leerlo entero — y en una columna de
// 140 px se corta antes de llegar al apellido, que es justo lo que distingue.
export const iniciales = (n) =>
    String(n || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
