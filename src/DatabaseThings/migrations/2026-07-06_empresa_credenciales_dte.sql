-- ===================================================================================
-- MIGRACIÓN: Campos DTE faltantes en empresa_credenciales
-- Cada empresa del cliente guarda su set completo de emisor:
--   DTE_RUT  -> sii_rut_encrypted        (ya existía)
--   DTE_PASS -> sii_password_encrypted   (ya existía)
--   DTE_DV, SII_PFX_PASS, DTE_CIUDAD     (se agregan aquí)
-- ===================================================================================

ALTER TABLE empresa_credenciales ADD COLUMN IF NOT EXISTS dte_dv VARCHAR(2);
ALTER TABLE empresa_credenciales ADD COLUMN IF NOT EXISTS pfx_pass_encrypted TEXT;
ALTER TABLE empresa_credenciales ADD COLUMN IF NOT EXISTS ciudad VARCHAR(100);
