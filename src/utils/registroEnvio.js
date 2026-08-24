// ============================================================================
// REGISTRAR EN «ENVIADOS» LO QUE SALE POR FUERA DEL MÓDULO DE CORREO
// ----------------------------------------------------------------------------
// EL PROBLEMA QUE RESUELVE
// Hay dos formas de mandarle un correo masivo a los clientes y cada una llevaba
// su propio registro:
//
//   · CRM → Correo         → escribe en `correo_campana` / `correo_envio`
//   · Comunicaciones → Correo Masivo (el del facturador: recordatorios de pago
//     y reenvío de facturas) → dejaba una línea en la bitácora y nada más
//
// La pantalla de Enviados lee `correo_envio`. Resultado: se mandaban 40
// recordatorios y en Enviados no aparecía ninguno. No es que se perdieran —
// salieron— pero no había dónde verlos, que para el caso es lo mismo.
//
// POR QUÉ UN ARCHIVO APARTE Y NO UNA FUNCIÓN EN `correos.controllers.js`
// Quien necesita esto son los scripts `.mjs` del facturador, y el controlador
// de correos ya importa el mailer, que a su vez vive dentro de esos scripts.
// Importarlo desde allá cerraría el círculo. Acá solo se necesita `pool`.
//
// NUNCA LANZA. Un fallo escribiendo el registro no puede cortar un envío que sí
// está saliendo: se avisa por consola y el correo sigue.
// ============================================================================
import { pool } from '../database/db.js';

/**
 * Abre la cabecera de una tanda. Devuelve el id, o null si no se pudo (y en ese
 * caso `anotarEnvio` simplemente no hace nada).
 */
export const abrirRegistroTanda = async ({
    organizacionId = null, usuarioId = null, asunto, cuerpo = '',
    remitente = 'Simple Pyme', total = 0,
} = {}) => {
    try {
        const { rows } = await pool.query(
            `INSERT INTO correo_campana
                (organizacion_id, asunto, cuerpo, remitente, estado, total, enviado_por, es_prueba)
             VALUES ($1,$2,$3,$4,'enviando',$5,$6,false) RETURNING id`,
            [organizacionId, String(asunto || 'Envío masivo').slice(0, 300), cuerpo,
             String(remitente).slice(0, 220), total, usuarioId]);
        return rows[0].id;
    } catch (e) {
        console.error(`⚠️ [REGISTRO] No se pudo abrir la tanda: ${e.message}`);
        return null;
    }
};

/** Una fila por destinatario, con el resultado ya sabido. */
export const anotarEnvio = async (campanaId, {
    organizacionId = null, empresaId = null, razonSocial = null, destinatario,
    asunto = null, cuerpo = null, estado = 'enviado', motivo = null,
} = {}) => {
    if (!campanaId) return;
    try {
        await pool.query(
            `INSERT INTO correo_envio
                (campana_id, organizacion_id, empresa_id, razon_social, destinatario,
                 asunto_final, cuerpo_final, estado, motivo, enviado_at, es_prueba)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),false)`,
            [campanaId, organizacionId, empresaId, razonSocial,
             String(destinatario || '').slice(0, 320),
             asunto ? String(asunto).slice(0, 300) : null, cuerpo,
             estado, motivo ? String(motivo).slice(0, 500) : null]);
    } catch (e) {
        console.error(`⚠️ [REGISTRO] No se pudo anotar el envío a ${destinatario}: ${e.message}`);
    }
};

/** Cierra la tanda con el resultado. */
export const cerrarRegistroTanda = async (campanaId, { enviados = 0, fallidos = 0 } = {}) => {
    if (!campanaId) return;
    try {
        await pool.query(
            `UPDATE correo_campana
                SET estado = 'terminada', enviados = $2, fallidos = $3, terminada_at = now()
              WHERE id = $1`,
            [campanaId, enviados, fallidos]);
    } catch (e) {
        console.error(`⚠️ [REGISTRO] No se pudo cerrar la tanda: ${e.message}`);
    }
};
