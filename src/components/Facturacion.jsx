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
  Search, CheckCircle2, UserPlus, UploadCloud, AlertCircle, FileText, Plus, X
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

// --- UTILIDADES ---
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

// =======================================================
// 🚀 PARSER AVANZADO DE CSV (MÉTODO FORENSE CON REGEX)
// =======================================================
const rutRegex = /\d{7,8}-[0-9Kk]/;
const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const montoRegex = /\$\s?[\d.,]+/g;

function limpiarMonto(m) {
  if (!m) return 0;
  return Number(
    m.replace("$", "")
      .replace(/\./g, "")
      .replace(/,/g, "")
  );
}

function parseLineaAvanzada(linea) {
  const rutMatch = linea.match(rutRegex);
  if (!rutMatch) return null; // Si no hay RUT, se ignora la línea (basura o títulos)
  const rut = rutMatch[0];

  const correoMatch = linea.match(emailRegex);
  const correo = correoMatch ? correoMatch[0] : "";

  const montos = linea.match(montoRegex) || [];

  // Razón social = Todo el texto que está ANTES del primer monto o antes del RUT
  let razonSocial = "NUEVO CLIENTE";
  if (montos.length > 0) {
    razonSocial = linea.split(montos[0])[0];
  } else {
    razonSocial = linea.split(rut)[0];
  }

  // Limpiamos las comillas y comas que deja el Excel
  razonSocial = razonSocial.replace(/"/g, "").replace(/;/g, "").replace(/,+$/, "").trim();
  
  const neto = montos.length > 0 ? limpiarMonto(montos[0]) : 0;

  return { rut, correo, neto, razonSocial };
}

export default function FacturaElectronicaModal({ isOpen, setIsOpen }) {
  const { selectedCompany, user } = useAuth();

  // ESTADOS DEL FORMULARIO Y TABS
  const [activeTab, setActiveTab] = useState(TABS.UNICA);
  const [item, setItem] = useState(createEmptyItem());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [folioGenerado, setFolioGenerado] = useState(null);

  // ESTADOS DEL BUSCADOR PRINCIPAL
  const [allClientes, setAllClientes] = useState([]); 
  const [searchTerm, setSearchTerm] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [empresaEncontrada, setEmpresaEncontrada] = useState(null);
  const [isLoadingCrm, setIsLoadingCrm] = useState(false);

  // ESTADOS MASIVOS
  const [bulkRows, setBulkRows] = useState([]);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const [activeRowIndex, setActiveRowIndex] = useState(null); 
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
    setActiveRowIndex(null);
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

  // LÓGICA DE BÚSQUEDA PRINCIPAL
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
  // 🚀 LÓGICA DE FACTURACIÓN MASIVA
  // ==========================================
  const handleCsvUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      
      // Limpiamos los saltos de línea y separamos el archivo
      const lineas = text
        .replace(/\t/g, ",")
        .replace(/;+/g, ",")
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l.length > 5);

      // Si la primera línea tiene títulos, la ignoramos
      if (lineas.length > 0 && (lineas[0].toLowerCase().includes('rut') || lineas[0].toLowerCase().includes('razon'))) {
         lineas.shift();
      }

      if (lineas.length === 0) return toast({ variant: "destructive", title: "CSV Vacío o Inválido" });

      const rowsData = lineas.map(linea => {
        // Ejecutamos tu analizador Forense
        const parsed = parseLineaAvanzada(linea);
        if (!parsed) return null;

        const rutLimpio = formatRutSimple(parsed.rut);
        const rutParaBuscar = cleanRut(rutLimpio);
        const precioNum = parsed.neto;

        // Cruce Automático con tu CRM
        const crmMatch = allClientes.find(c => cleanRut(c.rut_encrypted || c.rut || "") === rutParaBuscar);

        // Decisión Inteligente: Si el Excel dice $0 o está vacío, se omite.
        const estadoFila = precioNum > 0 ? 'pendiente' : 'omitido';

        return {
          id: crmMatch ? crmMatch.id : 'EXTERNO',
          searchQuery: rutLimpio, 
          rut: rutLimpio,
          razonSocial: crmMatch ? (crmMatch.razon_social || crmMatch.razonSocial) : parsed.razonSocial,
          plan: crmMatch ? (crmMatch.plan_nombre || crmMatch.plan || '') : 'Servicio Contable',
          precio: precioNum > 0 ? String(precioNum) : '', 
          observacion: 'Servicios correspondientes',
          contacto: parsed.correo || (crmMatch ? (crmMatch.email_corporativo || '') : ''),
          estado: estadoFila
        };
      }).filter(Boolean); // Filtra los nulls (basura que no tenía RUT)

      // Auto-Ordenamiento: Los facturables quedan arriba, los omitidos bajan al fondo.
      rowsData.sort((a, b) => (a.estado === 'omitido' ? 1 : -1));

      // Acumulamos por si el usuario sube otro archivo o agrega a mano
      setBulkRows(prev => [...prev, ...rowsData]);
      
      const facturables = rowsData.filter(r => r.estado === 'pendiente').length;
      const omitidos = rowsData.filter(r => r.estado === 'omitido').length;

      toast({ 
          title: "Planilla Procesada Perfectamente", 
          description: `Detectados: ${facturables} a Facturar y ${omitidos} en $0 (Omitidos).` 
      });

    } catch (err) {
      toast({ variant: "destructive", title: "Error leyendo archivo" });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAddManualRow = () => {
    setBulkRows([{
      id: 'EXTERNO',
      searchQuery: '',
      rut: '',
      razonSocial: '---',
      plan: '',
      precio: '',
      observacion: 'Servicios correspondientes',
      contacto: '',
      estado: 'pendiente'
    }, ...bulkRows]);
  };

  const handleBulkSearchChange = (index, val) => {
    const newRows = [...bulkRows];
    newRows[index].searchQuery = val;
    if (/^[0-9kK\.\-]+$/.test(val)) {
      newRows[index].rut = formatRutSimple(val);
    }
    setBulkRows(newRows);
  };

  const applyClientToRow = (index, cliente) => {
    const newRows = [...bulkRows];
    const rutLimpio = formatRutSimple(cliente.rut_encrypted || cliente.rut);
    newRows[index].id = cliente.id;
    newRows[index].rut = rutLimpio;
    newRows[index].searchQuery = rutLimpio;
    newRows[index].razonSocial = cliente.razon_social || cliente.razonSocial;
    newRows[index].plan = cliente.plan_nombre || cliente.plan || newRows[index].plan;
    newRows[index].precio = cliente.impuesto_pagar || cliente.neto || newRows[index].precio;
    newRows[index].contacto = cliente.email_corporativo || '';
    setBulkRows(newRows);
    setActiveRowIndex(null);
  };

  const setRowAsExternal = (index, val) => {
    const newRows = [...bulkRows];
    const rutLimpio = formatRutSimple(val);
    newRows[index].id = 'EXTERNO';
    newRows[index].rut = rutLimpio;
    newRows[index].searchQuery = rutLimpio;
    newRows[index].razonSocial = 'CLIENTE EXTERNO (NUEVO)';
    setBulkRows(newRows);
    setActiveRowIndex(null);
  };

  const updateBulkRow = (index, field, value) => {
    const newRows = [...bulkRows];
    newRows[index][field] = value;
    setBulkRows(newRows);
  };

  const removeBulkRow = (index) => {
    setBulkRows(bulkRows.filter((_, i) => i !== index));
  };

  const handleBulkSubmit = async () => {
    setIsBulkSubmitting(true);
    
    // Solo se facturarán los que estén en estado "pendiente" y tengan RUT
    const facturasAProcesar = bulkRows.filter(r => r.rut && r.estado === 'pendiente').map(row => {
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

    if (facturasAProcesar.length === 0) {
      setIsBulkSubmitting(false);
      return toast({ variant: "destructive", title: "Sin datos", description: "No hay filas válidas para procesar." });
    }

    try {
      setBulkRows(prev => prev.map(r => r.estado === 'pendiente' ? { ...r, estado: "procesando" } : r));
      
      const res = await fetch(`${API_BASE_URL}/dte/emitir-masivo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facturas: facturasAProcesar }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error procesando el lote");

      toast({ title: "Lote Finalizado", description: "Se ha procesado la facturación masiva exitosamente." });
      setBulkRows(prev => prev.map(r => r.estado === 'procesando' ? { ...r, estado: "completado" } : r));
    } catch (error) {
      toast({ variant: "destructive", title: "Fallo Masivo", description: error.message });
      setBulkRows(prev => prev.map(r => r.estado === 'procesando' ? { ...r, estado: "error" } : r));
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
    // BLOQUEO ABSOLUTO DURANTE EMISIÓN
    <Dialog open={isOpen} onOpenChange={(val) => { if (!isSubmitting && !isBulkSubmitting) setIsOpen(val); }}>
      
      {/* 🚀 EL TAMAÑO CAMBIA MAGÍCAMENTE DEPENDIENDO DE LA PESTAÑA */}
      <DialogContent className={`w-full bg-[#0a0a0a] border-white/10 text-white overflow-hidden p-0 shadow-2xl flex flex-col transition-all duration-500 max-h-[95vh] ${
          activeTab === TABS.MASIVA ? 'sm:max-w-[1150px]' : 'sm:max-w-[850px]'
      }`}>
        
        {/* OVERLAY DE BLOQUEO / CARGA (PANTALLA DE PROTECCIÓN) */}
        {(isSubmitting || isBulkSubmitting || isFinished) && (
          <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-black/95 backdrop-blur-md">
            {!isFinished ? (
              <div className="flex flex-col items-center gap-6 text-center px-4">
                <div className="relative">
                  <Loader2 className="h-20 w-20 animate-spin text-blue-500" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Building2 size={24} className="text-white animate-pulse" />
                  </div>
                </div>
                <div>
                  <h3 className="text-2xl font-black uppercase italic tracking-widest text-white mb-2">
                    {isBulkSubmitting ? 'Facturando Lote...' : 'Emitiendo al SII...'}
                  </h3>
                  <p className="text-red-400 font-bold uppercase tracking-widest text-xs animate-pulse bg-red-500/10 px-4 py-2 rounded-full border border-red-500/20">
                    ⚠️ SISTEMA BLOQUEADO MIENTRAS SE EMITE. NO CIERRE LA VENTANA.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-6 text-center p-8">
                <CheckCircle2 className="h-24 w-24 text-emerald-500" />
                <div>
                  <h3 className="text-3xl font-black uppercase italic tracking-tighter mb-1">¡Documento Emitido!</h3>
                  <p className="font-mono text-xl text-emerald-400 font-bold">Folio N° {folioGenerado || 'Múltiple'}</p>
                </div>
                <Button onClick={() => setIsOpen(false)} className="bg-blue-600 hover:bg-blue-700 w-full mt-4 rounded-xl font-black uppercase tracking-widest h-14">
                  Finalizar y Volver al CRM
                </Button>
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
                   <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
                      <Building2 className="text-blue-500" size={26} />
                   </div>
                   <div>
                      <DialogTitle className="text-2xl font-black italic uppercase tracking-tighter leading-none">{DOC_CONFIG.title}</DialogTitle>
                      <DialogDescription className="text-gray-500 text-[10px] uppercase font-bold tracking-[0.2em] mt-1">{DOC_CONFIG.code} • {DOC_CONFIG.description}</DialogDescription>
                   </div>
                </div>
              </div>
            </DialogHeader>

            {/* BOTONES INTERRUPTORES */}
            <div className="flex bg-black/50 p-1.5 rounded-2xl border border-white/10 mb-8 flex-shrink-0">
                <button onClick={() => setActiveTab(TABS.UNICA)} className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === TABS.UNICA ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>Factura Única</button>
                <button onClick={() => setActiveTab(TABS.MASIVA)} className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === TABS.MASIVA ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}><FileText size={14} /> Factura Masiva (CSV / Manual)</button>
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
              
              {/* ================================================= */}
              {/* PESTAÑA: FACTURA ÚNICA */}
              {/* ================================================= */}
              {activeTab === TABS.UNICA && (
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 animate-in fade-in duration-300">
                  <div className="space-y-6 pb-4">
                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 shadow-inner relative">
                      <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Search size={14} /> {selectedCompany ? 'Cliente Seleccionado' : 'Buscador de Clientes Búnker'}
                      </h4>

                      {!selectedCompany && (
                        <div className="mb-6 relative">
                          <div className="relative">
                            <Search className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors z-10 ${empresaEncontrada ? 'text-emerald-500' : 'text-gray-500'}`} size={18} />
                            <Input 
                              placeholder="Nombre de Empresa o RUT..."
                              value={searchTerm}
                              onChange={handleSearchChange}
                              onFocus={() => setShowSuggestions(true)}
                              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                              className="pl-12 h-12 bg-black/40 border-white/10 rounded-xl text-sm focus:border-blue-500 shadow-xl transition-all"
                            />
                          </div>

                          {showSuggestions && (
                            <div className="absolute top-full left-0 w-full mt-2 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-[60] animate-in fade-in slide-in-from-top-2">
                              {filteredSuggestions.map((c, i) => (
                                <div key={i} onMouseDown={() => onSelectCliente(c)} className="px-5 py-3 cursor-pointer hover:bg-blue-600/20 border-b border-white/5 flex justify-between items-center group transition-colors">
                                  <div>
                                    <div className="text-sm font-bold text-white">{cleanStr(c.razon_social || c.razonSocial)}</div>
                                    <div className="text-[10px] text-gray-500 font-mono mt-0.5 tracking-widest">{formatRutSimple(c.rut_encrypted || c.rut)}</div>
                                  </div>
                                  <CheckCircle2 size={16} className="text-blue-500 opacity-0 group-hover:opacity-100 transition-all" />
                                </div>
                              ))}
                              {searchTerm.length >= 3 && (
                                <button type="button" onMouseDown={handleForzarEmpresa} className="w-full p-4 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-500 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 border-t border-white/5 transition-all">
                                  <UserPlus size={16} /> Registrar Empresa Externa
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4 bg-black/30 rounded-xl border border-white/5">
                        <div>
                          <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest mb-1">Razón Social</p>
                          <p className={`text-sm font-black truncate ${empresaEfectiva ? 'text-white' : 'text-gray-700'}`}>{razonSocialSegura}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest mb-1">RUT Receptor</p>
                          <p className={`text-sm font-mono font-bold ${empresaEfectiva ? 'text-blue-400' : 'text-gray-700'}`}>{item.rutFacturar || '---'}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest flex items-center gap-1 mb-1">
                            <Mail size={10} /> Correo Receptor
                          </p>
                          {isExternal ? (
                            <Input 
                              placeholder="email@..."
                              value={item.contactoReceptor}
                              onChange={(e) => setItem({...item, contactoReceptor: e.target.value})}
                              className="h-8 bg-blue-500/10 border-blue-500/30 text-xs rounded-lg focus:border-blue-500 text-blue-300 placeholder:text-blue-500/40"
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
                          <Input value={cleanStr(item.name)} onChange={(e) => setItem({...item, name: e.target.value})} className="pl-11 h-12 bg-black/40 border-white/10 rounded-xl uppercase" placeholder="EJ: PLAN CONTABLE" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Valor Neto ($)</Label>
                        <div className="relative">
                          <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                          <Input type="number" value={item.precio} onChange={(e) => setItem({...item, precio: e.target.value})} className="pl-11 h-12 bg-black/40 border-white/10 rounded-xl font-mono text-lg font-bold text-emerald-500" placeholder="0"/>
                        </div>
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Observaciones / Mes</Label>
                        <Input value={cleanStr(item.descripcionProducto)} onChange={(e) => setItem({ ...item, descripcionProducto: e.target.value })} className="h-12 bg-black/40 border-white/10 rounded-xl uppercase" placeholder="EJ: SERVICIOS CORRESPONDIENTES A..." />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ================================================= */}
              {/* PESTAÑA: FACTURA MASIVA (GRILLA ESTILO ERP) */}
              {/* ================================================= */}
              {activeTab === TABS.MASIVA && (
                <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in duration-300">
                  
                  <div className="flex gap-4 mb-4 flex-shrink-0">
                    <div className="flex-1 bg-blue-900/10 border border-blue-500/30 rounded-xl p-4 flex flex-col items-center justify-center border-dashed cursor-pointer hover:bg-blue-900/20 transition-all" onClick={() => fileInputRef.current?.click()}>
                      <UploadCloud size={24} className="text-blue-400 mb-2" />
                      <span className="text-xs font-bold text-white uppercase tracking-widest">Subir Excel / CSV</span>
                      <Input ref={fileInputRef} type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" disabled={isBulkSubmitting}/>
                    </div>

                    <div className="flex-1 bg-emerald-900/10 border border-emerald-500/30 rounded-xl p-4 flex flex-col items-center justify-center border-dashed cursor-pointer hover:bg-emerald-900/20 transition-all" onClick={handleAddManualRow}>
                      <Plus size={24} className="text-emerald-400 mb-2" />
                      <span className="text-xs font-bold text-white uppercase tracking-widest">+ Fila Manual</span>
                    </div>
                  </div>

                  {bulkRows.length > 0 && (
                    <div className="flex-1 flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0a] shadow-2xl">
                      
                      <div className="bg-[#121212] px-6 py-3 border-b border-white/10 flex justify-between items-center flex-shrink-0">
                        <div className="flex gap-6">
                          <span className="text-xs text-gray-400 font-bold uppercase tracking-widest">
                            A Facturar: <span className="text-white">{bulkRows.filter(r => r.estado !== 'omitido').length}</span>
                          </span>
                          <span className="text-xs text-gray-400 font-bold uppercase tracking-widest flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-red-500"></span>
                            Ignoradas ($0): <span className="text-red-400">{bulkRows.filter(r => r.estado === 'omitido').length}</span>
                          </span>
                        </div>
                        <div className="text-sm text-gray-400 font-black uppercase tracking-widest">
                          Proyección Neta: <span className="text-emerald-400 font-mono tracking-tighter text-lg">${bulkRows.filter(r => r.estado !== 'omitido').reduce((acc, curr) => acc + (Number(curr.precio) || 0), 0).toLocaleString('es-CL')}</span>
                        </div>
                      </div>

                      {/* Espacio extra abajo (pb-32) para que el dropdown no se corte */}
                      <div className="flex-1 overflow-auto custom-scrollbar min-h-[250px] pb-32">
                        <table className="w-full text-left whitespace-nowrap border-collapse">
                          <thead className="bg-[#121212] sticky top-0 z-10 border-b border-white/10 shadow-lg">
                            <tr className="text-gray-500 font-black uppercase tracking-widest text-[10px]">
                              <th className="px-6 py-3 w-56 text-blue-400">Buscador de Clientes Búnker</th>
                              <th className="px-4 py-3 min-w-[150px]">Razón Social</th>
                              <th className="px-4 py-3 w-32">RUT Receptor</th>
                              <th className="px-4 py-3 min-w-[150px]">Correo Receptor</th>
                              <th className="px-4 py-3 w-40">Plan / Concepto</th>
                              <th className="px-4 py-3 w-28 text-right">Valor Neto ($)</th>
                              <th className="px-4 py-3 min-w-[180px]">Observaciones / Mes</th>
                              <th className="px-4 py-3 w-24 text-center">Estado</th>
                              <th className="px-2 py-3 w-10"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {bulkRows.map((row, i) => {
                              const formatData = (str) => String(str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
                              const isOmitted = row.estado === 'omitido';

                              return (
                                <tr key={i} className={`transition-colors group ${activeRowIndex === i ? 'bg-blue-900/10 relative z-50' : 'hover:bg-white/[0.04] relative z-0'} ${isOmitted ? 'opacity-40 grayscale' : ''}`}>
                                  
                                  {/* 1. BUSCADOR INTELIGENTE EN CADA FILA */}
                                  <td className={`px-4 py-2 relative ${activeRowIndex === i ? 'z-50' : 'z-0'}`}>
                                    <div className="flex items-center gap-2">
                                      <Search size={14} className={`absolute left-6 transition-colors z-20 ${activeRowIndex === i ? 'text-blue-400' : 'text-gray-500'}`} />
                                      <Input 
                                        value={row.searchQuery !== undefined ? row.searchQuery : row.rut} 
                                        onChange={(e) => handleBulkSearchChange(i, e.target.value)} 
                                        onFocus={() => setActiveRowIndex(i)}
                                        onBlur={() => setTimeout(() => setActiveRowIndex(null), 250)}
                                        className={`h-10 pl-8 bg-black/40 border-white/10 hover:border-white/30 focus:bg-black/80 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 text-xs font-bold rounded-lg shadow-none uppercase transition-all relative z-10 ${activeRowIndex === i ? 'text-blue-300' : 'text-gray-300 font-mono'}`} 
                                        placeholder="BUSCAR..." 
                                        disabled={isBulkSubmitting || row.estado === 'completado' || isOmitted}
                                      />
                                    </div>
                                    
                                    {/* DROPDOWN DESPLEGABLE */}
                                    {activeRowIndex === i && (row.searchQuery || row.rut)?.length >= 2 && !isOmitted && (
                                      <div className="absolute top-[calc(100%-4px)] left-4 w-[350px] bg-[#1a1a1a] border-2 border-blue-500 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.9)] z-[9999] overflow-hidden animate-in fade-in slide-in-from-top-2">
                                        {(() => {
                                           const term = cleanStr(row.searchQuery !== undefined ? row.searchQuery : row.rut);
                                           const termRut = String(row.searchQuery !== undefined ? row.searchQuery : row.rut).replace(/[^0-9kK]/gi, '').toLowerCase();
                                           const matches = allClientes.filter(c => {
                                              const rs = cleanStr(c.razon_social || c.razonSocial || "");
                                              const rutPuro = String(c.rut_encrypted || c.rut || "").replace(/[^0-9kK]/gi, '').toLowerCase();
                                              return rs.includes(term) || (termRut !== "" && rutPuro.includes(termRut));
                                           }).slice(0, 5);

                                           return (
                                             <>
                                               {matches.map((c, idx) => (
                                                 <div key={idx} onMouseDown={() => applyClientToRow(i, c)} className="px-5 py-3 cursor-pointer hover:bg-blue-600/20 border-b border-white/5 flex justify-between items-center group transition-colors">
                                                   <div>
                                                     <div className="text-sm font-bold text-white">{cleanStr(c.razon_social || c.razonSocial)}</div>
                                                     <div className="text-[10px] text-gray-500 font-mono mt-0.5 tracking-widest">{formatRutSimple(c.rut_encrypted || c.rut)}</div>
                                                   </div>
                                                   <CheckCircle2 size={16} className="text-blue-500 opacity-0 group-hover:opacity-100 transition-all" />
                                                 </div>
                                               ))}
                                               
                                               {(term.length >= 3 || termRut.length >= 3) && (
                                                 <button type="button" onMouseDown={() => setRowAsExternal(i, (row.searchQuery || row.rut))} className="w-full p-4 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-500 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 border-t border-white/5 transition-all">
                                                   <UserPlus size={16} /> Registrar Empresa Externa
                                                 </button>
                                               )}
                                             </>
                                           );
                                        })()}
                                      </div>
                                    )}
                                  </td>

                                  {/* 2. RAZÓN SOCIAL */}
                                  <td className="px-4 py-2">
                                    <Input 
                                      value={formatData(row.razonSocial)} 
                                      onChange={(e) => updateBulkRow(i, 'razonSocial', e.target.value)} 
                                      className="h-10 bg-transparent border-transparent hover:border-white/20 focus:bg-black/60 focus:border-blue-500 text-[10px] font-bold text-gray-200 rounded-lg shadow-none uppercase transition-all" 
                                      placeholder="RAZÓN SOCIAL..." 
                                      disabled={isBulkSubmitting || row.estado === 'completado' || isOmitted}
                                    />
                                    {row.id === 'EXTERNO' && <span className="block text-[8px] text-orange-400 font-black tracking-widest ml-3 mt-0.5">⚠️ EXTERNO</span>}
                                  </td>

                                  {/* 3. RUT RECEPTOR */}
                                  <td className="px-4 py-2">
                                    <Input 
                                      value={row.rut} 
                                      onChange={(e) => updateBulkRow(i, 'rut', formatRutSimple(e.target.value))} 
                                      className="w-full min-w-[100px] max-w-[130px] h-10 bg-transparent border-transparent hover:border-white/20 focus:bg-black/60 focus:border-blue-500 text-[11px] font-mono font-bold text-blue-400 rounded-lg shadow-none uppercase transition-all" 
                                      placeholder="RUT..." 
                                      disabled={isBulkSubmitting || row.estado === 'completado' || isOmitted}
                                    />
                                  </td>

                                  {/* 4. CORREO RECEPTOR */}
                                  <td className="px-4 py-2">
                                    <Input 
                                      value={row.contacto} 
                                      onChange={(e) => updateBulkRow(i, 'contacto', e.target.value)} 
                                      className="h-10 bg-transparent border-transparent hover:border-white/20 focus:bg-black/60 focus:border-blue-500 text-[10px] font-medium text-gray-300 rounded-lg shadow-none transition-all" 
                                      placeholder="EMAIL@..." 
                                      disabled={isBulkSubmitting || row.estado === 'completado' || isOmitted}
                                    />
                                  </td>

                                  {/* 5. PLAN / CONCEPTO */}
                                  <td className="px-4 py-2">
                                    <Input 
                                      value={formatData(row.plan)} 
                                      onChange={(e) => updateBulkRow(i, 'plan', e.target.value)} 
                                      className="h-10 bg-transparent border-transparent hover:border-white/20 focus:bg-black/60 focus:border-blue-500 text-[10px] font-bold text-gray-300 rounded-lg shadow-none uppercase transition-all" 
                                      placeholder="CONCEPTO..." 
                                      disabled={isBulkSubmitting || row.estado === 'completado' || isOmitted}
                                    />
                                  </td>

                                  {/* 6. VALOR NETO ($) */}
                                  <td className="px-4 py-2">
                                    <Input 
                                      type="number" 
                                      value={row.precio} 
                                      onChange={(e) => updateBulkRow(i, 'precio', e.target.value)} 
                                      className="h-10 bg-transparent border-transparent hover:border-white/20 focus:bg-black/60 focus:border-blue-500 text-[12px] font-black font-mono text-emerald-400 rounded-lg shadow-none transition-all text-right" 
                                      placeholder="0" 
                                      disabled={isBulkSubmitting || row.estado === 'completado' || isOmitted}
                                    />
                                  </td>

                                  {/* 7. OBSERVACIONES / MES */}
                                  <td className="px-4 py-2">
                                    <Input 
                                      value={formatData(row.observacion)} 
                                      onChange={(e) => updateBulkRow(i, 'observacion', e.target.value)} 
                                      className="h-10 bg-transparent border-transparent hover:border-white/20 focus:bg-black/60 focus:border-blue-500 text-[10px] font-medium text-gray-400 rounded-lg shadow-none uppercase transition-all" 
                                      placeholder="GLOSA FACTURA..." 
                                      disabled={isBulkSubmitting || row.estado === 'completado' || isOmitted}
                                    />
                                  </td>

                                  <td className="px-4 py-2 text-center">
                                    <div className="flex justify-center">
                                      {isOmitted && <span className="px-3 py-1.5 rounded-full bg-gray-500/10 text-gray-500 font-black text-[8px] uppercase border border-gray-500/20 tracking-widest">🚫 Omite ($0)</span>}
                                      {row.estado === "pendiente" && <span className="px-3 py-1.5 rounded-full bg-white/5 text-gray-400 font-black text-[8px] uppercase border border-white/10 tracking-widest">En Fila</span>}
                                      {row.estado === "completado" && <span className="px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 font-black text-[8px] uppercase border border-emerald-500/20 flex items-center gap-1.5"><CheckCircle2 size={10}/> Listo</span>}
                                      {row.estado === "procesando" && <span className="px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-400 font-black text-[8px] uppercase border border-blue-500/20 flex items-center gap-1.5"><Loader2 size={10} className="animate-spin"/> Emite</span>}
                                      {row.estado === "error" && <span className="px-3 py-1.5 rounded-full bg-red-500/10 text-red-400 font-black text-[8px] uppercase border border-red-500/20 flex items-center gap-1.5"><AlertCircle size={10}/> Error</span>}
                                    </div>
                                  </td>

                                  <td className="px-2 py-2 text-center">
                                     {!isBulkSubmitting && (
                                       <button onClick={() => removeBulkRow(i)} className="text-red-500/40 hover:text-red-500 transition-all p-2 hover:bg-red-500/10 rounded-lg" title="Quitar Fila"><X size={16} /></button>
                                     )}
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

          <div className="flex gap-4 pt-6 mt-4 border-t border-white/5 flex-shrink-0 relative z-20">
            <Button type="button" onClick={() => setIsOpen(false)} className="flex-1 bg-white/5 hover:bg-white/10 text-gray-400 uppercase font-black text-[11px] tracking-widest h-12 rounded-xl transition-all">Cerrar</Button>
            
            {activeTab === TABS.UNICA ? (
              <Button onClick={handleSubmitUnica} disabled={!empresaEfectiva || isSubmitting} className="flex-[2] bg-blue-600 hover:bg-blue-500 text-white font-black uppercase text-[11px] tracking-widest h-12 rounded-xl shadow-lg shadow-blue-600/20 transition-all">
                {isSubmitting ? 'Procesando...' : 'Emitir Factura Individual'}
              </Button>
            ) : (
              <Button onClick={handleBulkSubmit} disabled={isBulkSubmitting || bulkRows.filter(r => r.estado === 'pendiente').length === 0} className="flex-[2] bg-blue-600 hover:bg-blue-500 text-white font-black uppercase text-[11px] tracking-widest h-12 rounded-xl shadow-lg shadow-blue-600/20 transition-all">
                {isBulkSubmitting ? 'Procesando Lote...' : `Facturar Todo el Lote (${bulkRows.filter(r => r.estado === 'pendiente').length})`}
              </Button>
            )}
          </div>
          
        </div>
      </DialogContent>
    </Dialog>
  );
}