import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Plus, Search, Loader2, X, Trash2, Check, Clock, Folder, FolderPlus,
    MessageSquare, ListChecks, ChevronRight, Circle, CircleDot, CheckCircle2,
    Flag, User, Users, Calendar, Send, Paperclip, Download, Eye, Archive, ArchiveRestore
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import {
    listarTareasApi, crearTareaApi, actualizarTareaApi, eliminarTareaApi, completarTareaApi,
    obtenerTareaApi, agregarComentarioApi, eliminarComentarioApi,
    subirAdjuntoApi, descargarAdjuntoApi, eliminarAdjuntoApi,
    listarProyectosApi, crearProyectoApi, eliminarProyectoApi, archivarTareaApi,
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
const inp = "w-full bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500";
const fechaCorta = (d) => d ? new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) : null;

// ---------------------------------------------------------------
// Modal: crear tarea
// ---------------------------------------------------------------
const CrearTareaModal = ({ onClose, onCreated, proyectos, usuarios, proyectoActual }) => {
    const [form, setForm] = useState({
        titulo: '', descripcion: '', prioridad: 'media', venceAt: '',
        responsableId: getUser().id || '', proyectoId: proyectoActual || '', colaboradores: [],
    });
    const [saving, setSaving] = useState(false);
    const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));
    const toggleColab = (id) => setForm(p => ({ ...p, colaboradores: p.colaboradores.includes(id) ? p.colaboradores.filter(x => x !== id) : [...p.colaboradores, id] }));
    const guardar = async () => {
        if (!form.titulo.trim()) { toast({ variant: 'destructive', title: 'Falta el nombre' }); return; }
        setSaving(true);
        try {
            const r = await crearTareaApi(getSessionId(), { ...form, venceAt: form.venceAt || null, proyectoId: form.proyectoId || null });
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            toast({ title: 'Tarea creada' }); onCreated(); onClose();
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
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Crear tarea
                    </button>
                </div>
            </div>
        </div>
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
    const addSub = async () => {
        if (!nuevaSub.trim()) return;
        try {
            const r = await crearTareaApi(getSessionId(), { titulo: nuevaSub, parentId: tareaId });
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            setNuevaSub(''); cargar(); onChanged();
        } catch (e) { toast({ variant: 'destructive', title: 'Error', description: e.message }); }
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
    const addCom = async () => {
        if (!nuevoCom.trim()) return;
        try {
            const r = await agregarComentarioApi(getSessionId(), tareaId, nuevoCom);
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            setComs(prev => [...prev, d.comentario]); setNuevoCom('');
        } catch (e) { toast({ variant: 'destructive', title: 'Error', description: e.message }); }
    };
    const delCom = async (c) => {
        setComs(prev => prev.filter(x => x.id !== c.id));
        try { await eliminarComentarioApi(getSessionId(), c.id); } catch { cargar(); }
    };
    // ---- Adjuntos (se guardan como binario en la base) ----
    const subirArchivo = async (e) => {
        const file = e.target.files?.[0];
        if (fileRef.current) fileRef.current.value = '';
        if (!file) return;
        // Se avisa acá antes de gastar la subida; el servidor vuelve a revisarlo
        // igual, porque esta comprobación se puede saltar.
        if (file.size > limites.porArchivo) {
            toast({ variant: 'destructive', title: 'Archivo muy grande', description: `«${file.name}» pesa ${kb(file.size)} y el máximo es ${kb(limites.porArchivo)}.` });
            return;
        }
        if (limites.usado + file.size > limites.porTarea) {
            const libre = Math.max(0, limites.porTarea - limites.usado);
            toast({ variant: 'destructive', title: 'No cabe en esta tarea', description: `Quedan ${kb(libre)} libres de ${kb(limites.porTarea)}. Elimina algún archivo.` });
            return;
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
            toast({ title: 'Archivo subido' });
        } catch (err) { toast({ variant: 'destructive', title: 'Error', description: err.message }); }
        finally { setSubiendo(false); }
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
                {data.descripcion && <div><span className="text-[9px] text-slate-400 uppercase block mb-1">Descripción</span><p className="text-xs text-slate-700 whitespace-pre-wrap">{data.descripcion}</p></div>}

                {/* Subtareas */}
                {/* Un solo nivel de anidación: dentro de una subtarea no se ofrece
                    crear otra. Sin ese tope se puede anidar sin fin y la pantalla
                    deja de entenderse. */}
                {!data.parentId && (
                <div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-2"><ListChecks size={13} /> Subtareas ({subs.filter(s => s.estado === 'completada').length}/{subs.length})</span>
                    <div className="space-y-1">
                        {subs.map(s => (
                            <div key={s.id} className="flex items-center gap-2 group">
                                <button onClick={() => toggleSub(s)} className="shrink-0">
                                    {s.estado === 'completada' ? <CheckCircle2 size={15} className="text-emerald-500" /> : <Circle size={15} className="text-slate-300 hover:text-emerald-500" />}
                                </button>
                                <button
                                    onClick={() => onAbrir?.(s.id)}
                                    title="Abrir la subtarea"
                                    className={`text-xs flex-1 text-left hover:text-emerald-600 hover:underline underline-offset-2 ${s.estado === 'completada' ? 'text-slate-400 line-through' : 'text-slate-700'}`}
                                >
                                    {s.titulo}
                                </button>
                                <button onClick={() => delSub(s)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 shrink-0"><Trash2 size={12} /></button>
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-2 mt-2">
                        <input value={nuevaSub} onChange={(e) => setNuevaSub(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSub()} placeholder="Nueva subtarea..." className="flex-1 bg-slate-50 border border-[#efe8dd] rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-emerald-500" />
                        <button onClick={addSub} className="bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg px-2.5"><Plus size={14} /></button>
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
                                <Paperclip size={13} className="text-slate-400 shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-bold text-slate-700 truncate">{a.nombre}</p>
                                    <p className="text-[9px] text-slate-400">{kb(a.tamano)} · {a.autor}</p>
                                </div>
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
                                <p className="text-xs text-slate-700 whitespace-pre-wrap">{c.texto}</p>
                            </div>
                        ))}
                        {coms.length === 0 && <p className="text-[10px] text-slate-400 italic">Aún no hay comentarios.</p>}
                    </div>
                    <div className="flex gap-2">
                        <input value={nuevoCom} onChange={(e) => setNuevoCom(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCom()} placeholder="Escribe un comentario..." className="flex-1 bg-slate-50 border border-[#efe8dd] rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-emerald-500" />
                        <button onClick={addCom} disabled={!nuevoCom.trim()} className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-2.5"><Send size={14} /></button>
                    </div>
                </div>
            </div>
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
    const [filtroEstado, setFiltroEstado] = useState('activas'); // activas | completada | todas

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
    const [selId, setSelId] = useState(null);
    const [filtroPrioridad, setFiltroPrioridad] = useState('');
    const [filtroResponsable, setFiltroResponsable] = useState('');
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
    const [nuevoProy, setNuevoProy] = useState(false);
    const [proyNombre, setProyNombre] = useState('');

    // Todos los filtros viajan al servidor (RNF-TA-02). Antes se traía la lista
    // completa y se filtraba en el navegador: con pocas tareas da igual, con
    // dos mil el navegador se arrastra y además hay que esperar a que baje todo
    // para ver tres resultados.
    const filtros = useCallback((desplazamiento) => {
        // soloRaiz: las subtareas se ven dentro de su tarea, no sueltas en la lista.
        const o = { soloRaiz: '1', ambito: modo, limite: String(POR_PAGINA), desplazamiento: String(desplazamiento) };
        if (proyectoSel) o.proyectoId = proyectoSel;
        // El archivo es una vista aparte: o se ve lo vivo, o se ve lo archivado.
        if (filtroEstado === 'archivadas') o.archivadas = 'solo';
        else if (filtroEstado !== 'todas') o.estado = filtroEstado;   // 'activas' | 'completada'
        if (filtroPrioridad) o.prioridad = filtroPrioridad;
        if (filtroResponsable) o.responsableId = filtroResponsable;
        if (busqAplicada) o.q = busqAplicada;
        return o;
    }, [modo, proyectoSel, filtroEstado, filtroPrioridad, filtroResponsable, busqAplicada]);

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
    const crearProyecto = async () => {
        if (!proyNombre.trim()) return;
        try {
            const r = await crearProyectoApi(getSessionId(), { nombre: proyNombre });
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            setProyNombre(''); setNuevoProy(false); cargar();
        } catch (e) { toast({ variant: 'destructive', title: 'Error', description: e.message }); }
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
                    {[['activas', 'Activas'], ['completada', 'Finalizadas'], ['todas', 'Todas'], ['archivadas', 'Archivadas']].map(([f, label]) => (
                        <button key={f} onClick={() => setFiltroEstado(f)}
                            className={`px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider ${filtroEstado === f ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-white border-[#efe8dd] text-slate-500 hover:text-slate-900'}`}>
                            {label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
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
                            <input value={proyNombre} onChange={(e) => setProyNombre(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && crearProyecto()} placeholder="Nombre..." className="flex-1 min-w-0 bg-slate-50 border border-[#efe8dd] rounded-lg px-2 py-1 text-[11px] outline-none focus:border-emerald-500" autoFocus />
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
                    <div className="flex-1 overflow-y-auto">
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
                        ) : lista.map(t => {
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
                {selId && <DetalleTarea tareaId={selId} onClose={() => setSelId(null)} onChanged={cargar} usuarios={usuarios} onAbrir={setSelId} />}
            </div>

            {crear && <CrearTareaModal onClose={cerrarCrear} onCreated={cargar} proyectos={proyectos} usuarios={usuarios} proyectoActual={proyectoSel} />}
        </div>
    );
};

export default TareasPanel;
