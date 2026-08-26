import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { Hammer, Building2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

import MovimientosContables from '@/components/contabilidad/MovimientosContables';
import AsientosContables from '@/components/contabilidad/AsientosContables';
import ConciliacionBancaria from '@/components/contabilidad/ConciliacionBancaria';
import ReportesHub from '@/components/contabilidad/ReportesHub';
import GestionCaja from '@/components/contabilidad/GestionCaja';
import CampoFecha from '@/components/ui/CampoFecha';

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

  return (
    <div className="flex flex-col xl:flex-row xl:items-center gap-2.5 bg-white border border-[#efe8dd] rounded-2xl p-2.5 shadow-sm">
      {/* Campos desde / hasta. Cada uno se puede TECLEAR o elegir del calendario
          con su ícono. El calendario decorativo que iba antes acá a la izquierda
          se quitó: con dos íconos de calendario que ahora sí hacen algo, un
          tercero que no hace nada solo confunde dónde hay que apretar. */}
      <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2 border border-[#efe8dd]">
        <CampoFecha label="Desde" value={rango.desde} max={rango.hasta}
          onChange={iso => setRango(r => ({ ...r, desde: iso }))} />
        <div className="flex items-center self-stretch">
          <div className="h-7 w-px bg-slate-100" />
        </div>
        <CampoFecha label="Hasta" value={rango.hasta} min={rango.desde}
          onChange={iso => setRango(r => ({ ...r, hasta: iso }))} />
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
  const { selectedCompany } = useAuth();
  const empresaId = selectedCompany?.id;
  const [searchParams] = useSearchParams();
  const sub = searchParams.get('sub') || 'compras';

  // Rango de fechas GLOBAL — compartido por todos los submódulos
  const [rango, setRango] = useState({ desde: '2025-01-01', hasta: hoy() });

  // CONTABILIDAD EXIGE UNA EMPRESA. Sin excepciones, tampoco para el Administrador.
  //
  // Antes el consolidado «Todas las empresas» estaba permitido para los
  // administradores, y era una trampa: se abría el módulo, el selector quedaba
  // en «Todas», y lo que se contabilizaba caía con `empresa_id` en NULL —sin
  // dueño, invisible al elegir cualquier empresa— o peor, se contabilizaba el
  // mes de un cliente creyendo que era el de otro. El 25-08-2026 había 29
  // asientos así.
  //
  // Ver la suma de todas las empresas es una pregunta legítima, pero es una
  // pregunta de REPORTES, no de un módulo donde cada botón escribe asientos.
  if (!empresaId) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-center px-6">
        <div className="bg-amber-500/10 p-5 rounded-full mb-5 border border-amber-500/20">
          <Building2 className="h-10 w-10 text-amber-600" />
        </div>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Elige una empresa</h2>
        <p className="text-slate-500 text-sm mt-3 max-w-md leading-relaxed">
          Contabilidad trabaja sobre <b>una</b> empresa a la vez. Usa el selector del encabezado,
          arriba, para elegir con cuál vas a trabajar.
        </p>
        <p className="text-slate-400 text-xs mt-4 max-w-md leading-relaxed">
          No se puede contabilizar con «Todas las empresas»: el asiento quedaría sin dueño y
          después no hay forma de saber a qué libro pertenecía.
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
          {/* De qué empresa es lo que estás viendo. Acá ya no hay caso «todas»:
              sin empresa la pantalla ni siquiera llega a este punto. */}
          <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">
            {selectedCompany?.razon_social || selectedCompany?.razonSocial}
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
