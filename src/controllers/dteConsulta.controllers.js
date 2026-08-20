import { pool } from '../database/db.js';
import { encrypt, generateHash } from '../utils/crypto.js';
import { cleanRut } from '../lib/rut.js';
import {
    upsertComprobante, eliminarComprobanteDeDocumento, construirGlosa,
    normalizarClase, normalizarRut, normalizarFolio, tipoLibro, esNota, TIPO_DTE_LABEL,
} from '../utils/comprobantes.js';
import { empresaPermitida, empresasVisibles, veSoloAsignadas } from '../utils/scope.js';

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

// ============================================================================
// DÓNDE VIVE CADA LIBRO DE COMPRAS Y VENTAS
// ----------------------------------------------------------------------------
// La firma (VOLLAIRE & OLIVOS SIMPLE PYME LTDA, empresa.es_principal = true)
// lleva SU propio libro en las tablas base:
//     documentos_emitidos   → sus ventas.   empresa_id = el CLIENTE al que le
//                             factura (así lo enlaza el Cobro del Mes), no ella.
//     documentos_recibidos  → sus compras.  empresa_id = la firma.
//
// Las demás empresas llevan el suyo en:
//     documentos_emitidos_empresa / documentos_recibidos_empresa
//     con empresa_id = la empresa dueña del documento.
//
// Por eso el libro se elige por QUÉ empresa está seleccionada (la principal o
// no), y no por si hay o no una seleccionada.
// ============================================================================
// Devuelve qué libro corresponde leer/escribir:
//   'firma'       → la empresa principal (o sin empresa al registrar a mano)
//   'empresa'     → una empresa administrada
//   'consolidado' → TODAS: el libro de la firma más el de cada empresa. Antes el
//                   consolidado mostraba solo el libro de la firma, así que la opción
//                   "Todas las empresas" escondía las compras y ventas de las demás.
const libroDe = async (empId, ejecutor = pool) => {
    if (!empId) return 'consolidado';
    const { rows } = await ejecutor.query('SELECT es_principal FROM empresa WHERE id = $1', [empId]);
    return rows[0]?.es_principal === true ? 'firma' : 'empresa';
};

// Para escribir siempre hay que elegir una tabla concreta: sin empresa (registro
// manual global) va al libro de la firma, igual que antes.
const esLibroDeLaFirma = async (empId, ejecutor = pool) => (await libroDe(empId, ejecutor)) !== 'empresa';

const tablaDocumentos = (esVenta, libroFirma) => esVenta
    ? (libroFirma ? 'documentos_emitidos'  : 'documentos_emitidos_empresa')
    : (libroFirma ? 'documentos_recibidos' : 'documentos_recibidos_empresa');

// ============================================================================
// ALCANCE POR ROL
// ----------------------------------------------------------------------------
// Estas rutas solo exigían `requireSession`, así que un rol Cliente podía pedir
// `empresa_id=ALL`, caer en la rama "consolidado" y leer las compras y ventas de
// TODA la organización, no solo de las empresas que tiene asignadas. Viola el
// aislamiento por empresa (el usuario solo debe ver lo suyo).
//
// Regla: el Administrador ve el consolidado de su organización; un Cliente o
// Consultor debe pedir una empresa concreta Y tenerla asignada en `audita`.
// Devuelve null si puede seguir, o el motivo del rechazo.
//
// ⚠️ CORREGIDO EL 19-08-2026. Esta función abría con
// `if (rol === 'Administrador') return null;`, y como quien entra al equipo
// empezando desde cero TIENE que ser Administrador para trabajar, la exención
// se comía la regla: se midió que veía las compras y ventas de las 99 empresas
// de la oficina. El recorte es por usuario (`ve_solo_empresas_asignadas`), no
// por rol, y ahora lo resuelve `empresaPermitida` en un solo lugar para todo el
// sistema.
//
// Para el consolidado NO se rechaza: se acota más abajo a las empresas que la
// persona sí puede ver. Rechazarlo daría un error en pantalla cada vez que
// alguien abre el módulo, cuando lo correcto es que vea su propia lista (que
// puede estar vacía).
// ============================================================================
const rechazoDeAlcance = async (req, empId) => {
    if (empId) {
        const empresa = await empresaPermitida(req, empId);
        return empresa ? null : 'No tienes acceso a los documentos de esa empresa.';
    }
    // Consolidado
    if (req.user?.rol === 'Administrador' || veSoloAsignadas(req)) return null;
    return 'Debes seleccionar una empresa para ver sus documentos.';
};

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
        const contraparteId = await asegurarEmpresa(client, rut, nombre, usuario.organizacionId);

        // ── 1. Guardar el DOCUMENTO en el libro que corresponde ──────────────
        const libroFirma = await esLibroDeLaFirma(empId, client);
        const esVenta = tipo_movimiento === 'ventas';
        const tabla = tablaDocumentos(esVenta, libroFirma);

        // En el libro de la firma, empresa_id de una VENTA identifica al cliente
        // facturado (igual que las que carga el robot); en todo lo demás es la
        // empresa dueña del documento.
        const empresaDelDocumento = (libroFirma && esVenta) ? contraparteId : empId;

        if (esVenta) {
            await client.query(
                `INSERT INTO ${tabla}
                 (id, empresa_id, rut_cliente, razon_social_cliente, tipo_dte, folio, monto_neto, monto_iva, monto_total, fecha_emision)
                 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [empresaDelDocumento, rut || '', nombre || '', tipo_dte, parseInt(folio) || 0, monto_neto, monto_iva, monto_total, fecha_emision]
            );
        } else {
            await client.query(
                `INSERT INTO ${tabla}
                 (id, empresa_id, rut_proveedor, razon_social_proveedor, tipo_dte, folio, monto_neto, monto_iva, monto_total, fecha_emision)
                 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [empresaDelDocumento, rut || '', nombre || '', tipo_dte, parseInt(folio) || 0, monto_neto, monto_iva, monto_total, fecha_emision]
            );
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
    // El libro de la firma vive en las tablas base; el de las demás empresas en _empresa.
    const tabla = tablaDocumentos(esVenta, await esLibroDeLaFirma(empId));
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
// 0c. DESCONTABILIZAR (borra SOLO el asiento, conserva el documento)
// --------------------------------------------------------
// Deshace la contabilización: el documento vuelve a la lista como "Pendiente"
// y se puede contabilizar de nuevo. Es la operación que la gente espera del
// botón de la fila; `eliminarMovimiento` borra además el documento y eso hace
// perder una factura que vino del SII.
// ========================================================
export const descontabilizarMovimiento = async (req, res) => {
    const { id } = req.params;
    const { tipo_movimiento, empresa_id } = req.query;
    const empId = (!empresa_id || empresa_id === 'ALL' || empresa_id === 'null') ? null : empresa_id;

    const esVenta = tipo_movimiento === 'ventas';
    const tabla = tablaDocumentos(esVenta, await esLibroDeLaFirma(empId));
    const colRut = esVenta ? 'rut_cliente' : 'rut_proveedor';

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: [doc] } = await client.query(
            `SELECT folio, tipo_dte, ${colRut} AS rut FROM ${tabla} WHERE id = $1`, [id]
        );
        if (!doc) {
            await client.query('ROLLBACK');
            return res.status(404).json({ ok: false, error: 'Documento no encontrado.' });
        }

        // Misma identidad completa que usa el borrado: (empresa, clase, tipo_dte,
        // folio, rut). El documento NO se toca.
        const borrados = await eliminarComprobanteDeDocumento(client, {
            empresaId: empId,
            clase: tipo_movimiento,
            tipoDte: doc.tipo_dte,
            folio: doc.folio,
            rutContraparte: doc.rut,
        });

        await client.query('COMMIT');
        return res.json({
            ok: true,
            borrados,
            message: borrados > 0
                ? 'Asiento eliminado. El documento volvió a Pendiente.'
                : 'El documento no tenía asiento contabilizado.',
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error descontabilizando:', error.message);
        return res.status(500).json({ ok: false, error: 'Error al eliminar el asiento.' });
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
    // El libro de la firma vive en las tablas base; el de las demás empresas en _empresa.
    const tabla = tablaDocumentos(esVenta, await esLibroDeLaFirma(empId));
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

        const organizacionId = req.user?.organizacionId || null;
        const empId = empresa_id === 'ALL' ? null : empresa_id;

        const rechazo = await rechazoDeAlcance(req, empId);
        if (rechazo) return res.status(403).json({ ok: false, error: rechazo, documentos: [] });

        const libro = await libroDe(empId);

        // Recorte por usuario para el consolidado: quien solo ve lo asignado
        // no ve el libro de la firma, solo el de SUS empresas.
        const visibles = libro === 'consolidado' ? await empresasVisibles(req) : null;

        let query, values;
        if (libro === 'consolidado' && visibles) {
            if (!visibles.length) return res.json({ ok: true, documentos: [] });
            values = [visibles];
            query = `
                SELECT d.id, d.empresa_id, d.folio, d.tipo_dte, d.monto_neto, d.monto_iva, d.monto_total,
                       d.fecha_emision, d.url_pdf, d.rut_cliente,
                       d.razon_social_cliente AS razon_social
                FROM documentos_emitidos_empresa d
                WHERE d.empresa_id = ANY($1::uuid[])
                ORDER BY d.fecha_emision DESC;
            `;
        } else if (libro === 'consolidado') {
            // TODAS: las ventas de la firma más las de cada empresa administrada.
            values = [organizacionId];
            query = `
                SELECT d.id, d.empresa_id, d.folio, d.tipo_dte, d.monto_neto, d.monto_iva, d.monto_total,
                       d.fecha_emision, d.url_pdf, d.rut_cliente,
                       COALESCE(d.razon_social_cliente, e.razon_social) AS razon_social
                FROM documentos_emitidos d
                LEFT JOIN empresa e ON d.empresa_id = e.id
                WHERE d.empresa_id IS NULL OR e.organizacion_id IS NOT DISTINCT FROM $1::uuid
                UNION ALL
                SELECT d.id, d.empresa_id, d.folio, d.tipo_dte, d.monto_neto, d.monto_iva, d.monto_total,
                       d.fecha_emision, d.url_pdf, d.rut_cliente,
                       d.razon_social_cliente AS razon_social
                FROM documentos_emitidos_empresa d
                JOIN empresa e ON d.empresa_id = e.id
                WHERE e.organizacion_id IS NOT DISTINCT FROM $1::uuid
                ORDER BY fecha_emision DESC;
            `;
        } else if (libro === 'firma') {
            // Libro de VENTAS de la firma: son todas las facturas que emitió.
            // empresa_id apunta al cliente facturado, así que NO se filtra por él;
            // solo se acota a la organización (y se admiten los sin empresa).
            values = [organizacionId];
            query = `
                SELECT d.id, d.empresa_id, d.folio, d.tipo_dte, d.monto_neto, d.monto_iva, d.monto_total,
                       d.fecha_emision, d.url_pdf, d.rut_cliente,
                       COALESCE(d.razon_social_cliente, e.razon_social) AS razon_social
                FROM documentos_emitidos d
                LEFT JOIN empresa e ON d.empresa_id = e.id
                WHERE d.empresa_id IS NULL OR e.organizacion_id IS NOT DISTINCT FROM $1::uuid
                ORDER BY d.fecha_emision DESC;
            `;
        } else {
            // Libro de VENTAS de una empresa cliente: sus propias facturas emitidas.
            values = [empId, organizacionId];
            query = `
                SELECT d.id, d.empresa_id, d.folio, d.tipo_dte, d.monto_neto, d.monto_iva, d.monto_total,
                       d.fecha_emision, d.url_pdf, d.rut_cliente,
                       d.razon_social_cliente AS razon_social
                FROM documentos_emitidos_empresa d
                JOIN empresa e ON d.empresa_id = e.id
                WHERE d.empresa_id = $1 AND e.organizacion_id IS NOT DISTINCT FROM $2::uuid
                ORDER BY d.fecha_emision DESC;
            `;
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

        const organizacionId = req.user?.organizacionId || null;
        const empId = empresa_id === 'ALL' ? null : empresa_id;

        const rechazo = await rechazoDeAlcance(req, empId);
        if (rechazo) return res.status(403).json({ ok: false, error: rechazo, documentos: [] });

        const libro = await libroDe(empId);

        // Mismo recorte que en ventas: sin el libro de la firma.
        const visibles = libro === 'consolidado' ? await empresasVisibles(req) : null;

        let query, values;
        if (libro === 'consolidado' && visibles) {
            if (!visibles.length) return res.json({ ok: true, documentos: [] });
            values = [visibles];
            query = `
                SELECT d.id, d.empresa_id, d.rut_proveedor, d.razon_social_proveedor, d.tipo_dte, d.folio,
                       d.monto_neto, d.monto_iva, d.monto_total, d.fecha_emision, d.url_pdf
                FROM documentos_recibidos_empresa d
                WHERE d.empresa_id = ANY($1::uuid[])
                ORDER BY d.fecha_emision DESC;
            `;
        } else if (libro === 'consolidado') {
            // TODAS: las compras de la firma más las de cada empresa administrada.
            values = [organizacionId];
            query = `
                SELECT d.id, d.empresa_id, d.rut_proveedor, d.razon_social_proveedor, d.tipo_dte, d.folio,
                       d.monto_neto, d.monto_iva, d.monto_total, d.fecha_emision, d.url_pdf
                FROM documentos_recibidos d
                LEFT JOIN empresa e ON d.empresa_id = e.id
                WHERE d.empresa_id IS NULL OR e.organizacion_id IS NOT DISTINCT FROM $1::uuid
                UNION ALL
                SELECT d.id, d.empresa_id, d.rut_proveedor, d.razon_social_proveedor, d.tipo_dte, d.folio,
                       d.monto_neto, d.monto_iva, d.monto_total, d.fecha_emision, d.url_pdf
                FROM documentos_recibidos_empresa d
                JOIN empresa e ON d.empresa_id = e.id
                WHERE e.organizacion_id IS NOT DISTINCT FROM $1::uuid
                ORDER BY fecha_emision DESC;
            `;
        } else if (libro === 'firma') {
            // Libro de COMPRAS de la firma (empresa_id = la firma).
            values = [organizacionId];
            query = `
                SELECT d.id, d.empresa_id, d.rut_proveedor, d.razon_social_proveedor, d.tipo_dte, d.folio,
                       d.monto_neto, d.monto_iva, d.monto_total, d.fecha_emision, d.url_pdf
                FROM documentos_recibidos d
                LEFT JOIN empresa e ON d.empresa_id = e.id
                WHERE d.empresa_id IS NULL OR e.organizacion_id IS NOT DISTINCT FROM $1::uuid
                ORDER BY d.fecha_emision DESC;
            `;
        } else {
            // Libro de COMPRAS de una empresa cliente.
            values = [empId, organizacionId];
            query = `
                SELECT d.id, d.empresa_id, d.rut_proveedor, d.razon_social_proveedor, d.tipo_dte, d.folio,
                       d.monto_neto, d.monto_iva, d.monto_total, d.fecha_emision, d.url_pdf
                FROM documentos_recibidos_empresa d
                JOIN empresa e ON d.empresa_id = e.id
                WHERE d.empresa_id = $1 AND e.organizacion_id IS NOT DISTINCT FROM $2::uuid
                ORDER BY d.fecha_emision DESC;
            `;
        }

        const result = await pool.query(query, values);
        return res.json({ ok: true, documentos: result.rows });
    } catch (error) {
        console.error('❌ Error Compras:', error.message);
        return res.status(500).json({ ok: false, error: 'Error al obtener compras.' });
    }
};