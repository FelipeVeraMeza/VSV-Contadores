-- ===================================================================================
-- 2026-07-31 · Módulo de Tareas · FASE 1: el modelo
-- ===================================================================================
-- POR QUÉ AHORA
-- `tarea` y `proyecto` existen desde el 22 y el 27 de julio, pero están VACÍAS:
-- 0 filas en las dos. O sea que el modelo nunca se puso a prueba con datos reales
-- y se puede corregir sin migrar nada. Después de que el equipo empiece a cargar
-- tareas, cada uno de estos cambios costaría diez veces más.
--
-- QUÉ CAMBIA
--
-- 1. ESTADOS (RF-TA-04). Faltaba "en revisión": el paso entre que alguien termina
--    algo y el responsable lo da por bueno. Sin ese estado, "completada" significa
--    dos cosas distintas según quién la marque.
--
-- 2. PRIORIDAD "crítica" (RF-TA-05). alta/media/baja no alcanza cuando todo lo
--    urgente es "alta"; queda un nivel por sobre para lo que realmente frena.
--
-- 3. ARCHIVAR NO ES UN ESTADO — es una columna aparte (`archivada_at`).
--    ⚠️ Esto se aparta de lo que anuncié: iba a agregar "archivada" como un estado
--    más. Está mal modelado y lo corrijo acá. Si archivar fuera un estado, al
--    archivar una tarea se PIERDE si estaba completada o cancelada, que es
--    justamente lo que uno quiere saber al revisar el archivo. Son dos ejes
--    distintos: en qué va la tarea, y si sigue a la vista. Se archiva cualquier
--    estado y al desarchivar la tarea vuelve como estaba.
--
-- 4. PROYECTO con responsable y fechas (RF-TA-13). Hoy un proyecto es un nombre y
--    un color: no se sabe quién responde por él ni cuándo debía terminar.
--
-- 5. `updated_at` CON TRIGGER en las dos tablas (RF-TA-16).
--    La misma lección del 30-jul con `cobro_mensual`: una columna `updated_at`
--    que depende de que la aplicación se acuerde de escribirla es peor que no
--    tenerla, porque igual se toman decisiones mirándola. Acá nace con trigger.
--
-- Las restricciones CHECK se pueden agregar sin más porque las tablas están
-- vacías; son la red que impide que un `estado` inventado entre por una ruta
-- nueva que se olvide de validar.
--
-- Idempotente: se puede correr de nuevo sin romper nada.
-- ===================================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1 · TAREA · estados y prioridades
-- -----------------------------------------------------------------------------
-- Las columnas se ensanchan primero: 'en_revision' son 11 caracteres y entra en
-- varchar(12) por poco, pero quedar al filo es pedir que el próximo estado
-- reviente en producción.
ALTER TABLE tarea ALTER COLUMN estado    TYPE varchar(20);
ALTER TABLE tarea ALTER COLUMN prioridad TYPE varchar(12);

ALTER TABLE tarea DROP CONSTRAINT IF EXISTS tarea_estado_valido;
ALTER TABLE tarea ADD  CONSTRAINT tarea_estado_valido
    CHECK (estado IN ('pendiente','en_proceso','en_revision','completada','cancelada'));

ALTER TABLE tarea DROP CONSTRAINT IF EXISTS tarea_prioridad_valida;
ALTER TABLE tarea ADD  CONSTRAINT tarea_prioridad_valida
    CHECK (prioridad IN ('baja','media','alta','critica'));

ALTER TABLE tarea DROP CONSTRAINT IF EXISTS tarea_tipo_valido;
ALTER TABLE tarea ADD  CONSTRAINT tarea_tipo_valido
    CHECK (tipo IN ('tarea','reunion','llamada','whatsapp','correo','ticket'));

COMMENT ON COLUMN tarea.estado IS
    'pendiente → en_proceso → en_revision → completada. cancelada corta el flujo. Archivar NO es un estado: ver archivada_at.';

-- -----------------------------------------------------------------------------
-- 2 · TAREA · archivo (eje aparte del estado)
-- -----------------------------------------------------------------------------
ALTER TABLE tarea ADD COLUMN IF NOT EXISTS archivada_at  timestamptz;
ALTER TABLE tarea ADD COLUMN IF NOT EXISTS archivada_por uuid REFERENCES usuario(id) ON DELETE SET NULL;

COMMENT ON COLUMN tarea.archivada_at IS
    'NULL = a la vista. Con fecha = archivada. Conserva el estado que tenía: al desarchivar vuelve igual.';

-- -----------------------------------------------------------------------------
-- 3 · PROYECTO · responsable, fechas y estados
-- -----------------------------------------------------------------------------
ALTER TABLE proyecto ADD COLUMN IF NOT EXISTS responsable_id uuid REFERENCES usuario(id) ON DELETE SET NULL;
ALTER TABLE proyecto ADD COLUMN IF NOT EXISTS fecha_inicio   date;
ALTER TABLE proyecto ADD COLUMN IF NOT EXISTS fecha_termino  date;
ALTER TABLE proyecto ADD COLUMN IF NOT EXISTS archivado_at   timestamptz;

ALTER TABLE proyecto ALTER COLUMN estado TYPE varchar(20);

ALTER TABLE proyecto DROP CONSTRAINT IF EXISTS proyecto_estado_valido;
ALTER TABLE proyecto ADD  CONSTRAINT proyecto_estado_valido
    CHECK (estado IN ('activo','pausado','completado','archivado'));

-- Una fecha de término anterior al inicio es siempre un error de tipeo.
ALTER TABLE proyecto DROP CONSTRAINT IF EXISTS proyecto_fechas_coherentes;
ALTER TABLE proyecto ADD  CONSTRAINT proyecto_fechas_coherentes
    CHECK (fecha_inicio IS NULL OR fecha_termino IS NULL OR fecha_termino >= fecha_inicio);

COMMENT ON COLUMN proyecto.responsable_id IS 'Quién responde por el proyecto completo, no por cada tarea.';
COMMENT ON COLUMN proyecto.archivado_at   IS 'Cuándo se archivó. El estado ''archivado'' dice que lo está; esto, desde cuándo.';

-- -----------------------------------------------------------------------------
-- 4 · `updated_at` de verdad, con trigger (RF-TA-16)
-- -----------------------------------------------------------------------------
ALTER TABLE tarea    ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE proyecto ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DROP TRIGGER IF EXISTS tr_update_tarea ON tarea;
CREATE TRIGGER tr_update_tarea
    BEFORE UPDATE ON tarea
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tr_update_proyecto ON proyecto;
CREATE TRIGGER tr_update_proyecto
    BEFORE UPDATE ON proyecto
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 5 · Índices para las consultas que la pantalla hace de verdad
-- -----------------------------------------------------------------------------
-- La lista por defecto pide: mi organización, sin archivar, tareas raíz.
CREATE INDEX IF NOT EXISTS idx_tarea_org_vivas
    ON tarea (organizacion_id, estado, vence_at)
    WHERE archivada_at IS NULL AND parent_id IS NULL;

-- "Mis tareas" de la pantalla Inicio (fase 4).
CREATE INDEX IF NOT EXISTS idx_tarea_responsable_vivas
    ON tarea (responsable_id, estado, vence_at)
    WHERE archivada_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_proyecto_org_estado
    ON proyecto (organizacion_id, estado, created_at DESC);

COMMIT;
