import puppeteer from 'puppeteer';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import pkg from 'pg'; 
import crypto from 'crypto'; 
import { encrypt } from '../../../utils/crypto.js'; 

const { Client } = pkg;
dotenv.config();

// ==========================================
// 🌟 RASTREADOR DE PROGRESO GLOBAL
// ==========================================
export const estadoRobot = {
    activo: false,
    total: 0,
    actual: 0,
    rutActual: "",
    exitos: 0,
    errores: 0
};

const RUTA_LOG = path.join(process.cwd(), 'facturas_emitidas_nombres_log.txt'); 
const TEL_EMISOR = '56978278733'; 

if (!fs.existsSync(RUTA_LOG)) fs.writeFileSync(RUTA_LOG, '');
const delay = (ms) => new Promise(res => setTimeout(res, ms));

async function navegarAEmision(page) {
    let exito = false;
    let intentos = 0;
    while (!exito && intentos < 5) {
        try {
            await page.goto('https://www1.sii.cl/cgi-bin/Portal001/mipeLaunchPage.cgi?OPCION=33&TIPO=4', { 
                waitUntil: 'domcontentloaded', 
                timeout: 20000 
            });
            await delay(2000); 
            exito = true; 
        } catch (error) {
            intentos++;
            console.log(`⚠️ La página no cargó. Reintentando poner la URL (Intento ${intentos})...`);
            await delay(3000);
        }
    }
    if (!exito) throw new Error('No se pudo acceder al portal del SII tras 5 intentos.');
}

const limpiarYTipar = async (page, selector, texto) => {
    if (!texto) return; 
    try {
        await page.waitForSelector(selector, { visible: true, timeout: 5000 });
        await page.click(selector, { clickCount: 3 }); 
        await page.keyboard.press('Backspace');        
        await page.type(selector, texto, { delay: 150 }); 
    } catch (e) {
        console.log(`⚠️ No se pudo limpiar/escribir en: ${selector}`);
    }
};

// =========================================================================
// 🚀 MOTOR DE FACTURACIÓN MASIVA
// =========================================================================
export async function emitirLotePuppeteer(facturasFront) {
    console.log('\n==================================================');
    console.log('[INFO] AUDITORÍA: Iniciando Motor Masivo por Lotes...');
    
    const logText = fs.readFileSync(RUTA_LOG, 'utf-8').toUpperCase();
    const logLineas = logText.split('\n');
    const pendientes = [];
    
    facturasFront.forEach((f) => {
        const rutCuerpo = f.rutReceptor;
        const nombrePlan = (f.producto.nombre || '').toUpperCase();
        const emitidoEnLog = logLineas.some(linea => linea.includes(rutCuerpo) && !linea.includes('FALLO') && !linea.includes('ERROR'));
        const esExclusion = nombrePlan.includes('HAMABU') || nombrePlan.includes('ANITA MARIA VEAS');

        if (!emitidoEnLog && !esExclusion) pendientes.push(f);
    });

    if (pendientes.length === 0) return { ok: true, mensaje: "No hay facturas pendientes." };

    estadoRobot.activo = true;
    estadoRobot.total = pendientes.length;
    estadoRobot.actual = 0;
    estadoRobot.exitos = 0;
    estadoRobot.errores = 0;

    const resultados = [];
    const TAMANO_LOTE = 3; 

    // =======================================================================
    // 🔄 CICLE EXTERN: GESTIÓ DE LOTS
    // =======================================================================
    for (let i = 0; i < pendientes.length; i += TAMANO_LOTE) {
        const loteActual = pendientes.slice(i, i + TAMANO_LOTE);
        
        console.log(`\n📦 INICIANDO LOTE DE FACTURAS (Processant del ${i + 1} al ${i + loteActual.length} de ${pendientes.length})`);

        // 🔥 OBRIM NAVEGADOR
        let browser = await puppeteer.launch({ 
            headless: true, 
            defaultViewport: null, 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized', '--disable-blink-features=AutomationControlled'] 
        });

        let page = (await browser.pages())[0];
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        page.on('dialog', async d => await d.accept());

        // =======================================================================
        // 🔄 CICLE INTERN: FACTURACIÓ
        // =======================================================================
        for (let j = 0; j < loteActual.length; j++) {
            const f = loteActual[j];
            const indiceGlobal = i + j + 1; 
            
            estadoRobot.actual = indiceGlobal;
            estadoRobot.rutActual = f.rutReceptor;

            let intentoRealizado = 0;
            const MAX_INTENTOS = 3;
            let facturaCompletada = false;

            while (intentoRealizado < MAX_INTENTOS && !facturaCompletada) {
                intentoRealizado++;
                let razonSocialCapturadaDelSII = null;

                console.log(`\n==================================================`);
                console.log(`[INFO] FACTURANDO: RUT ${f.rutReceptor} (Intent ${intentoRealizado}/${MAX_INTENTOS}) | Progrés Global: ${indiceGlobal}/${pendientes.length}`);

                try {
                    // Si és un reintent, matamos el navegador i n'obrim un de nou completament fresc (Hard Reset)
                    if (intentoRealizado > 1) {
                        console.log('🔄 [HARD RESET] Tancant navegador i obrint-ne un de nou per desatascar...');
                        try { await browser.close(); } catch(e) {}
                        await delay(2000);
                        
                        browser = await puppeteer.launch({ 
                            headless: true, 
                            defaultViewport: null, 
                            args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized', '--disable-blink-features=AutomationControlled'] 
                        });
                        page = (await browser.pages())[0];
                        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
                        page.on('dialog', async d => await d.accept());
                    } else if (i > 0 && j === 0) {
                        // Netejador preventiu només al primer intent del lot (si no és el primer lot)
                        try { 
                            console.log('🔄 Esborrant la memòria cau visual...');
                            await page.goto('about:blank'); 
                            await delay(1000);
                        } catch(e) {}
                    }

                    console.log('🔄 Carregant portal d\'emissió...');
                    await navegarAEmision(page);
                    await delay(2000);
                    
                    // ============================================================
                    // 1. 🔥 VALIDAR LOGIN
                    // ============================================================
                    let loginCompletado = false;
                    let intentosLogin = 0;

                    while (!loginCompletado && intentosLogin < 3) {
                        const inputRutExiste = await page.$('#rutcntr');
                        if (inputRutExiste) {
                            intentosLogin++;
                            console.log(`🔑 [Intent Login ${intentosLogin}/3] Iniciant sessió al SII...`);
                            
                            try {
                                await page.evaluate(() => {
                                    if (document.querySelector('#rutcntr')) document.querySelector('#rutcntr').value = '';
                                    if (document.querySelector('#clave')) document.querySelector('#clave').value = '';
                                });

                                await page.type('#rutcntr', `${process.env.DTE_RUT}-${process.env.DTE_DV}`, { delay: 100 });
                                await page.type('#clave', process.env.DTE_PASS, { delay: 100 });
                                
                                await Promise.all([
                                    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
                                    page.click('#bt_ingresar')
                                ]);
                                
                                await delay(2000); 
                                await navegarAEmision(page); 
                                await delay(2000);
                                
                                const sigueEnLogin = await page.$('#rutcntr');
                                if (sigueEnLogin) throw new Error("Ha rebotat de nou al login.");

                                loginCompletado = true;
                            } catch (errLogin) {
                                console.log(`⚠️ El login ha fallat. Tornant a intentar...`);
                                await navegarAEmision(page);
                                await delay(3000); 
                            }
                        } else {
                            loginCompletado = true; 
                        }
                    }

                    if (!loginCompletado) throw new Error("El SII no ha permès iniciar sessió després de 3 intents.");

                    // 2. Validar Empresa Emissora
                    const selectBox = await page.$('select[name="RUT_EMP"]');
                    if (selectBox) {
                        console.log('🏢 Seleccionant empresa emissora...');
                        const valueSegundaEmpresa = await page.evaluate(() => {
                            const selectElement = document.querySelector('select[name="RUT_EMP"]');
                            if (selectElement && selectElement.options.length > 0) {
                                let targetIndex = 1; 
                                if (selectElement.options[0].text.toLowerCase().includes('seleccione')) {
                                    if (selectElement.options.length > 2) targetIndex = 2;
                                } else {
                                    if (selectElement.options.length > 1) targetIndex = 1;
                                }
                                return selectElement.options[targetIndex].value;
                            }
                            return null;
                        });
                        if (valueSegundaEmpresa) {
                            await page.select('select[name="RUT_EMP"]', valueSegundaEmpresa);
                            await delay(500);
                            await Promise.all([
                                page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
                                page.evaluate(() => { document.querySelector('button[type="submit"], input[type="submit"]').click(); })
                            ]);
                            await delay(2000);
                        }
                    }

                    console.log('⏳ Pàgina carregada. Esperant 5 segons abans de teclejar la factura...');
                    await delay(5000); 

                    await page.waitForSelector('input[name="EFXP_RUT_RECEP"], #EFXP_RUT_RECEP', { visible: true, timeout: 25000 });
                    await delay(1000); 

                    const rutInputSelector = await page.$('#EFXP_RUT_RECEP') ? '#EFXP_RUT_RECEP' : 'input[name="EFXP_RUT_RECEP"]';
                    const dvInputSelector = await page.$('#EFXP_DV_RECEP') ? '#EFXP_DV_RECEP' : 'input[name="EFXP_DV_RECEP"]';

                    await page.click(rutInputSelector);
                    await page.type(rutInputSelector, f.rutReceptor, { delay: 150 }); 
                    await page.keyboard.press('Tab');
                    await delay(300);
                    await page.type(dvInputSelector, f.dvReceptor, { delay: 150 });
                    await page.keyboard.press('Tab');
                    await page.mouse.click(10, 10); 
                    await delay(2000); 

                    await limpiarYTipar(page, 'input[name="EFXP_CIUDAD_ORIGEN"]', f.ciudadEmisor || 'Santiago');
                    await limpiarYTipar(page, 'input[name="EFXP_FONO_EMISOR"]', TEL_EMISOR);
                    await limpiarYTipar(page, 'input[name="EFXP_CIUDAD_RECEP"]', f.ciudadReceptor || 'Santiago');
                    if (f.contactoReceptor) await limpiarYTipar(page, 'input[name="EFXP_CONTACTO"]', f.contactoReceptor);

                    let nombreEncontrado = null;
                    for (let k = 0; k < 6; k++) {
                        nombreEncontrado = await page.evaluate(() => {
                            const inputExacto = document.querySelector('#EFXP_NMB_RECEP') || document.querySelector('input[name="EFXP_NMB_RECEP"]');
                            if (inputExacto && inputExacto.value && inputExacto.value.trim().length > 2) return inputExacto.value.trim();
                            return null;
                        });
                        if (nombreEncontrado) {
                            razonSocialCapturadaDelSII = nombreEncontrado;
                            break; 
                        }
                        await delay(500); 
                    }

                    if (!nombreEncontrado) {
                       razonSocialCapturadaDelSII = f.razonSocial || 'CLIENTE MASIVO SII';
                    }
                    
                    console.log(`✅ [RAÓ SOCIAL A GUARDAR]: "${razonSocialCapturadaDelSII}"`);

                    await page.type('input[name="EFXP_NMB_01"]', f.producto.nombre || 'Servicio', { delay: 150 });
                    await page.type('input[name="EFXP_QTY_01"]', '1', { delay: 150 });
                    await limpiarYTipar(page, 'input[name="EFXP_PRC_01"]', String(f.producto.precio || 0));
                    
                    const checkbox = await page.waitForSelector('input[name="DESCRIP_01"]', { visible: true });
                    await checkbox.click(); 
                    try { await page.waitForSelector('textarea[name="EFXP_DSC_ITEM_01"]', { visible: true, timeout: 5000 }); } catch (e) { await checkbox.click(); }
                    await page.type('textarea[name="EFXP_DSC_ITEM_01"]', f.producto.descripcion || 'Servicios Contables', { delay: 150 });
                    await page.select('select[name="EFXP_FMA_PAGO"]', '1'); 

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

                    let intentosFirma = 0, cajaVisible = false;
                    while (intentosFirma < 5 && !cajaVisible) {
                        try {
                            await page.evaluate(() => {
                                const btn = document.querySelector('input[name="btnSign"]');
                                if (btn && !btn.disabled) btn.click();
                            });
                            // 🔥 Canvi clau: Es redueix el temps d'espera i si falla tira l'error que atraparà el CATCH i farà HARD RESET
                            await page.waitForSelector('#myPass', { visible: true, timeout: 6000 });
                            cajaVisible = true;
                        } catch (e) {
                            intentosFirma++;
                            console.log(`⚠️ [Intent Firma ${intentosFirma}/5] Botó no trobat o bloquejat...`);
                            await page.click('button[name="Button_Update"]').catch(()=> {}); 
                            await delay(2000);
                        }
                    }

                    if (!cajaVisible) throw new Error("El SII no ha carregat la caixa per a la clau digital (input[name='btnSign'] no detectat o penjat).");

                    await page.focus('#myPass');
                    await page.type('#myPass', process.env.SII_PFX_PASS, { delay: 150 }); 
                    await delay(1000); 

                    await Promise.all([
                        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
                        page.evaluate(() => {
                            const btnEnviar = document.querySelector('#btnFirma');
                            if (btnEnviar) btnEnviar.click();
                        })
                    ]);
                    
                    let folio = null;
                    for (let k = 0; k < 30; k++) {
                        const text = await page.evaluate(() => document.body.innerText).catch(() => "");
                        const match = text.match(/N[°º]\s*(\d+)/i) || text.match(/Folio\s*(\d+)/i);
                        if (match) { folio = match[1]; break; }
                        await delay(1000); 
                    }

                    if (folio) {
                        console.log(`🎉 ¡ÈXIT! Foli N°: ${folio}`);
                        fs.appendFileSync(RUTA_LOG, `${f.rutReceptor} - Folio: ${folio}\n`); 
                        resultados.push({ rut: f.rutReceptor, nombre: razonSocialCapturadaDelSII, estado: 'exito', folio: folio });
                        
                        estadoRobot.exitos++; 
                        facturaCompletada = true; 

                        // ==============================================================
                        // 🔥 CONNEXIÓ "FLASH" A SUPABASE
                        // ==============================================================
                        const dbClient = new Client({
                            user: process.env.DBS_USER, host: process.env.DBS_HOST,
                            database: process.env.DBS_DATABASE, password: process.env.DBS_PASSWORD,
                            port: process.env.DBS_PORT, ssl: { rejectUnauthorized: false }
                        });

                        try {
                            await dbClient.connect();
                            let empresaIdFinal = f.empresa_id;
                            const rutOriginal = `${f.rutReceptor}-${f.dvReceptor}`;
                            
                            if (empresaIdFinal === 'EXTERNO') {
                                try {
                                    const rutHash = crypto.createHash('sha256').update(rutOriginal).digest('hex');
                                    const rutEncrypted = encrypt(rutOriginal);
                                    const insertEmpresaQuery = `INSERT INTO empresa (razon_social, rut_encrypted, rut_hash, giro, regimen_tributario, activo) VALUES ($1, $2, $3, 'Por definir', 'Por definir', true) RETURNING id;`;
                                    const resEmp = await dbClient.query(insertEmpresaQuery, [razonSocialCapturadaDelSII, rutEncrypted, rutHash]);
                                    empresaIdFinal = resEmp.rows[0].id;
                                } catch (err) { empresaIdFinal = null; }
                            }

                            if (empresaIdFinal) {
                                const checkQuery = `SELECT id FROM documentos_emitidos WHERE rut_cliente = $1 AND tipo_dte = 33 AND folio = $2`;
                                const checkRes = await dbClient.query(checkQuery, [rutOriginal, folio]);
                                if (checkRes.rows.length === 0) {
                                    await dbClient.query(`INSERT INTO documentos_emitidos (empresa_id, rut_cliente, tipo_dte, folio, monto_neto, fecha_emision) VALUES ($1, $2, 33, $3, $4, $5)`, [empresaIdFinal, rutOriginal, folio, parseInt(f.producto.precio), new Date().toISOString()]);
                                    console.log(`✅ Guardat a la Volta Historial.`);
                                }
                            }
                        } catch (dbErr) {
                            console.log(`⚠️ Error de Xarxa BD:`, dbErr.message);
                        } finally {
                            await dbClient.end(); 
                        }

                    } else {
                        throw new Error("No s'ha detectat el foli.");
                    }

                } catch (e) {
                    console.log(`❌ [ERROR] Intent ${intentoRealizado} ha fallat en ${f.rutReceptor}: ${e.message}`);
                    
                    if (intentoRealizado >= MAX_INTENTOS) {
                        console.log(`🚫 S'han esgotat els 3 reintents. Saltant a la següent factura.`);
                        fs.appendFileSync(RUTA_LOG, `FALLO: ${f.rutReceptor} - ${f.producto.nombre || ''}\n`);
                        resultados.push({ rut: f.rutReceptor, estado: 'error', error: e.message });
                        estadoRobot.errores++; 
                    }
                    // Si estem en un reintent (intent >= 1) i ha fallat, el while farà el HARD RESET al principi de la volta següent.
                }
            } // Fi del While de reintents
            
            if (j < loteActual.length - 1 && indiceGlobal < pendientes.length) {
                console.log('⏱️ Factura registrada. Refredant connexió per 20 segons abans de la següent empresa...');
                await delay(20000); 
            } else {
                 console.log('⏱️ Factura processada. Finalitzant cicle del lot...');
                 await delay(5000); 
            }
        } 

        // 🔥 AL TERMINAR EL LOT DE 3, TANQUEM EL NAVEGADOR
        console.log(`\n🧹 [LOT DE 3 FINALITZAT] Tancant navegador per netejar la memòria del SII...`);
        try { await page.goto('https://misiir.sii.cl/cgi_misii/siu/cgi_misii_logout', { timeout: 5000 }); } catch (err) {}
        try { await browser.close(); } catch(e) {}

        // 🔥 DESCANS CURT ENTRE LOTS
        if (i + TAMANO_LOTE < pendientes.length) {
            console.log('⏱️ Descansant 3 segons abans d\'obrir el proper navegador net...');
            await delay(3000); 
        }
    } 
    
    estadoRobot.activo = false;
    console.log('🏁 ¡PROCÉS TOTAL COMPLETAT!');

    return { ok: true, mensaje: "Lot massiu completat.", detalle: resultados };
}