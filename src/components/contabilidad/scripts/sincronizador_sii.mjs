import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { cerrarNavegador } from '../../facturacion/scripts/cerrarNavegador.mjs';

// ==========================================
// FUNCIÓN PRINCIPAL
// ==========================================
/**
 * Extrae compras y ventas del RCV del SII.
 *
 * FLUJO REAL DEL PORTAL (importante):
 *   1. Se entra con el RUT del REPRESENTANTE LEGAL y SU clave del SII.
 *   2. Ya dentro, se SELECCIONA la empresa cuya información se quiere ver, entre
 *      las que ese representante tiene asociadas.
 *   3. Recién ahí se consulta el registro de compras y ventas.
 *
 * Antes esta función entraba con el RUT de la empresa y saltaba directo al RCV,
 * omitiendo el paso 2. Eso solo funciona si la empresa tiene clave tributaria
 * propia; con el flujo del representante no servía.
 *
 * @param rutRepresentante  RUT con el que se inicia sesión (el del representante)
 * @param clave             Clave del SII de ese representante
 * @param rutEmpresa        RUT de la empresa a seleccionar una vez dentro
 */
export async function ejecutarRobotSII({
    rutRepresentante, clave, rutEmpresa,
    mesDesde, anioDesde, mesHasta, anioHasta,
    rut, // alias heredado: antes se llamaba así al único RUT que se enviaba
}) {
    const rutLogin = rutRepresentante || rut;
    if (!rutLogin) throw new Error('Falta el RUT del representante legal para iniciar sesión en el SII.');
    if (!clave)    throw new Error('Falta la clave del SII del representante legal.');

    // Defaults: si no se pasa rango, usa el mes actual
    const now = new Date();
    const _mesHasta = parseInt(mesHasta) || (now.getMonth() + 1);
    const _anioHasta = parseInt(anioHasta) || now.getFullYear();
    const _mesDesde = parseInt(mesDesde) || _mesHasta;
    const _anioDesde = parseInt(anioDesde) || _anioHasta;

    console.log(`\n🚀 Iniciando Robot SII | Rango: ${_mesDesde}/${_anioDesde} → ${_mesHasta}/${_anioHasta}`);
    console.log(`   Representante: ${rutLogin}${rutEmpresa ? ` | Empresa a seleccionar: ${rutEmpresa}` : ' | (sin empresa que seleccionar)'}`);

    // ⚠️ EN EL SERVIDOR ESTO NO ES OPCIONAL.
    //
    // Railway corre el proceso como root, y Chrome se niega a arrancar como root
    // si no se le pasa `--no-sandbox`: muere con «Running as root without
    // --no-sandbox is not supported» y el usuario ve «ERROR EN EL ROBOT» sin
    // ninguna pista de qué pasó. Reportado el 27-08-2026 al extraer de
    // ASOCIACIÓN SEMBRANDO UN SUEÑO.
    //
    // Y con el sandbox arreglado seguiría fallando por lo otro: en producción no
    // hay pantalla donde dibujar una ventana, así que allá va oculto SIEMPRE, sin
    // depender de que alguien se acuerde de poner SII_HEADLESS. Es exactamente lo
    // que ya hacían los orquestadores de `sii_core` —esta copia se quedó atrás—.
    //
    // En el computador de uno se mantiene el comportamiento de antes: ventana
    // visible para poder seguir al robot en el portal. Dos variables opcionales:
    //
    //   SII_SLOWMO=250   → frena cada acción 250 ms, para alcanzar a leer las
    //                      pantallas. Sirve sobre todo para ver el paso de
    //                      selección de empresa. Sin la variable, va a full.
    //   SII_HEADLESS=1   → lo corre oculto (para cuando ya no haga falta mirar).
    //
    // No se pregunta solo por NODE_ENV: si en el despliegue no está puesta esa
    // variable, la ventana se intentaría abrir igual y el robot moriría por lo
    // otro («Missing X server or $DISPLAY»). Un Linux sin DISPLAY no tiene dónde
    // dibujar una ventana, y eso es cierto lo diga o no una variable de entorno.
    const sinPantalla = process.platform === 'linux' && !process.env.DISPLAY;
    const enServidor = process.env.NODE_ENV === 'production' || sinPantalla;
    const slowMo = parseInt(process.env.SII_SLOWMO) || 0;
    const browser = await puppeteer.launch({
        headless: enServidor ? true : process.env.SII_HEADLESS === '1',
        slowMo,
        defaultViewport: null,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            // El /dev/shm de un contenedor es de 64 MB y a Chrome no le alcanza:
            // sin esto se cae solo en medio de la extracción.
            '--disable-dev-shm-usage',
            '--start-maximized',
        ],
    });
    if (slowMo) console.log(`🐢 Modo lento: ${slowMo} ms por acción.`);

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);

    // Variable maestra para acumular todo
    let masterData = [];

    try {
        // 1. LOGIN con el RUT del representante legal
        await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?https://www4.sii.cl/consdcvinternetui/', { waitUntil: 'networkidle2' });
        // El formulario del SII usa '#rutcntr' en unas pantallas y '#rut' en otras.
        await page.waitForSelector('#rutcntr, #rut', { timeout: 30000 });
        const campoRut = (await page.$('#rutcntr')) ? '#rutcntr' : '#rut';
        await page.type(campoRut, rutLogin.replace(/[^0-9kK]/gi, ''));
        await page.type('#clave', clave);
        await Promise.all([page.click('#bt_ingresar'), page.waitForNavigation({ waitUntil: 'networkidle2' })]);

        // ¿Entró de verdad? Se LEE la pantalla que el SII muestra después del login.
        //
        // No alcanza con mirar si sigue el campo '#clave': cuando la clave es
        // incorrecta el SII navega a una PÁGINA DE ERROR (solo el mensaje y un botón
        // "Aceptar"), sin formulario. Antes eso pasaba el chequeo y el robot seguía
        // hasta fallar más adelante con "no había ningún <select>", que hacía pensar
        // en un problema de selección de empresa cuando en realidad la clave
        // estaba mala.
        //
        // Se devuelve el TEXTO LITERAL del portal en vez de una interpretación:
        // así cualquier mensaje del SII llega al usuario tal cual, incluidos los que
        // no anticipamos (clave bloqueada, RUT sin representación vigente, etc.).
        await new Promise(r => setTimeout(r, 1500));
        const pantalla = await page.evaluate(() => {
            const texto = (document.body.innerText || '').trim();

            // Señales de que el ingreso NO se completó.
            const hayFormulario = !!document.querySelector('#clave');
            const codigoError = texto.match(/El c[óo]digo de este mensaje es\s+([\d.]+)/i);
            const fraseError = /no es correcta|no es v[áa]lido|bloquead|no se encuentra|no est[áa] autorizado|debe ingresar/i.test(texto);

            if (!hayFormulario && !codigoError && !fraseError) return null; // entró bien

            // La primera línea con contenido real es el mensaje del SII.
            const mensaje = texto
                .split('\n')
                .map(l => l.trim())
                .find(l => l.length > 30 && !/^ingresar a mi sii$/i.test(l));

            return { mensaje: mensaje || null, codigo: codigoError ? codigoError[1] : null, hayFormulario };
        });

        if (pantalla) {
            const partes = [];
            if (pantalla.mensaje) partes.push(`El SII respondió: "${pantalla.mensaje}"`);
            else if (pantalla.hayFormulario) partes.push('El SII no completó el ingreso (quedó en la pantalla de login).');
            else partes.push('El SII no permitió el ingreso.');
            if (pantalla.codigo) partes.push(`(código ${pantalla.codigo})`);
            partes.push(`RUT usado: ${rutLogin} — es el del representante legal, no el de la empresa.`);
            throw new Error(partes.join(' '));
        }

        // 2. SELECCIÓN DE EMPRESA
        await seleccionarEmpresa(page, rutEmpresa);

        // 3. Registro de Compras y Ventas de la empresa seleccionada
        await page.goto('https://www4.sii.cl/consdcvinternetui/', { waitUntil: 'networkidle2' });

        // 2. CICLO: desde mesHasta/anioHasta hacia atrás hasta mesDesde/anioDesde
        let anio = _anioHasta;
        let mes = _mesHasta;

        while (anio > _anioDesde || (anio === _anioDesde && mes >= _mesDesde)) {
            console.log(`\n📅 --- PROCESANDO PERIODO: ${mes}/${anio} ---`);
            
            await matarPopups(page);
            await prepararYConsultarRCV(page, anio, mes, rutEmpresa);
            await clickConsultar(page);

            // A. COMPRAS
            await page.click('#tabCompra');
            await new Promise(r => setTimeout(r, 2000));
            if (!(await estaVacio(page))) {
                console.log("🛒 Escaneando tabla de Resúmenes (COMPRAS)...");
                await escanearTablaResumen(page, masterData, anio, mes, 'Compra');
            }

            // B. VENTAS
            await page.click('a[ui-sref="venta"]');
            await new Promise(r => setTimeout(r, 2000));
            if (!(await estaVacio(page))) {
                console.log("📈 Escaneando tabla de Resúmenes (VENTAS)...");
                await escanearTablaResumen(page, masterData, anio, mes, 'Venta');
            }

            mes--;
        if (mes < 1) {
            mes = 12;
            anio--;
    }
}

        console.log("🏁 Proceso de escaneo terminado.");
        return { success: true, count: masterData.length };

    } catch (e) {
        // El motivo se devuelve para que llegue a la pantalla. Antes se perdía acá
        // (`return { success: false }` sin más) y el usuario recibía un error
        // genérico aunque el SII hubiera dicho exactamente qué estaba mal.
        console.error("❌ Error crítico:", e.message);
        return { success: false, error: e.message };
    } finally {
        // Cada paso de la limpieza va protegido POR SEPARADO. Antes eran cuatro
        // líneas encadenadas: si fallaba la escritura del archivo o el logout,
        // `browser.close()` no llegaba a correr y quedaba un Chrome vivo comiendo
        // memoria hasta reiniciar el servidor.
        try {
            const dir = path.join(process.cwd(), 'src', 'components', 'contabilidad', 'scripts', 'datos_sii');
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const rutaFinal = path.join(dir, 'reporte_completo_sii.json');
            fs.writeFileSync(rutaFinal, JSON.stringify(masterData, null, 2));
            console.log(`💾 Reporte único guardado en: ${rutaFinal}`);
        } catch (e) {
            console.log(`⚠️ No se pudo guardar el reporte: ${e.message}`);
        }

        // Cerrar la sesión del SII es lo primero y lo más importante: si se cae
        // el navegador sin salir, la sesión queda tomada en el portal y el
        // siguiente intento se encuentra con que "ya hay una sesión activa".
        try { await cerrarSesion(page); }
        catch (e) { console.log(`⚠️ No se pudo cerrar la sesión del SII por la vía normal: ${e.message}`); }

        await cerrarNavegador(browser, 'SYNC-SII');
    }
}

// ==========================================
// LÓGICA DE NAVEGACIÓN Y EXTRACCIÓN
// ==========================================

async function escanearTablaResumen(page, masterData, anio, mes, tipo) {
    const filas = await page.$$('table tbody tr');
    for (let i = 0; i < filas.length; i++) {
        const currentFilas = await page.$$('table tbody tr');
        const link = await currentFilas[i].$('a');

        if (link) {
            const nombreDoc = await page.evaluate(el => el.innerText.trim(), link);
            console.log(` 📄 Clic en: ${nombreDoc}`);
            
            await link.click();
            await new Promise(r => setTimeout(r, 3000)); 

            await escanearTablaDetalle(page, masterData, anio, mes, tipo, nombreDoc); 

            await page.evaluate(() => {
                const btnVolver = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Volver'));
                if (btnVolver) btnVolver.click();
            });
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

async function escanearTablaDetalle(page, masterData, anio, mes, tipo, docNombre) {
    console.log("🔍 Configurando tabla a 100 resultados...");
    
    await page.evaluate(() => {
        const select = document.querySelector('select[name$="length"]');
        if (select) { select.value = '100'; select.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await new Promise(r => setTimeout(r, 3000));

    let continuar = true;
    while (continuar) {
        const datos = await page.evaluate((anio, mes, tipo, docNombre) => {
            const filas = Array.from(document.querySelectorAll('table tbody tr'));
            return filas.map(tr => {
                const tds = tr.querySelectorAll('td');
                if (tds.length < 13) return null;

                // ==========================================
                // 🧹 FILTRO ANTI-FANTASMAS EN ORIGEN
                // Evitamos guardar filas ocultas o desfasadas.
                // ==========================================
                const montoExento = tds[6].innerText.trim();
                const codigoI = tds[12].innerText.trim();
                if (montoExento === "" && codigoI === "") return null;

                return {
                    Periodo: `${mes}/${anio}`,
                    Categoria: tipo,
                    Documento_Origen: docNombre,
                    Tipo: tds[0].innerText.trim(),
                    RUT_Proveedor: tds[1].innerText.trim(),
                    Folio: tds[2].innerText.trim(),
                    Fecha_Docto: tds[3].innerText.trim(),
                    Fecha_Recepcion: tds[4].innerText.trim(),
                    Fecha_Acuse: tds[5].innerText.trim(),
                    Monto_Exento: montoExento,
                    Monto_Neto: tds[7].innerText.trim(),
                    IVA_Recuperable: tds[8].innerText.trim(),
                    Monto_Total: tds[9].innerText.trim(),
                    Otros_Impuestos: tds[10].innerText.trim(),
                    IVA_No_Recuperable: tds[11].innerText.trim(),
                    Codigo_I: codigoI
                };
            }).filter(i => i !== null);
        }, anio, mes, tipo, docNombre);
        
        masterData.push(...datos);
        console.log(`✅ Extraídos ${datos.length} documentos reales.`);

        continuar = await page.evaluate(() => {
            const btnSiguiente = Array.from(document.querySelectorAll('a')).find(a => a.innerText.includes('Siguiente'));
            if (btnSiguiente && !btnSiguiente.closest('li')?.classList.contains('disabled')) {
                btnSiguiente.click();
                return true;
            }
            return false;
        });
        if (continuar) await new Promise(r => setTimeout(r, 3000));
    }
}

// ==========================================
// AYUDANTES
// ==========================================

/**
 * Selecciona, dentro del portal, la empresa cuya información se va a extraer.
 *
 * Un representante legal puede tener varias empresas asociadas: después del login
 * el SII muestra un <select> para elegir de cuál se opera. Recién con esa empresa
 * en contexto el RCV devuelve SUS compras y ventas.
 *
 * Es tolerante a propósito: si el representante tiene una sola empresa el SII
 * entra directo y no hay nada que elegir. En ese caso se sigue adelante en vez de
 * abortar, y se deja registro en consola de lo que encontró — el robot corre con
 * el navegador visible, así que la primera pasada real muestra qué pasó.
 */
async function seleccionarEmpresa(page, rutEmpresa) {
    if (!rutEmpresa) {
        console.log('ℹ️  Sin RUT de empresa: se opera con el contribuyente del login.');
        return;
    }
    // Solo el cuerpo del RUT, sin puntos, guion ni dígito verificador: en el
    // selector el texto viene con formatos distintos según la pantalla.
    const cuerpo = String(rutEmpresa).replace(/[^0-9kK]/gi, '').slice(0, -1);

    // Mismo patrón que ya funciona en nota_credito_debito.mjs
    const URL_SELECCION = 'https://www1.sii.cl/cgi-bin/Portal001/mipeSelEmpresa.cgi?DESDE_DONDE_URL=OPCION%3D2%26TIPO%3D4';

    for (const intento of ['pagina-actual', 'portal-seleccion']) {
        if (intento === 'portal-seleccion') {
            try {
                await page.goto(URL_SELECCION, { waitUntil: 'networkidle2' });
            } catch {
                console.log('⚠️  No se pudo abrir el portal de selección de empresa.');
                return;
            }
        }

        const resultado = await page.evaluate((cuerpoRut) => {
            const selects = Array.from(document.querySelectorAll('select'));
            for (const select of selects) {
                const opciones = Array.from(select.options);
                const opt = opciones.find(o => o.text.replace(/[^0-9kK]/gi, '').includes(cuerpoRut)
                                            || (o.value || '').replace(/[^0-9kK]/gi, '').includes(cuerpoRut));
                if (opt) {
                    select.value = opt.value;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    const btn = document.querySelector('input[type="submit"], button[type="submit"], input[name="btnContinuar"]');
                    if (btn) btn.click();
                    return { ok: true, texto: opt.text.trim() };
                }
            }
            return {
                ok: false,
                // Se devuelve lo que había para poder diagnosticar sin adivinar.
                opciones: selects.flatMap(s => Array.from(s.options).map(o => o.text.trim())).slice(0, 25),
            };
        }, cuerpo);

        if (resultado.ok) {
            console.log(`🏢 Empresa seleccionada: ${resultado.texto}`);
            await new Promise(r => setTimeout(r, 2500));
            return;
        }
        // Pausa para alcanzar a mirar la pantalla cuando no encontró la empresa:
        // SII_PAUSA=15 deja el navegador quieto 15 segundos en ese punto.
        const pausa = parseInt(process.env.SII_PAUSA) || 0;
        if (pausa && intento === 'portal-seleccion') {
            console.log(`⏸️  Pausa de ${pausa}s para que revises la pantalla de selección...`);
            await new Promise(r => setTimeout(r, pausa * 1000));
        }
        if (intento === 'portal-seleccion') {
            console.log(`⚠️  No se encontró la empresa ${rutEmpresa} en el selector.`);
            if (resultado.opciones?.length) {
                console.log('   Opciones disponibles:', resultado.opciones.join(' | '));
            } else {
                console.log('   No había ningún <select>: probablemente el representante tiene una sola empresa.');
            }
        }
    }
}

// En la página del RCV los tres desplegables son, en orden: RUT de la empresa,
// mes y año.
//
// El del RUT se elige buscando la empresa pedida. Antes se hacía
// `selectedIndex = options.length - 1`, o sea la ÚLTIMA de la lista: con un
// representante que tiene varias empresas, el robot extraía la que quedara al
// final y la guardaba bajo el empresaId solicitado. Datos de otra empresa en el
// libro equivocado, sin ningún aviso.
async function prepararYConsultarRCV(page, anio, mes, rutEmpresa) {
    const elegido = await page.evaluate((a, m, rutObjetivo) => {
        const selects = document.querySelectorAll('select');
        let textoRut = null;

        if (selects[0]) {
            const opciones = Array.from(selects[0].options);
            const cuerpo = rutObjetivo ? String(rutObjetivo).replace(/[^0-9kK]/gi, '').slice(0, -1) : null;
            const opt = cuerpo
                ? opciones.find(o => o.text.replace(/[^0-9kK]/gi, '').includes(cuerpo)
                                  || (o.value || '').replace(/[^0-9kK]/gi, '').includes(cuerpo))
                : null;
            // Sin coincidencia se mantiene lo que el portal ya tenía puesto, en vez
            // de cambiar a una empresa al azar.
            if (opt) selects[0].value = opt.value;
            selects[0].dispatchEvent(new Event('change'));
            textoRut = selects[0].options[selects[0].selectedIndex]?.text?.trim() || null;
        }
        if (selects[1]) { selects[1].value = m.toString().padStart(2, '0'); selects[1].dispatchEvent(new Event('change')); }
        if (selects[2]) { selects[2].value = a.toString(); selects[2].dispatchEvent(new Event('change')); }
        return textoRut;
    }, anio, mes, rutEmpresa || null);

    if (elegido) console.log(`   RUT consultado en el portal: ${elegido}`);
    await new Promise(r => setTimeout(r, 1000));
}

async function clickConsultar(page) {
    await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Consultar'));
        if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 3000));
}

async function estaVacio(page) {
    return await page.evaluate(() => {
        const alerta = document.querySelector('.alert-danger');
        return alerta && alerta.innerText.includes('No hay información');
    });
}

async function matarPopups(page) {
    await page.evaluate(() => {
        const btns = document.querySelectorAll('.close, .modal-header button');
        btns.forEach(b => b.click());
    });
}

async function cerrarSesion(page) {
    try { await page.goto('https://misiir.sii.cl/cgi_misii/siu/cgi_misii_logout', { timeout: 3000 }); } catch(e) {}
}