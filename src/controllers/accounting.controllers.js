import { pool } from "../database/db.js";
import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import { decrypt } from '../utils/crypto.js';
import { clienteSinEmpresa, empresaPermitida, empresasVisibles, empresaEsValida, veSoloAsignadas } from '../utils/scope.js';
import { registrarMovimientoCaja } from '../utils/caja.js';
import {
    upsertComprobante, construirGlosa, buscarDocumentosAfectables,
    normalizarClase, normalizarTipoDte, normalizarFolio, esNota, TIPO_DTE_LABEL,
} from '../utils/comprobantes.js';

// =============================================================================
// EL PORTERO DE ESTE MÓDULO
// -----------------------------------------------------------------------------
// Hasta el 19-08-2026 los endpoints de acá tomaban `empresaId` del query y lo
// usaban tal cual: no comprobaban ni que la empresa fuera de la organización de
// quien preguntaba, ni que la tuviera asignada. Bastaba escribir el id en la
// URL para leer la contabilidad de cualquier empresa.
//
// `puedeVerEmpresa` resuelve las dos cosas de una vez y devuelve el motivo del
// rechazo, o null si puede seguir. Va al principio de CADA endpoint que reciba
// una empresa concreta.
// =============================================================================
const puedeVerEmpresa = async (req, empresaId) => {
    if (!empresaEsValida(empresaId)) return null;   // vista consolidada: se acota aparte
    const empresa = await empresaPermitida(req, empresaId);
    return empresa ? null : 'No tienes acceso a la contabilidad de esa empresa.';
};

// Respuesta única para el rechazo, para que todos los endpoints contesten igual.
const sinAcceso = (res, motivo) => res.status(403).json({ ok: false, message: motivo });

export const getAccountingMetrics = async (req, res) => {
    const { empresaId } = req.query;
    
    if (!empresaId || empresaId === 'undefined') {
        return res.status(400).json({ message: "ID de entidad no válido para el búnker" });
    }

    try {
        res.json({
            totalActivos: 15500000,
            totalPasivos: 8200000,
            patrimonio: 7300000,
            asientosMes: 48,
            variacion: "+12.5%",
            status: "Sincronizado"
        });
    } catch (error) {
        console.error("❌ Error en Métricas:", error);
        res.status(500).json({ message: "Fallo en el cálculo de estados financieros" });
    }
};

export const getChartOfAccounts = async (req, res) => {
    const { empresaId } = req.query;
    // 🔒 Un cliente sin empresa no ve el plan global del búnker
    if (clienteSinEmpresa(req, empresaId)) return res.json({ plan: [] });
    const motivo = await puedeVerEmpresa(req, empresaId);
    if (motivo) return sinAcceso(res, motivo);
    try {
        const usarEmpresa = empresaEsValida(empresaId);
        // Sin empresa seleccionada la consulta no llevaba filtro: devolvía el plan de
        // cuentas de TODAS las empresas del sistema, también las de otras
        // organizaciones. Ahora "global" se acota a las empresas de la organización
        // (más las cuentas base compartidas, empresa_id IS NULL).
        //
        // Y para quien solo ve lo asignado, "global" se acota además a SUS
        // empresas: las cuentas base compartidas quedan fuera porque no son suyas.
        const visibles = usarEmpresa ? null : await empresasVisibles(req);

        let query, params;
        if (usarEmpresa) {
            query = `SELECT id, codigo, descripcion, tipo_cuenta, grupo, normativa, clasificacion_contable, es_editable
                     FROM plan_cuentas
                     WHERE empresa_id = $1 OR empresa_id IS NULL
                     ORDER BY empresa_id NULLS LAST, codigo ASC`;
            params = [empresaId];
        } else if (visibles) {
            query = `SELECT id, codigo, descripcion, tipo_cuenta, grupo, normativa, clasificacion_contable, es_editable
                     FROM plan_cuentas
                     WHERE empresa_id = ANY($1::uuid[])
                     ORDER BY codigo ASC`;
            params = [visibles];
        } else {
            query = `SELECT id, codigo, descripcion, tipo_cuenta, grupo, normativa, clasificacion_contable, es_editable
                     FROM plan_cuentas
                     WHERE empresa_id IS NULL
                        OR empresa_id IN (
                              SELECT id FROM empresa
                               WHERE organizacion_id IS NOT DISTINCT FROM $1::uuid)
                     ORDER BY empresa_id NULLS LAST, codigo ASC`;
            params = [req.user?.organizacionId || null];
        }

        const { rows } = await pool.query(query, params);
        res.json({ plan: rows });
    } catch (error) {
        console.error("❌ Error al obtener plan de cuentas:", error.message);
        res.status(500).json({ message: "Error al obtener plan de cuentas" });
    }
};

export const crearCuenta = async (req, res) => {
    const { empresaId, codigo, descripcion, tipo_cuenta, normativa = 'LOCAL', grupo } = req.body;
    if (!codigo || !descripcion || !tipo_cuenta) {
        return res.status(400).json({ message: "codigo, descripcion y tipo_cuenta son requeridos" });
    }
    const motivo = await puedeVerEmpresa(req, empresaId);
    if (motivo) return sinAcceso(res, motivo);
    try {
        const { rows: [exists] } = await pool.query(
            `SELECT id FROM plan_cuentas WHERE codigo = $1 AND (empresa_id = $2 OR empresa_id IS NULL)`,
            [codigo, empresaId || null]
        );
        if (exists) return res.status(409).json({ message: `El código ${codigo} ya existe en el plan de cuentas.` });

        const { rows: [nueva] } = await pool.query(
            `INSERT INTO plan_cuentas (id, empresa_id, codigo, descripcion, tipo_cuenta, normativa, grupo, es_editable)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, true) RETURNING *`,
            [empresaId || null, codigo, descripcion.toUpperCase(), tipo_cuenta, normativa, grupo || null]
        );
        res.status(201).json({ cuenta: nueva });
    } catch (error) {
        console.error("❌ Error creando cuenta:", error.message);
        res.status(500).json({ message: "Error al crear la cuenta" });
    }
};

// Las cuentas se identifican por id, no por empresa, así que la comprobación va
// contra la empresa DUEÑA de la cuenta. Sin esto, sabiendo el id se podía editar
// o borrar una cuenta de cualquier empresa.
const cuentaFueraDeAlcance = async (req, cuentaId) => {
    let rows;
    // Un id con formato inválido hace fallar la consulta; se trata como
    // "no existe" y lo resuelve el 404 que ya tenía cada endpoint.
    try { ({ rows } = await pool.query('SELECT empresa_id FROM plan_cuentas WHERE id = $1', [cuentaId])); }
    catch { return null; }
    if (!rows.length) return null;
    const empresaId = rows[0].empresa_id;
    if (!empresaId) {                                  // cuenta base compartida
        return veSoloAsignadas(req) ? 'Esa cuenta no es de tus empresas.' : null;
    }
    return await puedeVerEmpresa(req, empresaId);
};

export const editarCuenta = async (req, res) => {
    const { id } = req.params;
    const { descripcion, tipo_cuenta, normativa, grupo } = req.body;
    if (!descripcion) return res.status(400).json({ message: "descripcion es requerida" });
    const motivo = await cuentaFueraDeAlcance(req, id);
    if (motivo) return sinAcceso(res, motivo);
    try {
        const { rows: [cuenta] } = await pool.query(
            `UPDATE plan_cuentas SET descripcion=$1, tipo_cuenta=COALESCE($2, tipo_cuenta), normativa=COALESCE($3, normativa), grupo=COALESCE($4, grupo)
             WHERE id=$5 AND es_editable=true RETURNING *`,
            [descripcion.toUpperCase(), tipo_cuenta, normativa, grupo, id]
        );
        if (!cuenta) return res.status(404).json({ message: "Cuenta no encontrada o no editable" });
        res.json({ cuenta });
    } catch (error) {
        console.error("❌ Error editando cuenta:", error.message);
        res.status(500).json({ message: "Error al editar la cuenta" });
    }
};

export const eliminarCuenta = async (req, res) => {
    const { id } = req.params;
    const motivo = await cuentaFueraDeAlcance(req, id);
    if (motivo) return sinAcceso(res, motivo);
    try {
        const { rowCount } = await pool.query(
            `DELETE FROM plan_cuentas WHERE id=$1 AND es_editable=true`,
            [id]
        );
        if (rowCount === 0) return res.status(404).json({ message: "Cuenta no encontrada o protegida" });
        res.json({ success: true });
    } catch (error) {
        console.error("❌ Error eliminando cuenta:", error.message);
        res.status(500).json({ message: "Error al eliminar la cuenta" });
    }
};

export const eliminarComprobante = async (req, res) => {
    const { id } = req.params;
    // Igual que con las cuentas: el comprobante se pide por id, así que la
    // comprobación va contra la empresa a la que pertenece.
    let duenio;
    try { ({ rows: [duenio] } = await pool.query('SELECT empresa_id FROM comprobantes WHERE id = $1', [id])); }
    catch { return res.status(404).json({ message: 'Comprobante no encontrado' }); }
    if (duenio?.empresa_id) {
        const motivo = await puedeVerEmpresa(req, duenio.empresa_id);
        if (motivo) return sinAcceso(res, motivo);
    } else if (duenio && veSoloAsignadas(req)) {
        // Comprobante sin empresa: es de la carga global de la firma, no suyo.
        return sinAcceso(res, 'Ese comprobante no pertenece a tus empresas.');
    }
    try {
        await pool.query(`DELETE FROM comprobantes_detalle WHERE comprobante_id = $1`, [id]);
        const { rowCount } = await pool.query(`DELETE FROM comprobantes WHERE id = $1`, [id]);
        if (rowCount === 0) return res.status(404).json({ message: 'Comprobante no encontrado' });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Error eliminando comprobante:', error.message);
        res.status(500).json({ message: 'Error al eliminar el comprobante' });
    }
};

export const guardarComprobante = async (req, res) => {
    const {
        empresaId, tipo, clase, tipoDte, fecha, glosa, lineas, folio, rutAsociado,
        refFolio, refTipoDte, refRazon,
        // Opcional: marcar el documento como cobrado/pagado en el mismo acto.
        // { medio, fecha, monto, nombre } — ver más abajo.
        pago,
    } = req.body;
    const usuario = req.user || {};
    const empId = (empresaId === 'ALL' || empresaId === 'undefined') ? null : (empresaId || null);
    if (!lineas?.length) {
        return res.status(400).json({ message: "lineas son requeridas" });
    }
    const motivo = await puedeVerEmpresa(req, empId);
    if (motivo) return sinAcceso(res, motivo);

    // UN ASIENTO SIN EMPRESA NO SE GUARDA. Nunca, para nadie.
    //
    // Antes esto solo frenaba a quien ve únicamente sus empresas asignadas; el
    // resto podía contabilizar con «Todas las empresas» puesto en el selector y
    // el asiento quedaba con `empresa_id` en NULL: sin dueño, invisible al
    // elegir cualquier empresa y visible solo en el consolidado. El 25-08-2026
    // había 29 comprobantes así, y no era un caso de laboratorio — es lo que
    // pasa cuando uno abre el módulo, se olvida de mirar el selector y
    // contabiliza el mes de otro cliente.
    //
    // Peor todavía: sin empresa no hay forma de saber a qué libro pertenece el
    // asiento, así que tampoco se puede arreglar después sin adivinar.
    if (!empId) {
        return res.status(400).json({
            message: 'Elige una empresa antes de contabilizar. Un asiento sin empresa queda sin dueño y no se puede corregir después.',
        });
    }
    const totalDebe  = lineas.reduce((s, l) => s + (Number(l.debe)  || 0), 0);
    const totalHaber = lineas.reduce((s, l) => s + (Number(l.haber) || 0), 0);
    if (Math.abs(totalDebe - totalHaber) > 1) {
        return res.status(400).json({ message: `Asiento descuadrado: Debe ${totalDebe} ≠ Haber ${totalHaber}` });
    }

    // `clase` (venta/compra/honorario) y `tipoDte` (33/61/…) son datos distintos:
    // el tipo no se deduce de la clase ni al revés. Se acepta `tipo` como alias
    // heredado de la clase para no romper llamadas antiguas.
    const claseFinal = normalizarClase(clase ?? tipo);
    const tipoDteFinal = normalizarTipoDte(tipoDte ?? tipo);
    const folioFinal = normalizarFolio(folio);

    // Una nota de crédito o débito sin documento afectado no se puede
    // contabilizar: es el dato que permite saber a qué factura pertenece.
    if (esNota(tipoDteFinal) && !normalizarFolio(refFolio)) {
        return res.status(400).json({
            message: `Falta indicar a qué documento afecta esta ${TIPO_DTE_LABEL[tipoDteFinal].toLowerCase()}.`,
        });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const resultado = await upsertComprobante(client, {
            empresaId: empId,
            clase: claseFinal,
            tipoDte: tipoDteFinal,
            folio: folioFinal,
            rutContraparte: rutAsociado,
            // Los asientos manuales eligen el tipo a mano (ingreso/egreso/traspaso);
            // los documentos lo deducen de la clase y el tipo de DTE.
            tipoExplicito: tipo,
            fecha,
            glosa: glosa || construirGlosa({
                clase: claseFinal, tipoDte: tipoDteFinal, folio: folioFinal,
                rut: rutAsociado, refTipoDte, refFolio,
            }),
            lineas,
            usuario,
            refFolio, refTipoDte, refRazon,
        });

        // ── Pago recibido / efectuado en el mismo acto ───────────────────────
        // Va DENTRO de la misma transacción a propósito: si el movimiento de
        // caja falla, el asiento del documento tampoco queda. Nunca se guarda
        // media operación.
        let recaudacion = null;
        if (pago && Number(pago.monto) > 0) {
            if (claseFinal !== 'venta' && claseFinal !== 'compra') {
                throw new Error('Solo una venta o una compra se puede marcar como pagada.');
            }
            const { movimiento } = await registrarMovimientoCaja(client, {
                empId,
                tipo: claseFinal === 'venta' ? 'recaudacion' : 'pago',
                fecha: pago.fecha || fecha,
                rut: rutAsociado,
                nombre: pago.nombre || null,
                folioAsociado: folioFinal,
                monto: Number(pago.monto),
                medio: pago.medio,
                usuario,
            });
            recaudacion = movimiento;
        }

        await client.query('COMMIT');
        res.json({
            success: true,
            comprobanteId: resultado.id,
            numero: resultado.numero,
            accion: resultado.accion,
            recaudacion,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error guardando comprobante:", err.message);
        res.status(500).json({ message: "Error al guardar el comprobante" });
    } finally {
        client.release();
    }
};

// Documentos que una nota de crédito/débito puede afectar (para el selector).
export const getDocumentosAfectables = async (req, res) => {
    const { empresaId, clase, rut, fecha } = req.query;
    const empId = (!empresaId || empresaId === 'ALL' || empresaId === 'undefined' || empresaId === 'null')
        ? null : empresaId;
    if (clienteSinEmpresa(req, empresaId)) return res.json({ documentos: [] });
    const motivo = await puedeVerEmpresa(req, empresaId);
    if (motivo) return sinAcceso(res, motivo);
    if (!empId && veSoloAsignadas(req)) return res.json({ documentos: [] });
    try {
        const documentos = await buscarDocumentosAfectables({ empresaId: empId, clase, rut, fecha });
        res.json({ documentos });
    } catch (error) {
        console.error("❌ Error buscando documentos afectables:", error.message);
        res.status(500).json({ message: "Error al buscar los documentos" });
    }
};

// Condición de empresa para las consultas sobre `comprobantes`.
//   empresa concreta → solo la suya
//   consolidado      → TODOS los comprobantes de la organización, más los que no
//                      tienen empresa asignada (los cargados en modo global).
// Antes el consolidado era `empresa_id IS NULL`, o sea "sin empresa", no "todas":
// un comprobante contabilizado con una empresa seleccionada desaparecía de la
// vista consolidada, del Libro Diario y del Balance.
//
// `visibles` es el recorte por usuario: null = sin recorte (se filtra solo por
// organización, como siempre); un arreglo = solo esas empresas, y un arreglo
// VACÍO significa "no ve nada" — que es justamente el caso de quien entra al
// equipo desde cero. Los comprobantes sin empresa (los que cargó la firma en
// modo global) NO son suyos, así que quedan fuera de su consolidado.
const condicionEmpresaComprobante = (empId, organizacionId, visibles = null) => {
    if (empId) return { sql: 'c.empresa_id = $1', params: [empId] };
    if (visibles) return { sql: 'c.empresa_id = ANY($1::uuid[])', params: [visibles] };
    return {
        sql: `(c.empresa_id IS NULL OR c.empresa_id IN (
                  SELECT id FROM empresa WHERE organizacion_id IS NOT DISTINCT FROM $1::uuid))`,
        params: [organizacionId || null],
    };
};

export const getComprobantes = async (req, res) => {
    const { empresaId } = req.query;
    // 🔒 Un cliente sin empresa no ve los comprobantes globales del búnker
    if (clienteSinEmpresa(req, empresaId)) return res.json({ comprobantes: [] });
    const motivo = await puedeVerEmpresa(req, empresaId);
    if (motivo) return sinAcceso(res, motivo);
    const empId = (!empresaId || empresaId === 'undefined' || empresaId === 'ALL' || empresaId === 'null')
        ? null : empresaId;
    const { sql: empCond, params: empParams } = condicionEmpresaComprobante(
        empId, req.user?.organizacionId, empId ? null : await empresasVisibles(req)
    );
    try {
        const { rows } = await pool.query(
            `SELECT c.id, c.numero_comprobante, c.fecha, c.tipo, c.glosa, c.estado, c.created_at,
                    c.contabilizado_por, c.contabilizado_at,
                    c.clase, c.tipo_dte, c.folio, c.rut_contraparte,
                    c.ref_folio, c.ref_tipo_dte, c.ref_razon,
                    json_agg(json_build_object(
                        'id', cd.id, 'cuenta_codigo', cd.cuenta_codigo,
                        'descripcion', COALESCE(pc.descripcion, cd.cuenta_codigo),
                        'rut_asociado', cd.rut_asociado, 'debe', cd.debe, 'haber', cd.haber
                    ) ORDER BY cd.debe DESC) AS lineas
             FROM comprobantes c
             JOIN comprobantes_detalle cd ON cd.comprobante_id = c.id
             LEFT JOIN plan_cuentas pc ON pc.codigo = cd.cuenta_codigo
             WHERE ${empCond}
             GROUP BY c.id ORDER BY c.created_at DESC`,
            empParams
        );
        res.json({ comprobantes: rows });
    } catch (error) {
        console.error("❌ Error obteniendo comprobantes:", error.message);
        res.status(500).json({ message: "Error al obtener comprobantes" });
    }
};

// ========================================================
// BALANCE: Libro Mayor + Balance General + Estado de Resultados
// Clasifica por el primer dígito del código de cuenta:
//   1 = Activo · 2/3 = Pasivo+Patrimonio · 4 = Gasto · 5 = Ingreso
// ========================================================
// Calcula el balance (8 columnas) desde los comprobantes. Reutilizable por JSON y PDF.
const calcularBalanceData = async (empId, { mes, anio, desde, hasta } = {}, organizacionId = null, visibles = null) => {
    const { sql: empCond, params } = condicionEmpresaComprobante(empId, organizacionId, visibles);
    let fechaCond = '';
    if (desde && hasta) {
        fechaCond = `AND c.fecha::date BETWEEN $${params.length + 1} AND $${params.length + 2}`;
        params.push(desde, hasta);
    } else if (mes && anio) {
        fechaCond = `AND to_char(c.fecha, 'YYYY-MM') = $${params.length + 1}`;
        params.push(`${anio}-${mes}`);
    } else if (anio) {
        fechaCond = `AND to_char(c.fecha, 'YYYY') = $${params.length + 1}`;
        params.push(String(anio));
    }
    const { rows } = await pool.query(
        `SELECT cd.cuenta_codigo,
                COALESCE(pc.descripcion, cd.cuenta_codigo) AS nombre,
                SUM(cd.debe)  AS total_debe,
                SUM(cd.haber) AS total_haber
         FROM comprobantes c
         JOIN comprobantes_detalle cd ON cd.comprobante_id = c.id
         LEFT JOIN plan_cuentas pc ON pc.codigo = cd.cuenta_codigo
         WHERE ${empCond} ${fechaCond}
         GROUP BY cd.cuenta_codigo, pc.descripcion
         ORDER BY cd.cuenta_codigo`,
        params
    );
    const cuentas = rows.map(r => {
        const codigo = r.cuenta_codigo || '';
        const debe  = Number(r.total_debe)  || 0;
        const haber = Number(r.total_haber) || 0;
        const d1 = codigo.charAt(0);
        const esDeudor = d1 === '1' || d1 === '4';        // Activo y Gasto son de naturaleza deudora
        const saldo = esDeudor ? (debe - haber) : (haber - debe);
        return {
            codigo, nombre: r.nombre, debe, haber,
            naturaleza: esDeudor ? 'DEUDOR' : 'ACREEDOR',
            saldo,
            saldoDeudor:   esDeudor ? saldo : 0,
            saldoAcreedor: esDeudor ? 0 : saldo,
            activo:   d1 === '1' ? saldo : 0,
            pasivo:   (d1 === '2' || d1 === '3') ? saldo : 0,
            perdida:  d1 === '4' ? saldo : 0,
            ganancia: d1 === '5' ? saldo : 0,
        };
    });
    const tot = cuentas.reduce((a, c) => ({
        debe: a.debe + c.debe, haber: a.haber + c.haber,
        saldoDeudor: a.saldoDeudor + c.saldoDeudor, saldoAcreedor: a.saldoAcreedor + c.saldoAcreedor,
        activo: a.activo + c.activo, pasivo: a.pasivo + c.pasivo,
        perdida: a.perdida + c.perdida, ganancia: a.ganancia + c.ganancia,
    }), { debe: 0, haber: 0, saldoDeudor: 0, saldoAcreedor: 0, activo: 0, pasivo: 0, perdida: 0, ganancia: 0 });
    const utilidad = tot.ganancia - tot.perdida;
    const cuadrado = Math.abs(tot.activo - (tot.pasivo + utilidad)) < 1;
    return { cuentas, tot, utilidad, cuadrado };
};

export const getBalance = async (req, res) => {
    const { empresaId, mes, anio, desde, hasta } = req.query;
    // 🔒 Un cliente sin empresa no ve el balance global del búnker
    if (clienteSinEmpresa(req, empresaId)) {
        return res.json({
            ok: true, periodo: 'Sin datos', libroMayor: [],
            totales: {}, balanceGeneral: { activos: [], pasivos: [], totalActivos: 0, totalPasivos: 0, utilidad: 0, cuadrado: true },
            estadoResultados: { ingresos: [], gastos: [], totalIngresos: 0, totalGastos: 0, utilidad: 0, margen: '0' }
        });
    }
    const motivo = await puedeVerEmpresa(req, empresaId);
    if (motivo) return sinAcceso(res, motivo);
    const empId = (!empresaId || empresaId === 'ALL' || empresaId === 'undefined' || empresaId === 'null') ? null : empresaId;

    try {
        const { cuentas, tot, utilidad, cuadrado } = await calcularBalanceData(
            empId, { mes, anio, desde, hasta }, req.user?.organizacionId,
            empId ? null : await empresasVisibles(req)
        );

        res.json({
            ok: true,
            periodo: (desde && hasta) ? `${desde} a ${hasta}` : (mes && anio) ? `${anio}-${mes}` : (anio ? `Año ${anio}` : 'Acumulado'),
            libroMayor: cuentas,
            totales: { ...tot, utilidad, cuadrado },
            balanceGeneral: {
                activos: cuentas.filter(c => c.activo !== 0).map(c => ({ codigo: c.codigo, nombre: c.nombre, saldo: c.activo })),
                pasivos: cuentas.filter(c => c.pasivo !== 0).map(c => ({ codigo: c.codigo, nombre: c.nombre, saldo: c.pasivo })),
                totalActivos: tot.activo,
                totalPasivos: tot.pasivo,
                utilidad,
                cuadrado,
            },
            estadoResultados: {
                ingresos: cuentas.filter(c => c.ganancia !== 0).map(c => ({ codigo: c.codigo, nombre: c.nombre, monto: c.ganancia })),
                gastos:   cuentas.filter(c => c.perdida !== 0).map(c => ({ codigo: c.codigo, nombre: c.nombre, monto: c.perdida })),
                totalIngresos: tot.ganancia,
                totalGastos: tot.perdida,
                utilidad,
                margen: tot.ganancia > 0 ? ((utilidad / tot.ganancia) * 100).toFixed(1) : '0',
            },
        });
    } catch (error) {
        console.error('❌ Error calculando balance:', error.message);
        res.status(500).json({ ok: false, message: 'Error al calcular el balance' });
    }
};

const MESES_PDF = ['', 'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

// PDF: Balance de 8 columnas (mismo formato del reporte oficial)
export const getBalancePdf = async (req, res) => {
    const { empresaId, mes, anio, desde, hasta } = req.query;
    // 🔒 Un cliente sin empresa no puede descargar el balance global del búnker
    if (clienteSinEmpresa(req, empresaId)) {
        return res.status(403).json({ message: "Selecciona una empresa para generar el balance." });
    }
    const motivoPdf = await puedeVerEmpresa(req, empresaId);
    if (motivoPdf) return sinAcceso(res, motivoPdf);
    const empId = (!empresaId || empresaId === 'ALL' || empresaId === 'undefined' || empresaId === 'null') ? null : empresaId;

    try {
        const { cuentas: cuentasData, utilidad } = await calcularBalanceData(
            empId, { mes, anio, desde, hasta }, req.user?.organizacionId,
            empId ? null : await empresasVisibles(req)
        );

        // Datos de la empresa para el encabezado
        let empresa = { nombre: 'BÓVEDA GLOBAL — VSV CONTADORES', rut: '', direccion: '', representante: '', representanteRut: '' };
        if (empId) {
            const { rows: [e] } = await pool.query(
                `SELECT e.razon_social, e.rut_encrypted, e.nombre_rep, e.rut_rep_encrypted,
                        s.direccion, s.comuna, s.ciudad
                 FROM empresa e
                 LEFT JOIN sucursal s ON e.id = s.empresa_id AND s.es_casa_matriz = TRUE
                 WHERE e.id = $1`, [empId]);
            if (e) {
                const dec = (v) => { try { return v ? (decrypt(v) || '') : ''; } catch { return ''; } };
                empresa = {
                    nombre: e.razon_social || 'EMPRESA',
                    rut: dec(e.rut_encrypted),
                    direccion: [e.direccion, e.comuna, e.ciudad].filter(Boolean).join(', '),
                    representante: e.nombre_rep || '',
                    representanteRut: dec(e.rut_rep_encrypted),
                };
            }
        }

        const periodoLabel = (desde && hasta) ? `${desde} A ${hasta}` : (mes && anio) ? `${MESES_PDF[parseInt(mes)]} ${anio}` : (anio ? `AÑO ${anio}` : 'ACUMULADO');
        const cuentas = cuentasData.map(c => ({
            cod: c.codigo, nombre: c.nombre,
            d: c.debe, c: c.haber, sd: c.saldoDeudor, sa: c.saldoAcreedor,
            act: c.activo, pas: c.pasivo, per: c.perdida, gan: c.ganancia,
        }));

        const doc = new PDFDocument({ layout: 'landscape', size: 'LETTER', margin: 40 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Balance_General.pdf"`);
        doc.pipe(res);

        // --- ENCABEZADO ---
        doc.font('Helvetica-Bold').fontSize(9).text(`${empresa.rut} ${empresa.nombre}`.trim());
        if (empresa.direccion) doc.font('Helvetica').text(empresa.direccion);
        if (empresa.representante) doc.font('Helvetica').text(`Representante Legal: ${empresa.representanteRut} ${empresa.representante}`.trim());
        doc.moveDown(1);
        doc.font('Helvetica-Bold').fontSize(14).text('BALANCE GENERAL', { align: 'center' });
        doc.fontSize(10).text(`PERIODO: ${periodoLabel}`, { align: 'center' });
        doc.moveDown(2);

        // --- TABLA ---
        const tableTop = doc.y;
        const colX = [40, 220, 290, 360, 430, 500, 570, 640, 710];
        const colWidths = [180, 70, 70, 70, 70, 70, 70, 70, 70];

        // Encabezados superiores agrupados
        doc.rect(colX[1], tableTop, 140, 15).stroke();
        doc.font('Helvetica-Bold').fontSize(8).text("SUMAS", colX[1], tableTop + 4, { width: 140, align: 'center' });
        doc.rect(colX[3], tableTop, 140, 15).stroke();
        doc.text("SALDOS", colX[3], tableTop + 4, { width: 140, align: 'center' });
        doc.rect(colX[5], tableTop, 140, 15).stroke();
        doc.text("INVENTARIO", colX[5], tableTop + 4, { width: 140, align: 'center' });
        doc.rect(colX[7], tableTop, 140, 15).stroke();
        doc.text("RESULTADO", colX[7], tableTop + 4, { width: 140, align: 'center' });

        // Sub-encabezados
        const subHeaderTop = tableTop + 15;
        const headers = ["Cuenta", "Debitos", "Creditos", "Deudor", "Acreedor", "Activo", "Pasivo", "Perdidas", "Ganancias"];
        headers.forEach((h, i) => {
            doc.rect(colX[i], subHeaderTop, colWidths[i], 15).stroke();
            doc.text(h, colX[i] + 2, subHeaderTop + 4, { width: colWidths[i] - 4, align: i === 0 ? 'left' : 'right' });
        });

        // --- DATOS ---
        let currentY = subHeaderTop + 15;
        let totales = Array(8).fill(0);

        cuentas.forEach((c, idx) => {
            doc.font('Helvetica').fontSize(8);
            if (idx % 2 === 0) {
                doc.rect(colX[0], currentY, 740, 15).fill('#f9f9f9').stroke('#eee');
                doc.fill('#000');
            } else {
                doc.rect(colX[0], currentY, 740, 15).stroke('#eee');
            }
            const row = [c.cod + " " + c.nombre, c.d, c.c, c.sd, c.sa, c.act, c.pas, c.per, c.gan];
            row.forEach((val, i) => {
                const text = i === 0 ? val : (val === 0 ? "" : val.toLocaleString('es-CL'));
                doc.fillColor('#000').text(text, colX[i] + 2, currentY + 4, { width: colWidths[i] - 4, align: i === 0 ? 'left' : 'right', lineBreak: false });
                if (i > 0) totales[i - 1] += val;
            });
            currentY += 15;
        });

        // --- TOTALES Y UTILIDAD ---
        const utilidadResultado = totales[7] - totales[6];
        const utilidadPatrimonial = totales[4] - totales[5];

        doc.font('Helvetica-Bold');
        doc.rect(colX[0], currentY, 740, 15).fill('#f0f0f0').stroke();
        doc.fill('#000').text("TOTALES", colX[0] + 2, currentY + 4);
        totales.forEach((t, i) => {
            doc.text(t.toLocaleString('es-CL'), colX[i + 1] + 2, currentY + 4, { width: colWidths[i + 1] - 4, align: 'right' });
        });

        currentY += 15;
        doc.rect(colX[0], currentY, 740, 15).stroke();
        doc.text(utilidadResultado >= 0 ? "UTILIDAD DEL EJERCICIO" : "PÉRDIDA DEL EJERCICIO", colX[0] + 2, currentY + 4);
        doc.text(utilidadPatrimonial.toLocaleString('es-CL'), colX[6] + 2, currentY + 4, { width: colWidths[6] - 4, align: 'right' });
        doc.text(utilidadResultado.toLocaleString('es-CL'), colX[7] + 2, currentY + 4, { width: colWidths[7] - 4, align: 'right' });

        // Totales de cierre (cuadratura)
        currentY += 15;
        doc.rect(colX[0], currentY, 740, 15).fill('#e0e0e0').stroke();
        doc.fill('#000').text("TOTALES IGUALES", colX[0] + 2, currentY + 4);
        doc.text(totales[0].toLocaleString('es-CL'), colX[1] + 2, currentY + 4, { width: colWidths[1] - 4, align: 'right' });
        doc.text(totales[1].toLocaleString('es-CL'), colX[2] + 2, currentY + 4, { width: colWidths[2] - 4, align: 'right' });
        doc.text(totales[2].toLocaleString('es-CL'), colX[3] + 2, currentY + 4, { width: colWidths[3] - 4, align: 'right' });
        doc.text(totales[3].toLocaleString('es-CL'), colX[4] + 2, currentY + 4, { width: colWidths[4] - 4, align: 'right' });
        doc.text(totales[4].toLocaleString('es-CL'), colX[5] + 2, currentY + 4, { width: colWidths[5] - 4, align: 'right' });
        doc.text((totales[5] + utilidadPatrimonial).toLocaleString('es-CL'), colX[6] + 2, currentY + 4, { width: colWidths[6] - 4, align: 'right' });
        doc.text((totales[6] + utilidadResultado).toLocaleString('es-CL'), colX[7] + 2, currentY + 4, { width: colWidths[7] - 4, align: 'right' });
        doc.text(totales[7].toLocaleString('es-CL'), colX[8] + 2, currentY + 4, { width: colWidths[8] - 4, align: 'right' });

        // --- DECLARACIÓN Y FIRMAS ---
        currentY += 40;
        doc.font('Helvetica-Oblique').fontSize(8);
        const declaracion = "Declaro(mos) dejando constancia que el presente Balance General ha sido confeccionado con datos e informaciones que hemos proporcionado como fidedignos a mi (nuestro) Contador.";
        doc.text(declaracion, colX[0], currentY, { width: 740, align: 'left' });

        currentY += 50;
        const lineSize = 180;
        const signatureY = currentY;

        doc.moveTo(colX[0] + 50, signatureY).lineTo(colX[0] + 50 + lineSize, signatureY).stroke();
        doc.font('Helvetica-Bold').fontSize(8).text("FIRMA REPRESENTANTE LEGAL", colX[0] + 50, signatureY + 5, { width: lineSize, align: 'center' });
        doc.font('Helvetica').text(empresa.nombre, colX[0] + 50, signatureY + 15, { width: lineSize, align: 'center' });
        doc.text("RUT: " + (empresa.rut || '—'), colX[0] + 50, signatureY + 25, { width: lineSize, align: 'center' });

        doc.moveTo(colX[6] - 50, signatureY).lineTo(colX[6] - 50 + lineSize, signatureY).stroke();
        doc.font('Helvetica-Bold').fontSize(8).text("FIRMA CONTADOR", colX[6] - 50, signatureY + 5, { width: lineSize, align: 'center' });
        doc.font('Helvetica').text("NOMBRE DEL CONTADOR", colX[6] - 50, signatureY + 15, { width: lineSize, align: 'center' });
        doc.text("RUT: XX.XXX.XXX-X", colX[6] - 50, signatureY + 25, { width: lineSize, align: 'center' });

        doc.end();
    } catch (error) {
        console.error('❌ Error generando PDF de balance:', error.message);
        if (!res.headersSent) res.status(500).json({ ok: false, message: 'Error al generar el PDF' });
    }
};

export const getJournalEntries = async (req, res) => {
    const { empresaId, page = 0, search = "" } = req.query;
    // 🔒 Un cliente sin empresa no ve el libro diario global
    if (clienteSinEmpresa(req, empresaId)) return res.json({ asientos: [], total: 0, page: Number(page) });
    try {
        res.json({
            asientos: [
                { 
                    id: "as-001", 
                    fecha: "2026-01-20", 
                    descripcion: "Apertura de Caja Mensual", 
                    debe: 500000, 
                    haber: 0, 
                    estado: "Mayorizado",
                    usuario: "Admin"
                },
                { 
                    id: "as-002", 
                    fecha: "2026-01-21", 
                    descripcion: "Pago Proveedores Servicios", 
                    debe: 0, 
                    haber: 120000, 
                    estado: "Pendiente",
                    usuario: "Sistema"
                }
            ],
            total: 2,
            page: Number(page)
        });
    } catch (error) {
        res.status(500).json({ message: "Error al consultar el libro diario" });
    }
};

export const runBankReconciliationIA = async (req, res) => {
    const { empresaId, cartolaId } = req.body;
    try {
        setTimeout(() => {
            res.json({ 
                success: true, 
                message: "IA ha procesado la cartola exitosamente",
                matchedCount: 15,
                pendingCount: 2,
                accuracy: "98%"
            });
        }, 1500);
    } catch (error) {
        res.status(500).json({ message: "Fallo en el motor de IA contable" });
    }
};

// --- Helpers para validación (Adaptados de insertar.js) ---
const normalizarRut = (rut) => {
    if (!rut) return null;
    let clean = String(rut).trim();
    if (!clean || clean.startsWith("#")) return null;

    clean = clean.replace(/\./g, "").replace(/-/g, "");
    if (clean.length < 2) return null;

    const cuerpo = clean.slice(0, -1);
    const dv = clean.slice(-1).toUpperCase();

    if (!/^\d+$/.test(cuerpo)) return null;
    if (!/^[0-9K]$/.test(dv)) return null;

    return `${cuerpo}-${dv}`;
};

const claveValida = (clave) => {
    if (!clave) return false;
    const clean = String(clave).trim();
    // Debe contener al menos un número
    return clean && /\d/.test(clean);
};

export const uploadAccountingExcel = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "No se ha subido ningún archivo Excel." });
    }

    try {
        // 1. Leer el archivo desde el buffer
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0]; // Usar la primera hoja
        const sheet = workbook.Sheets[sheetName];
        
        // 2. Convertir a JSON (array de arrays para mantener índices de columnas)
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        const validos = [];
        const incompletos = [];

        // 3. Procesar filas (saltando cabecera si es necesario)
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            // Índices basados en tu script anterior: 10 -> RUT, 11 -> Clave
            const rawRut = row[10]; 
            const rawClave = row[11];

            if (!rawRut && !rawClave) continue;

            const rut = normalizarRut(rawRut);
            const esClaveValida = claveValida(rawClave);

            if (rut && esClaveValida) {
                validos.push({ rut, clave: String(rawClave).trim() });
            } else {
                incompletos.push({ fila: i + 1, rawRut, rawClave });
            }
        }

        // 4. Insertar en Base de Datos
        if (validos.length > 0) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                for (const item of validos) {
                    // Asumiendo tabla 'clientes'. Ajusta el nombre de la tabla y columnas según tu DB real.
                    // ON CONFLICT actualiza la clave si el RUT ya existe.
                    await client.query(
                        `INSERT INTO clientes (rut, password) VALUES ($1, $2) 
                         ON CONFLICT (rut) DO UPDATE SET password = $2`,
                        [item.rut, item.clave]
                    );
                }
                await client.query('COMMIT');
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        }

        res.json({
            success: true,
            message: "Importación de Excel completada",
            registrosProcesados: validos.length,
            registrosFallidos: incompletos.length,
            detallesFallidos: incompletos
        });

    } catch (error) {
        console.error("❌ Error procesando Excel:", error);
        res.status(500).json({ message: "Error interno al procesar el archivo" });
    }
};