-- ===================================================================================
-- 2026-08-05 · Victor se suma al equipo, pero sigue partiendo desde cero
-- ===================================================================================
-- POR QUÉ
-- El 31-07 se le dio a Victor su propia organización en blanco, porque se pidió
-- que «no heredara nada». Funcionó exactamente así: página vacía y aislamiento
-- total. El efecto secundario apareció ahora — **no se le pueden asignar tareas**,
-- porque el selector de personas solo ofrece a las de tu propia organización, y
-- eso no es un error sino el aislamiento haciendo su trabajo.
--
-- El negocio quiere las dos cosas a la vez: que sea un trabajador más del equipo
-- (tareas, proyectos compartidos) y que su página empiece en 0.
--
-- Estar en organizaciones distintas resuelve lo segundo e impide lo primero. Así
-- que se cambia el mecanismo: Victor pasa al equipo, y el «empezar en 0» deja de
-- lograrse separando organizaciones y pasa a lograrse con una bandera por
-- usuario: ve solo las empresas que se le asignen.
--
-- QUÉ HACE
--   1. `usuario.ve_solo_empresas_asignadas`: un Administrador con esta bandera ve
--      únicamente las empresas que tenga en `audita`. Empieza en cero y va
--      sumando las que cree o le entreguen.
--   2. Mueve a Victor a VOLLAIRE & OLIVOS **con su trabajo**: su proyecto, sus
--      tareas y su bitácora. Sin esto perdería lo que ya tiene cargado.
--   3. Deja vacía la organización VSV CONSULTORES, sin borrarla, para poder
--      revertir esto si hiciera falta.
--
-- REVERSIBLE: ver ROLLBACK_2026-08-05_victor_al_equipo.sql
-- ===================================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1 · La bandera: empezar en cero sin estar aislado
-- -----------------------------------------------------------------------------
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS ve_solo_empresas_asignadas boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN usuario.ve_solo_empresas_asignadas IS
    'Un Administrador con esto en true ve solo las empresas que tenga asignadas en audita, no todas las de su organización. Sirve para que alguien entre al equipo empezando desde cero.';

-- -----------------------------------------------------------------------------
-- 2 · Mover a Victor y todo lo suyo
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_victor  uuid;
    v_destino uuid;
    v_origen  uuid;
BEGIN
    SELECT id, organizacion_id INTO v_victor, v_origen
      FROM usuario WHERE nombre ILIKE '%VOLLAIRE SILVA%' AND activo LIMIT 1;

    SELECT id INTO v_destino
      FROM organizacion WHERE nombre ILIKE '%SIMPLE PYME%' LIMIT 1;

    IF v_victor IS NULL OR v_destino IS NULL THEN
        RAISE EXCEPTION 'No se encontró a Victor o la organización de destino';
    END IF;

    -- Su trabajo viaja con él. El orden importa: primero los datos, después el
    -- usuario, para que en ningún momento queden apuntando a una organización
    -- en la que él ya no está.
    UPDATE proyecto         SET organizacion_id = v_destino WHERE organizacion_id = v_origen;
    UPDATE tarea            SET organizacion_id = v_destino WHERE organizacion_id = v_origen;
    UPDATE bitacora_sistema SET organizacion_id = v_destino WHERE organizacion_id = v_origen;

    UPDATE usuario
       SET organizacion_id = v_destino,
           -- Entra al equipo, pero su página sigue empezando vacía.
           ve_solo_empresas_asignadas = true
     WHERE id = v_victor;

    RAISE NOTICE 'Victor movido a la organización del equipo, viendo solo lo que se le asigne.';
END $$;

COMMIT;
