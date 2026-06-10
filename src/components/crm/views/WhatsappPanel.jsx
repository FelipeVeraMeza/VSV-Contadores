import React, { useState, useMemo } from 'react';
import {
    Search, Send, Sparkles, CheckCheck, Plus, ListTodo, StickyNote,
    Ticket, Clock, User, ChevronDown, MessageCircle, Phone
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ===============================================================
// MÓDULO WHATSAPP — Fase 0 (esqueleto con datos mock).
// La sección de IA muestra "En espera de IA" hasta conectar el proveedor.
// No usa backend ni BD todavía: todo es estado local de ejemplo.
// ===============================================================

const ahora = () => new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

const PLANTILLAS = [
    { id: 't1', nombre: 'Saludo inicial', contenido: 'Hola {nombre}, le saluda VSV Contadores. ¿En qué podemos ayudarle hoy?' },
    { id: 't2', nombre: 'Recordatorio F29', contenido: 'Estimado/a {nombre}, le recordamos que su declaración F29 se encuentra pendiente. Quedamos atentos.' },
    { id: 't3', nombre: 'Cobranza', contenido: 'Estimado/a {nombre}, registramos un pago pendiente de su servicio contable. Agradecemos regularizar a la brevedad.' },
    { id: 't4', nombre: 'Solicitud de documentos', contenido: 'Hola {nombre}, necesitamos los documentos del mes para procesar su contabilidad. ¿Nos los puede enviar?' },
];

const CONVERSACIONES_MOCK = [
    {
        id: 'c1', nombre: 'ACME SpA', telefono: '+56 9 1234 5678', noLeidos: 2,
        mensajes: [
            { id: 1, direccion: 'in', cuerpo: 'Hola, necesito el F29 de este mes', hora: '09:12' },
            { id: 2, direccion: 'out', cuerpo: 'Claro, lo estoy revisando ahora mismo.', hora: '09:15', estado: 'leido' },
            { id: 3, direccion: 'in', cuerpo: '¿Para cuándo estaría listo?', hora: '09:16' },
        ],
    },
    {
        id: 'c2', nombre: 'Juan Pérez', telefono: '+56 9 8765 4321', noLeidos: 0,
        mensajes: [
            { id: 1, direccion: 'out', cuerpo: 'Buenas tardes, le enviamos el detalle de su renta.', hora: 'Ayer', estado: 'entregado' },
            { id: 2, direccion: 'in', cuerpo: 'Muchas gracias, lo reviso.', hora: 'Ayer' },
        ],
    },
    {
        id: 'c3', nombre: 'Constructora del Sur Ltda.', telefono: '+56 9 5555 1212', noLeidos: 1,
        mensajes: [
            { id: 1, direccion: 'in', cuerpo: 'Necesito agregar un trabajador al sistema', hora: '08:40' },
        ],
    },
];

const ConversationItem = ({ conv, active, onClick }) => {
    const ultimo = conv.mensajes[conv.mensajes.length - 1];
    return (
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
                    <span className="text-[9px] text-gray-500 shrink-0">{ultimo?.hora}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-gray-400 truncate">{ultimo?.cuerpo}</span>
                    {conv.noLeidos > 0 && (
                        <span className="bg-emerald-500 text-white text-[9px] font-black rounded-full px-1.5 py-0.5 shrink-0">{conv.noLeidos}</span>
                    )}
                </div>
            </div>
        </button>
    );
};

const WhatsappPanel = () => {
    const [convs, setConvs] = useState(CONVERSACIONES_MOCK);
    const [selectedId, setSelectedId] = useState(CONVERSACIONES_MOCK[0].id);
    const [search, setSearch] = useState('');
    const [input, setInput] = useState('');
    const [showPlantillas, setShowPlantillas] = useState(false);

    // Apartado lateral
    const [iaEstado, setIaEstado] = useState(null); // null | 'espera'
    const [tareas, setTareas] = useState([
        { id: 1, titulo: 'Enviar F29 a ACME SpA', estado: 'pendiente' },
    ]);
    const [notas, setNotas] = useState([]);
    const [nuevaTarea, setNuevaTarea] = useState('');
    const [nuevaNota, setNuevaNota] = useState('');

    const selected = convs.find(c => c.id === selectedId);

    const convsFiltradas = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return convs;
        return convs.filter(c => c.nombre.toLowerCase().includes(q) || c.telefono.includes(q));
    }, [convs, search]);

    const handleSelect = (id) => {
        setSelectedId(id);
        setConvs(prev => prev.map(c => c.id === id ? { ...c, noLeidos: 0 } : c));
        setIaEstado(null);
    };

    const handleSend = () => {
        if (!input.trim() || !selected) return;
        const nuevo = { id: Date.now(), direccion: 'out', cuerpo: input.trim(), hora: ahora(), estado: 'enviado' };
        setConvs(prev => prev.map(c => c.id === selectedId ? { ...c, mensajes: [...c.mensajes, nuevo] } : c));
        setInput('');
    };

    const aplicarPlantilla = (plantilla) => {
        const texto = plantilla.contenido.replace('{nombre}', selected?.nombre || '');
        setInput(texto);
        setShowPlantillas(false);
    };

    const agregarTarea = () => {
        if (!nuevaTarea.trim()) return;
        setTareas(prev => [{ id: Date.now(), titulo: nuevaTarea.trim(), estado: 'pendiente' }, ...prev]);
        setNuevaTarea('');
    };

    const toggleTarea = (id) => {
        setTareas(prev => prev.map(t => t.id === id ? { ...t, estado: t.estado === 'hecha' ? 'pendiente' : 'hecha' } : t));
    };

    const agregarNota = () => {
        if (!nuevaNota.trim()) return;
        setNotas(prev => [{ id: Date.now(), texto: nuevaNota.trim(), hora: ahora() }, ...prev]);
        setNuevaNota('');
    };

    return (
        <div className="flex-1 min-h-0 flex gap-4 h-full">
            {/* ===== COLUMNA 1: LISTA DE CONVERSACIONES ===== */}
            <div className="w-72 shrink-0 flex flex-col gap-3 bg-[#0f172a]/60 border border-white/10 rounded-2xl p-3">
                <div className="flex items-center gap-2 text-emerald-400 font-black text-xs uppercase tracking-widest px-1">
                    <MessageCircle size={16} /> WhatsApp
                </div>
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
                        <ConversationItem key={conv.id} conv={conv} active={conv.id === selectedId} onClick={() => handleSelect(conv.id)} />
                    ))}
                    {convsFiltradas.length === 0 && (
                        <p className="text-[10px] text-gray-500 italic text-center py-4">Sin conversaciones.</p>
                    )}
                </div>
            </div>

            {/* ===== COLUMNA 2: CHAT ===== */}
            <div className="flex-1 min-w-0 flex flex-col bg-[#0f172a]/60 border border-white/10 rounded-2xl overflow-hidden">
                {selected ? (
                    <>
                        {/* Cabecera */}
                        <div className="p-4 border-b border-white/10 flex items-center gap-3 bg-gradient-to-r from-emerald-900/20 to-transparent shrink-0">
                            <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-white/10 flex items-center justify-center text-emerald-400">
                                <User size={18} />
                            </div>
                            <div className="min-w-0">
                                <h3 className="font-black text-white text-sm truncate">{selected.nombre}</h3>
                                <span className="text-[10px] text-gray-400 flex items-center gap-1"><Phone size={10} /> {selected.telefono}</span>
                            </div>
                        </div>

                        {/* Mensajes */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-white/10">
                            {selected.mensajes.map(m => (
                                <div key={m.id} className={`flex ${m.direccion === 'out' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-xs ${m.direccion === 'out' ? 'bg-emerald-600/80 text-white rounded-br-sm' : 'bg-white/10 text-gray-100 rounded-bl-sm'}`}>
                                        <p className="leading-relaxed">{m.cuerpo}</p>
                                        <div className={`flex items-center gap-1 justify-end mt-1 text-[9px] ${m.direccion === 'out' ? 'text-emerald-100/70' : 'text-gray-500'}`}>
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
                                <Button onClick={handleSend} disabled={!input.trim()} className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-4 h-auto py-2.5">
                                    <Send size={16} />
                                </Button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Selecciona una conversación</div>
                )}
            </div>

            {/* ===== COLUMNA 3: IA / TAREAS / NOTAS ===== */}
            <div className="w-80 shrink-0 flex flex-col gap-4 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10">
                {/* IA */}
                <div className="bg-purple-500/5 border border-purple-500/20 rounded-2xl p-4">
                    <h3 className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Sparkles size={14} /> Asistente IA
                    </h3>
                    <button
                        onClick={() => setIaEstado('espera')}
                        className="w-full flex items-center justify-center gap-2 bg-purple-600/80 hover:bg-purple-600 text-white rounded-xl py-2.5 text-[10px] font-black uppercase tracking-widest transition-colors"
                    >
                        <Sparkles size={14} /> Analizar con IA
                    </button>
                    {iaEstado === 'espera' && (
                        <div className="mt-3 bg-black/30 border border-purple-500/20 rounded-xl p-3 text-center">
                            <p className="text-2xl mb-1">🤖</p>
                            <p className="text-xs font-black text-purple-300 uppercase tracking-widest">En espera de IA</p>
                            <p className="text-[10px] text-gray-500 mt-1">Esta función se activará al conectar el proveedor de IA. Generará notas y tickets de las conversaciones importantes.</p>
                        </div>
                    )}
                    {iaEstado === null && (
                        <p className="text-[10px] text-gray-500 mt-2 text-center">La IA resumirá la conversación en notas y detectará tickets automáticamente.</p>
                    )}
                </div>

                {/* Tareas */}
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <ListTodo size={14} /> Tareas
                    </h3>
                    <div className="flex gap-2 mb-3">
                        <input
                            value={nuevaTarea}
                            onChange={(e) => setNuevaTarea(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && agregarTarea()}
                            placeholder="Nueva tarea..."
                            className="flex-1 bg-black/30 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 placeholder:text-gray-600"
                        />
                        <Button onClick={agregarTarea} disabled={!nuevaTarea.trim()} className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-3 h-auto"><Plus size={14} /></Button>
                    </div>
                    <div className="space-y-2">
                        {tareas.map(t => (
                            <button key={t.id} onClick={() => toggleTarea(t.id)} className="w-full flex items-center gap-2 text-left p-2 rounded-lg bg-black/20 border border-white/5 hover:border-white/10">
                                <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${t.estado === 'hecha' ? 'bg-emerald-500 border-emerald-500' : 'border-gray-500'}`}>
                                    {t.estado === 'hecha' && <CheckCheck size={10} className="text-white" />}
                                </span>
                                <span className={`text-xs ${t.estado === 'hecha' ? 'line-through text-gray-500' : 'text-gray-200'}`}>{t.titulo}</span>
                            </button>
                        ))}
                        {tareas.length === 0 && <p className="text-[10px] text-gray-500 italic">Sin tareas.</p>}
                    </div>
                </div>

                {/* Notas */}
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

export default WhatsappPanel;
