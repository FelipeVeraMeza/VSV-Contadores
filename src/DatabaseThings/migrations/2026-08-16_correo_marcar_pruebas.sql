-- ===================================================================================
-- 2026-08-16 · Las pruebas también gastan cuota
-- ===================================================================================
-- EL ERROR QUE ARREGLA
-- El contador diario leía de `correo_envio`, y los envíos de PRUEBA no se
-- registraban ahí. Pero la prueba sí sale por Resend y sí consume el tope del
-- plan. Resultado: se hacían 10 pruebas ajustando un texto y el contador seguía
-- diciendo «0/100» cuando ya se habían gastado 10.
--
-- Con un tope de ~100 y una cartera de 132, esos 10 deciden si la campaña entra
-- o no. El contador tiene que decir la verdad o no sirve para nada.
--
-- LA SOLUCIÓN
-- Las pruebas SÍ se registran, marcadas con `es_prueba`. Así:
--   · la CUOTA las cuenta, porque el proveedor las cuenta
--   · el HISTORIAL las esconde, porque nadie quiere ver 40 envíos a su propia
--     casilla mezclados con las campañas de verdad
--
-- Se marca en las dos tablas —y no solo en la cabecera— para que la consulta de
-- la cuota, que es la que corre más seguido, no tenga que cruzar tablas.
--
-- Idempotente.
-- ===================================================================================

BEGIN;

ALTER TABLE correo_campana ADD COLUMN IF NOT EXISTS es_prueba boolean NOT NULL DEFAULT false;
ALTER TABLE correo_envio   ADD COLUMN IF NOT EXISTS es_prueba boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN correo_campana.es_prueba IS
    'true = fue una prueba a la casilla interna. Gasta cuota igual, pero no aparece en el historial.';
COMMENT ON COLUMN correo_envio.es_prueba IS
    'Copia de correo_campana.es_prueba, para que el contador diario no tenga que cruzar tablas.';

-- El historial pide las campañas reales ordenadas por fecha; con la marca en el
-- índice esa consulta no tiene que leer las pruebas para después descartarlas.
DROP INDEX IF EXISTS ix_correo_campana_org;
CREATE INDEX IF NOT EXISTS ix_correo_campana_org
    ON correo_campana (organizacion_id, es_prueba, created_at DESC);

COMMIT;
