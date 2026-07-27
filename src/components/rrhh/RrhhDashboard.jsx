import React, { useState, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    Users, DollarSign, FileText, Clock, Calendar, Bell, AlertTriangle, TrendingUp, Zap,
    UserPlus, Calculator, CheckCircle2, BookCopy, Landmark, Umbrella, Upload,
    ArrowUpRight, ArrowRight, Activity, Coins, Receipt, Loader2, AlertCircle, Building2,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { getDashboardApi } from '@/services/rrhhService';

const clp = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(Number(v) || 0);
const clpShort = (v) => {
    v = Number(v) || 0;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`;
    if (v >= 1e3) return `$${Math.round(v / 1e3)}k`;
    return `$${v}`;
};
const mesAbrev = (y, m) => new Date(y, m - 1, 1).toLocaleDateString('es-CL', { month: 'short' }).replace('.', '');
const nombreMesLargo = (periodo) => { const [y, m] = periodo.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }); };

const tiempoRelativo = (fecha) => {
    if (!fecha) return '';
    const d = new Date(fecha), now = new Date();
    const hhmm = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    const dia = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.round((hoy - dia) / 86400000);
    if (diff === 0) return `Hoy, ${hhmm}`;
    if (diff === 1) return `Ayer, ${hhmm}`;
    return `${d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })}, ${hhmm}`;
};

// ── Gauge de progreso (una cifra) ───────────────────────────────────────────
const Gauge = ({ pct }) => {
    const r = 52, C = 2 * Math.PI * r;
    const off = C * (1 - Math.min(Math.max(pct, 0), 100) / 100);
    return (
        <div className="relative w-40 h-40 flex-shrink-0">
            <svg viewBox="0 0 120 120" className="w-40 h-40 -rotate-90">
                <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="11" />
                <circle cx="60" cy="60" r={r} fill="none" stroke="url(#gaugeGrad)" strokeWidth="11" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
                <defs><linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#8b5cf6" /><stop offset="100%" stopColor="#6366f1" /></linearGradient></defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black text-slate-900">{pct}%</span>
                <span className="text-[9px] uppercase tracking-widest text-slate-400 mt-0.5">Proceso</span>
            </div>
        </div>
    );
};

// ── Gráfico de área (masa salarial, 12 meses, una serie) ────────────────────
const AreaChart = ({ data }) => {
    const ref = useRef(null);
    const [hi, setHi] = useState(null);
    const W = 560, H = 190, pad = { l: 6, r: 6, t: 18, b: 22 };
    const max = Math.max(...data.map(d => d.liquido), 1);
    const x = (i) => pad.l + (i / Math.max(data.length - 1, 1)) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
    const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.liquido).toFixed(1)}`).join(' ');
    const area = `${line} L${x(data.length - 1).toFixed(1)},${H - pad.b} L${x(0).toFixed(1)},${H - pad.b} Z`;

    const onMove = (e) => {
        const rect = ref.current.getBoundingClientRect();
        const rel = ((e.clientX - rect.left) / rect.width) * W;
        let idx = Math.round(((rel - pad.l) / (W - pad.l - pad.r)) * (data.length - 1));
        idx = Math.min(Math.max(idx, 0), data.length - 1);
        setHi(idx);
    };
    const activo = hi != null ? data[hi] : data[data.length - 1];
    const activoIdx = hi != null ? hi : data.length - 1;

    return (
        <div className="relative">
            <div className="absolute top-0 right-0 text-right">
                <div className="text-[10px] uppercase tracking-widest text-slate-400">{activo && nombreMesLargo(activo.mes)}</div>
                <div className="text-sm font-bold text-violet-300">{clp(activo?.liquido)}</div>
            </div>
            <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full h-48 mt-6" onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
                <defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.35" /><stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" /></linearGradient></defs>
                <path d={area} fill="url(#areaGrad)" />
                <path d={line} fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                {/* crosshair */}
                <line x1={x(activoIdx)} y1={pad.t} x2={x(activoIdx)} y2={H - pad.b} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                <circle cx={x(activoIdx)} cy={y(activo?.liquido || 0)} r="4" fill="#8b5cf6" stroke="#0b1020" strokeWidth="2" />
                {/* etiquetas de mes */}
                {data.map((d, i) => (i % 2 === 0 || i === data.length - 1) && (
                    <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="fill-gray-600" style={{ fontSize: 9 }}>{mesAbrev(...d.mes.split('-').map(Number))}</text>
                ))}
            </svg>
        </div>
    );
};

const Card = ({ children, className = '' }) => (
    <div className={`rounded-2xl border border-[#efe8dd] bg-white p-5 ${className}`}>{children}</div>
);
const SectionTitle = ({ icon: Icon, children, color = 'text-slate-600', right }) => (
    <div className="flex items-center justify-between mb-4">
        <h3 className={`text-[11px] font-black uppercase tracking-widest flex items-center gap-2 ${color}`}>{Icon && <Icon className="h-4 w-4" />}{children}</h3>
        {right}
    </div>
);

const RrhhDashboard = ({ empresaId }) => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const periodo = new Date().toISOString().slice(0, 7);

    const { data: d, isLoading, isError, refetch } = useQuery({
        queryKey: ['rrhh-dashboard', empresaId, periodo],
        queryFn: async () => {
            const r = await getDashboardApi(user?.sessionId, empresaId, periodo);
            if (!r.ok) throw new Error('No se pudo cargar el dashboard');
            return r.json();
        },
        enabled: !!user?.sessionId,
        staleTime: 1000 * 60,
        retry: 1,
    });

    const vencimientos = useMemo(() => {
        const [py, pm] = periodo.split('-').map(Number);
        const fin = new Date(py, pm, 0).getDate();
        const nm = pm === 12 ? { y: py + 1, m: 1 } : { y: py, m: pm + 1 };
        return [
            { dia: 13, mes: mesAbrev(nm.y, nm.m), titulo: 'PREVIRED', sub: 'Envío de cotizaciones', color: 'text-blue-600 bg-blue-500/10' },
            { dia: fin, mes: mesAbrev(py, pm), titulo: 'Nómina Bancaria', sub: 'Pago de remuneraciones', color: 'text-green-400 bg-green-500/10' },
            { dia: 15, mes: mesAbrev(nm.y, nm.m), titulo: 'Libro de Remuneraciones (DT)', sub: 'Cierre y envío', color: 'text-violet-400 bg-violet-500/10' },
            { dia: 12, mes: mesAbrev(nm.y, nm.m), titulo: 'Impuesto Único (F29)', sub: 'Declaración y pago', color: 'text-orange-600 bg-orange-500/10' },
        ];
    }, [periodo]);

    if (isLoading) {
        return <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-purple-500" /></div>;
    }
    if (isError || !d) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
                <AlertCircle className="h-10 w-10 text-red-500/70" />
                <div className="text-slate-900 font-semibold">No se pudo cargar el dashboard</div>
                <p className="text-slate-400 text-sm max-w-md">Si acabas de actualizar el código, reinicia el servidor backend — los endpoints nuevos no se recargan solos. Luego reintenta.</p>
                <button onClick={() => refetch()} className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-100 text-slate-700 text-sm">Reintentar</button>
            </div>
        );
    }

    const { kpis, estado, resumen, alertas, evolucion, actividad } = d;
    const totalEstados = estado.total || 1;
    const barras = [
        { k: 'borrador', label: 'Borrador', n: estado.borrador, color: 'bg-gray-400', text: 'text-slate-600' },
        { k: 'revisada', label: 'Revisadas', n: estado.revisada, color: 'bg-blue-500', text: 'text-blue-600' },
        { k: 'aprobada', label: 'Aprobadas', n: estado.aprobada, color: 'bg-green-500', text: 'text-green-400' },
        { k: 'pagada', label: 'Pagadas', n: estado.pagada, color: 'bg-emerald-500', text: 'text-emerald-600' },
    ];
    const alertaItems = [
        { n: alertas.sinAfp, label: 'Trabajadores sin AFP', color: 'bg-red-500/15 text-red-500' },
        { n: alertas.sinCuenta, label: 'Trabajadores sin cuenta bancaria', color: 'bg-orange-500/15 text-orange-600' },
        { n: alertas.contratosVencen, label: 'Contratos vencen este mes', color: 'bg-yellow-500/15 text-yellow-400' },
        { n: alertas.sinSalud, label: 'Trabajadores sin sistema de salud', color: 'bg-blue-500/15 text-blue-600' },
        { n: alertas.sinAprobar, label: 'Liquidaciones sin aprobar', color: 'bg-red-500/15 text-red-500' },
    ].filter(a => a.n > 0);

    const ir = (sub) => navigate(`/rrhh?sub=${sub}`);
    const acciones = [
        { label: 'Registrar Trabajador', icon: UserPlus, color: 'from-blue-500 to-cyan-600', on: () => ir('trabajadores') },
        { label: 'Calcular Remuneraciones', icon: Calculator, color: 'from-violet-500 to-purple-600', on: () => ir('liquidaciones') },
        { label: 'Aprobar Liquidaciones', icon: CheckCircle2, color: 'from-green-500 to-emerald-600', on: () => ir('liquidaciones') },
        { label: 'Centralizar Contablemente', icon: BookCopy, color: 'from-indigo-500 to-blue-600', on: () => ir('centralizacion') },
        { label: 'Generar PREVIRED', icon: Upload, color: 'from-rose-500 to-pink-600', on: () => ir('reportes') },
        { label: 'Generar Libro DT', icon: FileText, color: 'from-teal-500 to-cyan-600', on: () => ir('reportes') },
        { label: 'Nómina Bancaria', icon: Landmark, color: 'from-amber-500 to-orange-600', on: () => ir('reportes') },
        { label: 'Finiquitos', icon: Receipt, color: 'from-fuchsia-500 to-purple-600', on: () => toast({ title: 'Finiquitos', description: 'Disponible en la próxima fase.' }) },
        { label: 'Vacaciones', icon: Umbrella, color: 'from-cyan-500 to-sky-600', on: () => toast({ title: 'Vacaciones', description: 'Disponible en la próxima fase.' }), sub: 'Gestionar vacaciones y permisos' },
        { label: 'Reportes', icon: TrendingUp, color: 'from-purple-500 to-violet-600', on: () => ir('reportes'), sub: 'Ver todos los reportes del módulo' },
    ];

    const iconoActividad = (tipo) => tipo === 'trabajador' ? UserPlus : tipo === 'centralizacion' ? BookCopy : CheckCircle2;
    const colorActividad = (tipo) => tipo === 'trabajador' ? 'text-blue-600 bg-blue-500/10' : tipo === 'centralizacion' ? 'text-indigo-400 bg-indigo-500/10' : 'text-green-400 bg-green-500/10';

    return (
        <div className="space-y-4">
            {d.consolidado && (
                <div className="flex items-center gap-2 text-xs text-purple-700 bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-2 w-fit">
                    <Building2 className="h-3.5 w-3.5" />
                    Vista consolidada · todas las empresas de la organización. Selecciona una empresa arriba para ver su detalle.
                </div>
            )}
            {/* ── KPIs ─────────────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <KpiCard title="Trabajadores activos" value={kpis.activos} icon={Users} color="from-violet-500 to-purple-600" ring="bg-violet-500/10"
                    sub="En la empresa" extra={kpis.nuevos > 0 ? <Trend up>{`${kpis.nuevos} nuevo(s) este mes`}</Trend> : <span className="text-slate-400 text-[11px]">Sin altas este mes</span>} />
                <KpiCard title="Líquido a pagar" value={clp(kpis.liquidoPeriodo)} icon={DollarSign} color="from-emerald-500 to-green-600" ring="bg-emerald-500/10"
                    sub="Total del período" extra={<Trend up={kpis.liquidoVarPct >= 0}>{`${kpis.liquidoVarPct >= 0 ? '+' : ''}${kpis.liquidoVarPct}% vs mes anterior`}</Trend>} />
                <KpiCard title="Liquidaciones aprobadas" value={`${kpis.aprobadas} / ${kpis.totalTrabajadores}`} icon={FileText} color="from-blue-500 to-cyan-600" ring="bg-blue-500/10"
                    sub="Aprobadas / Total" extra={<Barrita pct={kpis.aprobadasPct} />} />
                <KpiCard title="Pendientes de aprobar" value={kpis.pendientes} icon={Clock} color="from-amber-500 to-orange-600" ring="bg-amber-500/10"
                    sub="Liquidaciones pendientes" extra={<span className="text-slate-400 text-[11px]">{kpis.pendientesPct}% del total</span>} />
            </div>

            {/* ── Estado + Vencimientos + Alertas ──────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <Card className="lg:col-span-6">
                    <SectionTitle icon={Activity} color="text-purple-600" right={<span className="text-[10px] px-2 py-1 rounded-full bg-slate-50 text-slate-500">{estado.total} liquidación(es)</span>}>Estado del período</SectionTitle>
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 -mt-2 mb-4 capitalize">{nombreMesLargo(periodo)}</p>
                    <div className="flex items-center gap-6">
                        <Gauge pct={estado.progresoPct} />
                        <div className="flex-1 space-y-3">
                            {barras.map(b => {
                                const pct = Math.round((b.n / totalEstados) * 100);
                                return (
                                    <div key={b.k}>
                                        <div className="flex items-center justify-between text-xs mb-1">
                                            <span className="flex items-center gap-2 text-slate-600"><span className={`w-2 h-2 rounded-full ${b.color}`} />{b.label}</span>
                                            <span className="text-slate-500"><b className={b.text}>{b.n}</b> · {pct}%</span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-slate-50 overflow-hidden"><div className={`h-full rounded-full ${b.color}`} style={{ width: `${pct}%` }} /></div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </Card>

                <Card className="lg:col-span-3">
                    <SectionTitle icon={Calendar} color="text-blue-600">Próximos vencimientos</SectionTitle>
                    <div className="space-y-3">
                        {vencimientos.map((v, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <div className={`flex flex-col items-center justify-center w-11 h-11 rounded-lg ${v.color} flex-shrink-0`}>
                                    <span className="text-sm font-black leading-none">{v.dia}</span>
                                    <span className="text-[8px] uppercase tracking-wide">{v.mes}</span>
                                </div>
                                <div className="min-w-0">
                                    <div className="text-xs font-semibold text-slate-900 truncate">{v.titulo}</div>
                                    <div className="text-[10px] text-slate-400 truncate">{v.sub}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>

                <Card className="lg:col-span-3">
                    <SectionTitle icon={Bell} color="text-red-500">Alertas</SectionTitle>
                    {alertaItems.length ? (
                        <div className="space-y-2.5">
                            {alertaItems.map((a, i) => (
                                <div key={i} className="flex items-center gap-3">
                                    <span className={`inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-md text-xs font-black ${a.color}`}>{a.n}</span>
                                    <span className="text-xs text-slate-600 leading-tight">{a.label}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-6 text-center">
                            <CheckCircle2 className="h-8 w-8 text-green-500/60 mb-2" />
                            <p className="text-xs text-slate-500">Todo en orden</p>
                        </div>
                    )}
                </Card>
            </div>

            {/* ── Resumen + Evolución + Acciones ───────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <Card className="lg:col-span-3">
                    <SectionTitle icon={Coins} color="text-cyan-600">Resumen financiero</SectionTitle>
                    <div className="grid grid-cols-2 gap-3">
                        <Mini label="Total haberes" value={clpShort(resumen.haberes)} full={clp(resumen.haberes)} />
                        <Mini label="Total descuentos" value={clpShort(resumen.descuentos)} full={clp(resumen.descuentos)} accent="text-red-500" />
                        <Mini label="Cotizaciones" value={clpShort(resumen.cotizaciones)} full={clp(resumen.cotizaciones)} />
                        <Mini label="Líquido a pagar" value={clpShort(resumen.liquido)} full={clp(resumen.liquido)} accent="text-green-400" />
                    </div>
                </Card>

                <Card className="lg:col-span-5">
                    <SectionTitle icon={TrendingUp} color="text-violet-400" right={<span className="text-[10px] text-slate-400">Últimos 12 meses</span>}>Evolución de la masa salarial</SectionTitle>
                    <AreaChart data={evolucion} />
                </Card>

                <Card className="lg:col-span-4">
                    <SectionTitle icon={Zap} color="text-amber-600">Acciones rápidas</SectionTitle>
                    <div className="grid grid-cols-2 gap-2">
                        {acciones.map((a, i) => {
                            const Icon = a.icon;
                            return (
                                <button key={i} onClick={a.on} className="flex flex-col items-start gap-2 p-3 rounded-xl bg-white hover:bg-slate-100 border border-[#efe8dd] hover:border-[#e5ddd0] transition-all text-left group">
                                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${a.color} flex items-center justify-center`}><Icon className="h-4 w-4 text-white" /></div>
                                    <span className="text-[11px] font-semibold text-slate-900 leading-tight">{a.label}</span>
                                    {a.sub && <span className="text-[9px] text-slate-400 leading-tight">{a.sub}</span>}
                                </button>
                            );
                        })}
                    </div>
                </Card>
            </div>

            {/* ── Actividad reciente ───────────────────────────────────────── */}
            <Card>
                <SectionTitle icon={Activity} color="text-slate-600">Actividad reciente</SectionTitle>
                {actividad.length ? (
                    <div className="divide-y divide-white/[0.05]">
                        {actividad.map((a, i) => {
                            const Icon = iconoActividad(a.tipo);
                            return (
                                <div key={i} className="flex items-center gap-3 py-2.5">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colorActividad(a.tipo)}`}><Icon className="h-4 w-4" /></div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm text-slate-900 truncate">{a.texto}</div>
                                        {a.detalle && <div className="text-[11px] text-slate-400 truncate">{a.detalle}</div>}
                                    </div>
                                    <span className="text-[11px] text-slate-400 whitespace-nowrap">{tiempoRelativo(a.fecha)}</span>
                                </div>
                            );
                        })}
                    </div>
                ) : <p className="text-sm text-slate-400 py-4 text-center">Sin actividad reciente.</p>}
            </Card>
        </div>
    );
};

// ── Subcomponentes de presentación ──────────────────────────────────────────
const KpiCard = ({ title, value, sub, icon: Icon, color, ring, extra }) => (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className="relative overflow-hidden rounded-2xl border border-[#efe8dd] bg-slate-50 p-5">
        <div className="flex items-start justify-between">
            <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">{title}</p>
                <p className="text-[26px] leading-none font-bold text-slate-900 mt-3 tracking-tight truncate">{value}</p>
                <p className="text-[11px] text-slate-400 mt-2">{sub}</p>
            </div>
            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg shadow-black/20 flex-shrink-0`}><Icon className="h-[18px] w-[18px] text-white" /></div>
        </div>
        <div className="mt-3">{extra}</div>
        <div className={`absolute -right-6 -bottom-6 w-24 h-24 rounded-full ${ring} blur-xl`} />
    </motion.div>
);
const Trend = ({ up, children }) => (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${up ? 'text-green-400' : 'text-red-500'}`}>
        <ArrowUpRight className={`h-3 w-3 ${up ? '' : 'rotate-90'}`} />{children}
    </span>
);
const Barrita = ({ pct }) => (
    <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-slate-50 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-500" style={{ width: `${pct}%` }} /></div>
        <span className="text-[11px] font-bold text-blue-600">{pct}%</span>
    </div>
);
const Mini = ({ label, value, full, accent = 'text-slate-700' }) => (
    <div className="rounded-xl bg-white border border-[#efe8dd] p-3" title={full}>
        <div className="text-[9px] uppercase tracking-widest text-slate-400">{label}</div>
        <div className={`text-lg font-black mt-1 ${accent}`}>{value}</div>
    </div>
);

export default RrhhDashboard;
