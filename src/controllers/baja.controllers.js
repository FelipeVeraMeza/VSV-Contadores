// ============================================================================
// DESUSCRIPCIÓN · lo que pasa cuando un cliente pulsa «cancelar suscripción»
// ----------------------------------------------------------------------------
// Es la contraparte pública del enlace que va al pie de cada correo. No pide
// sesión: quien lo usa es un cliente sin cuenta en el sistema.
//
// TRES DECISIONES
//
// 1. El token va FIRMADO. Sin la firma no se puede dar de baja a una dirección
//    arbitraria cambiándola en la URL.
// 2. Ver y confirmar están separados (GET / POST). Los antivirus y algunos
//    clientes de correo pre-visitan los enlaces para revisarlos; con un GET que
//    diera de baja, el cliente quedaría desuscrito sin haber pulsado nada.
// 3. Darse de baja SIEMPRE responde bien, aunque ya estuviera de baja o el
//    token fuera viejo. Decirle «no estabas suscrito» a alguien que quiere irse
//    es discutir con el cliente por un detalle técnico.
// ============================================================================
import { pool } from '../database/db.js';
import { leerTokenBaja } from './correos.controllers.js';

// Se muestra parcialmente: j***z@gmail.com. Si la página mostrara el correo
// completo, cualquiera con el enlace sabría a quién pertenece.
const ofuscar = (correo) => {
    const [u, d] = String(correo).split('@');
    if (!d) return '—';
    const visible = u.length <= 2 ? u[0] : `${u[0]}${'*'.repeat(Math.min(u.length - 2, 6))}${u[u.length - 1]}`;
    return `${visible}@${d}`;
};

export const verBaja = async (req, res) => {
    const datos = leerTokenBaja(req.query.t);
    if (!datos) {
        return res.status(400).json({ success: false, message: 'El enlace no es válido o está incompleto.' });
    }
    try {
        const { rows } = await pool.query(
            `SELECT 1 FROM correo_baja
              WHERE lower(correo) = lower($1) AND organizacion_id IS NOT DISTINCT FROM $2::uuid`,
            [datos.correo, datos.org]);
        return res.json({
            success: true,
            correo: ofuscar(datos.correo),
            yaDeBaja: rows.length > 0,
        });
    } catch (error) {
        console.error('❌ Error consultando la baja:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo procesar. Intenta más tarde.' });
    }
};

export const confirmarBaja = async (req, res) => {
    const datos = leerTokenBaja(req.body?.t || req.query.t);
    if (!datos) {
        return res.status(400).json({ success: false, message: 'El enlace no es válido o está incompleto.' });
    }
    try {
        await pool.query(
            `INSERT INTO correo_baja (organizacion_id, correo, motivo, origen)
             VALUES ($1, lower($2), $3, 'enlace')
             ON CONFLICT (organizacion_id, lower(correo)) DO NOTHING`,
            [datos.org, datos.correo, String(req.body?.motivo || '').slice(0, 300) || null]);

        console.log(`📭 [BAJA] ${ofuscar(datos.correo)} pidió no recibir más correos.`);
        return res.json({
            success: true,
            message: 'Listo. No volverás a recibir correos de este tipo.',
        });
    } catch (error) {
        console.error('❌ Error registrando la baja:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo procesar. Intenta más tarde.' });
    }
};
