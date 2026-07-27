-- =====================================================================
-- Migración: Tareas / actividades del CRM + meta mensual
-- Fecha: 2026-07-22 · Idempotente.
--
-- Una sola tabla `tarea` respalda tareas, reuniones, llamadas, tickets y
-- cualquier actividad agendable. La usan el Dashboard (tareas por prioridad,
-- vencidas, calendario), el panel de WhatsApp (acciones rápidas) y la
-- automatización con IA (seguimientos programados).
-- =====================================================================

CREATE TABLE IF NOT EXISTS tarea (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id  uuid,
    persona_id       uuid REFERENCES persona(id) ON DELETE CASCADE,
    empresa_id       uuid REFERENCES empresa(id) ON DELETE SET NULL,
    titulo           varchar(200) NOT NULL,
    descripcion      text,
    -- tarea | reunion | llamada | whatsapp | correo | ticket
    tipo             varchar(20) NOT NULL DEFAULT 'tarea',
    -- alta | media | baja
    prioridad        varchar(10) NOT NULL DEFAULT 'media',
    -- pendiente | completada | cancelada
    estado           varchar(12) NOT NULL DEFAULT 'pendiente',
    responsable_id   uuid REFERENCES usuario(id) ON DELETE SET NULL,
    vence_at         timestamptz,
    -- manual | ia  (para registrar la trazabilidad de acciones de la IA)
    origen           varchar(20) NOT NULL DEFAULT 'manual',
    creado_por       uuid REFERENCES usuario(id) ON DELETE SET NULL,
    created_at       timestamptz DEFAULT now(),
    completed_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_tarea_org        ON tarea (organizacion_id);
CREATE INDEX IF NOT EXISTS idx_tarea_persona    ON tarea (persona_id);
CREATE INDEX IF NOT EXISTS idx_tarea_responsable ON tarea (responsable_id);
CREATE INDEX IF NOT EXISTS idx_tarea_vence      ON tarea (vence_at) WHERE estado = 'pendiente';

-- Configuración del CRM por organización (meta mensual de ventas, etc.)
CREATE TABLE IF NOT EXISTS crm_config (
    organizacion_id  uuid PRIMARY KEY,
    meta_mensual     numeric DEFAULT 0,
    updated_at       timestamptz DEFAULT now()
);
