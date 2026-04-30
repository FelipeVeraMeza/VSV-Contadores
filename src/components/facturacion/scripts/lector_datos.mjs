import puppeteer from 'puppeteer';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pdf from 'pdf-parse/lib/pdf-parse.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directorio de descargas
const carpetaDescargas = path.join(__dirname, 'pdf_descargados');
if (!fs.existsSync(carpetaDescargas)) fs.mkdirSync(carpetaDescargas);

/**
 * Función 1: Extraer correo del cliente y montos del PDF
 */
async function extraerDatosDelPDF(rutaPDF) {
    try {
        const dataBuffer = fs.readFileSync(rutaPDF);
        const data = await pdf(dataBuffer);
        
        const lineas = data.text.split('\n').map(l => l.trim());
        const textoLimpio = data.text.replace(/\n/g, ' ');

        let correo = "No_encontrado@falta_correo.cl";
        const lineaContacto = lineas.find(l => l.toUpperCase().includes('CONTACTO:'));
        if (lineaContacto) {
            const emailMatch = lineaContacto.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
            if (emailMatch) correo = emailMatch[0];
        }

        const netoMatch = textoLimpio.match(/MONTO NETO\s*\$\s*([\d.]+)/i);
        const ivaMatch = textoLimpio.match(/I\.V\.A\.\s*19%\s*\$\s*([\d.]+)/i);
        const totalMatch = textoLimpio.match(/TOTAL\s*\$\s*([\d.]+)/i);

        return {
            correo: correo,
            neto: netoMatch ? netoMatch[1] : "0",
            iva: ivaMatch ? ivaMatch[1] : "0",
            total: totalMatch ? totalMatch[1] : "0"
        };
    } catch (e) {
        return { correo: "Error_al_leer@pdf.cl", neto: "0", iva: "0", total: "0" };
    }
}

/**
 * Función 2: Previsualizar el correo 
 */
function previsualizarCorreo(datosFactura, datosExtraidos, rutaPDF) {
    console.log(`\n✉️  PREPARANDO CORREO PARA: ${datosFactura.razonSocial}`);
    
    const asunto = `Factura N°${datosFactura.folio} - Servicio Contabilidad FULL EMPRENDEDOR - Simple Pyme`;

    const textoCorreo = `Estimados ${datosFactura.razonSocial}

Junto con saludar, informamos que ya hemos emitido la factura N°${datosFactura.folio} correspondiente a los servicios de contabilidad, la cual se encuentra disponible para pago.

📅 Fecha de vencimiento: 5 de los próximos días

VALOR: $${datosExtraidos.neto} + IVA ($${datosExtraidos.iva}) = $${datosExtraidos.total}

🔄 Mecanismos de pago:
Transferencia bancaria:
VOLLAIRE & OLIVOS SIMPLE PYME LTDA
RUT: 78.306.207-0
N° Cuenta: 70809538 (Banco BCI)
Correo: MATIAS.OLIVOS@VSVCONSULTORES.COM

🌐 Pago en línea: https://www.flow.cl/btn.php?token=xe78c9acb73c3eff5e917d5c932a4a2f7f971abe

Saludos cordiales,
Simple Pyme`;

    console.log(`   🔸 DESTINATARIO : ${datosExtraidos.correo}`);
    console.log(`   🔸 ASUNTO       : ${asunto}`);
    console.log(`   🔸 ADJUNTOS     : 1. ${datosFactura.folio}.pdf`);
    console.log("   🔸 CUERPO DEL MENSAJE:");
    console.log("--------------------------------------------------");
    console.log(textoCorreo);
    console.log("==================================================\n");
}

/**
 * Función 3: Robot Principal (PROCESAMIENTO MASIVO)
 */
async function descargarYPrevisualizarMasivo() {
    console.log("==================================================");
    console.log("🚀 ROBOT: PROCESAMIENTO MASIVO DE FACTURAS (PRUEBA 3)");
    console.log("==================================================");

    const browser = await puppeteer.launch({
        headless: false,
        executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        defaultViewport: null
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);

    try {
        // 1. LOGIN
        console.log("🔑 [1/4] Iniciando sesión...");
        await page.goto('https://misiir.sii.cl/cgi_misii/siihome.cgi');

        const rutLimpio = `${process.env.DTE_RUT}${process.env.DTE_DV}`.replace(/[^0-9kK]/gi, '');
        const rutElement = await page.waitForSelector('#rut, #rutcntr');
        const idRealRut = await page.evaluate(el => el.id, rutElement);

        await page.type(`#${idRealRut}`, rutLimpio, { delay: 50 });
        await page.type('#clave', process.env.DTE_PASS, { delay: 50 });
        await Promise.all([page.click('#bt_ingresar'), page.waitForNavigation()]);

        // Manejo de cierres de sesión previos
        try {
            const btnSesion = await page.$('input[value*="Cerrar sesión"]');
            if (btnSesion) await Promise.all([btnSesion.click(), page.waitForNavigation()]);
        } catch (e) {}

        // 2. SELECCIÓN DE EMPRESA
        console.log("📂 [2/4] Accediendo al portal de selección...");
        await page.goto('https://www1.sii.cl/cgi-bin/Portal001/mipeSelEmpresa.cgi?DESDE_DONDE_URL=OPCION%3D2%26TIPO%3D4');

        await page.evaluate(() => {
            const select = document.querySelector('select');
            if (select) {
                const opt = Array.from(select.options).find(o => o.text.includes('78306207'));
                if (opt) {
                    select.value = opt.value;
                    const btn = document.querySelector('input[type="submit"], button[type="submit"], input[name="btnContinuar"]');
                    if (btn) btn.click();
                }
            }
        });
        await page.waitForNavigation();

        // 3. EXTRAER LISTA DE DOCUMENTOS (LIMITADO A 3)
        console.log("⏳ [3/4] Extrayendo lista de documentos a procesar...");
        await page.waitForSelector('table tbody tr');

        const listaDocumentos = await page.evaluate(() => {
            // Seleccionamos todas las filas, pero con .slice(0, 3) limitamos a solo 3 para la prueba
            const filas = Array.from(document.querySelectorAll('table tbody tr')).slice(0, 3);
            
            return filas.map(fila => {
                const celdas = fila.querySelectorAll('td');
                const hrefOriginal = celdas?.[0]?.querySelector('a')?.href;
                const razonSocial = celdas?.[2]?.innerText.trim();
                const folio = celdas?.[4]?.innerText.trim();

                let codigo = null;
                if (hrefOriginal) {
                    const urlParams = new URLSearchParams(hrefOriginal.split('?')[1]);
                    codigo = urlParams.get('CODIGO');
                }
                return { codigo, folio, razonSocial };
            }).filter(doc => doc.codigo !== null); // Filtramos por si alguna fila no tiene código
        });

        console.log(`📌 Se encontraron ${listaDocumentos.length} documentos para procesar.\n`);

        // 4. CICLO DE PROCESAMIENTO MASIVO
        for (let i = 0; i < listaDocumentos.length; i++) {
            const docInfo = listaDocumentos[i];
            console.log(`\n⚙️  PROCESANDO [${i + 1}/${listaDocumentos.length}] - Folio: ${docInfo.folio}`);

            const urlDescargaDirecta = `https://www1.sii.cl/cgi-bin/Portal001/mipeDisplayPDF.cgi?DHDR_CODIGO=${docInfo.codigo}`;

            const cookies = await page.cookies();
            const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

            const response = await fetch(urlDescargaDirecta, { headers: { 'Cookie': cookieString } });
            const buffer = Buffer.from(await response.arrayBuffer());

            const rutaGuardado = path.join(carpetaDescargas, `${docInfo.folio}.pdf`);
            fs.writeFileSync(rutaGuardado, buffer);
            console.log(`   ✅ Archivo guardado correctamente.`);

            const datosExtraidos = await extraerDatosDelPDF(rutaGuardado);
            previsualizarCorreo(docInfo, datosExtraidos, rutaGuardado);

            // Pequeña pausa de 2 segundos entre descargas para no saturar al SII
            if (i < listaDocumentos.length - 1) {
                console.log("   ⏱️ Pausa de seguridad antes del siguiente documento...");
                await new Promise(r => setTimeout(r, 2000));
            }
        }

    } catch (error) {
        console.error("❌ Error durante la ejecución:", error.message);
    } finally {
        console.log("\n🚪 Cerrando sesión...");
        try {
            await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('a, button')).find(el => el.innerText?.toLowerCase().includes('cerrar sesi'));
                if (btn) btn.click(); else window.location.href = 'https://misiir.sii.cl/cgi_misii/siihome.cgi?fin';
            });
            await new Promise(r => setTimeout(r, 2000));
        } catch (e) {}
        await browser.close();
        console.log("🛑 Robot apagado.");
    }
}

descargarYPrevisualizarMasivo();