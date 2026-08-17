import puppeteer from 'puppeteer';
import dotenv from 'dotenv';
import pkg from 'pg'; 
import { credencialesDelSistema } from '../../../utils/credencialesFacturacion.js';
// Bajar el PDF de la nota, igual que las facturas.
import { descargarDocumentoSii } from './descargarDocumentoSii.mjs';
import { cerrarNavegador, cerrarCliente } from './cerrarNavegador.mjs';

const { Client } = pkg;
dotenv.config();

// =======================================================
// HELPERS REUTILIZABLES
// =======================================================

const delay = ms => new Promise(r => setTimeout(r, ms));

async function clickByText(page, text) {
    await page.evaluate((txt) => {
        const el = [...document.querySelectorAll("a,button,input")]
            .find(e =>
                e.innerText?.includes(txt) ||
                e.value?.includes(txt)
            );

        if (el) el.click();
    }, text);
}

async function capturarFolio(page) {
    for (let i = 0; i < 30; i++) {

        const folio = await page.evaluate(() => {
            const txt = document.body.innerText;

            const match =
                txt.match(/Folio\s*N?[°º]?\s*(\d+)/i) ||
                txt.match(/FOLIO\s*(\d+)/i) ||
                txt.match(/N°\s*(\d+)/i);

            return match ? match[1] : null;
        });

        if (folio) return folio;

        await new Promise(r => setTimeout(r, 1000));
    }

    throw new Error("No se pudo capturar el folio en la pantalla final del SII.");
}

// =======================================================
// 🚀 ROBOT PRINCIPAL
// =======================================================

export async function emitirNotaCDPuppeteer(datos, credSii = credencialesDelSistema()) {

    let browser;
    let page;
    let client;
    let montoRescatado = 0; // Guardaremos el monto original aquí

    try {
        console.log("=========================================");
        console.log(`🤖 Iniciando robot SII para Nota DTE ${datos.tipo_documento}...`);
        console.log("=========================================");

        // 1. INICIALIZAMOS BASE DE DATOS
        client = new Client({
            user: process.env.DBS_USER,
            host: process.env.DBS_HOST,
            database: process.env.DBS_DATABASE,
            password: process.env.DBS_PASSWORD,
            port: process.env.DBS_PORT,
            ssl: { rejectUnauthorized: false }
        });
        await client.connect();
        console.log("🔌 Conexión al Búnker (Supabase) exitosa.");

        // =======================================================================
        // 2. LANZAR NAVEGADOR Y LOGIN CON RESILIENCIA (AUTO-REINTENTO)
        // =======================================================================
        let navegacionExitosa = false;
        let intentosNavegacion = 0;

        while (!navegacionExitosa && intentosNavegacion < 3) {
            intentosNavegacion++;
            try {
                console.log(`\n🌐 [Intento ${intentosNavegacion}/3] Levantando navegador...`);
                
                browser = await puppeteer.launch({
                    headless: true, // Modo servidor
                    defaultViewport: null,
                    args: [
                        "--no-sandbox",
                        "--disable-setuid-sandbox"
                    ]
                });

                page = await browser.newPage();
                page.setDefaultNavigationTimeout(60000);

                console.log(`🔑 Entrando al portal del SII...`);
                await page.goto('https://misiir.sii.cl/cgi_misii/siihome.cgi', { 
                    waitUntil: 'networkidle2', 
                    timeout: 45000 
                });

                navegacionExitosa = true; 
                console.log("✅ Acceso al portal exitoso.");

            } catch (error) {
                console.log(`⚠️ Falló el intento ${intentosNavegacion}: ${error.message}`);
                if (browser) {
                    console.log("🧨 Cerrando instancia atascada...");
                    await browser.close().catch(() => {});
                }
                if (intentosNavegacion < 3) {
                    await delay(5000);
                }
            }
        }

        if (!navegacionExitosa) throw new Error('❌ El portal del SII está caído o lento. Abortado.');

        // =======================================================
        // 1️⃣ LOGIN
        // =======================================================
        const rutLimpio = `${credSii.DTE_RUT}${credSii.DTE_DV}`.replace(/[^0-9kK]/gi, '');
        await page.waitForSelector('#rutcntr, #rut');
        await page.type('#rutcntr', rutLimpio);
        await page.type('#clave', credSii.DTE_PASS);
        await Promise.all([page.click('#bt_ingresar'), page.waitForNavigation()]);

        // =======================================================
        // 2️⃣ SELECCIÓN EMPRESA
        // =======================================================
        console.log("📂 [2/6] Accediendo al Historial de Documentos Emitidos...");
        await page.goto('https://www1.sii.cl/cgi-bin/Portal001/mipeSelEmpresa.cgi?DESDE_DONDE_URL=OPCION%3D2%26TIPO%3D4', { waitUntil: 'networkidle2' });

        await page.evaluate((rutEmisorOpcional) => {
            const select = document.querySelector('select');
            if (select) {
                // Si pasamos el RUT de la empresa desde el frontend, lo busca. Si no, selecciona el índice 1 por defecto.
                const opt = rutEmisorOpcional ? Array.from(select.options).find(o => o.text.includes(rutEmisorOpcional)) : null;
                if (opt) {
                    select.value = opt.value;
                    const btn = document.querySelector('input[type="submit"], button[type="submit"], input[name="btnContinuar"]');
                    if (btn) btn.click();
                } else if (select.options.length > 1) {
                    select.selectedIndex = 1; 
                    const btn = document.querySelector('input[type="submit"], button[type="submit"]');
                    if (btn) btn.click();
                }
            }
        }, datos.rutEmisor ? datos.rutEmisor.replace(/[^0-9]/g, '') : null); // Evita hardcodear, usa el RUT dinámico si existe
        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        // =======================================================
        // 3️⃣ FILTRAR FOLIO ORIGINAL
        // =======================================================
        console.log(`🔎 [3/6] Filtrando tabla por Folio Original: ${datos.referencia.folio}...`);

        await page.waitForSelector("table");

        await page.evaluate((folio) => {
            const input = document.querySelector('input[name="FOLIO"]') || document.querySelector('input[name="folio"]');
            if (!input) return;

            input.value = folio;

            const btn = [...document.querySelectorAll("button,input")].find(b =>
                b.value?.toLowerCase().includes("consultar") ||
                b.innerText?.toLowerCase().includes("consultar")
            );

            if (btn) btn.click();

        }, String(datos.referencia.folio));

        await delay(3000); // Esperamos a que la tabla se recargue por AJAX

        // =======================================================
        // 4️⃣ BUSCAR EN TABLA Y RESCATAR MONTO
        // =======================================================
        console.log("📄 [4/6] Escaneando tabla y páginas...");

        let encontrado = false;
        let paginas = 0;

        while (!encontrado && paginas < 20) {

            const rescateDOM = await page.evaluate((folio) => {
                const filas = document.querySelectorAll("table tbody tr");
                for (const f of filas) {
                    const tds = f.querySelectorAll("td");
                    if (tds.length < 7) continue;

                    // Columna 4 es Folio, Columna 6 es Monto Total
                    if (tds[4].innerText.trim() === folio) {
                        const montoTxt = tds[6]?.innerText || '0';
                        const montoNum = parseInt(montoTxt.replace(/[^0-9]/g, '')) || 0;
                        
                        const link = tds[0].querySelector("a");
                        if (link) {
                            link.click();
                            return { match: true, monto: montoNum };
                        }
                    }
                }
                return { match: false, monto: 0 };
            }, String(datos.referencia.folio));

            encontrado = rescateDOM.match;
            if (encontrado) {
                montoRescatado = rescateDOM.monto; // Guardamos el monto original de la factura para SQL
                break;
            }

            // Paginación
            const siguiente = await page.evaluate(() => {
                const btn = [...document.querySelectorAll("a,button,input")]
                    .find(b => b.innerText === ">" || b.value === ">");

                if (btn) { btn.click(); return true; }
                return false;
            });

            if (!siguiente) break;

            await page.waitForNavigation({ waitUntil: "networkidle2" });
            paginas++;
        }

        if (!encontrado) throw new Error(`No se encontró el folio ${datos.referencia.folio} en el historial del SII.`);

        await page.waitForNavigation({ waitUntil: "networkidle2" });
        console.log(`✅ Folio encontrado. Monto original detectado: $${montoRescatado}`);

        // =======================================================
        // 5️⃣ SELECCIONAR OPERACIÓN (ANULAR, CORREGIR, ETC)
        // =======================================================
        console.log(`⚡ [5/6] Preparando DTE ${datos.tipo_documento} (Motivo: ${datos.referencia.codigo})...`);

        const accion = await page.evaluate((tipo, codigo) => {
            let texto = "";
            if (tipo === 61) {
                if (codigo === "1") texto = "Nota de Crédito de Anulación";
                if (codigo === "2") texto = "Nota de Crédito para Corregir Texto";
                if (codigo === "3") texto = "Nota de Crédito para Corregir Montos";
            }
            if (tipo === 56) {
                if (codigo === "3") texto = "Nota de Débito para Corregir Montos";
                else texto = "Nota de Débito"; // genérico
            }

            const link = [...document.querySelectorAll("a")].find(l => l.innerText.includes(texto));
            if (link) { link.click(); return true; }
            return false;
        }, Number(datos.tipo_documento), String(datos.referencia.codigo));

        if (!accion) throw new Error("El SII no habilitó el botón para generar esta nota.");

        await page.waitForNavigation({ waitUntil: "networkidle2" });

        // =======================================================
        // 6️⃣ FIRMA FINAL EXPRESS
        // =======================================================
        console.log("✍️ [6/6] Ejecutando firma express...");
        await delay(2000); // Pausa visual

        // 1. Clic botón firmar
        await clickByText(page, "Firmar");

        // 2. Ingresar Clave
        await page.waitForSelector("#myPass, input[type=password]", { visible: true });
        await page.type("#myPass, input[type=password]", credSii.SII_PFX_PASS, { delay: 40 });

        // 3. Confirmar Firma
        console.log("   🚀 Enviando documento...");
        await Promise.all([
            page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}),
            clickByText(page, "Firmar")
        ]);

        // =======================================================
        // 🎉 CAPTURAR FOLIO Y GUARDAR EN POSTGRES
        // =======================================================
        const folioGenerado = await capturarFolio(page);
        console.log(`🎉 ¡MISIÓN CUMPLIDA! Folio Oficial Generado: ${folioGenerado}`);

        // Bajar el PDF. Las notas de crédito y débito no mandan correo, así que
        // hasta ahora se emitían y no quedaba archivo en ninguna parte. El tipo
        // va en el nombre: un "Factura_1367.pdf" para una nota de crédito
        // confunde a quien después busca el documento en la carpeta.
        let rutaPdf = null;
        try {
            const pdf = await descargarDocumentoSii(page, folioGenerado, Number(datos.tipo_documento) || 61);
            if (pdf) rutaPdf = pdf.rutaPC;
        } catch { /* la nota ya está emitida ante el SII */ }

        // --- LÓGICA DE GUARDADO SQL INTELIGENTE ---
        let empresaIdFinal = datos.empresa_id;

        // 🧠 Si React no mandó el ID (o mandó "SIN_ID"), el robot lo busca por su cuenta
        if (!empresaIdFinal || empresaIdFinal === 'EXTERNO' || empresaIdFinal === 'SIN_ID') {
            console.log("🔍 ID de empresa no recibido desde React. Buscando en la base de datos...");
            try {
                // 1. Intentamos sacar el ID buscando la factura original que acabamos de afectar.
                //    Hay que filtrar por tipo_dte: los folios de nota de crédito son una serie
                //    aparte que arranca en 1 y choca con los folios de factura.
                const busquedaOriginal = await client.query(
                    `SELECT empresa_id FROM documentos_emitidos
                      WHERE folio = $1 AND tipo_dte IN (33, 34) LIMIT 1`,
                    [datos.referencia.folio]
                );
                
                if (busquedaOriginal.rows.length > 0) {
                    empresaIdFinal = busquedaOriginal.rows[0].empresa_id;
                    console.log(`✅ Empresa ID recuperada de la factura original: ${empresaIdFinal}`);
                } else {
                    // 2. Si no la encuentra, buscamos a la empresa OLIVOS por defecto
                    const busquedaOlivos = await client.query(`SELECT id FROM empresa WHERE razon_social ILIKE '%OLIVOS%' LIMIT 1`);
                    if (busquedaOlivos.rows.length > 0) {
                        empresaIdFinal = busquedaOlivos.rows[0].id;
                        console.log(`✅ Empresa ID asignada por defecto (OLIVOS): ${empresaIdFinal}`);
                    }
                }
            } catch (err) {
                console.log("⚠️ No se pudo auto-recuperar el ID de la empresa:", err.message);
            }
        }

        // --- AHORA SÍ GUARDAMOS ---
        if (empresaIdFinal && empresaIdFinal !== 'EXTERNO' && empresaIdFinal !== 'SIN_ID') {
            try {
                const rutClienteLimpio = `${datos.rutReceptor}-${datos.dvReceptor}`;
                const tipoFinal = Number(datos.tipo_documento);
                const fechaHoy = new Date().toISOString();
                
                // Calculamos Neto si es DTE 61 (Nota Crédito), le sacamos el IVA al monto rescatado
                const montoNetoFinal = Math.round(montoRescatado / 1.19); 

                // El folio que estamos afectando lo sabemos con certeza: es el que el
                // usuario eligió y el que acabamos de encontrar en el historial del SII.
                // Guardarlo es lo que permite después descontar la nota del cobro.
                const folioAfectado = parseInt(datos.referencia.folio, 10);
                const tipoAfectado = Number(datos.referencia.tipo_dte) || 33;
                const codRef = parseInt(datos.referencia.codigo, 10) || null;

                const queryInsert = `
                    INSERT INTO documentos_emitidos
                    (empresa_id, rut_cliente, tipo_dte, folio, monto_neto, fecha_emision,
                     folio_ref, tipo_dte_ref, cod_ref, ref_origen)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'robot')
                    ON CONFLICT ON CONSTRAINT unique_empresa_tipo_folio DO NOTHING
                    RETURNING id;
                `;

                const dbRes = await client.query(queryInsert, [
                    empresaIdFinal,
                    rutClienteLimpio,
                    tipoFinal,
                    folioGenerado,
                    montoNetoFinal,
                    fechaHoy,
                    Number.isFinite(folioAfectado) ? folioAfectado : null,
                    Number.isFinite(folioAfectado) ? tipoAfectado : null,
                    codRef
                ]);

                if (dbRes.rowCount > 0) {
                    console.log(`💾 Guardado exitoso en base de datos (Supabase).`);
                } else {
                    console.log(`⚠️ Documento ya existía en la base de datos.`);
                }
            } catch (dbError) {
                console.error('❌ Error de Inserción SQL:', dbError.message);
            }
        } else {
            console.log("ℹ️ No se guardó en BD porque no se logró encontrar el ID de la empresa.");
        }

        return {
            ok: true,
            folio: folioGenerado,
            tipo: Number(datos.tipo_documento),
            rutaPdf,
            fileName: `DTE_${datos.tipo_documento}_${folioGenerado}.pdf`
        };

    } catch (err) {
        console.error("❌ ERROR FATAL ROBOT:", err.message);
        throw err;
    } finally {
        // Cierre Seguro
        if (page && !page.isClosed()) {
            try { await page.goto("https://misiir.sii.cl/cgi_misii/siu/cgi_misii_logout", { timeout: 3000 }); } catch (e) {}
        }
        // La base PRIMERO: ver la nota en factura_manual.mjs.
        await cerrarCliente(client, 'NOTA');
        await cerrarNavegador(browser, 'NOTA');
        console.log("🏁 Robot finalizado y desconectado.");
    }
}