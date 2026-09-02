-- =====================================================================
-- APROBACIÓN DE COMPROBANTES POR UN SEGUNDO CONTADOR
-- Fecha: 2026-09-01 · Idempotente.
-- =====================================================================
-- QUÉ RESUELVE
-- Hasta ahora un comprobante guardaba SOLO la firma de quien lo contabilizó
-- (`contabilizado_por`). Eso dice quién lo hizo, pero no que alguien más lo
-- haya revisado: si la cuenta estaba equivocada, nadie lo miraba de nuevo.
--
-- El pedido de la tarea «APROBAR CONTABILIDAD POR CONTADOR» es el circuito
-- completo:
--
--     Contabilizado → Pendiente de aprobación
--                          ↓
--                  ┌───────┴───────┐
--               Aprobado        Rechazado (+ motivo)
--                                  ↓
--                              se corrige
--                                  ↓
--                        Pendiente de aprobación otra vez
--
-- DECISIONES DE NEGOCIO (Felipe, 01-09-2026)
--
-- 1. APRUEBA CUALQUIERA MENOS QUIEN LO CONTABILIZÓ.
--    Los tres usuarios son Administrador, así que no se crea un rol nuevo: la
--    regla es «no apruebes lo tuyo». Es lo que obliga a que pasen dos pares de
--    ojos por cada asiento, que es todo el sentido de aprobar. Se aplica en el
--    servidor, no en la pantalla.
--
-- 2. EL ASIENTO CUENTA EN LOS LIBROS DESDE QUE SE CONTABILIZA.
--    La aprobación es una revisión POSTERIOR, no un permiso previo. Si el
--    balance solo mostrara lo aprobado, un fin de semana sin nadie que apruebe
--    dejaría los informes incompletos y nadie entendería por qué faltan
--    movimientos. Por eso el estado no se usa para filtrar los libros.
--
-- 3. UN RECHAZADO SE CORRIGE, NO SE ANULA.
--    Vuelve a «pendiente de aprobación» conservando su número y su historial.
--    Anularlo y rehacerlo perdería el hilo de qué se corrigió y por qué.
--
-- POR QUÉ AHORA Y NO DESPUÉS
-- Hay CERO comprobantes en la base, así que la migración no toca ningún dato
-- existente. Hacerlo con volumen obligaría a decidir qué estado darle a lo ya
-- contabilizado sin haberlo revisado nunca.
-- =====================================================================

-- Quién aprobó o rechazó, cuándo, y por qué si fue rechazo.
ALTER TABLE comprobantes ADD COLUMN IF NOT EXISTS aprobado_por      TEXT;
ALTER TABLE comprobantes ADD COLUMN IF NOT EXISTS aprobado_por_id   TEXT;
ALTER TABLE comprobantes ADD COLUMN IF NOT EXISTS aprobado_at       TIMESTAMPTZ;
ALTER TABLE comprobantes ADD COLUMN IF NOT EXISTS motivo_rechazo    TEXT;

-- Los estados posibles, escritos en la base y no solo en el código.
--
-- 'Contabilizado' se conserva como estado de entrada —es el que ya usa el
-- sistema y el que deja el asiento recién guardado— y significa «hecho, todavía
-- sin revisar». Un CHECK evita que una llamada mal escrita deje un estado
-- inventado que después nadie sepa interpretar.
ALTER TABLE comprobantes DROP CONSTRAINT IF EXISTS comprobantes_estado_valido;
ALTER TABLE comprobantes ADD  CONSTRAINT comprobantes_estado_valido
    CHECK (estado IN ('Contabilizado', 'Aprobado', 'Rechazado'));

-- Para la bandeja «lo que me falta aprobar»: se pide seguido y siempre filtra
-- por lo mismo. Parcial, porque lo aprobado no se vuelve a consultar así.
CREATE INDEX IF NOT EXISTS idx_comprobantes_por_aprobar
    ON comprobantes (empresa_id, contabilizado_at DESC)
    WHERE estado = 'Contabilizado';

COMMENT ON COLUMN comprobantes.estado IS
    'Contabilizado = hecho, falta que otro lo revise · Aprobado = revisado y firme · Rechazado = devuelto con motivo, hay que corregirlo';
COMMENT ON COLUMN comprobantes.aprobado_por IS
    'Nombre de quien aprobó o rechazó. Nunca puede ser el mismo que contabilizado_por: eso se valida en el servidor.';
COMMENT ON COLUMN comprobantes.motivo_rechazo IS
    'Por qué se devolvió. Obligatorio al rechazar: sin motivo, quien lo hizo no sabe qué corregir.';
