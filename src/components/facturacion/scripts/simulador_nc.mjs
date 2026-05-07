import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
import crypto from 'crypto'; 
import { decrypt, encrypt } from '../../../utils/crypto.js'; 

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

async function inyectarNotaCreditoSimulada() {
    try {
        await client.connect();
        console.log("🔌 Búnker conectado. Iniciando SIMULACIÓN HARDCODEADA...");

        // =======================================================================
        // 1. DATOS HARDCODEADOS DE LA NOTA DE CRÉDITO A SIMULAR
        // =======================================================================
        const RUT_OBJETIVO = "77397024-6"; // RUT de VICTOR VOLLAIRE VSV...
        const NOMBRE_OBJETIVO = "VICTOR VOLLAIRE VSV CONSULTORIA E.I.R.L.";
        const TIPO_DTE = 61; // 61 es Nota de Crédito
        const FOLIO_FALSO = 99999; // Un folio alto para que sea obvio que es falso
        const MONTO_TOTAL_FALSO = 333; // El monto que tenías en tu ejemplo
        const MONTO_NETO_FALSO = Math.round(MONTO_TOTAL_FALSO / 1.19);
        const FECHA_HOY = new Date().toISOString().split('T')[0];

        const rutLimpio = limpiarRut(RUT_OBJETIVO);

        // =======================================================================
        // 2. BUSCAR O CREAR LA EMPRESA
        // =======================================================================
        console.log(`🔍 Buscando a la empresa con RUT: ${RUT_OBJETIVO}...`);
        const resEmpresas = await client.query("SELECT id, rut_encrypted FROM empresa");
        
        let empresaId = null;
        for (const emp of resEmpresas.rows) {
            try {
                const rutDesencriptado = decrypt(emp.rut_encrypted);
                if (limpiarRut(rutDesencriptado) === rutLimpio) {
                    empresaId = emp.id;
                    break;
                }
            } catch (err) {}
        }

        if (!empresaId) {
            console.log(`⚠️ Cliente no encontrado. Creando a ${NOMBRE_OBJETIVO}...`);
            const rutEncrypted = encrypt(RUT_OBJETIVO);
            const rutHash = crypto.createHash('sha256').update(RUT_OBJETIVO).digest('hex');

            const insertEmpresaQuery = `
                INSERT INTO empresa (razon_social, rut_encrypted, rut_hash, giro, regimen_tributario, activo)
                VALUES ($1, $2, $3, 'Simulacion', 'Simulacion', true)
                RETURNING id;
            `;
            const resultEmpresa = await client.query(insertEmpresaQuery, [NOMBRE_OBJETIVO, rutEncrypted, rutHash]);
            empresaId = resultEmpresa.rows[0].id;
        }

        console.log(`✅ Empresa ID lista: ${empresaId}`);

        // =======================================================================
        // 3. INYECTAR LA NOTA DE CRÉDITO EM 'documentos_emitidos'
        // =======================================================================
        console.log(`💾 Inyectando Nota de Crédito (DTE 61) Folio ${FOLIO_FALSO}...`);
        
        const queryInsert = `
            INSERT INTO documentos_emitidos 
            (empresa_id, rut_cliente, tipo_dte, folio, monto_neto, fecha_emision, url_pdf)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT ON CONSTRAINT unique_empresa_tipo_folio DO NOTHING
            RETURNING id;
        `;

        const valores = [
            empresaId, 
            RUT_OBJETIVO, 
            TIPO_DTE, 
            FOLIO_FALSO, 
            MONTO_NETO_FALSO, 
            FECHA_HOY, 
            null // url_pdf
        ];

        const res = await client.query(queryInsert, valores);
        
        if (res.rowCount > 0) {
            console.log(`🎉 ¡ÉXITO! Nota de Crédito guardada en BD. Abre tu CRM y revisa el historial de ${NOMBRE_OBJETIVO}.`);
        } else {
            console.log(`⚠️ Esa nota de crédito falsa ya existe en la base de datos (se evitó duplicado).`);
        }

    } catch (err) {
        console.error("❌ Error en el simulador:", err.message);
    } finally {
        await client.end();
    }
}

inyectarNotaCreditoSimulada();