import puppeteer from 'puppeteer';
import 'dotenv/config';

// =====================================================================
// ⚙️ CONFIGURACIÓN DE LA PRUEBA VISUAL
// =====================================================================
// 🔥 Pon aquí el folio exacto que quieres que el robot abra (Ej: 984 como en tu foto)
const FOLIO_A_BUSCAR = "982"; 

async function testEntrarVistaDetalle() {
    console.log("==================================================");
    console.log(`🚀 INICIANDO PRUEBA - ENTRANDO A DETALLE DEL FOLIO: ${FOLIO_A_BUSCAR}`);
    console.log("==================================================");

    const browser = await puppeteer.launch({
        headless: false, // Falso para ver el proceso en vivo
        executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", // Usando tu configuración
        defaultViewport: null,
        args: ['--start-maximized']
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);

    try {
        console.log("🔑 [1/5] Iniciando sesión...");
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

        console.log("📂 [2/5] Accediendo al Historial de Documentos Emitidos...");
        // Esta es la URL exacta para OPCION=2 (Historial de documentos)
        await page.goto('https://www1.sii.cl/cgi-bin/Portal001/mipeSelEmpresa.cgi?DESDE_DONDE_URL=OPCION%3D2%26TIPO%3D4');

        await page.evaluate(() => {
            const select = document.querySelector('select');
            if (select) {
                // Buscamos la empresa 78.306.207 (o la que corresponda)
                const opt = Array.from(select.options).find(o => o.text.includes('78306207'));
                if (opt) {
                    select.value = opt.value;
                    const btn = document.querySelector('input[type="submit"], button[type="submit"], input[name="btnContinuar"]');
                    if (btn) btn.click();
                } else if (select.options.length > 1) {
                    select.selectedIndex = 1; // Respaldo: elige la segunda opción
                    const btn = document.querySelector('input[type="submit"], button[type="submit"]');
                    if (btn) btn.click();
                }
            }
        });
        await page.waitForNavigation();

        console.log("🔍 [3/5] Filtrando la tabla por el Folio...");
        await page.waitForSelector('table tbody tr');

        await page.evaluate((folioBuscar) => {
            const inputFolio = document.querySelector('input[name="FOLIO"], input[name="folio"]');
            if (inputFolio) {
                inputFolio.value = folioBuscar;
                const botones = Array.from(document.querySelectorAll('input[type="button"], button'));
                const btnConsultar = botones.find(b => b.value?.toLowerCase().includes('consultar') || b.innerText?.toLowerCase().includes('consultar'));
                if (btnConsultar) btnConsultar.click();
            }
        }, FOLIO_A_BUSCAR);

        // Esperamos a que la tabla se recargue con el filtro
        await new Promise(r => setTimeout(r, 3000));

        console.log("🖱️ [4/5] Buscando el enlace de la factura y haciendo clic...");
        const hizoClic = await page.evaluate((folioBuscar) => {
            const filas = Array.from(document.querySelectorAll('table tbody tr'));
            for (let fila of filas) {
                const celdas = fila.querySelectorAll('td');
                // Asegurarnos de que tenga las celdas suficientes
                if (celdas.length >= 5) {
                    const folioCelda = celdas[4].innerText.trim();
                    if (folioCelda === String(folioBuscar)) {
                        // El enlace está en la primera celda
                        const link = celdas[0].querySelector('a');
                        if (link) {
                            link.click();
                            return true;
                        }
                    }
                }
            }
            return false;
        }, FOLIO_A_BUSCAR);

        if (hizoClic) {
            await page.waitForNavigation({ waitUntil: 'networkidle2' });
            console.log(`👀 [5/5] ¡ÉXITO! Estamos en la vista de detalle. Tienes 3 segundos para mirar...`);
            
            // 🔥 AQUÍ ESTÁN LOS 3 SEGUNDOS DE ESPERA 🔥
            await new Promise(r => setTimeout(r, 3000));
        } else {
            console.log(`⚠️ No se encontró el Folio ${FOLIO_A_BUSCAR} en la tabla o no tenía enlace.`);
        }

    } catch (error) {
        console.error("❌ Error crítico durante la prueba:", error.message);
    } finally {
        console.log("🚪 Tiempo agotado. Cerrando sesión...");
        try {
            await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('a, button')).find(el => el.innerText?.toLowerCase().includes('cerrar sesi'));
                if (btn) btn.click(); else window.location.href = 'https://misiir.sii.cl/cgi_misii/siihome.cgi?fin';
            });
            await new Promise(r => setTimeout(r, 2000));
        } catch (e) {}
        await browser.close();
        console.log("✅ Prueba finalizada.");
    }
}

testEntrarVistaDetalle();