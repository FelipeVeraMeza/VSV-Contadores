-- =====================================================================
-- Migración: cada prospecto tiene dueño (cuaderno propio por cuenta)
-- Fecha: 2026-07-21 · Idempotente (IF NOT EXISTS).
--
-- Regla de visibilidad que habilita esta columna:
--   · Usuario normal  → solo ve los prospectos que creó o los que tiene
--                       asignados como ejecutivo.
--   · Administrador   → ve todos los de su organización.
-- =====================================================================

ALTER TABLE persona
    ADD COLUMN IF NOT EXISTS creado_por uuid REFERENCES usuario(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_persona_creado_por ON persona (creado_por);

-- ---------------------------------------------------------------------
-- Backfill: a los prospectos ya existentes se les asigna dueño.
-- Fuente 1 (la más fiable): el autor del primer registro del historial de
-- estado, que se inserta en el alta ("Alta manual").
-- ---------------------------------------------------------------------
UPDATE persona p
SET creado_por = h.usuario_id
FROM (
    SELECT DISTINCT ON (persona_id) persona_id, usuario_id
    FROM persona_estado_historial
    WHERE usuario_id IS NOT NULL
    ORDER BY persona_id, created_at ASC
) h
WHERE p.id = h.persona_id
  AND p.creado_por IS NULL;

-- Fuente 2 (respaldo): el ejecutivo asignado.
UPDATE persona
SET creado_por = ejecutivo_id
WHERE creado_por IS NULL
  AND ejecutivo_id IS NOT NULL;

-- Los que quedan sin dueño (importados, o creados antes del historial)
-- solo los verá el Administrador de la organización, que podrá repartirlos.

-- ---------------------------------------------------------------------
-- El RUT era único a nivel global: dos organizaciones distintas no podían
-- registrar a la misma persona, y el choque estallaba como error 500.
-- Pasa a ser único dentro de cada organización.
-- ---------------------------------------------------------------------
ALTER TABLE persona DROP CONSTRAINT IF EXISTS persona_rut_hash_key;

CREATE UNIQUE INDEX IF NOT EXISTS ux_persona_rut_hash_org
    ON persona (organizacion_id, rut_hash)
    WHERE rut_hash IS NOT NULL;
