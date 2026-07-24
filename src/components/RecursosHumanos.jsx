import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { Loader2, FileWarning, Users, Building2, ArrowUp, Search, ChevronRight } from 'lucide-react';
import { useBunkerData } from '@/components/crm/crmData';
import RrhhDashboard from '@/components/rrhh/RrhhDashboard';
import GestionEmpleados from '@/components/rrhh/GestionEmpleados';
import GestionLiquidaciones from '@/components/rrhh/GestionLiquidaciones';
import CentralizacionRrhh from '@/components/rrhh/CentralizacionRrhh';
import ReportesRrhh from '@/components/rrhh/ReportesRrhh';
import ConfiguracionRrhh from '@/components/rrhh/ConfiguracionRrhh';
import NuevoEmpleadoModal from '@/components/rrhh/modals/NuevoEmpleadoModal';
import NuevaLiquidacionModal from '@/components/rrhh/modals/NuevaLiquidacionModal';
import { useAuth } from '@/hooks/useAuth';

const SUBPAGINAS = {
  dashboard:     { titulo: 'Dashboard',              subtitulo: 'Resumen del período y accesos rápidos' },
  trabajadores:  { titulo: 'Trabajadores',           subtitulo: 'Fichas del personal' },
  liquidaciones: { titulo: 'Liquidaciones',          subtitulo: 'Cálculo y aprobación de sueldos' },
  centralizacion:{ titulo: 'Centralización',         subtitulo: 'Asiento contable de la nómina del período' },
  documentos:    { titulo: 'Documentos',             subtitulo: 'Contratos, certificados y finiquitos' },
  asistencia:    { titulo: 'Control de Asistencia',  subtitulo: 'Registro de jornada' },
  configuracion: { titulo: 'Configuración',          subtitulo: 'Indicadores previsionales y comisiones AFP' },
  reportes:      { titulo: 'Reportes',               subtitulo: 'Libro de remuneraciones' },
};

const Proximamente = ({ titulo }) => (
  <div className="flex flex-col items-center justify-center py-24 text-gray-500">
    <FileWarning className="h-14 w-14 mb-4 opacity-20" />
    <h3 className="text-lg font-semibold text-white">{titulo}</h3>
    <p className="text-sm">Este módulo estará disponible próximamente.</p>
  </div>
);

// Esta sub-página es por empresa: si no hay una elegida, muestra un buscador
// para seleccionarla ahí mismo (fija la empresa global de todo el sistema).
const LABEL_PRINCIPAL = 'VOLLAIRE & OLIVOS SIMPLE PYME LTDA';

const RequiereEmpresa = ({ seccion }) => {
  const { user, setSelectedCompany } = useAuth();
  const { clients, loading } = useBunkerData();
  const [q, setQ] = useState('');
  const nombre = (c) => c.razon_social || c.razonSocial || '';
  const query = q.trim().toLowerCase();
  const esAdmin = user?.rol === 'Administrador';
  const principal = esAdmin ? (clients || []).find(c => nombre(c).trim().toUpperCase() === LABEL_PRINCIPAL) : null;
  const lista = (clients || []).filter(c => c !== principal && nombre(c).toLowerCase().includes(query)).slice(0, 100);
  const mostrarPrincipal = principal && nombre(principal).toLowerCase().includes(query);
  const elegir = (c) => {
    setSelectedCompany(c);
    try { localStorage.setItem('selectedCompany', JSON.stringify(c)); } catch { /* ignore */ }
  };
  return (
    <div className="max-w-xl mx-auto py-10">
      <div className="flex flex-col items-center text-center gap-3 mb-6">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/20 to-violet-500/10 border border-purple-500/30 flex items-center justify-center">
          <Building2 className="h-7 w-7 text-purple-400" />
        </div>
        <h2 className="text-xl font-bold text-white">Elige una empresa</h2>
        <p className="text-gray-400 text-sm max-w-md">
          {seccion || 'Esta sección'} se gestiona por empresa. Selecciona la empresa para continuar.
        </p>
      </div>
      <div className="relative mb-3">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar empresa…"
          className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
      </div>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-purple-500" /></div>
      ) : (
        <>
          {/* Empresa principal (el propio estudio) fijada arriba */}
          {mostrarPrincipal && (
            <button onClick={() => elegir(principal)} className="w-full flex items-center gap-3 px-4 py-3 mb-2 rounded-xl border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/15 transition-colors text-left group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center flex-shrink-0"><Building2 className="h-4 w-4 text-white" /></div>
              <div className="flex-1 min-w-0">
                <span className="text-sm text-white font-semibold truncate block">{nombre(principal)}</span>
                <span className="text-[10px] uppercase tracking-widest text-purple-300">Empresa principal · tu estudio</span>
              </div>
              <ChevronRight className="h-4 w-4 text-purple-400/70 group-hover:text-purple-300 transition-colors" />
            </button>
          )}
          <div className="flex items-center justify-between px-1 mb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Empresas cliente</span>
            <span className="text-[10px] text-gray-600">{lista.length}{query ? '' : (clients?.length ? ` de ${clients.length - (principal ? 1 : 0)}` : '')}</span>
          </div>
          <div className="max-h-[24rem] overflow-y-auto rounded-xl border border-white/10 bg-white/[0.02] divide-y divide-white/[0.05]">
            {lista.length ? lista.map(c => (
              <button key={c.id} onClick={() => elegir(c)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.05] transition-colors group">
                <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center flex-shrink-0"><Building2 className="h-4 w-4 text-gray-400" /></div>
                <span className="flex-1 text-sm text-gray-200 truncate">{nombre(c)}</span>
                <ChevronRight className="h-4 w-4 text-gray-600 group-hover:text-purple-400 transition-colors" />
              </button>
            )) : <div className="px-4 py-10 text-center text-gray-500 text-sm">Sin resultados para “{q}”.</div>}
          </div>
        </>
      )}
      <p className="text-gray-600 text-[11px] text-center mt-3">También puedes usar el selector de empresa de arriba a la derecha.</p>
    </div>
  );
};

const RecursosHumanos = () => {
  const { selectedCompany, user } = useAuth();
  const isAdmin = user?.rol === 'Administrador';
  const empresaId = selectedCompany?.id;
  const [searchParams] = useSearchParams();
  const sub = searchParams.get('sub') || 'dashboard';
  const [isEmpleadoModalOpen, setIsEmpleadoModalOpen] = useState(false);
  const [isLiquidacionModalOpen, setIsLiquidacionModalOpen] = useState(false);

  const meta = SUBPAGINAS[sub] || SUBPAGINAS.dashboard;

  // Dashboard, Trabajadores, Liquidaciones y Reportes funcionan consolidados (todas
  // las empresas) cuando no hay una elegida. Centralización y Configuración se operan
  // de a una empresa, así que muestran el buscador.
  const conEmpresa = (comp) => (empresaId ? comp : <RequiereEmpresa seccion={meta.titulo} />);
  const renderSub = () => {
    switch (sub) {
      case 'trabajadores':  return <GestionEmpleados empresaId={empresaId} onNew={empresaId ? () => setIsEmpleadoModalOpen(true) : null} />;
      case 'liquidaciones': return <GestionLiquidaciones empresaId={empresaId} onAddLiquidation={empresaId ? () => setIsLiquidacionModalOpen(true) : null} />;
      case 'centralizacion': return conEmpresa(<CentralizacionRrhh empresaId={empresaId} />);
      case 'documentos':    return <Proximamente titulo="Documentos" />;
      case 'asistencia':    return <Proximamente titulo="Control de Asistencia" />;
      case 'configuracion': return conEmpresa(<ConfiguracionRrhh empresaId={empresaId} />);
      case 'reportes':      return <ReportesRrhh empresaId={empresaId} />;
      case 'dashboard':
      default:              return <RrhhDashboard empresaId={empresaId} />;
    }
  };

  return (
    <div className="space-y-6">
      <NuevoEmpleadoModal isOpen={isEmpleadoModalOpen} setIsOpen={setIsEmpleadoModalOpen} onAddEmpleado={() => {}} empresaId={empresaId} />
      <NuevaLiquidacionModal isOpen={isLiquidacionModalOpen} setIsOpen={setIsLiquidacionModalOpen} empresaId={empresaId} />

      {/* Encabezado contextual */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-purple-900/30 flex-shrink-0">
          <Users className="h-6 w-6 text-white" />
        </div>
        <div>
          <p className="text-purple-400/80 text-[10px] font-semibold uppercase tracking-[0.25em]">Recursos Humanos</p>
          <h1 className="text-2xl font-bold text-white tracking-tight leading-tight">{meta.titulo}</h1>
          <p className="text-gray-500 text-xs mt-0.5">{meta.subtitulo}</p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={sub}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {renderSub()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default RecursosHumanos;
