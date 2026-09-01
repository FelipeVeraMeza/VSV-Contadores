// ============================================================================
// ELEGIR LA EMPRESA EMISORA EN EL SII · por su RUT, no por su posición
// ----------------------------------------------------------------------------
// EL PROBLEMA QUE RESUELVE
// Cuando una cuenta del SII tiene más de una empresa, el portal pide elegir con
// cuál se emite antes de mostrar el formulario. Los cuatro robots de facturación
// —factura manual, factura masiva, exenta manual y exenta masiva— resolvían eso
// tomando «la segunda opción del desplegable», a ciegas.
//
// Y el RUT correcto lo tenían ahí mismo: `credSii.DTE_RUT`, que sale de las
// variables de entorno (Railway en producción) o de las credenciales propias del
// usuario que factura. El robot sabía con qué empresa emitir y elegía por
// posición igual.
//
// Eso falla de dos formas, y las dos pasaron:
//   · Si el orden cambia —una empresa nueva, o el usuario entra con SUS
//     credenciales y ve otra lista— la segunda ya no es la que se quiere. El
//     robot seguía y se quedaba esperando 45 s un formulario que no llegaba.
//     Es el error de `EFXP_RUT_RECEP` que le salió a Mati el 31-08-2026.
//   · Peor: si sí cargaba, emitía a nombre de la empresa equivocada. Un
//     documento tributario mal emitido no se deshace con un F5.
//
// POR QUÉ ABORTA EN VEZ DE SEGUIR
// Si el RUT buscado no está en la lista, esto lanza. Emitir con la empresa que
// no corresponde es peor que no emitir: lo primero hay que anularlo con el SII,
// lo segundo se reintenta.
//
// POR QUÉ VIVE EN SU PROPIO ARCHIVO
// Estaba copiado en los cuatro robots, y el 11-08 se arregló en uno solo: el
// comentario de la tarea decía «falta replicar el mismo arreglo en factura
// masiva, exenta manual y exenta masiva». Copiado cuatro veces, se corrige una y
// se olvidan tres. Acá se corrige una vez.
// ============================================================================

// Saca el CUERPO del RUT (sin dígito verificador) de una cadena cualquiera.
//
// El SII escribe el RUT de varias formas y hay que reconocerlas todas: en el
// `value` de la opción («11030124-3», «11030124») o dentro del texto visible
// junto al nombre («11.030.124-3 SIMPLE PYME»).
//
// El detalle que importa: NO se puede limpiar toda la cadena de golpe con
// replace(/\D/g,''). Con «11.030.124-3 SIMPLE PYME» eso daría 110301243 mezclado
// con cualquier dígito del nombre —una razón social como «COMERCIAL 2000 SPA»
// aportaría los suyos— y la comparación fallaría o, peor, calzaría con la
// empresa equivocada. Por eso se busca el PATRÓN de un RUT dentro del texto y se
// toma solo eso.
const cuerpoRut = (valor) => {
    const texto = String(valor || '');
    // Un RUT chileno dentro de un texto: 7-8 dígitos con puntos opcionales,
    // seguidos opcionalmente de guion y dígito verificador.
    const m = texto.match(/(\d{1,3}(?:\.\d{3}){1,2}|\d{7,8})\s*-?\s*([\dkK])?(?!\d)/);
    if (m) return m[1].replace(/\D/g, '');
    // Sin patrón reconocible: se cae a los dígitos sueltos, quitando el DV si
    // la cadena era un RUT pegado sin separadores.
    const soloNumeros = texto.replace(/\D/g, '');
    return soloNumeros.length > 8 ? soloNumeros.slice(0, -1) : soloNumeros;
};

/**
 * Selecciona en el SII la empresa cuyo RUT calza con el configurado.
 *
 * No hace nada si la pantalla de selección no aparece (cuenta con una sola
 * empresa): en ese caso el SII va directo al formulario.
 *
 * @param {import('puppeteer').Page} page
 * @param {string} rutEmisor  El RUT configurado (credSii.DTE_RUT)
 * @param {(msg: string) => void} [log]
 * @returns {Promise<boolean>} true si eligió una empresa, false si no hubo que elegir
 * @throws Si hay que elegir y el RUT buscado no está entre las opciones
 */
export async function seleccionarEmpresaEmisora(page, rutEmisor, log = console.log) {
    const selectBox = await page.$('select[name="RUT_EMP"]');
    if (!selectBox) return false;          // una sola empresa: no hay que elegir

    const rutBuscado = String(rutEmisor || '').replace(/\D/g, '');
    if (!rutBuscado) {
        throw new Error(
            'No hay un RUT emisor configurado, y esta cuenta del SII tiene varias empresas. ' +
            'Revisa la variable DTE_RUT (en Railway, si es producción).'
        );
    }

    log(`🏢 Buscando la empresa emisora ${rutEmisor} en el desplegable del SII...`);

    // OJO: esta función corre DENTRO del navegador, así que no puede usar
    // `cuerpoRut` de arriba —no existe en ese contexto— y la lógica va repetida
    // a propósito. Las dos tienen que decir lo mismo; si se toca una, se toca la
    // otra. La prueba de tmp/_rut.mjs cubre exactamente estos casos.
    const eleccion = await page.evaluate((rutObjetivo) => {
        const sel = document.querySelector('select[name="RUT_EMP"]');
        if (!sel) return { valor: null, disponibles: [] };
        const opciones = [...sel.options].map(o => ({ valor: o.value, texto: o.text }));
        const cuerpo = (v) => {
            const t = String(v || '');
            const m = t.match(/(\d{1,3}(?:\.\d{3}){1,2}|\d{7,8})\s*-?\s*([\dkK])?(?!\d)/);
            if (m) return m[1].replace(/\D/g, '');
            const n = t.replace(/\D/g, '');
            return n.length > 8 ? n.slice(0, -1) : n;
        };
        const objetivo = cuerpo(rutObjetivo);
        const calza = opciones.find(o => cuerpo(o.valor) === objetivo || cuerpo(o.texto) === objetivo);
        return { valor: calza ? calza.valor : null, disponibles: opciones.map(o => o.texto) };
    }, rutBuscado);

    if (!eleccion.valor) {
        throw new Error(
            `La empresa con RUT ${rutEmisor} no aparece entre las que puede emitir esta cuenta del SII. ` +
            `El desplegable ofrecía: ${eleccion.disponibles.filter(Boolean).join(' | ') || '(vacío)'}. ` +
            `Revisa que el RUT emisor configurado sea el correcto y que esté habilitado para facturar.`
        );
    }

    log('🏢 Empresa emisora encontrada, seleccionando...');
    await page.select('select[name="RUT_EMP"]', eleccion.valor);
    await new Promise(r => setTimeout(r, 500));
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        page.evaluate(() => { document.querySelector('button[type="submit"], input[type="submit"]').click(); }),
    ]);
    return true;
}

export { cuerpoRut };
