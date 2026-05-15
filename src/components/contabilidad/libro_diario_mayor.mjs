// src/components/contabilidad/libro_diario_mayor.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PATHS = {
    rcvBase: path.resolve(__dirname, '../../sii_core/sii_registro_compra_venta/'),
    cartolas: path.resolve(__dirname, '../../cartola_bancaria/cartolas_bci.json'),
    folios_emitidos: path.resolve(__dirname, '../../sii_core/sii_historial_DTE/documentos emitidos/folios_documentos_emitidos.json'),
    outputBase: __dirname
};

// Cuentas con su "Naturaleza" para saber si el saldo final es positivo al Debe o al Haber
const CUENTAS = {
    BANCO: { codigo: '1101-02', nombre: 'BANCO', naturaleza: 'DEUDOR' },
    CLIENTES: { codigo: '1104-01', nombre: 'DEUDORES CLIENTES', naturaleza: 'DEUDOR' },
    INGRESOS_VENTAS: { codigo: '5101-01', nombre: 'VENTAS', naturaleza: 'ACREEDOR' },
    IVA_DEBITO: { codigo: '2108-02', nombre: 'IVA DEBITO FISCAL', naturaleza: 'ACREEDOR' },
    PROVEEDORES: { codigo: '2116-01', nombre: 'FACTURAS POR PAGAR', naturaleza: 'ACREEDOR' },
    IVA_CREDITO: { codigo: '1108-02', nombre: 'IVA CREDITO FISCAL', naturaleza: 'DEUDOR' },
    GASTOS_GENERALES: { codigo: '4201-08', nombre: 'GASTOS GENERALES', naturaleza: 'DEUDOR' }
};

const parseMonto = (strMonto) => {
    if (!strMonto) return 0;
    return parseInt(String(strMonto).replace(/\./g, ''), 10) || 0;
};

const generarLibros = (mes, anio) => {
    const archivoRCV = path.join(PATHS.rcvBase, `RCV_Super_Extraccion_${anio}_${mes}.json`);
    
    if (!fs.existsSync(archivoRCV)) {
        console.log(`⚠️ No se encontró el RCV para ${mes}/${anio}.`);
        return;
    }

    const libroDiario = [];

    // --- 1. RECOPILAR ASIENTOS (LIBRO DIARIO) ---
    const datosRCV = JSON.parse(fs.readFileSync(archivoRCV, 'utf8'));
    const resumenVentas = datosRCV.ventas?.resumen || [];
    const resumenCompras = datosRCV.compras?.Registro?.resumen || [];

    // Asiento 1: Centralización Ventas
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

    if (totalV > 0) {
        libroDiario.push({
            glosa: `Centralización Ventas ${mes}/${anio}`,
            fecha: `28-${mes}-${anio}`, // Fecha referencial fin de mes
            lineas: [
                { cuenta: CUENTAS.CLIENTES, debe: totalV, haber: 0 },
                { cuenta: CUENTAS.INGRESOS_VENTAS, debe: 0, haber: netoV },
                { cuenta: CUENTAS.IVA_DEBITO, debe: 0, haber: ivaV }
            ]
        });
    }

    // Asiento 2: Centralización Compras
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

    if (totalC > 0) {
        libroDiario.push({
            glosa: `Centralización Compras ${mes}/${anio}`,
            fecha: `28-${mes}-${anio}`,
            lineas: [
                { cuenta: CUENTAS.GASTOS_GENERALES, debe: netoC, haber: 0 },
                { cuenta: CUENTAS.IVA_CREDITO, debe: ivaC, haber: 0 },
                { cuenta: CUENTAS.PROVEEDORES, debe: 0, haber: totalC }
            ]
        });
    }

    // Asiento 3: Conciliación Banco
    const dataCartolas = JSON.parse(fs.readFileSync(PATHS.cartolas, 'utf8'));
    const foliosEmitidos = JSON.parse(fs.readFileSync(PATHS.folios_emitidos, 'utf8'));
    let movimientosBanco = [];
    Object.values(dataCartolas).forEach(arr => movimientosBanco = movimientosBanco.concat(arr));

    const abonosDelMes = movimientosBanco.filter(mov => mov.fecha?.includes(`-${mes}-${anio}`) && mov.abono > 0);
    const facturasDelMes = foliosEmitidos.filter(f => f.fecha?.startsWith(`${anio}-${mes}-`) && f.documento === "Factura Electronica");

    let totalConciliado = 0;
    abonosDelMes.forEach(abono => {
        const facturaMatch = facturasDelMes.find(f => !f.conciliada && Number(f.montoTotal) === abono.abono);
        if (facturaMatch) {
            facturaMatch.conciliada = true;
            totalConciliado += abono.abono;
        }
    });

    if (totalConciliado > 0) {
        libroDiario.push({
            glosa: `Ingreso Pagos Clientes Banco ${mes}/${anio}`,
            fecha: `28-${mes}-${anio}`,
            lineas: [
                { cuenta: CUENTAS.BANCO, debe: totalConciliado, haber: 0 },
                { cuenta: CUENTAS.CLIENTES, debe: 0, haber: totalConciliado }
            ]
        });
    }

    // --- 2. GENERAR LIBRO MAYOR (CUENTAS T) ---
    const libroMayor = {};

    libroDiario.forEach(asiento => {
        asiento.lineas.forEach(linea => {
            const cod = linea.cuenta.codigo;
            if (!libroMayor[cod]) {
                libroMayor[cod] = {
                    codigo: cod,
                    nombre: linea.cuenta.nombre,
                    naturaleza: linea.cuenta.naturaleza,
                    totalDebe: 0,
                    totalHaber: 0,
                    saldoFinal: 0
                };
            }
            libroMayor[cod].totalDebe += linea.debe;
            libroMayor[cod].totalHaber += linea.haber;
        });
    });

    // Calcular el saldo final de cada cuenta según su naturaleza
    Object.values(libroMayor).forEach(cuenta => {
        if (cuenta.naturaleza === 'DEUDOR') {
            cuenta.saldoFinal = cuenta.totalDebe - cuenta.totalHaber;
        } else {
            cuenta.saldoFinal = cuenta.totalHaber - cuenta.totalDebe;
        }
    });

    // --- 3. ESTRUCTURA Y GUARDADO ---
    const reporteFinal = {
        periodo: `${mes}-${anio}`,
        fechaGeneracion: new Date().toISOString(),
        libroDiario: libroDiario,
        libroMayor: Object.values(libroMayor)
    };

    console.log(`\n======================================================`);
    console.log(`📖 LIBRO MAYOR: ${mes}/${anio}`);
    console.log(`======================================================`);
    
    // Mostramos una tabla resumen del Libro Mayor en consola
    const tablaConsola = Object.values(libroMayor).map(c => ({
        Cuenta: c.nombre,
        Debe: c.totalDebe.toLocaleString('es-CL'),
        Haber: c.totalHaber.toLocaleString('es-CL'),
        Saldo: c.saldoFinal.toLocaleString('es-CL')
    }));
    console.table(tablaConsola);

    const nombreArchivo = `libro_diario_mayor_${mes}_${anio}.json`;
    const rutaGuardado = path.join(PATHS.outputBase, nombreArchivo);
    
    fs.writeFileSync(rutaGuardado, JSON.stringify(reporteFinal, null, 2), 'utf8');
    console.log(`📁 Libro completo guardado en: ${rutaGuardado}\n`);
};

// Ejecutamos para Noviembre y Diciembre de 2025
try {
    generarLibros('11', '2025');
    generarLibros('12', '2025');
} catch (error) {
    console.error('❌ Error general:', error.message);
}