import { useEffect, useState, useMemo, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { 
  Building2, Mail, CreditCard, Loader2, Tag, 
  Search, CheckCircle2, UserPlus, UploadCloud, AlertCircle, FileText
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

const TABS = {
  UNICA: "unica",
  MASIVA: "masiva",
};

// --- UTILIDADES (Protegidas contra números) ---
const todayLocalISO = () => {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
};

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

// PARSER DE CSV BÁSICO
const parseCsvLine = (line) => {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') { inQuotes = !inQuotes; continue; }
    if (char === "," && !inQuotes) { result.push(current.trim()); current = ""; continue; }
    current += char;
  }
  result.push(current.trim());
  return result;
};

export default function FacturaElectronicaModal({ isOpen, setIsOpen }) {
  const { selectedCompany, user } = useAuth();

  // ESTADOS DEL FORMULARIO Y TABS
  const [activeTab, setActiveTab] = useState(TABS.UNICA);
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

  // ESTADOS MASIVOS
  const [bulkRows, setBulkRows] = useState([]);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const fileInputRef = useRef(null);
  
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
    setBulkRows([]);
    setActiveTab(TABS.UNICA);

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
      const email = String(selectedCompany.email_corporativo || selectedCompany.correo || "").split(/[,;/\s]+/)[0].trim();
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

  // LÓGICA DE BÚSQUEDA
  const filteredSuggestions = useMemo(() => {
    if (!searchTerm || String(searchTerm).trim() === "") return [];
    const termStr = cleanStr(searchTerm);
    const termRut = String(searchTerm).replace(/[^0-9kK]/gi, '').toLowerCase();

    return allClientes.filter(c => {
      const rs = cleanStr(c.razon_social || c.razonSocial || "");
      const rutPuro = String(c.rut_encrypted || c.rut || "").replace(/[^0-9kK]/gi, '').toLowerCase();
      const matchName = rs.includes(termStr);
      const matchRut = termRut !== "" && rutPuro.includes(termRut);
      return matchName || matchRut;
    }).slice(0, 5);
  }, [searchTerm, allClientes]);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchTerm(val);
    setEmpresaEncontrada(null);
    setShowSuggestions(true);
    if (/^[0-9kK\.\-]+$/.test(val)) {
      setItem(prev => ({ ...prev, rutFacturar: formatRutSimple(val) }));
    }
  };

  const onSelectCliente = (cliente) => {
    setEmpresaEncontrada(cliente);
    setSearchTerm(cliente.razon_social || cliente.razonSocial);
    setShowSuggestions(false);
    
    const rut = formatRutSimple(cliente.rut_encrypted || cliente.rut || "");
    const email = String(cliente.email_corporativo || cliente.correo || "").split(/[,;/\s]+/)[0].trim();

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
    const provisional = { id: 'EXTERNO', razon_social: 'CLIENTE EXTERNO (NUEVO)', rut: rutParaAgregar };
    setEmpresaEncontrada(provisional);
    setItem(prev => ({ ...prev, rutFacturar: rutParaAgregar, contactoReceptor: "" }));
    setShowSuggestions(false);
    toast({ title: "Modo Externo", description: "Puedes ingresar un correo (opcional) o emitir directamente." });
  };

  // ==========================================
  // 🚀 LÓGICA DE FACTURACIÓN MASIVA (CSV)
  // ==========================================
  const handleCsvUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) return toast({ variant: "destructive", title: "CSV Vacío" });

      const headers = parseCsvLine(lines[0]).map(h => String(h).toLowerCase().replace(/[^a-z0-9]/g, ''));
      const rutIndex = headers.findIndex(h => h.includes('rut'));
      
      if (rutIndex === -1) {
        return toast({ variant: "destructive", title: "Error de Formato", description: "El archivo debe tener una columna llamada 'RUT'" });
      }

      const rowsData = lines.slice(1).map(line => {
        const vals = parseCsvLine(line);
        const rutLimpio = formatRutSimple(vals[rutIndex]);
        const rutParaBuscar = cleanRut(rutLimpio);
        
        // Cruce con el CRM (Búnker)
        const crmMatch = allClientes.find(c => cleanRut(c.rut_encrypted || c.rut || "") === rutParaBuscar);

        return {
          id: crmMatch ? crmMatch.id : 'EXTERNO',
          rut: rutLimpio,
          razonSocial: crmMatch ? (crmMatch.razon_social || crmMatch.razonSocial) : 'Nuevo Cliente (Se creará en SII)',
          plan: crmMatch ? (crmMatch.plan_nombre || crmMatch.plan || '') : '',
          precio: crmMatch ? (crmMatch.impuesto_pagar || crmMatch.neto || '') : '',
          observacion: 'Servicios correspondientes',
          contacto: crmMatch ? (crmMatch.email_corporativo || '') : '',
          estado: 'pendiente'
        };
      });

      setBulkRows(rowsData.filter(r => r.rut));
      toast({ title: "Archivo Procesado", description: `Se encontraron ${rowsData.filter(r=>r.rut).length} RUTs listos para facturar.` });
    } catch (err) {
      toast({ variant: "destructive", title: "Error leyendo archivo" });
    }
  };

  const updateBulkRow = (index, field, value) => {
    const newRows = [...bulkRows];
    newRows[index][field] = value;
    setBulkRows(newRows);
  };

  const handleBulkSubmit = async () => {
    setIsBulkSubmitting(true);
    
    const facturasAProcesar = bulkRows.map(row => {
      const rutLimpio = cleanRut(row.rut);
      const [rutFull, dv] = rutLimpio.includes("-") ? rutLimpio.split("-") : [rutLimpio, ""];

      return {
        empresa_id: row.id,
        tipo_documento: "33", 
        rutReceptor: rutFull,
        dvReceptor: dv,
        ciudadEmisor: "Santiago",
        telefonoEmisor: "56978278733",
        ciudadReceptor: "Santiago",
        contactoReceptor: row.contacto,
        producto: {
          nombre: row.plan || 'Servicio Contable',
          cantidad: "1",
          unidad: "1",
          precio: String(row.precio || 0).replace(/[^0-9]/g, ''),
          descripcion: row.observacion,
        },
      };
    });

    try {
      setBulkRows(prev => prev.map(r => ({ ...r, estado: "procesando" })));
      
      const res = await fetch(`${API_BASE_URL}/dte/emitir-masivo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facturas: facturasAProcesar }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error procesando el lote");

      toast({ title: "Lote Finalizado", description: "Se ha procesado la facturación masiva exitosamente." });
      setBulkRows(prev => prev.map(r => ({ ...r, estado: "completado" })));
    } catch (error) {
      toast({ variant: "destructive", title: "Fallo Masivo", description: error.message });
      setBulkRows(prev => prev.map(r => ({ ...r, estado: "error" })));
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  const handleSubmitUnica = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
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
    <Dialog open={isOpen} onOpenChange={(val) => { if (!isSubmitting && !isBulkSubmitting) setIsOpen(val); }}>
      {/* ⬅️ TUS DIMENSIONES: max-w-[800px] y altura flexible hasta max-h-[90vh] */}
      <DialogContent className="sm:max-w-[800px] w-full bg-zinc-900 border-white/10 text-white overflow-hidden p-0 shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* OVERLAY DE CARGA / ÉXITO */}
        {(isSubmitting || isFinished) && (
          <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-zinc-950/95 backdrop-blur-md rounded-lg">
            {isSubmitting ? (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-16 w-16 animate-spin text-blue-500" />
                <h3 className="text-xl font-bold uppercase italic tracking-tighter">Emitiendo en el SII...</h3>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-6 text-center p-8">
                <CheckCircle2 className="h-20 w-20 text-green-500" />
                <h3 className="text-3xl font-black uppercase italic tracking-tighter">¡Documento Emitido!</h3>
                <p className="font-mono text-lg text-gray-400 italic">Folio SII N° {folioGenerado}</p>
                <Button onClick={() => setIsOpen(false)} className="bg-blue-600 hover:bg-blue-700 w-full mt-4 rounded-xl font-black uppercase tracking-widest">Finalizar</Button>
              </div>
            )}
          </div>
        )}

        <div className="p-8 flex flex-col h-full overflow-hidden">
          
          {/* HEADER FIJO */}
          <div className="flex-shrink-0">
            <DialogHeader className="mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <div className="p-2 bg-blue-500/10 rounded-xl border border-blue-500/20">
                      <Building2 className="text-blue-500" size={24} />
                   </div>
                   <div>
                      <DialogTitle className="text-2xl font-black italic uppercase tracking-tighter leading-none">{DOC_CONFIG.title}</DialogTitle>
                      <DialogDescription className="text-gray-500 text-[10px] uppercase font-bold tracking-[0.2em] mt-1">{DOC_CONFIG.code} • {DOC_CONFIG.description}</DialogDescription>
                   </div>
                </div>
              </div>
            </DialogHeader>

            {/* BOTONES INTERRUPTORES (ÚNICA / MASIVA) */}
            <div className="flex bg-black/50 p-1.5 rounded-2xl border border-white/10 mb-6">
                <button
                    onClick={() => setActiveTab(TABS.UNICA)}
                    className={`flex-1 flex items-center justify-center gap-2 h-12 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300 ${
                        activeTab === TABS.UNICA 
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25' 
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                    Factura Única
                </button>
                <button
                    onClick={() => setActiveTab(TABS.MASIVA)}
                    className={`flex-1 flex items-center justify-center gap-2 h-12 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300 ${
                        activeTab === TABS.MASIVA 
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25' 
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                    <FileText size={16} /> Factura Masiva (CSV)
                </button>
            </div>
          </div>

          {/* ========================================================= */}
          {/* ÁREA DE CONTENIDO CON ANIMACIONES NATIVAS (SIN CRASHEOS) */}
          {/* ========================================================= */}
          <div className="flex-1 flex flex-col overflow-hidden">
              
              {/* PESTAÑA: FACTURA ÚNICA */}
              {activeTab === TABS.UNICA && (
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 animate-in fade-in duration-300">
                  <div className="space-y-6 pb-4">
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
                  </div>
                </div>
              )}

              {/* PESTAÑA: FACTURA MASIVA (CSV) ERP STYLE */}
              {activeTab === TABS.MASIVA && (
                <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in duration-300">
                  
                  {/* DROPZONE DINÁMICA: Si no hay filas, es gigante. Si hay filas, se encoge. */}
                  <div 
                    className={`border-dashed flex flex-col items-center justify-center transition-all cursor-pointer rounded-2xl ${
                        bulkRows.length === 0 
                        ? 'bg-blue-900/10 border-blue-500/30 flex-1 my-8 border-2 hover:bg-blue-900/20' 
                        : 'bg-black/20 border-white/10 p-4 mb-4 border hover:bg-white/5'
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <UploadCloud size={bulkRows.length === 0 ? 48 : 24} className="text-blue-400 mb-2" />
                    <Label className="cursor-pointer text-sm font-bold text-white mb-1 hover:underline">
                        {bulkRows.length === 0 ? "Arrastra o Sube tu Archivo Excel / CSV" : "Subir otro archivo"}
                    </Label>
                    {bulkRows.length === 0 && (
                        <p className="text-[10px] text-gray-400 uppercase tracking-widest text-center px-4 mt-2">
                          El archivo solo necesita tener una columna llamada "RUT". El sistema cruzará la info con tu CRM.
                        </p>
                    )}
                    <Input ref={fileInputRef} type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" disabled={isBulkSubmitting}/>
                  </div>

                  {bulkRows.length > 0 && (
                    <div className="flex-1 flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0a] shadow-2xl">
                      
                      <div className="bg-[#0f172a] px-6 py-3 border-b border-white/10 flex justify-between items-center flex-shrink-0">
                        <div className="flex gap-4">
                          <span className="text-xs text-gray-400 font-bold uppercase tracking-widest">
                            Total Filas: <span className="text-white">{bulkRows.length}</span>
                          </span>
                          <span className="text-xs text-gray-400 font-bold uppercase tracking-widest">
                            Externas: <span className="text-orange-400">{bulkRows.filter(r => r.id === 'EXTERNO').length}</span>
                          </span>
                        </div>
                        <div className="text-sm text-gray-400 font-black uppercase tracking-widest">
                          Proyección Neta: <span className="text-emerald-400 font-mono tracking-tighter">${bulkRows.reduce((acc, curr) => acc + (Number(curr.precio) || 0), 0).toLocaleString('es-CL')}</span>
                        </div>
                      </div>

                      <div className="flex-1 overflow-auto custom-scrollbar">
                        <table className="w-full text-[10px] text-left whitespace-nowrap">
                          <thead className="bg-[#0f172a] sticky top-0 z-10 border-b border-white/10 shadow-md">
                            <tr>
                              <th className="px-6 py-3 font-black text-gray-500 uppercase tracking-widest w-64">Empresa / RUT</th>
                              <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest min-w-[200px]">Plan / Concepto</th>
                              <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest w-32">Neto ($)</th>
                              <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest min-w-[250px]">Observación</th>
                              <th className="px-6 py-3 font-black text-gray-500 uppercase tracking-widest w-28 text-center">Estado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {bulkRows.map((row, i) => {
                              const formatData = (str) => String(str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

                              return (
                                <tr key={i} className="hover:bg-white/[0.04] transition-colors group">
                                  <td className="px-6 py-2">
                                    <div className="font-bold text-gray-200 truncate max-w-[200px]" title={row.razonSocial}>
                                      {formatData(row.razonSocial)}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="font-mono text-blue-400 text-[10px]">{row.rut}</span>
                                        {row.id === 'EXTERNO' && (
                                          <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-orange-500/10 border border-orange-500/20 text-orange-400 uppercase tracking-widest shadow-lg shadow-orange-500/10">
                                            Externo
                                          </span>
                                        )}
                                    </div>
                                  </td>
                                  
                                  <td className="px-4 py-2">
                                    <Input 
                                      value={formatData(row.plan)} 
                                      onChange={(e) => updateBulkRow(i, 'plan', e.target.value)} 
                                      className="h-8 bg-transparent border-transparent hover:border-white/20 focus:bg-black/60 focus:border-blue-500 text-[10px] font-bold text-gray-300 rounded transition-all shadow-none placeholder:text-gray-700 uppercase" 
                                      placeholder="CONCEPTO..." 
                                      disabled={isBulkSubmitting}
                                    />
                                  </td>

                                  <td className="px-4 py-2">
                                    <Input 
                                      type="number" 
                                      value={row.precio} 
                                      onChange={(e) => updateBulkRow(i, 'precio', e.target.value)} 
                                      className="h-8 bg-transparent border-transparent hover:border-white/20 focus:bg-black/60 focus:border-blue-500 text-[11px] font-bold font-mono text-emerald-400 rounded transition-all shadow-none placeholder:text-emerald-900" 
                                      placeholder="0" 
                                      disabled={isBulkSubmitting}
                                    />
                                  </td>

                                  <td className="px-4 py-2">
                                    <Input 
                                      value={formatData(row.observacion)} 
                                      onChange={(e) => updateBulkRow(i, 'observacion', e.target.value)} 
                                      className="h-8 bg-transparent border-transparent hover:border-white/20 focus:bg-black/60 focus:border-blue-500 text-[10px] font-medium text-gray-400 rounded transition-all shadow-none placeholder:text-gray-700 uppercase" 
                                      placeholder="GLOSA FACTURA..." 
                                      disabled={isBulkSubmitting}
                                    />
                                  </td>

                                  <td className="px-6 py-2 text-center">
                                    <div className="flex justify-center">
                                      {row.estado === "procesando" && (
                                        <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 font-black text-[8px] uppercase tracking-widest">
                                          <Loader2 size={10} className="animate-spin" /> Procesando
                                        </span>
                                      )}
                                      {row.estado === "completado" && (
                                        <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black text-[8px] uppercase tracking-widest">
                                          <CheckCircle2 size={10} /> Completado
                                        </span>
                                      )}
                                      {row.estado === "error" && (
                                        <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 font-black text-[8px] uppercase tracking-widest">
                                          <AlertCircle size={10} /> Error
                                        </span>
                                      )}
                                      {row.estado === "pendiente" && (
                                        <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/5 border border-white/10 text-gray-500 font-black text-[8px] uppercase tracking-widest">
                                          En Fila
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
          </div>

          {/* FOOTER CON BOTONES FINALES (Fijo al fondo) */}
          <div className="flex gap-3 pt-6 mt-4 border-t border-white/5 flex-shrink-0 relative z-20 bg-zinc-900">
            <Button type="button" onClick={() => setIsOpen(false)} className="flex-1 bg-white/5 hover:bg-white/10 text-white uppercase font-black text-[10px] tracking-widest h-12 rounded-xl transition-all">Cancelar</Button>
            
            {activeTab === TABS.UNICA ? (
              <Button onClick={handleSubmitUnica} disabled={!empresaEfectiva || isSubmitting} className="flex-[2] bg-blue-600 hover:bg-blue-500 text-white font-black uppercase text-[10px] tracking-[0.2em] h-12 rounded-xl shadow-lg shadow-blue-500/20 transition-all">
                {isSubmitting ? 'Procesando...' : 'Emitir Documento SII'}
              </Button>
            ) : (
              <Button onClick={handleBulkSubmit} disabled={isBulkSubmitting || bulkRows.length === 0} className="flex-[2] bg-blue-600 hover:bg-blue-500 text-white font-black uppercase text-[10px] tracking-[0.2em] h-12 rounded-xl shadow-lg shadow-blue-500/20 transition-all">
                {isBulkSubmitting ? 'Facturando Lote...' : `Facturar Masivo (${bulkRows.length})`}
              </Button>
            )}
          </div>
          
        </div>
      </DialogContent>
    </Dialog>
  );
}