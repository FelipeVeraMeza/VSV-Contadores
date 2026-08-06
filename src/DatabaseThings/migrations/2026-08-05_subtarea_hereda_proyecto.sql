-- ===================================================================================
-- 2026-08-05 · Las subtareas pertenecen al proyecto de su tarea principal
-- ===================================================================================
-- POR QUÉ
-- Al listar las tareas registradas se ve que las 13 subtareas del FACTURADOR
-- figuran como «(sin proyecto)», aunque su tarea principal sí lo tiene. La
-- subtarea se creaba solo con título y parent_id, sin heredar el proyecto.
--
-- Daba igual mientras la visibilidad no dependiera del proyecto. Con el modelo
-- de integrantes deja de dar igual: una subtarea sin proyecto no la vería nadie
-- salvo su responsable, aunque la tarea padre sea visible para todo el equipo.
--
-- Acá se corrige lo ya cargado. El backend, además, hace que toda subtarea nueva
-- herede el proyecto del padre al crearse.
-- ===================================================================================

BEGIN;

-- Se repite en cascada para cubrir subtareas de subtareas (hasta dos niveles).
UPDATE tarea h SET proyecto_id = p.proyecto_id
  FROM tarea p
 WHERE h.parent_id = p.id
   AND h.proyecto_id IS NULL
   AND p.proyecto_id IS NOT NULL;

UPDATE tarea h SET proyecto_id = p.proyecto_id
  FROM tarea p
 WHERE h.parent_id = p.id
   AND h.proyecto_id IS NULL
   AND p.proyecto_id IS NOT NULL;

COMMIT;
