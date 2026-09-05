// =====================================================================
// PERSONAS DE UNA EMPRESA · y quién pagó cada factura
// ---------------------------------------------------------------------
// EL PEDIDO
// «Añadir a una empresa nombres de personas externas o internas, para no tener
// problemas de quién me pagó por esa factura.»
//
// POR QUÉ NO ES EL REPRESENTANTE LEGAL
// El representante es una figura jurídica: quien firma ante el SII, y de quien
// el robot toma el RUT para entrar al portal. La persona con la que uno habla
// todos los días, o la que transfiere el pago, suele ser OTRA — el contador
// externo, la secretaria, el socio. Mezclarlos habría roto la extracción del
// SII, que lee de `empresa_representante`.
//
// EL NOMBRE SE CONGELA AL PAGAR
// En el cobro se guardan las dos cosas: el id del contacto y su nombre en
// texto. El nombre porque quien pagó en marzo pagó en marzo — aunque después
// esa persona deje la empresa y su ficha se corrija o se borre. Un registro
// contable no puede cambiar hacia atrás.
// =====================================================================
import { pool } from '../database/db.js';
import { encrypt, decrypt, generateHash } from '../utils/crypto.js';
import { cleanRut } from '../lib/rut.js';
import { registrar } from '../utils/bitacora.js';

const ROLES = ['contacto', 'pagador', 'contador', 'representante', 'otro'];
const MEDIOS = ['transferencia', 'efectivo', 'cheque', 'tarjeta', 'otro'];

/** Descifra sin tumbar la respuesta si un dato viejo no se puede leer. */
const verRut = (v) => { try { return v ? decrypt(v) : null; } catch { return null; } };

/** La empresa es de mi organización. Sin esto se verían contactos ajenos. */
const empresaEsMia = async (empresaId, organizacionId) => {
    const { rows } = await pool.query(
        `SELECT 1 FROM empresa WHERE id = $1 AND organizacion_id IS NOT DISTINCT FROM $2::uuid`,
        [empresaId, organizacionId]);
    return rows.length > 0;
};

// ---------------------------------------------------------------
export const listarContactos = async (req, res) => {
    try {
        const { empresaId } = req.params;
        if (!await empresaEsMia(empresaId, req.user?.organizacionId)) {
            return res.status(404).json({ success: false, message: 'Empresa no encontrada.' });
        }

        const { rows } = await pool.query(
            `SELECT id, nombre, rol, externo, rut_encrypted, email, telefono, nota, activo
               FROM empresa_contacto
              WHERE empresa_id = $1
              ORDER BY activo DESC, rol = 'pagador' DESC, nombre`, [empresaId]);

        return res.json({
            success: true,
            contactos: rows.map(c => ({
                id: c.id, nombre: c.nombre, rol: c.rol, externo: c.externo === true,
                rut: verRut(c.rut_encrypted), email: c.email, telefono: c.telefono,
                nota: c.nota, activo: c.activo !== false,
            })),
            roles: ROLES,
        });
    } catch (error) {
        console.error('❌ Error listando contactos:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudieron cargar los contactos.' });
    }
};

export const crearContacto = async (req, res) => {
    try {
        const { empresaId } = req.params;
        if (!await empresaEsMia(empresaId, req.user?.organizacionId)) {
            return res.status(404).json({ success: false, message: 'Empresa no encontrada.' });
        }

        const nombre = String(req.body?.nombre || '').trim();
        if (!nombre) return res.status(400).json({ success: false, message: 'La persona necesita un nombre.' });
        if (nombre.length > 200) return res.status(400).json({ success: false, message: 'El nombre es muy largo.' });

        const rol = ROLES.includes(req.body?.rol) ? req.body.rol : 'contacto';
        const limpio = req.body?.rut ? cleanRut(req.body.rut) : null;

        const { rows } = await pool.query(
            `INSERT INTO empresa_contacto
                (empresa_id, nombre, rol, externo, rut_encrypted, rut_hash, email, telefono, nota)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             RETURNING id, nombre, rol, externo, email, telefono, nota, activo`,
            [empresaId, nombre, rol, req.body?.externo === true,
             limpio ? encrypt(limpio) : null, limpio ? generateHash(limpio) : null,
             req.body?.email?.trim() || null, req.body?.telefono?.trim() || null,
             req.body?.nota?.trim() || null]);

        await registrar(req, {
            modulo: 'crm', accion: 'crear', entidad: 'contacto', entidadId: rows[0].id,
            descripcion: `Agregó a «${nombre}» (${rol}) como contacto de la empresa.`,
        });
        return res.status(201).json({ success: true, contacto: { ...rows[0], rut: limpio } });
    } catch (error) {
        console.error('❌ Error creando contacto:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo agregar la persona.' });
    }
};

export const actualizarContacto = async (req, res) => {
    try {
        const { contactoId } = req.params;
        const { rows: mio } = await pool.query(
            `SELECT c.id FROM empresa_contacto c JOIN empresa e ON e.id = c.empresa_id
              WHERE c.id = $1 AND e.organizacion_id IS NOT DISTINCT FROM $2::uuid`,
            [contactoId, req.user?.organizacionId || null]);
        if (!mio.length) return res.status(404).json({ success: false, message: 'Contacto no encontrado.' });

        const sets = [], vals = [];
        if (Object.hasOwn(req.body, 'nombre')) {
            const n = String(req.body.nombre || '').trim();
            if (!n) return res.status(400).json({ success: false, message: 'La persona necesita un nombre.' });
            sets.push(`nombre = $${vals.push(n)}`);
        }
        if (Object.hasOwn(req.body, 'rol')) {
            if (!ROLES.includes(req.body.rol)) {
                return res.status(400).json({ success: false, message: `Rol no válido. Debe ser: ${ROLES.join(', ')}.` });
            }
            sets.push(`rol = $${vals.push(req.body.rol)}`);
        }
        if (Object.hasOwn(req.body, 'externo')) sets.push(`externo = $${vals.push(req.body.externo === true)}`);
        if (Object.hasOwn(req.body, 'email')) sets.push(`email = $${vals.push(req.body.email?.trim() || null)}`);
        if (Object.hasOwn(req.body, 'telefono')) sets.push(`telefono = $${vals.push(req.body.telefono?.trim() || null)}`);
        if (Object.hasOwn(req.body, 'nota')) sets.push(`nota = $${vals.push(req.body.nota?.trim() || null)}`);
        // Se desactiva en vez de borrarse cuando ya pagó algo: ver eliminarContacto.
        if (Object.hasOwn(req.body, 'activo')) sets.push(`activo = $${vals.push(req.body.activo !== false)}`);
        if (Object.hasOwn(req.body, 'rut')) {
            const limpio = req.body.rut ? cleanRut(req.body.rut) : null;
            sets.push(`rut_encrypted = $${vals.push(limpio ? encrypt(limpio) : null)}`);
            sets.push(`rut_hash = $${vals.push(limpio ? generateHash(limpio) : null)}`);
        }
        if (!sets.length) return res.status(400).json({ success: false, message: 'No hay nada que cambiar.' });

        sets.push('updated_at = NOW()');
        vals.push(contactoId);
        const { rows } = await pool.query(
            `UPDATE empresa_contacto SET ${sets.join(', ')} WHERE id = $${vals.length}
             RETURNING id, nombre, rol, externo, email, telefono, nota, activo`, vals);

        await registrar(req, {
            modulo: 'crm', accion: 'editar', entidad: 'contacto', entidadId: contactoId,
            descripcion: `Editó al contacto «${rows[0].nombre}».`,
        });
        return res.json({ success: true, contacto: rows[0] });
    } catch (error) {
        console.error('❌ Error actualizando contacto:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo actualizar la persona.' });
    }
};

// Quien ya figura como pagador de una factura NO se borra: se desactiva.
// Borrarlo dejaría el cobro sin poder decir quién pagó, y eso es dato contable.
export const eliminarContacto = async (req, res) => {
    try {
        const { contactoId } = req.params;
        const { rows: mio } = await pool.query(
            `SELECT c.id, c.nombre FROM empresa_contacto c JOIN empresa e ON e.id = c.empresa_id
              WHERE c.id = $1 AND e.organizacion_id IS NOT DISTINCT FROM $2::uuid`,
            [contactoId, req.user?.organizacionId || null]);
        if (!mio.length) return res.status(404).json({ success: false, message: 'Contacto no encontrado.' });

        const { rows: [u] } = await pool.query(
            `SELECT COUNT(*)::int AS n FROM cobro_mensual WHERE pagado_por_contacto_id = $1`,
            [contactoId]);

        if (u.n > 0) {
            await pool.query(
                `UPDATE empresa_contacto SET activo = FALSE, updated_at = NOW() WHERE id = $1`,
                [contactoId]);
            await registrar(req, {
                modulo: 'crm', accion: 'editar', entidad: 'contacto', entidadId: contactoId,
                descripcion: `Desactivó a «${mio[0].nombre}» (figura como pagador de ${u.n} factura(s)).`,
            });
            return res.json({
                success: true, desactivado: true,
                message: `Figura como pagador de ${u.n} factura(s), así que se desactivó en vez de borrarse.`,
            });
        }

        await pool.query('DELETE FROM empresa_contacto WHERE id = $1', [contactoId]);
        await registrar(req, {
            modulo: 'crm', accion: 'eliminar', entidad: 'contacto', entidadId: contactoId,
            descripcion: `Eliminó al contacto «${mio[0].nombre}».`,
        });
        return res.json({ success: true, desactivado: false });
    } catch (error) {
        console.error('❌ Error eliminando contacto:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo eliminar la persona.' });
    }
};

// ---------------------------------------------------------------
// QUIÉN PAGÓ ESTA FACTURA
// ---------------------------------------------------------------
// Marca el cobro como pagado y deja registrado quién lo pagó. Es la respuesta a
// «¿quién me pagó por esa factura?», que hasta ahora no se podía contestar.
export const registrarPago = async (req, res) => {
    try {
        const { cobroId } = req.params;
        const { rows: cobro } = await pool.query(
            `SELECT c.id, c.empresa_id, c.folio, c.estado, e.razon_social
               FROM cobro_mensual c JOIN empresa e ON e.id = c.empresa_id
              WHERE c.id = $1 AND e.organizacion_id IS NOT DISTINCT FROM $2::uuid`,
            [cobroId, req.user?.organizacionId || null]);
        if (!cobro.length) return res.status(404).json({ success: false, message: 'Cobro no encontrado.' });

        const medio = MEDIOS.includes(req.body?.medioPago) ? req.body.medioPago : null;
        if (req.body?.medioPago && !medio) {
            return res.status(400).json({ success: false, message: `Medio de pago no válido. Debe ser: ${MEDIOS.join(', ')}.` });
        }

        // El pagador puede venir como contacto ya guardado o como nombre suelto.
        // Las dos formas sirven: obligar a crear un contacto para poder marcar un
        // pago haría que nadie marcara los pagos.
        let contactoId = req.body?.contactoId || null;
        let nombre = String(req.body?.pagadoPor || '').trim() || null;

        if (contactoId) {
            const { rows: c } = await pool.query(
                `SELECT nombre FROM empresa_contacto WHERE id = $1 AND empresa_id = $2`,
                [contactoId, cobro[0].empresa_id]);
            if (!c.length) {
                return res.status(400).json({ success: false, message: 'Esa persona no es contacto de esta empresa.' });
            }
            // El nombre se congela acá: si mañana el contacto cambia, el registro
            // de quién pagó esta factura sigue diciendo lo mismo.
            nombre = c[0].nombre;
        }

        const fecha = req.body?.fechaPago ? new Date(req.body.fechaPago) : new Date();
        if (Number.isNaN(fecha.getTime())) {
            return res.status(400).json({ success: false, message: 'La fecha de pago no es válida.' });
        }

        const { rows } = await pool.query(
            `UPDATE cobro_mensual
                SET estado = 'PAGADA', fecha_pago = $1,
                    pagado_por_contacto_id = $2, pagado_por_nombre = $3, medio_pago = $4,
                    updated_at = NOW()
              WHERE id = $5
              RETURNING id, folio, fecha_pago, pagado_por_nombre, medio_pago`,
            [fecha, contactoId, nombre, medio, cobroId]);

        await registrar(req, {
            modulo: 'cobros', accion: 'editar', entidad: 'cobro', entidadId: cobroId,
            descripcion: `Marcó pagada la factura ${cobro[0].folio || '(sin folio)'} de ${cobro[0].razon_social}` +
                         (nombre ? `, pagada por ${nombre}.` : '.'),
            detalle: { medioPago: medio, pagadoPor: nombre },
        });
        return res.json({ success: true, cobro: rows[0] });
    } catch (error) {
        console.error('❌ Error registrando el pago:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo registrar el pago.' });
    }
};

// ---------------------------------------------------------------
// LAS ÚLTIMAS FACTURAS DE UNA EMPRESA
// ---------------------------------------------------------------
// «Una empresa puede ser facturada hasta 4 veces al mes, y si se le hizo una
// nota de crédito debe salir que fue anulada.»
//
// Por eso NO se muestra solo la del mes: se muestran las últimas, cada una con
// su folio, su fecha, quién la pagó y si quedó anulada.
export const ultimasFacturas = async (req, res) => {
    try {
        const { empresaId } = req.params;
        if (!await empresaEsMia(empresaId, req.user?.organizacionId)) {
            return res.status(404).json({ success: false, message: 'Empresa no encontrada.' });
        }
        const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 3, 1), 12);

        const { rows } = await pool.query(
            `SELECT c.id, c.periodo, c.folio, c.tipo_dte, c.estado,
                    c.monto_esperado, c.monto_facturado, c.monto_anulado,
                    c.fecha_emision, c.fecha_vencimiento, c.fecha_pago,
                    c.pagado_por_nombre, c.medio_pago
               FROM cobro_mensual c
              WHERE c.empresa_id = $1
              ORDER BY COALESCE(c.fecha_emision, c.periodo) DESC, c.created_at DESC
              LIMIT $2`, [empresaId, limite]);

        return res.json({
            success: true,
            facturas: rows.map(f => ({
                id: f.id,
                periodo: f.periodo,
                folio: f.folio,
                tipoDte: f.tipo_dte,
                estado: f.estado,
                // `anulada` es lo que la pantalla necesita saber de un vistazo:
                // hubo nota de crédito sobre esta factura.
                anulada: f.estado === 'ANULADA' || Number(f.monto_anulado || 0) > 0,
                montoAnulado: Number(f.monto_anulado || 0),
                montoEsperado: Number(f.monto_esperado || 0),
                montoFacturado: Number(f.monto_facturado || 0),
                fechaEmision: f.fecha_emision,
                fechaVencimiento: f.fecha_vencimiento,
                fechaPago: f.fecha_pago,
                pagadoPor: f.pagado_por_nombre,
                medioPago: f.medio_pago,
            })),
        });
    } catch (error) {
        console.error('❌ Error listando las últimas facturas:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudieron cargar las facturas.' });
    }
};

// ---------------------------------------------------------------
// BUSCAR EMPRESAS · para vincular una tarea a un cliente
// ---------------------------------------------------------------
// Devuelve solo id, razón social y RUT. La lista completa del CRM trae decenas
// de campos por empresa —cobranza, F29, renta, credenciales— y para elegir un
// nombre en un desplegable eso es traer un camión para mover una caja.
export const buscarEmpresas = async (req, res) => {
    try {
        const q = String(req.query.q || '').trim();
        if (q.length < 2) return res.json({ success: true, empresas: [] });

        const { rows } = await pool.query(
            `SELECT id, razon_social, rut_encrypted, activo
               FROM empresa
              WHERE organizacion_id IS NOT DISTINCT FROM $1::uuid
                AND es_principal = false
                AND razon_social ILIKE $2
              ORDER BY activo DESC, razon_social
              LIMIT 8`,
            // Se escapan los comodines de LIKE para que un guion bajo o un %
            // escritos por el usuario se busquen como texto y no como patrón.
            [req.user?.organizacionId || null, `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`]);

        return res.json({
            success: true,
            empresas: rows.map(e => ({
                id: e.id,
                razonSocial: e.razon_social,
                rut: verRut(e.rut_encrypted),
                activo: e.activo !== false,
            })),
        });
    } catch (error) {
        console.error('❌ Error buscando empresas:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo buscar.' });
    }
};
