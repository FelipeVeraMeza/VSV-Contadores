-- ============================================================================
-- 2026-07-31 · Bitácora del sistema + aislamiento de correos_facturas
-- ----------------------------------------------------------------------------
-- Dos cosas que la revisión del facturador dejó como pendientes críticos:
--
-- 1. NO HAY BITÁCORA. Emitir facturas, mandar correos masivos y cambiar el
--    estado de un cobro no dejaban ningún rastro. El 30-jul hizo falta dos
--    veces y no se pudo responder: "¿a quién se le mandó el recordatorio?" y
--    "¿por qué faltó JL MONTERO?". La única evidencia era una terminal abierta.
--
-- 2. `correos_facturas` ES GLOBAL. No tiene organizacion_id, a diferencia de
--    `cobro_mensual`. Hoy no se nota porque hay una sola organización, pero al
--    entrar la segunda cualquier administrador vería los correos de la otra
--    firma. Se arregla antes, que después es más caro.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. BITÁCORA
-- ----------------------------------------------------------------------------
-- A diferencia de `empresa_auditoria` (que solo cubre el CRM y se borra en
-- cascada con la empresa), esta sobrevive al borrado de lo que registra: es
-- justamente cuando algo se elimina cuando más importa saber quién fue.
CREATE TABLE IF NOT EXISTS bitacora_sistema (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Quién. El nombre se guarda COPIADO, no por join: si mañana se borra el
    -- usuario, el registro tiene que seguir diciendo quién fue.
    usuario_id       uuid REFERENCES usuario(id) ON DELETE SET NULL,
    usuario_nombre   varchar(200),
    usuario_rol      varchar(40),
    organizacion_id  uuid,

    -- Qué. `modulo` agrupa (facturacion, correos, cobros, empresas, usuarios);
    -- `accion` es el verbo (emitir, enviar, eliminar, cambiar_estado...).
    modulo           varchar(40)  NOT NULL,
    accion           varchar(60)  NOT NULL,

    -- Sobre qué. Se guarda el id Y una descripción legible, porque el id puede
    -- apuntar a algo que ya no existe.
    entidad          varchar(40),
    entidad_id       text,
    descripcion      text,

    -- Cómo terminó, y el detalle libre (montos, folios, destinatarios).
    resultado        varchar(20) DEFAULT 'ok',
    detalle          jsonb,

    created_at       timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bitacora_fecha    ON bitacora_sistema (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bitacora_usuario  ON bitacora_sistema (usuario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bitacora_modulo   ON bitacora_sistema (modulo, accion, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bitacora_entidad  ON bitacora_sistema (entidad, entidad_id);
CREATE INDEX IF NOT EXISTS idx_bitacora_org      ON bitacora_sistema (organizacion_id, created_at DESC);

COMMENT ON TABLE bitacora_sistema IS
    'Quién hizo qué y cuándo. Sobrevive al borrado de la entidad registrada.';

-- ----------------------------------------------------------------------------
-- 2. AISLAMIENTO DE correos_facturas
-- ----------------------------------------------------------------------------
ALTER TABLE correos_facturas
    ADD COLUMN IF NOT EXISTS organizacion_id uuid;

-- Relleno hacia atrás: el folio es la llave común con `cobro_mensual`, que sí
-- tiene la organización.
UPDATE correos_facturas cf
   SET organizacion_id = cm.organizacion_id
  FROM cobro_mensual cm
 WHERE TRIM(cm.folio) = TRIM(cf.folio)
   AND cf.organizacion_id IS NULL
   AND cm.organizacion_id IS NOT NULL;

-- Los que no calcen por folio se completan desde el script que aplica esta
-- migración, cruzando por RUT. El hash se calcula en JavaScript (`generateHash`)
-- y no en SQL, para no depender de que la extensión pgcrypto esté instalada.

CREATE INDEX IF NOT EXISTS idx_correos_facturas_org ON correos_facturas (organizacion_id);

COMMIT;
