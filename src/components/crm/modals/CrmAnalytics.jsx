// src/components/crm/modals/CrmAnalytics.jsx
import React, { useMemo } from 'react';
import {
  TrendingUp, PieChart as PieIcon, Activity, AlertTriangle,
  Users, CheckCircle2, FileText, DollarSign, Gauge
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend, ComposedChart, Line
} from 'recharts';

const cleanStr = (str) => {
  if (!str) return '';
  return String(str).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
};

const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };
const fmtPeso = (n) => `$${Math.round(num(n)).toLocaleString('es-CL')}`;
const fmtCompact = (n) => {
  const v = num(n);
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${Math.round(v / 1e3)}K`;
  return `$${Math.round(v)}`;
};

const TOOLTIP_STYLE = { borderRadius: '16px', border: '1px solid #efe8dd', backgroundColor: '#ffffff', color: '#1a1c1e', fontSize: '12px' };

const KpiCard = ({ icon: Icon, label, value, sub, color }) => (
  <div className="bg-white border border-[#efe8dd] rounded-2xl p-4 flex flex-col gap-1 backdrop-blur-md">
    <div className="flex items-center justify-between">
      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{label}</span>
      <Icon size={16} className={color} />
    </div>
    <span className="text-2xl font-black text-slate-900 tracking-tight">{value}</span>
    {sub && <span className="text-[10px] text-slate-500">{sub}</span>}
  </div>
);

const ChartCard = ({ icon: Icon, title, color, children, height = 360 }) => (
  <div className="bg-white border border-[#efe8dd] p-6 rounded-[2rem] flex flex-col backdrop-blur-md" style={{ height }}>
    <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
      <Icon className={color} size={16} /> {cleanStr(title)}
    </h3>
    <div className="flex-1 min-h-0">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  </div>
);

const CrmAnalytics = ({ clients = [], cashFlow = [] }) => {

  const m = useMemo(() => {
    const lista = clients || [];
    const total = lista.length;

    const pagoDe = (c) => String(c.estado_pago || c.pagoServicio || 'AL DIA').trim().toUpperCase();
    const f29De = (c) => String(c.estado_f29 || c.estadoFormulario || 'PENDIENTE').trim().toUpperCase();
    const dtsDe = (c) => parseInt(c.dts_mensuales || c.dtAtrasados || 0) || 0;
    const deudaDe = (c) => num(c.impuesto_pagar ?? c.impuestoPagar ?? c.neto);

    const esCritico = (c) => { const p = pagoDe(c); return p === 'NO PAGADO' || p === 'SERVICIO SUSPENDIDO' || dtsDe(c) > 0; };
    const esAlDia = (c) => { const p = pagoDe(c); const f = f29De(c); return (p === 'AL DIA' || p === 'PAGADO') && (f === 'DECLARADO' || f === 'NO DECLARAR'); };

    const criticos = lista.filter(esCritico).length;
    const f29Pendientes = lista.filter(c => f29De(c) === 'PENDIENTE').length;
    const alDia = lista.filter(esAlDia).length;
    const deudaTotal = lista.filter(c => { const p = pagoDe(c); return p === 'NO PAGADO' || p === 'SERVICIO SUSPENDIDO'; }).reduce((s, c) => s + deudaDe(c), 0);
    const scoreProm = total ? Math.round(lista.reduce((s, c) => s + (parseInt(c.score) || 0), 0) / total) : 0;

    // Estado de pago (donut)
    const pagoCount = { 'Al día': 0, 'No pagado': 0, 'Suspendido': 0 };
    lista.forEach(c => {
      const p = pagoDe(c);
      if (p === 'NO PAGADO') pagoCount['No pagado']++;
      else if (p === 'SERVICIO SUSPENDIDO') pagoCount['Suspendido']++;
      else pagoCount['Al día']++;
    });
    const estadoPago = [
      { name: 'Al día', value: pagoCount['Al día'], color: '#10b981' },
      { name: 'No pagado', value: pagoCount['No pagado'], color: '#ef4444' },
      { name: 'Suspendido', value: pagoCount['Suspendido'], color: '#f59e0b' },
    ].filter(d => d.value > 0);

    // Cumplimiento F29 (barras horizontales)
    const f29Count = { 'Declarado': 0, 'Pendiente': 0, 'No declarar': 0 };
    lista.forEach(c => {
      const f = f29De(c);
      if (f === 'DECLARADO') f29Count['Declarado']++;
      else if (f === 'NO DECLARAR') f29Count['No declarar']++;
      else f29Count['Pendiente']++;
    });
    const cumplimiento = [
      { name: 'Declarado', value: f29Count['Declarado'], color: '#10b981' },
      { name: 'Pendiente', value: f29Count['Pendiente'], color: '#f59e0b' },
      { name: 'No declarar', value: f29Count['No declarar'], color: '#64748b' },
    ];

    // Distribución por plan
    const planMap = {};
    lista.forEach(c => {
      const plan = String(c.plan_nombre || c.plan || 'FREE').toUpperCase();
      planMap[plan] = (planMap[plan] || 0) + 1;
    });
    const planes = Object.entries(planMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    // Top deudores
    const topDeudores = [...lista]
      .map(c => ({ name: c.razon_social || c.razonSocial || 'Sin nombre', value: deudaDe(c) }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);

    return { total, criticos, f29Pendientes, alDia, deudaTotal, scoreProm, estadoPago, cumplimiento, planes, topDeudores };
  }, [clients]);

  const safeCashFlow = useMemo(() => (cashFlow || []).map(d => ({ ...d, name: cleanStr(d.name) })), [cashFlow]);
  const pctAlDia = m.total ? Math.round((m.alDia / m.total) * 100) : 0;
  const truncar = (s) => (s && s.length > 16 ? s.slice(0, 15) + '…' : s);

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 animate-in fade-in duration-500">

      {/* ===== KPIs ===== */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <KpiCard icon={Users} label="Clientes" value={m.total} color="text-blue-500" />
        <KpiCard icon={CheckCircle2} label="Al día" value={m.alDia} sub={`${pctAlDia}% de la cartera`} color="text-emerald-500" />
        <KpiCard icon={AlertTriangle} label="Críticos" value={m.criticos} color="text-red-500" />
        <KpiCard icon={FileText} label="F29 pendientes" value={m.f29Pendientes} color="text-amber-500" />
        <KpiCard icon={DollarSign} label="Deuda estimada" value={fmtCompact(m.deudaTotal)} sub="no pagados / suspendidos" color="text-red-500" />
        <KpiCard icon={Gauge} label="Score promedio" value={m.scoreProm} color="text-purple-500" />
      </div>

      {/* ===== GRÁFICOS (datos reales) ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-6">

        {/* Estado de pago */}
        <ChartCard icon={PieIcon} title="Estado de Pago" color="text-emerald-500">
          <PieChart>
            <Pie data={m.estadoPago} cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={4} dataKey="value" stroke="none">
              {m.estadoPago.map((e, i) => <Cell key={i} fill={e.color} />)}
            </Pie>
            <Tooltip formatter={(v, n) => [`${v} clientes`, n]} contentStyle={TOOLTIP_STYLE} />
            <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 'black', textTransform: 'uppercase', color: '#94a3b8' }} />
          </PieChart>
        </ChartCard>

        {/* Cumplimiento F29 */}
        <ChartCard icon={Activity} title="Cumplimiento Tributario (F29)" color="text-blue-500">
          <BarChart layout="vertical" data={m.cumplimiento} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
            <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 'black' }} />
            <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 'black' }} width={90} />
            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={(v) => [`${v} clientes`, 'Cantidad']} contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={26}>
              {m.cumplimiento.map((e, i) => <Cell key={i} fill={e.color} />)}
            </Bar>
          </BarChart>
        </ChartCard>

        {/* Distribución por plan */}
        <ChartCard icon={PieIcon} title="Clientes por Plan" color="text-purple-500">
          <BarChart layout="vertical" data={m.planes} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
            <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 'black' }} />
            <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 'black' }} width={110} tickFormatter={truncar} />
            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={(v) => [`${v} clientes`, 'Cantidad']} contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={20} />
          </BarChart>
        </ChartCard>

        {/* Top deudores */}
        <ChartCard icon={AlertTriangle} title="Top Deuda por Cliente (impuesto a pagar)" color="text-red-500">
          {m.topDeudores.length > 0 ? (
            <BarChart layout="vertical" data={m.topDeudores} margin={{ top: 5, right: 50, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11, fontWeight: 'black' }} tickFormatter={fmtCompact} />
              <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'black' }} width={120} tickFormatter={truncar} />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={(v) => [fmtPeso(v), 'A pagar']} contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="value" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={16} />
            </BarChart>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-500 text-xs italic">Sin montos de deuda registrados.</div>
          )}
        </ChartCard>
      </div>

      {/* ===== Flujo de caja (estimación / histórico) ===== */}
      {safeCashFlow.length > 0 && (
        <div className="bg-white border border-[#efe8dd] p-6 rounded-[2rem] backdrop-blur-md mb-10" style={{ height: 360 }}>
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
            <TrendingUp className="text-blue-500" size={16} /> {cleanStr('Flujo de Caja & Estimación')}
            <span className="ml-2 text-[9px] font-bold text-slate-500 normal-case tracking-normal">(datos de ejemplo · pendiente conectar histórico real)</span>
          </h3>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={safeCashFlow}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 'black' }} dy={10} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                <Bar dataKey="facturado" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} name={cleanStr('Facturado')} />
                <Bar dataKey="recaudado" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} name={cleanStr('Recaudado')} />
                <Line type="monotone" dataKey="dts" stroke="#f59e0b" strokeWidth={2} name={cleanStr('Carga (DTs)')} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};

export default CrmAnalytics;
