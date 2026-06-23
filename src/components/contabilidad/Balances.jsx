import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, FileWarning, Loader2, CheckCircle, AlertCircle, CalendarDays, TrendingUp, TrendingDown, FileDown } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { getBalanceApi } from '@/services/accountingService';
import { toast } from '@/components/ui/use-toast';
import { API_BASE_URL } from '../../../config.js';

const formatCLP = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(val || 0);

const MESES = [
  { v:'01',l:'Enero' },{ v:'02',l:'Febrero' },{ v:'03',l:'Marzo' },{ v:'04',l:'Abril' },
  { v:'05',l:'Mayo' },{ v:'06',l:'Junio' },{ v:'07',l:'Julio' },{ v:'08',l:'Agosto' },
  { v:'09',l:'Septiembre' },{ v:'10',l:'Octubre' },{ v:'11',l:'Noviembre' },{ v:'12',l:'Diciembre' },
];
const ANIOS = ['2024', '2025', '2026', '2027'];

const Balances = ({ empresaId, periodoInicial, rango, vista = 'completo' }) => {
  const { user } = useAuth();
  const now = new Date();
  const [modo, setModo] = useState(periodoInicial?.tipo || 'acumulado'); // 'acumulado' | 'mensual' | 'anual'
  const [mes, setMes]   = useState(periodoInicial?.mes || (now.getMonth() + 1).toString().padStart(2, '0'));
  const [anio, setAnio] = useState(periodoInicial?.anio || now.getFullYear().toString());
  const [isPdf, setIsPdf] = useState(false);

  const handleExportPdf = async () => {
    setIsPdf(true);
    try {
      const params = new URLSearchParams({ empresaId: empresaId ?? 'ALL' });
      if (usaRango) { params.set('desde', rango.desde); params.set('hasta', rango.hasta); }
      else if (modo === 'mensual') { params.set('mes', mes); params.set('anio', anio); }
      else if (modo === 'anual') { params.set('anio', anio); }
      const res = await fetch(`${API_BASE_URL}/accounting/balance/pdf?${params.toString()}`, {
        headers: { 'x-session-id': user.sessionId },
      });
      if (!res.ok) throw new Error('No se pudo generar el PDF');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Balance_General_${usaRango ? `${rango.desde}_${rango.hasta}` : modo === 'mensual' ? `${mes}-${anio}` : modo === 'anual' ? `Año_${anio}` : 'Acumulado'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast({ title: '📄 Balance descargado', description: 'Revisa la carpeta de descargas.' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setIsPdf(false);
    }
  };

  const usaRango = !!(rango?.desde && rango?.hasta);
  const { data, isLoading } = useQuery({
    queryKey: ['balance', empresaId, modo, mes, anio, rango?.desde, rango?.hasta],
    queryFn: async () => {
      const res = usaRango
        ? await getBalanceApi(user.sessionId, empresaId, undefined, undefined, rango.desde, rango.hasta)
        : await getBalanceApi(
            user.sessionId, empresaId,
            modo === 'mensual' ? mes : undefined,
            (modo === 'mensual' || modo === 'anual') ? anio : undefined,
          );
      if (!res.ok) throw new Error('Error al calcular el balance');
      return res.json();
    },
    enabled: !!user?.sessionId,
    staleTime: 0,
  });

  const bg = data?.balanceGeneral || {};
  const er = data?.estadoResultados || {};
  const activos = bg.activos || [];
  const pasivos = bg.pasivos || [];
  const ingresos = er.ingresos || [];
  const gastos = er.gastos || [];
  const utilidad = bg.utilidad || 0;
  const totalActivos = bg.totalActivos || 0;
  const totalPasivosPatrimonio = (bg.totalPasivos || 0) + utilidad;
  const cuadrado = bg.cuadrado;
  const hayDatos = activos.length || pasivos.length || ingresos.length || gastos.length;

  const Fila = ({ nombre, codigo, monto, color }) => (
    <div className="flex items-center justify-between py-2 px-3 hover:bg-white/[0.03] rounded-lg transition-colors">
      <div className="min-w-0">
        <p className="text-xs text-white font-bold truncate uppercase tracking-tight">{nombre}</p>
        <p className="text-[9px] text-gray-500 font-mono">{codigo}</p>
      </div>
      <span className={`text-xs font-mono font-black ${color}`}>{formatCLP(monto)}</span>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* CONTROLES DE PERÍODO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {usaRango ? (
          <div className="text-[10px] font-black uppercase tracking-widest text-blue-400 flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5" /> Rango: {rango.desde} → {rango.hasta}
          </div>
        ) : (
        <div className="flex items-center gap-2">
          <button onClick={() => setModo('acumulado')}
            className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${modo === 'acumulado' ? 'bg-blue-600 text-white' : 'bg-black/40 border border-white/10 text-gray-400 hover:text-white'}`}>
            Acumulado
          </button>
          <button onClick={() => setModo('mensual')}
            className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${modo === 'mensual' ? 'bg-blue-600 text-white' : 'bg-black/40 border border-white/10 text-gray-400 hover:text-white'}`}>
            Mensual
          </button>
          <button onClick={() => setModo('anual')}
            className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${modo === 'anual' ? 'bg-blue-600 text-white' : 'bg-black/40 border border-white/10 text-gray-400 hover:text-white'}`}>
            Anual
          </button>
          {(modo === 'mensual' || modo === 'anual') && (
            <div className="flex items-center bg-black/40 border border-white/10 rounded-lg px-1">
              <CalendarDays className="h-3.5 w-3.5 text-blue-400 ml-2" />
              {modo === 'mensual' && (
                <select value={mes} onChange={e => setMes(e.target.value)}
                  className="bg-transparent text-white text-[10px] font-black uppercase tracking-widest px-2 py-2 focus:outline-none cursor-pointer">
                  {MESES.map(m => <option key={m.v} value={m.v} className="bg-slate-900">{m.l}</option>)}
                </select>
              )}
              <select value={anio} onChange={e => setAnio(e.target.value)}
                className="bg-transparent text-white text-[10px] font-black uppercase tracking-widest px-2 py-2 focus:outline-none cursor-pointer">
                {ANIOS.map(a => <option key={a} value={a} className="bg-slate-900">{a}</option>)}
              </select>
            </div>
          )}
        </div>
        )}

        {/* Indicador de cuadre + exportar */}
        <div className="flex items-center gap-2">
          {hayDatos && (
            cuadrado ? (
              <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-lg border border-emerald-500/20">
                <CheckCircle className="h-3.5 w-3.5" />
                <span className="text-[10px] font-black uppercase tracking-widest">Balance Cuadrado</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-amber-400 bg-amber-500/10 px-3 py-2 rounded-lg border border-amber-500/20">
                <AlertCircle className="h-3.5 w-3.5" />
                <span className="text-[10px] font-black uppercase tracking-widest">
                  Descuadre {formatCLP(Math.abs(totalActivos - totalPasivosPatrimonio))}
                </span>
              </div>
            )
          )}
          <button onClick={handleExportPdf} disabled={!hayDatos || isPdf}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            {isPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
            {isPdf ? 'Generando...' : 'Exportar PDF'}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="h-64 flex flex-col items-center justify-center text-gray-500">
          <Loader2 className="h-10 w-10 animate-spin mb-4 text-blue-500 opacity-40" />
          <p className="text-[10px] font-black uppercase tracking-[0.3em]">Calculando Estados Financieros...</p>
        </div>
      ) : !hayDatos ? (
        <div className="h-64 flex flex-col items-center justify-center text-center text-gray-500 bg-white/5 rounded-xl border border-white/10">
          <FileWarning className="h-12 w-12 mb-4 opacity-20" />
          <h4 className="text-xs font-black uppercase text-white/40">Sin datos contabilizados</h4>
          <p className="text-[10px] mt-2 max-w-xs">Contabiliza movimientos (botón "Contabilizar Todo") para generar los saldos del balance.</p>
        </div>
      ) : (
        <div className={`grid grid-cols-1 gap-6 ${vista === 'completo' ? 'lg:grid-cols-2' : 'max-w-3xl'}`}>
          {/* BALANCE GENERAL */}
          {(vista === 'completo' || vista === 'balance') && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="bg-white/5 rounded-xl p-6 border border-white/10 backdrop-blur-md">
            <h3 className="text-lg font-black text-white mb-4 uppercase italic tracking-tighter flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-400" /> Balance General
            </h3>

            {/* Activos */}
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1 mt-2">Activos</p>
            <div className="divide-y divide-white/5">
              {activos.length ? activos.map(c => <Fila key={c.codigo} {...c} color="text-emerald-400" />)
                : <p className="text-[10px] text-gray-600 py-2 px-3">Sin activos</p>}
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/10 px-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total Activos</span>
              <span className="text-sm font-mono font-black text-emerald-300">{formatCLP(totalActivos)}</span>
            </div>

            {/* Pasivos + Patrimonio */}
            <p className="text-[10px] font-black uppercase tracking-widest text-red-400 mb-1 mt-5">Pasivos y Patrimonio</p>
            <div className="divide-y divide-white/5">
              {pasivos.length ? pasivos.map(c => <Fila key={c.codigo} {...c} color="text-red-400" />)
                : <p className="text-[10px] text-gray-600 py-2 px-3">Sin pasivos</p>}
              <div className="flex items-center justify-between py-2 px-3">
                <div>
                  <p className="text-xs text-white font-bold uppercase tracking-tight">Resultado del Ejercicio</p>
                  <p className="text-[9px] text-gray-500">Utilidad / Pérdida</p>
                </div>
                <span className={`text-xs font-mono font-black ${utilidad >= 0 ? 'text-blue-400' : 'text-red-400'}`}>{formatCLP(utilidad)}</span>
              </div>
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/10 px-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total Pasivo + Patrimonio</span>
              <span className="text-sm font-mono font-black text-red-300">{formatCLP(totalPasivosPatrimonio)}</span>
            </div>
          </motion.div>
          )}

          {/* ESTADO DE RESULTADOS */}
          {(vista === 'completo' || vista === 'resultados') && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
            className="bg-white/5 rounded-xl p-6 border border-white/10 backdrop-blur-md">
            <h3 className="text-lg font-black text-white mb-4 uppercase italic tracking-tighter flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-purple-400" /> Estado de Resultados
            </h3>

            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1 mt-2 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Ingresos
            </p>
            <div className="divide-y divide-white/5">
              {ingresos.length ? ingresos.map(c => <Fila key={c.codigo} nombre={c.nombre} codigo={c.codigo} monto={c.monto} color="text-emerald-400" />)
                : <p className="text-[10px] text-gray-600 py-2 px-3">Sin ingresos</p>}
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/10 px-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total Ingresos</span>
              <span className="text-sm font-mono font-black text-emerald-300">{formatCLP(er.totalIngresos)}</span>
            </div>

            <p className="text-[10px] font-black uppercase tracking-widest text-red-400 mb-1 mt-5 flex items-center gap-1">
              <TrendingDown className="h-3 w-3" /> Gastos
            </p>
            <div className="divide-y divide-white/5">
              {gastos.length ? gastos.map(c => <Fila key={c.codigo} nombre={c.nombre} codigo={c.codigo} monto={c.monto} color="text-red-400" />)
                : <p className="text-[10px] text-gray-600 py-2 px-3">Sin gastos</p>}
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/10 px-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total Gastos</span>
              <span className="text-sm font-mono font-black text-red-300">{formatCLP(er.totalGastos)}</span>
            </div>

            {/* Resultado */}
            <div className="mt-5 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-xl p-5 border border-white/10">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-sm font-bold text-white uppercase tracking-tight">
                  {utilidad >= 0 ? 'Utilidad del Ejercicio' : 'Pérdida del Ejercicio'}
                </h4>
                <span className="text-[10px] font-black text-gray-400 uppercase">Margen {er.margen}%</span>
              </div>
              <p className={`text-3xl font-black tracking-tighter ${utilidad >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatCLP(utilidad)}
              </p>
            </div>
          </motion.div>
          )}
        </div>
      )}
    </div>
  );
};

export default Balances;
