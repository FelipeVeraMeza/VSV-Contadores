// =====================================================================
// 🗂️ PLANTILLAS DE CORREO — administrarlas sin entrar a redactar
// ---------------------------------------------------------------------
// Hasta ahora las plantillas solo existían como una fila de botones en la
// pantalla de Correo: servían para PARTIR de un texto, pero corregir una
// coma obligaba a fingir un envío —abrir el redactor, cargar la plantilla,
// editar, guardar— con el botón de enviar ahí al lado.
//
// Acá se administran y punto: se ven completas, se corrigen y se comparten.
// La pantalla de Correo conserva su selector, que es donde se usan.
//
// COMPARTIR ES EXPLÍCITO: por omisión la plantilla es propia. Lo que uno
// escribe para su día a día no tiene por qué aparecerle al resto del equipo.
// =====================================================================
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    LayoutTemplate, Plus, Save, Trash2, Loader2, Search, Lock, Users2,
    Check, X, Tag,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import EditorRico from '@/components/comunicaciones/EditorRico';
import { aHtmlEditor } from '@/components/comunicaciones/CuerpoCorreo';
import {
    listarPlantillasCorreoApi, guardarPlantillaCorreoApi,
    eliminarPlantillaCorreoApi, camposCorreoApi,
} from '@/services/correosService';

const getUser = () => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } };
const getSessionId = () => getUser().sessionId;

const inp = 'w-full bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500';

const VACIA = {
    id: null, nombre: '', descripcion: '', asunto: '', cuerpo: '',
    firma: '', firmaImagen: null, compartida: false,
};

// Las marcas que YA tiene un texto guardado. Sirve para no rechazar la edición
// de una plantilla que usa columnas de una planilla ({{impuesto_a_pagar}} y
// compañía): esas marcas no existen en el CRM, existen en el Excel con el que
// se armó, y acá no hay ninguno cargado. Se toleran las que ya estaban; una
// marca nueva mal escrita sigue saltando, que es para lo que sirve el aviso.
const marcasDe = (texto) =>
    [...String(texto || '').matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map(m => m[1]);

const PlantillasCorreo = () => {
    const [plantillas, setPlantillas] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [busqueda, setBusqueda] = useState('');

    // `borrador` es lo que se está editando; `original` es como estaba guardada,
    // para saber qué marcas traía de antes y para el aviso de «sin guardar».
    const [borrador, setBorrador] = useState(VACIA);
    const [original, setOriginal] = useState(null);
    const [guardando, setGuardando] = useState(false);
    const [borrando, setBorrando] = useState(null);

    const [campos, setCampos] = useState([]);

    // Dónde estaba el cursor: al pulsar una marca se inserta en el campo que se
    // estaba escribiendo, no siempre en el texto.
    const refAsunto = useRef(null);
    const refEditor = useRef(null);
    const ultimoCampo = useRef('cuerpo');

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            const r = await listarPlantillasCorreoApi(getSessionId());
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            setPlantillas(d.plantillas || []);
        } catch (e) {
            toast({ variant: 'destructive', title: 'No se pudieron cargar', description: e.message });
        } finally { setCargando(false); }
    }, []);

    useEffect(() => { cargar(); }, [cargar]);

    useEffect(() => {
        (async () => {
            try {
                const r = await camposCorreoApi(getSessionId());
                const d = await r.json();
                if (d.success) setCampos(d.campos || []);
            } catch { /* las marcas son una ayuda, no un requisito */ }
        })();
    }, []);

    const lista = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        if (!q) return plantillas;
        return plantillas.filter(p =>
            String(p.nombre || '').toLowerCase().includes(q) ||
            String(p.asunto || '').toLowerCase().includes(q) ||
            String(p.descripcion || '').toLowerCase().includes(q));
    }, [plantillas, busqueda]);

    const sucio = useMemo(() => {
        const base = original || VACIA;
        return ['nombre', 'descripcion', 'asunto', 'cuerpo', 'firma', 'compartida']
            .some(k => (borrador[k] || '') !== (base[k] || ''));
    }, [borrador, original]);

    const abrir = (p) => {
        if (sucio && !window.confirm('Tienes cambios sin guardar. ¿Los descartas?')) return;
        const limpia = {
            id: p.id,
            nombre: p.nombre || '',
            descripcion: p.descripcion || '',
            asunto: p.asunto || '',
            // Las plantillas de antes del editor son texto plano: sin convertirlas
            // a párrafos, el editor las muestra como un bloque corrido y al
            // guardar se perderían los saltos de línea de verdad.
            cuerpo: aHtmlEditor(p.cuerpo || ''),
            firma: p.firma || '',
            // Se arrastra tal cual: el backend reescribe `firma_imagen` con lo
            // que venga en el cuerpo de la petición, así que no mandarla borraría
            // el logo de la plantilla sin que nadie lo haya pedido.
            firmaImagen: p.firmaImagen || null,
            compartida: !!p.compartida,
        };
        setBorrador(limpia);
        setOriginal(limpia);
    };

    // Todo lo que descarta el borrador pasa por acá: si no, «Cerrar» se comía
    // los cambios en silencio mientras «Nueva» sí preguntaba.
    const descartar = () => {
        if (sucio && !window.confirm('Tienes cambios sin guardar. ¿Los descartas?')) return;
        setBorrador(VACIA);
        setOriginal(null);
    };

    const insertarMarca = (marca) => {
        const campo = ultimoCampo.current === 'asunto' ? 'asunto' : 'cuerpo';
        const ref = campo === 'asunto' ? refAsunto : refCuerpo;
        const el = ref.current;
        const texto = borrador[campo] || '';
        const marcado = `{{${marca}}}`;
        const pos = el ? el.selectionStart : texto.length;
        const nuevo = texto.slice(0, pos) + marcado + texto.slice(el ? el.selectionEnd : texto.length);
        setBorrador(b => ({ ...b, [campo]: nuevo }));
        // Devolver el cursor DESPUÉS de la marca recién puesta: si no, el foco
        // se pierde y hay que volver a pinchar el campo por cada marca.
        requestAnimationFrame(() => {
            if (!el) return;
            el.focus();
            el.setSelectionRange(pos + marcado.length, pos + marcado.length);
        });
    };

    // Se valida acá lo mismo que valida el servidor. No es desconfianza del
    // backend —él sigue mandando—: es que decir «falta el asunto» al tiro es
    // mejor que mandar la petición para que vuelva con un error genérico.
    const guardar = async () => {
        const falta = !borrador.nombre.trim() ? ['el nombre', 'Es como la vas a reconocer después.']
                    : !borrador.asunto.trim() ? ['el asunto', 'Es lo que el cliente ve en su bandeja.']
                    : !borrador.cuerpo.trim() ? ['el texto', 'Una plantilla sin texto no sirve para partir.']
                    : null;
        if (falta) {
            toast({ variant: 'destructive', title: `Falta ${falta[0]}`, description: falta[1] });
            return;
        }
        setGuardando(true);
        try {
            const r = await guardarPlantillaCorreoApi(getSessionId(), {
                nombre: borrador.nombre,
                descripcion: borrador.descripcion,
                asunto: borrador.asunto,
                cuerpo: borrador.cuerpo,
                firma: borrador.firma,
                firmaImagen: borrador.firmaImagen,
                compartida: borrador.compartida,
                marcasExtra: original ? marcasDe(`${original.asunto} ${original.cuerpo}`) : [],
            }, borrador.id);
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            toast({ title: borrador.id ? 'Plantilla actualizada' : 'Plantilla creada', description: `«${borrador.nombre.trim()}»` });
            await cargar();
            const guardada = { ...borrador, id: d.plantillaId || borrador.id };
            setBorrador(guardada);
            setOriginal(guardada);
        } catch (e) {
            toast({ variant: 'destructive', title: 'No se pudo guardar', description: e.message });
        } finally { setGuardando(false); }
    };

    const borrar = async (p, e) => {
        e?.stopPropagation();
        if (!window.confirm(`¿Eliminar la plantilla «${p.nombre}»?\n\nEsto no se puede deshacer.`)) return;
        setBorrando(p.id);
        try {
            const r = await eliminarPlantillaCorreoApi(getSessionId(), p.id);
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            toast({ title: 'Plantilla eliminada' });
            if (borrador.id === p.id) { setBorrador(VACIA); setOriginal(null); }
            await cargar();
        } catch (err) {
            toast({ variant: 'destructive', title: 'No se pudo eliminar', description: err.message });
        } finally { setBorrando(null); }
    };

    return (
        // En pantalla angosta la lista va ARRIBA y el editor debajo: apiladas de
        // lado, el editor quedaba en una columna de un par de dedos de ancho.
        <div className="h-full min-h-0 flex flex-col lg:flex-row gap-3">

            {/* ═══ 1 · LAS QUE HAY ═══ */}
            <div className="w-full lg:w-72 shrink-0 flex flex-col bg-white border border-[#efe8dd] rounded-2xl overflow-hidden max-h-56 lg:max-h-none">
                <div className="px-3 py-2.5 border-b border-[#efe8dd] flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
                        <LayoutTemplate size={13} className="text-emerald-600" /> Plantillas
                    </span>
                    <button onClick={descartar}
                        className="text-[9px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                        <Plus size={11} /> Nueva
                    </button>
                </div>

                <div className="px-3 py-2 border-b border-[#efe8dd]">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                            placeholder="Buscar plantilla…" className={`${inp} pl-8`} />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {cargando ? (
                        <div className="flex items-center justify-center py-12 text-slate-400"><Loader2 className="animate-spin" size={18} /></div>
                    ) : lista.length === 0 ? (
                        <p className="text-[10px] text-slate-400 italic text-center py-10 px-4">
                            {busqueda ? 'Ninguna plantilla calza con eso.' : 'Todavía no hay plantillas. Crea la primera.'}
                        </p>
                    ) : lista.map(p => {
                        const activa = borrador.id === p.id;
                        return (
                            <button key={p.id} onClick={() => abrir(p)}
                                className={`group w-full text-left px-3 py-2.5 border-b border-[#f5f0e8] transition-colors
                                    ${activa ? 'bg-emerald-500/5 border-l-2 border-l-emerald-500' : 'hover:bg-slate-50'}`}>
                                <div className="flex items-center gap-1.5">
                                    {/* De un vistazo: candado = mía, dos personas = la ve el equipo. */}
                                    {p.compartida
                                        ? <Users2 size={10} className="text-slate-400 shrink-0" />
                                        : <Lock size={10} className="text-slate-400 shrink-0" />}
                                    <span className="text-[11px] font-bold text-slate-800 truncate flex-1">{p.nombre}</span>
                                    <span onClick={(e) => borrar(p, e)} title="Eliminar"
                                        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 shrink-0">
                                        {borrando === p.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                                    </span>
                                </div>
                                <p className="text-[9px] text-slate-400 truncate mt-0.5">{p.asunto}</p>
                                <div className="flex items-center gap-2 mt-1 text-[9px] text-slate-400">
                                    {p.vecesUsada > 0 && (
                                        <span className="tabular-nums">Usada {p.vecesUsada} {p.vecesUsada === 1 ? 'vez' : 'veces'}</span>
                                    )}
                                    {p.autor && <span className="truncate ml-auto">{p.autor}</span>}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ═══ 2 · QUÉ DICE ═══ */}
            <div className="flex-1 min-w-0 flex flex-col bg-white border border-[#efe8dd] rounded-2xl overflow-hidden">
                <div className="px-3 py-2.5 border-b border-[#efe8dd] flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                        {borrador.id ? 'Editar plantilla' : 'Nueva plantilla'}
                    </span>
                    {sucio && (
                        <span className="text-[9px] font-black uppercase tracking-widest text-amber-600">Sin guardar</span>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="block">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Nombre</span>
                            <input value={borrador.nombre}
                                onChange={(e) => setBorrador(b => ({ ...b, nombre: e.target.value }))}
                                placeholder="Aviso de F29 declarado" className={`${inp} mt-1`} />
                        </label>
                        <label className="block">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Para qué sirve</span>
                            <input value={borrador.descripcion}
                                onChange={(e) => setBorrador(b => ({ ...b, descripcion: e.target.value }))}
                                placeholder="Opcional: cuándo se usa" className={`${inp} mt-1`} />
                        </label>
                    </div>

                    <label className="block">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Asunto</span>
                        <input ref={refAsunto} value={borrador.asunto}
                            onFocus={() => { ultimoCampo.current = 'asunto'; }}
                            onChange={(e) => setBorrador(b => ({ ...b, asunto: e.target.value }))}
                            placeholder="F29 DECLARADO – {{empresa}}" className={`${inp} mt-1`} />
                    </label>

                    <div onFocus={() => { ultimoCampo.current = 'cuerpo'; }}>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Texto</span>
                        <div className="mt-1">
                            <EditorRico
                                ref={refEditor}
                                value={borrador.cuerpo}
                                onChange={(html) => setBorrador(b => ({ ...b, cuerpo: html }))}
                                placeholder={'Estimados,\n\nInformamos que el F29 de {{empresa}} ya fue declarado.'}
                                minAlto={220}
                            />
                        </div>
                    </div>

                    {/* Las marcas se guardan SIN resolver: la gracia es que el monto
                        salga del plan que el cliente tiene hoy, no del que tenía
                        cuando se redactó el texto. */}
                    {campos.length > 0 && (
                        <div>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                <Tag size={10} /> Datos que se reemplazan solos
                            </span>
                            <div className="flex gap-1.5 flex-wrap mt-1">
                                {campos.map(c => (
                                    <button key={c.marca} onClick={() => insertarMarca(c.marca)}
                                        title={`${c.etiqueta}${c.ejemplo ? ` · ej: ${c.ejemplo}` : ''}`}
                                        className="text-[10px] font-mono px-2 py-1 rounded-lg border border-[#efe8dd] bg-slate-50 text-slate-600 hover:border-emerald-500/60 hover:text-emerald-700 transition-colors">
                                        {`{{${c.marca}}}`}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[9px] text-slate-400 mt-1">
                                Se insertan donde tengas el cursor. Una marca mal escrita el sistema la deja
                                a la vista en la previa, no la borra: así se nota antes de mandar.
                            </p>
                        </div>
                    )}

                    <label className="block">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Firma que trae</span>
                        <textarea value={borrador.firma} rows={3}
                            onChange={(e) => setBorrador(b => ({ ...b, firma: e.target.value }))}
                            placeholder="Opcional. Vacío = se usa la tuya al redactar."
                            className={`${inp} mt-1 resize-y`} />
                    </label>

                    <label className="flex items-start gap-2 cursor-pointer">
                        <input type="checkbox" checked={borrador.compartida}
                            onChange={(e) => setBorrador(b => ({ ...b, compartida: e.target.checked }))}
                            className="accent-emerald-500 mt-0.5" />
                        <span className="min-w-0">
                            <span className="text-[10px] font-bold text-slate-700 block">Compartir con el equipo</span>
                            <span className="text-[9px] text-slate-400 block">
                                Apagado queda solo tuya. Encendido la ve —y la puede editar— todo el equipo.
                            </span>
                        </span>
                    </label>
                </div>

                <div className="shrink-0 px-3 py-2.5 border-t border-[#efe8dd] flex gap-2">
                    <button onClick={guardar} disabled={guardando || !borrador.nombre.trim()}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg h-9 text-[10px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-1.5">
                        {guardando ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        {borrador.id ? 'Guardar cambios' : 'Crear plantilla'}
                    </button>
                    {borrador.id && (
                        <button onClick={descartar}
                            className="px-4 rounded-lg border border-[#efe8dd] text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 inline-flex items-center gap-1.5">
                            <X size={12} /> Cerrar
                        </button>
                    )}
                    {!borrador.id && borrador.nombre.trim() && (
                        <span className="px-3 text-[9px] text-slate-400 self-center inline-flex items-center gap-1">
                            <Check size={11} className="text-emerald-500" /> Se guarda como tuya
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PlantillasCorreo;
