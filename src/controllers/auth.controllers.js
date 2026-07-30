import { pool } from "../database/db.js";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { generateHash, decrypt } from "../utils/crypto.js";
import { rutDesdeCuerpo } from "../lib/rut.js";

const CAMPOS_USUARIO =
    'SELECT id, nombre, rut_encrypted, email_encrypted, rol, clave, activo, organizacion_id FROM usuario';

// ============================================================================
// Cómo se identifica quien entra
// ----------------------------------------------------------------------------
// Regla del negocio: se entra con el **RUT sin dígito verificador** (18358147),
// porque un cliente se sabe su RUT y no el correo corporativo que le asignamos.
// La única excepción es la cuenta master, que entra con su correo — por eso la
// decisión es simple: si el texto trae una arroba es un correo, si no, un RUT.
//
// El RUT se guarda cifrado y se busca por `rut_hash`, que se calcula sobre el
// RUT COMPLETO ("18358147-3"). Como el usuario no escribe el dígito, se calcula
// acá con el módulo 11 y recién ahí se hashea.
//
// Se aceptan además las formas que la gente escribe igual aunque no se pidan:
// con puntos, con guion y con el dígito incluido.
// ============================================================================
const buscarUsuario = async (identificador) => {
    const texto = String(identificador ?? '').trim();
    if (!texto) return null;

    if (texto.includes('@')) {
        const { rows } = await pool.query(
            `${CAMPOS_USUARIO} WHERE email_hash = $1`,
            [generateHash(texto.toLowerCase())]
        );
        return rows[0] || null;
    }

    const limpio = texto.toUpperCase().replace(/[^0-9K]/g, '');
    if (!limpio) return null;

    const candidatos = [
        rutDesdeCuerpo(limpio),                                   // caso normal: falta el dígito
        limpio.length > 1 ? `${limpio.slice(0, -1)}-${limpio.slice(-1)}` : null, // ya venía con dígito
    ];

    for (const rut of candidatos) {
        if (!rut) continue;
        const { rows } = await pool.query(
            `${CAMPOS_USUARIO} WHERE rut_hash = $1`,
            [generateHash(rut)]
        );
        if (rows.length) return rows[0];
    }

    return null;
};

export const loginUser = async (req, res) => {
    const { identificador, email, clave } = req.body;

    try {
        const user = await buscarUsuario(identificador ?? email);

        if (!user) {
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        if (!user.activo) {
            return res.status(403).json({ 
                success: false,
                message: 'Cuenta suspendida por seguridad. Contacte al administrador.' 
            });
        }
        
        const realMatch = await bcrypt.compare(clave, user.clave);

        if (!realMatch) {
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        const companyResult = await pool.query(
            `SELECT e.id, e.razon_social, e.rut_encrypted
             FROM empresa e
             JOIN audita a ON a.empresa_id = e.id
             WHERE a.usuario_id = $1
               AND ($2::uuid IS NULL OR e.organizacion_id = $2)`,
            [user.id, user.organizacion_id || null]
        );

        const assignedCompanies = companyResult.rows.map(co => ({
            id: co.id,
            razonSocial: co.razon_social,
            rut: decrypt(co.rut_encrypted)
        }));

        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24 Horas de validez

        await pool.query(
            `INSERT INTO sessions (session_id, usuario_id, expires_at) VALUES ($1, $2, $3)`,
            [sessionId, user.id, expiresAt]
        );

        // Obtener permisos de módulos si es administrador
        let modulos = null;
        if (user.rol === 'Administrador') {
            const modulosResult = await pool.query(
                `SELECT puede_ver_contabilidad, puede_ver_facturacion, puede_ver_rrhh,
                        puede_ver_operacion_renta, puede_ver_crm, puede_ver_admin
                 FROM admin_modulos
                 WHERE usuario_id = $1`,
                [user.id]
            );
            if (modulosResult.rows.length > 0) {
                modulos = modulosResult.rows[0];
            }
        }

        return res.json({
            id: user.id,
            nombre: user.nombre,
            email: decrypt(user.email_encrypted),
            // El perfil ("Mi Perfil") muestra el RUT; sin esto el campo salía vacío
            // y el usuario creía que no lo tenía registrado.
            rut: decrypt(user.rut_encrypted),
            rol: user.rol,
            assignedCompanies,
            sessionId,
            modulos
        });

    } catch (err) {
        console.error('❌ Error Crítico en Autenticación:', err.message);
        res.status(500).json({ message: 'Error interno en la cámara de seguridad del búnker.' });
    }
};