import puppeteer from 'puppeteer';
import dotenv from 'dotenv';
import pkg from 'pg'; 
const { Client } = pkg;

dotenv.config();

// Inicializamos el cliente de Base de Datos PostgreSQL
const client = new Client({
    user: process.env.DBS_USER,
    host: process.env.DBS_HOST,
    database: process.env.DBS_DATABASE,
    password: process.env.DBS_PASSWORD,
    port: process.env.DBS_PORT,
    ssl: { rejectUnauthorized: false }
});

// Helper para pausas exactas
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

// Función auxiliar para escribir a velocidad humana (para evitar bloqueos del SII)
const limpiarYTipar = async (page, selector, texto) => {
    if (!texto) return; 
    await page.waitForSelector(selector, { visible: true });
    await page.click(selector, { clickCount: 3 }); 
    await page.keyboard.press('Backspace');        
    await page.type(selector, texto, { delay: 50 }); 
};

// 🚀 Exportamos la función para que el servidor (Express) pueda usarla
export async function emitirFacturaPuppeteer(datos) {
    // Conectamos a la BD antes de empezar
    try {
        await client.connect();
        console.log("🔌 Búnker PostgreSQL conectado para facturación.");
    } catch (dbConnErr) {
        console.log("⚠️ Advertencia: Error inicial conectando a BD o ya estaba conectada.", dbConnErr.message);
    }

    const browser = await puppeteer.launch({ 
    headless: true, // <--- ¡CAMBIA ESTO A FALSE SI QUIERES VERLO! 👀
    defaultViewport: null, 
    args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--start-maximized', 
        '--disable-blink-features=AutomationControlled'
    ] 
});

    const page = await browser.newPage();
    
    try {
        console.log('>>> Iniciando proceso de facturación...');
        await navegarAEmision(page);

        // ==============================================================
        // 1. LOGIN CON TUS CLAVES Y SELECCIÓN FORZADA DE LA 2DA EMPRESA
        // ==============================================================
        const inputRutExiste = await page.$('#rutcntr');
        if (inputRutExiste) {
            console.log(`🔑 Entrando al SII con RUT: ${process.env.DTE_RUT}`);
            
            await page.type('#rutcntr', `${process.env.DTE_RUT}-${process.env.DTE_DV}`, { delay: 50 });
            await page.type('#clave', process.env.DTE_PASS, { delay: 50 });
            await Promise.all([page.waitForNavigation(), page.click('#bt_ingresar')]);
            
            await delay(1500); 

            // PREGUNTA DEL SII: "¿A nombre de quién facturas?"
            const selectBox = await page.$('select[name="RUT_EMP"]');
            if (selectBox) {
                console.log('🏢 Selector de empresas detectado. Buscando la 2da opción...');
                await page.waitForSelector('select[name="RUT_EMP"]');
                
                // Extraemos dinámicamente el valor exacto de la 2da empresa
                const valueSegundaEmpresa = await page.evaluate(() => {
                    const selectElement = document.querySelector('select[name="RUT_EMP"]');
                    if (selectElement && selectElement.options.length > 0) {
                        // Opcion 0 suele ser "--- Seleccione ---"
                        // Opcion 1 es la primera empresa
                        // Opcion 2 es la SEGUNDA empresa
                        let targetIndex = 1;
                        
                        // Verificamos si la primera opción es texto de relleno
                        if (selectElement.options[0].text.toLowerCase().includes('seleccione')) {
                            // Si tiene texto de relleno y hay al menos 3 opciones, tomamos la index 2 (2da empresa)
                            if (selectElement.options.length > 2) {
                                targetIndex = 2;
                            }
                        } else {
                            // Si no hay texto de relleno, la index 1 es la 2da empresa
                            if (selectElement.options.length > 1) {
                                targetIndex = 1;
                            }
                        }
                        
                        return selectElement.options[targetIndex].value;
                    }
                    return null;
                });

                if (valueSegundaEmpresa) {
                    console.log(`✅ Forzando selección de la 2da empresa (Value: ${valueSegundaEmpresa})...`);
                    await page.click('select[name="RUT_EMP"]'); // Hacemos clic físico en la caja
                    await delay(500);
                    await page.select('select[name="RUT_EMP"]', valueSegundaEmpresa);
                    await delay(500);
                    
                    // Click en botón continuar
                    await Promise.all([
                        page.waitForNavigation({ waitUntil: 'networkidle2' }),
                        page.evaluate(() => {
                            const btnSubmit = document.querySelector('button[type="submit"], input[type="submit"]');
                            if (btnSubmit) btnSubmit.click();
                        })
                    ]);
                } else {
                    console.log('⚠️ No se encontraron empresas en la lista.');
                }
            }
        }

        // ==============================================================
        // 2. LLENADO DEL FORMULARIO CON LOS DATOS DEL CLIENTE
        // ==============================================================
        console.log(`📝 Ingresando datos del cliente: ${datos.rutReceptor}-${datos.dvReceptor}`);
        
        await navegarAEmision(page);
        await page.waitForSelector('#EFXP_RUT_RECEP', { visible: true, timeout: 45000 });
        await delay(1000); 

        // RUT Cliente
        await page.click('#EFXP_RUT_RECEP');
        await page.type('#EFXP_RUT_RECEP', datos.rutReceptor, { delay: 50 });
        await page.type('#EFXP_DV_RECEP', datos.dvReceptor, { delay: 50 });
        await page.keyboard.press('Tab');
        
        // 🚨 PAUSA CRÍTICA: Esperar que el SII cargue la Razón Social de su propia base de datos
        console.log('⏳ Esperando que el SII cargue la Razón Social automáticamente...');
        await delay(6000); 

        // Resto de datos del Cliente
        await limpiarYTipar(page, 'input[name="EFXP_CIUDAD_ORIGEN"]', datos.ciudadEmisor);
        await limpiarYTipar(page, 'input[name="EFXP_FONO_EMISOR"]', datos.telefonoEmisor);
        await limpiarYTipar(page, 'input[name="EFXP_CIUDAD_RECEP"]', datos.ciudadReceptor);
        await limpiarYTipar(page, 'input[name="EFXP_CONTACTO"]', datos.contactoReceptor);
        
        if (datos.rutSolicita && datos.dvSolicita) {
            await limpiarYTipar(page, 'input[name="EFXP_RUT_SOLICITA"]', datos.rutSolicita);
            await limpiarYTipar(page, 'input[name="EFXP_DV_SOLICITA"]', datos.dvSolicita);
        }

        // DATOS DEL SERVICIO (Plan, precio y descripción)
        console.log('🛍️ Ingresando detalles del producto/servicio...');
        await page.type('input[name="EFXP_NMB_01"]', datos.producto.nombre, { delay: 50 });
        await page.type('input[name="EFXP_QTY_01"]', datos.producto.cantidad, { delay: 50 });
        await page.type('input[name="EFXP_UNMD_01"]', datos.producto.unidad, { delay: 50 });
        
        await limpiarYTipar(page, 'input[name="EFXP_PRC_01"]', String(datos.producto.precio));
        
        // DESCRIPCIÓN REBELDE
        const checkbox = await page.waitForSelector('input[name="DESCRIP_01"]', { visible: true });
        await checkbox.click(); 
        
        try {
            await page.waitForSelector('textarea[name="EFXP_DSC_ITEM_01"]', { visible: true, timeout: 5000 });
        } catch (e) {
            console.log('⚠️ Reintentando abrir cuadro de descripción...');
            await checkbox.click(); 
            await page.waitForSelector('textarea[name="EFXP_DSC_ITEM_01"]', { visible: true, timeout: 5000 });
        }

        await page.type('textarea[name="EFXP_DSC_ITEM_01"]', datos.producto.descripcion, { delay: 50 });
        await page.select('select[name="EFXP_FMA_PAGO"]', '1'); // Forma de pago (Asumo 1 = Contado)

        // ==============================================================
        // 3. FIRMA DEL DOCUMENTO (MIPYME + FLUIDEZ)
        // ==============================================================
        console.log('✅ Validando montos en el SII...');
        
        // 1. Clic en Validar y visualizar
        await page.click('button[name="Button_Update"]');
        await delay(3500); 
        
        // 🚨 CAZADOR DE ALERTA DE TRIBUTACIÓN SIMPLIFICADA (MIPYME) 🚨
        console.log('👀 Revisando si existe alerta de Tributación Simplificada...');
        try {
            const alertaAceptada = await page.evaluate(() => {
                const botones = Array.from(document.querySelectorAll('input[type="button"], button'));
                const btnAceptar = botones.find(b => b.value.includes('Aceptar') || b.innerText.includes('Aceptar'));
                
                if (btnAceptar && btnAceptar.offsetParent !== null) { 
                    btnAceptar.click();
                    return true;
                }
                return false;
            });

            if (alertaAceptada) {
                console.log('⚠️ Alerta MIPYME detectada: Aceptando generación de asientos...');
                await delay(2000); 
            }
        } catch (e) {
            console.log('👍 No se detectó alerta (o ya estaba aceptada).');
        }
        
        console.log('✍️  Intentando abrir cuadro de firma...');
        
        let intentosFirma = 0;
        let cajaVisible = false;

        while (intentosFirma < 5 && !cajaVisible) {
            try {
                await page.evaluate(() => {
                    const btn = document.querySelector('input[name="btnSign"]');
                    if (btn && !btn.disabled) {
                        btn.click();
                    }
                });

                await page.waitForSelector('#myPass', { visible: true, timeout: 3500 });
                cajaVisible = true;
                console.log("🎯 ¡Cajita de firma digital cargada!");
            } catch (e) {
                intentosFirma++;
                console.log(`⚠️ Intento ${intentosFirma}/5: Esperando que habilite el botón de firmar...`);
                await page.click('button[name="Button_Update"]').catch(()=> {}); 
                await delay(2000);
            }
        }

        if (!cajaVisible) {
            throw new Error("El portal del SII no cargó la caja para ingresar la clave digital después de varios intentos.");
        }

        console.log('🔒 Ingresando clave del certificado...');
        await page.focus('#myPass');
        await page.type('#myPass', process.env.SII_PFX_PASS, { delay: 50 });
        await delay(500); 
        
        console.log('🚀 Enviando factura al SII...');
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => console.log("⏳ Navegación final tomó tiempo extra...")),
            page.evaluate(() => {
                const btnEnviar = document.querySelector('#btnFirma');
                if (btnEnviar) btnEnviar.click();
            })
        ]);
        
        // ==============================================================
        // 4. CAPTURA DEL FOLIO Y CIERRE
        // ==============================================================
        console.log('🔍 Buscando el Folio generado...');
        let folio = null;
        for (let j = 0; j < 30; j++) {
            const text = await page.evaluate(() => document.body.innerText).catch(() => "");
            const match = text.match(/N[°º]\s*(\d+)/i) || text.match(/Folio\s*(\d+)/i);
            if (match) { 
                folio = match[1]; 
                break; 
            }
            await delay(1000); 
        }
        
        if (!folio) throw new Error("No se pudo obtener el folio en la pantalla final. Revisa en el SII si se emitió.");
        
        console.log(`🎉 ¡Éxito Absoluto! Folio generado: ${folio}`);

        // =========================================================
        // NUEVO: GUARDAR EN LA BASE DE DATOS (POSTGRESQL / PG)
        // =========================================================
        console.log('Intentando guardar documento en BD Principal...');
        
        const tipoDte = datos.tipo_documento === '34' ? 34 : 33; // 33 Afecta, 34 Exenta
        const montoNeto = parseInt(datos.producto.precio);
        const montoIva = tipoDte === 33 ? Math.round(montoNeto * 0.19) : 0;
        const montoTotal = tipoDte === 33 ? (montoNeto + montoIva) : montoNeto;

        try {
            const queryInsert = `
                INSERT INTO documentos_emitidos 
                (empresa_id, rut_cliente, tipo_dte, folio, monto_neto, monto_exento, monto_iva, monto_total, fecha_emision, estado)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Emitido')
                ON CONFLICT ON CONSTRAINT unique_empresa_tipo_folio DO NOTHING
                RETURNING id;
            `;

            const valores = [
                datos.empresa_id, 
                `${datos.rutReceptor}-${datos.dvReceptor}`, 
                tipoDte, 
                folio, 
                tipoDte === 33 ? montoNeto : 0,  // Monto Neto (Afecto)
                tipoDte === 34 ? montoNeto : 0,  // Monto Exento
                montoIva, 
                montoTotal,
                new Date().toISOString().split('T')[0] // Fecha local (hoy)
            ];

            const resDB = await client.query(queryInsert, valores);
            
            if (resDB.rowCount > 0) {
                console.log(`💾 ¡Factura ${folio} guardada exitosamente en el Historial de la empresa!`);
            } else {
                console.log(`⚠️ La factura ${folio} ya existía en la BD. Omitiendo duplicado.`);
            }
        } catch (dbError) {
            console.error('❌ Error guardando en Base de Datos:', dbError.message);
        }
        // =========================================================

        console.log('🧹 Cerrando sesión...');
        try { 
            await page.goto('https://misiir.sii.cl/cgi_misii/siu/cgi_misii_logout', { waitUntil: 'networkidle2', timeout: 10000 }); 
        } catch (e) {}

        
        return { ok: true, folio: folio, fileName: `Factura_${folio}.pdf` };
        
    } catch (error) {
        console.error(`❌ Error fatal en Puppeteer: ${error.message}`);
        throw new Error(error.message);
    } finally {
        await browser.close(); 
        // Cerramos conexión a BD para evitar leaks de memoria en el servidor
        try { await client.end(); } catch (e) {} 
    }
}