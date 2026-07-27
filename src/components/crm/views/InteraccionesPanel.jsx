import React, { useState, useMemo } from 'react';
import {
    Search, Mail, MessageCircle, Phone, Calendar, StickyNote,
    Plus, X, ArrowDownLeft, ArrowUpRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ===============================================================
// HISTORIAL DE INTERACCIONES — Fase 0 (esqueleto con datos mock).
// Timeline unificado: correos, WhatsApp, llamadas, reuniones y notas.
// Filtro por tipo y por cliente. Llamadas y reuniones se pueden registrar.
// No usa backend ni BD todavía: estado local de ejemplo.
// ===============================================================

const TIPOS = {
    correo:   { label: 'Correo',   icon: Mail,          color: 'text-blue-600',    chip: 'bg-blue-500/10 border-blue-500/30 text-blue-700' },
    whatsapp: { label: 'WhatsApp', icon: MessageCircle, color: 'text-emerald-600', chip: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700' },
    llamada:  { label: 'Llamada',  icon: Phone,         color: 'text-amber-600',   chip: 'bg-amber-500/10 border-amber-500/30 text-amber-700' },
    reunion:  { label: 'Reunión',  icon: Calendar,      color: 'text-purple-600',  chip: 'bg-purple-500/10 border-purple-500/30 text-purple-700' },
    nota:     { label: 'Nota',     icon: StickyNote,    color: 'text-slate-600',    chip: 'bg-slate-100 border-[#efe8dd] text-slate-700' },
};

const hace = (horas) => new Date(Date.now() - horas * 3600 * 1000);

const INTERACCIONES_MOCK = [
    { id: 1, tipo: 'whatsapp', cliente: 'ACME SpA', texto: '¿Para cuándo estaría listo el F29?', direccion: 'in', autor: 'Cliente', ts: hace(2) },
    { id: 2, tipo: 'whatsapp', cliente: 'ACME SpA', texto: 'Claro, lo estoy revisando ahora mismo.', direccion: 'out', autor: 'Felipe', ts: hace(2.1) },
    { id: 3, tipo: 'correo', cliente: 'ACME SpA', texto: 'Documentos del mes de mayo recibidos. Procesaremos esta semana.', direccion: 'out', autor: 'Felipe', ts: hace(26) },
    { id: 4, tipo: 'llamada', cliente: 'Juan Pérez', texto: 'Consulta telefónica sobre declaración de renta. Duración: 12 min.', autor: 'Felipe', ts: hace(28) },
    { id: 5, tipo: 'correo', cliente: 'Juan Pérez', texto: 'Le enviamos el detalle de su renta anual.', direccion: 'out', autor: 'Felipe', ts: hace(50) },
    { id: 6, tipo: 'reunion', cliente: 'Constructora del Sur Ltda.', texto: 'Reunión de cierre de trimestre. Asistieron gerencia y contabilidad.', autor: 'Felipe', ts: hace(72) },
    { id: 7, tipo: 'nota', cliente: 'Constructora del Sur Ltda.', texto: 'Cliente solicitó agregar un trabajador al sistema. Pendiente de gestionar.', autor: 'Felipe', ts: hace(73) },
    { id: 8, tipo: 'whatsapp', cliente: 'Constructora del Sur Ltda.', texto: 'Necesito agregar un trabajador al sistema', direccion: 'in', autor: 'Cliente', ts: hace(74) },
];

const fmtFecha = (d) => d.toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const InteraccionesPanel = () => {
    const [interacciones, setInteracciones] = useState(INTERACCIONES_MOCK);
    const [search, setSearch] = useState('');
    const [tipoFiltro, setTipoFiltro] = useState('todos');

    // Formulario de registro (llamada / reunión / nota)
    const [formTipo, setFormTipo] = useState(null); // null | 'llamada' | 'reunion' | 'nota'
    const [formCliente, setFormCliente] = useState('');
    const [formTexto, setFormTexto] = useState('');

    const conteos = useMemo(() => {
        const c = { todos: interacciones.length };
        Object.keys(TIPOS).forEach(t => { c[t] = interacciones.filter(i => i.tipo === t).length; });
        return c;
    }, [interacciones]);

    const lista = useMemo(() => {
        const q = search.trim().toLowerCase();
        return interacciones
            .filter(i => tipoFiltro === 'todos' || i.tipo === tipoFiltro)
            .filter(i => !q || i.cliente.toLowerCase().includes(q) || i.texto.toLowerCase().includes(q))
            .sort((a, b) => b.ts - a.ts);
    }, [interacciones, search, tipoFiltro]);

    const abrirForm = (tipo) => {
        setFormTipo(tipo);
        setFormCliente('');
        setFormTexto('');
    };

    const guardar = () => {
        if (!formCliente.trim() || !formTexto.trim()) return;
        setInteracciones(prev => [
            { id: Date.now(), tipo: formTipo, cliente: formCliente.trim(), texto: formTexto.trim(), autor: 'Felipe', ts: new Date() },
            ...prev,
        ]);
        setFormTipo(null);
    };

    return (
        <div className="flex-1 min-h-0 flex flex-col gap-4 h-full">
            {/* TOOLBAR */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-3 flex-shrink-0">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar por cliente o contenido..."
                        className="w-full bg-slate-50 border border-[#efe8dd] rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-900 outline-none focus:border-emerald-500 placeholder:text-slate-500"
                    />
                </div>
                <div className="flex gap-2">
                    <button onClick={() => abrirForm('llamada')} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-700 text-[10px] font-black uppercase tracking-widest hover:bg-amber-500/25"><Phone size={13} /> Llamada</button>
                    <button onClick={() => abrirForm('reunion')} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-700 text-[10px] font-black uppercase tracking-widest hover:bg-purple-500/25"><Calendar size={13} /> Reunión</button>
                    <button onClick={() => abrirForm('nota')} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-50 border border-[#efe8dd] text-slate-600 text-[10px] font-black uppercase tracking-widest hover:bg-slate-100"><StickyNote size={13} /> Nota</button>
                </div>
            </div>

            {/* CHIPS DE FILTRO POR TIPO */}
            <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                <button onClick={() => setTipoFiltro('todos')} className={`px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider ${tipoFiltro === 'todos' ? 'bg-emerald-50 border-[#199b4d]/40 text-[#199b4d]' : 'bg-white border-[#efe8dd] text-slate-500 hover:text-slate-900'}`}>
                    Todos <span className="ml-1 px-1.5 rounded bg-slate-50">{conteos.todos}</span>
                </button>
                {Object.entries(TIPOS).map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    return (
                        <button key={key} onClick={() => setTipoFiltro(key)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider ${tipoFiltro === key ? 'bg-emerald-50 border-[#199b4d]/40 text-[#199b4d]' : 'bg-white border-[#efe8dd] text-slate-500 hover:text-slate-900'}`}>
                            <Icon size={13} className={cfg.color} /> {cfg.label} <span className="ml-0.5 px-1.5 rounded bg-slate-50">{conteos[key]}</span>
                        </button>
                    );
                })}
            </div>

            {/* FORMULARIO DE REGISTRO */}
            {formTipo && (
                <div className="bg-white border border-[#efe8dd] rounded-2xl p-4 flex-shrink-0">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className={`text-[11px] font-black uppercase tracking-widest flex items-center gap-2 ${TIPOS[formTipo].color}`}>
                            {React.createElement(TIPOS[formTipo].icon, { size: 15 })} Registrar {TIPOS[formTipo].label}
                        </h3>
                        <button onClick={() => setFormTipo(null)} className="text-slate-500 hover:text-slate-900"><X size={16} /></button>
                    </div>
                    <div className="flex flex-col md:flex-row gap-3">
                        <input
                            value={formCliente}
                            onChange={(e) => setFormCliente(e.target.value)}
                            placeholder="Cliente / empresa"
                            className="md:w-64 bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500 placeholder:text-slate-500"
                        />
                        <input
                            value={formTexto}
                            onChange={(e) => setFormTexto(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && guardar()}
                            placeholder={formTipo === 'llamada' ? 'Resumen de la llamada (motivo, duración...)' : formTipo === 'reunion' ? 'Detalle de la reunión (asistentes, temas...)' : 'Nota interna...'}
                            className="flex-1 bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500 placeholder:text-slate-500"
                        />
                        <Button onClick={guardar} disabled={!formCliente.trim() || !formTexto.trim()} className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-4 h-auto py-2 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                            <Plus size={14} /> Registrar
                        </Button>
                    </div>
                </div>
            )}

            {/* TIMELINE */}
            <div className="flex-1 overflow-y-auto rounded-2xl border border-[#efe8dd] bg-white p-4 scrollbar-thin scrollbar-thumb-white/10">
                {lista.length > 0 ? (
                    <div className="space-y-3">
                        {lista.map(i => {
                            const cfg = TIPOS[i.tipo];
                            const Icon = cfg.icon;
                            return (
                                <div key={i.id} className="flex gap-3 items-start">
                                    <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${cfg.chip}`}>
                                        <Icon size={16} className={cfg.color} />
                                    </div>
                                    <div className="flex-1 min-w-0 bg-white border border-[#efe8dd] rounded-xl p-3">
                                        <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="font-bold text-slate-900 text-xs truncate">{i.cliente}</span>
                                                <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${cfg.chip}`}>{cfg.label}</span>
                                                {i.direccion && (
                                                    <span className={`flex items-center gap-0.5 text-[9px] font-bold ${i.direccion === 'out' ? 'text-emerald-600' : 'text-sky-400'}`}>
                                                        {i.direccion === 'out' ? <><ArrowUpRight size={11} /> Enviado</> : <><ArrowDownLeft size={11} /> Recibido</>}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-[9px] text-slate-500 shrink-0">{fmtFecha(i.ts)}</span>
                                        </div>
                                        <p className="text-xs text-slate-700 leading-relaxed">{i.texto}</p>
                                        <p className="text-[9px] text-slate-500 mt-1">por {i.autor}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className="text-xs text-slate-500 italic text-center py-8">No hay interacciones para este filtro.</p>
                )}
            </div>
        </div>
    );
};

export default InteraccionesPanel;
