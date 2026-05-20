// src/components/contabilidad/calculo_f29.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PATHS = {
    rcvBase: path.resolve(__dirname, '../../sii_core/sii_registro_compra_venta/'),
    outputBase: __dirname // Guardará los archivos en la misma carpeta contabilidad
};

// Tasa de PPM (Ajusta este valor según el régimen de la empresa, ej: 1% = 0.01)
const TASA_PPM = 0.01; 

const parseMonto = (strMonto) => {
    if (!strMonto) return 0;
    return parseInt(String(strMonto).replace(/\./g, ''), 10) || 0;
};

const calcularF29 = (mes, anio) => {
    const archivoRCV = path.join(PATHS.rcvBase, `RCV_Super_Extraccion_${anio}_${mes}.json`);
    
    if (!fs.existsSync(archivoRCV)) {
        console.log(`⚠️ No se encontró el RCV para ${mes}/${anio}.`);
        return;
    }

    const datosRCV = JSON.parse(fs.readFileSync(archivoRCV, 'utf8'));
    const resumenVentas = datosRCV.ventas?.resumen || [];
    const resumenCompras = datosRCV.compras?.Registro?.resumen || [];

    // 1. Extraer Ventas (Para IVA Débito y Base PPM)
    let netoVentas = 0, ivaDebito = 0;
    resumenVentas.forEach(item => {
        const neto = parseMonto(item['Monto Neto']);
        const iva = parseMonto(item['Monto IVA']);
        if (item['Tipo Documento'].includes('61')) { // Nota de Crédito resta
            netoVentas -= neto; ivaDebito -= iva;
        } else {
            netoVentas += neto; ivaDebito += iva;
        }
    });

    // 2. Extraer Compras (Para IVA Crédito)
    let ivaCredito = 0;
    resumenCompras.forEach(item => {
        const iva = parseMonto(item['Monto IVA']);
        if (item['Tipo Documento'].includes('61')) {
            ivaCredito -= iva;
        } else {
            ivaCredito += iva;
        }
    });

    // 3. Cálculos Finales F29
    const calculoPPM = Math.round(netoVentas * TASA_PPM);
    const resultadoIVA = ivaDebito - ivaCredito;
    
    // Si el resultado del IVA es negativo, es Remanente a favor. Si es positivo, es Impuesto a pagar.
    const ivaAPagar = resultadoIVA > 0 ? resultadoIVA : 0;
    const remanenteSiguienteMes = resultadoIVA < 0 ? Math.abs(resultadoIVA) : 0;
    
    const totalAPagarF29 = ivaAPagar + calculoPPM;

    // 4. Estructurar Objeto a Guardar
    const declaracionF29 = {
        periodo: `${mes}-${anio}`,
        fechaGeneracion: new Date().toISOString(),
        tasaPpmAplicada: TASA_PPM,
        detalle: {
            ventasAfectasNeto: netoVentas,
            ivaDebitoFiscal: ivaDebito,
            ivaCreditoFiscal: ivaCredito,
            ppm: calculoPPM
        },
        totales: {
            ivaAPagar: ivaAPagar,
            remanenteSiguienteMes: remanenteSiguienteMes,
            totalF29APagar: totalAPagarF29
        }
    };

    // 5. Mostrar en Consola
    console.log(`\n======================================================`);
    console.log(`📊 DECLARACIÓN F29: ${mes}/${anio}`);
    console.log(`------------------------------------------------------`);
    console.log(`+ IVA Débito (Ventas):     $${ivaDebito.toLocaleString('es-CL')}`);
    console.log(`- IVA Crédito (Compras):   $${ivaCredito.toLocaleString('es-CL')}`);
    console.log(`------------------------------------------------------`);
    if (remanenteSiguienteMes > 0) {
        console.log(`🔹 REMANENTE A FAVOR:      $${remanenteSiguienteMes.toLocaleString('es-CL')}`);
    } else {
        console.log(`🔸 IVA A PAGAR:            $${ivaAPagar.toLocaleString('es-CL')}`);
    }
    console.log(`+ PPM (${(TASA_PPM * 100).toFixed(2)}% de Ventas):  $${calculoPPM.toLocaleString('es-CL')}`);
    console.log(`======================================================`);
    console.log(`💰 TOTAL F29 A PAGAR:      $${totalAPagarF29.toLocaleString('es-CL')}`);
    console.log(`======================================================\n`);

    // 6. GUARDAR EN ARCHIVO JSON LOCAL
    const nombreArchivo = `f29_${mes}_${anio}.json`;
    const rutaGuardado = path.join(PATHS.outputBase, nombreArchivo);
    
    fs.writeFileSync(rutaGuardado, JSON.stringify(declaracionF29, null, 2), 'utf8');
    console.log(`📁 Archivo guardado exitosamente en: ${rutaGuardado}\n`);
};

// Ejecutar para los meses que tenemos
try {
    calcularF29('11', '2025');
    calcularF29('12', '2025');
} catch (error) {
    console.error('❌ Error general:', error.message);
}