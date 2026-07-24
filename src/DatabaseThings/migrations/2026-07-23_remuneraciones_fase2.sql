-- ============================================================================
-- MÓDULO DE REMUNERACIONES — FASE 2 (novedades + motor de cálculo)
--
--   • rem_movimiento_periodo       — novedades del mes por trabajador
--   • rem_liquidacion              — cabecera de la liquidación
--   • rem_liquidacion_detalle      — líneas calculadas (haberes/descuentos/aportes)
--   • rem_impuesto_tramo           — tabla impuesto único 2ª categoría por período
--   • rem_asignacion_familiar_tramo— tramos de asignación familiar por período
--
-- Multi-tenant: organizacion_id/empresa_id en todo. Idempotente.
--
-- IMPORTANTE — los tramos de impuesto y de asignación familiar sembrados son
-- PLACEHOLDER (estructura correcta, valores a confirmar con el SII/IPS del
-- período). El motor los lee desde estas tablas, así que se corrigen sin tocar
-- código. NO habilitar pago real hasta validar tramos, tasas y los flags
-- imponible/tributable de rem_concepto con el contador.
--
-- Servidor: PostgreSQL 17.6.
-- ============================================================================

BEGIN;

-- ── 1. Novedades del período (horas extra, bonos, comisiones, descuentos…) ──
CREATE TABLE IF NOT EXISTS rem_movimiento_periodo (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id UUID REFERENCES organizacion(id) ON DELETE CASCADE,
    empresa_id      UUID NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    trabajador_id   UUID NOT NULL REFERENCES rem_trabajador(id) ON DELETE CASCADE,
    periodo         DATE NOT NULL,                 -- primer día del mes
    concepto_id     UUID REFERENCES rem_concepto(id) ON DELETE SET NULL,
    codigo          VARCHAR(10),                   -- código del concepto (respaldo)
    cantidad        NUMERIC(10,2),                 -- horas o días, si aplica
    monto           NUMERIC(12,2),                 -- monto directo, si aplica
    glosa           TEXT,
    creado_por      UUID REFERENCES usuario(id) ON DELETE SET NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rem_mov_trab_periodo
    ON rem_movimiento_periodo (trabajador_id, periodo);
CREATE INDEX IF NOT EXISTS idx_rem_mov_empresa_periodo
    ON rem_movimiento_periodo (empresa_id, periodo);

-- ── 2. Cabecera de liquidación ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rem_liquidacion (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id    UUID REFERENCES organizacion(id) ON DELETE CASCADE,
    empresa_id         UUID NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    trabajador_id      UUID NOT NULL REFERENCES rem_trabajador(id) ON DELETE CASCADE,
    periodo            DATE NOT NULL,
    estado             VARCHAR(12) NOT NULL DEFAULT 'borrador'
                         CHECK (estado IN ('borrador','revisada','aprobada','pagada','anulada')),
    dias_trabajados    NUMERIC(5,2) NOT NULL DEFAULT 30,

    total_imponible        NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_no_imponible     NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_haberes          NUMERIC(12,2) NOT NULL DEFAULT 0,
    base_tributable        NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_descuentos       NUMERIC(12,2) NOT NULL DEFAULT 0,
    liquido_pagar          NUMERIC(12,2) NOT NULL DEFAULT 0,
    aportes_patronales     NUMERIC(12,2) NOT NULL DEFAULT 0,

    parametro_snapshot JSONB,       -- indicadores usados al calcular (auditoría)
    calculado_at       TIMESTAMP WITH TIME ZONE,
    aprobado_por       UUID REFERENCES usuario(id) ON DELETE SET NULL,
    aprobado_at        TIMESTAMP WITH TIME ZONE,
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- Una liquidación por trabajador y período.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rem_liquidacion_trab_periodo
    ON rem_liquidacion (trabajador_id, periodo);
CREATE INDEX IF NOT EXISTS idx_rem_liquidacion_empresa_periodo
    ON rem_liquidacion (empresa_id, periodo);

-- ── 3. Detalle de liquidación (líneas) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS rem_liquidacion_detalle (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    liquidacion_id UUID NOT NULL REFERENCES rem_liquidacion(id) ON DELETE CASCADE,
    concepto_id    UUID REFERENCES rem_concepto(id) ON DELETE SET NULL,
    codigo         VARCHAR(10),
    descripcion    VARCHAR(120) NOT NULL,
    naturaleza     VARCHAR(10) NOT NULL CHECK (naturaleza IN ('HABER','DESCUENTO','APORTE')),
    imponible      BOOLEAN NOT NULL DEFAULT FALSE,
    tributable     BOOLEAN NOT NULL DEFAULT FALSE,
    monto          NUMERIC(12,2) NOT NULL DEFAULT 0,
    orden          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_rem_liq_detalle_liq
    ON rem_liquidacion_detalle (liquidacion_id, orden);

-- ── 4. Tramos del impuesto único de 2ª categoría (por período, en UTM) ──────
CREATE TABLE IF NOT EXISTS rem_impuesto_tramo (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    periodo    DATE NOT NULL,
    tramo      INTEGER NOT NULL,
    desde_utm  NUMERIC(8,2) NOT NULL,
    hasta_utm  NUMERIC(8,2),            -- NULL = sin tope (último tramo)
    factor     NUMERIC(6,4) NOT NULL,   -- factor multiplicador
    rebaja_utm NUMERIC(8,4) NOT NULL,   -- cantidad a rebajar (en UTM)
    UNIQUE (periodo, tramo)
);

-- ── 5. Tramos de asignación familiar (por período) ──────────────────────────
CREATE TABLE IF NOT EXISTS rem_asignacion_familiar_tramo (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    periodo   DATE NOT NULL,
    tramo     VARCHAR(2) NOT NULL,       -- A / B / C / D
    renta_max NUMERIC(12,2),             -- NULL = sin tope (tramo D)
    monto     NUMERIC(12,2) NOT NULL,
    UNIQUE (periodo, tramo)
);

-- ============================================================================
-- SEEDS (PLACEHOLDER — validar con SII/IPS del período)
-- ============================================================================

-- 6. Impuesto único mensual — estructura oficial (8 tramos), factores estándar.
INSERT INTO rem_impuesto_tramo (periodo, tramo, desde_utm, hasta_utm, factor, rebaja_utm) VALUES
    ('2026-07-01', 1,   0.00,  13.50, 0.0000,  0.0000),
    ('2026-07-01', 2,  13.50,  30.00, 0.0400,  0.5400),
    ('2026-07-01', 3,  30.00,  50.00, 0.0800,  1.7400),
    ('2026-07-01', 4,  50.00,  70.00, 0.1350,  4.4900),
    ('2026-07-01', 5,  70.00,  90.00, 0.2300, 11.1400),
    ('2026-07-01', 6,  90.00, 120.00, 0.3040, 17.8000),
    ('2026-07-01', 7, 120.00, 310.00, 0.3500, 23.3200),
    ('2026-07-01', 8, 310.00,   NULL, 0.4000, 38.8200)
ON CONFLICT (periodo, tramo) DO NOTHING;

-- 7. Asignación familiar — 4 tramos (A/B/C/D).
INSERT INTO rem_asignacion_familiar_tramo (periodo, tramo, renta_max, monto) VALUES
    ('2026-07-01', 'A',  620251.00, 22007.00),
    ('2026-07-01', 'B',  905941.00, 13505.00),
    ('2026-07-01', 'C', 1412957.00,  4267.00),
    ('2026-07-01', 'D',        NULL,     0.00)
ON CONFLICT (periodo, tramo) DO NOTHING;

COMMIT;
