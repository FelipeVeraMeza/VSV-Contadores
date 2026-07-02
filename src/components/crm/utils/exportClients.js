import { utils, writeFile } from 'xlsx';

// Convierte la lista de clientes del CRM a filas planas para exportar.
// No incluye contraseñas (SII/Web) por seguridad.
const toRows = (clients = []) => clients.map(c => ({
    'Razón Social': c.razon_social || c.razonSocial || '',
    'RUT': c.rut_encrypted || c.rut || '',
    'Giro': c.giro || '',
    'Representante': c.nombre_rep || c.repNombre || '',
    'RUT Rep.': c.rut_rep_encrypted || c.repRut || '',
    'Correo': c.email_corporativo || c.correo || '',
    'Teléfono': c.whatsapp || c.telefono_corporativo || c.telefono || '',
    'Comuna': c.comuna || '',
    'Ciudad': c.ciudad || '',
    'Plan': c.plan || c.plan_nombre || '',
    'Estado Pago': c.estado_pago || c.pagoServicio || '',
    'Estado F29': c.estado_f29 || c.estadoFormulario || '',
    'Score': c.score ?? '',
    'Ventas': Number(c.ventas_mensuales ?? c.ventas ?? 0),
    'Impuesto a Pagar': Number(c.impuesto_pagar ?? c.neto ?? 0),
    'Nota Importante': c.nota_urgente || c.importante || ''
}));

const nombreArchivo = (ext) => {
    const hoy = new Date().toISOString().slice(0, 10);
    return `clientes_vsv_${hoy}.${ext}`;
};

export const exportClientsToExcel = (clients = []) => {
    const rows = toRows(clients);
    const sheet = utils.json_to_sheet(rows);
    const book = utils.book_new();
    utils.book_append_sheet(book, sheet, 'Clientes');
    writeFile(book, nombreArchivo('xlsx'));
};

export const exportClientsToCSV = (clients = []) => {
    const rows = toRows(clients);
    const sheet = utils.json_to_sheet(rows);
    const csv = utils.sheet_to_csv(sheet);
    // BOM para que Excel abra bien los acentos
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo('csv');
    a.click();
    URL.revokeObjectURL(url);
};
