-- ===================================================================================
-- 2026-08-20 · El RUT de una empresa es único POR ORGANIZACIÓN, no en todo el sistema
-- ===================================================================================
-- EL CASO QUE LO DESTAPÓ
-- En una reunión, Victor intentó crear un cliente que ya existía en la organización
-- y el sistema lo rechazó — hasta ahí, correcto. La pregunta que quedó fue la otra:
-- si una cuenta de FUERA de la organización crea ese mismo cliente, con el mismo
-- RUT, ¿se guarda?
--
-- Hoy NO se guarda, y está mal. Lo impiden dos capas:
--
--   1. `crearEmpresaCRM` buscaba el RUT en TODA la tabla, sin mirar organización.
--   2. Aunque se arreglara eso, la base tiene `UNIQUE (rut_hash)` a secas: el
--      INSERT reventaría igual contra la restricción.
--
-- POR QUÉ ESTÁ MAL
-- El sistema es multi-organización: cada oficina contable lleva su propia cartera.
-- Que dos oficinas distintas atiendan a la misma empresa es NORMAL —un cliente
-- puede cambiarse de contador, o tener dos— y hoy la segunda oficina simplemente
-- no puede darlo de alta. Peor: el mensaje que recibe es «Ya existe un cliente con
-- ese RUT», nombrando una empresa que no es suya y que no puede ver. Es un dato de
-- otra organización filtrándose en un mensaje de error.
--
-- QUÉ HACE
--   Cambia la restricción global por una por organización. Dentro de una misma
--   oficina el RUT sigue sin poder repetirse, que es lo que se quería evitar.
--
-- SEGURO DE APLICAR: al 20-08-2026 hay 221 empresas y TODAS en una sola
-- organización, así que ninguna fila viola la restricción nueva. Si en el futuro
-- hubiera duplicados reales entre organizaciones, esta migración fallaría en vez
-- de borrar nada.
--
-- REVERTIR:
--   ALTER TABLE empresa DROP CONSTRAINT empresa_rut_hash_org_key;
--   ALTER TABLE empresa ADD CONSTRAINT empresa_rut_hash_key UNIQUE (rut_hash);
--   (solo funciona si no hay RUT repetidos entre organizaciones)
-- ===================================================================================

BEGIN;

-- Comprobación previa: si esto devuelve filas, la migración se detiene.
DO $$
DECLARE
    n integer;
BEGIN
    SELECT count(*) INTO n FROM (
        SELECT rut_hash, organizacion_id
          FROM empresa
         WHERE rut_hash IS NOT NULL
         GROUP BY rut_hash, organizacion_id
        HAVING count(*) > 1
    ) AS repetidos;

    IF n > 0 THEN
        RAISE EXCEPTION 'Hay % RUT repetidos DENTRO de una misma organización. Hay que resolverlos antes.', n;
    END IF;
END $$;

-- 1 · Fuera la restricción global
ALTER TABLE empresa DROP CONSTRAINT IF EXISTS empresa_rut_hash_key;

-- 2 · La misma regla, pero acotada a la organización
ALTER TABLE empresa
  ADD CONSTRAINT empresa_rut_hash_org_key UNIQUE (organizacion_id, rut_hash);

COMMENT ON CONSTRAINT empresa_rut_hash_org_key ON empresa IS
    'Un RUT no se repite DENTRO de una organización. Entre organizaciones sí puede: dos oficinas contables pueden atender a la misma empresa.';

COMMIT;
