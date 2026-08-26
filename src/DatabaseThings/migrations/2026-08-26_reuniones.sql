-- =====================================================================
-- Migración: REUNIONES · videollamada dentro del sistema
-- Fecha: 2026-08-26 · Idempotente.
-- =====================================================================
-- QUÉ RESUELVE
-- Hoy una reunión con un cliente o entre el equipo vive fuera del sistema:
-- se arma un Meet, se manda el link por WhatsApp, y lo que se habló no queda
-- en ninguna parte. Después nadie sabe cuándo fue, quién estuvo ni qué se
-- acordó.
--
-- QUÉ SE GUARDA ACÁ Y QUÉ NO
-- El VIDEO no pasa por este sistema —lo sirve Jitsi, y va directo entre los
-- participantes—. Acá vive todo lo demás, que es lo que Meet no da: cuándo
-- es, quién está invitado, de qué cliente y de qué tarea se trata, quién
-- entró de verdad y qué se acordó al final.
--
-- Por eso la tabla no depende de Jitsi: si mañana se cambia el proveedor de
-- video, cambia UNA columna (`sala`) y nada más.
--
-- POR QUÉ NO SE REUSÓ `tarea`
-- La convención del proyecto es que toda actividad del CRM —incluidas las
-- reuniones -como-registro— va a `tarea`. Una videollamada es otra cosa: tiene
-- sala, hora de inicio y fin reales, varios participantes con asistencia
-- propia y un estado en vivo. Forzarlo en `tarea` habría significado usar
-- `vence_at` como hora de inicio y `tarea_colaborador` como lista de asistencia,
-- que es exactamente el tipo de reutilización que después nadie entiende.
-- Se enlazan con `tarea_id`: una reunión puede colgar de un ticket.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1 · La reunión
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reunion (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id  uuid,

    titulo           varchar(200) NOT NULL,
    descripcion      text,

    -- EL NOMBRE DE LA SALA. Es lo único que sabe de Jitsi, y a propósito.
    -- Se genera largo y aleatorio: quien no tiene el nombre no puede entrar,
    -- y una sala adivinable —«reunion-vsv»— la abre cualquiera desde fuera.
    sala             varchar(120) NOT NULL UNIQUE,

    -- Cuándo. `inicia_at` en NULL es una llamada de AHORA: se arma y se
    -- entra, sin agendar. Las dos formas conviven porque las dos pasan.
    inicia_at        timestamptz,
    duracion_min     integer DEFAULT 30,

    -- agendada → en_curso → terminada.  'cancelada' la corta antes.
    estado           varchar(20) NOT NULL DEFAULT 'agendada',

    -- De qué se trata. Las tres son opcionales: una reunión interna no tiene
    -- cliente, y una llamada rápida no cuelga de ninguna tarea.
    persona_id       uuid REFERENCES persona(id) ON DELETE SET NULL,
    empresa_id       uuid,
    tarea_id         uuid REFERENCES tarea(id) ON DELETE SET NULL,

    creado_por       uuid REFERENCES usuario(id) ON DELETE SET NULL,

    -- Lo que pasó de verdad, que casi nunca calza con lo agendado.
    iniciada_at      timestamptz,
    terminada_at     timestamptz,

    -- El acuerdo. Es la razón de tener esto adentro del sistema y no en Meet.
    notas            text,

    created_at       timestamptz DEFAULT now(),
    updated_at       timestamptz DEFAULT now()
);

ALTER TABLE reunion DROP CONSTRAINT IF EXISTS reunion_estado_valido;
ALTER TABLE reunion ADD  CONSTRAINT reunion_estado_valido
    CHECK (estado IN ('agendada', 'en_curso', 'terminada', 'cancelada'));

CREATE INDEX IF NOT EXISTS idx_reunion_org     ON reunion (organizacion_id, inicia_at DESC);
CREATE INDEX IF NOT EXISTS idx_reunion_persona ON reunion (persona_id);
CREATE INDEX IF NOT EXISTS idx_reunion_tarea   ON reunion (tarea_id);

COMMENT ON TABLE  reunion IS
    'Reuniones por videollamada. El video lo sirve Jitsi; acá vive el contexto: quién, cuándo, de qué cliente y qué se acordó.';
COMMENT ON COLUMN reunion.sala IS
    'Nombre de la sala en el proveedor de video. Largo y aleatorio a propósito: es la llave de entrada.';

-- ---------------------------------------------------------------------
-- 2 · Quién está invitado, y quién entró
-- ---------------------------------------------------------------------
-- Se guardan las dos cosas en la misma fila. Invitar es una intención;
-- `entro_at` es el hecho. Sin esa diferencia no se puede responder «¿asistió
-- el cliente a la reunión del martes?», que es la pregunta que se hace.
CREATE TABLE IF NOT EXISTS reunion_participante (
    reunion_id   uuid NOT NULL REFERENCES reunion(id)  ON DELETE CASCADE,
    usuario_id   uuid NOT NULL REFERENCES usuario(id)  ON DELETE CASCADE,

    -- 'anfitrion' puede terminar la reunión y editarla; 'invitado' entra y sale.
    rol          varchar(20) NOT NULL DEFAULT 'invitado',

    entro_at     timestamptz,
    salio_at     timestamptz,

    PRIMARY KEY (reunion_id, usuario_id)
);

ALTER TABLE reunion_participante DROP CONSTRAINT IF EXISTS reunion_participante_rol_valido;
ALTER TABLE reunion_participante ADD  CONSTRAINT reunion_participante_rol_valido
    CHECK (rol IN ('anfitrion', 'invitado'));

CREATE INDEX IF NOT EXISTS idx_reunion_participante_usuario
    ON reunion_participante (usuario_id);

COMMENT ON TABLE reunion_participante IS
    'Invitados a una reunión. `entro_at` distingue al que asistió del que solo fue invitado.';
