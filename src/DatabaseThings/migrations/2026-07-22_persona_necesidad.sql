-- =====================================================================
-- Migración: campos comerciales del prospecto
-- Fecha: 2026-07-22 · Idempotente (IF NOT EXISTS).
--
-- Tres campos nuevos, editables y visibles en la ficha:
--   necesidad          → "qué necesita" (antes se deducía de observaciones)
--   estado_comercial   → situación comercial libre ("Esperando respuesta",
--                        "Pensándolo"…). Texto libre: la lista de la ficha se
--                        arma con los valores ya usados en la organización, así
--                        se pueden buscar y crear nuevos sin tabla de catálogo.
--   accion_siguiente   → próximo paso ("Llamar", "WhatsApp", "Reunión"…)
--
-- Nota: `estado` (prospecto/activo/inactivo/perdido) se mantiene: es el ciclo
-- de vida que usa la conversión a cliente. `estado_comercial` es la etapa
-- comercial dentro de ese ciclo.
-- =====================================================================

ALTER TABLE persona
    ADD COLUMN IF NOT EXISTS necesidad text;

ALTER TABLE persona
    ADD COLUMN IF NOT EXISTS estado_comercial varchar(120);

ALTER TABLE persona
    ADD COLUMN IF NOT EXISTS accion_siguiente varchar(120);

-- Backfill de "qué necesita": primera línea de observaciones (con el prefijo
-- "necesita:" que usaba la tabla), que es lo que hasta hoy se mostraba.
UPDATE persona
SET necesidad = trim(regexp_replace(split_part(observaciones, E'\n', 1), '^necesita:\s*', '', 'i'))
WHERE necesidad IS NULL
  AND observaciones IS NOT NULL
  AND trim(observaciones) <> '';
