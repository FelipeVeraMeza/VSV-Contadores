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
  Search, CheckCircle2, UserPlus, UploadCloud, AlertCircle, FileText, Plus, X,
  ChevronLeft, ChevronRight
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
  if (montos.length > 0) {
    textoPrevio = linea.split(montos[0])[0];
  } else {
    textoPrevio = linea.split(rut)[0];
  }

  textoPrevio = textoPrevio.replace(/"/g, "").trim();
  if (textoPrevio.endsWith(',')) textoPrevio = textoPrevio.slice(0, -1);
  if (textoPrevio.endsWith(';')) textoPrevio = textoPrevio.slice(0, -1);

  const partes = textoPrevio.split(/,|;/);
  let plan = "";
  let razonSocial = textoPrevio;

  if (partes.length >= 2) {
    plan = partes.pop().trim(); 
    razonSocial = partes.join(" ").trim(); 
  }

  return { rut, correo, netoNum, netoStr, razonSocial, plan };
}

export default function FacturaElectronicaModal({ isOpen, setIsOpen }) {
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

  // 🔥 ESTADOS PARA LA PAGINACIÓN
  const [currentPage, setCurrentPage] = useState(1);
  const ROWS_PER_PAGE = 6; 
  
  // 🌟 ESTADOS DEL RASTREADOR DE PROGRESO
  const [progresoRobot, setProgresoRobot] = useState({ activo: false, actual: 0, total: 0, rutActual: "", exitos: 0, errores: 0 });
  const prevExitosRef = useRef(0);

  const empresaEfectiva = selectedCompany || empresaEncontrada;
  const isExternal = empresaEncontrada?.id === 'EXTERNO';
  const razonSocialSegura = empresaEfectiva?.razon_social || empresaEfectiva?.razonSocial || (searchTerm.length > 0 ? 'Buscando...' : '---');

  // ====================================================
  // 🔥 LÓGICA DE PAGINACIÓN DE LA TABLA
  // ====================================================
  const totalPages = Math.ceil(bulkRows.length / ROWS_PER_PAGE) || 1;
  
  const currentRows = useMemo(() => {
    const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
    return bulkRows.slice(startIndex, startIndex + ROWS_PER_PAGE);
  }, [bulkRows, currentPage]);

  const goToNextPage = () => setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  const goToPrevPage = () => setCurrentPage((prev) => Math.max(prev - 1, 1));

  // ====================================================
  // 🌟 ESCUCHADOR DE PROGRESO EN VIVO
  // ====================================================
  useEffect(() => {
      let interval;
      if (isOpen && activeTab === TABS.MASIVA) {
          interval = setInterval(async () => {
              try {
                  const res = await fetch(`${API_BASE_URL}/dte/progreso-masivo`);
                  if (res.ok) {
                      const data = await res.json();
                      setProgresoRobot(data);

                      if (data.activo && data.actual > 0) {
                          const pagDelRobot = Math.ceil(data.actual / ROWS_PER_PAGE);
                          if (pagDelRobot !== currentPage) {
                              setCurrentPage(pagDelRobot);
                          }
                      }
                  }
              } catch (e) { }
          }, 2000);
      }
      return () => clearInterval(interval);
  }, [isOpen, activeTab, currentPage]);

  // ====================================================
  // 🌟 GATILLADOR DE TOASTS DE ÉXITO EN VIVO
  // ====================================================
  useEffect(() => {
    if (progresoRobot.exitos > prevExitosRef.current) {
        toast({
            title: "🎉 ¡Factura Emitida!",
            description: `El robot generó con éxito la factura para el RUT: ${progresoRobot.rutActual}.`,
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

  // CARGA INICIAL
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
      ...prev,
      rutFacturar: rut,
      contactoReceptor: email,
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
    toast({ title: "Modo Externo", description: "Puedes ingresar un correo (opcional) o emitir directamente." });
  };

  const handleCsvUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lineas = text
        .replace(/\t/g, ",")
        .replace(/;+/g, ",")
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l.length > 5);

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
            if (parsed.netoNum > 0) {
                precioFinal = parsed.netoStr;
            } else if (linea.includes("$0")) {
                precioFinal = "0"; 
            } else {
                precioFinal = crmMatch ? String(crmMatch.impuesto_pagar || crmMatch.neto || '') : '';
            }

            const razonFinal = parsed.razonSocial.length > 2 ? parsed.razonSocial : (crmMatch ? (crmMatch.razon_social || crmMatch.razonSocial) : 'NUEVO CLIENTE (SII)');
            const estadoFila = Number(precioFinal) > 0 ? 'pendiente' : 'omitido';

            return {
              id: crmMatch ? crmMatch.id : 'EXTERNO',
              searchQuery: rutLimpio, 
              rut: rutLimpio,
              razonSocial: razonFinal,
              plan: planFinal,
              precio: precioFinal === "0" ? "" : precioFinal, 
              observacion: `SERVICIOS CORRESPONDIENTES A ${getCurrentMonth()}`,
              contacto: correoFinal,
              estado: estadoFila
            };
        } catch (innerError) {
            return null; 
        }
      }).filter(Boolean);

      const filasValidas = rowsData.filter(r => r.rut);
      filasValidas.sort((a, b) => (a.estado === 'omitido' ? 1 : -1));

      setBulkRows(prev => [...prev, ...filasValidas]);
      setCurrentPage(1); 
      
      const facturables = filasValidas.filter(r => r.estado === 'pendiente').length;
      const omitidos = filasValidas.filter(r => r.estado === 'omitido').length;

      toast({ 
          title: "Planilla Procesada", 
          description: `Se detectaron ${facturables} a facturar y ${omitidos} en $0 (Omitidos).` 
      });

    } catch (err) {
      toast({ variant: "destructive", title: "Error leyendo archivo", description: "El archivo tiene caracteres corruptos." });
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
      observacion: `SERVICIOS CORRESPONDIENTES A ${getCurrentMonth()}`,
      contacto: '',
      estado: 'pendiente'
    }, ...bulkRows]);
    setCurrentPage(1); 
  };

  const handleBulkSearchChange = (absoluteIndex, val) => {
    const newRows = [...bulkRows];
    newRows[absoluteIndex].searchQuery = val;
    
    if (val.length > 7 && /^[0-9kK.\-]+$/.test(val)) {
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
    const rutLimpio = formatRutSimple(cliente.rut_encrypted || cliente.rut);
    newRows[absoluteIndex].id = cliente.id;
    newRows[absoluteIndex].rut = rutLimpio;
    newRows[absoluteIndex].searchQuery = rutLimpio;
    newRows[absoluteIndex].razonSocial = cliente.razon_social || cliente.razonSocial;
    newRows[absoluteIndex].plan = cliente.plan_nombre || cliente.plan || newRows[absoluteIndex].plan;
    newRows[absoluteIndex].precio = cliente.impuesto_pagar || cliente.neto || newRows[absoluteIndex].precio;
    newRows[absoluteIndex].contacto = (cliente.email_corporativo || '').split(/[,;/\s]+/)[0].trim();
    setBulkRows(newRows);
    setActiveRowIndex(null);
  };

  const setRowAsExternal = (absoluteIndex, val) => {
    const newRows = [...bulkRows];
    const rutLimpio = formatRutSimple(val);
    newRows[absoluteIndex].id = 'EXTERNO';
    newRows[absoluteIndex].rut = rutLimpio;
    newRows[absoluteIndex].searchQuery = rutLimpio;
    newRows[absoluteIndex].razonSocial = 'CLIENTE EXTERNO (NUEVO)';
    setBulkRows(newRows);
    setActiveRowIndex(null);
  };

  const updateBulkRow = (absoluteIndex, field, value) => {
    const newRows = [...bulkRows];
    newRows[absoluteIndex][field] = value;
    setBulkRows(newRows);
  };

  const removeBulkRow = (absoluteIndex) => {
    setBulkRows(bulkRows.filter((_, i) => i !== absoluteIndex));
  };

  const handleDetenerMasivo = async () => {
    try {
      await fetch(`${API_BASE_URL}/dte/detener-masivo`, { method: "POST" });
      toast({ 
        title: "🛑 Deteniendo Robot", 
        description: "El robot abortará de forma segura apenas termine su paso actual.",
        variant: "destructive"
      });
      setIsBulkSubmitting(false); 
      setBulkRows(prev => prev.map(r => r.estado === 'procesando' ? { ...r, estado: "pendiente" } : r));
      setProgresoRobot(prev => ({ ...prev, activo: false }));
    } catch (err) {
      console.error("Error al detener el robot:", err);
    }
  };

  // ======================================================================
  // 🔥 FUNCIONES DE EMISIÓN CON EL CIERRE DE MODAL HABILITADO
  // ======================================================================

  const handleBulkSubmit = async () => {
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
      return toast({ variant: "destructive", title: "Sin datos", description: "No hay filas válidas para procesar." });
    }

    setIsBulkSubmitting(true);

    toast({ 
      title: "🚀 Robot Iniciado en Segundo Plano", 
      description: `Procesando ${facturasAProcesar.length} facturas. No cierres esta ventana para ver el progreso.`,
      duration: 8000
    });

    setBulkRows(prev => prev.map(r => r.estado === 'pendiente' ? { ...r, estado: "procesando" } : r));

    fetch(`${API_BASE_URL}/dte/emitir-masivo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ facturas: facturasAProcesar }),
    }).catch(err => {
        console.error("Error al enviar lote al servidor:", err);
        setIsBulkSubmitting(false);
    });
  };

  const handleSubmitUnica = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!empresaEfectiva) return toast({ variant: "destructive", title: "Falta Cliente", description: "Busca o registra una empresa." });
    
    if (item.contactoReceptor && !item.contactoReceptor.includes('@')) {
        return toast({ variant: "destructive", title: "Correo Inválido", description: "Si ingresas un correo, debe tener formato válido." });
    }

    setIsSubmitting(true);
    toast({ title: "🚀 Iniciando Robot", description: "Conectando con el SII para emitir factura..." });

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
      setIsOpen(false); // Cierra automáticamente al terminar con éxito
      
      toast({ 
        title: "✅ Factura Emitida", 
        description: `Folio #${data.folio || data.numeroDocumento} generado correctamente.`,
        className: "bg-emerald-600 text-white" 
      });

    } catch (err) {
      toast({ variant: "destructive", title: "Fallo de Emisión", description: err.message });
    } finally {
      setIsSubmitting(false); // Libera el estado de carga del botón
    }
  };

  // ======================================================================
  // RENDERIZADO
  // ======================================================================
  return (
    // ELIMINAMOS LA CONDICIÓN QUE BLOQUEABA EL CIERRE DEL MODAL
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className={`w-full bg-[#0a0a0a] border-white/10 text-white overflow-hidden p-0 shadow-2xl flex flex-col transition-all duration-500 max-h-[95vh] ${
          activeTab === TABS.MASIVA ? 'max-w-[95vw] lg:max-w-[1250px]' : 'sm:max-w-[800px]'
      }`}>
        
        <div className="py-6 px-8 flex flex-col h-full overflow-hidden">
          
          <div className="flex-shrink-0">
            <DialogHeader className="mb-4">
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

            <div className="flex bg-black/40 p-1 rounded-xl border border-white/10 mb-4">
                <button onClick={() => setActiveTab(TABS.UNICA)} className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeTab === TABS.UNICA ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>Factura Única</button>
                <button onClick={() => setActiveTab(TABS.MASIVA)} className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeTab === TABS.MASIVA ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}><FileText size={14} /> Factura Masiva (CSV o Manual)</button>
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
                  
                  {/* 🔥 BARRA DE PROGRESO EN VIVO */}
                  {progresoRobot.activo && (
                      <div className="bg-blue-600/20 border border-blue-500 rounded-xl p-3 mb-3 flex items-center justify-between shadow-[0_0_20px_rgba(59,130,246,0.3)] animate-pulse flex-shrink-0">
                          <div className="flex items-center gap-4">
                              <Loader2 className="animate-spin text-blue-400 w-6 h-6" />
                              <div>
                                  <p className="text-white font-black uppercase text-xs tracking-widest">
                                      Robot Facturando en Segundo Plano...
                                  </p>
                                  <p className="text-blue-300 text-[10px] font-mono mt-0.5">
                                      Procesando RUT: {progresoRobot.rutActual || '...'}
                                  </p>
                              </div>
                          </div>
                          <div className="flex items-center gap-4 text-right">
                              <div>
                                  <p className="text-2xl font-black text-white italic leading-none">
                                      {progresoRobot.actual} / {progresoRobot.total}
                                  </p>
                                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                                      Éxitos: <span className="text-emerald-400">{progresoRobot.exitos}</span> | Errores: <span className="text-red-400">{progresoRobot.errores}</span>
                                  </p>
                              </div>
                              <Button onClick={handleDetenerMasivo} variant="destructive" className="h-10 px-4 rounded-xl font-black uppercase tracking-widest shadow-lg shadow-red-500/20 hover:bg-red-600 transition-all text-xs">
                                  <X size={16} className="mr-1" /> Detener
                              </Button>
                          </div>
                      </div>
                  )}

                  <div className="flex gap-4 mb-3 flex-shrink-0">
                    <div className="flex-1 bg-blue-900/10 border border-blue-500/30 rounded-xl p-3 flex flex-col items-center justify-center border-dashed cursor-pointer hover:bg-blue-900/20 transition-all" onClick={() => fileInputRef.current?.click()}>
                      <UploadCloud size={20} className="text-blue-400 mb-1" />
                      <span className="text-[10px] font-bold text-white uppercase tracking-widest">Subir Excel / CSV</span>
                      <Input ref={fileInputRef} type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" disabled={isBulkSubmitting}/>
                    </div>

                    <div className="flex-1 bg-emerald-900/10 border border-emerald-500/30 rounded-xl p-3 flex flex-col items-center justify-center border-dashed cursor-pointer hover:bg-emerald-900/20 transition-all" onClick={handleAddManualRow}>
                      <Plus size={20} className="text-emerald-400 mb-1" />
                      <span className="text-[10px] font-bold text-white uppercase tracking-widest">+ Fila Manual</span>
                    </div>
                  </div>

                  {bulkRows.length > 0 && (
                    <div className="flex-1 flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0a] shadow-2xl">
                      
                      <div className="bg-[#121212] px-6 py-2 border-b border-white/10 flex justify-between items-center flex-shrink-0">
                        <div className="flex gap-6">
                          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                            A Facturar: <span className="text-white">{bulkRows.filter(r => r.estado !== 'omitido').length}</span>
                          </span>
                          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                            Ignoradas ($0): <span className="text-red-400">{bulkRows.filter(r => r.estado === 'omitido').length}</span>
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-400 font-black uppercase tracking-widest">
                          Proyección Neta: <span className="text-emerald-400 font-mono tracking-tighter text-sm">${bulkRows.filter(r => r.estado !== 'omitido').reduce((acc, curr) => acc + (Number(curr.precio) || 0), 0).toLocaleString('es-CL')}</span>
                        </div>
                      </div>

                      {/* 🔥 CONTENEDOR DE LA TABLA COMPACTA (Scrollea solo en móvil) */}
                      <div className="flex-1 overflow-x-auto overflow-y-auto md:overflow-y-hidden custom-scrollbar">
                        <table className="w-full text-left whitespace-nowrap border-collapse">
                          <thead className="bg-[#121212] sticky top-0 z-10 border-b border-white/10">
                            <tr className="text-gray-500 font-black uppercase tracking-widest text-[9px]">
                              <th className="px-4 py-2.5 w-56 text-blue-400">Buscador Búnker</th>
                              <th className="px-3 py-2.5 min-w-[140px]">Razón Social</th>
                              <th className="px-3 py-2.5 w-28">RUT Receptor</th>
                              <th className="px-3 py-2.5 min-w-[140px]">Correo Receptor</th>
                              <th className="px-3 py-2.5 w-36">Plan / Concepto</th>
                              <th className="px-3 py-2.5 w-24 text-right">Valor Neto ($)</th>
                              <th className="px-3 py-2.5 min-w-[160px]">Observaciones / Mes</th>
                              <th className="px-3 py-2.5 w-20 text-center">Estado</th>
                              <th className="px-2 py-2.5 w-8"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {/* 🔥 SOLO MAPEA LAS 6 FILAS DE LA PÁGINA ACTUAL */}
                            {currentRows.map((row, relativeIndex) => {
                              const absoluteIndex = (currentPage - 1) * ROWS_PER_PAGE + relativeIndex;
                              const formatData = (str) => String(str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
                              const isOmitted = row.estado === 'omitido';

                              return (
                                <tr key={absoluteIndex} className={`transition-all duration-200 group ${activeRowIndex === absoluteIndex ? 'bg-blue-600/10 z-50 relative' : 'hover:bg-white/[0.04] z-0 relative'} ${isOmitted ? 'opacity-40 grayscale' : ''}`}>
                                  
                                  {/* 1. BUSCADOR INTELIGENTE EN CADA FILA */}
                                  <td className={`px-4 py-1.5 relative ${activeRowIndex === absoluteIndex ? 'z-50' : 'z-0'}`}>
                                    <div className="flex items-center gap-2">
                                      <Search size={12} className={`absolute left-6 transition-colors z-20 ${activeRowIndex === absoluteIndex ? 'text-blue-400' : 'text-gray-500'}`} />
                                      <Input 
                                        value={row.searchQuery !== undefined ? row.searchQuery : row.rut} 
                                        onChange={(e) => handleBulkSearchChange(absoluteIndex, e.target.value)} 
                                        onFocus={() => setActiveRowIndex(absoluteIndex)}
                                        onBlur={() => setTimeout(() => setActiveRowIndex(null), 250)}
                                        className={`h-9 pl-7 bg-black/40 border-white/10 hover:border-white/30 focus:bg-black/80 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 text-[10px] font-bold rounded-lg shadow-none uppercase transition-all relative z-10 ${activeRowIndex === absoluteIndex ? 'text-blue-300' : 'text-gray-300 font-mono'}`} 
                                        placeholder="BUSCAR..." 
                                        disabled={isBulkSubmitting || row.estado === 'completado' || isOmitted}
                                      />
                                    </div>
                                    
                                    {/* DROPDOWN DESPLEGABLE */}
                                    {activeRowIndex === absoluteIndex && (row.searchQuery || row.rut)?.length >= 2 && !isOmitted && (
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
                                                 <div key={idx} onMouseDown={() => applyClientToRow(absoluteIndex, c)} className="px-5 py-2.5 cursor-pointer hover:bg-blue-600/20 border-b border-white/5 flex justify-between items-center group transition-colors">
                                                   <div>
                                                     <div className="text-xs font-bold text-white">{cleanStr(c.razon_social || c.razonSocial)}</div>
                                                     <div className="text-[9px] text-gray-500 font-mono mt-0.5 tracking-widest">{formatRutSimple(c.rut_encrypted || c.rut)}</div>
                                                   </div>
                                                   <CheckCircle2 size={14} className="text-blue-500 opacity-0 group-hover:opacity-100 transition-all" />
                                                 </div>
                                               ))}
                                               
                                               {(term.length >= 3 || termRut.length >= 3) && (
                                                 <button type="button" onMouseDown={() => setRowAsExternal(absoluteIndex, (row.searchQuery || row.rut))} className="w-full p-3 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-500 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 border-t border-white/5 transition-all">
                                                   <UserPlus size={14} /> Registrar Empresa Externa
                                                 </button>
                                               )}
                                             </>
                                           );
                                        })()}
                                      </div>
                                    )}
                                  </td>

                                  {/* 2. RAZÓN SOCIAL */}
                                  <td className="px-3 py-1.5">
                                    <Input 
                                      value={formatData(row.razonSocial)} 
                                      onChange={(e) => updateBulkRow(absoluteIndex, 'razonSocial', e.target.value)} 
                                      className="h-9 bg-transparent border-transparent hover:border-white/20 focus:bg-black/60 focus:border-blue-500 text-[9px] font-bold text-gray-200 rounded-lg shadow-none uppercase transition-all" 
                                      placeholder="RAZÓN SOCIAL..." 
                                      disabled={isBulkSubmitting || row.estado === 'completado' || isOmitted}
                                    />
                                    {row.id === 'EXTERNO' && <span className="block text-[7px] text-orange-400 font-black tracking-widest ml-3 mt-0.5">⚠️ EXTERNO</span>}
                                  </td>

                                  {/* 3. RUT RECEPTOR */}
                                  <td className="px-3 py-1.5">
                                    <Input 
                                      value={row.rut} 
                                      onChange={(e) => updateBulkRow(absoluteIndex, 'rut', formatRutSimple(e.target.value))} 
                                      className="w-full min-w-[90px] h-9 bg-transparent border-transparent hover:border-white/20 focus:bg-black/60 focus:border-blue-500 text-[10px] font-mono font-bold text-blue-400 rounded-lg shadow-none uppercase transition-all" 
                                      placeholder="RUT..." 
                                      disabled={isBulkSubmitting || row.estado === 'completado' || isOmitted}
                                    />
                                  </td>

                                  {/* 4. CORREO RECEPTOR */}
                                  <td className="px-3 py-1.5">
                                    <Input 
                                      value={row.contacto} 
                                      onChange={(e) => updateBulkRow(absoluteIndex, 'contacto', e.target.value)} 
                                      className="h-9 bg-transparent border-transparent hover:border-white/20 focus:bg-black/60 focus:border-blue-500 text-[9px] font-medium text-gray-300 rounded-lg shadow-none transition-all" 
                                      placeholder="EMAIL@..." 
                                      disabled={isBulkSubmitting || row.estado === 'completado' || isOmitted}
                                    />
                                  </td>

                                  {/* 5. PLAN / CONCEPTO */}
                                  <td className="px-3 py-1.5">
                                    <Input 
                                      value={formatData(row.plan)} 
                                      onChange={(e) => updateBulkRow(absoluteIndex, 'plan', e.target.value)} 
                                      className="h-9 bg-transparent border-transparent hover:border-white/20 focus:bg-black/60 focus:border-blue-500 text-[9px] font-bold text-gray-300 rounded-lg shadow-none uppercase transition-all" 
                                      placeholder="CONCEPTO..." 
                                      disabled={isBulkSubmitting || row.estado === 'completado' || isOmitted}
                                    />
                                  </td>

                                  {/* 6. VALOR NETO ($) */}
                                  <td className="px-3 py-1.5">
                                    <Input 
                                      type="number" 
                                      value={row.precio} 
                                      onChange={(e) => updateBulkRow(absoluteIndex, 'precio', e.target.value)} 
                                      className="h-9 bg-transparent border-transparent hover:border-white/20 focus:bg-black/60 focus:border-blue-500 text-[11px] font-black font-mono text-emerald-400 rounded-lg shadow-none transition-all text-right" 
                                      placeholder="0" 
                                      disabled={isBulkSubmitting || row.estado === 'completado' || isOmitted}
                                    />
                                  </td>

                                  {/* 7. OBSERVACIONES / MES */}
                                  <td className="px-3 py-1.5">
                                    <Input 
                                      value={formatData(row.observacion)} 
                                      onChange={(e) => updateBulkRow(absoluteIndex, 'observacion', e.target.value)} 
                                      className="h-9 bg-transparent border-transparent hover:border-white/20 focus:bg-black/60 focus:border-blue-500 text-[9px] font-medium text-gray-400 rounded-lg shadow-none uppercase transition-all" 
                                      placeholder="GLOSA FACTURA..." 
                                      disabled={isBulkSubmitting || row.estado === 'completado' || isOmitted}
                                    />
                                  </td>

                                  <td className="px-3 py-1.5 text-center">
                                    <div className="flex justify-center">
                                      {isOmitted && <span className="px-2 py-1 rounded-full bg-gray-500/10 text-gray-500 font-black text-[7px] uppercase border border-gray-500/20 tracking-widest">🚫 Omite</span>}
                                      {row.estado === "pendiente" && <span className="px-2 py-1 rounded-full bg-white/5 text-gray-400 font-black text-[7px] uppercase border border-white/10 tracking-widest">En Fila</span>}
                                      {row.estado === "completado" && <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 font-black text-[7px] uppercase border border-emerald-500/20 flex items-center gap-1"><CheckCircle2 size={8}/> Listo</span>}
                                      {row.estado === "procesando" && <span className="px-2 py-1 rounded-full bg-blue-500/10 text-blue-400 font-black text-[7px] uppercase border border-blue-500/20 flex items-center gap-1"><Loader2 size={8} className="animate-spin"/> Emite</span>}
                                      {row.estado === "error" && <span className="px-2 py-1 rounded-full bg-red-500/10 text-red-400 font-black text-[7px] uppercase border border-red-500/20 flex items-center gap-1"><AlertCircle size={8}/> Error</span>}
                                    </div>
                                  </td>

                                  <td className="px-1 py-1.5 text-center">
                                     {!isBulkSubmitting && (
                                       <button onClick={() => removeBulkRow(absoluteIndex)} className="text-red-500/40 hover:text-red-500 transition-all p-1.5 hover:bg-red-500/10 rounded-lg" title="Quitar Fila"><X size={14} /></button>
                                     )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      
                      {/* 🔥 BARRA DE PAGINACIÓN */}
                      {totalPages > 1 && (
                        <div className="bg-[#0f0f0f] border-t border-white/10 px-6 py-2.5 flex items-center justify-between flex-shrink-0">
                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                            Mostrando {((currentPage - 1) * ROWS_PER_PAGE) + 1} - {Math.min(currentPage * ROWS_PER_PAGE, bulkRows.length)} de {bulkRows.length} facturas
                          </p>
                          <div className="flex items-center gap-3">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={goToPrevPage} 
                              disabled={currentPage === 1 || isBulkSubmitting}
                              className="bg-black/40 border-white/10 text-white hover:bg-white/10 hover:text-white h-7 text-[10px] px-3"
                            >
                              <ChevronLeft size={14} className="mr-1"/> Anterior
                            </Button>
                            <span className="text-[11px] font-black font-mono text-gray-300">
                              PAG {currentPage} / {totalPages}
                            </span>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={goToNextPage} 
                              disabled={currentPage === totalPages || isBulkSubmitting}
                              className="bg-black/40 border-white/10 text-white hover:bg-white/10 hover:text-white h-7 text-[10px] px-3"
                            >
                              Siguiente <ChevronRight size={14} className="ml-1"/>
                            </Button>
                          </div>
                        </div>
                      )}

                    </div>
                  )}
                </div>
              )}
          </div>

          {/* BOTONERA FINAL */}
          <div className="flex gap-4 pt-4 mt-2 border-t border-white/5 flex-shrink-0 relative z-20">
            <Button type="button" onClick={() => setIsOpen(false)} className="flex-1 bg-white/5 hover:bg-white/10 text-gray-400 uppercase font-black text-[11px] tracking-widest h-10 rounded-xl transition-all">Cerrar</Button>
            
            {activeTab === TABS.UNICA ? (
              <Button onClick={handleSubmitUnica} disabled={!empresaEfectiva || isSubmitting} className="flex-[2] bg-blue-600 hover:bg-blue-500 text-white font-black uppercase text-[11px] tracking-widest h-10 rounded-xl shadow-lg shadow-blue-600/20 transition-all">
                {isSubmitting ? <><Loader2 size={14} className="mr-2 animate-spin"/> Iniciando Robot...</> : 'Emitir Factura Individual'}
              </Button>
            ) : (
              <Button onClick={handleBulkSubmit} disabled={isBulkSubmitting || bulkRows.filter(r => r.estado === 'pendiente').length === 0} className="flex-[2] bg-blue-600 hover:bg-blue-500 text-white font-black uppercase text-[11px] tracking-widest h-10 rounded-xl shadow-lg shadow-blue-600/20 transition-all">
                {isBulkSubmitting ? <><Loader2 size={14} className="mr-2 animate-spin"/> Procesando Lote...</> : `Facturar Lote (${bulkRows.filter(r => r.estado === 'pendiente').length})`}
              </Button>
            )}
          </div>
          
        </div>
      </DialogContent>
    </Dialog>
  );
}