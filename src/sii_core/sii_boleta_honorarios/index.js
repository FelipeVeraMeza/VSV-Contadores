import puppeteer from 'puppeteer';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { iniciarSesion, navegarABoletas, extraerResumenAnual, cerrarSesion } from './sii_bhe_navegador.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function ejecutarRobotBHE() {
    console.log("==================================================");
    console.log("🚀 VSV CONTADORES - ESCÁNER BHE (HONORARIOS) ⚡ MODO VISIBLE");
    console.log("==================================================");
    
    const browser = await puppeteer.launch({ 
        headless: false, 
        defaultViewport: null,
        slowMo: 30, 
        args: [
            '--start-maximized',
            '--window-size=1920,1080',
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process'
        ] 
    });
    
    const pages = await browser.pages();
    const page = pages[0];
    
    await page.setViewport({ width: 1920, height: 1080 });
    page.setDefaultNavigationTimeout(90000); 

    page.on('dialog', async d => await d.accept().catch(() => {}));

    try {
        await iniciarSesion(page);
        
        const ANO_A_CONSULTAR = 2025;
        const TIPO_CONSULTA = 'EMITIDAS'; 

        console.log(`\n📅 INICIANDO EXTRACCIÓN DE HONORARIOS ${TIPO_CONSULTA} - AÑO: ${ANO_A_CONSULTAR}...`);
        
        await navegarABoletas(page, TIPO_CONSULTA);
        
        // Extraemos la tabla resumen anual (la de la última imagen)
        const tablaResumen = await extraerResumenAnual(page, ANO_A_CONSULTAR);

        const nombreArchivo = `BHE_Resumen_${TIPO_CONSULTA}_${ANO_A_CONSULTAR}.json`;
        fs.writeFileSync(path.join(__dirname, nombreArchivo), JSON.stringify(tablaResumen, null, 4));
        
        console.log(`\n💾 ¡Tabla de resumen guardada con éxito en ${nombreArchivo}!`);

    } catch (error) {
        console.error("\n❌ ERROR CRÍTICO EN EL ROBOT BHE:", error);
    } finally {
        // Este robot era el peor de todos: el cierre de sesión estaba dentro del
        // `try` (no corría si algo fallaba) y ADEMÁS nunca cerraba el navegador
        // —el mensaje decía «puedes cerrar el navegador manualmente»—, así que
        // cada corrida dejaba un Chrome vivo para siempre.
        try { await cerrarSesion(page); }
        catch (e) { console.log(`⚠️ No se pudo cerrar la sesión del SII: ${e.message}`); }

        try { await browser.close(); } catch (e) { try { browser.process()?.kill('SIGKILL'); } catch {} }
        console.log("\n🏁 PROCESO DE HONORARIOS COMPLETADO.");
    }
}

ejecutarRobotBHE();