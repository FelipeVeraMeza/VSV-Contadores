import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Search, User, Phone, Mail, Loader2, UserPlus, RefreshCw, ArrowRightCircle, Trash2, RotateCcw } from 'lucide-react';
import { listarPersonasApi, cambiarEstadoPersonaApi, eliminarPersonaApi } from '@/services/personaService';
import { toast } from '@/components/ui/use-toast';
import PersonaDetailDrawer from '../modals/PersonaDetailDrawer';

const getSessionId = () => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').sessionId; }
    catch { return null; }
};

const ESTADO_STYLE = {
    prospecto: 'text-amber-400 border-amber-400/30 bg-amber-400/10',
    activo: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
    inactivo: 'text-gray-400 border-gray-400/30 bg-gray-400/10',
};

const ESTADOS = ['Todos', 'prospecto', 'activo', 'inactivo'];

const PersonasPanel = ({ reloadKey = 0, onCrear }) => {
    const [personas, setPersonas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [estado, setEstado] = useState('Todos');
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState(null);

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

    const convertir = async (e, p, nuevoEstado) => {
        e.stopPropagation();
        try {
            const r = await cambiarEstadoPersonaApi(getSessionId(), p.id, nuevoEstado);
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            toast({ title: nuevoEstado === 'activo' ? 'Pasó a Cliente Activo' : 'Estado actualizado' });
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

    const conteos = useMemo(() => {
        const c = { Todos: personas.length, prospecto: 0, activo: 0, inactivo: 0 };
        personas.forEach(p => { c[p.estado] = (c[p.estado] || 0) + 1; });
        return c;
    }, [personas]);

    const lista = useMemo(() => {
        const term = search.trim().toLowerCase();
        return personas
            .filter(p => estado === 'Todos' || p.estado === estado)
            .filter(p => {
                if (!term) return true;
                return (
                    (p.nombreCompleto || '').toLowerCase().includes(term) ||
                    (p.rut || '').toLowerCase().includes(term) ||
                    (p.correos || []).some(c => c.toLowerCase().includes(term)) ||
                    (p.telefonos || []).some(t => t.replace(/\D/g, '').includes(term.replace(/\D/g, '')))
                );
            });
    }, [personas, estado, search]);

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

            {/* Tabla + Ficha */}
            <div className="flex-1 min-h-0 flex gap-4 items-stretch">
            <div className={`min-h-[420px] overflow-hidden rounded-2xl border border-white/10 bg-[#0f172a]/50 flex flex-col transition-all ${selectedId ? 'lg:w-3/5' : 'w-full'}`}>
                <div className="overflow-auto flex-1 scrollbar-hide">
                    <table className="w-full min-w-[640px] text-left border-collapse">
                        <thead className="bg-[#0f172a] sticky top-0 z-10">
                            <tr className="border-b border-white/10 text-[10px] uppercase tracking-widest text-gray-500">
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
                                <tr><td colSpan="6" className="p-8 text-center text-gray-500"><Loader2 size={20} className="animate-spin inline" /></td></tr>
                            ) : lista.length === 0 ? (
                                <tr><td colSpan="6" className="p-8 text-center text-gray-500 text-sm">No hay registros para este filtro. Usa <span className="text-blue-400 font-bold">+ Crear Prospecto</span>.</td></tr>
                            ) : lista.map(p => (
                                <tr key={p.id} onClick={() => setSelectedId(p.id)} className={`border-b border-white/5 hover:bg-white/[0.04] transition-colors cursor-pointer ${selectedId === p.id ? 'bg-blue-500/10' : ''}`}>
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
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-gray-300">{p.rubro || <span className="text-gray-600">—</span>}</td>
                                    <td className="px-4 py-2.5"><span className="text-[9px] uppercase tracking-widest text-gray-400">{p.origen}</span></td>
                                    <td className="px-4 py-2.5">
                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase ${ESTADO_STYLE[p.estado] || ESTADO_STYLE.inactivo}`}>{p.estado}</span>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <div className="flex items-center justify-end gap-1.5">
                                            {p.estado === 'prospecto' && (
                                                <button onClick={(e) => convertir(e, p, 'activo')} title="Pasar a Cliente Activo" className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 px-2 py-1 rounded-lg">
                                                    <ArrowRightCircle size={12} /> Cliente
                                                </button>
                                            )}
                                            {p.estado === 'activo' && (
                                                <button onClick={(e) => convertir(e, p, 'inactivo')} title="Marcar Inactivo" className="text-gray-400 hover:text-orange-400 p-1.5 rounded-lg"><RotateCcw size={13} /></button>
                                            )}
                                            {p.estado === 'inactivo' && (
                                                <button onClick={(e) => convertir(e, p, 'activo')} title="Reactivar" className="text-gray-400 hover:text-emerald-400 p-1.5 rounded-lg"><ArrowRightCircle size={13} /></button>
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
            </div>
        </div>
    );
};

export default PersonasPanel;
