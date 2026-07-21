-- ===================================================================================
-- MIGRACIÓN: Ciclo de cobro mensual (honorarios del despacho a sus clientes)
--
-- Modelo de negocio:
--   · Cada empresa con servicio activo se factura una vez al mes (fin de mes, día 26-27).
--   · El monto mensual es el PRECIO DEL PLAN (GO $30.000, EMPRENDEDOR $10.000, etc.).
--   · El pago se espera el día 5 del mes siguiente.
--   · Si el mes pasado NO se emitió factura → el cliente suspendió el servicio.
--
-- Estados almacenados: POR_EMITIR | PENDIENTE_PAGO | PAGADA | PENDIENTE_RECIBO
--   ("VENCIDA" NO se almacena: se deriva de PENDIENTE_PAGO + fecha_vencimiento pasada)
-- ===================================================================================

-- 1. Corregir el precio_pactado inflado: el monto mensual es el precio del plan, no la
--    suma de los servicios (los servicios son lo que el plan INCLUYE).
UPDATE empresa_servicio SET precio_pactado = 0;

WITH principal AS (
    -- Un "servicio principal" por empresa: lleva el precio del plan; el resto queda en 0.
    SELECT DISTINCT ON (es.empresa_id) es.id AS empresa_servicio_id, e.plan_id
    FROM empresa_servicio es
    JOIN empresa e ON e.id = es.empresa_id
    WHERE es.estado = 'Activo'
    ORDER BY es.empresa_id,
             (CASE WHEN es.servicio_id = (SELECT id FROM servicio WHERE nombre = 'Contabilidad Mensual') THEN 0 ELSE 1 END),
             es.id
)
UPDATE empresa_servicio es
SET precio_pactado = COALESCE(p.precio_base, 0)
FROM principal pr
LEFT JOIN plan p ON p.id = pr.plan_id
WHERE es.id = pr.empresa_servicio_id;

-- 2. Tabla del ciclo de cobro
CREATE TABLE IF NOT EXISTS cobro_mensual (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id UUID REFERENCES organizacion(id) ON DELETE SET NULL,
    empresa_id UUID NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    periodo DATE NOT NULL,                       -- primer día del mes (ej. 2026-07-01)
    monto_esperado  NUMERIC(15,2) DEFAULT 0,     -- precio del plan al generar el cobro
    monto_facturado NUMERIC(15,2),               -- lo realmente emitido en el DTE
    folio    VARCHAR(50),                        -- folio del DTE emitido
    tipo_dte VARCHAR(20),
    estado   VARCHAR(20) NOT NULL DEFAULT 'POR_EMITIR'
             CHECK (estado IN ('POR_EMITIR','PENDIENTE_PAGO','PAGADA','PENDIENTE_RECIBO')),
    fecha_emision     TIMESTAMP WITH TIME ZONE,
    fecha_vencimiento DATE,                      -- día 5 del mes siguiente
    fecha_pago        TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (empresa_id, periodo)                 -- nunca dos cobros del mismo mes
);

CREATE INDEX IF NOT EXISTS idx_cobro_periodo ON cobro_mensual (periodo);
CREATE INDEX IF NOT EXISTS idx_cobro_org     ON cobro_mensual (organizacion_id);
CREATE INDEX IF NOT EXISTS idx_cobro_estado  ON cobro_mensual (estado);
