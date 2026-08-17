-- ===================================================================================
-- 2026-08-16 · Imagen en la firma del correo
-- ===================================================================================
-- La firma era solo texto. Una firma de la firma contable normalmente lleva el
-- logo, y sin eso el correo se ve como escrito desde una casilla cualquiera.
--
-- Se guarda como data URI base64 en una columna TEXT, igual que empresa.logo_url:
-- no hace falta un servidor de archivos, la imagen viaja dentro del correo y no
-- depende de que un enlace externo siga vivo dentro de seis meses.
--
-- La imagen se achica a 400px de lado ANTES de guardarla (lo hace LogoUploader
-- en el navegador), así que pesa unos pocos KB y no infla cada envío.
--
-- Idempotente.
-- ===================================================================================

BEGIN;

ALTER TABLE correo_plantilla ADD COLUMN IF NOT EXISTS firma_imagen text;

COMMENT ON COLUMN correo_plantilla.firma_imagen IS
    'Logo de la firma como data URI base64 (data:image/png;base64,…). NULL = firma solo de texto.';

COMMIT;
