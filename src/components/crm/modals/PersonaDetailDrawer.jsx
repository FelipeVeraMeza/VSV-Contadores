import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, User, Edit, Save, Send, Clock, Building2, Loader2, History, ChevronDown, Trash2, CheckCircle2, UserMinus, Tag, Briefcase, Plus, Search, Pencil, GitMerge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import {
    obtenerPersonaApi, actualizarPersonaApi, agregarNotaPersonaApi, cambiarEstadoPersonaApi, eliminarPersonaApi,
    getCatalogosApi, getEmpresasListaApi, asociarEmpresaApi, desasociarEmpresaApi, editarNotaApi, fusionarPersonaApi, listarPersonasApi, crearEmpresaParaPersonaApi
} from '@/services/personaService';

const getSessionId = () => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').sessionId; }
    catch { return null; }
};

const ESTADO_STYLE = {
    prospecto: 'text-amber-300 border-amber-400/30 bg-amber-400/10',
    activo: 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10',
    inactivo: 'text-gray-300 border-gray-400/30 bg-gray-400/10',
};
const ESTADOS = ['prospecto', 'activo', 'inactivo'];

const inputClass = "bg-black/40 border border-white/10 rounded-lg p-2 text-xs text-white outline-none focus:border-blue-500 w-full";

const Field = ({ label, children }) => (
    <div className="flex flex-col gap-1">
        <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{label}</span>
        {children}
    </div>
);

const PersonaDetailDrawer = ({ personaId, onClose, onChanged }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [form, setForm] = useState({});
    const [newNote, setNewNote] = useState('');
    const [savingNote, setSavingNote] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showEstado, setShowEstado] = useState(false);
    const [showHist, setShowHist] = useState(false);
    const [catalogos, setCatalogos] = useState({ ejecutivos: [], servicios: [] });
    const [serviciosSel, setServiciosSel] = useState([]);
    // Empresas
    const [empQuery, setEmpQuery] = useState('');
    const [empResults, setEmpResults] = useState([]);
    // Notas
    const [notaSearch, setNotaSearch] = useState('');
    const [editNotaId, setEditNotaId] = useState(null);
    const [editNotaTxt, setEditNotaTxt] = useState('');
    // Crear empresa nueva
    const [nuevaEmpOpen, setNuevaEmpOpen] = useState(false);
    const [nuevaEmp, setNuevaEmp] = useState({ razonSocial: '', rut: '', giro: '' });
    const [savingEmp, setSavingEmp] = useState(false);
    // Fusionar
    const [mergeOpen, setMergeOpen] = useState(false);
    const [mergeQuery, setMergeQuery] = useState('');
    const [mergeResults, setMergeResults] = useState([]);

    useEffect(() => {
        (async () => {
            try {
                const res = await getCatalogosApi(getSessionId());
                const d = await res.json();
                if (d.success) setCatalogos({ ejecutivos: d.ejecutivos || [], servicios: d.servicios || [] });
            } catch { /* */ }
        })();
    }, []);

    const cargar = async () => {
        setLoading(true);
        try {
            const res = await obtenerPersonaApi(getSessionId(), personaId);
            const payload = await res.json();
            if (payload.success) {
                setData(payload.persona);
                const p = payload.persona;
                setForm({
                    nombre: p.nombre || '', segundoNombre: p.segundoNombre || '', apellidos: p.apellidos || '',
                    fechaNacimiento: p.fechaNacimiento ? String(p.fechaNacimiento).slice(0, 10) : '',
                    rut: p.rut || '',
                    telefonos: (p.telefonos || []).map(t => t.telefono).join(', '),
                    correos: (p.correos || []).map(c => c.correo).join(', '),
                    direccion: p.direccion || '', comuna: p.comuna || '', region: p.region || '',
                    rubro: p.rubro || '', observaciones: p.observaciones || '',
                    ejecutivoId: p.ejecutivoId || '', etiquetasStr: (p.etiquetas || []).join(', ')
                });
                setServiciosSel((p.serviciosInteres || []).map(s => s.id));
            }
        } catch { /* */ } finally { setLoading(false); }
    };

    useEffect(() => { cargar(); setIsEditing(false); }, [personaId]);

    const set = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }));

    const guardar = async () => {
        setSaving(true);
        try {
            const res = await actualizarPersonaApi(getSessionId(), personaId, {
                ...form,
                telefonos: form.telefonos.split(',').map(s => s.trim()).filter(Boolean),
                correos: form.correos.split(',').map(s => s.trim()).filter(Boolean),
                ejecutivoId: form.ejecutivoId || null,
                etiquetas: form.etiquetasStr.split(',').map(s => s.trim()).filter(Boolean),
                serviciosInteres: serviciosSel,
            });
            const payload = await res.json();
            if (!payload.success) throw new Error(payload.message);
            toast({ title: 'Cliente actualizado' });
            setIsEditing(false);
            await cargar();
            if (onChanged) onChanged();
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally { setSaving(false); }
    };

    const addNota = async () => {
        if (!newNote.trim()) return;
        setSavingNote(true);
        try {
            const res = await agregarNotaPersonaApi(getSessionId(), personaId, newNote);
            const payload = await res.json();
            if (!payload.success) throw new Error(payload.message);
            setData(prev => ({ ...prev, notas: [payload.nota, ...(prev.notas || [])] }));
            setNewNote('');
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally { setSavingNote(false); }
    };

    const [confirmDel, setConfirmDel] = useState(false);
    const eliminar = async () => {
        try {
            const res = await eliminarPersonaApi(getSessionId(), personaId);
            const payload = await res.json();
            if (!payload.success) throw new Error(payload.message);
            toast({ title: 'Cliente eliminado', description: 'Se eliminó definitivamente.' });
            if (onChanged) onChanged();
            onClose();
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        }
    };

    const cambiarEstado = async (estado) => {
        setShowEstado(false);
        if (estado === data.estado) return;
        try {
            const res = await cambiarEstadoPersonaApi(getSessionId(), personaId, estado);
            const payload = await res.json();
            if (!payload.success) throw new Error(payload.message);
            toast({ title: 'Estado actualizado', description: estado });
            await cargar();
            if (onChanged) onChanged();
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        }
    };

    const toggleServicio = (id) => setServiciosSel(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    // Buscar empresas para asociar
    useEffect(() => {
        if (!empQuery.trim()) { setEmpResults([]); return; }
        const t = setTimeout(async () => {
            try { const r = await getEmpresasListaApi(getSessionId(), empQuery); const d = await r.json(); if (d.success) setEmpResults(d.empresas || []); } catch { /* */ }
        }, 350);
        return () => clearTimeout(t);
    }, [empQuery]);

    const asociar = async (empresaId) => {
        try {
            const r = await asociarEmpresaApi(getSessionId(), personaId, { empresaId, principal: (data.empresas || []).length === 0 });
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            setEmpQuery(''); setEmpResults([]); await cargar();
        } catch (e) { toast({ variant: 'destructive', title: 'Error', description: e.message }); }
    };
    const crearEmpresa = async () => {
        if (!nuevaEmp.razonSocial.trim() || !nuevaEmp.rut.trim()) { toast({ variant: 'destructive', title: 'Faltan datos', description: 'Razón social y RUT son obligatorios.' }); return; }
        setSavingEmp(true);
        try {
            const r = await crearEmpresaParaPersonaApi(getSessionId(), personaId, nuevaEmp);
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            toast({ title: d.empresa?.reusada ? 'Empresa asociada (ya existía)' : 'Empresa creada y asociada' });
            setNuevaEmp({ razonSocial: '', rut: '', giro: '' }); setNuevaEmpOpen(false);
            await cargar();
        } catch (e) { toast({ variant: 'destructive', title: 'Error', description: e.message }); }
        finally { setSavingEmp(false); }
    };

    const desasociar = async (empresaId) => {
        try { const r = await desasociarEmpresaApi(getSessionId(), personaId, empresaId); const d = await r.json(); if (!d.success) throw new Error(d.message); await cargar(); }
        catch (e) { toast({ variant: 'destructive', title: 'Error', description: e.message }); }
    };

    const guardarNotaEdit = async (notaId) => {
        try {
            const r = await editarNotaApi(getSessionId(), notaId, editNotaTxt);
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            setData(prev => ({ ...prev, notas: prev.notas.map(n => n.id === notaId ? { ...n, texto: editNotaTxt } : n) }));
            setEditNotaId(null); setEditNotaTxt('');
        } catch (e) { toast({ variant: 'destructive', title: 'Error', description: e.message }); }
    };

    // Buscar personas para fusionar
    useEffect(() => {
        if (!mergeOpen || !mergeQuery.trim()) { setMergeResults([]); return; }
        const t = setTimeout(async () => {
            try {
                const r = await listarPersonasApi(getSessionId(), { q: mergeQuery });
                const d = await r.json();
                if (d.success) setMergeResults((d.personas || []).filter(p => p.id !== personaId).slice(0, 6));
            } catch { /* */ }
        }, 350);
        return () => clearTimeout(t);
    }, [mergeOpen, mergeQuery, personaId]);

    const fusionar = async (dupId) => {
        if (!window.confirm('Se absorberá ese registro en este cliente y se eliminará. ¿Continuar?')) return;
        try {
            const r = await fusionarPersonaApi(getSessionId(), personaId, dupId);
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            toast({ title: 'Registros fusionados' });
            setMergeOpen(false); setMergeQuery('');
            await cargar(); if (onChanged) onChanged();
        } catch (e) { toast({ variant: 'destructive', title: 'Error', description: e.message }); }
    };

    const nombreCompleto = data ? [data.nombre, data.segundoNombre, data.apellidos].filter(Boolean).join(' ') || '(sin nombre)' : '';

    return (
        <motion.div
            initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }}
            className="w-full lg:w-2/5 bg-[#0f172a]/95 backdrop-blur-3xl border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-2xl h-full min-h-[560px]"
        >
            {loading || !data ? (
                <div className="flex-1 flex items-center justify-center text-gray-500"><Loader2 className="animate-spin" /></div>
            ) : (
                <>
                    {/* Cabecera */}
                    <div className="p-5 border-b border-white/10 bg-gradient-to-r from-blue-900/30 to-transparent shrink-0">
                        <div className="flex gap-3 items-center">
                            <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400 shrink-0"><User size={24} /></div>
                            <div className="min-w-0 flex-1">
                                <h2 className="text-base font-black text-white truncate">{nombreCompleto}</h2>
                                {data.rut && <span className="text-xs text-gray-400 font-mono">{data.rut}</span>}
                            </div>
                            <div className="flex gap-1">
                                <button onClick={() => setIsEditing(!isEditing)} className={`p-2 rounded-xl border transition-colors ${isEditing ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-white/5 border-transparent text-gray-400 hover:text-white'}`}><Edit size={16} /></button>
                                {confirmDel ? (
                                    <button onClick={eliminar} title="Confirmar eliminación" className="px-2.5 py-2 rounded-xl bg-red-600 text-white text-[10px] font-black uppercase">¿Eliminar?</button>
                                ) : (
                                    <button onClick={() => setConfirmDel(true)} title="Eliminar (a papelera)" className="p-2 rounded-xl bg-white/5 text-gray-400 hover:text-red-400"><Trash2 size={16} /></button>
                                )}
                                <button onClick={onClose} className="p-2 rounded-xl bg-white/5 text-gray-400 hover:text-red-400"><X size={16} /></button>
                            </div>
                        </div>
                        {/* Estado */}
                        <div className="flex items-center gap-2 mt-3 relative">
                            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Estado:</span>
                            <button onClick={() => setShowEstado(!showEstado)} className={`flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full border uppercase ${ESTADO_STYLE[data.estado]}`}>
                                {data.estado} <ChevronDown size={12} />
                            </button>
                            {showEstado && (
                                <div className="absolute top-full left-12 mt-1 bg-[#0f172a] border border-white/10 rounded-xl shadow-2xl p-1 z-20">
                                    {ESTADOS.map(e => (
                                        <button key={e} onClick={() => cambiarEstado(e)} className={`block w-full text-left px-4 py-1.5 text-[10px] uppercase font-bold rounded-lg hover:bg-white/5 ${e === data.estado ? 'text-blue-400' : 'text-gray-300'}`}>{e}</button>
                                    ))}
                                </div>
                            )}
                            <span className="text-[9px] text-gray-600 ml-auto uppercase tracking-widest">{data.origen}</span>
                        </div>

                        {/* Acción rápida de conversión */}
                        {data.estado === 'prospecto' && (
                            <button onClick={() => cambiarEstado('activo')} className="mt-3 w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl py-2 text-[10px] font-black uppercase tracking-widest transition-colors">
                                <CheckCircle2 size={14} /> Convertir a Cliente Activo
                            </button>
                        )}
                        {data.estado === 'activo' && (
                            <button onClick={() => cambiarEstado('inactivo')} className="mt-3 w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl py-2 text-[10px] font-black uppercase tracking-widest transition-colors">
                                <UserMinus size={14} /> Marcar como Inactivo
                            </button>
                        )}
                        {data.estado === 'inactivo' && (
                            <button onClick={() => cambiarEstado('activo')} className="mt-3 w-full flex items-center justify-center gap-2 bg-emerald-600/80 hover:bg-emerald-600 text-white rounded-xl py-2 text-[10px] font-black uppercase tracking-widest transition-colors">
                                <CheckCircle2 size={14} /> Reactivar Cliente
                            </button>
                        )}
                    </div>

                    {/* Contenido */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4 scrollbar-thin scrollbar-thumb-white/10">
                        {/* Datos */}
                        <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2"><User size={14} /> Información</h3>
                            {isEditing ? (
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Nombre"><input className={inputClass} value={form.nombre} onChange={set('nombre')} /></Field>
                                    <Field label="Apellidos"><input className={inputClass} value={form.apellidos} onChange={set('apellidos')} /></Field>
                                    <Field label="RUT"><input className={inputClass} value={form.rut} onChange={set('rut')} /></Field>
                                    <Field label="Fecha nac."><input type="date" className={inputClass} value={form.fechaNacimiento} onChange={set('fechaNacimiento')} /></Field>
                                    <Field label="Teléfonos (coma)"><input className={inputClass} value={form.telefonos} onChange={set('telefonos')} /></Field>
                                    <Field label="Correos (coma)"><input className={inputClass} value={form.correos} onChange={set('correos')} /></Field>
                                    <Field label="Dirección"><input className={inputClass} value={form.direccion} onChange={set('direccion')} /></Field>
                                    <Field label="Comuna"><input className={inputClass} value={form.comuna} onChange={set('comuna')} /></Field>
                                    <Field label="Región"><input className={inputClass} value={form.region} onChange={set('region')} /></Field>
                                    <Field label="Rubro"><input className={inputClass} value={form.rubro} onChange={set('rubro')} /></Field>
                                    <Field label="Ejecutivo">
                                        <select className={`${inputClass} cursor-pointer`} value={form.ejecutivoId} onChange={set('ejecutivoId')}>
                                            <option value="">— Sin asignar —</option>
                                            {catalogos.ejecutivos.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                                        </select>
                                    </Field>
                                    <div className="col-span-2"><Field label="Etiquetas (coma)"><input className={inputClass} value={form.etiquetasStr} onChange={set('etiquetasStr')} placeholder="VIP, referido..." /></Field></div>
                                    {catalogos.servicios.length > 0 && (
                                        <div className="col-span-2"><Field label="Servicios de interés">
                                            <div className="flex flex-wrap gap-1.5">
                                                {catalogos.servicios.map(s => (
                                                    <button type="button" key={s.id} onClick={() => toggleServicio(s.id)} className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${serviciosSel.includes(s.id) ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-gray-400'}`}>{s.nombre}</button>
                                                ))}
                                            </div>
                                        </Field></div>
                                    )}
                                    <div className="col-span-2"><Field label="Observaciones"><textarea rows={2} className={`${inputClass} resize-none`} value={form.observaciones} onChange={set('observaciones')} /></Field></div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div><span className="text-[9px] text-gray-500 uppercase block">Teléfonos</span><span className="text-gray-200">{(data.telefonos || []).map(t => t.telefono).join(', ') || '—'}</span></div>
                                    <div><span className="text-[9px] text-gray-500 uppercase block">Correos</span><span className="text-gray-200 break-all">{(data.correos || []).map(c => c.correo).join(', ') || '—'}</span></div>
                                    <div><span className="text-[9px] text-gray-500 uppercase block">Dirección</span><span className="text-gray-200">{[data.direccion, data.comuna, data.region].filter(Boolean).join(', ') || '—'}</span></div>
                                    <div><span className="text-[9px] text-gray-500 uppercase block">Rubro</span><span className="text-gray-200">{data.rubro || '—'}</span></div>
                                    <div><span className="text-[9px] text-gray-500 uppercase block">Ejecutivo</span><span className="text-gray-200">{data.ejecutivoNombre || '—'}</span></div>
                                    {(data.etiquetas || []).length > 0 && (
                                        <div className="col-span-2"><span className="text-[9px] text-gray-500 uppercase block mb-1">Etiquetas</span>
                                            <div className="flex flex-wrap gap-1">{data.etiquetas.map((e, i) => <span key={i} className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">{e}</span>)}</div>
                                        </div>
                                    )}
                                    {(data.serviciosInteres || []).length > 0 && (
                                        <div className="col-span-2"><span className="text-[9px] text-gray-500 uppercase block mb-1">Servicios de interés</span>
                                            <div className="flex flex-wrap gap-1">{data.serviciosInteres.map(s => <span key={s.id} className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-gray-200 border border-white/10">{s.nombre}</span>)}</div>
                                        </div>
                                    )}
                                    {data.observaciones && <div className="col-span-2"><span className="text-[9px] text-gray-500 uppercase block">Observaciones</span><span className="text-gray-200">{data.observaciones}</span></div>}
                                </div>
                            )}
                            {isEditing && (
                                <div className="flex gap-2 mt-3">
                                    <Button variant="ghost" onClick={() => { setIsEditing(false); cargar(); }} className="flex-1 bg-white/5 text-gray-300 rounded-lg text-[10px] font-black uppercase h-9">Cancelar</Button>
                                    <Button onClick={guardar} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[10px] font-black uppercase h-9 flex items-center justify-center gap-2">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar</Button>
                                </div>
                            )}
                        </div>

                        {/* Empresas asociadas */}
                        <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-4">
                            <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Building2 size={14} /> Empresas asociadas</h3>
                            {(data.empresas || []).length > 0 ? (
                                <div className="space-y-1.5 mb-3">
                                    {data.empresas.map((e, i) => (
                                        <div key={i} className="flex items-center justify-between text-xs gap-2">
                                            <span className="text-gray-200 font-bold truncate">{e.razonSocial}{e.principal ? <span className="text-[9px] text-indigo-300"> · principal</span> : ''}</span>
                                            <button onClick={() => desasociar(e.empresaId)} className="text-gray-500 hover:text-red-400 shrink-0"><Trash2 size={12} /></button>
                                        </div>
                                    ))}
                                </div>
                            ) : <p className="text-[10px] text-gray-500 italic mb-3">Sin empresas asociadas (persona natural).</p>}
                            {/* Asociar empresa */}
                            <div className="relative">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={13} />
                                    <input value={empQuery} onChange={(e) => setEmpQuery(e.target.value)} placeholder="Asociar empresa..." className="w-full bg-black/40 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white outline-none focus:border-indigo-500 placeholder:text-gray-600" />
                                </div>
                                {empResults.length > 0 && (
                                    <div className="absolute z-20 w-full mt-1 bg-[#0f172a] border border-white/10 rounded-lg shadow-2xl max-h-44 overflow-y-auto">
                                        {empResults.map(e => (
                                            <button key={e.id} onClick={() => asociar(e.id)} className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/5 truncate">{e.razonSocial}</button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Crear empresa nueva */}
                            <button onClick={() => setNuevaEmpOpen(!nuevaEmpOpen)} className="mt-2 flex items-center gap-1 text-[10px] font-bold text-indigo-400 hover:text-indigo-300">
                                <Plus size={12} /> Crear empresa nueva
                            </button>
                            {nuevaEmpOpen && (
                                <div className="mt-2 space-y-2 bg-black/20 border border-white/5 rounded-xl p-3">
                                    <input value={nuevaEmp.razonSocial} onChange={(e) => setNuevaEmp(p => ({ ...p, razonSocial: e.target.value }))} placeholder="Razón social *" className={inputClass} />
                                    <div className="grid grid-cols-2 gap-2">
                                        <input value={nuevaEmp.rut} onChange={(e) => setNuevaEmp(p => ({ ...p, rut: e.target.value }))} placeholder="RUT empresa *" className={inputClass} />
                                        <input value={nuevaEmp.giro} onChange={(e) => setNuevaEmp(p => ({ ...p, giro: e.target.value }))} placeholder="Giro" className={inputClass} />
                                    </div>
                                    <Button onClick={crearEmpresa} disabled={savingEmp} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg h-8 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                                        {savingEmp ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Crear y asociar
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* Historial de estado */}
                        {(data.historialEstado || []).length > 0 && (
                            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                                <button onClick={() => setShowHist(!showHist)} className="w-full flex items-center justify-between text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    <span className="flex items-center gap-2"><History size={14} /> Historial de estado ({data.historialEstado.length})</span>
                                    <ChevronDown size={14} className={showHist ? 'rotate-180' : ''} />
                                </button>
                                {showHist && (
                                    <div className="space-y-1.5 mt-3">
                                        {data.historialEstado.map((h, i) => (
                                            <div key={i} className="text-[10px] border-b border-white/5 pb-1 last:border-0">
                                                <span className="text-gray-300">{h.anterior || '—'} → <span className="text-blue-300">{h.nuevo}</span></span>
                                                <span className="text-gray-600"> · {h.fecha} · {h.autor}{h.motivo ? ` · ${h.motivo}` : ''}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Notas */}
                        <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Clock size={14} /> Notas</h3>
                            <div className="flex gap-2 mb-4">
                                <input value={newNote} onChange={(e) => setNewNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNota()} placeholder="Escribe una nota..." className="flex-1 bg-black/40 border border-white/10 rounded-xl p-2.5 text-xs text-white outline-none focus:border-blue-500 placeholder:text-gray-600" />
                                <Button onClick={addNota} disabled={savingNote || !newNote.trim()} className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl px-4 h-auto"><Send size={16} /></Button>
                            </div>
                            {(data.notas || []).length > 0 && (
                                <div className="relative mb-3">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={13} />
                                    <input value={notaSearch} onChange={(e) => setNotaSearch(e.target.value)} placeholder="Buscar en notas..." className="w-full bg-black/30 border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white outline-none focus:border-blue-500 placeholder:text-gray-600" />
                                </div>
                            )}
                            {(() => {
                                const filtradas = (data.notas || []).filter(n => !notaSearch.trim() || n.texto.toLowerCase().includes(notaSearch.trim().toLowerCase()));
                                if (filtradas.length === 0) return <p className="text-xs text-gray-500 italic text-center py-2">{notaSearch ? 'Sin coincidencias.' : 'Sin notas aún.'}</p>;
                                return (
                                    <div className="space-y-3 max-h-60 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10">
                                        {filtradas.map((n) => (
                                            <div key={n.id} className="border-b border-white/5 pb-2 last:border-0">
                                                <div className="flex items-center gap-1.5 mb-1 text-gray-500">
                                                    <Clock size={10} /> <span className="text-[9px] font-black tracking-widest">{n.fecha}</span>
                                                    <span className="text-[9px] text-gray-600">· {n.autor}</span>
                                                    {n.esIa && <span className="text-[8px] text-purple-400 font-black">IA</span>}
                                                    {editNotaId !== n.id && (
                                                        <button onClick={() => { setEditNotaId(n.id); setEditNotaTxt(n.texto); }} className="ml-auto text-gray-500 hover:text-blue-400"><Pencil size={11} /></button>
                                                    )}
                                                </div>
                                                {editNotaId === n.id ? (
                                                    <div className="flex flex-col gap-1.5">
                                                        <textarea rows={2} value={editNotaTxt} onChange={(e) => setEditNotaTxt(e.target.value)} className="bg-black/40 border border-white/10 rounded-lg p-2 text-xs text-white outline-none focus:border-blue-500 resize-none" />
                                                        <div className="flex gap-2">
                                                            <button onClick={() => setEditNotaId(null)} className="flex-1 text-[10px] font-bold text-gray-400 bg-white/5 rounded py-1">Cancelar</button>
                                                            <button onClick={() => guardarNotaEdit(n.id)} className="flex-1 text-[10px] font-bold text-white bg-blue-600 rounded py-1">Guardar</button>
                                                        </div>
                                                    </div>
                                                ) : <p className="text-xs text-gray-200">{n.texto}</p>}
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Fusionar duplicado */}
                        <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                            <button onClick={() => setMergeOpen(!mergeOpen)} className="w-full flex items-center justify-between text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                <span className="flex items-center gap-2"><GitMerge size={14} /> Fusionar duplicado</span>
                                <ChevronDown size={14} className={mergeOpen ? 'rotate-180' : ''} />
                            </button>
                            {mergeOpen && (
                                <div className="mt-3">
                                    <p className="text-[10px] text-gray-500 mb-2">Busca el registro duplicado; se absorberá en este cliente y se eliminará.</p>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={13} />
                                        <input value={mergeQuery} onChange={(e) => setMergeQuery(e.target.value)} placeholder="Buscar cliente a fusionar..." className="w-full bg-black/40 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white outline-none focus:border-red-500 placeholder:text-gray-600" />
                                    </div>
                                    <div className="space-y-1 mt-2">
                                        {mergeResults.map(p => (
                                            <button key={p.id} onClick={() => fusionar(p.id)} className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-red-500/10 rounded-lg flex justify-between">
                                                <span className="truncate">{p.nombreCompleto || '(sin nombre)'}</span>
                                                <span className="text-[10px] text-gray-500">{p.rut || p.estado}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </motion.div>
    );
};

export default PersonaDetailDrawer;
