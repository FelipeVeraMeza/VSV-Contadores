import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
import fs from 'fs';
import crypto from 'crypto'; // <-- Agregado para el Hash
import { decrypt, encrypt } from '../../../utils/crypto.js'; // <-- Importamos encrypt también

dotenv.config();

const client = new Client({
    user: process.env.DBS_USER,
    host: process.env.DBS_HOST,
    database: process.env.DBS_DATABASE,
    password: process.env.DBS_PASSWORD,
    port: process.env.DBS_PORT,
    ssl: { rejectUnauthorized: false }
});

// Función para normalizar RUTs (ej: "12.345.678-9" -> "123456789")
const limpiarRut = (rut) => {
    if (!rut) return '';
    return rut.toString().toUpperCase().replace(/[^0-9K]/g, '');
};

const MAPEO_DTE = {
    "Factura Electronica": 33,
    "Nota de Credito Electronica": 61,
    "Factura Exenta Electronica": 34,
    "Guia de Despacho Electronica": 52
};

async function inyectarHistorial() {
    let insertados = 0;
    let duplicados = 0;
    let empresasCreadas = 0;

    try {
        await client.connect();
        console.log("🔌 Búnker conectado. Preparando módulo de VENTAS con AUTO-CREACIÓN...");

        // 1. Cargamos el JSON
        const jsonPath = 'src/sii_core/sii_historial_DTE/documentos emitidos/folios_documentos_emitidos.json';
        const documentos = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

        // 2. Cargamos las empresas y sus RUTs encriptados
        console.log("🔍 Mapeando empresas por RUT...");
        const resEmpresas = await client.query("SELECT id, razon_social, rut_encrypted FROM empresa");
        
        // Creamos un diccionario { RUT_LIMPIO: ID_EMPRESA }
        const mapaEmpresas = new Map();
        resEmpresas.rows.forEach(emp => {
            try {
                const rutDesencriptado = decrypt(emp.rut_encrypted);
                mapaEmpresas.set(limpiarRut(rutDesencriptado), emp.id);
            } catch (err) {
                // Si falla la desencriptación de uno, saltamos
            }
        });

        console.log(`🚀 Procesando ${documentos.length} documentos emitidos...`);

        for (const doc of documentos) {
            const rutOriginal = doc.rutReceptor;
            const rutLimpio = limpiarRut(rutOriginal);
            const nombreCliente = doc.razonSocial || "CLIENTE AUTO-CREADO";

            let empresaId = mapaEmpresas.get(rutLimpio);

            // ========================================================
            // ✨ MAGIA: SI EL CLIENTE NO EXISTE, LO CREAMOS AL INSTANTE
            // ========================================================
            if (!empresaId) {
                console.log(`⚠️ Cliente faltante detectado: ${nombreCliente}. Creándolo en el CRM...`);
                
                const rutEncrypted = encrypt(rutOriginal);
                const rutHash = crypto.createHash('sha256').update(rutOriginal).digest('hex');

                const insertEmpresaQuery = `
                    INSERT INTO empresa (razon_social, rut_encrypted, rut_hash, giro, regimen_tributario, activo)
                    VALUES ($1, $2, $3, 'Por definir', 'Por definir', true)
                    RETURNING id;
                `;
                const resultEmpresa = await client.query(insertEmpresaQuery, [nombreCliente, rutEncrypted, rutHash]);
                empresaId = resultEmpresa.rows[0].id;
                
                // Lo guardamos en el mapa para no volver a crearlo si sale otra factura
                mapaEmpresas.set(rutLimpio, empresaId);
                empresasCreadas++;
                console.log(`✅ ¡Cliente ${nombreCliente} creado con éxito! ID: ${empresaId}`);
            }

            // ========================================================
            // AHORA SÍ, INSERTAMOS LA FACTURA EMITIDA
            // ========================================================
            const tipoDte = MAPEO_DTE[doc.documento] || 33;
            // Limpiamos montos por si vienen con puntos o vacíos
            const montoTotal = parseInt((doc.montoTotal || '0').toString().replace(/\./g, ''));
            const montoNeto = Math.round(montoTotal / 1.19);
            const folio = parseInt(doc.folio);

            // Insertamos con detección de duplicados real basada en la restricción SQL
            const queryInsert = `
                INSERT INTO documentos_emitidos 
                (empresa_id, rut_cliente, tipo_dte, folio, monto_neto, fecha_emision, url_pdf)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT ON CONSTRAINT unique_empresa_tipo_folio DO NOTHING
                RETURNING id;
            `;

            const valores = [
                empresaId, 
                rutOriginal, 
                tipoDte, 
                folio, 
                montoNeto, 
                doc.fecha, 
                doc.enlacePdf || null
            ];

            const res = await client.query(queryInsert, valores);
            
            if (res.rowCount > 0) {
                insertados++;
                console.log(`🧾 VENTA GUARDADA: Folio ${folio} para ${nombreCliente}`);
            } else {
                duplicados++;
            }
        }

        console.log("\n" + "=".repeat(50));
        console.log("🏁 RESUMEN FINAL DEL REGISTRO DE VENTAS:");
        console.log(`🏢 Clientes auto-creados en el CRM: ${empresasCreadas}`);
        console.log(`✨ Ventas nuevas registradas: ${insertados}`);
        console.log(`⏭️  Ventas duplicadas omitidas: ${duplicados}`);
        console.log("=".repeat(50) + "\n");

    } catch (err) {
        console.error("❌ Error en el proceso:", err.message);
    } finally {
        await client.end();
    }
}

inyectarHistorial();