-- =====================================================================
-- Migración: periodicidad y primera facturación en los servicios del cliente
-- Fecha: 2026-07-27 · Idempotente.
--
-- Al asignar un servicio a un cliente ahora se define cada cuánto se factura
-- (mensual, bimensual, trimestral, semestral, anual…) y la fecha de la
-- primera facturación. Antes solo existían precio y fecha de inicio.
-- =====================================================================

ALTER TABLE empresa_servicio
    ADD COLUMN IF NOT EXISTS periodicidad varchar(20) DEFAULT 'mensual';

ALTER TABLE empresa_servicio
    ADD COLUMN IF NOT EXISTS primera_facturacion date;
