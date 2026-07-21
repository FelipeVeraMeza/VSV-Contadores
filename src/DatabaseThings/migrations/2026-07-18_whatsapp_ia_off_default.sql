-- ============================================================================
-- WhatsApp: la IA debe empezar SIEMPRE apagada.
-- El usuario la activa manualmente cuando quiera. Cambia el default de
-- whatsapp_sesion.auto_ia a false y apaga las sesiones existentes.
-- Idempotente.
-- ============================================================================

BEGIN;

ALTER TABLE whatsapp_sesion ALTER COLUMN auto_ia SET DEFAULT false;

-- Apaga la IA en las sesiones que ya existen (empezar en OFF).
UPDATE whatsapp_sesion SET auto_ia = false WHERE auto_ia = true;

COMMIT;
