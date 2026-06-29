import puppeteer from 'puppeteer';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import pkg from 'pg'; 
import crypto from 'crypto'; 
import { encrypt } from '../../../utils/crypto.js';
import { enviarCorreoFacturaEnSesion } from './revisar para envios/mensajes_facturador_masivo.mjs';

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

// 👁️ Modo visible: false = ves el navegador en pantalla (para depurar).
//    true = oculto en segundo plano (menos recursos). Sigues el avance por la terminal.
const HEADLESS = true;

if (!fs.existsSync(RUTA_LOG)) fs.writeFileSync(RUTA_LOG, '');
const delay = (ms) => new Promise(res => setTimeout(res, ms));

// Espera a que el SII deje de navegar (drena cadenas de redirección internas).
// Evita el error "Execution context was destroyed" al tocar el DOM justo cuando
// el SII redirige (p.ej. tras volver del portal de emitidos a emisión).
const esperarEstable = async (page) => {
    for (let i = 0; i < 6; i++) {
        try {
            // Si hay una navegación en curso, la esperamos; si encadena otra, repetimos.
            await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 2000 });
            await delay(400);
        } catch (e) {
            break; // Timeout = no hubo más navegaciones => página estable.
        }
    }
    await delay(500);
};

// page.$ a prueba de redirecciones: si el contexto se destruye por una navegación,
// espera y reintenta en vez de reventar.
const buscarSelectorSeguro = async (page, selector, intentos = 4) => {
    for (let i = 0; i < intentos; i++) {
        try {
            return await page.$(selector);
        } catch (e) {
            if (/Execution context was destroyed|Target closed|Cannot find context|detached/i.test(e.message)) {
                await delay(1500);
                continue;
            }
            throw e;
        }
    }
    return null;
};

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

    // 🔧 Dejamos que el SII termine cualquier redirección interna antes de tocar el DOM.
    await esperarEstable(page);
}

const limpiarYTipar = async (page, selector, texto) => {
    if (!texto || estadoRobot.cancelar) return;
    try {
        // Esperamos a que el campo exista (no exigimos "visible": tras el Tab del RUT
        // el SII re-renderiza el formulario y a veces el campo aún no está pintado).
        await page.waitForSelector(selector, { timeout: 8000 });

        // Lo traemos al centro de la pantalla por si quedó fuera de vista.
        await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (el) el.scrollIntoView({ block: 'center' });
        }, selector).catch(() => {});
        await delay(300);

        // Intento normal: click + limpiar + escribir.
        try {
            await page.click(selector, { clickCount: 3 });
            await page.keyboard.press('Backspace');
            await page.type(selector, texto, { delay: 120 });
        } catch (eClick) {
            // Respaldo: si no se pudo tipear (campo tapado/no enfocable),
            // escribimos el valor directo por DOM y disparamos los eventos.
            await page.evaluate((sel, val) => {
                const el = document.querySelector(sel);
                if (el) {
                    el.value = val;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, selector, texto);
        }
    } catch (e) {
        console.log(`⚠️ No se pudo limpiar/escribir en: ${selector} (se reintentará antes de validar)`);
    }
};

// 🔒 Garantiza que un campo OBLIGATORIO tenga valor. Si está vacío, lo escribe
// directo por DOM (instantáneo, sin depender de timing ni visibilidad). Devuelve
// true si quedó con valor. Clave para Ciudad/Teléfono del emisor, que el SII exige
// para poder "Validar y visualizar" (sin ellos no aparece el botón de firmar).
const asegurarCampo = async (page, selector, valor) => {
    if (!valor) return true;
    try {
        await page.waitForSelector(selector, { timeout: 8000 });
        return await page.evaluate((sel, val) => {
            const el = document.querySelector(sel);
            if (!el) return false;
            if (!el.value || String(el.value).trim() === '') {
                el.scrollIntoView({ block: 'center' });
                el.focus();
                el.value = val;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('blur', { bubbles: true }));
            }
            return !!el.value && String(el.value).trim() !== '';
        }, selector, valor);
    } catch (e) {
        return false;
    }
};

// 🔄 Espera el formulario de emisión COMPLETO. Si carga a medias (falta el RUT
// receptor o los campos del emisor), REFRESCA la página (F5) sin cerrar sesión y
// reintenta. El HARD RESET (logout + navegador nuevo) queda solo como último recurso.
const esperarFormularioEmision = async (page, maxRefrescos = 3) => {
    for (let intento = 0; intento <= maxRefrescos; intento++) {
        if (estadoRobot.cancelar) throw new Error("Operación cancelada por el usuario.");

        // 1) ¿Está el campo principal (RUT del receptor)?
        let rutOk = false;
        try {
            await page.waitForSelector('input[name="EFXP_RUT_RECEP"], #EFXP_RUT_RECEP', { visible: true, timeout: 15000 });
            rutOk = true;
        } catch (e) { rutOk = false; }

        if (rutOk) {
            // 2) ¿Está completa la sección del emisor (Ciudad y Teléfono)?
            const emisorOk = await page.evaluate(() =>
                !!document.querySelector('input[name="EFXP_CIUDAD_ORIGEN"]') &&
                !!document.querySelector('input[name="EFXP_FONO_EMISOR"]')
            ).catch(() => false);

            // Si está completo (o ya agotamos los refrescos), seguimos.
            if (emisorOk || intento >= maxRefrescos) return true;
            console.log(`🔄 [REFRESCO ${intento + 1}/${maxRefrescos}] Formulario a medias (faltan campos del emisor). Refrescando la página SIN cerrar sesión...`);
        } else {
            console.log(`🔄 [REFRESCO ${intento + 1}/${maxRefrescos}] El formulario no cargó (RUT receptor ausente). Refrescando la página SIN cerrar sesión...`);
        }

        // 3) Refrescar (F5) sin desloguear. Si el reload falla, reponemos la URL de emisión.
        try {
            await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
        } catch (eReload) {
            await navegarAEmision(page).catch(() => {});
        }
        await esperarEstable(page);
        await delay(2500);
    }
    return false; // ni con refrescos cargó => el caller hará HARD RESET como último recurso
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

        // 📧 Folios emitidos en ESTE lote (se envían los correos al cerrar el lote,
        // NO entre factura y factura, para no inestabilizar la sesión de emisión).
        const correosBatch = [];

        console.log(`\n📦 INICIANDO LOTE DE FACTURAS (Procesando del ${i + 1} al ${Math.min(i + loteActual.length, pendientes.length)} de ${pendientes.length})`);

        // 🔥 OBRIM NAVEGADOR
        let browser = await puppeteer.launch({ 
            headless: HEADLESS, 
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
                    let yaNavegado = false;

                    // 🔄 EN UN REINTENTO: primero intentamos REFRESCAR el portal de emisión
                    // (volver a la URL OPCION=33) SIN cerrar sesión. Esto resuelve la mayoría
                    // de los errores (formulario a medias, 404, navegación rara). El HARD RESET
                    // (cerrar sesión + navegador nuevo) queda SOLO si la página quedó muerta.
                    if (intentoRealizado > 1) {
                        const pageViva = page && !page.isClosed();
                        if (pageViva) {
                            try {
                                console.log('🔄 [REFRESCO] Recargando el portal de emisión SIN cerrar sesión...');
                                await navegarAEmision(page);   // goto a https://...mipeLaunchPage.cgi?OPCION=33&TIPO=4
                                yaNavegado = true;
                            } catch (eSoft) {
                                console.log(`⚠️ [REFRESCO] La página no respondió (${eSoft.message}).`);
                            }
                        }

                        // Solo si el refresco no funcionó (página muerta/detached) hacemos HARD RESET.
                        if (!yaNavegado) {
                            console.log('🔄 [HARD RESET] Página inutilizable. Cerrando sesión y abriendo navegador nuevo...');
                            try { await cerrarSesionSII(page, browser); } catch (e) {}
                            await delay(2000);

                            browser = await puppeteer.launch({
                                headless: HEADLESS,
                                defaultViewport: null,
                                args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized', '--disable-blink-features=AutomationControlled']
                            });
                            page = (await browser.pages())[0];
                            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
                            page.on('dialog', async d => await d.accept());
                        }
                    } else if (i > 0 && j === 0) {
                        // Netejador preventiu només al primer intent del lot (si no és el primer lot)
                        try {
                            console.log('🔄 Borrando la caché visual...');
                            await page.goto('about:blank');
                            await delay(1000);
                        } catch(e) {}
                    }

                    if (!yaNavegado) {
                        console.log('🔄 Cargando portal de emisión...');
                        await navegarAEmision(page);
                    }
                    if (estadoRobot.cancelar) throw new Error("Operación cancelada por el usuario.");
                    await delay(2000);
                    
                    // ============================================================
                    // 1. 🔥 VALIDAR LOGIN
                    // ============================================================
                    let loginCompletado = false;
                    let intentosLogin = 0;

                    while (!loginCompletado && intentosLogin < 3 && !estadoRobot.cancelar) {
                        const inputRutExiste = await buscarSelectorSeguro(page, '#rutcntr');
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

                                const sigueEnLogin = await buscarSelectorSeguro(page, '#rutcntr');
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

                    console.log('⏳ Página cargada. Esperando que aparezca el formulario...');
                    await delay(3000);

                    // 🔄 Si el formulario carga a medias, REFRESCA la página (no cierra sesión).
                    const formListo = await esperarFormularioEmision(page, 3);
                    if (!formListo) throw new Error("El formulario de emisión no cargó ni tras refrescar la página (EFXP_RUT_RECEP ausente).");
                    await delay(1000);

                    const rutInputSelector = await page.$('#EFXP_RUT_RECEP') ? '#EFXP_RUT_RECEP' : 'input[name="EFXP_RUT_RECEP"]';
                    const dvInputSelector = await page.$('#EFXP_DV_RECEP') ? '#EFXP_DV_RECEP' : 'input[name="EFXP_DV_RECEP"]';

                    console.log(`   ✍️  Escribiendo RUT del receptor ${f.rutReceptor}-${f.dvReceptor}...`);
                    await page.click(rutInputSelector);
                    await page.type(rutInputSelector, f.rutReceptor, { delay: 150 });
                    await page.keyboard.press('Tab');
                    await delay(300);
                    await page.type(dvInputSelector, f.dvReceptor, { delay: 150 });
                    await page.keyboard.press('Tab');
                    await page.mouse.click(10, 10);

                    // 🕒 CLAVE: al validar el RUT del receptor, el SII RECARGA el formulario
                    // (postback). Si tocamos el DOM mientras recarga → "Execution context destroyed".
                    // Esperamos a que esa recarga termine ANTES de seguir.
                    console.log('   ⏳ Esperando que el SII termine de validar el RUT (posible recarga)...');
                    await delay(1200);
                    await esperarEstable(page);
                    await delay(1500);

                    console.log('   🏙️  Rellenando datos del emisor (ciudad, teléfono) y receptor...');
                    await limpiarYTipar(page, 'input[name="EFXP_CIUDAD_ORIGEN"]', f.ciudadEmisor || 'Santiago');
                    await limpiarYTipar(page, 'input[name="EFXP_FONO_EMISOR"]', TEL_EMISOR);
                    await limpiarYTipar(page, 'input[name="EFXP_CIUDAD_RECEP"]', f.ciudadReceptor || 'Santiago');
                    if (f.contactoReceptor) await limpiarYTipar(page, 'input[name="EFXP_CONTACTO"]', f.contactoReceptor);

                    let nombreEncontrado = null;
                    for (let k = 0; k < 8; k++) {
                        try {
                            nombreEncontrado = await page.evaluate(() => {
                                // 🔥 El SII usa EFXP_RZN_SOC_RECEP para la Razón Social
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
                        } catch (eEval) {
                            // Si el SII recargó (contexto destruido), esperamos a que se estabilice y reintentamos.
                            await esperarEstable(page);
                            await delay(500);
                            continue;
                        }

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

                    console.log(`   📝 Escribiendo producto "${f.producto.nombre || 'Servicio'}" por $${f.producto.precio || 0}...`);
                    await page.type('input[name="EFXP_NMB_01"]', f.producto.nombre || 'Servicio', { delay: 150 });
                    await page.type('input[name="EFXP_QTY_01"]', '1', { delay: 150 });
                    await limpiarYTipar(page, 'input[name="EFXP_PRC_01"]', String(f.producto.precio || 0));

                    const checkbox = await page.waitForSelector('input[name="DESCRIP_01"]', { visible: true });
                    await checkbox.click(); 
                    try { await page.waitForSelector('textarea[name="EFXP_DSC_ITEM_01"]', { visible: true, timeout: 5000 }); } catch (e) { await checkbox.click(); }
                    await page.type('textarea[name="EFXP_DSC_ITEM_01"]', f.producto.descripcion || 'Servicios Contables', { delay: 150 });
                    await page.select('select[name="EFXP_FMA_PAGO"]', '1');

                    if (estadoRobot.cancelar) throw new Error("Operación cancelada por el usuario.");

                    // 🔒 GARANTIZAR CAMPOS OBLIGATORIOS DEL EMISOR antes de validar.
                    // El SII exige Ciudad y Teléfono del emisor; si quedan vacíos, "Validar y
                    // visualizar" no avanza y la firma nunca aparece (causa real del cuelgue).
                    const ciudadOk = await asegurarCampo(page, 'input[name="EFXP_CIUDAD_ORIGEN"]', f.ciudadEmisor || 'Santiago');
                    const fonoOk = await asegurarCampo(page, 'input[name="EFXP_FONO_EMISOR"]', TEL_EMISOR);
                    await asegurarCampo(page, 'input[name="EFXP_CIUDAD_RECEP"]', f.ciudadReceptor || 'Santiago');
                    if (!ciudadOk || !fonoOk) {
                        console.log(`⚠️ [VALIDACIÓN] Campos del emisor: Ciudad=${ciudadOk ? 'OK' : 'VACÍA'} | Teléfono=${fonoOk ? 'OK' : 'VACÍO'}`);
                    }

                    console.log('   🔍 Clic en "Validar y visualizar"...');
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
                    const MAX_FIRMA = 6;
                    while (intentosFirma < MAX_FIRMA && !cajaVisible && !estadoRobot.cancelar) {
                        try {
                            // 1) Esperamos a que el botón de firmar EXISTA (la vista previa del SII puede tardar).
                            await page.waitForSelector('input[name="btnSign"]', { timeout: 12000 });

                            // 2) Lo clickeamos solo si NO está deshabilitado.
                            const clickHecho = await page.evaluate(() => {
                                const btn = document.querySelector('input[name="btnSign"]');
                                if (btn && !btn.disabled) { btn.click(); return true; }
                                return false;
                            });
                            if (!clickHecho) throw new Error("btnSign presente pero deshabilitado");

                            // 3) Esperamos la caja de la clave.
                            await page.waitForSelector('#myPass', { visible: true, timeout: 10000 });
                            cajaVisible = true;
                            console.log('   ✅ Vista previa OK, caja de firma lista.');
                        } catch (e) {
                            intentosFirma++;

                            // 🔎 Capturamos por qué el SII no muestra la firma (mensaje de validación visible).
                            const motivoSII = await page.evaluate(() => {
                                const txt = document.body.innerText || '';
                                const m = txt.match(/(debe ingresar|obligatori[oa]|es requerido|inv[aá]lid[oa]|no es v[aá]lido|falta[n]? )[^\n]{0,90}/i);
                                return m ? m[0].trim() : '';
                            }).catch(() => '');

                            console.log(`⚠️ [Intento Firma ${intentosFirma}/${MAX_FIRMA}] No apareció la caja de firma.${motivoSII ? ` Posible causa SII: "${motivoSII}"` : ''}`);

                            // Regeneramos la vista previa SOLO cada 2 intentos (re-clickear siempre la reinicia).
                            if (intentosFirma % 2 === 0) {
                                await page.click('button[name="Button_Update"]').catch(() => {});
                            }
                            await delay(2500);
                        }
                    }

                    if (estadoRobot.cancelar) throw new Error("Operación cancelada por el usuario.");
                    if (!cajaVisible) {
                        // 📸 Guardamos una captura para ver exactamente qué mostró el SII.
                        try {
                            const rutaShot = path.join(process.cwd(), `firma_fallida_${f.rutReceptor}.png`);
                            await page.screenshot({ path: rutaShot, fullPage: true });
                            console.log(`📸 [DIAGNÓSTICO] Captura del SII guardada en: ${rutaShot}`);
                        } catch (eShot) {}
                        throw new Error("El SII no cargó la caja para la clave digital (input[name='btnSign'] no detectado o pegado).");
                    }

                    console.log('   🔑 Ingresando clave de firma...');
                    await page.focus('#myPass');
                    await page.type('#myPass', process.env.SII_PFX_PASS, { delay: 150 });
                    await delay(1000);

                    console.log('   📤 Enviando factura al SII (firmando)...');
                    await Promise.all([
                        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
                        page.evaluate(() => {
                            const btnEnviar = document.querySelector('#btnFirma');
                            if (btnEnviar) btnEnviar.click();
                        })
                    ]);

                    console.log('   🔎 Buscando el número de folio en la respuesta del SII...');
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

                        // ==============================================================
                        // 📧 Guardamos el folio + datos para enviar el correo al CERRAR
                        // el lote (no entre facturas, para no inestabilizar la sesión).
                        // ==============================================================
                        const dc = f.datosCorreo || {};
                        correosBatch.push({
                            folio: String(folio),
                            datos: {
                                razonSocial: razonSocialCapturadaDelSII || dc.razonSocial || '',
                                rut: `${f.rutReceptor}-${f.dvReceptor}`,
                                correo: f.contactoReceptor || '',
                                planContable: dc.planContable || f.producto?.nombre || '',
                                neto: dc.neto || f.producto?.precio || '',
                                bruto: dc.bruto || '',
                                compras: dc.compras || '',
                                ventas: dc.ventas || '',
                                totalFacturacion: dc.totalFacturacion || '',
                                tramo: dc.tramo || '',
                                trabajadores: dc.trabajadores || ''
                            }
                        });

                    } else {
                        throw new Error("No se detectó el folio.");
                    }

                } catch (e) {
                    console.log(`❌ [ERROR] Intento ${intentoRealizado} falló en ${f.rutReceptor}: ${e.message}`);
                    
                    if (estadoRobot.cancelar || intentoRealizado >= MAX_INTENTOS) {
                        if(!estadoRobot.cancelar) {
                             console.log(`🚫 Se agotaron los 3 reintentos. Saltando a la siguiente factura.`);
                             fs.appendFileSync(RUTA_LOG, `FALLO: ${f.rutReceptor} - ${f.producto.nombre || ''}\n`);
                             
                             // 🔥 APLICANDO TU LÓGICA DE CIERRE DE SESIÓN ENTRE FACTURAS
                             if (j < loteActual.length - 1) {
                                 console.log('🔄 [RESETEO POST-FALLO] Cerrando sesión y preparando navegador limpio para la siguiente factura...');
                                 
                                 if (page && !page.isClosed()) {
                                     try { await page.goto('https://misiir.sii.cl/cgi_misii/siu/cgi_misii_logout', { timeout: 5000 }); } catch (errLogout) {}
                                 }
                                 if (browser) {
                                     await browser.close();
                                 }
                                 
                                 await delay(2000);
                                 
                                 // Levantamos un navegador nuevo para que la siguiente empresa empiece desde cero
                                 browser = await puppeteer.launch({ 
                                     headless: HEADLESS, 
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

        // =======================================================================
        // 📧 ENVÍO DE CORREOS DEL LOTE (reusando la MISMA sesión)
        // Recién ahora que YA emitimos las facturas del lote, mandamos los correos.
        // Así no interrumpimos la emisión entre una factura y otra (que era lo que
        // botaba la sesión y obligaba al HARD RESET).
        // =======================================================================
        // ⚠️ Enviamos los correos AUNQUE hayan detenido el robot: esas facturas YA se
        // emitieron, así que el cliente debe recibir su correo igual.
        if (correosBatch.length > 0) {
            console.log(`\n📧 [CORREOS LOTE] Enviando ${correosBatch.length} correo(s) de las facturas emitidas${estadoRobot.cancelar ? ' (antes de detener)' : ''}...`);
            for (const item of correosBatch) {
                try {
                    console.log(`📧 [CORREO] Folio ${item.folio}...`);
                    await enviarCorreoFacturaEnSesion(page, item.folio, item.datos);
                } catch (errCorreo) {
                    console.log(`⚠️ [CORREO] Falló el correo del Folio ${item.folio}: ${errCorreo.message}`);
                }
            }
            console.log('✅ [CORREOS LOTE] Correos del lote procesados.');
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