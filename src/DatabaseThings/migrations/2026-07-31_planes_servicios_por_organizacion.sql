-- ===================================================================================
-- 2026-07-31 · Los planes de cobro y el catálogo de servicios pasan a ser
--              de cada organización
-- ===================================================================================
-- POR QUÉ
-- Al separar a Victor en su propia organización quedó claro que heredaba tres
-- catálogos que NO son suyos: los 6 planes de cobro, sus 17 tramos de precio y
-- los 10 servicios. Eso son decisiones comerciales de SIMPLE PYME —cuánto cobra
-- y qué vende—, no parámetros del sistema.
--
-- LO QUE NO SE TOCA, Y ES A PROPÓSITO
-- Estas siguen compartidas porque son parámetros LEGALES de Chile, iguales para
-- cualquier firma, y duplicarlos obligaría a actualizar la UF y los tramos del
-- impuesto en cada organización todos los meses:
--
--   rem_afp · rem_salud · rem_impuesto_tramo
--   rem_asignacion_familiar_tramo · rem_parametro_previsional
--
-- LOS TRAMOS DE PRECIO
-- `plan_precio_tramo` no necesita columna propia: cuelga de `plan_id`, así que
-- al acotar los planes quedan acotados solos.
--
-- Idempotente.
-- ===================================================================================

BEGIN;

ALTER TABLE plan     ADD COLUMN IF NOT EXISTS organizacion_id uuid REFERENCES organizacion(id) ON DELETE CASCADE;
ALTER TABLE servicio ADD COLUMN IF NOT EXISTS organizacion_id uuid REFERENCES organizacion(id) ON DELETE CASCADE;

-- Lo que ya existe es de la firma: se le asigna a SIMPLE PYME.
UPDATE plan
   SET organizacion_id = (SELECT id FROM organizacion WHERE nombre = 'VOLLAIRE & OLIVOS SIMPLE PYME LTDA')
 WHERE organizacion_id IS NULL;

UPDATE servicio
   SET organizacion_id = (SELECT id FROM organizacion WHERE nombre = 'VOLLAIRE & OLIVOS SIMPLE PYME LTDA')
 WHERE organizacion_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_plan_org     ON plan (organizacion_id);
CREATE INDEX IF NOT EXISTS idx_servicio_org ON servicio (organizacion_id);

COMMENT ON COLUMN plan.organizacion_id IS
    'Los planes de cobro son de cada firma. NULL = visible para todas (no se usa hoy).';
COMMENT ON COLUMN servicio.organizacion_id IS
    'El catálogo de servicios es de cada firma. NULL = visible para todas (no se usa hoy).';

COMMIT;
