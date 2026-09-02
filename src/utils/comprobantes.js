// Identidad y persistencia de los comprobantes contables.
//
// Existían dos implementaciones paralelas del mismo upsert (accounting y
// dteConsulta) con criterios distintos, y ambas identificaban al documento
// buscando el folio como texto dentro de la glosa. Un folio por sí solo no
// identifica nada: se repite entre tipos de DTE, entre años y entre
// contrapartes. Acá vive el criterio único que usan las dos rutas.

import { pool } from '../database/db.js';

export const TIPO_DTE = {
    FACTURA: 33, EXENTA: 34, BOLETA: 39, GUIA: 52,
    NOTA_DEBITO: 56, NOTA_CREDITO: 61, EXPORTACION: 110,
};

export const TIPO_DTE_LABEL = {
    33: 'Factura', 34: 'Factura Exenta', 39: 'Boleta', 52: 'Guía de Despacho',
    56: 'Nota de Débito', 61: 'Nota de Crédito', 110: 'Factura de Exportación',
};

export const esNotaCredito = (tipoDte) => Number(tipoDte) === TIPO_DTE.NOTA_CREDITO;
export const esNotaDebito  = (tipoDte) => Number(tipoDte) === TIPO_DTE.NOTA_DEBITO;
export const esNota        = (tipoDte) => esNotaCredito(tipoDte) || esNotaDebito(tipoDte);

// El RUT llega en formatos distintos según la ruta: el modal manda "78306207-0"
// y el lote manda "783062070". Sin normalizar, el mismo documento se
// contabilizaría dos veces. Forma canónica: CUERPO-DV, sin puntos.
export const normalizarRut = (rut) => {
    if (rut === null || rut === undefined) return null;
    const limpio = String(rut).trim().replace(/[.\s-]/g, '').toUpperCase();
    if (limpio.length < 2) return null;
    const cuerpo = limpio.slice(0, -1);
    const dv = limpio.slice(-1);
    if (!/^\d+$/.test(cuerpo) || !/^[0-9K]$/.test(dv)) return null;
    return `${cuerpo}-${dv}`;
};

// venta | compra | honorario | manual
export const normalizarClase = (valor) => {
    const v = String(valor || '').toLowerCase();
    if (v === 'ventas' || v === 'venta') return 'venta';
    if (v === 'compras' || v === 'compra') return 'compra';
    if (v === 'honorarios' || v === 'honorario') return 'honorario';
    if (v === 'conciliacion') return 'conciliacion';
    if (v === 'caja') return 'caja';
    if (v === 'nota_credito' || v === 'nota_debito') return null; // no es una clase, es un tipo_dte
    return v ? 'manual' : null;
};

export const normalizarFolio = (folio) => {
    if (folio === null || folio === undefined || folio === '') return null;
    const n = parseInt(String(folio).replace(/\D/g, ''), 10);
    return Number.isFinite(n) ? n : null;
};

export const normalizarTipoDte = (tipoDocumento) => {
    if (tipoDocumento === null || tipoDocumento === undefined || tipoDocumento === '') return null;
    const alias = { HON: 39, OTRO: 99, nota_credito: 61, nota_debito: 56 };
    if (alias[tipoDocumento] !== undefined) return alias[tipoDocumento];
    const n = parseInt(tipoDocumento, 10);
    return Number.isFinite(n) ? n : null;
};

const TIPOS_LIBRO = ['INGRESO', 'EGRESO', 'TRASPASO'];

// Tipo de comprobante para el Libro Diario.
// `tipoExplicito` viene de los asientos manuales, donde la persona elige
// directamente ingreso/egreso/traspaso y no hay documento del que deducirlo.
export const tipoLibro = (clase, tipoDte, tipoExplicito) => {
    // Una nota de crédito o débito es un traspaso, se pida lo que se pida.
    if (esNota(tipoDte)) return 'TRASPASO';
    const explicito = String(tipoExplicito || '').toUpperCase();
    if (TIPOS_LIBRO.includes(explicito)) return explicito;
    if (clase === 'compra') return 'EGRESO';
    if (clase === 'venta' || clase === 'honorario') return 'INGRESO';
    return 'TRASPASO';
};

const etiquetaClase = (clase) =>
    clase === 'compra' ? 'Compra' : clase === 'honorario' ? 'Honorario' : 'Venta';

// La glosa deja de ser la fuente de verdad (ahora lo son las columnas), pero
// sigue siendo lo que se lee en el Libro Diario: para una nota de crédito debe
// decir a qué documento afecta.
export const construirGlosa = ({ clase, tipoDte, folio, razonSocial, rut, refTipoDte, refFolio, descripcion }) => {
    const quien = (razonSocial || '').toUpperCase().trim() || normalizarRut(rut) || '';
    const etiqueta = esNota(tipoDte) ? TIPO_DTE_LABEL[Number(tipoDte)] : etiquetaClase(clase);
    const base = descripcion?.trim()
        ? `${descripcion.trim()} — ${etiqueta} Folio #${folio}`
        : `${etiqueta} Folio #${folio}`;
    const referencia = esNota(tipoDte) && refFolio
        ? ` → afecta ${TIPO_DTE_LABEL[Number(refTipoDte)] || 'Documento'} #${refFolio}`
        : '';
    return `${base}${referencia}${quien ? ` — ${quien}` : ''}`;
};

// Correlativo por empresa sin race condition. El MAX+1 anterior podía entregar
// el mismo número a dos contabilizaciones simultáneas; el lock es por
// transacción y se libera solo en el COMMIT/ROLLBACK.
export const siguienteNumeroComprobante = async (client, empresaId) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `comprobante:${empresaId ?? 'GLOBAL'}`,
    ]);
    const { rows: [{ max_num }] } = await client.query(
        `SELECT COALESCE(MAX(numero_comprobante), 0) AS max_num
           FROM comprobantes WHERE empresa_id IS NOT DISTINCT FROM $1`,
        [empresaId]
    );
    return Number(max_num) + 1;
};

// Filtro de identidad del documento. IS NOT DISTINCT FROM replica la semántica
// de NULLS NOT DISTINCT del índice único, para que empresa/RUT nulos también
// deduplicen en vez de generar filas repetidas.
const WHERE_DOCUMENTO = `
    empresa_id      IS NOT DISTINCT FROM $1
AND clase           IS NOT DISTINCT FROM $2
AND tipo_dte        IS NOT DISTINCT FROM $3
AND folio           IS NOT DISTINCT FROM $4
AND rut_contraparte IS NOT DISTINCT FROM $5`;

/**
 * Crea o actualiza el comprobante de un documento tributario.
 * Debe llamarse dentro de una transacción ya iniciada por quien invoca.
 * @returns {{ id, numero, accion: 'creado'|'actualizado' }}
 */
export const upsertComprobante = async (client, {
    empresaId, clase, tipoDte, folio, rutContraparte,
    fecha, glosa, lineas, usuario = {}, tipoExplicito = null,
    refFolio = null, refTipoDte = null, refRazon = null,
}) => {
    const empId    = empresaId ?? null;
    const claseN   = normalizarClase(clase);
    const tipoDteN = normalizarTipoDte(tipoDte);
    const folioN   = normalizarFolio(folio);
    const rutN     = normalizarRut(rutContraparte);
    const refFolioN   = normalizarFolio(refFolio);
    const refTipoDteN = normalizarTipoDte(refTipoDte);
    const tipoDb   = tipoLibro(claseN, tipoDteN, tipoExplicito);
    const fechaFinal = fecha ? new Date(fecha) : new Date();

    const clave = [empId, claseN, tipoDteN, folioN, rutN];

    // Un comprobante sin folio (ajuste manual) no tiene documento que deduplicar:
    // siempre se crea uno nuevo.
    const { rows: [existente] } = folioN !== null
        ? await client.query(
            `SELECT id, numero_comprobante FROM comprobantes WHERE ${WHERE_DOCUMENTO} LIMIT 1`,
            clave)
        : { rows: [] };

    let compId, numero, accion;

    if (existente) {
        // CORREGIR UN ASIENTO BORRA SU APROBACIÓN ANTERIOR.
        //
        // Vuelve a 'Contabilizado', o sea a la fila de espera: lo que se aprobó
        // antes ya no es lo que dice el asiento ahora. Si se conservara el
        // «Aprobado por Matías», quedaría avalando líneas que Matías nunca vio.
        //
        // Es también el camino de vuelta del rechazo: se corrige lo que se
        // observó y el asiento queda pendiente otra vez, conservando su número
        // y su historial en la bitácora. Por eso se limpia `motivo_rechazo`:
        // el reproche viejo ya fue atendido y dejarlo colgado confunde.
        await client.query(
            `UPDATE comprobantes
                SET fecha = $1, glosa = $2, tipo = $3, estado = 'Contabilizado',
                    ref_folio = $4, ref_tipo_dte = $5, ref_razon = $6,
                    contabilizado_por = $7, contabilizado_por_id = $8, contabilizado_at = NOW(),
                    aprobado_por = NULL, aprobado_por_id = NULL, aprobado_at = NULL,
                    motivo_rechazo = NULL
              WHERE id = $9`,
            [fechaFinal, glosa, tipoDb, refFolioN, refTipoDteN, refRazon,
             usuario.nombre || null, usuario.usuarioId || null, existente.id]
        );
        // ON DELETE CASCADE en comprobantes_detalle no aplica acá: el
        // comprobante sobrevive, solo se reemplazan sus líneas.
        await client.query(`DELETE FROM comprobantes_detalle WHERE comprobante_id = $1`, [existente.id]);
        compId = existente.id;
        numero = existente.numero_comprobante;
        accion = 'actualizado';
    } else {
        numero = await siguienteNumeroComprobante(client, empId);
        const { rows: [comp] } = await client.query(
            `INSERT INTO comprobantes
                (id, empresa_id, numero_comprobante, fecha, tipo, glosa, estado,
                 clase, tipo_dte, folio, rut_contraparte,
                 ref_folio, ref_tipo_dte, ref_razon,
                 contabilizado_por, contabilizado_por_id, contabilizado_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'Contabilizado',
                     $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
             RETURNING id`,
            [empId, numero, fechaFinal, tipoDb, glosa,
             claseN, tipoDteN, folioN, rutN,
             refFolioN, refTipoDteN, refRazon,
             usuario.nombre || null, usuario.usuarioId || null]
        );
        compId = comp.id;
        accion = 'creado';
    }

    // El código de la cuenta llega con tres nombres distintos según quién llame:
    // `cuenta` (las pantallas), `numero_cuenta` (el registro manual) y
    // `cuenta_codigo` (que es como sale al LEER un comprobante). Se aceptan los
    // tres: al releer un asiento para reeditarlo, la forma que devuelve la
    // lectura tiene que servir para escribir.
    let insertadas = 0;
    for (const linea of lineas) {
        const cuenta = linea.cuenta || linea.numero_cuenta || linea.cuenta_codigo;
        if (!cuenta) continue;
        await client.query(
            `INSERT INTO comprobantes_detalle (id, comprobante_id, cuenta_codigo, rut_asociado, debe, haber)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
            [compId, cuenta, rutN, Number(linea.debe) || 0, Number(linea.haber) || 0]
        );
        insertadas++;
    }

    // Un comprobante sin líneas es un asiento vacío: gasta un número correlativo
    // y NO aparece en ninguna lista, porque todas cruzan con
    // `comprobantes_detalle`. Antes, si las líneas venían con un nombre de campo
    // que no era ninguno de los de arriba, se descartaban en silencio y la
    // llamada respondía 200 con su número: el asiento se daba por guardado y no
    // existía. Se prefiere fallar y que la transacción se deshaga.
    if (insertadas === 0) {
        throw new Error('El asiento no tiene ninguna línea con cuenta: no se guardó nada.');
    }

    return { id: compId, numero, accion };
};

/**
 * Borra el comprobante de UN documento concreto.
 * Antes se borraba por coincidencia de folio en la glosa y sin límite, así que
 * eliminar una compra podía llevarse por delante la venta del mismo folio y la
 * del año anterior.
 */
export const eliminarComprobanteDeDocumento = async (client, {
    empresaId, clase, tipoDte, folio, rutContraparte,
}) => {
    const folioN = normalizarFolio(folio);
    if (folioN === null) return 0;
    const { rowCount } = await client.query(
        `DELETE FROM comprobantes WHERE ${WHERE_DOCUMENTO}`,
        [empresaId ?? null, normalizarClase(clase), normalizarTipoDte(tipoDte), folioN, normalizarRut(rutContraparte)]
    );
    return rowCount;
};

/**
 * Documentos candidatos a ser referenciados por una nota de crédito/débito:
 * mismo emisor/receptor, tipo afectable y anteriores o iguales a la fecha de la
 * nota. Alimenta el selector "¿a qué documento pertenece?".
 */
export const buscarDocumentosAfectables = async ({ empresaId, clase, rut, fecha }) => {
    const empId = empresaId ?? null;
    const rutN = normalizarRut(rut);
    const esVenta = normalizarClase(clase) === 'venta';
    const tabla = esVenta
        ? (empId === null ? 'documentos_emitidos' : 'documentos_emitidos_empresa')
        : (empId === null ? 'documentos_recibidos' : 'documentos_recibidos_empresa');
    const colRut   = esVenta ? 'rut_cliente' : 'rut_proveedor';
    const colRazon = esVenta ? 'razon_social_cliente' : 'razon_social_proveedor';

    // El RUT viene sin guion en las tablas de documentos y con guion en la
    // forma canónica, así que se compara sobre la versión desnuda.
    const rutDesnudo = rutN ? rutN.replace('-', '') : null;

    const { rows } = await pool.query(
        `SELECT id, folio, tipo_dte, ${colRazon} AS razon_social,
                monto_neto, monto_iva, monto_total, fecha_emision
           FROM ${tabla}
          WHERE empresa_id IS NOT DISTINCT FROM $1
            AND tipo_dte IN (33, 34, 39, 110)
            AND ($2::text IS NULL OR replace(replace(${colRut}, '.', ''), '-', '') = $2)
            AND ($3::timestamptz IS NULL OR fecha_emision <= $3)
          ORDER BY fecha_emision DESC, folio DESC
          LIMIT 50`,
        [empId, rutDesnudo, fecha || null]
    );
    return rows;
};
