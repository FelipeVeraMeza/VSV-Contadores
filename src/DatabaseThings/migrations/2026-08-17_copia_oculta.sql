-- ===================================================================================
-- 2026-08-17 · Copia oculta de cada correo, para dejar registro en la casilla propia
-- ===================================================================================
-- POR QUÉ
-- Los correos salen por Resend, por HTTPS, y nunca pasan por Gmail: en la carpeta
-- «Enviados» de Gmail no aparecen y no van a aparecer. Para eso está la pantalla
-- de Enviados, que lee `correo_campana` / `correo_envio` y muestra más de lo que
-- Gmail podría (a quién llegó, a quién no y por qué, y el texto exacto).
--
-- Aun así hace falta tenerlos EN el correo: para reenviar uno rápido, para
-- buscarlos junto al resto de la conversación con el cliente, o simplemente
-- porque uno confía en lo que ve en su bandeja.
--
-- OCULTA Y NO CC
-- En copia visible el cliente ve que uno se copió a sí mismo, y queda una
-- dirección interna a la vista en un correo que sale a decenas de personas.
--
-- ⚠️ CUESTA CUOTA
-- Cada copia es un correo más para el proveedor: una campaña de 38 pasa a
-- consumir 76 de los ~100 diarios del plan. Por eso viene APAGADA y se enciende
-- a conciencia, y por eso `correo_envio.con_copia` existe: sin marcar cuáles
-- llevaron copia, el contador diario mostraría la mitad del gasto real.
--
-- Idempotente.
-- ===================================================================================

BEGIN;

-- Se reusa `correo_respuesta` como destino: es la misma casilla donde la persona
-- lee. Dos campos para la misma dirección solo se desincronizan.
ALTER TABLE usuario      ADD COLUMN IF NOT EXISTS copia_oculta boolean NOT NULL DEFAULT false;
ALTER TABLE correo_envio ADD COLUMN IF NOT EXISTS con_copia    boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN usuario.copia_oculta IS
    'Mandarse copia oculta (BCC) de cada correo, al mismo correo_respuesta. Gasta el doble de cuota.';
COMMENT ON COLUMN correo_envio.con_copia IS
    'Este envío llevó copia oculta, o sea que ante el proveedor contó como DOS correos. Lo usa el contador diario.';

COMMIT;
