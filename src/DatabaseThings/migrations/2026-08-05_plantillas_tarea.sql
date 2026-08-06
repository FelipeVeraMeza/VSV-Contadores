-- ===================================================================================
-- 2026-08-05 · Plantillas de tareas
-- ===================================================================================
-- POR QUÉ
-- «CREAR PLANTILLAS DE TAREAS», de la lista del equipo.
--
-- El trabajo de la oficina se repite: dar de alta un cliente nuevo, cerrar un
-- F29, armar la carpeta de renta. Siempre los mismos pasos, siempre escritos de
-- nuevo a mano, y siempre con alguno que se olvida porque quien la creó ese día
-- se acordaba de siete de los ocho.
--
-- Una plantilla guarda una vez esa estructura —la tarea y sus subtareas— y
-- después la vuelca en un clic.
--
-- DECISIONES
--
-- 1. La plantilla NO guarda una fecha, guarda un PLAZO EN DÍAS. Una fecha fija
--    envejece: la plantilla "cierre de F29" con fecha 20-08-2026 sirve un mes y
--    después miente. `dias_plazo = 12` sirve siempre, y la fecha se calcula el
--    día que se usa.
--
-- 2. El responsable queda OPCIONAL. Muchas plantillas se usan para gente
--    distinta cada vez; si se guarda uno, es solo el valor sugerido.
--
-- 3. Las subtareas viven en su propia tabla con `orden`, no en un JSON. Así se
--    pueden reordenar y contar con SQL, igual que las tareas de verdad.
--
-- 4. `veces_usada` para saber cuáles sirven. Una plantilla que nadie usó en
--    seis meses es ruido en la lista y conviene poder verlo.
--
-- AISLAMIENTO
-- Todo cuelga de `organizacion_id`, como el resto del sistema. Una plantilla de
-- una organización no se ve ni se usa desde otra.
-- ===================================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1 · La plantilla
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tarea_plantilla (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id  uuid REFERENCES organizacion(id) ON DELETE CASCADE,

    -- Cómo se llama la plantilla en la lista ("Alta de cliente nuevo").
    nombre           varchar(120) NOT NULL,
    -- Para qué sirve / cuándo usarla. Ayuda cuando hay varias parecidas.
    descripcion      text,

    -- ---- Lo que se copia a la tarea al usarla ----
    -- Si `titulo` va vacío se usa el nombre de la plantilla: en la mayoría de
    -- los casos son el mismo texto y obligar a escribirlo dos veces molesta.
    titulo           varchar(200),
    detalle          text,
    prioridad        varchar(20)  NOT NULL DEFAULT 'media',
    -- Días desde que se usa hasta la entrega. NULL = sin fecha.
    dias_plazo       integer,
    -- Sugerencias, no obligaciones: se pueden cambiar al momento de usarla.
    proyecto_id      uuid REFERENCES proyecto(id) ON DELETE SET NULL,
    responsable_id   uuid REFERENCES usuario(id)  ON DELETE SET NULL,
    visibilidad      varchar(20)  NOT NULL DEFAULT 'proyecto',

    veces_usada      integer NOT NULL DEFAULT 0,
    usada_at         timestamptz,

    creado_por       uuid REFERENCES usuario(id) ON DELETE SET NULL,
    created_at       timestamptz NOT NULL DEFAULT NOW(),
    updated_at       timestamptz NOT NULL DEFAULT NOW(),

    -- Los mismos valores que acepta `tarea`. Si acá entrara uno que la tabla
    -- `tarea` rechaza, la plantilla reventaría recién al usarse.
    CONSTRAINT tarea_plantilla_prioridad_chk
        CHECK (prioridad IN ('baja','media','alta','critica')),
    CONSTRAINT tarea_plantilla_visibilidad_chk
        CHECK (visibilidad IN ('proyecto','privada')),
    -- Un plazo negativo crearía una tarea que nace vencida.
    CONSTRAINT tarea_plantilla_dias_chk
        CHECK (dias_plazo IS NULL OR dias_plazo >= 0)
);

-- Dos plantillas con el mismo nombre en la misma organización no se distinguen
-- en el selector. Se compara sin mayúsculas ni espacios sobrantes, igual que en
-- los proyectos.
CREATE UNIQUE INDEX IF NOT EXISTS uq_plantilla_nombre_por_organizacion
    ON tarea_plantilla (organizacion_id, LOWER(TRIM(nombre)));

CREATE INDEX IF NOT EXISTS idx_plantilla_org ON tarea_plantilla (organizacion_id);

-- -----------------------------------------------------------------------------
-- 2 · Las subtareas de la plantilla
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tarea_plantilla_item (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plantilla_id uuid NOT NULL REFERENCES tarea_plantilla(id) ON DELETE CASCADE,
    titulo       varchar(200) NOT NULL,
    detalle      text,
    -- Plazo propio del paso. Si va NULL hereda el de la tarea principal.
    dias_plazo   integer,
    orden        integer NOT NULL DEFAULT 0,

    CONSTRAINT tarea_plantilla_item_dias_chk
        CHECK (dias_plazo IS NULL OR dias_plazo >= 0)
);

CREATE INDEX IF NOT EXISTS idx_plantilla_item_plantilla
    ON tarea_plantilla_item (plantilla_id, orden);

-- -----------------------------------------------------------------------------
-- 3 · updated_at automático
-- -----------------------------------------------------------------------------
-- Reusa la función que ya dejó la migración de la fase 1. Si no existiera, se
-- crea acá; así esta migración se puede aplicar sola en una base limpia.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_plantilla_updated_at ON tarea_plantilla;
CREATE TRIGGER trg_plantilla_updated_at
    BEFORE UPDATE ON tarea_plantilla
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;

-- ===================================================================================
-- COMPROBACIÓN
-- ===================================================================================
-- SELECT p.nombre, p.dias_plazo, p.veces_usada,
--        (SELECT COUNT(*) FROM tarea_plantilla_item i WHERE i.plantilla_id = p.id) AS pasos
--   FROM tarea_plantilla p ORDER BY p.nombre;
-- ===================================================================================
