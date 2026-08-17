-- ===================================================================================
-- 2026-08-16 · Registro de envíos y desuscripción
-- ===================================================================================
-- Los dos agujeros más caros del módulo de correo, que iban juntos porque uno
-- necesita al otro.
--
-- 1 · REGISTRO POR DESTINATARIO (RF-CO-63)
--     Terminada una campaña no quedaba rastro de a quién le llegó qué. La primera
--     pregunta del día siguiente —«¿le llegó el aviso a este cliente?»— no se
--     podía contestar. Solo había un resumen en la bitácora: quién envió, cuándo
--     y a cuántos, sin decir a quiénes.
--
--     Además resuelve de paso RNF-CO-07: hoy el avance vive solo en memoria y al
--     reiniciar el servidor se pierde saber dónde iba. Con esta tabla se sabe
--     quién YA recibió, que es lo que hace falta para retomar sin duplicar.
--
-- 2 · DESUSCRIPCIÓN (RL-CO-01, RL-CO-02)
--     Ningún correo llevaba forma de darse de baja. No es un lujo: Gmail y
--     Outlook penalizan al remitente que no la ofrece, y el dominio se verificó
--     recién el 14-ago, así que no tiene reputación acumulada para aguantarlo.
--     Si el dominio cae en spam, caen también las facturas.
--
--     La baja se guarda POR CORREO y no por empresa: la misma dirección puede
--     estar en varias fichas, y quien pide no recibir más no está pidiendo
--     dejar de recibir de una empresa, sino dejar de recibir.
--
-- Idempotente.
-- ===================================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1 · CAMPAÑAS · la cabecera de cada envío
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS correo_campana (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id  uuid REFERENCES organizacion(id) ON DELETE CASCADE,

    asunto           varchar(300) NOT NULL,
    cuerpo           text NOT NULL,          -- con las marcas SIN resolver
    firma            text,
    firma_imagen     text,

    -- Con qué se mandó, para poder reconstruir qué vio el cliente.
    remitente        varchar(220) NOT NULL,
    plantilla_id     uuid REFERENCES correo_plantilla(id) ON DELETE SET NULL,

    -- pendiente → enviando → terminada | detenida | fallida
    estado           varchar(20) NOT NULL DEFAULT 'pendiente',
    total            integer NOT NULL DEFAULT 0,
    enviados         integer NOT NULL DEFAULT 0,
    fallidos         integer NOT NULL DEFAULT 0,

    -- Huella del contenido + destinatarios. Es lo que permite avisar «esto mismo
    -- ya lo mandaste hace 5 minutos» (RF-CO-43) sin comparar textos largos.
    huella           varchar(64),

    enviado_por      uuid REFERENCES usuario(id) ON DELETE SET NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    terminada_at     timestamptz
);

ALTER TABLE correo_campana DROP CONSTRAINT IF EXISTS correo_campana_estado_valido;
ALTER TABLE correo_campana ADD  CONSTRAINT correo_campana_estado_valido
    CHECK (estado IN ('pendiente','enviando','terminada','detenida','fallida'));

CREATE INDEX IF NOT EXISTS ix_correo_campana_org   ON correo_campana (organizacion_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_correo_campana_huella ON correo_campana (huella, created_at DESC);

-- -----------------------------------------------------------------------------
-- 2 · ENVÍOS · una fila por destinatario
-- -----------------------------------------------------------------------------
-- Guarda el asunto y el cuerpo YA RESUELTOS. Ocupa más, y vale la pena: es la
-- única forma de responder «¿qué decía exactamente el correo que le llegó?».
-- Reconstruirlo después mezclando la plantilla con los datos de hoy daría un
-- texto distinto al que se envió, porque el plan del cliente pudo cambiar.
CREATE TABLE IF NOT EXISTS correo_envio (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campana_id       uuid NOT NULL REFERENCES correo_campana(id) ON DELETE CASCADE,
    organizacion_id  uuid REFERENCES organizacion(id) ON DELETE CASCADE,

    empresa_id       uuid REFERENCES empresa(id) ON DELETE SET NULL,
    razon_social     varchar(255),           -- copia: si borran la empresa, el registro sigue legible
    destinatario     varchar(320) NOT NULL,

    asunto_final     varchar(300),
    cuerpo_final     text,

    -- pendiente → enviado | fallido | omitido
    estado           varchar(20) NOT NULL DEFAULT 'pendiente',
    motivo           text,                   -- el error, o por qué se omitió
    proveedor_id     varchar(120),           -- el id que devuelve Resend, para rastrear
    intentos         smallint NOT NULL DEFAULT 0,

    enviado_at       timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE correo_envio DROP CONSTRAINT IF EXISTS correo_envio_estado_valido;
ALTER TABLE correo_envio ADD  CONSTRAINT correo_envio_estado_valido
    CHECK (estado IN ('pendiente','enviado','fallido','omitido','rebotado'));

CREATE INDEX IF NOT EXISTS ix_correo_envio_campana  ON correo_envio (campana_id);
-- El que contesta «¿le llegó a este cliente?», que es la consulta que motivó todo.
CREATE INDEX IF NOT EXISTS ix_correo_envio_empresa  ON correo_envio (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_correo_envio_destino  ON correo_envio (lower(destinatario), created_at DESC);

-- -----------------------------------------------------------------------------
-- 3 · BAJAS · quién pidió no recibir más
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS correo_baja (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id  uuid REFERENCES organizacion(id) ON DELETE CASCADE,

    -- En minúsculas SIEMPRE: «Juan@X.cl» y «juan@x.cl» son la misma casilla y
    -- dar de baja una sin la otra es no darla de baja.
    correo           varchar(320) NOT NULL,

    motivo           text,
    origen           varchar(20) NOT NULL DEFAULT 'enlace',  -- enlace | manual | rebote
    campana_id       uuid REFERENCES correo_campana(id) ON DELETE SET NULL,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_correo_baja ON correo_baja (organizacion_id, lower(correo));

COMMENT ON TABLE correo_campana IS 'Cabecera de cada envío masivo. El detalle por destinatario está en correo_envio.';
COMMENT ON TABLE correo_envio   IS 'Una fila por destinatario, con el texto YA resuelto. Responde "¿qué le llegó a quién?".';
COMMENT ON TABLE correo_baja    IS 'Correos que pidieron no recibir más. Se respeta al armar cualquier envío.';
COMMENT ON COLUMN correo_campana.huella IS 'Hash del asunto+cuerpo+destinatarios. Detecta el reenvío accidental de la misma campaña.';

COMMIT;
