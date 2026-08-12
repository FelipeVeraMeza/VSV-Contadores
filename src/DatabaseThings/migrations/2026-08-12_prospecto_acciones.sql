-- ============================================================================
-- Agenda de acciones del prospecto + servicios de interés (pedidos de Mati)
-- ----------------------------------------------------------------------------
-- 1) proximo_contacto pasa de fecha a fecha+hora: Mati necesita agendar
--    "llamar a las 13:30", no solo el día. Está vacío en las 4 personas, así que
--    el cambio no toca ningún dato.
-- 2) persona_accion: la agenda de acciones (llamar/reunión/seguimiento…) con
--    fecha y hora, nota y estado. Es lo que alimenta "¿a quién llamo hoy?".
-- 3) Servicios de interés que faltaban en el catálogo.
-- ============================================================================

-- 1) fecha -> fecha+hora
ALTER TABLE persona
  ALTER COLUMN proximo_contacto TYPE timestamptz USING proximo_contacto::timestamptz;

-- 2) Agenda de acciones
CREATE TABLE IF NOT EXISTS persona_accion (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id  uuid NOT NULL REFERENCES persona(id) ON DELETE CASCADE,
    tipo        varchar(20)  NOT NULL DEFAULT 'llamar',   -- llamar | reunion | seguimiento | prospectar | otro
    titulo      varchar(200),                             -- "Llamar a Marleny 13:30"
    fecha_hora  timestamptz,                              -- cuándo hay que hacerla
    nota        text,
    estado      varchar(12)  NOT NULL DEFAULT 'pendiente', -- pendiente | completada
    creado_por  uuid REFERENCES usuario(id) ON DELETE SET NULL,
    created_at  timestamptz DEFAULT NOW(),
    completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_persona_accion_persona   ON persona_accion(persona_id);
CREATE INDEX IF NOT EXISTS idx_persona_accion_pendiente ON persona_accion(fecha_hora) WHERE estado = 'pendiente';

-- 3) Servicios de interés que pidió Mati (organización VOLLAIRE & OLIVOS)
INSERT INTO servicio (id, nombre, slug, es_critico, categoria, activo, organizacion_id) VALUES
  (gen_random_uuid(), 'Creación de Empresa',        'creacion-empresa',        false, 'Legal',       true, 'e5815fad-7ecb-4903-a28c-0c2188583e24'),
  (gen_random_uuid(), 'Página Web',                 'pagina-web',              false, 'Soporte',     true, 'e5815fad-7ecb-4903-a28c-0c2188583e24'),
  (gen_random_uuid(), 'Marketing',                  'marketing',               false, 'Soporte',     true, 'e5815fad-7ecb-4903-a28c-0c2188583e24'),
  (gen_random_uuid(), 'Normalización Tributaria',   'normalizacion-tributaria',false, 'Tributaria',  true, 'e5815fad-7ecb-4903-a28c-0c2188583e24'),
  (gen_random_uuid(), 'Prescripción de Deudas',     'prescripcion-deudas',     false, 'Legal',       true, 'e5815fad-7ecb-4903-a28c-0c2188583e24'),
  (gen_random_uuid(), 'Auditorías Contables',       'auditorias-contables',    false, 'Contabilidad',true, 'e5815fad-7ecb-4903-a28c-0c2188583e24'),
  (gen_random_uuid(), 'Auditorías de Comunidades',  'auditorias-comunidades',  false, 'Contabilidad',true, 'e5815fad-7ecb-4903-a28c-0c2188583e24')
ON CONFLICT (slug) DO NOTHING;
