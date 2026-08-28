// =====================================================================
// LA VIÑETA DE PLANTILLAS · mandar el mensaje sin escribirlo de nuevo
// ---------------------------------------------------------------------
// LO QUE PEDÍA EL TICKET, textual: «cuando haga click en whatsapp o mail, en la
// misma vista, se me abrirá una viñeta con el mail o whatsapp según corresponda,
// con botones de acción rápida. Plantillas...».
//
// Los tres atajos ya existían pero abrían la conversación EN BLANCO, así que el
// vendedor terminaba escribiendo el mismo mensaje veinte veces al día. Esto es
// lo que faltaba de ese ticket.
//
// NO INVENTA UN SEGUNDO SISTEMA DE PLANTILLAS. Usa las que ya viven en
// Comunicaciones → Plantillas (`/correos/plantillas`), que es donde el equipo
// las escribe y las comparte. Tener dos juegos de plantillas termina siempre
// igual: uno queda desactualizado y nadie sabe cuál es el bueno.
//
// CÓMO RELLENA LOS HUECOS
// Las plantillas traen marcas tipo `{{nombre}}`. Acá se reemplazan las que se
// pueden con los datos del prospecto y —a propósito— las que NO se conocen se
// dejan a la vista tal cual. Un `{{monto}}` sin resolver se ve feo y por eso se
// corrige antes de mandar; si se borrara en silencio, el cliente recibiría una
// frase a la que le falta un pedazo y nadie se enteraría.
//
// WHATSAPP VA EN TEXTO PLANO. Las plantillas de correo se escriben en HTML y
// wa.me no entiende etiquetas: se limpian antes (ver `aTextoPlano`), o el
// cliente recibiría «<p>Hola</p>».
// =====================================================================
import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, Mail, Loader2, FileText, ExternalLink } from 'lucide-react';
import { listarPlantillasCorreoApi } from '@/services/correosService';

const getUser = () => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } };

// Las plantillas se piden UNA vez para toda la pantalla, no una por fila: son
// las mismas para todos y una lista de 130 prospectos dispararía 130 consultas.
let cachePlantillas = null;
const traerPlantillas = async () => {
    if (cachePlantillas) return cachePlantillas;
    const r = await listarPlantillasCorreoApi(getUser().sessionId);
    const d = await r.json();
    cachePlantillas = (d.plantillas || d.data || []).filter((p) => p && (p.cuerpo || p.asunto));
    return cachePlantillas;
};
/** Para cuando alguien edite las plantillas y quiera verlas sin recargar. */
export const olvidarPlantillas = () => { cachePlantillas = null; };

// El cuerpo viene en HTML. Se pasa a texto conservando los saltos de línea: un
// `<br>` y un `</p>` son un enter para quien lee, y sin esto el mensaje llega
// como un párrafo único imposible de leer en el teléfono.
const aTextoPlano = (html) => String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '· ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// Las marcas que se pueden resolver con lo que hay en la ficha del prospecto.
// Se aceptan varios nombres para la misma cosa porque las plantillas ya escritas
// usan unos u otros, y una marca sin resolver es peor que un sinónimo de más.
const valoresDe = (p) => {
    const nombre = `${p.nombre || ''} ${p.apellidos || ''}`.trim();
    const yo = getUser();
    return {
        nombre,
        nombre_completo: nombre,
        primer_nombre: (p.nombre || '').trim().split(/\s+/)[0] || '',
        empresa: p.empresa || p.razonSocial || p.razon_social || '',
        rut: p.rut || '',
        telefono: (p.telefonos || [])[0] || '',
        correo: (p.correos || [])[0] || '',
        email: (p.correos || [])[0] || '',
        necesita: p.necesidad || '',
        rubro: p.rubro || '',
        ejecutivo: p.ejecutivoNombre || yo.nombre || '',
        remitente: yo.nombre || '',
    };
};

const rellenar = (texto, p) => {
    const v = valoresDe(p);
    return String(texto || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (crudo, marca) => {
        const valor = v[String(marca).toLowerCase()];
        // Sin valor se devuelve la marca intacta: que se vea que falta.
        return valor ? valor : crudo;
    });
};

/**
 * El botón con su viñeta.
 *
 * @param via       'whatsapp' | 'correo'
 * @param persona   el prospecto de la fila
 * @param destino   número ya normalizado (wa.me/...) o dirección de correo
 */
const PlantillaRapida = ({ via, persona, destino, titulo }) => {
    const [abierto, setAbierto] = useState(false);
    const [plantillas, setPlantillas] = useState(null);
    const [error, setError] = useState(false);
    const caja = useRef(null);

    const esWhatsapp = via === 'whatsapp';

    // Cerrar al hacer clic fuera. Sin esto quedan viñetas abiertas por toda la
    // lista a medida que uno va probando.
    useEffect(() => {
        if (!abierto) return;
        const fuera = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false); };
        const escape = (e) => { if (e.key === 'Escape') setAbierto(false); };
        document.addEventListener('mousedown', fuera);
        document.addEventListener('keydown', escape);
        return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', escape); };
    }, [abierto]);

    const abrir = async () => {
        const nuevo = !abierto;
        setAbierto(nuevo);
        if (!nuevo || plantillas) return;
        try { setPlantillas(await traerPlantillas()); }
        catch { setError(true); setPlantillas([]); }
    };

    // Abre la conversación. Sin plantilla va en blanco, que es como funcionaba
    // antes: esa opción se conserva a propósito, no todo mensaje sale de una
    // plantilla y obligar a elegir una sería un paso de más.
    const usar = (plantilla) => {
        const cuerpo = plantilla ? rellenar(aTextoPlano(plantilla.cuerpo), persona) : '';
        const asunto = plantilla ? rellenar(plantilla.asunto || plantilla.nombre || '', persona) : '';
        const url = esWhatsapp
            ? `${destino}${cuerpo ? `?text=${encodeURIComponent(cuerpo)}` : ''}`
            : `mailto:${destino}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
        window.open(url, esWhatsapp ? '_blank' : '_self', esWhatsapp ? 'noopener,noreferrer' : undefined);
        setAbierto(false);
    };

    const Icono = esWhatsapp ? MessageCircle : Mail;

    return (
        <span className="relative" ref={caja}>
            <button type="button" onClick={abrir} title={titulo}
                className={`h-6 w-6 flex items-center justify-center rounded-md transition-colors ${
                    esWhatsapp ? 'text-emerald-600 hover:bg-emerald-500/10' : 'text-slate-500 hover:bg-slate-100'
                } ${abierto ? (esWhatsapp ? 'bg-emerald-500/15' : 'bg-slate-100') : ''}`}>
                <Icono size={13} />
            </button>

            {abierto && (
                <div className="absolute left-0 top-7 z-30 w-64 bg-white border border-[#efe8dd] rounded-xl shadow-xl overflow-hidden">
                    <div className="px-3 py-2 border-b border-[#efe8dd] flex items-center gap-1.5">
                        <Icono size={12} className={esWhatsapp ? 'text-emerald-600' : 'text-slate-500'} />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            {esWhatsapp ? 'WhatsApp' : 'Correo'}
                        </span>
                        <span className="text-[10px] text-slate-400 truncate ml-auto">{destino.replace('https://wa.me/', '')}</span>
                    </div>

                    <button type="button" onClick={() => usar(null)}
                        className="w-full text-left px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 border-b border-[#f5f0e8]">
                        <ExternalLink size={12} className="text-slate-400 shrink-0" />
                        Abrir en blanco
                    </button>

                    <div className="max-h-56 overflow-y-auto">
                        {plantillas === null ? (
                            <div className="flex items-center justify-center py-4 text-slate-400"><Loader2 size={14} className="animate-spin" /></div>
                        ) : error ? (
                            <p className="px-3 py-3 text-[11px] text-slate-400">No se pudieron traer las plantillas.</p>
                        ) : plantillas.length === 0 ? (
                            <p className="px-3 py-3 text-[11px] text-slate-400 leading-snug">
                                No hay plantillas guardadas. Se escriben en <b>Comunicaciones → Plantillas</b> y aparecen acá.
                            </p>
                        ) : plantillas.map((pl) => (
                            <button key={pl.id} type="button" onClick={() => usar(pl)}
                                className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-[#f5f0e8] last:border-0">
                                <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-800">
                                    <FileText size={11} className="text-slate-400 shrink-0" />
                                    <span className="truncate">{pl.nombre || pl.asunto || 'Sin nombre'}</span>
                                </span>
                                {(pl.asunto || pl.descripcion) && (
                                    <span className="block text-[10px] text-slate-400 truncate pl-[18px]">
                                        {pl.descripcion || pl.asunto}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </span>
    );
};

export default PlantillaRapida;
