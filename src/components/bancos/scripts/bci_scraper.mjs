import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());
const pausa = (ms) => new Promise(res => setTimeout(res, ms));

export async function iniciarNavegador() {
    return await puppeteer.launch({
        headless: false, 
        args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
        defaultViewport: null
    });
}

export async function loginBCI(page, rutCompleto, clave) {
    console.log(`\n[+] Cargando portal Bci Empresas...`);
    await page.goto('https://www.bci.cl/empresas', { waitUntil: 'networkidle2' });

    console.log('[-] Abriendo Banco en línea...');
    const selectorBoton = 'button.btn_login'; 
    await page.waitForSelector(selectorBoton, { visible: true, timeout: 15000 });
    await page.click(selectorBoton);

    console.log('[-] Esperando modal de login...');
    await page.waitForSelector('#rut_aux', { visible: true, timeout: 15000 });
    await pausa(500);

    console.log('[+] Ingresando credenciales...');
    await page.type('#rut_aux', rutCompleto, { delay: 50 });
    await page.type('#clave_aux', clave, { delay: 50 });
    
    console.log('[+] Haciendo clic en INGRESAR...');
    await page.focus('#clave_aux');
    await page.keyboard.press('Enter');

    await page.evaluate(() => {
        const elementos = Array.from(document.querySelectorAll('button, a, input[type="button"], input[type="submit"]'));
        const btnIngresar = elementos.find(el => (el.innerText || el.value || '').trim().toUpperCase() === 'INGRESAR');
        if (btnIngresar) btnIngresar.click();
    });
    
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});

    console.log('[-] Verificando pantalla de enrolamiento...');
    await pausa(2000); 
    try {
        const btnEnrolarLuego = '::-p-text(Enrolar Luego)';
        await page.waitForSelector(btnEnrolarLuego, { timeout: 5000 });
        await page.click(btnEnrolarLuego);
        console.log('[+] Enrolamiento saltado con éxito.');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    } catch (e) {
        console.log('[-] No apareció enrolamiento, continuando...');
    }
}

export async function extraerMovimientosBCI(page) {
    page.on('dialog', async dialog => {
        console.log(`\n[!] Alerta del banco interceptada: "${dialog.message()}"`);
        await dialog.accept(); 
    });

    console.log('\n[+] Esperando a que cargue el dashboard de cuentas...');
    await pausa(5000); 

    console.log('[-] Buscando la cuenta...');
    let clicExitoso = false;
    
    const buscarYClicarRUT = async (contexto) => {
        try {
            const links = await contexto.$$('a');
            for (const link of links) {
                const texto = await contexto.evaluate(el => el.textContent.trim(), link);
                if (texto.match(/\d{7,}/)) { 
                    console.log(`[+] ¡Haciendo clic en la cuenta: ${texto}!`);
                    await link.click();
                    return true;
                }
            }
        } catch (e) {}
        return false;
    };

    clicExitoso = await buscarYClicarRUT(page);
    if (!clicExitoso) {
        for (const frame of page.frames()) {
            clicExitoso = await buscarYClicarRUT(frame);
            if (clicExitoso) break;
        }
    }

    if (clicExitoso) {
        await pausa(5000); 
    } else {
        console.log('[!] No se encontró el número de cuenta. Asumiendo que ya estamos en la vista...');
    }

    console.log('[-] Buscando el menú lateral "Movimientos Históricos"...');
    let marcoPrincipal = page;
    let encontroMenu = false;
    const selectorMenu = 'a[href*="inicioMovimientosHistoricos.do"]';

    for (const frame of page.frames()) {
        try {
            const link = await frame.$(selectorMenu);
            if (link) {
                console.log('[+] ¡Enlace de Movimientos Históricos encontrado!');
                await Promise.all([
                    frame.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
                    link.click()
                ]);
                marcoPrincipal = frame; 
                encontroMenu = true;
                break;
            }
        } catch (e) {}
    }

    if (!encontroMenu) {
        console.log('[-] No se pudo hacer clic normal, intentando inyección JS...');
        for (const frame of page.frames()) {
            const clickJS = await frame.evaluate((sel) => {
                const a = document.querySelector(sel);
                if (a) { a.click(); return true; }
                return false;
            }, selectorMenu);
            if (clickJS) {
                marcoPrincipal = frame;
                await pausa(4000);
                break;
            }
        }
    }

    console.log('[-] Esperando el selector de meses...');
    await pausa(3000);
    
    let marcoContenido = page.frames().find(f => f.url().includes('inicioMovimientosHistoricos.do')) || marcoPrincipal;
    const selectorDropdown = 'select[name="periodoSeleccionado"]';

    try {
        await marcoContenido.waitForSelector(selectorDropdown, { timeout: 15000 });
    } catch (e) {
        marcoContenido = page;
        await marcoContenido.waitForSelector(selectorDropdown, { timeout: 10000 }).catch(()=>{});
    }

    const opcionesMeses = await marcoContenido.$$eval(`${selectorDropdown} option`, options => {
        return options
            .map(option => ({ text: option.innerText.trim(), value: option.value }))
            .filter(opt => opt.value !== '-1'); 
    });

    console.log(`[+] Se encontraron ${opcionesMeses.length} meses válidos para iterar.`);
    
    // AQUÍ CREAMOS UN OBJETO PARA AGRUPAR MES POR MES EN LUGAR DE UNA LISTA PLANA
    let movimientosPorMes = {};

    for (const mes of opcionesMeses) {
        console.log(`\n--- 📅 Consultando: ${mes.text} ---`);
        
        // Inicializamos el arreglo para este mes específico
        movimientosPorMes[mes.text] = [];
        
        await marcoContenido.select(selectorDropdown, mes.value); 
        await pausa(2000); 
        
        await marcoContenido.evaluate(() => {
            const btnBuscar = Array.from(document.querySelectorAll('button, input, a')).find(el => el.textContent.trim() === 'Buscar' || el.value === 'Buscar');
            if (btnBuscar) btnBuscar.click();
        });
        
        await marcoContenido.waitForSelector('table', { timeout: 15000 }).catch(()=>{});
        await pausa(2500); 

        let hayMasPaginas = true;
        let paginaActual = 1;

        while (hayMasPaginas) {
            console.log(`[-] Extrayendo datos de la página ${paginaActual}...`);
            
            const movimientosPagina = await marcoContenido.$$eval('table tr', (rows) => {
                let data = [];
                for (let i = 1; i < rows.length; i++) {
                    const celdas = rows[i].querySelectorAll('td');
                    if (celdas.length >= 6 && !celdas[0].innerText.includes('Fecha')) { 
                        data.push({
                            fecha: celdas[0].innerText.trim(),
                            oficina: celdas[1].innerText.trim(),
                            movimiento: celdas[2].innerText.trim(),
                            documento: celdas[3].innerText.trim(),
                            cargo: parseInt(celdas[4].innerText.replace(/\D/g, '')) || 0,
                            abono: parseInt(celdas[5].innerText.replace(/\D/g, '')) || 0,
                            saldo: parseInt(celdas[6] ? celdas[6].innerText.replace(/\D/g, '') : '0') || 0
                        });
                    }
                }
                return data;
            });

            // Agregamos los datos directamente al mes correspondiente
            movimientosPorMes[mes.text].push(...movimientosPagina);
            console.log(`    -> Extraídos ${movimientosPagina.length} movimientos.`);
            
            try {
                const btnSiguienteExiste = await marcoContenido.evaluate(() => {
                    const elements = Array.from(document.querySelectorAll('a, button, span'));
                    const btn = elements.find(el => el.textContent.trim() === 'Siguiente >' && el.offsetParent !== null);
                    if (btn && !btn.className.includes('disabled')) { 
                        btn.click();
                        return true;
                    }
                    return false;
                });

                if (btnSiguienteExiste) {
                    await pausa(3000); 
                    paginaActual++;
                } else {
                    hayMasPaginas = false;
                }
            } catch (e) { 
                hayMasPaginas = false; 
            }
        }
        
        console.log('[-] Refrescando la vista para el próximo mes...');
        try {
            const btnMenu = await marcoContenido.$(selectorMenu);
            if (btnMenu) {
                await btnMenu.click();
                await pausa(3000);
            }
        } catch (e) {}
    }

    return movimientosPorMes;
}

export async function cerrarSesionBCI(page) {
    console.log(`\n🚪 Cerrando sesión en Bci...`);
    try {
        if (page && !page.isClosed()) {
            await page.evaluate(() => {
                const botones = Array.from(document.querySelectorAll('a, button, span'));
                const btnSalir = botones.find(el => el.textContent.trim().toLowerCase().includes('cerrar sesión') || el.textContent.trim().toLowerCase().includes('salir'));
                if (btnSalir) btnSalir.click();
            });
            await pausa(3000);
        }
    } catch (e) {}
}