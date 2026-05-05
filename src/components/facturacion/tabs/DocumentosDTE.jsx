import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, FileWarning, Loader2, Search, Filter, Building2, FileText, Hash, ArrowUpRight, ArrowDownLeft, Globe, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth.jsx';
import { obtenerHistorialBunker, obtenerComprasBunker } from '@/services/dteConsultasService';
import { API_BASE_URL } from '../../../../config.js'; 

const NOMBRES_DTE = {
  33: "Factura Electrónica",
  34: "Factura Exenta",
  61: "Nota de Crédito",
  56: "Nota de Débito",
  52: "Guía de Despacho",
  39: "Boleta Electrónica",
  110: "Factura Exportación"
};

// UTILIDAD PARA BUSCADOR
const normalizeText = (text) => {
  if (!text) return "";
  return text.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

const cleanRutForSearch = (rut) => {
  if (!rut) return "";
  return rut.toString().replace(/[^0-9kK]/gi, '').toLowerCase();
};

// UTILIDAD PARA MOSTRAR DATOS
const formatDisplay = (str) => {
  if (!str) return '';
  return str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
};

const DocumentosDTE = () => {
  const { selectedCompany } = useAuth();
  const [documentos, setDocumentos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false); 

  const [tipoVista, setTipoVista] = useState('VENTAS'); 
  const [vistaGlobal, setVistaGlobal] = useState(false); 

  const [searchTerm, setSearchTerm] = useState(""); 
  const [filterTipo, setFilterTipo] = useState("TODOS");
  const [filterMes, setFilterMes] = useState("TODOS");
  const [filterAnio, setFilterAnio] = useState("TODOS");

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 9; 
  const tableContainerRef = useRef(null);

  useEffect(() => {
    if (selectedCompany) {
      setVistaGlobal(false);
    }
  }, [selectedCompany]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterTipo, filterMes, filterAnio, tipoVista, vistaGlobal, selectedCompany]);

  useEffect(() => {
    if (tableContainerRef.current && currentPage > 1) {
      tableContainerRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  }, [currentPage]);

  const cargarHistorial = useCallback(async () => {
    const isGlobal = !selectedCompany || vistaGlobal;
    const targetId = isGlobal ? 'ALL' : selectedCompany.id;

    setLoading(true);
    setDocumentos([]);

    try {
      let data;
      if (tipoVista === 'VENTAS') {
        data = await obtenerHistorialBunker(targetId);
      } else {
        data = await obtenerComprasBunker(targetId);
      }

      if (data.ok) {
        setDocumentos(data.documentos || []);
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Error de Conexión", description: "Falla al sincronizar con el búnker." });
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, tipoVista, vistaGlobal]);

  useEffect(() => {
    cargarHistorial();
  }, [cargarHistorial]);

  // ======================================================================
  // 🤖 FUNCIÓN INTELIGENTE: Sincroniza TODO en cadena (Ventas -> Compras)
  // ======================================================================
  const handleSincronizarSII = async () => {
    setIsSyncing(true);

    try {
      // --- PASO 1: SINCRONIZAR VENTAS ---
      toast({
        title: "🤖 Robot Iniciado [1/2]",
        description: "Extrayendo historial de VENTAS desde el SII...",
      });

      const responseVentas = await fetch(`${API_BASE_URL}/sincronizar-sii`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tipo: 'VENTAS' }) 
      });
      const dataVentas = await responseVentas.json();
      if (!dataVentas.success) throw new Error(dataVentas.message);


      // --- PASO 2: SINCRONIZAR COMPRAS ---
      toast({
        title: "🤖 Robot Trabajando [2/2]",
        description: "Ventas listas. Ahora extrayendo COMPRAS...",
      });

      const responseCompras = await fetch(`${API_BASE_URL}/sincronizar-sii`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tipo: 'COMPRAS' }) 
      });
      const dataCompras = await responseCompras.json();
      if (!dataCompras.success) throw new Error(dataCompras.message);


      // --- FINALIZADO CON ÉXITO ---
      toast({
        title: "✅ Sincronización Total Exitosa",
        description: "Ventas y Compras han sido actualizadas en la base de datos.",
        className: "bg-emerald-600 text-white border-none",
      });
      
      // Recargamos la tabla visual para mostrar lo nuevo
      await cargarHistorial(); 
      
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Error de Sincronización",
        description: "El robot del SII encontró un problema al extraer o subir los datos."
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const documentosFiltrados = useMemo(() => {
    return documentos.filter(doc => {
      const fecha = new Date(doc.fecha_emision);
      const termText = normalizeText(searchTerm);
      const termRut = cleanRutForSearch(searchTerm);
      
      const razonSocialDoc = normalizeText(tipoVista === 'VENTAS' ? doc.razon_social : doc.razon_social_proveedor);
      const rutOriginal = tipoVista === 'VENTAS' ? doc.rut_cliente : doc.rut_proveedor;
      const rutDocClean = cleanRutForSearch(rutOriginal);

      const matchSearch = termText === "" || 
                          razonSocialDoc.includes(termText) || 
                          rutDocClean.includes(termRut);

      const matchTipo = filterTipo === "TODOS" || doc.tipo_dte.toString() === filterTipo;
      const matchAnio = filterAnio === "TODOS" || fecha.getUTCFullYear().toString() === filterAnio;
      const matchMes = filterMes === "TODOS" || (fecha.getUTCMonth() + 1).toString() === filterMes;
      
      return matchSearch && matchTipo && matchAnio && matchMes;
    });
  }, [documentos, searchTerm, filterTipo, filterMes, filterAnio, tipoVista]);

  const totalPages = Math.ceil(documentosFiltrados.length / ITEMS_PER_PAGE) || 1;
  const currentData = documentosFiltrados.slice(
    (currentPage - 1) * ITEMS_PER_PAGE, 
    currentPage * ITEMS_PER_PAGE
  );

  const isModoGlobalActivo = !selectedCompany || vistaGlobal;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#0f172a]/60 p-4 rounded-2xl border border-white/5 backdrop-blur-md shadow-xl">
        <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20 text-blue-400">
                <FileText size={20} />
            </div>
            <div>
                <h2 className="text-white font-black uppercase tracking-tighter text-lg">Bóveda de Documentos</h2>
                <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">
                    {isModoGlobalActivo ? '🌐 TODAS LAS EMPRESAS' : formatDisplay(selectedCompany?.razon_social || selectedCompany?.razonSocial)}
                </p>
            </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
            {selectedCompany && (
              <Button 
                  onClick={() => setVistaGlobal(!vistaGlobal)} 
                  variant="outline" 
                  className={`h-10 text-[10px] font-black uppercase tracking-widest ${vistaGlobal ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30' : 'bg-black/40 border-white/10 text-gray-400'}`}
              >
                  <Globe size={14} className="mr-2" /> {vistaGlobal ? 'Ocultar Global' : 'Modo Global'}
              </Button>
            )}

            <div className="flex bg-black/40 p-1 rounded-xl border border-white/10 w-full sm:w-auto h-10">
                <button
                    onClick={() => setTipoVista('VENTAS')}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                        tipoVista === 'VENTAS' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-gray-500 hover:text-gray-300'
                    }`}
                >
                    <ArrowUpRight size={14} /> Ventas
                </button>
                <button
                    onClick={() => setTipoVista('COMPRAS')}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                        tipoVista === 'COMPRAS' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' : 'text-gray-500 hover:text-gray-300'
                    }`}
                >
                    <ArrowDownLeft size={14} /> Compras
                </button>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-[#0f172a]/60 p-4 rounded-2xl border border-white/5 backdrop-blur-md shadow-xl">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors" size={14} />
          <input 
            type="text"
            placeholder="Buscar por Nombre o RUT..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 transition-all placeholder:text-gray-600"
          />
        </div>
        <div className="relative">
            <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 appearance-none cursor-pointer">
                <option value="TODOS">Todos los Tipos</option>
                <option value="33">Factura Electrónica (33)</option>
                <option value="34">Factura Exenta (34)</option>
                <option value="61">Nota de Crédito (61)</option>
                <option value="52">Guía de Despacho (52)</option>
                <option value="39">Boleta Electrónica (39)</option>
            </select>
        </div>
        <select value={filterMes} onChange={(e) => setFilterMes(e.target.value)} className="bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 appearance-none cursor-pointer">
          <option value="TODOS">Todos los Meses</option>
          {["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"].map((m, i) => (
            <option key={m} value={(i + 1).toString()}>{m}</option>
          ))}
        </select>
        <select value={filterAnio} onChange={(e) => setFilterAnio(e.target.value)} className="bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 appearance-none cursor-pointer">
          <option value="TODOS">Todos los Años</option>
          <option value="2024">2024</option>
          <option value="2025">2025</option>
          <option value="2026">2026</option>
        </select>
      </div>

      <div className="flex items-center justify-between px-2">
        <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${tipoVista === 'VENTAS' ? 'text-blue-500' : 'text-emerald-500'}`}>
          <FileText size={12} /> {documentosFiltrados.length} {tipoVista} encontradas
        </span>
        
        {/* ========================================================== */}
        {/* BOTÓN MÁGICO DE SINCRONIZACIÓN TOTAL */}
        {/* ========================================================== */}
        <Button 
            onClick={handleSincronizarSII} 
            disabled={isSyncing} 
            variant="outline" 
            size="sm" 
            className={`text-[10px] font-black uppercase tracking-widest transition-all border ${
                isSyncing 
                ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50 cursor-wait' 
                : 'bg-black/40 text-gray-400 hover:text-white hover:bg-white/10 border-white/10'
            }`}
        >
            {isSyncing ? (
                <>
                    <Loader2 size={14} className="mr-2 animate-spin" />
                    Sincronizando Todo...
                </>
            ) : (
                <>
                    <Globe size={14} className="mr-2 text-indigo-400" />
                    Sincronizar Todo el SII
                </>
            )}
        </Button>
      </div>

      <div ref={tableContainerRef} className="overflow-hidden rounded-2xl border border-white/5 bg-black/20 backdrop-blur-xl shadow-2xl flex flex-col pt-2 scroll-mt-24">
        <div className="overflow-x-auto custom-scrollbar w-full">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-gray-400 tracking-widest">Documento</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-gray-400 tracking-widest">Folio</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-gray-400 tracking-widest">
                    {tipoVista === 'VENTAS' ? 'Cliente' : 'Proveedor'}
                </th>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-gray-400 tracking-widest">Emisión</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-gray-400 tracking-widest text-right">Monto</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-gray-400 text-center">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <AnimatePresence mode="popLayout">
                {loading ? (
                  <motion.tr key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <td colSpan={6} className="py-24 text-center">
                      <Loader2 className={`h-10 w-10 animate-spin mx-auto mb-4 ${tipoVista === 'VENTAS' ? 'text-blue-500' : 'text-emerald-500'}`} />
                      <p className={`text-[10px] font-black uppercase tracking-widest animate-pulse italic ${tipoVista === 'VENTAS' ? 'text-blue-400' : 'text-emerald-400'}`}>
                        Cargando bóveda {isModoGlobalActivo ? 'global' : 'local'}...
                      </p>
                    </td>
                  </motion.tr>
                ) : currentData.length > 0 ? (
                  currentData.map((dte, idx) => {
                    const nombreContraparte = tipoVista === 'VENTAS' 
                        ? (dte.razon_social || 'Cliente sin nombre') 
                        : (dte.razon_social_proveedor || 'Proveedor Desconocido');
                        
                    const rutContraparte = tipoVista === 'VENTAS' 
                        ? dte.rut_cliente 
                        : dte.rut_proveedor;

                    const montoPrincipal = tipoVista === 'VENTAS' 
                        ? dte.monto_neto 
                        : (dte.monto_total || dte.monto_neto);

                    return (
                        <motion.tr 
                          key={dte.id || `dte-${idx}-${dte.folio}`} 
                          initial={{ opacity: 0, y: 10 }} 
                          animate={{ opacity: 1, y: 0 }} 
                          transition={{ delay: idx * 0.02 }}
                          className="hover:bg-white/[0.03] group transition-colors border-b border-white/5 last:border-none"
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase border ${
                                tipoVista === 'VENTAS' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                            }`}>
                              {NOMBRES_DTE[dte.tipo_dte] || `DTE ${dte.tipo_dte}`}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-white italic tracking-tighter whitespace-nowrap">
                            #{dte.folio}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col">
                                <span className="text-xs text-gray-200 font-medium truncate max-w-[200px]" title={nombreContraparte}>
                                    {formatDisplay(nombreContraparte)}
                                </span>
                                <span className="text-[9px] text-gray-500 font-mono">
                                    {formatDisplay(rutContraparte)}
                                </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xs text-gray-400 font-medium whitespace-nowrap">
                            {dte.fecha_emision ? new Date(dte.fecha_emision).toLocaleDateString('es-CL', { timeZone: 'UTC' }) : 'Sin Fecha'}
                          </td>
                          <td className="px-6 py-4 text-right whitespace-nowrap">
                            <div className="flex flex-col items-end">
                                <span className={`text-sm font-black font-mono tracking-tighter ${tipoVista === 'VENTAS' ? 'text-blue-400' : 'text-emerald-400'}`}>
                                    ${Number(montoPrincipal || 0).toLocaleString('es-CL')}
                                </span>
                                {tipoVista === 'COMPRAS' && dte.monto_iva > 0 && (
                                    <span className="text-[9px] text-gray-500 uppercase tracking-widest mt-0.5">
                                        IVA: ${Number(dte.monto_iva).toLocaleString('es-CL')}
                                    </span>
                                )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center whitespace-nowrap">
                            {dte.url_pdf ? (
                              <a 
                                href={dte.url_pdf} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-white/5 text-gray-300 border border-white/10 hover:bg-white hover:text-black transition-all shadow-lg active:scale-90"
                                title="Ver PDF"
                              >
                                <Download size={16} />
                              </a>
                            ) : (
                              <span className="text-[8px] text-gray-600 font-black uppercase italic bg-white/[0.02] px-2 py-1 rounded border border-white/5">Sin PDF</span>
                            )}
                          </td>
                        </motion.tr>
                    );
                  })
                ) : (
                  <motion.tr key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <td colSpan={6} className="py-24 text-center">
                      <FileWarning size={56} className="text-gray-700 mx-auto mb-4" />
                      <p className="text-white font-black uppercase tracking-tighter italic text-xl">
                        Bóveda Vacía
                      </p>
                      <p className="text-xs text-gray-500 max-w-[300px] mx-auto uppercase tracking-widest mt-2 leading-relaxed">
                        No se encontraron resultados para "{searchTerm}". Intenta con otro término o limpia los filtros.
                      </p>
                    </td>
                  </motion.tr>
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {/* CONTROLES DE PAGINACIÓN */}
        {!loading && documentosFiltrados.length > 0 && (
          <div className="flex items-center justify-between px-6 py-4 bg-[#0f172a] border-t border-white/10 relative z-30">
            <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
              Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, documentosFiltrados.length)} de {documentosFiltrados.length}
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8 bg-black/40 border-white/10 text-gray-400 hover:text-white disabled:opacity-20 transition-all font-bold text-xs"
              >
                <ChevronLeft size={14} className="mr-1" /> Ant
              </Button>
              
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2">
                Pág {currentPage} de {totalPages}
              </div>
              
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="h-8 bg-black/40 border-white/10 text-gray-400 hover:text-white disabled:opacity-20 transition-all font-bold text-xs"
              >
                Sig <ChevronRight size={14} className="ml-1" />
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default DocumentosDTE;