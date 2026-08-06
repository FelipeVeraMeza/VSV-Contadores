-- ===================================================================================
-- 2026-08-05 · Notificaciones
-- ===================================================================================
-- POR QUÉ
-- Dos tareas del equipo lo piden: «NOTIFICACIONES DE TAREAS» y «Mejorar respuesta
-- real en dejar una tarea a otro usuario en respuesta de una notificación».
--
-- Hoy el sistema no avisa NADA. Si le asignas una tarea a alguien, se entera
-- cuando abre la pantalla — y como la pantalla no se abre sola, en la práctica se
-- entera cuando alguien le avisa por WhatsApp. Es lo que más se echa de menos.
--
-- QUÉ HACE
-- Una fila por aviso y por persona. No se manda correo: es dentro del sistema.
-- El correo puede venir después, cuando el dominio esté verificado.
--
-- DECISIONES
--   · `leida_at` en vez de un booleano: sirve para saber CUÁNDO se enteró, que es
--     la pregunta que aparece cuando algo se pasó de plazo.
--   · `entidad` + `entidad_id` en vez de una tabla por tipo: los avisos apuntan a
--     tareas hoy, y mañana a cobros o documentos sin cambiar el esquema.
--   · Nadie se notifica a sí mismo. Si me asigno una tarea, ya lo sé.
-- ===================================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS notificacion (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid,

    -- A quién le llega.
    usuario_id      uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    -- Quién la provocó. Se guarda el nombre para que sobreviva a un borrado.
    actor_id        uuid REFERENCES usuario(id) ON DELETE SET NULL,
    actor_nombre    varchar(150),

    -- 'tarea_asignada' | 'tarea_comentada' | 'tarea_vence' | 'agregado_a_proyecto'
    tipo            varchar(40) NOT NULL,
    titulo          varchar(200) NOT NULL,
    descripcion     text,

    -- A dónde lleva al pulsarla.
    entidad         varchar(30),
    entidad_id      uuid,

    leida_at        timestamptz,
    created_at      timestamptz DEFAULT now()
);

-- La consulta de siempre: mis avisos sin leer, los más nuevos primero.
CREATE INDEX IF NOT EXISTS idx_notificacion_pendientes
    ON notificacion (usuario_id, created_at DESC)
    WHERE leida_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notificacion_usuario
    ON notificacion (usuario_id, created_at DESC);

COMMENT ON COLUMN notificacion.leida_at IS
    'NULL = sin leer. Con fecha = cuándo se enteró, no solo que se enteró.';

COMMIT;
