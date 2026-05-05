import puppeteer from 'puppeteer';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Asegúrate de que esta ruta apunte a tu archivo de login del SII
import { iniciarSesion, cerrarSesion } from '../documentos recibidos/sii_operaciones.js'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rutaArchivoJSON_Recibidos = path.join(__dirname, 'folios_documentos_recibidos.json');

// ============================================================================
// 1. FUNCIÓN EXTRACTORA DE COMPRAS (El Motor)
// ============================================================================
async function extraerTablaFoliosRecibidos(page) {
    console.log("📂 [2/3] Yendo a la tabla de documentos RECIBIDOS...");
    
    console.log("🏢 Seleccionando la empresa...");
    await page.goto('https://www1.sii.cl/cgi-bin/Portal001/mipeLaunchPage.cgi?OPCION=1&TIPO=4', { waitUntil: 'networkidle2' });
    
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
        page.evaluate(() => {
            const rutBuscado = '78306207'; // Tu RUT principal
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
        console.log(`⏳ Consultando página ${paginaActual} de Compras...`);
        
        const urlPaginada = `https://www1.sii.cl/cgi-bin/Portal001/mipeAdminDocsRcp.cgi?RUT_EMI=&FOLIO=&RZN_SOC=&FEC_DESDE=&FEC_HASTA=&TPO_DOC=&ESTADO=&ORDEN=&NUM_PAG=${paginaActual}`;
        await page.goto(urlPaginada, { waitUntil: 'networkidle2', timeout: 60000 });

        try {
            // ✅ CORRECCIÓN EXACTA BASADA EN TU IMAGEN: id="tablaDatos"
            await page.waitForSelector('#tablaDatos tbody tr', { timeout: 15000 });
        } catch (e) {
            console.log(`⚠️ No se encontró la tabla en la página ${paginaActual}. Terminando extracción.`);
            break; 
        }

        const datosPagina = await page.evaluate(() => {
            const lista = [];
            // ✅ CORRECCIÓN: Buscamos filas en #tablaDatos
            const filas = document.querySelectorAll('#tablaDatos tbody tr'); 
            
            filas.forEach(fila => {
                const celdas = fila.querySelectorAll('td');
                // La imagen muestra que necesitamos al menos hasta la celda 6 (Monto)
                if (celdas.length >= 7) { 
                    const rutEmisor = celdas[1]?.innerText.trim();
                    const razonSocial = celdas[2]?.innerText.trim();
                    const documento = celdas[3]?.innerText.trim(); 
                    const folio = celdas[4]?.innerText.trim();
                    const fecha = celdas[5]?.innerText.trim();     
                    
                    // Basado en tu foto, el monto está exactamente en la celda 6
                    let montoTxt = celdas[6]?.innerText || '0';
                    const montoTotal = parseInt(montoTxt.replace(/[^0-9]/g, '')) || 0;

                    if (rutEmisor && folio && !isNaN(folio)) {
                        // 🧠 Simulamos el detalleCompleto para guardar sin abrir PDF
                        let mNeto = Math.round(montoTotal / 1.19);
                        let mIva = montoTotal - mNeto;
                        
                        if (documento.toUpperCase().includes('EXENTA')) {
                            mNeto = montoTotal;
                            mIva = 0;
                        }

                        lista.push({ 
                            rutEmisor, 
                            razonSocial, 
                            documento, 
                            folio, 
                            fecha, 
                            montoTotal,
                            procesado: true, 
                            detalleCompleto: {
                                cabecera: {
                                    receptorRut: '78.306.207-0',
                                    receptorNombre: 'VOLLAIRE Y OLIVOS SIMPLE PYME',
                                    montoNeto: mNeto,
                                    montoIva: mIva
                                }
                            }
                        });
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
    
    console.log(`\n✅ ¡Extracción de COMPRAS completa! Total capturadas: ${facturasExtraidas.length}`);
    return facturasExtraidas;
}

// ============================================================================
// 3. ORQUESTADOR PRINCIPAL
// ============================================================================
async function ejecutarRobotAutomatico() {
    console.log("==================================================");
    console.log("🚀 INICIANDO ROBOT DE COMPRAS (SOLO TABLA)");
    console.log("==================================================");
    
    const browser = await puppeteer.launch({ 
        headless: false, // Invisible para máxima velocidad
        defaultViewport: null
    });
    
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(60000); 

    page.on('dialog', async dialog => {
        await dialog.accept().catch(() => {});
    });

    try {
        await iniciarSesion(page);

        const facturasExtraidas = await extraerTablaFoliosRecibidos(page);
        
        let datosExistentes = fs.existsSync(rutaArchivoJSON_Recibidos) ? JSON.parse(fs.readFileSync(rutaArchivoJSON_Recibidos, 'utf8')) : [];
        
        const facturasNuevas = facturasExtraidas.filter(nueva => 
            !datosExistentes.some(guardada => guardada.rutEmisor === nueva.rutEmisor && guardada.folio === nueva.folio)
        );

        if (facturasNuevas.length > 0) {
            datosExistentes = [...datosExistentes, ...facturasNuevas];
            fs.writeFileSync(rutaArchivoJSON_Recibidos, JSON.stringify(datosExistentes, null, 2));
            console.log(`💾 ¡Se agregaron ${facturasNuevas.length} nuevos documentos a la base local!`);
        } else {
            console.log(`📊 No hay documentos de compra nuevos en el portal.`);
        }

        await cerrarSesion(page);

    } catch (error) {
        console.error("\n❌ Error Crítico en el Robot:", error.message);
    } finally {
        if (browser) {
            await browser.close();
            console.log("🛑 Robot apagado completamente.");
        }
    }
}

// ============================================================================
// EJECUCIÓN
// ============================================================================
ejecutarRobotAutomatico();