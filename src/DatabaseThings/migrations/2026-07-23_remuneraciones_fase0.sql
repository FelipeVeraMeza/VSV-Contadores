-- ============================================================================
-- MÓDULO DE REMUNERACIONES — FASE 0 (datos base + catálogos)
--
-- Crea las tablas fundacionales del nuevo módulo de nómina y siembra los
-- catálogos nacionales (AFP, instituciones de salud) y el catálogo de
-- conceptos (haberes/descuentos) del manual del cliente.
--
-- Diseño (según docs/remuneraciones-requerimientos.md):
--   • rem_trabajador          — ficha del trabajador (tabla nueva, RUT cifrado)
--   • rem_trabajador_historial— auditoría append-only de cambios de ficha
--   • rem_afp                 — catálogo nacional de AFP + comisión
--   • rem_salud               — catálogo Fonasa + isapres
--   • rem_concepto            — catálogo de haberes/descuentos (LRE)
--   • rem_parametro_previsional — indicadores por período (UF, UTM, mínimo, topes)
--   • rem_config_empresa      — parámetros de nómina por empresa
--
-- Multi-tenant: todo dato de negocio lleva organizacion_id/empresa_id y filtra
-- por ellos (mismo aislamiento que el resto del sistema). Los catálogos AFP y
-- salud son nacionales (compartidos); rem_concepto admite conceptos globales
-- (organizacion_id NULL) y personalizados por organización.
--
-- IMPORTANTE — tratamiento tributario: los flags imponible/tributable/
-- afecta_gratificacion sembrados aquí son un DEFAULT estándar chileno para
-- arrancar. DEBEN validarse con el contador antes de habilitar el cálculo real
-- (Fase 2). Son editables desde la aplicación (RF-R25/R28).
--
-- Los indicadores de rem_parametro_previsional son PLACEHOLDER (tomados de la
-- config mock actual); actualizarlos con los valores oficiales del período.
--
-- Servidor: PostgreSQL 17.6. Idempotente (IF NOT EXISTS / ON CONFLICT).
-- ============================================================================

BEGIN;

-- ── 1. Catálogo nacional de AFP ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rem_afp (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre        VARCHAR(60) NOT NULL UNIQUE,
    -- % de comisión de administración que descuenta la AFP al trabajador.
    -- El 10% obligatorio de pensión es fijo y NO se guarda aquí.
    tasa_comision NUMERIC(5,2) NOT NULL DEFAULT 0,
    activo        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON COLUMN rem_afp.tasa_comision IS 'Comisión de administración (%). Descuento AFP total = 10% + tasa_comision.';

-- ── 2. Catálogo de instituciones de salud (Fonasa + isapres) ────────────────
CREATE TABLE IF NOT EXISTS rem_salud (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre     VARCHAR(80) NOT NULL UNIQUE,
    tipo       VARCHAR(10) NOT NULL CHECK (tipo IN ('FONASA', 'ISAPRE')),
    activo     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ── 3. Catálogo de conceptos (haberes y descuentos) ─────────────────────────
-- organizacion_id NULL  → concepto estándar nacional (compartido).
-- organizacion_id != NULL → concepto personalizado de esa organización.
CREATE TABLE IF NOT EXISTS rem_concepto (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id      UUID REFERENCES organizacion(id) ON DELETE CASCADE,
    codigo               VARCHAR(10) NOT NULL,
    descripcion          VARCHAR(120) NOT NULL,
    naturaleza           VARCHAR(10) NOT NULL CHECK (naturaleza IN ('HABER', 'DESCUENTO')),
    imponible            BOOLEAN NOT NULL DEFAULT FALSE,
    tributable           BOOLEAN NOT NULL DEFAULT FALSE,
    afecta_gratificacion BOOLEAN NOT NULL DEFAULT FALSE,
    cuenta_codigo        VARCHAR(50),          -- mapeo contable por defecto
    obsoleto             BOOLEAN NOT NULL DEFAULT FALSE,  -- códigos duplicados (105, 799)
    activo               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rem_concepto_org_codigo
    ON rem_concepto (organizacion_id, codigo) NULLS NOT DISTINCT;

-- ── 4. Indicadores previsionales por período ────────────────────────────────
CREATE TABLE IF NOT EXISTS rem_parametro_previsional (
    id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    periodo                       DATE NOT NULL UNIQUE,   -- primer día del mes
    uf                            NUMERIC(12,2),
    utm                           NUMERIC(12,2),
    uta                           NUMERIC(12,2),
    sueldo_minimo                 NUMERIC(12,2),
    tope_imponible_afp_uf         NUMERIC(6,2),
    tope_imponible_cesantia_uf    NUMERIC(6,2),
    tasa_sis                      NUMERIC(5,2),   -- Seguro Invalidez y Sobrevivencia (empleador)
    tasa_cesantia_trabajador      NUMERIC(5,2),
    tasa_cesantia_empleador_indef NUMERIC(5,2),
    tasa_cesantia_empleador_plazo NUMERIC(5,2),
    created_at                    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ── 5. Ficha del trabajador ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rem_trabajador (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id  UUID NOT NULL REFERENCES organizacion(id) ON DELETE CASCADE,
    empresa_id       UUID NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    persona_id       UUID REFERENCES persona(id) ON DELETE SET NULL,  -- vínculo opcional al CRM

    -- Datos personales
    nombres          VARCHAR(150) NOT NULL,
    apellido_paterno VARCHAR(100),
    apellido_materno VARCHAR(100),
    rut_encrypted    TEXT NOT NULL,
    rut_hash         VARCHAR(64) NOT NULL,
    fecha_nacimiento DATE,
    estado_civil     VARCHAR(20) CHECK (estado_civil IN
                        ('soltero','casado','divorciado','viudo','conviviente','separado')),
    direccion        VARCHAR(255),
    comuna           VARCHAR(100),
    telefono         VARCHAR(30),
    email            VARCHAR(255),
    discapacidad     BOOLEAN NOT NULL DEFAULT FALSE,

    -- Contrato y relación laboral
    salud_id         UUID REFERENCES rem_salud(id) ON DELETE SET NULL,
    plan_isapre_monto  NUMERIC(12,2),
    plan_isapre_moneda VARCHAR(3) DEFAULT 'UF' CHECK (plan_isapre_moneda IN ('UF','CLP')),
    afp_id           UUID REFERENCES rem_afp(id) ON DELETE SET NULL,
    fecha_ingreso    DATE,
    fecha_termino    DATE,
    tipo_contrato    VARCHAR(20) CHECK (tipo_contrato IN ('plazo_fijo','indefinido','por_obra')),
    estado_contrato  VARCHAR(10) NOT NULL DEFAULT 'activo'
                        CHECK (estado_contrato IN ('activo','inactivo')),
    departamento     VARCHAR(120),
    cargo            VARCHAR(120),

    -- Configuración de remuneración y beneficios
    ajuste_ley_20281              BOOLEAN NOT NULL DEFAULT FALSE,
    semana_corrida                BOOLEAN NOT NULL DEFAULT FALSE,
    cargo_excepcional_ley_21561   BOOLEAN NOT NULL DEFAULT FALSE,
    dias_vacaciones_tomadas       NUMERIC(6,2) NOT NULL DEFAULT 0,
    fecha_inicio_vac_progresivas       DATE,
    fecha_certificado_vac_progresivas  DATE,
    consume_primeros_dias_progresivas  BOOLEAN NOT NULL DEFAULT FALSE,
    vacaciones_zona_extrema            BOOLEAN NOT NULL DEFAULT FALSE,
    tipo_sueldo_base VARCHAR(20) CHECK (tipo_sueldo_base IN
                        ('mes','mes_comision','empresarial','horas','horas_horas','dias')),
    sueldo_base      NUMERIC(12,2) NOT NULL DEFAULT 0,
    zona_extrema_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
    gratificacion_tipo VARCHAR(10) DEFAULT 'no'
                        CHECK (gratificacion_tipo IN ('no','porcentaje','tope_475')),
    gratificacion_pct  NUMERIC(5,2),

    -- Previsional adicional
    cotizacion_especial       BOOLEAN NOT NULL DEFAULT FALSE,
    asignacion_familiar_tramo VARCHAR(5),  -- 'A'..'D' o 'NO'
    cargas_normales           INTEGER NOT NULL DEFAULT 0,
    cargas_maternales         INTEGER NOT NULL DEFAULT 0,
    cargas_invalidas          INTEGER NOT NULL DEFAULT 0,
    jubilado                  BOOLEAN NOT NULL DEFAULT FALSE,
    afecto_seguro_accidentes  BOOLEAN NOT NULL DEFAULT TRUE,
    seguro_cesantia           BOOLEAN NOT NULL DEFAULT TRUE,
    seguro_cesantia_inicio    DATE,
    apv_individual            BOOLEAN NOT NULL DEFAULT FALSE,
    apv_colectivo             BOOLEAN NOT NULL DEFAULT FALSE,

    -- Datos de pago
    tipo_pago        VARCHAR(20) CHECK (tipo_pago IN ('efectivo','transferencia','cheque','otro')),
    banco            VARCHAR(80),
    tipo_cuenta      VARCHAR(40),
    numero_cuenta    VARCHAR(50),

    -- Auditoría
    creado_por       UUID REFERENCES usuario(id) ON DELETE SET NULL,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Un RUT no se repite dentro de la misma empresa.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rem_trabajador_empresa_rut
    ON rem_trabajador (empresa_id, rut_hash);
CREATE INDEX IF NOT EXISTS idx_rem_trabajador_organizacion ON rem_trabajador (organizacion_id);
CREATE INDEX IF NOT EXISTS idx_rem_trabajador_empresa_estado
    ON rem_trabajador (empresa_id, estado_contrato);

-- ── 6. Historial de cambios de ficha (append-only) ──────────────────────────
CREATE TABLE IF NOT EXISTS rem_trabajador_historial (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trabajador_id  UUID NOT NULL REFERENCES rem_trabajador(id) ON DELETE CASCADE,
    campo          VARCHAR(60) NOT NULL,
    valor_anterior TEXT,
    valor_nuevo    TEXT,
    usuario_id     UUID REFERENCES usuario(id) ON DELETE SET NULL,
    usuario_nombre VARCHAR(100),
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rem_trab_hist_trabajador
    ON rem_trabajador_historial (trabajador_id, created_at DESC);

-- ── 7. Configuración de nómina por empresa ──────────────────────────────────
CREATE TABLE IF NOT EXISTS rem_config_empresa (
    empresa_id            UUID PRIMARY KEY REFERENCES empresa(id) ON DELETE CASCADE,
    organizacion_id       UUID REFERENCES organizacion(id) ON DELETE CASCADE,
    mutual                VARCHAR(80),
    tasa_mutual           NUMERIC(5,2) NOT NULL DEFAULT 0,   -- base + adicional
    moneda                VARCHAR(3) NOT NULL DEFAULT 'CLP',
    gratificacion_default VARCHAR(10) DEFAULT 'tope_475'
                            CHECK (gratificacion_default IN ('no','porcentaje','tope_475')),
    cuenta_liquido_pagar  VARCHAR(50),   -- cuenta contable del líquido por pagar
    mapeo_cuentas         JSONB DEFAULT '{}'::jsonb,  -- concepto_codigo → cuenta_codigo
    created_at            TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- SEEDS
-- ============================================================================

-- 8. AFP (comisión de administración vigente; validar por período)
INSERT INTO rem_afp (nombre, tasa_comision) VALUES
    ('Capital',  1.44),
    ('Cuprum',   1.44),
    ('Habitat',  1.27),
    ('Modelo',   0.58),
    ('PlanVital',1.16),
    ('ProVida',  1.45),
    ('Uno',      0.69)
ON CONFLICT (nombre) DO NOTHING;

-- 9. Instituciones de salud
INSERT INTO rem_salud (nombre, tipo) VALUES
    ('Fonasa',          'FONASA'),
    ('Banmédica',       'ISAPRE'),
    ('Colmena',         'ISAPRE'),
    ('Golden Cross',    'ISAPRE'),
    ('Consalud',        'ISAPRE'),
    ('Cruz Blanca',     'ISAPRE'),
    ('Cruz del Norte',  'ISAPRE'),
    ('Esencial',        'ISAPRE'),
    ('F.A.S.T.',        'ISAPRE'),
    ('Banco Estado',    'ISAPRE'),
    ('iSalud',          'ISAPRE'),
    ('Isapre Codelco',  'ISAPRE'),
    ('Nueva Masvida',   'ISAPRE'),
    ('Vida Tres',       'ISAPRE')
ON CONFLICT (nombre) DO NOTHING;

-- 10. Catálogo de conceptos estándar (organizacion_id = NULL → globales)
-- Columnas: codigo, descripcion, naturaleza, imponible, tributable, afecta_grat, obsoleto
INSERT INTO rem_concepto
    (codigo, descripcion, naturaleza, imponible, tributable, afecta_gratificacion, obsoleto)
VALUES
    -- HABERES
    ('100','Sueldo base',                        'HABER', TRUE,  TRUE,  TRUE,  FALSE),
    ('101','Comisión ventas',                    'HABER', TRUE,  TRUE,  TRUE,  FALSE),
    ('102','Asignación familiar',                'HABER', FALSE, FALSE, FALSE, FALSE),
    ('103','Bono desgaste',                      'HABER', FALSE, FALSE, FALSE, FALSE),
    ('105','Asignación familiar (duplicado)',    'HABER', FALSE, FALSE, FALSE, TRUE),
    ('107','Horas extra 50%',                    'HABER', TRUE,  TRUE,  FALSE, FALSE),
    ('113','Asignación familiar retroactivo',    'HABER', FALSE, FALSE, FALSE, FALSE),
    ('114','Asignación maternal',                'HABER', FALSE, FALSE, FALSE, FALSE),
    ('115','Gratificación legal',                'HABER', TRUE,  TRUE,  FALSE, FALSE),
    ('117','Comisiones',                         'HABER', TRUE,  TRUE,  TRUE,  FALSE),
    ('118','Asignación colación',                'HABER', FALSE, FALSE, FALSE, FALSE),
    ('119','Asignación movilización',            'HABER', FALSE, FALSE, FALSE, FALSE),
    ('300','Pago (Vipcos)',                      'HABER', TRUE,  TRUE,  FALSE, FALSE),
    ('403','Horas extra 75%',                    'HABER', TRUE,  TRUE,  FALSE, FALSE),
    ('404','Horas extra 100%',                   'HABER', TRUE,  TRUE,  FALSE, FALSE),
    ('405','Horas part time',                    'HABER', TRUE,  TRUE,  TRUE,  FALSE),
    ('406','Horas extras part time',             'HABER', TRUE,  TRUE,  FALSE, FALSE),
    ('423','Bono (Vipcos)',                      'HABER', TRUE,  TRUE,  FALSE, FALSE),
    ('777','Horas feriados',                     'HABER', TRUE,  TRUE,  FALSE, FALSE),
    ('778','Horas feriados 50%',                 'HABER', TRUE,  TRUE,  FALSE, FALSE),
    ('799','Gratificación legal (duplicado)',    'HABER', TRUE,  TRUE,  FALSE, TRUE),
    ('850','Bono producción',                    'HABER', TRUE,  TRUE,  FALSE, FALSE),
    ('899','Aguinaldo',                          'HABER', TRUE,  TRUE,  FALSE, FALSE),
    ('914','Beneficio semana corrida',           'HABER', TRUE,  TRUE,  FALSE, FALSE),
    ('920','Ajuste ley sueldo base comisiones',  'HABER', TRUE,  TRUE,  FALSE, FALSE),
    -- DESCUENTOS
    ('200','Previsión (AFP o IPS)',              'DESCUENTO', FALSE, FALSE, FALSE, FALSE),
    ('201','Salud (7%)',                         'DESCUENTO', FALSE, FALSE, FALSE, FALSE),
    ('202','2% adicional salud',                 'DESCUENTO', FALSE, FALSE, FALSE, FALSE),
    ('205','Impuesto único',                     'DESCUENTO', FALSE, FALSE, FALSE, FALSE),
    ('207','Cuenta de descuentos (art. 58)',     'DESCUENTO', FALSE, FALSE, FALSE, FALSE),
    ('420','Cotización APV individual',          'DESCUENTO', FALSE, FALSE, FALSE, FALSE),
    ('421','Aporte empleador AFC',               'DESCUENTO', FALSE, FALSE, FALSE, FALSE),
    ('902','Descuento CCAF/CCAP crédito',        'DESCUENTO', FALSE, FALSE, FALSE, FALSE),
    ('903','Descuento CCAF/CCAP leasing',        'DESCUENTO', FALSE, FALSE, FALSE, FALSE),
    ('904','Descuento CCAF/CCAP seguros',        'DESCUENTO', FALSE, FALSE, FALSE, FALSE),
    ('915','APV individual tributable (rég. B)', 'DESCUENTO', FALSE, FALSE, FALSE, FALSE),
    ('916','APV individual no tributable (rég. A)','DESCUENTO', FALSE, FALSE, FALSE, FALSE),
    ('917','APV colectivo tributable',           'DESCUENTO', FALSE, FALSE, FALSE, FALSE),
    ('918','APV colectivo no tributable',        'DESCUENTO', FALSE, FALSE, FALSE, FALSE),
    ('938','Retención 3% préstamo solidario (Ley 21.252)','DESCUENTO', FALSE, FALSE, FALSE, FALSE)
ON CONFLICT (organizacion_id, codigo) DO NOTHING;

-- 11. Indicadores del período actual (PLACEHOLDER — actualizar con valores oficiales)
INSERT INTO rem_parametro_previsional
    (periodo, uf, utm, uta, sueldo_minimo, tope_imponible_afp_uf,
     tope_imponible_cesantia_uf, tasa_sis, tasa_cesantia_trabajador,
     tasa_cesantia_empleador_indef, tasa_cesantia_empleador_plazo)
VALUES
    ('2026-07-01', 38750, 69200, 830400, 560000, 87.80,
     131.90, 1.88, 0.60, 2.40, 3.00)
ON CONFLICT (periodo) DO NOTHING;

COMMIT;
