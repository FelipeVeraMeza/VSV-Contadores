-- ===================================================================================
-- 2026-08-16 · Plantillas de correo para el envío a clientes
-- ===================================================================================
-- POR QUÉ
-- El envío de correos personalizados ya funciona, pero cada campaña se escribe
-- desde cero. Los correos que se mandan son siempre los mismos —recordatorio de
-- pago, aviso de F29, cambio de plan— y volver a escribirlos cada vez es donde
-- se cuela el error: una marca mal tipeada, un monto que quedó en duro, una
-- despedida distinta según quién la escribió.
--
-- POR QUÉ EN LA BASE Y NO EN EL NAVEGADOR
-- Una plantilla guardada en `localStorage` la tiene UNA persona en UN computador.
-- Estas las escribe quien redacta bien y las usa el resto del equipo, así que
-- viven en la base y se comparten dentro de la organización.
--
-- QUÉ GUARDA
-- El asunto y el cuerpo se guardan CON las marcas ({{empresa}}, {{plan}}, …) sin
-- resolver. Resolverlas al guardar las congelaría con los datos del día en que
-- se escribió la plantilla, que es exactamente lo que se quiere evitar.
--
-- Aislamiento por organización, como el resto del sistema.
-- Idempotente: se puede correr de nuevo sin romper nada.
-- ===================================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS correo_plantilla (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id  uuid REFERENCES organizacion(id) ON DELETE CASCADE,

    nombre           varchar(120) NOT NULL,
    descripcion      text,

    -- Con las marcas SIN resolver. Ver la nota de arriba.
    asunto           varchar(300) NOT NULL,
    cuerpo           text NOT NULL,
    firma            text,

    -- Para saber cuáles sirven de verdad: una plantilla que nadie usa en seis
    -- meses es ruido en la lista y conviene poder verlo.
    veces_usada      integer NOT NULL DEFAULT 0,
    usada_at         timestamptz,

    creado_por       uuid REFERENCES usuario(id) ON DELETE SET NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Dos plantillas con el mismo nombre en la misma organización no se pueden
-- distinguir en el desplegable. El índice lo impide en la base y no solo en la
-- pantalla, porque la pantalla se puede saltar.
--
-- `lower(nombre)`: «Recordatorio de pago» y «recordatorio de pago» son la misma
-- para quien la busca en una lista.
CREATE UNIQUE INDEX IF NOT EXISTS ux_correo_plantilla_nombre
    ON correo_plantilla (organizacion_id, lower(nombre));

CREATE INDEX IF NOT EXISTS ix_correo_plantilla_org
    ON correo_plantilla (organizacion_id);

-- `updated_at` con trigger y no a mano: una columna que depende de que la
-- aplicación se acuerde de escribirla es peor que no tenerla, porque igual se
-- toman decisiones mirándola. Misma lección que `tarea` y `cobro_mensual`.
DROP TRIGGER IF EXISTS tr_update_correo_plantilla ON correo_plantilla;
CREATE TRIGGER tr_update_correo_plantilla
    BEFORE UPDATE ON correo_plantilla
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE  correo_plantilla        IS 'Plantillas del envío de correos a clientes. Compartidas dentro de la organización.';
COMMENT ON COLUMN correo_plantilla.asunto IS 'Con las marcas sin resolver: {{empresa}}, {{plan}}, {{valor_plan}}…';
COMMENT ON COLUMN correo_plantilla.cuerpo IS 'Idem asunto. Se resuelven al enviar, con los datos del día.';

COMMIT;
