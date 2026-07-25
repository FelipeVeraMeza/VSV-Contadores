-- ============================================================================
-- MÓDULO DE REMUNERACIONES — FASE 6 (vacaciones y finiquitos)
--
--   • rem_vacaciones — movimientos de vacaciones (consumo/ajuste) por trabajador
--   • rem_finiquito  — cálculo y estado del finiquito por término de contrato
--
-- Saldo de vacaciones = devengado (según antigüedad) − tomadas (ficha + consumos).
-- Finiquito = vacaciones proporcionales + indemnización años de servicio +
--             indemnización sustitutiva del aviso previo (según causal).
--
-- IMPORTANTE: los montos de finiquito son un cálculo BASE (Código del Trabajo,
-- simplificado). Validar con el abogado/contador antes de emitir el documento
-- legal (topes 90 UF / 11 años, semana corrida, última remuneración, etc.).
--
-- Servidor: PostgreSQL 17.6. Idempotente.
-- ============================================================================

BEGIN;

-- 1. Movimientos de vacaciones (consumo de días o ajustes manuales).
CREATE TABLE IF NOT EXISTS rem_vacaciones (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id UUID REFERENCES organizacion(id) ON DELETE CASCADE,
    empresa_id      UUID NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    trabajador_id   UUID NOT NULL REFERENCES rem_trabajador(id) ON DELETE CASCADE,
    tipo            VARCHAR(12) NOT NULL DEFAULT 'consumo' CHECK (tipo IN ('consumo', 'ajuste')),
    dias            NUMERIC(6,2) NOT NULL,        -- días hábiles tomados (o ajuste +/-)
    fecha_desde     DATE,
    fecha_hasta     DATE,
    glosa           TEXT,
    creado_por      UUID REFERENCES usuario(id) ON DELETE SET NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rem_vacaciones_trab ON rem_vacaciones (trabajador_id);
CREATE INDEX IF NOT EXISTS idx_rem_vacaciones_empresa ON rem_vacaciones (empresa_id);

-- 2. Finiquitos.
CREATE TABLE IF NOT EXISTS rem_finiquito (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id     UUID REFERENCES organizacion(id) ON DELETE CASCADE,
    empresa_id          UUID NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    trabajador_id       UUID NOT NULL REFERENCES rem_trabajador(id) ON DELETE CASCADE,
    fecha_termino       DATE NOT NULL,
    causal              VARCHAR(20) NOT NULL,       -- art_159_x / art_160 / art_161_x
    dio_aviso           BOOLEAN NOT NULL DEFAULT FALSE,
    meses_servicio      INTEGER,
    anos_servicio       INTEGER,
    dias_vac_pendientes NUMERIC(6,2),
    vac_proporcional    NUMERIC(12,2) NOT NULL DEFAULT 0,
    indem_anos          NUMERIC(12,2) NOT NULL DEFAULT 0,
    indem_aviso         NUMERIC(12,2) NOT NULL DEFAULT 0,
    otros_haberes       NUMERIC(12,2) NOT NULL DEFAULT 0,
    descuentos          NUMERIC(12,2) NOT NULL DEFAULT 0,
    total               NUMERIC(12,2) NOT NULL DEFAULT 0,
    estado              VARCHAR(12) NOT NULL DEFAULT 'borrador'
                          CHECK (estado IN ('borrador', 'aprobado', 'pagado', 'anulado')),
    snapshot            JSONB,
    creado_por          UUID REFERENCES usuario(id) ON DELETE SET NULL,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rem_finiquito_empresa ON rem_finiquito (empresa_id);
CREATE INDEX IF NOT EXISTS idx_rem_finiquito_trab ON rem_finiquito (trabajador_id);

COMMIT;
