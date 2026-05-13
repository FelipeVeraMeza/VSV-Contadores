// src/components/contabilidad/cierre_mensual.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cuentas contables (Plan Normal)
const CUENTAS = {
    BANCO: { codigo: '1101-02', nombre: 'BANCO' },
    CLIENTES: { codigo: '1104-01', nombre: 'DEUDORES CLIENTES' },
    INGRESOS_VENTAS: { codigo: '5101-01', nombre: 'VENTAS' },
    IVA_DEBITO: { codigo: '2108-02', nombre: 'IVA DEBITO FISCAL' },
    PROVEEDORES: { codigo: '2116-01', nombre: 'FACTURAS POR PAGAR' },
    IVA_CREDITO: { codigo: '1108-02', nombre: 'IVA CREDITO FISCAL' },
    GASTOS_GENERALES: { codigo: '4201-08', nombre: 'GASTOS GENERALES' }
};

// Rutas base a tus archivos
const PATHS = {
    rcvBase: path.resolve(__dirname, '../../sii_core/sii_registro_compra_venta/'),
    cartolas: path.resolve(__dirname, '../../cartola_bancaria/cartolas_bci.json'),
    folios_emitidos: path.resolve(__dirname, '../../sii_core/sii_historial_DTE/documentos emitidos/folios_documentos_emitidos.json')
};

const parseMonto = (strMonto) => {
    if (!strMonto) return 0;
    return parseInt(String(strMonto).replace(/\./g, ''), 10) || 0;
};

// --- 1. LÓGICA DE CENTRALIZACIÓN RCV ---
const centralizarRCV = (mes, anio) => {
    const archivoRCV = path.join(PATHS.rcvBase, `RCV_Super_Extraccion_${anio}_${mes}.json`);
    
    if (!fs.existsSync(archivoRCV)) {
        console.log(`⚠️ No se encontró el RCV para ${mes}/${anio} en: ${archivoRCV}`);
        return;
    }

    const datosRCV = JSON.parse(fs.readFileSync(archivoRCV, 'utf8'));
    
    // Navegación segura por el JSON
    const resumenVentas = datosRCV.ventas?.resumen || [];
    const resumenCompras = datosRCV.compras?.Registro?.resumen || [];

    // Ventas
    let netoV = 0, ivaV = 0, totalV = 0;
    resumenVentas.forEach(item => {
        const neto = parseMonto(item['Monto Neto']);
        const iva = parseMonto(item['Monto IVA']);
        const total = parseMonto(item['Monto Total']);
        if (item['Tipo Documento'].includes('61')) {
            netoV -= neto; ivaV -= iva; totalV -= total;
        } else {
            netoV += neto; ivaV += iva; totalV += total;
        }
    });

    // Compras
    let netoC = 0, ivaC = 0, totalC = 0;
    resumenCompras.forEach(item => {
        const neto = parseMonto(item['Monto Neto']);
        const iva = parseMonto(item['Monto IVA']);
        const totalCalculado = neto + iva;
        if (item['Tipo Documento'].includes('61')) {
            netoC -= neto; ivaC -= iva; totalC -= totalCalculado;
        } else {
            netoC += neto; ivaC += iva; totalC += totalCalculado;
        }
    });

    console.log(`\n📘 ASIENTO: CENTRALIZACIÓN DE VENTAS - ${mes}/${anio}`);
    console.table([
        { cuenta: CUENTAS.CLIENTES.codigo, descripcion: CUENTAS.CLIENTES.nombre, debe: totalV, haber: 0 },
        { cuenta: CUENTAS.INGRESOS_VENTAS.codigo, descripcion: CUENTAS.INGRESOS_VENTAS.nombre, debe: 0, haber: netoV },
        { cuenta: CUENTAS.IVA_DEBITO.codigo, descripcion: CUENTAS.IVA_DEBITO.nombre, debe: 0, haber: ivaV }
    ]);

    if (totalC > 0 || netoC > 0) {
        console.log(`\n📕 ASIENTO: CENTRALIZACIÓN DE COMPRAS - ${mes}/${anio}`);
        console.table([
            { cuenta: CUENTAS.GASTOS_GENERALES.codigo, descripcion: CUENTAS.GASTOS_GENERALES.nombre, debe: netoC, haber: 0 },
            { cuenta: CUENTAS.IVA_CREDITO.codigo, descripcion: CUENTAS.IVA_CREDITO.nombre, debe: ivaC, haber: 0 },
            { cuenta: CUENTAS.PROVEEDORES.codigo, descripcion: CUENTAS.PROVEEDORES.nombre, debe: 0, haber: totalC }
        ]);
    } else {
        console.log(`\n📕 COMPRAS: No hubo compras registradas o válidas en ${mes}/${anio}.`);
    }
};

// --- 2. LÓGICA DE CONCILIACIÓN BANCARIA ---
const conciliarBanco = (mes, anio) => {
    const dataCartolas = JSON.parse(fs.readFileSync(PATHS.cartolas, 'utf8'));
    const foliosEmitidos = JSON.parse(fs.readFileSync(PATHS.folios_emitidos, 'utf8'));

    // Aplanar cartola
    let movimientosBanco = [];
    Object.values(dataCartolas).forEach(arr => movimientosBanco = movimientosBanco.concat(arr));

    // Filtrar fechas
    const sufijoFechaBanco = `-${mes}-${anio}`; // ej: "-12-2025"
    const prefijoFechaFolio = `${anio}-${mes}-`; // ej: "2025-12-"

    const abonosDelMes = movimientosBanco.filter(mov => mov.fecha?.includes(sufijoFechaBanco) && mov.abono > 0);
    const facturasDelMes = foliosEmitidos.filter(f => f.fecha?.startsWith(prefijoFechaFolio) && f.documento === "Factura Electronica");

    let totalConciliado = 0;
    const matches = [];

    abonosDelMes.forEach(abono => {
        const facturaMatch = facturasDelMes.find(f => !f.conciliada && Number(f.montoTotal) === abono.abono);
        if (facturaMatch) {
            matches.push({ fechaPago: abono.fecha, monto: abono.abono, facturaFolio: facturaMatch.folio });
            facturaMatch.conciliada = true;
            totalConciliado += abono.abono;
        }
    });

    if (matches.length > 0) {
        console.log(`\n📗 ASIENTO: INGRESO DE PAGOS DE CLIENTES AL BANCO - ${mes}/${anio}`);
        console.table([
            { cuenta: CUENTAS.BANCO.codigo, descripcion: CUENTAS.BANCO.nombre, debe: totalConciliado, haber: 0 },
            { cuenta: CUENTAS.CLIENTES.codigo, descripcion: CUENTAS.CLIENTES.nombre, debe: 0, haber: totalConciliado }
        ]);
    } else {
        console.log(`\n📗 BANCO: No se encontraron pagos exactos de clientes en la cartola para ${mes}/${anio}.`);
    }
};

// --- 3. EJECUTOR PRINCIPAL ---
const procesarPeriodo = (mes, anio) => {
    console.log(`\n======================================================`);
    console.log(`🚀 INICIANDO CIERRE CONTABLE: ${mes}/${anio}`);
    console.log(`======================================================`);
    centralizarRCV(mes, anio);
    conciliarBanco(mes, anio);
    console.log(`======================================================\n`);
};

// Ejecutamos para Noviembre y Diciembre de 2025
try {
    procesarPeriodo('11', '2025'); // Procesa Noviembre
    procesarPeriodo('12', '2025'); // Procesa Diciembre
} catch (error) {
    console.error('❌ Error general:', error.message);
}