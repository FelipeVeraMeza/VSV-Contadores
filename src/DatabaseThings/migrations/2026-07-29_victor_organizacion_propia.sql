-- ===================================================================================
-- MIGRACIÓN: Victor pasa a ser "un usuario nuevo" (su propia organización)
-- ===================================================================================
-- POR QUÉ
-- El multi-tenant (ver 2026-07-06_organizacion_multitenant.sql) aísla por
-- organizacion_id: cada consulta del sistema acota a la organización del usuario
-- de la sesión. Esa migración inicial metió a TODOS los usuarios y a TODAS las
-- empresas existentes en la única organización que había, la de la firma
-- (VOLLAIRE & OLIVOS SIMPLE PYME LTDA). Por eso Victor veía las 216 empresas de
-- SIMPLE PYME: no es que tuviera un permiso extra, es que estaba *dentro* del
-- mismo tenant.
--
-- Ojo: como Victor es rol 'Administrador', quitarle las asignaciones de `audita`
-- NO alcanzaba. `audita` solo limita al rol 'Cliente'
-- (companies.controllers.js → listCompaniesLista); un Administrador ve todas las
-- empresas de SU organización. Lo que separa de verdad es la organización.
--
-- QUÉ HACE
-- Le da a Victor una organización propia y vacía. Sigue siendo Administrador y
-- conserva sus permisos de módulos (admin_modulos), pero arranca sin empresas,
-- sin cartera, sin cobros, sin documentos: exactamente lo que ve un usuario que
-- recién se registra. "Un usuario más, pero con los roles de admin".
--
-- Idempotente. Para deshacer:
-- ROLLBACK_2026-07-29_victor_organizacion_propia.sql (incluye las 216 empresas).
-- ===================================================================================

BEGIN;

-- 1. Organización propia de Victor (nombre tomado de su correo corporativo,
--    victor.vollaire@vsvconsultores.com). Renombrable con un simple UPDATE.
INSERT INTO organizacion (nombre)
SELECT 'VSV CONSULTORES'
 WHERE NOT EXISTS (SELECT 1 FROM organizacion WHERE nombre = 'VSV CONSULTORES');

-- 2. Mover a Victor a su organización. Se mantiene rol = 'Administrador'.
UPDATE usuario
   SET organizacion_id = (SELECT id FROM organizacion WHERE nombre = 'VSV CONSULTORES')
 WHERE id = '67d47701-cecd-4725-b05f-737ab92b04ac';

-- 3. Soltar las asignaciones de empresa heredadas de la organización anterior.
--    Quedarían apuntando a empresas de otro tenant: hoy ninguna consulta las
--    deja pasar (todas cruzan por organizacion_id), pero son basura y un riesgo
--    si mañana alguna consulta join-ea `audita` sin acotar la organización.
DELETE FROM audita
 WHERE usuario_id = '67d47701-cecd-4725-b05f-737ab92b04ac';

-- 4. Cerrar sus sesiones abiertas. Al re-loguear, el front limpia
--    selectedCompany / empresaActivaCRM / companyScope (useAuth.jsx → login),
--    así no le queda una empresa de SIMPLE PYME elegida en el localStorage.
DELETE FROM sessions
 WHERE usuario_id = '67d47701-cecd-4725-b05f-737ab92b04ac';

COMMIT;

-- ===================================================================================
-- NOTAS PARA EL PRIMER USO DE LA CUENTA NUEVA
-- ---------------------------------------------------------------------------------
-- - Su organización no tiene empresa principal (empresa.es_principal). Hasta que
--   cree su primera empresa y la marque como principal, el sistema se queda en
--   "Todas las empresas", que en su tenant es un consolidado vacío.
-- - plan_cuentas no tiene filas globales (empresa_id IS NULL), así que sus
--   empresas nuevas arrancan con el plan de cuentas vacío.
-- - No tiene credenciales SII propias (credenciales_emisor_sii es PK por
--   organizacion_id), así que facturación y el robot del SII no operan hasta que
--   las cargue.
-- ===================================================================================
