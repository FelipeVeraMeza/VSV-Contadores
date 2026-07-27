import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, BarChart3, Calculator, Users, 
  FileText, Brain, FileBarChart, Loader2 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';

import OperacionRentaDashboard from '@/components/operacion-renta/OperacionRentaDashBoard';
import AnalisisOperaciones from '@/components/operacion-renta/AnalisisOperaciones';
import CalculoImpuestos from '@/components/operacion-renta/CalculoImpuestos';
import AnalisisSocios from '@/components/operacion-renta/AnalisisSocios';
import GestionDeclaraciones from '@/components/operacion-renta/GestionDeclaraciones';

const OperacionRenta = () => {
  const { selectedCompany, user } = useAuth();
  const isAdmin = user?.rol === 'Administrador';
  const empresaId = selectedCompany?.id;
  const [activeTab, setActiveTab] = useState('dashboard');

  // GOD MODE
  if (!empresaId && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-center">
        <Loader2 className="h-12 w-12 text-teal-500 animate-spin mb-4" />
        <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tighter italic">
          Preparando Operación Renta 2026
        </h2>
        <p className="text-slate-500 text-sm mt-2 font-bold uppercase tracking-widest">
          Selecciona una entidad para analizar el búnker tributario.
        </p>
      </div>
    );
  }

  const showNotImplementedToast = () => {
    toast({
      title: "🚧 Funcionalidad en desarrollo",
      description: "¡Esta característica no está implementada aún!",
      duration: 4000,
    });
  };

  const tabs = useMemo(() => [
    { id: 'dashboard', name: 'Dashboard Renta', icon: LayoutDashboard, component: <OperacionRentaDashboard empresaId={empresaId} /> },
    { id: 'analisis', name: 'Análisis de Operaciones', icon: BarChart3, component: <AnalisisOperaciones empresaId={empresaId} /> },
    { id: 'calculo', name: 'Cálculo de Impuestos', icon: Calculator, component: <CalculoImpuestos empresaId={empresaId} /> },
    { id: 'socios', name: 'Análisis de Socios', icon: Users, component: <AnalisisSocios empresaId={empresaId} /> },
    { id: 'declaraciones', name: 'Gestión de Declaraciones', icon: FileText, component: <GestionDeclaraciones empresaId={empresaId} /> },
  ], [empresaId]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
        <div>
           <h1 className="text-4xl font-black text-slate-900 mb-2 italic uppercase tracking-tighter">
            Módulo de Operación Renta
          </h1>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.3em]">
            Análisis, cálculo y gestión del proceso de renta anual
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          <Button 
            onClick={showNotImplementedToast}
            variant="outline"
            className="border-[#efe8dd] text-slate-700 hover:bg-slate-100 h-11 px-4 w-full sm:w-auto flex items-center justify-center text-sm font-bold transition-all"
          >
            <Brain className="h-4 w-4 mr-2 shrink-0" />
            <span className="whitespace-nowrap">Recomendaciones IA</span>
          </Button>

          <Button 
            onClick={showNotImplementedToast}
            className="bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white h-11 px-4 w-full sm:w-auto flex items-center justify-center text-sm font-bold transition-all shadow-lg shadow-teal-900/20"
          >
            <span className="whitespace-nowrap">Generar Borrador F22</span>
          </Button>
        </div>
      </div>

      <div className="bg-white backdrop-blur-xl rounded-2xl border border-[#efe8dd] overflow-hidden shadow-2xl">
        <div className="flex border-b border-[#efe8dd] overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-shrink-0 flex items-center space-x-2 px-6 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-teal-500/20 to-cyan-500/20 text-white border-b-2 border-teal-500'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-teal-600' : 'text-slate-400'}`} />
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
              {tabs.find(t => t.id === activeTab)?.component}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default OperacionRenta;