// =====================================================================
// PROYECTOS · RF-TA-01, RF-TA-02 y la ficha completa del proyecto
// ---------------------------------------------------------------------
// Antes los proyectos eran una lista angosta al costado del panel de tareas:
// nombre, color y una barrita. No se sabía quién respondía por uno, ni cuándo
// debía terminar, ni quién estaba trabajando en él.
//
// DOS COSAS QUE VALE LA PENA SABER AL LEER ESTO:
//
// · Los INTEGRANTES se administran a mano y DECIDEN QUIÉN VE EL PROYECTO. Antes
//   se deducían de quién participaba en las tareas, que era cómodo mientras la
//   lista fuera informativa. Desde el 05-08-2026 la pertenencia es un permiso, y
//   un permiso no puede salir de un efecto secundario: asignarle una tarea a
//   alguien le daría acceso al proyecto entero sin que nadie lo decidiera.
//   Solo el responsable del proyecto reparte accesos.
//
// · El AVANCE cuenta solo tareas principales, sin las archivadas ni las
//   canceladas. La regla completa está en docs/tareas-requerimientos.md §4 y se
//   calcula en el servidor: acá solo se dibuja.
// =====================================================================
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Plus, Loader2, X, Trash2, Search, FolderOpen, Users, Calendar,
    Pencil, AlertTriangle, ListChecks, CheckCircle2,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import {
    listarProyectosApi, crearProyectoApi, actualizarProyectoApi, eliminarProyectoApi,
    agregarIntegranteApi, quitarIntegranteApi,
} from '@/services/crmService';
import { getCatalogosApi as getCatalogosPersonasApi } from '@/services/personaService';

const getUser = () => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } };
const getSessionId = () => getUser().sessionId;

// Deben calzar con ESTADOS_PROYECTO del backend y con la restricción CHECK.
const ESTADOS = {
    activo:     { label: 'Activo',     c: 'text-emerald-700 bg-emerald-500/10 border-emerald-500/30' },
    pausado:    { label: 'Pausado',    c: 'text-amber-700 bg-amber-500/10 border-amber-500/30' },
    completado: { label: 'Completado', c: 'text-blue-700 bg-blue-500/10 border-blue-500/30' },
    archivado:  { label: 'Archivado',  c: 'text-slate-500 bg-slate-500/10 border-slate-400/30' },
};
const COLORES = ['#199b4d', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#64748b'];

const inp = 'w-full bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500';
const etiqueta = 'text-[9px] font-black text-slate-400 uppercase tracking-widest';

const fechaCorta = (d) => d ? new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: '2-digit' }) : null;
const iniciales = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();

// ---------------------------------------------------------------
// Modal de crear / editar. El mismo formulario para los dos casos:
// si llega `proyecto` edita, si no crea.
// ---------------------------------------------------------------
const ProyectoModal = ({ proyecto, usuarios, onClose, onGuardado }) => {
    const editando = !!proyecto;
    const [form, setForm] = useState({
        nombre: proyecto?.nombre || '',
        descripcion: proyecto?.descripcion || '',
        responsableId: proyecto?.responsableId || getUser().id || '',
        color: proyecto?.color || COLORES[0],
        estado: proyecto?.estado || 'activo',
        fechaInicio: proyecto?.fechaInicio ? String(proyecto.fechaInicio).slice(0, 10) : '',
        fechaTermino: proyecto?.fechaTermino ? String(proyecto.fechaTermino).slice(0, 10) : '',
    });
    const [saving, setSaving] = useState(false);
    const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

    // Se avisa acá y no solo al guardar: el servidor y la base también lo
    // rechazan, pero es mejor decirlo antes de apretar el botón.
    const fechasAlReves = form.fechaInicio && form.fechaTermino && form.fechaTermino < form.fechaInicio;

    const guardar = async () => {
        if (!form.nombre.trim()) { toast({ variant: 'destructive', title: 'Falta el nombre' }); return; }
        if (fechasAlReves) { toast({ variant: 'destructive', title: 'Revisa las fechas', description: 'El término no puede ser anterior al inicio.' }); return; }
        setSaving(true);
        try {
            const datos = { ...form, responsableId: form.responsableId || null };
            const r = editando
                ? await actualizarProyectoApi(getSessionId(), proyecto.id, datos)
                : await crearProyectoApi(getSessionId(), datos);
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            toast({ title: editando ? 'Proyecto actualizado' : 'Proyecto creado' });
            onGuardado(); onClose();
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="w-full max-w-lg bg-white rounded-2xl border border-[#efe8dd] shadow-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">
                        {editando ? 'Editar proyecto' : 'Nuevo proyecto'}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={18} /></button>
                </div>

                <div className="space-y-3">
                    <input className={inp} placeholder="Nombre del proyecto *" value={form.nombre} onChange={set('nombre')} autoFocus />
                    <textarea className={`${inp} resize-none`} rows={2} placeholder="Descripción" value={form.descripcion} onChange={set('descripcion')} />

                    <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                            <span className={etiqueta}>Responsable</span>
                            <select className={`${inp} cursor-pointer`} value={form.responsableId} onChange={set('responsableId')}>
                                <option value="">— Sin asignar —</option>
                                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                            </select>
                        </label>
                        <label className="block">
                            <span className={etiqueta}>Estado</span>
                            <select className={`${inp} cursor-pointer`} value={form.estado} onChange={set('estado')}>
                                {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                        </label>
                        <label className="block">
                            <span className={etiqueta}>Inicio</span>
                            <input type="date" className={inp} value={form.fechaInicio} onChange={set('fechaInicio')} />
                        </label>
                        <label className="block">
                            <span className={etiqueta}>Término estimado</span>
                            <input type="date" className={`${inp} ${fechasAlReves ? 'border-red-400' : ''}`} value={form.fechaTermino} onChange={set('fechaTermino')} />
                        </label>
                    </div>

                    {fechasAlReves && (
                        <p className="text-[10px] font-bold text-red-600 flex items-center gap-1">
                            <AlertTriangle size={11} /> El término no puede ser anterior al inicio.
                        </p>
                    )}

                    <div>
                        <span className={etiqueta}>Color</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                            {COLORES.map(c => (
                                <button type="button" key={c} onClick={() => setForm(p => ({ ...p, color: c }))}
                                    style={{ backgroundColor: c }}
                                    className={`w-7 h-7 rounded-lg border-2 transition-transform ${form.color === c ? 'border-slate-900 scale-110' : 'border-transparent'}`}
                                    aria-label={`Color ${c}`} />
                            ))}
                        </div>
                    </div>

                    <button onClick={guardar} disabled={saving || fechasAlReves}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg h-10 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                        {editando ? 'Guardar cambios' : 'Crear proyecto'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------
// Integrantes · quién pertenece al proyecto
// ---------------------------------------------------------------
// Esto NO es una lista de adorno: pertenecer al proyecto es lo que da acceso a
// ver sus tareas. Por eso solo lo abre quien es responsable, y se avisa en
// palabras claras qué implica agregar a alguien.
const IntegrantesModal = ({ proyecto, usuarios, onClose, onCambio }) => {
    const [trabajando, setTrabajando] = useState(false);
    const [aInvitar, setAInvitar] = useState('');
    const integrantes = proyecto.integrantes || [];
    const yaEstan = new Set(integrantes.map(i => i.id));
    const disponibles = usuarios.filter(u => !yaEstan.has(u.id));

    const invitar = async () => {
        if (!aInvitar || trabajando) return;
        setTrabajando(true);
        try {
            const r = await agregarIntegranteApi(getSessionId(), proyecto.id, aInvitar);
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            setAInvitar('');
            onCambio(d.proyecto);
            toast({ title: 'Persona agregada', description: 'Ya puede ver el proyecto y sus tareas.' });
        } catch (e) { toast({ variant: 'destructive', title: 'No se pudo agregar', description: e.message }); }
        finally { setTrabajando(false); }
    };

    const quitar = async (i) => {
        if (!window.confirm(`¿Quitar a ${i.nombre} del proyecto?\n\nDejará de ver este proyecto y sus tareas.`)) return;
        setTrabajando(true);
        try {
            const r = await quitarIntegranteApi(getSessionId(), proyecto.id, i.id);
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            onCambio(d.proyecto);
            toast({ title: 'Persona quitada' });
        } catch (e) { toast({ variant: 'destructive', title: 'No se pudo quitar', description: e.message }); }
        finally { setTrabajando(false); }
    };

    return (
        <div className="fixed inset-0 z-[130] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="w-full max-w-md bg-white rounded-2xl border border-[#efe8dd] shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Integrantes</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={18} /></button>
                </div>
                <p className="text-[11px] text-slate-500 mb-4">
                    Solo estas personas ven <b>{proyecto.nombre}</b> y sus tareas. Ni siquiera un
                    administrador lo ve si no está en la lista.
                </p>

                <div className="flex flex-col gap-1.5 mb-4 max-h-56 overflow-y-auto">
                    {integrantes.map(i => (
                        <div key={i.id} className="flex items-center gap-2 bg-slate-50 border border-[#efe8dd] rounded-lg px-2.5 py-1.5">
                            <span className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-[9px] font-black text-slate-600 shrink-0">
                                {iniciales(i.nombre)}
                            </span>
                            <span className="text-xs font-bold text-slate-700 truncate flex-1">{i.nombre}</span>
                            {i.rol === 'responsable' && (
                                <span className="text-[8px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                                    Responsable
                                </span>
                            )}
                            {proyecto.puedoAdministrar && (
                                <button onClick={() => quitar(i)} disabled={trabajando}
                                    title={`Quitar a ${i.nombre}`}
                                    className="text-slate-300 hover:text-red-500 shrink-0"><Trash2 size={13} /></button>
                            )}
                        </div>
                    ))}
                </div>

                {proyecto.puedoAdministrar ? (
                    disponibles.length > 0 ? (
                        <div className="flex gap-2">
                            <select value={aInvitar} onChange={(e) => setAInvitar(e.target.value)} className={`${inp} cursor-pointer`}>
                                <option value="">Agregar a alguien...</option>
                                {disponibles.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                            </select>
                            <button onClick={invitar} disabled={!aInvitar || trabajando}
                                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg px-3 text-[10px] font-black uppercase tracking-widest">
                                {trabajando ? <Loader2 size={14} className="animate-spin" /> : 'Agregar'}
                            </button>
                        </div>
                    ) : <p className="text-[11px] text-slate-400 italic">Ya están todos los de tu organización.</p>
                ) : (
                    <p className="text-[11px] text-slate-400 italic">
                        Solo el responsable del proyecto puede agregar o quitar personas.
                    </p>
                )}
            </div>
        </div>
    );
};

// ---------------------------------------------------------------
// Tarjeta de un proyecto
// ---------------------------------------------------------------
const TarjetaProyecto = ({ p, puedeAdministrar, onEditar, onEliminar, onAbrirTareas, onIntegrantes }) => {
    const estado = ESTADOS[p.estado] || ESTADOS.activo;
    const color = p.color || '#199b4d';
    const vencido = p.fechaTermino && new Date(p.fechaTermino) < new Date() && p.estado === 'activo';

    return (
        <div className="bg-white border border-[#efe8dd] rounded-2xl p-4 flex flex-col gap-3 hover:border-emerald-500/40 transition-colors group">
            <div className="flex items-start gap-2">
                <span className="w-3 h-3 rounded-full shrink-0 mt-1" style={{ backgroundColor: color }} />
                <div className="min-w-0 flex-1">
                    <button onClick={() => onAbrirTareas(p)} className="text-left w-full">
                        <h3 className="text-sm font-black text-slate-900 truncate hover:text-emerald-600">{p.nombre}</h3>
                    </button>
                    {p.descripcion && <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{p.descripcion}</p>}
                </div>
                {puedeAdministrar && (
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => onEditar(p)} title="Editar" className="text-slate-400 hover:text-emerald-600"><Pencil size={13} /></button>
                        <button onClick={() => onEliminar(p)} title="Eliminar" className="text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase tracking-wider ${estado.c}`}>{estado.label}</span>
                {p.responsableNombre && (
                    <span className="text-[10px] text-slate-500 font-bold truncate max-w-[10rem]">{p.responsableNombre}</span>
                )}
            </div>

            {/* Avance */}
            <div>
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Avance</span>
                    <span className="text-[11px] font-black text-slate-700">{p.avance}%</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${p.avance}%`, backgroundColor: color }} />
                </div>
            </div>

            {/* Conteos */}
            <div className="flex items-center gap-3 flex-wrap text-[10px]">
                <span className="text-slate-500 flex items-center gap-1"><ListChecks size={11} /> {p.tareasTotal} tareas</span>
                <span className="text-emerald-600 font-bold flex items-center gap-1"><CheckCircle2 size={11} /> {p.tareasHechas} hechas</span>
                <span className="text-slate-500">{p.tareasPendientes} pendientes</span>
                {p.tareasAtrasadas > 0 && (
                    <span className="text-red-600 font-bold flex items-center gap-1"><AlertTriangle size={11} /> {p.tareasAtrasadas} atrasadas</span>
                )}
            </div>

            {/* Fechas e integrantes */}
            <div className="flex items-end justify-between gap-2 pt-1 border-t border-[#f5f0e8]">
                <div className="min-w-0">
                    {(p.fechaInicio || p.fechaTermino) ? (
                        <span className={`text-[10px] flex items-center gap-1 ${vencido ? 'text-red-600 font-bold' : 'text-slate-500'}`}>
                            <Calendar size={10} />
                            {fechaCorta(p.fechaInicio) || '—'} → {fechaCorta(p.fechaTermino) || '—'}
                        </span>
                    ) : <span className="text-[10px] text-slate-300 italic">Sin fechas</span>}
                </div>

                {/* Integrantes: quiénes ven este proyecto. Se pulsa para administrarlos. */}
                <button onClick={() => onIntegrantes(p)}
                    title={`${(p.integrantes || []).map(i => i.nombre).join(', ')}\n\nPulsa para administrar quién ve este proyecto`}
                    className="flex items-center -space-x-1.5 shrink-0 hover:opacity-80 transition-opacity">
                    {(p.integrantes || []).slice(0, 4).map(i => (
                        <span key={i.id}
                            className={`w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-black ${i.rol === 'responsable' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                            {iniciales(i.nombre)}
                        </span>
                    ))}
                    {(p.integrantes || []).length > 4 && (
                        <span className="w-6 h-6 rounded-full bg-slate-800 border-2 border-white flex items-center justify-center text-[8px] font-black text-white">
                            +{p.integrantes.length - 4}
                        </span>
                    )}
                    {(p.integrantes || []).length === 0 && (
                        <span className="text-[10px] text-slate-300 italic flex items-center gap-1"><Users size={10} /> Sin integrantes</span>
                    )}
                    {p.puedoAdministrar && <span className="w-6 h-6 rounded-full bg-white border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400"><Plus size={11} /></span>}
                </button>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------
// Panel
// ---------------------------------------------------------------
const ProyectosPanel = () => {
    const user = getUser();
    // Solo los administradores crean y administran proyectos (ver §6 del
    // documento de requerimientos). El resto los ve y entra a sus tareas.
    const puedeAdministrar = user?.rol === 'Administrador';

    const [, setSearchParams] = useSearchParams();
    const [proyectos, setProyectos] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busq, setBusq] = useState('');
    const [filtroEstado, setFiltroEstado] = useState('vigentes'); // vigentes | todos | <estado>
    const [modal, setModal] = useState(null); // null | {} | proyecto
    const [integrantesDe, setIntegrantesDe] = useState(null); // proyecto cuyo acceso se administra

    const cargar = useCallback(async () => {
        setLoading(true);
        try {
            const r = await listarProyectosApi(getSessionId());
            const d = await r.json();
            if (d.success) setProyectos(d.proyectos || []);
        } catch { /* la lista queda como estaba */ }
        finally { setLoading(false); }
    }, []);
    useEffect(() => { cargar(); }, [cargar]);

    useEffect(() => {
        (async () => {
            try {
                const r = await getCatalogosPersonasApi(getSessionId());
                const d = await r.json();
                if (d.success) setUsuarios(d.ejecutivos || []);
            } catch { /* el selector queda vacío, no rompe nada */ }
        })();
    }, []);

    const lista = useMemo(() => {
        const q = busq.trim().toLowerCase();
        return proyectos.filter(p => {
            // "Vigentes" es lo que sigue vivo: esconde archivados y completados.
            if (filtroEstado === 'vigentes' && ['archivado', 'completado'].includes(p.estado)) return false;
            if (filtroEstado !== 'vigentes' && filtroEstado !== 'todos' && p.estado !== filtroEstado) return false;
            if (!q) return true;
            return (p.nombre || '').toLowerCase().includes(q)
                || (p.responsableNombre || '').toLowerCase().includes(q)
                || (p.descripcion || '').toLowerCase().includes(q);
        });
    }, [proyectos, busq, filtroEstado]);

    const eliminar = async (p) => {
        if (!window.confirm(
            `¿Eliminar el proyecto "${p.nombre}"?\n\nSus ${p.tareasTotal} tareas NO se borran: quedan sin proyecto.\nSi solo quieres sacarlo de la vista, cámbialo a "Archivado".`
        )) return;
        try {
            const r = await eliminarProyectoApi(getSessionId(), p.id);
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            toast({ title: 'Proyecto eliminado' });
            cargar();
        } catch (e) { toast({ variant: 'destructive', title: 'Error', description: e.message }); }
    };

    // Entrar al proyecto = ver sus tareas, con el filtro ya puesto.
    const abrirTareas = (p) => setSearchParams({ sub: 'todas', proyecto: p.id });

    const FILTROS = [
        ['vigentes', 'Vigentes'], ['activo', 'Activos'], ['pausado', 'Pausados'],
        ['completado', 'Completados'], ['todos', 'Todos'],
    ];

    return (
        <div className="flex-1 min-h-0 flex flex-col gap-3">
            {/* Barra */}
            <div className="flex items-center justify-between flex-wrap gap-2 flex-shrink-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                    {FILTROS.map(([k, label]) => (
                        <button key={k} onClick={() => setFiltroEstado(k)}
                            className={`px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider ${filtroEstado === k ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-white border-[#efe8dd] text-slate-500 hover:text-slate-900'}`}>
                            {label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input value={busq} onChange={(e) => setBusq(e.target.value)} placeholder="Buscar proyecto..."
                            className="w-48 bg-white border border-[#efe8dd] rounded-lg pl-9 pr-3 py-2 text-xs outline-none focus:border-emerald-500" />
                    </div>
                    {puedeAdministrar && (
                        <button onClick={() => setModal({})}
                            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest">
                            <Plus size={14} /> Proyecto
                        </button>
                    )}
                </div>
            </div>

            {/* Grilla */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="animate-spin" /></div>
                ) : lista.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-sm gap-2">
                        <FolderOpen size={28} />
                        {proyectos.length === 0
                            ? <>Todavía no hay proyectos. {puedeAdministrar ? <>Usa <span className="text-emerald-600 font-bold">+ Proyecto</span>.</> : 'Un administrador puede crearlos.'}</>
                            : 'Ningún proyecto calza con la búsqueda.'}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {lista.map(p => (
                            <TarjetaProyecto key={p.id} p={p}
                                puedeAdministrar={puedeAdministrar}
                                onEditar={setModal} onEliminar={eliminar} onAbrirTareas={abrirTareas}
                                onIntegrantes={setIntegrantesDe} />
                        ))}
                    </div>
                )}
            </div>

            {modal && (
                <ProyectoModal
                    proyecto={modal.id ? modal : null}
                    usuarios={usuarios}
                    onClose={() => setModal(null)}
                    onGuardado={cargar}
                />
            )}

            {integrantesDe && (
                <IntegrantesModal
                    proyecto={integrantesDe}
                    usuarios={usuarios}
                    onClose={() => setIntegrantesDe(null)}
                    onCambio={(actualizado) => {
                        // Se refresca el modal con lo que devolvió el servidor y también
                        // la grilla de atrás, para que los avatares queden al día.
                        setIntegrantesDe(actualizado);
                        setProyectos(prev => prev.map(p => p.id === actualizado.id ? actualizado : p));
                    }}
                />
            )}
        </div>
    );
};

export default ProyectosPanel;
