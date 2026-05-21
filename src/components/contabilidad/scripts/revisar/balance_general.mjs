// src/components/contabilidad/balance_general.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PATHS = {
    // Usaremos los libros que ya generamos para asegurar consistencia
    librosBase: __dirname, 
    outputBase: __dirname
};

const generarBalanceGeneral = (mes, anio) => {
    const archivoLibro = path.join(PATHS.librosBase, `libro_diario_mayor_${mes}_${anio}.json`);
    
    if (!fs.existsSync(archivoLibro)) {
        console.log(`⚠️ No se encontró el Libro Mayor para ${mes}/${anio}. Genéralo primero.`);
        return;
    }

    const { libroMayor } = JSON.parse(fs.readFileSync(archivoLibro, 'utf8'));

    // Clasificación y Estructura de 8 Columnas
    const balance = libroMayor.map(cuenta => {
        const { codigo, totalDebe, totalHaber, saldoFinal, naturaleza } = cuenta;
        
        let activo = 0, pasivo = 0, perdida = 0, ganancia = 0;

        // Lógica de clasificación basada en el primer dígito de tu Plan de Cuentas Normal
        if (codigo.startsWith('1')) { 
            activo = saldoFinal; // Cuentas de Activo
        } else if (codigo.startsWith('2')) {
            pasivo = saldoFinal; // Cuentas de Pasivo/Patrimonio
        } else if (codigo.startsWith('4')) {
            perdida = saldoFinal; // Cuentas de Resultado Pérdida
        } else if (codigo.startsWith('5')) {
            ganancia = saldoFinal; // Cuentas de Resultado Ganancia
        }

        return {
            codigo,
            cuenta: cuenta.nombre,
            debe: totalDebe,
            haber: totalHaber,
            saldoDeudor: naturaleza === 'DEUDOR' ? saldoFinal : 0,
            saldoAcreedor: naturaleza === 'ACREEDOR' ? saldoFinal : 0,
            activo,
            pasivo,
            perdida,
            ganancia
        };
    });

    // Totales de columnas
    const totales = balance.reduce((acc, cur) => ({
        debe: acc.debe + cur.debe,
        haber: acc.haber + cur.haber,
        saldoDeudor: acc.saldoDeudor + cur.saldoDeudor,
        saldoAcreedor: acc.saldoAcreedor + cur.saldoAcreedor,
        activo: acc.activo + cur.activo,
        pasivo: acc.pasivo + cur.pasivo,
        perdida: acc.perdida + cur.perdida,
        ganancia: acc.ganancia + cur.ganancia
    }), { debe: 0, haber: 0, saldoDeudor: 0, saldoAcreedor: 0, activo: 0, pasivo: 0, perdida: 0, ganancia: 0 });

    // La "Prueba del Balance": Utilidad por Inventario vs Utilidad por Resultado
    const utilidadPatrimonial = totales.activo - totales.pasivo;
    const utilidadResultado = totales.ganancia - totales.perdida;

    console.log(`\n======================================================`);
    console.log(`⚖️ BALANCE DE 8 COLUMNAS: ${mes}/${anio}`);
    console.log(`======================================================`);
    console.table(balance.map(c => ({
        Cuenta: c.cuenta,
        Activo: c.activo.toLocaleString('es-CL'),
        Pasivo: c.pasivo.toLocaleString('es-CL'),
        Pérdida: c.perdida.toLocaleString('es-CL'),
        Ganancia: c.ganancia.toLocaleString('es-CL')
    })));

    console.log(`------------------------------------------------------`);
    console.log(`💰 RESULTADO DEL EJERCICIO:`);
    console.log(`   Utilidad (Activo - Pasivo):    $${utilidadPatrimonial.toLocaleString('es-CL')}`);
    console.log(`   Utilidad (Ganancia - Pérdida): $${utilidadResultado.toLocaleString('es-CL')}`);
    
    if (utilidadPatrimonial === utilidadResultado) {
        console.log(`✅ ¡EL BALANCE ESTÁ CUADRADO PERFECTAMENTE!`);
    } else {
        console.log(`❌ Existe una diferencia de $${Math.abs(utilidadPatrimonial - utilidadResultado)}`);
    }
    console.log(`======================================================\n`);

    // Guardar el reporte localmente
    const reporteBalance = {
        periodo: `${mes}-${anio}`,
        fechaGeneracion: new Date().toISOString(),
        detalles: balance,
        totales,
        cuadrado: utilidadPatrimonial === utilidadResultado
    };

    const nombreArchivo = `balance_general_${mes}_${anio}.json`;
    fs.writeFileSync(path.join(PATHS.outputBase, nombreArchivo), JSON.stringify(reporteBalance, null, 2));
    console.log(`📁 Archivo guardado: ${nombreArchivo}\n`);
};

// Ejecutar para Noviembre y Diciembre 2025
generarBalanceGeneral('11', '2025');
generarBalanceGeneral('12', '2025');