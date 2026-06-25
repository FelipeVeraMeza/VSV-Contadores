# CRM PYME — Fase 0: Diseño del modelo de datos (Persona-céntrico)

> Estado: **DISEÑO**. El SQL de este documento es propuesta — **no ejecutar todavía**.
> Cambio de fondo: la entidad principal pasa de `empresa` a **`persona`**. Es **aditivo**: las `empresa` actuales se conservan y se enlazan a personas.
> Fecha: 2026-06-25

## 1. Concepto

Hoy el "cliente" es una `empresa`. La spec pide que toda interacción nazca sobre una **PERSONA**, que luego puede:
- no tener empresa,
- estar en 1 empresa,
- estar en varias empresas.

Y cada empresa puede tener varios contactos (personas). → relación **N:N** entre `persona` y `empresa`.

```
   persona  ──< persona_empresa >──  empresa (ya existe)
      │
      ├──< persona_telefono
      ├──< persona_correo
      ├──< persona_etiqueta >── etiqueta
      ├──< persona_servicio_interes >── servicio (ya existe)
      ├──< nota
      └──< tarea / ticket
```

## 2. Estados y reglas de negocio

`persona.estado` ∈ `'prospecto' | 'activo' | 'inactivo'`:
- **Alta** → siempre `prospecto`.
- **prospecto → activo**: automático cuando se le asocia ≥ 1 servicio contratado.
- **activo → inactivo**: cuando no quedan servicios activos, se da de baja a todos, o pasa un período configurable sin actividad.
- **Nunca se borra físicamente** → todo con `activo = false` / soft-delete + historial.

`persona.origen` ∈ `'manual' | 'whatsapp' | 'correo' | 'web' | 'import' | 'integracion'`.

> **Principio rector:** toda automatización (cambio de estado, dato sugerido por IA, etc.) debe poder revisarse, corregirse y sobrescribirse a mano, dejando trazabilidad. Por eso cada cambio relevante se registra en una tabla de historial o bitácora.

## 3. SQL propuesto (NO ejecutar aún)

```sql
-- ENUMS
CREATE TYPE estado_persona AS ENUM ('prospecto', 'activo', 'inactivo');
CREATE TYPE origen_persona AS ENUM ('manual','whatsapp','correo','web','import','integracion');

-- PERSONA (entidad principal)
CREATE TABLE persona (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre           varchar(150) NOT NULL,
    segundo_nombre   varchar(150),
    apellidos        varchar(200),
    fecha_nacimiento date,
    rut_encrypted    text,                 -- opcional al alta
    rut_hash         varchar(64) UNIQUE,   -- para detección de duplicados por RUT
    estado           estado_persona NOT NULL DEFAULT 'prospecto',
    origen           origen_persona NOT NULL DEFAULT 'manual',
    rubro            varchar(150),
    direccion        varchar(255),
    comuna           varchar(100),
    region           varchar(100),
    ejecutivo_id     uuid REFERENCES usuario(id) ON DELETE SET NULL,
    observaciones    text,
    activo           boolean DEFAULT true,            -- soft-delete
    fecha_ultimo_contacto timestamptz,
    created_at       timestamptz DEFAULT now(),
    updated_at       timestamptz DEFAULT now()
);

-- Contacto múltiple
CREATE TABLE persona_telefono (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id uuid NOT NULL REFERENCES persona(id) ON DELETE CASCADE,
    telefono varchar(30) NOT NULL,
    telefono_norm varchar(20),   -- solo dígitos, para duplicados/búsqueda
    tipo varchar(20) DEFAULT 'movil',
    principal boolean DEFAULT false
);
CREATE TABLE persona_correo (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id uuid NOT NULL REFERENCES persona(id) ON DELETE CASCADE,
    correo varchar(255) NOT NULL,
    correo_norm varchar(255),    -- lowercase, para duplicados
    tipo varchar(20) DEFAULT 'personal',
    principal boolean DEFAULT false
);

-- Relación N:N con la empresa ya existente
CREATE TABLE persona_empresa (
    persona_id uuid NOT NULL REFERENCES persona(id) ON DELETE CASCADE,
    empresa_id uuid NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    cargo varchar(120),
    principal boolean DEFAULT false,        -- empresa principal de esa persona
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (persona_id, empresa_id)
);

-- Etiquetas
CREATE TABLE etiqueta (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre varchar(80) UNIQUE NOT NULL,
    color varchar(20)
);
CREATE TABLE persona_etiqueta (
    persona_id uuid REFERENCES persona(id) ON DELETE CASCADE,
    etiqueta_id uuid REFERENCES etiqueta(id) ON DELETE CASCADE,
    PRIMARY KEY (persona_id, etiqueta_id)
);

-- Servicios de interés (distinto a servicio contratado en empresa_servicio)
CREATE TABLE persona_servicio_interes (
    persona_id uuid REFERENCES persona(id) ON DELETE CASCADE,
    servicio_id uuid REFERENCES servicio(id) ON DELETE CASCADE,
    PRIMARY KEY (persona_id, servicio_id)
);

-- Notas por persona (con autor, fecha, adjuntos)
CREATE TABLE nota (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id uuid NOT NULL REFERENCES persona(id) ON DELETE CASCADE,
    texto text NOT NULL,
    usuario_id uuid REFERENCES usuario(id) ON DELETE SET NULL,
    usuario_nombre varchar(100),
    es_ia boolean DEFAULT false,     -- generada/sugerida por IA
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
CREATE TABLE adjunto (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entidad varchar(20) NOT NULL,    -- 'nota' | 'tarea' | 'persona'
    entidad_id uuid NOT NULL,
    url text NOT NULL,
    nombre varchar(255),
    subido_por uuid REFERENCES usuario(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now()
);

-- Tareas / Tickets
CREATE TYPE estado_tarea AS ENUM ('pendiente','en_progreso','completado','cancelado','atrasado');
CREATE TYPE prioridad_tarea AS ENUM ('baja','media','alta');

CREATE TABLE tarea (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo varchar(10) DEFAULT 'tarea',          -- 'tarea' | 'ticket'
    titulo varchar(255) NOT NULL,
    descripcion text,
    persona_id uuid REFERENCES persona(id) ON DELETE SET NULL,
    empresa_id uuid REFERENCES empresa(id) ON DELETE SET NULL,
    responsable_id uuid REFERENCES usuario(id) ON DELETE SET NULL,
    estado estado_tarea DEFAULT 'pendiente',
    prioridad prioridad_tarea DEFAULT 'media',
    vence_at timestamptz,
    parent_id uuid REFERENCES tarea(id) ON DELETE CASCADE,  -- subtareas
    creado_por uuid REFERENCES usuario(id) ON DELETE SET NULL,
    es_ia boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
CREATE TABLE tarea_comentario (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tarea_id uuid NOT NULL REFERENCES tarea(id) ON DELETE CASCADE,
    usuario_id uuid REFERENCES usuario(id) ON DELETE SET NULL,
    texto text NOT NULL,
    created_at timestamptz DEFAULT now()
);
CREATE TABLE tarea_colaborador (
    tarea_id uuid REFERENCES tarea(id) ON DELETE CASCADE,
    usuario_id uuid REFERENCES usuario(id) ON DELETE CASCADE,
    PRIMARY KEY (tarea_id, usuario_id)
);

-- Detección de duplicados
CREATE TABLE duplicado_potencial (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id uuid REFERENCES persona(id) ON DELETE CASCADE,
    match_persona_id uuid REFERENCES persona(id) ON DELETE CASCADE,
    criterio varchar(20),    -- 'rut' | 'correo' | 'telefono' | 'nombre'
    estado varchar(20) DEFAULT 'pendiente',  -- pendiente | fusionado | descartado
    created_at timestamptz DEFAULT now()
);

-- Historial de estado (trazabilidad del principio rector)
CREATE TABLE persona_estado_historial (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id uuid NOT NULL REFERENCES persona(id) ON DELETE CASCADE,
    estado_anterior estado_persona,
    estado_nuevo estado_persona,
    motivo text,            -- 'automatico: contrató servicio', 'manual', etc.
    usuario_id uuid REFERENCES usuario(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now()
);

-- Índices clave
CREATE INDEX idx_persona_estado ON persona(estado) WHERE activo;
CREATE INDEX idx_persona_tel ON persona_telefono(telefono_norm);
CREATE INDEX idx_persona_correo ON persona_correo(correo_norm);
CREATE INDEX idx_tarea_responsable ON tarea(responsable_id, estado);
```

## 4. Convivencia con lo existente
- `empresa`, `empresa_servicio`, `bitacora_gestion`, etc. **se mantienen**.
- Las 145 empresas actuales pueden seguir funcionando como hoy; las personas nuevas se enlazan vía `persona_empresa`.
- Decisión pendiente del usuario: ¿migrar contactos de las empresas actuales a `persona`, o solo crear personas nuevas de aquí en adelante?

## 5. Validaciones (Fase 1, en backend)
- **RUT**: formato + dígito verificador (módulo 11) + `rut_hash` único.
- **Correo**: formato + dominio.
- **Teléfono**: normalización a dígitos, mínimo de dígitos, formato nacional/internacional.

## 6. Automatización de estado (trigger o lógica de servicio)
- Al insertar en `empresa_servicio` (estado activo) ligado a una persona → si `prospecto`, pasar a `activo` + registrar en `persona_estado_historial`.
- Job diario: personas `activo` sin servicios activos o sin actividad > N días → `inactivo` (N configurable).
