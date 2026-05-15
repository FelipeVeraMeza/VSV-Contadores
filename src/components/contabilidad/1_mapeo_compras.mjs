// src/components/contabilidad/contabilizador_vsv_total.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. RUTAS ABSOLUTAS (Apuntando a tus documentos reales)
const PATHS = {
    cartola: path.resolve(__dirname, '../../cartola_bancaria/cartolas_bci.json'),
    planNormal: path.resolve(__dirname, '../../plan de cuentas/Plan_Limpio_Normal.csv'),
    honorarios: path.resolve(__dirname, '../../sii_core/sii_boleta_honorarios/BHE_Resumen_EMITIDAS_2025.json'),
    emitidos: path.resolve(__dirname, '../../sii_core/sii_historial_DTE/documentos emitidos/folios_documentos_emitidos.json'),
    rcvBase: path.resolve(__dirname, '../../sii_core/sii_registro_compra_venta/'),
    memoria: path.join(__dirname, 'memoria_proveedores.json')
};

const parseMonto = (str) => {
    if (!str || str === "0") return 0;
    return parseInt(String(str).replace(/\./g, ''), 10) || 0;
};

// 2. MEMORIA DE APRENDIZAJE (Regla del Jefe)
let memoria = fs.existsSync(PATHS.memoria) ? JSON.parse(fs.readFileSync(PATHS.memoria, 'utf8')) : {
    "76610718-4": { codigo: "4201-37", nombre: "SERVICIOS COMPUTACIONALES" }
};

const procesarPeriodo = (mes, anio) => {
    console.log(`\n======================================================`);
    console.log(`📂 PROCESANDO DOCUMENTOS: ${mes}/${anio}`);
    console.log(`======================================================`);

    const rcvPath = path.join(PATHS.rcvBase, `RCV_Super_Extraccion_${anio}_${mes}.json`);
    if (!fs.existsSync(rcvPath)) return console.log("⚠️ Archivo RCV no encontrado.");

    const rcv = JSON.parse(fs.readFileSync(rcvPath, 'utf8'));
    const folios = JSON.parse(fs.readFileSync(PATHS.emitidos, 'utf8'));
    const cartola = JSON.parse(fs.readFileSync(PATHS.cartola, 'utf8'));

    // --- A. VENTAS (SII) ---
    const rv = rcv.ventas?.resumen || [];
    let netoV = 0;
    rv.forEach(i => {
        const n = parseMonto(i['Monto Neto']);
        if (i['Tipo Documento'].includes('61')) netoV -= n; else netoV += n;
    });

    // --- B. COMPRAS CON CÁLCULO INTELIGENTE (SII) ---
    const rc = rcv.compras?.Registro?.detalles?.['Factura Electrónica (33)'] || [];
    const comprasMapeadas = rc.map(c => {
        const total = parseMonto(c['Monto Total']);
        const iva = parseMonto(c['IVA']);
        const neto = parseMonto(c['Monto Neto'] || c['Neto']) || (total - iva); // Si no viene el neto, lo calcula
        const cuenta = memoria[c['RUT Emisor']] || { nombre: "GASTOS POR CLASIFICAR" };
        return { proveedor: c['Razón Social Emisor'], neto: neto.toLocaleString('es-CL'), cuenta: cuenta.nombre };
    });

    // --- C. CONCILIACIÓN (BANCO VS SII) ---
    let movimientos = [];
    Object.values(cartola).forEach(arr => movimientos = movimientos.concat(arr));
    const abonos = movimientos.filter(m => m.fecha?.includes(`-${mes}-${anio}`) && m.abono > 0);
    const facturas = folios.filter(f => f.fecha?.startsWith(`${anio}-${mes}`) && f.documento.includes("Factura"));

    const conciliados = [];
    abonos.forEach(abono => {
        const match = facturas.find(f => !f.pagado && Number(f.montoTotal) === abono.abono);
        if (match) {
            conciliados.push({ folio: match.folio, cliente: match.razonSocial, monto: abono.abono.toLocaleString('es-CL') });
            match.pagado = true;
        }
    });

    // --- RESULTADOS EN TERMINAL ---
    console.log(`📈 VENTAS: $${netoV.toLocaleString('es-CL')} (Neto)`);
    console.log(`📉 COMPRAS (Mapeo Automático):`);
    console.table(comprasMapeadas);
    console.log(`✅ CONCILIACIÓN BANCARIA (Match RUT/Monto):`);
    console.table(conciliados);
};

// Ejecución para tu historial
procesarPeriodo('11', '2025');
procesarPeriodo('12', '2025');