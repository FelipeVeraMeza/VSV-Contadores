import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Hammer, CalendarRange } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

import MovimientosContables from '@/components/contabilidad/MovimientosContables';
import AsientosContables from '@/components/contabilidad/AsientosContables';
import ConciliacionBancaria from '@/components/contabilidad/ConciliacionBancaria';
import ReportesHub from '@/components/contabilidad/ReportesHub';
import GestionCaja from '@/components/contabilidad/GestionCaja';

const TITULOS = {
  compras: 'Compras', ventas: 'Ventas', honorarios: 'Honorarios',
  recaudaciones: 'Recaudaciones', pagos: 'Pagos', centralizacion: 'Centralización',
  traspaso: 'Traspaso Apertura', reportes: 'Reportes',
};

const hoy = () => new Date().toISOString().slice(0, 10);

const EnConstruccion = ({ titulo }) => (
  <div className="h-[55vh] flex flex-col items-center justify-center text-center">
    <div className="bg-slate-50 p-6 rounded-full mb-4 border border-[#efe8dd]">
      <Hammer className="h-10 w-10 text-amber-600" />
    </div>
    <h3 className="text-slate-900 font-black uppercase tracking-tight text-lg">{titulo}</h3>
    <p className="text-slate-400 text-xs mt-2 uppercase tracking-widest font-bold max-w-md leading-relaxed">
      Este submódulo está en construcción. Próximamente disponible.
    </p>
  </div>
);

// Selector de rango de fechas global (compartido por todas las secciones)
const SelectorRango = ({ rango, setRango }) => {
  const anioActual = new Date().getFullYear();
  const presets = [
    { label: 'Este mes',  desde: `${anioActual}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`, hasta: hoy() },
    { label: `${anioActual}`, desde: `${anioActual}-01-01`, hasta: `${anioActual}-12-31` },
    { label: `${anioActual - 1}`, desde: `${anioActual - 1}-01-01`, hasta: `${anioActual - 1}-12-31` },
    { label: 'Todo', desde: '2020-01-01', hasta: '2030-12-31' },
  ];
  const activo = (p) => rango.desde === p.desde && rango.hasta === p.hasta;

  const Campo = ({ label, value, min, max, onChange }) => (
    <label className="group relative flex flex-col cursor-pointer">
      <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400 group-hover:text-blue-600 transition-colors mb-0.5">{label}</span>
      <input type="date" value={value} min={min} max={max} onChange={onChange}
        className="bg-transparent text-slate-700 text-[13px] font-bold focus:outline-none cursor-pointer [color-scheme:light] w-[120px] tracking-tight" />
    </label>
  );

  return (
    <div className="flex flex-col xl:flex-row xl:items-center gap-2.5 bg-white border border-[#efe8dd] rounded-2xl p-2.5 shadow-sm">
      {/* Campos desde / hasta */}
      <div className="flex items-center gap-3 bg-slate-50 rounded-xl pl-3 pr-4 py-2 border border-[#efe8dd]">
        <div className="p-1.5 bg-blue-500/15 rounded-lg">
          <CalendarRange className="h-4 w-4 text-blue-600" />
        </div>
        <Campo label="Desde" value={rango.desde} max={rango.hasta} onChange={e => setRango(r => ({ ...r, desde: e.target.value }))} />
        <div className="flex items-center self-stretch">
          <div className="h-7 w-px bg-slate-100" />
        </div>
        <Campo label="Hasta" value={rango.hasta} min={rango.desde} onChange={e => setRango(r => ({ ...r, hasta: e.target.value }))} />
      </div>

      {/* Presets como chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {presets.map(p => (
          <button key={p.label} onClick={() => setRango({ desde: p.desde, hasta: p.hasta })}
            className={`px-3 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border ${
              activo(p)
                ? 'bg-gradient-to-r from-emerald-600 to-green-600 border-blue-400/50 text-white shadow-lg shadow-emerald-900/40'
                : 'bg-slate-50 border-[#efe8dd] text-slate-500 hover:text-slate-900 hover:border-blue-400/30 hover:bg-slate-100'
            }`}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
};

const Contabilidad = () => {
  const { selectedCompany, user } = useAuth();
  const isAdmin = user?.rol === 'Administrador';
  const empresaId = selectedCompany?.id;
  const [searchParams] = useSearchParams();
  const sub = searchParams.get('sub') || 'compras';

  // Rango de fechas GLOBAL — compartido por todos los submódulos
  const [rango, setRango] = useState({ desde: '2025-01-01', hasta: hoy() });

  if (!empresaId && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-center">
        <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
        <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tighter italic">Bóveda Global de Contabilidad</h2>
        <p className="text-slate-500 text-sm mt-2 font-bold uppercase tracking-widest">
          Selecciona una entidad en el CRM para acceder a sus registros contables.
        </p>
      </div>
    );
  }

  const renderSub = () => {
    switch (sub) {
      case 'compras':       return <MovimientosContables empresaId={empresaId} tipoInicial="compras" ocultarTabs rango={rango} />;
      case 'ventas':        return <MovimientosContables empresaId={empresaId} tipoInicial="ventas" ocultarTabs rango={rango} />;
      case 'honorarios':    return <MovimientosContables empresaId={empresaId} tipoInicial="honorarios" ocultarTabs rango={rango} />;
      case 'recaudaciones': return <GestionCaja empresaId={empresaId} rango={rango} tipo="recaudacion" />;
      case 'pagos':         return <GestionCaja empresaId={empresaId} rango={rango} tipo="pago" />;
      case 'centralizacion':return <AsientosContables empresaId={empresaId} rango={rango} />;
      case 'reportes':      return <ReportesHub empresaId={empresaId} rango={rango} />;
      case 'traspaso':      return <EnConstruccion titulo="Traspaso Apertura" />;
      default:              return <MovimientosContables empresaId={empresaId} tipoInicial="compras" ocultarTabs rango={rango} />;
    }
  };

  // Submódulos que usan el rango global
  const usaRango = ['compras', 'ventas', 'honorarios', 'centralizacion', 'reportes', 'recaudaciones', 'pagos'].includes(sub);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-1 tracking-tight">{TITULOS[sub] || 'Contabilidad'}</h1>
          <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">
            {/* Sin empresa seleccionada la vista es el consolidado de TODAS las empresas.
                Antes decía "VOLLAIRE & OLIVOS SIMPLE PYME LTDA", que era falso: mostraba
                las compras y ventas de todas las empresas bajo el nombre de una sola. */}
            {selectedCompany?.razon_social || selectedCompany?.razonSocial || 'Todas las empresas (consolidado)'}
          </p>
        </div>
        {usaRango && <SelectorRango rango={rango} setRango={setRango} />}
      </div>
      <motion.div key={sub} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        {renderSub()}
      </motion.div>
    </div>
  );
};

export default Contabilidad;
