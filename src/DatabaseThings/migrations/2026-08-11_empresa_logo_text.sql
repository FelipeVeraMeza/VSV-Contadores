-- ============================================================================
-- Logo del cliente: ampliar empresa.logo_url para poder guardar la imagen
-- ----------------------------------------------------------------------------
-- La columna era varchar(255), pensada para una URL. Se decidió guardar el logo
-- como imagen embebida (data URI en base64) directamente en la base, igual que
-- los adjuntos de tareas viven en la base. Un data URI de una imagen chica son
-- decenas de miles de caracteres, así que 255 no alcanza.
--
-- Cambiar a TEXT es no destructivo: la columna está vacía en las 216 empresas.
-- ============================================================================
ALTER TABLE empresa
  ALTER COLUMN logo_url TYPE TEXT;
