import { useEffect, useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { 
  Building2, Mail, CreditCard, Loader2, Tag, 
  Search, CheckCircle2, X, Plus, UserPlus 
} from "lucide-react";
import { API_BASE_URL } from "../../../../../config.js";
import { cleanRut } from "@/lib/rut.js";

// CONTEXTO Y SERVICIOS
import { useAuth } from "@/hooks/useAuth.jsx"; 
import { getCrmDataApi } from "@/services/crmService.js";

// --- CONFIGURACIONES ---
const DOC_CONFIG = {
  title: "Facturador Electrónico",
  code: "DTE 33",
  description: "Emisión sincronizada con el SII y registro automático en el Búnker.",
};

// --- UTILIDADES ---
const todayLocalISO = () => {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
};

const formatRutSimple = (rut) => {
  if (!rut) return "";
  const cleaned = rut.replace(/[^0-9kK]/g, '').toUpperCase();
  if (cleaned.length <= 1) return cleaned;
  return cleaned.slice(0, -1) + '-' + cleaned.slice(-1);
};

const cleanStr = (str) => {
  if (!str) return '';
  return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
};

const createEmptyItem = () => ({
  rutFacturar: "", 
  ciudadReceptor: "Santiago", 
  name: "", 
  cantidad: "1", 
  precio: "", 
  fecha: todayLocalISO(),
  metodo: "1",
  ciudadEmisor: "Santiago", 
  telefonoEmisor: "56978278733", 
  contactoReceptor: "", 
  rutSolicita: "", 
  unidadProducto: "1",  
  descuentoPct: "", 
  descripcionProducto: "", 
});

export default function FacturaElectronicaModal({ isOpen, setIsOpen }) {
  const { selectedCompany, user } = useAuth();

  // ESTADOS DEL FORMULARIO
  const [item, setItem] = useState(createEmptyItem());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [folioGenerado, setFolioGenerado] = useState(null);

  // ESTADOS DEL BUSCADOR
  const [allClientes, setAllClientes] = useState([]); 
  const [searchTerm, setSearchTerm] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [empresaEncontrada, setEmpresaEncontrada] = useState(null);
  const [isLoadingCrm, setIsLoadingCrm] = useState(false);
  
  // IDENTIFICACIÓN DE EMPRESA ACTIVA
  const empresaEfectiva = selectedCompany || empresaEncontrada;
  const isExternal = empresaEncontrada?.id === 'EXTERNO';
  const razonSocialSegura = empresaEfectiva?.razon_social || empresaEfectiva?.razonSocial || (searchTerm.length > 0 ? 'Buscando...' : '---');

  // CARGA DE DATOS CRM
  useEffect(() => {
    if (!isOpen) return;
    setIsFinished(false);
    setFolioGenerado(null);
    setEmpresaEncontrada(null); 
    setSearchTerm("");
    setShowSuggestions(false);

    if (!selectedCompany && user?.sessionId) {
      setIsLoadingCrm(true);
      getCrmDataApi(user.sessionId, null)
        .then(res => res.json())
        .then(payload => {
          if (payload?.clients) setAllClientes(payload.clients);
        })
        .catch(err => console.error("Error CRM:", err))
        .finally(() => setIsLoadingCrm(false));
      setItem(createEmptyItem());
    } else if (selectedCompany) {
      const email = (selectedCompany.email_corporativo || selectedCompany.correo || "").split(/[,;/\s]+/)[0].trim();
      setItem({
        ...createEmptyItem(),
        rutFacturar: formatRutSimple(selectedCompany.rut_encrypted || selectedCompany.rut || ""),
        contactoReceptor: email,
        name: selectedCompany.plan_nombre || selectedCompany.plan || "", 
        precio: selectedCompany.impuesto_pagar || selectedCompany.neto || "",
        descripcionProducto: "Servicios Contables",
      });
    }
  }, [isOpen, selectedCompany, user]);

  // =======================================================
  // 🔥 LÓGICA DE BÚSQUEDA CORREGIDA (INMEDIATA Y PRECISA)
  // =======================================================
  const filteredSuggestions = useMemo(() => {
    // Ya no bloqueamos por menos de 2 letras. Busca desde la primera.
    if (!searchTerm || searchTerm.trim() === "") return [];

    const termStr = cleanStr(searchTerm);
    // Creamos una versión de la búsqueda solo con números y K para buscar el RUT sin puntos
    const termRut = searchTerm.replace(/[^0-9kK]/gi, '').toLowerCase();

    return allClientes.filter(c => {
      const rs = cleanStr(c.razon_social || c.razonSocial || "");
      // Limpiamos el RUT de la base de datos de puntos y guiones
      const rutPuro = (c.rut_encrypted || c.rut || "").replace(/[^0-9kK]/gi, '').toLowerCase();

      const matchName = rs.includes(termStr);
      // Solo busca por RUT si realmente hay números escritos
      const matchRut = termRut !== "" && rutPuro.includes(termRut);

      return matchName || matchRut;
    }).slice(0, 5);
  }, [searchTerm, allClientes]);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchTerm(val);
    setEmpresaEncontrada(null);
    setShowSuggestions(true);
    // Si escribe puros números y guiones, lo mandamos directo al item de facturar también
    if (/^[0-9kK\.\-]+$/.test(val)) {
      setItem(prev => ({ ...prev, rutFacturar: formatRutSimple(val) }));
    }
  };

  const onSelectCliente = (cliente) => {
    setEmpresaEncontrada(cliente);
    setSearchTerm(cliente.razon_social || cliente.razonSocial);
    setShowSuggestions(false);
    
    const rut = formatRutSimple(cliente.rut_encrypted || cliente.rut || "");
    const email = (cliente.email_corporativo || cliente.correo || "").split(/[,;/\s]+/)[0].trim();

    setItem(prev => ({
      ...prev,
      rutFacturar: rut,
      contactoReceptor: email,
      name: cliente.plan_nombre || cliente.plan || prev.name,
      precio: cliente.impuesto_pagar || cliente.neto || prev.precio,
      descripcionProducto: "Servicios Contables"
    }));
  };

  const handleForzarEmpresa = () => {
    const rutParaAgregar = formatRutSimple(searchTerm);
    if (!rutParaAgregar.includes('-')) {
      toast({ variant: "destructive", title: "RUT Incompleto", description: "Ingresa el RUT con guion." });
      return;
    }

    const provisional = { 
      id: 'EXTERNO', 
      razon_social: 'CLIENTE EXTERNO (NUEVO)', 
      rut: rutParaAgregar 
    };

    setEmpresaEncontrada(provisional);
    setItem(prev => ({ ...prev, rutFacturar: rutParaAgregar, contactoReceptor: "" }));
    setShowSuggestions(false);
    toast({ title: "Modo Externo", description: "Puedes ingresar un correo (opcional) o emitir directamente." });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!empresaEfectiva) return toast({ variant: "destructive", title: "Falta Cliente", description: "Busca o registra una empresa." });
    
    if (item.contactoReceptor && !item.contactoReceptor.includes('@')) {
        return toast({ variant: "destructive", title: "Correo Inválido", description: "Si ingresas un correo, debe tener formato válido." });
    }

    setIsSubmitting(true);
    try {
      const rutLimpio = cleanRut(item.rutFacturar);
      const [rutFull, dv] = rutLimpio.includes('-') ? rutLimpio.split('-') : [rutLimpio, ''];
      
      const payload = {
        empresa_id: empresaEfectiva.id,
        razonSocial: razonSocialSegura,
        rutReceptor: rutFull,
        dvReceptor: dv,
        ciudadEmisor: 'Santiago',
        telefonoEmisor: '56978278733',
        ciudadReceptor: item.ciudadReceptor,
        contactoReceptor: item.contactoReceptor, 
        producto: {
          nombre: item.name,
          cantidad: '1',
          unidad: '1',
          precio: String(item.precio).replace(/[^0-9]/g, ''),
          descripcion: item.descripcionProducto
        }
      };

      const res = await fetch(`${API_BASE_URL}/dte/emitir-manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  return (
    <Dialog open={isOpen} onOpenChange={(val) => !isSubmitting && setIsOpen(val)}>
      <DialogContent className="sm:max-w-[800px] bg-zinc-900 border-white/10 text-white overflow-visible p-0 shadow-2xl">
        
        {/* OVERLAY DE CARGA / ÉXITO */}
        {(isSubmitting || isFinished) && (
          <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-zinc-950/95 backdrop-blur-md rounded-lg">
            {isSubmitting ? (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-16 w-16 animate-spin text-blue-500" />
                <h3 className="text-xl font-bold uppercase italic tracking-tighter">Emitiendo en el SII...</h3>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-6 text-center">
                <CheckCircle2 className="h-20 w-20 text-green-500" />
                <h3 className="text-3xl font-black uppercase italic tracking-tighter">¡Documento Emitido!</h3>
                <p className="font-mono text-lg text-gray-400 italic">Folio SII N° {folioGenerado}</p>
                <Button onClick={() => setIsOpen(false)} className="bg-blue-600 hover:bg-blue-700 w-full mt-4 rounded-xl font-black uppercase tracking-widest">Finalizar</Button>
              </div>
            )}
          </div>
        )}

        <div className="p-8">
          <DialogHeader className="mb-6">
            <div className="flex items-center gap-3">
               <div className="p-2 bg-blue-500/10 rounded-xl border border-blue-500/20">
                  <Building2 className="text-blue-500" size={24} />
               </div>
               <div>
                  <DialogTitle className="text-2xl font-black italic uppercase tracking-tighter leading-none">{DOC_CONFIG.title}</DialogTitle>
                  <DialogDescription className="text-gray-500 text-[10px] uppercase font-bold tracking-[0.2em] mt-1">{DOC_CONFIG.code} • {DOC_CONFIG.description}</DialogDescription>
               </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-6 shadow-inner relative">
              <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Search size={14} /> {selectedCompany ? 'Cliente Seleccionado' : 'Buscador de Clientes Búnker'}
              </h4>

              {!selectedCompany && (
                <div className="mb-6 relative">
                  <div className="relative">
                    <Search className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${empresaEncontrada ? 'text-emerald-500' : 'text-gray-500'}`} size={18} />
                    <Input 
                      placeholder="Nombre de Empresa o RUT..."
                      value={searchTerm}
                      onChange={handleSearchChange}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      className="pl-12 h-12 bg-black/40 border-white/10 rounded-2xl text-md focus:border-blue-500 shadow-xl transition-all"
                    />
                  </div>

                  {showSuggestions && (
                    <div className="absolute top-full left-0 w-full mt-2 bg-zinc-800 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-[60] animate-in fade-in slide-in-from-top-2">
                      {filteredSuggestions.map((c, i) => (
                        <div key={i} onClick={() => onSelectCliente(c)} className="px-5 py-4 cursor-pointer hover:bg-blue-600/20 border-b border-white/5 flex justify-between items-center group transition-colors">
                          <div>
                            <div className="text-sm font-bold text-white">{c.razon_social || c.razonSocial}</div>
                            <div className="text-[10px] text-gray-500 font-mono mt-1 tracking-widest">{formatRutSimple(c.rut_encrypted || c.rut)}</div>
                          </div>
                          <CheckCircle2 size={16} className="text-blue-500 opacity-0 group-hover:opacity-100 transition-all" />
                        </div>
                      ))}
                      {searchTerm.length >= 3 && (
                        <button type="button" onClick={handleForzarEmpresa} className="w-full p-4 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-500 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 border-t border-white/5 transition-all">
                          <UserPlus size={16} /> REGISTRAR EMPRESA EXTERNA: {searchTerm}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-5 bg-black/30 rounded-2xl border border-white/5">
                <div>
                  <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest">Razón Social</p>
                  <p className={`text-sm font-black truncate ${empresaEfectiva ? 'text-white' : 'text-gray-700'}`}>{razonSocialSegura}</p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest">RUT Receptor</p>
                  <p className={`text-sm font-mono font-bold ${empresaEfectiva ? 'text-blue-400' : 'text-gray-700'}`}>{item.rutFacturar || '---'}</p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest flex items-center gap-1">
                    <Mail size={10} /> Correo Receptor
                  </p>
                  {isExternal ? (
                    <Input 
                      placeholder="(Opcional) email@..."
                      value={item.contactoReceptor}
                      onChange={(e) => setItem({...item, contactoReceptor: e.target.value})}
                      className="h-8 bg-blue-500/10 border-blue-500/30 text-xs rounded-xl focus:border-blue-500 text-blue-300 placeholder:text-blue-500/40"
                    />
                  ) : (
                    <p className={`text-sm truncate font-medium ${empresaEfectiva ? 'text-gray-300' : 'text-gray-700'}`}>{item.contactoReceptor || '---'}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Plan / Concepto</Label>
                <div className="relative">
                  <Tag className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                  <Input value={item.name} onChange={(e) => setItem({...item, name: e.target.value})} className="pl-11 h-12 bg-black/40 border-white/10 rounded-xl" placeholder="Ej: Plan GO" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Valor Neto ($)</Label>
                <div className="relative">
                  <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                  <Input type="number" value={item.precio} onChange={(e) => setItem({...item, precio: e.target.value})} className="pl-11 h-12 bg-black/40 border-white/10 rounded-xl font-mono text-lg font-bold text-emerald-500" />
                </div>
              </div>
              <div className="md:col-span-2 space-y-2">
                <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Observaciones / Mes</Label>
                <Input value={item.descripcionProducto} onChange={(e) => setItem({ ...item, descripcionProducto: e.target.value })} className="h-12 bg-black/40 border-white/10 rounded-xl" placeholder="Ej: Servicios correspondientes a..." />
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-white/5">
              <Button type="button" variant="ghost" onClick={() => setIsOpen(false)} className="flex-1 uppercase font-black text-[10px] tracking-widest h-12 rounded-xl text-gray-400 hover:text-white transition-all">Cancelar Operación</Button>
              <Button type="submit" disabled={!empresaEfectiva || isSubmitting} className="flex-[2] bg-blue-600 hover:bg-blue-500 text-white font-black uppercase text-[10px] tracking-[0.2em] h-12 rounded-xl shadow-lg shadow-blue-500/20 transition-all">
                {isSubmitting ? 'Procesando...' : 'Emitir Documento SII'}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}