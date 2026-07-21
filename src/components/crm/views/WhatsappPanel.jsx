import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
    Search, Send, Sparkles, CheckCheck, ChevronDown, MessageCircle, Phone,
    User, Loader2, QrCode, Bot, Plus, Building2, X, Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    getSesionesApi, crearSesionApi, iniciarSesionApi, eliminarSesionApi, setAutoSesionApi,
    getConversacionesApi, getMensajesApi, enviarMensajeApi, setAutoConversacionApi
} from '@/services/whatsappService';

// ===============================================================
// MÓDULO WHATSAPP — multi-sesión, persistido en Postgres.
// Administrador: ve todas las sesiones de su organización.
// Cliente:       ve solo la de su empresa.
// ===============================================================

const getUser = () => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); }
    catch { return {}; }
};

const PLANTILLAS = [
    { id: 't1', nombre: 'Saludo inicial', contenido: 'Hola {nombre}, le saluda VSV Contadores. ¿En qué podemos ayudarle hoy?' },
    { id: 't2', nombre: 'Recordatorio F29', contenido: 'Estimado/a {nombre}, le recordamos que su declaración F29 se encuentra pendiente. Quedamos atentos.' },
    { id: 't3', nombre: 'Cobranza', contenido: 'Estimado/a {nombre}, registramos un pago pendiente de su servicio contable. Agradecemos regularizar a la brevedad.' },
    { id: 't4', nombre: 'Solicitud de documentos', contenido: 'Hola {nombre}, necesitamos los documentos del mes para procesar su contabilidad. ¿Nos los puede enviar?' },
];

const hora = (ts) => ts
    ? new Date(ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
    : '';

const DOT = {
    conectado: 'bg-emerald-400',
    qr: 'bg-amber-400',
    conectando: 'bg-amber-400',
    desconectado: 'bg-gray-500',
};

// ---------- Pestañas de sesiones (multi-WhatsApp) ----------
const SesionTabs = ({ sesiones, activaId, onSelect, onNueva, esAdmin }) => (
    <div className="flex items-center gap-2 overflow-x-auto pr-1">
        {sesiones.map(s => (
            <button
                key={s.id}
                onClick={() => onSelect(s.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold whitespace-nowrap transition-all ${s.id === activaId ? 'bg-emerald-500/10 border-emerald-500/40 text-white' : 'bg-white/[0.02] border-white/5 text-gray-400 hover:text-white'}`}
            >
                <span className={`w-2 h-2 rounded-full ${DOT[s.estado] || DOT.desconectado} ${s.estado === 'conectado' ? 'animate-pulse' : ''}`} />
                {s.nombre}
                {s.empresaNombre && <span className="text-[9px] text-gray-500 hidden xl:inline">({s.empresaNombre})</span>}
            </button>
        ))}
        {esAdmin && (
            <button
                onClick={onNueva}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 border-dashed text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-white shrink-0"
            >
                <Plus size={12} /> Número
            </button>
        )}
    </div>
);

// ---------- Modal: nueva sesión ----------
const NuevaSesionModal = ({ onClose, onCrear }) => {
    const [nombre, setNombre] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState(null);

    const guardar = async () => {
        if (!nombre.trim()) return;
        setGuardando(true); setError(null);
        try { await onCrear(nombre.trim()); }
        catch (e) { setError(e.message); }
        finally { setGuardando(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#0f172a] border border-white/10 rounded-2xl p-6 w-full max-w-sm">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-black text-white text-sm uppercase tracking-widest">Nuevo número</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
                </div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Nombre</label>
                <input
                    autoFocus
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && guardar()}
                    placeholder="Ej: Ventas, Cobranza, Soporte…"
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-emerald-500 placeholder:text-gray-600"
                />
                <p className="text-[10px] text-gray-500 mt-2">Después podrás vincular el teléfono escaneando su QR.</p>
                {error && <p className="text-[11px] text-red-400 mt-2">{error}</p>}
                <div className="flex gap-2 mt-5">
                    <Button onClick={onClose} className="flex-1 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl">Cancelar</Button>
                    <Button onClick={guardar} disabled={!nombre.trim() || guardando} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl">
                        {guardando ? <Loader2 size={14} className="animate-spin" /> : 'Crear'}
                    </Button>
                </div>
            </div>
        </div>
    );
};

// ---------- Pantalla de conexión / QR ----------
const PantallaConexion = ({ sesion, onConectar, conectando }) => (
    <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="max-w-sm w-full bg-[#0f172a]/60 border border-white/10 rounded-2xl p-8 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4">
                <MessageCircle size={26} />
            </div>

            {sesion.estado === 'qr' && sesion.qr ? (
                <>
                    <h3 className="font-black text-white text-lg mb-1">Escanea el código</h3>
                    <p className="text-xs text-gray-400 mb-4">
                        En el teléfono de <b>{sesion.nombre}</b>: WhatsApp → <b>Dispositivos vinculados</b> → <b>Vincular un dispositivo</b>.
                    </p>
                    <div className="bg-white rounded-xl p-3 inline-block">
                        <img src={sesion.qr} alt="Código QR de WhatsApp" className="w-56 h-56" />
                    </div>
                    <p className="text-[10px] text-gray-500 mt-4 flex items-center justify-center gap-1">
                        <Loader2 size={12} className="animate-spin" /> Esperando la vinculación…
                    </p>
                </>
            ) : sesion.estado === 'conectando' || conectando ? (
                <>
                    <h3 className="font-black text-white text-lg mb-1">Conectando…</h3>
                    <p className="text-xs text-gray-400 mb-4">Generando el código QR, espera un momento.</p>
                    <Loader2 size={28} className="mx-auto animate-spin text-emerald-400" />
                </>
            ) : (
                <>
                    <h3 className="font-black text-white text-lg mb-1">Conecta “{sesion.nombre}”</h3>
                    <p className="text-xs text-gray-400 mb-5">
                        Vincula este número para atender desde aquí, con respuestas automáticas de IA.
                    </p>
                    {sesion.error && <p className="text-[11px] text-red-400 mb-3">{sesion.error}</p>}
                    <Button onClick={onConectar} className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-6 py-2.5 h-auto font-black">
                        <QrCode size={16} className="mr-2" /> Conectar WhatsApp
                    </Button>
                </>
            )}
        </div>
    </div>
);

const WhatsappPanel = () => {
    const user = useMemo(getUser, []);
    const authSid = user.sessionId; // sesión de login (no confundir con sesionId = número de WhatsApp)
    const esAdmin = user.rol === 'Administrador';

    const [sesiones, setSesiones] = useState([]);
    const [sesionId, setSesionId] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [conectando, setConectando] = useState(false);
    const [showNueva, setShowNueva] = useState(false);

    const [convs, setConvs] = useState([]);
    const [convId, setConvId] = useState(null);
    const [detalle, setDetalle] = useState(null);
    const [search, setSearch] = useState('');
    const [input, setInput] = useState('');
    const [showPlantillas, setShowPlantillas] = useState(false);
    const [enviando, setEnviando] = useState(false);

    const mensajesRef = useRef(null);
    const sesion = sesiones.find(s => s.id === sesionId) || null;
    const conectado = sesion?.estado === 'conectado';

    // ----- Polling: sesiones (trae estado + QR de cada número) -----
    useEffect(() => {
        if (!authSid) return;
        let vivo = true;
        const tick = async () => {
            try {
                const r = await getSesionesApi(authSid);
                if (!r.ok) return;
                const data = await r.json();
                if (!vivo || !Array.isArray(data)) return;
                setSesiones(data);
                // Selecciona la primera automáticamente
                setSesionId(prev => prev && data.some(s => s.id === prev) ? prev : (data[0]?.id ?? null));
            } catch { /* red intermitente */ }
            finally { if (vivo) setCargando(false); }
        };
        tick();
        const id = setInterval(tick, 3000);
        return () => { vivo = false; clearInterval(id); };
    }, [authSid]);

    // ----- Polling: conversaciones de la sesión activa -----
    useEffect(() => {
        if (!authSid || !sesionId || !conectado) { setConvs([]); return; }
        let vivo = true;
        const tick = async () => {
            try {
                const r = await getConversacionesApi(authSid, sesionId);
                if (!r.ok) return;
                const data = await r.json();
                if (vivo && Array.isArray(data)) setConvs(data);
            } catch { /* noop */ }
        };
        tick();
        const id = setInterval(tick, 4000);
        return () => { vivo = false; clearInterval(id); };
    }, [authSid, sesionId, conectado]);

    // Al cambiar de número, limpia el chat abierto
    useEffect(() => { setConvId(null); setDetalle(null); }, [sesionId]);

    // ----- Polling: mensajes de la conversación abierta -----
    useEffect(() => {
        if (!authSid || !convId) { setDetalle(null); return; }
        let vivo = true;
        const tick = async () => {
            try {
                const r = await getMensajesApi(authSid, convId);
                if (!r.ok) return;
                const data = await r.json();
                if (vivo) setDetalle(data);
            } catch { /* noop */ }
        };
        tick();
        const id = setInterval(tick, 3000);
        return () => { vivo = false; clearInterval(id); };
    }, [authSid, convId]);

    useEffect(() => {
        mensajesRef.current?.scrollTo({ top: mensajesRef.current.scrollHeight });
    }, [detalle?.mensajes?.length, convId]);

    const convsFiltradas = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return convs;
        return convs.filter(c => c.nombre?.toLowerCase().includes(q) || c.telefono?.includes(q));
    }, [convs, search]);

    const handleConectar = useCallback(async () => {
        setConectando(true);
        try { await iniciarSesionApi(authSid, sesionId); }
        catch { /* el polling refleja el resultado */ }
        finally { setConectando(false); }
    }, [authSid, sesionId]);

    const handleCrearSesion = async (nombre) => {
        const r = await crearSesionApi(authSid, { nombre });
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            throw new Error(err.message || 'No se pudo crear el número.');
        }
        const nueva = await r.json();
        setShowNueva(false);
        setSesiones(prev => [...prev, { ...nueva, estado: 'desconectado' }]);
        setSesionId(nueva.id);
    };

    const handleEliminarSesion = async () => {
        if (!sesion) return;
        if (!window.confirm(`¿Eliminar el número "${sesion.nombre}"? Se desvinculará el teléfono. El historial de conversaciones se conserva.`)) return;
        await eliminarSesionApi(authSid, sesion.id);
        setSesiones(prev => prev.filter(s => s.id !== sesion.id));
        setSesionId(prev => (prev === sesion.id ? null : prev));
    };

    const handleSend = async () => {
        const texto = input.trim();
        if (!texto || !convId || enviando) return;
        setEnviando(true);
        setInput('');
        try {
            await enviarMensajeApi(authSid, convId, texto);
            const r = await getMensajesApi(authSid, convId);
            if (r.ok) setDetalle(await r.json());
        } catch { setInput(texto); }
        finally { setEnviando(false); }
    };

    const aplicarPlantilla = (p) => {
        setInput(p.contenido.replace('{nombre}', detalle?.nombre || ''));
        setShowPlantillas(false);
    };

    const toggleAutoSesion = async () => {
        if (!sesion) return;
        const nuevo = !sesion.autoIa;
        setSesiones(prev => prev.map(s => s.id === sesion.id ? { ...s, autoIa: nuevo } : s));
        try { await setAutoSesionApi(authSid, sesion.id, nuevo); }
        catch { setSesiones(prev => prev.map(s => s.id === sesion.id ? { ...s, autoIa: !nuevo } : s)); }
    };

    const toggleAutoConv = async () => {
        if (!detalle) return;
        const nuevo = !detalle.autoIa;
        setDetalle(prev => ({ ...prev, autoIa: nuevo }));
        try { await setAutoConversacionApi(authSid, convId, nuevo); }
        catch { setDetalle(prev => ({ ...prev, autoIa: !nuevo })); }
    };

    // ----- Estados vacíos -----
    if (cargando) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <Loader2 size={28} className="animate-spin text-emerald-400" />
            </div>
        );
    }

    if (!sesiones.length) {
        return (
            <>
                <div className="flex-1 flex items-center justify-center">
                    <div className="max-w-sm w-full bg-[#0f172a]/60 border border-white/10 rounded-2xl p-8 text-center">
                        <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4">
                            <MessageCircle size={26} />
                        </div>
                        <h3 className="font-black text-white text-lg mb-1">Sin números de WhatsApp</h3>
                        <p className="text-xs text-gray-400 mb-5">
                            {esAdmin
                                ? 'Crea un número para empezar a atender clientes desde el CRM.'
                                : 'Todavía no hay un WhatsApp asignado a tu empresa. Contacta a tu contador.'}
                        </p>
                        {esAdmin && (
                            <Button onClick={() => setShowNueva(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-6 py-2.5 h-auto font-black">
                                <Plus size={16} className="mr-2" /> Crear número
                            </Button>
                        )}
                    </div>
                </div>
                {showNueva && <NuevaSesionModal onClose={() => setShowNueva(false)} onCrear={handleCrearSesion} />}
            </>
        );
    }

    return (
        <div className="flex-1 min-h-0 flex flex-col gap-3 h-full">
            {/* ===== BARRA SUPERIOR: sesiones + IA ===== */}
            <div className="flex items-center justify-between gap-3 bg-[#0f172a]/60 border border-white/10 rounded-2xl px-3 py-2.5 shrink-0">
                <SesionTabs
                    sesiones={sesiones}
                    activaId={sesionId}
                    onSelect={setSesionId}
                    onNueva={() => setShowNueva(true)}
                    esAdmin={esAdmin}
                />
                <div className="flex items-center gap-2 shrink-0">
                    {sesion && (
                        <button
                            onClick={toggleAutoSesion}
                            disabled={!sesion.iaDisponible}
                            title={sesion.iaDisponible ? '' : 'Falta configurar GEMINI_API_KEY en el servidor'}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-colors disabled:opacity-40 ${sesion.autoIa ? 'bg-purple-600/80 border-purple-500/50 text-white' : 'bg-white/5 border-white/10 text-gray-400'}`}
                        >
                            <Bot size={13} /> IA {sesion.autoIa ? 'activada' : 'pausada'}
                        </button>
                    )}
                    {esAdmin && sesion && (
                        <button onClick={handleEliminarSesion} title="Eliminar número" className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10">
                            <Trash2 size={14} />
                        </button>
                    )}
                </div>
            </div>

            {!sesion ? (
                <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Selecciona un número</div>
            ) : !conectado ? (
                <PantallaConexion sesion={sesion} onConectar={handleConectar} conectando={conectando} />
            ) : (
                <div className="flex-1 min-h-0 flex gap-3 lg:gap-4">
                    {/* ===== COLUMNA 1: CONVERSACIONES ===== */}
                    <div className="w-52 lg:w-64 xl:w-72 shrink-0 flex flex-col gap-3 bg-[#0f172a]/60 border border-white/10 rounded-2xl p-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Buscar conversación..."
                                className="w-full bg-black/30 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white outline-none focus:border-emerald-500 placeholder:text-gray-600"
                            />
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-white/10">
                            {convsFiltradas.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => setConvId(c.id)}
                                    className={`w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3 ${c.id === convId ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-white/[0.02] border-white/5 hover:bg-white/5'}`}
                                >
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500/20 to-blue-500/20 border border-white/10 flex items-center justify-center text-emerald-400 shrink-0">
                                        <User size={18} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-bold text-white text-xs truncate">{c.nombre}</span>
                                            <span className="text-[9px] text-gray-500 shrink-0">{hora(c.ultimoMensajeAt)}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[10px] text-gray-400 truncate">{c.ultimoMensaje || '...'}</span>
                                            {c.noLeidos > 0 && (
                                                <span className="bg-emerald-500 text-white text-[9px] font-black rounded-full px-1.5 py-0.5 shrink-0">{c.noLeidos}</span>
                                            )}
                                        </div>
                                        {c.empresaNombre && (
                                            <span className="text-[9px] text-blue-400/70 flex items-center gap-1 mt-0.5 truncate">
                                                <Building2 size={9} /> {c.empresaNombre}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            ))}
                            {convsFiltradas.length === 0 && (
                                <p className="text-[10px] text-gray-500 italic text-center py-4">
                                    {convs.length === 0 ? 'Aún no hay conversaciones. Cuando alguien escriba, aparecerá aquí.' : 'Sin resultados.'}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* ===== COLUMNA 2: CHAT ===== */}
                    <div className="flex-1 min-w-0 flex flex-col bg-[#0f172a]/60 border border-white/10 rounded-2xl overflow-hidden">
                        {detalle ? (
                            <>
                                <div className="p-4 border-b border-white/10 flex items-center gap-3 bg-gradient-to-r from-emerald-900/20 to-transparent shrink-0">
                                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-white/10 flex items-center justify-center text-emerald-400">
                                        <User size={18} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h3 className="font-black text-white text-sm truncate">{detalle.nombre}</h3>
                                        <span className="text-[10px] text-gray-400 flex items-center gap-1"><Phone size={10} /> {detalle.telefono}</span>
                                    </div>
                                    <button
                                        onClick={toggleAutoConv}
                                        disabled={!sesion.iaDisponible}
                                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-colors disabled:opacity-40 ${detalle.autoIa ? 'bg-purple-600/70 border-purple-500/40 text-white' : 'bg-white/5 border-white/10 text-gray-400'}`}
                                        title="Respuesta automática de IA en este chat"
                                    >
                                        <Bot size={12} /> {detalle.autoIa ? 'IA on' : 'IA off'}
                                    </button>
                                </div>

                                <div ref={mensajesRef} className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-white/10">
                                    {detalle.mensajes.map(m => (
                                        <div key={m.id} className={`flex ${m.direccion === 'out' ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-xs ${m.direccion === 'out' ? 'bg-emerald-600/80 text-white rounded-br-sm' : 'bg-white/10 text-gray-100 rounded-bl-sm'}`}>
                                                <p className="leading-relaxed whitespace-pre-wrap">{m.cuerpo}</p>
                                                <div className={`flex items-center gap-1 justify-end mt-1 text-[9px] ${m.direccion === 'out' ? 'text-emerald-100/70' : 'text-gray-500'}`}>
                                                    {m.esIa && <Sparkles size={10} className="text-purple-200" />}
                                                    {hora(m.timestamp)}
                                                    {m.direccion === 'out' && <CheckCheck size={11} className={m.estado === 'leido' ? 'text-sky-300' : ''} />}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="p-3 border-t border-white/10 shrink-0 relative">
                                    {showPlantillas && (
                                        <div className="absolute bottom-full left-3 mb-2 w-80 bg-[#0f172a] border border-white/10 rounded-xl shadow-2xl p-2 z-20">
                                            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest px-2 py-1">Plantillas</p>
                                            {PLANTILLAS.map(p => (
                                                <button key={p.id} onClick={() => aplicarPlantilla(p)} className="w-full text-left px-2 py-2 rounded-lg hover:bg-white/5 transition-colors">
                                                    <span className="block text-xs font-bold text-emerald-400">{p.nombre}</span>
                                                    <span className="block text-[10px] text-gray-500 truncate">{p.contenido}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setShowPlantillas(!showPlantillas)}
                                            className="flex items-center gap-1 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-gray-300 hover:text-white shrink-0"
                                        >
                                            Plantilla <ChevronDown size={12} />
                                        </button>
                                        <input
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                            placeholder="Escribe un mensaje..."
                                            className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-emerald-500 placeholder:text-gray-600"
                                        />
                                        <Button onClick={handleSend} disabled={!input.trim() || enviando} className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-4 h-auto py-2.5">
                                            {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                        </Button>
                                    </div>
                                    {detalle.autoIa && sesion.autoIa && sesion.iaDisponible && (
                                        <p className="text-[9px] text-purple-300/70 mt-2 flex items-center gap-1">
                                            <Bot size={10} /> La IA está respondiendo automáticamente en este chat. Desactívala arriba para tomar el control.
                                        </p>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Selecciona una conversación</div>
                        )}
                    </div>
                </div>
            )}

            {showNueva && <NuevaSesionModal onClose={() => setShowNueva(false)} onCrear={handleCrearSesion} />}
        </div>
    );
};

export default WhatsappPanel;
