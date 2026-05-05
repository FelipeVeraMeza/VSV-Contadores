import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { ArrowDownUp, Search, CheckCircle2, Loader2, FileText, ChevronRight, User, Hash } from "lucide-react";
import { cleanRut } from "@/lib/rut.js";
import { useAuth } from "@/hooks/useAuth.jsx";
import { API_BASE_URL } from "../../../../../config.js";

// Servicios
import { getCrmDataApi } from "@/services/crmService.js";
import { obtenerHistorialBunker } from '@/services/dteConsultasService';

// ==========================================
// 🛠️ UTILIDADES DE BÚSQUEDA Y FORMATO
// ==========================================
const formatRutEstricto = (rut) => {
  if (!rut) return "";
  const cleaned = String(rut).replace(/[^0-9kK]/g, '').toUpperCase();
  if (cleaned.length <= 1) return cleaned;
  return cleaned.slice(0, -1) + '-' + cleaned.slice(-1);
};

const superNormalize = (str) => {
  if (!str) return '';
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") 
    .replace(/[^a-zA-Z0-9]/g, "")    
    .toLowerCase();
};

const formatTextoVisual = (str) => {
    if (!str) return '';
    return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
};

const NOMBRES_DTE = { 33: "FACTURA ELECTRONICA", 34: "FACTURA EXENTA", 61: "NOTA DE CREDITO", 56: "NOTA DE DEBITO" };

export default function NotaCreditoDebitoModal({ isOpen, setIsOpen, prefillData }) {
  const { selectedCompany, user } = useAuth();
  
  // ==========================================
  // 🎨 ESTADOS UI Y TEMA DINÁMICO
  // ==========================================
  const [tipoNota, setTipoNota] = useState('61'); 
  const isCredito = tipoNota === '61';
  
  const theme = {
    color: isCredito ? 'purple' : 'amber',
    textClass: isCredito ? 'text-purple-400' : 'text-amber-400',
    bgClass: isCredito ? 'bg-purple-600 hover:bg-purple-500' : 'bg-amber-600 hover:bg-amber-500'
  };

  const [isLoadingDatos, setIsLoadingDatos] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [allClientes, setAllClientes] = useState([]); 
  const [historialGlobal, setHistorialGlobal] = useState([]);
  
  // Buscadores
  const [searchTerm, setSearchTerm] = useState("");
  const [searchFolio, setSearchFolio] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [clienteSel, setClienteSeleccionado] = useState(null);

  // Documentos
  const [facturasDelCliente, setFacturasDelCliente] = useState([]);
  const [documentoOriginal, setDocumentoOriginal] = useState(null);

  // Estados Automáticos 
  const [codigoSii, setCodigoSii] = useState("1");
  const [glosa, setGlosa] = useState("ANULA DOCUMENTO");
  const [montoAjuste, setMontoAjuste] = useState("");

  // ==========================================
  // 🔄 CARGA INICIAL
  // ==========================================
  useEffect(() => {
    if (isOpen && user?.sessionId) {
      setIsLoadingDatos(true);
      setDocumentoOriginal(null);
      setClienteSeleccionado(null);
      setSearchTerm("");
      setSearchFolio("");
      setTipoNota('61');
      setIsSubmitting(false);

      const targetId = selectedCompany?.id || 'ALL';
      
      Promise.all([
        getCrmDataApi(user.sessionId, null).then(r => r.json()).catch(() => null),
        obtenerHistorialBunker(targetId).catch(() => null)
      ]).then(([crm, hist]) => {
        if (crm?.clients) setAllClientes(crm.clients);
        if (hist?.ok && hist.documentos) {
            const validos = hist.documentos.filter(d => [33, 34, 61, 56].includes(d.tipo_dte));
            validos.sort((a, b) => new Date(b.fecha_emision) - new Date(a.fecha_emision));
            setHistorialGlobal(validos);
            
            if (prefillData?.doc) {
                handleSelectDocumentFromTable(prefillData.doc, validos);
            }
        }
      }).finally(() => setIsLoadingDatos(false));
    }
  }, [isOpen, selectedCompany, user, prefillData]);

  // ==========================================
  // 🔍 LÓGICA DE BÚSQUEDA
  // ==========================================
  const filteredSuggestions = useMemo(() => {
    const term = superNormalize(searchTerm);
    if (!term) return [];
    
    const mapaClientes = new Map();
    allClientes.forEach(c => {
        const r = formatRutEstricto(c.rut_encrypted || c.rut);
        const n = c.razon_social || c.razonSocial || "";
        if (r && (superNormalize(n).includes(term) || superNormalize(r).includes(term))) {
            mapaClientes.set(r, { nombre: n, rut: r });
        }
    });
    historialGlobal.forEach(d => {
        const r = formatRutEstricto(d.rut_cliente);
        const n = d.razon_social || "";
        if (r && !mapaClientes.has(r) && (superNormalize(n).includes(term) || superNormalize(r).includes(term))) {
            mapaClientes.set(r, { nombre: n, rut: r });
        }
    });

    return Array.from(mapaClientes.values()).slice(0, 5);
  }, [searchTerm, allClientes, historialGlobal]);

  const selectCliente = (c) => {
    setClienteSeleccionado(c);
    setSearchTerm("");
    setSearchFolio(""); 
    setShowSuggestions(false);
    setDocumentoOriginal(null); 
    
    const docs = historialGlobal.filter(d => formatRutEstricto(d.rut_cliente) === c.rut);
    setFacturasDelCliente(docs);
  };

  const datosTabla = useMemo(() => {
      if (searchFolio.trim() !== "") {
          return historialGlobal.filter(doc => String(doc.folio) === searchFolio.trim());
      }
      if (clienteSel) {
          return facturasDelCliente;
      }
      return historialGlobal.slice(0, 4);
  }, [searchFolio, clienteSel, historialGlobal, facturasDelCliente]);

  // ==========================================
  // 🛡️ SELECCIÓN Y REGLA ESTRICTA DE BLOQUEO
  // ==========================================
  const handleSelectDocumentFromTable = (doc, historialAUsar = historialGlobal) => {
      if (!clienteSel) {
          const rutCliente = formatRutEstricto(doc.rut_cliente);
          setClienteSeleccionado({ rut: rutCliente, nombre: doc.razon_social });
          setFacturasDelCliente(historialAUsar.filter(d => formatRutEstricto(d.rut_cliente) === rutCliente));
          setSearchFolio(""); 
      }

      setDocumentoOriginal(doc);
      setMontoAjuste(doc.monto_total || doc.monto_neto || 0);
      setCodigoSii("1"); 

      if (doc.tipo_dte === 61) {
          setTipoNota('56'); 
          setGlosa("ANULA NOTA DE CREDITO");
      } else {
          setTipoNota('61');
          if (doc.tipo_dte === 56) {
              setGlosa("ANULA NOTA DE DEBITO");
          } else {
              setGlosa("ANULA DOCUMENTO");
          }
      }
  };

  const handleTipoNotaChange = (tipo) => {
      setTipoNota(tipo);
      setGlosa(tipo === "61" ? "ANULA DOCUMENTO" : "ANULA NOTA DE CREDITO");
  };

  // ==========================================
  // 🚀 EMISIÓN EN SEGUNDO PLANO (BACKGROUND)
  // ==========================================
  const handleEmitir = async () => {
    if (!documentoOriginal || !montoAjuste) {
        return toast({ variant: "destructive", title: "Error", description: "Seleccione un documento válido." });
    }

    setIsSubmitting(true);
    
    try {
      const [rutF, dv] = cleanRut(clienteSel.rut).split('-');
      const payload = {
        empresa_id: selectedCompany?.id || null, // <- Corrección vital agregada aquí
        tipo_documento: parseInt(tipoNota),
        rutReceptor: rutF, dvReceptor: dv,
        razonSocial: clienteSel.nombre,
        producto: { precio: String(montoAjuste).replace(/[^0-9]/g, '') },
        referencia: { folio: documentoOriginal.folio, codigo: codigoSii, razon: glosa }
      };

      // 1. AVISAMOS AL USUARIO QUE EL ROBOT INICIÓ
      toast({
        title: "🤖 Robot Iniciado en Segundo Plano",
        description: `Procesando Nota de ${isCredito ? 'Crédito' : 'Débito'} en el SII. Puedes seguir utilizando el sistema.`,
        duration: 8000,
      });

      // 2. CERRAMOS EL MODAL INMEDIATAMENTE PARA LIBERAR LA PANTALLA
      setIsOpen(false);

      // 3. ENVIAMOS LA PETICIÓN AL BACKEND
      const res = await fetch(`${API_BASE_URL}/dte/emitir-nota`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      
      if (!data.ok) throw new Error(data.error || "Error de comunicación con el SII.");
      
      // 4. AVISAMOS CUANDO TERMINÓ (Aparecerá sin importar donde esté el usuario)
      toast({
        title: "✅ ¡Documento Emitido con Éxito!",
        description: `Folio Oficial N° ${data.folio} generado correctamente.`,
        duration: 10000,
        className: "bg-emerald-600 border-none text-white", // Opcional: lo hace verde
      });

    } catch (e) {
      toast({ variant: "destructive", title: "❌ Fallo de Emisión", description: e.message, duration: 15000 });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(val) => !isSubmitting && setIsOpen(val)}>
      <DialogContent className="sm:max-w-[850px] w-[95vw] bg-[#09090b] border-white/10 text-white p-0 shadow-2xl overflow-hidden rounded-2xl shadow-[0_0_80px_rgba(0,0,0,0.6)]">
        
        {/* LA PANTALLA NEGRA DE CARGA FUE ELIMINADA PARA PERMITIR TRABAJO EN SEGUNDO PLANO */}

        <div className="p-6 md:p-8 pb-4 border-b border-white/5 bg-white/[0.02]">
            <DialogHeader>
                <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                    <div className={`p-4 rounded-2xl border bg-white/5 ${theme.textClass} w-fit`}>
                        <ArrowDownUp size={28} />
                    </div>
                    <div>
                        <DialogTitle className="text-2xl font-black uppercase tracking-tighter italic leading-none">Nota de Crédito / Débito</DialogTitle>
                        <DialogDescription className="text-gray-500 text-xs uppercase font-bold tracking-[0.2em] mt-1">Sincronizado con SII</DialogDescription>
                    </div>
                </div>
            </DialogHeader>
        </div>

        <div className="p-6 md:p-8 space-y-8 max-h-[75vh] overflow-y-auto custom-scrollbar bg-black/20 w-full">
            
            <section className="space-y-3 w-full">
                <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">1. Buscar Empresa o N° Factura</Label>
                    {clienteSel && (
                        <button onClick={() => {setClienteSeleccionado(null); setDocumentoOriginal(null); setSearchTerm("");}} className="text-[10px] font-black uppercase text-blue-500 hover:text-blue-400 transition-colors hover:underline">Limpiar Selección</button>
                    )}
                </div>

                {!clienteSel ? (
                    <div className="flex flex-col md:flex-row gap-4 w-full">
                        <div className="flex-[2] relative z-50">
                            <div className={`relative transition-all ${showSuggestions && filteredSuggestions.length > 0 && searchTerm ? 'ring-1 ring-blue-500 rounded-xl' : ''}`}>
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                <Input 
                                    placeholder="Buscar Empresa por Nombre o RUT..." 
                                    value={searchTerm} 
                                    onChange={(e) => {setSearchTerm(e.target.value); setShowSuggestions(true);}}
                                    onFocus={() => setShowSuggestions(true)}
                                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                    className={`pl-11 h-14 w-full bg-black/40 border border-white/10 text-sm focus:border-blue-500 transition-all uppercase ${showSuggestions && filteredSuggestions.length > 0 && searchTerm ? 'border-transparent rounded-t-xl rounded-b-none focus-visible:ring-0' : 'rounded-xl'}`} 
                                    disabled={!!prefillData?.doc || isSubmitting} 
                                />
                                {isLoadingDatos && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-gray-500" size={16} />}
                            </div>
                            
                            {showSuggestions && searchTerm && filteredSuggestions.length > 0 && (
                                <div className="absolute top-[100%] left-0 w-full bg-[#0c0c0e] border border-blue-500 border-t-0 rounded-b-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-1">
                                    {filteredSuggestions.map((c, i) => (
                                        <button key={i} onMouseDown={() => selectCliente(c)} className="w-full px-5 py-4 text-left border-t border-white/5 hover:bg-white/5 flex justify-between items-center group transition-colors">
                                            <div className="overflow-hidden pr-2">
                                                <p className="font-bold text-sm text-gray-200 group-hover:text-blue-400 truncate">{formatTextoVisual(c.nombre)}</p>
                                                <p className="text-[10px] font-mono text-gray-500 tracking-widest">{c.rut}</p>
                                            </div>
                                            <ChevronRight size={18} className="text-gray-700 flex-shrink-0" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex-[1] relative z-40 min-w-[150px]">
                            <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                            <Input 
                                placeholder="N° Folio..." 
                                value={searchFolio}
                                onChange={(e) => setSearchFolio(e.target.value.replace(/[^0-9]/g, ''))}
                                className="pl-11 h-14 w-full bg-black/40 border border-white/10 rounded-xl text-sm focus:border-blue-500 transition-all font-mono"
                                disabled={!!prefillData?.doc || isSubmitting} 
                            />
                        </div>
                    </div>
                ) : (
                    <div className="p-4 w-full bg-white/5 border border-white/10 rounded-xl flex items-center gap-4 shadow-inner animate-in zoom-in-95 duration-200">
                        <div className={`p-3 rounded-lg bg-white/5 ${theme.textClass}`}><User size={20}/></div>
                        <div className="overflow-hidden flex-1">
                            <p className="text-base font-black text-white truncate">{formatTextoVisual(clienteSel.nombre)}</p>
                            <p className="text-xs font-mono text-gray-500 tracking-widest">{clienteSel.rut}</p>
                        </div>
                    </div>
                )}
            </section>

            <section className="space-y-3 animate-in fade-in duration-300 w-full">
                <Label className="text-[10px] font-black text-blue-400 uppercase tracking-widest ml-1">
                    2. {searchFolio ? "Resultados de Búsqueda" : clienteSel ? "Seleccionar Documento a Afectar" : "Últimos Documentos Emitidos"}
                </Label>
                
                <div className="border border-white/10 rounded-xl overflow-hidden bg-black/40 shadow-sm w-full">
                    <div className="max-h-[250px] overflow-y-auto custom-scrollbar">
                        <table className="w-full text-left table-auto">
                            <thead className="sticky top-0 bg-[#0c0c0e] border-b border-white/10 z-10">
                                <tr>
                                    <th className="px-4 py-3 text-[10px] font-black uppercase text-gray-400 tracking-widest w-[40%]">Documento</th>
                                    <th className="px-4 py-3 text-[10px] font-black uppercase text-gray-400 tracking-widest w-[40%]">Cliente</th>
                                    <th className="px-4 py-3 text-[10px] font-black uppercase text-gray-400 tracking-widest text-right w-[20%]">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {datosTabla.length === 0 ? (
                                    <tr><td colSpan={3} className="p-8 text-center text-xs font-bold text-gray-600 uppercase tracking-widest">No se encontraron documentos</td></tr>
                                ) : (
                                    datosTabla.map(doc => (
                                        <tr 
                                            key={doc.id} 
                                            onClick={() => handleSelectDocumentFromTable(doc)} 
                                            className={`cursor-pointer transition-colors ${documentoOriginal?.id === doc.id ? 'bg-white/5' : 'hover:bg-white/5'}`}
                                        >
                                            <td className="p-4 align-top">
                                                <div className="flex gap-4 items-start">
                                                    <div className="pt-0.5 flex-shrink-0">
                                                        {documentoOriginal?.id === doc.id ? <CheckCircle2 size={18} className={`${theme.textClass}`}/> : <div className="w-4 h-4 rounded-full border border-white/20"/>}
                                                    </div>
                                                    <div className="overflow-hidden">
                                                        <span className={`text-xs font-black ${documentoOriginal?.id === doc.id ? theme.textClass : 'text-gray-300'} uppercase tracking-wider`}>#{doc.folio}</span>
                                                        <p className="text-[11px] font-black uppercase text-white mt-1 truncate">{NOMBRES_DTE[doc.tipo_dte] || `DTE ${doc.tipo_dte}`}</p>
                                                        <p className="text-[10px] font-mono text-gray-500 mt-0.5">{new Date(doc.fecha_emision).toLocaleDateString('es-CL')}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4 align-top">
                                                <div className="pt-1">
                                                    <p className="text-xs font-bold text-gray-200 truncate max-w-[150px] md:max-w-[200px]">{formatTextoVisual(doc.razon_social)}</p>
                                                    <p className="text-[10px] font-mono text-gray-500 tracking-widest mt-1">{formatRutEstricto(doc.rut_cliente)}</p>
                                                </div>
                                            </td>
                                            <td className="p-4 text-right align-top">
                                                <div className="pt-1">
                                                    <span className="font-black text-white text-sm tracking-tight">${Number(doc.monto_total || doc.monto_neto).toLocaleString('es-CL')}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            {documentoOriginal && (
                <section className="space-y-6 animate-in slide-in-from-bottom-4 duration-500 pt-6 border-t border-white/5 w-full">
                    
                    <div className="grid grid-cols-2 gap-4 w-full">
                        <Button 
                            type="button" variant="outline" 
                            onClick={() => handleTipoNotaChange("61")} 
                            disabled={documentoOriginal.tipo_dte === 61 || isSubmitting}
                            className={`h-16 w-full border rounded-xl font-black uppercase text-[11px] tracking-widest flex items-center justify-center px-4 gap-2 transition-all ${tipoNota === '61' ? 'border-purple-500 bg-purple-500/10 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.1)]' : 'border-white/10 text-gray-500 hover:bg-white/5'} ${documentoOriginal.tipo_dte === 61 ? 'opacity-30 cursor-not-allowed disabled:bg-black/50 disabled:border-white/5' : ''}`}
                        >
                            <FileText size={18} className="hidden sm:block"/> Nota de Crédito
                        </Button>
                        
                        <Button 
                            type="button" variant="outline" 
                            onClick={() => handleTipoNotaChange("56")} 
                            disabled={documentoOriginal.tipo_dte !== 61 || isSubmitting}
                            className={`h-16 w-full border rounded-xl font-black uppercase text-[11px] tracking-widest flex items-center justify-center px-4 gap-2 transition-all ${tipoNota === '56' ? 'border-amber-500 bg-amber-500/10 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.1)]' : 'border-white/10 text-gray-500 hover:bg-white/5'} ${documentoOriginal.tipo_dte !== 61 ? 'opacity-30 cursor-not-allowed disabled:bg-black/50 disabled:border-white/5' : ''}`}
                        >
                            <FileText size={18} className="hidden sm:block"/> Nota de Débito
                        </Button>
                    </div>

                    <div className="pt-4 flex flex-row gap-3 w-full border-t border-white/5">
                        <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={isSubmitting} className="flex-1 uppercase font-black text-[11px] tracking-widest h-14 rounded-xl text-gray-500 hover:text-white hover:bg-white/5 transition-all border border-transparent hover:border-white/10">Cancelar</Button>
                        <Button onClick={handleEmitir} disabled={isSubmitting || !documentoOriginal} className={`flex-[2] text-white font-black uppercase text-[11px] tracking-widest h-14 rounded-xl shadow-lg transition-all duration-300 ${isCredito ? 'bg-purple-600 hover:bg-purple-500 shadow-purple-500/20' : 'bg-amber-600 hover:bg-amber-500 shadow-amber-500/20'} disabled:opacity-50`}>
                            {isSubmitting ? <><Loader2 className="animate-spin mr-2" size={16} /> Enviando...</> : "Emitir Documento Electrónico"}
                        </Button>
                    </div>
                </section>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}