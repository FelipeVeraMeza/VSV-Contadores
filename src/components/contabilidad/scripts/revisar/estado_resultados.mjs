// src/components/contabilidad/estado_resultados.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PATHS = {
    rcvBase: path.resolve(__dirname, '../../sii_core/sii_registro_compra_venta/'),
    outputBase: __dirname // Carpeta actual (contabilidad)
};

const parseMonto = (strMonto) => {
    if (!strMonto) return 0;
    return parseInt(String(strMonto).replace(/\./g, ''), 10) || 0;
};

const generarEstadoResultados = (mes, anio) => {
    const archivoRCV = path.join(PATHS.rcvBase, `RCV_Super_Extraccion_${anio}_${mes}.json`);
    
    if (!fs.existsSync(archivoRCV)) {
        console.log(`⚠️ No se encontró el RCV para ${mes}/${anio}.`);
        return;
    }

    const datosRCV = JSON.parse(fs.readFileSync(archivoRCV, 'utf8'));
    const resumenVentas = datosRCV.ventas?.resumen || [];
    const resumenCompras = datosRCV.compras?.Registro?.resumen || [];

    // 1. INGRESOS DE EXPLOTACIÓN (Ventas Netas)
    let ingresosVentas = 0;
    resumenVentas.forEach(item => {
        const neto = parseMonto(item['Monto Neto']);
        if (item['Tipo Documento'].includes('61')) {
            ingresosVentas -= neto; // Rebajamos las Notas de Crédito
        } else {
            ingresosVentas += neto;
        }
    });

    // 2. COSTOS Y GASTOS (Compras Netas)
    let gastosGenerales = 0;
    resumenCompras.forEach(item => {
        const neto = parseMonto(item['Monto Neto']);
        if (item['Tipo Documento'].includes('61')) {
            gastosGenerales -= neto;
        } else {
            gastosGenerales += neto;
        }
    });

    // 3. CÁLCULO DE UTILIDAD
    const utilidadOperacional = ingresosVentas - gastosGenerales;
    const margen = ingresosVentas > 0 ? ((utilidadOperacional / ingresosVentas) * 100).toFixed(2) : 0;

    // 4. ESTRUCTURA DEL REPORTE
    const reporteER = {
        periodo: `${mes}-${anio}`,
        fechaGeneracion: new Date().toISOString(),
        cuentas: {
            ingresos: [
                { codigo: "5101-01", nombre: "VENTAS", monto: ingresosVentas }
            ],
            gastos: [
                { codigo: "4201-08", nombre: "GASTOS GENERALES", monto: gastosGenerales }
            ]
        },
        totales: {
            totalIngresos: ingresosVentas,
            totalGastos: gastosGenerales,
            utilidadNeta: utilidadOperacional,
            margenOperacional: `${margen}%`
        }
    };

    // 5. MOSTRAR EN CONSOLA (Formato Financiero)
    console.log(`\n======================================================`);
    console.log(`📈 ESTADO DE RESULTADOS: ${mes}/${anio}`);
    console.log(`======================================================`);
    console.log(`(+) INGRESOS DE EXPLOTACIÓN`);
    console.log(`    Ventas Netas:                  $${ingresosVentas.toLocaleString('es-CL')}`);
    console.log(`------------------------------------------------------`);
    console.log(`(-) COSTOS Y GASTOS`);
    console.log(`    Gastos Generales (Compras):    $${gastosGenerales.toLocaleString('es-CL')}`);
    console.log(`------------------------------------------------------`);
    if (utilidadOperacional >= 0) {
        console.log(`🟩 UTILIDAD DEL EJERCICIO:         $${utilidadOperacional.toLocaleString('es-CL')}`);
    } else {
        console.log(`🟥 PÉRDIDA DEL EJERCICIO:          $${utilidadOperacional.toLocaleString('es-CL')}`);
    }
    console.log(`📊 Margen Operacional:             ${margen}%`);
    console.log(`======================================================\n`);

    // 6. GUARDAR EN ARCHIVO JSON LOCAL
    const nombreArchivo = `estado_resultados_${mes}_${anio}.json`;
    const rutaGuardado = path.join(PATHS.outputBase, nombreArchivo);
    
    fs.writeFileSync(rutaGuardado, JSON.stringify(reporteER, null, 2), 'utf8');
    console.log(`📁 Archivo guardado exitosamente en: ${rutaGuardado}\n`);
};

// Ejecutamos para Noviembre y Diciembre de 2025
try {
    generarEstadoResultados('11', '2025');
    generarEstadoResultados('12', '2025');
} catch (error) {
    console.error('❌ Error general:', error.message);
}