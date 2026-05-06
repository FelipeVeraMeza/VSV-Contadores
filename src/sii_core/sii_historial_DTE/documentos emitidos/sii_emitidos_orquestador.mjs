import puppeteer from 'puppeteer';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 1. IMPORTACIONES EXTERNAS (Solo traemos el inicio/cierre de sesión)
import { iniciarSesion, cerrarSesion } from '../documentos recibidos/sii_operaciones.js';

// 2. CONFIGURACIÓN DE RUTAS
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rutaArchivoJSON_Emitidos = path.join(__dirname, 'folios_documentos_emitidos.json');

// ============================================================================
// 3. FUNCIÓN EXTRACTORA (El Motor)
// ============================================================================
async function extraerTablaFoliosEmitidos(page) {
    console.log("📂 [2/2] Yendo a la tabla de documentos EMITIDOS...");
    
    console.log("🏢 Seleccionando la empresa...");
    await page.goto('https://www1.sii.cl/cgi-bin/Portal001/mipeLaunchPage.cgi?OPCION=2&TIPO=4', { waitUntil: 'networkidle2' });
    
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
        page.evaluate(() => {
            const rutBuscado = '78306207'; 
            const selects = document.querySelectorAll('select');
            for (const select of selects) {
                for (let i = 0; i < select.options.length; i++) {
                    if (select.options[i].text.includes(rutBuscado)) {
                        select.selectedIndex = i; 
                        const btn = document.querySelector('input[type="submit"], button[type="submit"]');
                        if (btn) btn.click();
                        return;
                    }
                }
            }
        })
    ]);

    let facturasExtraidas = [];
    let paginaActual = 1;
    let hayMasDatos = true;
    let primerFolioAnterior = null; 

    while (hayMasDatos) {
        console.log(`⏳ Consultando página ${paginaActual}...`);
        const urlPaginada = `https://www1.sii.cl/cgi-bin/Portal001/mipeAdminDocsEmi.cgi?RUT_RECP=&FOLIO=&RZN_SOC=&FEC_DESDE=&FEC_HASTA=&TPO_DOC=&ESTADO=&ORDEN=&NUM_PAG=${paginaActual}`;
        await page.goto(urlPaginada, { waitUntil: 'networkidle2', timeout: 60000 });

        try {
            await page.waitForSelector('table tbody tr', { timeout: 15000 });
        } catch (e) {
            break; 
        }

        const datosPagina = await page.evaluate(() => {
            const lista = [];
            const filas = document.querySelectorAll('table tbody tr'); 
            filas.forEach(fila => {
                const celdas = fila.querySelectorAll('td');
                if (celdas.length >= 8) { 
                    const rutReceptor = celdas[1]?.innerText.trim();
                    const razonSocial = celdas[2]?.innerText.trim();
                    const documento = celdas[3]?.innerText.trim(); 
                    const folio = celdas[4]?.innerText.trim();
                    const fecha = celdas[5]?.innerText.trim();     
                    const montoTotal = celdas[6]?.innerText.trim();
                    const estado = celdas[7]?.innerText.trim();    

                    if (rutReceptor && folio && !isNaN(folio)) {
                        lista.push({ rutReceptor, razonSocial, documento, folio, fecha, montoTotal, estado, procesado: false });
                    }
                }
            });
            return lista;
        });

        if (datosPagina.length === 0) {
            hayMasDatos = false; 
        } else {
            const primerFolioActual = datosPagina[0].folio;
            if (primerFolioAnterior === primerFolioActual) break; 
            primerFolioAnterior = primerFolioActual; 

            facturasExtraidas = facturasExtraidas.concat(datosPagina);
            paginaActual++;
            await new Promise(r => setTimeout(r, 1000)); 
        }
    }
    
    console.log(`\n✅ ¡Extracción de tabla completa! Total folios capturados: ${facturasExtraidas.length}`);
    return facturasExtraidas;
}

// ============================================================================
// 4. ORQUESTADOR PRINCIPAL (El Cerebro)
// ============================================================================
async function ejecutarScrapperEmitidos() {
    console.log("==================================================");
    console.log("🚀 INICIANDO SCRAPPER DE EMITIDOS (SOLO TABLA)");
    console.log("==================================================");
    
    // Detectamos si estamos en la nube (production) o en tu PC
    const isProduction = process.env.NODE_ENV === 'production';

    const browser = await puppeteer.launch({ 
        headless: isProduction ? true : false, // Invisible en la nube, visible en tu PC
        defaultViewport: null,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage'
        ] // 👈 ESTO ES OBLIGATORIO PARA QUE FUNCIONE EN RAILWAY / LINUX
    });
    
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(60000); 

    page.on('dialog', async dialog => {
        await dialog.accept().catch(() => {});
    });

    try {
        await iniciarSesion(page);

        // Llamamos a la función extractora que definimos arriba
        const facturasExtraidas = await extraerTablaFoliosEmitidos(page);
        let datosExistentes = fs.existsSync(rutaArchivoJSON_Emitidos) ? JSON.parse(fs.readFileSync(rutaArchivoJSON_Emitidos, 'utf8')) : [];
        
        const facturasNuevas = facturasExtraidas.filter(nueva => 
            !datosExistentes.some(guardada => guardada.folio === nueva.folio && guardada.documento === nueva.documento)
        );

        if (facturasNuevas.length > 0) {
            datosExistentes = [...datosExistentes, ...facturasNuevas];
            fs.writeFileSync(rutaArchivoJSON_Emitidos, JSON.stringify(datosExistentes, null, 2));
            console.log(`💾 Se agregaron ${facturasNuevas.length} folios nuevos a la base de datos local.`);
        } else {
            console.log(`📊 No hay folios nuevos detectados en el portal.`);
        }

    } catch (error) {
        console.error("\n❌ Error Crítico:", error.message);
    } finally {
        if (browser) {
            console.log("\n🛑 Asegurando el cierre de sesión antes de salir...");
            try {
                if (!page.isClosed()) {
                    await cerrarSesion(page); 
                }
            } catch(e) {}
            
            await browser.close();
            console.log("🛑 Robot apagado correctamente.");
        }
    }
}

// ============================================================================
// 5. EJECUCIÓN INICIAL
// ============================================================================
ejecutarScrapperEmitidos();