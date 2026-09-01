// ============================================================================
// ELEGIR LA EMPRESA EMISORA EN EL SII · por su RUT, no por su posición
// ----------------------------------------------------------------------------
// SON DOS RUT DISTINTOS, Y CONFUNDIRLOS ES EL ERROR CLÁSICO ACÁ
//
//   · QUIÉN ENTRA al portal: el RUT de una PERSONA con su clave tributaria.
//     Es `DTE_RUT` del entorno (11030124-3, la cuenta master) o el del usuario
//     que apretó el botón, si cargó los suyos en Mi Perfil.
//   · QUIÉN EMITE: el RUT de la EMPRESA a nombre de la cual sale la factura.
//     Es `78306207-0`, VOLLAIRE Y OLIVOS SIMPLE PYME —el mismo que ya estaba
//     en config.js como RUT_EMPRESA_LOCAL y en descargarDocumentoSii.mjs—.
//
// Una persona puede emitir por varias empresas: Matías entra con su RUT y el
// SII le ofrece JUEGOS RETRO CHILE y VOLLAIRE Y OLIVOS. Buscar el RUT del login
// entre las empresas no encuentra nada, porque él no es ninguna de las dos.
//
// EL PROBLEMA QUE RESUELVE
// Cuando la cuenta tiene más de una empresa, el SII pide elegir antes de mostrar
// el formulario. Los cuatro robots resolvían eso tomando «la segunda opción del
// desplegable», a ciegas. Funcionaba de casualidad: VOLLAIRE Y OLIVOS es la
// segunda de la lista. En cuanto el orden cambia —una empresa nueva, u otro
// usuario con otra lista— la segunda ya no es la correcta, y ahí hay dos
// desenlaces y los dos son malos:
//   · No carga el formulario: el robot espera 45 s un campo que no llega. Es el
//     error de `EFXP_RUT_RECEP` que le salió a Mati el 31-08-2026 21:13.
//   · Sí carga: se emite a nombre de la empresa equivocada. Un documento
//     tributario mal emitido no se deshace con un F5, hay que anularlo.
//
// POR QUÉ ABORTA EN VEZ DE SEGUIR
// Si la empresa buscada no está en la lista, esto lanza diciendo cuáles había.
// Emitir con la que no corresponde es peor que no emitir: lo primero se anula
// con el SII, lo segundo se reintenta.
//
// POR QUÉ VIVE EN SU PROPIO ARCHIVO
// Estaba copiado en los cuatro robots, y el 11-08 se arregló en uno solo: el
// comentario de la tarea decía «falta replicar el mismo arreglo en factura
// masiva, exenta manual y exenta masiva». Copiado cuatro veces, se corrige una y
// se olvidan tres. Acá se corrige una vez.
// ============================================================================

// El RUT de la empresa que EMITE. Se puede cambiar por entorno sin tocar código
// —en Railway, con RUT_EMPRESA_EMISORA— y si no está, cae al de siempre, que es
// el que ya usaban config.js y descargarDocumentoSii.mjs.
export const rutEmpresaEmisora = () =>
    process.env.RUT_EMPRESA_EMISORA || '78306207-0';

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
 * Selecciona en el SII la empresa a nombre de la cual se emite.
 *
 * No hace nada si la pantalla de selección no aparece (la cuenta tiene una sola
 * empresa): en ese caso el SII va directo al formulario.
 *
 * OJO con el parámetro: es el RUT de la EMPRESA (78306207-0), NO el de la
 * persona que inició sesión (DTE_RUT). Pasarle el del login hace que no
 * encuentre nada, porque la persona no figura entre las empresas.
 *
 * @param {import('puppeteer').Page} page
 * @param {string} [rutEmisor]  RUT de la empresa emisora. Por omisión, el configurado.
 * @param {(msg: string) => void} [log]
 * @returns {Promise<boolean>} true si eligió una empresa, false si no hubo que elegir
 * @throws Si hay que elegir y la empresa no está entre las opciones
 */
export async function seleccionarEmpresaEmisora(page, rutEmisor = rutEmpresaEmisora(), log = console.log) {
    const selectBox = await page.$('select[name="RUT_EMP"]');
    if (!selectBox) return false;          // una sola empresa: no hay que elegir

    const rutBuscado = String(rutEmisor || '').replace(/\D/g, '');
    if (!rutBuscado) {
        throw new Error(
            'No hay un RUT de empresa emisora configurado, y esta cuenta del SII tiene ' +
            'varias empresas. Revisa la variable RUT_EMPRESA_EMISORA (en Railway, si es producción).'
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
