-- ============================================================================
-- WhatsApp: correcciones RF-14 y RF-06
-- ----------------------------------------------------------------------------
-- RF-14 (/reiniciar): el historial de la IA se reconstruye desde los mensajes
--   guardados, así que "reiniciar" no puede ser borrar el chat (perderíamos el
--   historial que el humano necesita ver). En su lugar marcamos un corte: la IA
--   solo mira los mensajes posteriores a ia_reset_at.
--
-- RF-06 (estado de entrega): no requiere cambios de esquema — la columna
--   whatsapp_mensaje.estado ya existe; solo faltaba escuchar los recibos.
--
-- Idempotente. Aplicar con:
--   node src/DatabaseThings/migrations/aplicar_migracion.mjs src/DatabaseThings/migrations/2026-07-16_whatsapp_fixes.sql
-- ============================================================================

BEGIN;

-- Corte del historial para la IA (NULL = ve todo el hilo)
ALTER TABLE whatsapp_conversacion
    ADD COLUMN IF NOT EXISTS ia_reset_at timestamptz;

COMMENT ON COLUMN whatsapp_conversacion.ia_reset_at IS
    'Si está seteada, la IA solo considera mensajes posteriores a esta fecha (comando /reiniciar).';

COMMIT;
