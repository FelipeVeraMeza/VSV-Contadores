-- =====================================================================
-- Migración: Mejoras de Prospectos (persona)
-- Fecha: 2026-07-10 · Idempotente (IF NOT EXISTS).
-- =====================================================================

-- Aislamiento multi-tenant: cada prospecto pertenece a una organización.
ALTER TABLE persona
    ADD COLUMN IF NOT EXISTS organizacion_id uuid;
CREATE INDEX IF NOT EXISTS idx_persona_organizacion ON persona (organizacion_id);

-- Seguimiento comercial: próxima acción y consentimiento de contacto.
ALTER TABLE persona
    ADD COLUMN IF NOT EXISTS proximo_contacto date;
ALTER TABLE persona
    ADD COLUMN IF NOT EXISTS consentimiento_contacto boolean DEFAULT true;

-- Índice para la alerta de "próxima acción vencida".
CREATE INDEX IF NOT EXISTS idx_persona_proximo_contacto
    ON persona (proximo_contacto) WHERE proximo_contacto IS NOT NULL;
