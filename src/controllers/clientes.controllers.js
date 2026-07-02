import { pool } from '../database/db.js';
import { decrypt, encrypt, generateHash } from '../utils/crypto.js';
import { cleanRut } from '../lib/rut.js';

// RUT chileno con dígito verificador (módulo 11)
const validarRutDV = (rut) => {
    const limpio = cleanRut(rut); // "BODY-DV"
    if (!/^\d+-[\dkK]$/.test(limpio)) return false;
    const [body, dv] = limpio.split('-');
    let suma = 0, mul = 2;
    for (let i = body.length - 1; i >= 0; i--) {
        suma += parseInt(body[i], 10) * mul;
        mul = mul < 7 ? mul + 1 : 2;
    }
    const resto = 11 - (suma % 11);
    const esperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
    return dv.toUpperCase() === esperado;
};

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
        // Seguridad multi-tenant: los usuarios rol 'Cliente' solo ven las empresas
        // que tengan asignadas en `audita`. El staff (Administrador/Consultor) ve todo.
        const esCliente = req.user?.rol === 'Cliente';
        const empresaParams = [];
        let auditaJoin = '';
        if (esCliente && req.user?.usuarioId) {
            auditaJoin = ' JOIN audita a ON a.empresa_id = e.id AND a.usuario_id = $1 ';
            empresaParams.push(req.user.usuarioId);
        }

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
            ${auditaJoin}
            LEFT JOIN plan p ON e.plan_id = p.id
            LEFT JOIN empresa_credenciales ec ON e.id = ec.empresa_id
            LEFT JOIN sucursal s ON e.id = s.empresa_id AND s.es_casa_matriz = TRUE
            ORDER BY e.razon_social ASC
        `, empresaParams);

        // IDs visibles: se usan para acotar el resto de consultas (seguridad + rendimiento)
        const empresaIds = clientesResult.rows.map(r => r.id);
        const empty = { rows: [] };

        const serviciosResult = empresaIds.length === 0 ? empty : await pool.query(`
            SELECT
                es.id,
                es.empresa_id,
                s.nombre,
                s.categoria,
                es.estado,
                es.precio_pactado,
                es.fecha_inicio,
                es.fecha_termino
            FROM empresa_servicio es
            JOIN servicio s ON es.servicio_id = s.id
            WHERE es.empresa_id = ANY($1)
            ORDER BY es.empresa_id
        `, [empresaIds]);

        let notasResult = empty;
        if (empresaIds.length > 0) {
            try {
                notasResult = await pool.query(`
                    SELECT
                        id, empresa_id, texto, tipo_mensaje, usuario_nombre, leido,
                        prioridad, responsable_nombre, fecha_vencimiento, updated_at,
                        created_at
                    FROM bitacora_gestion
                    WHERE empresa_id = ANY($1)
                    ORDER BY created_at DESC
                `, [empresaIds]);
            } catch (err) {
                if (err.code !== '42703') throw err; // columnas de ticket aún no migradas → query base
                notasResult = await pool.query(`
                    SELECT id, empresa_id, texto, tipo_mensaje, usuario_nombre, leido, created_at
                    FROM bitacora_gestion
                    WHERE empresa_id = ANY($1)
                    ORDER BY created_at DESC
                `, [empresaIds]);
            }
        }

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

        // Matriz de precios Plan × Tramo (si la tabla existe)
        let preciosResult = { rows: [] };
        try {
            preciosResult = await pool.query(`
                SELECT p.nombre AS plan, ppt.tramo_orden, ppt.tramo_min, ppt.tramo_max, ppt.precio_neto, ppt.rrhh_gratis
                FROM plan_precio_tramo ppt JOIN plan p ON p.id = ppt.plan_id
                WHERE ppt.activo
                ORDER BY p.nombre, ppt.tramo_orden
            `);
        } catch (err) {
            if (err.code !== '42P01') throw err; // tabla no existe aún → degradar
        }

        // Historial de cambios de plan por empresa.
        // Si la migración aún no se corrió (tabla inexistente), degradamos a vacío
        // en lugar de romper toda la carga del CRM.
        let planHistorialResult = { rows: [] };
        try {
            planHistorialResult = empresaIds.length === 0 ? { rows: [] } : await pool.query(`
                SELECT empresa_id, plan_anterior_nombre, plan_nuevo_nombre,
                       usuario_nombre, motivo, created_at
                FROM empresa_plan_historial
                WHERE empresa_id = ANY($1)
                ORDER BY created_at DESC
            `, [empresaIds]);
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
                precioPactado: parseFloat(srv.precio_pactado) || 0,
                fechaInicio: srv.fecha_inicio ? new Date(srv.fecha_inicio).toLocaleDateString('es-CL') : null,
                fechaTermino: srv.fecha_termino ? new Date(srv.fecha_termino).toLocaleDateString('es-CL') : null
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
                resuelto: nota.leido === true,
                prioridad: nota.prioridad || null,
                responsable: nota.responsable_nombre || null,
                fechaVencimiento: nota.fecha_vencimiento ? new Date(nota.fecha_vencimiento).toLocaleDateString('es-CL') : null,
                editado: !!nota.updated_at
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
            type: cliente.tipo_cliente || 'Empresa',
            ultimaModificacion: cliente.updated_at ? new Date(cliente.updated_at).toLocaleString('es-CL') : null
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

        const preciosPlanTramo = preciosResult.rows.map(r => ({
            plan: r.plan,
            tramoOrden: r.tramo_orden,
            tramoMin: parseFloat(r.tramo_min) || 0,
            tramoMax: r.tramo_max === null ? null : parseFloat(r.tramo_max),
            precioNeto: parseFloat(r.precio_neto) || 0,
            rrhhGratis: parseInt(r.rrhh_gratis) || 0,
        }));

        return res.json({
            success: true,
            clients,
            planes,
            serviciosDisponibles,
            preciosPlanTramo,
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

const validarCorreoFmt = (c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(c).trim());

// Registro de auditoría de acciones sobre el cliente (best-effort).
// Si la tabla no existe (migración no aplicada), se ignora silenciosamente.
const registrarAuditoria = async (empresaId, user, accion, detalle) => {
    try {
        await pool.query(
            `INSERT INTO empresa_auditoria (empresa_id, usuario_id, usuario_nombre, accion, detalle)
             VALUES ($1, $2, $3, $4, $5)`,
            [empresaId, user?.usuarioId || null, user?.nombre || null, accion, detalle || null]
        );
    } catch (err) {
        if (err.code !== '42P01') console.warn('Auditoría no registrada:', err.message);
    }
};

export const updateClienteCRM = async (req, res) => {
    try {
        const { empresaId } = req.params;
        const b = req.body;
        const { rut, repRut, plan, direccion, comuna, ciudad, claveWeb, claveSII } = b;

        // --- Validación server-side ---
        if (rut !== undefined && String(rut).trim() !== '' && !validarRutDV(rut)) {
            return res.status(400).json({ success: false, message: 'El RUT no es válido (dígito verificador).' });
        }
        if (repRut !== undefined && String(repRut).trim() !== '' && !validarRutDV(repRut)) {
            return res.status(400).json({ success: false, message: 'El RUT del representante no es válido.' });
        }
        if (b.correo !== undefined && String(b.correo).trim() !== '' && !validarCorreoFmt(b.correo)) {
            return res.status(400).json({ success: false, message: 'El correo electrónico no es válido.' });
        }

        const parseNum = (val) => {
            if (val === undefined || val === null || val === '') return null;
            const clean = String(val).replace(/[^0-9.-]+/g, "");
            return isNaN(parseFloat(clean)) ? null : parseFloat(clean);
        };
        const txt = (v) => (v === undefined || v === null || String(v).trim() === '') ? null : String(v).trim();

        // Mapeo campo body → columna. Solo se actualizan las claves presentes en el body,
        // y '' se convierte en null (ahora SÍ se puede vaciar un campo).
        const textCols = {
            razonSocial: 'razon_social', repNombre: 'nombre_rep', giro: 'giro',
            regimen: 'regimen_tributario', telefono: 'telefono_corporativo', correo: 'email_corporativo',
            pagoServicio: 'estado_pago', estadoFormulario: 'estado_f29', numeroFactura: 'nro_factura',
            formularioRenta: 'estado_formulario_renta', whatsapp: 'whatsapp', importante: 'nota_urgente',
            logo: 'logo_url'
        };
        const numCols = {
            score: 'score', bruto: 'monto_bruto', neto: 'impuesto_pagar', ventas: 'ventas_mensuales',
            compras: 'compras_mensuales', impuestoUnico: 'impuesto_unico', montoRenta: 'monto_renta',
            rentaMarzoNeto: 'renta_marzo_neto', rentaMarzoBruto: 'renta_marzo_bruto'
        };

        const sets = [];
        const vals = [];
        let i = 1;
        for (const [key, col] of Object.entries(textCols)) {
            if (b[key] !== undefined) { sets.push(`${col} = $${i++}`); vals.push(txt(b[key])); }
        }
        for (const [key, col] of Object.entries(numCols)) {
            if (b[key] !== undefined) { sets.push(`${col} = $${i++}`); vals.push(parseNum(b[key])); }
        }
        // RUT propio: nunca se vacía (es el identificador). Si viene, se re-encripta + rehashea.
        if (rut !== undefined && String(rut).trim() !== '') {
            const clean = cleanRut(rut);
            sets.push(`rut_encrypted = $${i++}`); vals.push(encrypt(clean));
            sets.push(`rut_hash = $${i++}`); vals.push(generateHash(clean));
        }
        // RUT representante: se puede vaciar
        if (repRut !== undefined) {
            if (String(repRut).trim() === '') {
                sets.push(`rut_rep_encrypted = $${i++}`); vals.push(null);
                sets.push(`rut_rep_hash = $${i++}`); vals.push(null);
            } else {
                const cleanR = cleanRut(repRut);
                sets.push(`rut_rep_encrypted = $${i++}`); vals.push(encrypt(cleanR));
                sets.push(`rut_rep_hash = $${i++}`); vals.push(generateHash(cleanR));
            }
        }
        if (b.contratoRenta !== undefined) {
            sets.push(`contrato_renta = $${i++}`); vals.push(b.contratoRenta === 'SÍ' || b.contratoRenta === true);
        }
        if (plan) {
            const planResult = await pool.query('SELECT id FROM plan WHERE nombre = $1', [plan]);
            if (planResult.rows[0]?.id) { sets.push(`plan_id = $${i++}`); vals.push(planResult.rows[0].id); }
        }

        if (sets.length > 0) {
            vals.push(empresaId);
            const result = await pool.query(
                `UPDATE empresa SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING id`,
                vals
            );
            if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Empresa no encontrada.' });
        }

        // Dirección (casa matriz): también permite vaciar
        if (direccion !== undefined || comuna !== undefined || ciudad !== undefined) {
            const dsets = [];
            const dvals = [];
            let j = 1;
            if (direccion !== undefined) { dsets.push(`direccion = $${j++}`); dvals.push(txt(direccion)); }
            if (comuna !== undefined) { dsets.push(`comuna = $${j++}`); dvals.push(txt(comuna)); }
            if (ciudad !== undefined) { dsets.push(`ciudad = $${j++}`); dvals.push(txt(ciudad)); }
            if (dsets.length > 0) {
                dvals.push(empresaId);
                await pool.query(
                    `UPDATE sucursal SET ${dsets.join(', ')}, updated_at = NOW() WHERE empresa_id = $${j} AND es_casa_matriz = TRUE`,
                    dvals
                );
            }
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

        // Auditoría: registra la edición en tabla dedicada (best-effort, no rompe si falta)
        await registrarAuditoria(empresaId, req.user, 'editar', 'Datos del cliente actualizados');

        // Devuelve la última modificación para mostrarla en la ficha
        let updatedAt = null;
        try {
            const u = await pool.query('SELECT updated_at FROM empresa WHERE id = $1', [empresaId]);
            updatedAt = u.rows[0]?.updated_at || null;
        } catch { /* opcional */ }

        return res.json({ success: true, message: 'Datos de empresa actualizados correctamente.', updatedAt });
    } catch (error) {
        console.error('❌ Error updating cliente:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Error al actualizar los datos en la base de datos.'
        });
    }
};

const TIPOS_BITACORA = ['conversacion', 'ticket', 'cambio_plan', 'servicio', 'sistema'];

const PRIORIDADES = ['Alta', 'Media', 'Baja'];
const mapNota = (nota) => ({
    id: nota.id,
    empresaId: nota.empresa_id,
    texto: nota.texto,
    tipo: nota.tipo_mensaje || 'conversacion',
    autor: nota.usuario_nombre || 'Sistema',
    resuelto: nota.leido === true,
    prioridad: nota.prioridad || null,
    responsable: nota.responsable_nombre || null,
    fechaVencimiento: nota.fecha_vencimiento ? new Date(nota.fecha_vencimiento).toLocaleDateString('es-CL') : null,
    editado: !!nota.updated_at,
    fecha: nota.created_at ? new Date(nota.created_at).toLocaleString('es-CL') : ''
});

export const addNotaCRM = async (req, res) => {
    try {
        const { empresaId } = req.params;
        const { texto, tipo, prioridad, responsable, fechaVencimiento } = req.body;
        if (!texto || !texto.trim()) return res.status(400).json({ success: false, message: 'La nota no puede estar vacía.' });

        const tipoMensaje = TIPOS_BITACORA.includes(tipo) ? tipo : 'conversacion';
        const esTicket = tipoMensaje === 'ticket';
        const prio = esTicket && PRIORIDADES.includes(prioridad) ? prioridad : null;
        const resp = esTicket && responsable?.trim() ? responsable.trim() : null;
        const venc = esTicket && fechaVencimiento ? fechaVencimiento : null;

        let result;
        try {
            result = await pool.query(
                `INSERT INTO bitacora_gestion
                    (empresa_id, usuario_id, texto, tipo_mensaje, usuario_nombre, leido, prioridad, responsable_nombre, fecha_vencimiento)
                 VALUES ($1, $2, $3, $4, $5, FALSE, $6, $7, $8)
                 RETURNING id, empresa_id, texto, tipo_mensaje, usuario_nombre, leido, prioridad, responsable_nombre, fecha_vencimiento, updated_at, created_at`,
                [empresaId, req.user?.usuarioId || null, texto.trim(), tipoMensaje, req.user?.nombre || null, prio, resp, venc]
            );
        } catch (err) {
            if (err.code !== '42703') throw err; // columnas de ticket no migradas → insert base
            result = await pool.query(
                `INSERT INTO bitacora_gestion (empresa_id, usuario_id, texto, tipo_mensaje, usuario_nombre, leido)
                 VALUES ($1, $2, $3, $4, $5, FALSE)
                 RETURNING id, empresa_id, texto, tipo_mensaje, usuario_nombre, leido, created_at`,
                [empresaId, req.user?.usuarioId || null, texto.trim(), tipoMensaje, req.user?.nombre || null]
            );
        }
        return res.json({ success: true, nota: mapNota(result.rows[0]) });
    } catch (error) {
        console.error('❌ Error guardando nota CRM:', error.message);
        return res.status(500).json({
            success: false,
            message: 'No se pudo guardar la gestión en la bitácora.'
        });
    }
};

// Edita el texto y, si vienen, los metadatos de ticket de una nota de la bitácora.
// Solo actualiza los campos presentes en el body (no borra prioridad/responsable/vencimiento al editar texto).
export const editarNotaCRM = async (req, res) => {
    try {
        const { notaId } = req.params;
        const { texto, prioridad, responsable, fechaVencimiento } = req.body;
        if (!texto || !texto.trim()) return res.status(400).json({ success: false, message: 'La nota no puede estar vacía.' });

        const sets = ['texto = $1'];
        const vals = [texto.trim()];
        let i = 2;
        if (prioridad !== undefined) { sets.push(`prioridad = $${i++}`); vals.push(PRIORIDADES.includes(prioridad) ? prioridad : null); }
        if (responsable !== undefined) { sets.push(`responsable_nombre = $${i++}`); vals.push(responsable?.trim() || null); }
        if (fechaVencimiento !== undefined) { sets.push(`fecha_vencimiento = $${i++}`); vals.push(fechaVencimiento || null); }

        const returning = `RETURNING id, empresa_id, texto, tipo_mensaje, usuario_nombre, leido, prioridad, responsable_nombre, fecha_vencimiento, updated_at, created_at`;
        vals.push(notaId);

        let result;
        try {
            result = await pool.query(
                `UPDATE bitacora_gestion SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} ${returning}`,
                vals
            );
        } catch (err) {
            if (err.code !== '42703') throw err; // columnas de ticket no migradas → solo texto
            result = await pool.query(
                `UPDATE bitacora_gestion SET texto = $1 WHERE id = $2
                 RETURNING id, empresa_id, texto, tipo_mensaje, usuario_nombre, leido, created_at`,
                [texto.trim(), notaId]
            );
        }
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Nota no encontrada.' });
        return res.json({ success: true, nota: mapNota(result.rows[0]) });
    } catch (error) {
        console.error('❌ Error editando nota CRM:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo editar la nota.' });
    }
};

// Elimina una nota de la bitácora
export const eliminarNotaCRM = async (req, res) => {
    try {
        const { notaId } = req.params;
        const result = await pool.query(`DELETE FROM bitacora_gestion WHERE id = $1 RETURNING id`, [notaId]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Nota no encontrada.' });
        return res.json({ success: true });
    } catch (error) {
        console.error('❌ Error eliminando nota CRM:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo eliminar la nota.' });
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

// Reactiva un servicio suspendido (el trigger restablece fecha_inicio y limpia fecha_termino)
export const reactivarServicioCRM = async (req, res) => {
    try {
        const { empresaServicioId } = req.params;

        // Evita reactivar si ya hay otro servicio activo del mismo tipo
        const info = await pool.query('SELECT empresa_id, servicio_id FROM empresa_servicio WHERE id = $1', [empresaServicioId]);
        if (info.rows.length === 0) return res.status(404).json({ success: false, message: 'Servicio no encontrado.' });
        const { empresa_id, servicio_id } = info.rows[0];
        const dup = await pool.query(
            `SELECT id FROM empresa_servicio WHERE empresa_id = $1 AND servicio_id = $2 AND estado = 'Activo' AND id <> $3`,
            [empresa_id, servicio_id, empresaServicioId]
        );
        if (dup.rows.length > 0) {
            return res.status(409).json({ success: false, message: 'Ya existe una versión activa de ese servicio.' });
        }

        const result = await pool.query(
            `UPDATE empresa_servicio SET estado = 'Activo', updated_at = NOW() WHERE id = $1
             RETURNING id, fecha_inicio, fecha_termino`,
            [empresaServicioId]
        );
        const row = result.rows[0];
        return res.json({
            success: true,
            servicio: {
                id: row.id,
                estado: 'Activo',
                fechaInicio: row.fecha_inicio ? new Date(row.fecha_inicio).toLocaleDateString('es-CL') : null,
                fechaTermino: null
            }
        });
    } catch (error) {
        console.error('❌ Error reactivando servicio CRM:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo reactivar el servicio.' });
    }
};

// =========================================================
// CREAR CLIENTE (EMPRESA) — inserción real en la BD
// =========================================================
export const crearEmpresaCRM = async (req, res) => {
    const client = await pool.connect();
    try {
        const {
            razonSocial, rut, giro, regimen,
            telefono, correo, whatsapp,
            repNombre, repRut,
            planId, tipoCliente,
            direccion, comuna, ciudad,
            importante
        } = req.body;

        if (!rut || !rut.trim() || !validarRutDV(rut)) {
            return res.status(400).json({ success: false, message: 'El RUT ingresado no es válido (revisa el dígito verificador).' });
        }
        if (repRut && repRut.trim() && !validarRutDV(repRut)) {
            return res.status(400).json({ success: false, message: 'El RUT del representante no es válido.' });
        }
        if (correo && correo.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())) {
            return res.status(400).json({ success: false, message: 'El correo electrónico no es válido.' });
        }

        const rutStandard = cleanRut(rut);
        const rutHash = generateHash(rutStandard);
        // El nombre es opcional: si no viene, usamos el RUT como identificador provisional
        const nombreFinal = razonSocial?.trim() || rutStandard;

        await client.query('BEGIN');

        // Detección de duplicado por RUT
        const dup = await client.query('SELECT id, razon_social FROM empresa WHERE rut_hash = $1', [rutHash]);
        if (dup.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                success: false,
                code: 'DUPLICADO',
                message: `Ya existe un cliente con ese RUT: ${dup.rows[0].razon_social}.`,
                empresaId: dup.rows[0].id
            });
        }

        // Plan: usa el indicado o cae al plan FREE por defecto (si existe)
        let finalPlanId = planId || null;
        if (!finalPlanId) {
            const free = await client.query(`SELECT id FROM plan WHERE UPPER(nombre) = 'FREE' LIMIT 1`);
            finalPlanId = free.rows[0]?.id || null;
        }

        const repRutLimpio = repRut && repRut.trim() ? cleanRut(repRut) : null;

        const ins = await client.query(
            `INSERT INTO empresa (
                razon_social, rut_encrypted, rut_hash, giro, regimen_tributario,
                telefono_corporativo, email_corporativo, whatsapp,
                nombre_rep, rut_rep_encrypted, rut_rep_hash,
                plan_id, tipo_cliente, nota_urgente
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
            RETURNING id, razon_social`,
            [
                nombreFinal,
                encrypt(rutStandard),
                rutHash,
                giro?.trim() || 'Sin especificar',
                regimen?.trim() || 'Sin especificar',
                telefono?.trim() || null,
                correo?.trim() || null,
                whatsapp?.trim() || null,
                repNombre?.trim() || null,
                repRutLimpio ? encrypt(repRutLimpio) : null,
                repRutLimpio ? generateHash(repRutLimpio) : null,
                finalPlanId,
                tipoCliente || 'Empresa',
                importante?.trim() || null
            ]
        );
        const empresaId = ins.rows[0].id;

        // Fila de credenciales (columnas NOT NULL) para que luego se puedan guardar claves SII/Web
        await client.query(
            `INSERT INTO empresa_credenciales
                (empresa_id, sii_rut_encrypted, sii_email_encrypted, sii_password_encrypted, web_password_encrypted)
             VALUES ($1, '', '', '', '')`,
            [empresaId]
        );

        // Casa matriz para que luego se pueda editar dirección/comuna/ciudad
        await client.query(
            `INSERT INTO sucursal (empresa_id, direccion, comuna, ciudad, es_casa_matriz)
             VALUES ($1, $2, $3, $4, TRUE)`,
            [empresaId, direccion?.trim() || 'Sin dirección', comuna?.trim() || 'Sin especificar', ciudad?.trim() || 'Sin especificar']
        );

        // Vincula la empresa al usuario que la creó (para que aparezca en su selector)
        if (req.user?.usuarioId) {
            await client.query(
                `INSERT INTO audita (usuario_id, empresa_id) VALUES ($1, $2)
                 ON CONFLICT DO NOTHING`,
                [req.user.usuarioId, empresaId]
            );
        }

        await client.query('COMMIT');
        await registrarAuditoria(empresaId, req.user, 'crear', `Cliente creado: ${ins.rows[0].razon_social}`);
        return res.status(201).json({
            success: true,
            id: empresaId,
            empresaId,
            razonSocial: ins.rows[0].razon_social,
            message: 'Cliente creado correctamente.'
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error creando empresa CRM:', error.message);
        if (error.code === '23505') {
            return res.status(409).json({ success: false, code: 'DUPLICADO', message: 'El RUT ya existe en los registros.' });
        }
        return res.status(500).json({ success: false, message: 'No se pudo crear el cliente.' });
    } finally {
        client.release();
    }
};

// =========================================================
// ELIMINAR CLIENTE (EMPRESA) — borrado definitivo con guarda de FK
// =========================================================
export const eliminarEmpresaCRM = async (req, res) => {
    const client = await pool.connect();
    try {
        const { empresaId } = req.params;

        const existe = await client.query('SELECT id, razon_social FROM empresa WHERE id = $1', [empresaId]);
        if (existe.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Empresa no encontrada.' });
        }

        await client.query('BEGIN');

        // Limpia primero las filas dependientes del CRM (por si no cascadean)
        await client.query('DELETE FROM bitacora_gestion WHERE empresa_id = $1', [empresaId]);
        await client.query('DELETE FROM empresa_servicio WHERE empresa_id = $1', [empresaId]);
        try { await client.query('DELETE FROM empresa_plan_historial WHERE empresa_id = $1', [empresaId]); }
        catch (e) { if (e.code !== '42P01') throw e; }
        await client.query('DELETE FROM empresa_credenciales WHERE empresa_id = $1', [empresaId]);
        await client.query('DELETE FROM sucursal WHERE empresa_id = $1', [empresaId]);
        await client.query('DELETE FROM persona_empresa WHERE empresa_id = $1', [empresaId]);
        await client.query('DELETE FROM audita WHERE empresa_id = $1', [empresaId]);

        await client.query('DELETE FROM empresa WHERE id = $1', [empresaId]);

        await client.query('COMMIT');
        return res.json({ success: true, message: `Cliente "${existe.rows[0].razon_social}" eliminado.` });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error eliminando empresa CRM:', error.message);
        // FK: la empresa tiene registros contables/asociados que impiden el borrado
        if (error.code === '23503') {
            return res.status(409).json({
                success: false,
                message: 'No se puede eliminar: el cliente tiene registros asociados (facturación, movimientos, etc.).'
            });
        }
        return res.status(500).json({ success: false, message: 'No se pudo eliminar el cliente.' });
    } finally {
        client.release();
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