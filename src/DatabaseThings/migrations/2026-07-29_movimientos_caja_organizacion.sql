-- ===================================================================================
-- MIGRACIÓN: movimientos_caja pasa a llevar organizacion_id
-- ===================================================================================
-- POR QUÉ
-- Recaudaciones y Pagos se listaban con `empresa_id IS NULL` cuando no había
-- empresa seleccionada (caja.controllers.js → listarMovimientosCaja). Ese NULL
-- significa "movimiento de la propia firma", no "de nadie": son filas reales de
-- una organización, pero al no colgar de ninguna empresa NO había forma de
-- acotarlas por tenant. Cualquier organización nueva las veía como si fueran
-- suyas.
--
-- Se resuelve igual que en cobro_mensual (2026-07-13_cobro_mensual.sql), que
-- lleva empresa_id Y organizacion_id justamente por este caso: la empresa dice
-- "de quién es el movimiento" y la organización dice "de qué tenant es".
--
-- NO re-atribuye nada: empresa_id se deja exactamente como está (los NULL siguen
-- siendo NULL) para no mover los asientos ya cuadrados del Libro Diario.
-- Idempotente.
-- ===================================================================================

BEGIN;

ALTER TABLE movimientos_caja
    ADD COLUMN IF NOT EXISTS organizacion_id UUID REFERENCES organizacion(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_movimientos_caja_organizacion
    ON movimientos_caja (organizacion_id);

-- Relleno 1: los movimientos que cuelgan de una empresa heredan su organización.
-- Ojo: movimientos_caja.empresa_id es TEXT (no uuid como en el resto de las
-- tablas), así que se compara convirtiendo el uuid a texto. Al revés
-- (empresa_id::uuid) reventaría si alguna fila trae algo que no sea un uuid.
UPDATE movimientos_caja m
   SET organizacion_id = e.organizacion_id
  FROM empresa e
 WHERE m.empresa_id = e.id::text
   AND m.organizacion_id IS NULL;

-- Relleno 2: los movimientos sin empresa son de la firma, y toda la data
-- histórica es de la organización original (la que creó
-- 2026-07-06_organizacion_multitenant.sql, la más antigua).
UPDATE movimientos_caja
   SET organizacion_id = (SELECT id FROM organizacion ORDER BY created_at ASC LIMIT 1)
 WHERE organizacion_id IS NULL;

COMMIT;

-- ===================================================================================
-- PENDIENTE CONOCIDO (misma clase de problema, todavía sin resolver)
-- ---------------------------------------------------------------------------------
-- `comprobantes` admite empresa_id NULL con el mismo significado ("asiento de la
-- firma") y tampoco lleva organizacion_id. La consulta consolidada de
-- accounting.controllers.js deja pasar esas filas a cualquier organización:
--     (c.empresa_id IS NULL OR c.empresa_id IN (SELECT ... de mi organización))
-- Hoy no filtra nada porque no existe ningún comprobante con empresa_id NULL,
-- así que no hay fuga real. Pero en cuanto se registre un asiento sin empresa,
-- se verá desde otros tenants. Arreglarlo pide el mismo tratamiento que aquí
-- (columna + relleno + filtro) y toca el flujo de contabilización completo
-- (upsertComprobante, Libro Diario, reportes), así que se deja aparte.
-- ===================================================================================
