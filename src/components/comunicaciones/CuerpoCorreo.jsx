// ============================================================================
// Muestra el cuerpo de un correo, venga con formato o sin él.
// ----------------------------------------------------------------------------
// Conviven dos formatos y van a convivir siempre: los 139 envíos y las
// plantillas de antes del editor están en TEXTO PLANO, y lo nuevo viene en
// HTML. Renderizar un texto plano como HTML se comería los saltos de línea;
// renderizar el HTML como texto mostraría las etiquetas crudas. Se distingue y
// listo.
//
// SOBRE `dangerouslySetInnerHTML`: lo que llega acá ya pasó por el saneo del
// servidor —`sanitizarHtmlCorreo`, con lista blanca y parser de verdad— tanto
// al guardar una plantilla como al enviar una campaña. Este componente MUESTRA
// contenido ya limpio; no es el lugar donde se decide si es seguro. Si algún
// día se muestra acá un cuerpo que no pasó por el servidor, hay que sanearlo
// antes de llegar.
// ============================================================================
import React from 'react';

const HTML = /<(p|br|div|span|strong|b|em|i|u|s|a|ul|ol|li|h[1-3]|blockquote|table)\b[^>]*>/i;

export const esHtmlCorreo = (texto) => HTML.test(String(texto || ''));

/**
 * Prepara un cuerpo guardado para METERLO en el editor con formato.
 *
 * Sin esto, cargar una plantilla de las de antes destruía el texto: son texto
 * plano, y al asignarlas como HTML los saltos de línea desaparecen y el correo
 * queda en un solo párrafo corrido. Se convierten a párrafos de verdad, que es
 * como se veían al enviarse.
 *
 * Se escapa primero: si el texto plano trae un «<» —«el saldo es < 5.000»— sin
 * escapar el navegador se lo comería como una etiqueta a medio abrir.
 */
export const aHtmlEditor = (texto) => {
    const s = String(texto || '');
    if (!s.trim()) return '';
    if (HTML.test(s)) return s;
    const esc = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return s.split(/\n{2,}/)
        .map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
        .join('');
};

const CuerpoCorreo = ({ texto, className = '' }) => {
    const contenido = String(texto || '');
    if (!contenido.trim()) {
        return <p className={`italic text-slate-400 ${className}`}>(no se guardó el texto de este envío)</p>;
    }
    if (!HTML.test(contenido)) {
        return <p className={`whitespace-pre-wrap ${className}`}>{contenido}</p>;
    }
    return (
        <div
            className={`[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
                        [&_a]:text-emerald-700 [&_a]:underline [&_p]:mb-2 ${className}`}
            dangerouslySetInnerHTML={{ __html: contenido }}
        />
    );
};

export default CuerpoCorreo;
