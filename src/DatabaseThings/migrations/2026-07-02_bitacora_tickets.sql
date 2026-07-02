-- =====================================================================
-- Migración: Bitácora / Tickets — prioridad, responsable y vencimiento
-- Fecha: 2026-07-02
-- Idempotente (IF NOT EXISTS). Se puede correr sin riesgo.
-- =====================================================================

-- Prioridad del ticket: 'Alta' | 'Media' | 'Baja'
ALTER TABLE bitacora_gestion
    ADD COLUMN IF NOT EXISTS prioridad VARCHAR(10);

-- Responsable asignado (nombre visible; opcionalmente id de usuario)
ALTER TABLE bitacora_gestion
    ADD COLUMN IF NOT EXISTS responsable_nombre VARCHAR(100);
ALTER TABLE bitacora_gestion
    ADD COLUMN IF NOT EXISTS responsable_id UUID REFERENCES usuario(id) ON DELETE SET NULL;

-- Fecha de vencimiento del ticket
ALTER TABLE bitacora_gestion
    ADD COLUMN IF NOT EXISTS fecha_vencimiento TIMESTAMP WITH TIME ZONE;

-- Marca de edición (para saber si una nota fue modificada)
ALTER TABLE bitacora_gestion
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_bitacora_vencimiento
    ON bitacora_gestion (fecha_vencimiento)
    WHERE fecha_vencimiento IS NOT NULL;
