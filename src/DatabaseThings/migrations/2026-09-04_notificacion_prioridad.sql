-- ============================================================================
-- LA PRIORIDAD VIAJA CON EL AVISO
-- ----------------------------------------------------------------------------
-- El pedido original del módulo de Tareas pedía un pop-up al recibir una tarea
-- «con su urgencia» (docs/tareas-requerimientos.md §10.5, punto 2). La campana
-- y el sonido se hicieron; el pop-up nunca, y la razón de fondo es que el aviso
-- no sabía qué tan urgente era lo que estaba avisando.
--
-- Sin este dato el pop-up tendría que ir a buscar la tarea para saber de qué
-- color pintarse: un viaje más a la base por cada aviso que llega, justo en el
-- momento en que la persona está mirando otra cosa. Y si la tarea se borra, el
-- aviso queda sin poder dibujarse.
--
-- Se guarda en el aviso, entonces, y no se deduce: la prioridad que importa es
-- la que tenía la tarea CUANDO se asignó. Si después alguien la baja de crítica
-- a media, el aviso que ya se mostró no se reescribe solo.
--
-- Es una columna opcional a propósito. Los avisos que no son de una tarea
-- —agregado a un proyecto, una reunión que empieza— no tienen prioridad y
-- quedan en NULL; la pantalla los dibuja igual que hasta ahora. Los 0 avisos
-- que ya están en la base tampoco se tocan.
-- ============================================================================

BEGIN;

ALTER TABLE notificacion
    ADD COLUMN IF NOT EXISTS prioridad VARCHAR(20);

-- Solo los cuatro valores del catálogo de tareas, o nada. Sin esto, un typo en
-- el código dejaría un aviso que la pantalla no sabe pintar y que se vería sin
-- color, en silencio, sin que nadie lo note.
ALTER TABLE notificacion
    DROP CONSTRAINT IF EXISTS notificacion_prioridad_check;
ALTER TABLE notificacion
    ADD CONSTRAINT notificacion_prioridad_check
    CHECK (prioridad IS NULL OR prioridad IN ('baja', 'media', 'alta', 'critica'));

COMMENT ON COLUMN notificacion.prioridad IS
    'Urgencia de la tarea al momento de avisar. NULL en avisos que no son de una tarea.';

COMMIT;
