-- ============================================================================
-- VARIOS COBROS POR EMPRESA Y MES
-- ----------------------------------------------------------------------------
-- La restricción UNIQUE (empresa_id, periodo) permitía UN solo cobro por
-- empresa y mes. Eso no refleja la realidad: PARTY CARS tuvo tres facturas en
-- agosto —el plan mensual más dos trabajos extra— y solo una podía tener cobro.
--
-- Consecuencia: 24 facturas por $2.132.080 emitidas al SII que la cobranza no
-- perseguía. No vencían el día 5, no salían en el recordatorio de pago y no
-- contaban en «por cobrar». Detectado en la auditoría del 03-09-2026.
--
-- SE REEMPLAZA POR DOS ÍNDICES, no por uno:
--
--   1. Con folio    → único por (empresa, periodo, folio).
--                     Permite el cobro del plan más los extras, cada uno con
--                     su factura.
--
--   2. Sin folio    → único por (empresa, periodo).
--                     Un cobro POR_EMITIR es el del ciclo mensual y sigue
--                     habiendo uno solo. Sin este segundo índice el ciclo
--                     podría generar duplicados: en Postgres varios NULL NO
--                     chocan entre sí en una clave única, así que la primera
--                     regla sola no los cubre.
--
-- Al 04-09-2026 la base tiene 131 cobros sin folio y CERO duplicados con
-- cualquiera de las dos claves, así que la migración no rechaza nada.
-- ============================================================================

BEGIN;

ALTER TABLE cobro_mensual
    DROP CONSTRAINT IF EXISTS cobro_mensual_empresa_id_periodo_key;

-- Un folio identifica una factura: no puede repetirse dentro del mismo mes.
CREATE UNIQUE INDEX IF NOT EXISTS cobro_mensual_empresa_periodo_folio_key
    ON cobro_mensual (empresa_id, periodo, TRIM(folio))
    WHERE folio IS NOT NULL AND TRIM(folio) <> '';

-- Los que aún no se emiten: uno por empresa y mes, como siempre.
CREATE UNIQUE INDEX IF NOT EXISTS cobro_mensual_empresa_periodo_sin_folio_key
    ON cobro_mensual (empresa_id, periodo)
    WHERE folio IS NULL OR TRIM(folio) = '';

COMMIT;
