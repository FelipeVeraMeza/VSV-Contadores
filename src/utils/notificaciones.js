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
import { enviarCorreo, correoConfigurado } from './mailer.js';
import { decrypt } from './crypto.js';

const seguro = async (fn) => {
    try { return await fn(); }
    catch (err) { console.warn(`⚠️  No se pudo crear la notificación: ${err.message}`); return null; }
};

// ----------------------------------------------------------------------------
// AVISO POR CORREO (además del aviso in-app)
// ----------------------------------------------------------------------------
// Solo estos tipos mandan correo; el resto se queda solo dentro del sistema.
// Se puede apagar del todo con AVISOS_EMAIL=off sin tocar el código.
// QUÉ SALE POR CORREO Y QUÉ NO. Todo aviso aparece en la campana; solo estos
// tipos, además, van al correo. La regla es "¿se lo perdería si no abre el
// sistema hoy?": una reunión agendada para el jueves sí; que alguien acabe de
// entrar a una sala, no —para cuando lea el correo la llamada terminó—.
//
// Por eso de reuniones solo está `reunion_agendada`. Una sala abierta al tiro,
// sumar a alguien a una llamada en curso o avisar que empezó son cosas del
// momento: van por la campana, que llega en vivo. Mandar un correo por cada una
// es como se arruina una bandeja de entrada.
const TIPOS_CON_CORREO = new Set([
    'tarea_asignada', 'tarea_comentada', 'agregado_a_proyecto',
    'reunion_agendada',
]);

// De qué módulo es el aviso, para que el correo no diga "Tareas" cuando habla
// de una reunión.
const SECCION_POR_TIPO = (tipo) => (String(tipo || '').startsWith('reunion') ? 'Reuniones' : 'Tareas');

const escapar = (s) => String(s || '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const plantillaCorreo = ({ titulo, descripcion, seccion = 'Tareas' }) => `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
    <div style="background:#199b4d;color:#fff;padding:18px 24px;border-radius:12px 12px 0 0">
      <h2 style="margin:0;font-size:16px;letter-spacing:.5px">VSV · ${escapar(seccion)}</h2>
    </div>
    <div style="border:1px solid #e5ddd0;border-top:none;border-radius:0 0 12px 12px;padding:24px">
      <p style="font-size:15px;font-weight:bold;margin:0 0 8px">${escapar(titulo)}</p>
      ${descripcion ? `<p style="font-size:13px;color:#475569;margin:0 0 16px;white-space:pre-wrap">${escapar(descripcion)}</p>` : ''}
      <p style="font-size:12px;color:#94a3b8;margin:16px 0 0">
        Entra a la plataforma, sección <b>${escapar(seccion)}</b>, para verlo y responder.
      </p>
    </div>
    <p style="font-size:11px;color:#cbd5e1;text-align:center;margin:12px 0">
      Aviso automático de VSV. No respondas a este correo.
    </p>
  </div>`;

// Manda el aviso también por correo. Best-effort: si falla, se anota y se sigue.
// Se llama SIN await para no demorar la respuesta de la acción que lo disparó,
// y nunca lanza (misma regla que el resto: notificar no puede voltear la acción).
const avisarPorCorreo = async (usuarioId, { tipo, titulo, descripcion }) => {
    if (process.env.AVISOS_EMAIL === 'off') return;
    if (!usuarioId || !TIPOS_CON_CORREO.has(tipo)) return;
    if (!correoConfigurado()) return;
    try {
        const { rows } = await pool.query(
            'SELECT email_encrypted FROM usuario WHERE id = $1 AND activo = true', [usuarioId]);
        const enc = rows[0]?.email_encrypted;
        if (!enc) return;
        let correo = null;
        try { correo = decrypt(enc); } catch { return; }
        if (!correo || !correo.includes('@')) return;

        await enviarCorreo({
            to: correo.trim(), subject: titulo,
            html: plantillaCorreo({ titulo, descripcion, seccion: SECCION_POR_TIPO(tipo) }),
        });
    } catch (err) {
        console.warn(`⚠️  No se pudo enviar el correo de aviso a ${usuarioId}: ${err.message}`);
    }
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
        // Y por correo, sin esperar (no debe demorar la respuesta de la acción).
        avisarPorCorreo(para, { tipo, titulo, descripcion });
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
