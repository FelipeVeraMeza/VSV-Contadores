-- =====================================================================
-- Matriz de precios: Plan × Tramo de facturación mensual
-- Valores NETOS (al valor se le añade IVA). Idempotente.
-- =====================================================================
CREATE TABLE IF NOT EXISTS plan_precio_tramo (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id      uuid NOT NULL REFERENCES plan(id) ON DELETE CASCADE,
    tramo_orden  int  NOT NULL,          -- 0 = precio único; 1..5 = tramos
    tramo_min    numeric NOT NULL DEFAULT 0,
    tramo_max    numeric,                -- NULL = sin tope
    precio_neto  numeric NOT NULL DEFAULT 0,
    rrhh_gratis  int DEFAULT 0,
    activo       boolean DEFAULT true,
    created_at   timestamptz DEFAULT now(),
    UNIQUE (plan_id, tramo_orden)
);

-- Limpia lo previo de estos planes para recargar limpio
DELETE FROM plan_precio_tramo
WHERE plan_id IN (SELECT id FROM plan WHERE nombre IN ('FREE','EMPRENDEDOR','GO','EXECUTIVE','FULL EMPRENDEDOR'));

-- FREE (precio único $0)
INSERT INTO plan_precio_tramo (plan_id, tramo_orden, tramo_min, tramo_max, precio_neto)
SELECT id, 0, 0, 300000000, 0 FROM plan WHERE nombre = 'FREE';

-- EMPRENDEDOR (fijo $10.000 neto = $11.900 IVA incl.)
INSERT INTO plan_precio_tramo (plan_id, tramo_orden, tramo_min, tramo_max, precio_neto)
SELECT id, 0, 0, 300000000, 10000 FROM plan WHERE nombre = 'EMPRENDEDOR';

-- GO por tramo
INSERT INTO plan_precio_tramo (plan_id, tramo_orden, tramo_min, tramo_max, precio_neto)
SELECT id, t.orden, t.tmin, t.tmax, t.precio FROM plan, (VALUES
    (1, 0,          3000000,   30000),
    (2, 3000000,    10000000,  40000),
    (3, 10000000,   50000000,  50000),
    (4, 50000000,   100000000, 70000),
    (5, 100000000,  300000000, 70000)
) AS t(orden, tmin, tmax, precio)
WHERE plan.nombre = 'GO';

-- EXECUTIVE por tramo
INSERT INTO plan_precio_tramo (plan_id, tramo_orden, tramo_min, tramo_max, precio_neto)
SELECT id, t.orden, t.tmin, t.tmax, t.precio FROM plan, (VALUES
    (1, 0,          3000000,   50000),
    (2, 3000000,    10000000,  70000),
    (3, 10000000,   50000000,  100000),
    (4, 50000000,   100000000, 200000),
    (5, 100000000,  300000000, 350000)
) AS t(orden, tmin, tmax, precio)
WHERE plan.nombre = 'EXECUTIVE';

-- FULL EMPRENDEDOR por tramo (+ RRHH gratis)
INSERT INTO plan_precio_tramo (plan_id, tramo_orden, tramo_min, tramo_max, precio_neto, rrhh_gratis)
SELECT id, t.orden, t.tmin, t.tmax, t.precio, t.rrhh FROM plan, (VALUES
    (1, 0,          3000000,   60500,  2),
    (2, 3000000,    10000000,  85000,  3),
    (3, 10000000,   50000000,  120000, 4),
    (4, 50000000,   100000000, 240000, 5),
    (5, 100000000,  300000000, 350000, 7)
) AS t(orden, tmin, tmax, precio, rrhh)
WHERE plan.nombre = 'FULL EMPRENDEDOR';

-- Sincroniza precio_base del plan con el tramo más bajo (referencia rápida)
UPDATE plan p SET precio_base = sub.precio
FROM (SELECT plan_id, precio_neto AS precio FROM plan_precio_tramo WHERE tramo_orden IN (0,1)) sub
WHERE p.id = sub.plan_id;
