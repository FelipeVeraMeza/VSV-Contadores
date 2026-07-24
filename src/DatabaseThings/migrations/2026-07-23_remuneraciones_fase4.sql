-- ============================================================================
-- MÓDULO DE REMUNERACIONES — FASE 4 (centralización contable)
--
--   • rem_centralizacion — vínculo (empresa, período) ↔ comprobante contable
--   • rem_config_empresa  — columnas para el mapeo de cuentas contables
--
-- La centralización toma las liquidaciones aprobadas de un período y genera UN
-- comprobante en `comprobantes` (+ `comprobantes_detalle`), reutilizando el
-- correlativo por empresa del sistema. Idempotente por (empresa, período).
--
-- Servidor: PostgreSQL 17.6.
-- ============================================================================

BEGIN;

-- 1. Mapeo de cuentas contables de remuneraciones por empresa.
ALTER TABLE rem_config_empresa
    ADD COLUMN IF NOT EXISTS cuenta_sueldos     VARCHAR(50),  -- gasto: haberes
    ADD COLUMN IF NOT EXISTS cuenta_aportes     VARCHAR(50),  -- gasto: aportes patronales
    ADD COLUMN IF NOT EXISTS cuenta_afp         VARCHAR(50),  -- pasivo: AFP/previsión (incl. SIS)
    ADD COLUMN IF NOT EXISTS cuenta_salud       VARCHAR(50),  -- pasivo: salud/isapre
    ADD COLUMN IF NOT EXISTS cuenta_cesantia    VARCHAR(50),  -- pasivo: seguro de cesantía (AFC)
    ADD COLUMN IF NOT EXISTS cuenta_impuesto    VARCHAR(50),  -- pasivo: impuesto único
    ADD COLUMN IF NOT EXISTS cuenta_mutual      VARCHAR(50),  -- pasivo: mutual
    ADD COLUMN IF NOT EXISTS cuenta_otros_desc  VARCHAR(50);  -- pasivo: otros descuentos
-- (cuenta_liquido_pagar ya existe: pasivo del líquido por pagar)

-- 2. Registro de centralización: un comprobante por empresa y período.
CREATE TABLE IF NOT EXISTS rem_centralizacion (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id    UUID REFERENCES organizacion(id) ON DELETE CASCADE,
    empresa_id         UUID NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    periodo            DATE NOT NULL,
    comprobante_id     UUID REFERENCES comprobantes(id) ON DELETE CASCADE,
    numero_comprobante INTEGER,
    total_debe         NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_haber        NUMERIC(14,2) NOT NULL DEFAULT 0,
    creado_por         UUID REFERENCES usuario(id) ON DELETE SET NULL,
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rem_centralizacion_empresa_periodo
    ON rem_centralizacion (empresa_id, periodo);

COMMIT;
