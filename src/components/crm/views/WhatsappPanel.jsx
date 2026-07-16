import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
    Search, Send, Sparkles, CheckCheck, ChevronDown, MessageCircle, Phone,
    User, Loader2, QrCode, Bot
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    getWhatsappEstadoApi, iniciarWhatsappApi, getConversacionesApi, getMensajesApi,
    enviarMensajeApi, setAutoGlobalApi, setAutoConversacionApi
} from '@/services/whatsappService';

// ===============================================================
// MÓDULO WHATSAPP — Conectado a Baileys vía /api/whatsapp.
// Conexión por QR + respuesta automática con IA (toggle).
// ===============================================================

const getSessionId = () => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').sessionId; }
    catch { return null; }
};

const PLANTILLAS = [
    { id: 't1', nombre: 'Saludo inicial', contenido: 'Hola {nombre}, le saluda VSV Contadores. ¿En qué podemos ayudarle hoy?' },
    { id: 't2', nombre: 'Recordatorio F29', contenido: 'Estimado/a {nombre}, le recordamos que su declaración F29 se encuentra pendiente. Quedamos atentos.' },
    { id: 't3', nombre: 'Cobranza', contenido: 'Estimado/a {nombre}, registramos un pago pendiente de su servicio contable. Agradecemos regularizar a la brevedad.' },
    { id: 't4', nombre: 'Solicitud de documentos', contenido: 'Hola {nombre}, necesitamos los documentos del mes para procesar su contabilidad. ¿Nos los puede enviar?' },
];

const ConversationItem = ({ conv, active, onClick }) => (
    <button
        onClick={onClick}
        className={`w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3 ${active ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-white/[0.02] border-white/5 hover:bg-white/5'}`}
    >
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500/20 to-blue-500/20 border border-white/10 flex items-center justify-center text-emerald-400 shrink-0">
            <User size={18} />
        </div>
        <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-white text-xs truncate">{conv.nombre}</span>
                <span className="text-[9px] text-gray-500 shrink-0">{conv.ultimo?.hora}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-gray-400 truncate">{conv.ultimo?.cuerpo || '...'}</span>
                {conv.noLeidos > 0 && (
                    <span className="bg-emerald-500 text-white text-[9px] font-black rounded-full px-1.5 py-0.5 shrink-0">{conv.noLeidos}</span>
                )}
            </div>
        </div>
    </button>
);

// ---------- Pantalla de conexión (desconectado / conectando / QR) ----------
const PantallaConexion = ({ estado, qr, error, onConectar, conectando }) => (
    <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="max-w-sm w-full bg-[#0f172a]/60 border border-white/10 rounded-2xl p-8 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4">
                <MessageCircle size={26} />
            </div>

            {estado === 'qr' && qr ? (
                <>
                    <h3 className="font-black text-white text-lg mb-1">Escanea el código</h3>
                    <p className="text-xs text-gray-400 mb-4">
                        Abre WhatsApp en tu teléfono → <b>Dispositivos vinculados</b> → <b>Vincular un dispositivo</b>.
                    </p>
                    <div className="bg-white rounded-xl p-3 inline-block">
                        <img src={qr} alt="Código QR de WhatsApp" className="w-56 h-56" />
                    </div>
                    <p className="text-[10px] text-gray-500 mt-4 flex items-center justify-center gap-1">
                        <Loader2 size={12} className="animate-spin" /> Esperando la vinculación…
                    </p>
                </>
            ) : estado === 'conectando' || conectando ? (
                <>
                    <h3 className="font-black text-white text-lg mb-1">Conectando…</h3>
                    <p className="text-xs text-gray-400 mb-4">Generando el código QR, espera un momento.</p>
                    <Loader2 size={28} className="mx-auto animate-spin text-emerald-400" />
                </>
            ) : (
                <>
                    <h3 className="font-black text-white text-lg mb-1">Conecta tu WhatsApp</h3>
                    <p className="text-xs text-gray-400 mb-5">
                        Vincula el número del estudio para atender a tus clientes desde aquí, con respuestas automáticas de IA.
                    </p>
                    {error && <p className="text-[11px] text-red-400 mb-3">{error}</p>}
                    <Button onClick={onConectar} className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-6 py-2.5 h-auto font-black">
                        <QrCode size={16} className="mr-2" /> Conectar WhatsApp
                    </Button>
                </>
            )}
        </div>
    </div>
);

const WhatsappPanel = () => {
    const sessionId = getSessionId();

    const [wa, setWa] = useState({ estado: 'cargando', qr: null, autoIA: true, iaDisponible: false, error: null });
    const [conectando, setConectando] = useState(false);

    const [convs, setConvs] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [detalle, setDetalle] = useState(null); // { id, nombre, telefono, autoIA, mensajes }
    const [search, setSearch] = useState('');
    const [input, setInput] = useState('');
    const [showPlantillas, setShowPlantillas] = useState(false);
    const [enviando, setEnviando] = useState(false);

    const mensajesRef = useRef(null);
    const conectado = wa.estado === 'conectado';

    // ----- Polling: estado de conexión -----
    useEffect(() => {
        if (!sessionId) return;
        let vivo = true;
        const tick = async () => {
            try {
                const r = await getWhatsappEstadoApi(sessionId);
                const data = await r.json();
                if (vivo) setWa(data);
            } catch { /* red intermitente: reintenta en el próximo tick */ }
        };
        tick();
        const id = setInterval(tick, 3000);
        return () => { vivo = false; clearInterval(id); };
    }, [sessionId]);

    // ----- Polling: lista de conversaciones (solo si está conectado) -----
    useEffect(() => {
        if (!sessionId || !conectado) return;
        let vivo = true;
        const tick = async () => {
            try {
                const r = await getConversacionesApi(sessionId);
                const data = await r.json();
                if (vivo && Array.isArray(data)) setConvs(data);
            } catch { /* noop */ }
        };
        tick();
        const id = setInterval(tick, 4000);
        return () => { vivo = false; clearInterval(id); };
    }, [sessionId, conectado]);

    // ----- Polling: mensajes de la conversación seleccionada -----
    useEffect(() => {
        if (!sessionId || !selectedId) { setDetalle(null); return; }
        let vivo = true;
        const tick = async () => {
            try {
                const r = await getMensajesApi(sessionId, selectedId);
                if (!r.ok) return;
                const data = await r.json();
                if (vivo) setDetalle(data);
            } catch { /* noop */ }
        };
        tick();
        const id = setInterval(tick, 3000);
        return () => { vivo = false; clearInterval(id); };
    }, [sessionId, selectedId]);

    // Auto-scroll al último mensaje
    useEffect(() => {
        mensajesRef.current?.scrollTo({ top: mensajesRef.current.scrollHeight });
    }, [detalle?.mensajes?.length, selectedId]);

    const convsFiltradas = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return convs;
        return convs.filter(c => c.nombre?.toLowerCase().includes(q) || c.telefono?.includes(q));
    }, [convs, search]);

    const handleConectar = useCallback(async () => {
        setConectando(true);
        try { await iniciarWhatsappApi(sessionId); }
        catch { /* el polling de estado reflejará el resultado */ }
        finally { setConectando(false); }
    }, [sessionId]);

    const handleSend = async () => {
        const texto = input.trim();
        if (!texto || !selectedId || enviando) return;
        setEnviando(true);
        setInput('');
        try {
            await enviarMensajeApi(sessionId, selectedId, texto);
            const r = await getMensajesApi(sessionId, selectedId);
            if (r.ok) setDetalle(await r.json());
        } catch { setInput(texto); /* devuelve el texto si falló */ }
        finally { setEnviando(false); }
    };

    const aplicarPlantilla = (plantilla) => {
        const texto = plantilla.contenido.replace('{nombre}', detalle?.nombre || '');
        setInput(texto);
        setShowPlantillas(false);
    };

    const toggleAutoGlobal = async () => {
        const nuevo = !wa.autoIA;
        setWa(prev => ({ ...prev, autoIA: nuevo }));
        try { await setAutoGlobalApi(sessionId, nuevo); }
        catch { setWa(prev => ({ ...prev, autoIA: !nuevo })); }
    };

    const toggleAutoConv = async () => {
        if (!detalle) return;
        const nuevo = !detalle.autoIA;
        setDetalle(prev => ({ ...prev, autoIA: nuevo }));
        try { await setAutoConversacionApi(sessionId, selectedId, nuevo); }
        catch { setDetalle(prev => ({ ...prev, autoIA: !nuevo })); }
    };

    // Aún no conectado → pantalla de vinculación
    if (!conectado) {
        return (
            <PantallaConexion
                estado={wa.estado}
                qr={wa.qr}
                error={wa.error}
                conectando={conectando}
                onConectar={handleConectar}
            />
        );
    }

    return (
        <div className="flex-1 min-h-0 flex flex-col gap-3 h-full">
            {/* ===== BARRA SUPERIOR: estado + toggle IA global ===== */}
            <div className="flex items-center justify-between bg-[#0f172a]/60 border border-white/10 rounded-2xl px-4 py-2.5 shrink-0">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-black uppercase tracking-widest">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> WhatsApp conectado
                </div>
                <button
                    onClick={toggleAutoGlobal}
                    disabled={!wa.iaDisponible}
                    title={wa.iaDisponible ? '' : 'Falta configurar GEMINI_API_KEY en el servidor'}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-colors disabled:opacity-40 ${wa.autoIA ? 'bg-purple-600/80 border-purple-500/50 text-white' : 'bg-white/5 border-white/10 text-gray-400'}`}
                >
                    <Bot size={13} /> IA {wa.autoIA ? 'activada' : 'pausada'}
                </button>
            </div>

            <div className="flex-1 min-h-0 flex gap-3 lg:gap-4">
                {/* ===== COLUMNA 1: LISTA DE CONVERSACIONES ===== */}
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
                        {convsFiltradas.map(conv => (
                            <ConversationItem key={conv.id} conv={conv} active={conv.id === selectedId} onClick={() => setSelectedId(conv.id)} />
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
                            {/* Cabecera */}
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
                                    disabled={!wa.iaDisponible}
                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-colors disabled:opacity-40 ${detalle.autoIA ? 'bg-purple-600/70 border-purple-500/40 text-white' : 'bg-white/5 border-white/10 text-gray-400'}`}
                                    title="Respuesta automática de IA en este chat"
                                >
                                    <Bot size={12} /> {detalle.autoIA ? 'IA on' : 'IA off'}
                                </button>
                            </div>

                            {/* Mensajes */}
                            <div ref={mensajesRef} className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-white/10">
                                {detalle.mensajes.map(m => (
                                    <div key={m.id} className={`flex ${m.direccion === 'out' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-xs ${m.direccion === 'out' ? 'bg-emerald-600/80 text-white rounded-br-sm' : 'bg-white/10 text-gray-100 rounded-bl-sm'}`}>
                                            <p className="leading-relaxed whitespace-pre-wrap">{m.cuerpo}</p>
                                            <div className={`flex items-center gap-1 justify-end mt-1 text-[9px] ${m.direccion === 'out' ? 'text-emerald-100/70' : 'text-gray-500'}`}>
                                                {m.esIA && <Sparkles size={10} className="text-purple-200" />}
                                                {m.hora}
                                                {m.direccion === 'out' && <CheckCheck size={11} className={m.estado === 'leido' ? 'text-sky-300' : ''} />}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Barra de envío + plantillas */}
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
                                {detalle.autoIA && wa.autoIA && wa.iaDisponible && (
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
        </div>
    );
};

export default WhatsappPanel;
