-- ===================================================================================
-- 2026-08-05 · Integrantes del proyecto y visibilidad de la tarea
-- ===================================================================================
-- POR QUÉ
-- La tarea «SISTEMA DE TAREAS» del proyecto SOFTWARE SIMPLE PYME lo dice textual:
--
--   «Quien crea la tarea puede definir quién la ve. Al crear un proyecto se debe
--    añadir a los usuarios que uno desee, y todos los usuarios del proyecto pueden
--    ver todas las tareas, a no ser que quien cree la tarea lo configure de otra
--    forma.»
--
-- Hasta hoy el módulo funcionaba al revés: cualquier administrador de la
-- organización veía TODOS los proyectos y TODAS las tareas, y los "integrantes"
-- se deducían de quién aparecía en las tareas. Era la recomendación original
-- —espacio compartido de oficina— y el negocio decidió lo contrario.
--
-- QUÉ CAMBIA
--
-- 1. `proyecto_integrante`: quién pertenece a cada proyecto, agregado a mano.
--    Ser administrador ya NO alcanza para ver un proyecto ajeno.
--
-- 2. `tarea.visibilidad`: por defecto la tarea se ve como el proyecto
--    ('proyecto'); quien la crea puede restringirla a los involucrados
--    ('privada'). Ese es el "a no ser que lo configure de otra forma".
--
-- RESGUARDO IMPORTANTE
-- Nadie puede perder acceso a lo que ya estaba usando. La migración da de alta
-- como integrantes a todos los que hoy participan: el creador del proyecto, su
-- responsable, y los responsables, creadores y colaboradores de sus tareas.
-- Sin esto, al aplicar el cambio los proyectos existentes desaparecerían de la
-- pantalla de sus propios dueños.
-- ===================================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1 · Integrantes del proyecto
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS proyecto_integrante (
    proyecto_id  uuid NOT NULL REFERENCES proyecto(id) ON DELETE CASCADE,
    usuario_id   uuid NOT NULL REFERENCES usuario(id)  ON DELETE CASCADE,

    -- 'responsable' puede administrar el proyecto y sus integrantes.
    -- 'integrante'  ve y trabaja, pero no reparte accesos.
    rol          varchar(20) NOT NULL DEFAULT 'integrante',

    agregado_por uuid REFERENCES usuario(id) ON DELETE SET NULL,
    created_at   timestamptz DEFAULT now(),

    PRIMARY KEY (proyecto_id, usuario_id)
);

ALTER TABLE proyecto_integrante DROP CONSTRAINT IF EXISTS proyecto_integrante_rol_valido;
ALTER TABLE proyecto_integrante ADD  CONSTRAINT proyecto_integrante_rol_valido
    CHECK (rol IN ('responsable', 'integrante'));

CREATE INDEX IF NOT EXISTS idx_proyecto_integrante_usuario
    ON proyecto_integrante (usuario_id);

COMMENT ON TABLE proyecto_integrante IS
    'Quién pertenece a cada proyecto. Sin fila acá, el proyecto no se ve — ni siendo Administrador.';

-- -----------------------------------------------------------------------------
-- 2 · Visibilidad de la tarea
-- -----------------------------------------------------------------------------
ALTER TABLE tarea ADD COLUMN IF NOT EXISTS visibilidad varchar(12) NOT NULL DEFAULT 'proyecto';

ALTER TABLE tarea DROP CONSTRAINT IF EXISTS tarea_visibilidad_valida;
ALTER TABLE tarea ADD  CONSTRAINT tarea_visibilidad_valida
    CHECK (visibilidad IN ('proyecto', 'privada'));

COMMENT ON COLUMN tarea.visibilidad IS
    'proyecto = la ven todos los integrantes (por defecto). privada = solo responsable, creador y colaboradores.';

-- -----------------------------------------------------------------------------
-- 3 · Dar de alta a quienes YA participan, para que nadie pierda acceso
-- -----------------------------------------------------------------------------
-- El creador del proyecto queda como responsable del proyecto.
INSERT INTO proyecto_integrante (proyecto_id, usuario_id, rol, agregado_por)
SELECT pr.id, pr.creado_por, 'responsable', pr.creado_por
  FROM proyecto pr
 WHERE pr.creado_por IS NOT NULL
ON CONFLICT DO NOTHING;

-- El responsable declarado del proyecto, si es otro.
INSERT INTO proyecto_integrante (proyecto_id, usuario_id, rol, agregado_por)
SELECT pr.id, pr.responsable_id, 'responsable', pr.creado_por
  FROM proyecto pr
 WHERE pr.responsable_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Todo el que aparezca en alguna tarea del proyecto: responsable o creador.
INSERT INTO proyecto_integrante (proyecto_id, usuario_id, rol, agregado_por)
SELECT DISTINCT t.proyecto_id, u.id, 'integrante', NULL::uuid
  FROM tarea t
  JOIN usuario u ON u.id IN (t.responsable_id, t.creado_por)
 WHERE t.proyecto_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Y los colaboradores de esas tareas.
INSERT INTO proyecto_integrante (proyecto_id, usuario_id, rol, agregado_por)
SELECT DISTINCT t.proyecto_id, tc.usuario_id, 'integrante', NULL::uuid
  FROM tarea_colaborador tc
  JOIN tarea t ON t.id = tc.tarea_id
 WHERE t.proyecto_id IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;
