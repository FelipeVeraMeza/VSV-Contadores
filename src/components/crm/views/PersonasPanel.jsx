import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Search, User, Phone, Mail, Loader2, UserPlus, RefreshCw, ArrowRightCircle, Trash2, RotateCcw, CheckCircle2, X, UserMinus, AlertTriangle, Clock } from 'lucide-react';
import { listarPersonasApi, cambiarEstadoPersonaApi, eliminarPersonaApi } from '@/services/personaService';
import { toast } from '@/components/ui/use-toast';
import PersonaDetailDrawer from '../modals/PersonaDetailDrawer';
import ConvertirClienteModal from '../modals/ConvertirClienteModal';

const getUser = () => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); }
    catch { return {}; }
};
const getSessionId = () => getUser().sessionId;

const ESTADO_STYLE = {
    prospecto: 'text-amber-400 border-amber-400/30 bg-amber-400/10',
    activo: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
    inactivo: 'text-gray-400 border-gray-400/30 bg-gray-400/10',
    perdido: 'text-red-400 border-red-400/30 bg-red-400/10',
};

const ESTADOS = ['Todos', 'prospecto', 'activo', 'inactivo', 'perdido'];

// Días sin contacto para considerar un lead "estancado"
const DIAS_ESTANCADO = 15;
const diasDesde = (fecha) => {
    if (!fecha) return null;
    const d = new Date(fecha);
    if (isNaN(d)) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
};

const PersonasPanel = ({ reloadKey = 0, onCrear }) => {
    const navigate = useNavigate();
    const [personas, setPersonas] = useState([]);
    const [loading, setLoading] = useState(true);
    // Por defecto solo prospectos: al convertir a cliente, la persona sale de esta vista.
    const [estado, setEstado] = useState('prospecto');
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState(null);
    const [personaAConvertir, setPersonaAConvertir] = useState(null);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [miCartera, setMiCartera] = useState(false);
    const userId = getUser().id || null;

    const cargar = useCallback(async () => {
        setLoading(true);
        try {
            const res = await listarPersonasApi(getSessionId(), {});
            const data = await res.json();
            if (data.success) setPersonas(data.personas || []);
        } catch {
            setPersonas([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { cargar(); }, [cargar, reloadKey]);

    // Al inactivar o marcar perdido se pide un motivo (queda en el historial)
    const pideMotivo = (estado) => estado === 'inactivo' || estado === 'perdido';
    const convertir = async (e, p, nuevoEstado) => {
        e.stopPropagation();
        let motivo = '';
        if (pideMotivo(nuevoEstado)) {
            motivo = window.prompt(`Motivo de "${nuevoEstado}" (opcional):`, '') ?? '';
        }
        try {
            const r = await cambiarEstadoPersonaApi(getSessionId(), p.id, nuevoEstado, motivo);
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            toast({ title: nuevoEstado === 'activo' ? 'Pasó a Cliente Activo' : nuevoEstado === 'perdido' ? 'Marcado como perdido' : 'Estado actualizado' });
            cargar();
        } catch (err) { toast({ variant: 'destructive', title: 'Error', description: err.message }); }
    };
    const eliminar = async (e, p) => {
        e.stopPropagation();
        if (!window.confirm(`¿Eliminar definitivamente a "${p.nombreCompleto || 'este cliente'}"?`)) return;
        try {
            const r = await eliminarPersonaApi(getSessionId(), p.id);
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            toast({ title: 'Eliminado' });
            cargar();
        } catch (err) { toast({ variant: 'destructive', title: 'Error', description: err.message }); }
    };

    // ---- Selección múltiple ----
    const toggleRow = (id, e) => {
        e.stopPropagation();
        setSelectedIds(prev => {
            const n = new Set(prev);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });
    };
    const clearSel = () => setSelectedIds(new Set());

    const bulkEstado = async (nuevo) => {
        const ids = [...selectedIds];
        let motivo = '';
        if (pideMotivo(nuevo)) {
            motivo = window.prompt(`Motivo de "${nuevo}" para ${ids.length} prospecto(s) (opcional):`, '') ?? '';
        }
        let ok = 0, sin = 0;
        for (const id of ids) {
            try {
                const r = await cambiarEstadoPersonaApi(getSessionId(), id, nuevo, motivo);
                const d = await r.json();
                if (d.success) ok++; else sin++;
            } catch { sin++; }
        }
        toast({ title: `${ok} actualizado(s)`, description: sin ? `${sin} ya estaban en ese estado` : undefined });
        clearSel();
        cargar();
    };

    const bulkEliminar = async () => {
        if (!window.confirm(`¿Eliminar definitivamente ${selectedIds.size} prospecto(s)? Esta acción no se puede deshacer.`)) return;
        const ids = [...selectedIds];
        let ok = 0, fail = 0;
        for (const id of ids) {
            try {
                const r = await eliminarPersonaApi(getSessionId(), id);
                const d = await r.json();
                if (d.success) ok++; else fail++;
            } catch { fail++; }
        }
        toast({ title: `${ok} eliminado(s)`, description: fail ? `${fail} no se pudieron eliminar` : undefined });
        clearSel();
        cargar();
    };

    const conteos = useMemo(() => {
        const c = { Todos: personas.length, prospecto: 0, activo: 0, inactivo: 0 };
        personas.forEach(p => { c[p.estado] = (c[p.estado] || 0) + 1; });
        return c;
    }, [personas]);

    const lista = useMemo(() => {
        const term = search.trim().toLowerCase();
        return personas
            .filter(p => estado === 'Todos' || p.estado === estado)
            .filter(p => !miCartera || (userId && p.ejecutivoId === userId))
            .filter(p => {
                if (!term) return true;
                return (
                    (p.nombreCompleto || '').toLowerCase().includes(term) ||
                    (p.rut || '').toLowerCase().includes(term) ||
                    (p.correos || []).some(c => c.toLowerCase().includes(term)) ||
                    (p.telefonos || []).some(t => t.replace(/\D/g, '').includes(term.replace(/\D/g, '')))
                );
            });
    }, [personas, estado, search, miCartera, userId]);

    // Al cambiar de filtro, la selección se limpia (evita operar sobre filas ocultas)
    useEffect(() => { setSelectedIds(new Set()); }, [estado, miCartera]);
    const allSelected = lista.length > 0 && lista.every(p => selectedIds.has(p.id));
    const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(lista.map(p => p.id)));

    return (
        <div className="flex-1 min-h-0 flex flex-col gap-3 lg:gap-4 h-full">
            {/* Toolbar */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-3 flex-shrink-0">
                <div className="flex items-center gap-2 flex-wrap flex-1">
                    {ESTADOS.map(e => (
                        <button key={e} onClick={() => setEstado(e)}
                            className={`px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all ${estado === e ? 'bg-white/10 border-blue-500/50 text-white' : 'bg-white/[0.03] border-white/5 text-gray-400 hover:text-white'}`}>
                            {e === 'Todos' ? 'Todos' : e} <span className="ml-1 px-1.5 rounded bg-black/30">{conteos[e] || 0}</span>
                        </button>
                    ))}
                    <button onClick={() => setMiCartera(v => !v)} title="Ver solo mis prospectos"
                        className={`px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all ${miCartera ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/[0.03] border-white/5 text-gray-400 hover:text-white'}`}>
                        Mi cartera
                    </button>
                    <button onClick={cargar} title="Recargar" className="p-2 rounded-lg border border-white/10 bg-black/40 text-gray-400 hover:text-white">
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
                <div className="flex gap-2">
                    <div className="relative flex-1 lg:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, RUT, correo o teléfono..."
                            className="w-full bg-black/30 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white outline-none focus:border-blue-500 placeholder:text-gray-600" />
                    </div>
                </div>
            </div>

            {/* Barra de acciones en lote */}
            {selectedIds.size > 0 && (
                <div className="flex items-center flex-wrap gap-2 flex-shrink-0 bg-blue-600/15 border border-blue-500/30 rounded-xl px-3 py-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-300">{selectedIds.size} seleccionado(s)</span>
                    <div className="h-4 w-px bg-white/10 mx-1" />
                    <button onClick={() => bulkEstado('activo')} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-lg transition-colors">
                        <CheckCircle2 size={12} /> Activar
                    </button>
                    <button onClick={() => bulkEstado('inactivo')} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1 rounded-lg transition-colors">
                        <RotateCcw size={12} /> Inactivar
                    </button>
                    <button onClick={() => bulkEstado('perdido')} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-red-300 hover:text-red-200 bg-red-500/10 hover:bg-red-500/20 px-2.5 py-1 rounded-lg transition-colors">
                        <UserMinus size={12} /> Perder
                    </button>
                    <button onClick={bulkEliminar} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-red-300 hover:text-white bg-red-600/20 hover:bg-red-600 px-2.5 py-1 rounded-lg transition-colors">
                        <Trash2 size={12} /> Eliminar
                    </button>
                    <button onClick={clearSel} className="ml-auto flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-white transition-colors">
                        <X size={12} /> Limpiar
                    </button>
                </div>
            )}

            {/* Tabla + Ficha */}
            <div className="flex-1 min-h-0 flex gap-4 items-stretch">
            <div className={`min-h-[420px] overflow-hidden rounded-2xl border border-white/10 bg-[#0f172a]/50 flex flex-col transition-all ${selectedId ? 'lg:w-3/5' : 'w-full'}`}>
                <div className="overflow-auto flex-1 scrollbar-hide">
                    <table className="w-full min-w-[640px] text-left border-collapse">
                        <thead className="bg-[#0f172a] sticky top-0 z-10">
                            <tr className="border-b border-white/10 text-[10px] uppercase tracking-widest text-gray-500">
                                <th className="pl-3 pr-1 py-2.5 w-8">
                                    <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Seleccionar todos" className="w-3.5 h-3.5 accent-blue-500 cursor-pointer" />
                                </th>
                                <th className="px-4 py-2.5 font-black">Cliente</th>
                                <th className="px-4 py-2.5 font-black">Contacto</th>
                                <th className="px-4 py-2.5 font-black">Rubro</th>
                                <th className="px-4 py-2.5 font-black">Origen</th>
                                <th className="px-4 py-2.5 font-black">Estado</th>
                                <th className="px-4 py-2.5 font-black text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="7" className="p-8 text-center text-gray-500"><Loader2 size={20} className="animate-spin inline" /></td></tr>
                            ) : lista.length === 0 ? (
                                <tr><td colSpan="7" className="p-8 text-center text-gray-500 text-sm">No hay registros para este filtro. Usa <span className="text-blue-400 font-bold">+ Crear Prospecto</span>.</td></tr>
                            ) : lista.map(p => (
                                <tr key={p.id} onClick={() => setSelectedId(p.id)} className={`border-b border-white/5 hover:bg-white/[0.04] transition-colors cursor-pointer ${selectedId === p.id ? 'bg-blue-500/10' : selectedIds.has(p.id) ? 'bg-blue-500/[0.06]' : ''}`}>
                                    <td className="pl-3 pr-1 py-2.5" onClick={(e) => toggleRow(p.id, e)}>
                                        <input type="checkbox" checked={selectedIds.has(p.id)} onChange={(e) => toggleRow(p.id, e)} onClick={(e) => e.stopPropagation()} aria-label="Seleccionar" className="w-3.5 h-3.5 accent-blue-500 cursor-pointer" />
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center text-blue-400 shrink-0">
                                                <User size={15} />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-white text-xs">{p.nombreCompleto || <span className="text-gray-500 italic">(sin nombre)</span>}</span>
                                                {p.rut && <span className="text-[10px] text-gray-500 font-mono">{p.rut}</span>}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <div className="flex flex-col gap-0.5">
                                            {(p.telefonos || []).slice(0, 1).map((t, i) => (
                                                <span key={i} className="flex items-center gap-1 text-[10px] text-emerald-400"><Phone size={10} /> {t}</span>
                                            ))}
                                            {(p.correos || []).slice(0, 1).map((c, i) => (
                                                <span key={i} className="flex items-center gap-1 text-[10px] text-gray-400 truncate max-w-[180px]"><Mail size={10} /> {c}</span>
                                            ))}
                                    {(p.telefonos || []).length === 0 && (p.correos || []).length === 0 && (
                                                <span className="text-[10px] text-gray-600 italic">Sin contacto</span>
                                            )}
                                            {/* Indicadores de seguimiento */}
                                            {(() => {
                                                const activoParaSeguir = p.estado === 'prospecto' || p.estado === 'activo';
                                                const dUlt = diasDesde(p.fechaUltimoContacto);
                                                const dProx = p.proximoContacto ? diasDesde(p.proximoContacto) : null;
                                                return (
                                                    <>
                                                        {dProx !== null && dProx >= 0 && activoParaSeguir && (
                                                            <span className="flex items-center gap-1 text-[9px] font-bold text-red-300"><Clock size={9} /> Seguir (vencido)</span>
                                                        )}
                                                        {activoParaSeguir && (dProx === null) && dUlt !== null && dUlt >= DIAS_ESTANCADO && (
                                                            <span className="flex items-center gap-1 text-[9px] font-bold text-amber-300"><AlertTriangle size={9} /> {dUlt}d sin contacto</span>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-gray-300">
                                        {p.rubro || <span className="text-gray-600">—</span>}
                                        {p.ejecutivoNombre && <span className="block text-[9px] text-gray-500">👤 {p.ejecutivoNombre}</span>}
                                    </td>
                                    <td className="px-4 py-2.5"><span className="text-[9px] uppercase tracking-widest text-gray-400">{p.origen}</span></td>
                                    <td className="px-4 py-2.5">
                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase ${ESTADO_STYLE[p.estado] || ESTADO_STYLE.inactivo}`}>{p.estado}</span>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <div className="flex items-center justify-end gap-1.5">
                                            {p.estado === 'prospecto' && (
                                                <button onClick={(e) => { e.stopPropagation(); setPersonaAConvertir(p); }} title="Convertir a Cliente (crea su empresa)" className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 px-2 py-1 rounded-lg">
                                                    <ArrowRightCircle size={12} /> Convertir
                                                </button>
                                            )}
                                            {(p.estado === 'prospecto' || p.estado === 'activo') && (
                                                <button onClick={(e) => convertir(e, p, 'perdido')} title="Marcar como perdido (con motivo)" className="text-gray-400 hover:text-red-400 p-1.5 rounded-lg"><UserMinus size={13} /></button>
                                            )}
                                            {p.estado === 'activo' && (
                                                <button onClick={(e) => convertir(e, p, 'inactivo')} title="Marcar Inactivo" className="text-gray-400 hover:text-orange-400 p-1.5 rounded-lg"><RotateCcw size={13} /></button>
                                            )}
                                            {(p.estado === 'inactivo' || p.estado === 'perdido') && (
                                                <button onClick={(e) => convertir(e, p, 'prospecto')} title="Reactivar como prospecto" className="text-gray-400 hover:text-emerald-400 p-1.5 rounded-lg"><ArrowRightCircle size={13} /></button>
                                            )}
                                            <button onClick={(e) => eliminar(e, p)} title="Eliminar" className="text-gray-500 hover:text-red-400 p-1.5 rounded-lg"><Trash2 size={13} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <AnimatePresence>
                {selectedId && (
                    <PersonaDetailDrawer
                        personaId={selectedId}
                        onClose={() => setSelectedId(null)}
                        onChanged={cargar}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {personaAConvertir && (
                    <ConvertirClienteModal
                        persona={personaAConvertir}
                        onClose={() => setPersonaAConvertir(null)}
                        onConverted={() => {
                            cargar();
                            navigate('/CRM?sub=list');
                        }}
                    />
                )}
            </AnimatePresence>
            </div>
        </div>
    );
};

export default PersonasPanel;
