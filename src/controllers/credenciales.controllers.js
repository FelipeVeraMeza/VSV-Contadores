import { pool } from '../database/db.js';
import { encrypt, decrypt } from '../utils/crypto.js';

// ¿Esta cuenta es la que hoy factura con las credenciales del sistema (.env)?
//
// No existe una marca de "cuenta master" en la base: los roles son solo
// Administrador / Consultor / Cliente. Pero sí hay una señal fiable: los robots
// entran al SII con `DTE_RUT` del .env, así que la cuenta cuyo RUT coincide con
// esa variable ES la cuenta del sistema.
//
// Se calcula en vez de escribirla a mano para que, si mañana cambian el .env a
// otro RUT, la aplicación siga sola sin que haya que tocar código.
const esCuentaDelSistema = async (usuarioId) => {
    const rutSistema = String(process.env.DTE_RUT || '').replace(/[^0-9kK]/g, '');
    if (!rutSistema) return false;

    const { rows } = await pool.query('SELECT rut_encrypted FROM usuario WHERE id = $1', [usuarioId]);
    if (!rows.length) return false;

    const rutUsuario = String(decrypt(rows[0].rut_encrypted) || '')
        .split('-')[0]
        .replace(/[^0-9kK]/g, '');

    return !!rutUsuario && rutUsuario === rutSistema;
};

// ============================================================================
// CREDENCIAL GLOBAL DEL USUARIO (para facturar)
// Cada usuario (admin o cliente) tiene su propio set de 5 credenciales,
// independiente de la empresa seleccionada. Se guardan encriptadas.
// Reemplazan las variables del .env (DTE_RUT, DTE_DV, DTE_PASS, SII_PFX_PASS, DTE_CIUDAD).
// ============================================================================

// Helper reutilizable: credenciales desencriptadas de un usuario (para los scripts de facturación).
export const obtenerCredencialGlobal = async (usuarioId) => {
    if (!usuarioId) return null;
    const { rows } = await pool.query(
        `SELECT dte_rut_encrypted, dte_dv, dte_pass_encrypted, pfx_pass_encrypted, ciudad
         FROM credencial_global WHERE usuario_id = $1`,
        [usuarioId]
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
        DTE_RUT: r.dte_rut_encrypted ? decrypt(r.dte_rut_encrypted) : '',
        DTE_DV: r.dte_dv || '',
        DTE_PASS: r.dte_pass_encrypted ? decrypt(r.dte_pass_encrypted) : '',
        SII_PFX_PASS: r.pfx_pass_encrypted ? decrypt(r.pfx_pass_encrypted) : '',
        DTE_CIUDAD: r.ciudad || ''
    };
};

// GET: credencial global del usuario logueado (para mostrar/editar)
export const getCredencialGlobal = async (req, res) => {
    try {
        const usuarioId = req.user?.usuarioId;
        if (!usuarioId) return res.status(401).json({ success: false, message: 'Sesión inválida.' });

        const { rows } = await pool.query(
            `SELECT dte_rut_encrypted, dte_dv, dte_pass_encrypted, pfx_pass_encrypted, ciudad
             FROM credencial_global WHERE usuario_id = $1`,
            [usuarioId]
        );

        const r = rows[0] || {};
        const dteRut = r.dte_rut_encrypted ? decrypt(r.dte_rut_encrypted) : '';
        const dtePass = r.dte_pass_encrypted ? decrypt(r.dte_pass_encrypted) : '';
        const pfxPass = r.pfx_pass_encrypted ? decrypt(r.pfx_pass_encrypted) : '';

        return res.json({
            success: true,
            dteRut: dteRut || '',
            dteDv: r.dte_dv || '',
            dtePass: dtePass || '',
            pfxPass: pfxPass || '',
            ciudad: r.ciudad || 'Santiago',
            tieneCredenciales: !!(dteRut && dtePass),
            // La pantalla lo usa para no invitar a cambiar las credenciales con
            // las que hoy factura todo el sistema.
            esCuentaDelSistema: await esCuentaDelSistema(usuarioId)
        });
    } catch (err) {
        console.error('❌ Error obteniendo credencial global:', err.message);
        return res.status(500).json({ success: false, message: 'Error al obtener las credenciales.' });
    }
};

// PUT: guarda/actualiza la credencial global del usuario. Solo actualiza lo que venga.
export const saveCredencialGlobal = async (req, res) => {
    try {
        const usuarioId = req.user?.usuarioId;
        if (!usuarioId) return res.status(401).json({ success: false, message: 'Sesión inválida.' });

        const { dteRut, dteDv, dtePass, pfxPass, ciudad } = req.body;

        // El RUT y el DV son campos separados: el RUT es solo el cuerpo (sin DV).
        const rutBody = dteRut !== undefined ? String(dteRut).replace(/[.\s]/g, '').trim() : '';
        const rutEnc = rutBody !== '' ? encrypt(rutBody) : null;
        const passEnc = (dtePass !== undefined && String(dtePass).trim() !== '') ? encrypt(String(dtePass)) : null;
        const pfxEnc = (pfxPass !== undefined && String(pfxPass).trim() !== '') ? encrypt(String(pfxPass)) : null;
        const dv = (dteDv !== undefined && String(dteDv).trim() !== '') ? String(dteDv).trim() : null;
        const city = (ciudad !== undefined && String(ciudad).trim() !== '') ? String(ciudad).trim() : null;

        await pool.query(
            `INSERT INTO credencial_global
                (usuario_id, dte_rut_encrypted, dte_dv, dte_pass_encrypted, pfx_pass_encrypted, ciudad)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (usuario_id) DO UPDATE SET
                dte_rut_encrypted  = COALESCE($2, credencial_global.dte_rut_encrypted),
                dte_dv             = COALESCE($3, credencial_global.dte_dv),
                dte_pass_encrypted = COALESCE($4, credencial_global.dte_pass_encrypted),
                pfx_pass_encrypted = COALESCE($5, credencial_global.pfx_pass_encrypted),
                ciudad             = COALESCE($6, credencial_global.ciudad),
                updated_at = NOW()`,
            [usuarioId, rutEnc, dv, passEnc, pfxEnc, city]
        );

        return res.json({ success: true, message: 'Credenciales guardadas correctamente.' });
    } catch (err) {
        console.error('❌ Error guardando credencial global:', err.message);
        return res.status(500).json({ success: false, message: 'Error al guardar las credenciales.' });
    }
};
