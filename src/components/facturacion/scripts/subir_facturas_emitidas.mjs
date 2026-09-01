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

                // LA EMPRESA NACE CON ORGANIZACIÓN, SIEMPRE.
                //
                // Antes se creaba sin ella y eso rompía dos cosas a la vez:
                //   · El CRM filtra por organización, así que la ficha quedaba
                //     creada pero INVISIBLE en pantalla. Nadie podía completarla
                //     ni saber que existía.
                //   · La restricción de RUT único es (organizacion_id, rut_hash),
                //     y NULL no choca con nada: la misma empresa podía volver a
                //     crearse una y otra vez, cada vez con otra ficha.
                //
                // El 01-09-2026 había 3 así: AWKA, BOSQUE Y TIERRA y METALÚRGICA
                // CASTINOX. Se les asignó a mano y se corrigió el origen acá.
                //
                // Se toma la organización de las empresas que ya existen: es la
                // de la casa, la misma a la que pertenece quien está facturando.
                const insertEmpresaQuery = `
                    INSERT INTO empresa (razon_social, rut_encrypted, rut_hash, giro, regimen_tributario, activo, organizacion_id)
                    VALUES ($1, $2, $3, 'Por definir', 'Por definir', true,
                            (SELECT organizacion_id FROM empresa
                              WHERE organizacion_id IS NOT NULL
                              GROUP BY organizacion_id ORDER BY count(*) DESC LIMIT 1))
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

            // EL IVA Y EL TOTAL SE GUARDAN, NO SOLO EL NETO.
            //
            // Antes se calculaban las dos cifras acá arriba y al INSERT solo
            // viajaba `monto_neto`: `monto_iva` y `monto_total` quedaban en cero.
            // Como el SII devuelve el TOTAL (con IVA incluido), el neto se saca
            // dividiendo por 1,19 y el IVA es la diferencia —así los tres cuadran
            // exactamente y no se pierde un peso por redondeo—.
            //
            // No es cosmético: el historial suma esos campos para mostrar el
            // total facturado, y con 1.074 documentos en cero faltaban unos
            // $9.200.000 de IVA en pantalla. Medido el 01-09-2026.
            //
            // Las exentas (34) y las notas de crédito exentas (41) no llevan IVA:
            // ahí el total ES el neto.
            const sinIva = (tipoDte === 34 || tipoDte === 41);
            const montoNeto = sinIva ? montoTotal : Math.round(montoTotal / 1.19);
            const montoIva  = sinIva ? 0 : (montoTotal - montoNeto);
            const folio = parseInt(doc.folio);

            // Insertamos con detección de duplicados real basada en la restricción SQL
            const queryInsert = `
                INSERT INTO documentos_emitidos
                (empresa_id, rut_cliente, tipo_dte, folio, monto_neto, monto_iva, monto_total, fecha_emision, url_pdf)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT ON CONSTRAINT unique_empresa_tipo_folio DO UPDATE
                    -- Si el documento ya estaba con los montos en cero —los 1.074
                    -- que dejó la versión anterior— se completan al volver a
                    -- sincronizar. Solo se rellena lo vacío: un monto ya guardado
                    -- no se pisa.
                    SET monto_iva   = CASE WHEN documentos_emitidos.monto_iva::numeric = 0
                                           THEN EXCLUDED.monto_iva ELSE documentos_emitidos.monto_iva END,
                        monto_total = CASE WHEN documentos_emitidos.monto_total::numeric = 0
                                           THEN EXCLUDED.monto_total ELSE documentos_emitidos.monto_total END
                RETURNING id;
            `;

            const valores = [
                empresaId,
                rutOriginal,
                tipoDte,
                folio,
                montoNeto,
                montoIva,
                montoTotal,
                doc.fecha,
                doc.enlacePdf || null
            ];

            // Con `DO UPDATE` el ON CONFLICT ya no devuelve 0 filas cuando el
            // documento existía, así que `rowCount` dejó de servir para saber si
            // fue alta o no. Se pregunta por el id: si ya lo teníamos, es
            // duplicado —y de paso se le completaron los montos si estaban en 0—.
            const yaEstaba = await client.query(
                `SELECT 1 FROM documentos_emitidos
                  WHERE empresa_id = $1 AND tipo_dte = $2 AND folio = $3`,
                [empresaId, tipoDte, folio]);
            const esNuevo = yaEstaba.rowCount === 0;

            const res = await client.query(queryInsert, valores);

            if (esNuevo && res.rowCount > 0) {
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