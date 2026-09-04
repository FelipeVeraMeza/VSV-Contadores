// =====================================================================
// LA DESCRIPCIÓN · crece con lo escrito, hasta un tope
// ---------------------------------------------------------------------
// POR QUÉ EXISTE
// La viñeta de descripción tenía alto fijo (dos o tres líneas). Un ticket de
// veinte líneas se veía por una rendija: había que arrastrar la esquina para
// agrandarla, y arrastrar una esquina no es intuitivo — el pedido lo dice
// así. En la práctica nadie la agrandaba y la mitad del ticket no se leía.
//
// QUÉ HACE
//   · Crece sola a medida que se escribe.
//   · Tiene un TOPE, porque una descripción de doscientas líneas empujaría
//     los comentarios y los adjuntos fuera de la pantalla.
//   · Pasado el tope, hace scroll adentro en vez de seguir creciendo.
//
// LAS IMÁGENES, ADENTRO
// El texto se guarda con marcas `[img:<id>]`. En el textarea esas marcas se
// ven como texto, así que las imágenes se dibujaban en un bloque APARTE, más
// abajo. Quedaban lejos del párrafo que las explica y encima empujaban el
// resto del ticket.
//
// Acá el campo tiene dos caras: mientras se escribe es un textarea normal
// —hay que poder editar las marcas—; en cuanto se suelta, se dibuja el texto
// CON sus imágenes en su lugar. Un clic vuelve a editar.
// =====================================================================
import React, { useRef, useEffect, useState, useCallback } from 'react';

// Alto máximo antes de empezar a hacer scroll adentro. En píxeles y no en
// líneas porque es lo que entiende `scrollHeight`; son unas quince líneas.
const TOPE_PX = 320;
const MINIMO_PX = 56;

/**
 * @param {string} valor            el texto actual
 * @param {(v: string) => void} onGuardar  se llama al salir del campo, si cambió
 * @param {React.ReactNode} vista   cómo se ve el texto con sus imágenes dibujadas
 * @param {boolean} hayImagenes     si el texto trae marcas de imagen
 */
const CampoDescripcion = ({
    valor = '', onGuardar, vista = null, hayImagenes = false,
    placeholder = 'Escribe de qué se trata…  (puedes pegar una imagen con Ctrl+V)',
    idCampo,
}) => {
    const ref = useRef(null);
    // Con imágenes se arranca en modo lectura: es como se ve el ticket al
    // abrirlo. Sin imágenes no hay nada que dibujar distinto, así que el
    // textarea se queda siempre y se evita un clic de más para escribir.
    const [editando, setEditando] = useState(!hayImagenes);

    // El alto se recalcula sobre el contenido real: se pone en 'auto' primero
    // para que `scrollHeight` mida el texto y no el alto que ya tenía.
    const ajustar = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        const alto = Math.min(Math.max(el.scrollHeight, MINIMO_PX), TOPE_PX);
        el.style.height = `${alto}px`;
        // Pasado el tope hace scroll adentro; antes del tope no, para que no
        // aparezca una barra sobre dos líneas de texto.
        el.style.overflowY = el.scrollHeight > TOPE_PX ? 'auto' : 'hidden';
    }, []);

    // Al entrar en modo edición, y cada vez que cambia el texto desde fuera
    // (abrir otra tarea, por ejemplo).
    useEffect(() => { if (editando) ajustar(); }, [editando, valor, ajustar]);

    const salir = (e) => {
        const v = e.target.value.trim();
        if (v !== (valor || '')) onGuardar(v);
        // Solo se vuelve a la vista dibujada si hay algo que dibujar distinto.
        if (hayImagenes) setEditando(false);
    };

    if (!editando) {
        return (
            <div
                onClick={() => setEditando(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setEditando(true); } }}
                title="Pulsa para editar"
                className="w-full bg-slate-50 border border-[#efe8dd] rounded-lg px-2.5 py-1.5 text-xs text-slate-700 cursor-text hover:border-emerald-500/50 transition-colors overflow-y-auto"
                style={{ minHeight: MINIMO_PX, maxHeight: TOPE_PX }}
            >
                {vista}
            </div>
        );
    }

    return (
        <textarea
            ref={ref}
            key={idCampo}
            data-imagen-inline="descripcion"
            defaultValue={valor}
            onInput={ajustar}
            onBlur={salir}
            placeholder={placeholder}
            className="w-full bg-slate-50 border border-[#efe8dd] rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-500 resize-none block"
            style={{ minHeight: MINIMO_PX }}
        />
    );
};

export default CampoDescripcion;
