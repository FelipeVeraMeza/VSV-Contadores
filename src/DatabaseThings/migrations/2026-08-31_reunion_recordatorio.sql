-- =====================================================================
-- Migración: RECORDATORIO ANTES DE LA REUNIÓN
-- Fecha: 2026-08-31 · Idempotente.
-- =====================================================================
-- QUÉ RESUELVE
-- El sistema avisaba al invitar y cuando la sala se abría. Entre esas dos
-- cosas puede haber una semana, y el aviso de la semana pasada no sirve a
-- las 15:25 de un jueves. Faltaba el de 15 minutos antes.
--
-- POR QUÉ UNA COLUMNA Y NO UNA LISTA EN MEMORIA
-- Esta marca es lo que evita el aviso DUPLICADO. Sin ella, dos instancias
-- del servidor —o un reinicio dentro de la ventana de 15 minutos— mandarían
-- el mismo recordatorio dos y tres veces, que molesta más que no mandarlo.
-- El cron la escribe y la lee en la misma sentencia (UPDATE ... WHERE
-- recordatorio_at IS NULL ... FOR UPDATE SKIP LOCKED), así que el primero
-- que toma la reunión se la lleva y el resto la ve marcada.
--
-- Se guarda CUÁNDO se avisó y no un booleano: si algún día hay que revisar
-- por qué alguien no recibió el aviso, la hora lo dice y un `true` no.
-- =====================================================================

ALTER TABLE reunion ADD COLUMN IF NOT EXISTS recordatorio_at timestamptz;

COMMENT ON COLUMN reunion.recordatorio_at IS
    'Cuándo se envió el recordatorio previo. NULL = todavía no se avisó. Evita el aviso duplicado entre instancias y reinicios.';

-- El cron corre cada minuto y busca siempre lo mismo: agendadas, con hora,
-- sin avisar. Sin índice sería un recorrido completo de la tabla 1.440 veces
-- al día. El índice PARCIAL solo indexa las que pueden entrar —una reunión ya
-- avisada o terminada no vuelve a mirarse— así que se mantiene chico solo.
CREATE INDEX IF NOT EXISTS idx_reunion_recordatorio_pendiente
    ON reunion (inicia_at)
    WHERE estado = 'agendada' AND inicia_at IS NOT NULL AND recordatorio_at IS NULL;
