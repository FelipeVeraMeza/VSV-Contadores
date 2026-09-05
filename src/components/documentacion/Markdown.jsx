// =====================================================================
// MARKDOWN · lo justo para leer la documentación del proyecto
// ---------------------------------------------------------------------
// POR QUÉ NO SE USA UNA LIBRERÍA
// Las de siempre —marked, react-markdown— traen un parser completo con soporte
// de HTML embebido. Eso significa que un documento podría inyectar etiquetas
// en la página, y habría que sumarle un sanitizador encima. Dos dependencias
// nuevas para mostrar los .md que ya escribimos nosotros.
//
// Acá se recorre el texto y se dibujan elementos de React. Nunca se genera
// HTML a partir del texto —no hay `dangerouslySetInnerHTML` en ninguna parte—,
// así que lo que venga en el archivo se muestra como texto y no se ejecuta.
//
// QUÉ ENTIENDE
// Lo que usan de verdad los documentos del proyecto:
//   · Encabezados ## y ###          · Listas con · - *
//   · Tablas                        · Bloques de código
//   · **negrita** y `código`        · Citas con >
//   · Separadores ---
//
// Lo que NO entiende —enlaces, imágenes, listas numeradas anidadas— se muestra
// como texto plano. Es a propósito: agregar casos que ningún documento usa es
// código que nadie prueba.
// =====================================================================
import React from 'react';

/** Negrita y `código` dentro de una línea. */
const conFormato = (texto, clave) => {
    // Se parte por los dos marcadores a la vez para no recorrer el texto dos
    // veces y no tener que decidir cuál gana cuando se cruzan.
    const partes = String(texto).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return partes.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**') && p.length > 4) {
            return <strong key={`${clave}-${i}`} className="font-semibold text-slate-900">{p.slice(2, -2)}</strong>;
        }
        if (p.startsWith('`') && p.endsWith('`') && p.length > 2) {
            return (
                <code key={`${clave}-${i}`}
                      className="font-mono text-[11px] bg-slate-100 text-slate-700 rounded px-1 py-0.5">
                    {p.slice(1, -1)}
                </code>
            );
        }
        return p;
    });
};

/** El id del encabezado, igual que el que calcula el servidor para el índice. */
const ancla = (t) => String(t)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const Markdown = ({ texto }) => {
    if (!texto) return null;

    const bloques = [];
    // Los finales de línea de Windows se normalizan ACÁ, antes de partir el
    // texto. Si el \r se deja, cada línea termina con él y las reglas dejan de
    // coincidir. El caso que rompía todo: «# Titulo\r» NO da encabezado —la
    // regex ancla con $ y el \r queda fuera— pero startsWith('#') sí da
    // verdadero, así que el bucle de párrafo también lo excluye y el índice
    // nunca avanza.
    //
    // Resultado: bucle infinito en la PRIMERA línea del documento, con la
    // pestaña colgada. No era lentitud ni una consulta pesada; el servidor ya
    // había respondido el documento entero.
    const lineas = texto.replace(/\r\n?/g, '\n').split('\n');
    let i = 0;

    while (i < lineas.length) {
        const l = lineas[i];

        // ── Bloque de código ───────────────────────────────────────────────
        if (l.startsWith('```')) {
            const cuerpo = [];
            i++;
            while (i < lineas.length && !lineas[i].startsWith('```')) { cuerpo.push(lineas[i]); i++; }
            i++;   // se salta el ``` de cierre
            bloques.push(
                <pre key={`c${i}`}
                     className="bg-slate-900 text-slate-100 rounded-xl p-3 my-3 overflow-x-auto text-[11px] font-mono leading-relaxed">
                    {cuerpo.join('\n')}
                </pre>
            );
            continue;
        }

        // ── Tabla ──────────────────────────────────────────────────────────
        // Se reconoce por la línea de guiones bajo la cabecera: |---|---|
        if (l.startsWith('|') && lineas[i + 1] && /^\|[\s:|-]+\|$/.test(lineas[i + 1].trim())) {
            const celdas = (fila) => fila.split('|').slice(1, -1).map(c => c.trim());
            const cabecera = celdas(l);
            i += 2;
            const filas = [];
            while (i < lineas.length && lineas[i].startsWith('|')) { filas.push(celdas(lineas[i])); i++; }
            bloques.push(
                // La tabla scrollea en su propio contenedor: si no, una tabla
                // ancha empuja la página entera y se lee peor todo lo demás.
                <div key={`t${i}`} className="overflow-x-auto my-3">
                    <table className="w-full text-[11.5px] border-collapse">
                        <thead>
                            <tr className="border-b border-[#efe8dd]">
                                {cabecera.map((c, j) => (
                                    <th key={j} className="text-left py-1.5 pr-3 font-semibold text-slate-600">
                                        {conFormato(c, `th${j}`)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filas.map((f, j) => (
                                <tr key={j} className="border-b border-[#f5f0e8] last:border-0">
                                    {f.map((c, k) => (
                                        <td key={k} className="py-1.5 pr-3 text-slate-700 align-top">
                                            {conFormato(c, `td${j}-${k}`)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
            continue;
        }

        // ── Encabezados ────────────────────────────────────────────────────
        const h = /^(#{1,4})\s+(.+)$/.exec(l);
        if (h) {
            const nivel = h[1].length;
            const texto = h[2].replace(/[*_`]/g, '').trim();
            const id = ancla(texto);
            if (nivel === 1) {
                bloques.push(<h1 key={i} id={id} className="text-lg font-bold text-slate-900 mt-1 mb-3">{texto}</h1>);
            } else if (nivel === 2) {
                bloques.push(
                    <h2 key={i} id={id}
                        className="text-[15px] font-bold text-slate-900 mt-6 mb-2 pb-1.5 border-b border-[#efe8dd] scroll-mt-4">
                        {texto}
                    </h2>
                );
            } else {
                bloques.push(
                    <h3 key={i} id={id} className="text-[13px] font-bold text-slate-800 mt-4 mb-1.5 scroll-mt-4">
                        {texto}
                    </h3>
                );
            }
            i++;
            continue;
        }

        // ── Cita ───────────────────────────────────────────────────────────
        if (l.startsWith('>')) {
            const cuerpo = [];
            while (i < lineas.length && lineas[i].startsWith('>')) { cuerpo.push(lineas[i].replace(/^>\s?/, '')); i++; }
            bloques.push(
                <blockquote key={`q${i}`}
                            className="border-l-[3px] border-amber-300 bg-amber-50/50 pl-3 py-2 my-3 text-[12px] text-slate-700">
                    {cuerpo.map((c, j) => <p key={j} className="mb-1 last:mb-0">{conFormato(c, `q${j}`)}</p>)}
                </blockquote>
            );
            continue;
        }

        // ── Separador ──────────────────────────────────────────────────────
        if (/^---+$/.test(l.trim())) {
            bloques.push(<hr key={i} className="my-5 border-[#efe8dd]" />);
            i++;
            continue;
        }

        // ── Lista ──────────────────────────────────────────────────────────
        if (/^\s*[·\-*]\s+/.test(l)) {
            const items = [];
            while (i < lineas.length && /^\s*[·\-*]\s+/.test(lineas[i])) {
                // La sangría define el nivel; se conserva para que las listas
                // anidadas de los documentos no queden todas al mismo margen.
                const sangria = (lineas[i].match(/^\s*/) || [''])[0].length;
                items.push({ texto: lineas[i].replace(/^\s*[·\-*]\s+/, ''), sangria });
                i++;
            }
            bloques.push(
                <ul key={`l${i}`} className="my-2 space-y-1">
                    {items.map((it, j) => (
                        <li key={j} className="text-[12px] text-slate-700 flex gap-2"
                            style={{ marginLeft: Math.min(it.sangria, 8) * 6 }}>
                            <span className="text-slate-300 shrink-0">·</span>
                            <span>{conFormato(it.texto, `li${j}`)}</span>
                        </li>
                    ))}
                </ul>
            );
            continue;
        }

        // ── Línea en blanco ────────────────────────────────────────────────
        if (!l.trim()) { i++; continue; }

        // ── Párrafo ────────────────────────────────────────────────────────
        const parrafo = [];
        while (i < lineas.length && lineas[i].trim()
               && !lineas[i].startsWith('#') && !lineas[i].startsWith('|')
               && !lineas[i].startsWith('>') && !lineas[i].startsWith('```')
               && !/^\s*[·\-*]\s+/.test(lineas[i]) && !/^---+$/.test(lineas[i].trim())) {
            parrafo.push(lineas[i]);
            i++;
        }
        if (parrafo.length) {
            bloques.push(
                <p key={`p${i}`} className="text-[12px] text-slate-700 leading-relaxed my-2">
                    {conFormato(parrafo.join(' '), `p${i}`)}
                </p>
            );
        }
    }

    return <div>{bloques}</div>;
};

export default Markdown;
