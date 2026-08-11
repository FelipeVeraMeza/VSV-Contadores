// ============================================================================
// BUSCAR UN FOLIO EN EL SII Y DEVOLVER SU PDF
// ----------------------------------------------------------------------------
// Hace UNA sola cosa: abre sesión en el SII, busca el folio en el portal de
// documentos emitidos, baja el PDF y lo devuelve. Nada se guarda en la base.
//
// Es el mismo camino que ya recorre el envío de correo cuando busca el folio
// para adjuntarlo, pero sin mandar nada: solo traer el documento.
//
// SE ABRE UNA SESIÓN POR DESCARGA. Es lento —entre 30 y 90 segundos— pero es
// el precio de no guardar nada: el documento se pide al SII en el momento y
// siempre es el oficial, sin copias que puedan quedar viejas.
//
// Un candado impide que dos descargas corran a la vez: el SII permite una sola
// sesión por cuenta, y dos robots entrando juntos se botan la sesión mutuamente.
// La segunda espera a que termine la primera.
// ============================================================================
import puppeteer from 'puppeteer';
import fs from 'fs';
import 'dotenv/config';
import { credencialesDelSistema } from '../../../utils/credencialesFacturacion.js';
import { descargarDocumentoSii } from './descargarDocumentoSii.mjs';

// Estado en vivo, para que la pantalla diga en qué va en vez de quedarse muda.
export const estadoDescarga = {
    activo: false, folio: null, paso: '', iniciado: null,
};

// Cola de a uno. Cada descarga espera a que la anterior suelte el turno.
let enCurso = Promise.resolve();

const paso = (texto) => {
    estadoDescarga.paso = texto;
    console.log(`   [PDF] ${texto}`);
};

/**
 * Trae el PDF de un folio ya emitido.
 *
 * @param folio    número del documento
 * @param tipoDte  33 factura · 34 exenta · 56 nota débito · 61 nota crédito
 * @returns {contenido: Buffer, nombre: string}
 * @throws  si el SII no responde o el folio no aparece
 */
// Con VER_NAVEGADOR=1 en el .env, TODAS las descargas abren la ventana. Es la
// forma de mirar qué hace el robot sin tener que tocar la pantalla ni la URL,
// que además pide sesión y no se puede pegar en el navegador a mano.
const VISIBLE_POR_ENV = process.env.VER_NAVEGADOR === '1';

export async function buscarYDescargarPdf(folio, tipoDte = 33, { verNavegador = VISIBLE_POR_ENV } = {}) {
    // El .env manda: si está encendido, se ve aunque no lo pidan.
    verNavegador = verNavegador || VISIBLE_POR_ENV;
    // Se encola: el resultado de la anterior no importa, solo que haya terminado.
    const miTurno = enCurso.catch(() => {});
    let liberar;
    enCurso = new Promise(r => { liberar = r; });
    await miTurno;

    const folioStr = String(folio).trim();
    let browser = null;

    Object.assign(estadoDescarga, {
        activo: true, folio: folioStr, paso: 'Preparando…', iniciado: Date.now(),
    });

    try {
        if (!folioStr || !/^\d+$/.test(folioStr)) {
            throw new Error('El folio debe ser un número.');
        }

        const cred = credencialesDelSistema();
        if (!cred?.DTE_RUT || !cred?.DTE_PASS) {
            throw new Error('Faltan las credenciales del SII para entrar al portal.');
        }

        paso(verNavegador ? 'Abriendo el navegador (VISIBLE)' : 'Abriendo el navegador');
        browser = await puppeteer.launch({
            // `verNavegador` abre la ventana para poder mirar qué hace el robot
            // en el portal del SII. Sirve para entender por qué un folio no
            // aparece; en el día a día va oculto porque es más rápido.
            headless: !verNavegador,
            // slowMo retrasa CADA acción, así que se deja bajo: lo justo para
            // poder seguir el recorrido sin que la sesión entera se arrastre.
            slowMo: verNavegador ? 25 : 0,
            defaultViewport: null,
            protocolTimeout: 120000,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
        });
        const page = await browser.newPage();

        // No se bajan imágenes, fuentes ni hojas de estilo. El robot lee el
        // HTML: el logo del SII y sus tipografías son peso muerto que solo
        // alarga cada navegación. El PDF NO pasa por acá —se pide aparte con
        // fetch— así que esto no lo afecta.
        if (!verNavegador) {
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const t = req.resourceType();
                if (t === 'image' || t === 'font' || t === 'stylesheet' || t === 'media') req.abort();
                else req.continue();
            });
        }

        // Los avisos del SII bloquean los clics si nadie los cierra.
        page.on('dialog', async d => { try { await d.accept(); } catch { /* ya cerrado */ } });
        page.setDefaultNavigationTimeout(60000);

        paso('Entrando al SII');
        await page.goto(
            'https://www1.sii.cl/cgi-bin/Portal001/mipeLaunchPage.cgi?OPCION=2&TIPO=4',
            { waitUntil: 'domcontentloaded', timeout: 45000 }
        );

        // Si ya hubiera sesión viva, el formulario no aparece y se sigue de largo.
        if (await page.$('#rutcntr')) {
            // Los campos se llenan DE GOLPE, no tecla por tecla.
            //
            // `page.type` escribe un carácter a la vez, y con `slowMo` encendido
            // cada uno suma su propia pausa: el RUT y la clave se tardaban varios
            // segundos en aparecer. Acá no hace falta simular a una persona —el
            // formulario del SII no valida mientras se escribe—, así que se
            // asigna el valor directo y se dispara el evento que el formulario
            // espera para dar por llenado el campo.
            await page.evaluate((rut, clave) => {
                const poner = (sel, valor) => {
                    const el = document.querySelector(sel);
                    if (!el) return;
                    el.value = valor;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                };
                poner('#rutcntr', rut);
                poner('#clave', clave);
            }, `${cred.DTE_RUT}-${cred.DTE_DV}`, cred.DTE_PASS);

            await Promise.all([
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}),
                page.click('#bt_ingresar'),
            ]);
        }

        paso(`Buscando el folio ${folioStr}`);
        const pdf = await descargarDocumentoSii(page, folioStr, tipoDte);

        if (!pdf) {
            throw new Error(
                `No se encontró el folio ${folioStr} en el portal del SII. `
                + `Puede que sea de otro tipo de documento, o que el SII todavía no lo liste.`
            );
        }

        paso('Listo');
        const contenido = fs.readFileSync(pdf.rutaTemporal);
        return { contenido, nombre: pdf.nombre };

    } finally {
        estadoDescarga.activo = false;
        // Con la ventana visible se deja unos segundos para alcanzar a mirar
        // dónde quedó antes de que se cierre.
        // Con la ventana visible se deja un momento para alcanzar a mirar.
        if (browser && verNavegador) await new Promise(r => setTimeout(r, 2500));

        // CERRAR LA SESIÓN DEL SII. No es opcional.
        //
        // El SII permite UNA sesión por cuenta. Si el navegador se cierra sin
        // pasar por el logout, la sesión queda viva en su servidor y la próxima
        // entrada —una descarga, una emisión, el robot de compras y ventas—
        // se encuentra la cuenta ocupada y falla.
        //
        // Por eso va en el `finally` y no depende de que la descarga saliera
        // bien: si algo se cayó a mitad de camino, con más razón hay que salir.
        if (browser) {
            try {
                const p = (await browser.pages())[0];
                if (p && !p.isClosed()) {
                    await p.goto('https://misiir.sii.cl/cgi_misii/siu/cgi_misii_logout',
                                 { waitUntil: 'domcontentloaded', timeout: 8000 });
                    console.log('   [PDF] Sesión del SII cerrada');
                }
            } catch {
                // Si el logout no responde, igual se cierra el navegador: el SII
                // suelta la sesión por inactividad, solo que tarda más.
                console.log('   ⚠️ [PDF] No se pudo cerrar la sesión del SII por la vía normal.');
            }
            await browser.close().catch(() => {});
        }
        liberar();
    }
}
