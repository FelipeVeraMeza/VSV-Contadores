// Identidad de un documento tributario y generación de su asiento contable.
//
// Antes esta lógica estaba duplicada: MovimientosContables sí contemplaba las
// notas de crédito y AsientoDocumentoModal no, así que el mismo documento
// generaba asientos distintos según desde dónde se contabilizara. Acá vive una
// sola versión.

import { cleanRut } from './rut.js';

export const TIPO_DTE = {
    FACTURA: 33, EXENTA: 34, BOLETA: 39, GUIA: 52,
    NOTA_DEBITO: 56, NOTA_CREDITO: 61, EXPORTACION: 110,
};

export const TIPO_DTE_LABEL = {
    33: 'Factura Electrónica', 34: 'Factura Exenta', 39: 'Boleta Electrónica',
    52: 'Guía de Despacho', 56: 'Nota de Débito', 61: 'Nota de Crédito',
    110: 'Factura de Exportación',
};

// Etiqueta corta para tablas y badges.
export const TIPO_DTE_CORTO = {
    33: 'FAC. ELECTRÓNICA', 34: 'FAC. EXENTA', 39: 'BOLETA', 52: 'GUÍA DE DESPACHO',
    56: 'NOTA DE DÉBITO', 61: 'NOTA DE CRÉDITO', 110: 'FAC. EXPORTACIÓN',
};

export const esNotaCredito = (tipoDte) => Number(tipoDte) === TIPO_DTE.NOTA_CREDITO;
export const esNotaDebito  = (tipoDte) => Number(tipoDte) === TIPO_DTE.NOTA_DEBITO;
export const esNota        = (tipoDte) => esNotaCredito(tipoDte) || esNotaDebito(tipoDte);

// Documentos sin IVA: la exenta y la de exportación.
export const esExento = (tipoDte) =>
    Number(tipoDte) === TIPO_DTE.EXENTA || Number(tipoDte) === TIPO_DTE.EXPORTACION;

// Tipos que una nota de crédito/débito puede afectar.
export const esAfectable = (tipoDte) => [33, 34, 39, 110].includes(Number(tipoDte));

export const normalizarClase = (valor) => {
    const v = String(valor || '').toLowerCase();
    if (v === 'ventas' || v === 'venta') return 'venta';
    if (v === 'compras' || v === 'compra') return 'compra';
    if (v === 'honorarios' || v === 'honorario') return 'honorario';
    return 'manual';
};

/**
 * Clave de identidad de un documento. El folio por sí solo no identifica nada:
 * se repite entre tipos de DTE, entre años y entre contrapartes. Debe coincidir
 * con la clave del índice único `uq_comprobante_documento` en la base.
 */
export const claveDocumento = (clase, tipoDte, folio, rut) =>
    [normalizarClase(clase), Number(tipoDte) || '', String(folio ?? ''), cleanRut(rut || '')].join('|');

// Clave a partir de un comprobante ya guardado (viene con columnas propias).
export const claveDeComprobante = (comp) =>
    claveDocumento(comp.clase, comp.tipo_dte, comp.folio, comp.rut_contraparte);

// Clave a partir de un documento del listado.
export const claveDeDocumento = (doc, clase) =>
    claveDocumento(clase, doc.tipo_dte, doc.folio, clase === 'compras' || clase === 'compra'
        ? doc.rut_proveedor : doc.rut_cliente);

export const CUENTAS = {
    CLIENTES: '1104-01', VENTAS: '5101-01', IVA_DEBITO: '2108-02',
    GASTOS: '4201-08', IVA_CREDITO: '1108-02', PROVEEDORES: '2116-01',
    HONORARIOS: '4201-02', HONORARIOS_POR_PAGAR: '2105-04',
};

export const CUENTAS_NOMBRE = {
    '1104-01': 'DEUDORES CLIENTES', '5101-01': 'VENTAS', '2108-02': 'IVA DEBITO FISCAL',
    '4201-08': 'GASTOS GENERALES', '1108-02': 'IVA CREDITO FISCAL', '2116-01': 'FACTURAS POR PAGAR',
    '4201-02': 'HONORARIOS PROFESIONALES', '2105-04': 'HONORARIOS POR PAGAR',
};

const linea = (cuenta, debe, haber) => ({ cuenta, nombre: CUENTAS_NOMBRE[cuenta] || cuenta, debe, haber });

/**
 * Montos del documento. Se respeta el IVA que trae el documento en vez de
 * calcular siempre 19%: una factura exenta no lleva IVA, y forzarlo inventaba
 * un crédito fiscal inexistente.
 */
export const calcularMontos = (doc) => {
    const neto = Number(doc?.monto_neto) || 0;
    const ivaDeclarado = doc?.monto_iva === null || doc?.monto_iva === undefined || doc?.monto_iva === ''
        ? null : Number(doc.monto_iva);
    const iva = esExento(doc?.tipo_dte) ? 0 : (ivaDeclarado ?? Math.round(neto * 0.19));
    return { neto, iva, total: neto + iva };
};

/**
 * Asiento contable de un documento.
 * Una nota de crédito revierte el documento original, así que invierte el
 * debe y el haber; una nota de débito lo aumenta y va en la misma dirección
 * que la factura.
 */
export const generarLineasAsiento = (doc, claseRaw) => {
    const clase = normalizarClase(claseRaw);
    const { neto, iva, total } = calcularMontos(doc);
    const reversa = esNotaCredito(doc?.tipo_dte);

    if (clase === 'compra') {
        const lineas = reversa
            ? [linea(CUENTAS.PROVEEDORES, total, 0), linea(CUENTAS.GASTOS, 0, neto)]
            : [linea(CUENTAS.GASTOS, neto, 0), linea(CUENTAS.PROVEEDORES, 0, total)];
        if (iva > 0) {
            const ivaLinea = reversa ? linea(CUENTAS.IVA_CREDITO, 0, iva) : linea(CUENTAS.IVA_CREDITO, iva, 0);
            lineas.splice(1, 0, ivaLinea);
        }
        return lineas;
    }

    if (clase === 'honorario') {
        return reversa
            ? [linea(CUENTAS.HONORARIOS_POR_PAGAR, total, 0), linea(CUENTAS.HONORARIOS, 0, total)]
            : [linea(CUENTAS.HONORARIOS, total, 0), linea(CUENTAS.HONORARIOS_POR_PAGAR, 0, total)];
    }

    // Venta
    const lineas = reversa
        ? [linea(CUENTAS.CLIENTES, 0, total), linea(CUENTAS.VENTAS, neto, 0)]
        : [linea(CUENTAS.CLIENTES, total, 0), linea(CUENTAS.VENTAS, 0, neto)];
    if (iva > 0) {
        lineas.push(reversa ? linea(CUENTAS.IVA_DEBITO, iva, 0) : linea(CUENTAS.IVA_DEBITO, 0, iva));
    }
    return lineas;
};

// Glosa del asiento. Para una nota debe decir a qué documento afecta.
export const construirGlosa = ({ clase, tipoDte, folio, razonSocial, rut, refTipoDte, refFolio }) => {
    const quien = (razonSocial || '').toUpperCase().trim() || cleanRut(rut || '');
    const etiqueta = esNota(tipoDte)
        ? (esNotaCredito(tipoDte) ? 'Nota Crédito' : 'Nota Débito')
        : (normalizarClase(clase) === 'compra' ? 'Compra'
           : normalizarClase(clase) === 'honorario' ? 'Honorario' : 'Venta');
    const referencia = esNota(tipoDte) && refFolio
        ? ` → afecta ${TIPO_DTE_LABEL[Number(refTipoDte)] || 'Documento'} #${refFolio}`
        : '';
    return `${etiqueta} Folio #${folio}${referencia}${quien ? ` — ${quien}` : ''}`;
};
