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
    cancelar: false, // 🔥 NUEVO: Bandera de cancelación
    total: 0,
    actual: 0,
    rutActual: "",
    exitos: 0,
    errores: 0
};

// 🔥 NUEVO: Función para apretar el botón de pánico desde afuera
export function detenerRobot() {
    estadoRobot.cancelar = true;
    console.log('\n🛑 [SEÑAL DE ABORTO] Se ha ordenado detener el robot. Abortando de forma segura...');
}

const RUTA_LOG = path.join(process.cwd(), 'facturas_emitidas_nombres_log.txt'); 
const TEL_EMISOR = '56978278733'; 

if (!fs.existsSync(RUTA_LOG)) fs.writeFileSync(RUTA_LOG, '');
const delay = (ms) => new Promise(res => setTimeout(res, ms));

async function navegarAEmision(page) {
    let exito = false;
    let intentos = 0;
    while (!exito && intentos < 5) {
        if (estadoRobot.cancelar) throw new Error("Operación cancelada por el usuario."); // Freno de emergencia
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
    if (!texto || estadoRobot.cancelar) return; 
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
// 🔒 CIERRE DE SESIÓN ROBUSTO DEL SII
// =========================================================================
// Garantiza que la sesión del SII se cierre SIEMPRE antes de matar el navegador.
// Si el logout HTTP falla, limpia cookies/storage y fuerza el cierre del proceso.
// =========================================================================
async function cerrarSesionSII(page, browser) {
    console.log('🔒 [LOGOUT] Iniciando cierre de sesión seguro del SII...');
    
    // Intento 1: URL oficial de logout
    try {
        await page.goto('https://misiir.sii.cl/cgi_misii/siu/cgi_misii_logout', { 
            waitUntil: 'domcontentloaded', 
            timeout: 10000 
        });
        await delay(2000);
        console.log('✅ [LOGOUT] Sesión cerrada vía URL oficial.');
    } catch (e1) {
        console.log(`⚠️ [LOGOUT] URL oficial falló: ${e1.message}. Probando alternativa...`);
        
        // Intento 2: URL alternativa de logout del SII
        try {
            await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/CerrarSesion.html', { 
                waitUntil: 'domcontentloaded', 
                timeout: 10000 
            });
            await delay(2000);
            console.log('✅ [LOGOUT] Sesión cerrada vía URL alternativa.');
        } catch (e2) {
            console.log(`⚠️ [LOGOUT] URL alternativa también falló: ${e2.message}`);
        }
    }
    
    // Limpieza extra: borrar cookies y storage para que no quede sesión "fantasma"
    try {
        const client = await page.target().createCDPSession();
        await client.send('Network.clearBrowserCookies');
        await client.send('Network.clearBrowserCache');
        await page.evaluate(() => {
            try { localStorage.clear(); } catch(e) {}
            try { sessionStorage.clear(); } catch(e) {}
        }).catch(() => {});
        console.log('🧹 [LOGOUT] Cookies, caché y storage limpiados.');
    } catch (e) {
        console.log(`⚠️ [LOGOUT] No se pudo limpiar cookies: ${e.message}`);
    }
    
    // Cierre final del navegador (con timeout de seguridad)
    try {
        await Promise.race([
            browser.close(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout cerrando browser')), 8000))
        ]);
        console.log('🔐 [LOGOUT] Navegador cerrado correctamente.');
    } catch (e) {
        console.log(`⚠️ [LOGOUT] Cierre forzado del navegador: ${e.message}`);
        try {
            // Última opción: matar el proceso del navegador a la fuerza
            const proceso = browser.process();
            if (proceso) proceso.kill('SIGKILL');
            console.log('💀 [LOGOUT] Navegador terminado a la fuerza (SIGKILL).');
        } catch (killErr) {
            console.log(`❌ [LOGOUT] No se pudo matar el proceso: ${killErr.message}`);
        }
    }
}

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

    // INICIALIZAR EL RASTREADOR LIMPIO
    estadoRobot.activo = true;
    estadoRobot.cancelar = false; // 🔥 Aseguramos que empiece sin orden de cancelar
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
        if (estadoRobot.cancelar) break; // 🔥 SI APRETARON EL BOTÓN, SALIMOS DEL CICLO MAYOR

        const loteActual = pendientes.slice(i, i + TAMANO_LOTE);
        
        console.log(`\n📦 INICIANDO LOTE DE FACTURAS (Procesando del ${i + 1} al ${Math.min(i + loteActual.length, pendientes.length)} de ${pendientes.length})`);

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
            if (estadoRobot.cancelar) break; // 🔥 SI APRETARON EL BOTÓN, SALIMOS DEL CICLO MENOR
            
            const f = loteActual[j];
            const indiceGlobal = i + j + 1; 
            
            estadoRobot.actual = indiceGlobal;
            estadoRobot.rutActual = f.rutReceptor;

            let intentoRealizado = 0;
            const MAX_INTENTOS = 3;
            let facturaCompletada = false;

            while (intentoRealizado < MAX_INTENTOS && !facturaCompletada && !estadoRobot.cancelar) {
                intentoRealizado++;
                let razonSocialCapturadaDelSII = null;

                console.log(`\n==================================================`);
                console.log(`[INFO] FACTURANDO: RUT ${f.rutReceptor} (Intento ${intentoRealizado}/${MAX_INTENTOS}) | Progreso Global: ${indiceGlobal}/${pendientes.length}`);

                try {
                    // Si és un reintent, matamos el navegador i n'obrim un de nou completament fresc (Hard Reset)
                    if (intentoRealizado > 1) {
                        console.log('🔄 [HARD RESET] Cerrando sesión SII y navegador para desatascar...');
                        await cerrarSesionSII(page, browser);
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
                            console.log('🔄 Borrando la caché visual...');
                            await page.goto('about:blank'); 
                            await delay(1000);
                        } catch(e) {}
                    }

                    console.log('🔄 Cargando portal de emisión...');
                    await navegarAEmision(page);
                    if (estadoRobot.cancelar) throw new Error("Operación cancelada por el usuario.");
                    await delay(2000);
                    
                    // ============================================================
                    // 1. 🔥 VALIDAR LOGIN
                    // ============================================================
                    let loginCompletado = false;
                    let intentosLogin = 0;

                    while (!loginCompletado && intentosLogin < 3 && !estadoRobot.cancelar) {
                        const inputRutExiste = await page.$('#rutcntr');
                        if (inputRutExiste) {
                            intentosLogin++;
                            console.log(`🔑 [Intento Login ${intentosLogin}/3] Iniciando sesión en el SII...`);
                            
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
                                if (sigueEnLogin) throw new Error("Rebotó de nuevo al login.");

                                loginCompletado = true;
                            } catch (errLogin) {
                                console.log(`⚠️ El login falló. Volviendo a intentar...`);
                                await navegarAEmision(page);
                                await delay(3000); 
                            }
                        } else {
                            loginCompletado = true; 
                        }
                    }

                    if (estadoRobot.cancelar) throw new Error("Operación cancelada por el usuario.");
                    if (!loginCompletado) throw new Error("El SII no permitió iniciar sesión después de 3 intentos.");

                    // 2. Validar Empresa Emisora
                    const selectBox = await page.$('select[name="RUT_EMP"]');
                    if (selectBox) {
                        console.log('🏢 Seleccionando empresa emisora...');
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

                    if (estadoRobot.cancelar) throw new Error("Operación cancelada por el usuario.");

                    console.log('⏳ Página cargada. Esperando 5 segundos antes de tipear la factura...');
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
                    for (let k = 0; k < 8; k++) {
                        nombreEncontrado = await page.evaluate(() => {
                            // 🔥 CORRECCIÓN: El SII usa EFXP_RZN_SOC_RECEP para la Razón Social
                            // (EFXP_NMB_RECEP no existe en el formulario actual del SII)
                            const inputRazonSocial = 
                                document.querySelector('#EFXP_RZN_SOC_RECEP') || 
                                document.querySelector('input[name="EFXP_RZN_SOC_RECEP"]');
                            
                            if (inputRazonSocial && inputRazonSocial.value && inputRazonSocial.value.trim().length > 2) {
                                return inputRazonSocial.value.trim();
                            }
                            
                            // Fallback secundario: por si en algún caso usan el nombre antiguo
                            const inputNombre = 
                                document.querySelector('#EFXP_NMB_RECEP') || 
                                document.querySelector('input[name="EFXP_NMB_RECEP"]');
                            
                            if (inputNombre && inputNombre.value && inputNombre.value.trim().length > 2) {
                                return inputNombre.value.trim();
                            }
                            
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
                       console.log(`⚠️ [ADVERTENCIA] No se pudo leer la Razón Social del SII. Usando fallback.`);
                    } else {
                       console.log(`🎯 [RAZÓN SOCIAL EXTRAÍDA DEL SII]: "${razonSocialCapturadaDelSII}"`);
                    }
                    
                    console.log(`✅ [RAZÓN SOCIAL A GUARDAR EN BD]: "${razonSocialCapturadaDelSII}"`);

                    await page.type('input[name="EFXP_NMB_01"]', f.producto.nombre || 'Servicio', { delay: 150 });
                    await page.type('input[name="EFXP_QTY_01"]', '1', { delay: 150 });
                    await limpiarYTipar(page, 'input[name="EFXP_PRC_01"]', String(f.producto.precio || 0));
                    
                    const checkbox = await page.waitForSelector('input[name="DESCRIP_01"]', { visible: true });
                    await checkbox.click(); 
                    try { await page.waitForSelector('textarea[name="EFXP_DSC_ITEM_01"]', { visible: true, timeout: 5000 }); } catch (e) { await checkbox.click(); }
                    await page.type('textarea[name="EFXP_DSC_ITEM_01"]', f.producto.descripcion || 'Servicios Contables', { delay: 150 });
                    await page.select('select[name="EFXP_FMA_PAGO"]', '1'); 

                    if (estadoRobot.cancelar) throw new Error("Operación cancelada por el usuario.");

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
                    while (intentosFirma < 5 && !cajaVisible && !estadoRobot.cancelar) {
                        try {
                            await page.evaluate(() => {
                                const btn = document.querySelector('input[name="btnSign"]');
                                if (btn && !btn.disabled) btn.click();
                            });
                            // 🔥 Se reduce el tiempo de espera y si falla lanza error que atrapará el CATCH y hará HARD RESET
                            await page.waitForSelector('#myPass', { visible: true, timeout: 6000 });
                            cajaVisible = true;
                        } catch (e) {
                            intentosFirma++;
                            console.log(`⚠️ [Intento Firma ${intentosFirma}/5] Botón no encontrado o bloqueado...`);
                            await page.click('button[name="Button_Update"]').catch(()=> {}); 
                            await delay(2000);
                        }
                    }

                    if (estadoRobot.cancelar) throw new Error("Operación cancelada por el usuario.");
                    if (!cajaVisible) throw new Error("El SII no cargó la caja para la clave digital (input[name='btnSign'] no detectado o pegado).");

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
                        if (estadoRobot.cancelar) throw new Error("Operación cancelada por el usuario.");
                        const text = await page.evaluate(() => document.body.innerText).catch(() => "");
                        const match = text.match(/N[°º]\s*(\d+)/i) || text.match(/Folio\s*(\d+)/i);
                        if (match) { folio = match[1]; break; }
                        await delay(1000); 
                    }

                    if (folio) {
                        console.log(`🎉 ¡ÉXITO! Folio N°: ${folio}`);
                        fs.appendFileSync(RUTA_LOG, `${f.rutReceptor} - Folio: ${folio}\n`); 
                        resultados.push({ rut: f.rutReceptor, nombre: razonSocialCapturadaDelSII, estado: 'exito', folio: folio });
                        
                        estadoRobot.exitos++; 
                        facturaCompletada = true; 

                        // ==============================================================
                        // 🔥 CONEXIÓN "FLASH" A SUPABASE
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
                                    console.log(`✅ Guardado en Bóveda Historial.`);
                                }
                            }
                        } catch (dbErr) {
                            console.log(`⚠️ Error de Red BD:`, dbErr.message);
                        } finally {
                            await dbClient.end(); 
                        }

                    } else {
                        throw new Error("No se detectó el folio.");
                    }

                } catch (e) {
                    console.log(`❌ [ERROR] Intento ${intentoRealizado} falló en ${f.rutReceptor}: ${e.message}`);
                    
                    if (estadoRobot.cancelar || intentoRealizado >= MAX_INTENTOS) {
                        if(!estadoRobot.cancelar) {
                             console.log(`🚫 Se agotaron los 3 reintentos. Saltando a la siguiente factura.`);
                             fs.appendFileSync(RUTA_LOG, `FALLO: ${f.rutReceptor} - ${f.producto.nombre || ''}\n`);
                             
                             // 🔥 SOLUCIÓN: Si falla definitivamente y NO es la última factura del lote actual,
                             // hacemos un Hard Reset inmediato para que la siguiente empiece limpia.
                             if (j < loteActual.length - 1) {
                                 console.log('🔄 [RESETEO POST-FALLO] Cerrando sesión y preparando navegador limpio para la siguiente factura del lote...');
                                 await cerrarSesionSII(page, browser);
                                 await delay(2000);
                                 
                                 browser = await puppeteer.launch({ 
                                     headless: true, 
                                     defaultViewport: null, 
                                     args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized', '--disable-blink-features=AutomationControlled'] 
                                 });
                                 page = (await browser.pages())[0];
                                 await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
                                 page.on('dialog', async d => await d.accept());
                             }
                        }
                        resultados.push({ rut: f.rutReceptor, estado: 'error', error: e.message });
                        estadoRobot.errores++; 
                    }
                }
            } // Fin del While de reintentos
            
            if (estadoRobot.cancelar) break; // 🔥 Salimos si cancelan

            if (j < loteActual.length - 1 && indiceGlobal < pendientes.length) {
                console.log('⏱️ Factura registrada. Enfriando conexión por 20 segundos antes de la siguiente empresa...');
                await delay(20000); 
            } else {
                 console.log('⏱️ Factura procesada. Finalizando ciclo del lote...');
                 await delay(5000); 
            }
        } 

        // 🔥 AL TERMINAR EL LOTE DE 3, CERRAMOS SESIÓN Y NAVEGADOR
        console.log(`\n🧹 [LOTE DE 3 FINALIZADO / O CANCELADO] Cerrando sesión SII y navegador...`);
        await cerrarSesionSII(page, browser);

        if (estadoRobot.cancelar) {
             console.log('🛑 [SISTEMA DETENIDO] El proceso fue abortado correctamente por el usuario.');
             break; // 🔥 Salimos del ciclo principal definitivamente
        }

        // 🔥 DESCANSO CORTO ENTRE LOTES
        if (i + TAMANO_LOTE < pendientes.length) {
            console.log('⏱️ Descansando 3 segundos antes de abrir el próximo navegador limpio...');
            await delay(3000); 
        }
    } 
    
    estadoRobot.activo = false;
    estadoRobot.cancelar = false; // Lo reseteamos para el futuro
    console.log('🏁 ¡PROCESO TOTAL FINALIZADO!');

    return { ok: true, mensaje: "Proceso concluido.", detalle: resultados };
}