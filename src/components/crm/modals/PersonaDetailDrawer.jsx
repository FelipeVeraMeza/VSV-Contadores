import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, User, Edit, Save, Send, Clock, Building2, Loader2, History, ChevronDown, Trash2, CheckCircle2, UserMinus, Tag, Briefcase, Plus, Search, Pencil, GitMerge, Phone, Mail, Target, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import {
    obtenerPersonaApi, actualizarPersonaApi, agregarNotaPersonaApi, cambiarEstadoPersonaApi, eliminarPersonaApi,
    getCatalogosApi, getEmpresasListaApi, asociarEmpresaApi, desasociarEmpresaApi, editarNotaApi, eliminarNotaApi, fusionarPersonaApi, listarPersonasApi, crearEmpresaParaPersonaApi,
    listarAccionesApi, crearAccionApi, completarAccionApi, eliminarAccionApi
} from '@/services/personaService';

const getSessionId = () => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').sessionId; }
    catch { return null; }
};

const ESTADO_STYLE = {
    prospecto: 'text-amber-700 border-amber-400/30 bg-amber-400/10',
    activo: 'text-emerald-700 border-emerald-400/30 bg-emerald-400/10',
    inactivo: 'text-slate-600 border-gray-400/30 bg-gray-400/10',
};
const ESTADOS = ['prospecto', 'activo', 'inactivo', 'perdido'];

const inputClass = "bg-slate-50 border border-[#efe8dd] rounded-lg p-2 text-xs text-slate-900 outline-none focus:border-emerald-500 w-full";

const Field = ({ label, children }) => (
    <div className="flex flex-col gap-1">
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
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
    const [catalogos, setCatalogos] = useState({ ejecutivos: [], servicios: [], estadosComerciales: [], accionesSugeridas: [] });
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
                if (d.success) setCatalogos({ ejecutivos: d.ejecutivos || [], servicios: d.servicios || [], estadosComerciales: d.estadosComerciales || [], accionesSugeridas: d.accionesSugeridas || [] });
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
                    ejecutivoId: p.ejecutivoId || '', etiquetasStr: (p.etiquetas || []).join(', '),
                    proximoContacto: p.proximoContacto ? String(p.proximoContacto).slice(0, 10) : '',
                    consentimiento: p.consentimiento !== false,
                    necesidad: p.necesidad || '', estadoComercial: p.estadoComercial || '', accionSiguiente: p.accionSiguiente || '',
                });
                setServiciosSel((p.serviciosInteres || []).map(s => s.id));
            }
        } catch { /* */ } finally { setLoading(false); }
    };

    useEffect(() => { cargar(); setIsEditing(false); }, [personaId]);

    // ---- Agenda de acciones del prospecto (#5/#6/#7) ----
    const [acciones, setAcciones] = useState([]);
    const [nuevaAccion, setNuevaAccion] = useState({ tipo: 'llamar', fechaHora: '', titulo: '' });
    const cargarAcciones = async () => {
        try { const r = await listarAccionesApi(getSessionId(), personaId); const d = await r.json(); if (d.success) setAcciones(d.acciones || []); } catch { /* */ }
    };
    useEffect(() => { if (personaId) cargarAcciones(); }, [personaId]);
    const addAccion = async () => {
        if (!nuevaAccion.titulo.trim() && !nuevaAccion.fechaHora) { toast({ variant: 'destructive', title: 'Falta info', description: 'Pon un título o una fecha/hora.' }); return; }
        try {
            const r = await crearAccionApi(getSessionId(), personaId, { tipo: nuevaAccion.tipo, titulo: nuevaAccion.titulo.trim() || null, fechaHora: nuevaAccion.fechaHora || null });
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            setNuevaAccion({ tipo: 'llamar', fechaHora: '', titulo: '' });
            cargarAcciones(); cargar();
        } catch (e) { toast({ variant: 'destructive', title: 'Error', description: e.message }); }
    };
    const toggleAccion = async (a) => {
        const nuevo = a.estado === 'completada' ? 'pendiente' : 'completada';
        setAcciones(prev => prev.map(x => x.id === a.id ? { ...x, estado: nuevo } : x));
        try { await completarAccionApi(getSessionId(), a.id, nuevo); cargarAcciones(); cargar(); } catch { cargarAcciones(); }
    };
    const delAccion = async (a) => {
        setAcciones(prev => prev.filter(x => x.id !== a.id));
        try { await eliminarAccionApi(getSessionId(), a.id); cargar(); } catch { cargarAcciones(); }
    };

    const set = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }));

    // Arma el payload completo desde el formulario. Siempre se manda entero
    // (no parcial) porque el backend sobrescribe cada campo: un envío parcial
    // borraría los que no vengan.
    const construirPayload = (extra = {}) => ({
        ...form,
        telefonos: (form.telefonos || '').split(',').map(s => s.trim()).filter(Boolean),
        correos: (form.correos || '').split(',').map(s => s.trim()).filter(Boolean),
        ejecutivoId: form.ejecutivoId || null,
        etiquetas: (form.etiquetasStr || '').split(',').map(s => s.trim()).filter(Boolean),
        serviciosInteres: serviciosSel,
        proximoContacto: form.proximoContacto || null,
        consentimiento: form.consentimiento !== false,
        ...extra,
    });

    const guardar = async () => {
        setSaving(true);
        try {
            const res = await actualizarPersonaApi(getSessionId(), personaId, construirPayload());
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

    // Guardado al vuelo de un campo del resumen (Estado del cliente / Acción),
    // sin abrir el modo edición. Actualiza el formulario y persiste el todo.
    const guardarRapido = async (campo, valor) => {
        setForm(prev => ({ ...prev, [campo]: valor }));
        try {
            const res = await actualizarPersonaApi(getSessionId(), personaId, construirPayload({ [campo]: valor }));
            const payload = await res.json();
            if (!payload.success) throw new Error(payload.message);
            setData(prev => ({ ...prev, [campo]: valor }));
            if (onChanged) onChanged();
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        }
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
        // Al inactivar o perder, se pide el motivo (queda en el historial)
        let motivo = '';
        if (estado === 'inactivo' || estado === 'perdido') {
            motivo = window.prompt(`Motivo de "${estado}" (opcional):`, '') ?? '';
        }
        try {
            const res = await cambiarEstadoPersonaApi(getSessionId(), personaId, estado, motivo);
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

    const [confirmNota, setConfirmNota] = useState(null); // id de nota pendiente de confirmar borrado
    const eliminarNota = async (notaId) => {
        // Optimista: quita la nota de inmediato; si falla, se recarga.
        setData(prev => ({ ...prev, notas: (prev.notas || []).filter(n => n.id !== notaId) }));
        setConfirmNota(null);
        try {
            const r = await eliminarNotaApi(getSessionId(), notaId);
            const d = await r.json(); if (!d.success) throw new Error(d.message);
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
            cargar();
        }
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
            className="w-full lg:w-2/5 bg-white backdrop-blur-3xl border border-[#efe8dd] rounded-2xl flex flex-col overflow-hidden shadow-2xl h-full min-h-[560px]"
        >
            {loading || !data ? (
                <div className="flex-1 flex items-center justify-center text-slate-400"><Loader2 className="animate-spin" /></div>
            ) : (
                <>
                    {/* Cabecera */}
                    <div className="p-5 border-b border-[#efe8dd] bg-gradient-to-r from-blue-900/30 to-transparent shrink-0">
                        <div className="flex gap-3 items-center">
                            <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-600 shrink-0"><User size={24} /></div>
                            <div className="min-w-0 flex-1">
                                <h2 className="text-base font-black text-slate-900 truncate">{nombreCompleto}</h2>
                                {data.rut && <span className="text-xs text-slate-500 font-mono">{data.rut}</span>}
                            </div>
                            <div className="flex gap-1">
                                <button onClick={() => setIsEditing(!isEditing)} className={`p-2 rounded-xl border transition-colors ${isEditing ? 'bg-blue-500/20 border-blue-500/50 text-blue-600' : 'bg-slate-50 border-transparent text-slate-500 hover:text-slate-900'}`}><Edit size={16} /></button>
                                {confirmDel ? (
                                    <button onClick={eliminar} title="Confirmar eliminación" className="px-2.5 py-2 rounded-xl bg-red-600 text-white text-[10px] font-black uppercase">¿Eliminar?</button>
                                ) : (
                                    <button onClick={() => setConfirmDel(true)} title="Eliminar (a papelera)" className="p-2 rounded-xl bg-slate-50 text-slate-500 hover:text-red-500"><Trash2 size={16} /></button>
                                )}
                                <button onClick={onClose} className="p-2 rounded-xl bg-slate-50 text-slate-500 hover:text-red-500"><X size={16} /></button>
                            </div>
                        </div>

                        {/* Contacto directo en el resumen */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                            {(data.telefonos || []).slice(0, 1).map((t, i) => (
                                <a key={i} href={`tel:${t.telefono}`} className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-emerald-600"><Phone size={12} className="text-emerald-600" /> {t.telefono}</a>
                            ))}
                            {(data.correos || []).slice(0, 1).map((c, i) => (
                                <a key={i} href={`mailto:${c.correo}`} className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-emerald-600 truncate max-w-[220px]"><Mail size={12} className="text-slate-400" /> {c.correo}</a>
                            ))}
                            {(data.telefonos || []).length === 0 && (data.correos || []).length === 0 && (
                                <span className="text-[10px] text-slate-400 italic">Sin contacto registrado</span>
                            )}
                        </div>

                        {/* Estado del ciclo (prospecto/activo/…) — controla la conversión a cliente */}
                        <div className="flex items-center gap-2 mt-3 relative">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Estado:</span>
                            <button onClick={() => setShowEstado(!showEstado)} className={`flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full border uppercase ${ESTADO_STYLE[data.estado] || 'text-red-700 border-red-400/30 bg-red-400/10'}`}>
                                {data.estado} <ChevronDown size={12} />
                            </button>
                            {showEstado && (
                                <div className="absolute top-full left-12 mt-1 bg-white border border-[#efe8dd] rounded-xl shadow-2xl p-1 z-20">
                                    {ESTADOS.map(e => (
                                        <button key={e} onClick={() => cambiarEstado(e)} className={`block w-full text-left px-4 py-1.5 text-[10px] uppercase font-bold rounded-lg hover:bg-slate-100 ${e === data.estado ? 'text-blue-600' : 'text-slate-600'}`}>{e}</button>
                                    ))}
                                </div>
                            )}
                            <span className="text-[9px] text-slate-400 ml-auto uppercase tracking-widest">{data.origen}</span>
                        </div>

                        {/* Estado del cliente (situación comercial) + Acción — editables al vuelo */}
                        <div className="grid grid-cols-2 gap-2 mt-3">
                            <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Target size={11} /> Estado del cliente</span>
                                <input list="drawer-estados-comerciales" defaultValue={data.estadoComercial || ''} key={`ec-${personaId}`}
                                    onBlur={(e) => { const v = e.target.value.trim(); if (v !== (data.estadoComercial || '')) guardarRapido('estadoComercial', v); }}
                                    placeholder="Esperando respuesta…"
                                    className="bg-white border border-[#efe8dd] rounded-lg px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-500 placeholder:text-slate-400" />
                                <datalist id="drawer-estados-comerciales">
                                    {(catalogos.estadosComerciales || []).map(s => <option key={s} value={s} />)}
                                </datalist>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><ArrowRight size={11} /> Acción (próximo paso)</span>
                                <input list="drawer-acciones" defaultValue={data.accionSiguiente || ''} key={`ac-${personaId}`}
                                    onBlur={(e) => { const v = e.target.value.trim(); if (v !== (data.accionSiguiente || '')) guardarRapido('accionSiguiente', v); }}
                                    placeholder="Llamar, WhatsApp…"
                                    className="bg-white border border-[#efe8dd] rounded-lg px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-500 placeholder:text-slate-400" />
                                <datalist id="drawer-acciones">
                                    {(catalogos.accionesSugeridas || []).map(s => <option key={s} value={s} />)}
                                </datalist>
                            </div>
                        </div>

                        {/* Acción rápida de conversión */}
                        {data.estado === 'prospecto' && (
                            <button onClick={() => cambiarEstado('activo')} className="mt-3 w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl py-2 text-[10px] font-black uppercase tracking-widest transition-colors">
                                <CheckCircle2 size={14} /> Convertir a Cliente Activo
                            </button>
                        )}
                        {data.estado === 'activo' && (
                            <button onClick={() => cambiarEstado('inactivo')} className="mt-3 w-full flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl py-2 text-[10px] font-black uppercase tracking-widest transition-colors">
                                <UserMinus size={14} /> Marcar como Inactivo
                            </button>
                        )}
                        {data.estado === 'inactivo' && (
                            <button onClick={() => cambiarEstado('activo')} className="mt-3 w-full flex items-center justify-center gap-2 bg-emerald-600/80 hover:bg-emerald-600 text-white rounded-xl py-2 text-[10px] font-black uppercase tracking-widest transition-colors">
                                <CheckCircle2 size={14} /> Reactivar Cliente
                            </button>
                        )}

                        {/* AGENDA DE ACCIONES · qué hacer y cuándo (#5/#6/#7) */}
                        <div className="mt-4 border-t border-[#efe8dd] pt-3">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1 mb-2"><Clock size={11} /> Agenda de acciones</span>
                            <div className="space-y-1 mb-2">
                                {acciones.length === 0 && <p className="text-[10px] text-slate-400 italic">Sin acciones agendadas.</p>}
                                {acciones.map(a => {
                                    const hecha = a.estado === 'completada';
                                    return (
                                        <div key={a.id} className="flex items-start gap-2 group bg-slate-50 border border-[#efe8dd] rounded-lg px-2 py-1.5">
                                            <button onClick={() => toggleAccion(a)} className="shrink-0 mt-0.5" title={hecha ? 'Reabrir' : 'Completar'}>
                                                {hecha ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Clock size={14} className="text-slate-300 hover:text-emerald-500" />}
                                            </button>
                                            <div className="min-w-0 flex-1">
                                                <p className={`text-[11px] font-bold ${hecha ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{a.titulo || a.tipo}</p>
                                                <p className="text-[9px] text-slate-400 capitalize">{a.tipo}{a.fechaHora ? ` · ${new Date(a.fechaHora).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}</p>
                                            </div>
                                            <button onClick={() => delAccion(a)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 shrink-0 mt-0.5"><Trash2 size={11} /></button>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                                <select value={nuevaAccion.tipo} onChange={(e) => setNuevaAccion(a => ({ ...a, tipo: e.target.value }))} className="bg-white border border-[#efe8dd] rounded-lg px-2 py-1.5 text-xs outline-none focus:border-emerald-500 cursor-pointer">
                                    <option value="llamar">Llamar</option><option value="reunion">Reunión</option><option value="seguimiento">Seguimiento</option><option value="prospectar">Prospectar</option><option value="otro">Otro</option>
                                </select>
                                <input type="datetime-local" value={nuevaAccion.fechaHora} onChange={(e) => setNuevaAccion(a => ({ ...a, fechaHora: e.target.value }))} className="bg-white border border-[#efe8dd] rounded-lg px-2 py-1.5 text-xs outline-none focus:border-emerald-500" />
                                <input value={nuevaAccion.titulo} onChange={(e) => setNuevaAccion(a => ({ ...a, titulo: e.target.value }))} placeholder="Ej: Llamar a Marleny 13:30" className="bg-white border border-[#efe8dd] rounded-lg px-2 py-1.5 text-xs outline-none focus:border-emerald-500" />
                                <button onClick={addAccion} className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-2 py-1.5 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1"><Plus size={12} /> Agendar</button>
                            </div>
                        </div>
                    </div>

                    {/* Contenido */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4 scrollbar-thin scrollbar-thumb-white/10">
                        {/* Notas — lo primero de la ficha: es el trabajo del día a día */}
                        <div className="bg-white border border-[#efe8dd] rounded-2xl p-4">
                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2"><Clock size={14} /> Notas</h3>
                            <div className="flex gap-2 mb-4">
                                <input value={newNote} onChange={(e) => setNewNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNota()} placeholder="Escribe una nota..." className="flex-1 bg-slate-50 border border-[#efe8dd] rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:border-emerald-500 placeholder:text-slate-400" />
                                <Button onClick={addNota} disabled={savingNote || !newNote.trim()} className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-4 h-auto"><Send size={16} /></Button>
                            </div>
                            {(data.notas || []).length > 0 && (
                                <div className="relative mb-3">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                                    <input value={notaSearch} onChange={(e) => setNotaSearch(e.target.value)} placeholder="Buscar en notas..." className="w-full bg-slate-50 border border-[#efe8dd] rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-500 placeholder:text-slate-400" />
                                </div>
                            )}
                            {(() => {
                                const filtradas = (data.notas || []).filter(n => !notaSearch.trim() || n.texto.toLowerCase().includes(notaSearch.trim().toLowerCase()));
                                if (filtradas.length === 0) return <p className="text-xs text-slate-400 italic text-center py-2">{notaSearch ? 'Sin coincidencias.' : 'Sin notas aún.'}</p>;
                                return (
                                    <div className="space-y-3 max-h-60 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10">
                                        {filtradas.map((n) => (
                                            <div key={n.id} className="border-b border-[#efe8dd] pb-2 last:border-0">
                                                <div className="flex items-center gap-1.5 mb-1 text-slate-400">
                                                    <Clock size={10} /> <span className="text-[9px] font-black tracking-widest">{n.fecha}</span>
                                                    <span className="text-[9px] text-slate-400">· {n.autor}</span>
                                                    {n.esIa && <span className="text-[8px] text-purple-600 font-black">IA</span>}
                                                    {editNotaId !== n.id && (
                                                        <div className="ml-auto flex items-center gap-1.5">
                                                            {confirmNota === n.id ? (
                                                                <>
                                                                    <button onClick={() => eliminarNota(n.id)} className="text-[9px] font-black uppercase text-red-600 hover:text-red-700">Eliminar</button>
                                                                    <button onClick={() => setConfirmNota(null)} className="text-[9px] font-bold text-slate-400 hover:text-slate-600">Cancelar</button>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <button onClick={() => { setEditNotaId(n.id); setEditNotaTxt(n.texto); }} title="Editar" className="text-slate-400 hover:text-blue-600"><Pencil size={11} /></button>
                                                                    <button onClick={() => setConfirmNota(n.id)} title="Eliminar" className="text-slate-400 hover:text-red-500"><Trash2 size={11} /></button>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                {editNotaId === n.id ? (
                                                    <div className="flex flex-col gap-1.5">
                                                        <textarea rows={2} value={editNotaTxt} onChange={(e) => setEditNotaTxt(e.target.value)} className="bg-slate-50 border border-[#efe8dd] rounded-lg p-2 text-xs text-slate-900 outline-none focus:border-emerald-500 resize-none" />
                                                        <div className="flex gap-2">
                                                            <button onClick={() => setEditNotaId(null)} className="flex-1 text-[10px] font-bold text-slate-500 bg-slate-50 rounded py-1">Cancelar</button>
                                                            <button onClick={() => guardarNotaEdit(n.id)} disabled={!editNotaTxt.trim()} className="flex-1 text-[10px] font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded py-1">Guardar</button>
                                                        </div>
                                                    </div>
                                                ) : <p className="text-xs text-slate-700">{n.texto}</p>}
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Historial de estado */}
                        {(data.historialEstado || []).length > 0 && (
                            <div className="bg-white border border-[#efe8dd] rounded-2xl p-4">
                                <button onClick={() => setShowHist(!showHist)} className="w-full flex items-center justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    <span className="flex items-center gap-2"><History size={14} /> Historial de estado ({data.historialEstado.length})</span>
                                    <ChevronDown size={14} className={showHist ? 'rotate-180' : ''} />
                                </button>
                                {showHist && (
                                    <div className="space-y-1.5 mt-3">
                                        {data.historialEstado.map((h, i) => (
                                            <div key={i} className="text-[10px] border-b border-[#efe8dd] pb-1 last:border-0">
                                                <span className="text-slate-600">{h.anterior || '—'} → <span className="text-blue-700">{h.nuevo}</span></span>
                                                <span className="text-slate-400"> · {h.fecha} · {h.autor}{h.motivo ? ` · ${h.motivo}` : ''}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Datos */}
                        <div className="bg-white border border-[#efe8dd] rounded-2xl p-4">
                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2"><User size={14} /> Información</h3>

                            {/* Qué necesita — siempre visible y editable (se guarda al salir del campo) */}
                            <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                                <span className="text-[9px] font-black text-emerald-700 uppercase tracking-widest flex items-center gap-1 mb-1.5"><Target size={11} /> Qué necesita</span>
                                <textarea key={`nec-${personaId}`} defaultValue={data.necesidad || ''} rows={2}
                                    onBlur={(e) => { const v = e.target.value.trim(); if (v !== (data.necesidad || '')) guardarRapido('necesidad', v); }}
                                    placeholder="Describe qué necesita el prospecto…"
                                    className="w-full bg-white border border-emerald-200 rounded-lg p-2 text-xs text-slate-900 outline-none focus:border-emerald-500 resize-none placeholder:text-slate-400" />
                            </div>

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
                                    <Field label="Próxima acción"><input type="date" className={inputClass} value={form.proximoContacto || ''} onChange={set('proximoContacto')} /></Field>
                                    <Field label="Contacto autorizado">
                                        <button type="button" onClick={() => setForm(prev => ({ ...prev, consentimiento: !(prev.consentimiento !== false) }))}
                                            className={`${inputClass} text-left cursor-pointer flex items-center justify-between ${form.consentimiento !== false ? 'text-emerald-700' : 'text-red-600'}`}>
                                            {form.consentimiento !== false ? 'Sí — se puede contactar' : 'No contactar'}
                                            <span>{form.consentimiento !== false ? '✓' : '⛔'}</span>
                                        </button>
                                    </Field>
                                    <div className="col-span-2"><Field label="Etiquetas (coma)"><input className={inputClass} value={form.etiquetasStr} onChange={set('etiquetasStr')} placeholder="VIP, referido..." /></Field></div>
                                    {catalogos.servicios.length > 0 && (
                                        <div className="col-span-2"><Field label="Servicios de interés">
                                            <div className="flex flex-wrap gap-1.5">
                                                {catalogos.servicios.map(s => (
                                                    <button type="button" key={s.id} onClick={() => toggleServicio(s.id)} className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${serviciosSel.includes(s.id) ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-50 border-[#efe8dd] text-slate-500'}`}>{s.nombre}</button>
                                                ))}
                                            </div>
                                        </Field></div>
                                    )}
                                    <div className="col-span-2"><Field label="Observaciones"><textarea rows={2} className={`${inputClass} resize-none`} value={form.observaciones} onChange={set('observaciones')} /></Field></div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div><span className="text-[9px] text-slate-400 uppercase block">Teléfonos</span><span className="text-slate-700">{(data.telefonos || []).map(t => t.telefono).join(', ') || '—'}</span></div>
                                    <div><span className="text-[9px] text-slate-400 uppercase block">Correos</span><span className="text-slate-700 break-all">{(data.correos || []).map(c => c.correo).join(', ') || '—'}</span></div>
                                    <div><span className="text-[9px] text-slate-400 uppercase block">Dirección</span><span className="text-slate-700">{[data.direccion, data.comuna, data.region].filter(Boolean).join(', ') || '—'}</span></div>
                                    <div><span className="text-[9px] text-slate-400 uppercase block">Rubro</span><span className="text-slate-700">{data.rubro || '—'}</span></div>
                                    <div><span className="text-[9px] text-slate-400 uppercase block">Ejecutivo</span><span className="text-slate-700">{data.ejecutivoNombre || '—'}</span></div>
                                    <div><span className="text-[9px] text-slate-400 uppercase block">Último contacto</span><span className="text-slate-700">{data.fechaUltimoContacto ? new Date(data.fechaUltimoContacto).toLocaleDateString('es-CL') : '—'}</span></div>
                                    <div><span className="text-[9px] text-slate-400 uppercase block">Próxima acción</span><span className="text-slate-700">{data.proximoContacto ? new Date(data.proximoContacto).toLocaleDateString('es-CL') : '—'}</span></div>
                                    <div><span className="text-[9px] text-slate-400 uppercase block">Contacto</span><span className={data.consentimiento !== false ? 'text-emerald-700' : 'text-red-600 font-bold'}>{data.consentimiento !== false ? 'Autorizado' : '⛔ No contactar'}</span></div>
                                    {(data.etiquetas || []).length > 0 && (
                                        <div className="col-span-2"><span className="text-[9px] text-slate-400 uppercase block mb-1">Etiquetas</span>
                                            <div className="flex flex-wrap gap-1">{data.etiquetas.map((e, i) => <span key={i} className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-700 border border-blue-500/30">{e}</span>)}</div>
                                        </div>
                                    )}
                                    {(data.serviciosInteres || []).length > 0 && (
                                        <div className="col-span-2"><span className="text-[9px] text-slate-400 uppercase block mb-1">Servicios de interés</span>
                                            <div className="flex flex-wrap gap-1">{data.serviciosInteres.map(s => <span key={s.id} className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-[#efe8dd]">{s.nombre}</span>)}</div>
                                        </div>
                                    )}
                                    {data.observaciones && <div className="col-span-2"><span className="text-[9px] text-slate-400 uppercase block">Observaciones</span><span className="text-slate-700">{data.observaciones}</span></div>}
                                </div>
                            )}
                            {/* Empresas asociadas — atributo editable dentro de Información */}
                            <div className="mt-4 pt-4 border-t border-[#efe8dd]">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Building2 size={13} /> Empresas asociadas</span>
                                {(data.empresas || []).length > 0 ? (
                                    <div className="space-y-1.5 mb-3">
                                        {data.empresas.map((e, i) => (
                                            <div key={i} className="flex items-center justify-between text-xs gap-2">
                                                <span className="text-slate-700 font-bold truncate">{e.razonSocial}{e.principal ? <span className="text-[9px] text-indigo-500"> · principal</span> : ''}</span>
                                                <button onClick={() => desasociar(e.empresaId)} className="text-slate-400 hover:text-red-500 shrink-0"><Trash2 size={12} /></button>
                                            </div>
                                        ))}
                                    </div>
                                ) : <p className="text-[10px] text-slate-400 italic mb-3">Sin empresas asociadas (persona natural).</p>}
                                {/* Asociar empresa */}
                                <div className="relative">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                                        <input value={empQuery} onChange={(e) => setEmpQuery(e.target.value)} placeholder="Asociar empresa..." className="w-full bg-slate-50 border border-[#efe8dd] rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 outline-none focus:border-indigo-500 placeholder:text-slate-400" />
                                    </div>
                                    {empResults.length > 0 && (
                                        <div className="absolute z-20 w-full mt-1 bg-white border border-[#efe8dd] rounded-lg shadow-2xl max-h-44 overflow-y-auto">
                                            {empResults.map(e => (
                                                <button key={e.id} onClick={() => asociar(e.id)} className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-100 truncate">{e.razonSocial}</button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {/* Crear empresa nueva */}
                                <button onClick={() => setNuevaEmpOpen(!nuevaEmpOpen)} className="mt-2 flex items-center gap-1 text-[10px] font-bold text-indigo-500 hover:text-indigo-600">
                                    <Plus size={12} /> Crear empresa nueva
                                </button>
                                {nuevaEmpOpen && (
                                    <div className="mt-2 space-y-2 bg-slate-50 border border-[#efe8dd] rounded-xl p-3">
                                        <input value={nuevaEmp.razonSocial} onChange={(e) => setNuevaEmp(p => ({ ...p, razonSocial: e.target.value }))} placeholder="Razón social *" className={inputClass} />
                                        <div className="grid grid-cols-2 gap-2">
                                            <input value={nuevaEmp.rut} onChange={(e) => setNuevaEmp(p => ({ ...p, rut: e.target.value }))} placeholder="RUT empresa *" className={inputClass} />
                                            <input value={nuevaEmp.giro} onChange={(e) => setNuevaEmp(p => ({ ...p, giro: e.target.value }))} placeholder="Giro" className={inputClass} />
                                        </div>
                                        <Button onClick={crearEmpresa} disabled={savingEmp} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg h-8 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                                            {savingEmp ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Crear y asociar
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {isEditing && (
                                <div className="flex gap-2 mt-4 pt-4 border-t border-[#efe8dd]">
                                    <Button variant="ghost" onClick={() => { setIsEditing(false); cargar(); }} className="flex-1 bg-slate-50 text-slate-600 rounded-lg text-[10px] font-black uppercase h-9">Cancelar</Button>
                                    <Button onClick={guardar} disabled={saving} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-black uppercase h-9 flex items-center justify-center gap-2">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar</Button>
                                </div>
                            )}
                        </div>

                        {/* Fusionar duplicado */}
                        <div className="bg-white border border-[#efe8dd] rounded-2xl p-4">
                            <button onClick={() => setMergeOpen(!mergeOpen)} className="w-full flex items-center justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                <span className="flex items-center gap-2"><GitMerge size={14} /> Fusionar duplicado</span>
                                <ChevronDown size={14} className={mergeOpen ? 'rotate-180' : ''} />
                            </button>
                            {mergeOpen && (
                                <div className="mt-3">
                                    <p className="text-[10px] text-slate-400 mb-2">Busca el registro duplicado; se absorberá en este cliente y se eliminará.</p>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                                        <input value={mergeQuery} onChange={(e) => setMergeQuery(e.target.value)} placeholder="Buscar cliente a fusionar..." className="w-full bg-slate-50 border border-[#efe8dd] rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 outline-none focus:border-red-500 placeholder:text-slate-400" />
                                    </div>
                                    <div className="space-y-1 mt-2">
                                        {mergeResults.map(p => (
                                            <button key={p.id} onClick={() => fusionar(p.id)} className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-red-500/10 rounded-lg flex justify-between">
                                                <span className="truncate">{p.nombreCompleto || '(sin nombre)'}</span>
                                                <span className="text-[10px] text-slate-400">{p.rut || p.estado}</span>
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
