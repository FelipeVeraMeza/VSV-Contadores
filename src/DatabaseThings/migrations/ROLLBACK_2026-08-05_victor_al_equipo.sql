-- ===================================================================================
-- ROLLBACK de 2026-08-05_victor_al_equipo.sql
-- ===================================================================================
-- Devuelve a Victor a su propia organización con su trabajo.
--
-- ⚠️ Solo sirve si NO se le asignaron empresas ni tareas del equipo después del
-- cambio. Si ya comparte proyectos con Mati o el master, revertir lo dejaría
-- viendo cosas que no son suyas, o al revés. En ese caso hay que decidir a mano
-- qué se lleva y qué se queda.
--
-- La bandera `ve_solo_empresas_asignadas` NO se elimina: la usan otros usuarios
-- potencialmente, y quitar una columna es destructivo. Solo se apaga para él.
-- ===================================================================================

BEGIN;

DO $$
DECLARE
    v_victor  uuid;
    v_origen  uuid;   -- VSV CONSULTORES
BEGIN
    SELECT id INTO v_victor
      FROM usuario WHERE nombre ILIKE '%VOLLAIRE SILVA%' AND activo LIMIT 1;

    SELECT id INTO v_origen
      FROM organizacion WHERE nombre ILIKE '%VSV CONSULTORES%' LIMIT 1;

    IF v_victor IS NULL OR v_origen IS NULL THEN
        RAISE EXCEPTION 'No se encontró a Victor o la organización VSV CONSULTORES';
    END IF;

    -- Solo vuelve lo que creó él, no lo que pueda haber compartido después.
    UPDATE proyecto         SET organizacion_id = v_origen WHERE creado_por = v_victor;
    UPDATE tarea            SET organizacion_id = v_origen WHERE creado_por = v_victor;
    UPDATE bitacora_sistema SET organizacion_id = v_origen WHERE usuario_id  = v_victor;

    UPDATE usuario
       SET organizacion_id = v_origen,
           ve_solo_empresas_asignadas = false
     WHERE id = v_victor;

    RAISE NOTICE 'Victor devuelto a VSV CONSULTORES.';
END $$;

COMMIT;
