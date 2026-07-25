// ============================================================================
// Generadores de archivos del Libro de Remuneraciones (CSV) reutilizables por
// las sub-páginas de Documentos y Reportes.
//
// Las `filas` provienen de `getLibroRemuneracionesApi` (endpoint /reportes/libro).
// ============================================================================

// Descarga un CSV con separador ';' y BOM (compatible con Excel en español).
export const descargarCsv = (nombre, cols, filas) => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.map(esc).join(';'), ...filas.map(f => f.map(esc).join(';'))].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre; a.click();
    URL.revokeObjectURL(url);
};

export const exportLibro = (filas, periodo) => descargarCsv(
    `libro_remuneraciones_${periodo}.csv`,
    ['Empresa', 'Empleado', 'RUT', 'Cargo', 'Días', 'Imponible', 'No imponible', 'Haberes', 'Base tributable', 'Descuentos', 'Líquido', 'Aportes patronales', 'Estado'],
    filas.map(f => [f.empresa, f.empleado, f.rut, f.cargo, f.dias, f.imponible, f.noImponible, f.haberes, f.tributable, f.descuentos, f.liquido, f.aportes, f.estado])
);

export const exportNominaBancaria = (filas, periodo) => descargarCsv(
    `nomina_bancaria_${periodo}.csv`,
    ['Empresa', 'RUT', 'Nombre', 'Banco', 'Tipo de cuenta', 'N° de cuenta', 'Forma de pago', 'Monto'],
    filas.map(f => [f.empresa, f.rut, f.empleado, f.banco, f.tipoCuenta, f.numeroCuenta, f.tipoPago, f.liquido])
);

export const exportPrevired = (filas, periodo) => descargarCsv(
    `previred_${periodo}.csv`,
    ['Empresa', 'RUT', 'Nombre', 'AFP', 'Días trab.', 'Renta imponible', 'Cotización AFP', 'SIS (empleador)', 'Salud', 'Cesantía trabajador', 'Cesantía empleador', 'Mutual', 'Impuesto único'],
    filas.map(f => [f.empresa, f.rut, f.empleado, f.afp, f.dias, f.imponible, f.descAfp, f.aporteSis, f.descSalud, f.descCesantia, f.aporteAfc, f.aporteMutual, f.impuesto])
);

export const exportLre = (filas, periodo) => descargarCsv(
    `libro_electronico_LRE_${periodo}.csv`,
    ['Empresa', 'RUT', 'Nombre', 'Cargo', 'Días', 'Sueldo base', 'Gratificación', 'Asignación familiar', 'Total haberes', 'Imponible', 'Base tributable', 'AFP', 'Salud', 'Cesantía', 'Impuesto único', 'Otros descuentos', 'Total descuentos', 'Líquido'],
    filas.map(f => {
        const otros = f.descuentos - f.descAfp - f.descSalud - f.descCesantia - f.impuesto;
        return [f.empresa, f.rut, f.empleado, f.cargo, f.dias, f.sueldoBase, f.gratificacion, f.asignacionFamiliar, f.haberes, f.imponible, f.tributable, f.descAfp, f.descSalud, f.descCesantia, f.impuesto, otros, f.descuentos, f.liquido];
    })
);
