-- ============================================================================
-- MÓDULO DE REMUNERACIONES — Asistencia (registro de jornada por período)
--
--   • rem_asistencia_periodo — resumen mensual de asistencia por trabajador:
--     días trabajados, ausencias, atrasos y horas extra. Es un registro de
--     control (informativo); NO altera automáticamente la liquidación para no
--     duplicar con licencias/novedades.
--
-- Multi-tenant: organizacion_id/empresa_id. Idempotente. PostgreSQL 17.6.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS rem_asistencia_periodo (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id UUID REFERENCES organizacion(id) ON DELETE CASCADE,
    empresa_id      UUID NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    trabajador_id   UUID NOT NULL REFERENCES rem_trabajador(id) ON DELETE CASCADE,
    periodo         DATE NOT NULL,                 -- primer día del mes
    dias_trabajados NUMERIC(5,2) NOT NULL DEFAULT 30,
    dias_ausente    NUMERIC(5,2) NOT NULL DEFAULT 0,
    atrasos_min     INTEGER      NOT NULL DEFAULT 0,   -- minutos de atraso acumulados
    horas_extra     NUMERIC(6,2) NOT NULL DEFAULT 0,
    obs             TEXT,
    creado_por      UUID REFERENCES usuario(id) ON DELETE SET NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rem_asistencia_trab_periodo
    ON rem_asistencia_periodo (trabajador_id, periodo);
CREATE INDEX IF NOT EXISTS idx_rem_asistencia_empresa_periodo
    ON rem_asistencia_periodo (empresa_id, periodo);

COMMIT;
