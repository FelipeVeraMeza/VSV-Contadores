import puppeteer from 'puppeteer';
import nodemailer from 'nodemailer';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import pdf from 'pdf-parse/lib/pdf-parse.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =====================================================================
// ⚙️ CONFIGURACIONES PRINCIPALES
// =====================================================================

// LÍMITE DE PARADA: El robot procesará de arriba hacia abajo y se detendrá
// justo después de procesar y enviar el folio 876.
const FOLIO_LIMITE_PARADA = "876"; 

// =====================================================================
// 📁 CONFIGURACIÓN DE CARPETAS UNIVERSAL
// =====================================================================

const carpetaDescargasTemporal = path.join(__dirname, 'pdf_descargados');
if (!fs.existsSync(carpetaDescargasTemporal)) fs.mkdirSync(carpetaDescargasTemporal);

let rutaBaseDescargas = path.join(os.homedir(), 'Downloads');
if (!fs.existsSync(rutaBaseDescargas)) {
    rutaBaseDescargas = path.join(os.homedir(), 'Descargas'); 
}

const carpetaDescargasPC = path.join(rutaBaseDescargas, 'facturacion masiva');
if (!fs.existsSync(carpetaDescargasPC)) {
    fs.mkdirSync(carpetaDescargasPC, { recursive: true });
}

// =====================================================================
// FUNCIONES AUXILIARES
// =====================================================================

async function extraerDatosDelPDF(rutaPDF) {
    try {
        const dataBuffer = fs.readFileSync(rutaPDF);
        const data = await pdf(dataBuffer);
        
        const lineas = data.text.split('\n').map(l => l.trim()).filter(l => l !== '');
        const textoLimpio = data.text.replace(/\n/g, ' ');

        // 1. EXTRAER CORREO
        let correo = "No_encontrado@falta_correo.cl";
        const lineaContacto = lineas.find(l => l.toUpperCase().includes('CONTACTO:'));
        if (lineaContacto) {
            const emailMatch = lineaContacto.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
            if (emailMatch) correo = emailMatch[0];
        }

        // 2. EXTRAER MONTOS
        const netoMatch = textoLimpio.match(/MONTO NETO\s*\$\s*([\d.]+)/i);
        const ivaMatch = textoLimpio.match(/I\.V\.A\.\s*19%\s*\$\s*([\d.]+)/i);
        const totalMatch = textoLimpio.match(/TOTAL\s*\$\s*([\d.]+)/i);

        // 3. EXTRAER DESCRIPCIÓN (OMITIENDO MESES)
        let descripcionList = [];
        let enTabla = false;
        
        for (let i = 0; i < lineas.length; i++) {
            let L = lineas[i].replace(/[|-]/g, '').trim();
            let upperL = L.toUpperCase();
            
            // Iniciamos la captura justo al encontrar la cabecera de valores de la tabla
            if (!enTabla && (upperL === 'VALOR' || upperL === 'VALOR $' || upperL.endsWith('VALOR'))) {
                enTabla = true;
                continue;
            }
            
            if (enTabla) {
                // Cortamos la captura al llegar a los totales
                if (upperL.includes('FORMA DE PAGO') || upperL.includes('MONTO NETO') || upperL.includes('TIMBRE ELECTR')) {
                    break;
                }
                
                // Ignorar líneas vacías, separadores o líneas de puros números/porcentajes
                if (L === '' || L === '_') continue;
                if (/^[\$%\d.,\s]+$/.test(L)) continue; 
                
                // 🔥 IGNORAR LA LÍNEA DEL MES
                if (upperL.includes('SERVICIOS CORRESPONDIENTES')) {
                    continue;
                }
                
                // Si es texto real, lo guardamos
                descripcionList.push(L);
            }
        }
        
        // Unimos todo el texto encontrado
        let descripcion = descripcionList.join(' ').trim();
        if (!descripcion) descripcion = "Servicio Contable";

        return {
            correo: correo,
            neto: netoMatch ? netoMatch[1] : "0",
            iva: ivaMatch ? ivaMatch[1] : "0",
            total: totalMatch ? totalMatch[1] : "0",
            descripcion: descripcion
        };
    } catch (e) {
        return { correo: "Error_al_leer@pdf.cl", neto: "0", iva: "0", total: "0", descripcion: "Servicio Contable" };
    }
}

async function enviarCorreo(datosFactura, datosExtraidos, rutaPDF) {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.GMAIL_EMAIL_PRINCIPAL,
                pass: process.env.GMAIL_PASSWORD_PRINCIPAL
            }
        });

        const asunto = `Factura N°${datosFactura.folio} - Servicio Contable - Simple Pyme`;
        
        const textoCorreo = `Estimados ${datosFactura.razonSocial}

Junto con saludar, informamos que ya hemos emitido la factura N°${datosFactura.folio} correspondiente a: Servicios de Contabilidad (${datosExtraidos.descripcion}), la cual se encuentra disponible para pago.

📅 Fecha de vencimiento: 5 de mayo

VALOR: $${datosExtraidos.neto} + IVA ($${datosExtraidos.iva}) = $${datosExtraidos.total}

🔄 Mecanismos de pago:

Transferencia bancaria:
VOLLAIRE & OLIVOS SIMPLE PYME LTDA
RUT: 78.306.207-0
Banco BCI
Tipo de cuenta: Cuenta Corriente
N° Cuenta: 70809538
Correo: MATIAS.OLIVOS@VSVCONSULTORES.COM

🌐 Pago en línea: https://www.flow.cl/btn.php?token=xe78c9acb73c3eff5e917d5c932a4a2f7f971abe

Favor enviar comprobante de pago por este mismo medio.

Saludos cordiales,
Simple Pyme`;

        const mailOptions = {
            from: `"Simple Pyme" <matias.olivos@vsvconsultores.com>`,
            to: datosExtraidos.correo, // 🔥 ENVÍO REAL AL CORREO DEL CLIENTE 🔥
            subject: asunto,
            html: `<div style="font-family: Arial, sans-serif; color: #333; line-height: 1.5;">
                    ${textoCorreo.replace(/\n/g, '<br>')}
                    <br><br>
                    <img src="cid:firma_mati" style="width: 200px; height: auto;">
                   </div>`,
            attachments: [
                { filename: `Factura_${datosFactura.folio}.pdf`, path: rutaPDF },
                { filename: 'firma mati.jpeg', path: './src/components/facturacion/data/firma mati.jpeg', cid: 'firma_mati' }
            ]
        };
        
        await transporter.sendMail(mailOptions);
        
        console.log(`   🔍 DATOS LEÍDOS DEL PDF:`);
        console.log(`      - Descripción : ${datosExtraidos.descripcion}`);
        console.log(`   ✅ ¡ENVÍO EXITOSO! Correo entregado al cliente: ${datosExtraidos.correo}`);

        return true;

    } catch (error) {
        console.error('   ❌ ERROR EN LA PREPARACIÓN/ENVÍO DEL CORREO:', error.message);
        return false;
    }
}

// =====================================================================
// 🤖 ROBOT PRINCIPAL MASIVO
// =====================================================================

async function ejecutarProcesoMasivo() {
    console.log("==================================================");
    console.log("🚀 ROBOT MASIVO: MODO PRODUCCIÓN REAL");
    console.log(`🎯 Límite configurado para detenerse en el Folio: ${FOLIO_LIMITE_PARADA}`);
    console.log("==================================================");

    const browser = await puppeteer.launch({
        headless: false,
        executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        defaultViewport: null
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);

    try {
        console.log("🔑 [1/4] Iniciando sesión...");
        await page.goto('https://misiir.sii.cl/cgi_misii/siihome.cgi');

        const rutLimpio = `${process.env.DTE_RUT}${process.env.DTE_DV}`.replace(/[^0-9kK]/gi, '');
        const rutElement = await page.waitForSelector('#rut, #rutcntr');
        const idRealRut = await page.evaluate(el => el.id, rutElement);

        await page.type(`#${idRealRut}`, rutLimpio, { delay: 50 });
        await page.type('#clave', process.env.DTE_PASS, { delay: 50 });
        await Promise.all([page.click('#bt_ingresar'), page.waitForNavigation()]);

        try {
            const btnSesion = await page.$('input[value*="Cerrar sesión"]');
            if (btnSesion) await Promise.all([btnSesion.click(), page.waitForNavigation()]);
        } catch (e) {}

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

        console.log("⏳ [3/4] Extrayendo TODOS los documentos de la tabla...");
        await page.waitForSelector('table tbody tr');

        const listaDocumentos = await page.evaluate(() => {
            const filas = Array.from(document.querySelectorAll('table tbody tr'));
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
            }).filter(doc => doc.codigo !== null);
        });

        console.log(`📌 Se encontraron ${listaDocumentos.length} documentos listos para iterar.\n`);

        for (let i = 0; i < listaDocumentos.length; i++) {
            const docInfo = listaDocumentos[i];
            console.log(`\n⚙️ PROCESANDO [${i + 1}/${listaDocumentos.length}] - Folio: ${docInfo.folio} - ${docInfo.razonSocial}`);

            const urlDescargaDirecta = `https://www1.sii.cl/cgi-bin/Portal001/mipeDisplayPDF.cgi?DHDR_CODIGO=${docInfo.codigo}`;
            const cookies = await page.cookies();
            const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

            const response = await fetch(urlDescargaDirecta, { headers: { 'Cookie': cookieString } });
            const buffer = Buffer.from(await response.arrayBuffer());

            const rutaTemporal = path.join(carpetaDescargasTemporal, `${docInfo.folio}.pdf`);
            fs.writeFileSync(rutaTemporal, buffer);

            const rutaPC = path.join(carpetaDescargasPC, `Factura_${docInfo.folio}.pdf`);
            fs.copyFileSync(rutaTemporal, rutaPC);
            console.log(`   💾 Copia guardada en PC: ${rutaPC}`);

            const datosExtraidos = await extraerDatosDelPDF(rutaTemporal);
            const correoEnviado = await enviarCorreo(docInfo, datosExtraidos, rutaTemporal);

            if (correoEnviado && fs.existsSync(rutaTemporal)) {
                fs.unlinkSync(rutaTemporal);
                console.log(`   🗑️ PDF temporal limpiado del código.`);
            }

            // 🔥 CORTE AL ALCANZAR EL FOLIO DE LÍMITE 🔥
            if (docInfo.folio === FOLIO_LIMITE_PARADA) {
                console.log("\n==================================================");
                console.log(`🛑 ¡ALTO AHÍ! Se procesó la factura de límite (Folio ${FOLIO_LIMITE_PARADA}).`);
                console.log("🛑 El proceso masivo ha finalizado exitosamente.");
                console.log("==================================================");
                break;
            }

            if (i < listaDocumentos.length - 1) {
                console.log("   ⏱️ Esperando 2 segundos antes de la siguiente factura...");
                await new Promise(r => setTimeout(r, 2000));
            }
        }

    } catch (error) {
        console.error("❌ Error crítico:", error.message);
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

ejecutarProcesoMasivo();