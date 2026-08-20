-- ===================================================================================
-- 2026-08-20 · Victor vuelve a ver todas las empresas
-- ===================================================================================
-- POR QUÉ
-- El 20-08 se cerró el recorte por usuario (`ve_solo_empresas_asignadas`) y se le
-- activó a Victor, siguiendo lo pedido entonces: «no debería ver ninguna empresa».
-- El negocio lo corrigió el mismo día: Victor es de la oficina y tiene que ver la
-- cartera completa. El recorte NO era para él.
--
-- Para quién SÍ es: las cuentas de fuera de la organización —el rol `Cliente`—
-- que entran a ver lo suyo y nada más. Eso NO depende de esta bandera: la función
-- `veSoloAsignadas()` de `src/utils/scope.js` ya devuelve true para el rol
-- `Cliente` por sí sola. Así que apagarle la bandera a Victor no reabre ningún
-- hueco: los porteros que se pusieron en Contabilidad, Caja, Bancos, Remuneraciones
-- y los selectores siguen en pie y siguen aplicando a los clientes externos.
--
-- QUÉ HACE
--   Apaga `ve_solo_empresas_asignadas` en Victor. Nada más.
--   No toca `audita`: las empresas que él creó siguen registradas a su nombre.
--
-- REVERTIR: poner la bandera en true otra vez.
--   UPDATE usuario SET ve_solo_empresas_asignadas = true
--    WHERE nombre ILIKE '%VOLLAIRE SILVA%' AND activo;
-- ===================================================================================

BEGIN;

UPDATE usuario
   SET ve_solo_empresas_asignadas = false
 WHERE nombre ILIKE '%VOLLAIRE SILVA%'
   AND activo;

-- Deja constancia de para qué queda la columna, ahora que no la usa nadie:
COMMENT ON COLUMN usuario.ve_solo_empresas_asignadas IS
    'Recorta a este usuario a las empresas que tenga en `audita`. Pensada para cuentas de FUERA de la organización (clientes externos). El rol Cliente ya queda recortado sin necesidad de esta bandera; sirve para recortar a alguien que no sea rol Cliente.';

COMMIT;
