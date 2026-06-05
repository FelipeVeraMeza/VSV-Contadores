import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, BarChart3, GitMerge, TrendingUp,
  Plus, BookCopy, Loader2, ArrowRightLeft, LayoutList
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';

import MovimientosContables from '@/components/contabilidad/MovimientosContables';
import AsientosContables from '@/components/contabilidad/AsientosContables';
import PlanDeCuentas from '@/components/contabilidad/PlanDeCuentas';
import Balances from '@/components/contabilidad/Balances';
import ConciliacionBancaria from '@/components/contabilidad/ConciliacionBancaria';
import ReportesContables from '@/components/contabilidad/ReportesContables';
import NuevoAsientoModal from '@/components/contabilidad/modals/NuevoAsientoModal';

const Contabilidad = () => {
  const { selectedCompany, user } = useAuth();
  const isAdmin = user?.rol === 'Administrador';
  const empresaId = selectedCompany?.id;

  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('movimientos');
  const [isAsientoModalOpen, setIsAsientoModalOpen] = useState(false);

  // Período compartido entre Movimientos y Libro Diario
  const now = new Date();
  const [periodoMes,  setPeriodoMes]  = useState((now.getMonth()+1).toString().padStart(2,'0'));
  const [periodoAnio, setPeriodoAnio] = useState(now.getFullYear().toString());

  const handleGenerarBorrador = () => {
    setActiveTab('libro_diario');
  };

  if (!empresaId && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-center">
        <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
        <h2 className="text-xl font-bold text-white uppercase tracking-tighter italic">
          Bóveda Global de Contabilidad
        </h2>
        <p className="text-gray-400 text-sm mt-2 font-bold uppercase tracking-widest">
          Selecciona una entidad en el CRM para acceder a sus registros contables.
        </p>
      </div>
    );
  }

  const tabs = useMemo(() => [
    { id: 'movimientos',  name: 'Movimientos',    icon: ArrowRightLeft, Component: MovimientosContables },
    { id: 'libro_diario', name: 'Libro Diario',   icon: FileText,       Component: AsientosContables },
    { id: 'conciliacion', name: 'Banco',           icon: GitMerge,       Component: ConciliacionBancaria },
    { id: 'balances',     name: 'Balances',        icon: BarChart3,      Component: Balances },
    { id: 'planCuentas',  name: 'Plan de Cuentas', icon: BookCopy,       Component: PlanDeCuentas },
    { id: 'reportes',     name: 'Reportes',        icon: TrendingUp,     Component: ReportesContables },
  ], []);

  const handleAddAsiento = () => {
    queryClient.invalidateQueries(['asientos', empresaId]);
    toast({ title: 'Asiento Creado', description: 'El asiento ha sido mayorizado correctamente.' });
    setIsAsientoModalOpen(false);
  };

  const ActiveModule = tabs.find(t => t.id === activeTab)?.Component;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <NuevoAsientoModal
        isOpen={isAsientoModalOpen}
        setIsOpen={setIsAsientoModalOpen}
        onAddAsiento={handleAddAsiento}
        empresaId={empresaId}
      />

      {/* CABECERA */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">
            Módulo Contable y Tributario
          </h1>
          <p className="text-gray-400 text-sm font-medium uppercase tracking-wider">
            {selectedCompany?.razon_social || selectedCompany?.razonSocial || 'Bóveda Global'}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <Button
            onClick={() => setActiveTab('movimientos')}
            variant="outline"
            className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10 h-11 px-4 text-xs font-bold uppercase tracking-widest transition-all"
          >
            <LayoutList className="h-4 w-4 mr-2" />
            Ver Movimientos
          </Button>

          <Button
            onClick={() => setIsAsientoModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white h-11 px-4 text-xs font-bold uppercase tracking-widest transition-all shadow-lg shadow-emerald-900/20"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Comprobante
          </Button>
        </div>
      </div>

      {/* NAVEGACIÓN */}
      <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
        <div className="flex border-b border-white/5 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-shrink-0 flex items-center space-x-2 px-6 py-4 font-bold uppercase text-[10px] tracking-widest transition-all ${
                  isActive
                    ? 'bg-blue-500/10 text-blue-400 border-b-2 border-blue-500'
                    : 'text-gray-500 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-blue-400' : 'text-gray-600'}`} />
                <span>{tab.name}</span>
              </button>
            );
          })}
        </div>

        <div className="p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'movimientos' && (
                <MovimientosContables
                  empresaId={empresaId}
                  onGenerarBorrador={handleGenerarBorrador}
                  mes={periodoMes}
                  anio={periodoAnio}
                  setMes={setPeriodoMes}
                  setAnio={setPeriodoAnio}
                />
              )}
              {activeTab === 'libro_diario' && (
                <AsientosContables
                  empresaId={empresaId}
                  mes={periodoMes}
                  anio={periodoAnio}
                  setMes={setPeriodoMes}
                  setAnio={setPeriodoAnio}
                />
              )}
              {activeTab !== 'movimientos' && activeTab !== 'libro_diario' && ActiveModule && (
                <ActiveModule empresaId={empresaId} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default Contabilidad;
