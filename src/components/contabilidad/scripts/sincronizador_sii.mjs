import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

// ==========================================
// FUNCIÓN PRINCIPAL
// ==========================================
export async function ejecutarRobotSII({ rut, clave, mesDesde, anioDesde, mesHasta, anioHasta }) {
    // Defaults: si no se pasa rango, usa el mes actual
    const now = new Date();
    const _mesHasta = parseInt(mesHasta) || (now.getMonth() + 1);
    const _anioHasta = parseInt(anioHasta) || now.getFullYear();
    const _mesDesde = parseInt(mesDesde) || _mesHasta;
    const _anioDesde = parseInt(anioDesde) || _anioHasta;

    console.log(`\n🚀 Iniciando Robot SII | Rango: ${_mesDesde}/${_anioDesde} → ${_mesHasta}/${_anioHasta}`);

    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized']
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);

    // Variable maestra para acumular todo
    let masterData = [];

    try {
        // 1. LOGIN
        await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?https://www4.sii.cl/consdcvinternetui/', { waitUntil: 'networkidle2' });
        await page.type('#rut', rut.replace(/[^0-9kK]/gi, ''));
        await page.type('#clave', clave);
        await Promise.all([page.click('#bt_ingresar'), page.waitForNavigation({ waitUntil: 'networkidle2' })]);
        
        await page.goto('https://www4.sii.cl/consdcvinternetui/', { waitUntil: 'networkidle2' });

        // 2. CICLO: desde mesHasta/anioHasta hacia atrás hasta mesDesde/anioDesde
        let anio = _anioHasta;
        let mes = _mesHasta;

        while (anio > _anioDesde || (anio === _anioDesde && mes >= _mesDesde)) {
            console.log(`\n📅 --- PROCESANDO PERIODO: ${mes}/${anio} ---`);
            
            await matarPopups(page);
            await prepararYConsultarRCV(page, anio, mes);
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
        console.error("❌ Error crítico:", e.message);
        return { success: false };
    } finally {
        // Guardar archivo único
        const dir = path.join(process.cwd(), 'src', 'components', 'contabilidad', 'scripts', 'datos_sii');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        const rutaFinal = path.join(dir, 'reporte_completo_sii.json');
        fs.writeFileSync(rutaFinal, JSON.stringify(masterData, null, 2));
        console.log(`💾 Reporte único guardado en: ${rutaFinal}`);

        await cerrarSesion(page);
        await browser.close();
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

async function prepararYConsultarRCV(page, anio, mes) {
    await page.evaluate((a, m) => {
        const selects = document.querySelectorAll('select');
        if (selects[0]) { selects[0].selectedIndex = selects[0].options.length - 1; selects[0].dispatchEvent(new Event('change')); }
        if (selects[1]) { selects[1].value = m.toString().padStart(2, '0'); selects[1].dispatchEvent(new Event('change')); }
        if (selects[2]) { selects[2].value = a.toString(); selects[2].dispatchEvent(new Event('change')); }
    }, anio, mes);
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