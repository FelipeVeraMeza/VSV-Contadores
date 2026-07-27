import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { useSii } from '@/contexts/SiiContext.jsx';
import { useAuth } from '@/hooks/useAuth.jsx';

// IMPORTACIONES
import SIILoginModal from '@/components/facturacion/modals/SIILoginModal';
import EmisionDTE from '@/components/facturacion/tabs/EmisionDTE';
import DocumentosDTE from '@/components/facturacion/tabs/DocumentosDTE';
import CobrosMensuales from '@/components/facturacion/tabs/CobrosMensuales';

import FacturaElectronicaModal from '@/components/facturacion/modals/dte/FacturaElectronicaModal';
import ExentaElectronicaModal from '@/components/facturacion/modals/dte/ExentaElectronicaModal';
import GuiaDespachoModal from '@/components/facturacion/modals/dte/GuiaDespachoModal';
import NotaCreditoDebitoModal from '@/components/facturacion/modals/dte/NotaCreditoDebitoModal';

// Encabezado por sub-página. La navegación entre sub-páginas vive en el menú
// lateral (?sub=...), igual que el CRM.
const TITULOS = {
  emision:    { title: 'Emitir DTE',              sub: 'Emisión de documentos tributarios electrónicos' },
  documentos: { title: 'Historial de Documentos', sub: 'Documentos emitidos y recibidos en el SII' },
  cobros:     { title: 'Cobro del Mes',           sub: 'Ciclo de cobro mensual a los clientes del CRM' },
};

const Facturacion = () => {
  const { dtes } = useSii();
  const { selectedCompany, user } = useAuth();
  const isAdmin = user?.rol === 'Administrador';
  const empresaId = selectedCompany?.id;

  // La sub-página activa se controla desde el menú lateral (?sub=...).
  // El cobro del mes es solo para el administrador; si un cliente llega a esa
  // URL, cae de vuelta a la emisión de DTE.
  const [searchParams] = useSearchParams();
  let activeTab = searchParams.get('sub') || 'emision';
  if (activeTab === 'cobros' && !isAdmin) activeTab = 'emision';

  const [isSIILoginModalOpen, setIsSIILoginModalOpen] = useState(false);
  const [isDocumentoModalOpen, setIsDocumentoModalOpen] = useState(false);
  const [tipoDocumentoSeleccionado, setTipoDocumentoSeleccionado] = useState(null);

  if (!empresaId && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-center animate-in fade-in duration-500">
        <div className="w-24 h-24 bg-blue-500/10 border border-blue-500/20 rounded-full flex items-center justify-center mb-6 shadow-[0_0_50px_rgba(59,130,246,0.15)]">
            <Building2 className="h-10 w-10 text-blue-600" />
        </div>
        <h2 className="text-2xl md:text-3xl font-black text-slate-900 uppercase tracking-tighter italic">Módulo Facturador</h2>
        <p className="text-slate-500 text-xs md:text-sm mt-3 font-bold uppercase tracking-widest max-w-md">
          Para emitir o revisar documentos tributarios, por favor selecciona una empresa en el menú superior.
        </p>
      </div>
    );
  }

  const handleAddFactura = (dteJson) => {
    toast({ title: "Borrador Guardado", description: "El documento está listo para procesar." });
  };

  const renderModal = () => {
    if (!tipoDocumentoSeleccionado) return null;
    const tipo = tipoDocumentoSeleccionado.toLowerCase();

    if (tipo === 'factura') {
      return <FacturaElectronicaModal isOpen={isDocumentoModalOpen} setIsOpen={setIsDocumentoModalOpen} onAddFactura={handleAddFactura} />;
    }

    if (tipo === 'exenta' || tipo === 'excenta') {
      return <ExentaElectronicaModal isOpen={isDocumentoModalOpen} setIsOpen={setIsDocumentoModalOpen} onAddFactura={handleAddFactura} />;
    }
    
    if (tipo === 'guia_despacho') {
      return <GuiaDespachoModal isOpen={isDocumentoModalOpen} setIsOpen={setIsDocumentoModalOpen} onAddFactura={handleAddFactura} />;
    }

    if (tipo === 'nota_credito_debito' || tipo === 'boleta') {
        return <NotaCreditoDebitoModal isOpen={isDocumentoModalOpen} setIsOpen={setIsDocumentoModalOpen} />;
    }
    
    return null;
  };

  const info = TITULOS[activeTab] || TITULOS.emision;

  return (
    <div className="h-full flex flex-col gap-6 relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 flex-shrink-0">
        <div>
          <h1 className="text-xl md:text-3xl font-black text-slate-900 uppercase tracking-tighter">{info.title}</h1>
          <p className="text-slate-500 text-xs mt-1 font-bold tracking-widest uppercase">{info.sub}</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-white backdrop-blur-xl rounded-3xl border border-[#efe8dd] shadow-2xl overflow-hidden">
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
                    setTipoDocumentoSeleccionado(tipo);
                    setIsDocumentoModalOpen(true);
                  }}
                />
              )}
              {activeTab === 'documentos' && <DocumentosDTE />}
              {activeTab === 'cobros' && isAdmin && <CobrosMensuales />}
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