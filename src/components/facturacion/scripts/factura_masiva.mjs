import puppeteer from 'puppeteer';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import pkg from 'pg'; 
import crypto from 'crypto'; 
import { encrypt } from '../../../utils/crypto.js'; // ⚠️ Ajusta tu ruta si es necesario

const { Client } = pkg;
dotenv.config();

// ==========================================
// CONFIGURACIÓN Y CONSTANTES GLOBALES
// ==========================================
const RUTA_LOG = path.join(process.cwd(), 'facturas_emitidas_nombres_log.txt'); 
const TEL_EMISOR = '56978278733'; // ⬅️ Ajustado a tu teléfono estándar

if (!fs.existsSync(RUTA_LOG)) fs.writeFileSync(RUTA_LOG, '');
const delay = (ms) => new Promise(res => setTimeout(res, ms));

async function navegarAEmision(page) {
    let exito = false;
    let intentos = 0;
    while (!exito && intentos < 5) {
        try {
            await page.goto('https://www1.sii.cl/cgi-bin/Portal001/mipeLaunchPage.cgi?OPCION=33&TIPO=4', { 
                waitUntil: 'networkidle2', 
                timeout: 30000 
            });
            exito = true; 
        } catch (error) {
            intentos++;
            console.log(`⚠️ Intento ${intentos} de acceder a Emisión falló. Reintentando...`);
            await delay(3000);
        }
    }
    if (!exito) throw new Error('No se pudo acceder al portal del SII.');
}

const limpiarYTipar = async (page, selector, texto) => {
    if (!texto) return; 
    try {
        await page.waitForSelector(selector, { visible: true, timeout: 5000 });
        await page.click(selector, { clickCount: 3 }); 
        await page.keyboard.press('Backspace');        
        await page.type(selector, texto, { delay: 50 }); 
    } catch (e) {
        console.log(`⚠️ No se pudo escribir en: ${selector}`);
    }
};

// =========================================================================
// 🚀 MOTOR DE FACTURACIÓN MASIVA (INTEGRADO CON SUPABASE)
// =========================================================================
export async function emitirLotePuppeteer(facturasFront) {
    console.log('\n==================================================');
    console.log('[INFO] AUDITORÍA: Iniciando Motor Masivo...');
    
    // 1. LECTURA DEL LOG FÍSICO (Doble seguridad)
    const logText = fs.readFileSync(RUTA_LOG, 'utf-8').toUpperCase();
    const logLineas = logText.split('\n');
    const pendientes = [];
    
    facturasFront.forEach((f) => {
        const rutCuerpo = f.rutReceptor;
        const nombrePlan = (f.producto.nombre || '').toUpperCase();
        const emitidoEnLog = logLineas.some(linea => linea.includes(rutCuerpo) && !linea.includes('FALLO') && !linea.includes('ERROR'));
        const esExclusion = nombrePlan.includes('HAMABU') || nombrePlan.includes('ANITA MARIA VEAS');

        if (!emitidoEnLog && !esExclusion) {
            pendientes.push(f);
        } else {
            console.log(`[SALTADO] RUT ${rutCuerpo} ya emitido en log o excluido.`);
        }
    });

    if (pendientes.length === 0) {
        console.log('\n[INFO] Todo procesado. No hay pendientes válidos.');
        return { ok: true, mensaje: "No hay facturas pendientes por procesar.", detalle: [] };
    }

    console.log(`\n[INFO] Iniciando para ${pendientes.length} empresas (Modo Seguro SII)...`);

    // 2. CONEXIÓN AL BÚNKER DE SUPABASE
    const client = new Client({
        user: process.env.DBS_USER,
        host: process.env.DBS_HOST,
        database: process.env.DBS_DATABASE,
        password: process.env.DBS_PASSWORD,
        port: process.env.DBS_PORT,
        ssl: { rejectUnauthorized: false }
    });
    
    await client.connect();
    console.log("🔌 PostgreSQL conectado para Lote Masivo.");

    // 3. LANZAMIENTO DEL NAVEGADOR
    const browser = await puppeteer.launch({ 
        headless: true, // Ponlo en 'false' para ver el proceso localmente
        defaultViewport: null, 
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--start-maximized', 
            '--disable-blink-features=AutomationControlled'
        ] 
    });

    const page = (await browser.pages())[0];
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    page.on('dialog', async d => await d.accept());

    const resultados = [];

    // =======================================================================
    // 🔄 CICLO DE FACTURACIÓN
    // =======================================================================
    for (let i = 0; i < pendientes.length; i++) {
        const f = pendientes[i];
        let razonSocialCapturadaDelSII = null;
        
        console.log(`\n==================================================`);
        console.log(`[INFO] FACTURANDO: RUT ${f.rutReceptor} (${i + 1}/${pendientes.length})`);

        try {
            // A. Navegar limpio al formulario
            await navegarAEmision(page);
            
            // B. Si el SII botó la sesión, nos logueamos de nuevo automáticamente
            const inputRutExiste = await page.$('#rutcntr');
            if (inputRutExiste) {
                console.log(`🔑 Restaurando sesión en el SII...`);
                await page.type('#rutcntr', `${process.env.DTE_RUT}-${process.env.DTE_DV}`, { delay: 50 });
                await page.type('#clave', process.env.DTE_PASS, { delay: 50 });
                await Promise.all([page.waitForNavigation(), page.click('#bt_ingresar')]);
                await delay(1500); 

                const selectBox = await page.$('select[name="RUT_EMP"]');
                if (selectBox) {
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
                            page.waitForNavigation({ waitUntil: 'networkidle2' }),
                            page.evaluate(() => { document.querySelector('button[type="submit"], input[type="submit"]').click(); })
                        ]);
                    }
                }
                // Recargar el formulario limpio después de loguearse
                await navegarAEmision(page); 
            }

            // C. Llenar RUT del Cliente
            await page.waitForSelector('input[name="EFXP_RUT_RECEP"], #EFXP_RUT_RECEP', { visible: true, timeout: 45000 });
            await delay(1000); 

            const rutInputSelector = await page.$('#EFXP_RUT_RECEP') ? '#EFXP_RUT_RECEP' : 'input[name="EFXP_RUT_RECEP"]';
            const dvInputSelector = await page.$('#EFXP_DV_RECEP') ? '#EFXP_DV_RECEP' : 'input[name="EFXP_DV_RECEP"]';

            await page.click(rutInputSelector);
            await page.type(rutInputSelector, f.rutReceptor, { delay: 100 }); 
            await page.keyboard.press('Tab');
            await delay(300);
            await page.type(dvInputSelector, f.dvReceptor, { delay: 100 });

            console.log('⚡ Activando AJAX del SII...');
            await page.keyboard.press('Tab');
            await page.mouse.click(10, 10);
            await delay(2000); 

            // D. Llenar datos secundarios
            await limpiarYTipar(page, 'input[name="EFXP_CIUDAD_ORIGEN"]', f.ciudadEmisor || 'Santiago');
            await limpiarYTipar(page, 'input[name="EFXP_FONO_EMISOR"]', TEL_EMISOR);
            await limpiarYTipar(page, 'input[name="EFXP_CIUDAD_RECEP"]', f.ciudadReceptor || 'Santiago');
            if (f.contactoReceptor) await limpiarYTipar(page, 'input[name="EFXP_CONTACTO"]', f.contactoReceptor);

            // E. Espía Forense (Súper Rápido 500ms)
            console.log('⏳ Extrayendo la Razón Social del RECEPTOR...');
            let nombreEncontrado = null;
            for (let j = 0; j < 6; j++) {
                nombreEncontrado = await page.evaluate(() => {
                    const inputExacto = document.querySelector('#EFXP_NMB_RECEP') || document.querySelector('input[name="EFXP_NMB_RECEP"]');
                    if (inputExacto && inputExacto.value && inputExacto.value.trim().length > 2) return inputExacto.value.trim();
                    const inputs = Array.from(document.querySelectorAll('input'));
                    for(let inp of inputs) {
                        const attr = (inp.name + ' ' + inp.id).toUpperCase();
                        if(attr.includes('RECEP') && (attr.includes('NMB') || attr.includes('SOC') || attr.includes('RZN'))) {
                            if(inp.value && inp.value.length > 2) return inp.value.trim();
                        }
                    }
                    return null;
                });

                if (nombreEncontrado) {
                    razonSocialCapturadaDelSII = nombreEncontrado;
                    console.log(`✅ Nombre capturado: "${razonSocialCapturadaDelSII}"`);
                    break; 
                }
                await delay(500); 
            }

            if (!nombreEncontrado) {
                razonSocialCapturadaDelSII = f.razonSocial || 'CLIENTE MASIVO SII';
            }

            // F. Llenar Productos
            console.log('🛍️ Ingresando detalles del producto...');
            await page.type('input[name="EFXP_NMB_01"]', f.producto.nombre || 'Servicio', { delay: 50 });
            await page.type('input[name="EFXP_QTY_01"]', '1', { delay: 50 });
            await limpiarYTipar(page, 'input[name="EFXP_PRC_01"]', String(f.producto.precio || 0));
            
            const checkbox = await page.waitForSelector('input[name="DESCRIP_01"]', { visible: true });
            await checkbox.click(); 
            try {
                await page.waitForSelector('textarea[name="EFXP_DSC_ITEM_01"]', { visible: true, timeout: 5000 });
            } catch (e) {
                await checkbox.click(); 
                await page.waitForSelector('textarea[name="EFXP_DSC_ITEM_01"]', { visible: true, timeout: 5000 });
            }
            await page.type('textarea[name="EFXP_DSC_ITEM_01"]', f.producto.descripcion || 'Servicios Contables', { delay: 50 });
            await page.select('select[name="EFXP_FMA_PAGO"]', '1'); 

            // G. Firmar
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
                    await page.waitForSelector('#myPass', { visible: true, timeout: 3500 });
                    cajaVisible = true;
                } catch (e) {
                    intentosFirma++;
                    await page.click('button[name="Button_Update"]').catch(()=> {}); 
                    await delay(2000);
                }
            }

            console.log('🔒 Firmando...');
            await page.focus('#myPass');
            await page.type('#myPass', process.env.SII_PFX_PASS, { delay: 50 });
            await delay(500); 
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
                page.evaluate(() => {
                    const btnEnviar = document.querySelector('#btnFirma');
                    if (btnEnviar) btnEnviar.click();
                })
            ]);
            
            // H. Extraer Folio
            let folio = null;
            for (let j = 0; j < 30; j++) {
                const text = await page.evaluate(() => document.body.innerText).catch(() => "");
                const match = text.match(/N[°º]\s*(\d+)/i) || text.match(/Folio\s*(\d+)/i);
                if (match) { folio = match[1]; break; }
                await delay(1000); 
            }

            if (folio) {
                console.log(`🎉 ¡ÉXITO! Folio N°: ${folio}`);
                fs.appendFileSync(RUTA_LOG, `${f.rutReceptor} - Folio: ${folio}\n`); 
                resultados.push({ rut: f.rutReceptor, nombre: razonSocialCapturadaDelSII, estado: 'exito', folio: folio });

                // ==============================================================
                // 💾 I. GUARDAR EN SUPABASE
                // ==============================================================
                let empresaIdFinal = f.empresa_id;
                const rutOriginal = `${f.rutReceptor}-${f.dvReceptor}`;

                if (empresaIdFinal === 'EXTERNO') {
                    try {
                        const rutHash = crypto.createHash('sha256').update(rutOriginal).digest('hex');
                        const rutEncrypted = encrypt(rutOriginal);
                        const insertEmpresaQuery = `
                            INSERT INTO empresa (razon_social, rut_encrypted, rut_hash, giro, regimen_tributario, activo)
                            VALUES ($1, $2, $3, 'Por definir', 'Por definir', true) RETURNING id;
                        `;
                        const resEmp = await client.query(insertEmpresaQuery, [razonSocialCapturadaDelSII, rutEncrypted, rutHash]);
                        empresaIdFinal = resEmp.rows[0].id;
                        console.log(`✅ Cliente Externo auto-creado en BD.`);
                    } catch (err) { empresaIdFinal = null; }
                }

                if (empresaIdFinal) {
                    try {
                        const checkQuery = `SELECT id FROM documentos_emitidos WHERE rut_cliente = $1 AND tipo_dte = 33 AND folio = $2`;
                        const checkRes = await client.query(checkQuery, [rutOriginal, folio]);
                        if (checkRes.rows.length === 0) {
                            await client.query(`
                                INSERT INTO documentos_emitidos (empresa_id, rut_cliente, tipo_dte, folio, monto_neto, fecha_emision)
                                VALUES ($1, $2, 33, $3, $4, $5)
                            `, [empresaIdFinal, rutOriginal, folio, parseInt(f.producto.precio), new Date().toISOString()]);
                            console.log(`✅ Guardado en Bóveda Historial.`);
                        }
                    } catch (dbErr) {}
                }

            } else {
                throw new Error("No se detectó el folio en pantalla.");
            }

        } catch (e) {
            console.log(`[ERROR] Falla en ${f.rutReceptor}: ${e.message}`);
            fs.appendFileSync(RUTA_LOG, `FALLO: ${f.rutReceptor} - ${f.producto.nombre || ''}\n`);
            resultados.push({ rut: f.rutReceptor, estado: 'error', error: e.message });
        }
        
        // Pausa Antiban del SII solo si NO es el último registro
        if (i < pendientes.length - 1) {
            console.log('[INFO] ⏱️ Pausa de seguridad de 30s para no bloquear el certificado...');
            await delay(30000);
        }
    }
    
    console.log('\n[INFO] Cerrando sesión y BD...');
    try { await page.goto('https://misiir.sii.cl/cgi_misii/siu/cgi_misii_logout', { timeout: 5000 }); } catch (err) {}
    await browser.close();
    await client.end();

    return { ok: true, mensaje: "Lote procesado", detalle: resultados };
}