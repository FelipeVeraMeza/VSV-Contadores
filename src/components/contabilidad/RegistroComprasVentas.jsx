import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DownloadCloud, Filter, ArrowDownRight, ArrowUpRight, Zap, RefreshCcw, FileCheck, Loader2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

// 1. IMPORTAMOS EXACTAMENTE LAS MISMAS HERRAMIENTAS QUE EN DocumentosDTE.jsx
import { useAuth } from '@/hooks/useAuth.jsx';
import { obtenerHistorialBunker, obtenerComprasBunker } from '@/services/dteConsultasService';

// Mapa de nombres de documentos
const TIPO_DTE_MAP = {
  33: "Factura Electrónica",
  34: "Factura Exenta",
  61: "Nota de Crédito",
  56: "Nota de Débito",
  52: "Guía de Despacho",
  39: "Boleta Electrónica",
  110: "Factura Exportación"
};

const RegistroComprasVentas = ({ empresaId: propEmpresaId }) => {
  // 2. CONTEXTO PARA SABER QUÉ EMPRESA ESTÁ ACTIVA
  const { selectedCompany } = useAuth();
  
  // Determinamos el ID a buscar (Prioriza el prop, sino usa el global, sino busca todos)
  const targetId = propEmpresaId || selectedCompany?.id || 'ALL';

  const [activeView, setActiveView] = useState('compras'); // 'compras' o 'ventas'
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoadingDB, setIsLoadingDB] = useState(false);
  
  const [compras, setCompras] = useState([]);
  const [ventas, setVentas] = useState([]);
  
  const [mesActivo, setMesActivo] = useState(new Date().toISOString().slice(0, 7));

  // ==========================================
  // 3. CONEXIÓN EXACTA A LA DE DocumentosDTE.jsx
  // ==========================================
  const cargarDatos = useCallback(async () => {
    if (!targetId) return;
    
    setIsLoadingDB(true);
    try {
      // Consultamos ambas funciones del servicio de forma simultánea
      const [resVentas, resCompras] = await Promise.all([
        obtenerHistorialBunker(targetId),
        obtenerComprasBunker(targetId)
      ]);

      const dataVentas = resVentas.ok ? (resVentas.documentos || []) : [];
      const dataCompras = resCompras.ok ? (resCompras.documentos || []) : [];

      // Filtramos localmente para mostrar solo las del mes seleccionado (Ej: "2026-05")
      const filtrarPorMes = (docs) => docs.filter(doc => {
        if (!doc.fecha_emision) return false;
        return doc.fecha_emision.startsWith(mesActivo);
      });

      setVentas(filtrarPorMes(dataVentas));
      setCompras(filtrarPorMes(dataCompras));

    } catch (error) {
      console.error("Error al cargar RCV:", error);
      toast({ variant: "destructive", title: "Error de Conexión", description: "Falla al sincronizar con el búnker." });
    } finally {
      setIsLoadingDB(false);
    }
  }, [targetId, mesActivo]);

  // Se ejecuta cada vez que cambias de empresa o cambias de mes
  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // ==========================================
  // CÁLCULO DINÁMICO DE TOTALES
  // ==========================================
  const stats = useMemo(() => {
    const calcularTotales = (docs) => docs.reduce((acc, doc) => {
      // Mapeo seguro en caso de que alguna columna sea nula
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

  // ==========================================
  // FUNCIONES DE INTERFAZ
  // ==========================================
  const handleSyncSII = () => {
    setIsSyncing(true);
    toast({ title: "Sincronización manual sugerida", description: "Por favor utiliza el botón del módulo Bóveda de Documentos para extraer el SII." });
    setTimeout(() => setIsSyncing(false), 2000);
  };

  const handleContabilizar = () => {
    if (documentosActivos.length === 0) return;
    toast({ title: "En proceso...", description: "Generando asientos contables automáticos." });
  };

  const formatCLP = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(val);

  return (
    <div className="space-y-6">
      {/* Cabecera y Controles de Acción */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0f172a]/60 p-4 rounded-xl border border-white/5 backdrop-blur-md shadow-xl">
        <div className="flex items-center gap-2">
          <input 
            type="month" 
            value={mesActivo}
            onChange={(e) => setMesActivo(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 shadow-inner" 
          />
          <Button variant="outline" className="bg-black/40 border-white/10 text-gray-400 hover:text-white hover:bg-white/5 text-xs uppercase tracking-widest font-bold">
            <Filter className="h-4 w-4 mr-2" /> Filtrar
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <Button 
            onClick={handleSyncSII} 
            disabled={isSyncing}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold uppercase text-[10px] tracking-widest"
          >
            {isSyncing ? <RefreshCcw className="h-4 w-4 mr-2 animate-spin" /> : <DownloadCloud className="h-4 w-4 mr-2" />}
            Extraer de SII
          </Button>
          <Button 
            onClick={handleContabilizar}
            disabled={documentosActivos.length === 0}
            className={`font-bold uppercase text-[10px] tracking-widest shadow-lg ${documentosActivos.length > 0 ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-900/40' : 'bg-black/40 border border-white/10 text-gray-500 cursor-not-allowed opacity-50'}`}
          >
            <Zap className="h-4 w-4 mr-2" />
            Contabilizar DTEs
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
              <h3 className={`font-black uppercase tracking-tight ${activeView === 'compras' ? 'text-red-400' : 'text-gray-400'}`}>Compras (Recibidos)</h3>
            </div>
            <span className="text-xs font-bold bg-white/10 px-2 py-1 rounded text-white">{stats.compras.dtes} DTEs</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Neto</p><p className="text-sm font-bold text-gray-300">{formatCLP(stats.compras.neto)}</p></div>
            <div><p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">IVA</p><p className="text-sm font-bold text-gray-300">{formatCLP(stats.compras.iva)}</p></div>
            <div className="text-right"><p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Total</p><p className="text-lg font-black text-white">{formatCLP(stats.compras.total)}</p></div>
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
              <h3 className={`font-black uppercase tracking-tight ${activeView === 'ventas' ? 'text-emerald-400' : 'text-gray-400'}`}>Ventas (Emitidos)</h3>
            </div>
            <span className="text-xs font-bold bg-white/10 px-2 py-1 rounded text-white">{stats.ventas.dtes} DTEs</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Neto</p><p className="text-sm font-bold text-gray-300">{formatCLP(stats.ventas.neto)}</p></div>
            <div><p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">IVA</p><p className="text-sm font-bold text-gray-300">{formatCLP(stats.ventas.iva)}</p></div>
            <div className="text-right"><p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Total</p><p className="text-lg font-black text-white">{formatCLP(stats.ventas.total)}</p></div>
          </div>
        </div>
      </div>

      {/* Tabla de Registros */}
      <div className="bg-[#0f172a]/80 rounded-xl border border-white/5 overflow-hidden backdrop-blur-md shadow-2xl">
        {isLoadingDB ? (
          <div className="p-16 flex flex-col justify-center items-center">
            <Loader2 className="h-10 w-10 text-blue-500 animate-spin mb-4" />
            <span className="text-blue-400 font-bold text-xs uppercase tracking-widest animate-pulse">Consultando Búnker...</span>
          </div>
        ) : documentosActivos.length === 0 ? (
          <div className="p-16 text-center flex flex-col items-center justify-center">
            <div className="bg-white/5 p-5 rounded-full mb-4 border border-white/10">
              <FileCheck className="h-8 w-8 text-gray-500" />
            </div>
            <h4 className="text-white font-black tracking-wide uppercase text-sm">Sin registros para mostrar</h4>
            <p className="text-gray-500 text-[10px] mt-2 uppercase tracking-widest font-bold max-w-md leading-relaxed">
              No hay documentos de {activeView} en la base de datos para el periodo {mesActivo}. 
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm text-gray-300 min-w-[800px]">
              <thead className="bg-white/5 border-b border-white/10 text-[10px] uppercase tracking-widest font-black text-gray-400">
                <tr>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4">Documento</th>
                  <th className="px-6 py-4">Folio</th>
                  <th className="px-6 py-4">{activeView === 'compras' ? 'Proveedor' : 'Cliente'}</th>
                  <th className="px-6 py-4 text-right">Neto</th>
                  <th className="px-6 py-4 text-right">IVA</th>
                  <th className="px-6 py-4 text-right">Total</th>
                  <th className="px-6 py-4 text-center">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {documentosActivos.map((doc) => {
                  const neto = doc.monto_neto || 0;
                  const iva = doc.monto_iva || Math.round(neto * 0.19);
                  const total = doc.monto_total || (neto + iva);
                  
                  // Lógica compartida para RUT y Razón Social (ya que recibidos tiene otras columnas)
                  const rutRelacionado = activeView === 'compras' ? doc.rut_proveedor : doc.rut_cliente;
                  const razonSocial = activeView === 'compras' ? doc.razon_social_proveedor : doc.razon_social;
                  
                  return (
                    <tr key={doc.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400">
                        {doc.fecha_emision ? new Date(doc.fecha_emision).toLocaleDateString('es-CL', { timeZone: 'UTC' }) : 'N/A'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-[9px] font-black uppercase border ${activeView === 'compras' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                          {TIPO_DTE_MAP[doc.tipo_dte] || `Tipo ${doc.tipo_dte}`}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-black text-white italic">#{doc.folio}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-xs text-gray-200 font-bold truncate max-w-[200px]" title={razonSocial}>
                            {razonSocial ? razonSocial.toUpperCase() : 'SIN RAZÓN SOCIAL'}
                          </span>
                          <span className="text-[9px] font-mono text-gray-500 mt-0.5">{rutRelacionado}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-xs">{formatCLP(neto)}</td>
                      <td className="px-6 py-4 text-right font-mono text-xs">{formatCLP(iva)}</td>
                      <td className={`px-6 py-4 text-right font-black font-mono tracking-tighter ${activeView === 'compras' ? 'text-red-400' : 'text-emerald-400'}`}>
                        {formatCLP(total)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {doc.url_pdf ? (
                          <a 
                            href={doc.url_pdf} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white hover:text-black transition-all shadow-lg"
                          >
                            <FileText className="h-4 w-4" />
                          </a>
                        ) : (
                          <span className="text-[9px] text-gray-600 font-bold">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default RegistroComprasVentas;