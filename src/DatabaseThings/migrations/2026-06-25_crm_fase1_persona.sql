-- =====================================================================
-- CRM PYME — Fase 1: Núcleo Persona
-- Fecha: 2026-06-25
-- Aditivo y NO destructivo. Idempotente (se puede correr más de una vez).
-- No modifica ninguna tabla existente (empresa, etc. quedan intactas).
-- =====================================================================

-- ---------- ENUMS (con guarda para idempotencia) ----------
DO $$ BEGIN
    CREATE TYPE estado_persona AS ENUM ('prospecto', 'activo', 'inactivo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE origen_persona AS ENUM ('manual','whatsapp','correo','web','import','integracion');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- PERSONA (entidad principal) ----------
CREATE TABLE IF NOT EXISTS persona (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre           varchar(150),
    segundo_nombre   varchar(150),
    apellidos        varchar(200),
    fecha_nacimiento date,
    rut_encrypted    text,
    rut_hash         varchar(64) UNIQUE,
    estado           estado_persona NOT NULL DEFAULT 'prospecto',
    origen           origen_persona NOT NULL DEFAULT 'manual',
    rubro            varchar(150),
    direccion        varchar(255),
    comuna           varchar(100),
    region           varchar(100),
    ejecutivo_id     uuid REFERENCES usuario(id) ON DELETE SET NULL,
    observaciones    text,
    activo           boolean DEFAULT true,
    fecha_ultimo_contacto timestamptz,
    created_at       timestamptz DEFAULT now(),
    updated_at       timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS persona_telefono (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id uuid NOT NULL REFERENCES persona(id) ON DELETE CASCADE,
    telefono varchar(30) NOT NULL,
    telefono_norm varchar(20),
    tipo varchar(20) DEFAULT 'movil',
    principal boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS persona_correo (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id uuid NOT NULL REFERENCES persona(id) ON DELETE CASCADE,
    correo varchar(255) NOT NULL,
    correo_norm varchar(255),
    tipo varchar(20) DEFAULT 'personal',
    principal boolean DEFAULT false
);

-- Relación N:N con la empresa existente
CREATE TABLE IF NOT EXISTS persona_empresa (
    persona_id uuid NOT NULL REFERENCES persona(id) ON DELETE CASCADE,
    empresa_id uuid NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    cargo varchar(120),
    principal boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (persona_id, empresa_id)
);

-- Etiquetas
CREATE TABLE IF NOT EXISTS etiqueta (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre varchar(80) UNIQUE NOT NULL,
    color varchar(20)
);
CREATE TABLE IF NOT EXISTS persona_etiqueta (
    persona_id uuid REFERENCES persona(id) ON DELETE CASCADE,
    etiqueta_id uuid REFERENCES etiqueta(id) ON DELETE CASCADE,
    PRIMARY KEY (persona_id, etiqueta_id)
);

-- Servicios de interés (distinto a contratado)
CREATE TABLE IF NOT EXISTS persona_servicio_interes (
    persona_id uuid REFERENCES persona(id) ON DELETE CASCADE,
    servicio_id uuid REFERENCES servicio(id) ON DELETE CASCADE,
    PRIMARY KEY (persona_id, servicio_id)
);

-- Notas por persona
CREATE TABLE IF NOT EXISTS nota (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id uuid NOT NULL REFERENCES persona(id) ON DELETE CASCADE,
    texto text NOT NULL,
    usuario_id uuid REFERENCES usuario(id) ON DELETE SET NULL,
    usuario_nombre varchar(100),
    es_ia boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Historial de cambios de estado (trazabilidad)
CREATE TABLE IF NOT EXISTS persona_estado_historial (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id uuid NOT NULL REFERENCES persona(id) ON DELETE CASCADE,
    estado_anterior estado_persona,
    estado_nuevo estado_persona,
    motivo text,
    usuario_id uuid REFERENCES usuario(id) ON DELETE SET NULL,
    usuario_nombre varchar(100),
    created_at timestamptz DEFAULT now()
);

-- Duplicados potenciales
CREATE TABLE IF NOT EXISTS duplicado_potencial (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id uuid REFERENCES persona(id) ON DELETE CASCADE,
    match_persona_id uuid REFERENCES persona(id) ON DELETE CASCADE,
    criterio varchar(20),
    estado varchar(20) DEFAULT 'pendiente',
    created_at timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_persona_estado ON persona(estado) WHERE activo;
CREATE INDEX IF NOT EXISTS idx_persona_tel ON persona_telefono(telefono_norm);
CREATE INDEX IF NOT EXISTS idx_persona_correo ON persona_correo(correo_norm);
CREATE INDEX IF NOT EXISTS idx_persona_empresa_emp ON persona_empresa(empresa_id);
