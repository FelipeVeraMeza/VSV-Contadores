import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, FileText, Building2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { useSii } from '@/contexts/SiiContext.jsx';
import { useAuth } from '@/hooks/useAuth.jsx';

import SIILoginModal from '@/components/facturacion/modals/SIILoginModal';
import EmisionDTE from './facturacion/tabs/EmisionDTE';
import DocumentosDTE from './facturacion/tabs/DocumentosDTE';

// IMPORTACIÓN DE MODALES ESPECÍFICOS
import FacturaElectronicaModal from '@/components/facturacion/modals/dte/FacturaElectronicaModal';
import ExentaElectronicaModal from '@/components/facturacion/modals/dte/ExentaElectronicaModal'; // ¡Asegúrate de que esta línea NO esté comentada!
import GuiaDespachoModal from '@/components/facturacion/modals/dte/GuiaDespachoModal';

const Facturacion = () => {
  const { dtes } = useSii();
  const { selectedCompany, user } = useAuth();
  const isAdmin = user?.rol === 'Administrador';
  const empresaId = selectedCompany?.id;

  const [activeTab, setActiveTab] = useState('emision');
  const [isSIILoginModalOpen, setIsSIILoginModalOpen] = useState(false);
  const [isDocumentoModalOpen, setIsDocumentoModalOpen] = useState(false);
  const [tipoDocumentoSeleccionado, setTipoDocumentoSeleccionado] = useState(null);

  if (!empresaId && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-center animate-in fade-in duration-500">
        <div className="w-24 h-24 bg-blue-500/10 border border-blue-500/20 rounded-full flex items-center justify-center mb-6 shadow-[0_0_50px_rgba(59,130,246,0.15)]">
            <Building2 className="h-10 w-10 text-blue-400" />
        </div>
        <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter italic">Módulo Facturador</h2>
        <p className="text-gray-400 text-xs md:text-sm mt-3 font-bold uppercase tracking-widest max-w-md">
          Para emitir o revisar documentos tributarios, por favor selecciona una empresa en el menú superior.
        </p>
      </div>
    );
  }

  const handleAddFactura = (dteJson) => {
    toast({ title: "Borrador Guardado", description: "El documento está listo para procesar." });
  };

  // ========================================================
  // LÓGICA DE RENDERIZADO DE MODALES (CORREGIDA)
  // ========================================================
  const renderModal = () => {
    if (!tipoDocumentoSeleccionado) return null;
    const tipo = tipoDocumentoSeleccionado.toLowerCase();

    // 1. Factura Electrónica (DTE 33)
    if (tipo === 'factura') {
      return <FacturaElectronicaModal 
                isOpen={isDocumentoModalOpen} 
                setIsOpen={setIsDocumentoModalOpen} 
                onAddFactura={handleAddFactura} 
             />;
    }

    // 2. Factura Exenta (DTE 34) -> AHORA ATRAPA "exenta" y "excenta"
    if (tipo === 'exenta' || tipo === 'excenta') {
      return <ExentaElectronicaModal 
                isOpen={isDocumentoModalOpen} 
                setIsOpen={setIsDocumentoModalOpen} 
                onAddFactura={handleAddFactura} 
             />;
    }
    
    // 3. Guía de Despacho (DTE 52)
    if (tipo === 'guia_despacho') {
      return <GuiaDespachoModal 
                isOpen={isDocumentoModalOpen} 
                setIsOpen={setIsDocumentoModalOpen} 
                onAddFactura={handleAddFactura} 
             />;
    }

    // 4. Notas de Crédito y Débito (Por ahora usamos el genérico)
    if (tipo === 'nota_credito' || tipo === 'nota_debito' || tipo === 'boleta') {
        return <FacturaElectronicaModal 
                  isOpen={isDocumentoModalOpen} 
                  setIsOpen={setIsDocumentoModalOpen} 
                  onAddFactura={handleAddFactura} 
                  tipoDte={tipo} 
               />;
      }
    
    return null;
  };

  const tabs = [
    { id: 'emision', name: 'Emitir DTE', icon: Send },
    { id: 'documentos', name: 'Historial de Documentos', icon: FileText },
  ];

  return (
    <div className="h-full flex flex-col gap-6 relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 flex-shrink-0">
        <div>
          <h1 className="text-xl md:text-3xl font-black text-white uppercase tracking-tighter">Facturador</h1>
          <p className="text-gray-400 text-xs mt-1 font-bold tracking-widest uppercase">Gestión de Documentos Tributarios Electrónicos</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-[#0f172a]/80 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
        <div className="flex border-b border-white/5 bg-black/20">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 md:flex-none flex items-center justify-center space-x-3 px-8 py-5 font-black text-[10px] md:text-xs uppercase tracking-widest transition-all relative ${
                  isActive ? 'text-white bg-white/5' : 'text-gray-500 hover:text-white hover:bg-white/[0.02]'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-blue-500' : 'opacity-50'}`} />
                <span>{tab.name}</span>
                {isActive && (
                  <motion.div layoutId="activeTabFact" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {activeTab === 'emision' && (
                <EmisionDTE 
                  onEmitir={(tipo) => { 
                    console.log("Intentando abrir modal de tipo:", tipo); // LOG DE AYUDA
                    setTipoDocumentoSeleccionado(tipo); 
                    setIsDocumentoModalOpen(true); 
                  }} 
                />
              )}
              {activeTab === 'documentos' && <DocumentosDTE />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <SIILoginModal isOpen={isSIILoginModalOpen} onClose={() => setIsSIILoginModalOpen(false)} />
      {renderModal()}
    </div>
  );
};

export default Facturacion;