import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DownloadCloud, ArrowDownRight, ArrowUpRight, Zap, RefreshCcw, FileCheck, Loader2, CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth.jsx';
import { obtenerHistorialBunker, obtenerComprasBunker } from '@/services/dteConsultasService';
import GeneradorLibroDiarioModal from '@/components/contabilidad/modals/GeneradorLibroDiarioModal';
import { BookCopy } from 'lucide-react';

// Utilidad estricta para formatear textos: MAYÚSCULAS Y SIN ACENTOS
const formatText = (str) => {
  if (!str) return '';
  return str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
};

const TIPO_DTE_MAP = {
  33: "FACTURA ELECTRONICA",
  34: "FACTURA EXENTA",
  61: "NOTA DE CREDITO",
  56: "NOTA DE DEBITO",
  52: "GUIA DE DESPACHO",
  39: "BOLETA ELECTRONICA",
  110: "FACTURA EXPORTACION"
};

const MESES = [
  { value: '01', label: 'ENERO' }, { value: '02', label: 'FEBRERO' },
  { value: '03', label: 'MARZO' }, { value: '04', label: 'ABRIL' },
  { value: '05', label: 'MAYO' }, { value: '06', label: 'JUNIO' },
  { value: '07', label: 'JULIO' }, { value: '08', label: 'AGOSTO' },
  { value: '09', label: 'SEPTIEMBRE' }, { value: '10', label: 'OCTUBRE' },
  { value: '11', label: 'NOVIEMBRE' }, { value: '12', label: 'DICIEMBRE' }
];

const ANIOS = ['2024', '2025', '2026', '2027'];
const ITEMS_PER_PAGE = 10;

const RegistroComprasVentas = ({ empresaId: propEmpresaId }) => {
  const { selectedCompany } = useAuth();
  const targetId = propEmpresaId || selectedCompany?.id || 'ALL';

  const [activeView, setActiveView] = useState('compras'); 
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoadingDB, setIsLoadingDB] = useState(false);
  
  const [compras, setCompras] = useState([]);
  const [ventas, setVentas] = useState([]);
  
  const [isModalDiarioOpen, setIsModalDiarioOpen] = useState(false); // NUEVO ESTADO

  const currentDate = new Date();
  const currentMonth = (currentDate.getMonth() + 1).toString().padStart(2, '0');
  const currentYear = currentDate.getFullYear().toString();

  const [mesActivo, setMesActivo] = useState(currentMonth);
  const [anioActivo, setAnioActivo] = useState(currentYear);
  
  // Estado para la paginación
  const [currentPage, setCurrentPage] = useState(1);

  // Reiniciar la página a 1 cuando cambien los filtros o la vista
  useEffect(() => {
    setCurrentPage(1);
  }, [activeView, mesActivo, anioActivo, targetId]);

  // ==========================================
  // CONEXIÓN A SUPABASE
  // ==========================================
  const cargarDatos = useCallback(async () => {
    if (!targetId) return;
    
    setIsLoadingDB(true);
    try {
      const [resVentas, resCompras] = await Promise.all([
        obtenerHistorialBunker(targetId),
        obtenerComprasBunker(targetId)
      ]);

      const dataVentas = resVentas.ok ? (resVentas.documentos || []) : [];
      const dataCompras = resCompras.ok ? (resCompras.documentos || []) : [];

      const periodoStr = `${anioActivo}-${mesActivo}`;
      const filtrarPorMes = (docs) => docs.filter(doc => {
        if (!doc.fecha_emision) return false;
        return doc.fecha_emision.startsWith(periodoStr);
      });

      setVentas(filtrarPorMes(dataVentas));
      setCompras(filtrarPorMes(dataCompras));

    } catch (error) {
      console.error("Error al cargar RCV:", error);
      toast({ variant: "destructive", title: "ERROR DE CONEXION", description: "FALLA AL SINCRONIZAR CON EL BUNKER." });
    } finally {
      setIsLoadingDB(false);
    }
  }, [targetId, mesActivo, anioActivo]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // ==========================================
  // CÁLCULO DINÁMICO DE TOTALES Y PAGINACIÓN
  // ==========================================
  const stats = useMemo(() => {
    const calcularTotales = (docs) => docs.reduce((acc, doc) => {
      const neto = doc.monto_neto || 0;
      const iva = doc.monto_iva || Math.round(neto * 0.19); 
      const total = doc.monto_total || (neto + iva);
      
      return {
        dtes: acc.dtes + 1,
        neto: acc.neto + neto,
        iva: acc.iva + iva,
        total: acc.total + total
      };
    }, { dtes: 0, neto: 0, iva: 0, total: 0 });

    return {
      compras: calcularTotales(compras),
      ventas: calcularTotales(ventas)
    };
  }, [compras, ventas]);

  const documentosActivos = activeView === 'compras' ? compras : ventas;
  
  // Lógica de Paginación
  const totalPages = Math.ceil(documentosActivos.length / ITEMS_PER_PAGE) || 1;
  const currentData = documentosActivos.slice(
    (currentPage - 1) * ITEMS_PER_PAGE, 
    currentPage * ITEMS_PER_PAGE
  );

  // ==========================================
  // FUNCIONES DE INTERFAZ
  // ==========================================
  const handleSyncSII = () => {
    setIsSyncing(true);
    toast({ title: "SINCRONIZACION SUGERIDA", description: "UTILIZA EL BOTON DEL MODULO BOVEDA PARA EXTRAER EL SII." });
    setTimeout(() => setIsSyncing(false), 2000);
  };

  const handleContabilizar = () => {
    if (documentosActivos.length === 0) return;
    toast({ title: "EN PROCESO...", description: "GENERANDO ASIENTOS CONTABLES AUTOMATICOS." });
  };

  const formatCLP = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(val);

  return (
    <div className="space-y-6">
      {/* Cabecera y Controles de Acción */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0f172a]/60 p-4 rounded-xl border border-white/5 backdrop-blur-md shadow-xl">
        
        {/* SELECTOR DE PERIODO */}
        <div className="flex items-center bg-black/40 border border-white/10 rounded-xl px-1 py-1 shadow-inner focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/30 transition-all">
          <div className="flex items-center pl-3 pr-1">
            <CalendarDays className="h-4 w-4 text-blue-400" />
          </div>
          <select 
            value={mesActivo} 
            onChange={(e) => setMesActivo(e.target.value)}
            className="bg-transparent text-white text-xs font-black uppercase tracking-widest px-2 py-2 focus:outline-none appearance-none cursor-pointer hover:text-blue-400 transition-colors"
          >
            {MESES.map(m => (
              <option key={m.value} value={m.value} className="bg-slate-900 text-white">{m.label}</option>
            ))}
          </select>
          <span className="text-white/20 font-light mx-1">/</span>
          <select 
            value={anioActivo} 
            onChange={(e) => setAnioActivo(e.target.value)}
            className="bg-transparent text-white text-xs font-black uppercase tracking-widest px-2 py-2 focus:outline-none appearance-none cursor-pointer hover:text-blue-400 transition-colors"
          >
            {ANIOS.map(a => (
              <option key={a} value={a} className="bg-slate-900 text-white">{a}</option>
            ))}
          </select>
          <div className="pr-3 pl-1 pointer-events-none">
            <ChevronDown className="h-4 w-4 text-gray-500" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button 
            onClick={handleSyncSII} 
            disabled={isSyncing}
            className="bg-blue-600 hover:bg-blue-500 text-white font-black uppercase text-[10px] tracking-widest"
          >
            {isSyncing ? <RefreshCcw className="h-4 w-4 mr-2 animate-spin" /> : <DownloadCloud className="h-4 w-4 mr-2" />}
            EXTRAER DE SII
          </Button>
          <Button 
            onClick={() => setIsModalDiarioOpen(true)} // <-- Cambiado
            disabled={documentosActivos.length === 0}
            className={`font-black uppercase text-[10px] tracking-widest shadow-lg ${documentosActivos.length > 0 ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-900/40' : 'bg-black/40 border border-white/10 text-gray-500 cursor-not-allowed opacity-50'}`}
          >
            <BookCopy className="h-4 w-4 mr-2" /> {/* <-- Icono cambiado */}
            GENERAR LIBRO DIARIO {/* <-- Texto cambiado */}
          </Button>
        </div>
      </div>

      {/* Tarjetas de Resumen Compras/Ventas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* COMPRAS */}
        <div 
          onClick={() => setActiveView('compras')}
          className={`cursor-pointer p-5 rounded-xl border transition-all backdrop-blur-md ${activeView === 'compras' ? 'bg-[#0f172a]/80 border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.15)]' : 'bg-black/20 border-white/5 hover:bg-black/40'}`}
        >
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-lg ${activeView === 'compras' ? 'bg-red-500/20 text-red-400' : 'bg-white/5 text-gray-400'}`}>
                <ArrowDownRight className="h-5 w-5" />
              </div>
              <h3 className={`font-black uppercase tracking-tight ${activeView === 'compras' ? 'text-red-400' : 'text-gray-400'}`}>COMPRAS (RECIBIDOS)</h3>
            </div>
            <span className="text-xs font-black bg-white/10 px-2 py-1 rounded text-white">{stats.compras.dtes} DTES</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><p className="text-[10px] text-gray-500 uppercase font-black tracking-widest">NETO</p><p className="text-sm font-bold text-gray-300">{formatCLP(stats.compras.neto)}</p></div>
            <div><p className="text-[10px] text-gray-500 uppercase font-black tracking-widest">IVA</p><p className="text-sm font-bold text-gray-300">{formatCLP(stats.compras.iva)}</p></div>
            <div className="text-right"><p className="text-[10px] text-gray-500 uppercase font-black tracking-widest">TOTAL</p><p className="text-lg font-black text-white">{formatCLP(stats.compras.total)}</p></div>
          </div>
        </div>

        {/* VENTAS */}
        <div 
          onClick={() => setActiveView('ventas')}
          className={`cursor-pointer p-5 rounded-xl border transition-all backdrop-blur-md ${activeView === 'ventas' ? 'bg-[#0f172a]/80 border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.15)]' : 'bg-black/20 border-white/5 hover:bg-black/40'}`}
        >
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-lg ${activeView === 'ventas' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-gray-400'}`}>
                <ArrowUpRight className="h-5 w-5" />
              </div>
              <h3 className={`font-black uppercase tracking-tight ${activeView === 'ventas' ? 'text-emerald-400' : 'text-gray-400'}`}>VENTAS (EMITIDOS)</h3>
            </div>
            <span className="text-xs font-black bg-white/10 px-2 py-1 rounded text-white">{stats.ventas.dtes} DTES</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><p className="text-[10px] text-gray-500 uppercase font-black tracking-widest">NETO</p><p className="text-sm font-bold text-gray-300">{formatCLP(stats.ventas.neto)}</p></div>
            <div><p className="text-[10px] text-gray-500 uppercase font-black tracking-widest">IVA</p><p className="text-sm font-bold text-gray-300">{formatCLP(stats.ventas.iva)}</p></div>
            <div className="text-right"><p className="text-[10px] text-gray-500 uppercase font-black tracking-widest">TOTAL</p><p className="text-lg font-black text-white">{formatCLP(stats.ventas.total)}</p></div>
          </div>
        </div>
      </div>
{/* Tabla de Registros */}
      <div className="bg-[#0f172a]/80 rounded-xl border border-white/5 overflow-hidden backdrop-blur-md shadow-2xl flex flex-col">
        {isLoadingDB ? (
          <div className="p-16 flex flex-col justify-center items-center">
            <Loader2 className="h-10 w-10 text-blue-500 animate-spin mb-4" />
            <span className="text-blue-400 font-black text-xs uppercase tracking-widest animate-pulse">CONSULTANDO BUNKER...</span>
          </div>
        ) : documentosActivos.length === 0 ? (
          <div className="p-16 text-center flex flex-col items-center justify-center">
            <div className="bg-white/5 p-5 rounded-full mb-4 border border-white/10">
              <FileCheck className="h-8 w-8 text-gray-500" />
            </div>
            <h4 className="text-white font-black tracking-wide uppercase text-sm">SIN REGISTROS PARA MOSTRAR</h4>
            <p className="text-gray-500 text-[10px] mt-2 uppercase tracking-widest font-black max-w-md leading-relaxed">
              NO HAY DOCUMENTOS DE {activeView} EN LA BASE DE DATOS PARA ESTE PERIODO.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-sm text-gray-300 min-w-[800px]">
                <thead className="bg-white/5 border-b border-white/10 text-[10px] uppercase tracking-widest font-black text-gray-400">
                  <tr>
                    <th className="px-6 py-4">FECHA</th>
                    <th className="px-6 py-4">DOCUMENTO</th>
                    <th className="px-6 py-4">FOLIO</th>
                    <th className="px-6 py-4">{activeView === 'compras' ? 'PROVEEDOR' : 'CLIENTE'}</th>
                    <th className="px-6 py-4 text-right">NETO</th>
                    <th className="px-6 py-4 text-right">IVA</th>
                    <th className="px-6 py-4 text-right">TOTAL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {currentData.map((doc) => {
                    const neto = doc.monto_neto || 0;
                    const iva = doc.monto_iva || Math.round(neto * 0.19);
                    const total = doc.monto_total || (neto + iva);
                    
                    const rutRelacionado = activeView === 'compras' ? doc.rut_proveedor : doc.rut_cliente;
                    const razonSocialRaw = activeView === 'compras' ? doc.razon_social_proveedor : doc.razon_social;
                    const razonSocial = formatText(razonSocialRaw || 'SIN RAZON SOCIAL');
                    
                    return (
                      <tr key={doc.id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400 font-bold">
                          {doc.fecha_emision ? new Date(doc.fecha_emision).toLocaleDateString('es-CL', { timeZone: 'UTC' }) : 'N/A'}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded text-[9px] font-black uppercase border ${activeView === 'compras' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                            {TIPO_DTE_MAP[doc.tipo_dte] || `TIPO ${doc.tipo_dte}`}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-black text-white italic">#{doc.folio}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-xs text-gray-200 font-black truncate max-w-[200px]" title={razonSocial}>
                              {razonSocial}
                            </span>
                            <span className="text-[9px] font-mono font-bold text-gray-500 mt-0.5">{rutRelacionado}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-xs">{formatCLP(neto)}</td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-xs">{formatCLP(iva)}</td>
                        <td className={`px-6 py-4 text-right font-black font-mono tracking-tighter ${activeView === 'compras' ? 'text-red-400' : 'text-emerald-400'}`}>
                          {formatCLP(total)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {/* CONTROLES DE PAGINACIÓN */}
            <div className="flex items-center justify-between px-6 py-4 bg-black/20 border-t border-white/10 relative z-30">
              <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
                MOSTRANDO {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, documentosActivos.length)} DE {documentosActivos.length}
              </div>
              
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-8 bg-black/40 border-white/10 text-gray-400 hover:text-white disabled:opacity-20 transition-all font-black text-xs uppercase"
                >
                  <ChevronLeft size={14} className="mr-1" /> ANT
                </Button>
                
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2">
                  PAG {currentPage} DE {totalPages}
                </div>
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="h-8 bg-black/40 border-white/10 text-gray-400 hover:text-white disabled:opacity-20 transition-all font-black text-xs uppercase"
                >
                  SIG <ChevronRight size={14} className="ml-1" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* AQUÍ VA EL MODAL INYECTADO */}
      <GeneradorLibroDiarioModal 
        isOpen={isModalDiarioOpen} 
        setIsOpen={setIsModalDiarioOpen}
        compras={compras}
        ventas={ventas}
        mes={MESES.find(m => m.value === mesActivo)?.label}
        anio={anioActivo}
        empresaId={targetId}
      />
    </div>
  );
};

export default RegistroComprasVentas;