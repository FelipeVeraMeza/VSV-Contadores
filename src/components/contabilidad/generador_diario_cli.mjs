import pkg from 'pg';
import readline from 'readline';

const { Client } = pkg;

// ==========================================
// 1. CONEXIÓN DIRECTA A POSTGRESQL (Tus credenciales)
// ==========================================
const dbConfig = {
    user: 'postgres.bcfckukvgojnfmmwoqpf',
    host: 'aws-1-sa-east-1.pooler.supabase.com',
    database: 'postgres',
    password: 'gW1oZXDoWRFYYimG',
    port: 6543,
    ssl: { rejectUnauthorized: false }
};

const client = new Client(dbConfig);

// ==========================================
// 2. CONFIGURACION DE CUENTAS MAESTRAS
// ==========================================
const CUENTAS = {
    VENTAS_NETO: '5101-01',
    VENTAS_IVA: '2108-02',
    VENTAS_CLIENTE: '1104-01',
    COMPRAS_NETO: '4201-01',
    COMPRAS_IVA: '1108-02',
    COMPRAS_PROV: '2116-01',
    BANCO_GLOBAL: '1101-02'
};

const formatText = (str) => str ? str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() : '';
const formatCLP = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(val || 0);

// ==========================================
// 3. MOTOR DE EXTRACCIÓN MASIVA TOTAL
// ==========================================
async function extraerTodoAbsoluto() {
    console.clear();
    console.log("======================================================");
    console.log(`🚀 MÓDULO DE EXTRACCIÓN GLOBAL (TODAS LAS EMPRESAS)`);
    console.log("======================================================");

    try {
        await client.connect();
        console.log("✅ Conexión a la Base de Datos establecida con éxito.\n");
        console.log("⏳ Descargando y calculando toda la Bóveda de Supabase...\n");

        for (let mes = 1; mes <= 12; mes++) {
            const mesStr = mes.toString().padStart(2, '0');
            const periodo = `2025-${mesStr}`;

            // --- 1. TOTAL VENTAS GLOBAL ---
            const vRes = await client.query(`
                SELECT COALESCE(SUM(monto_neto), 0) as neto 
                FROM documentos_emitidos 
                WHERE CAST(fecha_emision AS TEXT) LIKE $1 AND tipo_dte != 61
            `, [`${periodo}%`]);
            
            const vNcRes = await client.query(`
                SELECT COALESCE(SUM(monto_neto), 0) as neto 
                FROM documentos_emitidos 
                WHERE CAST(fecha_emision AS TEXT) LIKE $1 AND tipo_dte = 61
            `, [`${periodo}%`]);

            const netoVentas = (vRes.rows[0].neto || 0) - (vNcRes.rows[0].neto || 0);
            const ivaVentas = Math.round(netoVentas * 0.19);
            const totalVentas = netoVentas + ivaVentas;

            // --- 2. TOTAL COMPRAS GLOBAL ---
            const cRes = await client.query(`
                SELECT COALESCE(SUM(monto_neto), 0) as neto, COALESCE(SUM(monto_iva), 0) as iva, COALESCE(SUM(monto_total), 0) as total
                FROM documentos_recibidos 
                WHERE CAST(fecha_emision AS TEXT) LIKE $1 AND tipo_dte != 61
            `, [`${periodo}%`]);

            const cNcRes = await client.query(`
                SELECT COALESCE(SUM(monto_neto), 0) as neto, COALESCE(SUM(monto_iva), 0) as iva, COALESCE(SUM(monto_total), 0) as total
                FROM documentos_recibidos 
                WHERE CAST(fecha_emision AS TEXT) LIKE $1 AND tipo_dte = 61
            `, [`${periodo}%`]);

            const netoCompras = (cRes.rows[0].neto || 0) - (cNcRes.rows[0].neto || 0);
            const ivaCompras = (cRes.rows[0].iva || 0) - (cNcRes.rows[0].iva || 0);
            const totalCompras = (cRes.rows[0].total || 0) - (cNcRes.rows[0].total || 0);

            // --- 3. TOTAL BANCO GLOBAL ---
            const bRes = await client.query(`
                SELECT COALESCE(SUM(cargo), 0) as egresos, COALESCE(SUM(abono), 0) as ingresos
                FROM movimientos_bancarios 
                WHERE CAST(fecha AS TEXT) LIKE $1
            `, [`${periodo}%`]);

            const ingresosBanco = bRes.rows[0].ingresos || 0;
            const egresosBanco = bRes.rows[0].egresos || 0;

            // --- 4. RENDERIZAR ASIENTO SI HAY MOVIMIENTO ---
            if (netoVentas !== 0 || netoCompras !== 0 || ingresosBanco !== 0) {
                console.log(`\n📅 PERIODO CENTRALIZADO: ${mesStr}/2025`);
                console.log(`------------------------------------------------------`);
                
                const filasAsiento = [];
                
                if (netoVentas > 0) {
                    filasAsiento.push({ CUENTA: CUENTAS.VENTAS_CLIENTE, DETALLE: 'INGRESOS TOTALES GLOBAL', DEBE: formatCLP(totalVentas), HABER: '' });
                    filasAsiento.push({ CUENTA: CUENTAS.VENTAS_NETO, DETALLE: 'VENTAS NETAS GLOBAL', DEBE: '', HABER: formatCLP(netoVentas) });
                    filasAsiento.push({ CUENTA: CUENTAS.VENTAS_IVA, DETALLE: 'IVA DEBITO GLOBAL', DEBE: '', HABER: formatCLP(ivaVentas) });
                }

                if (netoCompras > 0) {
                    filasAsiento.push({ CUENTA: CUENTAS.COMPRAS_NETO, DETALLE: 'GASTOS TOTALES GLOBAL', DEBE: formatCLP(netoCompras), HABER: '' });
                    filasAsiento.push({ CUENTA: CUENTAS.COMPRAS_IVA, DETALLE: 'IVA CREDITO GLOBAL', DEBE: formatCLP(ivaCompras), HABER: '' });
                    filasAsiento.push({ CUENTA: CUENTAS.COMPRAS_PROV, DETALLE: 'PASIVOS/PROVEEDORES GLOBAL', DEBE: '', HABER: formatCLP(totalCompras) });
                }

                if (ingresosBanco > 0 || egresosBanco > 0) {
                    filasAsiento.push({ CUENTA: CUENTAS.BANCO_GLOBAL, DETALLE: 'CAJA/BANCO INGRESOS', DEBE: formatCLP(ingresosBanco), HABER: '' });
                    filasAsiento.push({ CUENTA: CUENTAS.BANCO_GLOBAL, DETALLE: 'CAJA/BANCO EGRESOS', DEBE: '', HABER: formatCLP(egresosBanco) });
                }

                console.table(filasAsiento);
            }
        }

    } catch (error) {
        console.error("\n❌ Error FATAL al procesar los datos:");
        console.error(error);
    } finally {
        await client.end();
        console.log("\n🏁 CONSOLIDADO GLOBAL 2025 FINALIZADO.");
        process.exit(0);
    }
}

extraerTodoAbsoluto();