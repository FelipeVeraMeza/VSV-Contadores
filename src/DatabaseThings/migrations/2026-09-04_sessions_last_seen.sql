-- ============================================================================
-- QUIÉN ESTÁ CONECTADO · la última señal de vida de cada sesión
-- ----------------------------------------------------------------------------
-- Para decir «Matías está conectado» hace falta saber cuándo fue la última vez
-- que hizo algo. La tabla `sessions` no lo guardaba, y con lo que había NO se
-- puede deducir:
--
--   · `created_at` es cuándo entró. Alguien que entró hace 58 horas y cerró el
--     navegador enseguida seguiría figurando igual que quien está trabajando.
--
--   · `expires_at` tampoco sirve. La renovación deslizante solo lo mueve cuando
--     quedan menos de 12 horas, así que entre renovación y renovación puede
--     pasar medio día sin que el campo cambie aunque la persona esté usando el
--     sistema todo el rato. Medido el 04-09-2026: sesiones «renovadas hace 480
--     minutos» de gente que podía haber estado activa hace un minuto.
--
-- Sin este dato, «conectado» significaría «entró en las últimas 24 h», que es
-- justamente lo que no se quiere mostrar: un semáforo que dice verde para
-- alguien que se fue ayer es peor que no tener semáforo.
--
-- SE ESCRIBE EN CADA PETICIÓN, PERO NO SIEMPRE.
-- Marcar la hora en cada llamada sería una escritura por cada clic de cada
-- persona. El middleware solo la actualiza si pasó más de un minuto desde la
-- última (ver `requireSession`): para saber quién está conectado, un minuto de
-- resolución sobra.
--
-- El valor inicial es `created_at` y no `NOW()`: al aplicar la migración nadie
-- acaba de dar señales de vida, y ponerles la hora actual a todos haría
-- aparecer «conectado» a gente que no lo está.
-- ============================================================================

BEGIN;

ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

UPDATE sessions
   SET last_seen_at = created_at
 WHERE last_seen_at IS NULL;

ALTER TABLE sessions
    ALTER COLUMN last_seen_at SET DEFAULT NOW();

-- La consulta de «quién está conectado» filtra por sesión viva y ordena por
-- esta columna. Con pocas filas da igual, pero la tabla crece con cada login.
CREATE INDEX IF NOT EXISTS sessions_last_seen_idx
    ON sessions (expires_at, last_seen_at DESC);

COMMENT ON COLUMN sessions.last_seen_at IS
    'Última petición de esta sesión. Se refresca como mucho una vez por minuto.';

COMMIT;
