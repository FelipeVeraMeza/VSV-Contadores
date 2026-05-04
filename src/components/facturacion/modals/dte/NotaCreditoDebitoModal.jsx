import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { ArrowDownToLine, ArrowUpFromLine, Search, CheckCircle2, Loader2, FileText } from "lucide-react";
import { cleanRut } from "@/lib/rut.js";
import { useAuth } from "@/hooks/useAuth.jsx";
import { API_BASE_URL } from "../../../../../config.js";

// Servicios
import { getCrmDataApi } from "@/services/crmService.js";
import { obtenerHistorialBunker } from '@/services/dteConsultasService';

const formatRutSimple = (rut) => {
  if (!rut) return "";
  const cleaned = String(rut).replace(/[^0-9kK]/g, '').toUpperCase();
  if (cleaned.length <= 1) return cleaned;
  return cleaned.slice(0, -1) + '-' + cleaned.slice(-1);
};

const cleanStr = (str) => {
  if (!str) return '';
  return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
};

export default function NotaCreditoDebitoModal({ isOpen, setIsOpen }) {
  const { selectedCompany, user } = useAuth();
  
  // ==========================================
  // ESTADOS Y TEMA DINÁMICO
  // ==========================================
  const [tipoNota, setTipoNota] = useState('61'); 
  const isCredito = tipoNota === '61';
  
  const theme = {
    color: isCredito ? 'purple' : 'amber',
    textClass: isCredito ? 'text-purple-400' : 'text-amber-400',
    bgClass: isCredito ? 'bg-purple-600 hover:bg-purple-500' : 'bg-amber-600 hover:bg-amber-500',
    shadowClass: isCredito ? 'shadow-purple-600/20' : 'shadow-amber-600/20',
    iconBg: isCredito ? 'bg-purple-500/10 border-purple-500/20' : 'bg-amber-500/10 border-amber-500/20',
    title: isCredito ? 'Nota de Crédito' : 'Nota de Débito',
    code: isCredito ? 'DTE 61' : 'DTE 56',
    Icon: isCredito ? ArrowDownToLine : ArrowUpFromLine
  };

  const [item, setItem] = useState({
    rutFacturar: "", razonSocial: "", contactoReceptor: "",
    tipoDocumentoRef: "33", folioRef: "", codigoRef: "1", 
    motivoTexto: "", monto: ""
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [folioGenerado, setFolioGenerado] = useState(null);

  const [allClientes, setAllClientes] = useState([]); 
  const [historialGlobal, setHistorialGlobal] = useState([]);
  const [facturasDelCliente, setFacturasDelCliente] = useState([]); 
  const [searchTerm, setSearchTerm] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoadingDatos, setIsLoadingDatos] = useState(false);
  const [facturaSeleccionadaId, setFacturaSeleccionadaId] = useState("");

  // ==========================================
  // EFECTOS Y CARGA
  // ==========================================
  useEffect(() => {
    setItem(prev => ({ ...prev, motivoTexto: isCredito ? "ANULA FACTURA" : "AUMENTA VALOR", codigoRef: "1" }));
  }, [isCredito]);

  useEffect(() => {
    if (!isOpen) return; 

    setIsFinished(false); setFolioGenerado(null);
    setSearchTerm(""); setShowSuggestions(false);
    setFacturasDelCliente([]); setFacturaSeleccionadaId("");
    setTipoNota('61'); 
    setItem(prev => ({ ...prev, rutFacturar: "", razonSocial: "", folioRef: "", monto: "", motivoTexto: "ANULA FACTURA" }));

    const cargarDatos = async () => {
      setIsLoadingDatos(true);
      try {
          if (user?.sessionId) {
              try {
                  const resCrm = await getCrmDataApi(user.sessionId, null);
                  const dataCrm = await resCrm.json();
                  if (dataCrm?.clients) setAllClientes(dataCrm.clients);
              } catch (e) {}
          }
          const targetId = selectedCompany ? selectedCompany.id : 'ALL';
          try {
              const resHistorial = await obtenerHistorialBunker(targetId);
              if (resHistorial && resHistorial.ok && resHistorial.documentos) {
                  const facturasValidas = resHistorial.documentos.filter(d => d.tipo_dte === 33 || d.tipo_dte === 34);
                  setHistorialGlobal(facturasValidas);
              }
          } catch (e) {}
      } finally {
          setIsLoadingDatos(false);
      }
    };
    cargarDatos();
  }, [isOpen, selectedCompany, user]);

  // ==========================================
  // BUSCADOR Y SELECCIÓN
  // ==========================================
  const filteredSuggestions = useMemo(() => {
    if (!searchTerm || String(searchTerm).trim() === "") return [];
    const termStr = cleanStr(searchTerm);
    const termRut = String(searchTerm).replace(/[^0-9kK]/gi, '').toLowerCase();
    const mapaClientes = new Map();
    
    allClientes.forEach(c => {
        const rut = formatRutSimple(c.rut_encrypted || c.rut || "");
        if (rut) mapaClientes.set(rut, { razonSocial: c.razon_social || c.razonSocial, rut: rut, correo: c.email_corporativo || c.correo });
    });

    historialGlobal.forEach(d => {
        const rut = formatRutSimple(d.rut_cliente);
        if (rut && !mapaClientes.has(rut)) mapaClientes.set(rut, { razonSocial: d.razon_social, rut: rut, correo: "" });
    });

    return Array.from(mapaClientes.values()).filter(c => {
        const rs = cleanStr(c.razonSocial);
        const rutPuro = cleanStr(c.rut).replace(/[^0-9kK]/gi, '');
        return rs.includes(termStr) || (termRut !== "" && rutPuro.includes(termRut));
    }).slice(0, 6);
  }, [searchTerm, allClientes, historialGlobal]);

  const onSelectCliente = (cliente) => {
    setSearchTerm(cliente.razonSocial);
    setShowSuggestions(false);
    setItem(prev => ({ ...prev, rutFacturar: cliente.rut, razonSocial: cliente.razonSocial, contactoReceptor: cliente.correo || "" }));

    const rutBuscador = cleanRut(cliente.rut);
    const facturasEncontradas = historialGlobal.filter(doc => cleanRut(doc.rut_cliente) === rutBuscador);
    setFacturasDelCliente(facturasEncontradas);
    setFacturaSeleccionadaId("");
  };

  const handleSelectFactura = (e) => {
      const id = e.target.value;
      setFacturaSeleccionadaId(id);
      if (!id) {
          setItem(prev => ({ ...prev, folioRef: "", monto: "", tipoDocumentoRef: "33" }));
          return;
      }
      const fac = facturasDelCliente.find(f => String(f.id) === String(id));
      if (fac) {
          setItem(prev => ({ 
              ...prev, tipoDocumentoRef: String(fac.tipo_dte), folioRef: String(fac.folio), monto: String(fac.monto_total || fac.monto_neto) 
          }));
      }
  };

  // ==========================================
  // ENVÍO AL BACKEND
  // ==========================================
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!item.rutFacturar || !item.folioRef || !item.monto) {
      return toast({ variant: "destructive", title: "Faltan Datos", description: "Selecciona una factura a referenciar en el paso 2." });
    }

    setIsSubmitting(true);
    try {
      const rutLimpio = cleanRut(item.rutFacturar);
      const [rutFull, dv] = rutLimpio.includes('-') ? rutLimpio.split('-') : [rutLimpio, ''];
      
      const payload = {
        empresa_id: selectedCompany?.id || 'EXTERNO',
        tipo_documento: isCredito ? 61 : 56,
        rutReceptor: rutFull, dvReceptor: dv, razonSocial: item.razonSocial || "CLIENTE",
        contactoReceptor: item.contactoReceptor,
        producto: { nombre: item.motivoTexto, precio: String(item.monto).replace(/[^0-9]/g, '') },
        referencia: { tipoDocumento: item.tipoDocumentoRef, folio: item.folioRef, codigo: item.codigoRef, razon: item.motivoTexto }
      };

      const res = await fetch(`${API_BASE_URL}/dte/emitir-nota`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || data?.ok === false) throw new Error(data?.error || "Error SII");
      
      setFolioGenerado(data.folio);
      setIsFinished(true);
    } catch (err) {
      toast({ variant: "destructive", title: "Fallo de Emisión", description: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const IconComponent = theme.Icon;

  return (
    <Dialog open={isOpen} onOpenChange={(val) => !isSubmitting && setIsOpen(val)}>
      <DialogContent className={`sm:max-w-[700px] bg-[#0a0a0a] border-${theme.color}-500/20 text-white overflow-visible p-0 shadow-[0_0_50px_rgba(0,0,0,0.5)] transition-colors duration-500`}>
        
        {(isSubmitting || isFinished) && (
          <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-black/95 backdrop-blur-md rounded-lg">
            {isSubmitting ? (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className={`h-16 w-16 animate-spin ${theme.textClass}`} />
                <h3 className={`text-xl font-bold uppercase italic tracking-tighter ${theme.textClass}`}>Generando {theme.title}...</h3>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-6 text-center p-8">
                <CheckCircle2 className={`h-24 w-24 ${theme.textClass}`} />
                <div>
                  <h3 className="text-3xl font-black uppercase italic tracking-tighter mb-1">¡Proceso Finalizado!</h3>
                  <p className={`font-mono text-xl font-bold ${theme.textClass}`}>Folio N° {folioGenerado}</p>
                </div>
                <Button onClick={() => setIsOpen(false)} className={`${theme.bgClass} w-full mt-4 rounded-xl font-black uppercase tracking-widest h-14 text-white`}>Volver al Menú</Button>
              </div>
            )}
          </div>
        )}

        <div className="p-8">
          <div className="flex p-1 bg-black/60 rounded-xl border border-white/5 mb-6 relative z-10 w-full">
            <button type="button" onClick={() => setTipoNota('61')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all duration-300 ${isCredito ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>
                <ArrowDownToLine size={14} /> Nota de Crédito (61)
            </button>
            <button type="button" onClick={() => setTipoNota('56')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all duration-300 ${!isCredito ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>
                <ArrowUpFromLine size={14} /> Nota de Débito (56)
            </button>
          </div>

          <DialogHeader className="mb-6">
            <div className="flex items-center gap-3 transition-colors duration-500">
               <div className={`p-3 rounded-xl border ${theme.iconBg}`}><IconComponent className={theme.textClass} size={26} /></div>
               <div>
                  <DialogTitle className="text-2xl font-black italic uppercase tracking-tighter leading-none">{theme.title}</DialogTitle>
                  <DialogDescription className="text-gray-500 text-[10px] uppercase font-bold tracking-[0.2em] mt-1">{theme.code} • Sincronizado con SII</DialogDescription>
               </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            
            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 relative">
              <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2"><Search size={14} /> 1. Buscar Empresa Destino</h4>
              <div className="mb-4 relative z-50">
                  <div className="relative">
                    <Search className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors z-10 ${item.rutFacturar ? theme.textClass : 'text-gray-500'}`} size={18} />
                    <Input placeholder="Escribe Razón Social o RUT..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setShowSuggestions(true); }} onFocus={() => setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} className={`pl-12 h-12 bg-black/40 border-white/10 rounded-xl text-sm focus:border-${theme.color}-500 shadow-xl transition-all uppercase`} disabled={isLoadingDatos}/>
                    {isLoadingDatos && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-gray-500" size={16} />}
                  </div>
                  {showSuggestions && filteredSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 w-full mt-2 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-[60]">
                      {filteredSuggestions.map((c, i) => (
                        <div key={i} onMouseDown={() => onSelectCliente(c)} className={`px-5 py-3 cursor-pointer hover:${theme.bgClass}/20 border-b border-white/5 flex justify-between items-center group transition-colors`}>
                          <div>
                            <div className="text-sm font-bold text-white">{cleanStr(c.razonSocial)}</div>
                            <div className="text-[10px] text-gray-500 font-mono mt-0.5 tracking-widest">{c.rut}</div>
                          </div>
                          <CheckCircle2 size={16} className={`${theme.textClass} opacity-0 group-hover:opacity-100 transition-all`} />
                        </div>
                      ))}
                    </div>
                  )}
              </div>
              {item.rutFacturar && (
                  <div className="grid grid-cols-2 gap-4 p-4 bg-black/30 rounded-xl border border-white/5 mt-4">
                    <div>
                      <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest mb-1">RUT Seleccionado</p>
                      <p className={`text-sm font-mono font-bold ${theme.textClass}`}>{item.rutFacturar}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest mb-1">Documentos en Bóveda</p>
                      <p className="text-sm font-black text-white">{facturasDelCliente.length} Facturas Previas</p>
                    </div>
                  </div>
              )}
            </div>

            <div className={`bg-${theme.color}-900/10 border border-${theme.color}-500/20 rounded-2xl p-5 relative overflow-visible transition-colors duration-500`}>
              <div className={`absolute top-0 left-0 w-1 h-full bg-${theme.color}-500 transition-colors duration-500`} />
              <h4 className={`text-[10px] font-black ${theme.textClass} uppercase tracking-widest mb-4 flex items-center gap-2 transition-colors duration-500`}><FileText size={14} /> 2. Factura a Referenciar</h4>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Selecciona la Factura del Historial</Label>
                  <select value={facturaSeleccionadaId} onChange={handleSelectFactura} disabled={facturasDelCliente.length === 0} className="w-full h-12 bg-black/40 border border-white/10 rounded-xl px-3 text-sm text-white focus:outline-none focus:border-white/30 cursor-pointer font-bold">
                    <option value="">-- {facturasDelCliente.length > 0 ? "Selecciona una Factura de la lista" : "No hay facturas para este cliente"} --</option>
                    {facturasDelCliente.map(fac => (
                        <option key={fac.id} value={fac.id}>
                            {fac.tipo_dte === 33 ? 'Factura Afecta (33)' : 'Factura Exenta (34)'} - Folio #{fac.folio} - ${Number(fac.monto_total || fac.monto_neto).toLocaleString('es-CL')} ({new Date(fac.fecha_emision).toLocaleDateString('es-CL')})
                        </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Acción (Código SII)</Label>
                    <select value={item.codigoRef} onChange={(e) => setItem({...item, codigoRef: e.target.value})} className="w-full h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-white/30 cursor-pointer">
                      {isCredito ? (
                        <>
                          <option value="1">1 - Anula Documento Completo</option>
                          <option value="2">2 - Corrige Textos / Dirección</option>
                          <option value="3">3 - Corrige Montos (Descuento)</option>
                        </>
                      ) : (
                        <>
                          <option value="1">1 - Anula Nota de Crédito</option>
                          <option value="2">2 - Corrige Textos / Dirección</option>
                          <option value="3">3 - Corrige Montos (Aumento)</option>
                        </>
                      )}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Razón Corta (Glosa)</Label>
                    <Input value={item.motivoTexto} onChange={(e) => setItem({...item, motivoTexto: e.target.value})} className="h-10 bg-black/40 border-white/10 rounded-xl text-xs uppercase" placeholder="Ej: MOTIVO SII..." />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-black/30 border border-white/5 rounded-2xl p-5 flex items-center justify-between">
               <div>
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Monto a Afectar</h4>
                  <p className="text-[9px] text-gray-500 uppercase mt-1">Si es anulación total, déjalo igual al original.</p>
               </div>
               <div className="relative w-48">
                  <span className={`absolute left-4 top-1/2 -translate-y-1/2 font-black ${theme.textClass} transition-colors duration-500`}>$</span>
                  <Input type="number" value={item.monto} onChange={(e) => setItem({...item, monto: e.target.value})} className={`pl-8 h-12 bg-black/50 border-white/10 rounded-xl font-mono text-xl font-black ${theme.textClass} text-right transition-colors duration-500`} placeholder="0" />
               </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={() => setIsOpen(false)} className="flex-1 uppercase font-black text-[10px] tracking-widest h-12 rounded-xl text-gray-400 hover:text-white transition-all">Cancelar</Button>
              <Button type="submit" disabled={isSubmitting || !item.folioRef} className={`flex-[2] ${theme.bgClass} text-white font-black uppercase text-[10px] tracking-[0.2em] h-12 rounded-xl shadow-lg ${theme.shadowClass} transition-all duration-500 disabled:opacity-50`}>
                Emitir {theme.title}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}