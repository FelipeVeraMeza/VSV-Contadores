import puppeteer from 'puppeteer';
import dotenv from 'dotenv';
import pkg from 'pg'; 
import crypto from 'crypto'; 
import { encrypt } from '../../../utils/crypto.js'; // Ajusta la ruta si es necesario

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
// 🚀 ROBOT EMISOR UNIFICADO (NOTAS DE CRÉDITO Y DÉBITO)
// =========================================================================
export async function emitirNotaCDPuppeteer(datos) {
    let browser, page, client;

    // 1. INICIAMOS LA CONEXIÓN A LA BASE DE DATOS
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
        
        // ==============================================================
        // 📊 PASO 0: VALIDACIÓN Y MUESTRA DE DATOS EN TERMINAL
        // ==============================================================
        let infoEmisor = { razon_social: "EMPRESA EXTERNA / NO SELECCIONADA" };
        
        if (datos.empresa_id && datos.empresa_id !== 'EXTERNO') {
            const res = await client.query("SELECT razon_social FROM empresa WHERE id = $1", [datos.empresa_id]);
            if (res.rows.length > 0) infoEmisor = res.rows[0];
        }

        console.log("\n" + "=" .repeat(60));
        console.log("🚀 INICIANDO EMISIÓN DE NOTA DTE");
        console.log("=" .repeat(60));
        console.log(`🏢 EMISOR (Búnker): ${infoEmisor.razon_social.toUpperCase()}`);
        console.log(`👤 RECEPTOR (Cliente): ${datos.rutReceptor}-${datos.dvReceptor} | ${datos.razonSocial}`);
        console.log(`📄 TIPO DTE: ${datos.tipo_documento === 61 ? 'NOTA DE CRÉDITO (61)' : 'NOTA DE DÉBITO (56)'}`);
        console.log(`🔗 REF FOLIO: ${datos.referencia.folio}`);
        console.log(`💰 MONTO NETO: $${parseInt(datos.producto.precio).toLocaleString('es-CL')}`);
        console.log("=" .repeat(60) + "\n");

        browser = await puppeteer.launch({ 
            headless: false, 
            defaultViewport: null, 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized', '--disable-blink-features=AutomationControlled'] 
        });

        page = await browser.newPage();
        page.setDefaultNavigationTimeout(60000);

        // =======================================================================
        // 1. LOGIN
        // =======================================================================
        console.log("🔑 [1/6] Iniciando sesión en SII...");
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

        // =======================================================================
        // 2. SELECCIÓN DE EMPRESA E HISTORIAL
        // =======================================================================
        console.log("📂 [2/6] Accediendo al Historial...");
        await page.goto('https://www1.sii.cl/cgi-bin/Portal001/mipeSelEmpresa.cgi?DESDE_DONDE_URL=OPCION%3D2%26TIPO%3D4', { waitUntil: 'networkidle2' });

        await page.evaluate((rutEmisorOpcional) => {
            const select = document.querySelector('select');
            if (select) {
                const opt = rutEmisorOpcional ? Array.from(select.options).find(o => o.text.includes(rutEmisorOpcional)) : null;
                if (opt) {
                    select.value = opt.value;
                    document.querySelector('input[name="btnContinuar"]')?.click();
                } else if (select.options.length > 1) {
                    select.selectedIndex = 1; 
                    document.querySelector('input[type="submit"]')?.click();
                }
            }
        }, datos.rutEmisor ? datos.rutEmisor.replace(/[^0-9]/g, '') : null); 
        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        // =======================================================================
        // 3. BUSCAR EL FOLIO REFERENCIADO
        // =======================================================================
        console.log(`🔍 [3/6] Buscando Folio Original: ${datos.referencia.folio}...`);
        await page.waitForSelector('table tbody tr');

        await page.evaluate((folioBuscar) => {
            const inputFolio = document.querySelector('input[name="FOLIO"], input[name="folio"]');
            if (inputFolio) {
                inputFolio.value = folioBuscar;
                const btnConsultar = Array.from(document.querySelectorAll('input, button')).find(b => b.value?.toLowerCase().includes('consultar'));
                if (btnConsultar) btnConsultar.click();
            }
        }, String(datos.referencia.folio));

        await delay(5000); 

        // =======================================================================
        // 4. ENTRAR AL ENLACE DE OPCIONES
        // =======================================================================
        console.log(`🖱️ [4/6] Entrando al generador de Notas del SII...`);
        
        let encontroFolio = await page.evaluate((folioBuscar, tipoDteRequerido) => {
            const filas = Array.from(document.querySelectorAll('table tbody tr'));
            for (let fila of filas) {
                const celdas = fila.querySelectorAll('td');
                let matches = false;
                for (let c of celdas) { if (c.innerText.trim() === String(folioBuscar)) { matches = true; break; } }

                if (matches) {
                    const textoBuscado = (tipoDteRequerido === 61) ? "Generar Nota de Crédito" : "Generar Nota de Débito";
                    const link = Array.from(fila.querySelectorAll('a')).find(a => a.innerText.includes(textoBuscado));
                    if (link) { link.click(); return true; }
                }
            }
            return false;
        }, String(datos.referencia.folio), parseInt(datos.tipo_documento));

        if (!encontroFolio) throw new Error(`No se encontró el Folio ${datos.referencia.folio} en el SII.`);
        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        // =======================================================================
        // 5. SELECCIONAR ACCIÓN
        // =======================================================================
        console.log(`⚡ [5/6] Seleccionando Acción: ${datos.referencia.codigo}...`);
        await page.evaluate((tipoDte, codRef) => {
            const botones = Array.from(document.querySelectorAll('input[type="button"], button, a'));
            let texto = (tipoDte === 61) ? (codRef === "1" ? "Anulación" : codRef === "2" ? "Corregir Texto" : "Corregir Montos") : "Nota de Débito";
            const target = botones.find(b => (b.value || b.innerText || "").includes(texto));
            if (target) target.click();
        }, parseInt(datos.tipo_documento), String(datos.referencia.codigo));

        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        // =======================================================================
        // 6. VALIDAR, FIRMAR Y CAPTURAR FOLIO
        // =======================================================================
        console.log("✍️ [6/6] Validando y firmando...");
        await delay(2000);

        if (String(datos.referencia.codigo) !== "1") {
            await limpiarYTipar(page, 'input[name="EFXP_GLOSA_REF_01"], input[name*="GLOSA"]', datos.referencia.razon);
            if (String(datos.referencia.codigo) === "3") {
                await limpiarYTipar(page, 'input[name="EFXP_PRC_01"]', String(datos.producto?.precio || 0));
            }
            await page.evaluate(() => { document.querySelector('button[name="Button_Update"]')?.click(); });
            await delay(2500); 
            await page.evaluate(() => {
                const btnAceptar = Array.from(document.querySelectorAll('input, button')).find(b => (b.value || b.innerText || "").toLowerCase().includes('aceptar'));
                if (btnAceptar) btnAceptar.click();
            });
            await delay(2000);
        }

        await page.evaluate(() => { document.querySelector('input[name="btnSign"]')?.click(); });
        await page.waitForSelector('#myPass', { visible: true });
        await page.type('#myPass', process.env.SII_PFX_PASS, { delay: 50 }); 
        await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.click('#btnFirma')]);

        let nuevoFolio = null;
        for (let j = 0; j < 30; j++) {
            const text = await page.evaluate(() => document.body.innerText);
            const match = text.match(/N[°º]\s*(\d+)/i) || text.match(/Folio\s*(\d+)/i);
            if (match) { nuevoFolio = match[1]; break; }
            await delay(1000); 
        }

        if (!nuevoFolio) throw new Error("Documento emitido pero el SII no entregó el nuevo folio.");
        console.log(`🎉 ¡ÉXITO! Nuevo Folio generado: ${nuevoFolio}`);

        // ==============================================================
        // 7. 💾 GUARDAR EN BASE DE DATOS (HISTORIAL CRM)
        // ==============================================================
        console.log('💾 Registrando en el historial del Búnker...');
        
        const empresaIdFinal = datos.empresa_id;
        const rutReceptorLimpio = `${datos.rutReceptor}-${datos.dvReceptor}`.toUpperCase();
        const montoNeto = parseInt(datos.producto?.precio) || 0;
        const tipoDteFinal = parseInt(datos.tipo_documento);
        const fechaEmision = new Date().toISOString(); 

        if (empresaIdFinal && empresaIdFinal !== 'EXTERNO') {
            try {
                // Inserción exacta con ON CONFLICT (basado en tu lógica de facturación masiva)
                const queryInsert = `
                    INSERT INTO documentos_emitidos 
                    (empresa_id, rut_cliente, tipo_dte, folio, monto_neto, fecha_emision, url_pdf)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT ON CONSTRAINT unique_empresa_tipo_folio DO NOTHING
                    RETURNING id;
                `;
                
                const valores = [
                    empresaIdFinal, 
                    rutReceptorLimpio, 
                    tipoDteFinal, 
                    parseInt(nuevoFolio), 
                    montoNeto, 
                    fechaEmision, 
                    null
                ];

                const resDB = await client.query(queryInsert, valores);
                
                if (resDB.rowCount > 0) {
                    console.log(`✅ NOTA GUARDADA: Folio ${nuevoFolio} registrado en la empresa ${infoEmisor.razon_social}`);
                } else {
                    console.log(`⚠️ La Nota ${nuevoFolio} ya existía en el historial.`);
                }
            } catch (dbError) {
                console.error('❌ Error fatal guardando en la BD:', dbError.message);
            }
        } else {
            console.log("⚠️ Registro omitido: empresa_id es EXTERNO o nulo.");
        }

        // Enfocar pestaña final
        try {
            const paginasAbiertas = await browser.pages();
            await paginasAbiertas[paginasAbiertas.length - 1].bringToFront();
            await delay(3000); 
        } catch (e) {}

        return { ok: true, folio: nuevoFolio, tipo: tipoDteFinal };

    } catch (error) {
        console.error(`❌ Error durante el proceso: ${error.message}`);
        throw error;
    } finally {
        if (page && !page.isClosed()) {
            console.log('🧹 Cerrando sesión segura en SII...');
            try { await page.goto('https://misiir.sii.cl/cgi_misii/siu/cgi_misii_logout', { timeout: 3000 }); } catch (e) {}
        }
        if (browser) await browser.close();
        if (client) await client.end();
        console.log('🏁 Proceso finalizado.');
    }
}