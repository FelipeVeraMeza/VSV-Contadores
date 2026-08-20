// ============================================================================
// EL CUERPO DEL CORREO CON FORMATO  ·  sanitizado y compatible hacia atrás
// ----------------------------------------------------------------------------
// Hasta ahora el cuerpo era TEXTO PLANO: se escapaba entero y los saltos de
// línea se volvían <br>. Con el editor con formato pasa a ser HTML, y eso
// cambia quién es responsable de que no entre basura.
//
// POR QUÉ SE SANEA EN EL SERVIDOR Y NO EN LA PANTALLA
// El HTML que llega no se puede creer aunque lo haya producido nuestro propio
// editor: viaja por una petición que cualquiera con sesión puede escribir a
// mano. Y ese mismo HTML se vuelve a MOSTRAR en nuestra app —en la vista
// previa y en el historial—, así que un `<script>` guardado no sería solo un
// correo feo: sería código ejecutándose en la pantalla del siguiente que abra
// el registro.
//
// POR QUÉ CON UN PARSER Y NO CON EXPRESIONES REGULARES
// Sanear HTML a punta de regex es de esos problemas que parecen resueltos
// hasta que alguien escribe `<scr<script>ipt>`. `cheerio` ya estaba en el
// proyecto y parsea de verdad, así que el saneo trabaja sobre el árbol: lo que
// no está en la lista blanca no existe, sin importar cómo se haya escrito.
//
// COMPATIBILIDAD
// Hay 139 envíos y varias plantillas guardadas en texto plano. Nada de eso se
// migra: `esHtmlCorreo` distingue unos de otros y cada uno se arma como
// corresponde. Un cuerpo viejo se sigue viendo igual que el día que se mandó.
// ============================================================================
import * as cheerio from 'cheerio';

// Lo que un correo necesita de verdad. Todo lo demás sobra y varias cosas son
// peligrosas: `img` queda fuera a propósito —Gmail borra las imágenes `data:`
// y la firma ya viaja aparte como adjunto en línea con `cid:`—.
const TAGS_PERMITIDAS = new Set([
    'p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
    'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'blockquote', 'hr',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
]);

// Estas no se «desenvuelven» dejando su contenido: se borran con todo adentro.
// El texto de un <script> no es texto que nadie quiera leer en un correo.
const TAGS_A_BORRAR = new Set([
    'script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button',
    'select', 'textarea', 'link', 'meta', 'noscript', 'svg', 'math', 'img',
    'video', 'audio', 'base', 'title', 'head',
]);

// Estilos que puede producir la barra de formato. El resto se descarta: nadie
// necesita `position:fixed` en un correo, y varios clientes lo usan como señal
// de spam.
const ESTILOS_PERMITIDOS = new Set([
    'color', 'background-color', 'font-size', 'font-weight', 'font-style',
    'text-decoration', 'text-align',
]);

const ESQUEMA_SEGURO = /^(https?:|mailto:)/i;

// `url(...)` y `expression(...)` son las dos formas clásicas de meter algo
// ejecutable o una petición a un tercero dentro de un atributo de estilo.
const ESTILO_SOSPECHOSO = /url\s*\(|expression\s*\(|javascript:|@import/i;

const filtrarEstilo = (valor) => String(valor || '')
    .split(';')
    .map(d => d.trim())
    .filter(Boolean)
    .filter(d => {
        const i = d.indexOf(':');
        if (i < 1) return false;
        const prop = d.slice(0, i).trim().toLowerCase();
        const val = d.slice(i + 1).trim();
        return ESTILOS_PERMITIDOS.has(prop) && !ESTILO_SOSPECHOSO.test(val);
    })
    .join('; ');

const limpiarAtributos = ($, el) => {
    const tag = el.tagName?.toLowerCase();
    for (const nombre of Object.keys(el.attribs || {})) {
        const bajo = nombre.toLowerCase();
        const valor = el.attribs[nombre];

        // `onclick`, `onerror` y familia: fuera sin excepción.
        if (bajo.startsWith('on')) { $(el).removeAttr(nombre); continue; }

        if (bajo === 'style') {
            const limpio = filtrarEstilo(valor);
            if (limpio) $(el).attr('style', limpio);
            else $(el).removeAttr(nombre);
            continue;
        }

        // Un enlace `javascript:` es exactamente lo que estamos evitando; se le
        // quita el href y queda como texto, que es más honesto que borrarlo.
        if (bajo === 'href' && tag === 'a') {
            if (!ESQUEMA_SEGURO.test(String(valor).trim())) $(el).removeAttr(nombre);
            continue;
        }

        $(el).removeAttr(nombre);
    }

    // Que el enlace abra fuera y sin darle acceso a la pestaña de origen.
    if (tag === 'a' && el.attribs?.href) {
        $(el).attr('target', '_blank');
        $(el).attr('rel', 'noopener noreferrer');
    }
};

// OJO CON ESTO: en el árbol que produce el parser, `<script>` y `<style>` NO
// son de tipo 'tag' —tienen tipo propio, 'script' y 'style'—. Comprobar solo
// `type === 'tag'` los daba por nodos de texto y los dejaba pasar enteros,
// justo las dos etiquetas que más importa borrar. Lo cazó la prueba del
// sanitizador; a ojo no se ve.
const esElemento = (n) => n.type === 'tag' || n.type === 'script' || n.type === 'style';

// Se recorre de abajo hacia arriba: si se procesara el padre primero, al
// desenvolverlo sus hijos volverían al árbol ya sin revisar.
const limpiarNodo = ($, el) => {
    for (const hijo of $(el).contents().toArray()) {
        if (esElemento(hijo)) limpiarNodo($, hijo);
        else if (hijo.type === 'comment') $(hijo).remove();
    }
    const tag = el.tagName?.toLowerCase();
    if (TAGS_A_BORRAR.has(tag)) { $(el).remove(); return; }
    if (!TAGS_PERMITIDAS.has(tag)) { $(el).replaceWith($(el).contents()); return; }
    limpiarAtributos($, el);
};

// Al poner una marca en negrita a medias, el editor la parte:
// `{{emp<strong>resa}}</strong>`. Así ya no la reconoce el reemplazo y el
// cliente recibe la marca cruda. Se reparan las etiquetas que hayan quedado
// DENTRO de una marca; el formato de alrededor no se toca.
const repararMarcas = (html) =>
    String(html).replace(/\{\{[\s\S]{0,300}?\}\}/g, (m) =>
        m.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' '));

/** ¿Este cuerpo guardado es HTML del editor, o texto plano de los de antes? */
export const esHtmlCorreo = (texto) =>
    /<(p|br|div|span|strong|b|em|i|u|s|a|ul|ol|li|h[1-3]|blockquote|table)\b[^>]*>/i
        .test(String(texto || ''));

/** Deja el HTML con solo lo permitido. Devuelve '' si no queda nada. */
export const sanitizarHtmlCorreo = (html) => {
    if (!html) return '';
    const $ = cheerio.load(String(html), null, false);
    // `contents()` y no `children()`: children solo devuelve etiquetas, así que
    // un comentario suelto en la raíz se colaba entero. No es adorno — los
    // comentarios condicionales (`<!--[if IE]>…`) son una vía conocida para
    // esconder contenido que algunos clientes de correo sí ejecutan.
    for (const nodo of $.root().contents().toArray()) {
        if (esElemento(nodo)) limpiarNodo($, nodo);
        else if (nodo.type === 'comment') $(nodo).remove();
    }
    return repararMarcas($.root().html() || '').trim();
};

/**
 * El mismo cuerpo en texto pelado. Sirve para dos cosas distintas:
 * saber si el correo está VACÍO de verdad —`<p><br></p>` ocupa 12 caracteres
 * y no dice nada— y para los resúmenes de una línea del historial.
 */
export const textoPlanoDeHtml = (html) => {
    if (!html) return '';
    const $ = cheerio.load(String(html), null, false);
    $('br').replaceWith('\n');
    $('p, div, li, tr, h1, h2, h3, blockquote').after('\n');
    return $.root().text().replace(/\n{3,}/g, '\n\n').trim();
};

/** ¿Tiene contenido de verdad? Vale para cuerpos con y sin formato. */
export const cuerpoVacio = (cuerpo) =>
    !(esHtmlCorreo(cuerpo) ? textoPlanoDeHtml(cuerpo) : String(cuerpo || '')).trim();

/**
 * Escapa un valor que se va a INSERTAR dentro de un cuerpo HTML.
 *
 * Cuando el cuerpo era texto plano se escapaba todo junto al final, así que una
 * razón social con `&` o `<` quedaba a salvo sola. Con HTML eso ya no sirve
 * —escapar el cuerpo entero borraría el formato— así que hay que escapar cada
 * valor al momento de reemplazar la marca. Sin esto, un cliente llamado
 * «GÓMEZ & CÍA <SPA>» rompería el correo de todos los demás.
 */
export const escaparValor = (v) => String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
