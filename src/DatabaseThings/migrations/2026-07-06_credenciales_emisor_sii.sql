-- ===================================================================================
-- MIGRACIÓN: Credenciales del EMISOR SII por organización
-- Reemplaza las variables del .env (DTE_RUT, DTE_DV, DTE_PASS, SII_PFX_PASS, DTE_CIUDAD)
-- por un almacén en base de datos, aislado por organización (cada dueño las suyas).
-- Los campos sensibles quedan encriptados.
-- ===================================================================================

CREATE TABLE IF NOT EXISTS organizacion_credenciales_sii (
    organizacion_id UUID PRIMARY KEY REFERENCES organizacion(id) ON DELETE CASCADE,
    dte_rut_encrypted   TEXT,          -- DTE_RUT (cuerpo del RUT, encriptado)
    dte_dv              VARCHAR(2),    -- DTE_DV (dígito verificador)
    dte_pass_encrypted  TEXT,          -- DTE_PASS (clave tributaria, encriptado)
    pfx_pass_encrypted  TEXT,          -- SII_PFX_PASS (clave del certificado, encriptado)
    ciudad              VARCHAR(100),  -- DTE_CIUDAD
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
