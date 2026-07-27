import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Bell, CalendarClock, AlertTriangle, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth.jsx';
import { getResumenCobrosApi } from '@/services/cobrosService';

const clp = (n) => `$${Number(n || 0).toLocaleString('es-CL')}`;

// Campana del header: avisa desde el día 26 que hay facturas por emitir,
// y muestra los cobros vencidos (pasado el día 5).
const AvisoFacturacion = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [resumen, setResumen] = useState(null);
  const [abierto, setAbierto] = useState(false);

  const esAdmin = user?.rol === 'Administrador';

  useEffect(() => {
    if (!esAdmin || !user?.sessionId) return;
    let cancelado = false;
    (async () => {
      try {
        const res = await getResumenCobrosApi(user.sessionId);
        const data = await res.json();
        if (!cancelado && data?.success) setResumen(data);
      } catch { /* silencioso: el aviso no debe romper el header */ }
    })();
    return () => { cancelado = true; };
  }, [esAdmin, user?.sessionId]);

  if (!esAdmin || !resumen) return null;

  const avisoFacturar = !!resumen.avisoFacturacion;   // día ≥ 26 y quedan por emitir
  const vencidos = resumen.vencidos || 0;
  const totalAvisos = (avisoFacturar ? 1 : 0) + (vencidos > 0 ? 1 : 0);

  const irACobros = () => { setAbierto(false); navigate('/facturacion'); };

  return (
    <div className="relative">
      <button
        onClick={() => setAbierto(v => !v)}
        className="relative h-10 w-10 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors"
        title="Avisos de facturación"
      >
        <Bell size={18} />
        {totalAvisos > 0 && (
          <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white animate-pulse" />
        )}
      </button>

      <AnimatePresence>
        {abierto && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              className="absolute right-0 mt-2 w-80 bg-white border border-[#e5ddd0] rounded-2xl shadow-xl shadow-black/[0.08] z-50 overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#efe8dd]">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Avisos</span>
                <button onClick={() => setAbierto(false)} className="text-slate-400 hover:text-slate-700"><X size={14} /></button>
              </div>

              <div className="p-2 space-y-1.5">
                {avisoFacturar && (
                  <button onClick={irACobros} className="w-full text-left p-3 rounded-xl bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors">
                    <p className="flex items-center gap-1.5 text-amber-700 font-black uppercase tracking-widest text-[10px]">
                      <CalendarClock size={12} /> Toca facturar
                    </p>
                    <p className="text-slate-600 text-xs mt-1 leading-relaxed">
                      Quedan <span className="font-black text-slate-900">{resumen.porEmitir}</span> empresas por facturar
                      este mes ({clp(resumen.montoPorEmitir)}).
                    </p>
                  </button>
                )}

                {vencidos > 0 && (
                  <button onClick={irACobros} className="w-full text-left p-3 rounded-xl bg-red-50 border border-red-200 hover:bg-red-100 transition-colors">
                    <p className="flex items-center gap-1.5 text-red-600 font-black uppercase tracking-widest text-[10px]">
                      <AlertTriangle size={12} /> Pagos vencidos
                    </p>
                    <p className="text-slate-600 text-xs mt-1 leading-relaxed">
                      <span className="font-black text-slate-900">{vencidos}</span> cobros pasaron el vencimiento (día 5).
                    </p>
                  </button>
                )}

                {/* Cuenta regresiva: siempre visible cuando aún no toca facturar */}
                {!avisoFacturar && resumen.porEmitir > 0 && (
                  <button onClick={irACobros} className="w-full text-left p-3 rounded-xl bg-slate-50 border border-[#efe8dd] hover:bg-slate-100 transition-colors">
                    <p className="flex items-center gap-1.5 text-[#199b4d] font-black uppercase tracking-widest text-[10px]">
                      <CalendarClock size={12} /> Próxima facturación: día {resumen.diaFacturacion}
                    </p>
                    <p className="text-slate-500 text-xs mt-1 leading-relaxed">
                      Faltan <span className="font-black text-slate-900">{resumen.diasParaFacturar}</span> días ·
                      {' '}<span className="font-black text-slate-900">{resumen.porEmitir}</span> empresas por facturar.
                    </p>
                  </button>
                )}

                {totalAvisos === 0 && resumen.porEmitir === 0 && (
                  <p className="p-4 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">
                    Todo al día ✓
                  </p>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AvisoFacturacion;
