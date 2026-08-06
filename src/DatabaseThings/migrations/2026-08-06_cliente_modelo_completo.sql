-- ===================================================================================
-- 2026-08-06 · El cliente, completo: varios representantes, varios planes y responsable
-- ===================================================================================
-- POR QUÉ
-- Del ticket «CREAR CLIENTE: TODO DE UNA VEZ» y sus dos hermanos en el proyecto
-- SOFTWARE SIMPLE PYME. El formulario de alta pide muy poco y obliga a volver a
-- entrar a la ficha para completar; y el modelo tampoco da para más:
--
--   · UN solo representante legal, en dos columnas sueltas de `empresa`
--     (nombre_rep, rut_rep_encrypted). Hay sociedades con dos o tres.
--   · UN solo plan (`empresa.plan_id`). El negocio vende dos a la vez.
--   · NINGÚN responsable del servicio: no se registra quién de la oficina
--     atiende a cada cliente.
--
-- QUÉ NO CAMBIA (a propósito)
-- `empresa.plan_id`, `nombre_rep` y `rut_rep_encrypted` SE QUEDAN. Los usan el
-- cobro mensual, la facturación y media docena de pantallas. Esta migración es
-- ADITIVA: llena estructuras nuevas y deja las viejas en su lugar, sincronizadas
-- con el registro principal. Nada deja de funcionar el día que se aplica.
--
-- POR QUÉ NO SE TOCA EL COBRO
-- El monto sale de `COALESCE(empresa.precio_mensual, plan.precio_base, 0)`, y las
-- 93 empresas en cartera tienen `precio_mensual` propio. O sea: el precio ya está
-- fijado a mano en todas y el plan NO decide lo que se cobra. Sumar un segundo
-- plan no mueve ni un peso de la facturación actual — el precio sigue siendo una
-- decisión explícita, que es como debe ser.
-- ===================================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1 · Representantes legales · varios por empresa
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS empresa_representante (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id    uuid NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,

    nombre        varchar(200) NOT NULL,
    -- El RUT va cifrado, igual que en `empresa`. El hash permite buscar por RUT
    -- sin descifrar toda la tabla.
    rut_encrypted text,
    rut_hash      varchar(128),

    email         varchar(200),
    telefono      varchar(50),

    -- El principal es el que se muestra donde hoy va `empresa.nombre_rep`, y el
    -- que usa el robot del SII para entrar al portal. Solo puede haber uno.
    principal     boolean NOT NULL DEFAULT false,
    -- Para ordenarlos en pantalla cuando hay varios no principales.
    orden         integer NOT NULL DEFAULT 0,

    created_at    timestamptz NOT NULL DEFAULT NOW(),
    updated_at    timestamptz NOT NULL DEFAULT NOW()
);

-- Un solo principal por empresa. Índice parcial: los NO principales no compiten.
CREATE UNIQUE INDEX IF NOT EXISTS uq_representante_principal_por_empresa
    ON empresa_representante (empresa_id) WHERE principal;

CREATE INDEX IF NOT EXISTS idx_representante_empresa ON empresa_representante (empresa_id);
CREATE INDEX IF NOT EXISTS idx_representante_rut_hash ON empresa_representante (rut_hash);

-- -----------------------------------------------------------------------------
-- 2 · Planes · varios por empresa
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS empresa_plan (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id     uuid NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    plan_id        uuid NOT NULL REFERENCES plan(id)    ON DELETE RESTRICT,

    -- Lo que se le cobra a ESTE cliente por ESTE plan. NULL = el precio de lista
    -- del plan. Se guarda porque el precio negociado casi nunca es el de lista.
    precio_pactado numeric(12,2),

    -- El principal es el que se refleja en `empresa.plan_id`, para que todo lo
    -- que ya lee esa columna —cobro mensual, facturación, filtros— siga igual.
    principal      boolean NOT NULL DEFAULT false,

    fecha_inicio   date NOT NULL DEFAULT CURRENT_DATE,
    fecha_termino  date,

    created_at     timestamptz NOT NULL DEFAULT NOW(),
    updated_at     timestamptz NOT NULL DEFAULT NOW(),

    -- Un precio negativo no existe; cero sí (plan FREE).
    CONSTRAINT empresa_plan_precio_chk CHECK (precio_pactado IS NULL OR precio_pactado >= 0),
    -- Terminar antes de empezar es un error de tipeo, no un dato.
    CONSTRAINT empresa_plan_fechas_chk  CHECK (fecha_termino IS NULL OR fecha_termino >= fecha_inicio)
);

-- El mismo plan dos veces vigente en la misma empresa no significa nada.
CREATE UNIQUE INDEX IF NOT EXISTS uq_empresa_plan_vigente
    ON empresa_plan (empresa_id, plan_id) WHERE fecha_termino IS NULL;

-- Un solo plan principal por empresa.
CREATE UNIQUE INDEX IF NOT EXISTS uq_empresa_plan_principal
    ON empresa_plan (empresa_id) WHERE principal AND fecha_termino IS NULL;

CREATE INDEX IF NOT EXISTS idx_empresa_plan_empresa ON empresa_plan (empresa_id);

-- -----------------------------------------------------------------------------
-- 3 · Responsable del servicio · quién de la oficina atiende al cliente
-- -----------------------------------------------------------------------------
-- Distinto del representante legal: el representante es del CLIENTE, el
-- responsable es de la OFICINA. Se confunden porque los dos son "el contacto".
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS responsable_id uuid REFERENCES usuario(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_empresa_responsable ON empresa (responsable_id);

COMMENT ON COLUMN empresa.responsable_id IS
    'Quién de la oficina atiende a este cliente. NO es el representante legal.';

-- -----------------------------------------------------------------------------
-- 4 · Traspaso de lo que ya existe
-- -----------------------------------------------------------------------------
-- Sin esto, al aplicar la migración las pantallas nuevas mostrarían todos los
-- clientes sin representante y sin plan, cuando la información sí está.

-- 4.1 · Cada representante que hoy vive en `empresa` pasa a ser el principal.
INSERT INTO empresa_representante (empresa_id, nombre, rut_encrypted, rut_hash, principal)
SELECT e.id, TRIM(e.nombre_rep), e.rut_rep_encrypted, e.rut_rep_hash, true
  FROM empresa e
 WHERE e.nombre_rep IS NOT NULL AND TRIM(e.nombre_rep) <> ''
   AND NOT EXISTS (SELECT 1 FROM empresa_representante r WHERE r.empresa_id = e.id);

-- 4.2 · Cada plan asignado pasa a ser el plan principal.
-- `precio_pactado` toma el precio que la empresa ya tiene negociado; si no hay,
-- queda NULL y manda el precio de lista del plan.
INSERT INTO empresa_plan (empresa_id, plan_id, precio_pactado, principal)
SELECT e.id, e.plan_id,
       COALESCE(NULLIF(e.precio_mensual, 0), NULLIF(e.honorario_neto, 0)),
       true
  FROM empresa e
 WHERE e.plan_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM empresa_plan ep WHERE ep.empresa_id = e.id);

-- -----------------------------------------------------------------------------
-- 5 · updated_at automático
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_representante_updated_at ON empresa_representante;
CREATE TRIGGER trg_representante_updated_at
    BEFORE UPDATE ON empresa_representante
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_empresa_plan_updated_at ON empresa_plan;
CREATE TRIGGER trg_empresa_plan_updated_at
    BEFORE UPDATE ON empresa_plan
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;

-- ===================================================================================
-- COMPROBACIÓN
-- ===================================================================================
-- SELECT (SELECT COUNT(*) FROM empresa_representante)                     AS representantes,
--        (SELECT COUNT(*) FROM empresa WHERE NULLIF(TRIM(nombre_rep),'') IS NOT NULL) AS esperados,
--        (SELECT COUNT(*) FROM empresa_plan)                              AS planes,
--        (SELECT COUNT(*) FROM empresa WHERE plan_id IS NOT NULL)         AS esperados_plan;
--
-- Ninguna empresa puede quedar con dos principales (los índices lo impiden):
-- SELECT empresa_id, COUNT(*) FROM empresa_plan WHERE principal GROUP BY 1 HAVING COUNT(*) > 1;
-- ===================================================================================
