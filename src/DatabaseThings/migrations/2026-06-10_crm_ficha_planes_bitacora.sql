-- =====================================================================
-- Migración: Ficha del Cliente — Administración de Planes y Bitácora
-- Fecha: 2026-06-10
-- Ejecutar UNA vez sobre la base de datos de producción.
-- Es idempotente (usa IF NOT EXISTS), se puede correr sin riesgo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 3.1 ADMINISTRACIÓN DE PLANES
-- ---------------------------------------------------------------------

-- Fecha del último cambio de plan en la ficha de la empresa.
ALTER TABLE empresa
    ADD COLUMN IF NOT EXISTS fecha_cambio_plan TIMESTAMP WITH TIME ZONE;

-- Historial de cambios de plan (un registro por cada cambio).
CREATE TABLE IF NOT EXISTS empresa_plan_historial (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    plan_anterior_id UUID REFERENCES plan(id) ON DELETE SET NULL,
    plan_nuevo_id UUID REFERENCES plan(id) ON DELETE SET NULL,
    plan_anterior_nombre VARCHAR(50),
    plan_nuevo_nombre VARCHAR(50),
    usuario_id UUID REFERENCES usuario(id) ON DELETE SET NULL,
    usuario_nombre VARCHAR(100),
    motivo TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_plan_historial_empresa
    ON empresa_plan_historial (empresa_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 3.2 BITÁCORA (conversaciones / tickets)
-- Estas columnas ya existen en tu BD; los ALTER son por seguridad/idempotencia.
-- tipo_mensaje: 'conversacion' | 'ticket' | 'cambio_plan' | 'servicio' | 'sistema'
-- leido: para tickets se interpreta como "resuelto"
-- ---------------------------------------------------------------------

ALTER TABLE bitacora_gestion
    ADD COLUMN IF NOT EXISTS tipo_mensaje VARCHAR(30) DEFAULT 'conversacion';
ALTER TABLE bitacora_gestion
    ADD COLUMN IF NOT EXISTS usuario_nombre VARCHAR(100);
ALTER TABLE bitacora_gestion
    ADD COLUMN IF NOT EXISTS leido BOOLEAN DEFAULT FALSE;

-- Normaliza filas antiguas que quedaron sin tipo.
UPDATE bitacora_gestion SET tipo_mensaje = 'conversacion' WHERE tipo_mensaje IS NULL;

CREATE INDEX IF NOT EXISTS idx_bitacora_empresa_tipo
    ON bitacora_gestion (empresa_id, tipo_mensaje, created_at DESC);
