-- ===================================================================================
-- 2026-08-16 · Cada usuario con su propio remitente, firma y plantillas
-- ===================================================================================
-- POR QUÉ
-- El envío de correos salía SIEMPRE desde `RESEND_FROM`, una variable de entorno
-- única: escribiera quien escribiera, al cliente le llegaba a nombre de Matías.
-- Si Victor manda un correo de contabilidad y el cliente responde, la respuesta
-- le llega a Matías; y si Felipe escribe, el cliente no sabe con quién habla.
--
-- Lo mismo con la firma: era un texto suelto que había que reescribir en cada
-- envío, cuando en realidad cada persona tiene la suya y no cambia.
--
-- QUE ESTO SE PUEDA HACER NO ES CASUALIDAD: el dominio vsvconsultores.com quedó
-- verificado en Resend el 14-ago, y una vez verificado el dominio se puede
-- enviar desde CUALQUIER dirección de ese dominio sin configurar nada más.
-- Antes de eso esto no habría funcionado.
--
-- QUÉ SE AGREGA
--
-- 1. `usuario.correo_remitente` — desde qué dirección salen SUS correos.
-- 2. `usuario.firma_texto` / `usuario.firma_imagen` — su firma por omisión, que
--    se carga sola al redactar en vez de tener que escribirla cada vez.
-- 3. `correo_plantilla.usuario_id` — plantillas PROPIAS además de las del equipo.
--    NULL = la ve todo el equipo (como las que ya existen). Con dueño = solo esa
--    persona. Así conviven las dos cosas: lo que redactó bien alguien y se
--    comparte, y lo que cada uno usa para su día a día.
--
-- Idempotente.
-- ===================================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1 · El correo y la firma de cada persona
-- -----------------------------------------------------------------------------
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS correo_remitente varchar(160);
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS firma_texto      text;
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS firma_imagen     text;

COMMENT ON COLUMN usuario.correo_remitente IS
    'Desde qué dirección salen sus correos. Debe ser del dominio verificado (@vsvconsultores.com) o Resend lo rechaza. NULL = usa RESEND_FROM.';
COMMENT ON COLUMN usuario.firma_texto  IS 'Su firma por omisión. Se carga sola al redactar.';
COMMENT ON COLUMN usuario.firma_imagen IS 'Logo de su firma como data URI base64. NULL = firma solo de texto.';

-- -----------------------------------------------------------------------------
-- 2 · Plantillas propias además de las del equipo
-- -----------------------------------------------------------------------------
ALTER TABLE correo_plantilla
    ADD COLUMN IF NOT EXISTS usuario_id uuid REFERENCES usuario(id) ON DELETE CASCADE;

COMMENT ON COLUMN correo_plantilla.usuario_id IS
    'Dueño de la plantilla. NULL = compartida con todo el equipo de la organización.';

-- El índice único de nombre tenía que cambiar: antes prohibía dos plantillas con
-- el mismo nombre en la organización, lo que impediría que Victor y Mati tengan
-- cada uno su «Recordatorio de pago».
--
-- Se parte en dos: uno para las compartidas (sin dueño) y otro por dueño. Un
-- índice con `usuario_id` a secas no serviría, porque en SQL dos NULL no son
-- iguales entre sí y las compartidas se podrían duplicar.
DROP INDEX IF EXISTS ux_correo_plantilla_nombre;

CREATE UNIQUE INDEX IF NOT EXISTS ux_correo_plantilla_nombre_equipo
    ON correo_plantilla (organizacion_id, lower(nombre))
    WHERE usuario_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_correo_plantilla_nombre_propia
    ON correo_plantilla (usuario_id, lower(nombre))
    WHERE usuario_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_correo_plantilla_usuario
    ON correo_plantilla (usuario_id);

COMMIT;
