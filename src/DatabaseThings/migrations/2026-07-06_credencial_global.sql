-- ===================================================================================
-- MIGRACIÓN: credencial_global (por USUARIO)
-- Cada usuario (admin o cliente) tiene su propio set de credenciales para facturar,
-- independiente de la empresa seleccionada. Reemplaza a organizacion_credenciales_sii.
-- ===================================================================================

CREATE TABLE IF NOT EXISTS credencial_global (
    usuario_id UUID PRIMARY KEY REFERENCES usuario(id) ON DELETE CASCADE,
    dte_rut_encrypted   TEXT,          -- DTE_RUT (cuerpo del RUT, encriptado)
    dte_dv              VARCHAR(2),    -- DTE_DV
    dte_pass_encrypted  TEXT,          -- DTE_PASS (clave tributaria, encriptado)
    pfx_pass_encrypted  TEXT,          -- SII_PFX_PASS (clave del certificado, encriptado)
    ciudad              VARCHAR(100),  -- DTE_CIUDAD
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Migrar las credenciales del emisor (que estaban por organización) al/los admin de esa org
INSERT INTO credencial_global (usuario_id, dte_rut_encrypted, dte_dv, dte_pass_encrypted, pfx_pass_encrypted, ciudad)
SELECT u.id, c.dte_rut_encrypted, c.dte_dv, c.dte_pass_encrypted, c.pfx_pass_encrypted, c.ciudad
FROM organizacion_credenciales_sii c
JOIN usuario u ON u.organizacion_id = c.organizacion_id
WHERE u.rol = 'Administrador'
ON CONFLICT (usuario_id) DO NOTHING;

-- Ya no se usa la tabla por organización
DROP TABLE IF EXISTS organizacion_credenciales_sii;
