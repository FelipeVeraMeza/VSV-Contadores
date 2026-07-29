-- =====================================================================
--  Referencia de las notas de crédito / débito a su documento original
--  2026-07-29
--
--  Problema: una nota de crédito (DTE 61) anula o corrige una factura,
--  pero no guardábamos CUÁL. Sin ese dato el ciclo de cobro no puede
--  descontarlas y un cobro cuya factura se anuló sigue figurando cobrado.
--  Al 2026-07-29 eran 112 notas por $6.467.956 sin descontar.
--
--  Los folios de nota de crédito son una serie APARTE que arranca en 1,
--  así que chocan con los folios de factura. Por eso la referencia guarda
--  folio + tipo de DTE, nunca el folio solo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Referencia en el libro de VENTAS
-- ---------------------------------------------------------------------
ALTER TABLE documentos_emitidos
    ADD COLUMN IF NOT EXISTS folio_ref    BIGINT,
    ADD COLUMN IF NOT EXISTS tipo_dte_ref INTEGER,
    ADD COLUMN IF NOT EXISTS cod_ref      SMALLINT,
    ADD COLUMN IF NOT EXISTS ref_origen   VARCHAR(10);

COMMENT ON COLUMN documentos_emitidos.folio_ref    IS 'Folio del documento que esta nota afecta';
COMMENT ON COLUMN documentos_emitidos.tipo_dte_ref IS 'Tipo del documento afectado (33 factura, 34 exenta)';
COMMENT ON COLUMN documentos_emitidos.cod_ref      IS 'Código SII: 1 anula, 2 corrige texto, 3 corrige montos';
COMMENT ON COLUMN documentos_emitidos.ref_origen   IS 'robot = capturado del SII al emitir (certero) | backfill = inferido por monto y fecha (probable) | manual = corregido a mano';

-- Sólo las notas pueden referenciar; el resto va en NULL.
ALTER TABLE documentos_emitidos DROP CONSTRAINT IF EXISTS chk_emitidos_ref_solo_notas;
ALTER TABLE documentos_emitidos ADD CONSTRAINT chk_emitidos_ref_solo_notas
    CHECK (folio_ref IS NULL OR tipo_dte IN (56, 61));

ALTER TABLE documentos_emitidos DROP CONSTRAINT IF EXISTS chk_emitidos_ref_completa;
ALTER TABLE documentos_emitidos ADD CONSTRAINT chk_emitidos_ref_completa
    CHECK ((folio_ref IS NULL AND tipo_dte_ref IS NULL)
        OR (folio_ref IS NOT NULL AND tipo_dte_ref IS NOT NULL));

ALTER TABLE documentos_emitidos DROP CONSTRAINT IF EXISTS chk_emitidos_ref_origen;
ALTER TABLE documentos_emitidos ADD CONSTRAINT chk_emitidos_ref_origen
    CHECK (ref_origen IS NULL OR ref_origen IN ('robot', 'backfill', 'manual'));

-- Para resolver "¿esta factura fue anulada?" sin escanear la tabla entera.
CREATE INDEX IF NOT EXISTS idx_emitidos_referencia
    ON documentos_emitidos (empresa_id, tipo_dte_ref, folio_ref)
    WHERE folio_ref IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2. Lo mismo en el libro de COMPRAS (notas que nos emiten a nosotros)
-- ---------------------------------------------------------------------
ALTER TABLE documentos_recibidos
    ADD COLUMN IF NOT EXISTS folio_ref    BIGINT,
    ADD COLUMN IF NOT EXISTS tipo_dte_ref INTEGER,
    ADD COLUMN IF NOT EXISTS cod_ref      SMALLINT,
    ADD COLUMN IF NOT EXISTS ref_origen   VARCHAR(10);

CREATE INDEX IF NOT EXISTS idx_recibidos_referencia
    ON documentos_recibidos (empresa_id, tipo_dte_ref, folio_ref)
    WHERE folio_ref IS NOT NULL;

-- ---------------------------------------------------------------------
-- 3. El ciclo de cobro necesita poder decir "esta se anuló"
-- ---------------------------------------------------------------------
ALTER TABLE cobro_mensual
    ADD COLUMN IF NOT EXISTS monto_anulado NUMERIC(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN cobro_mensual.monto_anulado IS 'Neto devuelto por notas de crédito que afectan al folio de este cobro';

ALTER TABLE cobro_mensual DROP CONSTRAINT IF EXISTS cobro_mensual_estado_check;
ALTER TABLE cobro_mensual ADD CONSTRAINT cobro_mensual_estado_check
    CHECK (estado IN ('POR_EMITIR', 'PENDIENTE_PAGO', 'PAGADA', 'PENDIENTE_RECIBO', 'ANULADA'));

-- ---------------------------------------------------------------------
-- 4. Vista de ingreso real: lo facturado menos lo anulado
--    Es la fuente para cualquier reporte de ventas. Nunca sumar
--    documentos_emitidos sin restar las notas de crédito.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vista_ingresos_mensuales AS
SELECT e.organizacion_id,
       date_trunc('month', d.fecha_emision)::date          AS periodo,
       SUM(d.monto_neto) FILTER (WHERE d.tipo_dte IN (33, 34))  AS facturado,
       SUM(d.monto_neto) FILTER (WHERE d.tipo_dte = 61)         AS anulado,
       SUM(d.monto_neto) FILTER (WHERE d.tipo_dte = 56)         AS debito,
       COALESCE(SUM(d.monto_neto) FILTER (WHERE d.tipo_dte IN (33, 34)), 0)
     - COALESCE(SUM(d.monto_neto) FILTER (WHERE d.tipo_dte = 61), 0)
     + COALESCE(SUM(d.monto_neto) FILTER (WHERE d.tipo_dte = 56), 0)  AS neto_real,
       COUNT(*) FILTER (WHERE d.tipo_dte IN (33, 34))            AS n_facturas,
       COUNT(*) FILTER (WHERE d.tipo_dte = 61)                   AS n_notas_credito
  FROM documentos_emitidos d
  JOIN empresa e ON e.id = d.empresa_id
 GROUP BY e.organizacion_id, date_trunc('month', d.fecha_emision);
