-- ===================================================================================
-- MIGRACIÓN: Precio mensual negociado por cliente
--
-- El monto que se le factura a cada cliente NO siempre es el precio base del plan:
-- hay precios negociados (ej. ROVIRA $220.000, MR PASTA $180.000, G&D $265.000).
-- La planilla del despacho lo tiene en la columna NETO → aquí vive ese valor.
--
-- Prioridad para el cobro mensual: empresa.precio_mensual → plan.precio_base → 0
-- ===================================================================================

ALTER TABLE empresa ADD COLUMN IF NOT EXISTS precio_mensual NUMERIC(15,2);

COMMENT ON COLUMN empresa.precio_mensual IS
  'Monto NETO mensual acordado con el cliente (fuente: planilla). Si es NULL, se usa el precio del plan.';

-- Plan que existe en la planilla pero no estaba en el sistema
INSERT INTO plan (nombre, precio_base)
SELECT 'OFICINA VIRTUAL', 10000
WHERE NOT EXISTS (SELECT 1 FROM plan WHERE nombre = 'OFICINA VIRTUAL');
