import fs from 'fs';
import path from 'path';
import { pool } from '../../../database/db.js';

const limpiarRut = (rut) => {
    if (!rut) return '';
    return rut.toString().toUpperCase().replace(/[^0-9K]/g, '');
};

export async function cargarJSONaBD(empresaId) {
    const rutaArchivo = path.join(process.cwd(), 'src', 'components', 'contabilidad', 'scripts', 'datos_sii', 'reporte_completo_sii.json');

    if (!fs.existsSync(rutaArchivo)) {
        console.error('❌ Archivo JSON no encontrado. Ejecuta el robot primero.');
        return false;
    }

    let client;
    try {
        console.log(`\n📦 Leyendo archivo: ${rutaArchivo}`);
        const documentosRaw = JSON.parse(fs.readFileSync(rutaArchivo, 'utf8'));
        
        // ==========================================
        // 🧹 FILTRO ANTI-FANTASMAS DEL SII
        // ==========================================
        const documentos = documentosRaw.filter(doc => {
            const exento = (doc.Monto_Exento || "").trim();
            const codigoI = (doc.Codigo_I || "").trim();
            if (exento === "" && codigoI === "") return false;
            return true;
        });

        console.log(`🚀 Iniciando carga. Se descartaron ${documentosRaw.length - documentos.length} filas fantasma.`);
        console.log(`📊 Total de documentos REALES a procesar: ${documentos.length}`);
        
        client = await pool.connect();
        await client.query('BEGIN'); // Transacción segura

        let comprasCargadas = 0;
        let ventasCargadas = 0;
        let omitidos = 0;
        let errores = 0;

        for (const doc of documentos) {
            try {
                // Limpieza de datos
                const rut = limpiarRut(doc.RUT_Proveedor);
                const folio = parseInt(doc.Folio) || 0;
                
                const tipoDteMatch = doc.Documento_Origen.match(/\((\d+)\)/);
                const tipoDte = tipoDteMatch ? parseInt(tipoDteMatch[1]) : 33;

                let fechaEmision = null;
                if (doc.Fecha_Docto) {
                    const [dia, mes, anio] = doc.Fecha_Docto.split('/');
                    fechaEmision = `${anio}-${mes}-${dia}`;
                }

                // Ajuste de montos
                const montoNeto = parseFloat((doc.Monto_Neto || '0').replace(/\./g, '')) || 0;
                const montoIva = parseFloat((doc.IVA_Recuperable || '0').replace(/\./g, '')) || 0;
                
                const totalTexto = (doc.Monto_Total && doc.Monto_Total.trim() !== "") ? doc.Monto_Total : (doc.Codigo_I || '0');
                const montoTotal = parseFloat(totalTexto.replace(/\./g, '')) || (montoNeto + montoIva);

                // ==========================================
                // 🛡️ INYECCIÓN CON PROTECCIÓN ANTI-DUPLICADOS (RUT + FOLIO)
                // ==========================================
                if (doc.Categoria === 'Compra') {
                    const check = await client.query(`
                        SELECT 1 FROM documentos_recibidos_empresa 
                        WHERE empresa_id = $1 AND folio = $2 AND rut_proveedor = $3 AND tipo_dte = $4
                    `, [empresaId, folio, rut, tipoDte]);

                    if (check.rowCount > 0) {
                        omitidos++; // Ya existe
                    } else {
                        const queryCompra = `
                            INSERT INTO documentos_recibidos_empresa 
                            (empresa_id, rut_proveedor, tipo_dte, folio, monto_neto, monto_iva, monto_total, fecha_emision)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        `;
                        await client.query(queryCompra, [empresaId, rut, tipoDte, folio, montoNeto, montoIva, montoTotal, fechaEmision]);
                        comprasCargadas++;
                    }

                } else if (doc.Categoria === 'Venta') {
                    const check = await client.query(`
                        SELECT 1 FROM documentos_emitidos_empresa 
                        WHERE empresa_id = $1 AND folio = $2 AND rut_cliente = $3 AND tipo_dte = $4
                    `, [empresaId, folio, rut, tipoDte]);

                    if (check.rowCount > 0) {
                        omitidos++; // Ya existe
                    } else {
                        const queryVenta = `
                            INSERT INTO documentos_emitidos_empresa 
                            (empresa_id, rut_cliente, tipo_dte, folio, monto_neto, monto_iva, monto_total, fecha_emision)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        `;
                        await client.query(queryVenta, [empresaId, rut, tipoDte, folio, montoNeto, montoIva, montoTotal, fechaEmision]);
                        ventasCargadas++;
                    }
                }
            } catch (err) {
                console.error(`⚠️ Error insertando registro con folio ${doc.Folio}:`, err.message);
                errores++;
            }
        }

        // Confirmamos todos los inserts
        await client.query('COMMIT');
        
        console.log("\n" + "=".repeat(50));
        console.log("🏁 RESUMEN FINAL DE CARGA EN BD:");
        console.log(`🛒 Compras insertadas: ${comprasCargadas}`);
        console.log(`📈 Ventas insertadas: ${ventasCargadas}`);
        console.log(`⏭️  Documentos omitidos (Ya existían): ${omitidos}`);
        if (errores > 0) console.log(`❌ Registros fallidos: ${errores}`);
        console.log("=".repeat(50) + "\n");

        // ==========================================
        // 🗑️ LIMPIEZA DE ARCHIVO TEMPORAL
        // ==========================================
        try {
            fs.unlinkSync(rutaArchivo);
            console.log(`🗑️ Archivo temporal eliminado con éxito: ${rutaArchivo}`);
        } catch (delErr) {
            console.error(`⚠️ No se pudo eliminar el archivo JSON temporal: ${delErr.message}`);
        }

        return true;

    } catch (e) {
        if (client) await client.query('ROLLBACK'); 
        console.error('❌ Error crítico procesando la BD:', e.message);
        return false;
    } finally {
        if (client) client.release(); 
    }
}