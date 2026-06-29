import puppeteer from 'puppeteer';
import nodemailer from 'nodemailer';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { pool } from '../../../../database/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const delay = (ms) => new Promise(res => setTimeout(res, ms));

// =====================================================================
// ⚙️ CONFIGURACIONES PRINCIPALES
// =====================================================================

const FOLIOS_PERMITIDOS = [
    "1115",
    "1113",
    "1112",
    "1111",
    "1110",
    "1109",
    "1108",
    "1106",
    "1105",
    "1104",
    "1102",
    "1101",
    "1100",
    "1098",
    "1097",
    "1096",
    "1095",
    "1093",
    "1092",
    "1091",
    "1090",
    "1089",
    "1088",
    "1087",
    "1086",
    "1085",
    "1084",
    "1083",
    "1082",
    "1081",
    "1080",
    "1078",
    "1076",
    "1075",
    "1073",
    "1072",
    "1071",
    "1070",
    "1069",
    "1068",
    "1066",
    "1064",
    "1063",
    "1061",
    "1060",
    "1059",
    "1057",
    "1056",
    "1054",
    "1053",
    "1052",
    "1051",
    "1050",
    "1049",
    "1048",
    "1047",
    "1046",
    "1044",
    "1042",
    "1041",
    "1040",
    "1038",
    "1037",
    "1035",
    "1033",
    "1032",
    "1030",
    "1029",
    "1028",
    "1027",
    "1026",
    "1025",
    "1024",
    "1023",
    "1022",
    "1020",
    "1019",
    "1018",
    "1017",
    "1016",
    "1015",
    "1014",
    "1013",
    "1012",
    "1011",
    "1010",
    "1009"
];

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
// 📒 REGISTRO DE CORREOS ENVIADOS (para mostrarlo en la página)
// Guarda cada intento de correo en un JSON en la raíz del proyecto.
// =====================================================================
const RUTA_LOG_CORREOS = path.join(process.cwd(), 'correos_facturas_log.json');

export async function registrarCorreoEnLog({ folio, rut, razonSocial, correo, estado, motivo, datos }) {
    const folioStr = folio ? String(folio) : '';

    // 1) GUARDAR EN LA BASE DE DATOS (1 fila por folio: se actualiza en cada envío/reenvío)
    if (folioStr) {
        try {
            await pool.query(
                `INSERT INTO correos_facturas (folio, rut, razon_social, correo, estado, motivo, datos, fecha)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                 ON CONFLICT (folio) DO UPDATE SET
                    rut = EXCLUDED.rut,
                    razon_social = EXCLUDED.razon_social,
                    correo = EXCLUDED.correo,
                    estado = EXCLUDED.estado,
                    motivo = EXCLUDED.motivo,
                    datos = COALESCE(EXCLUDED.datos, correos_facturas.datos),
                    fecha = NOW()`,
                [folioStr, rut || '', razonSocial || '', correo || '', estado || 'desconocido', motivo || '', datos ? JSON.stringify(datos) : null]
            );
        } catch (e) {
            console.log(`⚠️ [LOG CORREOS BD] No se pudo registrar en BD: ${e.message}`);
        }
    }

    // 2) RESPALDO EN ARCHIVO JSON (por si la BD estuviera caída)
    try {
        let registros = [];
        if (fs.existsSync(RUTA_LOG_CORREOS)) {
            try { registros = JSON.parse(fs.readFileSync(RUTA_LOG_CORREOS, 'utf-8')) || []; }
            catch (e) { registros = []; }
        }
        registros.push({
            fecha: new Date().toISOString(),
            folio: folioStr, rut: rut || '', razonSocial: razonSocial || '',
            correo: correo || '', estado: estado || 'desconocido', motivo: motivo || '', datos: datos || null
        });
        if (registros.length > 1000) registros = registros.slice(-1000);
        fs.writeFileSync(RUTA_LOG_CORREOS, JSON.stringify(registros, null, 2));
    } catch (e) { /* el respaldo es opcional */ }
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

        let correo = "No_encontrado@falta_correo.cl";
        const lineaContacto = lineas.find(l => l.toUpperCase().includes('CONTACTO:'));
        if (lineaContacto) {
            const emailMatch = lineaContacto.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
            if (emailMatch) correo = emailMatch[0];
        }

        const netoMatch = textoLimpio.match(/MONTO NETO\s*\$\s*([\d.]+)/i);
        const ivaMatch = textoLimpio.match(/I\.V\.A\.\s*19%\s*\$\s*([\d.]+)/i);
        const totalMatch = textoLimpio.match(/TOTAL\s*\$\s*([\d.]+)/i);

        let descripcionList = [];
        let enTabla = false;
        
        for (let i = 0; i < lineas.length; i++) {
            let L = lineas[i].replace(/[|-]/g, '').trim();
            let upperL = L.toUpperCase();
            
            if (!enTabla && (upperL === 'VALOR' || upperL === 'VALOR $' || upperL.endsWith('VALOR'))) {
                enTabla = true;
                continue;
            }
            
            if (enTabla) {
                if (upperL.includes('FORMA DE PAGO') || upperL.includes('MONTO NETO') || upperL.includes('TIMBRE ELECTR')) {
                    break;
                }
                
                if (L === '' || L === '_') continue;
                if (/^[\$%\d.,\s]+$/.test(L)) continue; 
                
                if (upperL.includes('SERVICIOS CORRESPONDIENTES')) {
                    continue;
                }
                
                descripcionList.push(L);
            }
        }
        
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
        return {
            correo: "Error_al_leer@pdf.cl",
            neto: "0",
            iva: "0",
            total: "0",
            descripcion: "Servicio Contable"
        };
    }
}

// Formatea un monto a pesos chilenos con puntos de mil. "11819816" -> "11.819.816"
function fmtMoneda(valor) {
    const n = parseInt(String(valor ?? "").replace(/[^0-9]/g, ""), 10);
    if (!n || isNaN(n)) return "0";
    return n.toLocaleString("es-CL");
}

// Formatea un RUT a "77.904.639-7"
function fmtRut(rut) {
    const limpio = String(rut ?? "").toUpperCase().replace(/[^0-9K]/g, "");
    if (limpio.length < 2) return String(rut ?? "");
    const cuerpo = limpio.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${cuerpo}-${limpio.slice(-1)}`;
}

// Crea un transporter de Gmail por puerto (465 SSL o 587 STARTTLS) con timeouts.
function crearTransporterGmail(port) {
    return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port,
        secure: port === 465, // 465 = SSL directo; 587 = STARTTLS
        auth: {
            user: process.env.GMAIL_EMAIL_PRINCIPAL,
            pass: process.env.GMAIL_PASSWORD_PRINCIPAL
        },
        connectionTimeout: 30000, // 30s para conectar
        greetingTimeout: 30000,
        socketTimeout: 45000,
        tls: { rejectUnauthorized: false }
    });
}

// Envía con fallback de puerto: prueba 465 y, si falla la conexión, 587. Con reintentos.
async function enviarConReintentos(mailOptions) {
    let ultimoError = null;
    for (const port of [465, 587]) {
        for (let intento = 1; intento <= 2; intento++) {
            try {
                const transporter = crearTransporterGmail(port);
                await transporter.sendMail(mailOptions);
                return true; // ✅ enviado
            } catch (err) {
                ultimoError = err;
                console.log(`   ⚠️ Envío falló (puerto ${port}, intento ${intento}): ${err.message}`);
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    }
    throw ultimoError || new Error('No se pudo enviar el correo.');
}

async function enviarCorreo(datosFactura, datosExtraidos, rutaPDF) {
    try {

        // ==========================================================
        // Datos del correo: priorizamos lo que mandó el facturador
        // (datosFactura.*) y, si falta, usamos lo leído del PDF.
        // ==========================================================
        const razonSocial = datosFactura.razonSocial || "Estimado cliente";
        const rutEmpresa = datosFactura.rut ? fmtRut(datosFactura.rut) : "";
        const plan = datosFactura.planContable || datosExtraidos.descripcion || "Servicio Contable";

        const netoNum = parseInt(String(datosFactura.neto ?? "").replace(/[^0-9]/g, ""), 10)
            || parseInt(String(datosExtraidos.neto ?? "").replace(/[^0-9]/g, ""), 10) || 0;
        const brutoNum = parseInt(String(datosFactura.bruto ?? "").replace(/[^0-9]/g, ""), 10)
            || parseInt(String(datosExtraidos.total ?? "").replace(/[^0-9]/g, ""), 10)
            || Math.round(netoNum * 1.19);

        const compras = fmtMoneda(datosFactura.compras);
        const ventas = fmtMoneda(datosFactura.ventas);
        const totalFact = datosFactura.totalFacturacion
            ? fmtMoneda(datosFactura.totalFacturacion)
            : fmtMoneda((parseInt(String(datosFactura.compras ?? "").replace(/[^0-9]/g, ""), 10) || 0) +
                        (parseInt(String(datosFactura.ventas ?? "").replace(/[^0-9]/g, ""), 10) || 0));
        const tramo = datosFactura.tramo || "—";
        const trabajadores = datosFactura.trabajadores || "0";

        const asunto = `Envío de factura servicio contable`;

        const textoCorreo = `Estimados ${razonSocial}${rutEmpresa ? `, RUT ${rutEmpresa}` : ""}:

Junto con saludar, adjunto factura correspondiente al servicio de contabilidad mensual contratado por la empresa.

El plan contable vigente corresponde a ${plan}, cuyo valor es de $${fmtMoneda(netoNum)} + IVA, dando un total bruto a pagar de $${fmtMoneda(brutoNum)}.

Este valor se encuentra calculado de acuerdo con el nivel de facturación mensual de la empresa, considerando la siguiente información:

Compras del período: $${compras}
Ventas del período: $${ventas}
Facturación total del período, correspondiente a compras + ventas: $${totalFact}
Tramo de facturación aplicable: ${tramo}
Cantidad de trabajadores informados: ${trabajadores}
El pago debe realizarse a más tardar el 5 de Julio

Medios de pago:

TRANSFERENCIA BANCARIA
VOLLAIRE & OLIVOS SIMPLE PYME LTDA
Banco BCI
Cuenta corriente
Rut 78.306.207-0
Numero de cuenta: 70809538
MATIAS.OLIVOS@VSVCONSULTORES.COM

LINK DE PAGO DEBITO O CREDITO

https://www.flow.cl/btn.php?token=xe78c9acb73c3eff5e917d5c932a4a2f7f971abe

Solicito enviar el comprobante de pago por este medio.

Saludos cordiales,`;

        const mailOptions = {
            from: `"Simple Pyme" <matias.olivos@vsvconsultores.com>`,
            to: datosExtraidos.correo,
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
        
        await enviarConReintentos(mailOptions);

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
// 📧 ENVÍO DE UN CORREO REUSANDO UNA SESIÓN YA ABIERTA
// Recibe la 'page' de Puppeteer que YA está logueada en el SII (la del
// facturador). Va al portal de documentos emitidos, busca el folio, descarga
// su PDF con las mismas cookies, y envía el correo. NO abre otro navegador
// ni vuelve a iniciar sesión (así no choca con la sesión de emisión).
// =====================================================================
export async function enviarCorreoFacturaEnSesion(page, folio, datos = {}) {
    const folioStr = String(folio).trim();
    try {
        console.log(`   📧 [CORREO EN SESIÓN] Buscando folio ${folioStr} en el portal de emitidos...`);

        // 1. Ir al portal de selección/documentos emitidos
        await page.goto(
            'https://www1.sii.cl/cgi-bin/Portal001/mipeSelEmpresa.cgi?DESDE_DONDE_URL=OPCION%3D2%26TIPO%3D4',
            { waitUntil: 'domcontentloaded', timeout: 30000 }
        );

        // 2. Si pide elegir empresa emisora, elegimos la nuestra (78306207)
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
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});

        // 3. Esperar la tabla y ubicar la fila del folio
        await page.waitForSelector('table tbody tr', { timeout: 20000 });
        const docInfo = await page.evaluate((folioBuscado) => {
            const filas = Array.from(document.querySelectorAll('table tbody tr'));
            for (const fila of filas) {
                const celdas = fila.querySelectorAll('td');
                const folioCelda = celdas?.[4]?.innerText.trim();
                if (folioCelda === folioBuscado) {
                    const hrefOriginal = celdas?.[0]?.querySelector('a')?.href;
                    const razonSocial = celdas?.[2]?.innerText.trim();
                    let codigo = null;
                    if (hrefOriginal) {
                        const urlParams = new URLSearchParams(hrefOriginal.split('?')[1]);
                        codigo = urlParams.get('CODIGO');
                    }
                    return { codigo, folio: folioCelda, razonSocial };
                }
            }
            return null;
        }, folioStr);

        if (!docInfo || !docInfo.codigo) {
            console.log(`   ⚠️ [CORREO EN SESIÓN] No encontré el folio ${folioStr} en la tabla (puede que aún no aparezca). Correo omitido.`);
            await registrarCorreoEnLog({
                folio: folioStr, rut: datos.rut || '', razonSocial: datos.razonSocial || '',
                correo: datos.correo || '', estado: 'omitido',
                motivo: 'El folio no apareció en el portal de emitidos al momento de enviar.',
                datos
            });
            return false;
        }

        // 4. Descargar el PDF con las cookies de la sesión actual
        const urlDescarga = `https://www1.sii.cl/cgi-bin/Portal001/mipeDisplayPDF.cgi?DHDR_CODIGO=${docInfo.codigo}`;
        const cookies = await page.cookies();
        const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        const response = await fetch(urlDescarga, { headers: { 'Cookie': cookieString } });
        const buffer = Buffer.from(await response.arrayBuffer());

        const rutaTemporal = path.join(carpetaDescargasTemporal, `${folioStr}.pdf`);
        fs.writeFileSync(rutaTemporal, buffer);

        // Copia de respaldo en la carpeta del PC
        const rutaPC = path.join(carpetaDescargasPC, `Factura_${folioStr}.pdf`);
        fs.copyFileSync(rutaTemporal, rutaPC);

        // 5. Extraer datos del PDF + datos que mandó el facturador
        const datosExtraidos = await extraerDatosDelPDF(rutaTemporal);

        if (datos.razonSocial) docInfo.razonSocial = datos.razonSocial;
        docInfo.rut = datos.rut || docInfo.rut || '';
        docInfo.planContable = datos.planContable || '';
        docInfo.neto = datos.neto || '';
        docInfo.bruto = datos.bruto || '';
        docInfo.compras = datos.compras || '';
        docInfo.ventas = datos.ventas || '';
        docInfo.totalFacturacion = datos.totalFacturacion || '';
        docInfo.tramo = datos.tramo || '';
        docInfo.trabajadores = datos.trabajadores || '';

        const correoPDFInvalido =
            !datosExtraidos.correo ||
            !datosExtraidos.correo.includes('@') ||
            datosExtraidos.correo.includes('No_encontrado') ||
            datosExtraidos.correo.includes('Error_al_leer');
        if (datos.correo && datos.correo.includes('@') && correoPDFInvalido) {
            console.log(`   📨 Usando correo del facturador: ${datos.correo}`);
            datosExtraidos.correo = datos.correo;
        }

        // 6. Enviar el correo
        const enviado = await enviarCorreo(docInfo, datosExtraidos, rutaTemporal);

        // 📒 Registrar el resultado para mostrarlo en la página.
        await registrarCorreoEnLog({
            folio: folioStr,
            rut: docInfo.rut || datos.rut || '',
            razonSocial: docInfo.razonSocial || datos.razonSocial || '',
            correo: datosExtraidos.correo || datos.correo || '',
            estado: enviado ? 'enviado' : 'fallido',
            motivo: enviado ? '' : 'Falló el envío del correo (revisa el correo destino o las credenciales de Gmail).',
            datos
        });

        if (enviado && fs.existsSync(rutaTemporal)) {
            fs.unlinkSync(rutaTemporal);
        }
        return enviado;

    } catch (error) {
        console.log(`   ❌ [CORREO EN SESIÓN] Error con el folio ${folioStr}: ${error.message}`);
        await registrarCorreoEnLog({
            folio: folioStr, rut: datos.rut || '', razonSocial: datos.razonSocial || '',
            correo: datos.correo || '', estado: 'fallido',
            motivo: `Error: ${error.message}`,
            datos
        });
        return false;
    }
}

// =====================================================================
// 📧 REENVÍO MANUAL DE UN SOLO CORREO (desde la página)
// Abre su propio navegador, inicia sesión en el SII, y reusa
// enviarCorreoFacturaEnSesion (que descarga el PDF, envía y registra en el log).
// =====================================================================
export async function reenviarCorreoIndividual(folio, datos = {}, headless = true) {
    const folioStr = String(folio).trim();
    console.log(`\n🔁 [REENVÍO] Iniciando reenvío del correo del Folio ${folioStr}...`);

    const browser = await puppeteer.launch({
        headless,
        defaultViewport: null,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized', '--disable-blink-features=AutomationControlled']
    });

    try {
        const page = (await browser.pages())[0];
        page.setDefaultNavigationTimeout(60000);
        page.on('dialog', async d => await d.accept());

        // 1) Iniciar sesión en el SII
        console.log("🔑 [REENVÍO] Iniciando sesión en el SII...");
        await page.goto('https://misiir.sii.cl/cgi_misii/siihome.cgi', { waitUntil: 'domcontentloaded' });

        const rutLimpio = `${process.env.DTE_RUT}${process.env.DTE_DV}`.replace(/[^0-9kK]/gi, '');
        const rutElement = await page.waitForSelector('#rut, #rutcntr', { timeout: 20000 });
        const idRealRut = await page.evaluate(el => el.id, rutElement);

        await page.type(`#${idRealRut}`, rutLimpio, { delay: 50 });
        await page.type('#clave', process.env.DTE_PASS, { delay: 50 });
        await Promise.all([
            page.click('#bt_ingresar'),
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
        ]);
        await delay(2000);

        // 2) Enviar el correo reutilizando la lógica que ya descarga PDF + envía + registra
        const enviado = await enviarCorreoFacturaEnSesion(page, folioStr, datos);

        console.log(`🔁 [REENVÍO] Resultado del Folio ${folioStr}: ${enviado ? 'ENVIADO ✅' : 'NO ENVIADO ❌'}`);
        return enviado;

    } catch (error) {
        console.log(`❌ [REENVÍO] Error con el Folio ${folioStr}: ${error.message}`);
        await registrarCorreoEnLog({
            folio: folioStr, rut: datos.rut || '', razonSocial: datos.razonSocial || '',
            correo: datos.correo || '', estado: 'fallido',
            motivo: `Error en reenvío: ${error.message}`
        });
        return false;
    } finally {
        try { await browser.close(); } catch (e) {}
    }
}

// =====================================================================
// 📧 REENVÍO MASIVO DE CORREOS (lista de folios seleccionados)
// Abre UN navegador, inicia sesión UNA vez, y envía todos los correos en fila.
// Cada uno queda registrado en la BD por enviarCorreoFacturaEnSesion.
// =====================================================================
export async function reenviarCorreosMasivo(items, headless = true) {
    if (!Array.isArray(items) || items.length === 0) return { ok: false, enviados: 0, fallidos: 0 };
    console.log(`\n🔁 [REENVÍO MASIVO] Procesando ${items.length} correo(s)...`);

    const browser = await puppeteer.launch({
        headless,
        defaultViewport: null,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized', '--disable-blink-features=AutomationControlled']
    });

    let enviados = 0, fallidos = 0;
    try {
        const page = (await browser.pages())[0];
        page.setDefaultNavigationTimeout(60000);
        page.on('dialog', async d => await d.accept());

        // Login UNA sola vez
        console.log("🔑 [REENVÍO MASIVO] Iniciando sesión en el SII...");
        await page.goto('https://misiir.sii.cl/cgi_misii/siihome.cgi', { waitUntil: 'domcontentloaded' });
        const rutLimpio = `${process.env.DTE_RUT}${process.env.DTE_DV}`.replace(/[^0-9kK]/gi, '');
        const rutElement = await page.waitForSelector('#rut, #rutcntr', { timeout: 20000 });
        const idRealRut = await page.evaluate(el => el.id, rutElement);
        await page.type(`#${idRealRut}`, rutLimpio, { delay: 50 });
        await page.type('#clave', process.env.DTE_PASS, { delay: 50 });
        await Promise.all([
            page.click('#bt_ingresar'),
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
        ]);
        await delay(2000);

        // Enviar cada folio en fila
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            console.log(`📧 [REENVÍO MASIVO ${i + 1}/${items.length}] Folio ${item.folio}...`);
            try {
                const ok = await enviarCorreoFacturaEnSesion(page, item.folio, item.datos || {});
                ok ? enviados++ : fallidos++;
            } catch (e) {
                fallidos++;
                console.log(`⚠️ [REENVÍO MASIVO] Folio ${item.folio} falló: ${e.message}`);
            }
            await delay(1500);
        }
    } catch (error) {
        console.log(`❌ [REENVÍO MASIVO] Error general: ${error.message}`);
    } finally {
        try { await browser.close(); } catch (e) {}
    }

    console.log(`✅ [REENVÍO MASIVO] Terminado. Enviados: ${enviados} | Fallidos: ${fallidos}`);
    return { ok: true, enviados, fallidos };
}

// =====================================================================
// 🤖 ROBOT PRINCIPAL MASIVO
// =====================================================================

export async function ejecutarProcesoMasivo(opciones = {}) {
    // 🔥 Folios a buscar: los que nos pasen dinámicamente (ej: desde el Facturador
    // Masivo apenas emite) o, si se ejecuta este script solo, la lista fija FOLIOS_PERMITIDOS.
    const foliosABuscar = (Array.isArray(opciones.folios) && opciones.folios.length > 0)
        ? opciones.folios.map(f => String(f).trim())
        : FOLIOS_PERMITIDOS;

    // Datos opcionales por folio (correo / razón social) para preferirlos si el PDF no los trae.
    const datosPorFolio = opciones.datosPorFolio || {};

    console.log("==================================================");
    console.log("🚀 ROBOT MASIVO: MODO PRODUCCIÓN REAL");
    console.log(`📋 Folios a procesar para envío de correo: ${foliosABuscar.length}`);
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

        await Promise.all([
            page.click('#bt_ingresar'),
            page.waitForNavigation()
        ]);

        try {
            const btnSesion = await page.$('input[value*="Cerrar sesión"]');
            if (btnSesion) {
                await Promise.all([
                    btnSesion.click(),
                    page.waitForNavigation()
                ]);
            }
        } catch (e) {}

        console.log("📂 [2/4] Accediendo al portal de selección...");
        await page.goto('https://www1.sii.cl/cgi-bin/Portal001/mipeSelEmpresa.cgi?DESDE_DONDE_URL=OPCION%3D2%26TIPO%3D4');

        await page.evaluate(() => {
            const select = document.querySelector('select');

            if (select) {
                const opt = Array.from(select.options).find(o => o.text.includes('78306207'));

                if (opt) {
                    select.value = opt.value;

                    const btn = document.querySelector(
                        'input[type="submit"], button[type="submit"], input[name="btnContinuar"]'
                    );

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

        // 🔥 FILTRAR SOLO LOS FOLIOS QUE NOS PIDIERON
        const documentosFiltrados = listaDocumentos.filter(doc =>
            foliosABuscar.includes(doc.folio)
        );

        console.log(`📌 Se encontraron ${documentosFiltrados.length} documentos permitidos.\n`);

        for (let i = 0; i < documentosFiltrados.length; i++) {

            const docInfo = documentosFiltrados[i];

            console.log(`\n⚙️ PROCESANDO [${i + 1}/${documentosFiltrados.length}] - Folio: ${docInfo.folio} - ${docInfo.razonSocial}`);

            const urlDescargaDirecta =
                `https://www1.sii.cl/cgi-bin/Portal001/mipeDisplayPDF.cgi?DHDR_CODIGO=${docInfo.codigo}`;

            const cookies = await page.cookies();
            const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

            const response = await fetch(urlDescargaDirecta, {
                headers: {
                    'Cookie': cookieString
                }
            });

            const buffer = Buffer.from(await response.arrayBuffer());

            const rutaTemporal = path.join(
                carpetaDescargasTemporal,
                `${docInfo.folio}.pdf`
            );

            fs.writeFileSync(rutaTemporal, buffer);

            const rutaPC = path.join(
                carpetaDescargasPC,
                `Factura_${docInfo.folio}.pdf`
            );

            fs.copyFileSync(rutaTemporal, rutaPC);

            console.log(`   💾 Copia guardada en PC: ${rutaPC}`);

            const datosExtraidos = await extraerDatosDelPDF(rutaTemporal);

            // 🔁 Si el facturador nos pasó datos para este folio, los usamos para armar
            // el correo (razón social, rut, plan, montos, tramo, trabajadores) y como
            // respaldo del correo cuando el PDF no trae uno válido.
            const override = datosPorFolio[docInfo.folio] || {};
            if (override.razonSocial) docInfo.razonSocial = override.razonSocial;
            docInfo.rut = override.rut || docInfo.rut || "";
            docInfo.planContable = override.planContable || "";
            docInfo.neto = override.neto || "";
            docInfo.bruto = override.bruto || "";
            docInfo.compras = override.compras || "";
            docInfo.ventas = override.ventas || "";
            docInfo.totalFacturacion = override.totalFacturacion || "";
            docInfo.tramo = override.tramo || "";
            docInfo.trabajadores = override.trabajadores || "";

            const correoPDFInvalido =
                !datosExtraidos.correo ||
                !datosExtraidos.correo.includes('@') ||
                datosExtraidos.correo.includes('No_encontrado') ||
                datosExtraidos.correo.includes('Error_al_leer');

            if (override.correo && override.correo.includes('@') && correoPDFInvalido) {
                console.log(`   📨 Usando correo de respaldo del facturador: ${override.correo}`);
                datosExtraidos.correo = override.correo;
            }

            const correoEnviado = await enviarCorreo(
                docInfo,
                datosExtraidos,
                rutaTemporal
            );

            if (correoEnviado && fs.existsSync(rutaTemporal)) {
                fs.unlinkSync(rutaTemporal);
                console.log(`   🗑️ PDF temporal limpiado del código.`);
            }

            if (i < documentosFiltrados.length - 1) {
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
                const btn = Array.from(
                    document.querySelectorAll('a, button')
                ).find(el =>
                    el.innerText?.toLowerCase().includes('cerrar sesi')
                );

                if (btn) {
                    btn.click();
                } else {
                    window.location.href = 'https://misiir.sii.cl/cgi_misii/siihome.cgi?fin';
                }
            });

            await new Promise(r => setTimeout(r, 2000));

        } catch (e) {}

        await browser.close();

        console.log("🛑 Robot apagado.");
    }
}

// ⚠️ Solo se ejecuta automáticamente si corres ESTE archivo directamente con node.
// Si se importa desde el facturador masivo, NO se auto-ejecuta (se llama la función).
const ejecutadoDirectamente = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (ejecutadoDirectamente) {
    ejecutarProcesoMasivo();
}