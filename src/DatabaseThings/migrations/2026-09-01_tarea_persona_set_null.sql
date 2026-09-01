-- =====================================================================
-- Migración: BORRAR UN PROSPECTO NO DEBE BORRAR SUS TICKETS
-- Fecha: 2026-09-01 · Idempotente.
-- =====================================================================
-- QUÉ RESUELVE
-- `tarea.persona_id` apuntaba a `persona` con ON DELETE CASCADE. O sea que
-- eliminar un prospecto del CRM borraba, en silencio y sin confirmación, TODOS
-- los tickets ligados a él —y con ellos sus comentarios y sus adjuntos, que a
-- su vez cuelgan de `tarea` con CASCADE—.
--
-- Nadie relaciona «borré un prospecto» con «desapareció el historial de trabajo
-- de ese cliente». Se pierde el registro de lo que se hizo, que es justamente
-- lo que uno viene a buscar meses después.
--
-- El resto de las relaciones de `tarea` ya usaban SET NULL con el mismo
-- criterio: borrar la empresa, el proyecto o el usuario responsable no borra la
-- tarea, solo la deja sin ese dato. `persona_id` era la excepción.
--
-- POR QUÉ AHORA
-- Hasta hoy ninguna tarea tenía `persona_id`, así que el problema no se veía.
-- Pero el 31-08-2026 se agregó el campo «Cliente» al formulario de nueva tarea
-- (la tarea TICKETS ASIGNADOS A CLIENTES), así que va a empezar a llenarse: el
-- daño aparecería recién cuando alguien borre su primer prospecto con tickets.
--
-- QUÉ NO CAMBIA
-- La tarea sigue existiendo con `persona_id = NULL`. Se pierde a qué cliente
-- estaba asociada —el cliente ya no existe— pero se conserva lo que se hizo,
-- quién lo hizo y cuándo, que es lo que importa.
-- =====================================================================

ALTER TABLE tarea DROP CONSTRAINT IF EXISTS tarea_persona_id_fkey;

ALTER TABLE tarea
    ADD CONSTRAINT tarea_persona_id_fkey
    FOREIGN KEY (persona_id) REFERENCES persona(id) ON DELETE SET NULL;

COMMENT ON COLUMN tarea.persona_id IS
    'Cliente (prospecto) al que pertenece el ticket. SET NULL al borrarlo: el ticket sobrevive, se pierde solo el vínculo.';
