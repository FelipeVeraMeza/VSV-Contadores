import { pool } from '../database/db.js';
import { encrypt, generateHash } from '../utils/crypto.js';
import { cleanRut } from '../lib/rut.js';

/**
 * Si el RUT no existe en `empresa`, lo crea como empresa nueva.
 * Se usa al registrar un documento: un cliente/proveedor desconocido queda dado de alta.
 * La búsqueda va por `rut_hash` (determinístico), no por `rut_encrypted` (IV aleatorio).
 *
 * IMPORTANTE: hay que setear `organizacion_id`. El CRM filtra por esa columna, así que
 * una empresa creada sin ella queda invisible en el listado.
 */
async function asegurarEmpresa(client, rut, nombre, organizacionId) {
    const rutLimpio = cleanRut(rut || '');
    if (!rutLimpio || rutLimpio.length < 3) return null;

    const rutHash = generateHash(rutLimpio);
    const { rows: [existe] } = await client.query(
        `SELECT id FROM empresa WHERE rut_hash = $1 LIMIT 1`, [rutHash]
    );
    if (existe) return existe.id;

    const rutEnc = encrypt(rutLimpio);
    if (!rutEnc) return null; // sin ENCRYPTION_KEY no damos de alta

    const { rows: [nueva] } = await client.query(
        `INSERT INTO empresa (id, razon_social, rut_encrypted, rut_hash, giro, regimen_tributario, tipo_cliente, organizacion_id)
         VALUES (gen_random_uuid(), $1, $2, $3, 'Por definir', 'Por definir', 'Empresa', $4) RETURNING id`,
        [(nombre || 'SIN RAZÓN SOCIAL').toUpperCase().slice(0, 255), rutEnc, rutHash, organizacionId || null]
    );
    console.log(`🆕 Empresa creada automáticamente: ${rutLimpio} — ${nombre || 'SIN RAZÓN SOCIAL'}`);
    return nueva.id;
}

// ========================================================
// 0. CREAR MOVIMIENTO MANUAL
// ========================================================
export const crearMovimientoManual = async (req, res) => {
    const { empresa_id, tipo_movimiento, rut, nombre, tipo_documento, folio, fecha, descripcion, lineas = [] } = req.body;
    const usuario = req.user || {};

    if (!folio || !lineas.length) {
        return res.status(400).json({ ok: false, error: 'folio y lineas son requeridos' });
    }

    const tipoDteMap = { '33':33, '34':34, '61':61, '56':56, '39':39, 'HON':39, 'OTRO':99 };
    const tipo_dte   = tipoDteMap[tipo_documento] ?? 33;
    const exenta     = tipo_dte === 34 || tipo_dte === 39;

    // Calcular montos desde las líneas
    const totalDebe  = lineas.reduce((s, l) => s + (Number(l.debe) || 0), 0);
    const totalHaber = lineas.reduce((s, l) => s + (Number(l.haber) || 0), 0);
    const monto_total = Math.max(totalDebe, totalHaber);

    // Detectar IVA buscando línea con cuenta IVA
    const lineaIva = lineas.find(l =>
        l.numero_cuenta?.includes('08-02') || l.nombre_cuenta?.toUpperCase().includes('IVA')
    );
    const monto_iva  = exenta ? 0 : (lineaIva ? (Number(lineaIva.debe) || Number(lineaIva.haber) || 0) : Math.round(monto_total * 19 / 119));
    const monto_neto = monto_total - monto_iva;
    const fecha_emision = fecha ? new Date(fecha) : new Date();
    const empId = (!empresa_id || empresa_id === 'ALL' || empresa_id === 'null') ? null : empresa_id;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // ── 0. Alta automática: si el RUT no existe en `empresa`, se crea ─────
        await asegurarEmpresa(client, rut, nombre, usuario.organizacionId);

        // ── 1. Guardar el DOCUMENTO en la tabla que corresponde ──────────────
        //    Sin empresa (global) → documentos_emitidos / documentos_recibidos
        //    Con empresa          → documentos_emitidos_empresa / documentos_recibidos_empresa
        if (tipo_movimiento === 'ventas') {
            if (empId === null) {
                await client.query(
                    `INSERT INTO documentos_emitidos
                     (id, empresa_id, rut_cliente, razon_social_cliente, tipo_dte, folio, monto_neto, fecha_emision)
                     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)`,
                    [empId, rut || '', nombre || '', tipo_dte, parseInt(folio) || 0, monto_neto, fecha_emision]
                );
            } else {
                await client.query(
                    `INSERT INTO documentos_emitidos_empresa
                     (id, empresa_id, rut_cliente, razon_social_cliente, tipo_dte, folio, monto_neto, monto_iva, monto_total, fecha_emision)
                     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    [empId, rut || '', nombre || '', tipo_dte, parseInt(folio) || 0, monto_neto, monto_iva, monto_total, fecha_emision]
                );
            }
        } else {
            if (empId === null) {
                await client.query(
                    `INSERT INTO documentos_recibidos
                     (id, empresa_id, rut_proveedor, razon_social_proveedor, tipo_dte, folio, monto_neto, monto_iva, monto_total, fecha_emision)
                     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    [empId, rut || '', nombre || '', tipo_dte, parseInt(folio) || 0, monto_neto, monto_iva, monto_total, fecha_emision]
                );
            } else {
                await client.query(
                    `INSERT INTO documentos_recibidos_empresa
                     (id, empresa_id, rut_proveedor, razon_social_proveedor, tipo_dte, folio, monto_neto, monto_iva, monto_total, fecha_emision)
                     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    [empId, rut || '', nombre || '', tipo_dte, parseInt(folio) || 0, monto_neto, monto_iva, monto_total, fecha_emision]
                );
            }
        }

        // ── 2. Guardar el ASIENTO como comprobante (→ Libro Diario / reportes) ─
        const TIPO_MAP = { ventas: 'INGRESO', honorarios: 'INGRESO', compras: 'EGRESO' };
        const tipoDb = (tipo_dte === 61 || tipo_dte === 56) ? 'TRASPASO' : (TIPO_MAP[tipo_movimiento] || 'INGRESO');
        const tipoLabel = tipo_movimiento === 'ventas' ? 'Venta' : tipo_movimiento === 'compras' ? 'Compra' : 'Honorario';
        const razon = (nombre || '').toUpperCase();
        const glosa = descripcion?.trim()
            ? `${descripcion.trim()} — Folio #${folio}`
            : `${tipoLabel} Folio #${folio}${razon || rut ? ` — ${razon || rut}` : ''}`;

        const empCond = empId === null ? 'empresa_id IS NULL' : 'empresa_id = $1';
        const { rows: [existing] } = await client.query(
            `SELECT id FROM comprobantes WHERE ${empCond} AND glosa ~ $${empId === null ? 1 : 2} LIMIT 1`,
            empId === null ? [`Folio #${folio}([^0-9]|$)`] : [empId, `Folio #${folio}([^0-9]|$)`]
        );

        let compId;
        if (existing) {
            await client.query(`DELETE FROM comprobantes_detalle WHERE comprobante_id = $1`, [existing.id]);
            await client.query(
                `UPDATE comprobantes SET fecha=$1, glosa=$2, tipo=$3, estado='Contabilizado',
                        contabilizado_por=$4, contabilizado_por_id=$5, contabilizado_at=NOW() WHERE id=$6`,
                [fecha_emision, glosa, tipoDb, usuario.nombre || null, usuario.usuarioId || null, existing.id]);
            compId = existing.id;
        } else {
            const { rows: [{ max_num }] } = await client.query(
                `SELECT COALESCE(MAX(numero_comprobante), 0) AS max_num FROM comprobantes WHERE ${empCond}`,
                empId === null ? [] : [empId]
            );
            const { rows: [comp] } = await client.query(
                `INSERT INTO comprobantes (id, empresa_id, numero_comprobante, fecha, tipo, glosa, estado,
                        contabilizado_por, contabilizado_por_id, contabilizado_at)
                 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'Contabilizado', $6, $7, NOW()) RETURNING id`,
                [empId, max_num + 1, fecha_emision, tipoDb, glosa, usuario.nombre || null, usuario.usuarioId || null]
            );
            compId = comp.id;
        }

        for (const l of lineas) {
            await client.query(
                `INSERT INTO comprobantes_detalle (id, comprobante_id, cuenta_codigo, rut_asociado, debe, haber)
                 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
                [compId, l.numero_cuenta, rut || null, Number(l.debe) || 0, Number(l.haber) || 0]
            );
        }

        await client.query('COMMIT');
        return res.json({ ok: true, message: 'Movimiento y asiento registrados correctamente.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error creando movimiento:', error.message);
        return res.status(500).json({ ok: false, error: 'Error al registrar el movimiento.' });
    } finally {
        client.release();
    }
};

// ========================================================
// 0b. ELIMINAR MOVIMIENTO MANUAL (documento + su asiento)
// ========================================================
export const eliminarMovimiento = async (req, res) => {
    const { id } = req.params;
    const { tipo_movimiento, empresa_id, folio } = req.query;
    const empId = (!empresa_id || empresa_id === 'ALL' || empresa_id === 'null') ? null : empresa_id;

    const tabla = tipo_movimiento === 'ventas'
        ? (empId === null ? 'documentos_emitidos'  : 'documentos_emitidos_empresa')
        : (empId === null ? 'documentos_recibidos' : 'documentos_recibidos_empresa');

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rowCount } = await client.query(`DELETE FROM ${tabla} WHERE id = $1`, [id]);

        // Borrar también el comprobante asociado (por folio) y su detalle
        if (folio) {
            const empCond = empId === null ? 'empresa_id IS NULL' : 'empresa_id = $2';
            const { rows } = await client.query(
                `SELECT id FROM comprobantes WHERE glosa ~ $1 AND ${empCond}`,
                empId === null ? [`Folio #${folio}([^0-9]|$)`] : [`Folio #${folio}([^0-9]|$)`, empId]
            );
            for (const r of rows) {
                await client.query(`DELETE FROM comprobantes_detalle WHERE comprobante_id = $1`, [r.id]);
                await client.query(`DELETE FROM comprobantes WHERE id = $1`, [r.id]);
            }
        }

        await client.query('COMMIT');
        if (rowCount === 0) return res.status(404).json({ ok: false, error: 'Documento no encontrado.' });
        return res.json({ ok: true, message: 'Movimiento eliminado correctamente.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error eliminando movimiento:', error.message);
        return res.status(500).json({ ok: false, error: 'Error al eliminar el movimiento.' });
    } finally {
        client.release();
    }
};

// ========================================================
// 0c. EDITAR DATOS DEL DOCUMENTO (rut, razón, tipo, folio, fecha)
// ========================================================
export const editarMovimiento = async (req, res) => {
    const { id } = req.params;
    const { tipo_movimiento, empresa_id, rut, nombre, tipo_documento, folio, fecha,
            monto_neto, monto_iva, monto_total } = req.body;
    const empId = (!empresa_id || empresa_id === 'ALL' || empresa_id === 'null') ? null : empresa_id;

    const tipoDteMap = { '33':33, '34':34, '61':61, '56':56, '39':39, 'HON':39, 'OTRO':99 };
    const tipo_dte = tipoDteMap[tipo_documento] ?? (parseInt(tipo_documento) || 33);
    const fecha_emision = fecha ? new Date(fecha) : null;
    const neto  = Number(monto_neto)  || 0;
    const iva   = Number(monto_iva)   || 0;
    const total = Number(monto_total) || (neto + iva);

    const esVenta = tipo_movimiento === 'ventas';
    const tabla = esVenta
        ? (empId === null ? 'documentos_emitidos'  : 'documentos_emitidos_empresa')
        : (empId === null ? 'documentos_recibidos' : 'documentos_recibidos_empresa');
    const colRut   = esVenta ? 'rut_cliente' : 'rut_proveedor';
    const colRazon = esVenta ? 'razon_social_cliente' : 'razon_social_proveedor';

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Folio anterior para reubicar el comprobante asociado
        const { rows: [old] } = await client.query(`SELECT folio FROM ${tabla} WHERE id = $1`, [id]);
        if (!old) {
            await client.query('ROLLBACK');
            return res.status(404).json({ ok: false, error: 'Documento no encontrado.' });
        }
        const folioViejo = old.folio;

        // UPDATE del documento (todas las tablas tienen razón social y montos)
        await client.query(
            `UPDATE ${tabla} SET ${colRut} = $1, ${colRazon} = $2, tipo_dte = $3, folio = $4, fecha_emision = $5,
                    monto_neto = $6, monto_iva = $7, monto_total = $8 WHERE id = $9`,
            [rut || '', nombre || '', tipo_dte, parseInt(folio) || 0, fecha_emision, neto, iva, total, id]
        );

        // Actualizar el comprobante asociado (glosa con nuevo folio/razón y fecha)
        const tipoLabel = esVenta ? 'Venta' : (tipo_movimiento === 'compras' ? 'Compra' : 'Honorario');
        const sufijo = (nombre || '').toUpperCase() || rut || '';
        const glosa = `${tipoLabel} Folio #${folio}${sufijo ? ` — ${sufijo}` : ''}`;
        const empCond = empId === null ? 'empresa_id IS NULL' : 'empresa_id = $2';
        const { rows: comps } = await client.query(
            `SELECT id FROM comprobantes WHERE glosa ~ $1 AND ${empCond}`,
            empId === null ? [`Folio #${folioViejo}([^0-9]|$)`] : [`Folio #${folioViejo}([^0-9]|$)`, empId]
        );
        for (const c of comps) {
            await client.query(
                `UPDATE comprobantes SET glosa = $1, fecha = COALESCE($2, fecha) WHERE id = $3`,
                [glosa, fecha_emision, c.id]
            );
        }

        await client.query('COMMIT');
        return res.json({ ok: true, message: 'Documento actualizado correctamente.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error editando movimiento:', error.message);
        return res.status(500).json({ ok: false, error: 'Error al actualizar el documento.' });
    } finally {
        client.release();
    }
};

// ========================================================
// 1. CONTROLADOR DE VENTAS (Historial)
// ========================================================
export const consultarHistorialBunkerController = async (req, res) => {
    try {
        const { empresa_id } = req.query;
        if (!empresa_id) {
            return res.status(400).json({ ok: false, error: "Falta el identificador de la empresa." });
        }

        let query = "";
        let values = [];

        // 🌐 BÓVEDA GLOBAL: Consulta la tabla general antigua
        if (empresa_id === 'ALL') {
            query = `
                SELECT d.id, d.folio, d.tipo_dte, d.monto_neto, d.monto_iva, d.monto_total, d.fecha_emision, d.url_pdf,
                       d.rut_cliente, COALESCE(d.razon_social_cliente, e.razon_social) AS razon_social
                FROM documentos_emitidos d
                LEFT JOIN empresa e ON d.empresa_id = e.id
                ORDER BY d.fecha_emision DESC;
            `;
        } else {
            // 🏢 EMPRESA ESPECÍFICA: Consulta la tabla NUEVA que llena el robot
            query = `
                SELECT *, razon_social_cliente AS razon_social
                FROM documentos_emitidos_empresa
                WHERE empresa_id = $1
                ORDER BY fecha_emision DESC;
            `;
            values = [empresa_id];
        }

        const result = await pool.query(query, values);
        return res.json({ ok: true, documentos: result.rows });
    } catch (error) {
        console.error('❌ Error Ventas:', error.message);
        return res.status(500).json({ ok: false, error: 'Error al obtener ventas.' });
    }
};

// ========================================================
// 2. CONTROLADOR DE COMPRAS (Recibidos)
// ========================================================
export const consultarComprasBunkerController = async (req, res) => {
    try {
        const { empresa_id } = req.query;
        if (!empresa_id) {
            return res.status(400).json({ ok: false, error: "Falta el identificador de la empresa." });
        }

        let query = "";
        let values = [];

        // 🌐 BÓVEDA GLOBAL: Consulta la tabla general antigua
        if (empresa_id === 'ALL') {
            query = `
                SELECT id, rut_proveedor, razon_social_proveedor, tipo_dte, folio, 
                       monto_neto, monto_iva, monto_total, fecha_emision, url_pdf
                FROM documentos_recibidos
                ORDER BY fecha_emision DESC;
            `;
        } else {
            // 🏢 EMPRESA ESPECÍFICA: Consulta la tabla NUEVA que llena el robot
            query = `
                SELECT * FROM documentos_recibidos_empresa
                WHERE empresa_id = $1
                ORDER BY fecha_emision DESC;
            `;
            values = [empresa_id];
        }

        const result = await pool.query(query, values);
        return res.json({ ok: true, documentos: result.rows });
    } catch (error) {
        console.error('❌ Error Compras:', error.message);
        return res.status(500).json({ ok: false, error: 'Error al obtener compras.' });
    }
};