-- ===================================================================================
-- 2026-07-31 · El avance de los procesos largos deja de vivir solo en memoria
-- ===================================================================================
-- POR QUÉ
-- El avance de los envíos y de los robots vive en 7 variables de módulo
-- (`estadoRobot`, `estadoRecordatorio`, `correoEnCurso`...). Si el servidor se
-- reinicia a media corrida:
--
--   · se pierde el avance y nadie sabe dónde iba;
--   · el candado que impide dos envíos simultáneos se suelta;
--   · la pantalla se ve quieta aunque el proceso siga o haya muerto.
--
-- El 30-jul pasó exactamente eso con los recordatorios: hubo que deducir a quién
-- le había llegado restando montos.
--
-- QUÉ HACE
-- Una fila por proceso largo, escrita EN PARALELO a la memoria. La memoria sigue
-- mandando; esto es la red de seguridad y la fuente para la pantalla cuando el
-- proceso ya no está en memoria.
--
-- Quién recibió qué sigue estando en `bitacora_sistema` (una fila por
-- destinatario). Esta tabla es el resumen vivo, no el detalle.
-- ===================================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS proceso_en_curso (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 'recordatorio_pago' | 'facturacion_masiva' | 'facturacion_exenta' | 'reenvio_correos'
    tipo             varchar(40) NOT NULL,
    organizacion_id  uuid,

    -- Quién lo disparó. El nombre va copiado para que sobreviva al borrado.
    usuario_id       uuid REFERENCES usuario(id) ON DELETE SET NULL,
    usuario_nombre   varchar(200),

    estado           varchar(20) NOT NULL DEFAULT 'activo',  -- activo | finalizado | error | abandonado
    total            integer DEFAULT 0,
    actual           integer DEFAULT 0,
    exitos           integer DEFAULT 0,
    fallidos         integer DEFAULT 0,
    ultimo           text,
    error            text,
    detalle          jsonb,

    iniciado_at      timestamptz DEFAULT NOW(),
    latido_at        timestamptz DEFAULT NOW(),   -- se refresca en cada paso
    finalizado_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_proceso_activo ON proceso_en_curso (tipo, estado, iniciado_at DESC);
CREATE INDEX IF NOT EXISTS idx_proceso_org    ON proceso_en_curso (organizacion_id, iniciado_at DESC);

COMMENT ON COLUMN proceso_en_curso.latido_at IS
    'Se refresca en cada paso. Si un proceso "activo" lleva mucho sin latir, murió con el servidor.';

COMMIT;
