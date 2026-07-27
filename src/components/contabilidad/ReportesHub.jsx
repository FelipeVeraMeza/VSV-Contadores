import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Calculator, BarChart3, TrendingUp } from 'lucide-react';
import AsientosContables from '@/components/contabilidad/AsientosContables';
import LibroMayor from '@/components/contabilidad/LibroMayor';
import Balances from '@/components/contabilidad/Balances';

const REPORTES = [
  { id: 'libro-diario', name: 'Libro Diario',         icon: FileText },
  { id: 'libro-mayor',  name: 'Libro Mayor',          icon: Calculator },
  { id: 'balance',      name: 'Balance General',      icon: BarChart3 },
  { id: 'resultados',   name: 'Estado de Resultados', icon: TrendingUp },
];

const ReportesHub = ({ empresaId, rango }) => {
  const [activo, setActivo] = useState('libro-diario');

  return (
    <div className="space-y-5">
      {/* Submenú desplegable de Reportes */}
      <div className="flex flex-wrap gap-2 bg-slate-50 p-2 rounded-2xl border border-[#efe8dd]">
        {REPORTES.map(r => {
          const Icon = r.icon;
          const isActive = activo === r.id;
          return (
            <button key={r.id} onClick={() => setActivo(r.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-lg shadow-emerald-900/30'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}>
              <Icon className="h-4 w-4" /> {r.name}
            </button>
          );
        })}
      </div>

      <motion.div key={activo} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        {activo === 'libro-diario' && <AsientosContables empresaId={empresaId} rango={rango} />}
        {activo === 'libro-mayor'  && <LibroMayor empresaId={empresaId} rango={rango} />}
        {activo === 'balance'      && <Balances empresaId={empresaId} rango={rango} vista="balance" />}
        {activo === 'resultados'   && <Balances empresaId={empresaId} rango={rango} vista="resultados" />}
      </motion.div>
    </div>
  );
};

export default ReportesHub;
