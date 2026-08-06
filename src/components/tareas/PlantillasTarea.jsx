// =====================================================================
// PLANTILLAS DE TAREAS · elegir una, o administrarlas
// ---------------------------------------------------------------------
// Dos piezas que se usan en el módulo de tareas:
//
//   <SelectorPlantillas>  la tira que aparece arriba del formulario de "nueva
//                         tarea": se elige una y el formulario queda lleno.
//   <PlantillasModal>     crear, editar y borrar plantillas.
//
// La plantilla guarda un PLAZO EN DÍAS, no una fecha. Una fecha fija envejece:
// la plantilla "cierre de F29" con fecha 20-08 sirve un mes y después miente.
// =====================================================================
import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Trash2, X, LayoutTemplate, ListChecks, Check, Pencil } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import {
    listarPlantillasApi, crearPlantillaApi, actualizarPlantillaApi, eliminarPlantillaApi,
} from '@/services/crmService';

const getSessionId = () => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').sessionId; } catch { return null; }
};
const inp = "w-full bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500";

// Hook compartido: las dos piezas necesitan la misma lista.
export const usePlantillas = () => {
    const [plantillas, setPlantillas] = useState([]);
    const [cargando, setCargando] = useState(true);
    const cargar = useCallback(async () => {
        try {
            const r = await listarPlantillasApi(getSessionId());
            const d = await r.json();
            if (d.success) setPlantillas(d.plantillas || []);
        } catch { /* la lista queda como estaba */ } finally { setCargando(false); }
    }, []);
    useEffect(() => { cargar(); }, [cargar]);
    return { plantillas, cargando, recargar: cargar };
};

const plazoTexto = (d) => {
    if (d === null || d === undefined) return 'sin fecha';
    if (d === 0) return 'para hoy';
    if (d === 1) return 'en 1 día';
    return `en ${d} días`;
};

// ---------------------------------------------------------------------
// La tira de plantillas sobre el formulario de nueva tarea
// ---------------------------------------------------------------------
export const SelectorPlantillas = ({ plantillas, elegida, onElegir, onAdministrar }) => {
    if (!plantillas.length) {
        return (
            <button type="button" onClick={onAdministrar}
                className="w-full flex items-center justify-center gap-1.5 border border-dashed border-[#efe8dd] rounded-lg py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-emerald-600 hover:border-emerald-500/50">
                <LayoutTemplate size={13} /> Crear una plantilla
            </button>
        );
    }
    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Empezar desde una plantilla</span>
                <button type="button" onClick={onAdministrar}
                    className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-emerald-600">
                    Administrar
                </button>
            </div>
            <div className="flex gap-1.5 flex-wrap">
                {plantillas.map(p => (
                    <button type="button" key={p.id}
                        onClick={() => onElegir(elegida?.id === p.id ? null : p)}
                        title={p.descripcion || `${p.pasos.length} subtareas · ${plazoTexto(p.diasPlazo)}`}
                        className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors flex items-center gap-1 ${
                            elegida?.id === p.id
                                ? 'bg-emerald-600 border-emerald-500 text-white'
                                : 'bg-slate-50 border-[#efe8dd] text-slate-600 hover:border-emerald-500/50'}`}>
                        {elegida?.id === p.id && <Check size={10} />}
                        {p.nombre}
                        {p.pasos.length > 0 && (
                            <span className={elegida?.id === p.id ? 'text-emerald-100' : 'text-slate-400'}>
                                · {p.pasos.length}
                            </span>
                        )}
                    </button>
                ))}
            </div>
            {elegida && (
                <p className="text-[10px] text-slate-500 mt-1.5 bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-2 py-1.5">
                    Se crearán <b>{elegida.pasos.length} subtareas</b> y la entrega queda {plazoTexto(elegida.diasPlazo)}.
                    Puedes cambiar todo abajo antes de crear.
                </p>
            )}
        </div>
    );
};

// ---------------------------------------------------------------------
// Administrar plantillas
// ---------------------------------------------------------------------
const FormPlantilla = ({ inicial, proyectos, usuarios, onGuardado, onCancelar }) => {
    const [f, setF] = useState(() => ({
        nombre: inicial?.nombre || '',
        descripcion: inicial?.descripcion || '',
        titulo: inicial?.titulo || '',
        detalle: inicial?.detalle || '',
        prioridad: inicial?.prioridad || 'media',
        // El plazo viaja como texto en el formulario y se convierte al guardar:
        // así el campo puede quedar vacío ("sin fecha") sin volverse un 0.
        diasPlazo: inicial?.diasPlazo ?? '' ,
        proyectoId: inicial?.proyectoId || '',
        responsableId: inicial?.responsableId || '',
    }));
    const [pasos, setPasos] = useState(() => (inicial?.pasos || []).map(p => p.titulo));
    const [nuevoPaso, setNuevoPaso] = useState('');
    const [guardando, setGuardando] = useState(false);
    const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }));

    const agregarPaso = () => {
        const t = nuevoPaso.trim();
        if (!t) return;
        setPasos(p => [...p, t]);
        setNuevoPaso('');
    };

    const guardar = async () => {
        if (!f.nombre.trim()) { toast({ variant: 'destructive', title: 'Falta el nombre' }); return; }
        setGuardando(true);
        const dias = f.diasPlazo === '' ? null : Number.parseInt(f.diasPlazo, 10);
        const datos = {
            ...f,
            diasPlazo: Number.isInteger(dias) && dias >= 0 ? dias : null,
            proyectoId: f.proyectoId || null,
            responsableId: f.responsableId || null,
            pasos: pasos.map(t => ({ titulo: t })),
        };
        try {
            const r = inicial
                ? await actualizarPlantillaApi(getSessionId(), inicial.id, datos)
                : await crearPlantillaApi(getSessionId(), datos);
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            toast({ title: inicial ? 'Plantilla actualizada' : 'Plantilla creada' });
            onGuardado();
        } catch (e) {
            toast({ variant: 'destructive', title: 'No se pudo guardar', description: e.message });
        } finally { setGuardando(false); }
    };

    return (
        <div className="border border-[#efe8dd] rounded-xl p-3 space-y-2.5 bg-slate-50/60">
            <input className={inp} placeholder="Nombre de la plantilla *  (ej: Alta de cliente nuevo)"
                value={f.nombre} onChange={set('nombre')} autoFocus />
            <input className={inp} placeholder="Para qué sirve (opcional)"
                value={f.descripcion} onChange={set('descripcion')} />

            <div className="grid grid-cols-2 gap-2">
                <label className="block">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Prioridad</span>
                    <select className={`${inp} cursor-pointer`} value={f.prioridad} onChange={set('prioridad')}>
                        <option value="critica">Crítica</option>
                        <option value="alta">Alta</option>
                        <option value="media">Media</option>
                        <option value="baja">Baja</option>
                    </select>
                </label>
                <label className="block">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Plazo (días)</span>
                    <input type="number" min="0" className={inp} placeholder="Sin fecha"
                        value={f.diasPlazo} onChange={set('diasPlazo')} />
                </label>
                <label className="block">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Proyecto</span>
                    <select className={`${inp} cursor-pointer`} value={f.proyectoId} onChange={set('proyectoId')}>
                        <option value="">— Sin proyecto —</option>
                        {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                </label>
                <label className="block">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Responsable sugerido</span>
                    <select className={`${inp} cursor-pointer`} value={f.responsableId} onChange={set('responsableId')}>
                        <option value="">— Se elige al usarla —</option>
                        {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                    </select>
                </label>
            </div>

            {/* Los pasos son las subtareas que se crearán. */}
            <div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1 mb-1">
                    <ListChecks size={11} /> Pasos ({pasos.length})
                </span>
                <div className="space-y-1 mb-1.5">
                    {pasos.map((p, i) => (
                        <div key={`${p}-${i}`} className="flex items-center gap-2 bg-white border border-[#efe8dd] rounded-lg px-2 py-1 group">
                            <span className="text-[9px] font-black text-slate-300 tabular-nums w-4">{i + 1}</span>
                            <span className="text-xs text-slate-700 flex-1 truncate">{p}</span>
                            <button type="button" onClick={() => setPasos(prev => prev.filter((_, x) => x !== i))}
                                className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 size={11} /></button>
                        </div>
                    ))}
                </div>
                <div className="flex gap-1.5">
                    <input value={nuevoPaso} onChange={(e) => setNuevoPaso(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarPaso(); } }}
                        placeholder="Agregar paso..." className={inp} />
                    <button type="button" onClick={agregarPaso}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg px-3 shrink-0"><Plus size={14} /></button>
                </div>
            </div>

            <div className="flex gap-2 pt-1">
                <button onClick={guardar} disabled={guardando}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg h-9 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                    {guardando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    {inicial ? 'Guardar cambios' : 'Crear plantilla'}
                </button>
                <button onClick={onCancelar}
                    className="px-4 rounded-lg border border-[#efe8dd] text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900">
                    Cancelar
                </button>
            </div>
        </div>
    );
};

export const PlantillasModal = ({ plantillas, proyectos, usuarios, onClose, onCambio }) => {
    const [editando, setEditando] = useState(null);   // null | 'nueva' | plantilla

    const borrar = async (p) => {
        if (!window.confirm(
            `¿Eliminar la plantilla "${p.nombre}"?\n\nLas tareas que ya creaste con ella NO se tocan.`
        )) return;
        try {
            const r = await eliminarPlantillaApi(getSessionId(), p.id);
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            toast({ title: 'Plantilla eliminada' });
            onCambio();
        } catch (e) { toast({ variant: 'destructive', title: 'Error', description: e.message }); }
    };

    return (
        <div className="fixed inset-0 z-[130] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="w-full max-w-lg bg-white rounded-2xl border border-[#efe8dd] shadow-2xl p-5 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                        <LayoutTemplate size={16} className="text-emerald-600" /> Plantillas
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={18} /></button>
                </div>
                <p className="text-[11px] text-slate-500 mb-4">
                    Para el trabajo que se repite. Se guarda una vez con todos sus pasos y después se crea en un clic.
                </p>

                {editando === 'nueva' ? (
                    <FormPlantilla proyectos={proyectos} usuarios={usuarios}
                        onGuardado={() => { setEditando(null); onCambio(); }}
                        onCancelar={() => setEditando(null)} />
                ) : editando ? (
                    <FormPlantilla inicial={editando} proyectos={proyectos} usuarios={usuarios}
                        onGuardado={() => { setEditando(null); onCambio(); }}
                        onCancelar={() => setEditando(null)} />
                ) : (
                    <>
                        <button onClick={() => setEditando('nueva')}
                            className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg h-9 text-[10px] font-black uppercase tracking-widest mb-3">
                            <Plus size={13} /> Nueva plantilla
                        </button>

                        {plantillas.length === 0 ? (
                            <p className="text-[11px] text-slate-400 italic text-center py-6">
                                Todavía no hay plantillas.
                            </p>
                        ) : (
                            <div className="space-y-1.5">
                                {plantillas.map(p => (
                                    <div key={p.id} className="border border-[#efe8dd] rounded-xl px-3 py-2 flex items-start gap-2 group hover:border-emerald-500/40">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-bold text-slate-900 truncate">{p.nombre}</p>
                                            {p.descripcion && <p className="text-[10px] text-slate-400 truncate">{p.descripcion}</p>}
                                            <div className="flex items-center gap-2 flex-wrap mt-1">
                                                <span className="text-[9px] text-slate-500 flex items-center gap-0.5">
                                                    <ListChecks size={9} /> {p.pasos.length} {p.pasos.length === 1 ? 'paso' : 'pasos'}
                                                </span>
                                                <span className="text-[9px] text-slate-500">{plazoTexto(p.diasPlazo)}</span>
                                                {p.proyectoNombre && <span className="text-[9px] text-emerald-700 font-bold">● {p.proyectoNombre}</span>}
                                                {p.vecesUsada > 0 && (
                                                    <span className="text-[9px] text-slate-400">usada {p.vecesUsada} {p.vecesUsada === 1 ? 'vez' : 'veces'}</span>
                                                )}
                                            </div>
                                        </div>
                                        <button onClick={() => setEditando(p)} title="Editar"
                                            className="text-slate-300 hover:text-emerald-600 opacity-0 group-hover:opacity-100 shrink-0"><Pencil size={13} /></button>
                                        <button onClick={() => borrar(p)} title="Eliminar"
                                            className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 shrink-0"><Trash2 size={13} /></button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
