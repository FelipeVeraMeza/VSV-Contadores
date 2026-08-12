import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    DollarSign, Target, TrendingUp, Percent, Loader2, Plus, Clock,
    AlertTriangle, ChevronLeft, ChevronRight, Phone, MessageCircle, Mail,
    Users, CalendarDays, Pencil, X, Trash2, UserPlus, Building2, FileText,
    Bell, Download, Printer, Sliders, CheckCircle2, Ticket, Activity,
    Award, Check, Search
} from 'lucide-react';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from '@/components/ui/use-toast';
import {
    getMetricasCrmApi, guardarMetaCrmApi, listarTareasApi,
    crearTareaApi, completarTareaApi, eliminarTareaApi, limpiarTareasCompletadasApi
} from '@/services/crmService';

const getUser = () => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } };
const getSessionId = () => getUser().sessionId;

const fmt = (n) => `$${Number(n || 0).toLocaleString('es-CL')}`;
const fmtK = (n) => { const v = Number(n || 0); return v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v}`; };
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const TIPO_ICON = { llamada: Phone, whatsapp: MessageCircle, correo: Mail, reunion: CalendarDays, ticket: Ticket, tarea: Check };
const TIPO_COLOR = {
    llamada: 'text-blue-600 bg-blue-500/10', whatsapp: 'text-emerald-600 bg-emerald-500/10',
    correo: 'text-purple-600 bg-purple-500/10', reunion: 'text-amber-600 bg-amber-500/10',
    ticket: 'text-red-600 bg-red-500/10', tarea: 'text-slate-600 bg-slate-500/10',
};
const PRIO_STYLE = { alta: 'text-red-600 bg-red-500/10 border-red-500/30', media: 'text-amber-600 bg-amber-500/10 border-amber-500/30', baja: 'text-slate-500 bg-slate-500/10 border-slate-400/30' };

const ACT_ICON = {
    prospecto_nuevo: { i: UserPlus, c: 'text-blue-600 bg-blue-500/10', t: 'Nuevo prospecto' },
    reunion_creada: { i: CalendarDays, c: 'text-amber-600 bg-amber-500/10', t: 'Reunión creada' },
    tarea_creada: { i: Plus, c: 'text-slate-600 bg-slate-500/10', t: 'Tarea creada' },
    tarea_completada: { i: CheckCircle2, c: 'text-emerald-600 bg-emerald-500/10', t: 'Tarea completada' },
    cobro_registrado: { i: DollarSign, c: 'text-emerald-600 bg-emerald-500/10', t: 'Cobro registrado' },
};

const PIPE_COLOR = ['#6366f1', '#0ea5e9', '#f59e0b', '#f97316', '#10b981', '#ef4444'];

const PERIODOS = [
    { id: 'hoy', label: 'Hoy' }, { id: 'semana', label: 'Semana' },
    { id: 'mes', label: 'Mes' }, { id: 'anio', label: 'Año' }, { id: 'custom', label: 'Rango' },
];

// Personalización de widgets (RF-020 / RNF-012) — persistida por usuario.
const WIDGETS = [
    ['resumen', 'Resumen diario'], ['indicadores', 'Indicadores comerciales'],
    ['tareas', 'Tareas pendientes'], ['vencidas', 'Tareas vencidas'], ['calendario', 'Calendario'],
    ['pipeline', 'Pipeline'], ['seguimiento', 'Seguimiento'], ['recaudacion', 'Recaudación'],
    ['productividad', 'Productividad'], ['ranking', 'Ranking'], ['actividad', 'Actividad reciente'],
    ['notificaciones', 'Notificaciones'],
];
const DEFAULT_WIDGETS = Object.fromEntries(WIDGETS.map(([k]) => [k, true]));
const loadWidgets = () => { try { return { ...DEFAULT_WIDGETS, ...JSON.parse(localStorage.getItem('crm_dash_widgets') || '{}') }; } catch { return DEFAULT_WIDGETS; } };

const relativo = (d) => {
    if (!d) return '';
    const diff = Date.now() - new Date(d).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'ahora'; if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60); if (h < 24) return `hace ${h} h`;
    const dd = Math.floor(h / 24); return dd === 1 ? 'ayer' : `hace ${dd} d`;
};

// ---- UI reutilizable ----
const Kpi = ({ icon: Icon, label, value, sub, color, bg, right }) => (
    <div className="bg-white border border-[#efe8dd] rounded-2xl p-4 flex items-center justify-between">
        <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</span>
            <span className="text-2xl font-black text-slate-900 tracking-tight truncate">{value}</span>
            {sub && <span className="text-[10px] font-bold text-slate-500 truncate">{sub}</span>}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
            <div className={`w-11 h-11 rounded-full flex items-center justify-center ${bg}`}><Icon size={18} className={color} /></div>
            {right}
        </div>
    </div>
);

const Mini = ({ icon: Icon, label, value, color }) => (
    <div className="bg-white border border-[#efe8dd] rounded-xl p-3 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center bg-slate-50 ${color}`}><Icon size={15} /></div>
        <div className="min-w-0">
            <div className="text-lg font-black text-slate-900 leading-none truncate">{value}</div>
            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">{label}</div>
        </div>
    </div>
);

// Encabezado de sección para agrupar widgets y dar orden visual.
const SectionLabel = ({ children }) => (
    <div className="flex items-center gap-3 pt-2">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">{children}</span>
        <div className="flex-1 h-px bg-[#efe8dd]" />
    </div>
);

const Card = ({ title, icon: Icon, children, className = '', action }) => (
    <div className={`bg-white border border-[#efe8dd] rounded-2xl p-4 ${className}`}>
        <div className="flex items-center justify-between mb-3 gap-2">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 min-w-0">
                {Icon && <Icon size={14} className="text-slate-400 shrink-0" />} <span className="truncate">{title}</span>
            </h3>
            {action}
        </div>
        {children}
    </div>
);

// ---- Modal crear tarea / reunión / ticket (RF-005) ----
const NuevaTareaModal = ({ onClose, onCreated, initialTipo = 'tarea' }) => {
    const [form, setForm] = useState({ titulo: '', tipo: initialTipo, prioridad: 'media', venceAt: '', descripcion: '' });
    const [saving, setSaving] = useState(false);
    const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));
    const guardar = async () => {
        if (!form.titulo.trim()) { toast({ variant: 'destructive', title: 'Falta el título' }); return; }
        setSaving(true);
        try {
            const r = await crearTareaApi(getSessionId(), { ...form, venceAt: form.venceAt || null });
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            toast({ title: 'Creado' }); onCreated(); onClose();
        } catch (e) { toast({ variant: 'destructive', title: 'Error', description: e.message }); }
        finally { setSaving(false); }
    };
    const inp = "w-full bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500";
    const titulos = { tarea: 'Nueva tarea', reunion: 'Nueva reunión', ticket: 'Nuevo ticket' };
    return (
        <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="w-full max-w-md bg-white rounded-2xl border border-[#efe8dd] shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">{titulos[form.tipo] || 'Nueva actividad'}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={18} /></button>
                </div>
                <div className="space-y-3">
                    <input className={inp} placeholder="¿Qué hay que hacer?" value={form.titulo} onChange={set('titulo')} autoFocus />
                    <div className="grid grid-cols-2 gap-2">
                        <select className={`${inp} cursor-pointer`} value={form.tipo} onChange={set('tipo')}>
                            <option value="tarea">Tarea</option><option value="llamada">Llamada</option>
                            <option value="whatsapp">WhatsApp</option><option value="correo">Correo</option>
                            <option value="reunion">Reunión</option><option value="ticket">Ticket</option>
                        </select>
                        <select className={`${inp} cursor-pointer`} value={form.prioridad} onChange={set('prioridad')}>
                            <option value="alta">Prioridad alta</option><option value="media">Prioridad media</option><option value="baja">Prioridad baja</option>
                        </select>
                    </div>
                    <label className="block">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Vence</span>
                        <input type="datetime-local" className={inp} value={form.venceAt} onChange={set('venceAt')} />
                    </label>
                    <textarea className={`${inp} resize-none`} rows={2} placeholder="Descripción (opcional)" value={form.descripcion} onChange={set('descripcion')} />
                    <button onClick={guardar} disabled={saving} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg h-10 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Crear
                    </button>
                </div>
            </div>
        </div>
    );
};

const TareaRow = ({ t, onComplete, onDelete }) => {
    const Icon = TIPO_ICON[t.tipo] || Check;
    const vence = t.venceAt ? new Date(t.venceAt) : null;
    const vencida = vence && vence < new Date() && t.estado === 'pendiente';
    return (
        <div className="flex items-center gap-2.5 py-2 border-b border-[#efe8dd] last:border-0 group">
            <button onClick={() => onComplete(t)} title="Completar"
                className="w-4 h-4 rounded-full border-2 border-slate-300 hover:border-emerald-500 hover:bg-emerald-500/20 shrink-0 transition-colors" />
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${TIPO_COLOR[t.tipo] || TIPO_COLOR.tarea}`}><Icon size={13} /></div>
            <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-900 truncate">{t.titulo}</p>
                <p className="text-[10px] text-slate-500 truncate">
                    {t.personaNombre ? `${t.personaNombre} · ` : ''}{vence ? vence.toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Sin fecha'}
                    {t.origen === 'ia' && <span className="text-purple-600 font-bold"> · IA</span>}
                </p>
            </div>
            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase shrink-0 ${PRIO_STYLE[t.prioridad]}`}>{t.prioridad}</span>
            {vencida && <span className="text-[8px] font-black text-red-600 shrink-0">VENCIDA</span>}
            <button onClick={() => onDelete(t)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"><Trash2 size={12} /></button>
        </div>
    );
};

const CrmDashboard = ({ onCrear }) => {
    const navigate = useNavigate();
    const user = getUser();
    const esAdmin = user?.rol === 'Administrador';
    const nombre = (user?.nombre || '').split(' ')[0] || '';
    const hoy = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });

    const [metricas, setMetricas] = useState(null);
    const [tareas, setTareas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [scope, setScope] = useState('mias');
    const [periodo, setPeriodo] = useState('mes');
    const [rango, setRango] = useState({ desde: '', hasta: '' });
    const [nueva, setNueva] = useState(null); // {tipo} o null
    const [editandoMeta, setEditandoMeta] = useState(false);
    const [metaInput, setMetaInput] = useState('');
    const [calMes, setCalMes] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
    const [widgets, setWidgets] = useState(loadWidgets);
    const [showPers, setShowPers] = useState(false);
    const [showNotis, setShowNotis] = useState(false);
    const [showAcciones, setShowAcciones] = useState(false);
    // Tareas: pestaña pendientes / completadas (para ver, buscar y eliminar de la BD)
    const [tab, setTab] = useState('pendientes');
    const [completadas, setCompletadas] = useState([]);
    const [busqCompl, setBusqCompl] = useState('');

    const cargar = useCallback(async (silencioso = false) => {
        if (!silencioso) setLoading(true);
        try {
            const opts = { periodo, scope: esAdmin ? scope : '', desde: rango.desde, hasta: rango.hasta };
            const [mRes, tRes] = await Promise.all([
                getMetricasCrmApi(getSessionId(), opts),
                listarTareasApi(getSessionId(), { scope: esAdmin && scope === 'equipo' ? 'equipo' : '' }),
            ]);
            const m = await mRes.json(); const t = await tRes.json();
            if (m.success) setMetricas(m.metricas);
            if (t.success) setTareas(t.tareas || []);
        } catch { /* */ } finally { if (!silencioso) setLoading(false); }
    }, [esAdmin, scope, periodo, rango]);

    useEffect(() => { cargar(); }, [cargar]);
    // Actualización en tiempo real sin recargar (RNF-004): refresco cada 30 s.
    useEffect(() => {
        const id = setInterval(() => cargar(true), 30000);
        return () => clearInterval(id);
    }, [cargar]);

    const persistWidgets = (w) => { setWidgets(w); try { localStorage.setItem('crm_dash_widgets', JSON.stringify(w)); } catch { /* */ } };
    const toggleWidget = (k) => persistWidgets({ ...widgets, [k]: !widgets[k] });

    const completar = async (t) => {
        setTareas(prev => prev.filter(x => x.id !== t.id));
        try { await completarTareaApi(getSessionId(), t.id); cargar(true); }
        catch { toast({ variant: 'destructive', title: 'Error al completar' }); cargar(true); }
    };
    const borrar = async (t) => {
        setTareas(prev => prev.filter(x => x.id !== t.id));
        try { await eliminarTareaApi(getSessionId(), t.id); cargar(true); } catch { cargar(true); }
    };

    // ---- Tareas completadas: ver, buscar y eliminar de la BD ----
    const cargarCompletadas = useCallback(async () => {
        try {
            const r = await listarTareasApi(getSessionId(), { estado: 'completada', scope: esAdmin && scope === 'equipo' ? 'equipo' : '' });
            const d = await r.json(); if (d.success) setCompletadas(d.tareas || []);
        } catch { /* */ }
    }, [esAdmin, scope]);
    useEffect(() => { if (tab === 'completadas') cargarCompletadas(); }, [tab, cargarCompletadas]);

    const borrarCompletada = async (t) => {
        setCompletadas(prev => prev.filter(x => x.id !== t.id));
        try { await eliminarTareaApi(getSessionId(), t.id); } catch { cargarCompletadas(); }
    };
    const limpiarCompletadas = async () => {
        if (!window.confirm(`¿Eliminar definitivamente ${completadas.length} tarea(s) completada(s)? Esta acción no se puede deshacer.`)) return;
        try {
            const r = await limpiarTareasCompletadasApi(getSessionId(), esAdmin && scope === 'equipo' ? '' : 'mias');
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            setCompletadas([]);
            toast({ title: `${d.eliminadas} tarea(s) eliminada(s)` });
        } catch (e) { toast({ variant: 'destructive', title: 'Error', description: e.message }); cargarCompletadas(); }
    };
    const completadasFiltradas = useMemo(() => {
        const q = busqCompl.trim().toLowerCase();
        return q ? completadas.filter(t => (t.titulo || '').toLowerCase().includes(q)) : completadas;
    }, [completadas, busqCompl]);
    const guardarMeta = async () => {
        const v = Number(String(metaInput).replace(/\D/g, ''));
        try {
            const r = await guardarMetaCrmApi(getSessionId(), v); const d = await r.json();
            if (!d.success) throw new Error(d.message);
            setEditandoMeta(false); toast({ title: 'Meta actualizada' }); cargar(true);
        } catch (e) { toast({ variant: 'destructive', title: 'Error', description: e.message }); }
    };

    const pendientes = useMemo(() => tareas.filter(t => t.estado === 'pendiente'), [tareas]);
    const vencidas = useMemo(() => pendientes.filter(t => t.venceAt && new Date(t.venceAt) < new Date()), [pendientes]);
    const proximas = useMemo(() => pendientes.filter(t => !vencidas.includes(t)), [pendientes, vencidas]);
    const reunionesHoyList = useMemo(() => pendientes.filter(t => t.tipo === 'reunion' && t.venceAt && new Date(t.venceAt).toDateString() === new Date().toDateString()), [pendientes]);

    const cal = useMemo(() => {
        const y = calMes.getFullYear(), mo = calMes.getMonth();
        const offset = (new Date(y, mo, 1).getDay() + 6) % 7;
        const diasEnMes = new Date(y, mo + 1, 0).getDate();
        const porDia = {};
        pendientes.forEach(t => {
            if (!t.venceAt) return;
            const d = new Date(t.venceAt);
            if (d.getFullYear() === y && d.getMonth() === mo) (porDia[d.getDate()] = porDia[d.getDate()] || []).push(t);
        });
        const celdas = [];
        for (let i = 0; i < offset; i++) celdas.push(null);
        for (let d = 1; d <= diasEnMes; d++) celdas.push(d);
        return { celdas, porDia, y, mo };
    }, [calMes, pendientes]);

    const m = metricas || {};

    // Notificaciones derivadas (RF-011)
    const notis = useMemo(() => {
        const l = [];
        if (m.sinSeguimiento > 0) l.push({ i: Clock, c: 'text-amber-600', t: `${m.sinSeguimiento} cliente(s) sin seguimiento` });
        if (m.cobrosVencidos > 0) l.push({ i: AlertTriangle, c: 'text-red-600', t: `${m.cobrosVencidos} cobro(s) vencido(s)` });
        if (m.reunionesHoy > 0) l.push({ i: CalendarDays, c: 'text-blue-600', t: `${m.reunionesHoy} reunión(es) hoy` });
        if (m.tareasVencidas > 0) l.push({ i: Clock, c: 'text-red-600', t: `${m.tareasVencidas} tarea(s) vencida(s)` });
        if (m.prospectosNuevos > 0) l.push({ i: UserPlus, c: 'text-emerald-600', t: `${m.prospectosNuevos} prospecto(s) nuevo(s)` });
        return l;
    }, [m]);

    // Exportación (RF-019)
    const exportarCSV = () => {
        const filas = [
            ['Indicador', 'Valor'],
            ['Ventas del mes', m.ventasMes], ['Meta mensual', m.metaMensual], ['Avance %', m.avance],
            ['Tasa de conversión %', m.tasaConversion], ['Prospectos nuevos', m.prospectosNuevos],
            ['Clientes activos', m.clientesActivos], ['Facturas pendientes', m.facturasPendientes],
            ['Cobros vencidos', m.cobrosVencidos], ['Ingresos esperados', m.ingresosEsperados],
            ['Cobrado hoy', m.cobradoHoy], ['Tareas pendientes', m.tareasPendientes],
            ['Tareas vencidas', m.tareasVencidas], ['Sin seguimiento', m.sinSeguimiento],
            ...(m.pipeline || []).map(p => [`Pipeline · ${p.etapa}`, p.n]),
        ];
        const csv = filas.map(r => r.join(';')).join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `dashboard-crm-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    const maxPipe = Math.max(1, ...(m.pipeline || []).map(p => p.n));

    // Acciones rápidas (RF-012)
    const acciones = [
        { label: 'Prospecto', icon: UserPlus, run: () => onCrear && onCrear() },
        { label: 'Tarea', icon: Check, run: () => setNueva({ tipo: 'tarea' }) },
        { label: 'Reunión', icon: CalendarDays, run: () => setNueva({ tipo: 'reunion' }) },
        { label: 'Ticket', icon: Ticket, run: () => setNueva({ tipo: 'ticket' }) },
        { label: 'Empresa', icon: Building2, run: () => navigate('/CRM?sub=list') },
        { label: 'Factura', icon: FileText, run: () => navigate('/facturacion') },
    ];

    return (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-4">
            {/* ===== Barra superior ===== */}
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                    <h2 className="text-lg font-black text-slate-900">Hola{nombre ? `, ${nombre}` : ''} 👋</h2>
                    <p className="text-[11px] text-slate-500 capitalize">{hoy}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Filtro de período (RF-018) */}
                    <div className="flex rounded-lg border border-[#efe8dd] overflow-hidden text-[10px] font-black uppercase tracking-widest">
                        {PERIODOS.map(p => (
                            <button key={p.id} onClick={() => setPeriodo(p.id)} className={`px-2.5 py-1.5 ${periodo === p.id ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>{p.label}</button>
                        ))}
                    </div>
                    {esAdmin && (
                        <div className="flex rounded-lg border border-[#efe8dd] overflow-hidden text-[10px] font-black uppercase tracking-widest">
                            <button onClick={() => setScope('mias')} className={`px-3 py-1.5 ${scope === 'mias' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500'}`}>Mías</button>
                            <button onClick={() => setScope('equipo')} className={`px-3 py-1.5 ${scope === 'equipo' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500'}`}>Equipo</button>
                        </div>
                    )}
                    {/* Notificaciones (RF-011) */}
                    <div className="relative">
                        <button onClick={() => setShowNotis(v => !v)} className="relative p-2 rounded-lg border border-[#efe8dd] bg-white text-slate-500 hover:text-slate-900">
                            <Bell size={15} />
                            {notis.length > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black rounded-full w-4 h-4 flex items-center justify-center">{notis.length}</span>}
                        </button>
                        {showNotis && (
                            <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-[#efe8dd] rounded-xl shadow-2xl p-2 z-30">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2 py-1">Notificaciones</p>
                                {notis.length === 0 ? <p className="text-[11px] text-slate-400 italic px-2 py-2">Nada pendiente 👌</p> :
                                    notis.map((n, i) => { const I = n.i; return (
                                        <div key={i} className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-slate-700"><I size={13} className={n.c} /> {n.t}</div>
                                    ); })}
                            </div>
                        )}
                    </div>
                    {/* Exportar (RF-019) */}
                    <button onClick={exportarCSV} title="Exportar CSV" className="p-2 rounded-lg border border-[#efe8dd] bg-white text-slate-500 hover:text-slate-900"><Download size={15} /></button>
                    <button onClick={() => window.print()} title="Imprimir / PDF" className="p-2 rounded-lg border border-[#efe8dd] bg-white text-slate-500 hover:text-slate-900"><Printer size={15} /></button>
                    {/* Personalizar (RF-020) */}
                    <div className="relative">
                        <button onClick={() => setShowPers(v => !v)} title="Personalizar" className="p-2 rounded-lg border border-[#efe8dd] bg-white text-slate-500 hover:text-slate-900"><Sliders size={15} /></button>
                        {showPers && (
                            <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-[#efe8dd] rounded-xl shadow-2xl p-2 z-30">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2 py-1">Mostrar widgets</p>
                                {WIDGETS.map(([k, lbl]) => (
                                    <label key={k} className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-slate-700 cursor-pointer hover:bg-slate-50 rounded-lg">
                                        <input type="checkbox" checked={!!widgets[k]} onChange={() => toggleWidget(k)} className="accent-emerald-600" /> {lbl}
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                    {/* Acciones rápidas (RF-012) */}
                    <div className="relative">
                        <button onClick={() => setShowAcciones(v => !v)} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest">
                            <Plus size={14} /> Crear
                        </button>
                        {showAcciones && (
                            <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-[#efe8dd] rounded-xl shadow-2xl p-2 z-30">
                                {acciones.map((a, i) => { const I = a.icon; return (
                                    <button key={i} onClick={() => { a.run(); setShowAcciones(false); }} className="w-full flex items-center gap-2 px-2 py-2 text-[11px] font-bold text-slate-700 hover:bg-emerald-500/10 hover:text-emerald-700 rounded-lg">
                                        <I size={14} /> {a.label}
                                    </button>
                                ); })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Rango personalizado */}
            {periodo === 'custom' && (
                <div className="flex items-center gap-2 flex-wrap bg-white border border-[#efe8dd] rounded-xl p-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Desde</span>
                    <input type="date" value={rango.desde} onChange={e => setRango(r => ({ ...r, desde: e.target.value }))} className="bg-slate-50 border border-[#efe8dd] rounded-lg px-2 py-1 text-xs" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hasta</span>
                    <input type="date" value={rango.hasta} onChange={e => setRango(r => ({ ...r, hasta: e.target.value }))} className="bg-slate-50 border border-[#efe8dd] rounded-lg px-2 py-1 text-xs" />
                </div>
            )}

            {loading && !metricas ? (
                <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 size={24} className="animate-spin" /></div>
            ) : (
                <>
                    <SectionLabel>Resumen</SectionLabel>
                    {/* ===== KPIs principales (RF-001) ===== */}
                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                        <Kpi icon={DollarSign} label={`Ventas · ${PERIODOS.find(p => p.id === periodo)?.label || 'Mes'}`} value={fmt(m.ventasPeriodo ?? m.ventasMes)} sub="Recaudado en el período elegido" color="text-emerald-600" bg="bg-emerald-500/15" />
                        <Kpi icon={Target} label="Meta mensual" value={fmt(m.metaMensual)} color="text-blue-600" bg="bg-blue-500/15"
                            right={esAdmin && <button onClick={() => { setEditandoMeta(true); setMetaInput(String(m.metaMensual || '')); }} className="text-[9px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5"><Pencil size={9} /> Editar</button>} />
                        <Kpi icon={TrendingUp} label="Avance" value={`${m.avance || 0}%`} sub={m.metaMensual ? `${fmtK(m.ventasMes)} de ${fmtK(m.metaMensual)}` : 'Fija una meta'} color="text-amber-600" bg="bg-amber-500/15" />
                        <Kpi icon={Percent} label="Conversión" value={`${m.tasaConversion || 0}%`} sub={`${m.activos || 0} de ${m.totalPersonas || 0} prospectos`} color="text-purple-600" bg="bg-purple-500/15" />
                    </div>

                    {editandoMeta && (
                        <div className="bg-white border border-blue-500/30 rounded-2xl p-4 flex items-center gap-3 flex-wrap">
                            <span className="text-xs font-bold text-slate-700">Meta mensual de ventas:</span>
                            <input value={metaInput} onChange={(e) => setMetaInput(e.target.value)} placeholder="2.000.000" className="bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-1.5 text-xs w-40 outline-none focus:border-blue-500" />
                            <button onClick={guardarMeta} className="bg-blue-600 text-white rounded-lg px-3 py-1.5 text-[10px] font-black uppercase">Guardar</button>
                            <button onClick={() => setEditandoMeta(false)} className="text-slate-400 hover:text-red-500"><X size={16} /></button>
                        </div>
                    )}
                    {m.metaMensual > 0 && (
                        <div className="bg-white border border-[#efe8dd] rounded-2xl p-4">
                            <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2"><span>Avance de la meta</span><span>{m.avance}%</span></div>
                            <div className="h-3 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all" style={{ width: `${m.avance}%` }} /></div>
                        </div>
                    )}

                    {/* ===== Resumen diario (RF-009) ===== */}
                    {widgets.resumen && (
                        <Card title="Resumen del día" icon={Activity}>
                            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                                <Mini icon={Clock} label="Tareas pendientes" value={m.tareasPendientes || 0} color="text-blue-600" />
                                <Mini icon={CalendarDays} label="Reuniones hoy" value={m.reunionesHoy || 0} color="text-amber-600" />
                                <Mini icon={AlertTriangle} label="Vencen hoy" value={m.vencenHoy || 0} color="text-red-600" />
                                <Mini icon={DollarSign} label="Cobrado hoy" value={fmtK(m.cobradoHoy)} color="text-emerald-600" />
                                <Mini icon={Target} label="Cumplimiento meta" value={`${m.avance || 0}%`} color="text-emerald-600" />
                            </div>
                        </Card>
                    )}

                    {/* ===== Indicadores comerciales (RF-013) ===== */}
                    {widgets.indicadores && (
                        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                            <Mini icon={UserPlus} label="Prospectos nuevos" value={m.prospectosNuevos || 0} color="text-blue-600" />
                            <Mini icon={Users} label="Clientes activos" value={m.clientesActivos || 0} color="text-emerald-600" />
                            <Mini icon={FileText} label="Facturas pendientes" value={m.facturasPendientes || 0} color="text-amber-600" />
                            <Mini icon={AlertTriangle} label="Cobros vencidos" value={m.cobrosVencidos || 0} color="text-red-600" />
                            <Mini icon={TrendingUp} label="Ingresos esperados" value={fmtK(m.ingresosEsperados)} color="text-purple-600" />
                        </div>
                    )}

                    {/* ===== Tareas / vencidas / calendario ===== */}
                    {(widgets.tareas || widgets.vencidas || widgets.calendario) && <SectionLabel>Tareas y agenda</SectionLabel>}
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
                        {widgets.tareas && (
                            <div className="bg-white border border-[#efe8dd] rounded-2xl p-4 xl:col-span-4">
                                <div className="flex items-center justify-between mb-3 gap-2">
                                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                                        <button onClick={() => setTab('pendientes')} className={`flex items-center gap-1 ${tab === 'pendientes' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}><Clock size={13} /> Pendientes ({proximas.length})</button>
                                        <span className="text-slate-300">·</span>
                                        <button onClick={() => setTab('completadas')} className={`flex items-center gap-1 ${tab === 'completadas' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}><CheckCircle2 size={13} /> Completadas</button>
                                    </div>
                                    {tab === 'completadas' && completadas.length > 0 && (
                                        <button onClick={limpiarCompletadas} className="text-[9px] font-black uppercase tracking-widest text-red-600 hover:text-red-700 flex items-center gap-1"><Trash2 size={11} /> Limpiar todas</button>
                                    )}
                                </div>
                                {tab === 'pendientes' ? (
                                    proximas.length === 0
                                        ? <p className="text-xs text-slate-400 italic text-center py-6">Sin tareas pendientes 🎉</p>
                                        : <div className="max-h-[320px] overflow-y-auto pr-1">{proximas.map(t => <TareaRow key={t.id} t={t} onComplete={completar} onDelete={borrar} />)}</div>
                                ) : (
                                    <>
                                        {completadas.length > 0 && (
                                            <div className="relative mb-2">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                                                <input value={busqCompl} onChange={(e) => setBusqCompl(e.target.value)} placeholder="Buscar en completadas..." className="w-full bg-slate-50 border border-[#efe8dd] rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-500 placeholder:text-slate-400" />
                                            </div>
                                        )}
                                        {completadasFiltradas.length === 0 ? (
                                            <p className="text-xs text-slate-400 italic text-center py-6">{busqCompl ? 'Sin coincidencias.' : 'Aún no hay tareas completadas.'}</p>
                                        ) : (
                                            <div className="max-h-[300px] overflow-y-auto pr-1">
                                                {completadasFiltradas.map(t => {
                                                    const Icon = TIPO_ICON[t.tipo] || Check;
                                                    return (
                                                        <div key={t.id} className="flex items-center gap-2.5 py-2 border-b border-[#efe8dd] last:border-0 group">
                                                            <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${TIPO_COLOR[t.tipo] || TIPO_COLOR.tarea}`}><Icon size={13} /></div>
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-xs font-bold text-slate-500 line-through truncate">{t.titulo}</p>
                                                                <p className="text-[10px] text-slate-400 truncate">{t.completedAt ? `Completada ${relativo(t.completedAt)}` : ''}{t.personaNombre ? ` · ${t.personaNombre}` : ''}</p>
                                                            </div>
                                                            <button onClick={() => borrarCompletada(t)} title="Eliminar de la base" className="text-slate-300 hover:text-red-500 shrink-0"><Trash2 size={13} /></button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                        {widgets.vencidas && (
                            <Card title="Tareas vencidas" icon={AlertTriangle} className="xl:col-span-4" action={<span className={`text-[10px] font-black ${vencidas.length ? 'text-red-600' : 'text-slate-400'}`}>{vencidas.length}</span>}>
                                {vencidas.length === 0
                                    ? <p className="text-xs text-slate-400 italic text-center py-6">Nada vencido, al día ✅</p>
                                    : <div className="max-h-[320px] overflow-y-auto pr-1">{vencidas.map(t => <TareaRow key={t.id} t={t} onComplete={completar} onDelete={borrar} />)}</div>}
                            </Card>
                        )}
                        {widgets.calendario && (
                            <Card title="Calendario" icon={CalendarDays} className="xl:col-span-4"
                                action={<div className="flex items-center gap-1">
                                    <button onClick={() => setCalMes(new Date(cal.y, cal.mo - 1, 1))} className="text-slate-400 hover:text-slate-700"><ChevronLeft size={14} /></button>
                                    <span className="text-[10px] font-bold text-slate-600 w-20 text-center">{MESES[cal.mo]} {cal.y}</span>
                                    <button onClick={() => setCalMes(new Date(cal.y, cal.mo + 1, 1))} className="text-slate-400 hover:text-slate-700"><ChevronRight size={14} /></button>
                                </div>}>
                                <div className="grid grid-cols-7 gap-1 text-center">
                                    {DIAS.map((d, i) => <span key={i} className="text-[9px] font-black text-slate-400 py-1">{d}</span>)}
                                    {cal.celdas.map((d, i) => {
                                        if (!d) return <span key={i} />;
                                        const items = cal.porDia[d] || [];
                                        const hoyCel = d === new Date().getDate() && cal.mo === new Date().getMonth() && cal.y === new Date().getFullYear();
                                        return (
                                            <div key={i} title={items.map(t => t.titulo).join('\n')}
                                                className={`aspect-square rounded-lg flex flex-col items-center justify-center text-[10px] relative ${hoyCel ? 'bg-emerald-600 text-white font-black' : items.length ? 'bg-emerald-500/10 text-slate-700 font-bold' : 'text-slate-400'}`}>
                                                {d}{items.length > 0 && <span className={`w-1 h-1 rounded-full mt-0.5 ${hoyCel ? 'bg-white' : 'bg-emerald-600'}`} />}
                                            </div>
                                        );
                                    })}
                                </div>
                            </Card>
                        )}
                    </div>

                    {/* ===== Pipeline / Seguimiento / Productividad ===== */}
                    {(widgets.pipeline || widgets.seguimiento || widgets.productividad) && <SectionLabel>Embudo y productividad</SectionLabel>}
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
                        {widgets.pipeline && (
                            <Card title="Pipeline comercial" icon={TrendingUp} className="xl:col-span-5">
                                <div className="space-y-1.5">
                                    {(m.pipeline || []).map((p, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-slate-500 w-24 shrink-0">{p.etapa}</span>
                                            <div className="flex-1 h-6 bg-slate-50 rounded-md overflow-hidden">
                                                <div className="h-full rounded-md flex items-center justify-end px-2 text-[10px] font-black text-white transition-all" style={{ width: `${Math.max(8, (p.n / maxPipe) * 100)}%`, backgroundColor: PIPE_COLOR[i] }}>{p.n}</div>
                                            </div>
                                        </div>
                                    ))}
                                    {(m.pipeline || []).every(p => p.n === 0) && <p className="text-xs text-slate-400 italic text-center py-2">Aún sin datos de embudo.</p>}
                                </div>
                            </Card>
                        )}
                        {widgets.seguimiento && (
                            <Card title="Seguimiento comercial" icon={Users} className="xl:col-span-3">
                                <div className="flex flex-col items-center justify-center py-2">
                                    <span className="text-4xl font-black text-slate-900">{m.sinSeguimiento || 0}</span>
                                    <span className="text-[10px] text-slate-500 text-center mt-1">prospectos sin contacto<br />en {m.sinSeguimientoDias || 15} días</span>
                                    <button onClick={() => navigate('/CRM?sub=prospectos')} className="mt-3 text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-1.5 hover:bg-emerald-500/20">Ver prospectos</button>
                                </div>
                            </Card>
                        )}
                        {widgets.productividad && (
                            <Card title="Productividad" icon={Award} className="xl:col-span-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <Mini icon={CheckCircle2} label="Tareas completadas" value={m.tareasCompletadas || 0} color="text-emerald-600" />
                                    <Mini icon={Clock} label="Tareas pendientes" value={m.tareasPendientes || 0} color="text-blue-600" />
                                    <Mini icon={CalendarDays} label="Reuniones realizadas" value={m.reunionesRealizadas || 0} color="text-amber-600" />
                                    <Mini icon={Users} label="Prospectos gestionados" value={m.totalPersonas || 0} color="text-purple-600" />
                                </div>
                            </Card>
                        )}
                    </div>

                    {/* ===== Recaudación / Ranking / Actividad ===== */}
                    {(widgets.recaudacion || (widgets.ranking && esAdmin) || widgets.actividad) && <SectionLabel>Análisis y actividad</SectionLabel>}
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
                        {widgets.recaudacion && (
                            <Card title="Recaudación (6 meses)" icon={TrendingUp} className="xl:col-span-5">
                                {(m.serieRecaudado || []).some(s => s.recaudado > 0) ? (
                                    <div style={{ height: 200 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={(m.serieRecaudado || []).map(s => ({ name: s.mes.slice(5), v: s.recaudado }))}>
                                                <defs><linearGradient id="recG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.4} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient></defs>
                                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} />
                                                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #efe8dd', backgroundColor: '#fff', fontSize: '12px' }} formatter={(v) => [fmt(v), 'Recaudado']} />
                                                <Area type="monotone" dataKey="v" stroke="#10b981" strokeWidth={2} fill="url(#recG)" />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                ) : <p className="text-xs text-slate-400 italic text-center py-16">Sin recaudación registrada en el período.</p>}
                            </Card>
                        )}
                        {widgets.ranking && esAdmin && (
                            <Card title="Ranking del equipo" icon={Award} className="xl:col-span-3">
                                {(m.ranking || []).length === 0 ? <p className="text-xs text-slate-400 italic text-center py-8">Sin datos.</p> : (
                                    <div className="space-y-2">
                                        {m.ranking.map((r, i) => (
                                            <div key={i} className="flex items-center gap-2 py-1 border-b border-[#efe8dd] last:border-0">
                                                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 ${i === 0 ? 'bg-amber-400 text-white' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</span>
                                                <div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-900 truncate">{r.nombre}</p><p className="text-[9px] text-slate-500">{r.prospectos} prospectos · {r.conversion}% conv.</p></div>
                                                <span className="text-xs font-black text-emerald-600 shrink-0">{r.ganados}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </Card>
                        )}
                        {widgets.actividad && (
                            <Card title="Actividad reciente" icon={Activity} className={esAdmin ? 'xl:col-span-4' : 'xl:col-span-7'}>
                                {(m.actividad || []).length === 0 ? <p className="text-xs text-slate-400 italic text-center py-8">Sin actividad reciente.</p> : (
                                    <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                                        {m.actividad.map((a, i) => {
                                            const cfg = ACT_ICON[a.tipo] || { i: Activity, c: 'text-slate-600 bg-slate-500/10', t: a.tipo };
                                            const I = cfg.i;
                                            return (
                                                <div key={i} className="flex items-start gap-3">
                                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${cfg.c}`}><I size={13} /></div>
                                                    <div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-900">{cfg.t}</p><p className="text-[10px] text-slate-500 truncate">{a.titulo}</p></div>
                                                    <span className="text-[9px] text-slate-400 shrink-0">{relativo(a.fecha)}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </Card>
                        )}
                    </div>
                </>
            )}

            {nueva && <NuevaTareaModal initialTipo={nueva.tipo} onClose={() => setNueva(null)} onCreated={() => cargar(true)} />}
        </div>
    );
};

export default CrmDashboard;
