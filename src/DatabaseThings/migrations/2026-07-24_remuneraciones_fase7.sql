-- ============================================================================
-- MÓDULO DE REMUNERACIONES — FASE 7 (haberes/descuentos fijos + licencias médicas)
--
--   • rem_haber_descuento_fijo — conceptos recurrentes por trabajador (se aplican
--                                automáticamente en cada liquidación mientras estén
--                                vigentes). Ej: colación fija, bono fijo, cuota
--                                sindical, préstamo en cuotas.
--   • rem_licencia_medica      — días de licencia del trabajador en un período.
--                                Reducen los días trabajados → el líquido se
--                                recalcula de inmediato al generar la liquidación.
--
-- Distinción de novedades:
--   - FIJOS    → rem_haber_descuento_fijo (recurrentes, todos los meses).
--   - MENSUALES→ rem_movimiento_periodo (variables de un mes puntual, Fase 2).
--
-- Multi-tenant: organizacion_id/empresa_id en todo. Idempotente.
-- Servidor: PostgreSQL 17.6.
-- ============================================================================

BEGIN;

-- ── 1. Haberes / descuentos fijos (recurrentes) por trabajador ──────────────
CREATE TABLE IF NOT EXISTS rem_haber_descuento_fijo (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id UUID REFERENCES organizacion(id) ON DELETE CASCADE,
    empresa_id      UUID NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    trabajador_id   UUID NOT NULL REFERENCES rem_trabajador(id) ON DELETE CASCADE,
    concepto_id     UUID REFERENCES rem_concepto(id) ON DELETE SET NULL,
    codigo          VARCHAR(10),                 -- respaldo del código del concepto
    monto           NUMERIC(12,2) NOT NULL DEFAULT 0,
    glosa           TEXT,
    vigencia_desde  DATE,                        -- NULL = desde siempre
    vigencia_hasta  DATE,                        -- NULL = sin término
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    creado_por      UUID REFERENCES usuario(id) ON DELETE SET NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rem_fijo_trabajador
    ON rem_haber_descuento_fijo (trabajador_id, activo);
CREATE INDEX IF NOT EXISTS idx_rem_fijo_empresa
    ON rem_haber_descuento_fijo (empresa_id);

-- ── 2. Licencias médicas ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rem_licencia_medica (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id UUID REFERENCES organizacion(id) ON DELETE CASCADE,
    empresa_id      UUID NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    trabajador_id   UUID NOT NULL REFERENCES rem_trabajador(id) ON DELETE CASCADE,
    periodo         DATE NOT NULL,               -- primer día del mes afectado
    tipo            VARCHAR(20) NOT NULL DEFAULT 'comun'
                      CHECK (tipo IN ('comun','maternal','laboral','prorroga')),
    folio           VARCHAR(40),
    fecha_inicio    DATE,
    fecha_fin       DATE,
    dias            NUMERIC(5,2) NOT NULL DEFAULT 0,   -- días de licencia en el período
    glosa           TEXT,
    creado_por      UUID REFERENCES usuario(id) ON DELETE SET NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rem_licencia_trab_periodo
    ON rem_licencia_medica (trabajador_id, periodo);
CREATE INDEX IF NOT EXISTS idx_rem_licencia_empresa_periodo
    ON rem_licencia_medica (empresa_id, periodo);

COMMIT;
