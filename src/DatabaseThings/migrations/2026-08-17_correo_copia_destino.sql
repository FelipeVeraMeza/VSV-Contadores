-- ===================================================================================
-- 2026-08-17 · La copia oculta va a su propia dirección
-- ===================================================================================
-- La copia oculta se mandaba al mismo `correo_respuesta`, con el argumento de que
-- son la misma casilla y dos campos solo se desincronizan. Resultó que no:
--
--   · `correo_respuesta` es donde la persona LEE, para no perder lo que contesta
--     el cliente. Suele ser un Gmail.
--   · la copia es el ARCHIVO de lo que salió, y se quiere en la casilla
--     institucional (matias.olivos@vsvconsultores.com), que es otra cosa.
--
-- Son dos propósitos distintos, así que van dos campos. Si `correo_copia` está
-- vacío se usa `correo_respuesta`, que es como funcionaba hasta ahora.
--
-- ⚠️ OJO CON EL DESTINO: el MX de vsvconsultores.com apunta a DonWeb, no a
-- Google. Una copia a una dirección de ese dominio NO llega a Gmail: queda en el
-- buzón del hosting. Si la idea es tenerlas en Gmail, la dirección tiene que ser
-- la de Gmail, o esa casilla tiene que reenviar.
--
-- Idempotente.
-- ===================================================================================

BEGIN;

ALTER TABLE usuario ADD COLUMN IF NOT EXISTS correo_copia varchar(160);

COMMENT ON COLUMN usuario.correo_copia IS
    'A dónde va la copia oculta (BCC) de cada envío. NULL = se usa correo_respuesta. Distinto de correo_respuesta a propósito: uno es el archivo, el otro es donde se leen las respuestas.';

COMMIT;
