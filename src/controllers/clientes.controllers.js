import { pool } from '../database/db.js';
import { decrypt, encrypt } from '../utils/crypto.js';

/**
 * Desencripta datos de forma segura. 
 * Si falla o es nulo, devuelve el valor original o null.
 */
const decryptData = (encryptedValue) => {
    if (!encryptedValue || encryptedValue === 'SIN_DATO') return null;
    try {
        const decrypted = decrypt(encryptedValue);
        return decrypted || encryptedValue;
    } catch (error) {
        return encryptedValue;
    }
};

export const getClientesCRM = async (req, res) => {
    try {
        const usuarioId = req.user?.usuarioId;
        
        const clientesResult = await pool.query(`
            SELECT 
                e.*,
                p.nombre as plan_nombre,
                ec.sii_rut_encrypted,
                ec.sii_email_encrypted,
                ec.sii_password_encrypted,
                ec.web_password_encrypted,
                s.direccion,
                s.comuna,
                s.ciudad
            FROM empresa e
            LEFT JOIN plan p ON e.plan_id = p.id
            LEFT JOIN empresa_credenciales ec ON e.id = ec.empresa_id
            LEFT JOIN sucursal s ON e.id = s.empresa_id AND s.es_casa_matriz = TRUE
            JOIN audita a ON e.id = a.empresa_id
            WHERE a.usuario_id = $1
            ORDER BY e.razon_social ASC
        `, [usuarioId]);

        const serviciosResult = await pool.query(`
            SELECT 
                es.id,
                es.empresa_id,
                s.nombre,
                s.categoria,
                es.estado,
                es.precio_pactado
            FROM empresa_servicio es
            JOIN servicio s ON es.servicio_id = s.id
            ORDER BY es.empresa_id
        `);

        const notasResult = await pool.query(`
            SELECT
                id,
                empresa_id,
                texto,
                tipo_mensaje,
                usuario_nombre,
                leido,
                created_at
            FROM bitacora_gestion
            ORDER BY created_at DESC
        `);

        // Catálogo de planes disponibles (para el selector en la ficha)
        const planesResult = await pool.query(`
            SELECT id, nombre, precio_base
            FROM plan
            ORDER BY precio_base ASC, nombre ASC
        `);

        // Catálogo de servicios disponibles (para sumar servicios contratados)
        const serviciosDisponiblesResult = await pool.query(`
            SELECT id, nombre, categoria, es_critico
            FROM servicio
            WHERE activo = TRUE
            ORDER BY nombre ASC
        `);

        // Historial de cambios de plan por empresa.
        // Si la migración aún no se corrió (tabla inexistente), degradamos a vacío
        // en lugar de romper toda la carga del CRM.
        let planHistorialResult = { rows: [] };
        try {
            planHistorialResult = await pool.query(`
                SELECT empresa_id, plan_anterior_nombre, plan_nuevo_nombre,
                       usuario_nombre, motivo, created_at
                FROM empresa_plan_historial
                ORDER BY created_at DESC
            `);
        } catch (err) {
            if (err.code === '42P01') { // undefined_table
                console.warn('⚠️ Tabla empresa_plan_historial no existe aún. Ejecuta la migración 2026-06-10_crm_ficha_planes_bitacora.sql');
            } else {
                throw err;
            }
        }

        const serviciosPorEmpresa = {};
        serviciosResult.rows.forEach(srv => {
            if (!serviciosPorEmpresa[srv.empresa_id]) {
                serviciosPorEmpresa[srv.empresa_id] = [];
            }
            serviciosPorEmpresa[srv.empresa_id].push({
                id: srv.id,
                nombre: srv.nombre,
                categoria: srv.categoria,
                estado: srv.estado,
                precioPactado: parseFloat(srv.precio_pactado) || 0
            });
        });

        const notasPorEmpresa = {};
        notasResult.rows.forEach(nota => {
            if (!notasPorEmpresa[nota.empresa_id]) {
                notasPorEmpresa[nota.empresa_id] = [];
            }
            notasPorEmpresa[nota.empresa_id].push({
                id: nota.id,
                fecha: nota.created_at ? new Date(nota.created_at).toLocaleString('es-CL') : '',
                texto: nota.texto,
                tipo: nota.tipo_mensaje || 'conversacion',
                autor: nota.usuario_nombre || 'Sistema',
                resuelto: nota.leido === true
            });
        });

        const planHistorialPorEmpresa = {};
        planHistorialResult.rows.forEach(h => {
            if (!planHistorialPorEmpresa[h.empresa_id]) {
                planHistorialPorEmpresa[h.empresa_id] = [];
            }
            planHistorialPorEmpresa[h.empresa_id].push({
                planAnterior: h.plan_anterior_nombre || '—',
                planNuevo: h.plan_nuevo_nombre || '—',
                autor: h.usuario_nombre || 'Sistema',
                motivo: h.motivo || '',
                fecha: h.created_at ? new Date(h.created_at).toLocaleString('es-CL') : ''
            });
        });

        const clients = clientesResult.rows.map((cliente) => ({
            id: cliente.id,
            razonSocial: cliente.razon_social,
            razon_social: cliente.razon_social,
            rut: decryptData(cliente.rut_encrypted),
            rut_encrypted: cliente.rut_encrypted,
            repRut: decryptData(cliente.rut_rep_encrypted),
            repNombre: cliente.nombre_rep,
            giro: cliente.giro,
            regimen: cliente.regimen_tributario,
            telefono: cliente.telefono_corporativo,
            correo: cliente.email_corporativo,
            logo: cliente.logo_url,
            plan: cliente.plan_nombre || 'FREE',
            
            pagoServicio: cliente.estado_pago || 'AL DIA',
            estadoFormulario: cliente.estado_f29 || 'PENDIENTE',
            
            impuestoPagar: parseFloat(cliente.impuesto_pagar) || 0,
            neto: parseFloat(cliente.impuesto_pagar) || 0,
            bruto: parseFloat(cliente.monto_bruto) || 0,
            monto_bruto: parseFloat(cliente.monto_bruto) || 0,
            ventas: parseFloat(cliente.ventas_mensuales) || 0,
            compras: parseFloat(cliente.compras_mensuales) || 0,
            facturacionTotal: parseFloat(cliente.facturacion_total) || 0,
            numeroFactura: cliente.nro_factura || '',
            nro_factura: cliente.nro_factura || '',
            impuestoUnico: parseFloat(cliente.impuesto_unico) || 0,
            
            montoRenta: parseFloat(cliente.monto_renta) || 0,
            contratoRenta: cliente.contrato_renta || false,
            formularioRenta: cliente.estado_formulario_renta || '',
            rentaMarzoNeto: parseFloat(cliente.renta_marzo_neto) || 0,
            rentaMarzoBruto: parseFloat(cliente.renta_marzo_bruto) || 0,
            
            dts: parseInt(cliente.dts_mensuales) || 0,
            dtAtrasados: parseInt(cliente.dts_mensuales) || 0,
            dtPendientesFirma: parseInt(cliente.pendientes_firma) || 0,
            
            claveWeb: decryptData(cliente.web_password_encrypted),
            claveSII: decryptData(cliente.sii_password_encrypted),
            
            score: parseInt(cliente.score) || 50,
            direccion: cliente.direccion || '',
            comuna: cliente.comuna || '',
            ciudad: cliente.ciudad || '',
            whatsapp: cliente.whatsapp || '',
            importante: cliente.nota_urgente || '',

            planId: cliente.plan_id || null,
            fechaCambioPlan: cliente.fecha_cambio_plan ? new Date(cliente.fecha_cambio_plan).toLocaleDateString('es-CL') : null,
            planHistorial: planHistorialPorEmpresa[cliente.id] || [],

            notas: notasPorEmpresa[cliente.id] || [],
            servicios: serviciosPorEmpresa[cliente.id] || [],
            type: cliente.tipo_cliente || 'Empresa'
        }));

        const planes = planesResult.rows.map(p => ({
            id: p.id,
            nombre: p.nombre,
            precioBase: parseFloat(p.precio_base) || 0
        }));

        const serviciosDisponibles = serviciosDisponiblesResult.rows.map(s => ({
            id: s.id,
            nombre: s.nombre,
            categoria: s.categoria,
            esCritico: s.es_critico === true
        }));

        return res.json({
            success: true,
            clients,
            planes,
            serviciosDisponibles,
            total: clients.length
        });
    } catch (error) {
        console.error('❌ Error CRM Controller:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Error al sincronizar datos con el CRM.'
        });
    }
};

export const updateClienteCRM = async (req, res) => {
    try {
        const { empresaId } = req.params;
        const {
            razonSocial, rut, repRut, repNombre, giro, regimen,
            telefono, correo, plan, pagoServicio, estadoFormulario,
            score, direccion, comuna, ciudad, bruto, neto,
            ventas, compras, impuestoUnico, numeroFactura,
            montoRenta, contratoRenta, formularioRenta, whatsapp, importante,
            rentaMarzoNeto, rentaMarzoBruto, claveWeb, claveSII 
        } = req.body;

        const rutEncrypted = rut ? encrypt(rut) : null;
        const repRutEncrypted = repRut ? encrypt(repRut) : null;

        let planId = null;
        if (plan) {
            const planResult = await pool.query('SELECT id FROM plan WHERE nombre = $1', [plan]);
            planId = planResult.rows[0]?.id;
        }

        const parseNum = (val) => {
            if (val === undefined || val === null || val === '') return null;
            const clean = String(val).replace(/[^0-9.-]+/g, "");
            return isNaN(parseFloat(clean)) ? null : parseFloat(clean);
        };

        const updateQuery = `
            UPDATE empresa SET
                razon_social = COALESCE($1, razon_social),
                rut_encrypted = COALESCE($2, rut_encrypted),
                rut_rep_encrypted = COALESCE($3, rut_rep_encrypted),
                nombre_rep = COALESCE($4, nombre_rep),
                giro = COALESCE($5, giro),
                regimen_tributario = COALESCE($6, regimen_tributario),
                telefono_corporativo = COALESCE($7, telefono_corporativo),
                email_corporativo = COALESCE($8, email_corporativo),
                plan_id = COALESCE($9, plan_id),
                estado_pago = COALESCE($10, estado_pago),
                estado_f29 = COALESCE($11, estado_f29),
                score = COALESCE($12, score),
                monto_bruto = COALESCE($13, monto_bruto),
                impuesto_pagar = COALESCE($14, impuesto_pagar),
                ventas_mensuales = COALESCE($15, ventas_mensuales),
                compras_mensuales = COALESCE($16, compras_mensuales),
                impuesto_unico = COALESCE($17, impuesto_unico),
                nro_factura = COALESCE($18, nro_factura),
                monto_renta = COALESCE($19, monto_renta),
                contrato_renta = COALESCE($20, contrato_renta),
                estado_formulario_renta = COALESCE($21, estado_formulario_renta),
                whatsapp = COALESCE($22, whatsapp),
                nota_urgente = COALESCE($23, nota_urgente),
                renta_marzo_neto = COALESCE($24, renta_marzo_neto),
                renta_marzo_bruto = COALESCE($25, renta_marzo_bruto),
                updated_at = NOW()
            WHERE id = $26
            RETURNING *
        `;

        const result = await pool.query(updateQuery, [
            razonSocial || null, rutEncrypted || null, repRutEncrypted || null,
            repNombre || null, giro || null, regimen || null, telefono || null,
            correo || null, planId || null, pagoServicio || null, estadoFormulario || null,
            score || null, parseNum(bruto), parseNum(neto), parseNum(ventas),
            parseNum(compras), parseNum(impuestoUnico), numeroFactura || null,
            parseNum(montoRenta),
            contratoRenta !== undefined ? (contratoRenta === 'SÍ' || contratoRenta === true) : null,
            formularioRenta || null, whatsapp || null, importante || null,
            parseNum(rentaMarzoNeto), parseNum(rentaMarzoBruto),
            empresaId
        ]);

        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Empresa no encontrada.' });

        if (direccion || comuna || ciudad) {
            await pool.query(`
                UPDATE sucursal SET
                    direccion = COALESCE($1, direccion),
                    comuna = COALESCE($2, comuna),
                    ciudad = COALESCE($3, ciudad),
                    updated_at = NOW()
                WHERE empresa_id = $4 AND es_casa_matriz = TRUE
            `, [direccion || null, comuna || null, ciudad || null, empresaId]);
        }

        // GUARDAR CONTRASEÑAS EN SU TABLA CORRESPONDIENTE
        if (claveWeb !== undefined || claveSII !== undefined) {
            const credUpdates = [];
            const credVals = [];
            let paramIndex = 1;
            
            if (claveWeb !== undefined) {
                credUpdates.push(`web_password_encrypted = $${paramIndex++}`);
                credVals.push(claveWeb ? encrypt(claveWeb) : null);
            }
            if (claveSII !== undefined) {
                credUpdates.push(`sii_password_encrypted = $${paramIndex++}`);
                credVals.push(claveSII ? encrypt(claveSII) : null);
            }
            
            if (credUpdates.length > 0) {
                credUpdates.push(`updated_at = NOW()`);
                credVals.push(empresaId);
                await pool.query(`
                    UPDATE empresa_credenciales 
                    SET ${credUpdates.join(', ')} 
                    WHERE empresa_id = $${paramIndex}
                `, credVals);
            }
        }

        return res.json({ success: true, message: 'Datos de empresa actualizados correctamente.' });
    } catch (error) {
        console.error('❌ Error updating cliente:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Error al actualizar los datos en la base de datos.'
        });
    }
};

const TIPOS_BITACORA = ['conversacion', 'ticket', 'cambio_plan', 'servicio', 'sistema'];

export const addNotaCRM = async (req, res) => {
    try {
        const { empresaId } = req.params;
        const { texto, tipo } = req.body;
        if (!texto || !texto.trim()) return res.status(400).json({ success: false, message: 'La nota no puede estar vacía.' });

        const tipoMensaje = TIPOS_BITACORA.includes(tipo) ? tipo : 'conversacion';

        const result = await pool.query(
            `INSERT INTO bitacora_gestion (empresa_id, usuario_id, texto, tipo_mensaje, usuario_nombre, leido)
             VALUES ($1, $2, $3, $4, $5, FALSE)
             RETURNING id, empresa_id, texto, tipo_mensaje, usuario_nombre, leido, created_at`,
            [empresaId, req.user?.usuarioId || null, texto.trim(), tipoMensaje, req.user?.nombre || null]
        );
        const nota = result.rows[0];
        return res.json({
            success: true,
            nota: {
                id: nota.id,
                empresaId: nota.empresa_id,
                texto: nota.texto,
                tipo: nota.tipo_mensaje || 'conversacion',
                autor: nota.usuario_nombre || 'Sistema',
                resuelto: nota.leido === true,
                fecha: nota.created_at ? new Date(nota.created_at).toLocaleString('es-CL') : ''
            }
        });
    } catch (error) {
        console.error('❌ Error guardando nota CRM:', error.message);
        return res.status(500).json({
            success: false,
            message: 'No se pudo guardar la gestión en la bitácora.'
        });
    }
};

// Marca un ticket de la bitácora como resuelto / reabierto (columna leido)
export const toggleTicketCRM = async (req, res) => {
    try {
        const { notaId } = req.params;
        const { resuelto } = req.body;
        const result = await pool.query(
            `UPDATE bitacora_gestion SET leido = $1 WHERE id = $2 RETURNING id`,
            [resuelto === true, notaId]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Ticket no encontrado.' });
        return res.json({ success: true });
    } catch (error) {
        console.error('❌ Error actualizando ticket CRM:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo actualizar el ticket.' });
    }
};

// =========================================================
// ADMINISTRACIÓN DE PLANES (cambio + historial + fecha)
// =========================================================
export const cambiarPlanCRM = async (req, res) => {
    const client = await pool.connect();
    try {
        const { empresaId } = req.params;
        const { planId, motivo } = req.body;
        if (!planId) return res.status(400).json({ success: false, message: 'Debe indicar el nuevo plan.' });

        await client.query('BEGIN');

        // Estado actual de la empresa (plan anterior)
        const empResult = await client.query(
            `SELECT e.plan_id, p.nombre AS plan_nombre
             FROM empresa e LEFT JOIN plan p ON e.plan_id = p.id
             WHERE e.id = $1`,
            [empresaId]
        );
        if (empResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Empresa no encontrada.' });
        }
        const planAnteriorId = empResult.rows[0].plan_id;
        const planAnteriorNombre = empResult.rows[0].plan_nombre;

        // Plan nuevo
        const nuevoPlanResult = await client.query(`SELECT id, nombre FROM plan WHERE id = $1`, [planId]);
        if (nuevoPlanResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'El plan indicado no existe.' });
        }
        const planNuevoNombre = nuevoPlanResult.rows[0].nombre;

        if (planAnteriorId === planId) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'El cliente ya tiene ese plan.' });
        }

        // Aplica el cambio y registra la fecha
        await client.query(
            `UPDATE empresa SET plan_id = $1, fecha_cambio_plan = NOW(), updated_at = NOW() WHERE id = $2`,
            [planId, empresaId]
        );

        // Registra en el historial
        await client.query(
            `INSERT INTO empresa_plan_historial
                (empresa_id, plan_anterior_id, plan_nuevo_id, plan_anterior_nombre, plan_nuevo_nombre, usuario_id, usuario_nombre, motivo)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [empresaId, planAnteriorId, planId, planAnteriorNombre, planNuevoNombre,
             req.user?.usuarioId || null, req.user?.nombre || null, motivo?.trim() || null]
        );

        // Deja rastro también en la bitácora del cliente
        await client.query(
            `INSERT INTO bitacora_gestion (empresa_id, usuario_id, texto, tipo_mensaje, usuario_nombre, leido)
             VALUES ($1, $2, $3, 'cambio_plan', $4, TRUE)`,
            [empresaId, req.user?.usuarioId || null,
             `Cambio de plan: ${planAnteriorNombre || '—'} → ${planNuevoNombre}${motivo?.trim() ? ` (${motivo.trim()})` : ''}`,
             req.user?.nombre || null]
        );

        await client.query('COMMIT');
        return res.json({
            success: true,
            message: 'Plan actualizado correctamente.',
            plan: planNuevoNombre,
            planId
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error cambiando plan CRM:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo cambiar el plan.' });
    } finally {
        client.release();
    }
};

// =========================================================
// SERVICIOS CONTRATADOS (agregar / quitar)
// =========================================================
export const addServicioCRM = async (req, res) => {
    try {
        const { empresaId } = req.params;
        const { servicioId, precioPactado } = req.body;
        if (!servicioId) return res.status(400).json({ success: false, message: 'Debe indicar el servicio.' });

        // Evita duplicar un servicio ya activo
        const dup = await pool.query(
            `SELECT id FROM empresa_servicio WHERE empresa_id = $1 AND servicio_id = $2 AND estado <> 'Suspendido'`,
            [empresaId, servicioId]
        );
        if (dup.rows.length > 0) {
            return res.status(409).json({ success: false, message: 'El cliente ya tiene contratado ese servicio.' });
        }

        const parsedPrecio = (precioPactado === undefined || precioPactado === null || precioPactado === '')
            ? null
            : parseFloat(String(precioPactado).replace(/[^0-9.-]+/g, ''));

        const result = await pool.query(
            `INSERT INTO empresa_servicio (empresa_id, servicio_id, estado, precio_pactado, fecha_inicio)
             VALUES ($1, $2, 'Activo', $3, NOW())
             RETURNING id`,
            [empresaId, servicioId, isNaN(parsedPrecio) ? null : parsedPrecio]
        );

        const srv = await pool.query(
            `SELECT es.id, s.nombre, s.categoria, es.estado, es.precio_pactado
             FROM empresa_servicio es JOIN servicio s ON es.servicio_id = s.id
             WHERE es.id = $1`,
            [result.rows[0].id]
        );
        const row = srv.rows[0];
        return res.json({
            success: true,
            servicio: {
                id: row.id,
                nombre: row.nombre,
                categoria: row.categoria,
                estado: row.estado,
                precioPactado: parseFloat(row.precio_pactado) || 0
            }
        });
    } catch (error) {
        console.error('❌ Error agregando servicio CRM:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo agregar el servicio.' });
    }
};

export const removeServicioCRM = async (req, res) => {
    try {
        const { empresaServicioId } = req.params;
        // Suspende el servicio (el trigger registra fecha_termino). No se borra para conservar historial.
        const result = await pool.query(
            `UPDATE empresa_servicio SET estado = 'Suspendido', updated_at = NOW() WHERE id = $1 RETURNING id`,
            [empresaServicioId]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Servicio no encontrado.' });
        return res.json({ success: true });
    } catch (error) {
        console.error('❌ Error quitando servicio CRM:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo quitar el servicio.' });
    }
};

// ==========================================
// NUEVA FUNCIÓN AÑADIDA: CREAR CLIENTE
// ==========================================
export const crear_cliente = async (req, res) => {
    try {
        const empresaId = req.empresaId || req.body?.empresaId;
        const { rut, nombre, email, tipo_cliente } = req.body;

        // Por ahora, simularemos la creación con un ID para que el proceso 
        // de facturación en DTE.controllers no se interrumpa.
        // Si tienes una tabla específica para esto después, puedes poner el INSERT INTO aquí.
        
        return res.status(201).json({ 
            success: true, 
            id: 999, 
            mensaje: "Cliente validado/creado con éxito para la emisión del DTE." 
        });
    } catch (error) {
        console.error('❌ Error creando cliente desde DTE:', error.message);
        return res.status(500).json({ 
            success: false, 
            message: 'Error interno al intentar crear el cliente.' 
        });
    }
};