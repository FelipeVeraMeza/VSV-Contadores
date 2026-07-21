import { pool } from '../database/db.js';
import { encrypt, generateHash } from '../utils/crypto.js';
import { cleanRut } from '../lib/rut.js';
import {
    upsertComprobante, eliminarComprobanteDeDocumento, construirGlosa,
    normalizarClase, normalizarRut, normalizarFolio, tipoLibro, esNota, TIPO_DTE_LABEL,
} from '../utils/comprobantes.js';

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
    const { empresa_id, tipo_movimiento, rut, nombre, tipo_documento, folio, fecha, descripcion,
            lineas = [], ref_folio, ref_tipo_dte, ref_razon } = req.body;
    const usuario = req.user || {};

    if (!folio || !lineas.length) {
        return res.status(400).json({ ok: false, error: 'folio y lineas son requeridos' });
    }

    const tipoDteMap = { '33':33, '34':34, '61':61, '56':56, '39':39, 'HON':39, 'OTRO':99 };
    const tipo_dte   = tipoDteMap[tipo_documento] ?? 33;
    const exenta     = tipo_dte === 34 || tipo_dte === 39;

    // Una nota de crédito/débito debe declarar qué documento afecta.
    if (esNota(tipo_dte) && !normalizarFolio(ref_folio)) {
        return res.status(400).json({
            ok: false,
            error: `Falta indicar a qué documento afecta esta ${TIPO_DTE_LABEL[tipo_dte].toLowerCase()}.`,
        });
    }

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
        const clase = normalizarClase(tipo_movimiento);
        const glosa = construirGlosa({
            clase, tipoDte: tipo_dte, folio, razonSocial: nombre, rut,
            refTipoDte: ref_tipo_dte, refFolio: ref_folio, descripcion,
        });

        await upsertComprobante(client, {
            empresaId: empId, clase, tipoDte: tipo_dte, folio, rutContraparte: rut,
            fecha: fecha_emision, glosa, lineas, usuario,
            refFolio: ref_folio, refTipoDte: ref_tipo_dte, refRazon: ref_razon,
        });

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
    const { tipo_movimiento, empresa_id } = req.query;
    const empId = (!empresa_id || empresa_id === 'ALL' || empresa_id === 'null') ? null : empresa_id;

    const esVenta = tipo_movimiento === 'ventas';
    const tabla = esVenta
        ? (empId === null ? 'documentos_emitidos'  : 'documentos_emitidos_empresa')
        : (empId === null ? 'documentos_recibidos' : 'documentos_recibidos_empresa');
    const colRut = esVenta ? 'rut_cliente' : 'rut_proveedor';

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Se lee la identidad completa ANTES de borrar: el comprobante se
        // localiza por (empresa, clase, tipo_dte, folio, rut), no por el texto
        // de la glosa. Antes se borraban todos los comprobantes cuyo folio
        // coincidiera, así que eliminar una compra se llevaba también la venta
        // del mismo folio y la del año anterior.
        const { rows: [doc] } = await client.query(
            `SELECT folio, tipo_dte, ${colRut} AS rut FROM ${tabla} WHERE id = $1`, [id]
        );

        const { rowCount } = await client.query(`DELETE FROM ${tabla} WHERE id = $1`, [id]);

        if (doc) {
            await eliminarComprobanteDeDocumento(client, {
                empresaId: empId,
                clase: tipo_movimiento,
                tipoDte: doc.tipo_dte,
                folio: doc.folio,
                rutContraparte: doc.rut,
            });
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

        // Identidad anterior completa: si cambia el folio, el tipo o el RUT, hay
        // que reubicar el comprobante por la clave entera, no solo por el folio.
        const { rows: [old] } = await client.query(
            `SELECT folio, tipo_dte, ${colRut} AS rut FROM ${tabla} WHERE id = $1`, [id]
        );
        if (!old) {
            await client.query('ROLLBACK');
            return res.status(404).json({ ok: false, error: 'Documento no encontrado.' });
        }

        // UPDATE del documento (todas las tablas tienen razón social y montos)
        await client.query(
            `UPDATE ${tabla} SET ${colRut} = $1, ${colRazon} = $2, tipo_dte = $3, folio = $4, fecha_emision = $5,
                    monto_neto = $6, monto_iva = $7, monto_total = $8 WHERE id = $9`,
            [rut || '', nombre || '', tipo_dte, parseInt(folio) || 0, fecha_emision, neto, iva, total, id]
        );

        // Reapuntar el comprobante asociado a la nueva identidad del documento.
        const clase = normalizarClase(tipo_movimiento);
        const glosa = construirGlosa({ clase, tipoDte: tipo_dte, folio, razonSocial: nombre, rut });
        await client.query(
            `UPDATE comprobantes
                SET glosa = $1, fecha = COALESCE($2, fecha),
                    tipo_dte = $3, folio = $4, rut_contraparte = $5, tipo = $6
              WHERE empresa_id      IS NOT DISTINCT FROM $7
                AND clase           IS NOT DISTINCT FROM $8
                AND tipo_dte        IS NOT DISTINCT FROM $9
                AND folio           IS NOT DISTINCT FROM $10
                AND rut_contraparte IS NOT DISTINCT FROM $11`,
            [glosa, fecha_emision,
             tipo_dte, normalizarFolio(folio), normalizarRut(rut), tipoLibro(clase, tipo_dte),
             empId, clase, old.tipo_dte, normalizarFolio(old.folio), normalizarRut(old.rut)]
        );

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