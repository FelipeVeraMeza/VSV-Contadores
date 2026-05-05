import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { Search, CheckCircle2, Loader2, ChevronRight, Ban, Edit3, TrendingDown, TrendingUp, ArrowDownUp, User, FileText } from "lucide-react";
import { cleanRut } from "@/lib/rut.js";
import { useAuth } from "@/hooks/useAuth.jsx";
import { API_BASE_URL } from "../../../../../config.js";
import { getCrmDataApi } from "@/services/crmService.js";
import { obtenerHistorialBunker } from '@/services/dteConsultasService';

const formatRutEstricto = (rut) => {
  if (!rut) return "";
  const cleaned = String(rut).replace(/[^0-9kK]/g, '').toUpperCase();
  if (cleaned.length <= 1) return cleaned;
  return cleaned.slice(0, -1) + '-' + cleaned.slice(-1);
};

const normalize = (str) => {
  if (!str) return '';
  return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

export default function NotaCreditoDebitoModal({ isOpen, setIsOpen, prefillData }) {
  const { selectedCompany, user } = useAuth();
  
  const [tipoNota, setTipoNota] = useState('61'); 
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoadingDatos, setIsLoadingDatos] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [allClientes, setAllClientes] = useState([]); 
  const [historialGlobal, setHistorialGlobal] = useState([]);
  
  const [clienteSel, setClienteSeleccionado] = useState(null);
  const [facturasDelCliente, setFacturasDelCliente] = useState([]);
  const [docAReferenciarId, setDocAReferenciarId] = useState(""); 
  const [accionSeleccionada, setAccionSeleccionada] = useState(null);
  const [folioGenerado, setFolioGenerado] = useState(null);

  // ==========================================
  // 🔄 CARGA DE DATOS 
  // ==========================================
  useEffect(() => {
    if (isOpen && user?.sessionId) {
      setIsLoadingDatos(true);
      setFolioGenerado(null);
      setAccionSeleccionada(null);

      if (prefillData?.doc) {
          const r = formatRutEstricto(prefillData.doc.rut_cliente);
          setClienteSeleccionado({ rut: r, nombre: prefillData.doc.razon_social });
          setDocAReferenciarId(prefillData.doc.id);
          
          // Ajustamos automáticamente el tipo de nota inicial según el prefill
          if (prefillData.doc.tipo_dte === 61) {
              setTipoNota('56'); // Si quiere gestionar una NC, forzamos ND
          } else if (prefillData.doc.tipo_dte === 56) {
              setTipoNota('61'); // Si quiere gestionar una ND, forzamos NC
          } else {
              setTipoNota('61'); // Para facturas, empezamos en NC
          }
      } else {
          setClienteSeleccionado(null); setDocAReferenciarId(""); setSearchTerm("");
          setTipoNota('61');
      }

      const targetId = selectedCompany?.id || 'ALL';
      Promise.all([
        getCrmDataApi(user.sessionId, null).then(r => r.json()),
        obtenerHistorialBunker(targetId)
      ]).then(([crm, hist]) => {
        if (crm?.clients) setAllClientes(crm.clients);
        if (hist?.ok) {
            // Traemos TODOS los documentos modificables (33, 34, 61, 56)
            const validos = hist.documentos.filter(d => [33, 34, 61, 56].includes(d.tipo_dte));
            setHistorialGlobal(validos);
            
            if (prefillData?.doc) {
                const r = formatRutEstricto(prefillData.doc.rut_cliente);
                setFacturasDelCliente(validos.filter(d => formatRutEstricto(d.rut_cliente) === r));
            }
        }
      }).finally(() => setIsLoadingDatos(false));
    }
  }, [isOpen, selectedCompany, user, prefillData]);

  // ==========================================
  // 🛡️ LÓGICA DE BLOQUEO CONTABLE
  // ==========================================
  const documentoSeleccionado = useMemo(() => {
      return facturasDelCliente.find(f => f.id === docAReferenciarId) || null;
  }, [docAReferenciarId, facturasDelCliente]);

  const esNotaCreditoSeleccionada = documentoSeleccionado?.tipo_dte === 61;
  const esNotaDebitoSeleccionada = documentoSeleccionado?.tipo_dte === 56;
  const esFacturaSeleccionada = documentoSeleccionado && (documentoSeleccionado.tipo_dte === 33 || documentoSeleccionado.tipo_dte === 34);

  // Cuando cambia el documento seleccionado, auto-ajustamos la pestaña permitida
  useEffect(() => {
      if (esNotaCreditoSeleccionada) setTipoNota('56');
      if (esNotaDebitoSeleccionada) setTipoNota('61');
  }, [esNotaCreditoSeleccionada, esNotaDebitoSeleccionada]);

  // ==========================================
  // 🔍 BUSCADOR 
  // ==========================================
  const filteredResults = useMemo(() => {
    const term = normalize(searchTerm);
    if (!term) return [];

    const mapa = new Map();
    allClientes.forEach(c => {
      const r = formatRutEstricto(c.rut_encrypted || c.rut);
      const n = c.razon_social || c.razonSocial || "";
      if (normalize(n).includes(term) || r.toLowerCase().includes(term)) {
          mapa.set(r, { nombre: n, rut: r });
      }
    });
    historialGlobal.forEach(d => {
      const r = formatRutEstricto(d.rut_cliente);
      const n = d.razon_social || "";
      if (!mapa.has(r) && (normalize(n).includes(term) || r.toLowerCase().includes(term))) {
          mapa.set(r, { nombre: n, rut: r });
      }
    });

    return Array.from(mapa.values()).slice(0, 8);
  }, [searchTerm, allClientes, historialGlobal]);

  const selectCliente = (c) => {
    setClienteSeleccionado(c);
    setSearchTerm("");
    setDocAReferenciarId(""); 
    setAccionSeleccionada(null);
    setFacturasDelCliente(historialGlobal.filter(d => formatRutEstricto(d.rut_cliente) === c.rut));
  };

  // ==========================================
  // 🚀 EMISIÓN
  // ==========================================
  const handleEmitir = async () => {
    if (!accionSeleccionada || !documentoSeleccionado) return;
    
    setIsSubmitting(true);
    try {
      const [rutF, dv] = clienteSel.rut.split('-');
      const payload = {
        empresa_id: selectedCompany.id,
        tipo_documento: parseInt(tipoNota),
        rutReceptor: rutF, dvReceptor: dv,
        razonSocial: clienteSel.nombre,
        producto: { precio: String(documentoSeleccionado.monto_total || documentoSeleccionado.monto_neto) },
        referencia: { folio: documentoSeleccionado.folio, codigo: accionSeleccionada.codigo, razon: accionSeleccionada.glosa }
      };

      const res = await fetch(`${API_BASE_URL}/dte/emitir-nota`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setFolioGenerado(data.folio);
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Nombres bonitos para la lista
  const NOMBRES_DTE = { 33: "Factura Afecta", 34: "Factura Exenta", 61: "Nota de Crédito", 56: "Nota de Débito" };

  return (
    <Dialog open={isOpen} onOpenChange={(val) => !isSubmitting && setIsOpen(val)}>
      <DialogContent className="sm:max-w-[800px] bg-[#0a0a0a] border-white/10 text-white p-0 overflow-hidden shadow-2xl">
        
        {(isSubmitting || folioGenerado) && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/95 backdrop-blur-md">
                {!folioGenerado ? (
                    <div className="flex flex-col items-center gap-4 text-center">
                        <Loader2 className="h-16 w-16 animate-spin text-blue-500" />
                        <h3 className="text-xl font-black uppercase italic text-blue-400">Generando Nota en el SII...</h3>
                    </div>
                ) : (
                    <div className="text-center space-y-6 animate-in zoom-in-95 duration-300">
                        <CheckCircle2 className="h-20 w-20 text-emerald-500 mx-auto" />
                        <h3 className="text-3xl font-black uppercase italic tracking-tighter">¡Nota Emitida con Éxito!</h3>
                        <p className="text-2xl font-mono text-white">FOLIO N° {folioGenerado}</p>
                        <Button onClick={() => setIsOpen(false)} className="bg-emerald-600 hover:bg-emerald-500 w-full h-12 rounded-xl font-black uppercase tracking-widest text-white mt-4">Cerrar y Volver</Button>
                    </div>
                )}
            </div>
        )}

        <div className="p-8 pb-4 border-b border-white/5 bg-white/[0.02]">
            <DialogHeader>
                <div className="flex items-center gap-4">
                    <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-blue-400">
                        <ArrowDownUp size={28} />
                    </div>
                    <div>
                        <DialogTitle className="text-2xl font-black uppercase tracking-tighter italic">Notas de Crédito y Débito</DialogTitle>
                        <DialogDescription className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Afectar Documentos Electrónicos (DTE)</DialogDescription>
                    </div>
                </div>
            </DialogHeader>
        </div>

        <div className="p-8 bg-black/40 max-h-[600px] overflow-y-auto custom-scrollbar">
            <div className="space-y-8">
                
                {/* 1. SELECCIÓN DE EMPRESA Y BUSCADOR */}
                <section className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">1. Buscar Empresa Destino</Label>
                        {clienteSel && (
                            <button onClick={() => {setClienteSeleccionado(null); setDocAReferenciarId("");}} className="text-[9px] font-black uppercase text-blue-500 hover:underline">Cambiar Empresa</button>
                        )}
                    </div>
                    
                    {!clienteSel ? (
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                            <Input 
                                placeholder="Escribe el nombre o RUT del cliente..." 
                                value={searchTerm} 
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-12 h-14 bg-black border-white/10 rounded-xl text-lg uppercase focus:border-blue-500/50" 
                            />
                            {filteredResults.length > 0 && (
                                <div className="absolute top-[110%] left-0 w-full bg-[#111] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                                    {filteredResults.map((c, i) => (
                                        <button key={i} onClick={() => selectCliente(c)} className="w-full px-5 py-4 text-left border-b border-white/5 hover:bg-white/5 flex justify-between items-center group transition-colors">
                                            <div>
                                                <p className="font-bold text-sm text-white group-hover:text-blue-400">{c.nombre}</p>
                                                <p className="text-[10px] font-mono text-gray-500">{c.rut}</p>
                                            </div>
                                            <ChevronRight size={16} className="text-gray-700 group-hover:text-white" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl flex items-center gap-4">
                            <div className="p-2.5 bg-blue-500/10 rounded-lg text-blue-400"><User size={20}/></div>
                            <div>
                                <p className="text-sm font-black uppercase text-white">{clienteSel.nombre}</p>
                                <p className="text-[10px] font-mono text-gray-500">{clienteSel.rut}</p>
                            </div>
                        </div>
                    )}
                </section>

                {/* 2. SELECCIÓN DE DOCUMENTO */}
                {clienteSel && (
                    <section className="space-y-3 animate-in fade-in duration-300">
                        <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">2. Seleccionar Documento a Afectar</Label>
                        <select 
                            value={docAReferenciarId} 
                            onChange={(e) => {
                                setDocAReferenciarId(e.target.value);
                                setAccionSeleccionada(null);
                            }} 
                            disabled={facturasDelCliente.length === 0} 
                            className="w-full h-14 bg-black border border-white/10 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer font-medium"
                            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'white\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1.5em' }}
                        >
                            <option value="">
                                {facturasDelCliente.length > 0 ? "-- Despliega y selecciona un Documento --" : "No hay documentos modificables para este cliente"}
                            </option>
                            {facturasDelCliente.map(f => (
                                <option key={f.id} value={f.id}>
                                    {NOMBRES_DTE[f.tipo_dte]} N° {f.folio} — ${Number(f.monto_total || f.monto_neto).toLocaleString('es-CL')} ({new Date(f.fecha_emision).toLocaleDateString('es-CL')})
                                </option>
                            ))}
                        </select>
                    </section>
                )}

                {/* 3. TABS AUTOMÁTICOS Y ACCIONES */}
                {docAReferenciarId && documentoSeleccionado && (
                    <section className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                        <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block">3. ¿Qué acción deseas realizar?</Label>
                        
                        <div className="flex bg-black/60 p-1 rounded-xl border border-white/5">
                            {/* BOTÓN CRÉDITO: Bloqueado si el doc original es una Nota de Crédito */}
                            <button 
                                onClick={() => {setTipoNota('61'); setAccionSeleccionada(null);}} 
                                disabled={esNotaCreditoSeleccionada}
                                className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${tipoNota === '61' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'text-gray-500 hover:text-gray-300 disabled:opacity-20 disabled:cursor-not-allowed'}`}
                            >
                                Nota de Crédito
                            </button>
                            
                            {/* BOTÓN DÉBITO: Bloqueado si el doc original es una Nota de Débito */}
                            <button 
                                onClick={() => {setTipoNota('56'); setAccionSeleccionada(null);}} 
                                disabled={esNotaDebitoSeleccionada}
                                className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${tipoNota === '56' ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20' : 'text-gray-500 hover:text-gray-300 disabled:opacity-20 disabled:cursor-not-allowed'}`}
                            >
                                Nota de Débito
                            </button>
                        </div>

                        {/* LISTA DE ACCIONES */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {(tipoNota === '61' ? [
                                { codigo: '1', glosa: 'ANULA DOCUMENTO', icon: Ban, color: 'purple', title: 'Anulación Total', desc: 'Anula y deja sin efecto legal.' },
                                { codigo: '3', glosa: 'CORRIGE MONTO', icon: TrendingDown, color: 'purple', title: 'Corregir Monto', desc: 'Aplica un descuento o rebaja.' },
                                { codigo: '2', glosa: 'CORRIGE TEXTO', icon: Edit3, color: 'purple', title: 'Corregir Texto', desc: 'Arregla dirección o giro.' }
                            ] : [
                                { codigo: '1', glosa: 'ANULA NOTA DE CREDITO', icon: Ban, color: 'amber', title: 'Anular Nota de Crédito', desc: 'Anula una Nota de Crédito previa.', hide: !esFacturaSeleccionada && !esNotaCreditoSeleccionada },
                                { codigo: '3', glosa: 'AUMENTA VALOR', icon: TrendingUp, color: 'amber', title: 'Aumentar Valor', desc: 'Suma un cargo extra al documento.' }
                            ]).filter(opt => !opt.hide).map((opt, i) => {
                                const Icon = opt.icon;
                                const isSelected = accionSeleccionada?.glosa === opt.glosa;
                                return (
                                    <button key={i} onClick={() => setAccionSeleccionada(opt)} className={`w-full p-4 border rounded-xl flex items-center gap-4 text-left transition-all ${isSelected ? `bg-${opt.color}-500/20 border-${opt.color}-500 shadow-[0_0_15px_rgba(0,0,0,0.2)]` : 'bg-black/40 border-white/5 hover:border-white/20'}`}>
                                        <div className={`p-3 rounded-lg ${isSelected ? `bg-${opt.color}-500 text-white` : `bg-white/5 text-${opt.color}-500`}`}><Icon size={20}/></div>
                                        <div>
                                            <p className={`font-bold text-sm ${isSelected ? 'text-white' : 'text-gray-300'}`}>{opt.title}</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5">{opt.desc}</p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* BOTONES FINALES */}
                        <div className="pt-6 flex gap-3">
                            <Button variant="ghost" onClick={() => setIsOpen(false)} className="flex-1 uppercase font-black text-[10px] h-14 rounded-xl text-gray-500 hover:text-white hover:bg-white/5">Cancelar</Button>
                            <Button 
                                onClick={handleEmitir} 
                                disabled={!accionSeleccionada} 
                                className={`flex-[2] text-white font-black uppercase text-xs h-14 rounded-xl shadow-xl transition-all ${accionSeleccionada ? `bg-${accionSeleccionada.color}-600 hover:bg-${accionSeleccionada.color}-500 shadow-${accionSeleccionada.color}-500/20` : 'bg-white/10 text-gray-600'}`}
                            >
                                {accionSeleccionada ? `Emitir ${tipoNota === '61' ? 'Nota de Crédito' : 'Nota de Débito'}` : 'Selecciona una Acción'}
                            </Button>
                        </div>
                    </section>
                )}
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}