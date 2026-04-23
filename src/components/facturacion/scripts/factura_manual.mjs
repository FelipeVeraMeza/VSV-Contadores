import puppeteer from 'puppeteer';
import dotenv from 'dotenv';
import pkg from 'pg'; 
import crypto from 'crypto'; 
import { encrypt } from '../../../utils/crypto.js'; // ⚠️ Ajusta tu ruta si es necesario

const { Client } = pkg;
dotenv.config();

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
// 🚀 MEGA FUNCIÓN DE FACTURACIÓN: EXTRACCIÓN + EMISIÓN + GUARDADO
// =========================================================================
export async function emitirFacturaPuppeteer(datos) {
    
    let razonSocialCapturadaDelSII = null;
    let browser, page, client;

    // 1. INICIAMOS LA CONEXIÓN A LA BASE DE DATOS
    client = new Client({
        user: process.env.DBS_USER,
        host: process.env.DBS_HOST,
        database: process.env.DBS_DATABASE,
        password: process.env.DBS_PASSWORD,
        port: process.env.DBS_PORT,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log("🔌 Búnker PostgreSQL conectado para facturación.");

        // 2. LANZAR NAVEGADOR
        browser = await puppeteer.launch({ 
            headless: true, // 👁️ Ponlo en 'false' si quieres ver el proceso en tu pantalla
            defaultViewport: null, 
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--start-maximized', 
                '--disable-blink-features=AutomationControlled'
            ] 
        });

        page = await browser.newPage();
        console.log('>>> Iniciando Robot de Facturación Inteligente...');

        // =======================================================================
        // 3. LOGIN EN EL SII
        // =======================================================================
        await navegarAEmision(page);
        const inputRutExiste = await page.$('#rutcntr');
        if (inputRutExiste) {
            console.log(`🔑 Entrando al SII con RUT: ${process.env.DTE_RUT}`);
            await page.type('#rutcntr', `${process.env.DTE_RUT}-${process.env.DTE_DV}`, { delay: 50 });
            await page.type('#clave', process.env.DTE_PASS, { delay: 50 });
            await Promise.all([page.waitForNavigation(), page.click('#bt_ingresar')]);
            await delay(1500); 

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
                        page.waitForNavigation({ waitUntil: 'networkidle2' }),
                        page.evaluate(() => { document.querySelector('button[type="submit"], input[type="submit"]').click(); })
                    ]);
                }
            }
        }

        // =======================================================================
        // 4. INGRESAR RUT DEL CLIENTE Y LANZAR AJAX (Tus tiempos exactos)
        // =======================================================================
        console.log(`📝 Escribiendo RUT del cliente: ${datos.rutReceptor}-${datos.dvReceptor}`);
        await navegarAEmision(page); 
        
        await page.waitForSelector('input[name="EFXP_RUT_RECEP"], #EFXP_RUT_RECEP', { visible: true, timeout: 45000 });
        await delay(1000); 

        const rutInputSelector = await page.$('#EFXP_RUT_RECEP') ? '#EFXP_RUT_RECEP' : 'input[name="EFXP_RUT_RECEP"]';
        const dvInputSelector = await page.$('#EFXP_DV_RECEP') ? '#EFXP_DV_RECEP' : 'input[name="EFXP_DV_RECEP"]';

        await page.click(rutInputSelector);
        await page.type(rutInputSelector, datos.rutReceptor, { delay: 100 }); 
        await page.keyboard.press('Tab');
        await delay(300);
        await page.type(dvInputSelector, datos.dvReceptor, { delay: 100 });

        console.log('⚡ Simulando movimiento humano para activar el AJAX del SII...');
        await page.keyboard.press('Tab');
        await page.mouse.click(10, 10);

        // =======================================================================
        // 5. LLENAR DATOS SECUNDARIOS MIENTRAS SII PIENSA
        // =======================================================================
        console.log('⏩ Llenando datos secundarios mientras el SII busca...');
        await delay(2000); 
        
        await limpiarYTipar(page, 'input[name="EFXP_CIUDAD_ORIGEN"]', datos.ciudadEmisor || 'Santiago');
        await limpiarYTipar(page, 'input[name="EFXP_FONO_EMISOR"]', datos.telefonoEmisor || '56978278733');
        await limpiarYTipar(page, 'input[name="EFXP_CIUDAD_RECEP"]', datos.ciudadReceptor || 'Santiago');
        if (datos.contactoReceptor) await limpiarYTipar(page, 'input[name="EFXP_CONTACTO"]', datos.contactoReceptor);
        
        if (datos.rutSolicita && datos.dvSolicita) {
            await limpiarYTipar(page, 'input[name="EFXP_RUT_SOLICITA"]', datos.rutSolicita);
            await limpiarYTipar(page, 'input[name="EFXP_DV_SOLICITA"]', datos.dvSolicita);
        }

        // =======================================================================
        // 6. EXTRACCIÓN DE LA RAZÓN SOCIAL DEL RECEPTOR
        // =======================================================================
        console.log('⏳ Extrayendo la Razón Social del RECEPTOR...');
        
        let nombreEncontrado = null;
        for (let i = 0; i < 15; i++) {
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

                const tds = Array.from(document.querySelectorAll('td, th, span, div, label'));
                let enSeccionReceptor = false;
                for (let j = 0; j < tds.length; j++) {
                    const txt = tds[j].innerText ? tds[j].innerText.toUpperCase().trim() : '';
                    if (txt.includes('DATOS RECEPTOR') || txt.includes('DATOS DEL RECEPTOR')) enSeccionReceptor = true;
                    if (enSeccionReceptor && (txt === 'RAZÓN SOCIAL' || txt === 'RAZON SOCIAL')) {
                        let nextEl = tds[j].nextElementSibling || (tds[j+1] ? tds[j+1] : null);
                        let textVal1 = nextEl ? nextEl.innerText.trim() : '';
                        if (textVal1.length > 2 && !textVal1.includes('Tipo de Compra')) return textVal1;
                        
                        let nextNextEl = tds[j+2];
                        let textVal2 = nextNextEl ? nextNextEl.innerText.trim() : '';
                        if (textVal2.length > 2 && !textVal2.includes('Tipo de Compra')) return textVal2;
                    }
                }
                return null;
            });

            if (nombreEncontrado) {
                razonSocialCapturadaDelSII = nombreEncontrado;
                console.log(`✅ ¡Nombre capturado para la Base de Datos!: "${razonSocialCapturadaDelSII}"`);
                break; 
            }
            await delay(1000);
        }

        if (!nombreEncontrado) {
            console.log('⚠️ Falló la extracción del receptor. Usaremos el nombre por defecto.');
            razonSocialCapturadaDelSII = datos.razonSocial || 'CLIENTE NUEVO SII';
        }

        // =======================================================================
        // 7. PRODUCTOS, FIRMA Y FOLIO
        // =======================================================================
        console.log('🛍️ Ingresando detalles del producto/servicio...');
        await page.type('input[name="EFXP_NMB_01"]', datos.producto.nombre || 'Servicio', { delay: 50 });
        await page.type('input[name="EFXP_QTY_01"]', String(datos.producto.cantidad || 1), { delay: 50 });
        await page.type('input[name="EFXP_UNMD_01"]', String(datos.producto.unidad || 1), { delay: 50 });
        await limpiarYTipar(page, 'input[name="EFXP_PRC_01"]', String(datos.producto.precio || 0));
        
        const checkbox = await page.waitForSelector('input[name="DESCRIP_01"]', { visible: true });
        await checkbox.click(); 
        try {
            await page.waitForSelector('textarea[name="EFXP_DSC_ITEM_01"]', { visible: true, timeout: 5000 });
        } catch (e) {
            await checkbox.click(); 
            await page.waitForSelector('textarea[name="EFXP_DSC_ITEM_01"]', { visible: true, timeout: 5000 });
        }
        await page.type('textarea[name="EFXP_DSC_ITEM_01"]', datos.producto.descripcion || 'Sin descripción', { delay: 50 });
        await page.select('select[name="EFXP_FMA_PAGO"]', '1'); 

        console.log('✅ Validando montos...');
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
        
        console.log('✍️  Abriendo cuadro de firma...');
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
        if (!cajaVisible) throw new Error("El SII no cargó la caja para la clave digital.");

        console.log('🔒 Ingresando clave y enviando factura...');
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
        
        console.log('🔍 Buscando Folio...');
        let folio = null;
        for (let j = 0; j < 30; j++) {
            const text = await page.evaluate(() => document.body.innerText).catch(() => "");
            const match = text.match(/N[°º]\s*(\d+)/i) || text.match(/Folio\s*(\d+)/i);
            if (match) { folio = match[1]; break; }
            await delay(1000); 
        }
        if (!folio) throw new Error("No se detectó el folio en la pantalla final.");
        console.log(`🎉 ¡ÉXITO ABSOLUTO! Folio SII N°: ${folio}`);

        // ==============================================================
        // 💾 LÓGICA DE BASE DE DATOS (AUTO-CREACIÓN E HISTORIAL)
        // ==============================================================
        console.log('💾 Guardando documento en la Base de Datos...');
        
        let empresaIdFinal = datos.empresa_id;
        const rutOriginal = `${datos.rutReceptor}-${datos.dvReceptor}`;

        // 1. SI LA EMPRESA ES NUEVA: CREARLA EN LA BD
        if (empresaIdFinal === 'EXTERNO') {
            console.log(`⚠️ Cliente externo detectado. Creando la empresa: "${razonSocialCapturadaDelSII}" en el CRM...`);
            try {
                // TU LÓGICA EXACTA DE HASH Y ENCRIPTACIÓN
                const rutHash = crypto.createHash('sha256').update(rutOriginal).digest('hex');
                const rutEncrypted = encrypt(rutOriginal);

                const insertEmpresaQuery = `
                    INSERT INTO empresa (razon_social, rut_encrypted, rut_hash, giro, regimen_tributario, activo)
                    VALUES ($1, $2, $3, 'Por definir', 'Por definir', true)
                    RETURNING id;
                `;
                const resultEmpresa = await client.query(insertEmpresaQuery, [razonSocialCapturadaDelSII, rutEncrypted, rutHash]);
                empresaIdFinal = resultEmpresa.rows[0].id;
                console.log(`✅ ¡Cliente nuevo creado con éxito! ID: ${empresaIdFinal}`);
            } catch (errCreacion) {
                console.error("❌ Error al crear la nueva empresa en la BD:", errCreacion.message);
                empresaIdFinal = null; 
            }
        }

        // 2. GUARDAR LA FACTURA EN EL HISTORIAL DE LA EMPRESA (NUEVA O EXISTENTE)
        if (empresaIdFinal) {
            const tipoDte = datos.tipo_documento ? parseInt(datos.tipo_documento) : 33; 
            const montoNeto = parseInt(datos.producto.precio);
            const fechaEmision = new Date().toISOString(); 

            try {
                const checkQuery = `SELECT id FROM documentos_emitidos WHERE rut_cliente = $1 AND tipo_dte = $2 AND folio = $3`;
                const checkRes = await client.query(checkQuery, [rutOriginal, tipoDte, folio]);

                if (checkRes.rows.length === 0) {
                    const queryInsert = `
                        INSERT INTO documentos_emitidos 
                        (empresa_id, rut_cliente, tipo_dte, folio, monto_neto, fecha_emision, url_pdf)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                        RETURNING id;
                    `;
                    const valores = [empresaIdFinal, rutOriginal, tipoDte, folio, montoNeto, fechaEmision, null];
                    const resDB = await client.query(queryInsert, valores);
                    
                    if (resDB.rowCount > 0) {
                        console.log(`✅ ¡Factura ${folio} guardada exitosamente en el historial!`);
                    }
                } else {
                    console.log(`⚠️ La factura ${folio} ya existía en la BD. Omitiendo duplicado.`);
                }
            } catch (dbError) {
                console.error('❌ Error fatal guardando la factura en la BD:', dbError.message);
            }
        }

        return { ok: true, folio: folio, fileName: `Factura_${folio}.pdf` };

    } catch (error) {
        console.error(`❌ Error durante el proceso: ${error.message}`);
        throw error;
    } finally {
        // ==============================================================
        // 🔒 CIERRE DE SESIÓN GARANTIZADO
        // ==============================================================
        if (page && !page.isClosed()) {
            console.log('🧹 Cerrando sesión del SII...');
            try { await page.goto('https://misiir.sii.cl/cgi_misii/siu/cgi_misii_logout', { timeout: 5000 }); } catch (e) {}
        }
        
        if (browser) {
            console.log('🛑 Cerrando navegador Puppeteer...');
            await browser.close();
        }
        
        if (client) {
            await client.end();
        }
        
        console.log('🏁 Recursos liberados. ¡Misión Cumplida!');
    }
}