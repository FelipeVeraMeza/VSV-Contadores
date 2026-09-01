import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    DollarSign, Loader2, Plus, ChevronLeft, ChevronRight, CalendarDays,
    Pencil, X, Trash2, UserPlus, Building2, FileText, Bell, Download,
    Printer, Sliders, CheckCircle2, Ticket, Activity, Check, Search,
    Clock, AlertTriangle
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from '@/components/ui/use-toast';
import { avisarFinalizada } from '@/components/tareas/deshacer';
import {
    getMetricasCrmApi, guardarMetaCrmApi, listarTareasApi, actualizarTareaApi,
    crearTareaApi, completarTareaApi, eliminarTareaApi, limpiarTareasCompletadasApi
} from '@/services/crmService';

const getUser = () => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } };
const getSessionId = () => getUser().sessionId;

const fmt = (n) => `$${Number(n || 0).toLocaleString('es-CL')}`;
const fmtK = (n) => { const v = Number(n || 0); return v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v}`; };
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

// Lo que sigue abierto. Debe coincidir con ESTADOS_ACTIVOS del backend: si los
// dos no cuentan lo mismo, el KPI y la lista muestran cifras distintas.
const ESTADOS_ABIERTOS = ['pendiente', 'en_proceso', 'en_revision'];

// El ícono va suelto, sin cuadrito de fondo: en una lista de doce filas esos
// doce cuadritos de color pesaban más que el texto que había que leer.
const ACT_ICON = {
    prospecto_nuevo:  { i: UserPlus,    c: 'text-blue-500',    t: 'Nuevo prospecto' },
    reunion_creada:   { i: CalendarDays, c: 'text-amber-500',  t: 'Reunión agendada' },
    tarea_creada:     { i: Plus,        c: 'text-slate-400',   t: 'Tarea creada' },
    tarea_completada: { i: CheckCircle2, c: 'text-emerald-500', t: 'Tarea cerrada' },
    cobro_registrado: { i: DollarSign,  c: 'text-emerald-500', t: 'Cobro registrado' },
};

// Embudo: una sola familia de color que se ACLARA a medida que avanza la
// etapa, más el verde de ganado y el rojo de perdido —los dos únicos desenlaces
// que importan—. Antes eran seis colores saturados sin relación entre sí
// (índigo, celeste, ámbar, naranja, verde, rojo): parecía un gráfico de torta y
// el color no significaba nada, porque las etapas no son categorías sueltas
// sino una progresión. «Otros» va en gris, que es lo que es.
const PIPE_COLOR = ['#334155', '#475569', '#64748b', '#94a3b8', '#059669', '#b91c1c', '#cbd5e1'];

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
//
// CRITERIO: ESTO ES UN REPORTE, NO UN TABLERO DE COLORES.
//
// La referencia es un informe de gestión impreso: cifras alineadas, etiquetas
// discretas, reglas finas que separan y ni un adorno que no signifique algo.
// Tres pesos tipográficos y nada más —600 para cifras y títulos, 500 para
// etiquetas, 400 para el resto—; el color solo donde hay que actuar.
//
// `tabular-nums` en TODA cifra: sin eso los dígitos tienen anchos distintos,
// las columnas bailan y la fila deja de leerse como una tabla.

// Cifra principal. La etiqueta va ARRIBA y en versalita discreta; la cifra
// manda por tamaño, no por negrita ni por un círculo de color al lado.
const Kpi = ({ label, value, sub, alerta, right }) => (
    <div className="bg-white border border-[#e8e0d2] rounded-lg px-5 py-4 flex flex-col min-w-0">
        <div className="flex items-start justify-between gap-2 mb-2">
            <span className="text-[10.5px] font-medium uppercase tracking-[0.07em] text-slate-500 truncate">{label}</span>
            {right}
        </div>
        <span className={`text-[27px] leading-none font-semibold tabular-nums tracking-[-0.02em] truncate
            ${alerta ? 'text-red-700' : 'text-slate-900'}`}>{value}</span>
        {sub && <span className="text-[11.5px] text-slate-500 mt-2 truncate">{sub}</span>}
    </div>
);

// Cifra secundaria, dentro de una tarjeta. Sin marco propio: el marco es la
// tarjeta. En fila se separan con una regla vertical, como las columnas de un
// informe; en cuadrícula la regla estorba, así que va con `suelto`.
const Mini = ({ label, value, alerta, suelto }) => (
    <div className={`min-w-0 ${suelto ? '' : 'px-4 first:pl-0 last:pr-0 border-r border-[#f0eae0] last:border-r-0'}`}>
        <div className="text-[10.5px] font-medium uppercase tracking-[0.07em] text-slate-500 truncate">{label}</div>
        <div className={`text-[21px] font-semibold tabular-nums leading-none mt-2 truncate
            ${alerta ? 'text-red-700' : 'text-slate-900'}`}>{value}</div>
    </div>
);

// Encabezado de sección: versalita con una regla que llega hasta el borde. Es
// el recurso clásico para dividir un informe en capítulos sin gritar.
const SectionLabel = ({ children }) => (
    <div className="flex items-center gap-3 pt-5 pb-1">
        <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500 whitespace-nowrap">{children}</h2>
        <div className="flex-1 h-px bg-[#e8e0d2]" />
    </div>
);

// Tarjeta con cabecera separada por una regla: da un borde superior claro al
// contenido y evita que el título y los datos se lean como un solo bloque.
const Card = ({ title, children, className = '', action, sinPadding }) => (
    <div className={`bg-white border border-[#e8e0d2] rounded-lg flex flex-col ${className}`}>
        <div className="flex items-center justify-between gap-2 px-5 h-11 border-b border-[#f0eae0] shrink-0">
            <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-slate-600 truncate">{title}</h3>
            {action}
        </div>
        <div className={sinPadding ? '' : 'px-5 py-4'}>{children}</div>
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
                        {/* Sin «Reunión» ni «Ticket»: acá se crea una tarea suelta del
                            dashboard. Una reunión necesita hora de término, participantes
                            y el aviso al cliente —eso vive en Comunicaciones—, y un ticket
                            necesita proyecto y subtareas. Marcarles el tipo desde acá solo
                            dejaba la actividad guardada donde nadie la buscaba. */}
                        <select className={`${inp} cursor-pointer`} value={form.tipo} onChange={set('tipo')}>
                            <option value="tarea">Tarea</option><option value="llamada">Llamada</option>
                            <option value="whatsapp">WhatsApp</option><option value="correo">Correo</option>
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

// Una fila = una tarea. Sin cuadrito de color por tipo (todas son del mismo
// tipo en la práctica) y sin la etiqueta de prioridad gritando en mayúsculas:
// la prioridad alta se marca con un punto rojo y las demás no se marcan, porque
// «media» es el valor por defecto y no aporta nada repetirlo en cada fila.
const TareaRow = ({ t, onComplete, onDelete }) => {
    const vence = t.venceAt ? new Date(t.venceAt) : null;
    const vencida = vence && vence < new Date();
    return (
        <div className="flex items-center gap-3 py-2.5 border-b border-[#f4efe6] last:border-0 group">
            <button onClick={() => onComplete(t)} title="Cerrar la tarea (se puede deshacer)"
                className="w-[15px] h-[15px] rounded-full border border-slate-300 hover:border-emerald-600 hover:bg-emerald-50 shrink-0 transition-colors" />
            <div className="min-w-0 flex-1">
                {/* El título se muestra tal como lo escribieron. Muchos vienen en
                    mayúsculas desde la importación y se leen fuerte, pero pasarlos
                    a minúscula rompería las siglas del rubro —IVA, SII, DTE, F29—,
                    que son justamente las palabras que hay que reconocer de un
                    vistazo. Se compensa bajando el peso del resto de la fila. */}
                <p className="text-[12.5px] text-slate-800 truncate leading-snug">{t.titulo}</p>
                <p className="text-[11px] text-slate-500 truncate mt-0.5">
                    {t.personaNombre ? `${t.personaNombre} · ` : ''}
                    <span className={vencida ? 'text-red-700' : ''}>
                        {vence ? vence.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) : 'sin fecha'}
                    </span>
                    {t.origen === 'ia' && ' · IA'}
                </p>
            </div>
            {(t.prioridad === 'alta' || t.prioridad === 'critica') &&
                <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-red-700 shrink-0" title={`Prioridad ${t.prioridad}`}>Alta</span>}
            <button onClick={() => onDelete(t)} title="Eliminar" className="text-slate-300 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"><Trash2 size={13} /></button>
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
            // EL BOTÓN «MÍAS / EQUIPO» TAMBIÉN FILTRA LA LISTA DE TAREAS.
            //
            // Antes en «Mías» se mandaba `scope: ''`, que el servicio descarta por
            // vacío, y el backend caía en su valor por defecto: «todas». En «Equipo»
            // mandaba 'equipo', que desde que existen los integrantes por proyecto
            // significa exactamente lo mismo que «todas». O sea que las dos
            // posiciones del botón devolvían la misma lista y el widget de tareas
            // pendientes no cambiaba nunca —aunque los KPIs de arriba sí—.
            //
            // Ahora «Mías» pide el ámbito 'mias' de verdad: lo que uno tiene encima
            // como responsable o colaborador.
            const [mRes, tRes] = await Promise.all([
                getMetricasCrmApi(getSessionId(), opts),
                listarTareasApi(getSessionId(), { ambito: esAdmin && scope === 'equipo' ? 'equipo' : 'mias' }),
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

    // Acá la fila NO abre la tarea —este widget no tiene panel de detalle—, así
    // que el círculo sigue finalizando de un clic. Lo que sí trae ahora es
    // vuelta atrás: es el mismo botón chico que en Tickets cerró tareas por
    // accidente, y sin el aviso la fila simplemente desaparecía.
    const completar = async (t) => {
        const anterior = t.estado || 'pendiente';
        setTareas(prev => prev.filter(x => x.id !== t.id));
        try {
            await completarTareaApi(getSessionId(), t.id);
            avisarFinalizada(t.titulo, async () => {
                try { await actualizarTareaApi(getSessionId(), t.id, { estado: anterior }); cargar(true); }
                catch { toast({ variant: 'destructive', title: 'No se pudo deshacer' }); }
            });
            cargar(true);
        }
        catch { toast({ variant: 'destructive', title: 'Error al completar' }); cargar(true); }
    };
    // Borrar PREGUNTA, y si el servidor dice que no, se dice.
    //
    // El basurero está pegado al círculo de completar y es del mismo tamaño: un
    // clic corrido borraba la tarea al instante, sin aviso y sin vuelta atrás
    // —la tabla no guarda historial—. Peor: el error se tragaba en silencio, así
    // que si el servidor rechazaba el borrado por permisos la fila igual
    // desaparecía de la pantalla y parecía borrada hasta recargar.
    const borrar = async (t) => {
        if (!window.confirm(`¿Eliminar «${t.titulo}»? Se van sus comentarios y adjuntos. No se puede deshacer.`)) return;
        setTareas(prev => prev.filter(x => x.id !== t.id));
        try {
            const r = await eliminarTareaApi(getSessionId(), t.id);
            const d = await r.json();
            if (!d.success) throw new Error(d.message || 'No se pudo eliminar.');
        } catch (e) {
            toast({ variant: 'destructive', title: 'No se eliminó', description: e.message });
        } finally { cargar(true); }
    };

    // ---- Tareas completadas: ver, buscar y eliminar de la BD ----
    const cargarCompletadas = useCallback(async () => {
        try {
            // Mismo ámbito que la lista de pendientes, o las dos pestañas del
            // widget mostrarían universos distintos de tareas.
            const r = await listarTareasApi(getSessionId(), { estado: 'completada', ambito: esAdmin && scope === 'equipo' ? 'equipo' : 'mias' });
            const d = await r.json(); if (d.success) setCompletadas(d.tareas || []);
        } catch { /* */ }
    }, [esAdmin, scope]);
    useEffect(() => { if (tab === 'completadas') cargarCompletadas(); }, [tab, cargarCompletadas]);

    const borrarCompletada = async (t) => {
        if (!window.confirm(`¿Eliminar «${t.titulo}» de la base? Se van sus comentarios y adjuntos. No se puede deshacer.`)) return;
        setCompletadas(prev => prev.filter(x => x.id !== t.id));
        try {
            const r = await eliminarTareaApi(getSessionId(), t.id);
            const d = await r.json();
            if (!d.success) throw new Error(d.message || 'No se pudo eliminar.');
        } catch (e) {
            toast({ variant: 'destructive', title: 'No se eliminó', description: e.message });
            cargarCompletadas();
        }
    };
    // El aviso dice lo que REALMENTE va a pasar. Antes prometía borrar las N que
    // se veían en pantalla y el servidor borraba todas las completadas de la
    // organización, con sus comentarios y adjuntos detrás. Ahora el servidor solo
    // toca las propias y sin subtareas, y el texto lo explica antes de apretar.
    const limpiarCompletadas = async () => {
        if (!window.confirm(
            'Se van a borrar tus tareas completadas: las que creaste o tienes asignadas, ' +
            'junto con sus comentarios y adjuntos.\n\n' +
            'No se tocan las tareas de otras personas, ni las archivadas, ni las que tienen ' +
            'subtareas colgando.\n\nEsto no se puede deshacer. ¿Continuar?')) return;
        try {
            const r = await limpiarTareasCompletadasApi(getSessionId(), esAdmin && scope === 'equipo' ? '' : 'mias');
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            cargarCompletadas();
            toast({
                title: `${d.eliminadas} tarea(s) eliminada(s)`,
                description: d.conSubtareas
                    ? `Quedaron ${d.conSubtareas} sin borrar por tener subtareas.`
                    : undefined,
            });
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

    // «Pendiente» es TODO lo que sigue abierto, no solo el estado literal.
    //
    // El widget filtraba `estado === 'pendiente'` y dejaba fuera las que están en
    // proceso o en revisión, que son trabajo abierto igual. El KPI de arriba sí
    // las cuenta, así que la pantalla se contradecía: decía «165 tareas
    // pendientes» y la lista de al lado mostraba «Pendientes (35)».
    const pendientes = useMemo(() => tareas.filter(t => ESTADOS_ABIERTOS.includes(t.estado)), [tareas]);
    // Se separa en una pasada: `vencidas.includes()` recorría el arreglo entero
    // por cada tarea, y con cientos de filas eso se nota al escribir.
    const [vencidas, proximas] = useMemo(() => {
        const ahora = Date.now(), v = [], p = [];
        pendientes.forEach(t => ((t.venceAt && new Date(t.venceAt).getTime() < ahora) ? v : p).push(t));
        return [v, p];
    }, [pendientes]);

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
    // «Reunión» y «Ticket» llevan a su módulo en vez de crear una tarea marcada
    // con ese tipo. Una «tarea tipo reunión» no aparecía en el calendario ni en
    // el módulo de Reuniones —que lee la tabla `reunion`—, así que quedaba
    // agendada en un lugar donde nadie la iba a ver, sin hora de término, sin
    // participantes y sin el aviso al cliente. Lo mismo con los tickets, que se
    // gestionan en su propia pantalla con proyecto, subtareas y adjuntos.
    const acciones = [
        { label: 'Prospecto', icon: UserPlus, run: () => onCrear && onCrear() },
        { label: 'Tarea', icon: Check, run: () => setNueva({ tipo: 'tarea' }) },
        { label: 'Reunión', icon: CalendarDays, run: () => navigate('/comunicaciones?sub=reuniones') },
        { label: 'Ticket', icon: Ticket, run: () => navigate('/tareas') },
        { label: 'Empresa', icon: Building2, run: () => navigate('/CRM?sub=list') },
        { label: 'Factura', icon: FileText, run: () => navigate('/facturacion') },
    ];

    return (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-4">
            {/* ===== Barra superior =====
                Los controles se agrupan por lo que hacen: primero QUÉ se mira
                (período y alcance), después las herramientas sobre lo mirado
                (avisos, exportar, imprimir, widgets) y al final la acción. Antes
                iban los ocho seguidos, del mismo tamaño y sin separación: había
                que leerlos uno por uno para encontrar el que se buscaba. */}
            <div className="flex items-end justify-between flex-wrap gap-3">
                <div>
                    <h2 className="text-[15px] font-semibold text-slate-900 tracking-[-0.01em]">Panel comercial</h2>
                    <p className="text-[11.5px] text-slate-500 capitalize mt-1">{hoy}{nombre ? ` · ${nombre}` : ''}</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    {/* Filtro de período (RF-018) */}
                    <div className="flex rounded-lg border border-[#efe8dd] overflow-hidden text-[12px] bg-white">
                        {PERIODOS.map(p => (
                            <button key={p.id} onClick={() => setPeriodo(p.id)}
                                className={`px-3 py-1.5 transition-colors ${periodo === p.id ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{p.label}</button>
                        ))}
                    </div>
                    {esAdmin && (
                        <div className="flex rounded-lg border border-[#efe8dd] overflow-hidden text-[12px] bg-white">
                            <button onClick={() => setScope('mias')} className={`px-3 py-1.5 transition-colors ${scope === 'mias' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Mías</button>
                            <button onClick={() => setScope('equipo')} className={`px-3 py-1.5 transition-colors ${scope === 'equipo' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Equipo</button>
                        </div>
                    )}
                    {/* Herramientas: un solo bloque, sin marco por botón. */}
                    <div className="flex items-center gap-0.5 rounded-lg border border-[#efe8dd] bg-white px-0.5">
                        <div className="relative">
                            <button onClick={() => setShowNotis(v => !v)} title="Avisos" className="relative p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-50">
                                <Bell size={15} />
                                {notis.length > 0 && <span className="absolute top-0.5 right-0.5 bg-red-500 rounded-full w-1.5 h-1.5" />}
                            </button>
                            {showNotis && (
                                <div className="absolute right-0 top-full mt-1.5 w-72 bg-white border border-[#efe8dd] rounded-xl shadow-lg p-1.5 z-30">
                                    <p className="text-[11px] font-semibold text-slate-500 px-2 py-1.5">Avisos</p>
                                    {notis.length === 0 ? <p className="text-[12px] text-slate-400 px-2 pb-2">Nada pendiente.</p> :
                                        notis.map((n, i) => { const I = n.i; return (
                                            <div key={i} className="flex items-center gap-2.5 px-2 py-1.5 text-[12px] text-slate-700"><I size={14} className={n.c} /> {n.t}</div>
                                        ); })}
                                </div>
                            )}
                        </div>
                        <button onClick={exportarCSV} title="Exportar CSV" className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-50"><Download size={15} /></button>
                        <button onClick={() => window.print()} title="Imprimir" className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-50"><Printer size={15} /></button>
                        <div className="relative">
                            <button onClick={() => setShowPers(v => !v)} title="Elegir qué se muestra" className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-50"><Sliders size={15} /></button>
                            {showPers && (
                                <div className="absolute right-0 top-full mt-1.5 w-56 bg-white border border-[#efe8dd] rounded-xl shadow-lg p-1.5 z-30">
                                    <p className="text-[11px] font-semibold text-slate-500 px-2 py-1.5">Mostrar en la pantalla</p>
                                    {WIDGETS.map(([k, lbl]) => (
                                        <label key={k} className="flex items-center gap-2.5 px-2 py-1.5 text-[12px] text-slate-700 cursor-pointer hover:bg-slate-50 rounded-md">
                                            <input type="checkbox" checked={!!widgets[k]} onChange={() => toggleWidget(k)} className="accent-emerald-600" /> {lbl}
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    {/* Acciones rápidas (RF-012) */}
                    <div className="relative">
                        <button onClick={() => setShowAcciones(v => !v)} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3.5 py-2 text-[12px] font-medium transition-colors">
                            <Plus size={15} /> Crear
                        </button>
                        {showAcciones && (
                            <div className="absolute right-0 top-full mt-1.5 w-48 bg-white border border-[#efe8dd] rounded-xl shadow-lg p-1.5 z-30">
                                {acciones.map((a, i) => { const I = a.icon; return (
                                    <button key={i} onClick={() => { a.run(); setShowAcciones(false); }} className="w-full flex items-center gap-2.5 px-2 py-2 text-[12px] text-slate-700 hover:bg-slate-50 rounded-md">
                                        <I size={14} className="text-slate-400" /> {a.label}
                                    </button>
                                ); })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Rango personalizado */}
            {periodo === 'custom' && (
                <div className="flex items-center gap-2 flex-wrap bg-white border border-[#efe8dd] rounded-xl px-3 py-2">
                    <span className="text-[12px] text-slate-500">Desde</span>
                    <input type="date" value={rango.desde} onChange={e => setRango(r => ({ ...r, desde: e.target.value }))} className="bg-slate-50 border border-[#efe8dd] rounded-md px-2 py-1 text-[12px]" />
                    <span className="text-[12px] text-slate-500">hasta</span>
                    <input type="date" value={rango.hasta} onChange={e => setRango(r => ({ ...r, hasta: e.target.value }))} className="bg-slate-50 border border-[#efe8dd] rounded-md px-2 py-1 text-[12px]" />
                </div>
            )}

            {loading && !metricas ? (
                <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 size={24} className="animate-spin" /></div>
            ) : (
                <>
                    {/* ===== Lo que entra · RF-001 =====
                        Cuatro cifras y no más. Antes eran cuatro tarjetas grandes
                        seguidas de diez cifras sueltas, todas con el mismo tamaño
                        y su propio marco: catorce números al mismo volumen, así
                        que la vista no sabía dónde posarse. Ahora manda el dinero
                        y el resto pasa a las tarjetas agrupadas de abajo. */}
                    <SectionLabel>Dinero</SectionLabel>
                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                        <Kpi label={`Cobrado · ${PERIODOS.find(p => p.id === periodo)?.label?.toLowerCase() || 'mes'}`}
                             value={fmt(m.ventasPeriodo ?? m.ventasMes)} sub="pagos recibidos en el período" />
                        <Kpi label="Meta del mes" value={m.metaMensual ? fmt(m.metaMensual) : '—'}
                             sub={m.metaMensual ? `${fmtK(m.ventasMes)} cobrados este mes` : 'sin meta definida'}
                             right={esAdmin && (
                                <button onClick={() => { setEditandoMeta(true); setMetaInput(String(m.metaMensual || '')); }}
                                    className="text-[11px] text-slate-500 hover:text-slate-700 flex items-center gap-1 shrink-0">
                                    <Pencil size={11} /> {m.metaMensual ? 'Cambiar' : 'Definir'}
                                </button>)} />
                        <Kpi label="Por cobrar" value={fmt(m.ingresosEsperados)} sub={`${m.facturasPendientes || 0} facturas emitidas`} />
                        <Kpi label="Cobros vencidos" value={m.cobrosVencidos || 0} alerta={m.cobrosVencidos > 0}
                             sub={m.cobrosVencidos > 0 ? 'pasaron su fecha de pago' : 'todo al día'} />
                    </div>

                    {editandoMeta && (
                        <div className="bg-white border border-[#efe8dd] rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
                            <span className="text-[12px] text-slate-600">Meta mensual de cobranza</span>
                            <input value={metaInput} onChange={(e) => setMetaInput(e.target.value)} placeholder="4.000.000" autoFocus
                                className="bg-slate-50 border border-[#efe8dd] rounded-md px-3 py-1.5 text-[12px] w-36 tabular-nums outline-none focus:border-emerald-500" />
                            <button onClick={guardarMeta} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-3 py-1.5 text-[12px] font-medium">Guardar</button>
                            <button onClick={() => setEditandoMeta(false)} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
                        </div>
                    )}
                    {m.metaMensual > 0 && (
                        <div className="bg-white border border-[#efe8dd] rounded-xl px-4 py-3">
                            <div className="flex justify-between items-baseline text-[12px] mb-2">
                                <span className="text-slate-500">Avance de la meta</span>
                                <span className="text-slate-900 font-semibold tabular-nums">{m.avance}%</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${m.avance}%` }} />
                            </div>
                        </div>
                    )}

                    {/* ===== Hoy y cartera · RF-009 / RF-013 =====
                        Dos tarjetas en vez de diez cuadritos sueltos: lo que hay
                        que hacer hoy, y cómo viene la cartera. Cada cifra pierde
                        su marco propio —el marco es la tarjeta— y lo que exige
                        actuar se pone en rojo. */}
                    {(widgets.resumen || widgets.indicadores) && <SectionLabel>Estado</SectionLabel>}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {widgets.resumen && (
                            <Card title="Jornada de hoy">
                                <div className="flex">
                                    <Mini label="Abiertas" value={m.tareasPendientes || 0} />
                                    <Mini label="Vencen hoy" value={m.vencenHoy || 0} alerta={m.vencenHoy > 0} />
                                    <Mini label="Reuniones" value={m.reunionesHoy || 0} />
                                    <Mini label="Cobrado" value={fmtK(m.cobradoHoy)} />
                                </div>
                            </Card>
                        )}
                        {widgets.indicadores && (
                            <Card title="Cartera comercial">
                                <div className="flex">
                                    <Mini label="Clientes" value={m.clientesActivos || 0} />
                                    <Mini label="Prospectos" value={m.prospectos || 0} />
                                    <Mini label="Nuevos" value={m.prospectosNuevos || 0} />
                                    <Mini label="Conversión" value={`${m.tasaConversion || 0}%`} />
                                </div>
                            </Card>
                        )}
                    </div>

                    {/* ===== Tareas y agenda =====
                        Las vencidas van PRIMERO y ocupan menos: son pocas pero
                        urgentes. La lista de pendientes se lleva el ancho porque
                        es donde se trabaja. El calendario queda angosto: con el
                        81% de las tareas sin fecha estaba casi vacío y se llevaba
                        un tercio de la pantalla. */}
                    {/* `items-stretch`: las tres columnas comparten alto. Con
                        `items-start` cada tarjeta media lo suyo y quedaban de 166,
                        346 y 311 px —tres bordes inferiores a distinta altura en la
                        misma fila, que es lo que hace ver desordenada una pantalla
                        aunque cada pieza por separado esté bien—. */}
                    {(widgets.tareas || widgets.vencidas || widgets.calendario) && <SectionLabel>Tareas y agenda</SectionLabel>}
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-stretch">
                        {widgets.vencidas && (
                            <Card title="Vencidas" className="xl:col-span-4" sinPadding
                                action={<span className={`text-[12px] font-semibold tabular-nums ${vencidas.length ? 'text-red-700' : 'text-slate-400'}`}>{vencidas.length}</span>}>
                                {vencidas.length === 0
                                    ? <p className="text-[12px] text-slate-400 py-8 text-center">Nada vencido.</p>
                                    : <div className="flex-1 min-h-0 max-h-[310px] overflow-y-auto px-5 pt-1 pb-2">{vencidas.map(t => <TareaRow key={t.id} t={t} onComplete={completar} onDelete={borrar} />)}</div>}
                            </Card>
                        )}
                        {widgets.tareas && (
                            <div className="bg-white border border-[#e8e0d2] rounded-lg xl:col-span-5 flex flex-col">
                                <div className="flex items-center justify-between gap-2 px-5 h-11 border-b border-[#f0eae0] shrink-0">
                                    <div className="flex items-center gap-4 text-[10.5px] font-semibold uppercase tracking-[0.07em]">
                                        <button onClick={() => setTab('pendientes')}
                                            className={`h-11 border-b-2 -mb-px transition-colors ${tab === 'pendientes' ? 'text-slate-900 border-slate-800' : 'text-slate-500 border-transparent hover:text-slate-800'}`}>
                                            Abiertas <span className="tabular-nums">({proximas.length})</span>
                                        </button>
                                        <button onClick={() => setTab('completadas')}
                                            className={`h-11 border-b-2 -mb-px transition-colors ${tab === 'completadas' ? 'text-slate-900 border-slate-800' : 'text-slate-500 border-transparent hover:text-slate-800'}`}>
                                            Cerradas
                                        </button>
                                    </div>
                                    {tab === 'completadas' && completadas.length > 0 && (
                                        <button onClick={limpiarCompletadas} className="text-[11px] text-slate-500 hover:text-red-700 flex items-center gap-1 shrink-0"><Trash2 size={12} /> Borrar las mías</button>
                                    )}
                                </div>
                                {tab === 'pendientes' ? (
                                    proximas.length === 0
                                        ? <p className="text-[12px] text-slate-400 py-8 text-center">Sin tareas abiertas.</p>
                                        // `pb-2` cierra la lista con aire: sin él la última fila
                                        // visible quedaba pegada al borde y parecía cortada por
                                        // la mitad, como si faltara contenido en vez de haber
                                        // más abajo.
                                        : <div className="flex-1 min-h-0 max-h-[310px] overflow-y-auto px-5 pt-1 pb-2">{proximas.map(t => <TareaRow key={t.id} t={t} onComplete={completar} onDelete={borrar} />)}</div>
                                ) : (
                                    <div className="px-5 py-3">
                                        {completadas.length > 0 && (
                                            <div className="relative mb-2">
                                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                                                <input value={busqCompl} onChange={(e) => setBusqCompl(e.target.value)} placeholder="Buscar…" className="w-full bg-[#fbfaf7] border border-[#e8e0d2] rounded-md pl-8 pr-3 py-1.5 text-[12px] text-slate-900 outline-none focus:border-emerald-600 placeholder:text-slate-400" />
                                            </div>
                                        )}
                                        {completadasFiltradas.length === 0 ? (
                                            <p className="text-[12px] text-slate-400 py-6 text-center">{busqCompl ? 'Sin coincidencias.' : 'Nada cerrado todavía.'}</p>
                                        ) : (
                                            <div className="max-h-[270px] overflow-y-auto">
                                                {completadasFiltradas.map(t => (
                                                    <div key={t.id} className="flex items-center gap-3 py-2 border-b border-[#f4efe6] last:border-0 group">
                                                        <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-[12.5px] text-slate-500 truncate">{t.titulo}</p>
                                                            <p className="text-[11px] text-slate-500 truncate">{t.completedAt ? relativo(t.completedAt) : ''}{t.personaNombre ? ` · ${t.personaNombre}` : ''}</p>
                                                        </div>
                                                        <button onClick={() => borrarCompletada(t)} title="Eliminar" className="text-slate-300 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"><Trash2 size={13} /></button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                        {widgets.calendario && (
                            <Card title={`${MESES[cal.mo]} ${cal.y}`} className="xl:col-span-3"
                                action={<div className="flex items-center gap-0.5">
                                    <button onClick={() => setCalMes(new Date(cal.y, cal.mo - 1, 1))} className="p-1 rounded text-slate-400 hover:text-slate-800 hover:bg-[#faf8f4]"><ChevronLeft size={14} /></button>
                                    <button onClick={() => setCalMes(new Date(cal.y, cal.mo + 1, 1))} className="p-1 rounded text-slate-400 hover:text-slate-800 hover:bg-[#faf8f4]"><ChevronRight size={14} /></button>
                                </div>}>
                                <div className="grid grid-cols-7 gap-y-0.5 text-center">
                                    {DIAS.map((d, i) => <span key={i} className="text-[10px] font-medium uppercase text-slate-500 pb-2">{d}</span>)}
                                    {cal.celdas.map((d, i) => {
                                        if (!d) return <span key={i} />;
                                        const items = cal.porDia[d] || [];
                                        const hoyCel = d === new Date().getDate() && cal.mo === new Date().getMonth() && cal.y === new Date().getFullYear();
                                        return (
                                            <div key={i} title={items.length ? items.map(t => t.titulo).join('\n') : undefined}
                                                className="flex flex-col items-center justify-center py-1">
                                                {/* Los días sin tareas van en gris medio, no en el
                                                    más claro: con `slate-300` el contraste era 1,48
                                                    —medido— y el número no se leía. Un calendario
                                                    donde no se distinguen los días no es calendario. */}
                                                <span className={`w-6 h-6 flex items-center justify-center rounded-full text-[11.5px] tabular-nums
                                                    ${hoyCel ? 'bg-slate-800 text-white font-semibold' : items.length ? 'text-slate-800 font-medium' : 'text-slate-500'}`}>{d}</span>
                                                <span className={`w-1 h-1 rounded-full mt-1 ${items.length ? 'bg-emerald-600' : 'bg-transparent'}`} />
                                            </div>
                                        );
                                    })}
                                </div>
                            </Card>
                        )}
                    </div>

                    {/* ===== Embudo y productividad =====
                        El embudo era seis barras de seis colores distintos, cada
                        una con su número en blanco encima: el color no significaba
                        nada —no hay una escala— y la barra más corta tapaba su
                        propia cifra. Ahora las cifras van alineadas a la derecha en
                        columna, se leen de una pasada, y la barra queda como apoyo
                        gris salvo la de ganados y la de perdidos, que sí importan. */}
                    {(widgets.pipeline || widgets.seguimiento || widgets.productividad) && <SectionLabel>Embudo y productividad</SectionLabel>}
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-stretch">
                        {widgets.pipeline && (
                            <Card title="Embudo comercial" className="xl:col-span-5"
                                action={<span className="text-[11px] text-slate-500 tabular-nums">{(m.pipeline || []).reduce((s, p) => s + p.n, 0)} personas</span>}>
                                {(m.pipeline || []).every(p => p.n === 0) ? (
                                    <p className="text-[12px] text-slate-400 py-6 text-center">Sin datos todavía.</p>
                                ) : (
                                    <div>
                                        {(m.pipeline || []).map((p, i) => {
                                            const total = (m.pipeline || []).reduce((s, x) => s + x.n, 0) || 1;
                                            return (
                                                <div key={i} className="flex items-center gap-3 py-[5px]">
                                                    <span className="text-[12px] text-slate-600 w-[104px] shrink-0 truncate">{p.etapa}</span>
                                                    <div className="flex-1 h-[7px] bg-[#f4efe6] rounded-sm overflow-hidden">
                                                        <div className="h-full rounded-sm transition-all"
                                                            style={{ width: `${maxPipe ? (p.n / maxPipe) * 100 : 0}%`, backgroundColor: PIPE_COLOR[i] }} />
                                                    </div>
                                                    <span className="text-[12.5px] font-medium text-slate-900 tabular-nums w-7 text-right shrink-0">{p.n}</span>
                                                    <span className="text-[11px] text-slate-500 tabular-nums w-9 text-right shrink-0">{Math.round((p.n / total) * 100)}%</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </Card>
                        )}
                        {widgets.seguimiento && (
                            <Card title="Sin contacto" className="xl:col-span-3">
                                <div className="flex flex-col items-start">
                                    <span className="text-[34px] leading-none font-semibold text-slate-900 tabular-nums tracking-[-0.02em]">{m.sinSeguimiento || 0}</span>
                                    <span className="text-[12px] text-slate-500 mt-2.5 leading-relaxed">prospectos sin contacto hace más de {m.sinSeguimientoDias || 15} días</span>
                                    <button onClick={() => navigate('/CRM?sub=prospectos')}
                                        className="mt-3 text-[12px] font-medium text-emerald-700 hover:text-emerald-800">Ver prospectos →</button>
                                </div>
                            </Card>
                        )}
                        {widgets.productividad && (
                            <Card title="Productividad" className="xl:col-span-4"
                                action={<span className="text-[11px] text-slate-500 capitalize">{m.periodo || 'mes'}</span>}>
                                <div className="grid grid-cols-2 gap-y-5 gap-x-4">
                                    <Mini suelto label="Tareas cerradas" value={m.tareasCompletadas || 0} />
                                    <Mini suelto label="Tareas abiertas" value={m.tareasPendientes || 0} />
                                    <Mini suelto label="Reuniones" value={m.reunionesRealizadas || 0} />
                                    <Mini suelto label="En cartera" value={m.totalPersonas || 0} />
                                </div>
                            </Card>
                        )}
                    </div>

                    {/* ===== Recaudación / Ranking / Actividad ===== */}
                    {(widgets.recaudacion || (widgets.ranking && esAdmin) || widgets.actividad) && <SectionLabel>Análisis y actividad</SectionLabel>}
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
                        {widgets.recaudacion && (
                            <Card title="Recaudación" className="xl:col-span-5"
                                action={<span className="text-[11px] text-slate-500">últimos 6 meses</span>}>
                                {(m.serieRecaudado || []).some(s => s.recaudado > 0) ? (
                                    // El eje Y va SIEMPRE, aunque sea discreto: un gráfico sin
                                    // escala es un dibujo bonito del que no se puede leer un
                                    // monto. Además, sin YAxis declarado el área no se dibujaba.
                                    // El dominio arranca en 0 para que las alturas sean
                                    // comparables entre sí y no exageren las diferencias.
                                    <div style={{ height: 195 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={(m.serieRecaudado || []).map(s => ({ name: MESES[Number(s.mes.slice(5)) - 1] || s.mes.slice(5), v: s.recaudado }))}
                                                margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                                                <defs><linearGradient id="recG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#059669" stopOpacity={0.3} /><stop offset="100%" stopColor="#059669" stopOpacity={0.02} /></linearGradient></defs>
                                                <CartesianGrid vertical={false} stroke="#f0eae0" />
                                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} dy={4} />
                                                <YAxis axisLine={false} tickLine={false} width={46} domain={[0, 'auto']}
                                                    tick={{ fill: '#94a3b8', fontSize: 10.5 }} tickFormatter={fmtK} />
                                                <Tooltip cursor={{ stroke: '#cbd5e1', strokeDasharray: 3 }}
                                                    contentStyle={{ borderRadius: '8px', border: '1px solid #e8e0d2', backgroundColor: '#fff', fontSize: '12px', boxShadow: '0 4px 12px rgba(0,0,0,.06)' }}
                                                    labelStyle={{ color: '#64748b', fontSize: '11px' }}
                                                    formatter={(v) => [fmt(v), 'Cobrado']} />
                                                <Area type="monotone" dataKey="v" stroke="#059669" strokeWidth={1.75} fill="url(#recG)"
                                                    dot={{ r: 2.5, fill: '#059669', strokeWidth: 0 }} activeDot={{ r: 4 }} />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                ) : <p className="text-[12px] text-slate-400 py-16 text-center">Sin cobros registrados en el período.</p>}
                            </Card>
                        )}
                        {widgets.ranking && esAdmin && (
                            <Card title="Equipo" className="xl:col-span-3">
                                {(m.ranking || []).length === 0 ? <p className="text-[12px] text-slate-400 py-6 text-center">Sin datos.</p> : (
                                    <div>
                                        {m.ranking.map((r, i) => (
                                            <div key={i} className="flex items-center gap-2.5 py-2 border-b border-[#f5f0e8] last:border-0">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-[12px] text-slate-900 truncate">{r.nombre}</p>
                                                    <p className="text-[11px] text-slate-500 tabular-nums">{r.prospectos} prospectos · {r.conversion}% conv.</p>
                                                </div>
                                                <span className="text-[13px] font-semibold text-slate-900 tabular-nums shrink-0">{r.ganados}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </Card>
                        )}
                        {widgets.actividad && (
                            <Card title="Actividad reciente" className={esAdmin ? 'xl:col-span-4' : 'xl:col-span-7'}>
                                {(m.actividad || []).length === 0 ? <p className="text-[12px] text-slate-400 py-6 text-center">Sin actividad reciente.</p> : (
                                    <div className="max-h-[260px] overflow-y-auto -mx-1 px-1">
                                        {m.actividad.map((a, i) => {
                                            const cfg = ACT_ICON[a.tipo] || { i: Activity, c: 'text-slate-500', t: a.tipo };
                                            const I = cfg.i;
                                            return (
                                                <div key={i} className="flex items-start gap-2.5 py-1.5">
                                                    <I size={14} className={`${cfg.c} shrink-0 mt-0.5`} />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-[12px] text-slate-900 truncate leading-snug">{a.titulo}</p>
                                                        <p className="text-[11px] text-slate-500">{cfg.t}</p>
                                                    </div>
                                                    <span className="text-[11px] text-slate-500 shrink-0 mt-0.5">{relativo(a.fecha)}</span>
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
