-- ===================================================================================
-- 2026-07-31 · Victor: Administrador de su propia organización, desde cero
-- ===================================================================================
-- QUÉ PIDIÓ
-- "Es un administrador más, pero tiene todo desde 0": el programa como un papel
-- en blanco, para armarlo a su manera.
--
-- POR QUÉ ASÍ
-- En este sistema hay dos ejes independientes, y confundirlos es lo que hizo
-- fallar el intento anterior:
--
--   · ROL          (usuario.rol)            = qué PUEDE HACER
--   · ORGANIZACIÓN (usuario.organizacion_id) = de QUIÉN SON LOS DATOS QUE VE
--
-- "Administrador con todo en blanco" = rol Administrador + organización propia.
-- Quitarle empresas de `audita` NO alcanza: `audita` solo acota al rol Cliente
-- (ver listCompaniesLista); un Administrador ve TODAS las empresas de su
-- organización. Lo único que separa de verdad es `organizacion_id`.
--
-- QUÉ QUEDA EN BLANCO
-- Las 25 tablas que llevan organizacion_id: empresas, personas, cobros, tareas,
-- proyectos, correos, remuneraciones completas, caja, WhatsApp y bitácora.
--
-- QUÉ HEREDA (a propósito)
-- Los catálogos compartidos, que no separan por organización: los 6 planes de
-- cobro, los 10 servicios y los 17 tramos de precio. Le sirven de punto de
-- partida y puede ignorarlos.
--
-- CONSECUENCIA ACEPTADA
-- SIMPLE PYME deja de ver lo de Victor y Victor deja de ver lo de SIMPLE PYME.
-- Las 216 empresas se quedan en la organización de la firma.
--
-- Idempotente: se puede correr más de una vez.
-- Para deshacer: ROLLBACK_2026-07-31_victor_admin_tenant_propio.sql
-- ===================================================================================

BEGIN;

-- 1. Su organización propia. El nombre sale de su correo corporativo.
INSERT INTO organizacion (id, nombre)
SELECT gen_random_uuid(), 'VSV CONSULTORES'
 WHERE NOT EXISTS (SELECT 1 FROM organizacion WHERE nombre = 'VSV CONSULTORES');

-- 2. Victor pasa a ser Administrador DE ESA organización.
UPDATE usuario
   SET rol = 'Administrador',
       organizacion_id = (SELECT id FROM organizacion WHERE nombre = 'VSV CONSULTORES'),
       updated_at = NOW()
 WHERE rut_hash = encode(sha256('16717867-7'::bytea), 'hex');

-- 3. Los seis módulos habilitados, igual que cualquier administrador.
--    Sin fila en admin_modulos el sistema le permite todo igual, pero se deja
--    explícita para que el panel muestre los interruptores.
INSERT INTO admin_modulos (usuario_id, puede_ver_contabilidad, puede_ver_facturacion,
                           puede_ver_rrhh, puede_ver_operacion_renta, puede_ver_crm, puede_ver_admin)
SELECT u.id, true, true, true, true, true, true
  FROM usuario u
 WHERE u.rut_hash = encode(sha256('16717867-7'::bytea), 'hex')
   AND NOT EXISTS (SELECT 1 FROM admin_modulos m WHERE m.usuario_id = u.id);

-- 4. Sin asignaciones de empresas: arranca sin cartera.
DELETE FROM audita
 WHERE usuario_id IN (SELECT id FROM usuario WHERE rut_hash = encode(sha256('16717867-7'::bytea), 'hex'));

COMMIT;
