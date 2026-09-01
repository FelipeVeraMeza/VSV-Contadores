import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { decrypt, encrypt } from '../../../utils/crypto.js'; 

// Configuración para usar __dirname en módulos (.mjs)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const client = new Client({
    user: process.env.DBS_USER,
    host: process.env.DBS_HOST,
    database: process.env.DBS_DATABASE,
    password: process.env.DBS_PASSWORD,
    port: process.env.DBS_PORT,
    ssl: { rejectUnauthorized: false }
});

const limpiarRut = (rut) => {
    if (!rut) return '';
    return rut.toString().toUpperCase().replace(/[^0-9K]/g, '');
};

const MAPEO_DTE = {
    "Factura Electronica": 33,
    "Nota de Credito Electronica": 61,
    "Factura Exenta Electronica": 34,
    "Guia de Despacho Electronica": 52,
    "Boleta Electronica": 39
};

async function inyectarCompras() {
    let insertados = 0;
    let duplicados = 0;
    let empresasCreadas = 0;
    let sinDetalle = 0;

    try {
        await client.connect();
        console.log("🔌 Búnker conectado. Preparando módulo de COMPRAS con AUTO-CREACIÓN...");

        // 1. Ruta de tu JSON de RECIBIDOS (Dinámica y segura)
        // Viaja 3 carpetas hacia atrás desde 'scripts' hasta llegar a 'src', y luego entra a 'sii_core...'
        const jsonPath = path.join(__dirname, '../../../sii_core/sii_historial_DTE/documentos recibidos/folios_documentos_recibidos.json');
        
        if (!fs.existsSync(jsonPath)) {
            console.log(`⚠️ No se encontró el archivo JSON de compras en la ruta:\n${jsonPath}\nAbortando inyección.`);
            return;
        }

        const documentos = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

        // 2. Mapear empresas del CRM para asignar el ID correctamente
        console.log("🔍 Mapeando empresas del sistema...");
        const resEmpresas = await client.query("SELECT id, rut_encrypted FROM empresa");
        
        const mapaEmpresas = new Map();
        resEmpresas.rows.forEach(emp => {
            try {
                const rutReal = decrypt(emp.rut_encrypted);
                mapaEmpresas.set(limpiarRut(rutReal), emp.id);
            } catch (err) {}
        });

        console.log(`🚀 Procesando ${documentos.length} facturas recibidas...`);

        for (const doc of documentos) {
            // Validar que el documento tenga el detalle extraído del SII
            if (!doc.detalleCompleto || !doc.detalleCompleto.cabecera) {
                sinDetalle++;
                continue; 
            }

            const rutReceptorOriginal = doc.detalleCompleto.cabecera.receptorRut;
            const rutReceptorLimpio = limpiarRut(rutReceptorOriginal);
            const nombreReceptor = doc.detalleCompleto.cabecera.receptorNombre || "CLIENTE AUTO-CREADO";

            let empresaId = mapaEmpresas.get(rutReceptorLimpio);

            // ========================================================
            // ✨ MAGIA: SI LA EMPRESA RECEPTORA NO EXISTE, LA CREAMOS
            // ========================================================
            if (!empresaId) {
                console.log(`⚠️ Empresa receptora faltante: ${nombreReceptor}. Creándola en el CRM...`);
                
                const rutEncrypted = encrypt(rutReceptorOriginal);
                const rutHash = crypto.createHash('sha256').update(rutReceptorOriginal).digest('hex');

                const insertEmpresaQuery = `
                    -- Con organización, igual que en subir_facturas_emitidas.mjs:
                    -- sin ella la ficha queda invisible en el CRM (que filtra por
                    -- organización) y además puede duplicarse, porque el RUT único
                    -- es (organizacion_id, rut_hash) y NULL no choca con nada.
                    INSERT INTO empresa (razon_social, rut_encrypted, rut_hash, giro, regimen_tributario, activo, organizacion_id)
                    VALUES ($1, $2, $3, 'Por definir', 'Por definir', true,
                            (SELECT organizacion_id FROM empresa
                              WHERE organizacion_id IS NOT NULL
                              GROUP BY organizacion_id ORDER BY count(*) DESC LIMIT 1))
                    RETURNING id;
                `;
                const resultEmpresa = await client.query(insertEmpresaQuery, [nombreReceptor, rutEncrypted, rutHash]);
                empresaId = resultEmpresa.rows[0].id;
                
                mapaEmpresas.set(rutReceptorLimpio, empresaId);
                empresasCreadas++;
                console.log(`✅ ¡Empresa ${nombreReceptor} creada con éxito! ID: ${empresaId}`);
            }

            // ========================================================
            // AHORA SÍ, INSERTAMOS LA FACTURA DE COMPRA
            // ========================================================
            const tipoDte = MAPEO_DTE[doc.documento] || 33;
            const folio = parseInt(doc.folio);
            const rutProveedor = limpiarRut(doc.rutEmisor);
            const razonSocialProveedor = doc.razonSocial;
            
            // Lógica inteligente de montos (Prioriza el detalle del SII, si falla calcula manual)
            const montoTotal = parseInt((doc.montoTotal || '0').toString().replace(/\./g, ''));
            const montoNeto = doc.detalleCompleto.cabecera.montoNeto 
                ? parseInt(doc.detalleCompleto.cabecera.montoNeto.toString().replace(/\./g, '')) 
                : Math.round(montoTotal / 1.19);
            const montoIva = doc.detalleCompleto.cabecera.montoIva 
                ? parseInt(doc.detalleCompleto.cabecera.montoIva.toString().replace(/\./g, '')) 
                : Math.round(montoTotal - montoNeto);

            const queryInsert = `
                INSERT INTO documentos_recibidos 
                (empresa_id, rut_proveedor, razon_social_proveedor, tipo_dte, folio, monto_neto, monto_iva, monto_total, fecha_emision)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT ON CONSTRAINT unique_compra_folio DO NOTHING
                RETURNING id;
            `;

            const valores = [empresaId, rutProveedor, razonSocialProveedor, tipoDte, folio, montoNeto, montoIva, montoTotal, doc.fecha];
            const res = await client.query(queryInsert, valores);
            
            if (res.rowCount > 0) {
                insertados++;
                console.log(`🛒 COMPRA GUARDADA: Folio ${folio} de ${razonSocialProveedor}`);
            } else {
                duplicados++;
            }
        }

        console.log("\n" + "=".repeat(50));
        console.log("🏁 RESUMEN FINAL DEL REGISTRO DE COMPRAS:");
        console.log(`🏢 Empresas (Clientes) auto-creadas en el CRM: ${empresasCreadas}`);
        console.log(`🛒 Nuevas compras registradas en la DB: ${insertados}`);
        console.log(`⏭️  Compras duplicadas omitidas: ${duplicados}`);
        if (sinDetalle > 0) console.log(`❓ Documentos sin leer omitidos: ${sinDetalle}`);
        console.log("=".repeat(50) + "\n");

    } catch (err) {
        console.error("❌ Error en el proceso:", err.message);
    } finally {
        await client.end();
    }
}

inyectarCompras();