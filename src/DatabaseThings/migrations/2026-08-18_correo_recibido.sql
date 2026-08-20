-- ===================================================================================
-- 2026-08-18 · LA BANDEJA DE ENTRADA — leer lo que contestan los clientes
-- ===================================================================================
-- EL PROBLEMA, QUE VENÍA DE ANTES
-- El sistema solo sabía ENVIAR. Los correos salen por Resend, por HTTPS, y nada
-- vuelve: no había IMAP, ni webhook de entrada, ni una tabla donde poner un
-- correo recibido. Las cuatro tablas de correo que existían —campana, envio,
-- plantilla, baja— son todas de salida.
--
-- Mientras tanto, el MX de vsvconsultores.com apunta a DonWeb, así que TODO lo
-- que contestan los clientes lleva meses cayendo en una casilla del hosting que
-- no lee nadie. No es que faltara la bandeja: la bandeja existía, estaba
-- llena, y no había forma de verla.
--
-- QUÉ HACE ESTO
-- Guarda una copia local de esa casilla para poder buscarla, leerla y —lo que
-- de verdad importa— CRUZARLA CON EL CRM: saber que este correo lo mandó tal
-- cliente, y no una dirección suelta.
--
-- UNA CASILLA COMPARTIDA POR LA FIRMA, NO UNA POR PERSONA
-- Es la que calza con cómo funciona hoy: el cliente le responde a la dirección
-- del dominio, no a la de quien le escribió. Igual queda `usuario_id` en la
-- tabla, en NULL, para el día que se quieran casillas por persona: agregarla
-- después obligaría a migrar filas.
--
-- POR QUÉ SE GUARDA `uid` Y `uid_validity` JUNTOS
-- El UID de IMAP identifica un mensaje dentro de un buzón, pero solo vale
-- mientras `UIDVALIDITY` no cambie. Si el servidor la cambia —pasa al recrear
-- el buzón— los UID viejos dejan de significar lo mismo y hay que traer todo de
-- nuevo. Guardando las dos, la sincronización lo detecta sola en vez de
-- mezclar correos distintos bajo el mismo número.
--
-- LOS ADJUNTOS NO SE GUARDAN, SOLO SU FICHA
-- Nombre, tipo y tamaño en `adjuntos` (jsonb). El archivo se queda en el
-- servidor de correo: meter los binarios acá haría crecer la base sin techo, y
-- para leer una respuesta casi nunca hace falta el adjunto.
--
-- Idempotente.
-- ===================================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS correo_recibido (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id   uuid,
    -- NULL = la casilla compartida de la firma. Reservado para casillas por
    -- persona, sin obligar a migrar el día que se agreguen.
    usuario_id        uuid REFERENCES usuario(id) ON DELETE SET NULL,

    buzon             varchar(120)  NOT NULL DEFAULT 'INBOX',
    uid               bigint        NOT NULL,
    uid_validity      bigint        NOT NULL,

    -- Identificadores del propio correo. `message_id` sirve para no duplicar si
    -- algún día se lee la misma casilla por dos vías; los otros dos arman el
    -- hilo de la conversación.
    message_id        varchar(500),
    in_reply_to       varchar(500),
    referencias       text,

    de_nombre         varchar(300),
    de_correo         varchar(320),
    para              text,
    asunto            varchar(500),
    fecha             timestamptz,

    cuerpo_texto      text,
    cuerpo_html       text,

    tiene_adjuntos    boolean NOT NULL DEFAULT false,
    adjuntos          jsonb   NOT NULL DEFAULT '[]'::jsonb,

    -- Estado NUESTRO, no el del servidor de correo. Que alguien lo lea acá no
    -- tiene por qué marcarlo leído en la casilla del hosting, que sigue siendo
    -- de la firma y la puede estar mirando otra persona.
    visto             boolean NOT NULL DEFAULT false,
    destacado         boolean NOT NULL DEFAULT false,
    archivado         boolean NOT NULL DEFAULT false,

    -- EL CRUCE QUE JUSTIFICA TODO ESTO: de qué cliente del CRM viene. Se
    -- resuelve al guardar comparando el remitente con `empresa.email_corporativo`.
    -- Queda NULL si el correo es de alguien que no está en la cartera.
    empresa_id        uuid REFERENCES empresa(id) ON DELETE SET NULL,

    creado_at         timestamptz NOT NULL DEFAULT now()
);

-- La clave de verdad: un mensaje es único por buzón + UIDVALIDITY + UID. Es lo
-- que permite reintentar una sincronización sin duplicar nada.
CREATE UNIQUE INDEX IF NOT EXISTS correo_recibido_uid_uk
    ON correo_recibido (organizacion_id, buzon, uid_validity, uid);

-- La bandeja se lee siempre igual: lo más nuevo primero.
CREATE INDEX IF NOT EXISTS correo_recibido_fecha_ix
    ON correo_recibido (organizacion_id, fecha DESC);

-- «¿Qué me ha escrito este cliente?» desde la ficha del CRM.
CREATE INDEX IF NOT EXISTS correo_recibido_empresa_ix
    ON correo_recibido (empresa_id, fecha DESC);

CREATE INDEX IF NOT EXISTS correo_recibido_de_ix
    ON correo_recibido (lower(de_correo));

COMMENT ON TABLE correo_recibido IS
    'Copia local de la casilla de entrada leída por IMAP. El sistema solo enviaba correo: esto es lo que permite ver lo que contestan los clientes, que hasta ahora caía en el buzón del hosting sin que lo leyera nadie.';
COMMENT ON COLUMN correo_recibido.uid_validity IS
    'UIDVALIDITY del buzón IMAP. Si el servidor la cambia, los UID guardados dejan de valer y hay que resincronizar desde cero.';
COMMENT ON COLUMN correo_recibido.visto IS
    'Estado local, NO el \Seen del servidor: la casilla es compartida y marcarla allá la marcaría para todos.';
COMMENT ON COLUMN correo_recibido.adjuntos IS
    'Ficha de cada adjunto (nombre, tipo, tamaño). El archivo NO se guarda: se queda en el servidor de correo.';

COMMIT;
