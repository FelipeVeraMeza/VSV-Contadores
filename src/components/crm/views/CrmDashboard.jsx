import React, { useMemo } from 'react';
import {
    Users, UserCheck, UserX, ClipboardList, DollarSign,
    MessageCircle, Mail, FileText, CheckCircle2, RefreshCw, Clock,
    Sparkles, ShieldCheck, Copy, Upload, Zap, ChevronRight, FormInput,
    Search, Bell, HelpCircle, Calendar, Plus, StickyNote, MoreVertical
} from 'lucide-react';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const TOOLTIP = { borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: '#0f172a', color: '#fff', fontSize: '12px' };

const INGRESOS = [
    { name: '1 May', v: 22 }, { name: '8 May', v: 28 }, { name: '15 May', v: 45.6 },
    { name: '22 May', v: 52 }, { name: '31 May', v: 64 },
];
const MOROSIDAD = [
    { name: 'Al día', value: 68, monto: 22032000, color: '#10b981' },
    { name: '1-30 días', value: 20, monto: 6480000, color: '#f59e0b' },
    { name: '31-60 días', value: 8, monto: 2592000, color: '#fb923c' },
    { name: '60+ días', value: 4, monto: 1296000, color: '#ef4444' },
];
const FUNNEL = [
    { etapa: 'Prospectos', n: 145, color: '#6366f1', w: 100 },
    { etapa: 'Contactados', n: 98, color: '#10b981', w: 80 },
    { etapa: 'En negociación', n: 56, color: '#f97316', w: 58 },
    { etapa: 'Convertidos', n: 32, color: '#a855f7', w: 38 },
];
const CLIENTES_REC = [
    { n: 'María Fernanda Torres', sub: 'maria.torres@gmail.com', estado: 'Prospecto', rut: '12.345.678-9', t: 'hace 2 horas', oIcon: MessageCircle, oColor: 'text-emerald-400' },
    { n: 'Constructora Andes SpA', sub: 'contacto@andes.cl', estado: 'Cliente Activo', rut: '76.543.210-1', t: 'hace 1 día', oIcon: Mail, oColor: 'text-blue-400' },
    { n: 'Carlos Muñoz', sub: 'carlos.m@gmail.com', estado: 'Cliente Inactivo', rut: '8.765.432-1', t: 'hace 2 días', oIcon: FileText, oColor: 'text-purple-400' },
    { n: 'Inversiones Patagonia Ltda.', sub: 'hola@patagonia.cl', estado: 'Cliente Activo', rut: '77.111.222-3', t: 'hace 3 días', oIcon: MessageCircle, oColor: 'text-emerald-400' },
    { n: 'Fernanda López', sub: 'fernanda.lopez@gmail.com', estado: 'Prospecto', rut: '18.765.432-2', t: 'hace 4 días', oIcon: Mail, oColor: 'text-blue-400' },
];
const ACTIVIDAD = [
    { icon: MessageCircle, color: 'text-emerald-400 bg-emerald-500/10', titulo: 'Nuevo prospecto desde WhatsApp', sub: 'María Fernanda Torres', t: 'Hace 2 horas' },
    { icon: Mail, color: 'text-blue-400 bg-blue-500/10', titulo: 'Correo recibido', sub: 'Constructora Andes SpA', t: 'Hace 4 horas' },
    { icon: FormInput, color: 'text-purple-400 bg-purple-500/10', titulo: 'Formulario web', sub: 'Consulta de servicios', t: 'Hace 6 horas' },
    { icon: CheckCircle2, color: 'text-emerald-400 bg-emerald-500/10', titulo: 'Tarea completada', sub: 'Llamar a Carlos Muñoz', t: 'Ayer' },
    { icon: RefreshCw, color: 'text-amber-400 bg-amber-500/10', titulo: 'Actualización de cliente', sub: 'Inversiones Patagonia Ltda.', t: 'Ayer' },
];
const TAREAS = [
    { t: 'Llamar a María Torres', h: 'Hoy', c: 'text-red-400' },
    { t: 'Enviar propuesta comercial', h: 'Mañana', c: 'text-amber-400' },
    { t: 'Seguimiento cobranza', h: '17 May', c: 'text-gray-400' },
    { t: 'Revisar documentación', h: '18 May', c: 'text-gray-400' },
];
const INTEGRACIONES = [
    { icon: MessageCircle, n: 'WhatsApp', e: 'Conectado', c: 'text-emerald-400' },
    { icon: Mail, n: 'Gmail', e: 'Conectado', c: 'text-blue-400' },
    { icon: FormInput, n: 'Formularios Web', e: 'Conectado', c: 'text-purple-400' },
];
const FEATURES = [
    { icon: Sparkles, n: 'IA Enriquecimiento', s: 'Datos automáticos' },
    { icon: CheckCircle2, n: 'Validaciones', s: 'RUT, correo, teléfono' },
    { icon: Copy, n: 'Detección duplicados', s: 'Prevención inteligente' },
    { icon: Upload, n: 'Importación / Exportación', s: 'Excel, CSV' },
    { icon: Zap, n: 'Automatizaciones', s: 'Seguimiento inteligente' },
    { icon: ShieldCheck, n: 'Seguridad', s: 'Roles y permisos' },
];

const estadoChip = (e) => {
    if (e === 'Prospecto') return 'text-purple-300 bg-purple-500/10 border-purple-500/30';
    if (e === 'Cliente Activo') return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30';
    return 'text-orange-300 bg-orange-500/10 border-orange-500/30';
};
const fmt = (n) => `$${Number(n).toLocaleString('es-CL')}`;
const initiales = (n) => n.split(' ').slice(0, 2).map(x => x[0]).join('').toUpperCase();

const Kpi = ({ icon: Icon, label, value, delta, up, color, bg }) => (
    <div className="bg-[#0f172a]/60 border border-white/10 rounded-2xl p-4 flex items-center justify-between">
        <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</span>
            <span className="text-2xl font-black text-white tracking-tight">{value}</span>
            {delta && <span className={`text-[10px] font-bold ${up ? 'text-emerald-400' : 'text-red-400'}`}>{up ? '+' : '-'}{delta} vs ayer</span>}
        </div>
        <div className={`w-11 h-11 rounded-full flex items-center justify-center ${bg}`}><Icon size={18} className={color} /></div>
    </div>
);

const Card = ({ title, action, onAction, children, className = '' }) => (
    <div className={`bg-[#0f172a]/60 border border-white/10 rounded-2xl p-4 ${className}`}>
        <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-black text-white uppercase tracking-widest">{title}</h3>
            {action && <button onClick={onAction} className="text-[10px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-0.5">{action} <ChevronRight size={12} /></button>}
        </div>
        {children}
    </div>
);

const CrmDashboard = ({ clients = [], onCrear }) => {
    const nombre = useMemo(() => {
        try { return (JSON.parse(localStorage.getItem('user') || '{}').nombre || '').split(' ')[0] || ''; }
        catch { return ''; }
    }, []);
    const hoy = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long' });

    const kpis = useMemo(() => ({
        prospectos: 145,
        activos: clients?.length || 328,
        inactivos: 52,
        tareas: 24,
    }), [clients]);

    return (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <Kpi icon={Users} label="Prospectos" value={kpis.prospectos} delta="12%" up color="text-blue-400" bg="bg-blue-500/15" />
                <Kpi icon={UserCheck} label="Clientes Activos" value={kpis.activos} delta="8%" up color="text-emerald-400" bg="bg-emerald-500/15" />
                <Kpi icon={UserX} label="Clientes Inactivos" value={kpis.inactivos} delta="4%" up={false} color="text-orange-400" bg="bg-orange-500/15" />
                <Kpi icon={ClipboardList} label="Tareas Pendientes" value={kpis.tareas} delta="3%" up color="text-purple-400" bg="bg-purple-500/15" />
            </div>

            {/* Fila central */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                {/* Clientes recientes */}
                <Card title="Clientes Recientes" action="Ver todos" className="xl:col-span-5">
                    <div className="space-y-1">
                        {CLIENTES_REC.map((p, i) => {
                            const OI = p.oIcon;
                            return (
                                <div key={i} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center text-[10px] font-black text-blue-300 shrink-0">{initiales(p.n)}</div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-bold text-white truncate">{p.n}</p>
                                        <p className="text-[10px] text-gray-500 truncate">{p.sub}</p>
                                    </div>
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${estadoChip(p.estado)} shrink-0 hidden lg:inline`}>{p.estado}</span>
                                    <span className="text-[10px] text-gray-500 font-mono shrink-0 hidden md:inline">{p.rut}</span>
                                    <span className="text-[10px] text-gray-500 shrink-0 w-16 text-right hidden sm:inline">{p.t}</span>
                                    <OI size={14} className={`${p.oColor} shrink-0`} />
                                </div>
                            );
                        })}
                    </div>
                </Card>

                {/* Actividad reciente */}
                <Card title="Actividad Reciente" action="Ver todas" className="xl:col-span-4">
                    <div className="space-y-3">
                        {ACTIVIDAD.map((a, i) => {
                            const AI = a.icon;
                            return (
                                <div key={i} className="flex items-start gap-3">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${a.color}`}><AI size={15} /></div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-bold text-white">{a.titulo}</p>
                                        <p className="text-[10px] text-gray-500 truncate">{a.sub}</p>
                                    </div>
                                    <span className="text-[10px] text-gray-500 shrink-0">{a.t}</span>
                                    <MoreVertical size={13} className="text-gray-600 shrink-0" />
                                </div>
                            );
                        })}
                    </div>
                </Card>

                {/* Columna derecha: Notas rápidas + Tareas + Integraciones */}
                <div className="xl:col-span-3 space-y-4">
                    <Card title="Notas rápidas" action="+ Nueva nota">
                        <div className="bg-amber-300/90 text-slate-900 rounded-lg p-3">
                            <p className="text-[11px] font-medium leading-snug">Revisar propuesta de servicios para Constructora Andes SpA. Pendiente seguimiento la próxima semana.</p>
                            <p className="text-[9px] text-slate-700 mt-2 font-bold">Juan Pérez · hoy 11:30</p>
                        </div>
                    </Card>

                    <Card title="Próximas Tareas" action="Ver todas">
                        <div className="space-y-2">
                            {TAREAS.map((t, i) => (
                                <div key={i} className="flex items-center gap-2.5 py-1 border-b border-white/5 last:border-0">
                                    <Clock size={12} className="text-gray-500 shrink-0" />
                                    <span className="text-[11px] text-gray-200 flex-1 truncate">{t.t}</span>
                                    <span className={`text-[10px] font-bold ${t.c}`}>{t.h}</span>
                                </div>
                            ))}
                        </div>
                    </Card>

                    <Card title="Integraciones Activas">
                        <div className="space-y-2">
                            {INTEGRACIONES.map((g, i) => {
                                const GI = g.icon;
                                return (
                                    <div key={i} className="flex items-center gap-3 py-1">
                                        <GI size={15} className={g.c} />
                                        <div className="flex-1">
                                            <p className="text-[11px] font-bold text-white">{g.n}</p>
                                            <p className="text-[9px] text-emerald-400">{g.e}</p>
                                        </div>
                                        <CheckCircle2 size={15} className="text-emerald-400" />
                                    </div>
                                );
                            })}
                            <button className="w-full mt-1 text-[10px] font-bold text-blue-400 hover:text-blue-300 bg-white/5 rounded-lg py-1.5">Ver todas las integraciones</button>
                        </div>
                    </Card>
                </div>
            </div>

            {/* Gráficos */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <Card title="Conversión de Prospectos" action="Este mes">
                    <div className="space-y-2 mb-3">
                        {FUNNEL.map((f, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <div className="flex-1 flex justify-center">
                                    <div className="h-8 rounded-md flex items-center justify-between px-3 text-[11px] font-bold text-white" style={{ width: `${f.w}%`, backgroundColor: f.color }}>
                                        <span className="truncate">{f.etapa}</span><span>{f.n}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="text-center pt-2 border-t border-white/5">
                        <span className="text-[10px] text-gray-400">Tasa de conversión </span>
                        <span className="text-lg font-black text-emerald-400">22%</span>
                    </div>
                </Card>

                <Card title="Proyección de Ingresos" action="Este mes">
                    <div style={{ height: 200 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={INGRESOS}>
                                <defs>
                                    <linearGradient id="ingG" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} />
                                <Tooltip contentStyle={TOOLTIP} formatter={(v) => [`$${v}M`, 'Ingresos']} />
                                <Area type="monotone" dataKey="v" stroke="#a855f7" strokeWidth={2} fill="url(#ingG)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                <Card title="Morosidad">
                    <div className="flex items-center gap-3">
                        <div style={{ width: 130, height: 130 }} className="relative shrink-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={MOROSIDAD} cx="50%" cy="50%" innerRadius={42} outerRadius={62} paddingAngle={3} dataKey="value" stroke="none">
                                        {MOROSIDAD.map((e, i) => <Cell key={i} fill={e.color} />)}
                                    </Pie>
                                    <Tooltip contentStyle={TOOLTIP} formatter={(v, n) => [`${v}%`, n]} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="text-[8px] text-gray-500">Total</span>
                                <span className="text-[11px] font-black text-white">$32.4M</span>
                            </div>
                        </div>
                        <div className="flex-1 space-y-1.5">
                            {MOROSIDAD.map((m, i) => (
                                <div key={i} className="flex items-center justify-between text-[10px]">
                                    <span className="flex items-center gap-1.5 text-gray-300"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} /> {m.name}</span>
                                    <span className="text-gray-400">{m.value}%</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </Card>
            </div>

            {/* Tira de features */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 pb-4">
                {FEATURES.map((f, i) => {
                    const FI = f.icon;
                    return (
                        <div key={i} className="bg-[#0f172a]/60 border border-white/10 rounded-2xl p-3 flex flex-col items-center text-center gap-1.5">
                            <div className="w-9 h-9 rounded-full bg-blue-500/15 flex items-center justify-center"><FI size={16} className="text-blue-400" /></div>
                            <span className="text-[11px] font-bold text-white leading-tight">{f.n}</span>
                            <span className="text-[9px] text-gray-500 leading-tight">{f.s}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default CrmDashboard;
