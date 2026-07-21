import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Loader2, Search, CheckCircle2, AlertTriangle, Clock, FileText, Receipt,
  RefreshCw, CalendarClock, Wallet, Building2
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth.jsx';
import { toast } from '@/components/ui/use-toast';
import {
  getCobrosApi, getResumenCobrosApi, generarCobrosApi,
  cambiarEstadoCobroApi, editarMontoCobroApi
} from '@/services/cobrosService';

const clp = (n) => `$${Number(n || 0).toLocaleString('es-CL')}`;
const mesActual = () => new Date().toISOString().slice(0, 7); // YYYY-MM

// Etiqueta y color por estado del cobro
const estiloEstado = (c) => {
  if (c.estado === 'POR_EMITIR')       return { label: 'Por emitir',   c: 'text-blue-300 bg-blue-500/10 border-blue-500/30' };
  if (c.estado === 'PAGADA')           return { label: 'Pagada',       c: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' };
  if (c.estado === 'PENDIENTE_RECIBO') return { label: 'Pend. recibo', c: 'text-sky-300 bg-sky-500/10 border-sky-500/30' };
  if (c.vencido)                       return { label: 'Vencido',      c: 'text-red-300 bg-red-500/10 border-red-500/30' };
  return { label: 'Pend. pago', c: 'text-amber-300 bg-amber-500/10 border-amber-500/30' };
};

const Kpi = ({ icon: Icon, label, value, sub, color }) => (
  <div className="flex items-center gap-3 bg-black/30 border border-white/10 rounded-2xl px-4 py-3">
    <span className={`p-2 rounded-xl ${color}`}><Icon size={16} /></span>
    <div className="min-w-0">
      <p className="text-[9px] font-black uppercase tracking-widest text-gray-500">{label}</p>
      <p className="text-lg font-black text-white leading-tight tabular-nums">{value}</p>
      {sub && <p className="text-[9px] text-gray-500 font-bold">{sub}</p>}
    </div>
  </div>
);

const CobrosMensuales = () => {
  const { user } = useAuth();
  const [periodo, setPeriodo] = useState(mesActual());
  const [cobros, setCobros] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [filtro, setFiltro] = useState('TODOS');
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [editando, setEditando] = useState(null);   // id del cobro en edición
  const [montoTmp, setMontoTmp] = useState('');

  const cargar = useCallback(async () => {
    if (!user?.sessionId) return;
    setLoading(true);
    try {
      const [rc, rr] = await Promise.all([
        getCobrosApi(user.sessionId, { periodo }),
        getResumenCobrosApi(user.sessionId, periodo)
      ]);
      const dc = await rc.json();
      const dr = await rr.json();
      if (dc?.success) setCobros(dc.cobros || []);
      if (dr?.success) setResumen(dr);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los cobros.' });
    } finally {
      setLoading(false);
    }
  }, [user?.sessionId, periodo]);

  useEffect(() => { cargar(); }, [cargar]);

  const generar = async () => {
    setGenerando(true);
    try {
      const res = await generarCobrosApi(user.sessionId);
      const d = await res.json();
      toast({ title: '✅ Cobros generados', description: d?.message || '' });
      cargar();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron generar los cobros.' });
    } finally {
      setGenerando(false);
    }
  };

  const marcar = async (cobro, estado) => {
    try {
      const res = await cambiarEstadoCobroApi(user.sessionId, cobro.id, estado);
      const d = await res.json();
      if (d?.success) {
        setCobros(prev => prev.map(c => c.id === cobro.id ? { ...c, estado, vencido: false } : c));
        cargar();
      } else {
        toast({ variant: 'destructive', title: 'Error', description: d?.message || 'No se pudo actualizar.' });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el cobro.' });
    }
  };

  // Corrige el monto a mano (excepciones negociadas / planes sin precio)
  const guardarMonto = async (cobro) => {
    const monto = Number(String(montoTmp).replace(/[^\d]/g, ''));
    setEditando(null);
    if (!Number.isFinite(monto) || monto === cobro.montoEsperado) return;
    try {
      const res = await editarMontoCobroApi(user.sessionId, cobro.id, monto);
      const d = await res.json();
      if (d?.success) {
        setCobros(prev => prev.map(c => c.id === cobro.id ? { ...c, montoEsperado: monto } : c));
        toast({ title: '✅ Monto actualizado', description: `${cobro.razonSocial}: ${clp(monto)}` });
        cargar();
      } else {
        toast({ variant: 'destructive', title: 'Error', description: d?.message || 'No se pudo guardar.' });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar el monto.' });
    }
  };

  const filtrados = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    return cobros.filter(c => {
      const matchTexto = !term || String(c.razonSocial || '').toLowerCase().includes(term);
      if (!matchTexto) return false;
      if (filtro === 'TODOS') return true;
      if (filtro === 'VENCIDOS') return c.vencido;
      return c.estado === filtro;
    });
  }, [cobros, filtro, busqueda]);

  const FILTROS = [
    { id: 'TODOS', label: 'Todos' },
    { id: 'POR_EMITIR', label: 'Por emitir' },
    { id: 'PENDIENTE_PAGO', label: 'Pend. pago' },
    { id: 'VENCIDOS', label: 'Vencidos' },
    { id: 'PAGADA', label: 'Pagadas' },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">

      {/* AVISO DEL DÍA 26 — o cuenta regresiva si aún no toca */}
      {resumen?.avisoFacturacion ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3">
          <CalendarClock className="h-5 w-5 text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-amber-200 font-black uppercase tracking-widest text-[11px]">Toca facturar</p>
            <p className="text-gray-300 text-xs">
              Quedan <span className="font-black text-white">{resumen.porEmitir}</span> empresas por facturar este periodo
              ({clp(resumen.montoPorEmitir)}).
            </p>
          </div>
        </div>
      ) : resumen?.porEmitir > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-blue-500/[0.07] border border-blue-500/20 rounded-2xl px-4 py-3">
          <CalendarClock className="h-5 w-5 text-blue-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-blue-300 font-black uppercase tracking-widest text-[11px]">
              Próxima facturación: día {resumen.diaFacturacion}
            </p>
            <p className="text-gray-400 text-xs">
              {resumen.diasParaFacturar === 0
                ? 'Es hoy.'
                : <>Faltan <span className="font-black text-white">{resumen.diasParaFacturar}</span> días.</>}
              {' '}Hay <span className="font-black text-white">{resumen.porEmitir}</span> empresas por facturar ({clp(resumen.montoPorEmitir)}).
            </p>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={FileText} label="Por emitir" value={resumen?.porEmitir ?? 0}
             sub={clp(resumen?.montoPorEmitir)} color="bg-blue-500/15 text-blue-400" />
        <Kpi icon={Clock} label="Pendiente pago" value={resumen?.pendientePago ?? 0}
             color="bg-amber-500/15 text-amber-400" />
        <Kpi icon={AlertTriangle} label="Vencidos" value={resumen?.vencidos ?? 0}
             color="bg-red-500/15 text-red-400" />
        <Kpi icon={Wallet} label="Total del mes" value={clp(resumen?.montoEsperado)}
             sub={`${resumen?.total ?? 0} empresas`} color="bg-emerald-500/15 text-emerald-400" />
      </div>

      {/* Barra de control */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <input
          type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)}
          className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-white [color-scheme:dark] focus:outline-none focus:border-blue-500/60"
        />
        <div className="flex flex-wrap gap-1.5 bg-black/40 p-1 rounded-xl border border-white/10 w-fit">
          {FILTROS.map(f => (
            <button key={f.id} onClick={() => setFiltro(f.id)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                filtro === f.id ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={15} />
          <input
            placeholder="Buscar empresa..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-black/30 border border-white/10 rounded-xl text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/60"
          />
        </div>
        <button onClick={generar} disabled={generando}
          className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-60">
          {generando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Generar cobros
        </button>
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border border-white/10 bg-[#0f172a]/50 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 text-blue-500 animate-spin" /></div>
        ) : (
          <div className="overflow-auto max-h-[52vh]">
            <table className="w-full min-w-[720px] text-left border-collapse">
              <thead className="bg-[#0f172a] sticky top-0 z-10">
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-widest text-gray-500">
                  <th className="px-4 py-2.5 font-black">Empresa</th>
                  <th className="px-4 py-2.5 font-black">Plan</th>
                  <th className="px-4 py-2.5 font-black text-right">Monto</th>
                  <th className="px-4 py-2.5 font-black">Folio</th>
                  <th className="px-4 py-2.5 font-black">Estado</th>
                  <th className="px-4 py-2.5 font-black text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(c => {
                  const st = estiloEstado(c);
                  return (
                    <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="w-7 h-7 rounded-lg bg-blue-500/15 border border-white/10 flex items-center justify-center text-blue-400 shrink-0">
                            <Building2 size={13} />
                          </span>
                          <span className="font-bold text-white text-xs uppercase truncate max-w-[220px]" title={c.razonSocial}>
                            {c.razonSocial}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-[9px] font-black uppercase text-gray-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded-md">{c.plan}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {editando === c.id ? (
                          <input
                            autoFocus type="text" value={montoTmp}
                            onChange={(e) => setMontoTmp(e.target.value)}
                            onBlur={() => guardarMonto(c)}
                            onKeyDown={(e) => { if (e.key === 'Enter') guardarMonto(c); if (e.key === 'Escape') setEditando(null); }}
                            className="w-28 text-right bg-black/50 border border-blue-500/60 rounded-lg px-2 py-1 text-sm text-white font-mono focus:outline-none"
                          />
                        ) : (
                          <button
                            onClick={() => { setEditando(c.id); setMontoTmp(String(c.montoEsperado)); }}
                            title="Clic para corregir el monto"
                            className={`font-mono font-bold text-sm hover:underline decoration-dotted ${c.montoEsperado > 0 ? 'text-white' : 'text-amber-400'}`}
                          >
                            {clp(c.montoEsperado)}
                          </button>
                        )}
                        {c.montoFacturado !== null && !c.montoCoincide && c.estado !== 'POR_EMITIR' && (
                          <p className="text-[9px] font-black text-red-400 uppercase">Facturado {clp(c.montoFacturado)} ⚠</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-[10px] font-mono text-gray-400">{c.folio || '—'}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex text-[9px] font-black px-2 py-0.5 rounded-full border uppercase ${st.c}`}>{st.label}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          {c.estado !== 'PAGADA' && c.estado !== 'POR_EMITIR' && (
                            <button onClick={() => marcar(c, 'PAGADA')} title="Marcar como pagada"
                              className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-1 rounded-lg transition-colors">
                              <CheckCircle2 size={11} /> Pagada
                            </button>
                          )}
                          {c.estado === 'PENDIENTE_PAGO' && (
                            <button onClick={() => marcar(c, 'PENDIENTE_RECIBO')} title="Pagó, falta el recibo"
                              className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-sky-300 hover:text-sky-200 bg-sky-500/10 hover:bg-sky-500/20 px-2 py-1 rounded-lg transition-colors">
                              <Receipt size={11} /> Recibo
                            </button>
                          )}
                          {c.estado === 'PAGADA' && (
                            <button onClick={() => marcar(c, 'PENDIENTE_PAGO')} title="Revertir a pendiente"
                              className="text-[9px] font-black uppercase tracking-widest text-gray-500 hover:text-white transition-colors px-2 py-1">
                              Revertir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtrados.length === 0 && (
                  <tr><td colSpan="6" className="p-10 text-center text-gray-500 text-xs font-bold uppercase tracking-widest">
                    No hay cobros que coincidan con el filtro.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest text-center">
        Mostrando {filtrados.length} de {cobros.length} cobros · Vencimiento: día 5 del mes siguiente
      </p>
    </motion.div>
  );
};

export default CobrosMensuales;
