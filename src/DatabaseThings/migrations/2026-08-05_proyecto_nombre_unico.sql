-- ===================================================================================
-- 2026-08-05 · Un proyecto no puede repetirse dentro de la misma organización
-- ===================================================================================
-- POR QUÉ
-- Al crear un proyecto salieron dos idénticos. La causa no es misteriosa: no había
-- NADA que lo impidiera. Ni la base ni la pantalla.
--
-- En la pantalla, el campo de nombre crea con Enter y también con el botón, y no
-- se bloqueaba mientras la petición viajaba: dos pulsaciones rápidas —o un Enter
-- seguido de un clic— mandaban dos veces.
--
-- La lección ya la teníamos: en la prueba de concurrencia del 04-08, dos personas
-- generando los cobros del mes a la vez NO duplicaron nada, y no fue por suerte
-- ni por buen código, sino porque `cobro_mensual` tiene una restricción única.
-- Los proyectos no la tenían.
--
-- El arreglo de la pantalla se hace igual, para avisar bien; pero la garantía
-- tiene que estar acá abajo, donde no depende de que nadie se acuerde.
--
-- Se compara sin distinguir mayúsculas ni espacios sobrantes: "Renta 2026",
-- "renta 2026" y "Renta 2026  " son el mismo proyecto para una persona.
-- Los archivados quedan fuera: un proyecto cerrado no debe impedir abrir otro
-- con el mismo nombre el año siguiente.
-- ===================================================================================

BEGIN;

-- Por si ya quedaron duplicados de antes: se conserva el más antiguo y las
-- tareas del repetido se mueven al que se conserva, para no perder trabajo.
WITH ordenados AS (
    SELECT id, organizacion_id, LOWER(TRIM(nombre)) AS clave,
           FIRST_VALUE(id) OVER (PARTITION BY organizacion_id, LOWER(TRIM(nombre))
                                 ORDER BY created_at) AS se_conserva
      FROM proyecto
     WHERE estado <> 'archivado'
)
UPDATE tarea t SET proyecto_id = o.se_conserva
  FROM ordenados o
 WHERE t.proyecto_id = o.id AND o.id <> o.se_conserva;

DELETE FROM proyecto p
 USING (
    SELECT id, FIRST_VALUE(id) OVER (PARTITION BY organizacion_id, LOWER(TRIM(nombre))
                                     ORDER BY created_at) AS se_conserva
      FROM proyecto WHERE estado <> 'archivado'
 ) o
 WHERE p.id = o.id AND o.id <> o.se_conserva;

CREATE UNIQUE INDEX IF NOT EXISTS uq_proyecto_nombre_por_organizacion
    ON proyecto (organizacion_id, LOWER(TRIM(nombre)))
    WHERE estado <> 'archivado';

COMMENT ON INDEX uq_proyecto_nombre_por_organizacion IS
    'Impide dos proyectos con el mismo nombre en una organización. No aplica a los archivados.';

COMMIT;
