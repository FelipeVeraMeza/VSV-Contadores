-- ===================================================================================
-- 2026-08-17 · A dónde contesta el cliente
-- ===================================================================================
-- EL PROBLEMA
-- Los correos salen desde una dirección @vsvconsultores.com, porque es el dominio
-- verificado en Resend y es lo que el cliente tiene que ver. Pero el buzón de ese
-- dominio vive en el servidor del hosting (el MX de vsvconsultores.com apunta a
-- DonWeb, no a Google), y nadie lo lee.
--
-- Resultado: **las respuestas de los clientes no llegaban a ninguna parte**. El
-- correo salía bien, el cliente contestaba, y esa respuesta caía en una casilla
-- que nadie abre. Sin error, sin rebote, sin nada que avisara.
--
-- LA SOLUCIÓN
-- La cabecera `Reply-To`, que es exactamente para esto: el correo se ve enviado
-- desde la dirección de la firma, pero al responder el cliente le escribe a donde
-- uno de verdad lee.
--
-- POR QUÉ POR USUARIO Y NO UNA VARIABLE DE ENTORNO
-- Cada uno lee su propio correo. Si Victor manda un aviso de contabilidad, la
-- respuesta tiene que llegarle a Victor, no a una casilla común. Es la misma
-- razón por la que `correo_remitente` ya es por usuario.
--
-- POR QUÉ NO SE VALIDA EL DOMINIO ACÁ
-- `correo_remitente` SÍ tiene que ser @vsvconsultores.com, porque Resend rechaza
-- enviar desde un dominio sin verificar. `correo_respuesta` es al revés: la
-- gracia es justamente que pueda ser un Gmail, que es donde la persona lee.
--
-- Idempotente.
-- ===================================================================================

BEGIN;

ALTER TABLE usuario ADD COLUMN IF NOT EXISTS correo_respuesta varchar(160);

COMMENT ON COLUMN usuario.correo_respuesta IS
    'Reply-To: a dónde le llegan las respuestas de los clientes. Puede ser de cualquier dominio (normalmente un Gmail) — a diferencia de correo_remitente, que debe ser del dominio verificado. NULL = el cliente responde al remitente, y esa casilla puede no leerla nadie.';

COMMIT;
