import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, FileWarning, Loader2, Search, FileText, ArrowUpRight, ArrowDownLeft, Globe, ChevronLeft, ChevronRight, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth.jsx';
import { obtenerHistorialBunker, obtenerComprasBunker } from '@/services/dteConsultasService';

// EL IMPORT MÁGICOOpcionesDocumentoModal

const NOMBRES_DTE = { 33: "Factura Electrónica", 34: "Factura Exenta", 61: "Nota de Crédito", 56: "Nota de Débito", 52: "Guía de Despacho", 39: "Boleta", 110: "Exportación" };
const normalizeText = (text) => text ? text.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";
const cleanRutForSearch = (rut) => rut ? rut.toString().replace(/[^0-9kK]/gi, '').toLowerCase() : "";
const formatDisplay = (str) => str ? str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() : '';

const DocumentosDTE = () => {
  const { selectedCompany } = useAuth();
  const [documentos, setDocumentos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tipoVista, setTipoVista] = useState('VENTAS'); 
  const [vistaGlobal, setVistaGlobal] = useState(false); 
  const [searchTerm, setSearchTerm] = useState(""); 
  const [filterTipo, setFilterTipo] = useState("TODOS");
  const [filterMes, setFilterMes] = useState("TODOS");
  const [filterAnio, setFilterAnio] = useState("TODOS");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 9; 
  const tableContainerRef = useRef(null);

  // ESTADOS DEL NUEVO MODAL
  const [isOpcionesModalOpen, setIsOpcionesModalOpen] = useState(false);
  const [documentoSeleccionado, setDocumentoSeleccionado] = useState(null);

  useEffect(() => { if (selectedCompany) setVistaGlobal(false); }, [selectedCompany]);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, filterTipo, filterMes, filterAnio, tipoVista, vistaGlobal, selectedCompany]);
  
  const cargarHistorial = useCallback(async () => {
    const targetId = (!selectedCompany || vistaGlobal) ? 'ALL' : selectedCompany.id;
    setLoading(true); setDocumentos([]);
    try {
      const data = tipoVista === 'VENTAS' ? await obtenerHistorialBunker(targetId) : await obtenerComprasBunker(targetId);
      if (data.ok) setDocumentos(data.documentos || []);
    } catch (error) { toast({ variant: "destructive", title: "Error", description: "Falla al sincronizar." }); } 
    finally { setLoading(false); }
  }, [selectedCompany, tipoVista, vistaGlobal]);

  useEffect(() => { cargarHistorial(); }, [cargarHistorial]);

  const documentosFiltrados = useMemo(() => {
    return documentos.filter(doc => {
      const fecha = new Date(doc.fecha_emision);
      const termText = normalizeText(searchTerm), termRut = cleanRutForSearch(searchTerm);
      const rs = normalizeText(tipoVista === 'VENTAS' ? doc.razon_social : doc.razon_social_proveedor);
      const rutClean = cleanRutForSearch(tipoVista === 'VENTAS' ? doc.rut_cliente : doc.rut_proveedor);
      
      return (termText === "" || rs.includes(termText) || rutClean.includes(termRut)) &&
             (filterTipo === "TODOS" || doc.tipo_dte.toString() === filterTipo) &&
             (filterAnio === "TODOS" || fecha.getUTCFullYear().toString() === filterAnio) &&
             (filterMes === "TODOS" || (fecha.getUTCMonth() + 1).toString() === filterMes);
    });
  }, [documentos, searchTerm, filterTipo, filterMes, filterAnio, tipoVista]);

  const totalPages = Math.ceil(documentosFiltrados.length / ITEMS_PER_PAGE) || 1;
  const currentData = documentosFiltrados.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#0f172a]/60 p-4 rounded-2xl border border-white/5 backdrop-blur-md shadow-xl">
        <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20 text-blue-400"><FileText size={20} /></div>
            <div>
                <h2 className="text-white font-black uppercase tracking-tighter text-lg">Bóveda de Documentos</h2>
                <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">{(!selectedCompany || vistaGlobal) ? '🌐 TODAS LAS EMPRESAS' : formatDisplay(selectedCompany?.razon_social)}</p>
            </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
            {selectedCompany && (
              <Button onClick={() => setVistaGlobal(!vistaGlobal)} variant="outline" className={`h-10 text-[10px] font-black uppercase tracking-widest ${vistaGlobal ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30' : 'bg-black/40 border-white/10 text-gray-400'}`}><Globe size={14} className="mr-2" /> {vistaGlobal ? 'Ocultar Global' : 'Modo Global'}</Button>
            )}
            <div className="flex bg-black/40 p-1 rounded-xl border border-white/10 w-full sm:w-auto h-10">
                <button onClick={() => setTipoVista('VENTAS')} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${tipoVista === 'VENTAS' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-gray-500 hover:text-gray-300'}`}><ArrowUpRight size={14} /> Ventas</button>
                <button onClick={() => setTipoVista('COMPRAS')} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${tipoVista === 'COMPRAS' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' : 'text-gray-500 hover:text-gray-300'}`}><ArrowDownLeft size={14} /> Compras</button>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-[#0f172a]/60 p-4 rounded-2xl border border-white/5 backdrop-blur-md shadow-xl">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors" size={14} />
          <input type="text" placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 transition-all placeholder:text-gray-600"/>
        </div>
        <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)} className="bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer">
            <option value="TODOS">Todos</option><option value="33">Factura (33)</option><option value="34">Exenta (34)</option><option value="61">NC (61)</option>
        </select>
        <select value={filterMes} onChange={(e) => setFilterMes(e.target.value)} className="bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer">
          <option value="TODOS">Meses</option>{["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"].map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={filterAnio} onChange={(e) => setFilterAnio(e.target.value)} className="bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer">
          <option value="TODOS">Años</option><option value="2024">2024</option><option value="2025">2025</option><option value="2026">2026</option>
        </select>
      </div>

      <div ref={tableContainerRef} className="overflow-hidden rounded-2xl border border-white/5 bg-black/20 backdrop-blur-xl shadow-2xl flex flex-col pt-2 scroll-mt-24">
        <div className="overflow-x-auto custom-scrollbar w-full">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-gray-400 tracking-widest">Documento</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-gray-400 tracking-widest">Folio</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-gray-400 tracking-widest">Cliente/Prov</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-gray-400 tracking-widest">Emisión</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-gray-400 tracking-widest text-right">Monto</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-gray-400 text-center">PDF</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-gray-400 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <AnimatePresence mode="popLayout">
                {currentData.map((dte) => (
                    <motion.tr key={dte.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-white/[0.03] group transition-colors">
                        <td className="px-6 py-4"><span className="px-3 py-1 rounded-lg text-[9px] font-black uppercase border bg-blue-500/10 border-blue-500/20 text-blue-400">{NOMBRES_DTE[dte.tipo_dte]}</span></td>
                        <td className="px-6 py-4 text-sm font-bold text-white italic">#{dte.folio}</td>
                        <td className="px-6 py-4"><span className="text-xs text-gray-200 block">{formatDisplay(dte.razon_social || dte.razon_social_proveedor)}</span><span className="text-[9px] text-gray-500 font-mono">{dte.rut_cliente || dte.rut_proveedor}</span></td>
                        <td className="px-6 py-4 text-xs text-gray-400">{new Date(dte.fecha_emision).toLocaleDateString('es-CL', { timeZone: 'UTC' })}</td>
                        <td className="px-6 py-4 text-right text-sm font-black text-blue-400">${Number(dte.monto_total || dte.monto_neto).toLocaleString('es-CL')}</td>
                        <td className="px-6 py-4 text-center">
                            {dte.url_pdf ? <a href={dte.url_pdf} target="_blank" rel="noreferrer" className="inline-flex h-9 w-9 rounded-xl bg-white/5 text-gray-300 border border-white/10 hover:bg-white hover:text-black items-center justify-center"><Download size={16} /></a> : <span className="text-[8px] text-gray-600 uppercase">Sin PDF</span>}
                        </td>
                        <td className="px-4 py-4 text-center">
                            {tipoVista === 'VENTAS' && (dte.tipo_dte === 33 || dte.tipo_dte === 34) ? (
                                <button onClick={() => { setDocumentoSeleccionado(dte); setIsOpcionesModalOpen(true); }} className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-white/5 text-gray-300 border border-white/10 hover:bg-white hover:text-black text-[10px] font-black uppercase"><Settings2 size={14}/> Opciones</button>
                            ) : <span className="text-[8px] text-gray-600">—</span>}
                        </td>
                    </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
export default DocumentosDTE;