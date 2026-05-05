import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, FileText, Building2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { useSii } from '@/contexts/SiiContext.jsx';
import { useAuth } from '@/hooks/useAuth.jsx';

// COMPONENTES DE PESTAÑAS
import EmisionDTE from '@/components/facturacion/tabs/EmisionDTE';
import DocumentosDTE from '@/components/facturacion/tabs/DocumentosDTE';
import SIILoginModal from '@/components/facturacion/modals/SIILoginModal';

// MODALES DE EMISIÓN
import FacturaElectronicaModal from '@/components/facturacion/modals/dte/FacturaElectronicaModal';
import ExentaElectronicaModal from '@/components/facturacion/modals/dte/ExentaElectronicaModal'; 
import GuiaDespachoModal from '@/components/facturacion/modals/dte/GuiaDespachoModal';
import NotaCreditoDebitoModal from '@/components/facturacion/modals/dte/NotaCreditoDebitoModal';

const Facturacion = () => {
  const { selectedCompany, user } = useAuth();
  const isAdmin = user?.rol === 'Administrador';
  const empresaId = selectedCompany?.id;

  const [activeTab, setActiveTab] = useState('emision');
  const [isSIILoginModalOpen, setIsSIILoginModalOpen] = useState(false);
  const [isDocumentoModalOpen, setIsDocumentoModalOpen] = useState(false);
  const [tipoDocumentoSeleccionado, setTipoDocumentoSeleccionado] = useState(null);
  
  // Estado para cargar datos desde el historial
  const [prefillData, setPrefillData] = useState(null);

  if (!empresaId && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-center">
        <div className="w-24 h-24 bg-blue-500/10 border border-blue-500/20 rounded-full flex items-center justify-center mb-6">
            <Building2 className="h-10 w-10 text-blue-400" />
        </div>
        <h2 className="text-2xl font-black text-white uppercase italic">Módulo Facturador</h2>
        <p className="text-gray-400 text-sm mt-3 font-bold uppercase tracking-widest max-w-md">
          Selecciona una empresa en el menú superior para comenzar.
        </p>
      </div>
    );
  }

  const renderModal = () => {
    if (!tipoDocumentoSeleccionado) return null;
    const tipo = tipoDocumentoSeleccionado.toLowerCase();

    // Factura Afecta
    if (tipo === 'factura') {
        return <FacturaElectronicaModal isOpen={isDocumentoModalOpen} setIsOpen={setIsDocumentoModalOpen} />;
    }
    // Factura Exenta
    if (tipo === 'exenta' || tipo === 'excenta') {
        return <ExentaElectronicaModal isOpen={isDocumentoModalOpen} setIsOpen={setIsDocumentoModalOpen} />;
    }
    // Guía de Despacho
    if (tipo === 'guia_despacho') {
        return <GuiaDespachoModal isOpen={isDocumentoModalOpen} setIsOpen={setIsDocumentoModalOpen} />;
    }
    // NOTA UNIFICADA (Aquí está la magia)
    if (tipo === 'nota_credito_debito') {
        return (
            <NotaCreditoDebitoModal 
                isOpen={isDocumentoModalOpen} 
                setIsOpen={(val) => {
                    setIsDocumentoModalOpen(val);
                    if (!val) setPrefillData(null); // Limpiar al cerrar
                }} 
                prefillData={prefillData}
            />
        );
    }
    return null;
  };

  return (
    <div className="h-full flex flex-col gap-6">
      <h1 className="text-2xl font-black text-white uppercase tracking-tighter">Facturador Electrónico</h1>

      <div className="flex-1 flex flex-col bg-[#0f172a]/80 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
        <div className="flex bg-black/20 border-b border-white/5">
          <button onClick={() => setActiveTab('emision')} className={`px-8 py-5 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'emision' ? 'text-blue-400 bg-white/5' : 'text-gray-500'}`}>
            Emitir DTE
          </button>
          <button onClick={() => setActiveTab('documentos')} className={`px-8 py-5 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'documentos' ? 'text-blue-400 bg-white/5' : 'text-gray-500'}`}>
            Historial / Bóveda
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              {activeTab === 'emision' && (
                <EmisionDTE 
                  onEmitir={(tipo) => { 
                    setTipoDocumentoSeleccionado(tipo); 
                    setIsDocumentoModalOpen(true); 
                  }} 
                />
              )}
              {activeTab === 'documentos' && (
                <DocumentosDTE 
                  onAccionReferenciada={(doc) => {
                      setPrefillData({ doc });
                      setActiveTab('emision');
                      setTipoDocumentoSeleccionado('nota_credito_debito');
                      setIsDocumentoModalOpen(true);
                  }}
                />
              )}
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