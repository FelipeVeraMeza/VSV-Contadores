-- ===================================================================================
-- 2026-07-31 · `updated_at` confiable en cobro_mensual y empresa_servicio
-- ===================================================================================
-- POR QUÉ
-- El 30-jul faltó un cliente en el envío de recordatorios (JL MONTERO) y no se
-- pudo rastrear qué había pasado: `cobro_mensual.updated_at` solo se llena si la
-- aplicación lo escribe a mano, porque esa tabla NO tiene trigger — a diferencia
-- de `empresa`, `usuario` o `sucursal`, que sí lo tienen.
--
-- O sea que el campo existía y parecía confiable, pero no lo era. Peor que no
-- tenerlo: se toman decisiones mirándolo.
--
-- La función `update_updated_at_column()` ya existe en la base desde antes; acá
-- solo se le engancha a las tablas que faltaban.
-- ===================================================================================

BEGIN;

DROP TRIGGER IF EXISTS tr_update_cobro_mensual ON cobro_mensual;
CREATE TRIGGER tr_update_cobro_mensual
    BEFORE UPDATE ON cobro_mensual
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tr_update_empresa_servicio_ts ON empresa_servicio;
CREATE TRIGGER tr_update_empresa_servicio_ts
    BEFORE UPDATE ON empresa_servicio
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
