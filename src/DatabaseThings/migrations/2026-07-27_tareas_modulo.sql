-- =====================================================================
-- Migración: Módulo de Tareas / Proyectos (subtareas, colaboradores, comentarios)
-- Fecha: 2026-07-27 · Idempotente.
--
-- Amplía la tabla `tarea` (ya usada por el CRM/Dashboard) para soportar un
-- módulo completo de tareas: proyectos que las agrupan, subtareas
-- (parent_id), colaboradores, comentarios y el estado "en_proceso".
-- =====================================================================

-- Proyectos: repositorios que agrupan tareas.
CREATE TABLE IF NOT EXISTS proyecto (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id  uuid,
    nombre           varchar(150) NOT NULL,
    descripcion      text,
    color            varchar(20) DEFAULT '#199b4d',
    estado           varchar(12) NOT NULL DEFAULT 'activo', -- activo | archivado
    creado_por       uuid REFERENCES usuario(id) ON DELETE SET NULL,
    created_at       timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_proyecto_org ON proyecto (organizacion_id);

-- Tarea: proyecto, subtarea (parent) y descripción ya existente.
ALTER TABLE tarea ADD COLUMN IF NOT EXISTS proyecto_id uuid REFERENCES proyecto(id) ON DELETE SET NULL;
ALTER TABLE tarea ADD COLUMN IF NOT EXISTS parent_id   uuid REFERENCES tarea(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_tarea_proyecto ON tarea (proyecto_id);
CREATE INDEX IF NOT EXISTS idx_tarea_parent   ON tarea (parent_id);
-- El estado 'en_proceso' se admite en el backend (la columna es varchar, sin
-- restricción CHECK, así que no requiere cambio de esquema).

-- Colaboradores de una tarea (además del responsable).
CREATE TABLE IF NOT EXISTS tarea_colaborador (
    tarea_id    uuid NOT NULL REFERENCES tarea(id) ON DELETE CASCADE,
    usuario_id  uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    PRIMARY KEY (tarea_id, usuario_id)
);

-- Comentarios entre colaboradores.
CREATE TABLE IF NOT EXISTS tarea_comentario (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tarea_id       uuid NOT NULL REFERENCES tarea(id) ON DELETE CASCADE,
    usuario_id     uuid REFERENCES usuario(id) ON DELETE SET NULL,
    usuario_nombre varchar(150),
    texto          text NOT NULL,
    created_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tarea_comentario ON tarea_comentario (tarea_id, created_at);
