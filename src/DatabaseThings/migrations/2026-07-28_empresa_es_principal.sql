-- ============================================================================
-- Empresa principal ("la cabeza") de cada organización
-- ----------------------------------------------------------------------------
-- Hasta ahora la empresa principal (VOLLAIRE & OLIVOS SIMPLE PYME LTDA) estaba
-- hardcodeada como texto en el frontend y NO se podía seleccionar: la opción del
-- selector global hacía setSelectedCompany(null), o sea apagaba la selección.
-- Resultado: los módulos mostraban el consolidado de TODAS las empresas mientras
-- el rótulo decía "VOLLAIRE & OLIVOS".
--
-- La empresa principal es una empresa más del sistema (está en `empresa`, con su
-- propia contabilidad y sus propios trabajadores); lo único distinto es que es la
-- primera en aparecer. Eso es exactamente lo que marca esta columna.
-- ============================================================================

ALTER TABLE empresa
  ADD COLUMN IF NOT EXISTS es_principal BOOLEAN NOT NULL DEFAULT FALSE;

-- Una sola empresa principal por organización.
CREATE UNIQUE INDEX IF NOT EXISTS empresa_una_principal_por_organizacion
  ON empresa (organizacion_id)
  WHERE es_principal;

-- Marca como principal la empresa cuya razón social coincide con el nombre de la
-- organización (VOLLAIRE & OLIVOS SIMPLE PYME LTDA). Si hubiera más de una
-- coincidencia se toma la más antigua, para no chocar con el índice único.
WITH candidata AS (
  SELECT DISTINCT ON (e.organizacion_id) e.id, e.organizacion_id
  FROM empresa e
  JOIN organizacion o ON o.id = e.organizacion_id
  WHERE upper(trim(e.razon_social)) = upper(trim(o.nombre))
  ORDER BY e.organizacion_id, e.created_at ASC
)
UPDATE empresa e
SET es_principal = TRUE
FROM candidata c
WHERE e.id = c.id
  AND NOT EXISTS (
    SELECT 1 FROM empresa x
    WHERE x.organizacion_id = c.organizacion_id AND x.es_principal
  );
