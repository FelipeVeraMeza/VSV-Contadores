import puppeteer from 'puppeteer';
import dotenv from 'dotenv';
import pkg from 'pg'; 
import crypto from 'crypto'; 
import { encrypt } from '../../../utils/crypto.js'; // ⚠️ Ajusta tu ruta si es necesario
import { credencialesDelSistema } from '../../../utils/credencialesFacturacion.js';
// La misma que usa el facturador masivo para mandar cada factura emitida.
import { enviarCorreoFacturaEnSesion } from './revisar para envios/mensajes_facturador_masivo.mjs';
// Bajar el PDF es su propia responsabilidad, no un efecto del correo.
import { descargarDocumentoSii } from './descargarDocumentoSii.mjs';

const { Client } = pkg;
dotenv.config();

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Espera a que el SII deje de navegar (drena las recargas del formulario).
// Evita "Execution context was destroyed" al tocar el DOM mientras el SII recarga
// (por ejemplo, tras escribir el RUT del receptor).
const esperarEstable = async (page) => {
    for (let i = 0; i < 6; i++) {
        try {
            await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 2000 });
            await delay(400);
        } catch (e) {
            break; // Sin más navegaciones => página estable.
        }
    }
    await delay(500);
};

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

// ============================================================================
// AVANCE EN VIVO DE LA FACTURA INDIVIDUAL
// ----------------------------------------------------------------------------
// Emitir una factura tarda entre 30 y 90 segundos: el robot abre el navegador,
// entra al SII, llena el formulario, firma y espera el folio. Sin esto la
// pantalla mostraba un girito y un cartel rojo que decia "SISTEMA BLOQUEADO",
// que no dice en que va ni si sigue viva. Ahora nombra el paso actual.
// ============================================================================
export const estadoFacturaManual = {
    activo: false, paso: '', numero: 0, total: 12,
    avisoCorreo: null, avisoCobro: null, rutaPdf: null, nombrePdf: null,
    folio: null, error: null, iniciado: null,
};

const paso = (n, texto) => {
    estadoFacturaManual.numero = n;
    estadoFacturaManual.paso = texto;
    console.log(`   [${n}/12] ${texto}`);
};

export async function emitirFacturaPuppeteer(datos, credSii = credencialesDelSistema()) {
    
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
        Object.assign(estadoFacturaManual, { activo: true, numero: 0, paso: 'Preparando…', folio: null, error: null, avisoCorreo: null, avisoCobro: null, rutaPdf: null, nombrePdf: null, iniciado: Date.now() });
        paso(1, 'Iniciando el robot');
        console.log('>>> Iniciando Robot de Facturación Inteligente...');

        // =======================================================================
        // 2. LANZAR NAVEGADOR Y LOGIN CON RESILIENCIA (AUTO-REINTENTO)
        // =======================================================================
        let navegacionExitosa = false;
        let intentosNavegacion = 0;

        while (!navegacionExitosa && intentosNavegacion < 3) {
            intentosNavegacion++;
            try {
                paso(2, `Abriendo el navegador (intento ${intentosNavegacion} de 3)`);
                console.log(`\n🌐 Levantando navegador (Intento ${intentosNavegacion}/3)...`);
                
                browser = await puppeteer.launch({
                    headless: true, // 👁️ Ponlo en 'false' si quieres ver el proceso en tu pantalla
                    defaultViewport: null,
                    protocolTimeout: 120000, // ⏱️ Evita que un clic/comando lento tumbe todo
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--start-maximized',
                        '--disable-blink-features=AutomationControlled'
                    ]
                });

                page = await browser.newPage();
                // 🔔 Aceptamos automáticamente las alertas/confirmaciones del SII para que NO
                // bloqueen los clics (esos diálogos colgaban el "Input.dispatchMouseEvent").
                page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
                // Aumentamos un poco el timeout general para darle respiro
                page.setDefaultNavigationTimeout(60000);

                // Intentamos llegar a la página
                await page.goto('https://www1.sii.cl/cgi-bin/Portal001/mipeLaunchPage.cgi?OPCION=33&TIPO=4', { 
                    waitUntil: 'networkidle2', 
                    timeout: 45000 
                });

                // Si pasamos el goto sin que lance error (timeout), marcamos éxito y rompemos el bucle
                navegacionExitosa = true;
                
            } catch (error) {
                console.log(`⚠️ Falló el intento ${intentosNavegacion} por lentitud del SII: ${error.message}`);
                // Si falla, CERRAMOS el navegador actual para no dejar ventanas fantasma
                if (browser) {
                    await browser.close().catch(() => {});
                }
                if (intentosNavegacion < 3) {
                    console.log("⏳ Esperando 5 segundos antes de reintentar con una ventana limpia...");
                    await delay(5000);
                }
            }
        }

        // Si después de los 3 intentos no logró cargar, abortamos la misión
        if (!navegacionExitosa) {
            throw new Error('❌ El portal del SII está demasiado lento o caído. Se abortó la operación tras 3 intentos.');
        }

        // =======================================================================
        // 3. LOGIN EN EL SII (Ya estamos en la página correcta)
        // =======================================================================
        const inputRutExiste = await page.$('#rutcntr');
        if (inputRutExiste) {
            paso(3, 'Entrando al SII');
        console.log(`🔑 Entrando al SII con RUT: ${credSii.DTE_RUT}`);
            await page.type('#rutcntr', `${credSii.DTE_RUT}-${credSii.DTE_DV}`, { delay: 50 });
            await page.type('#clave', credSii.DTE_PASS, { delay: 50 });
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
        paso(4, 'Escribiendo el RUT del cliente');
        console.log(`📝 Escribiendo RUT del cliente: ${datos.rutReceptor}-${datos.dvReceptor}`);
        
        // Ya no necesitamos llamar a tu antigua función 'navegarAEmision' porque ya estamos en la página
        // y pasamos la selección de empresa. Solo esperamos a que el input de receptor aparezca.
        
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

        // 🕒 CLAVE: al validar el RUT del receptor, el SII RECARGA el formulario.
        // Esperamos a que esa recarga termine ANTES de tocar el DOM (evita "context destroyed").
        paso(5, 'Esperando que el SII valide el RUT');
        console.log('⏳ Esperando que el SII termine de validar el RUT (posible recarga)...');
        await delay(1200);
        await esperarEstable(page);
        await delay(1200);

        // =======================================================================
        // 5. LLENAR DATOS SECUNDARIOS MIENTRAS SII PIENSA
        // =======================================================================
        console.log('⏩ Llenando datos secundarios...');

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
        for (let i = 0; i < 8; i++) {
          try {
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
          } catch (eEval) {
            // Si el SII recargó (contexto destruido), esperamos a que se estabilice y reintentamos.
            await esperarEstable(page);
            await delay(500);
            continue;
          }

            if (nombreEncontrado) {
                razonSocialCapturadaDelSII = nombreEncontrado;
                console.log(`✅ ¡Nombre capturado para la Base de Datos!: "${razonSocialCapturadaDelSII}"`);
                break;
            }
            await delay(500);
        }

        if (!nombreEncontrado) {
            console.log('⚠️ Falló la extracción del receptor. Usaremos el nombre por defecto.');
            razonSocialCapturadaDelSII = datos.razonSocial || 'CLIENTE NUEVO SII';
        }

        // =======================================================================
        // 7. PRODUCTOS, FIRMA Y FOLIO
        // =======================================================================
        paso(6, 'Ingresando el detalle del servicio');
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
        // Clic vía JS (no por el mouse de CDP) para evitar el "Input.dispatchMouseEvent timed out".
        await page.evaluate(() => {
            const btn = document.querySelector('button[name="Button_Update"]');
            if (btn) btn.click();
        });
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
        
        paso(7, 'Firmando la factura');
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
                await page.evaluate(() => {
                    const btn = document.querySelector('button[name="Button_Update"]');
                    if (btn) btn.click();
                }).catch(() => {});
                await delay(2000);
            }
        }
        if (!cajaVisible) throw new Error("El SII no cargó la caja para la clave digital.");

        console.log('🔒 Ingresando clave y enviando factura...');
        await page.focus('#myPass');
        await page.type('#myPass', credSii.SII_PFX_PASS, { delay: 50 });
        await delay(500); 
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
            page.evaluate(() => {
                const btnEnviar = document.querySelector('#btnFirma');
                if (btnEnviar) btnEnviar.click();
            })
        ]);
        
        paso(8, 'Esperando el folio del SII');
        console.log('🔍 Buscando Folio...');
        let folio = null;
        for (let j = 0; j < 30; j++) {
            const text = await page.evaluate(() => document.body.innerText).catch(() => "");
            const match = text.match(/N[°º]\s*(\d+)/i) || text.match(/Folio\s*(\d+)/i);
            if (match) { folio = match[1]; break; }
            await delay(1000); 
        }
        if (!folio) throw new Error("No se detectó el folio en la pantalla final.");
        estadoFacturaManual.folio = folio;
        console.log(`🎉 ¡ÉXITO ABSOLUTO! Folio SII N°: ${folio}`);

        // ==============================================================
        // 💾 LÓGICA DE BASE DE DATOS (AUTO-CREACIÓN E HISTORIAL)
        // ==============================================================
        // =======================================================================
        // BAJAR EL PDF  ·  antes solo pasaba si el correo salía bien
        // -----------------------------------------------------------------------
        // Se hace ACÁ, apenas hay folio y con la sesión del SII todavía abierta,
        // y NO dentro del envío de correo. Antes iban juntos: si el correo
        // fallaba —como el 06-08 con el timeout del SII— la factura quedaba
        // emitida y sin ningún archivo en el computador.
        let rutaPdf = null;
        try {
            paso(9, 'Descargando el PDF de la factura');
            const pdf = await descargarDocumentoSii(page, folio, 33);
            if (pdf) {
                rutaPdf = pdf.rutaPC;
                estadoFacturaManual.rutaPdf = pdf.rutaPC;
                estadoFacturaManual.nombrePdf = pdf.nombre;
            }
        } catch { /* la función ya avisa; la factura sigue válida */ }

        paso(10, 'Guardando el documento');
        console.log('💾 Guardando documento en la Base de Datos...');
        
        let empresaIdFinal = datos.empresa_id;
        const rutOriginal = `${datos.rutReceptor}-${datos.dvReceptor}`;

        if (empresaIdFinal === 'EXTERNO') {
            console.log(`⚠️ Cliente externo detectado. Creando la empresa: "${razonSocialCapturadaDelSII}" en el CRM...`);
            try {
                const rutHash = crypto.createHash('sha256').update(rutOriginal).digest('hex');
                const rutEncrypted = encrypt(rutOriginal);

                // organizacion_id es obligatorio de facto: el CRM filtra por él,
                // así que sin este valor la empresa quedaría creada pero invisible.
                const insertEmpresaQuery = `
                    INSERT INTO empresa (razon_social, rut_encrypted, rut_hash, giro, regimen_tributario, activo, organizacion_id)
                    VALUES ($1, $2, $3, 'Por definir', 'Por definir', true, $4)
                    RETURNING id;
                `;
                const resultEmpresa = await client.query(insertEmpresaQuery, [razonSocialCapturadaDelSII, rutEncrypted, rutHash, datos.organizacion_id || null]);
                empresaIdFinal = resultEmpresa.rows[0].id;
                console.log(`✅ ¡Cliente nuevo creado con éxito! ID: ${empresaIdFinal}`);
            } catch (errCreacion) {
                console.error("❌ Error al crear la nueva empresa en la BD:", errCreacion.message);
                empresaIdFinal = null; 
            }
        }

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
                    const valores = [empresaIdFinal, rutOriginal, tipoDte, folio, montoNeto, fechaEmision, rutaPdf];
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

        // =======================================================================
        // METER LA FACTURA EN LA COBRANZA  ·  esto FALTABA
        // -----------------------------------------------------------------------
        // El facturador masivo trabaja sobre cobros que YA existen: los genera el
        // día 26 en estado POR_EMITIR y después `vincularFolios` les pega el folio
        // y los pasa a PENDIENTE_PAGO.
        //
        // El manual no tiene nada de eso. Emitía la factura, la guardaba en
        // documentos_emitidos… y ahí moría: no quedaba ningún cobro asociado, así
        // que el cliente NO aparecía debiendo, no salía en el Cobro del Mes ni en
        // Correo Masivo, y nadie le iba a cobrar nunca.
        //
        // Le pasó a CALDERÓN el 06-08-2026: factura 1367 emitida por $50.000 y
        // cero rastro en la cobranza.
        //
        // Si el cobro del período ya existe se le pega el folio (es el caso de
        // emitir a mano una factura que estaba pendiente). Si no existe, se crea.
        try {
            paso(11, 'Registrando el cobro');
            const periodoCobro = new Date();
            periodoCobro.setDate(1);
            const periodoSql = periodoCobro.toISOString().slice(0, 10);
            // El pago vence el día 5 del mes siguiente, igual que en el ciclo normal.
            const vence = new Date(periodoCobro);
            vence.setMonth(vence.getMonth() + 1);
            vence.setDate(5);

            await client.query(
                `INSERT INTO cobro_mensual
                    (organizacion_id, empresa_id, periodo, monto_esperado, monto_facturado,
                     folio, tipo_dte, estado, fecha_emision, fecha_vencimiento)
                 VALUES ($1,$2,$3::date,$4,$4,$5,'33','PENDIENTE_PAGO',NOW(),$6::date)
                 ON CONFLICT (empresa_id, periodo) DO UPDATE
                    SET folio           = EXCLUDED.folio,
                        monto_facturado = EXCLUDED.monto_facturado,
                        tipo_dte        = '33',
                        fecha_emision   = NOW(),
                        -- Un cobro ya PAGADO no se reabre por reemitir la factura.
                        estado          = CASE WHEN cobro_mensual.estado = 'PAGADA'
                                               THEN 'PAGADA' ELSE 'PENDIENTE_PAGO' END,
                        updated_at      = NOW()`,
                [datos.organizacion_id || null, empresaIdFinal, periodoSql,
                 montoNeto, String(folio), vence.toISOString().slice(0, 10)]
            );
            console.log(`✅ Cobro registrado: folio ${folio} por $${Number(montoNeto).toLocaleString('es-CL')}, vence el ${vence.toLocaleDateString('es-CL')}`);
        } catch (errCobro) {
            // La factura ya está emitida ante el SII: esto no la deshace.
            console.log(`⚠️ La factura ${folio} se emitió, pero NO quedó en la cobranza: ${errCobro.message}`);
            console.log(`   Hay que registrarla a mano o el cliente no aparecerá debiendo.`);
            estadoFacturaManual.avisoCobro =
                `La factura ${folio} se emitió, pero no se pudo registrar el cobro. `
                + `Revísalo en Cobro del Mes.`;
        }

        // =======================================================================
        // ENVIAR LA FACTURA AL CLIENTE  ·  esto FALTABA
        // -----------------------------------------------------------------------
        // El facturador masivo manda el correo de cada factura que emite; el
        // individual la emitía y ahí quedaba. El cliente nunca recibía nada y
        // había que reenviársela a mano desde Correo Masivo buscando el folio.
        //
        // Se usa la MISMA función del masivo y en la misma sesión del SII, antes
        // de cerrarla: el correo sale desde el portal, con la factura adjunta.
        // Por eso va acá y no después del `finally`, donde la sesión ya no existe.
        //
        // Si el correo falla, la factura NO se deshace: ya está emitida ante el
        // SII y eso no se toca. Se avisa y se sigue; se puede reenviar desde
        // Correo Masivo con el folio.
        let correoEnviado = false;
        try {
            paso(12, 'Enviando la factura al cliente');
            await enviarCorreoFacturaEnSesion(page, folio, datos);
            correoEnviado = true;
            console.log(`✅ Factura ${folio} enviada a ${datos.contactoReceptor || 'el cliente'}`);
        } catch (errCorreo) {
            console.log(`⚠️ La factura ${folio} SE EMITIÓ, pero el correo falló: ${errCorreo.message}`);
            console.log(`   Se puede reenviar desde Correo Masivo con el folio ${folio}.`);
            estadoFacturaManual.avisoCorreo =
                `La factura ${folio} se emitió correctamente, pero no se pudo enviar el correo. `
                + `Reenvíala desde Correo Masivo con el folio ${folio}.`;
        }

        return { ok: true, folio, correoEnviado, rutaPdf, fileName: `Factura_${folio}.pdf` };

    } catch (error) {
        console.error(`❌ Error durante el proceso: ${error.message}`);
        // Se guarda el motivo para que la pantalla pueda decir QUÉ falló y en
        // qué paso, en vez de solo apagarse.
        estadoFacturaManual.error = error.message;
        throw error;
    } finally {
        // Pase lo que pase, el proceso deja de estar activo: si no, la pantalla
        // quedaría girando para siempre.
        estadoFacturaManual.activo = false;
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