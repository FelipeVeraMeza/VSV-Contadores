-- ===================================================================================
-- 2026-08-20 · Devolver a su empresa los comprobantes que quedaron sin dueño
-- ===================================================================================
-- QUÉ PASÓ
-- El 19-08-2026, entre las 18:51 y las 22:41, se usó «Contabilizar todo» con la
-- vista en modo consolidado —sin empresa seleccionada—. Los 1.172 asientos que
-- se generaron cayeron todos con `empresa_id` en NULL: quedaron en el montón
-- global en vez de en la contabilidad del cliente al que pertenecen.
--
-- Se sabe quién los hizo (`contabilizado_por` = Victor, en los 1.172), pero eso
-- es rastro de auditoría: lo que decide en qué contabilidad aparece un asiento
-- es `empresa_id`, y esa columna quedó vacía. Resultado: no figuran en la
-- contabilidad de ningún cliente, y en cambio se ven desde el consolidado de
-- cualquier organización.
--
-- CÓMO SE DEDUCE EL DUEÑO
-- Cada comprobante guarda `clase`, `tipo_dte` y `folio` — la llave del documento
-- que lo originó. Ese documento sí sabe de qué empresa es. Cruzándolos:
--
--     1.159 se resuelven sin ambigüedad  (98,9 %)  → los reasigna esta migración
--        13 quedan ambiguos                        → NO se tocan, ver abajo
--         0 sin documento de origen
--
-- El cruce va por `clase + tipo_dte + folio` y NO por RUT: agregar el RUT lo
-- empeora (126 sin correspondencia), porque el RUT del comprobante está
-- normalizado y el del documento no siempre. Falla por formato, no por
-- contenido.
--
-- LOS 13 AMBIGUOS
-- Son ventas DTE 33 al RUT 77938492-6 cuyo folio aparece en dos empresas. Elegir
-- una sería adivinar sobre un asiento contable ya emitido, así que quedan como
-- están y hay que revisarlos a mano:
--
--     SELECT c.id, c.numero_comprobante, c.fecha, c.folio, c.rut_contraparte
--       FROM comprobantes c WHERE c.empresa_id IS NULL;
--
-- QUÉ NO CAMBIA
--   · `contabilizado_por` / `contabilizado_por_id` se mantienen: los hizo Victor
--     y eso sigue siendo cierto.
--   · Los montos, las líneas y los folios correlativos no se tocan.
--
-- REVERSIBLE: antes de tocar nada se guarda la lista de ids en
-- `respaldo_comprobantes_sin_empresa_20260820`. Para deshacer:
--   UPDATE comprobantes c SET empresa_id = NULL
--     FROM respaldo_comprobantes_sin_empresa_20260820 r WHERE c.id = r.id;
-- ===================================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1 · Respaldo. Se guarda ANTES de modificar, con el estado tal cual está hoy.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS respaldo_comprobantes_sin_empresa_20260820 AS
SELECT id, numero_comprobante, fecha, clase, tipo_dte, folio, rut_contraparte,
       empresa_id AS empresa_id_original, contabilizado_por, NOW() AS respaldado_at
  FROM comprobantes
 WHERE empresa_id IS NULL;

COMMENT ON TABLE respaldo_comprobantes_sin_empresa_20260820 IS
    'Estado previo a la migración 2026-08-20_reasignar_comprobantes_sin_empresa. Permite deshacer la reasignación. Se puede borrar cuando la corrección esté validada por contabilidad.';

-- -----------------------------------------------------------------------------
-- 2 · Reasignar solo los que tienen UNA empresa posible
-- -----------------------------------------------------------------------------
WITH docs AS (
    SELECT 'venta'::text AS clase, tipo_dte, folio, empresa_id
      FROM documentos_emitidos          WHERE empresa_id IS NOT NULL
    UNION ALL
    SELECT 'venta', tipo_dte, folio, empresa_id
      FROM documentos_emitidos_empresa  WHERE empresa_id IS NOT NULL
    UNION ALL
    SELECT 'compra', tipo_dte, folio, empresa_id
      FROM documentos_recibidos         WHERE empresa_id IS NOT NULL
    UNION ALL
    SELECT 'compra', tipo_dte, folio, empresa_id
      FROM documentos_recibidos_empresa WHERE empresa_id IS NOT NULL
),
resolucion AS (
    SELECT c.id,
           -- Postgres no tiene min() para uuid: se agrega como texto y se
           -- devuelve a uuid. Da igual cuál se elija cuando `candidatas = 1`,
           -- que es el único caso que se actualiza.
           min(d.empresa_id::text)::uuid  AS empresa,
           count(DISTINCT d.empresa_id)   AS candidatas
      FROM comprobantes c
      JOIN docs d
        ON d.clase = c.clase AND d.tipo_dte = c.tipo_dte AND d.folio = c.folio
     WHERE c.empresa_id IS NULL
     GROUP BY c.id
)
UPDATE comprobantes c
   SET empresa_id = r.empresa
  FROM resolucion r
 WHERE c.id = r.id
   AND r.candidatas = 1;   -- ← una sola empresa posible; el resto se deja

COMMIT;
