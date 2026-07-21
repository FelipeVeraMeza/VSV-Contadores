-- ============================================================================
-- Identidad real del documento en los comprobantes contables.
--
-- PROBLEMA QUE RESUELVE
-- Hasta ahora el único dato que identificaba a un asiento era el número de
-- folio leído como TEXTO desde la glosa ("... Folio #100 ..."), con un LIKE
-- por prefijo. Eso provoca tres colisiones distintas:
--   1. Tipo: la factura 33 folio 100 y la nota de crédito 61 folio 100 son
--      el mismo asiento para el sistema; la NC pisa a la factura.
--   2. Año: el folio 100 de 2025 y el de 2026 también colisionan.
--   3. Contraparte: en compras el folio lo asigna el proveedor, así que el
--      folio 1 del proveedor A choca con el folio 1 del proveedor B.
-- Además el LIKE '%Folio #1%' matchea por prefijo: contabilizar el folio 1
-- alcanzaba a 363 documentos distintos de la base actual.
--
-- La identidad correcta es la misma que ya usan las tablas de documentos:
--   (empresa_id, clase, tipo_dte, folio, rut_contraparte)
--
-- Se aprovecha además para registrar a qué documento afecta una nota de
-- crédito/débito (ref_*), dato que hasta ahora no se guardaba en ninguna parte.
--
-- Seguro de aplicar: `comprobantes` está vacía y no hay duplicados previos en
-- las tablas a las que se les agrega UNIQUE (verificado antes de escribir esto).
-- Requiere PostgreSQL 15+ por NULLS NOT DISTINCT (el servidor corre 17.6).
-- ============================================================================

BEGIN;

-- ── 1. Identidad del documento en el comprobante ────────────────────────────
ALTER TABLE comprobantes
  ADD COLUMN IF NOT EXISTS folio           bigint,
  ADD COLUMN IF NOT EXISTS tipo_dte        integer,
  ADD COLUMN IF NOT EXISTS rut_contraparte varchar(20),
  ADD COLUMN IF NOT EXISTS clase           varchar(20);

COMMENT ON COLUMN comprobantes.folio           IS 'Folio del documento tributario que origina el asiento.';
COMMENT ON COLUMN comprobantes.tipo_dte        IS 'Tipo DTE: 33 factura, 34 exenta, 39 boleta, 56 nota débito, 61 nota crédito.';
COMMENT ON COLUMN comprobantes.rut_contraparte IS 'RUT normalizado del cliente (venta) o proveedor (compra).';
COMMENT ON COLUMN comprobantes.clase           IS 'venta | compra | honorario | manual.';

-- ── 2. Referencia de la nota de crédito/débito al documento que afecta ──────
ALTER TABLE comprobantes
  ADD COLUMN IF NOT EXISTS ref_folio       bigint,
  ADD COLUMN IF NOT EXISTS ref_tipo_dte    integer,
  ADD COLUMN IF NOT EXISTS ref_razon       text;

COMMENT ON COLUMN comprobantes.ref_folio    IS 'Folio del documento afectado por esta nota de crédito/débito.';
COMMENT ON COLUMN comprobantes.ref_tipo_dte IS 'Tipo DTE del documento afectado (normalmente 33 o 34).';
COMMENT ON COLUMN comprobantes.ref_razon    IS 'Motivo declarado de la nota de crédito/débito.';

-- ── 3. La clave real: un documento = un comprobante ─────────────────────────
-- Parcial: los comprobantes manuales (sin folio) no quedan restringidos.
-- NULLS NOT DISTINCT para que los comprobantes globales (empresa_id IS NULL)
-- y las contrapartes sin RUT también queden protegidos.
CREATE UNIQUE INDEX IF NOT EXISTS uq_comprobante_documento
  ON comprobantes (empresa_id, clase, tipo_dte, folio, rut_contraparte)
  NULLS NOT DISTINCT
  WHERE folio IS NOT NULL;

-- ── 4. Correlativo de comprobante único por empresa ─────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_comprobante_numero_empresa
  ON comprobantes (empresa_id, numero_comprobante)
  NULLS NOT DISTINCT;

-- ── 5. Índices de consulta ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_comprobantes_empresa_fecha
  ON comprobantes (empresa_id, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_comprobantes_ref
  ON comprobantes (empresa_id, ref_tipo_dte, ref_folio)
  WHERE ref_folio IS NOT NULL;

-- ── 6. Las tablas *_empresa no tenían NINGUNA unique (solo PK sobre id) ─────
-- Son las que usa el flujo cuando hay una empresa seleccionada, así que el
-- documento mismo se podía duplicar. Sus gemelas globales ya tenían la
-- constraint correcta; acá se replica.
CREATE UNIQUE INDEX IF NOT EXISTS uq_doc_emitidos_empresa
  ON documentos_emitidos_empresa (empresa_id, tipo_dte, folio, rut_cliente)
  NULLS NOT DISTINCT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_doc_recibidos_empresa
  ON documentos_recibidos_empresa (empresa_id, tipo_dte, folio, rut_proveedor)
  NULLS NOT DISTINCT;

-- ── 7. Plan de cuentas: el código no puede repetirse dentro de una empresa ──
CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_cuentas_empresa_codigo
  ON plan_cuentas (empresa_id, codigo)
  NULLS NOT DISTINCT;

-- ── 8. Limpieza: documentos_emitidos tenía la MISMA unique declarada 2 veces ─
-- unique_documento_folio y unique_empresa_tipo_folio son ambas
-- UNIQUE (empresa_id, tipo_dte, folio). Se conserva una sola.
ALTER TABLE documentos_emitidos DROP CONSTRAINT IF EXISTS unique_documento_folio;

COMMIT;
