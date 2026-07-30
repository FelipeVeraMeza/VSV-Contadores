import { pool } from "../database/db.js";
import { encrypt, decrypt, generateHash } from "../utils/crypto.js";
import { cleanRut } from "../lib/rut.js";

export const getAssignedCompanies = async (req, res) => {
    try {
        const usuarioId = req.user.usuarioId;
        const organizacionId = req.user?.organizacionId || null;

        const result = await pool.query(
            `SELECT e.id, e.razon_social, e.rut_encrypted, s.ciudad
             FROM empresa e
             JOIN audita a ON e.id = a.empresa_id
             JOIN sucursal s ON e.id = s.empresa_id
             AND s.es_casa_matriz = TRUE
             WHERE a.usuario_id = $1
               AND ($2::uuid IS NULL OR e.organizacion_id = $2)`,
            [usuarioId, organizacionId]
        );

        const companies = result.rows.map(co => ({
            id: co.id,
            razonSocial: co.razon_social,
            rut: co.rut_encrypted ? decrypt(co.rut_encrypted) : 'RUT no disponible',
            ciudad: co.ciudad || 'Sin ubicación'
        }));

        res.json(companies);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener asignaciones" });
    }
};

// ============================================================================
// LISTA CANÓNICA DE EMPRESAS DE LA ORGANIZACIÓN
// ----------------------------------------------------------------------------
// Fuente ÚNICA para todo selector de empresa del sistema (header, RRHH,
// contabilidad, modales). Antes cada módulo armaba su propia lista y cada una
// devolvía un conjunto distinto:
//   /clientes/crm            → solo cartera vigente (excluía la empresa principal)
//   /companies               → paginada de a 10
//   /personas/empresas-lista → cortada a 50
// Por eso la empresa principal "no aparecía" en unos lados y sí en otros.
//
// Reglas: siempre acotado a la organización del usuario; el rol Cliente solo ve
// las empresas que tiene asignadas en `audita`; la principal va primero.
// ============================================================================
export const listCompaniesLista = async (req, res) => {
    try {
        const organizacionId = req.user?.organizacionId || null;
        const esCliente = req.user?.rol === 'Cliente';

        const params = [organizacionId];
        let auditaJoin = '';
        if (esCliente && req.user?.usuarioId) {
            params.push(req.user.usuarioId);
            auditaJoin = ` JOIN audita a ON a.empresa_id = e.id AND a.usuario_id = $${params.length} `;
        }

        // Solo empresas ACTIVAS en cartera. El selector traía las 217, incluidas las
        // 83 de baja y las inactivas, y encontrar una era imposible.
        //
        // La empresa principal se incluye SIEMPRE, aunque esté marcada
        // en_cartera=false y activo=false: es la firma, no un cliente de la cartera,
        // y lleva su propio libro de compras y ventas. Sin esta excepción el
        // administrador perdía acceso a la contabilidad de su propia oficina.
        const { rows } = await pool.query(
            `SELECT DISTINCT e.id, e.razon_social, e.es_principal, e.en_cartera, e.activo
             FROM empresa e
             ${auditaJoin}
             WHERE e.organizacion_id IS NOT DISTINCT FROM $1::uuid
               AND (e.es_principal = true
                    OR (e.en_cartera IS NOT FALSE AND e.activo IS NOT FALSE))
             ORDER BY e.es_principal DESC, e.razon_social ASC`,
            params
        );

        return res.status(200).json({
            success: true,
            empresas: rows.map(e => ({
                id: e.id,
                razonSocial: e.razon_social,
                esPrincipal: e.es_principal === true,
                enCartera: e.en_cartera !== false,
                activo: e.activo !== false,
            })),
        });
    } catch (error) {
        console.error('❌ listCompaniesLista:', error.message);
        return res.status(500).json({ success: false, message: 'Error al listar las empresas de la organización' });
    }
};

export const getCompanies = async (req, res) => {
    try {
        const { usuarioId, search, page = 0, limit = 10 } = req.query;
        const offset = parseInt(page) * parseInt(limit);

        let queryParams = [];
        let whereClauses = [];

        let query = `
            SELECT 
                e.id, e.razon_social, e.rut_encrypted, e.giro,
                e.telefono_corporativo, e.email_corporativo, e.activo,
                s.direccion, s.comuna, s.ciudad,
                COUNT(*) OVER() as total_count
            FROM empresa e
            LEFT JOIN sucursal s ON e.id = s.empresa_id AND s.es_casa_matriz = TRUE
        `;

        if (usuarioId && usuarioId !== 'undefined' && usuarioId !== 'null') {
            query += ` JOIN audita a ON a.empresa_id = e.id `;
            whereClauses.push(`a.usuario_id = $${queryParams.length + 1}`);
            queryParams.push(usuarioId);
        }

        // Filtro de organización (aislamiento entre dueños)
        const organizacionId = req.user?.organizacionId || null;
        if (organizacionId) {
            whereClauses.push(`e.organizacion_id = $${queryParams.length + 1}`);
            queryParams.push(organizacionId);
        }

        if (search && search.trim() !== '') {
            const searchTerm = search.trim();
            const rutLimpio = cleanRut(searchTerm);
            const searchHash = generateHash(rutLimpio); 

            const ilikeTerm = `%${searchTerm}%`;
            const idxNombre = queryParams.length + 1;
            const idxHash = queryParams.length + 2;

            whereClauses.push(`(e.razon_social ILIKE $${idxNombre} OR e.rut_hash = $${idxHash})`);
            queryParams.push(ilikeTerm);
            queryParams.push(searchHash);
        }

        if (whereClauses.length > 0) {
            query += ` WHERE ` + whereClauses.join(' AND ');
        }

        query += ` ORDER BY e.razon_social ASC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
        queryParams.push(parseInt(limit));
        queryParams.push(offset);

        const { rows } = await pool.query(query, queryParams);

        const companies = rows.map(co => ({
            id: co.id,
            razonSocial: co.razon_social,
            rut: decrypt(co.rut_encrypted),
            giro: co.giro || 'No especificado',
            telefonoCorporativo: co.telefono_corporativo || 'Sin registro',
            emailCorporativo: co.email_corporativo || 'Sin registro',
            direccion: co.direccion || 'Sin dirección',
            comuna: co.comuna || '',
            ciudad: co.ciudad || '',
            activo: co.activo || false
        }));

        const totalCount = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
        const hasNextPage = offset + rows.length < totalCount;

        return res.json({
            companies,
            nextPage: hasNextPage ? parseInt(page) + 1 : null,
            totalCount
        });

    } catch (err) {
        console.error('❌ Error Crítico en getCompanies:', err.message);
        res.status(500).json({ 
            success: false,
            message: 'Error de extracción en el búnker de datos.',
            details: err.message 
        });
    }
};

export const getCompanyById = async (req, res) => {
    try {
        const { id } = req.params;

        const query = `
            SELECT 
                e.id, e.razon_social, e.rut_encrypted, e.giro, e.regimen_tributario,
                e.telefono_corporativo, e.email_corporativo, e.nombre_rep, e.rut_rep_encrypted,
                e.activo,
                s.direccion, s.comuna, s.ciudad, s.telefono_sucursal,
                ec.sii_rut_encrypted, ec.sii_email_encrypted, ec.sii_password_encrypted
            FROM empresa e
            LEFT JOIN sucursal s ON e.id = s.empresa_id AND s.es_casa_matriz = TRUE
            LEFT JOIN empresa_credenciales ec ON e.id = ec.empresa_id
            WHERE e.id = $1
        `;

        const { rows } = await pool.query(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: "La entidad solicitada no existe en los registros maestros." 
            });
        }

        const co = rows[0];

        const fullExpediente = {
            id: co.id,
            razonSocial: co.razon_social,
            rut: co.rut_encrypted ? decrypt(co.rut_encrypted) : '',
            giro: co.giro,
            regimenTributario: co.regimen_tributario,
            activo: co.activo,
            direccion: co.direccion || '',
            comuna: co.comuna || '',
            ciudad: co.ciudad || '',
            telefonoCorporativo: co.telefono_corporativo || co.telefono_sucursal || '',
            emailCorporativo: co.email_corporativo || '',
            siiRut: co.sii_rut_encrypted ? decrypt(co.sii_rut_encrypted) : '',
            siiEmail: co.sii_email_encrypted ? decrypt(co.sii_email_encrypted) : '',
            siiPassword: co.sii_password_encrypted ? decrypt(co.sii_password_encrypted) : '',
            nombreRep: co.nombre_rep || '',
            rutRep: co.rut_rep_encrypted ? decrypt(co.rut_rep_encrypted) : ''
        };

        return res.json(fullExpediente);

    } catch (err) {
        console.error("❌ Error Crítico en getCompanyById:", err.message);
        return res.status(500).json({ 
            success: false,
            message: "Fallo en la extracción de datos. Error interno de búnker.",
            details: process.env.NODE_ENV === 'development' ? err.message : null 
        });
    }
};

export const createCompany = async (req, res) => {
    const { 
        razonSocial, rut, giro, regimenTributario,
        telefonoCorporativo, emailCorporativo,
        siiRut, siiEmail, siiPassword,
        direccion, comuna, ciudad,
        nombreRep, rutRep,
        usuarioId
    } = req.body;

    try {
        await pool.query('BEGIN');

        const rutStandard = cleanRut(rut);
        const rutHash = generateHash(rutStandard);
        const rutEncrypted = encrypt(rutStandard);

        const rutRepLimpio = rutRep ? cleanRut(rutRep) : null;
        const rutRepHash = rutRepLimpio ? generateHash(rutRepLimpio) : null;
        const rutRepEnc = rutRepLimpio ? encrypt(rutRepLimpio) : null;

        const companyQuery = `
            INSERT INTO empresa (
                razon_social, rut_encrypted, rut_hash, giro,
                regimen_tributario, telefono_corporativo, email_corporativo,
                nombre_rep, rut_rep_encrypted, rut_rep_hash, organizacion_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id
        `;

        const companyRes = await pool.query(companyQuery, [
            razonSocial.trim(),
            rutEncrypted,
            rutHash,
            giro,
            regimenTributario,
            telefonoCorporativo,
            emailCorporativo,
            nombreRep ? nombreRep.trim() : null,
            rutRepEnc,
            rutRepHash,
            req.user?.organizacionId || null
        ]);
        
        const newEmpresaId = companyRes.rows[0].id;

        await pool.query(
            `INSERT INTO empresa_credenciales (empresa_id, sii_rut_encrypted, sii_email_encrypted, sii_password_encrypted) 
             VALUES ($1, $2, $3, $4)`,
            [newEmpresaId, encrypt(cleanRut(siiRut)), encrypt(siiEmail), encrypt(siiPassword)]
        );

        await pool.query(
            `INSERT INTO sucursal (empresa_id, direccion, comuna, ciudad, es_casa_matriz) 
             VALUES ($1, $2, $3, $4, TRUE)`,
            [newEmpresaId, direccion, comuna, ciudad]
        );

        if (usuarioId) {
            await pool.query(
                'INSERT INTO audita (usuario_id, empresa_id) VALUES ($1, $2)', 
                [usuarioId, newEmpresaId]
            );
        }

        await pool.query('COMMIT');

        res.status(201).json({
            id: newEmpresaId,
            razonSocial,
            success: true,
            message: "Entidad registrada con éxito."
        });

    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('❌ Fallo Crítico en Registro:', err.message);

        if (err.code === '23505') {
            return res.status(409).json({ message: 'El RUT ya existe en los registros maestros.' });
        }

        res.status(500).json({ message: 'Error de integridad al registrar en el búnker.' });
    }
};

export const updateCompany = async (req, res) => {
    const { id } = req.params;
    const { 
        razonSocial, rut, giro, regimenTributario, 
        telefonoCorporativo, emailCorporativo, activo,
        siiRut, siiEmail, siiPassword,
        direccion, comuna, ciudad,
        nombreRep, rutRep
    } = req.body;

    try {
        await pool.query('BEGIN');

        const rutLimpio = cleanRut(rut);
        const rutHash = generateHash(rutLimpio);
        const rutEncrypted = encrypt(rutLimpio);

        const rutRepLimpio = rutRep ? cleanRut(rutRep) : null;
        const rutRepHash = rutRepLimpio ? generateHash(rutRepLimpio) : null;
        const rutRepEnc = rutRepLimpio ? encrypt(rutRepLimpio) : null;

        const updateCompanyQuery = `
            UPDATE empresa SET 
                razon_social = $1, 
                rut_encrypted = $2, 
                rut_hash = $3, 
                giro = $4, 
                regimen_tributario = $5, 
                telefono_corporativo = $6, 
                email_corporativo = $7, 
                activo = $8,
                nombre_rep = $9, 
                rut_rep_encrypted = $10, 
                rut_rep_hash = $11,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $12
        `;
        
        await pool.query(updateCompanyQuery, [
            razonSocial.trim(), 
            rutEncrypted, 
            rutHash, 
            giro, 
            regimenTributario, 
            telefonoCorporativo, 
            emailCorporativo, 
            activo,
            nombreRep ? nombreRep.trim() : null,
            rutRepEnc,
            rutRepHash,
            id
        ]);

        if (siiPassword && siiPassword.trim() !== "") {
            await pool.query(
                `UPDATE empresa_credenciales 
                 SET sii_rut_encrypted = $1,
                     sii_email_encrypted = $2, 
                     sii_password_encrypted = $3, 
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE empresa_id = $4`,
                [encrypt(cleanRut(siiRut)), encrypt(siiEmail), encrypt(siiPassword), id]
            );
        } else {
            await pool.query(
                `UPDATE empresa_credenciales 
                 SET sii_rut_encrypted = $1,
                     sii_email_encrypted = $2, 
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE empresa_id = $3`,
                [encrypt(cleanRut(siiRut)), encrypt(siiEmail), id]
            );
        }

        await pool.query(
            `UPDATE sucursal 
             SET direccion = $1, comuna = $2, ciudad = $3, 
                 updated_at = CURRENT_TIMESTAMP
             WHERE empresa_id = $4 AND es_casa_matriz = TRUE`,
            [direccion, comuna, ciudad, id]
        );

        await pool.query('COMMIT');
        
        res.json({ 
            success: true, 
            message: "La entidad y sus 4 dimensiones de datos han sido actualizadas correctamente." 
        });

    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('❌ Error crítico en updateCompany:', err.message);
        
        if (err.code === '23505') {
            return res.status(409).json({ 
                message: 'Conflicto de Seguridad: El RUT ingresado ya está vinculado a otra entidad.' 
            });
        }
        
        res.status(500).json({ 
            message: 'Error de integridad al procesar la actualización.',
            details: err.message 
        });
    }
};

export const deleteCompany = async (req, res) => {
    const { id } = req.params;

    try {
        await pool.query('BEGIN');
        const result = await pool.query('DELETE FROM empresa WHERE id = $1', [id]);

        if (result.rowCount === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ 
                success: false, 
                message: "El ID de entidad no existe." 
            });
        }

        await pool.query('COMMIT');
        res.json({ 
            success: true, 
            message: "La empresa ha sido purgada exitosamente." 
        });

    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('❌ Error crítico en la purga:', err.message);
        res.status(500).json({ 
            success: false, 
            message: "Fallo al intentar eliminar el registro.",
            details: err.message 
        });
    }
};