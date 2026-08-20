import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DownloadCloud, ArrowDownRight, ArrowUpRight, RefreshCcw, FileCheck, Loader2, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, BookCopy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth.jsx';
import { obtenerHistorialBunker, obtenerComprasBunker } from '@/services/dteConsultasService';
import GeneradorLibroDiarioModal from '@/components/contabilidad/modals/GeneradorLibroDiarioModal';
import { API_BASE_URL } from '../../../config.js';

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

// RECIBIMOS LA PROP DEL PADRE
const RegistroComprasVentas = ({ empresaId: propEmpresaId, onGuardarSuperficial }) => {
  const { user, selectedCompany } = useAuth();

  // Garantizar que targetId sea 'ALL' o el ID de la empresa real.
  // En Contabilidad la empresa principal se trata como cualquier otra: al elegirla
  // se muestran SUS compras y ventas, no el consolidado.
  const targetId = propEmpresaId || selectedCompany?.id || 'ALL';

  const [activeView, setActiveView] = useState('compras'); 
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoadingDB, setIsLoadingDB] = useState(false);
  
  // Guardamos TODA la data cruda que viene del backend
  const [rawCompras, setRawCompras] = useState([]);
  const [rawVentas, setRawVentas] = useState([]);
  
  // Guardamos la data filtrada por mes/año
  const [compras, setCompras] = useState([]);
  const [ventas, setVentas] = useState([]);
  
  const [isModalDiarioOpen, setIsModalDiarioOpen] = useState(false);

  const currentDate = new Date();
  const currentMonth = (currentDate.getMonth() + 1).toString().padStart(2, '0');
  const currentYear = currentDate.getFullYear().toString();

  const [mesActivo, setMesActivo] = useState(currentMonth);
  const [anioActivo, setAnioActivo] = useState(currentYear);
  const [currentPage, setCurrentPage] = useState(1);

  // Volver a la página 1 si cambian los filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [activeView, mesActivo, anioActivo, targetId]);

  // Cargar datos DESDE EL BACKEND
  const cargarDatos = useCallback(async () => {
    setIsLoadingDB(true);
    try {
      // Le pasamos el targetId (que es 'ALL' o el UUID de la empresa)
      const [resVentas, resCompras] = await Promise.all([
        obtenerHistorialBunker(targetId, user?.sessionId),
        obtenerComprasBunker(targetId, user?.sessionId)
      ]);

      const dataVentas = resVentas.ok ? (resVentas.documentos || []) : [];
      const dataCompras = resCompras.ok ? (resCompras.documentos || []) : [];

      setRawVentas(dataVentas);
      setRawCompras(dataCompras);
      
    } catch (error) {
      console.error("Error al cargar RCV:", error);
      toast({ variant: "destructive", title: "ERROR DE CONEXION", description: "FALLA AL SINCRONIZAR CON EL BUNKER." });
    } finally {
      setIsLoadingDB(false);
    }
  }, [targetId, user?.sessionId]);

  // Disparar carga de datos cuando cambia targetId
  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Aplicar FILTRO DE FECHA localmente a la data cruda
  useEffect(() => {
    const periodoStr = `${anioActivo}-${mesActivo}`;
    
    const filtrarPorMes = (docs) => docs.filter(doc => {
      if (!doc.fecha_emision) return false;
      return doc.fecha_emision.startsWith(periodoStr);
    });

    setVentas(filtrarPorMes(rawVentas));
    setCompras(filtrarPorMes(rawCompras));
  }, [rawVentas, rawCompras, mesActivo, anioActivo]);

  const stats = useMemo(() => {
    const calcularTotales = (docs) => docs.reduce((acc, doc) => {
      const neto = Number(doc.monto_neto) || 0;
      const iva = Number(doc.monto_iva) || Math.round(neto * 0.19); 
      const total = Number(doc.monto_total) || (neto + iva);
      
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
  const totalPages = Math.ceil(documentosActivos.length / ITEMS_PER_PAGE) || 1;
  const currentData = documentosActivos.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const handleSyncSII = async () => {
    setIsSyncing(true);

    // Las credenciales ya no se validan ni se envían desde acá: el backend las
    // lee de la ficha del cliente y, si falta alguna, responde diciendo cuál.
    // Antes este chequeo miraba `selectedCompany.claveSII`, que casi nunca venía
    // cargado en el objeto del selector, así que cortaba antes de intentarlo.

    // Si targetId es ALL, evitamos sincronizar
    if (targetId === 'ALL') {
      toast({ variant: "destructive", title: "Operación no permitida", description: "Selecciona una empresa específica para sincronizar manualmente."});
      setIsSyncing(false);
      return;
    }

    toast({ title: "🤖 Iniciando Robot", description: `Conectando al SII para extraer información...` });

    try {
      const response = await fetch(`${API_BASE_URL}/sincronizar-sii`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': user?.sessionId,
        },
        body: JSON.stringify({
          mes: mesActivo,
          anio: anioActivo,
          tipo: activeView, // Solo referencial, el robot saca ambos
          empresaId: targetId
        })
      });

      const result = await response.json();

      if (result.success) {
        toast({ title: "✅ Sincronización Exitosa", description: result.message });
        cargarDatos(); 
      } else {
        toast({ variant: "destructive", title: "❌ Error en el Robot", description: result.message || "Falla al extraer datos." });
      }
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Error de Conexión", description: "No se pudo contactar al servidor." });
    } finally {
      setIsSyncing(false);
    }
  };
  
  const formatCLP = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(val);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-[#efe8dd] backdrop-blur-md shadow-xl">
        <div className="flex items-center bg-slate-50 border border-[#efe8dd] rounded-xl px-1 py-1 shadow-inner focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/30 transition-all">
          <div className="flex items-center pl-3 pr-1">
            <CalendarDays className="h-4 w-4 text-blue-600" />
          </div>
          <select 
            value={mesActivo} 
            onChange={(e) => setMesActivo(e.target.value)}
            className="bg-transparent text-slate-700 text-xs font-black uppercase tracking-widest px-2 py-2 focus:outline-none appearance-none cursor-pointer hover:text-blue-600 transition-colors"
          >
            {MESES.map(m => (
              <option key={m.value} value={m.value} className="bg-white text-slate-700">{m.label}</option>
            ))}
          </select>
          <span className="text-slate-700/20 font-light mx-1">/</span>
          <select 
            value={anioActivo} 
            onChange={(e) => setAnioActivo(e.target.value)}
            className="bg-transparent text-slate-700 text-xs font-black uppercase tracking-widest px-2 py-2 focus:outline-none appearance-none cursor-pointer hover:text-blue-600 transition-colors"
          >
            {ANIOS.map(a => (
              <option key={a} value={a} className="bg-white text-slate-700">{a}</option>
            ))}
          </select>
          <div className="pr-3 pl-1 pointer-events-none">
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button 
            onClick={handleSyncSII} 
            disabled={isSyncing || targetId === 'ALL'}
            className="bg-emerald-600 hover:bg-emerald-500 text-slate-900 font-black uppercase text-[10px] tracking-widest"
            title={targetId === 'ALL' ? 'Selecciona una empresa para sincronizar' : ''}
          >
            {isSyncing ? <RefreshCcw className="h-4 w-4 mr-2 animate-spin" /> : <DownloadCloud className="h-4 w-4 mr-2" />}
            EXTRAER DE SII
          </Button>
          <Button 
            onClick={() => setIsModalDiarioOpen(true)}
            disabled={documentosActivos.length === 0}
            className={`font-black uppercase text-[10px] tracking-widest shadow-lg ${documentosActivos.length > 0 ? 'bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white shadow-emerald-900/40' : 'bg-slate-50 border border-[#efe8dd] text-slate-400 cursor-not-allowed opacity-50'}`}
          >
            <BookCopy className="h-4 w-4 mr-2" />
            GENERAR LIBRO DIARIO
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* COMPRAS */}
        <div onClick={() => setActiveView('compras')} className={`cursor-pointer p-5 rounded-xl border transition-all backdrop-blur-md ${activeView === 'compras' ? 'bg-white border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.15)]' : 'bg-slate-50 border-[#efe8dd] hover:bg-slate-50'}`}>
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-lg ${activeView === 'compras' ? 'bg-red-500/20 text-red-500' : 'bg-slate-50 text-slate-500'}`}>
                <ArrowDownRight className="h-5 w-5" />
              </div>
              <h3 className={`font-black uppercase tracking-tight ${activeView === 'compras' ? 'text-red-500' : 'text-slate-500'}`}>COMPRAS (RECIBIDOS)</h3>
            </div>
            <span className="text-xs font-black bg-slate-100 px-2 py-1 rounded text-slate-700">{stats.compras.dtes} DTES</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div><p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">NETO</p><p className="text-sm font-bold text-slate-600">{formatCLP(stats.compras.neto)}</p></div>
            <div><p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">IVA</p><p className="text-sm font-bold text-slate-600">{formatCLP(stats.compras.iva)}</p></div>
            <div className="text-right"><p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">TOTAL</p><p className="text-lg font-black text-slate-900">{formatCLP(stats.compras.total)}</p></div>
          </div>
        </div>

        {/* VENTAS */}
        <div onClick={() => setActiveView('ventas')} className={`cursor-pointer p-5 rounded-xl border transition-all backdrop-blur-md ${activeView === 'ventas' ? 'bg-white border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.15)]' : 'bg-slate-50 border-[#efe8dd] hover:bg-slate-50'}`}>
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-lg ${activeView === 'ventas' ? 'bg-emerald-500/20 text-emerald-600' : 'bg-slate-50 text-slate-500'}`}>
                <ArrowUpRight className="h-5 w-5" />
              </div>
              <h3 className={`font-black uppercase tracking-tight ${activeView === 'ventas' ? 'text-emerald-600' : 'text-slate-500'}`}>VENTAS (EMITIDOS)</h3>
            </div>
            <span className="text-xs font-black bg-slate-100 px-2 py-1 rounded text-slate-700">{stats.ventas.dtes} DTES</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div><p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">NETO</p><p className="text-sm font-bold text-slate-600">{formatCLP(stats.ventas.neto)}</p></div>
            <div><p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">IVA</p><p className="text-sm font-bold text-slate-600">{formatCLP(stats.ventas.iva)}</p></div>
            <div className="text-right"><p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">TOTAL</p><p className="text-lg font-black text-slate-900">{formatCLP(stats.ventas.total)}</p></div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#efe8dd] overflow-hidden backdrop-blur-md shadow-2xl flex flex-col">
        {isLoadingDB ? (
          <div className="p-16 flex flex-col justify-center items-center">
            <Loader2 className="h-10 w-10 text-blue-500 animate-spin mb-4" />
            <span className="text-blue-600 font-black text-xs uppercase tracking-widest animate-pulse">CONSULTANDO BUNKER...</span>
          </div>
        ) : documentosActivos.length === 0 ? (
          <div className="p-16 text-center flex flex-col items-center justify-center">
            <div className="bg-slate-50 p-5 rounded-full mb-4 border border-[#efe8dd]">
              <FileCheck className="h-8 w-8 text-slate-400" />
            </div>
            <h4 className="text-slate-900 font-black tracking-wide uppercase text-sm">SIN REGISTROS PARA MOSTRAR</h4>
            <p className="text-slate-400 text-[10px] mt-2 uppercase tracking-widest font-black max-w-md leading-relaxed">
              NO HAY DOCUMENTOS DE {activeView} EN LA BASE DE DATOS PARA ESTE PERIODO.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-sm text-slate-600 min-w-[800px]">
                <thead className="bg-slate-50 border-b border-[#efe8dd] text-[10px] uppercase tracking-widest font-black text-slate-500">
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
                    const neto = Number(doc.monto_neto) || 0;
                    const iva = Number(doc.monto_iva) || Math.round(neto * 0.19);
                    const total = Number(doc.monto_total) || (neto + iva);
                    
                    const rutRelacionado = activeView === 'compras' ? doc.rut_proveedor : doc.rut_cliente;
                    const razonSocialRaw = activeView === 'compras' ? doc.razon_social_proveedor : doc.razon_social;
                    const razonSocial = formatText(razonSocialRaw || 'SIN RAZON SOCIAL');
                    
                    return (
                      <tr key={doc.id} className="hover:bg-white transition-colors group">
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 font-bold">
                          {doc.fecha_emision ? new Date(doc.fecha_emision).toLocaleDateString('es-CL', { timeZone: 'UTC' }) : 'N/A'}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded text-[9px] font-black uppercase border ${activeView === 'compras' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'}`}>
                            {TIPO_DTE_MAP[doc.tipo_dte] || `TIPO ${doc.tipo_dte}`}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-black text-slate-900 italic">#{doc.folio}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-xs text-slate-700 font-black truncate max-w-[200px]" title={razonSocial}>
                              {razonSocial}
                            </span>
                            <span className="text-[9px] font-mono font-bold text-slate-400 mt-0.5">{rutRelacionado}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-xs">{formatCLP(neto)}</td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-xs">{formatCLP(iva)}</td>
                        <td className={`px-6 py-4 text-right font-black font-mono tracking-tighter ${activeView === 'compras' ? 'text-red-500' : 'text-emerald-600'}`}>
                          {formatCLP(total)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-[#efe8dd] relative z-30">
              <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                MOSTRANDO {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, documentosActivos.length)} DE {documentosActivos.length}
              </div>
              
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-8 bg-slate-50 border-[#efe8dd] text-slate-500 hover:text-slate-900 disabled:opacity-20 transition-all font-black text-xs uppercase">
                  <ChevronLeft size={14} className="mr-1" /> ANT
                </Button>
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-2">
                  PAG {currentPage} DE {totalPages}
                </div>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="h-8 bg-slate-50 border-[#efe8dd] text-slate-500 hover:text-slate-900 disabled:opacity-20 transition-all font-black text-xs uppercase">
                  SIG <ChevronRight size={14} className="ml-1" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <GeneradorLibroDiarioModal 
        isOpen={isModalDiarioOpen} 
        setIsOpen={setIsModalDiarioOpen}
        compras={compras}
        ventas={ventas}
        mes={MESES.find(m => m.value === mesActivo)?.label}
        anio={anioActivo}
        empresaId={targetId}
        onGuardarSuperficial={onGuardarSuperficial}
      />
    </div>
  );
};

export default RegistroComprasVentas;