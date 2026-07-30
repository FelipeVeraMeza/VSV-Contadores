import { pool } from "../database/db.js";
import bcrypt from "bcrypt";
import { generateHash, encrypt, decrypt } from "../utils/crypto.js";
import { cleanRut } from "../lib/rut.js";

export const getUsers = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const page = parseInt(req.query.page) || 0;
        const search = req.query.search ? req.query.search.trim() : ""; 
        const offset = page * limit;

        const searchTerm = `%${search}%`;
        const searchHash = search ? generateHash(cleanRut(search)) : null;

        const query = `
            SELECT 
                u.id, 
                u.nombre, 
                u.rut_encrypted, 
                u.email_encrypted, 
                u.rol, 
                u.activo,
                COALESCE(
                    JSON_AGG(a.empresa_id) FILTER (WHERE a.empresa_id IS NOT NULL), 
                    '[]'
                ) as "assignedCompanies"
            FROM usuario u
            LEFT JOIN audita a ON u.id = a.usuario_id
            WHERE (u.nombre ILIKE $3 OR u.rut_hash = $4)
              -- Aislamiento por tenant: esta consulta no filtraba por organización,
              -- así que un administrador veía (y podía editar) los usuarios de las
              -- demás organizaciones. createUser ya crea dentro de la del que llama.
              AND u.organizacion_id IS NOT DISTINCT FROM $5::uuid
            GROUP BY u.id
            ORDER BY 
                CASE 
                    WHEN u.rol = 'Administrador' THEN 1
                    WHEN u.rol = 'Consultor' THEN 2
                    ELSE 3
                END ASC,
                u.nombre ASC
            LIMIT $1 OFFSET $2
        `;

        const { rows } = await pool.query(query, [
            limit, offset, searchTerm, searchHash, req.user?.organizacionId || null
        ]);

        const decryptedUsers = rows.map(u => ({
            id: u.id,
            nombre: u.nombre,
            rol: u.rol,
            activo: u.activo,
            rut: u.rut_encrypted ? decrypt(u.rut_encrypted) : 'RUT_PROTEGIDO',
            email: u.email_encrypted ? decrypt(u.email_encrypted) : 'EMAIL_PROTEGIDO',
            assignedCompanies: u.assignedCompanies
        }));

        res.json({
            users: decryptedUsers,
            nextPage: rows.length === limit ? page + 1 : null
        });

    } catch (err) {
        console.error("❌ Error Crítico en getUsers:", err.message);
        res.status(500).json({ message: "Error interno al extraer perfiles del búnker." });
    }
};

export const createUser = async (req, res) => {
    const { nombre, rut, clave, email, rol, assignedCompanies, activo } = req.body;

    try {
        await pool.query('BEGIN');

        const rutLimpio = cleanRut(rut); 
        const emailLimpio = email.toLowerCase().trim();

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(clave, saltRounds);

        const rutEncrypted = encrypt(rutLimpio);
        const rutHash = generateHash(rutLimpio);
        
        const emailEncrypted = encrypt(emailLimpio);
        const emailHash = generateHash(emailLimpio);

        const userQuery = `
            INSERT INTO usuario (
                nombre,
                rut_encrypted,
                rut_hash,
                email_encrypted,
                email_hash,
                clave,
                rol,
                activo,
                organizacion_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id, nombre, rol, activo
        `;

        const result = await pool.query(userQuery, [
            nombre.trim(),
            rutEncrypted,
            rutHash,
            emailEncrypted,
            emailHash,
            hashedPassword,
            rol,
            activo ?? true,
            req.user?.organizacionId || null
        ]);

        const newUser = result.rows[0];

        if (assignedCompanies && Array.isArray(assignedCompanies) && assignedCompanies.length > 0) {
            for (const empresaId of assignedCompanies) {
                await pool.query(
                    'INSERT INTO audita (usuario_id, empresa_id) VALUES ($1, $2)', 
                    [newUser.id, empresaId]
                );
            }
        }

        await pool.query('COMMIT');

        res.status(201).json({
            ...newUser,
            rut: rutLimpio,
            email: emailLimpio
        });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error("❌ Error Crítico en createUser:", error.message);

        if (error.code === '23505') {
            return res.status(409).json({ 
                success: false,
                message: "Conflicto de Identidad: El RUT o Email ya se encuentran registrados en el sistema." 
            });
        }

        res.status(500).json({ 
            success: false,
            message: "Fallo de integridad al procesar el registro en el búnker." 
        });
    }
};

/**
 * Registro público (POST /auth/register). Es la ÚNICA vía de alta sin sesión, así
 * que el rol NO puede venir del cuerpo de la petición: se fuerza a 'Cliente'.
 *
 * Antes la ruta llamaba directo a `createUser`, que lee `rol` de `req.body`, y el
 * esquema acepta 'Administrador' como valor válido: cualquiera con acceso a la API
 * podía crearse una cuenta de administrador. Tampoco se permite autoasignarse
 * empresas.
 */
export const registerPublicUser = (req, res) => {
    req.body = { ...req.body, rol: 'Cliente', activo: true, assignedCompanies: [] };
    return createUser(req, res);
};

export const updateUser = async (req, res) => {
    const { id } = req.params;
    const { 
        nombre, 
        rut, 
        email, 
        rol, 
        clave, 
        activo, 
        assignedCompanies = []
    } = req.body;

    try {
        await pool.query('BEGIN');

        const checkUser = await pool.query('SELECT rol FROM usuario WHERE id = $1', [id]);
        
        if (checkUser.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ message: "Usuario no localizado en el registro." });
        }

        if (checkUser.rows[0].rol === 'Administrador') {
            await pool.query('ROLLBACK');
            return res.status(403).json({ 
                message: "Acceso Restringido: Cuentas de nivel Administrador solo modificables vía consola de comandos." 
            });
        }

        const rutLimpio = cleanRut(rut);
        const emailLimpio = email.toLowerCase().trim();

        const rutEncrypted = encrypt(rutLimpio);
        const rutHash = generateHash(rutLimpio);
        const emailEncrypted = encrypt(emailLimpio);
        const emailHash = generateHash(emailLimpio);

        let query = `
            UPDATE usuario 
            SET nombre = $1, 
                rut_encrypted = $2, 
                rut_hash = $3, 
                email_encrypted = $4, 
                email_hash = $5, 
                rol = $6, 
                activo = $7
        `;
        let params = [nombre, rutEncrypted, rutHash, emailEncrypted, emailHash, rol, activo];

        if (clave && clave.trim().length >= 8) {
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(clave, saltRounds);
            query += `, clave = $8 WHERE id = $9`;
            params.push(hashedPassword, id);
        } else {
            query += ` WHERE id = $8`;
            params.push(id);
        }

        await pool.query(query, params);

        await pool.query('DELETE FROM audita WHERE usuario_id = $1', [id]);
        
        if (Array.isArray(assignedCompanies) && assignedCompanies.length > 0) {
            for (const empresaId of assignedCompanies) {
                if (empresaId) {
                    await pool.query(
                        'INSERT INTO audita (usuario_id, empresa_id) VALUES ($1, $2)', 
                        [id, empresaId]
                    );
                }
            }
        }

        await pool.query('COMMIT');

        res.json({ 
            success: true,
            message: "Expediente de usuario actualizado y re-cifrado correctamente." 
        });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error("❌ Error en updateUser:", error.message);

        if (error.code === '23505') {
            return res.status(409).json({ message: "Conflicto: El RUT o Email ya pertenecen a otro usuario." });
        }

        res.status(500).json({ error: "Error interno al actualizar los registros del búnker." });
    }
};

export const updateOwnProfile = async (req, res) => {
    const { id } = req.params;
    const { nombre, rut, email, clave } = req.body;
    const sessionUser = req.user;

    try {
        console.log('🔧 updateOwnProfile - Iniciando');
        console.log('  ID esperado:', sessionUser.usuarioId);
        console.log('  ID recibido:', id);
        console.log('  Datos:', { nombre, email, tieneRut: !!rut, tieneClave: !!clave });

        // Validación: solo puedes actualizar tu propio perfil
        if (sessionUser.usuarioId !== id) {
            console.log('❌ ID no coincide');
            return res.status(403).json({
                success: false,
                message: "Acceso Restringido: Solo puedes actualizar tu propio perfil."
            });
        }

        await pool.query('BEGIN');

        const checkUser = await pool.query('SELECT id FROM usuario WHERE id = $1', [id]);

        if (checkUser.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ success: false, message: "Usuario no encontrado." });
        }

        // Validar que email no esté vacío
        if (!email || !email.trim()) {
            await pool.query('ROLLBACK');
            return res.status(400).json({ success: false, message: "El email es requerido." });
        }

        if (!nombre || !nombre.trim()) {
            await pool.query('ROLLBACK');
            return res.status(400).json({ success: false, message: "El nombre es requerido." });
        }

        const emailLimpio = email.toLowerCase().trim();
        const emailEncrypted = encrypt(emailLimpio);
        const emailHash = generateHash(emailLimpio);

        let query = `UPDATE usuario SET nombre = $1, email_encrypted = $2, email_hash = $3`;
        let params = [nombre.trim(), emailEncrypted, emailHash];

        // RUT es opcional - solo actualiza si se proporciona
        if (rut && rut.trim()) {
            const rutLimpio = cleanRut(rut);
            const rutEncrypted = encrypt(rutLimpio);
            const rutHash = generateHash(rutLimpio);
            query += `, rut_encrypted = $${params.length + 1}, rut_hash = $${params.length + 2}`;
            params.push(rutEncrypted, rutHash);
        }

        // Contraseña es opcional
        let paramIndex = params.length + 1;
        if (clave && clave.trim().length >= 8) {
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(clave, saltRounds);
            query += `, clave = $${paramIndex}`;
            params.push(hashedPassword);
            paramIndex++;
        }

        query += ` WHERE id = $${paramIndex}`;
        params.push(id);

        console.log('📝 Ejecutando query:', query);

        await pool.query(query, params);
        await pool.query('COMMIT');

        console.log('✅ Perfil actualizado correctamente');

        res.json({
            success: true,
            message: "Perfil actualizado correctamente."
        });

    } catch (error) {
        try {
            await pool.query('ROLLBACK');
        } catch (rollbackError) {
            console.error("⚠️ Error en ROLLBACK:", rollbackError.message);
        }

        console.error("❌ Error en updateOwnProfile:", error.message);
        console.error("📍 Stack:", error.stack);

        if (error.code === '23505') {
            return res.status(409).json({
                success: false,
                message: "Conflicto: El RUT o Email ya pertenecen a otro usuario."
            });
        }

        res.status(500).json({
            success: false,
            error: "Error interno al actualizar el perfil.",
            details: error.message
        });
    }
};

export const deleteUser = async (req, res) => {
    const { id } = req.params;

    try {
        await pool.query('BEGIN');

        const checkUser = await pool.query('SELECT rol, nombre FROM usuario WHERE id = $1', [id]);
        
        if (checkUser.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ success: false, message: "Usuario no encontrado." });
        }

        const userToDelete = checkUser.rows[0];

        if (userToDelete.rol === 'Administrador') {
            await pool.query('ROLLBACK');
            return res.status(403).json({ 
                success: false,
                message: "Acceso Denegado: Los registros de Administrador son permanentes en este nivel." 
            });
        }

        await pool.query('DELETE FROM sessions WHERE usuario_id = $1', [id]);
        await pool.query('DELETE FROM audita WHERE usuario_id = $1', [id]);

        await pool.query('DELETE FROM usuario WHERE id = $1', [id]);

        await pool.query('COMMIT');

        return res.status(200).json({ 
            success: true, 
            message: `El perfil de ${userToDelete.nombre} ha sido purgado del búnker.` 
        });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error("❌ Error en deleteUser:", error.message);
        
        return res.status(500).json({ 
            success: false, 
            message: "Fallo de integridad al intentar eliminar el registro." 
        });
    }
};