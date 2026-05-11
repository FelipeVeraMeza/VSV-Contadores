import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
// ❌ Ya no necesitamos dotenv aquí, porque el Orquestador le inyectará
// las variables BANCO_RUT, BANCO_DV y BANCO_PASS directamente en la memoria.
import { iniciarNavegador, loginBCI, extraerMovimientosBCI, cerrarSesionBCI } from './bci_scraper.mjs';

// Obtenemos la ruta actual del script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    // 1️⃣ Leemos las credenciales que el Orquestador de Node.js inyectó temporalmente
    const rut = process.env.BANCO_RUT; 
    const dv = process.env.BANCO_DV;   
    const rutCompleto = `${rut}${dv}`; 
    const clave = process.env.BANCO_PASS; 

    // Verificamos por seguridad
    if (!rut || !clave) {
        console.error("❌ ERROR: Faltan credenciales (BANCO_RUT o BANCO_PASS).");
        process.exit(1); 
    }

    let browser;
    let page; 

    try {
        console.log(`\n=======================================================`);
        console.log(`🏦 INICIANDO EXTRACCIÓN DE CARTOLAS BCI`);
        console.log(`=======================================================`);

        browser = await iniciarNavegador();
        page = await browser.newPage(); 
        
        // 2️⃣ Enviamos las credenciales dinámicas al robot
        await loginBCI(page, rutCompleto, clave);

        // 3️⃣ Obtenemos el objeto organizado mes por mes
        const datosExtraidos = await extraerMovimientosBCI(page);
        
        let totalMovimientos = 0;
        for (const mes in datosExtraidos) {
            totalMovimientos += datosExtraidos[mes].length;
        }
        
        console.log("\n=======================================================");
        console.log(`📊 EXTRACCIÓN FINALIZADA: ${totalMovimientos} movimientos obtenidos en total.`);
        console.log("=======================================================");

        if (totalMovimientos > 0) {
            // 4️⃣ Guardamos el JSON en la misma carpeta para que el Orquestador lo lea
            const rutaArchivo = path.join(__dirname, 'cartolas_bci.json');
            await fs.writeFile(rutaArchivo, JSON.stringify(datosExtraidos, null, 4), 'utf-8');
            
            console.log(`\n💾 ¡ÉXITO! Archivo guardado correctamente para el Orquestador.`);
        } else {
            console.log("\n[!] No se guardó ningún archivo porque no se detectaron movimientos.");
            // Creamos un archivo vacío para que el orquestador no falle al intentar leer
            const rutaArchivo = path.join(__dirname, 'cartolas_bci.json');
            await fs.writeFile(rutaArchivo, JSON.stringify({}), 'utf-8');
        }
        
    } catch (error) {
        console.error("\n❌ ERROR CRÍTICO EN EL PROCESO:", error.message);
        // Si hay error creamos JSON vacío para que el orquestador sepa que falló
        const rutaArchivo = path.join(__dirname, 'cartolas_bci.json');
        await fs.writeFile(rutaArchivo, JSON.stringify({ error: error.message }), 'utf-8');
    } finally {
        if (page && !page.isClosed()) {
            await cerrarSesionBCI(page);
        }
        if (browser) {
            console.log("🛑 Apagando el motor del navegador...");
            await browser.close();
        }
    }
}

// Ejecutamos la función
main();