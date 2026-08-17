import puppeteer from 'puppeteer';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { iniciarSesion, prepararYConsultarRCV, escanearTodoElPortal, cerrarSesion } from './sii_navegador.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function ejecutarRobotRCV() {
    console.log("==================================================");
    console.log("🚀 VSV CONTADORES - ESCÁNER MAESTRO (AÑO 2025) ⚡ MODO TURBO");
    console.log("==================================================");
    
    // ⚡ 1. MODO INVISIBLE: 'new' hace que no se abra la pantalla visual, consumiendo menos recursos
    const browser = await puppeteer.launch({ 
        headless: false, 
        defaultViewport: null,
        args: [
            '--start-maximized',
            '--window-size=1920,1080',
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process' // Optimiza el uso de memoria
        ] 
    });
    
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    
    await page.setViewport({ width: 1920, height: 1080 });
    page.setDefaultNavigationTimeout(90000); 

    // ⚡ 2. BLOQUEADOR DE BASURA: Intercepta y cancela la carga de imágenes y estilos
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const resourceType = req.resourceType();
        // Si el SII intenta cargar una foto, un estilo CSS o una fuente, lo bloqueamos
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
            req.abort();
        } else {
            req.continue();
        }
    });

    page.on('dialog', async d => await d.accept().catch(() => {}));

    try {
        await iniciarSesion(page);
        
        const meses = [11, 12]; 
        const ANO = 2025;
        
        for (const MES of meses) {
            try {
                console.log(`\n📅 INICIANDO EXTRACCIÓN PERIODO: ${MES}/${ANO}...`);
                
                await prepararYConsultarRCV(page, ANO, MES);
                const datosCompletos = await escanearTodoElPortal(page);

                const nombreArchivo = `RCV_Super_Extraccion_${ANO}_${String(MES).padStart(2, '0')}.json`;
                fs.writeFileSync(path.join(__dirname, nombreArchivo), JSON.stringify(datosCompletos, null, 4));
                
                console.log(`💾 ¡Extracción del mes ${MES} guardada con éxito!`);
                
                // ⚡ 3. PAUSA CORTA: Reducida a 2 segundos
                await new Promise(r => setTimeout(r, 2000));

            } catch (errorMes) {
                console.error(`\n❌ Error extrayendo el mes ${MES}/${ANO}:`, errorMes.message);
                console.log("⏭️ Saltando al siguiente mes...");
                await new Promise(r => setTimeout(r, 3000));
            }
        }

    } catch (error) {
        console.error("\n❌ ERROR CRÍTICO EN EL ROBOT PRINCIPAL:", error);
    } finally {
        // El cierre de sesión estaba ARRIBA, dentro del `try`: si el robot fallaba
        // en cualquier mes, nunca se ejecutaba y la sesión quedaba tomada en el
        // portal del SII hasta que caducara sola por inactividad. Va en el
        // `finally` y protegido, que es donde tiene que estar.
        try { await cerrarSesion(page); }
        catch (e) { console.log(`⚠️ No se pudo cerrar la sesión del SII: ${e.message}`); }

        try { await browser.close(); } catch (e) { try { browser.process()?.kill('SIGKILL'); } catch {} }
        console.log("\n🏁 PROCESO COMPLETADO.");
    }
}

ejecutarRobotRCV();