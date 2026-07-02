-- =====================================================================
-- Seed del catálogo de servicios (tabla servicio estaba vacía)
-- Idempotente: ON CONFLICT (slug) DO NOTHING.
-- categoria debe coincidir con enum categoria_servicio:
--   Tributaria | Contabilidad | RRHH | Soporte | Legal
-- =====================================================================
INSERT INTO servicio (nombre, slug, categoria, es_critico, activo) VALUES
  ('Contabilidad Mensual',            'contabilidad-mensual',    'Contabilidad', true,  true),
  ('Remuneraciones (RRHH)',           'remuneraciones-rrhh',     'RRHH',         false, true),
  ('Declaración F29 (IVA mensual)',   'declaracion-f29',         'Tributaria',   true,  true),
  ('Operación Renta (F22 anual)',     'operacion-renta-f22',     'Tributaria',   false, true),
  ('Oficina Virtual',                 'oficina-virtual',         'Soporte',      false, true),
  ('Facturación Electrónica',         'facturacion-electronica', 'Tributaria',   false, true),
  ('Trámites Dirección del Trabajo',  'tramites-dt',             'Legal',        false, true),
  ('Inicio de Actividades',           'inicio-actividades',      'Legal',        false, true),
  ('Término de Giro',                 'termino-giro',            'Legal',        false, true),
  ('Modificación de Sociedad',        'modificacion-sociedad',   'Legal',        false, true)
ON CONFLICT (slug) DO NOTHING;
