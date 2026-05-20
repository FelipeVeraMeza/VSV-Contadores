// Ruta:
// src/components/contabilidad/scripts/sincronizador_sii.mjs

import puppeteer from 'puppeteer';

import fs from 'fs';

import path from 'path';

import { fileURLToPath } from 'url';

// ==========================================
// RUTA ACTUAL
// ==========================================
const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);

// ==========================================
// EXPORT PRINCIPAL
// ==========================================
export async function ejecutarRobotSII({
    rut,
    clave,
    rutEmpresa
}) {

    console.log('\n🚀 Iniciando robot SII...');

    // ==========================================
    // ABRIR NAVEGADOR
    // ==========================================
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized']
    });

    let page;

    try {

        // ==========================================
        // NUEVA PESTAÑA
        // ==========================================
        page = await browser.newPage();

        page.setDefaultNavigationTimeout(60000);

        // ==========================================
        // MANEJO ALERTAS
        // ==========================================
        page.on('dialog', async dialog => {

            await dialog.accept().catch(() => {});
        });

        // ==========================================
        // ENTRAR SII
        // ==========================================
        console.log('🌐 Entrando al portal SII...');

        await page.goto(
            'https://www1.sii.cl/cgi-bin/Portal001/mipeLaunchPage.cgi?OPCION=2&TIPO=4',
            {
                waitUntil: 'networkidle2'
            }
        );

        // ==========================================
        // LIMPIAR RUT
        // ==========================================
        const rutLimpio =
            rut.replace(/[^0-9kK]/gi, '');

        console.log('🔑 Ingresando credenciales...');

        // ==========================================
        // INPUT RUT
        // ==========================================
        const inputRut =
            await page.waitForSelector(
                '#rutcntr, #rut'
            );

        const idRut =
            await page.evaluate(
                el => el.id,
                inputRut
            );

        // ==========================================
        // ESCRIBIR RUT
        // ==========================================
        await page.type(
            `#${idRut}`,
            rutLimpio,
            { delay: 50 }
        );

        // ==========================================
        // ESCRIBIR CLAVE
        // ==========================================
        await page.type(
            '#clave',
            clave,
            { delay: 50 }
        );

        // ==========================================
        // LOGIN
        // ==========================================
        console.log('🚀 Iniciando sesión...');

        await Promise.all([

            page.click('#bt_ingresar'),

            page.waitForNavigation({
                waitUntil: 'networkidle2'
            })
        ]);

        console.log('✅ Sesión iniciada');

        // ==========================================
        // SELECCIONAR EMPRESA
        // ==========================================
        if (rutEmpresa) {

            console.log(
                `🏢 Buscando empresa: ${rutEmpresa}`
            );

            try {

                const rutEmpresaLimpio =
                    rutEmpresa
                        .replace(/\./g, '')
                        .trim()
                        .toUpperCase();

                await page.waitForSelector('a', {
                    timeout: 10000
                });

                const links =
                    await page.$$('a');

                let empresaEncontrada = false;

                for (const link of links) {

                    const texto =
                        await page.evaluate(
                            el => el.innerText,
                            link
                        );

                    if (!texto) continue;

                    const textoLimpio =
                        texto
                            .replace(/\./g, '')
                            .trim()
                            .toUpperCase();

                    if (
                        textoLimpio.includes(
                            rutEmpresaLimpio
                        )
                    ) {

                        console.log(
                            `✅ Empresa encontrada: ${texto}`
                        );

                        await Promise.all([

                            link.click(),

                            page.waitForNavigation({
                                waitUntil: 'networkidle2'
                            })
                        ]);

                        empresaEncontrada = true;

                        break;
                    }
                }

                if (!empresaEncontrada) {

                    console.log(
                        '⚠️ No se encontró empresa asociada'
                    );
                }

            } catch (error) {

                console.log(
                    '⚠️ Error seleccionando empresa:',
                    error.message
                );
            }
        }

        // ==========================================
        // EXTRAER DOCUMENTOS
        // ==========================================
        console.log('📥 Extrayendo tabla de documentos...');

        let documentos = [];

        let paginaActual = 1;

        let continuar = true;

        let primerFolioAnterior = null;

        while (continuar) {

            console.log(`⏳ Página ${paginaActual}`);

            // ==========================================
            // URL TABLA
            // ==========================================
            const urlTabla =
                `https://www1.sii.cl/cgi-bin/Portal001/mipeAdminDocsEmi.cgi?RUT_RECP=&FOLIO=&RZN_SOC=&FEC_DESDE=&FEC_HASTA=&TPO_DOC=&ESTADO=&ORDEN=&NUM_PAG=${paginaActual}`;

            await page.goto(urlTabla, {
                waitUntil: 'networkidle2',
                timeout: 60000
            });

            try {

                await page.waitForSelector(
                    'table tbody tr',
                    {
                        timeout: 15000
                    }
                );

            } catch (error) {

                console.log('⚠️ No hay más tablas');

                break;
            }

            // ==========================================
            // EXTRAER TABLA
            // ==========================================
            const datosPagina =
                await page.evaluate(() => {

                    const lista = [];

                    const filas =
                        document.querySelectorAll(
                            'table tbody tr'
                        );

                    filas.forEach(fila => {

                        const celdas =
                            fila.querySelectorAll('td');

                        if (celdas.length >= 8) {

                            const rutCliente =
                                celdas[1]?.innerText.trim();

                            const razonSocial =
                                celdas[2]?.innerText.trim();

                            const documento =
                                celdas[3]?.innerText.trim();

                            const folio =
                                celdas[4]?.innerText.trim();

                            const fechaTexto =
                                celdas[5]?.innerText.trim();

                            const montoTexto =
                                celdas[6]?.innerText || '0';

                            const estado =
                                celdas[7]?.innerText.trim();

                            const montoTotal =
                                parseInt(
                                    montoTexto.replace(/[^0-9]/g, '')
                                ) || 0;

                            // ==========================================
                            // FORMATEAR FECHA
                            // ==========================================
                            let fecha = null;

                            if (fechaTexto) {

                                // Limpiar espacios
                                const fechaLimpia =
                                    fechaTexto
                                        .replace(/\s+/g, '')
                                        .trim();

                                // Buscar patrón fecha
                                const match =
                                    fechaLimpia.match(
                                        /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/
                                    );

                                if (match) {

                                    const dia =
                                        match[1]
                                            .padStart(2, '0');

                                    const mes =
                                        match[2]
                                            .padStart(2, '0');

                                    const anio =
                                        match[3];

                                    fecha =
                                        `${anio}-${mes}-${dia}`;

                                } else {

                                    fecha = fechaLimpia;
                                }
                            }

                            // ==========================================
                            // VALIDAR
                            // ==========================================
                            if (
                                rutCliente &&
                                folio &&
                                !isNaN(folio)
                            ) {

                                // ==========================================
                                // IVA
                                // ==========================================
                                let monto_neto =
                                    Math.round(montoTotal / 1.19);

                                let monto_iva =
                                    montoTotal - monto_neto;

                                let tipo_dte = 33;

                                const docUpper =
                                    documento.toUpperCase();

                                // ==========================================
                                // TIPOS DTE
                                // ==========================================
                                if (
                                    docUpper.includes('EXENTA')
                                ) {

                                    tipo_dte = 34;

                                    monto_neto = montoTotal;

                                    monto_iva = 0;

                                } else if (
                                    docUpper.includes('BOLETA')
                                ) {

                                    tipo_dte = 39;

                                    monto_neto = montoTotal;

                                    monto_iva = 0;

                                } else if (
                                    docUpper.includes('CREDITO')
                                ) {

                                    tipo_dte = 61;

                                } else if (
                                    docUpper.includes('DEBITO')
                                ) {

                                    tipo_dte = 56;
                                }

                                lista.push({

                                    rut_cliente: rutCliente,

                                    razon_social: razonSocial,

                                    documento,

                                    folio: parseInt(folio),

                                    fecha,

                                    estado,

                                    monto_total: montoTotal,

                                    monto_neto,

                                    monto_iva,

                                    tipo_dte
                                });
                            }
                        }
                    });

                    return lista;
                });

            // ==========================================
            // FIN DATOS
            // ==========================================
            if (datosPagina.length === 0) {

                continuar = false;

                break;
            }

            // ==========================================
            // EVITAR LOOP
            // ==========================================
            const primerFolioActual =
                datosPagina[0].folio;

            if (
                primerFolioAnterior === primerFolioActual
            ) {

                console.log('🛑 Fin detectado');

                break;
            }

            primerFolioAnterior =
                primerFolioActual;

            documentos =
                documentos.concat(datosPagina);

            paginaActual++;

            await new Promise(resolve =>
                setTimeout(resolve, 1000)
            );
        }

        // ==========================================
        // RESULTADO
        // ==========================================
        console.log('\n================================');

        console.log(
            `✅ TOTAL EXTRAÍDO: ${documentos.length}`
        );

        console.log('================================');

        console.log(documentos);

        // ==========================================
        // CREAR ARCHIVO .MJS
        // ==========================================
        console.log('\n💾 Generando archivo .mjs...');

        const carpetaDestino =
            path.join(__dirname, 'datos_sii');

        if (!fs.existsSync(carpetaDestino)) {

            fs.mkdirSync(
                carpetaDestino,
                { recursive: true }
            );
        }

        const fechaArchivo =
            new Date()
                .toISOString()
                .replace(/[:.]/g, '-');

        const nombreArchivo =
            `documentos_sii_${fechaArchivo}.mjs`;

        const rutaArchivo =
            path.join(
                carpetaDestino,
                nombreArchivo
            );

        const contenidoArchivo = `
// ==========================================
// ARCHIVO GENERADO AUTOMÁTICAMENTE
// ==========================================

export const documentos = ${JSON.stringify(documentos, null, 4)};

export default documentos;
`;

        fs.writeFileSync(
            rutaArchivo,
            contenidoArchivo,
            'utf8'
        );

        console.log('✅ Archivo .mjs generado');

        console.log(`📂 ${rutaArchivo}`);

        return {
            success: true,
            documentos,
            archivo: rutaArchivo
        };

    } catch (error) {

        console.error(
            `❌ Error durante el proceso: ${error.message}`
        );

        throw error;

    } finally {

        // ==========================================
        // CERRAR SESIÓN SII
        // ==========================================
        if (page && !page.isClosed()) {

            console.log('🧹 Cerrando sesión del SII...');

            try {

                await page.goto(
                    'https://misiir.sii.cl/cgi_misii/siu/cgi_misii_logout',
                    {
                        timeout: 5000,
                        waitUntil: 'domcontentloaded'
                    }
                );

                console.log('✅ Sesión SII cerrada');

            } catch (e) {

                console.log(
                    '⚠️ No se pudo cerrar sesión correctamente'
                );
            }
        }

        // ==========================================
        // CERRAR NAVEGADOR
        // ==========================================
        if (browser) {

            console.log(
                '🛑 Cerrando navegador Puppeteer...'
            );

            await browser.close();
        }

        console.log(
            '🏁 Recursos liberados. ¡Misión Cumplida!'
        );
    }
}