// ============================================================================
// NOTIFICACIONES DENTRO DEL SISTEMA
// ----------------------------------------------------------------------------
// Regla de oro: notificar NUNCA puede voltear la acción que la provocó. Si la
// base falla al escribir el aviso, la tarea igual se asigna y el comentario
// igual se guarda; el fallo se anota por consola y se sigue. Un aviso perdido
// molesta, una tarea perdida cuesta plata.
//
// Por eso ninguna función de acá lanza, y todas se pueden llamar sin `await` si
// el llamador no quiere esperarlas.
// ============================================================================
import { pool } from '../database/db.js';
import { empujarAviso } from './avisosEnVivo.js';

const seguro = async (fn) => {
    try { return await fn(); }
    catch (err) { console.warn(`⚠️  No se pudo crear la notificación: ${err.message}`); return null; }
};

/**
 * Crea un aviso para alguien.
 * Nadie se notifica a sí mismo: si me asigno una tarea, ya lo sé.
 */
export const notificar = async ({ para, actor, tipo, titulo, descripcion = null,
                                  entidad = null, entidadId = null, organizacionId = null }) => {
    if (!para || !tipo || !titulo) return null;
    if (actor?.usuarioId && actor.usuarioId === para) return null;

    return seguro(async () => {
        const { rows } = await pool.query(
            `INSERT INTO notificacion
                (organizacion_id, usuario_id, actor_id, actor_nombre, tipo, titulo, descripcion, entidad, entidad_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             RETURNING id, tipo, titulo, descripcion, entidad, entidad_id, actor_nombre, created_at`,
            [organizacionId || actor?.organizacionId || null, para,
             actor?.usuarioId || null, actor?.nombre || null,
             tipo, titulo, descripcion, entidad, entidadId]
        );

        // Y se lo empujamos AHORA si está conectado, para que no tenga que
        // refrescar la página. Se guarda primero y se avisa después: si el
        // empuje falla, el aviso ya está a salvo en la base.
        const n = rows[0];
        empujarAviso(para, {
            id: n.id, tipo: n.tipo, titulo: n.titulo, descripcion: n.descripcion,
            entidad: n.entidad, entidadId: n.entidad_id, actorNombre: n.actor_nombre,
            fecha: n.created_at, leida: false,
        });
        return rows;
    });
};

/** Avisa a varias personas de una vez, sin repetir ni incluir al que actúa. */
export const notificarA = async (personas, datos) => {
    const unicas = [...new Set((personas || []).filter(Boolean))];
    for (const para of unicas) await notificar({ ...datos, para });
};

/** Mis avisos. `soloPendientes` para el contador de la campana. */
export const misNotificaciones = async (usuarioId, { soloPendientes = false, limite = 30 } = {}) =>
    seguro(async () => {
        const { rows } = await pool.query(
            `SELECT id, tipo, titulo, descripcion, entidad, entidad_id, actor_nombre, leida_at, created_at
               FROM notificacion
              WHERE usuario_id = $1 ${soloPendientes ? 'AND leida_at IS NULL' : ''}
              ORDER BY created_at DESC
              LIMIT $2`,
            [usuarioId, limite]
        );
        return rows;
    }) || [];

export const contarPendientes = async (usuarioId) => seguro(async () => {
    const { rows } = await pool.query(
        `SELECT COUNT(*)::int n FROM notificacion WHERE usuario_id = $1 AND leida_at IS NULL`,
        [usuarioId]);
    return rows[0].n;
}) ?? 0;

/** Marca una, o todas si no se indica cuál. */
export const marcarLeidas = async (usuarioId, notificacionId = null) => seguro(async () => {
    const { rows } = await pool.query(
        `UPDATE notificacion SET leida_at = NOW()
          WHERE usuario_id = $1 AND leida_at IS NULL
            AND ($2::uuid IS NULL OR id = $2)
          RETURNING id`,
        [usuarioId, notificacionId]);
    return rows.length;
}) ?? 0;
