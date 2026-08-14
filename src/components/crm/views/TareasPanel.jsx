import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Plus, Search, Loader2, X, Trash2, Check, Clock, Folder, FolderPlus,
    MessageSquare, ListChecks, ChevronRight, Circle, CircleDot, CheckCircle2,
    Flag, User, Users, Calendar, Send, Paperclip, Download, Eye, Archive, ArchiveRestore,
    List, Kanban, LayoutTemplate, Network
} from 'lucide-react';
import TableroTareas from '@/components/tareas/TableroTareas';
import ArbolTareas from '@/components/tareas/ArbolTareas';
import { usePlantillas, SelectorPlantillas, PlantillasModal } from '@/components/tareas/PlantillasTarea';
import { toast } from '@/components/ui/use-toast';
import {
    listarTareasApi, crearTareaApi, actualizarTareaApi, eliminarTareaApi, completarTareaApi,
    obtenerTareaApi, agregarComentarioApi, eliminarComentarioApi,
    subirAdjuntoApi, descargarAdjuntoApi, eliminarAdjuntoApi,
    listarProyectosApi, crearProyectoApi, eliminarProyectoApi, archivarTareaApi,
    usarPlantillaApi, guardarComoPlantillaApi,
} from '@/services/crmService';
import { getCatalogosApi as getCatalogosPersonasApi } from '@/services/personaService';

const getUser = () => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } };
const getSessionId = () => getUser().sessionId;

// Los valores tienen que calzar con los del backend (crm.controllers.js) y con
// las restricciones CHECK de la base. Si acá aparece uno que la base no acepta,
// el guardado revienta; si falta uno que la base sí acepta, la fila se dibuja
// sin color ni etiqueta.
const PRIO = {
    critica: 'text-red-700 bg-red-600/15 border-red-600/40',
    alta: 'text-orange-600 bg-orange-500/10 border-orange-500/30',
    media: 'text-amber-600 bg-amber-500/10 border-amber-500/30',
    baja: 'text-slate-500 bg-slate-500/10 border-slate-400/30',
};
const PRIORIDADES = ['baja', 'media', 'alta', 'critica'];
const ESTADO_META = {
    pendiente: { label: 'Activa', icon: Circle, c: 'text-blue-600' },
    en_proceso: { label: 'En proceso', icon: CircleDot, c: 'text-amber-600' },
    en_revision: { label: 'En revisión', icon: Eye, c: 'text-violet-600' },
    completada: { label: 'Finalizada', icon: CheckCircle2, c: 'text-emerald-600' },
    cancelada: { label: 'Cancelada', icon: X, c: 'text-slate-400' },
};
// Los botones de estado del detalle, en el orden del flujo.
const ESTADOS_ORDEN = ['pendiente', 'en_proceso', 'en_revision', 'completada'];
// Cuántas tareas se piden por vez. La lista no se trae completa nunca: el resto
// llega con "Ver más". El servidor recorta a 500 aunque se pida más.
const POR_PAGINA = 60;
// El árbol necesita padres e hijos juntos para dibujarse entero, así que pide
// más de una vez. El servidor recorta a 500 igual.
const POR_PAGINA_ARBOL = 300;

// Las tres formas de ver las tareas. La elegida se recuerda entre visitas.
const VISTAS = ['lista', 'tablero', 'arbol'];
const LLAVE_VISTA = 'tareas:vista';

// A nivel de módulo y no dentro del componente porque hace falta ANTES de
// declarar el estado `vista`: el filtro de estado se inicializa según cuál sea
// la vista guardada, y leerlo de la variable daría error de zona muerta.
const vistaGuardada = () => {
    try {
        const v = localStorage.getItem(LLAVE_VISTA);
        return VISTAS.includes(v) ? v : 'lista';
    } catch { return 'lista'; }
};

// El tablero y el árbol necesitan ver TODOS los estados: en el tablero la
// columna de finalizadas quedaría vacía para siempre, y en el árbol un padre ya
// cerrado no vendría y sus hijas abiertas se dibujarían sueltas arriba, como si
// no tuvieran padre.
const necesitaTodos = (v) => v === 'tablero' || v === 'arbol';
const inp = "w-full bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500";
const fechaCorta = (d) => d ? new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) : null;

// ---------------------------------------------------------------
// Modal: crear tarea
// ---------------------------------------------------------------
const CrearTareaModal = ({ onClose, onCreated, proyectos, usuarios, proyectoActual }) => {
    const [form, setForm] = useState({
        titulo: '', descripcion: '', prioridad: 'media', venceAt: '',
        responsableId: getUser().id || '', proyectoId: proyectoActual || '', colaboradores: [],
        // «Quien crea la tarea puede definir quién la ve». Por defecto la ve todo
        // el proyecto; privada la deja solo para responsable, creador y colaboradores.
        visibilidad: 'proyecto',
    });
    const [saving, setSaving] = useState(false);
    const { plantillas, recargar } = usePlantillas();
    const [plantilla, setPlantilla] = useState(null);
    const [verPlantillas, setVerPlantillas] = useState(false);
    const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));
    const toggleColab = (id) => setForm(p => ({ ...p, colaboradores: p.colaboradores.includes(id) ? p.colaboradores.filter(x => x !== id) : [...p.colaboradores, id] }));

    // Elegir una plantilla llena el formulario, no lo reemplaza: lo que la
    // persona ya escribió se respeta, y todo queda editable antes de crear.
    const elegirPlantilla = (p) => {
        setPlantilla(p);
        if (!p) return;
        const fecha = Number.isInteger(p.diasPlazo)
            ? (() => { const f = new Date(); f.setDate(f.getDate() + p.diasPlazo); f.setHours(18, 0, 0, 0);
                       return new Date(f.getTime() - f.getTimezoneOffset() * 60000).toISOString().slice(0, 16); })()
            : '';
        setForm(prev => ({
            ...prev,
            // Solo se sugiere un título si la plantilla guardó uno propio. Antes
            // caía al NOMBRE de la plantilla, así que todas las tareas creadas
            // desde «Alta de cliente nuevo» se llamaban igual y no había forma
            // de distinguirlas en la lista. Sin título sugerido, el campo queda
            // vacío y se escribe de quién es esta vez.
            titulo: prev.titulo.trim() || p.titulo || '',
            descripcion: prev.descripcion.trim() || p.detalle || '',
            prioridad: p.prioridad || prev.prioridad,
            venceAt: fecha || prev.venceAt,
            proyectoId: p.proyectoId || prev.proyectoId,
            responsableId: p.responsableId || prev.responsableId,
            visibilidad: p.visibilidad || prev.visibilidad,
        }));
    };

    const guardar = async () => {
        if (!form.titulo.trim()) { toast({ variant: 'destructive', title: 'Falta el nombre' }); return; }
        setSaving(true);
        try {
            const cuerpo = { ...form, venceAt: form.venceAt || null, proyectoId: form.proyectoId || null };
            // Con plantilla se usa su endpoint: es el único que además crea las
            // subtareas. Lo del formulario viaja igual y manda sobre la plantilla.
            const r = plantilla
                ? await usarPlantillaApi(getSessionId(), plantilla.id, cuerpo)
                : await crearTareaApi(getSessionId(), cuerpo);
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            toast({
                title: 'Tarea creada',
                description: d.subtareas ? `Con ${d.subtareas} subtareas de «${plantilla.nombre}».` : undefined,
            });
            onCreated(); onClose();
        } catch (e) { toast({ variant: 'destructive', title: 'Error', description: e.message }); }
        finally { setSaving(false); }
    };
    return (
        <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="w-full max-w-lg bg-white rounded-2xl border border-[#efe8dd] shadow-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Nueva tarea</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={18} /></button>
                </div>
                <div className="space-y-3">
                    {/* Las plantillas van primero: la decisión "¿esto ya lo tengo
                        guardado?" se toma antes de escribir nada. */}
                    <SelectorPlantillas plantillas={plantillas} elegida={plantilla}
                        onElegir={elegirPlantilla} onAdministrar={() => setVerPlantillas(true)} />
                    <input className={inp} placeholder="Nombre de la tarea *" value={form.titulo} onChange={set('titulo')} autoFocus />
                    <textarea className={`${inp} resize-none`} rows={2} placeholder="Descripción" value={form.descripcion} onChange={set('descripcion')} />
                    <div className="grid grid-cols-2 gap-2">
                        <label className="block"><span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Responsable</span>
                            <select className={`${inp} cursor-pointer`} value={form.responsableId} onChange={set('responsableId')}>
                                <option value="">— Sin asignar —</option>
                                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                            </select>
                        </label>
                        <label className="block"><span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Prioridad</span>
                            <select className={`${inp} cursor-pointer`} value={form.prioridad} onChange={set('prioridad')}>
                                <option value="critica">Crítica</option>
                                <option value="alta">Alta</option>
                                <option value="media">Media</option>
                                <option value="baja">Baja</option>
                            </select>
                        </label>
                        <label className="block"><span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Fecha de entrega</span>
                            <input type="datetime-local" className={inp} value={form.venceAt} onChange={set('venceAt')} />
                        </label>
                        <label className="block"><span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Proyecto</span>
                            <select className={`${inp} cursor-pointer`} value={form.proyectoId} onChange={set('proyectoId')}>
                                <option value="">— Sin proyecto —</option>
                                {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        </label>
                    </div>
                    {/* Quién ve esta tarea. Solo tiene sentido dentro de un proyecto:
                        una tarea suelta ya es privada por naturaleza. */}
                    {form.proyectoId && (
                        <div>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">¿Quién la ve?</span>
                            <div className="flex gap-1.5 mt-1">
                                {[
                                    ['proyecto', 'Todo el proyecto', 'La ven todos los integrantes del proyecto'],
                                    ['privada', 'Solo los involucrados', 'Solo el responsable, quien la crea y los colaboradores'],
                                ].map(([v, label, ayuda]) => (
                                    <button type="button" key={v} title={ayuda}
                                        onClick={() => setForm(p => ({ ...p, visibilidad: v }))}
                                        className={`flex-1 text-[10px] font-bold px-2 py-1.5 rounded-lg border transition-colors ${form.visibilidad === v ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-50 border-[#efe8dd] text-slate-500'}`}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {usuarios.length > 0 && (
                        <div>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Colaboradores</span>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                                {usuarios.map(u => (
                                    <button type="button" key={u.id} onClick={() => toggleColab(u.id)}
                                        className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${form.colaboradores.includes(u.id) ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-50 border-[#efe8dd] text-slate-500'}`}>
                                        {u.nombre}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    <button onClick={guardar} disabled={saving} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg h-10 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                        {plantilla && plantilla.pasos.length > 0
                            ? `Crear tarea + ${plantilla.pasos.length} subtareas`
                            : 'Crear tarea'}
                    </button>
                </div>
            </div>

            {verPlantillas && (
                <PlantillasModal plantillas={plantillas} proyectos={proyectos} usuarios={usuarios}
                    onClose={() => setVerPlantillas(false)} onCambio={recargar} />
            )}
        </div>
    );
};

// ¿El adjunto es una imagen? Se mira el mime y, por si viniera vacío, la extensión.
const esImagen = (a) =>
    /^image\//i.test(a?.mime || '') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(a?.nombre || '');

// ---------------------------------------------------------------
// Miniatura de un adjunto de imagen
// ---------------------------------------------------------------
// Las imágenes viven como binario en la base (tarea_adjunto.contenido). Este
// componente las baja UNA vez, arma un blob en memoria y las muestra en pantalla
// —sin guardarlas en el disco—. Al hacer clic se abren a tamaño completo.
// Si por lo que sea no carga, cae al ícono de clip como cualquier archivo.
// Baja un adjunto UNA vez y lo deja como blob en memoria. Lo usan la miniatura
// de la lista y las imágenes incrustadas en el texto, que necesitan lo mismo.
const useUrlAdjunto = (id) => {
    const [url, setUrl] = useState(null);
    const [error, setError] = useState(false);
    useEffect(() => {
        let vivo = true; let objUrl = null;
        (async () => {
            try {
                const r = await descargarAdjuntoApi(getSessionId(), id);
                if (!r.ok) throw new Error();
                objUrl = URL.createObjectURL(await r.blob());
                if (vivo) setUrl(objUrl); else URL.revokeObjectURL(objUrl);
            } catch { if (vivo) setError(true); }
        })();
        return () => { vivo = false; if (objUrl) URL.revokeObjectURL(objUrl); };
    }, [id]);
    return { url, error };
};

// ---------------------------------------------------------------
// IMÁGENES DENTRO DEL TEXTO  ·  «VISUALIZAR IMAGENES ADJUNTAS»
// ---------------------------------------------------------------
// Al pegar una imagen en un comentario o en la descripción, el archivo se sube
// como adjunto normal y en el texto queda una marca `[img:<id>]`. Al dibujar el
// texto, esa marca se reemplaza por la imagen.
//
// Se hace así y no con un editor de texto enriquecido porque los comentarios ya
// son texto plano en la base (`tarea_comentario.texto`): guardar HTML obligaría
// a migrar lo que ya está escrito y a limpiar el HTML que llegue, que es un
// problema mucho más grande que el que se quiere resolver.
//
// Si la imagen se borró o no carga, se ve un aviso corto en su lugar; el resto
// del comentario se sigue leyendo.
const TOKEN_IMG = /\[img:([0-9a-fA-F-]{36})\]/g;
export const marcaImagen = (id) => `[img:${id}]`;

// Regex APARTE y sin `g` para preguntar "¿tiene imágenes?".
// Con la global no se puede: `.test()` sobre una regex con bandera `g` avanza su
// `lastIndex`, así que la misma pregunta sobre el mismo texto devuelve true y
// después false, y la descripción mostraría sus imágenes un render sí y otro no.
const tieneImagenes = (texto) => /\[img:[0-9a-fA-F-]{36}\]/.test(texto || '');

const ImagenEnTexto = ({ id, onVer }) => {
    const { url, error } = useUrlAdjunto(id);
    if (error) return <span className="text-[10px] text-slate-400 italic">[imagen no disponible]</span>;
    if (!url) return (
        <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
            <Loader2 size={10} className="animate-spin" /> cargando imagen…
        </span>
    );
    return (
        <button type="button" onClick={() => onVer({ url, nombre: 'Imagen', mime: 'image/*' })}
            className="block my-1.5" title="Ver a tamaño completo">
            <img src={url} alt="Imagen pegada"
                 className="max-w-full max-h-64 rounded-lg border border-[#efe8dd] hover:ring-2 hover:ring-emerald-400 transition" />
        </button>
    );
};

const TextoConImagenes = ({ texto, onVer, className }) => {
    if (!texto) return null;
    const partes = [];
    let desde = 0, m;
    TOKEN_IMG.lastIndex = 0;
    while ((m = TOKEN_IMG.exec(texto)) !== null) {
        if (m.index > desde) partes.push({ tipo: 'txt', valor: texto.slice(desde, m.index) });
        partes.push({ tipo: 'img', valor: m[1] });
        desde = m.index + m[0].length;
    }
    if (desde < texto.length) partes.push({ tipo: 'txt', valor: texto.slice(desde) });

    return (
        <div className={className}>
            {partes.map((p, i) => p.tipo === 'img'
                ? <ImagenEnTexto key={`i${i}`} id={p.valor} onVer={onVer} />
                : <span key={`t${i}`} className="whitespace-pre-wrap">{p.valor}</span>)}
        </div>
    );
};

const ImagenAdjunta = ({ adjunto, onVer }) => {
    const { url, error } = useUrlAdjunto(adjunto.id);

    if (error) return <Paperclip size={13} className="text-slate-400 shrink-0" />;
    if (!url) return (
        <div className="w-11 h-11 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
            <Loader2 size={13} className="animate-spin text-slate-400" />
        </div>
    );
    return (
        <button type="button" onClick={() => onVer({ url, nombre: adjunto.nombre, mime: adjunto.mime })}
            className="shrink-0" title="Ver imagen">
            <img src={url} alt={adjunto.nombre}
                 className="w-11 h-11 rounded-lg object-cover border border-[#efe8dd] hover:ring-2 hover:ring-emerald-400 transition" />
        </button>
    );
};

// ---------------------------------------------------------------
// Panel de detalle: subtareas + comentarios + estado
// ---------------------------------------------------------------
// Una subtarea ES una tarea (misma tabla, con parent_id), así que este mismo
// panel sirve para las dos. `onAbrir` permite entrar a una subtarea y volver.
const DetalleTarea = ({ tareaId, onClose, onChanged, usuarios, onAbrir }) => {
    const [data, setData] = useState(null);
    const [subs, setSubs] = useState([]);
    const [coms, setComs] = useState([]);
    const [adjs, setAdjs] = useState([]);
    const [subiendo, setSubiendo] = useState(false);
    // Los topes los manda el servidor (RNF-TA-03). Estos valores son solo el
    // punto de partida hasta que llega la respuesta; nunca la fuente de verdad.
    const [limites, setLimites] = useState({ porArchivo: 7 * 1024 * 1024, porTarea: 25 * 1024 * 1024, usado: 0 });
    const [loading, setLoading] = useState(true);
    const [nuevaSub, setNuevaSub] = useState('');
    const [nuevoCom, setNuevoCom] = useState('');
    // Candados contra el doble envío: sin esto, dos Enter seguidos duplican.
    const [enviandoCom, setEnviandoCom] = useState(false);
    const [creandoSub, setCreandoSub] = useState(false);
    const [guardandoPlantilla, setGuardandoPlantilla] = useState(false);
    // Archivo abierto en el visor. null = cerrado. Antes solo servía para
    // imágenes; ahora también para PDF, que es el otro adjunto habitual.
    const [verArchivo, setVerArchivo] = useState(null);
    const fileRef = React.useRef(null);

    const cargar = useCallback(async () => {
        try {
            const r = await obtenerTareaApi(getSessionId(), tareaId);
            const d = await r.json();
            if (d.success) {
                setData(d.tarea); setSubs(d.subtareas || []); setComs(d.comentarios || []); setAdjs(d.adjuntos || []);
                if (d.limites) setLimites(d.limites);
            }
        } catch { /* */ } finally { setLoading(false); }
    }, [tareaId]);
    useEffect(() => { setLoading(true); cargar(); }, [cargar]);

    // RF-07 y RF-12: los campos se pueden corregir después de crear. Antes solo
    // se fijaban al crear la tarea y ya no había forma de cambiarlos, y las
    // subtareas nacían solo con título.
    const guardarCampo = async (campo, valor) => {
        setData(p => ({ ...p, [campo]: valor }));
        try { await actualizarTareaApi(getSessionId(), tareaId, { [campo]: valor }); onChanged(); }
        catch { toast({ variant: 'destructive', title: 'No se pudo guardar' }); cargar(); }
    };

    const cambiarEstado = async (estado) => {
        setData(p => ({ ...p, estado }));
        try { await actualizarTareaApi(getSessionId(), tareaId, { estado }); onChanged(); }
        catch { toast({ variant: 'destructive', title: 'Error' }); cargar(); }
    };
    // Mismo cuidado que en los comentarios: se vacía primero y se bloquea
    // mientras viaja, o dos Enter seguidos crean dos subtareas iguales.
    const addSub = async () => {
        const titulo = nuevaSub.trim();
        if (!titulo || creandoSub) return;
        setCreandoSub(true);
        setNuevaSub('');
        try {
            const r = await crearTareaApi(getSessionId(), { titulo, parentId: tareaId });
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            cargar(); onChanged();
        } catch (e) {
            setNuevaSub(titulo);
            toast({ variant: 'destructive', title: 'No se pudo crear la subtarea', description: e.message });
        } finally { setCreandoSub(false); }
    };
    const toggleSub = async (s) => {
        const nuevo = s.estado === 'completada' ? 'pendiente' : 'completada';
        setSubs(prev => prev.map(x => x.id === s.id ? { ...x, estado: nuevo } : x));
        try { await actualizarTareaApi(getSessionId(), s.id, { estado: nuevo }); cargar(); onChanged(); }
        catch { cargar(); }
    };
    const delSub = async (s) => {
        setSubs(prev => prev.filter(x => x.id !== s.id));
        try { await eliminarTareaApi(getSessionId(), s.id); cargar(); onChanged(); } catch { cargar(); }
    };
    // ⚠️ EL COMENTARIO SE VACÍA ANTES DE ENVIAR, NO DESPUÉS.
    //
    // Antes se limpiaba al volver la respuesta. En esos dos segundos el texto
    // seguía en el campo, así que un segundo Enter —o el clic en el botón
    // después de haber apretado Enter— pasaba el `if` y mandaba el mismo
    // comentario de nuevo. Mati lo dejó duplicado a las 13:37:57 y 13:37:59.
    //
    // Ahora se vacía primero y se bloquea mientras viaja. Si falla, el texto se
    // devuelve al campo para no perder lo escrito.
    const addCom = async () => {
        const texto = nuevoCom.trim();
        if (!texto || enviandoCom) return;
        setEnviandoCom(true);
        setNuevoCom('');
        try {
            const r = await agregarComentarioApi(getSessionId(), tareaId, texto);
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            setComs(prev => [...prev, d.comentario]);
        } catch (e) {
            setNuevoCom(texto);   // no se pierde lo escrito
            toast({ variant: 'destructive', title: 'No se pudo comentar', description: e.message });
        } finally { setEnviandoCom(false); }
    };
    const delCom = async (c) => {
        setComs(prev => prev.filter(x => x.id !== c.id));
        try { await eliminarComentarioApi(getSessionId(), c.id); } catch { cargar(); }
    };
    // ---- Adjuntos (se guardan como binario en la base) ----
    // El cuerpo de la subida vive aparte porque tiene DOS entradas: el botón del
    // clip y pegar con Ctrl+V. Antes estaba metido dentro del `onChange` del
    // input, así que pegar habría significado copiar todo el bloque.
    const subirBlob = async (file) => {
        // Se avisa acá antes de gastar la subida; el servidor vuelve a revisarlo
        // igual, porque esta comprobación se puede saltar.
        if (file.size > limites.porArchivo) {
            toast({ variant: 'destructive', title: 'Archivo muy grande', description: `«${file.name}» pesa ${kb(file.size)} y el máximo es ${kb(limites.porArchivo)}.` });
            return null;
        }
        if (limites.usado + file.size > limites.porTarea) {
            const libre = Math.max(0, limites.porTarea - limites.usado);
            toast({ variant: 'destructive', title: 'No cabe en esta tarea', description: `Quedan ${kb(libre)} libres de ${kb(limites.porTarea)}. Elimina algún archivo.` });
            return null;
        }
        setSubiendo(true);
        try {
            const dataBase64 = await new Promise((resolve, reject) => {
                const fr = new FileReader();
                fr.onload = () => resolve(fr.result);
                fr.onerror = reject;
                fr.readAsDataURL(file);
            });
            const r = await subirAdjuntoApi(getSessionId(), tareaId, { nombre: file.name, mime: file.type, dataBase64 });
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            setAdjs(prev => [...prev, d.adjunto]);
            setLimites(l => ({ ...l, usado: l.usado + Number(d.adjunto?.tamano || 0) }));
            // Devuelve el adjunto —y no un true— porque quien pega una imagen en
            // el texto necesita su id para dejar la marca `[img:<id>]`.
            return d.adjunto;
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: err.message });
            return null;
        } finally { setSubiendo(false); }
    };

    const subirArchivo = async (e) => {
        const file = e.target.files?.[0];
        if (fileRef.current) fileRef.current.value = '';
        if (!file) return;
        if (await subirBlob(file)) toast({ title: 'Archivo subido' });
    };

    // ---- PEGAR UNA IMAGEN CON Ctrl+V ----
    // Para adjuntar un pantallazo había que guardarlo en el disco, apretar el
    // clip, buscarlo en la carpeta y subirlo. Con esto se pega y ya.
    //
    // DOS DESTINOS SEGÚN DÓNDE ESTÉ EL CURSOR:
    //
    //   · En el comentario o en la descripción → la imagen queda DENTRO del
    //     texto, en el punto donde estaba el cursor. Es lo que se pidió: «como
    //     en Asana, pegar una imagen en los comentarios y descripción».
    //   · En cualquier otro lugar → se adjunta a la tarea, como antes.
    //
    // En los dos casos el archivo se sube igual; lo único que cambia es si
    // además se deja una marca `[img:<id>]` en el texto.
    //
    // El oyente va en `document` porque uno pega apenas abre la tarea, sin haber
    // pulsado antes en ningún lugar determinado. Si en el portapapeles no hay
    // imagen no se toca nada, así que pegar texto sigue funcionando igual.
    useEffect(() => {
        const alPegar = async (e) => {
            const imagenes = [...(e.clipboardData?.items || [])]
                .filter(i => i.kind === 'file' && /^image\//i.test(i.type))
                .map(i => i.getAsFile())
                .filter(Boolean);
            if (!imagenes.length) return;

            e.preventDefault();
            // `data-imagen-inline` marca los campos que aceptan la imagen dentro
            // del texto. Se lee del elemento con el foco al momento de pegar.
            const campo = document.activeElement;
            const destino = campo?.dataset?.imagenInline || null;

            const marcas = [];
            for (const img of imagenes) {
                // El portapapeles entrega todo como «image.png». Con dos
                // pantallazos en la misma tarea quedarían dos archivos con el
                // mismo nombre y no habría forma de distinguirlos en la lista.
                const ext = (img.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
                const sello = new Date().toLocaleString('sv-SE').replace(/[: ]/g, '-');
                const conNombre = new File([img], `pantallazo-${sello}.${ext}`, { type: img.type });
                const adj = await subirBlob(conNombre);
                if (adj?.id) marcas.push(marcaImagen(adj.id));
            }
            if (!marcas.length) return;

            if (!destino) {
                toast({ title: marcas.length === 1 ? 'Imagen adjuntada' : `${marcas.length} imágenes adjuntadas` });
                return;
            }

            // Se inserta donde estaba el cursor, no al final: si alguien escribió
            // «mirá este error:» y pega, la imagen va justo ahí.
            const texto = marcas.join(' ');
            if (destino === 'comentario') {
                const pos = campo.selectionStart ?? nuevoCom.length;
                setNuevoCom(prev => `${prev.slice(0, pos)}${prev.slice(0, pos) ? ' ' : ''}${texto} ${prev.slice(pos)}`.trimStart());
            } else if (destino === 'descripcion') {
                // La descripción es un textarea NO controlado que guarda al salir
                // del campo, así que se escribe su valor y se guarda a mano: si
                // solo cambiara el valor, bastaría con no volver a tocarlo para
                // que la imagen se perdiera.
                const pos = campo.selectionStart ?? campo.value.length;
                const nuevo = `${campo.value.slice(0, pos)}${campo.value.slice(0, pos) ? ' ' : ''}${texto} ${campo.value.slice(pos)}`.trimStart();
                campo.value = nuevo;
                guardarCampo('descripcion', nuevo.trim());
            }
            toast({ title: marcas.length === 1 ? 'Imagen pegada' : `${marcas.length} imágenes pegadas` });
        };
        document.addEventListener('paste', alPegar);
        return () => document.removeEventListener('paste', alPegar);
    }, [tareaId, limites.porArchivo, limites.porTarea, limites.usado, nuevoCom]);
    // Vista previa de un adjunto que NO es imagen (un PDF, sobre todo). La
    // miniatura de imagen ya trae su blob cargado; acá hay que pedirlo.
    //
    // `propio: true` marca que esta URL la creamos nosotros y hay que liberarla
    // al cerrar. Las de las miniaturas NO se liberan acá: son del componente que
    // las dibuja, y soltarlas dejaría la miniatura rota en la lista.
    const abrirPrevia = async (a) => {
        try {
            const r = await descargarAdjuntoApi(getSessionId(), a.id);
            if (!r.ok) throw new Error('No se pudo abrir el archivo.');
            const url = URL.createObjectURL(await r.blob());
            setVerArchivo({ url, nombre: a.nombre, mime: a.mime, propio: true });
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: err.message });
        }
    };
    const cerrarVisor = () => {
        setVerArchivo(v => { if (v?.propio) URL.revokeObjectURL(v.url); return null; });
    };

    const descargar = async (a) => {
        try {
            const r = await descargarAdjuntoApi(getSessionId(), a.id);
            if (!r.ok) throw new Error('No se pudo descargar');
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url; link.download = a.nombre; link.click();
            URL.revokeObjectURL(url);
        } catch (err) { toast({ variant: 'destructive', title: 'Error', description: err.message }); }
    };
    // Guardar esta tarea —con sus subtareas— como plantilla reutilizable.
    const guardarComoPlantilla = async () => {
        if (guardandoPlantilla) return;
        const nombre = window.prompt(
            '¿Con qué nombre guardas esta plantilla?\n\nSe copiarán su descripción, prioridad, proyecto y sus '
            + `${subs.length} ${subs.length === 1 ? 'subtarea' : 'subtareas'}.`,
            data.titulo || ''
        );
        if (nombre === null) return;              // canceló
        if (!nombre.trim()) { toast({ variant: 'destructive', title: 'Falta el nombre' }); return; }
        setGuardandoPlantilla(true);
        try {
            const r = await guardarComoPlantillaApi(getSessionId(), tareaId, nombre.trim());
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            toast({
                title: 'Plantilla guardada',
                description: `Ya aparece al crear una tarea nueva${d.pasos ? ` (${d.pasos} pasos)` : ''}.`,
            });
        } catch (e) { toast({ variant: 'destructive', title: 'No se pudo guardar', description: e.message }); }
        finally { setGuardandoPlantilla(false); }
    };

    const delAdj = async (a) => {
        setAdjs(prev => prev.filter(x => x.id !== a.id));
        setLimites(l => ({ ...l, usado: Math.max(0, l.usado - Number(a.tamano || 0)) }));
        try { await eliminarAdjuntoApi(getSessionId(), a.id); } catch { cargar(); }
    };
    const kb = (n) => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

    if (loading || !data) return (
        <div className="w-full lg:w-2/5 bg-white border border-[#efe8dd] rounded-2xl flex items-center justify-center min-h-[400px]"><Loader2 className="animate-spin text-slate-400" /></div>
    );

    return (
        <div className="w-full lg:w-2/5 bg-white border border-[#efe8dd] rounded-2xl flex flex-col overflow-hidden h-full min-h-[400px]">
            <div className="p-4 border-b border-[#efe8dd] flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    {data.parentId && (
                        <button
                            onClick={() => onAbrir?.(data.parentId)}
                            className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-emerald-600 flex items-center gap-1 mb-1"
                        >
                            ← Volver a la tarea principal
                        </button>
                    )}
                    <h3 className="text-sm font-black text-slate-900">{data.titulo}</h3>
                    {data.proyectoNombre && <span className="text-[10px] font-bold" style={{ color: data.proyectoColor || '#199b4d' }}>● {data.proyectoNombre}</span>}
                </div>
                {/* Guardar como plantilla se ofrece acá y no al crear, porque
                    recién cuando la tarea está armada se ve que va a repetirse.
                    Solo en tareas principales: una subtarea suelta no es un
                    procedimiento. */}
                {!data.parentId && (
                    <button onClick={guardarComoPlantilla} disabled={guardandoPlantilla}
                        title="Guardar esta tarea y sus subtareas como plantilla"
                        className="text-slate-400 hover:text-emerald-600 shrink-0">
                        {guardandoPlantilla ? <Loader2 size={16} className="animate-spin" /> : <LayoutTemplate size={16} />}
                    </button>
                )}
                <button onClick={onClose} className="text-slate-400 hover:text-red-500 shrink-0"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
                {/* Estado */}
                <div className="flex gap-1.5">
                    {ESTADOS_ORDEN.map(e => {
                        const meta = ESTADO_META[e]; const Icon = meta.icon; const on = data.estado === e;
                        return (
                            <button key={e} onClick={() => cambiarEstado(e)}
                                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-colors ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 border-[#efe8dd] text-slate-500 hover:text-slate-900'}`}>
                                <Icon size={12} className={on ? 'text-white' : meta.c} /> {meta.label}
                            </button>
                        );
                    })}
                </div>

                {/* Meta */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                        <span className="text-[9px] text-slate-400 uppercase block mb-0.5">Responsable</span>
                        <select
                            value={data.responsableId || ''}
                            onChange={(e) => guardarCampo('responsableId', e.target.value || null)}
                            className="w-full bg-slate-50 border border-[#efe8dd] rounded-lg px-2 py-1 text-xs text-slate-700 outline-none focus:border-emerald-500 cursor-pointer"
                        >
                            <option value="">— Sin responsable —</option>
                            {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                        </select>
                    </div>
                    <div>
                        <span className="text-[9px] text-slate-400 uppercase block mb-0.5">Prioridad</span>
                        <select
                            value={data.prioridad || 'media'}
                            onChange={(e) => guardarCampo('prioridad', e.target.value)}
                            className="w-full bg-slate-50 border border-[#efe8dd] rounded-lg px-2 py-1 text-xs text-slate-700 outline-none focus:border-emerald-500 cursor-pointer capitalize"
                        >
                            {PRIORIDADES.map(x => <option key={x} value={x}>{x === 'critica' ? 'crítica' : x}</option>)}
                        </select>
                    </div>
                    <div>
                        <span className="text-[9px] text-slate-400 uppercase block mb-0.5">Entrega</span>
                        <input
                            type="datetime-local"
                            value={data.venceAt ? new Date(data.venceAt).toISOString().slice(0, 16) : ''}
                            onChange={(e) => guardarCampo('venceAt', e.target.value || null)}
                            className="w-full bg-slate-50 border border-[#efe8dd] rounded-lg px-2 py-1 text-xs text-slate-700 outline-none focus:border-emerald-500"
                        />
                    </div>
                    <div>
                        <span className="text-[9px] text-slate-400 uppercase block mb-0.5">Colaboradores</span>
                        <span className="text-slate-700 block pt-1">{(data.colaboradores || []).map(c => c.nombre).join(', ') || '—'}</span>
                    </div>
                </div>
                {/* DESCRIPCIÓN · editable, y también en las subtareas.
                    Antes solo se mostraba si ya tenía texto, así que una subtarea
                    nacida solo con título no había forma de describirla nunca. */}
                <div>
                    <span className="text-[9px] text-slate-400 uppercase block mb-1">Descripción</span>
                    <textarea
                        key={data.id}
                        data-imagen-inline="descripcion"
                        defaultValue={data.descripcion || ''}
                        onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v !== (data.descripcion || '')) guardarCampo('descripcion', v);
                        }}
                        rows={data.descripcion ? 3 : 2}
                        placeholder="Escribe de qué se trata...  (puedes pegar una imagen con Ctrl+V)"
                        className="w-full bg-slate-50 border border-[#efe8dd] rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-500 resize-y"
                    />
                    {/* Vista de la descripción con sus imágenes. El textarea guarda
                        el texto con marcas `[img:…]`, que sin dibujar no se ven
                        como imágenes; acá abajo se muestran de verdad. */}
                    {tieneImagenes(data.descripcion) && (
                        <TextoConImagenes texto={data.descripcion} onVer={setVerArchivo}
                            className="mt-1.5 text-xs text-slate-700" />
                    )}
                </div>

                {/* QUIÉN LA VE · solo aplica si está dentro de un proyecto. */}
                {data.proyectoId && (
                    <div>
                        <span className="text-[9px] text-slate-400 uppercase block mb-1">¿Quién la ve?</span>
                        <div className="flex gap-1.5">
                            {[
                                ['proyecto', 'Todo el proyecto'],
                                ['privada', 'Solo los involucrados'],
                            ].map(([v, label]) => (
                                <button key={v} onClick={() => guardarCampo('visibilidad', v)}
                                    className={`flex-1 text-[10px] font-bold px-2 py-1.5 rounded-lg border transition-colors ${(data.visibilidad || 'proyecto') === v ? 'bg-slate-900 border-slate-900 text-white' : 'bg-slate-50 border-[#efe8dd] text-slate-500 hover:text-slate-900'}`}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Subtareas · hasta DOS niveles.
                    El equipo pidió poder crear subtareas dentro de subtareas
                    («CREAR SUB TAREAS EN LAS SUBTAREAS»). Antes el tope era uno.
                    Dos alcanza para desglosar un trabajo sin que la pantalla se
                    vuelva un árbol ilegible; el tercero lo rechaza el servidor. */}
                {data.puedeTenerSubtareas !== false && (
                <div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-2"><ListChecks size={13} /> Subtareas ({subs.filter(s => s.estado === 'completada').length}/{subs.length})</span>
                    {/* Cada subtarea muestra lo mismo que se ve de una tarea en la
                        lista: quién responde, para cuándo, con qué prioridad y si
                        trae cosas dentro. Antes solo se veía el título, así que
                        había que abrirlas una por una para saber de qué iban. */}
                    <div className="space-y-0.5">
                        {subs.map(s => {
                            const vencida = s.venceAt && new Date(s.venceAt) < new Date() && s.estado !== 'completada';
                            const hecha = s.estado === 'completada';
                            return (
                            <div key={s.id} className="flex items-start gap-2 group rounded-lg px-1.5 py-1 hover:bg-slate-50">
                                <button onClick={() => toggleSub(s)} className="shrink-0 mt-0.5" title={hecha ? 'Reabrir' : 'Finalizar'}>
                                    {hecha ? <CheckCircle2 size={15} className="text-emerald-500" /> : <Circle size={15} className="text-slate-300 hover:text-emerald-500" />}
                                </button>
                                <div className="min-w-0 flex-1">
                                    <button
                                        onClick={() => onAbrir?.(s.id)}
                                        title="Abrir la subtarea"
                                        className={`text-xs text-left block w-full truncate hover:text-emerald-600 hover:underline underline-offset-2 ${hecha ? 'text-slate-400 line-through' : 'text-slate-700'}`}
                                    >
                                        {s.titulo}
                                    </button>
                                    {/* La segunda línea solo aparece si hay algo que
                                        contar; una subtarea recién creada no arrastra
                                        una fila de guiones vacíos. */}
                                    {(s.responsableNombre || s.venceAt || s.subtareasTotal > 0 || s.comentarios > 0 || s.adjuntos > 0 || s.descripcion) && (
                                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                                            {s.responsableNombre && (
                                                <span className="text-[9px] text-slate-500 flex items-center gap-0.5"><User size={9} /> {s.responsableNombre}</span>
                                            )}
                                            {s.venceAt && (
                                                <span className={`text-[9px] font-bold flex items-center gap-0.5 ${vencida ? 'text-red-600' : 'text-slate-500'}`}>
                                                    <Calendar size={9} /> {fechaCorta(s.venceAt)}
                                                </span>
                                            )}
                                            {s.subtareasTotal > 0 && (
                                                <span className="text-[9px] text-slate-500 flex items-center gap-0.5"><ListChecks size={9} /> {s.subtareasHechas}/{s.subtareasTotal}</span>
                                            )}
                                            {s.comentarios > 0 && (
                                                <span className="text-[9px] text-slate-500 flex items-center gap-0.5"><MessageSquare size={9} /> {s.comentarios}</span>
                                            )}
                                            {s.adjuntos > 0 && (
                                                <span className="text-[9px] text-slate-500 flex items-center gap-0.5"><Paperclip size={9} /> {s.adjuntos}</span>
                                            )}
                                            {s.descripcion && (
                                                <span className="text-[9px] text-slate-400 italic truncate max-w-[9rem]" title={s.descripcion}>{s.descripcion}</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {!hecha && s.prioridad && s.prioridad !== 'media' && (
                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase shrink-0 mt-0.5 ${PRIO[s.prioridad]}`}>
                                        {s.prioridad === 'critica' ? 'crítica' : s.prioridad}
                                    </span>
                                )}
                                <button onClick={() => delSub(s)} title="Eliminar la subtarea" className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 shrink-0 mt-0.5"><Trash2 size={12} /></button>
                            </div>
                            );
                        })}
                    </div>
                    <div className="flex gap-2 mt-2">
                        <input value={nuevaSub} onChange={(e) => setNuevaSub(e.target.value)} disabled={creandoSub}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSub(); } }}
                            placeholder="Nueva subtarea..." className="flex-1 bg-slate-50 border border-[#efe8dd] rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-emerald-500 disabled:opacity-60" />
                        <button onClick={addSub} disabled={creandoSub || !nuevaSub.trim()} className="bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-600 rounded-lg px-2.5">
                            {creandoSub ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                        </button>
                    </div>
                </div>
                )}

                {/* Archivos (binario en la base) */}
                <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Paperclip size={13} /> Archivos ({adjs.length})</span>
                        {/* Cuánto lleva ocupado de su cupo. Se avisa en amarillo
                            cuando queda poco, para que nadie se entere recién al
                            intentar subir. */}
                        {adjs.length > 0 && (
                            <span className={`text-[9px] font-bold ${limites.usado > limites.porTarea * 0.8 ? 'text-amber-600' : 'text-slate-400'}`}>
                                {kb(limites.usado)} de {kb(limites.porTarea)}
                            </span>
                        )}
                    </div>
                    <div className="space-y-1 mb-2">
                        {adjs.map(a => (
                            <div key={a.id} className="flex items-center gap-2 bg-slate-50 border border-[#efe8dd] rounded-lg px-2.5 py-1.5 group">
                                {esImagen(a)
                                    ? <ImagenAdjunta adjunto={a} onVer={setVerArchivo} />
                                    : <button type="button" onClick={() => abrirPrevia(a)} title="Vista previa"
                                        className="shrink-0 text-slate-400 hover:text-emerald-600"><Paperclip size={13} /></button>}
                                {/* El nombre también abre la previa: apuntarle al clip de
                                    13 píxeles es más puntería de la que corresponde. */}
                                <button type="button" onClick={() => abrirPrevia(a)}
                                    className="min-w-0 flex-1 text-left" title="Vista previa">
                                    <p className="text-[11px] font-bold text-slate-700 truncate hover:text-emerald-700">{a.nombre}</p>
                                    <p className="text-[9px] text-slate-400">{kb(a.tamano)} · {a.autor}</p>
                                </button>
                                <button onClick={() => descargar(a)} title="Descargar" className="text-slate-400 hover:text-emerald-600 shrink-0"><Download size={13} /></button>
                                <button onClick={() => delAdj(a)} title="Eliminar" className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 shrink-0"><Trash2 size={12} /></button>
                            </div>
                        ))}
                        {adjs.length === 0 && <p className="text-[10px] text-slate-400 italic">Sin archivos adjuntos.</p>}
                    </div>
                    <input ref={fileRef} type="file" className="hidden" onChange={subirArchivo} />
                    <button onClick={() => fileRef.current?.click()} disabled={subiendo}
                        className="w-full flex items-center justify-center gap-1.5 border border-dashed border-[#e5ddd0] hover:border-emerald-500/50 rounded-lg py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-emerald-700">
                        {subiendo ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />} Adjuntar archivo (máx. {kb(limites.porArchivo)})
                    </button>
                </div>

                {/* Comentarios */}
                <div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-2"><MessageSquare size={13} /> Comentarios ({coms.length})</span>
                    <div className="space-y-2 mb-2">
                        {coms.map(c => (
                            <div key={c.id} className="bg-slate-50 border border-[#efe8dd] rounded-lg p-2 group">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                    <span className="text-[9px] font-black text-slate-600">{c.autor}</span>
                                    <span className="text-[9px] text-slate-400">· {c.fecha}</span>
                                    <button onClick={() => delCom(c)} className="ml-auto text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 size={11} /></button>
                                </div>
                                <TextoConImagenes texto={c.texto} onVer={setVerArchivo}
                                    className="text-xs text-slate-700" />
                            </div>
                        ))}
                        {coms.length === 0 && <p className="text-[10px] text-slate-400 italic">Aún no hay comentarios.</p>}
                    </div>
                    <div className="flex gap-2">
                        <input value={nuevoCom} onChange={(e) => setNuevoCom(e.target.value)} disabled={enviandoCom}
                            data-imagen-inline="comentario"
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCom(); } }}
                            placeholder="Escribe un comentario…  (Ctrl+V pega una imagen)"
                            className="flex-1 bg-slate-50 border border-[#efe8dd] rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-emerald-500 disabled:opacity-60" />
                        <button onClick={addCom} disabled={enviandoCom || !nuevoCom.trim()} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg px-2.5">
                            {enviandoCom ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Visor a tamaño completo (clic afuera o en Cerrar para salir).
                Antes solo dibujaba imágenes; un PDF adjunto había que bajarlo al
                computador y abrirlo aparte para saber qué decía. */}
            {verArchivo && (
                <div className="fixed inset-0 z-[130] bg-black/80 flex items-center justify-center p-6"
                     onClick={() => cerrarVisor()}>
                    <div className="w-full max-w-4xl max-h-[90vh] flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
                        {/^image\//i.test(verArchivo.mime || '') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(verArchivo.nombre || '') ? (
                            <img src={verArchivo.url} alt={verArchivo.nombre}
                                 className="max-w-full max-h-[80vh] rounded-lg object-contain shadow-2xl" />
                        ) : /pdf/i.test(verArchivo.mime || '') || /\.pdf$/i.test(verArchivo.nombre || '') ? (
                            <iframe src={verArchivo.url} title={verArchivo.nombre}
                                    className="w-full h-[80vh] rounded-lg bg-white shadow-2xl" />
                        ) : (
                            // Word, Excel y demás no los dibuja el navegador. Se
                            // dice claro en vez de mostrar un recuadro en blanco.
                            <div className="bg-white rounded-lg p-8 flex flex-col items-center gap-3 max-w-sm text-center">
                                <Paperclip size={28} className="text-slate-400" />
                                <p className="text-xs text-slate-600">
                                    Este tipo de archivo no se puede previsualizar en el navegador.
                                </p>
                                <a href={verArchivo.url} download={verArchivo.nombre}
                                   className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-4 py-2 text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1.5">
                                    <Download size={13} /> Descargar
                                </a>
                            </div>
                        )}
                        <div className="flex items-center gap-4">
                            <span className="text-white/90 text-xs font-semibold truncate max-w-[60vw]">{verArchivo.nombre}</span>
                            <button onClick={() => cerrarVisor()}
                                    className="text-white/70 hover:text-white text-[11px] font-black uppercase tracking-widest">
                                Cerrar ✕
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ---------------------------------------------------------------
// Panel principal
// ---------------------------------------------------------------
// `modo` es la sección que lo monta: 'todas' | 'mias' | 'equipo'. Antes el panel
// traía un interruptor Mías/Equipo adentro; ahora la sección ya decidió el
// alcance y volver a preguntarlo dentro solo confunde (y permitía quedar en
// "Equipo" dentro de "Mis tareas").
const TareasPanel = ({ modo = 'todas' }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [tareas, setTareas] = useState([]);
    const [proyectos, setProyectos] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [loading, setLoading] = useState(true);
    // activas | completada | todas
    //
    // No basta con forzarlo en `cambiarVista`: al recargar la página la vista se
    // restaura desde localStorage SIN pasar por ahí, y el filtro se quedaba en
    // "activas" aunque la vista fuera el árbol. Se veía en el log del servidor
    // como `/api/crm/tareas?limite=300&estado=activas`.
    const [filtroEstado, setFiltroEstado] = useState(
        () => necesitaTodos(vistaGuardada()) ? 'todas' : 'activas'
    );

    // El proyecto elegido vive en la URL (`?proyecto=`) y no en el estado: así
    // "entrar a un proyecto" desde la pantalla de Proyectos es solo navegar, y
    // el enlace se puede compartir o recargar sin perder el filtro.
    const proyectoSel = searchParams.get('proyecto') || ''; // '' = todos
    const elegirProyecto = (id) => {
        const p = new URLSearchParams(searchParams);
        if (id) p.set('proyecto', id); else p.delete('proyecto');
        setSearchParams(p, { replace: true });
    };
    const [busq, setBusq] = useState('');
    // `?tarea=<id>` abre esa tarea al entrar. Es lo que permite que un aviso de
    // la campana lleve a LA tarea del aviso y no a la lista completa: antes
    // dejaba en «todas» y había que buscarla a mano, que era justo lo que la
    // notificación venía a evitar.
    //
    // Sirve para cualquier tarea, incluidas las subtareas: el panel de detalle
    // pide sus propios datos por id, así que no necesita que esté en la lista.
    const [selId, setSelId] = useState(() => searchParams.get('tarea') || null);
    const [filtroPrioridad, setFiltroPrioridad] = useState('');
    const [filtroResponsable, setFiltroResponsable] = useState('');

    // CÓMO SE VEN LAS TAREAS · «VISUALIZACIÓN DE TAREAS»
    // Antes había una sola forma: una lista plana. Ahora son tres, y la elección
    // se recuerda entre visitas porque cada persona tiende a quedarse con una.
    //
    //   lista   · plana, solo las raíces
    //   tablero · por estado, se arrastra
    //   arbol   · la jerarquía completa, padres e hijos juntos
    const [vista, setVista] = useState(vistaGuardada);
    const cambiarVista = (v) => {
        setVista(v);
        try { localStorage.setItem(LLAVE_VISTA, v); } catch { /* modo privado */ }
        // Ver `necesitaTodos` arriba: el tablero y el árbol se rompen visualmente
        // con el filtro en "Activas". El archivo es una vista aparte y se respeta.
        if (necesitaTodos(v) && filtroEstado !== 'archivadas') setFiltroEstado('todas');
    };
    // Agrupar la lista. '' = una sola lista corrida, como estaba.
    const [agrupar, setAgrupar] = useState('');
    const [total, setTotal] = useState(0);
    const [hayMas, setHayMas] = useState(false);
    const [cargandoMas, setCargandoMas] = useState(false);

    // La búsqueda ahora la resuelve el servidor, así que no se puede disparar
    // una consulta por cada tecla. Se espera a que la persona deje de escribir.
    const [busqAplicada, setBusqAplicada] = useState('');
    useEffect(() => {
        const t = setTimeout(() => setBusqAplicada(busq.trim()), 350);
        return () => clearTimeout(t);
    }, [busq]);

    // `?nueva=1` abre el formulario al entrar: es cómo el botón "+ Tarea" de la
    // pantalla Inicio llega hasta acá, sin duplicar el modal en cada pantalla.
    const [crear, setCrear] = useState(searchParams.get('nueva') === '1');
    const cerrarCrear = () => {
        setCrear(false);
        if (searchParams.get('nueva')) {
            const p = new URLSearchParams(searchParams);
            p.delete('nueva');
            setSearchParams(p, { replace: true });
        }
    };
    // Si llega otro `?tarea=` estando YA en esta pantalla, hay que hacerle caso.
    // Es el caso normal: se está mirando la lista y se pulsa un aviso de la
    // campana. El componente no se vuelve a montar, así que el valor inicial de
    // `selId` no se recalcula solo y el panel se quedaría en la tarea anterior.
    const pedidaEnUrl = searchParams.get('tarea');
    useEffect(() => {
        if (pedidaEnUrl) setSelId(pedidaEnUrl);
    }, [pedidaEnUrl]);

    // Al cerrar el detalle se limpia la URL: si `?tarea=` quedara puesto,
    // recargar la página volvería a abrir la tarea que se acaba de cerrar.
    const cerrarDetalle = () => {
        setSelId(null);
        if (searchParams.get('tarea')) {
            const p = new URLSearchParams(searchParams);
            p.delete('tarea');
            setSearchParams(p, { replace: true });
        }
    };

    const [nuevoProy, setNuevoProy] = useState(false);
    const [proyNombre, setProyNombre] = useState('');
    const [creandoProy, setCreandoProy] = useState(false);

    // Todos los filtros viajan al servidor (RNF-TA-02). Antes se traía la lista
    // completa y se filtraba en el navegador: con pocas tareas da igual, con
    // dos mil el navegador se arrastra y además hay que esperar a que baje todo
    // para ver tres resultados.
    const filtros = useCallback((desplazamiento) => {
        // soloRaiz: las subtareas se ven dentro de su tarea, no sueltas en la lista.
        //
        // El ÁRBOL es la excepción: ahí las subtareas son el punto, así que se
        // piden todas. Y se piden de a más por página, porque un árbol al que le
        // falta la mitad de las ramas se dibuja mal: un hijo cuyo padre quedó en
        // la página siguiente aparecería suelto arriba, como si fuera una raíz.
        // FINALIZADAS es la otra excepción. Al terminar una subtarea desaparecía
        // de todas partes: de la lista no estaba nunca (por `soloRaiz`) y en
        // «Finalizadas» tampoco salía, así que lo que uno cerraba se esfumaba y
        // no había dónde revisar lo hecho. Ahí sí se muestran sueltas, con el
        // nombre de su tarea madre al lado para saber de dónde salieron.
        const esArbol = vista === 'arbol';
        const verSubtareas = esArbol || filtroEstado === 'completada';
        const o = {
            ambito: modo,
            limite: String(esArbol ? POR_PAGINA_ARBOL : POR_PAGINA),
            desplazamiento: String(desplazamiento),
        };
        if (!verSubtareas) o.soloRaiz = '1';
        if (proyectoSel) o.proyectoId = proyectoSel;
        // El archivo es una vista aparte: o se ve lo vivo, o se ve lo archivado.
        if (filtroEstado === 'archivadas') o.archivadas = 'solo';
        else if (filtroEstado !== 'todas') o.estado = filtroEstado;   // 'activas' | 'completada'
        if (filtroPrioridad) o.prioridad = filtroPrioridad;
        if (filtroResponsable) o.responsableId = filtroResponsable;
        if (busqAplicada) o.q = busqAplicada;
        return o;
    }, [vista, modo, proyectoSel, filtroEstado, filtroPrioridad, filtroResponsable, busqAplicada]);

    const cargar = useCallback(async () => {
        setLoading(true);
        try {
            const [tRes, pRes] = await Promise.all([
                listarTareasApi(getSessionId(), filtros(0)),
                listarProyectosApi(getSessionId()),
            ]);
            const t = await tRes.json(); const p = await pRes.json();
            if (t.success) { setTareas(t.tareas || []); setTotal(t.total || 0); setHayMas(!!t.hayMas); }
            if (p.success) setProyectos(p.proyectos || []);
        } catch { /* la lista queda como estaba */ } finally { setLoading(false); }
    }, [filtros]);
    useEffect(() => { cargar(); }, [cargar]);

    // "Ver más" pide la página siguiente y la agrega al final, sin recargar lo
    // que la persona ya está mirando.
    const verMas = async () => {
        setCargandoMas(true);
        try {
            const r = await listarTareasApi(getSessionId(), filtros(tareas.length));
            const d = await r.json();
            if (d.success) {
                setTareas(prev => [...prev, ...(d.tareas || [])]);
                setTotal(d.total || 0);
                setHayMas(!!d.hayMas);
            }
        } catch { /* se queda con lo que ya tenía */ } finally { setCargandoMas(false); }
    };

    const limpiarFiltros = () => {
        setBusq(''); setFiltroPrioridad(''); setFiltroResponsable('');
        setFiltroEstado('activas'); elegirProyecto('');
    };
    const hayFiltros = !!(busqAplicada || filtroPrioridad || filtroResponsable || proyectoSel || filtroEstado !== 'activas');

    // Usuarios de la organización (responsable / colaboradores)
    useEffect(() => {
        (async () => {
            try { const r = await getCatalogosPersonasApi(getSessionId()); const d = await r.json(); if (d.success) setUsuarios(d.ejecutivos || []); } catch { /* */ }
        })();
    }, []);

    // Ya no se filtra acá: lo que llega del servidor es exactamente lo que se
    // muestra. Dejar un segundo filtro en el navegador solo servía para que los
    // dos se desincronizaran y el contador no calzara con la lista.
    const lista = tareas;

    // AGRUPAR · parte la misma lista en bloques con encabezado.
    // Se agrupa sobre lo que ya está en pantalla, no sobre el total: con la
    // lista paginada, decir "Proyecto X (3)" cuando el proyecto tiene 40 sería
    // mentir. Por eso el encabezado dice cuántas hay *acá*.
    const ORDEN_PRIO = { critica: 0, alta: 1, media: 2, baja: 3 };
    const grupos = React.useMemo(() => {
        if (!agrupar) return null;
        const mapa = new Map();
        for (const t of lista) {
            let clave, label, color = null;
            if (agrupar === 'proyecto') {
                clave = t.proyectoId || '_';
                label = t.proyectoNombre || 'Sin proyecto';
                color = t.proyectoColor || null;
            } else if (agrupar === 'responsable') {
                clave = t.responsableId || '_';
                label = t.responsableNombre || 'Sin responsable';
            } else {
                clave = t.prioridad || 'media';
                label = clave === 'critica' ? 'Crítica' : clave.charAt(0).toUpperCase() + clave.slice(1);
            }
            if (!mapa.has(clave)) mapa.set(clave, { clave, label, color, tareas: [] });
            mapa.get(clave).tareas.push(t);
        }
        const arr = [...mapa.values()];
        // Por prioridad manda la urgencia; en el resto, alfabético y "sin ..." al
        // final: un bloque llamado "Sin responsable" arriba de todo estorba.
        if (agrupar === 'prioridad') {
            arr.sort((a, b) => (ORDEN_PRIO[a.clave] ?? 9) - (ORDEN_PRIO[b.clave] ?? 9));
        } else {
            arr.sort((a, b) => (a.clave === '_') - (b.clave === '_') || a.label.localeCompare(b.label, 'es'));
        }
        return arr;
    }, [lista, agrupar]);

    // Mover una tarjeta de columna en el tablero. Se pinta al tiro y se manda
    // después; si el servidor rechaza, `cargar()` deja la pantalla como la base.
    const moverEstado = async (t, estado) => {
        setTareas(prev => prev.map(x => x.id === t.id ? { ...x, estado } : x));
        try {
            const r = await actualizarTareaApi(getSessionId(), t.id, { estado });
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            cargar();
        } catch (e) {
            toast({ variant: 'destructive', title: 'No se pudo mover', description: e.message });
            cargar();
        }
    };

    const completar = async (t, e) => {
        e.stopPropagation();
        setTareas(prev => prev.map(x => x.id === t.id ? { ...x, estado: 'completada' } : x));
        try { await completarTareaApi(getSessionId(), t.id); cargar(); } catch { cargar(); }
    };
    const eliminar = async (t, e) => {
        e.stopPropagation();
        if (!window.confirm(
            `¿Eliminar la tarea "${t.titulo}" y sus subtareas?\n\nEsto NO se puede deshacer.\nSi solo quieres sacarla de la lista, usa Archivar.`
        )) return;
        setTareas(prev => prev.filter(x => x.id !== t.id));
        if (selId === t.id) setSelId(null);
        try { await eliminarTareaApi(getSessionId(), t.id); cargar(); } catch { cargar(); }
    };

    // Archivar y desarchivar (RF-TA-17). La tarea desaparece de la lista actual
    // porque el filtro no la incluye, no porque se haya borrado.
    const archivar = async (t, e) => {
        e.stopPropagation();
        const volver = !!t.archivada;
        setTareas(prev => prev.filter(x => x.id !== t.id));
        if (selId === t.id) setSelId(null);
        try {
            const r = await archivarTareaApi(getSessionId(), t.id, !volver);
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            toast({
                title: volver ? 'Tarea recuperada' : 'Tarea archivada',
                description: volver
                    ? 'Volvió a la lista con el estado que tenía.'
                    : `Está en el filtro "Archivadas"${d.subtareas ? ` junto a sus ${d.subtareas} subtareas` : ''}.`,
            });
            cargar();
        } catch (err) { toast({ variant: 'destructive', title: 'Error', description: err.message }); cargar(); }
    };
    // Acá empezó el problema de los duplicados: sin candado, dos Enter seguidos
    // creaban dos proyectos iguales. La base ahora también lo impide.
    const crearProyecto = async () => {
        const nombre = proyNombre.trim();
        if (!nombre || creandoProy) return;
        setCreandoProy(true);
        setProyNombre('');
        try {
            const r = await crearProyectoApi(getSessionId(), { nombre });
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            setNuevoProy(false); cargar();
        } catch (e) {
            setProyNombre(nombre);
            toast({ variant: 'destructive', title: 'No se pudo crear el proyecto', description: e.message });
        } finally { setCreandoProy(false); }
    };
    const borrarProyecto = async (p, e) => {
        e.stopPropagation();
        if (!window.confirm(`¿Eliminar el proyecto "${p.nombre}"? Sus tareas quedarán sin proyecto.`)) return;
        try { await eliminarProyectoApi(getSessionId(), p.id); if (proyectoSel === p.id) elegirProyecto(''); cargar(); }
        catch { toast({ variant: 'destructive', title: 'Error' }); }
    };

    return (
        <div className="flex-1 min-h-0 flex flex-col gap-3 h-full">
            {/* Toolbar */}
            <div className="flex items-center justify-between flex-wrap gap-2 flex-shrink-0">
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Lista o tablero. Es lo primero de la barra porque cambia
                        todo lo que viene después. */}
                    <div className="flex bg-white border border-[#efe8dd] rounded-lg p-0.5">
                        {[['lista', 'Lista', List], ['tablero', 'Tablero', Kanban], ['arbol', 'Árbol', Network]].map(([v, label, Icono]) => (
                            <button key={v} onClick={() => cambiarVista(v)} title={`Ver como ${label.toLowerCase()}`}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-colors ${vista === v ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}>
                                <Icono size={12} /> {label}
                            </button>
                        ))}
                    </div>
                    {/* En el tablero las columnas ya separan por estado, así que
                        filtrar por estado además no tiene sentido. */}
                    {(vista === 'tablero'
                        ? [['todas', 'Vivas'], ['archivadas', 'Archivadas']]
                        : [['activas', 'Activas'], ['completada', 'Finalizadas'], ['todas', 'Todas'], ['archivadas', 'Archivadas']]
                    ).map(([f, label]) => (
                        <button key={f} onClick={() => setFiltroEstado(f)}
                            className={`px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider ${filtroEstado === f ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-white border-[#efe8dd] text-slate-500 hover:text-slate-900'}`}>
                            {label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Agrupar solo aplica a la lista: el tablero ya está agrupado
                        por estado y agrupar dos veces no se puede dibujar. */}
                    {vista === 'lista' && (
                        <select value={agrupar} onChange={(e) => setAgrupar(e.target.value)}
                            title="Agrupar la lista"
                            className="bg-white border border-[#efe8dd] rounded-lg px-2 py-2 text-[11px] text-slate-600 outline-none focus:border-emerald-500 cursor-pointer">
                            <option value="">Sin agrupar</option>
                            <option value="proyecto">Agrupar: proyecto</option>
                            <option value="responsable">Agrupar: responsable</option>
                            <option value="prioridad">Agrupar: prioridad</option>
                        </select>
                    )}
                    {/* Filtros de RF-TA-12. Se resuelven en el servidor. */}
                    <select value={filtroPrioridad} onChange={(e) => setFiltroPrioridad(e.target.value)}
                        title="Filtrar por prioridad"
                        className="bg-white border border-[#efe8dd] rounded-lg px-2 py-2 text-[11px] text-slate-600 outline-none focus:border-emerald-500 cursor-pointer capitalize">
                        <option value="">Prioridad: todas</option>
                        {PRIORIDADES.map(p => <option key={p} value={p}>{p === 'critica' ? 'crítica' : p}</option>)}
                    </select>
                    <select value={filtroResponsable} onChange={(e) => setFiltroResponsable(e.target.value)}
                        title="Filtrar por responsable"
                        className="bg-white border border-[#efe8dd] rounded-lg px-2 py-2 text-[11px] text-slate-600 outline-none focus:border-emerald-500 cursor-pointer max-w-[10rem]">
                        <option value="">Responsable: todos</option>
                        {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                    </select>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input value={busq} onChange={(e) => setBusq(e.target.value)}
                            placeholder="Buscar tarea, proyecto o persona..."
                            className="w-56 bg-white border border-[#efe8dd] rounded-lg pl-9 pr-3 py-2 text-xs outline-none focus:border-emerald-500" />
                    </div>
                    <button onClick={() => setCrear(true)} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest"><Plus size={14} /> Tarea</button>
                </div>
            </div>

            {/* Cuántas calzan con el filtro. El total lo cuenta el servidor, así
                que no miente cuando la lista está paginada. */}
            {!loading && (total > 0 || hayFiltros) && (
                <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500 -mt-1 flex-shrink-0">
                    <span className="font-bold">
                        {total === 0 ? 'Ninguna tarea calza con el filtro'
                            : `${lista.length} de ${total} ${total === 1 ? 'tarea' : 'tareas'}`}
                    </span>
                    {hayFiltros && (
                        <button onClick={limpiarFiltros} className="text-emerald-600 hover:text-emerald-700 font-black uppercase tracking-widest text-[10px]">
                            Limpiar filtros
                        </button>
                    )}
                </div>
            )}

            <div className="flex-1 min-h-0 flex gap-3 lg:gap-4">
                {/* Proyectos */}
                <div className="w-44 xl:w-52 shrink-0 bg-white border border-[#efe8dd] rounded-2xl p-3 flex-col gap-2 hidden md:flex overflow-y-auto">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Folder size={12} /> Proyectos</span>
                        <button onClick={() => setNuevoProy(v => !v)} className="text-slate-400 hover:text-emerald-600"><FolderPlus size={14} /></button>
                    </div>
                    {nuevoProy && (
                        <div className="flex gap-1">
                            <input value={proyNombre} onChange={(e) => setProyNombre(e.target.value)} disabled={creandoProy}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); crearProyecto(); } }}
                                placeholder="Nombre..." className="flex-1 min-w-0 bg-slate-50 border border-[#efe8dd] rounded-lg px-2 py-1 text-[11px] outline-none focus:border-emerald-500 disabled:opacity-60" autoFocus />
                            <button onClick={crearProyecto} className="bg-emerald-600 text-white rounded-lg px-2"><Check size={12} /></button>
                        </div>
                    )}
                    <button onClick={() => elegirProyecto('')} className={`text-left px-2 py-1.5 rounded-lg text-[11px] font-bold ${!proyectoSel ? 'bg-emerald-500/10 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}>Todas las tareas</button>
                    {proyectos.map(p => (
                        <button key={p.id} onClick={() => elegirProyecto(p.id)} className={`text-left px-2 py-1.5 rounded-lg group ${proyectoSel === p.id ? 'bg-emerald-500/10' : 'hover:bg-slate-50'}`}>
                            <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color || '#199b4d' }} />
                                <span className="text-[11px] font-bold text-slate-700 truncate flex-1">{p.nombre}</span>
                                <span onClick={(e) => borrarProyecto(p, e)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 cursor-pointer"><Trash2 size={11} /></span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                                <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${p.avance}%` }} /></div>
                                <span className="text-[8px] text-slate-400">{p.tareasHechas}/{p.tareasTotal}</span>
                            </div>
                        </button>
                    ))}
                    {proyectos.length === 0 && !nuevoProy && <p className="text-[10px] text-slate-400 italic">Sin proyectos aún.</p>}
                </div>

                {/* Lista de tareas */}
                <div className={`min-h-0 bg-white border border-[#efe8dd] rounded-2xl flex flex-col overflow-hidden transition-all ${selId ? 'flex-1 lg:w-3/5' : 'flex-1'}`}>
                    {/* El tablero desplaza en horizontal y maneja el alto de sus
                        columnas; la lista desplaza en vertical. Son dos modos de
                        scroll distintos, así que el contenedor cambia con la vista. */}
                    <div className={`flex-1 min-h-0 ${vista === 'tablero' ? 'flex flex-col p-2 gap-2' : 'overflow-y-auto'}`}>
                        {loading ? (
                            <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="animate-spin" /></div>
                        ) : lista.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-sm gap-2 text-center px-6">
                                <ListChecks size={28} />
                                {hayFiltros ? (
                                    <>
                                        <span>Ninguna tarea calza con lo que buscaste.</span>
                                        <button onClick={limpiarFiltros} className="text-emerald-600 font-bold text-xs">Limpiar los filtros</button>
                                    </>
                                ) : filtroEstado === 'archivadas'
                                    ? <span>No hay tareas archivadas.</span>
                                    : <span>No hay tareas. Usa <span className="text-emerald-600 font-bold">+ Tarea</span>.</span>}
                            </div>
                        ) : vista === 'tablero' ? (
                            <TableroTareas tareas={lista} selId={selId} onAbrir={setSelId} onMover={moverEstado} />
                        ) : vista === 'arbol' ? (
                            <ArbolTareas tareas={lista} selId={selId} onAbrir={setSelId} onCompletar={completar} />
                        ) : (grupos || [{ clave: '_todo', label: null, tareas: lista }]).map(g => (
                          <div key={g.clave}>
                            {g.label && (
                                <div className="sticky top-0 z-10 bg-[#faf7f2]/95 backdrop-blur-sm border-b border-[#efe8dd] px-4 py-1.5 flex items-center gap-2">
                                    {g.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.color }} />}
                                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{g.label}</span>
                                    <span className="text-[10px] font-black text-slate-400 tabular-nums">{g.tareas.length}</span>
                                </div>
                            )}
                            {g.tareas.map(t => {
                            const meta = ESTADO_META[t.estado] || ESTADO_META.pendiente;
                            const vencida = t.venceAt && new Date(t.venceAt) < new Date() && t.estado !== 'completada';
                            return (
                                <div key={t.id} onClick={() => setSelId(t.id)}
                                    className={`flex items-center gap-3 px-4 py-3 border-b border-[#efe8dd] cursor-pointer hover:bg-slate-50 group ${selId === t.id ? 'bg-emerald-500/5' : ''}`}>
                                    <button onClick={(e) => completar(t, e)} title="Finalizar" className="shrink-0">
                                        {t.estado === 'completada' ? <CheckCircle2 size={17} className="text-emerald-500" /> : <Circle size={17} className="text-slate-300 hover:text-emerald-500" />}
                                    </button>
                                    <div className="min-w-0 flex-1">
                                        <p className={`text-xs font-bold truncate ${t.estado === 'completada' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{t.titulo}</p>
                                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                            {/* De qué tarea cuelga. Solo aparece en las subtareas, y
                                                es lo que hace legible el filtro "Finalizadas": ahí
                                                salen sueltas y «EDITAR PLANTILLAS» sin contexto no
                                                dice de dónde salió. Se puede pulsar para subir a la
                                                madre sin buscarla en la lista. */}
                                            {t.padreTitulo && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setSelId(t.parentId); }}
                                                    title={`Abrir la tarea madre: ${t.padreTitulo}`}
                                                    className="text-[9px] font-bold text-slate-400 hover:text-emerald-600 flex items-center gap-0.5 max-w-[14rem] truncate"
                                                >
                                                    <ChevronRight size={9} className="rotate-180 shrink-0" />
                                                    <span className="truncate">{t.padreTitulo}</span>
                                                </button>
                                            )}
                                            {t.proyectoNombre && <span className="text-[9px] font-bold" style={{ color: t.proyectoColor || '#199b4d' }}>● {t.proyectoNombre}</span>}
                                            {t.responsableNombre && <span className="text-[9px] text-slate-500 flex items-center gap-0.5"><User size={9} /> {t.responsableNombre}</span>}
                                            {t.subtareasTotal > 0 && <span className="text-[9px] text-slate-500 flex items-center gap-0.5"><ListChecks size={9} /> {t.subtareasHechas}/{t.subtareasTotal}</span>}
                                            {t.comentarios > 0 && <span className="text-[9px] text-slate-500 flex items-center gap-0.5"><MessageSquare size={9} /> {t.comentarios}</span>}
                                        </div>
                                    </div>
                                    {t.venceAt && <span className={`text-[9px] font-bold shrink-0 ${vencida ? 'text-red-600' : 'text-slate-500'}`}>{fechaCorta(t.venceAt)}</span>}
                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase shrink-0 ${PRIO[t.prioridad] || PRIO.media}`}>{t.prioridad}</span>
                                    <span className={`text-[9px] font-black uppercase shrink-0 ${meta.c} hidden lg:inline`}>{meta.label}</span>
                                    <button onClick={(e) => archivar(t, e)}
                                        title={t.archivada ? 'Devolver a la lista' : 'Archivar (no se borra)'}
                                        className="text-slate-300 hover:text-amber-600 opacity-0 group-hover:opacity-100 shrink-0">
                                        {t.archivada ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                                    </button>
                                    <button onClick={(e) => eliminar(t, e)} title="Eliminar definitivamente" className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 shrink-0"><Trash2 size={13} /></button>
                                </div>
                            );
                            })}
                          </div>
                        ))}

                        {/* Paginación: la lista no se trae completa nunca. */}
                        {!loading && hayMas && (
                            <button onClick={verMas} disabled={cargandoMas}
                                className="w-full py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-emerald-700 hover:bg-slate-50 flex items-center justify-center gap-2">
                                {cargandoMas ? <Loader2 size={13} className="animate-spin" /> : null}
                                Ver más ({total - lista.length} restantes)
                            </button>
                        )}
                    </div>
                </div>

                {/* Detalle */}
                {selId && <DetalleTarea tareaId={selId} onClose={cerrarDetalle} onChanged={cargar} usuarios={usuarios} onAbrir={setSelId} />}
            </div>

            {crear && <CrearTareaModal onClose={cerrarCrear} onCreated={cargar} proyectos={proyectos} usuarios={usuarios} proyectoActual={proyectoSel} />}
        </div>
    );
};

export default TareasPanel;
