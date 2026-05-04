import puppeteer from 'puppeteer';
import dotenv from 'dotenv';
import pkg from 'pg'; 
import crypto from 'crypto'; 
import { encrypt } from '../../../utils/crypto.js'; 

const { Client } = pkg;
dotenv.config();

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const limpiarYTipar = async (page, selector, texto) => {
    if (!texto) return; 
    try {
        const element = await page.$(selector);
        if (element) {
            await page.click(selector, { clickCount: 3 }); 
            await page.keyboard.press('Backspace');        
            await page.type(selector, texto, { delay: 50 }); 
        }
    } catch (e) {
        console.log(`⚠️ No se pudo escribir en: ${selector}`);
    }
};

// =========================================================================
// 🚀 ROBOT EMISOR DE NOTAS DE CRÉDITO Y DÉBITO
// =========================================================================
export async function emitirNotaCDPuppeteer(datos) {
    let browser, page, client;

    client = new Client({
        user: process.env.DBS_USER,
        host: process.env.DBS_HOST,
        database: process.env.DBS_DATABASE,
        password: process.env.DBS_PASSWORD,
        port: process.env.DBS_PORT,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log("🔌 Búnker PostgreSQL conectado para Notas de C/D.");

        browser = await puppeteer.launch({ 
            headless: true, // 👁️ Ponlo en false si quieres ver el navegador actuar
            defaultViewport: null, 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized', '--disable-blink-features=AutomationControlled'] 
        });

        page = await browser.newPage();
        page.setDefaultNavigationTimeout(60000);
        console.log(`>>> Iniciando Robot para DTE ${datos.tipo_documento}...`);

        // =======================================================================
        // 1. LOGIN Y SELECCIÓN DE EMPRESA
        // =======================================================================
        console.log("🔑 [1/6] Iniciando sesión...");
        await page.goto('https://misiir.sii.cl/cgi_misii/siihome.cgi', { waitUntil: 'networkidle2' });

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

        console.log("📂 [2/6] Accediendo al Historial...");
        await page.goto('https://www1.sii.cl/cgi-bin/Portal001/mipeSelEmpresa.cgi?DESDE_DONDE_URL=OPCION%3D2%26TIPO%3D4');

        await page.evaluate(() => {
            const select = document.querySelector('select');
            if (select) {
                if (select.options.length > 1) select.selectedIndex = 1;
                const btn = document.querySelector('input[type="submit"], button[type="submit"]');
                if (btn) btn.click();
            }
        });
        await page.waitForNavigation();

        // =======================================================================
        // 2. BUSCAR EL FOLIO REFERENCIADO EN EL HISTORIAL
        // =======================================================================
        console.log(`🔍 [3/6] Filtrando por el Folio Original: ${datos.referencia.folio}...`);
        await page.waitForSelector('table tbody tr');

        await page.evaluate((folioBuscar) => {
            const inputFolio = document.querySelector('input[name="FOLIO"], input[name="folio"]');
            if (inputFolio) {
                inputFolio.value = folioBuscar;
                const botones = Array.from(document.querySelectorAll('input[type="button"], button'));
                const btnConsultar = botones.find(b => b.value?.toLowerCase().includes('consultar') || b.innerText?.toLowerCase().includes('consultar'));
                if (btnConsultar) btnConsultar.click();
            }
        }, datos.referencia.folio);

        await delay(3000); 

        // =======================================================================
        // 3. ENTRAR AL DETALLE DE LA FACTURA
        // =======================================================================
        console.log("🖱️ [4/6] Abriendo el detalle de la factura...");
        const abrioDetalle = await page.evaluate((folioBuscar) => {
            const filas = Array.from(document.querySelectorAll('table tbody tr'));
            for (let fila of filas) {
                const celdas = fila.querySelectorAll('td');
                if (celdas.length >= 5) {
                    if (celdas[4].innerText.trim() === String(folioBuscar)) {
                        const link = celdas[0].querySelector('a');
                        if (link) { link.click(); return true; }
                    }
                }
            }
            return false;
        }, datos.referencia.folio);

        if (!abrioDetalle) throw new Error("No se pudo encontrar la factura referenciada en el portal del SII.");
        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        // =======================================================================
        // 4. SELECCIONAR LA ACCIÓN (El Enlace Azul)
        // =======================================================================
        console.log(`⚡ [5/6] Ejecutando acción: Código ${datos.referencia.codigo}...`);
        
        const accionExitosa = await page.evaluate((tipoDte, codRef) => {
            const enlaces = Array.from(document.querySelectorAll('a'));
            let textoBuscado = "";

            if (tipoDte === 61) { 
                if (codRef === "1") textoBuscado = "Nota de Crédito de Anulación";
                else if (codRef === "2") textoBuscado = "Nota de Crédito para Corregir Texto";
                else if (codRef === "3") textoBuscado = "Nota de Crédito para Corregir Montos";
            } else if (tipoDte === 56) { 
                if (codRef === "3") textoBuscado = "Nota de Débito para Corregir Montos";
                else textoBuscado = "Nota de Débito"; 
            }

            const target = enlaces.find(l => l.innerText && l.innerText.includes(textoBuscado));
            if (target) { target.click(); return true; }
            return false;
        }, parseInt(datos.tipo_documento), String(datos.referencia.codigo));

        if (!accionExitosa) throw new Error("El SII no habilitó la opción solicitada para esta factura.");
        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        // =======================================================================
        // 5. LLENAR FORMULARIO, VALIDAR Y FIRMAR
        // =======================================================================
        console.log("✍️ [6/6] Llenando glosas, validando y firmando...");
        await delay(2000);

        // Llenar Glosa de referencia
        await limpiarYTipar(page, 'input[name="EFXP_GLOSA_REF_01"], input[name*="GLOSA"]', datos.referencia.razon);

        // Si la nota corrige monto (código 3), cambiar el valor en la grilla del producto
        if (String(datos.referencia.codigo) === "3") {
            await limpiarYTipar(page, 'input[name="EFXP_PRC_01"]', String(datos.producto.precio));
        }

        // Clic a Botón de Validar/Actualizar
        await page.click('button[name="Button_Update"]');
        await delay(3500);
        
        try { 
            const alertaAceptada = await page.evaluate(() => {
                const botones = Array.from(document.querySelectorAll('input[type="button"], button'));
                const btnAceptar = botones.find(b => b.value.includes('Aceptar') || b.innerText.includes('Aceptar'));
                if (btnAceptar && btnAceptar.offsetParent !== null) { btnAceptar.click(); return true; }
                return false;
            });
            if (alertaAceptada) await delay(2000); 
        } catch (e) {}

        // Abrir Caja de Firma
        let intentosFirma = 0, cajaVisible = false;
        while (intentosFirma < 5 && !cajaVisible) {
            try {
                await page.evaluate(() => {
                    const btn = document.querySelector('input[name="btnSign"]');
                    if (btn && !btn.disabled) btn.click();
                });
                await page.waitForSelector('#myPass', { visible: true, timeout: 3500 });
                cajaVisible = true;
            } catch (e) {
                intentosFirma++;
                await page.click('button[name="Button_Update"]').catch(()=> {}); 
                await delay(2000);
            }
        }
        if (!cajaVisible) throw new Error("El SII no cargó la caja para firmar.");

        // Firmar
        await page.focus('#myPass');
        await page.type('#myPass', process.env.SII_PFX_PASS, { delay: 50 });
        await delay(500); 
        
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
            page.evaluate(() => {
                const btnEnviar = document.querySelector('#btnFirma');
                if (btnEnviar) btnEnviar.click();
            })
        ]);

        // Capturar Folio
        let folio = null;
        for (let j = 0; j < 30; j++) {
            const text = await page.evaluate(() => document.body.innerText).catch(() => "");
            const match = text.match(/N[°º]\s*(\d+)/i) || text.match(/Folio\s*(\d+)/i);
            if (match) { folio = match[1]; break; }
            await delay(1000); 
        }
        if (!folio) throw new Error("No se pudo obtener el folio de la Nota.");
        console.log(`🎉 ¡ÉXITO! Folio generado: ${folio}`);

        // ==============================================================
        // 6. GUARDAR EN BASE DE DATOS
        // ==============================================================
        const rutOriginal = `${datos.rutReceptor}-${datos.dvReceptor}`;
        const montoNeto = parseInt(datos.producto.precio);
        const tipoDteFinal = parseInt(datos.tipo_documento); 
        const fechaEmision = new Date().toISOString(); 

        if (datos.empresa_id && datos.empresa_id !== 'EXTERNO') {
            try {
                const checkQuery = `SELECT id FROM documentos_emitidos WHERE rut_cliente = $1 AND tipo_dte = $2 AND folio = $3`;
                const checkRes = await client.query(checkQuery, [rutOriginal, tipoDteFinal, folio]);

                if (checkRes.rows.length === 0) {
                    const queryInsert = `
                        INSERT INTO documentos_emitidos 
                        (empresa_id, rut_cliente, tipo_dte, folio, monto_neto, fecha_emision)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        RETURNING id;
                    `;
                    await client.query(queryInsert, [datos.empresa_id, rutOriginal, tipoDteFinal, folio, montoNeto, fechaEmision]);
                    console.log(`✅ ¡Nota guardada en la bóveda histórica!`);
                }
            } catch (dbError) {
                console.error('❌ Error guardando en BD:', dbError.message);
            }
        }

        return { ok: true, folio: folio, tipo: tipoDteFinal, fileName: `DTE_${tipoDteFinal}_${folio}.pdf` };

    } catch (error) {
        console.error(`❌ Error durante el proceso: ${error.message}`);
        throw error;
    } finally {
        if (page && !page.isClosed()) {
            console.log('🧹 Cerrando sesión...');
            try { await page.goto('https://misiir.sii.cl/cgi_misii/siu/cgi_misii_logout', { timeout: 3000 }); } catch (e) {}
        }
        if (browser) await browser.close();
        if (client) await client.end();
        console.log('🏁 Proceso finalizado.');
    }
}