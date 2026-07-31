-- ===================================================================================
-- ROLLBACK · Victor vuelve a la organización de la firma
-- ===================================================================================
-- Deshace 2026-07-31_victor_admin_tenant_propio.sql: devuelve a Victor a
-- VOLLAIRE & OLIVOS SIMPLE PYME LTDA como Administrador, con las empresas de la
-- cartera asignadas.
--
-- ⚠️ OJO CON ESTO
-- Lo que Victor haya CREADO mientras estuvo separado (empresas, clientes,
-- cobros, trabajadores, tareas) queda en la organización VSV CONSULTORES y NO
-- viaja con él. Este rollback mueve al usuario, no a sus datos.
--
-- Antes de correrlo, revisar qué dejaría atrás:
--   SELECT 'empresas', COUNT(*) FROM empresa
--    WHERE organizacion_id = (SELECT id FROM organizacion WHERE nombre='VSV CONSULTORES')
--   UNION ALL SELECT 'personas', COUNT(*) FROM persona
--    WHERE organizacion_id = (SELECT id FROM organizacion WHERE nombre='VSV CONSULTORES');
-- ===================================================================================

BEGIN;

-- 1. De vuelta a la organización de la firma.
UPDATE usuario
   SET organizacion_id = (SELECT id FROM organizacion WHERE nombre = 'VOLLAIRE & OLIVOS SIMPLE PYME LTDA'),
       updated_at = NOW()
 WHERE rut_hash = encode(sha256('16717867-7'::bytea), 'hex');

-- 2. Le devuelve las empresas de la cartera (las mismas que tiene la cuenta master).
INSERT INTO audita (usuario_id, empresa_id)
SELECT v.id, a.empresa_id
  FROM usuario v
  CROSS JOIN LATERAL (
        SELECT DISTINCT a.empresa_id
          FROM audita a
          JOIN usuario m ON m.id = a.usuario_id
         WHERE m.nombre = 'Administrador master'
  ) a
 WHERE v.rut_hash = encode(sha256('16717867-7'::bytea), 'hex')
   AND NOT EXISTS (
        SELECT 1 FROM audita x WHERE x.usuario_id = v.id AND x.empresa_id = a.empresa_id
   );

-- 3. La organización vacía se borra SOLO si no quedó nada adentro.
DELETE FROM organizacion o
 WHERE o.nombre = 'VSV CONSULTORES'
   AND NOT EXISTS (SELECT 1 FROM usuario  u WHERE u.organizacion_id = o.id)
   AND NOT EXISTS (SELECT 1 FROM empresa  e WHERE e.organizacion_id = o.id)
   AND NOT EXISTS (SELECT 1 FROM persona  p WHERE p.organizacion_id = o.id);

COMMIT;
