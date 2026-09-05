-- ============================================================================
-- PERSONAS DE UNA EMPRESA · y quién pagó cada factura
-- ----------------------------------------------------------------------------
-- EL PEDIDO
-- «Hay que añadir a una empresa nombres de personas externas o internas, para no
-- tener problemas de quién me pagó por esa factura. Además necesito poder buscar
-- en el CRM por el RUT de la empresa, del representante legal y de quien me pagó.»
--
-- POR QUÉ NO ALCANZABA CON LO QUE HABÍA
-- `empresa_representante` guarda al representante legal, que es una figura
-- JURÍDICA: quien firma ante el SII. No es lo mismo que la persona con la que
-- uno habla todos los días, ni que quien transfiere el pago. En la práctica son
-- roles distintos y muchas veces personas distintas: paga el contador externo,
-- firma el dueño, y quien contesta el teléfono es la secretaria.
--
-- Meter todo eso en la tabla del representante habría roto lo que ya funciona:
-- el robot del SII lee de ahí el RUT con el que entra al portal.
--
-- DOS COSAS, NO UNA
--   1. `empresa_contacto` — las personas ligadas a una empresa, con su rol.
--   2. `cobro_mensual.pagado_por_*` — quién pagó ESA factura en concreto.
--
-- POR QUÉ EL PAGADOR SE GUARDA EN EL COBRO Y NO SOLO COMO REFERENCIA
-- Se guardan las dos cosas: el id del contacto (para poder buscar y agrupar) y
-- el nombre en texto. El nombre porque quien pagó en marzo pagó en marzo,
-- aunque después esa persona deje la empresa y su contacto se borre o se
-- corrija. Un registro contable no puede cambiar hacia atrás.
--
-- SE PUEDE BUSCAR SIN DESCIFRAR
-- El RUT del contacto va cifrado como todos los datos personales, con su
-- `rut_hash` al lado: así se puede preguntar «¿quién tiene este RUT?» sin
-- descifrar la tabla entera, igual que con las empresas y los representantes.
-- ============================================================================

BEGIN;

-- ── 1. Las personas de cada empresa ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS empresa_contacto (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    nombre          VARCHAR(200) NOT NULL,
    -- El rol dice para qué sirve esta persona. 'pagador' es el que importa para
    -- responder «¿quién me pagó?»; los demás son para saber a quién llamar.
    rol             VARCHAR(30) NOT NULL DEFAULT 'contacto',
    -- Interna = trabaja en la empresa cliente. Externa = su contador, su
    -- abogado, alguien de afuera que igual participa. La distinción la pidió
    -- Felipe explícitamente («personas externas o internas»).
    externo         BOOLEAN NOT NULL DEFAULT FALSE,
    rut_encrypted   TEXT,
    rut_hash        TEXT,
    email           VARCHAR(200),
    telefono        VARCHAR(50),
    nota            TEXT,
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT empresa_contacto_rol_check
        CHECK (rol IN ('contacto', 'pagador', 'contador', 'representante', 'otro'))
);

CREATE INDEX IF NOT EXISTS empresa_contacto_empresa_idx ON empresa_contacto (empresa_id);
-- Buscar por RUT sin descifrar: es lo que permite «busco por el RUT de quien me pagó».
CREATE INDEX IF NOT EXISTS empresa_contacto_rut_hash_idx ON empresa_contacto (rut_hash)
    WHERE rut_hash IS NOT NULL;

COMMENT ON TABLE empresa_contacto IS
    'Personas ligadas a una empresa: quien paga, quien firma, a quien se llama. Distinto del representante legal, que vive en empresa_representante y lo usa el robot del SII.';

-- ── 2. Quién pagó cada factura ──────────────────────────────────────────────
ALTER TABLE cobro_mensual
    ADD COLUMN IF NOT EXISTS pagado_por_contacto_id UUID
        REFERENCES empresa_contacto(id) ON DELETE SET NULL;

-- El nombre en texto, además del id. Si el contacto se borra o se corrige, el
-- registro de quién pagó en su momento NO puede cambiar: es dato contable.
ALTER TABLE cobro_mensual
    ADD COLUMN IF NOT EXISTS pagado_por_nombre VARCHAR(200);

-- Cómo llegó la plata. Sirve para cuadrar contra la cartola.
ALTER TABLE cobro_mensual
    ADD COLUMN IF NOT EXISTS medio_pago VARCHAR(30);

ALTER TABLE cobro_mensual
    DROP CONSTRAINT IF EXISTS cobro_mensual_medio_pago_check;
ALTER TABLE cobro_mensual
    ADD CONSTRAINT cobro_mensual_medio_pago_check
    CHECK (medio_pago IS NULL OR medio_pago IN
        ('transferencia', 'efectivo', 'cheque', 'tarjeta', 'otro'));

CREATE INDEX IF NOT EXISTS cobro_mensual_pagador_idx
    ON cobro_mensual (pagado_por_contacto_id)
    WHERE pagado_por_contacto_id IS NOT NULL;

COMMENT ON COLUMN cobro_mensual.pagado_por_nombre IS
    'Nombre de quien pagó, congelado al momento del pago. No cambia aunque el contacto se edite o se borre.';

-- ── 3. Empresa o persona natural ────────────────────────────────────────────
-- `tipo_cliente` ya existe y hoy dice 'Empresa' en las 228. Se deja como está y
-- solo se acota a valores conocidos, para que la ficha pueda adaptarse: a una
-- persona natural no se le piden representantes legales ni razón social.
ALTER TABLE empresa
    DROP CONSTRAINT IF EXISTS empresa_tipo_cliente_check;
ALTER TABLE empresa
    ADD CONSTRAINT empresa_tipo_cliente_check
    CHECK (tipo_cliente IS NULL OR tipo_cliente IN ('Empresa', 'Persona'));

COMMIT;
