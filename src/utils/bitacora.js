// ============================================================================
// BITÁCORA: quién hizo qué y cuándo
// ----------------------------------------------------------------------------
// Nace de dos preguntas que el 30-jul no se pudieron responder:
//   · "¿a quién se le mandó el recordatorio de pago?"  → solo lo sabía una
//     terminal abierta, y el proceso ya había terminado.
//   · "¿por qué faltó JL MONTERO?"  → hubo que deducirlo restando montos.
//
// Reglas de uso:
//   1. Registrar NUNCA debe voltear la operación. Si la bitácora falla, se
//      avisa por consola y la acción sigue. Es un registro, no una validación.
//   2. Se copia el NOMBRE del usuario, no solo su id: si mañana se borra la
//      cuenta, el registro tiene que seguir diciendo quién fue.
//   3. Nada de claves ni datos sensibles en `detalle`.
// ============================================================================
import { pool } from '../database/db.js';

/**
 * Deja constancia de una acción.
 *
 * @param {object} req        La petición, para sacar al usuario. Puede ser null.
 * @param {object} evento
 * @param {string} evento.modulo       facturacion | correos | cobros | empresas | usuarios
 * @param {string} evento.accion       emitir | enviar | eliminar | cambiar_estado | ...
 * @param {string} [evento.entidad]    documento | empresa | usuario | cobro | correo
 * @param {string} [evento.entidadId]
 * @param {string} [evento.descripcion] Legible por una persona, sin tecnicismos.
 * @param {string} [evento.resultado]  ok | error | parcial
 * @param {object} [evento.detalle]    Extra en JSON (folios, montos, conteos).
 */
export const registrar = async (req, { modulo, accion, entidad = null, entidadId = null, descripcion = null, resultado = 'ok', detalle = null }) => {
    try {
        await pool.query(
            `INSERT INTO bitacora_sistema
                (usuario_id, usuario_nombre, usuario_rol, organizacion_id,
                 modulo, accion, entidad, entidad_id, descripcion, resultado, detalle)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
                req?.user?.usuarioId || null,
                req?.user?.nombre || null,
                req?.user?.rol || null,
                req?.user?.organizacionId || null,
                modulo,
                accion,
                entidad,
                entidadId != null ? String(entidadId) : null,
                descripcion,
                resultado,
                detalle ? JSON.stringify(detalle) : null,
            ]
        );
    } catch (err) {
        // A propósito: la bitácora nunca voltea lo que se estaba haciendo.
        console.warn(`⚠️  No se pudo registrar en la bitácora (${modulo}/${accion}): ${err.message}`);
    }
};

/**
 * Variante para procesos en segundo plano, que no tienen `req` pero sí saben
 * quién los disparó (los envíos masivos corren después de responder al
 * navegador).
 */
export const registrarComo = (usuario) => (evento) =>
    registrar({ user: usuario }, evento);
