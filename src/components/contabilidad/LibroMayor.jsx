import React from 'react';
import { motion } from 'framer-motion';
import { Calculator, Loader2, FileWarning } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { getBalanceApi } from '@/services/accountingService';

const formatCLP = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(val || 0);

const LibroMayor = ({ empresaId, rango }) => {
  const { user } = useAuth();
  const usaRango = !!(rango?.desde && rango?.hasta);

  const { data, isLoading } = useQuery({
    queryKey: ['libro-mayor', empresaId, rango?.desde, rango?.hasta],
    queryFn: async () => {
      const res = usaRango
        ? await getBalanceApi(user.sessionId, empresaId, undefined, undefined, rango.desde, rango.hasta)
        : await getBalanceApi(user.sessionId, empresaId);
      if (!res.ok) throw new Error('Error al cargar el Libro Mayor');
      return res.json();
    },
    enabled: !!user?.sessionId,
    staleTime: 0,
  });

  const cuentas = data?.libroMayor || [];
  const tot = (data?.totales) || { debe: 0, haber: 0 };

  if (isLoading) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-gray-500">
        <Loader2 className="h-10 w-10 animate-spin mb-4 text-blue-500 opacity-40" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em]">Mayorizando cuentas...</p>
      </div>
    );
  }

  if (!cuentas.length) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-center text-gray-500 bg-white/5 rounded-xl border border-white/10">
        <FileWarning className="h-12 w-12 mb-4 opacity-20" />
        <h4 className="text-xs font-black uppercase text-white/40">Sin movimientos</h4>
        <p className="text-[10px] mt-2 max-w-xs">Contabiliza movimientos para ver los saldos por cuenta.</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      className="bg-[#0f172a]/80 rounded-xl border border-white/5 overflow-hidden shadow-2xl">
      <div className="p-4 border-b border-white/10 flex items-center gap-3 bg-black/20">
        <div className="p-2 bg-pink-500/10 rounded-lg text-pink-400"><Calculator size={18} /></div>
        <h3 className="text-white font-black uppercase tracking-widest text-sm">Libro Mayor</h3>
      </div>

      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left text-sm min-w-[760px]">
          <thead className="bg-white/5 border-b border-white/10 text-[10px] uppercase tracking-widest font-black text-gray-400">
            <tr>
              <th className="px-5 py-4">Código</th>
              <th className="px-5 py-4">Cuenta</th>
              <th className="px-5 py-4 text-right">Debe</th>
              <th className="px-5 py-4 text-right">Haber</th>
              <th className="px-5 py-4 text-center">Naturaleza</th>
              <th className="px-5 py-4 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {cuentas.map((c) => (
              <tr key={c.codigo} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-5 py-3 font-mono text-xs text-blue-300 font-bold">{c.codigo}</td>
                <td className="px-5 py-3 text-xs text-white font-bold uppercase tracking-tight">{c.nombre}</td>
                <td className="px-5 py-3 text-right font-mono text-xs text-emerald-400 font-bold">{c.debe > 0 ? formatCLP(c.debe) : <span className="text-gray-700">—</span>}</td>
                <td className="px-5 py-3 text-right font-mono text-xs text-orange-400 font-bold">{c.haber > 0 ? formatCLP(c.haber) : <span className="text-gray-700">—</span>}</td>
                <td className="px-5 py-3 text-center">
                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${
                    c.naturaleza === 'DEUDOR' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-orange-400 bg-orange-500/10 border-orange-500/20'
                  }`}>{c.naturaleza}</span>
                </td>
                <td className="px-5 py-3 text-right font-mono text-xs font-black text-white">{formatCLP(c.saldo)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-white/5 border-t border-white/10">
            <tr>
              <td colSpan={2} className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Totales</td>
              <td className="px-5 py-3 text-right font-mono text-xs font-black text-emerald-400">{formatCLP(tot.debe)}</td>
              <td className="px-5 py-3 text-right font-mono text-xs font-black text-orange-400">{formatCLP(tot.haber)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </motion.div>
  );
};

export default LibroMayor;
