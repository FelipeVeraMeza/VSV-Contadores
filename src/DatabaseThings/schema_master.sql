-- ===================================================================================
-- ESQUEMA MAESTRO DEFINITIVO VSV CONTADORES (PostgreSQL / Supabase PRO)
-- ===================================================================================

/* 1. EXTENSIONES */
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

/* 2. TIPOS ENUM */
CREATE TYPE rol_usuario AS ENUM ('Administrador', 'Consultor', 'Cliente');
CREATE TYPE estado_servicio AS ENUM ('Activo', 'Pendiente', 'Suspendido');
CREATE TYPE categoria_servicio AS ENUM ('Tributaria', 'Contabilidad', 'RRHH', 'Soporte', 'Legal');
CREATE TYPE frecuencia_servicio AS ENUM ('Mensual', 'Trimestral', 'Semestral', 'Anual', 'Única vez');

CREATE TYPE tipo_tramite_dt AS ENUM (
    'LRE', 'F30', 'F30-1', 'Contrato de Trabajo', 'Anexo de Contrato', 
    'Carta de Aviso', 'Finiquito', 'Comprobante Vacaciones', 'Pacto Horas Extra', 
    'Pacto Teletrabajo', 'Reglamento Interno', 'Comité Paritario', 
    'Inclusión Laboral', 'Registro Asistencia'
);

CREATE TYPE estado_tramite_dt AS ENUM (
    'Pendiente', 'En Firma', 'Firmado', 'Cargado', 'Rechazado', 'Atrasado', 'No Aplica'
);

-- ==========================================
-- 3. TABLAS DEL SISTEMA
-- ==========================================

CREATE TABLE usuario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(255) NOT NULL,
    rut_encrypted TEXT NOT NULL,
    rut_hash VARCHAR(64) NOT NULL UNIQUE,
    email_encrypted TEXT NOT NULL,
    email_hash VARCHAR(64) NOT NULL UNIQUE,
    clave VARCHAR(255) NOT NULL,
    rol rol_usuario NOT NULL DEFAULT 'Cliente',
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.usuario ENABLE ROW LEVEL SECURITY;

CREATE TABLE sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID REFERENCES usuario(id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE plan (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre varchar(50) NOT NULL UNIQUE,
    precio_base numeric DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE empresa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID REFERENCES plan(id) ON DELETE SET NULL,
    tipo_cliente VARCHAR(20) DEFAULT 'Empresa' CHECK (tipo_cliente IN ('Empresa', 'Persona')),
    razon_social VARCHAR(255) NOT NULL,
    rut_encrypted TEXT NOT NULL,
    rut_hash VARCHAR(64) NOT NULL UNIQUE,
    giro TEXT NOT NULL,
    regimen_tributario VARCHAR(100) NOT NULL,
    telefono_corporativo VARCHAR(50) NULL, 
    email_corporativo VARCHAR(255) NULL,
    logo_url VARCHAR(255) NULL,
    drive_url VARCHAR(255),
    nombre_rep VARCHAR(255),
    rut_rep_encrypted TEXT,
    rut_rep_hash VARCHAR(64) UNIQUE,
    estado_pago VARCHAR(30) DEFAULT 'AL DIA' CHECK (estado_pago IN ('AL DIA', 'NO PAGADO', 'SERVICIO SUSPENDIDO')),
    estado_f29 VARCHAR(30) DEFAULT 'DECLARADO' CHECK (estado_f29 IN ('DECLARADO', 'PENDIENTE', 'NO DECLARAR')),
    impuesto_pagar NUMERIC(15,2) DEFAULT 0,
    dts_mensuales INTEGER DEFAULT 0,
    score INTEGER DEFAULT 100 CHECK (score >= 0 AND score <= 100),
    activo BOOLEAN DEFAULT TRUE,
    
    -- Campos del Excel
    compras_mensuales NUMERIC(15,2) DEFAULT 0,
    ventas_mensuales NUMERIC(15,2) DEFAULT 0,
    facturacion_total NUMERIC(15,2) DEFAULT 0,
    monto_bruto NUMERIC(15,2) DEFAULT 0,
    nro_factura VARCHAR(50),
    contrato_renta BOOLEAN DEFAULT FALSE,
    estado_formulario_renta VARCHAR(100),
    monto_renta NUMERIC(15,2) DEFAULT 0,
    renta_marzo_neto NUMERIC(15,2) DEFAULT 0,
    renta_marzo_bruto NUMERIC(15,2) DEFAULT 0,
    fecha_pago DATE,
    impuesto_unico NUMERIC(15,2) DEFAULT 0,
    nota_urgente TEXT,
    whatsapp VARCHAR(50),
    fecha_cambio_plan TIMESTAMP WITH TIME ZONE,

    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.empresa ENABLE ROW LEVEL SECURITY;

CREATE TABLE empresa_credenciales (
    empresa_id UUID PRIMARY KEY REFERENCES empresa(id) ON DELETE CASCADE,
    sii_rut_encrypted TEXT NOT NULL,
    sii_email_encrypted TEXT NOT NULL,
    sii_password_encrypted TEXT NOT NULL,
    web_password_encrypted text NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sucursal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID REFERENCES empresa(id) ON DELETE CASCADE,
    direccion VARCHAR(255) NOT NULL,
    comuna VARCHAR(100) NOT NULL,
    ciudad VARCHAR(100) NOT NULL,
    telefono_sucursal VARCHAR(50),
    es_casa_matriz BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE bitacora_gestion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    usuario_id UUID REFERENCES usuario(id) ON DELETE SET NULL,
    texto TEXT NOT NULL,
    -- tipo_mensaje: 'conversacion' | 'ticket' | 'cambio_plan' | 'servicio' | 'sistema'
    tipo_mensaje VARCHAR(30) DEFAULT 'conversacion',
    usuario_nombre VARCHAR(100),
    leido BOOLEAN DEFAULT FALSE,   -- en tickets se interpreta como "resuelto"
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.bitacora_gestion ENABLE ROW LEVEL SECURITY;

CREATE TABLE audita (
    usuario_id UUID REFERENCES usuario(id) ON DELETE CASCADE,
    empresa_id UUID REFERENCES empresa(id) ON DELETE CASCADE,
    fecha_asignacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (usuario_id, empresa_id)
);

CREATE TABLE servicio (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre varchar(255) NOT NULL,
    slug varchar(100) UNIQUE NOT NULL,
    es_critico boolean DEFAULT false,
    categoria categoria_servicio NOT NULL,
    descripcion text, 
    activo boolean DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE plan_servicio_config (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id uuid REFERENCES plan(id) ON DELETE CASCADE,
    servicio_id uuid REFERENCES servicio(id) ON DELETE CASCADE,
    disponible boolean DEFAULT true,
    detalle_frecuencia frecuencia_servicio NOT NULL DEFAULT 'Mensual',
    UNIQUE(plan_id, servicio_id)
);

CREATE TABLE empresa_servicio (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid REFERENCES empresa(id) ON DELETE CASCADE, 
    servicio_id uuid REFERENCES servicio(id) ON DELETE RESTRICT, 
    estado estado_servicio DEFAULT 'Pendiente',
    precio_pactado NUMERIC,
    fecha_inicio TIMESTAMP WITH TIME ZONE, 
    fecha_termino TIMESTAMP WITH TIME ZONE, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE empresa_servicio_historial (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_servicio_id uuid REFERENCES empresa_servicio(id) ON DELETE CASCADE,
    usuario_id uuid REFERENCES usuario(id) ON DELETE SET NULL,
    estado_anterior estado_servicio,
    estado_nuevo estado_servicio,
    motivo text,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Historial de cambios de plan de cada empresa (ficha del cliente).
CREATE TABLE empresa_plan_historial (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    plan_anterior_id uuid REFERENCES plan(id) ON DELETE SET NULL,
    plan_nuevo_id uuid REFERENCES plan(id) ON DELETE SET NULL,
    plan_anterior_nombre varchar(50),
    plan_nuevo_nombre varchar(50),
    usuario_id uuid REFERENCES usuario(id) ON DELETE SET NULL,
    usuario_nombre varchar(100),
    motivo text,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_plan_historial_empresa ON empresa_plan_historial (empresa_id, created_at DESC);

-- ==========================================
-- 4. TABLAS DEL MÓDULO DT
-- ==========================================

CREATE TABLE declaracion_dt (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    tipo tipo_tramite_dt NOT NULL,
    estado estado_tramite_dt DEFAULT 'Pendiente',
    periodo DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    fecha_carga TIMESTAMP WITH TIME ZONE,     
    folio_comprobante VARCHAR(100),
    url_comprobante TEXT,
    observaciones TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.declaracion_dt ENABLE ROW LEVEL SECURITY;

CREATE TABLE requisitos_dt_empresa (
    empresa_id UUID REFERENCES empresa(id) ON DELETE CASCADE,
    tipo tipo_tramite_dt NOT NULL,
    PRIMARY KEY (empresa_id, tipo)
);

-- ==========================================
-- 5. FUNCIONES Y TRIGGERS
-- ==========================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE FUNCTION fn_gestionar_ciclo_vida_servicio()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.estado = 'Activo' AND (OLD.estado IS NULL OR OLD.estado != 'Activo')) THEN
        IF (NEW.fecha_inicio IS NULL) THEN NEW.fecha_inicio = CURRENT_TIMESTAMP; END IF;
    END IF;
    IF (NEW.estado = 'Suspendido' AND (OLD.estado IS NULL OR OLD.estado != 'Suspendido')) THEN
        NEW.fecha_termino = CURRENT_TIMESTAMP;
    ELSE
        IF (NEW.estado = 'Activo') THEN NEW.fecha_termino = NULL; END IF;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE FUNCTION public.calcular_score_empresa() 
RETURNS TRIGGER AS $$
DECLARE nuevo_score INT := 100;
BEGIN
    IF NEW.estado_pago = 'SERVICIO SUSPENDIDO' THEN nuevo_score := nuevo_score - 70;
    ELSIF NEW.estado_pago = 'NO PAGADO' THEN nuevo_score := nuevo_score - 40; END IF;
    IF NEW.estado_f29 = 'PENDIENTE' THEN nuevo_score := nuevo_score - 20; END IF;
    IF nuevo_score < 0 THEN nuevo_score := 0; END IF;
    IF nuevo_score > 100 THEN nuevo_score := 100; END IF;
    NEW.score := nuevo_score;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION fn_prevenir_duplicados_dt()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tipo IN ('LRE', 'F30', 'F30-1') THEN
        IF EXISTS (SELECT 1 FROM declaracion_dt WHERE empresa_id = NEW.empresa_id AND tipo = NEW.tipo AND periodo = NEW.periodo AND id != NEW.id) THEN
            RAISE EXCEPTION 'Ya existe un trámite de tipo % para este periodo en esta empresa.', NEW.tipo;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- TRIGGERS
DROP TRIGGER IF EXISTS trigger_actualizar_score ON public.empresa;
CREATE TRIGGER trigger_actualizar_score BEFORE INSERT OR UPDATE OF estado_pago, estado_f29 ON public.empresa FOR EACH ROW EXECUTE FUNCTION public.calcular_score_empresa();

CREATE TRIGGER tr_update_usuario BEFORE UPDATE ON usuario FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER tr_update_empresa BEFORE UPDATE ON empresa FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER tr_update_creds BEFORE UPDATE ON empresa_credenciales FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER tr_update_sucursal BEFORE UPDATE ON sucursal FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER tr_update_empresa_servicio BEFORE UPDATE ON empresa_servicio FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER tr_update_declaracion_dt BEFORE UPDATE ON declaracion_dt FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER tr_ciclo_vida_servicio BEFORE UPDATE ON empresa_servicio FOR EACH ROW EXECUTE PROCEDURE fn_gestionar_ciclo_vida_servicio();
CREATE TRIGGER tr_prevenir_duplicados_dt BEFORE INSERT OR UPDATE ON declaracion_dt FOR EACH ROW EXECUTE PROCEDURE fn_prevenir_duplicados_dt();

-- ==========================================
-- 6. ÍNDICES
-- ==========================================

CREATE INDEX idx_usuario_rut_hash ON usuario (rut_hash);
CREATE INDEX idx_empresa_rut_hash ON empresa (rut_hash);
CREATE INDEX idx_usuario_email_hash ON usuario (email_hash);
CREATE INDEX idx_empresa_razon_social ON empresa (razon_social ASC);
CREATE INDEX idx_empresa_servicio_empresa_id ON empresa_servicio (empresa_id);
CREATE INDEX idx_empresa_plan_id ON empresa (plan_id);
CREATE INDEX idx_plan_servicio_config_plan_id ON plan_servicio_config (plan_id);
CREATE INDEX idx_dt_empresa_periodo ON declaracion_dt (empresa_id, periodo DESC);
CREATE INDEX idx_dt_estado ON declaracion_dt (estado);

-- ==========================================
-- 7. INSERCIONES BASE (MOCKS)
-- ==========================================

INSERT INTO plan (nombre, precio_base) VALUES 
('GO', 30000), ('EXECUTIVE', 50000), ('ADVANCE', 100000), 
('FULL EMPRENDEDOR', 72000), ('EMPRENDEDOR', 0), ('TERMINO DE GIRO', 0), 
('FREE', 0), ('OFV', 0), ('DE BAJA', 0) ON CONFLICT DO NOTHING;

INSERT INTO servicio (nombre, slug, categoria, es_critico, descripcion) VALUES
('Declaración de Impuestos Mensual IVA', 'iva-mensual', 'Tributaria', true, 'Declaración de formulario F29 ante el SII.'),
('Conciliación bancaria', 'conciliacion-bancaria', 'Contabilidad', false, 'Cruce de cartolas bancarias con registros contables.'),
('Clasificación de Cuentas', 'clasificacion-cuentas', 'Contabilidad', false, 'Ordenamiento contable de movimientos.'),
('Registro de Gastos con Factura', 'gastos-factura', 'Contabilidad', false, 'Ingreso de facturas de compra al sistema.'),
('Registro de Ventas con Factura', 'ventas-factura', 'Contabilidad', false, 'Ingreso de facturas de venta al sistema.'),
('Registro de Gastos con boleta', 'gastos-boleta', 'Contabilidad', false, 'Ingreso de boletas de honorarios o servicios.'),
('Registro de Ventas con boleta', 'ventas-boleta', 'Contabilidad', false, 'Ingreso de boletas de venta.'),
('Pre Balance', 'pre-balance', 'Contabilidad', false, 'Estado financiero preliminar.'),
('Balance Anual', 'balance-anual', 'Contabilidad', true, 'Cierre contable anual y estado de situación.'),
('Soporte Correo Electrónico', 'soporte-email', 'Soporte', false, 'Atención de dudas vía email (48h).'),
('Trabajadores Recursos Humanos', 'cupos-rrhh', 'RRHH', false, 'Gestión de ficha de trabajadores.'),
('Contratos de Trabajo', 'contratos-trabajo', 'RRHH', true, 'Redacción y carga de contratos legales.'),
('Liquidaciones de Sueldo', 'liquidaciones-sueldo', 'RRHH', true, 'Cálculo mensual de remuneraciones.'),
('Nómina PREVIRED', 'nomina-previred', 'RRHH', true, 'Declaración y pago de cotizaciones previsionales.'),
('Formulario F-30', 'formulario-f30', 'RRHH', false, 'Certificado de cumplimiento de obligaciones laborales.'),
('Finiquitos', 'finiquitos', 'RRHH', true, 'Cálculo y redacción de término de relación laboral.'),
('Tramitación de Licencias Médicas', 'tramitacion-licencias', 'RRHH', false, 'Gestión de licencias ante FONASA/ISAPRE.') ON CONFLICT DO NOTHING;

DO $$ 
DECLARE 
    plan_go UUID := (SELECT id FROM plan WHERE nombre = 'GO');
    plan_exe UUID := (SELECT id FROM plan WHERE nombre = 'EXECUTIVE');
    plan_adv UUID := (SELECT id FROM plan WHERE nombre = 'ADVANCE');
BEGIN
    INSERT INTO plan_servicio_config (plan_id, servicio_id, detalle_frecuencia) VALUES
    (plan_go, (SELECT id FROM servicio WHERE slug = 'iva-mensual'), 'Mensual'),
    (plan_go, (SELECT id FROM servicio WHERE slug = 'gastos-factura'), 'Mensual'),
    (plan_go, (SELECT id FROM servicio WHERE slug = 'ventas-factura'), 'Mensual'),
    (plan_go, (SELECT id FROM servicio WHERE slug = 'balance-anual'), 'Anual'),
    (plan_go, (SELECT id FROM servicio WHERE slug = 'soporte-email'), 'Mensual') ON CONFLICT DO NOTHING;

    INSERT INTO plan_servicio_config (plan_id, servicio_id, detalle_frecuencia) VALUES
    (plan_exe, (SELECT id FROM servicio WHERE slug = 'iva-mensual'), 'Mensual'),
    (plan_exe, (SELECT id FROM servicio WHERE slug = 'conciliacion-bancaria'), 'Trimestral'),
    (plan_exe, (SELECT id FROM servicio WHERE slug = 'clasificacion-cuentas'), 'Mensual'),
    (plan_exe, (SELECT id FROM servicio WHERE slug = 'gastos-factura'), 'Mensual'),
    (plan_exe, (SELECT id FROM servicio WHERE slug = 'ventas-factura'), 'Mensual'),
    (plan_exe, (SELECT id FROM servicio WHERE slug = 'gastos-boleta'), 'Mensual'),
    (plan_exe, (SELECT id FROM servicio WHERE slug = 'ventas-boleta'), 'Mensual'),
    (plan_exe, (SELECT id FROM servicio WHERE slug = 'pre-balance'), 'Trimestral'),
    (plan_exe, (SELECT id FROM servicio WHERE slug = 'balance-anual'), 'Anual'),
    (plan_exe, (SELECT id FROM servicio WHERE slug = 'soporte-email'), 'Mensual'),
    (plan_exe, (SELECT id FROM servicio WHERE slug = 'cupos-rrhh'), 'Mensual'),
    (plan_exe, (SELECT id FROM servicio WHERE slug = 'contratos-trabajo'), 'Mensual'),
    (plan_exe, (SELECT id FROM servicio WHERE slug = 'liquidaciones-sueldo'), 'Mensual'),
    (plan_exe, (SELECT id FROM servicio WHERE slug = 'nomina-previred'), 'Mensual'),
    (plan_exe, (SELECT id FROM servicio WHERE slug = 'formulario-f30'), 'Mensual'),
    (plan_exe, (SELECT id FROM servicio WHERE slug = 'finiquitos'), 'Mensual'),
    (plan_exe, (SELECT id FROM servicio WHERE slug = 'tramitacion-licencias'), 'Mensual') ON CONFLICT DO NOTHING;
END $$;

-- ==========================================
-- 8. VISTAS DEL SISTEMA (FRONTEND)
-- ==========================================

CREATE OR REPLACE VIEW vista_resumen_dt AS
SELECT 
    empresa_id,
    COUNT(*) FILTER (WHERE date_trunc('month', periodo) = date_trunc('month', CURRENT_DATE)) as total_mes,
    COUNT(*) FILTER (WHERE date_part('year', periodo) = date_part('year', CURRENT_DATE)) as total_anual,
    COUNT(*) FILTER (WHERE (estado NOT IN ('Cargado', 'No Aplica') AND fecha_vencimiento < CURRENT_DATE) OR estado = 'Atrasado') as criticos_atrasados,
    COUNT(*) FILTER (WHERE estado = 'En Firma') as pendientes_firma
FROM declaracion_dt
GROUP BY empresa_id;

CREATE OR REPLACE VIEW vista_dt_faltantes AS
SELECT 
    r.empresa_id,
    r.tipo as tramite_faltante,
    'Debe generarse para el periodo actual' as alerta
FROM requisitos_dt_empresa r
LEFT JOIN declaracion_dt d ON r.empresa_id = d.empresa_id 
    AND r.tipo = d.tipo 
    AND date_trunc('month', d.periodo) = date_trunc('month', CURRENT_DATE)
WHERE d.id IS NULL;

CREATE OR REPLACE VIEW vista_clientes_crm AS
SELECT 
    e.id,
    e.razon_social AS "razonSocial",
    e.rut_encrypted AS "rut", 
    e.giro,
    p.nombre AS "plan",
    p.precio_base AS "tramo",
    s.direccion, s.comuna, s.ciudad,
    e.telefono_corporativo AS "telefono",
    COALESCE(e.whatsapp, e.telefono_corporativo) AS "whatsapp", 
    e.email_corporativo AS "correo",
    ec.web_password_encrypted AS "claveWeb",
    ec.sii_password_encrypted AS "claveSII",
    e.estado_f29 AS "estadoFormulario",
    e.impuesto_pagar AS "impuestoPagar",
    e.nombre_rep AS "repNombre",
    e.rut_rep_encrypted AS "repRut",
    e.estado_pago AS "pagoServicio",
    e.tipo_cliente AS "type",
    e.impuesto_pagar AS "neto", 
    e.dts_mensuales AS "dts",
    e.score,
    e.drive_url AS "drive",
    
    e.compras_mensuales AS "compras",
    e.ventas_mensuales AS "ventas",
    e.facturacion_total AS "facturacionTotal",
    e.monto_bruto AS "bruto",
    e.nro_factura AS "numeroFactura",
    e.contrato_renta AS "contratoRenta",
    e.estado_formulario_renta AS "formularioRenta",
    e.monto_renta AS "renta",
    e.renta_marzo_neto AS "rentaMarzoNeto",
    e.renta_marzo_bruto AS "rentaMarzoBruto",
    e.fecha_pago AS "fechaPago",
    e.impuesto_unico AS "impuestoUnico",
    e.nota_urgente AS "importante",

    COALESCE(dt.criticos_atrasados, 0) AS "dtAtrasados",
    COALESCE(dt.pendientes_firma, 0) AS "dtPendientesFirma",

    COALESCE(
        (SELECT json_agg(json_build_object('id', b.id, 'fecha', to_char(b.created_at, 'DD/MM/YYYY'), 'texto', b.texto) ORDER BY b.created_at DESC)
         FROM bitacora_gestion b WHERE b.empresa_id = e.id), '[]'::json
    ) AS "notas"
FROM empresa e
LEFT JOIN plan p ON e.plan_id = p.id
LEFT JOIN sucursal s ON e.id = s.empresa_id AND s.es_casa_matriz = true
LEFT JOIN empresa_credenciales ec ON e.id = ec.empresa_id
LEFT JOIN vista_resumen_dt dt ON e.id = dt.empresa_id;