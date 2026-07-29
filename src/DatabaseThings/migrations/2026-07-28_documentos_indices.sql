-- ============================================================================
-- Índices de los libros de compras y ventas + documentación del modelo
-- ----------------------------------------------------------------------------
-- MODELO (verificado en la BD, no cambiarlo sin revisar los datos):
--
--   documentos_emitidos          → VENTAS de la firma (VOLLAIRE & OLIVOS SIMPLE
--                                  PYME LTDA). El emisor es siempre la firma; la
--                                  columna empresa_id apunta al CLIENTE facturado
--                                  (así el Cobro del Mes enlaza factura ↔ cliente).
--   documentos_recibidos         → COMPRAS de la firma. empresa_id = la firma.
--
--   documentos_emitidos_empresa  → VENTAS de las demás empresas.  empresa_id = dueño.
--   documentos_recibidos_empresa → COMPRAS de las demás empresas. empresa_id = dueño.
--
-- O sea: el libro se elige por QUÉ empresa está seleccionada (la principal o no),
-- no por si hay o no una empresa seleccionada. Ver esLibroDeLaFirma() en
-- src/controllers/dteConsulta.controllers.js.
-- ============================================================================

CREATE INDEX IF NOT EXISTS documentos_emitidos_empresa_fecha_idx
    ON documentos_emitidos (empresa_id, fecha_emision DESC);
CREATE INDEX IF NOT EXISTS documentos_recibidos_empresa_fecha_idx
    ON documentos_recibidos (empresa_id, fecha_emision DESC);
CREATE INDEX IF NOT EXISTS documentos_emitidos_emp_empresa_fecha_idx
    ON documentos_emitidos_empresa (empresa_id, fecha_emision DESC);
CREATE INDEX IF NOT EXISTS documentos_recibidos_emp_empresa_fecha_idx
    ON documentos_recibidos_empresa (empresa_id, fecha_emision DESC);
