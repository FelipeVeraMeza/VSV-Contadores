-- ============================================================================
-- WhatsApp: multi-sesión + persistencia en BD
-- ----------------------------------------------------------------------------
-- Reemplaza el almacenamiento en memoria (conversaciones/mensajes) y la carpeta
-- local `whatsapp_auth/` (credenciales) por tablas en Postgres.
--
-- Modelo de propiedad (elegido: flexible):
--   whatsapp_sesion.organizacion_id -> SIEMPRE (dueño de la sesión)
--   whatsapp_sesion.empresa_id      -> NULL  = número propio del estudio
--                                      valor = número de esa empresa cliente
--   Administrador -> ve todas las sesiones de su organización
--   Cliente       -> ve solo la sesión de su empresa
--
-- Idempotente: se puede correr más de una vez sin romper nada.
-- Aplicar con:
--   node src/DatabaseThings/migrations/aplicar_migracion.mjs src/DatabaseThings/migrations/2026-07-16_whatsapp_multisesion.sql
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Sesiones de WhatsApp (cada una = un número vinculado por QR)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_sesion (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id     uuid NOT NULL REFERENCES organizacion(id) ON DELETE CASCADE,
    -- NULL = número del propio estudio; con valor = número de esa empresa cliente
    empresa_id          uuid REFERENCES empresa(id) ON DELETE SET NULL,
    nombre              varchar(100) NOT NULL,
    telefono            varchar(30),
    -- desconectado | conectando | qr | conectado
    estado              varchar(20) NOT NULL DEFAULT 'desconectado',
    -- toggle de auto-respuesta IA a nivel de sesión
    auto_ia             boolean NOT NULL DEFAULT true,
    activo              boolean NOT NULL DEFAULT true,
    ultimo_conectado_at timestamptz,
    creado_por          uuid REFERENCES usuario(id) ON DELETE SET NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_sesion_org     ON whatsapp_sesion (organizacion_id) WHERE activo;
CREATE INDEX IF NOT EXISTS idx_wa_sesion_empresa ON whatsapp_sesion (empresa_id)      WHERE empresa_id IS NOT NULL;

-- Una empresa cliente no puede tener dos sesiones activas a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_sesion_empresa_unica
    ON whatsapp_sesion (empresa_id) WHERE empresa_id IS NOT NULL AND activo;

-- ----------------------------------------------------------------------------
-- 2. Credenciales de Baileys (antes: carpeta whatsapp_auth/)
--    Guardarlas aquí hace que la sesión sobreviva a los redeploys de Railway,
--    cuyo filesystem es efímero. Una fila por clave ('creds', keys de sync...).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_credencial (
    sesion_id   uuid NOT NULL REFERENCES whatsapp_sesion(id) ON DELETE CASCADE,
    clave       varchar(200) NOT NULL,
    valor       jsonb NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (sesion_id, clave)
);

-- ----------------------------------------------------------------------------
-- 3. Conversaciones (un hilo por contacto dentro de una sesión)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_conversacion (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sesion_id             uuid NOT NULL REFERENCES whatsapp_sesion(id) ON DELETE CASCADE,
    -- Si se logra identificar al contacto como una empresa del CRM
    empresa_id            uuid REFERENCES empresa(id) ON DELETE SET NULL,
    jid                   varchar(120) NOT NULL,
    telefono              varchar(30) NOT NULL,
    nombre_contacto       varchar(255),
    no_leidos             integer NOT NULL DEFAULT 0,
    -- toggle de IA por conversación (para que un humano tome el chat)
    auto_ia               boolean NOT NULL DEFAULT true,
    ultimo_mensaje_preview text,
    ultimo_mensaje_at     timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    -- el mismo contacto puede escribir a dos números distintos del estudio
    UNIQUE (sesion_id, jid)
);

CREATE INDEX IF NOT EXISTS idx_wa_conv_sesion  ON whatsapp_conversacion (sesion_id, ultimo_mensaje_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_wa_conv_empresa ON whatsapp_conversacion (empresa_id) WHERE empresa_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. Mensajes (entrantes y salientes)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_mensaje (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversacion_id uuid NOT NULL REFERENCES whatsapp_conversacion(id) ON DELETE CASCADE,
    direccion       varchar(3) NOT NULL,              -- 'in' | 'out'
    tipo            varchar(20) NOT NULL DEFAULT 'text',
    cuerpo          text,
    media_url       text,
    wa_message_id   varchar(128),                     -- id del proveedor (idempotencia)
    estado          varchar(20) NOT NULL DEFAULT 'enviado', -- pendiente|enviado|entregado|leido|error
    es_ia           boolean NOT NULL DEFAULT false,   -- lo generó la IA
    enviado_por     uuid REFERENCES usuario(id) ON DELETE SET NULL, -- NULL si entrante o IA
    "timestamp"     timestamptz NOT NULL DEFAULT now(),
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_wa_msg_direccion CHECK (direccion IN ('in', 'out'))
);

CREATE INDEX IF NOT EXISTS idx_wa_msg_conv ON whatsapp_mensaje (conversacion_id, "timestamp");

-- Evita duplicar un mensaje si el proveedor lo reenvía.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_msg_waid
    ON whatsapp_mensaje (wa_message_id) WHERE wa_message_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 5. Base de conocimiento de la IA (antes: hardcodeada en conocimiento.js)
--    La IA arma su contexto leyendo estas filas, así se edita sin tocar código.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_conocimiento (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES organizacion(id) ON DELETE CASCADE,
    -- Si se llena, el dato solo aplica a esa sesión; NULL = vale para toda la organización
    sesion_id       uuid REFERENCES whatsapp_sesion(id) ON DELETE CASCADE,
    seccion         varchar(100) NOT NULL,   -- 'empresa' | 'servicios' | 'precios' | 'horario' | 'plazos' | 'faq'
    titulo          varchar(255),
    contenido       text NOT NULL,
    orden           integer NOT NULL DEFAULT 0,
    activo          boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_conocimiento_org
    ON whatsapp_conocimiento (organizacion_id, seccion, orden) WHERE activo;

-- ----------------------------------------------------------------------------
-- 6. Instrucciones de la IA por organización (el "cómo debe hablar")
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_ia_config (
    organizacion_id uuid PRIMARY KEY REFERENCES organizacion(id) ON DELETE CASCADE,
    instrucciones   text,
    modelo          varchar(60) NOT NULL DEFAULT 'gemini-3.1-flash-lite',
    activo          boolean NOT NULL DEFAULT true,
    updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMIT;
