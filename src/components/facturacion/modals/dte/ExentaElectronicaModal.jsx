import { useEffect, useState, useMemo, useRef } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { 
  Building2, Mail, CreditCard, Loader2, Tag, 
  Search, CheckCircle2, UserPlus, UploadCloud, AlertCircle, FileText, Plus, X,
  ChevronLeft, ChevronRight, Receipt
} from "lucide-react";
import { API_BASE_URL } from "../../../../../config.js";
import { cleanRut } from "@/lib/rut.js";

import { useAuth } from "@/hooks/useAuth.jsx"; 
import { getCrmDataApi } from "@/services/crmService.js";

// --- CONFIGURACIONES ---
const DOC_CONFIG = {
  title: "Factura Exenta Electrónica",
  code: "DTE 34",
  description: "Emisión de servicios sin IVA sincronizada con el SII y registro masivo.",
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

const getCurrentMonth = () => {
  const meses = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
  return meses[new Date().getMonth()];
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
  rutFacturar: "", ciudadReceptor: "Santiago", name: "", cantidad: "1", 
  precio: "", fecha: todayLocalISO(), metodo: "1", ciudadEmisor: "Santiago", 
  telefonoEmisor: "56978278733", contactoReceptor: "", rutSolicita: "", 
  unidadProducto: "1", descuentoPct: "", 
  descripcionProducto: `SERVICIOS CORRESPONDIENTES A ${getCurrentMonth()}`, 
});

// =======================================================
// 🚀 PARSER AVANZADO DE CSV
// =======================================================
const rutRegex = /\d{7,8}-[0-9Kk]/i;
const montoRegex = /\$\s?[\d.,]+/g;

function limpiarMonto(m) {
  if (!m) return 0;
  return Number(m.replace("$", "").replace(/\./g, "").replace(/,/g, ""));
}

function parseLineaAvanzada(linea) {
  const rutMatch = linea.match(rutRegex);
  if (!rutMatch) return null; 
  const rut = rutMatch[0].toUpperCase();

  const correosCrudos = linea.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
  const correo = correosCrudos && correosCrudos.length > 0 ? correosCrudos[0].toLowerCase() : "";

  const montos = linea.match(montoRegex) || [];
  const netoNum = montos.length > 0 ? limpiarMonto(montos[0]) : 0;
  const netoStr = montos.length > 0 ? String(netoNum) : "0";

  let textoPrevio = "";
  if (montos.length > 0) textoPrevio = linea.split(montos[0])[0];
  else textoPrevio = linea.split(rut)[0];

  textoPrevio = textoPrevio.replace(/"/g, "").trim();
  if (textoPrevio.endsWith(',')) textoPrevio = textoPrevio.slice(0, -1);
  if (textoPrevio.endsWith(';')) textoPrevio = textoPrevio.slice(0, -1);

  const partes = textoPrevio.split(/,|;/);
  let plan = "", razonSocial = textoPrevio;
  if (partes.length >= 2) {
    plan = partes.pop().trim(); 
    razonSocial = partes.join(" ").trim(); 
  }

  return { rut, correo, netoNum, netoStr, razonSocial, plan };
}

export default function ExentaElectronicaModal({ isOpen, setIsOpen }) {
  const { selectedCompany, user } = useAuth();

  const [activeTab, setActiveTab] = useState(TABS.UNICA);
  const [item, setItem] = useState(createEmptyItem());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [folioGenerado, setFolioGenerado] = useState(null);

  const [allClientes, setAllClientes] = useState([]); 
  const [searchTerm, setSearchTerm] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [empresaEncontrada, setEmpresaEncontrada] = useState(null);
  const [isLoadingCrm, setIsLoadingCrm] = useState(false);

  const [bulkRows, setBulkRows] = useState([]);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const [activeRowIndex, setActiveRowIndex] = useState(null); 
  const fileInputRef = useRef(null);

  const [currentPage, setCurrentPage] = useState(1);
  const ROWS_PER_PAGE = 6; 
  
  const [progresoRobot, setProgresoRobot] = useState({ activo: false, actual: 0, total: 0, rutActual: "", exitos: 0, errores: 0 });
  const prevExitosRef = useRef(0);

  const empresaEfectiva = selectedCompany || empresaEncontrada;
  const isExternal = empresaEncontrada?.id === 'EXTERNO';
  const razonSocialSegura = empresaEfectiva?.razon_social || empresaEfectiva?.razonSocial || (searchTerm.length > 0 ? 'Buscando...' : '---');

  const totalPages = Math.ceil(bulkRows.length / ROWS_PER_PAGE) || 1;
  const currentRows = useMemo(() => {
    const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
    return bulkRows.slice(startIndex, startIndex + ROWS_PER_PAGE);
  }, [bulkRows, currentPage]);

  const goToNextPage = () => setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  const goToPrevPage = () => setCurrentPage((prev) => Math.max(prev - 1, 1));

  // 🔥 NOTA: Apunta al endpoint de progreso de Exentas en tu servidor
  useEffect(() => {
      let interval;
      if (isOpen && activeTab === TABS.MASIVA) {
          interval = setInterval(async () => {
              try {
                  const res = await fetch(`${API_BASE_URL}/dte/progreso-masivo-exenta`);
                  if (res.ok) {
                      const data = await res.json();
                      setProgresoRobot(data);

                      if (data.activo && data.actual > 0) {
                          const pagDelRobot = Math.ceil(data.actual / ROWS_PER_PAGE);
                          if (pagDelRobot !== currentPage) setCurrentPage(pagDelRobot);
                      }
                  }
              } catch (e) { }
          }, 2000);
      }
      return () => clearInterval(interval);
  }, [isOpen, activeTab, currentPage]);

  useEffect(() => {
    if (progresoRobot.exitos > prevExitosRef.current) {
        toast({
            title: "🎉 ¡Factura Exenta Emitida!",
            description: `El robot generó con éxito la exenta para el RUT: ${progresoRobot.rutActual}.`,
            duration: 5000,
        });
        prevExitosRef.current = progresoRobot.exitos; 
    }

    if (progresoRobot.total > 0 && !progresoRobot.activo && progresoRobot.actual >= progresoRobot.total) {
        toast({
            title: "🏁 PROCESO MASIVO COMPLETADO",
            description: `El robot finalizó. Éxitos: ${progresoRobot.exitos} | Errores: ${progresoRobot.errores}`,
            duration: 10000,
        });
        setIsBulkSubmitting(false); 
        prevExitosRef.current = 0; 
    }
  }, [progresoRobot.exitos, progresoRobot.activo, progresoRobot.total, progresoRobot.actual, progresoRobot.rutActual, progresoRobot.errores]);

  useEffect(() => {
    if (!isOpen) return;
    setIsFinished(false);
    setFolioGenerado(null);
    setEmpresaEncontrada(null); 
    setSearchTerm("");
    setShowSuggestions(false);
    setBulkRows([]);
    setCurrentPage(1); 
    setActiveRowIndex(null);
    setActiveTab(TABS.UNICA);
    setIsBulkSubmitting(false);

    if (!selectedCompany && user?.sessionId) {
      setIsLoadingCrm(true);
      getCrmDataApi(user.sessionId, null).then(res => res.json()).then(payload => {
          if (payload?.clients) setAllClientes(payload.clients);
      }).catch(err => console.error("Error CRM:", err)).finally(() => setIsLoadingCrm(false));
      setItem(createEmptyItem());
    } else if (selectedCompany) {
      const email = String(selectedCompany.email_corporativo || selectedCompany.correo || "").split(/[,;/\s]+/)[0].trim();
      setItem({
        ...createEmptyItem(),
        rutFacturar: formatRutSimple(selectedCompany.rut_encrypted || selectedCompany.rut || ""),
        contactoReceptor: email,
        name: selectedCompany.plan_nombre || selectedCompany.plan || "", 
        precio: selectedCompany.impuesto_pagar || selectedCompany.neto || "",
        descripcionProducto: `SERVICIOS CORRESPONDIENTES A ${getCurrentMonth()}`,
      });
    }
  }, [isOpen, selectedCompany, user]);

  const filteredSuggestions = useMemo(() => {
    if (!searchTerm || String(searchTerm).trim() === "") return [];
    const termStr = cleanStr(searchTerm);
    const termRut = String(searchTerm).replace(/[^0-9kK]/gi, '').toLowerCase();

    return allClientes.filter(c => {
      const rs = cleanStr(c.razon_social || c.razonSocial || "");
      const rutPuro = String(c.rut_encrypted || c.rut || "").replace(/[^0-9kK]/gi, '').toLowerCase();
      return rs.includes(termStr) || (termRut !== "" && rutPuro.includes(termRut));
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
      ...prev, rutFacturar: rut, contactoReceptor: email,
      name: cliente.plan_nombre || cliente.plan || prev.name,
      precio: cliente.impuesto_pagar || cliente.neto || prev.precio,
      descripcionProducto: `SERVICIOS CORRESPONDIENTES A ${getCurrentMonth()}`
    }));
  };

  const handleForzarEmpresa = () => {
    const rutParaAgregar = formatRutSimple(searchTerm);
    if (!rutParaAgregar.includes('-')) return toast({ variant: "destructive", title: "RUT Incompleto", description: "Ingresa el RUT con guion." });
    
    setEmpresaEncontrada({ id: 'EXTERNO', razon_social: 'CLIENTE EXTERNO (NUEVO)', rut: rutParaAgregar });
    setItem(prev => ({ ...prev, rutFacturar: rutParaAgregar, contactoReceptor: "" }));
    setShowSuggestions(false);
    toast({ title: "Modo Externo", description: "Puedes ingresar un correo o emitir directamente." });
  };

  const handleCsvUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lineas = text.replace(/\t/g, ",").replace(/;+/g, ",").split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 5);
      lineas.shift();
      if (lineas.length === 0) return toast({ variant: "destructive", title: "CSV Vacío o Inválido" });

      const rowsData = lineas.map((linea, index) => {
        try {
            const parsed = parseLineaAvanzada(linea);
            if (!parsed) return null;

            const rutLimpio = formatRutSimple(parsed.rut);
            const rutParaBuscar = cleanRut(rutLimpio);

            const crmMatch = allClientes.find(c => {
                try { return cleanRut(c.rut_encrypted || c.rut || "") === rutParaBuscar; } 
                catch (err) { return false; }
            });

            const planFinal = parsed.plan ? parsed.plan : (crmMatch ? (crmMatch.plan_nombre || crmMatch.plan || '') : 'SERVICIOS');
            const correoFinal = parsed.correo ? parsed.correo : (crmMatch ? (crmMatch.email_corporativo || '') : '');
            
            let precioFinal = "";
            if (parsed.netoNum > 0) precioFinal = parsed.netoStr;
            else if (linea.includes("$0")) precioFinal = "0"; 
            else precioFinal = crmMatch ? String(crmMatch.impuesto_pagar || crmMatch.neto || '') : '';

            const razonFinal = parsed.razonSocial.length > 2 ? parsed.razonSocial : (crmMatch ? (crmMatch.razon_social || crmMatch.razonSocial) : 'NUEVO CLIENTE (SII)');
            const estadoFila = Number(precioFinal) > 0 ? 'pendiente' : 'omitir';

            return {
              id: crmMatch ? crmMatch.id : 'EXTERNO',
              index: index,
              rut: rutLimpio,
              razonSocial: razonFinal,
              plan: planFinal,
              precio: precioFinal,
              observacion: `SERVICIOS CORRESPONDIENTES A ${getCurrentMonth()}`,
              contacto: correoFinal,
              estado: estadoFila
            };
        } catch (e) { return null; }
      }).filter(Boolean);

      setBulkRows(rowsData);
      setCurrentPage(1);
      toast({ title: "CSV Procesado Exitosamente", description: `Se importaron ${rowsData.length} filas.` });
    } catch (err) {
      toast({ variant: "destructive", title: "Error Leyendo CSV", description: err.message });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleBulkSearchChange = (absoluteIndex, val) => {
    const newRows = [...bulkRows];
    newRows[absoluteIndex].searchQuery = val;
    if (val.length > 7 && /^[0-9kK\.\-]+$/.test(val)) {
      newRows[absoluteIndex].rut = formatRutSimple(val);
      const rutParaBuscar = cleanRut(val);
      const match = allClientes.find(c => cleanRut(c.rut_encrypted || c.rut || "") === rutParaBuscar);
      if (match) {
        newRows[absoluteIndex].id = match.id;
        newRows[absoluteIndex].razonSocial = match.razon_social || match.razonSocial;
        newRows[absoluteIndex].plan = match.plan_nombre || match.plan || "Servicio Contable";
        newRows[absoluteIndex].precio = match.impuesto_pagar || match.neto || "";
        newRows[absoluteIndex].contacto = (match.email_corporativo || match.correo || "").split(/[,;/\s]+/)[0].trim();
      }
    }
    setBulkRows(newRows);
  };

  const applyClientToRow = (absoluteIndex, cliente) => {
    const newRows = [...bulkRows];
    newRows[absoluteIndex].id = cliente.id;
    newRows[absoluteIndex].rut = formatRutSimple(cliente.rut_encrypted || cliente.rut);
    newRows[absoluteIndex].razonSocial = cliente.razon_social || cliente.razonSocial;
    newRows[absoluteIndex].plan = cliente.plan_nombre || cliente.plan || "Servicios";
    newRows[absoluteIndex].precio = cliente.impuesto_pagar || cliente.neto || "";
    newRows[absoluteIndex].contacto = (cliente.email_corporativo || cliente.correo || "").split(/[,;/\s]+/)[0].trim();
    newRows[absoluteIndex].searchQuery = "";
    setBulkRows(newRows);
    setActiveRowIndex(null);
  };

  const updateBulkRow = (index, field, value) => {
    const newRows = [...bulkRows];
    newRows[index][field] = value;
    setBulkRows(newRows);
  };

  const toggleSkipRow = (absoluteIndex) => {
    const newRows = [...bulkRows];
    newRows[absoluteIndex].estado = newRows[absoluteIndex].estado === 'omitir' ? 'pendiente' : 'omitir';
    setBulkRows(newRows);
  };

  const addEmptyRow = () => {
    setBulkRows([{
      id: 'EXTERNO', index: Date.now(), rut: '', razonSocial: '---', plan: '', precio: '', 
      observacion: `SERVICIOS CORRESPONDIENTES A ${getCurrentMonth()}`, contacto: '', estado: 'pendiente'
    }, ...bulkRows]);
    setCurrentPage(1);
  };

  const formatData = (str) => {
    if (!str) return "";
    return str.length > 20 ? str.slice(0, 18) + '..' : str;
  };

  const handleDetenerMasivo = async () => {
      if (confirm("¿Estás seguro de detener el robot? Cancelará el ciclo activo y las exentas restantes.")) {
          try {
              // 🔥 Asegura que este endpoint lo tengas creado en tu backend (exenta)
              await fetch(`${API_BASE_URL}/dte/detener-robot-exenta`, { method: "POST" });
              toast({ title: "Señal de Aborto Enviada", description: "El robot se detendrá de forma segura." });
              setIsBulkSubmitting(false);
          } catch (e) {}
      }
  };

  const handleBulkSubmit = () => {
    const facturasAProcesar = bulkRows.filter(r => r.estado === 'pendiente' && cleanRut(r.rut).length >= 8 && Number(r.precio) > 0).map(r => {
      const rutLimpio = cleanRut(r.rut);
      const [rutF, dv] = rutLimpio.includes('-') ? rutLimpio.split('-') : [rutLimpio, ''];
      return {
        empresa_id: r.id, rutReceptor: rutF, dvReceptor: dv, ciudadEmisor: 'Santiago',
        telefonoEmisor: '56978278733', ciudadReceptor: 'Santiago', contactoReceptor: r.contacto, razonSocial: r.razonSocial,
        producto: { nombre: r.plan || 'Servicio', cantidad: '1', unidad: '1', precio: String(r.precio).replace(/[^0-9]/g, ''), descripcion: r.observacion }
      };
    });

    if (facturasAProcesar.length === 0) return toast({ variant: "destructive", title: "Sin datos", description: "No hay filas válidas para procesar." });

    setIsBulkSubmitting(true);
    toast({ title: "🚀 Robot Exento Iniciado", description: `Procesando ${facturasAProcesar.length} exentas. No cierres la ventana.`, duration: 8000 });
    
    setBulkRows(prev => prev.map(r => r.estado === 'pendiente' ? { ...r, estado: "procesando" } : r));
    
    // 🔥 Endpoint para emitir Exentas en lote
    fetch(`${API_BASE_URL}/dte/emitir-masivo-exenta`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ facturas: facturasAProcesar }),
    }).catch(err => { console.error("Error al enviar lote:", err); setIsBulkSubmitting(false); });
  };

  const handleSubmitUnica = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!empresaEfectiva) return toast({ variant: "destructive", title: "Falta Cliente", description: "Busca o registra una empresa." });
    
    setIsSubmitting(true);
    try {
      const rutLimpio = cleanRut(item.rutFacturar);
      const [rutFull, dv] = rutLimpio.includes('-') ? rutLimpio.split('-') : [rutLimpio, ''];
      const payload = {
        empresa_id: empresaEfectiva.id, razonSocial: razonSocialSegura, rutReceptor: rutFull, dvReceptor: dv,
        ciudadEmisor: 'Santiago', telefonoEmisor: '56978278733', ciudadReceptor: item.ciudadReceptor,
        contactoReceptor: item.contactoReceptor,
        producto: { nombre: item.name, cantidad: '1', unidad: '1', precio: String(item.precio).replace(/[^0-9]/g, ''), descripcion: item.descripcionProducto }
      };
      
      // 🔥 Endpoint individual exenta
      const res = await fetch(`${API_BASE_URL}/dte/emitir-exenta-manual`, {
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

  return (
    <Dialog open={isOpen} onOpenChange={(val) => !isSubmitting && setIsOpen(val)}>
      <DialogContent className="sm:max-w-[800px] bg-slate-50 border-[#efe8dd] text-slate-700 overflow-visible p-0 shadow-2xl">
        
        {(isSubmitting || isFinished) && (
          <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-zinc-950/95 backdrop-blur-md rounded-lg">
            {isSubmitting ? (
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <Loader2 className="h-16 w-16 animate-spin text-emerald-500 opacity-20" />
                  <Loader2 className="h-16 w-16 animate-spin text-emerald-500 absolute top-0 left-0" style={{ animationDirection: 'reverse', animationDuration: '3s' }} />
                  <Receipt className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-emerald-600 h-6 w-6 animate-pulse" />
                </div>
                <div className="text-center">
                  <h3 className="text-xl font-black uppercase tracking-widest animate-pulse text-emerald-600">INYECTANDO EXENTA...</h3>
                  <p className="text-sm text-slate-500 font-mono mt-1">Conectando con el SII a través de Puppeteer</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-6 text-center p-8">
                <CheckCircle2 className="h-24 w-24 text-emerald-500" />
                <div>
                  <h3 className="text-3xl font-black uppercase italic tracking-tighter mb-1">¡Proceso Finalizado!</h3>
                  <p className="font-mono text-xl text-emerald-600 font-bold">Folio N° {folioGenerado}</p>
                </div>
                <Button onClick={() => setIsOpen(false)} className="bg-emerald-600 hover:bg-emerald-700 w-full mt-4 rounded-xl font-black uppercase tracking-widest h-14">
                  Volver al CRM
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="py-6 px-8 flex flex-col h-full overflow-hidden">
          <div className="flex-shrink-0">
            <DialogHeader className="mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                    <Receipt className="text-emerald-500" size={26} />
                  </div>
                  <div>
                    <DialogTitle className="text-2xl font-black italic uppercase tracking-tighter leading-none">{DOC_CONFIG.title}</DialogTitle>
                    <DialogDescription className="text-slate-400 text-[10px] uppercase font-bold tracking-[0.2em] mt-1">{DOC_CONFIG.code} • {DOC_CONFIG.description}</DialogDescription>
                  </div>
                </div>
              </div>
            </DialogHeader>

            <div className="flex bg-slate-50 p-1 rounded-xl border border-[#efe8dd] mb-4">
              <button onClick={() => !isSubmitting && setActiveTab(TABS.UNICA)} disabled={isBulkSubmitting} className={`flex-1 py-2.5 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === TABS.UNICA ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'text-slate-500 hover:text-slate-900'}`}> Individual </button>
              <button onClick={() => !isSubmitting && setActiveTab(TABS.MASIVA)} disabled={isSubmitting && !isBulkSubmitting} className={`flex-1 py-2.5 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === TABS.MASIVA ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'text-slate-500 hover:text-slate-900'}`}> Masiva (CSV) </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar pb-4 pr-2 space-y-5">
            {activeTab === TABS.UNICA && (
              <>
                <div className="space-y-4">
                  <div className="relative z-50">
                    <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-2 block">Buscador Inteligente</Label>
                    <div className="relative flex items-center">
                      <Search className="absolute left-4 text-emerald-500" size={18} />
                      <Input value={searchTerm} onChange={handleSearchChange} placeholder="Escribe el RUT o Nombre de la empresa..." className="h-14 pl-12 bg-slate-50 border-emerald-500/30 text-slate-700 placeholder:text-slate-400 text-lg rounded-xl focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)] transition-all" />
                      {isLoadingCrm && <Loader2 className="absolute right-4 animate-spin text-slate-400" size={18} />}
                    </div>

                    {showSuggestions && searchTerm.length >= 2 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-slate-50 border border-[#efe8dd] rounded-xl shadow-2xl overflow-hidden z-50">
                        {filteredSuggestions.map((c, i) => (
                          <div key={i} onClick={() => onSelectCliente(c)} className="p-4 hover:bg-slate-100 cursor-pointer border-b border-[#efe8dd] flex justify-between items-center group transition-all">
                            <div>
                              <div className="font-bold text-sm text-slate-700 group-hover:text-emerald-600 transition-colors">{c.razon_social || c.razonSocial}</div>
                              <div className="text-xs text-slate-400 font-mono mt-1 tracking-widest">{formatRutSimple(c.rut_encrypted || c.rut)}</div>
                            </div>
                            <CheckCircle2 size={16} className="text-emerald-500 opacity-0 group-hover:opacity-100 transition-all" />
                          </div>
                        ))}
                        {searchTerm.length >= 3 && (
                          <button type="button" onMouseDown={handleForzarEmpresa} className="w-full p-4 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-500 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 border-t border-[#efe8dd] transition-all">
                            <UserPlus size={16} /> Registrar Empresa Externa
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4 bg-slate-50 rounded-xl border border-[#efe8dd]">
                    <div>
                      <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">Razón Social</p>
                      <p className={`text-sm font-black truncate ${empresaEfectiva ? 'text-slate-700' : 'text-slate-600'}`}>{razonSocialSegura}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">RUT Receptor</p>
                      <p className={`text-sm font-mono font-bold ${empresaEfectiva ? 'text-emerald-600' : 'text-slate-600'}`}>{item.rutFacturar || '---'}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-1 mb-1"><Mail size={10} /> Correo Receptor</p>
                      {isExternal ? (
                        <Input placeholder="email@..." value={item.contactoReceptor} onChange={(e) => setItem({...item, contactoReceptor: e.target.value})} className="h-8 text-xs bg-slate-50 border-[#efe8dd]" />
                      ) : (
                        <p className={`text-sm font-medium truncate ${empresaEfectiva ? 'text-slate-600' : 'text-slate-600'}`}>{item.contactoReceptor || '---'}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
                  <div className="md:col-span-1 space-y-2">
                    <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Plan / Servicio</Label>
                    <Input value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} className="h-12 bg-slate-50 border-[#efe8dd] rounded-xl font-bold" />
                  </div>
                  <div className="md:col-span-1 space-y-2">
                    <Label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest ml-1">Monto Exento</Label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 font-bold">$</span>
                      <Input type="number" value={item.precio} onChange={(e) => setItem({...item, precio: e.target.value})} className="pl-11 h-12 bg-slate-50 border-[#efe8dd] rounded-xl font-mono text-lg font-bold text-emerald-500" />
                    </div>
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Observaciones / Mes</Label>
                    <Input value={item.descripcionProducto} onChange={(e) => setItem({ ...item, descripcionProducto: e.target.value })} className="h-12 bg-slate-50 border-[#efe8dd] rounded-xl" placeholder="Ej: Servicios correspondientes a..." />
                  </div>
                </div>
              </>
            )}

            {activeTab === TABS.MASIVA && (
              <div className="flex flex-col h-full space-y-4">
                {progresoRobot.activo && (
                  <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Loader2 className="animate-spin text-emerald-600" size={24}/>
                      <div>
                        <h4 className="text-emerald-600 font-black tracking-widest text-xs">EMITIENDO EXENTAS...</h4>
                        <p className="text-[10px] text-slate-500 uppercase mt-0.5">RUT: <span className="text-slate-700">{progresoRobot.rutActual || "Cargando..."}</span></p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-2xl font-black text-slate-900 italic tracking-tighter leading-none">{progresoRobot.actual} / {progresoRobot.total}</p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                          Éxitos: <span className="text-emerald-600">{progresoRobot.exitos}</span> | Errores: <span className="text-red-500">{progresoRobot.errores}</span>
                        </p>
                      </div>
                      <Button onClick={handleDetenerMasivo} variant="destructive" className="h-10 px-4 rounded-xl font-black uppercase tracking-widest shadow-lg shadow-red-500/20 hover:bg-red-600 transition-all text-xs">
                        <X size={16} className="mr-1" /> Detener
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex gap-4 mb-3 flex-shrink-0">
                  <div className="flex-1 bg-emerald-900/10 border border-emerald-500/30 rounded-xl p-3 flex flex-col items-center justify-center border-dashed cursor-pointer hover:bg-emerald-900/20 transition-all" onClick={() => fileInputRef.current?.click()}>
                    <UploadCloud size={20} className="text-emerald-600 mb-1" />
                    <span className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">Subir Excel / CSV</span>
                    <Input ref={fileInputRef} type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" disabled={isBulkSubmitting}/>
                  </div>
                  <div className="flex-1 bg-slate-50/50 border border-[#efe8dd] rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 transition-all" onClick={addEmptyRow}>
                    <Plus size={20} className="text-slate-500 mb-1" />
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Añadir Fila Manual</span>
                  </div>
                </div>

                {bulkRows.length > 0 && (
                  <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 rounded-xl border border-[#efe8dd] relative">
                    <div className="overflow-x-auto flex-1 custom-scrollbar pb-16">
                      <table className="w-full text-left min-w-[800px]">
                        <thead className="bg-slate-50 border-b border-[#efe8dd]">
                          <tr>
                            <th className="px-4 py-3 text-[10px] font-black text-emerald-500 uppercase tracking-widest whitespace-nowrap"><Search size={10} className="inline mr-1"/> CRM</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">RUT / Cliente</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Correo</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Concepto</th>
                            <th className="px-4 py-3 text-[10px] font-black text-emerald-600 uppercase tracking-widest whitespace-nowrap text-right">Exento</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center whitespace-nowrap">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 relative">
                          {currentRows.map((row, index) => {
                            const absoluteIndex = (currentPage - 1) * ROWS_PER_PAGE + index;
                            const isOmitted = row.estado === 'omitir';
                            return (
                              <tr key={row.index || absoluteIndex} className={`group transition-all ${activeRowIndex === absoluteIndex ? 'bg-slate-50 z-50 relative' : 'hover:bg-slate-50 z-0 relative'} ${isOmitted ? 'opacity-40 grayscale' : ''}`}>
                                <td className={`px-4 py-1.5 relative ${activeRowIndex === absoluteIndex ? 'z-50' : 'z-0'}`}>
                                  <div className="flex items-center gap-2">
                                    <Search size={12} className={`absolute left-6 transition-colors z-20 ${activeRowIndex === absoluteIndex ? 'text-emerald-600' : 'text-slate-400'}`} />
                                    <Input value={row.searchQuery !== undefined ? row.searchQuery : row.rut} onChange={(e) => handleBulkSearchChange(absoluteIndex, e.target.value)} onFocus={() => setActiveRowIndex(absoluteIndex)} onBlur={() => setTimeout(() => setActiveRowIndex(null), 250)} className={`h-9 pl-7 bg-slate-50 border-[#efe8dd] hover:border-[#e5ddd0] focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 text-[10px] font-bold rounded-lg shadow-none uppercase transition-all relative z-10 ${activeRowIndex === absoluteIndex ? 'text-emerald-700' : 'text-slate-600 font-mono'}`} placeholder="BUSCAR..." disabled={isBulkSubmitting || row.estado === 'completado' || isOmitted} />
                                  </div>
                                  {activeRowIndex === absoluteIndex && (row.searchQuery || row.rut)?.length >= 2 && !isOmitted && (
                                    <div className="absolute top-[calc(100%+4px)] left-4 w-[300px] bg-slate-100 border border-emerald-500/30 rounded-lg shadow-2xl overflow-hidden z-[999]">
                                      {allClientes.filter(c => cleanStr(c.razon_social||c.razonSocial).includes(cleanStr(row.searchQuery||row.rut)) || cleanRut(c.rut_encrypted||c.rut).includes(cleanRut(row.searchQuery||row.rut))).slice(0, 4).map((c, i) => (
                                        <div key={i} onMouseDown={() => applyClientToRow(absoluteIndex, c)} className="px-4 py-2.5 hover:bg-emerald-500/20 cursor-pointer border-b border-[#efe8dd] text-left group/item flex flex-col">
                                          <span className="font-bold text-xs text-slate-900 uppercase group-hover/item:text-emerald-600">{formatData(c.razon_social||c.razonSocial)}</span>
                                          <span className="text-[10px] font-mono text-emerald-500/70">{formatRutSimple(c.rut_encrypted||c.rut)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-1.5"><Input value={row.rut} readOnly className="h-9 bg-transparent border-transparent text-[10px] font-mono font-bold text-emerald-600 rounded-lg shadow-none uppercase transition-all" /></td>
                                <td className="px-3 py-1.5"><Input value={row.contacto} onChange={(e) => updateBulkRow(absoluteIndex, 'contacto', e.target.value)} className="h-9 bg-transparent border-transparent hover:border-[#efe8dd] focus:bg-slate-50 focus:border-emerald-500 text-[9px] font-medium text-slate-600 rounded-lg" placeholder="EMAIL@..." disabled={isBulkSubmitting || row.estado === 'completado' || isOmitted} /></td>
                                <td className="px-3 py-1.5"><Input value={formatData(row.plan)} onChange={(e) => updateBulkRow(absoluteIndex, 'plan', e.target.value)} className="h-9 bg-transparent border-transparent hover:border-[#efe8dd] focus:bg-slate-50 focus:border-emerald-500 text-[9px] font-bold text-slate-600 rounded-lg" placeholder="CONCEPTO" disabled={isBulkSubmitting || row.estado === 'completado' || isOmitted} /></td>
                                <td className="px-3 py-1.5 text-right"><Input value={row.precio} onChange={(e) => updateBulkRow(absoluteIndex, 'precio', e.target.value)} className="h-9 w-20 ml-auto bg-transparent border-transparent hover:border-[#efe8dd] focus:bg-slate-50 focus:border-emerald-500 text-[11px] font-mono font-bold text-emerald-600 text-right rounded-lg" placeholder="0" disabled={isBulkSubmitting || row.estado === 'completado' || isOmitted} /></td>
                                <td className="px-4 py-1.5 text-center">
                                  {row.estado === 'completado' ? <CheckCircle2 className="text-emerald-500 inline" size={18} /> : row.estado === 'procesando' ? <Loader2 className="animate-spin text-blue-600 inline" size={18} /> : <button onClick={() => toggleSkipRow(absoluteIndex)} disabled={isBulkSubmitting} className={`p-1.5 rounded-md transition-all ${isOmitted ? 'bg-gray-500/20 text-slate-400 hover:text-slate-900' : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'}`} title={isOmitted ? "Activar" : "Omitir"}><X size={14} className={isOmitted ? 'rotate-45 transition-transform' : 'transition-transform'} /></button>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 h-14 bg-zinc-950/90 border-t border-[#efe8dd] flex items-center justify-between px-4 z-40">
                      <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">
                        Total Filas: <span className="text-slate-700">{bulkRows.length}</span> | Activas: <span className="text-emerald-600">{bulkRows.filter(r => r.estado === 'pendiente').length}</span>
                      </span>
                      {totalPages > 1 && (
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={goToPrevPage} disabled={currentPage === 1 || isBulkSubmitting} className="bg-slate-50 border-[#efe8dd] text-slate-700 hover:bg-slate-100 h-7 text-[10px] px-3"><ChevronLeft size={14} className="mr-1"/> Ant</Button>
                          <span className="text-[10px] font-mono text-slate-500">Pág {currentPage} de {totalPages}</span>
                          <Button variant="outline" size="sm" onClick={goToNextPage} disabled={currentPage === totalPages || isBulkSubmitting} className="bg-slate-50 border-[#efe8dd] text-slate-700 hover:bg-slate-100 h-7 text-[10px] px-3">Sig <ChevronRight size={14} className="ml-1"/></Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-4 pt-4 mt-2 border-t border-[#efe8dd] flex-shrink-0 relative z-20">
            <Button type="button" onClick={() => setIsOpen(false)} className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-500 uppercase font-black text-[11px] tracking-widest h-10 rounded-xl transition-all">Cerrar</Button>
            {activeTab === TABS.UNICA ? (
              <Button onClick={handleSubmitUnica} disabled={!empresaEfectiva || isSubmitting} className="flex-[2] bg-emerald-600 hover:bg-emerald-500 text-slate-900 font-black uppercase text-[11px] tracking-widest h-10 rounded-xl shadow-lg shadow-emerald-600/20 transition-all">
                {isSubmitting ? 'Procesando...' : 'Emitir Exenta Individual'}
              </Button>
            ) : (
              <Button onClick={handleBulkSubmit} disabled={isBulkSubmitting || bulkRows.filter(r => r.estado === 'pendiente').length === 0} className="flex-[2] bg-emerald-600 hover:bg-emerald-500 text-slate-900 font-black uppercase text-[11px] tracking-widest h-10 rounded-xl shadow-lg shadow-emerald-600/20 transition-all">
                {isBulkSubmitting ? 'Emitiendo en Lote...' : 'Iniciar Motor Masivo'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}