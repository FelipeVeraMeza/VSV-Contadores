// ============================================================================
// RECORDATORIO ANTES DE LA REUNIÓN
// ----------------------------------------------------------------------------
// QUÉ FALTABA
// El sistema avisaba al INVITAR («te agendaron una reunión») y cuando la sala se
// abría. Entre esas dos cosas puede haber una semana, y el aviso de la semana
// pasada no sirve de nada a las 15:25 de un jueves. Faltaba el de 15 minutos
// antes, que es el único que llega cuando todavía se puede hacer algo.
//
// POR QUÉ UN CRON Y NO UN setTimeout AL CREAR LA REUNIÓN
// Un `setTimeout` vive en la memoria del proceso: con un redeploy —que en este
// proyecto pasa seguido— se pierden todos los recordatorios agendados y nadie se
// entera. El cron mira la base cada minuto, así que sobrevive a los reinicios y
// además recoge las reuniones que se crearon mientras el servidor estaba abajo.
//
// POR QUÉ UNA COLUMNA Y NO UNA LISTA EN MEMORIA
// `recordatorio_at` marca en la BASE que ya se avisó. Sin eso, dos instancias
// del servidor —o un reinicio dentro de la ventana— mandarían el aviso dos y
// tres veces, que es peor que no mandarlo. Se marca ANTES de notificar y en un
// UPDATE condicional: el primero que la toma se la lleva, el resto la ve ya
// marcada y no hace nada.
//
// NOTA SOBRE LOS OTROS CRON DEL PROYECTO
// En server.js hay dos cron comentados a propósito: eran robots del SII, pesados
// y con efectos hacia afuera, y se decidió que solo corrieran a mano. Este es
// otra cosa: una consulta liviana que solo escribe una notificación interna.
// ============================================================================
import cron from 'node-cron';
import { pool } from '../database/db.js';
import { notificarA } from './notificaciones.js';

// Cuántos minutos antes se avisa. 15 es el número que se pidió; está acá arriba
// por si se quiere mover sin buscarlo entre el SQL.
const MINUTOS_ANTES = 15;

// Una pasada. Se exporta aparte del cron para poder probarla sin esperar.
export const enviarRecordatorios = async () => {
    try {
        // Se toman y se marcan en la MISMA sentencia. El `recordatorio_at IS NULL`
        // dentro del UPDATE es lo que evita el aviso duplicado: si otra instancia
        // ya la tomó, esta no devuelve filas.
        const { rows } = await pool.query(
            `UPDATE reunion
                SET recordatorio_at = NOW()
              WHERE id IN (
                    SELECT id FROM reunion
                     WHERE estado = 'agendada'
                       AND inicia_at IS NOT NULL
                       AND recordatorio_at IS NULL
                       -- La ventana: entra cuando faltan 15 minutos o menos, y
                       -- sale cuando la hora ya pasó. Sin el límite de abajo, al
                       -- levantar el servidor se avisaría de reuniones de ayer.
                       AND inicia_at BETWEEN NOW() AND NOW() + ($1 || ' minutes')::interval
                     FOR UPDATE SKIP LOCKED
              )
              RETURNING id, titulo, inicia_at, organizacion_id`,
            [String(MINUTOS_ANTES)]);

        for (const r of rows) {
            const { rows: gente } = await pool.query(
                `SELECT usuario_id FROM reunion_participante WHERE reunion_id = $1`, [r.id]);
            if (!gente.length) continue;

            const hora = new Date(r.inicia_at).toLocaleTimeString('es-CL', {
                hour: '2-digit', minute: '2-digit',
            });
            // Se avisa a TODOS los participantes, incluido quien la convocó: el
            // que agenda también se olvida, y de hecho es el que más reuniones
            // tiene encima.
            await notificarA(gente.map(g => g.usuario_id), {
                tipo: 'reunion_recordatorio',
                titulo: `En ${MINUTOS_ANTES} minutos: ${r.titulo}`,
                descripcion: `Empieza a las ${hora} h`,
                entidad: 'reunion', entidadId: r.id,
            });
        }
        return rows.length;
    } catch (e) {
        // Un recordatorio que falla no puede voltear el servidor. Se anota y la
        // próxima pasada —dentro de un minuto— lo vuelve a intentar, salvo que
        // ya se hubiera marcado, en cuyo caso se perdió ese aviso y nada más.
        console.error('⚠️ Error enviando recordatorios de reunión:', e.message);
        return 0;
    }
};

// Cada minuto. Es una consulta a un índice y casi siempre devuelve cero filas.
export const iniciarRecordatoriosReunion = () => {
    cron.schedule('* * * * *', enviarRecordatorios);
    console.log(`⏰ Recordatorios de reunión activos (${MINUTOS_ANTES} min antes)`);
};
