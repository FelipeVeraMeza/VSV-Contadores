import React, { useState, useMemo } from 'react';
import {
    Search, Send, Sparkles, Plus, StickyNote, Clock, Mail,
    ChevronDown, CornerUpLeft, Paperclip
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ===============================================================
// MÓDULO CORREO ELECTRÓNICO — Fase 0 (esqueleto con datos mock).
// La generación de notas por IA muestra "En espera de IA".
// No usa backend ni BD todavía: todo es estado local de ejemplo.
// ===============================================================

const ahora = () => new Date().toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const PLANTILLAS = [
    { id: 't1', nombre: 'Bienvenida', asunto: 'Bienvenido/a a VSV Contadores', cuerpo: 'Estimado/a {nombre},\n\nLe damos la bienvenida a VSV Contadores. Quedamos a su disposición para cualquier consulta.\n\nSaludos cordiales,\nEquipo VSV Contadores' },
    { id: 't2', nombre: 'Recordatorio F29', asunto: 'Recordatorio: Declaración F29 pendiente', cuerpo: 'Estimado/a {nombre},\n\nLe recordamos que su declaración F29 se encuentra pendiente. Agradecemos su pronta respuesta.\n\nSaludos,\nVSV Contadores' },
    { id: 't3', nombre: 'Envío de informe', asunto: 'Informe contable del mes', cuerpo: 'Estimado/a {nombre},\n\nAdjuntamos el informe contable correspondiente al mes. Cualquier duda quedamos atentos.\n\nSaludos,\nVSV Contadores' },
    { id: 't4', nombre: 'Estado de cuenta', asunto: 'Estado de cuenta — Servicio contable', cuerpo: 'Estimado/a {nombre},\n\nLe enviamos el estado de cuenta de su servicio contable. Agradecemos regularizar los pagos pendientes.\n\nSaludos,\nVSV Contadores' },
];

const HILOS_MOCK = [
    {
        id: 'e1', nombre: 'ACME SpA', email: 'contacto@acme.cl', asunto: 'Documentos del mes de mayo', noLeidos: 1,
        mensajes: [
            { id: 1, direccion: 'in', cuerpo: 'Buenas tardes, les envío los documentos del mes de mayo para la contabilidad.', fecha: '08 jun, 10:24' },
            { id: 2, direccion: 'out', cuerpo: 'Estimados, recibidos. Procesaremos y les confirmamos esta semana.\n\nSaludos,\nVSV Contadores', fecha: '08 jun, 11:02' },
            { id: 3, direccion: 'in', cuerpo: 'Perfecto, muchas gracias. Quedo atento.', fecha: '08 jun, 11:30' },
        ],
    },
    {
        id: 'e2', nombre: 'Juan Pérez', email: 'jperez@gmail.com', asunto: 'Consulta declaración de renta', noLeidos: 0,
        mensajes: [
            { id: 1, direccion: 'in', cuerpo: 'Hola, tengo una duda sobre mi declaración de renta de este año.', fecha: '06 jun, 16:10' },
            { id: 2, direccion: 'out', cuerpo: 'Estimado Juan, con gusto le ayudamos. ¿Podría detallar su consulta?', fecha: '06 jun, 16:45' },
        ],
    },
    {
        id: 'e3', nombre: 'Constructora del Sur Ltda.', email: 'gerencia@construsur.cl', asunto: 'Solicitud de reunión', noLeidos: 2,
        mensajes: [
            { id: 1, direccion: 'in', cuerpo: 'Estimados, quisiéramos agendar una reunión para revisar el cierre del trimestre.', fecha: '05 jun, 09:00' },
        ],
    },
];

const ThreadItem = ({ hilo, active, onClick }) => {
    const ultimo = hilo.mensajes[hilo.mensajes.length - 1];
    return (
        <button
            onClick={onClick}
            className={`w-full text-left p-3 rounded-xl border transition-all ${active ? 'bg-blue-500/10 border-blue-500/40' : 'bg-white/[0.02] border-white/5 hover:bg-white/5'}`}
        >
            <div className="flex items-center justify-between gap-2">
                <span className={`text-xs truncate ${hilo.noLeidos > 0 ? 'font-black text-white' : 'font-bold text-gray-300'}`}>{hilo.nombre}</span>
                <span className="text-[9px] text-gray-500 shrink-0">{ultimo?.fecha?.split(',')[0]}</span>
            </div>
            <p className="text-[11px] text-gray-300 truncate mt-0.5">{hilo.asunto}</p>
            <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-gray-500 truncate">{ultimo?.cuerpo}</span>
                {hilo.noLeidos > 0 && <span className="bg-blue-500 text-white text-[9px] font-black rounded-full px-1.5 py-0.5 shrink-0">{hilo.noLeidos}</span>}
            </div>
        </button>
    );
};

const EmailPanel = () => {
    const [hilos, setHilos] = useState(HILOS_MOCK);
    const [selectedId, setSelectedId] = useState(HILOS_MOCK[0].id);
    const [search, setSearch] = useState('');
    const [cuerpo, setCuerpo] = useState('');
    const [showPlantillas, setShowPlantillas] = useState(false);

    const [iaEstado, setIaEstado] = useState(null);
    const [notas, setNotas] = useState([]);
    const [nuevaNota, setNuevaNota] = useState('');

    const selected = hilos.find(h => h.id === selectedId);

    const hilosFiltrados = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return hilos;
        return hilos.filter(h => h.nombre.toLowerCase().includes(q) || h.email.includes(q) || h.asunto.toLowerCase().includes(q));
    }, [hilos, search]);

    const handleSelect = (id) => {
        setSelectedId(id);
        setHilos(prev => prev.map(h => h.id === id ? { ...h, noLeidos: 0 } : h));
        setIaEstado(null);
    };

    const handleSend = () => {
        if (!cuerpo.trim() || !selected) return;
        const nuevo = { id: Date.now(), direccion: 'out', cuerpo: cuerpo.trim(), fecha: ahora() };
        setHilos(prev => prev.map(h => h.id === selectedId ? { ...h, mensajes: [...h.mensajes, nuevo] } : h));
        setCuerpo('');
    };

    const aplicarPlantilla = (p) => {
        setCuerpo(p.cuerpo.replace('{nombre}', selected?.nombre || ''));
        setShowPlantillas(false);
    };

    const agregarNota = () => {
        if (!nuevaNota.trim()) return;
        setNotas(prev => [{ id: Date.now(), texto: nuevaNota.trim(), hora: ahora() }, ...prev]);
        setNuevaNota('');
    };

    return (
        <div className="flex-1 min-h-0 flex gap-4 h-full">
            {/* ===== COLUMNA 1: HILOS ===== */}
            <div className="w-72 shrink-0 flex flex-col gap-3 bg-[#0f172a]/60 border border-white/10 rounded-2xl p-3">
                <div className="flex items-center gap-2 text-blue-400 font-black text-xs uppercase tracking-widest px-1">
                    <Mail size={16} /> Correo
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar correo..."
                        className="w-full bg-black/30 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white outline-none focus:border-blue-500 placeholder:text-gray-600"
                    />
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-white/10">
                    {hilosFiltrados.map(h => (
                        <ThreadItem key={h.id} hilo={h} active={h.id === selectedId} onClick={() => handleSelect(h.id)} />
                    ))}
                    {hilosFiltrados.length === 0 && <p className="text-[10px] text-gray-500 italic text-center py-4">Sin correos.</p>}
                </div>
            </div>

            {/* ===== COLUMNA 2: HILO DE CORREO ===== */}
            <div className="flex-1 min-w-0 flex flex-col bg-[#0f172a]/60 border border-white/10 rounded-2xl overflow-hidden">
                {selected ? (
                    <>
                        <div className="p-4 border-b border-white/10 bg-gradient-to-r from-blue-900/20 to-transparent shrink-0">
                            <h3 className="font-black text-white text-sm truncate">{selected.asunto}</h3>
                            <span className="text-[10px] text-gray-400">{selected.nombre} · {selected.email}</span>
                        </div>

                        {/* Cadena de correos */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-white/10">
                            {selected.mensajes.map(m => (
                                <div key={m.id} className={`rounded-2xl border p-3 ${m.direccion === 'out' ? 'bg-blue-600/10 border-blue-500/20 ml-6' : 'bg-white/[0.03] border-white/10 mr-6'}`}>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className={`text-[10px] font-black uppercase tracking-widest ${m.direccion === 'out' ? 'text-blue-400' : 'text-gray-400'}`}>
                                            {m.direccion === 'out' ? 'VSV Contadores' : selected.nombre}
                                        </span>
                                        <span className="text-[9px] text-gray-500">{m.fecha}</span>
                                    </div>
                                    <p className="text-xs text-gray-200 leading-relaxed whitespace-pre-line">{m.cuerpo}</p>
                                </div>
                            ))}
                        </div>

                        {/* Responder */}
                        <div className="p-3 border-t border-white/10 shrink-0 relative">
                            {showPlantillas && (
                                <div className="absolute bottom-full left-3 mb-2 w-96 bg-[#0f172a] border border-white/10 rounded-xl shadow-2xl p-2 z-20 max-h-72 overflow-y-auto">
                                    <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest px-2 py-1">Plantillas</p>
                                    {PLANTILLAS.map(p => (
                                        <button key={p.id} onClick={() => aplicarPlantilla(p)} className="w-full text-left px-2 py-2 rounded-lg hover:bg-white/5 transition-colors">
                                            <span className="block text-xs font-bold text-blue-400">{p.nombre}</span>
                                            <span className="block text-[10px] text-gray-500 truncate">{p.asunto}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="flex items-center gap-2 mb-2">
                                <CornerUpLeft size={14} className="text-gray-500" />
                                <span className="text-[10px] text-gray-400">Respondiendo a <span className="text-gray-200 font-bold">{selected.email}</span></span>
                                <button
                                    onClick={() => setShowPlantillas(!showPlantillas)}
                                    className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-gray-300 hover:text-white"
                                >
                                    Plantilla <ChevronDown size={12} />
                                </button>
                            </div>
                            <textarea
                                value={cuerpo}
                                onChange={(e) => setCuerpo(e.target.value)}
                                placeholder="Escribe tu respuesta..."
                                rows={3}
                                className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-blue-500 placeholder:text-gray-600 resize-none"
                            />
                            <div className="flex items-center justify-between mt-2">
                                <button className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300"><Paperclip size={13} /> Adjuntar</button>
                                <Button onClick={handleSend} disabled={!cuerpo.trim()} className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl px-4 h-auto py-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                                    <Send size={14} /> Enviar
                                </Button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Selecciona un correo</div>
                )}
            </div>

            {/* ===== COLUMNA 3: IA / NOTAS ===== */}
            <div className="w-80 shrink-0 flex flex-col gap-4 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10">
                <div className="bg-purple-500/5 border border-purple-500/20 rounded-2xl p-4">
                    <h3 className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Sparkles size={14} /> Asistente IA
                    </h3>
                    <button
                        onClick={() => setIaEstado('espera')}
                        className="w-full flex items-center justify-center gap-2 bg-purple-600/80 hover:bg-purple-600 text-white rounded-xl py-2.5 text-[10px] font-black uppercase tracking-widest transition-colors"
                    >
                        <Sparkles size={14} /> Generar nota con IA
                    </button>
                    {iaEstado === 'espera' && (
                        <div className="mt-3 bg-black/30 border border-purple-500/20 rounded-xl p-3 text-center">
                            <p className="text-2xl mb-1">🤖</p>
                            <p className="text-xs font-black text-purple-300 uppercase tracking-widest">En espera de IA</p>
                            <p className="text-[10px] text-gray-500 mt-1">Esta función se activará al conectar el proveedor de IA. Generará notas a partir de las conversaciones por correo.</p>
                        </div>
                    )}
                    {iaEstado === null && (
                        <p className="text-[10px] text-gray-500 mt-2 text-center">La IA resumirá la conversación del correo en una nota automáticamente.</p>
                    )}
                </div>

                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <StickyNote size={14} /> Notas
                    </h3>
                    <div className="flex gap-2 mb-3">
                        <input
                            value={nuevaNota}
                            onChange={(e) => setNuevaNota(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && agregarNota()}
                            placeholder="Nueva nota..."
                            className="flex-1 bg-black/30 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 placeholder:text-gray-600"
                        />
                        <Button onClick={agregarNota} disabled={!nuevaNota.trim()} className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-3 h-auto"><Plus size={14} /></Button>
                    </div>
                    <div className="space-y-2">
                        {notas.map(n => (
                            <div key={n.id} className="p-2 rounded-lg bg-black/20 border border-white/5">
                                <div className="flex items-center gap-1 text-gray-500 mb-1"><Clock size={9} /><span className="text-[9px] font-black tracking-widest">{n.hora}</span></div>
                                <p className="text-xs text-gray-200">{n.texto}</p>
                            </div>
                        ))}
                        {notas.length === 0 && <p className="text-[10px] text-gray-500 italic">Sin notas.</p>}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EmailPanel;
