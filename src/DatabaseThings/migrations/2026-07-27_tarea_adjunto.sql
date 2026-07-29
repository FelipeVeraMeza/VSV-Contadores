-- =====================================================================
-- Migración: adjuntos de tareas guardados EN LA BASE DE DATOS (bytea)
-- Fecha: 2026-07-27 · Idempotente.
--
-- Los archivos de una tarea se almacenan directamente en Postgres (columna
-- binaria `contenido`), sin depender de disco ni servicios externos.
-- Pensado para archivos de tamaño moderado (tope de 7 MB por archivo,
-- validado en el backend por el límite de 10 MB del body JSON).
-- =====================================================================

CREATE TABLE IF NOT EXISTS tarea_adjunto (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tarea_id       uuid NOT NULL REFERENCES tarea(id) ON DELETE CASCADE,
    nombre         varchar(255) NOT NULL,
    mime           varchar(120),
    tamano         integer,
    contenido      bytea NOT NULL,
    subido_por     uuid REFERENCES usuario(id) ON DELETE SET NULL,
    usuario_nombre varchar(150),
    created_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tarea_adjunto ON tarea_adjunto (tarea_id, created_at);
