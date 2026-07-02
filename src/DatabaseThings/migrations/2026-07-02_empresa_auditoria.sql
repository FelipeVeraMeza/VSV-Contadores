-- =====================================================================
-- Migración: Auditoría de ediciones sobre el cliente (empresa)
-- Fecha: 2026-07-02
-- Idempotente. Registra quién creó/editó cada cliente y cuándo.
-- =====================================================================

CREATE TABLE IF NOT EXISTS empresa_auditoria (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id    uuid REFERENCES empresa(id) ON DELETE CASCADE,
    usuario_id    uuid REFERENCES usuario(id) ON DELETE SET NULL,
    usuario_nombre varchar(100),
    accion        varchar(30) NOT NULL,   -- 'crear' | 'editar' | 'eliminar'
    detalle       text,
    created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_empresa_auditoria_empresa
    ON empresa_auditoria (empresa_id, created_at DESC);
