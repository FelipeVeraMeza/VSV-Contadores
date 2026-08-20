// ============================================================================
// ✍️ EDITOR CON FORMATO — negrita, listas y enlaces, sin librerías
// ----------------------------------------------------------------------------
// POR QUÉ NO SE INSTALÓ UNA LIBRERÍA
// Los editores de verdad (TipTap, Quill, Lexical) traen entre 5 y 15 paquetes
// y un modelo de documento propio. Lo que este correo necesita es negrita,
// cursiva, listas, color y enlaces: `contentEditable` del navegador ya hace
// eso, y lo que sale es HTML directo, que es justo lo que se guarda y se manda.
//
// SÍ, `document.execCommand` ESTÁ MARCADO COMO OBSOLETO
// Y aun así lo soportan todos los navegadores, y no hay reemplazo estándar: la
// alternativa es manipular `Range` a mano, que es reescribir un editor entero.
// Está aislado en la función `cmd` de acá abajo; el día que exista un
// reemplazo, se cambia en un solo lugar.
//
// LO QUE NO TIENE, A PROPÓSITO
//   · imágenes — Gmail borra las imágenes `data:` de los correos que recibe, y
//     eso ya está documentado en el módulo. Un botón que produce algo que el
//     cliente no va a ver es peor que no tener el botón. La firma con logo sí
//     funciona porque viaja aparte, como adjunto en línea con `cid:`.
//   · tipografía — el correo la define en su envoltorio, y un `font-family` por
//     párrafo se ve distinto en cada cliente de correo.
//
// PEGAR VA COMO TEXTO PELADO, TAMBIÉN A PROPÓSITO: pegar desde Word o desde una
// página arrastra estilos que el saneo del servidor va a borrar igual. Mejor
// que se note al pegar y no al recibir el correo.
// ============================================================================
import React, { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react';
import {
    Bold, Italic, Underline, List, ListOrdered, Link2, Undo2, Redo2,
    AlignLeft, AlignCenter, AlignRight, Eraser, Palette,
} from 'lucide-react';

const COLORES = [
    ['#1f2937', 'Negro'], ['#199b4d', 'Verde'], ['#b45309', 'Ámbar'],
    ['#dc2626', 'Rojo'], ['#2563eb', 'Azul'], ['#6b7280', 'Gris'],
];

const Boton = ({ onClick, title, activo, children }) => (
    <button
        type="button"
        title={title}
        // Sin esto, al pulsar el botón el cursor se va del texto y el formato se
        // aplica a la nada. Evitando que tome el foco, la selección se conserva.
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        className={`h-7 w-7 flex items-center justify-center rounded-md transition-colors ${
            activo ? 'bg-emerald-500/15 text-emerald-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
        }`}>
        {children}
    </button>
);

const Separador = () => <span className="w-px h-4 bg-[#efe8dd] mx-0.5" />;

const EditorRico = forwardRef(({ value, onChange, placeholder = '', minAlto = 260 }, ref) => {
    const caja = useRef(null);
    // Lo último que emitimos. Sirve para no volver a escribir el HTML dentro
    // del div mientras la persona escribe: hacerlo le mandaría el cursor al
    // principio en cada tecla.
    const ultimoHtml = useRef(value || '');
    const rango = useRef(null);
    const [paleta, setPaleta] = useState(false);
    const [vacio, setVacio] = useState(!value);

    useEffect(() => {
        if (!caja.current) return;
        if ((value || '') !== ultimoHtml.current) {
            caja.current.innerHTML = value || '';
            ultimoHtml.current = value || '';
            setVacio(!caja.current.textContent.trim());
        }
    }, [value]);

    const emitir = () => {
        const html = caja.current?.innerHTML || '';
        ultimoHtml.current = html;
        setVacio(!caja.current?.textContent.trim());
        onChange?.(html);
    };

    // Dónde estaba el cursor. Lo necesita «Insertar variable», que vive FUERA
    // del editor: al pulsarlo el foco se pierde de verdad y sin esto la marca
    // aterrizaría al final del texto en vez de donde estabas escribiendo.
    const recordar = () => {
        const sel = window.getSelection();
        if (sel?.rangeCount && caja.current?.contains(sel.anchorNode)) {
            rango.current = sel.getRangeAt(0).cloneRange();
        }
    };

    const restaurar = () => {
        caja.current?.focus();
        const sel = window.getSelection();
        if (rango.current && sel && caja.current?.contains(rango.current.startContainer)) {
            sel.removeAllRanges();
            sel.addRange(rango.current);
        }
    };

    // El único punto de todo el archivo que habla con la API obsoleta.
    const cmd = (comando, valor = null) => {
        caja.current?.focus();
        try { document.execCommand('styleWithCSS', false, false); } catch { /* da igual */ }
        document.execCommand(comando, false, valor);
        emitir();
    };

    useImperativeHandle(ref, () => ({
        insertar: (texto) => {
            restaurar();
            document.execCommand('insertText', false, texto);
            emitir();
        },
        enfocar: () => caja.current?.focus(),
    }));

    const ponerEnlace = () => {
        const url = window.prompt('¿A qué dirección apunta el enlace?', 'https://');
        if (!url) return;
        // El servidor solo deja pasar http, https y mailto; se avisa acá para
        // que no se pierda el enlace en silencio al guardar.
        if (!/^(https?:\/\/|mailto:)/i.test(url.trim())) {
            window.alert('El enlace tiene que empezar con https://, http:// o mailto:');
            return;
        }
        cmd('createLink', url.trim());
    };

    const pegarPlano = (e) => {
        e.preventDefault();
        const texto = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, texto);
        emitir();
    };

    return (
        <div className="border border-[#efe8dd] rounded-xl overflow-hidden bg-white focus-within:border-emerald-500/60 transition-colors">
            {/* ── barra de formato ── */}
            <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-[#efe8dd] bg-slate-50/70 flex-wrap relative">
                <Boton onClick={() => cmd('undo')} title="Deshacer"><Undo2 size={14} /></Boton>
                <Boton onClick={() => cmd('redo')} title="Rehacer"><Redo2 size={14} /></Boton>
                <Separador />
                <Boton onClick={() => cmd('bold')} title="Negrita"><Bold size={14} /></Boton>
                <Boton onClick={() => cmd('italic')} title="Cursiva"><Italic size={14} /></Boton>
                <Boton onClick={() => cmd('underline')} title="Subrayado"><Underline size={14} /></Boton>
                <Separador />
                <Boton onClick={() => setPaleta(v => !v)} title="Color del texto" activo={paleta}>
                    <Palette size={14} />
                </Boton>
                {paleta && (
                    <div className="absolute top-full left-0 mt-1 z-20 flex gap-1 p-2 bg-white border border-[#efe8dd] rounded-xl shadow-lg">
                        {COLORES.map(([hex, nombre]) => (
                            <button key={hex} type="button" title={nombre}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => { cmd('foreColor', hex); setPaleta(false); }}
                                className="w-5 h-5 rounded-full border border-black/10 hover:scale-110 transition-transform"
                                style={{ background: hex }} />
                        ))}
                    </div>
                )}
                <Separador />
                <Boton onClick={() => cmd('insertUnorderedList')} title="Viñetas"><List size={14} /></Boton>
                <Boton onClick={() => cmd('insertOrderedList')} title="Numerada"><ListOrdered size={14} /></Boton>
                <Separador />
                <Boton onClick={() => cmd('justifyLeft')} title="Izquierda"><AlignLeft size={14} /></Boton>
                <Boton onClick={() => cmd('justifyCenter')} title="Centrado"><AlignCenter size={14} /></Boton>
                <Boton onClick={() => cmd('justifyRight')} title="Derecha"><AlignRight size={14} /></Boton>
                <Separador />
                <Boton onClick={ponerEnlace} title="Insertar enlace"><Link2 size={14} /></Boton>
                <Boton onClick={() => cmd('removeFormat')} title="Quitar formato"><Eraser size={14} /></Boton>
            </div>

            {/* ── el texto ── */}
            <div className="relative">
                {vacio && placeholder && (
                    <p className="absolute top-3 left-3 text-xs text-slate-300 pointer-events-none whitespace-pre-line">
                        {placeholder}
                    </p>
                )}
                <div
                    ref={caja}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={emitir}
                    onBlur={() => { recordar(); emitir(); }}
                    onKeyUp={recordar}
                    onMouseUp={recordar}
                    onPaste={pegarPlano}
                    className="px-3 py-3 text-xs text-slate-800 leading-relaxed outline-none overflow-y-auto
                               [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
                               [&_a]:text-emerald-700 [&_a]:underline [&_p]:mb-2"
                    style={{ minHeight: minAlto, maxHeight: 460 }}
                />
            </div>
        </div>
    );
});

EditorRico.displayName = 'EditorRico';
export default EditorRico;
