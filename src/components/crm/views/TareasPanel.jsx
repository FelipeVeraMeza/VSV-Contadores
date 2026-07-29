import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Plus, Search, Loader2, X, Trash2, Check, Clock, Folder, FolderPlus,
    MessageSquare, ListChecks, ChevronRight, Circle, CircleDot, CheckCircle2,
    Flag, User, Users, Calendar, Send, Paperclip, Download
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import {
    listarTareasApi, crearTareaApi, actualizarTareaApi, eliminarTareaApi, completarTareaApi,
    obtenerTareaApi, agregarComentarioApi, eliminarComentarioApi,
    subirAdjuntoApi, descargarAdjuntoApi, eliminarAdjuntoApi,
    listarProyectosApi, crearProyectoApi, eliminarProyectoApi,
} from '@/services/crmService';
import { getCatalogosApi as getCatalogosPersonasApi } from '@/services/personaService';

const getUser = () => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } };
const getSessionId = () => getUser().sessionId;

const PRIO = { alta: 'text-red-600 bg-red-500/10 border-red-500/30', media: 'text-amber-600 bg-amber-500/10 border-amber-500/30', baja: 'text-slate-500 bg-slate-500/10 border-slate-400/30' };
const ESTADO_META = {
    pendiente: { label: 'Activa', icon: Circle, c: 'text-blue-600' },
    en_proceso: { label: 'En proceso', icon: CircleDot, c: 'text-amber-600' },
    completada: { label: 'Finalizada', icon: CheckCircle2, c: 'text-emerald-600' },
    cancelada: { label: 'Cancelada', icon: X, c: 'text-slate-400' },
};
const ESTADOS_ORDEN = ['pendiente', 'en_proceso', 'completada'];
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
                                <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
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
const DetalleTarea = ({ tareaId, onClose, onChanged, usuarios }) => {
    const [data, setData] = useState(null);
    const [subs, setSubs] = useState([]);
    const [coms, setComs] = useState([]);
    const [adjs, setAdjs] = useState([]);
    const [subiendo, setSubiendo] = useState(false);
    const [loading, setLoading] = useState(true);
    const [nuevaSub, setNuevaSub] = useState('');
    const [nuevoCom, setNuevoCom] = useState('');
    const fileRef = React.useRef(null);

    const cargar = useCallback(async () => {
        try {
            const r = await obtenerTareaApi(getSessionId(), tareaId);
            const d = await r.json();
            if (d.success) { setData(d.tarea); setSubs(d.subtareas || []); setComs(d.comentarios || []); setAdjs(d.adjuntos || []); }
        } catch { /* */ } finally { setLoading(false); }
    }, [tareaId]);
    useEffect(() => { setLoading(true); cargar(); }, [cargar]);

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
        if (file.size > 7 * 1024 * 1024) { toast({ variant: 'destructive', title: 'Archivo muy grande', description: 'Máximo 7 MB.' }); return; }
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
                    <div><span className="text-[9px] text-slate-400 uppercase block">Responsable</span><span className="text-slate-700">{data.responsableNombre || '—'}</span></div>
                    <div><span className="text-[9px] text-slate-400 uppercase block">Prioridad</span><span className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase ${PRIO[data.prioridad]}`}>{data.prioridad}</span></div>
                    <div><span className="text-[9px] text-slate-400 uppercase block">Entrega</span><span className="text-slate-700">{data.venceAt ? new Date(data.venceAt).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</span></div>
                    <div><span className="text-[9px] text-slate-400 uppercase block">Colaboradores</span><span className="text-slate-700">{(data.colaboradores || []).map(c => c.nombre).join(', ') || '—'}</span></div>
                </div>
                {data.descripcion && <div><span className="text-[9px] text-slate-400 uppercase block mb-1">Descripción</span><p className="text-xs text-slate-700 whitespace-pre-wrap">{data.descripcion}</p></div>}

                {/* Subtareas */}
                <div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-2"><ListChecks size={13} /> Subtareas ({subs.filter(s => s.estado === 'completada').length}/{subs.length})</span>
                    <div className="space-y-1">
                        {subs.map(s => (
                            <div key={s.id} className="flex items-center gap-2 group">
                                <button onClick={() => toggleSub(s)} className="shrink-0">
                                    {s.estado === 'completada' ? <CheckCircle2 size={15} className="text-emerald-500" /> : <Circle size={15} className="text-slate-300 hover:text-emerald-500" />}
                                </button>
                                <span className={`text-xs flex-1 ${s.estado === 'completada' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{s.titulo}</span>
                                <button onClick={() => delSub(s)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 shrink-0"><Trash2 size={12} /></button>
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-2 mt-2">
                        <input value={nuevaSub} onChange={(e) => setNuevaSub(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSub()} placeholder="Nueva subtarea..." className="flex-1 bg-slate-50 border border-[#efe8dd] rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-emerald-500" />
                        <button onClick={addSub} className="bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg px-2.5"><Plus size={14} /></button>
                    </div>
                </div>

                {/* Archivos (binario en la base) */}
                <div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-2"><Paperclip size={13} /> Archivos ({adjs.length})</span>
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
                        {subiendo ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />} Adjuntar archivo (máx. 7 MB)
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
const TareasPanel = () => {
    const user = getUser();
    const esAdmin = user?.rol === 'Administrador';
    const [tareas, setTareas] = useState([]);
    const [proyectos, setProyectos] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filtroEstado, setFiltroEstado] = useState('activas'); // activas | completada | todas
    const [proyectoSel, setProyectoSel] = useState(''); // '' = todos
    const [scope, setScope] = useState('mias');
    const [busq, setBusq] = useState('');
    const [selId, setSelId] = useState(null);
    const [crear, setCrear] = useState(false);
    const [nuevoProy, setNuevoProy] = useState(false);
    const [proyNombre, setProyNombre] = useState('');

    const cargar = useCallback(async () => {
        setLoading(true);
        try {
            const opts = { soloRaiz: '1', scope: esAdmin && scope === 'equipo' ? 'equipo' : '' };
            if (proyectoSel) opts.proyectoId = proyectoSel;
            if (filtroEstado === 'completada') opts.estado = 'completada';
            const [tRes, pRes] = await Promise.all([
                listarTareasApi(getSessionId(), opts),
                listarProyectosApi(getSessionId()),
            ]);
            const t = await tRes.json(); const p = await pRes.json();
            if (t.success) setTareas(t.tareas || []);
            if (p.success) setProyectos(p.proyectos || []);
        } catch { /* */ } finally { setLoading(false); }
    }, [esAdmin, scope, proyectoSel, filtroEstado]);
    useEffect(() => { cargar(); }, [cargar]);

    // Usuarios de la organización (responsable / colaboradores)
    useEffect(() => {
        (async () => {
            try { const r = await getCatalogosPersonasApi(getSessionId()); const d = await r.json(); if (d.success) setUsuarios(d.ejecutivos || []); } catch { /* */ }
        })();
    }, []);

    const lista = useMemo(() => {
        const q = busq.trim().toLowerCase();
        return tareas.filter(t => {
            if (filtroEstado === 'activas' && t.estado === 'completada') return false;
            if (!q) return true;
            return (t.titulo || '').toLowerCase().includes(q) || (t.responsableNombre || '').toLowerCase().includes(q);
        });
    }, [tareas, busq, filtroEstado]);

    const completar = async (t, e) => {
        e.stopPropagation();
        setTareas(prev => prev.map(x => x.id === t.id ? { ...x, estado: 'completada' } : x));
        try { await completarTareaApi(getSessionId(), t.id); cargar(); } catch { cargar(); }
    };
    const eliminar = async (t, e) => {
        e.stopPropagation();
        if (!window.confirm(`¿Eliminar la tarea "${t.titulo}" y sus subtareas?`)) return;
        setTareas(prev => prev.filter(x => x.id !== t.id));
        if (selId === t.id) setSelId(null);
        try { await eliminarTareaApi(getSessionId(), t.id); cargar(); } catch { cargar(); }
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
        try { await eliminarProyectoApi(getSessionId(), p.id); if (proyectoSel === p.id) setProyectoSel(''); cargar(); }
        catch { toast({ variant: 'destructive', title: 'Error' }); }
    };

    return (
        <div className="flex-1 min-h-0 flex flex-col gap-3 h-full">
            {/* Toolbar */}
            <div className="flex items-center justify-between flex-wrap gap-2 flex-shrink-0">
                <div className="flex items-center gap-2 flex-wrap">
                    {['activas', 'completada', 'todas'].map(f => (
                        <button key={f} onClick={() => setFiltroEstado(f)}
                            className={`px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider ${filtroEstado === f ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-white border-[#efe8dd] text-slate-500 hover:text-slate-900'}`}>
                            {f === 'activas' ? 'Activas' : f === 'completada' ? 'Finalizadas' : 'Todas'}
                        </button>
                    ))}
                    {esAdmin && (
                        <div className="flex rounded-lg border border-[#efe8dd] overflow-hidden text-[10px] font-black uppercase tracking-widest">
                            <button onClick={() => setScope('mias')} className={`px-3 py-1.5 ${scope === 'mias' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500'}`}>Mías</button>
                            <button onClick={() => setScope('equipo')} className={`px-3 py-1.5 ${scope === 'equipo' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500'}`}>Equipo</button>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input value={busq} onChange={(e) => setBusq(e.target.value)} placeholder="Buscar tarea..." className="w-48 bg-white border border-[#efe8dd] rounded-lg pl-9 pr-3 py-2 text-xs outline-none focus:border-emerald-500" />
                    </div>
                    <button onClick={() => setCrear(true)} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest"><Plus size={14} /> Tarea</button>
                </div>
            </div>

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
                    <button onClick={() => setProyectoSel('')} className={`text-left px-2 py-1.5 rounded-lg text-[11px] font-bold ${!proyectoSel ? 'bg-emerald-500/10 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}>Todas las tareas</button>
                    {proyectos.map(p => (
                        <button key={p.id} onClick={() => setProyectoSel(p.id)} className={`text-left px-2 py-1.5 rounded-lg group ${proyectoSel === p.id ? 'bg-emerald-500/10' : 'hover:bg-slate-50'}`}>
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
                            <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-sm gap-2">
                                <ListChecks size={28} /> No hay tareas. Usa <span className="text-emerald-600 font-bold">+ Tarea</span>.
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
                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase shrink-0 ${PRIO[t.prioridad]}`}>{t.prioridad}</span>
                                    <span className={`text-[9px] font-black uppercase shrink-0 ${meta.c} hidden lg:inline`}>{meta.label}</span>
                                    <button onClick={(e) => eliminar(t, e)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 shrink-0"><Trash2 size={13} /></button>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Detalle */}
                {selId && <DetalleTarea tareaId={selId} onClose={() => setSelId(null)} onChanged={cargar} usuarios={usuarios} />}
            </div>

            {crear && <CrearTareaModal onClose={() => setCrear(false)} onCreated={cargar} proyectos={proyectos} usuarios={usuarios} proyectoActual={proyectoSel} />}
        </div>
    );
};

export default TareasPanel;
