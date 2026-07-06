-- ===================================================================================
-- MIGRACIÓN: Multi-tenant por Organización (Opción A)
-- Cada organización es un "dueño" aislado. usuario y empresa pertenecen a una org.
-- Todas las consultas de empresas se filtran por organizacion_id.
-- ===================================================================================

-- 1. Tabla de organizaciones (tenants)
CREATE TABLE IF NOT EXISTS organizacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Columna organizacion_id en usuario y empresa
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS organizacion_id UUID REFERENCES organizacion(id) ON DELETE SET NULL;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS organizacion_id UUID REFERENCES organizacion(id) ON DELETE SET NULL;

-- 3. Índices para el filtro de tenant (rendimiento)
CREATE INDEX IF NOT EXISTS idx_empresa_organizacion ON empresa (organizacion_id);
CREATE INDEX IF NOT EXISTS idx_usuario_organizacion ON usuario (organizacion_id);

-- 4. Organización principal (la del dueño actual) — solo se crea si no existe ya
INSERT INTO organizacion (nombre)
SELECT 'VOLLAIRE & OLIVOS SIMPLE PYME LTDA'
WHERE NOT EXISTS (SELECT 1 FROM organizacion);

-- 5. Migrar TODO lo existente a esa organización principal
UPDATE usuario
SET organizacion_id = (SELECT id FROM organizacion ORDER BY created_at ASC LIMIT 1)
WHERE organizacion_id IS NULL;

UPDATE empresa
SET organizacion_id = (SELECT id FROM organizacion ORDER BY created_at ASC LIMIT 1)
WHERE organizacion_id IS NULL;
