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
import { cleanRut } from "@/lib/rut.js";
import * as XLSX from "xlsx";

// CONTEXTO Y SERVICIOS
import { useAuth } from "@/hooks/useAuth.jsx";
import { getCrmDataApi } from "@/services/crmService.js";
// Faltaba. Se usa en cuatro lugares de este archivo —emitir manual, emitir
// masivo, consultar el progreso y detener— y al no estar importado, emitir una
// factura moría con "apiDTE is not defined" antes de llegar al servidor.
import * as apiDTE from "@/services/apiDTE.js";

// --- CONFIGURACIONES ---
const DOC_CONFIG = {
  title: "Facturador Electrónico",
  code: "DTE 33",
  description: "Emisión sincronizada con el SII y registro automático en el Búnker.",
};

const TABS = {
  UNICA: "unica",
  MASIVA: "masiva",
  // La pestaña CORREOS se movió a su propia sub-página:
  // Facturación → Correo Masivo (components/facturacion/tabs/CorreoMasivo.jsx).
  // Era una vista de consulta y envío, no de emisión, y obligaba a abrir el
  // modal de facturar para llegar a ella.
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
// 🚀 PARSER DE PLANILLAS (EXCEL / CSV) BASADO EN COLUMNAS
// =======================================================
// El RUT chileno válido tiene cuerpo de 7 u 8 dígitos + guion + dígito verificador.
const rutRegex = /\d{7,8}-?[0-9Kk]/i;

function limpiarMonto(m) {
  if (m === null || m === undefined) return 0;
  // Acepta "$50.000", "50.000", "-$526.649", 50000, etc.
  const limpio = String(m).replace(/[^0-9-]/g, "");
  if (limpio === "" || limpio === "-") return 0;
  return Number(limpio);
}

// Normaliza un texto para comparar encabezados (sin tildes, mayúsculas, sin espacios extra)
const normalizarHeader = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

// Extrae el primer correo válido de una celda que puede traer varios separados por ; , / o espacios
function extraerCorreo(celda) {
  if (!celda) return "";
  const match = String(celda).match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0].toLowerCase().trim() : "";
}

// Detecta en qué posición está cada columna leyendo la fila de encabezados.
// Funciona aunque cambie el orden o haya columnas extra (Tramo, RRHH, BRUTO, etc.).
function detectarColumnas(headerRow) {
  const idx = {};
  (headerRow || []).forEach((h, i) => {
    const n = normalizarHeader(h);
    if (!n) return;
    if (idx.razon === undefined && n.includes("RAZON")) idx.razon = i;
    else if (idx.plan === undefined && n.includes("PLAN")) idx.plan = i;
    // "NETO" exacto: así no confunde con "COMPRAS NETAS" / "VENTAS NETAS"
    else if (idx.neto === undefined && n === "NETO") idx.neto = i;
    else if (idx.bruto === undefined && n === "BRUTO") idx.bruto = i;
    // "RUT" exacto: así no confunde con "BRUTO" (que contiene "RUT")
    else if (idx.rut === undefined && n === "RUT") idx.rut = i;
    else if (idx.correo === undefined && (n.includes("CORREO") || n.includes("MAIL"))) idx.correo = i;
    // Columnas extra que necesita el correo (Tramo, RRHH, Compras, Ventas, Total)
    else if (idx.tramo === undefined && n.includes("TRAMO")) idx.tramo = i;
    else if (idx.trabajadores === undefined && (n === "RRHH" || n.includes("TRABAJ"))) idx.trabajadores = i;
    else if (idx.compras === undefined && n.includes("COMPRAS")) idx.compras = i;
    else if (idx.ventas === undefined && n.includes("VENTAS")) idx.ventas = i;
    else if (idx.total === undefined && (n.includes("FACTURACION") || n === "TOTAL")) idx.total = i;
  });
  return idx;
}

// Convierte un archivo (xlsx/xls/csv/txt) en una matriz de filas (array de arrays).
async function archivoAMatriz(file) {
  const nombre = file.name.toLowerCase();
  const opciones = { header: 1, raw: false, defval: "", blankrows: false };

  if (nombre.endsWith(".xlsx") || nombre.endsWith(".xls")) {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, opciones);
  }

  // CSV / TXT: detectamos el separador (tabulador, ; o ,) y dejamos que XLSX
  // respete las comas que vengan dentro de los nombres (ej: "LURASCHI, TATUAJES").
  const texto = await file.text();
  let separador = ",";
  if (texto.includes("\t")) separador = "\t";
  else if (texto.split("\n")[0]?.includes(";")) separador = ";";

  const wb = XLSX.read(texto, { type: "string", FS: separador });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, opciones);
}

export default function FacturaElectronicaModal({ isOpen, setIsOpen }) {
  const { selectedCompany, user } = useAuth();

  const [activeTab, setActiveTab] = useState(TABS.UNICA);
  const [item, setItem] = useState(createEmptyItem());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [folioGenerado, setFolioGenerado] = useState(null);
  // Avance en vivo de la factura individual. El robot va marcando en qué paso
  // está; sin esto la pantalla solo mostraba un girito y parecía colgada.
  const [avanceManual, setAvanceManual] = useState({ numero: 0, total: 11, paso: '' });
  const [segundosEmitiendo, setSegundosEmitiendo] = useState(0);

  // Con qué EMPRESA EMISORA se emite (el RUT que va como emisor en el SII).
  // Antes el robot elegía siempre una posición fija del desplegable del SII, así
  // que todo salía con la misma empresa. Ahora el usuario la elige acá y el robot
  // la selecciona por su RUT.
  const [rutEmisor, setRutEmisor] = useState('');

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
  const ROWS_PER_PAGE = 6; // ⬅️ LÍMITE DE 6 FILAS CONFIGURADO
  
  // 🌟 ESTADOS DEL RASTREADOR DE PROGRESO
  const [progresoRobot, setProgresoRobot] = useState({ activo: false, actual: 0, total: 0, rutActual: "", exitos: 0, errores: 0 });
  const prevExitosRef = useRef(0);

  const empresaEfectiva = selectedCompany || empresaEncontrada;
  const isExternal = empresaEncontrada?.id === 'EXTERNO';
  const razonSocialSegura = empresaEfectiva?.razon_social || empresaEfectiva?.razonSocial || (searchTerm.length > 0 ? 'Buscando...' : '---');

  // Empresas con las que este usuario puede emitir (las que tiene asignadas en el
  // sistema, con su RUT). Es la lista del selector de "Empresa emisora".
  const empresasEmisoras = useMemo(
    () => (user?.assignedCompanies || []).filter(e => e?.rut),
    [user]
  );
  // Al abrir, si todavía no hay emisora elegida, se deja puesta la primera para no
  // obligar a elegir en el caso normal (una sola empresa emisora).
  useEffect(() => {
    if (isOpen && !rutEmisor && empresasEmisoras.length > 0) {
      setRutEmisor(cleanRut(empresasEmisoras[0].rut || ''));
    }
  }, [isOpen, empresasEmisoras, rutEmisor]);

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
                  const res = await apiDTE.getProgresoMasivo();
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

    // 🔥 Siempre cargamos la lista del CRM: la pestaña MASIVA la necesita para
    // cruzar los RUT del Excel y saber qué empresas ya están registradas (no son externas).
    if (user?.sessionId) {
      setIsLoadingCrm(true);
      getCrmDataApi(user.sessionId, null)
        .then(res => res.json())
        .then(payload => {
          if (payload?.clients) setAllClientes(payload.clients);
        })
        .catch(err => console.error("Error CRM:", err))
        .finally(() => setIsLoadingCrm(false));
    }

    if (selectedCompany) {
      const email = String(selectedCompany.email_corporativo || selectedCompany.correo || "").split(/[,;/\s]+/)[0].trim();
      setItem({
        ...createEmptyItem(),
        rutFacturar: formatRutSimple(selectedCompany.rut || selectedCompany.rut_encrypted || ""),
        contactoReceptor: email,
        name: selectedCompany.plan_nombre || selectedCompany.plan || "",
        precio: selectedCompany.impuesto_pagar || selectedCompany.neto || "",
        descripcionProducto: `SERVICIOS CORRESPONDIENTES A ${getCurrentMonth()}`,
      });
    } else {
      setItem(createEmptyItem());
    }
  }, [isOpen, selectedCompany, user]);

  // ====================================================
  // 🔗 RE-VINCULACIÓN AUTOMÁTICA CON EL CRM
  // El endpoint del CRM puede tardar ~1s. Si subiste el Excel antes de que
  // llegara la lista, las filas quedaron como "EXTERNO". Cuando la lista termina
  // de cargar (o cambia), volvemos a cruzar los RUT y enlazamos las que sí están.
  // ====================================================
  useEffect(() => {
    if (!allClientes.length) return;

    setBulkRows((prev) => {
      if (prev.length === 0) return prev;
      let cambiado = false;

      const next = prev.map((row) => {
        if (row.id !== "EXTERNO" || !row.rut) return row;

        const rutBuscar = cleanRut(row.rut);
        const match = allClientes.find((c) => {
          try { return cleanRut(c.rut || c.rut_encrypted || "") === rutBuscar; }
          catch (err) { return false; }
        });
        if (!match) return row;

        cambiado = true;
        const razonActual = String(row.razonSocial || "");
        const esPlaceholder =
          razonActual.length < 3 ||
          razonActual.includes("EXTERNO") ||
          razonActual.includes("NUEVO CLIENTE");

        return {
          ...row,
          id: match.id,
          razonSocial: esPlaceholder ? (match.razonSocial || match.razon_social || razonActual) : razonActual,
          plan: row.plan || match.plan || match.planNombre || "",
          contacto: row.contacto || extraerCorreo(match.correo || match.emailCorporativo),
        };
      });

      return cambiado ? next : prev;
    });
  }, [allClientes]);

  const filteredSuggestions = useMemo(() => {
    if (!searchTerm || String(searchTerm).trim() === "") return [];
    const termStr = cleanStr(searchTerm);
    const termRut = String(searchTerm).replace(/[^0-9kK]/gi, '').toLowerCase();

    return allClientes.filter(c => {
      const rs = cleanStr(c.razon_social || c.razonSocial || "");
      const rutPuro = String(c.rut || c.rut_encrypted || "").replace(/[^0-9kK]/gi, '').toLowerCase();
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
    
    const rut = formatRutSimple(cliente.rut || cliente.rut_encrypted || "");
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
      const matriz = await archivoAMatriz(file);
      if (!matriz || matriz.length < 2) {
        return toast({ variant: "destructive", title: "Planilla vacía", description: "No se encontraron filas de datos." });
      }

      // 1. Ubicar las columnas leyendo el encabezado
      const idx = detectarColumnas(matriz[0]);

      if (idx.rut === undefined) {
        return toast({
          variant: "destructive",
          title: "No encuentro la columna RUT",
          description: "El encabezado debe incluir una columna llamada 'RUT'. Revisa que la primera fila sean los títulos.",
        });
      }
      if (idx.neto === undefined) {
        toast({
          title: "⚠️ Aviso: sin columna NETO",
          description: "No detecté la columna 'NETO'. Los montos quedarán en 0 (deberás completarlos a mano).",
          duration: 7000,
        });
      }

      // 2. Recorrer las filas de datos
      const filas = [];
      const errores = [];

      for (let r = 1; r < matriz.length; r++) {
        const cols = matriz[r] || [];
        if (cols.every((c) => String(c ?? "").trim() === "")) continue; // fila vacía

        const tomar = (i) => (i !== undefined ? String(cols[i] ?? "").trim() : "");
        const rutCelda = tomar(idx.rut);
        const razonCelda = tomar(idx.razon);

        // --- Validación de RUT ---
        const rutMatch = rutCelda.match(rutRegex);
        if (!rutMatch) {
          // Solo reportamos como error si la fila parece tener datos reales
          if (rutCelda || razonCelda) {
            errores.push(`Fila ${r + 1}${razonCelda ? ` (${razonCelda})` : ""}: RUT inválido o vacío → "${rutCelda || "—"}"`);
          }
          continue;
        }

        const rutLimpio = formatRutSimple(rutMatch[0]);
        const rutParaBuscar = cleanRut(rutLimpio);

        // 🔥 El CRM entrega el RUT descifrado en `c.rut` (rut_encrypted es el blob, no sirve para comparar)
        const crmMatch = allClientes.find((c) => {
          try { return cleanRut(c.rut || c.rut_encrypted || "") === rutParaBuscar; }
          catch (err) { return false; }
        });

        // --- Plan / Concepto (columna PLAN CONTABLE, con respaldo en el CRM) ---
        const planFinal =
          tomar(idx.plan) || (crmMatch ? crmMatch.plan || crmMatch.plan_nombre || "" : "") || "SERVICIOS";

        // --- Correo (columna CORREO, con respaldo en el CRM) ---
        const correoFinal =
          extraerCorreo(tomar(idx.correo)) || (crmMatch ? extraerCorreo(crmMatch.correo || crmMatch.email_corporativo) : "");

        // --- Neto (columna NETO; si viene 0/vacío, intentamos el CRM) ---
        let netoNum = limpiarMonto(tomar(idx.neto));
        if (netoNum <= 0 && crmMatch) {
          netoNum = limpiarMonto(crmMatch.neto || crmMatch.impuesto_pagar || 0);
        }

        const razonFinal =
          razonCelda.length > 2
            ? razonCelda
            : crmMatch
            ? crmMatch.razon_social || crmMatch.razonSocial
            : "NUEVO CLIENTE (SII)";

        const estadoFila = netoNum > 0 ? "pendiente" : "omitido";

        // --- Datos extra del Excel que necesita el correo (bruto, compras, ventas, total, tramo, trabajadores) ---
        const brutoNum = limpiarMonto(tomar(idx.bruto));
        const comprasNum = limpiarMonto(tomar(idx.compras));
        const ventasNum = limpiarMonto(tomar(idx.ventas));
        const totalNum = limpiarMonto(tomar(idx.total));

        filas.push({
          id: crmMatch ? crmMatch.id : "EXTERNO",
          searchQuery: rutLimpio,
          rut: rutLimpio,
          razonSocial: razonFinal,
          plan: planFinal,
          precio: netoNum > 0 ? String(netoNum) : "",
          observacion: `SERVICIOS CORRESPONDIENTES A ${getCurrentMonth()}`,
          contacto: correoFinal,
          estado: estadoFila,
          motivo: estadoFila === "omitido" ? "Neto en $0 — no se factura" : "",
          // Datos para el correo (se mandan al backend, no se muestran en la grilla)
          bruto: brutoNum > 0 ? String(brutoNum) : "",
          compras: comprasNum > 0 ? String(comprasNum) : "",
          ventas: ventasNum > 0 ? String(ventasNum) : "",
          totalFacturacion: totalNum > 0 ? String(totalNum) : "",
          tramo: tomar(idx.tramo),
          trabajadores: tomar(idx.trabajadores),
        });
      }

      // Las que se facturan primero, las omitidas al final
      filas.sort((a, b) => (a.estado === "omitido" ? 1 : -1));

      if (filas.length === 0) {
        return toast({
          variant: "destructive",
          title: "Ninguna fila válida",
          description: errores.length ? `Revisa los ${errores.length} errores detectados (consola F12).` : "No se pudo leer ningún RUT.",
        });
      }

      setBulkRows((prev) => [...prev, ...filas]);
      setCurrentPage(1);

      const facturables = filas.filter((r) => r.estado === "pendiente").length;
      const omitidos = filas.filter((r) => r.estado === "omitido").length;

      toast({
        title: "✅ Planilla Procesada",
        description: `${facturables} a facturar · ${omitidos} en $0 (omitidas)${errores.length ? ` · ${errores.length} con errores` : ""}.`,
        duration: 6000,
      });

      // 3. Reportar los errores de importación (RUT inválido, etc.)
      if (errores.length > 0) {
        console.warn("[FACTURADOR MASIVO] Filas NO importadas:\n" + errores.join("\n"));
        toast({
          variant: "destructive",
          title: `⚠️ ${errores.length} fila(s) NO se importaron`,
          description: errores.slice(0, 4).join(" | ") + (errores.length > 4 ? ` …y ${errores.length - 4} más (ver consola F12).` : ""),
          duration: 12000,
        });
      }
    } catch (err) {
      console.error("[FACTURADOR MASIVO] Error leyendo archivo:", err);
      toast({ variant: "destructive", title: "Error leyendo archivo", description: "Revisa que sea un Excel (.xlsx) o CSV válido." });
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
      estado: 'pendiente',
      motivo: ''
    }, ...bulkRows]);
    setCurrentPage(1); 
  };

  const handleBulkSearchChange = (absoluteIndex, val) => {
    const newRows = [...bulkRows];
    newRows[absoluteIndex].searchQuery = val;
    
    if (val.length > 7 && /^[0-9kK.\-]+$/.test(val)) {
      newRows[absoluteIndex].rut = formatRutSimple(val);
      const rutParaBuscar = cleanRut(val);
      const match = allClientes.find(c => cleanRut(c.rut || c.rut_encrypted || "") === rutParaBuscar);
      
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
    const rutLimpio = formatRutSimple(cliente.rut || cliente.rut_encrypted);
    newRows[absoluteIndex].id = cliente.id;
    newRows[absoluteIndex].rut = rutLimpio;
    newRows[absoluteIndex].searchQuery = rutLimpio;
    newRows[absoluteIndex].razonSocial = cliente.razon_social || cliente.razonSocial;
    newRows[absoluteIndex].plan = cliente.plan_nombre || cliente.plan || newRows[absoluteIndex].plan;
    newRows[absoluteIndex].precio = cliente.impuesto_pagar || cliente.neto || newRows[absoluteIndex].precio;
    newRows[absoluteIndex].contacto = (cliente.correo || cliente.email_corporativo || '').split(/[,;/\s]+/)[0].trim();
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

    // Si el usuario corrige el RUT o el monto a mano, recalculamos el estado
    // (salvo que ya esté emitida) para que la fila vuelva a entrar al lote.
    const row = newRows[absoluteIndex];
    if ((field === "rut" || field === "precio") && row.estado !== "completado" && row.estado !== "procesando") {
      const rutOk = rutRegex.test(cleanRut(row.rut || ""));
      const precioOk = Number(String(row.precio).replace(/[^0-9]/g, "")) > 0;
      if (!rutOk) { row.estado = "error"; row.motivo = "RUT inválido o incompleto"; }
      else if (!precioOk) { row.estado = "omitido"; row.motivo = "Neto en $0 — no se factura"; }
      else { row.estado = "pendiente"; row.motivo = ""; }
    }

    setBulkRows(newRows);
  };

  const removeBulkRow = (absoluteIndex) => {
    setBulkRows(bulkRows.filter((_, i) => i !== absoluteIndex));
  };

  const handleDetenerMasivo = async () => {
    try {
      await apiDTE.detenerMasivo();
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
        // 📧 Datos extra del Excel para armar el correo al cliente
        datosCorreo: {
          razonSocial: row.razonSocial || '',
          planContable: row.plan || '',
          neto: String(row.precio || '').replace(/[^0-9]/g, ''),
          bruto: String(row.bruto || '').replace(/[^0-9]/g, ''),
          compras: String(row.compras || '').replace(/[^0-9]/g, ''),
          ventas: String(row.ventas || '').replace(/[^0-9]/g, ''),
          totalFacturacion: String(row.totalFacturacion || '').replace(/[^0-9]/g, ''),
          tramo: row.tramo || '',
          trabajadores: row.trabajadores || '',
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

    apiDTE.emitirMasivo(facturasAProcesar).catch(err => {
        console.error("Error al enviar lote al servidor:", err);
        setIsBulkSubmitting(false);
    });
  };


  // Mientras se emite UNA factura, se le pregunta al servidor en qué paso va.
  // El robot tarda entre 30 y 90 segundos; sin esto la pantalla se veía quieta
  // y no había forma de saber si seguía viva o se había caído.
  useEffect(() => {
    if (!isSubmitting || activeTab !== TABS.UNICA) {
      setSegundosEmitiendo(0);
      return;
    }
    const arranque = Date.now();
    const reloj = setInterval(() => {
      setSegundosEmitiendo(Math.round((Date.now() - arranque) / 1000));
    }, 1000);
    const consulta = setInterval(async () => {
      try {
        const r = await apiDTE.getProgresoManual();
        const d = await r.json();
        if (d && typeof d.numero === 'number') setAvanceManual(d);
      } catch { /* si no responde, se queda en el último paso conocido */ }
    }, 1500);
    return () => { clearInterval(reloj); clearInterval(consulta); };
  }, [isSubmitting, activeTab]);

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
        // RUT de la empresa EMISORA elegida arriba: el robot la busca por este RUT
        // en el desplegable del SII en vez de tomar una fija.
        rutEmisor: cleanRut(rutEmisor || ''),
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

      const res = await apiDTE.emitirManual(payload);

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
      <DialogContent className={`w-full bg-white border-[#efe8dd] text-slate-700 overflow-hidden p-0 shadow-2xl flex flex-col transition-all duration-500 max-h-[95vh] ${
          activeTab === TABS.MASIVA ? 'max-w-[95vw] lg:max-w-[1250px]' : 'sm:max-w-[800px]'
      }`}>
        
        {(isSubmitting || isFinished) && activeTab === TABS.UNICA && (
          <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-black/95 backdrop-blur-md">
            {!isFinished ? (
              <div className="flex flex-col items-center gap-6 text-center px-4">
                <div className="relative">
                  <Loader2 className="h-20 w-20 animate-spin text-blue-500" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Building2 size={24} className="text-slate-700 animate-pulse" />
                  </div>
                </div>
                {/* Antes acá solo había un girito y un cartel rojo que decía
                    "SISTEMA BLOQUEADO". Eso no dice en qué va ni si sigue viva,
                    y emitir tarda entre 30 y 90 segundos: parecía colgada. */}
                <div className="w-full max-w-md">
                  <h3 className="text-2xl font-black uppercase italic tracking-widest text-white mb-1 text-center">
                    Emitiendo la factura
                  </h3>
                  <p className="text-slate-400 text-xs text-center mb-5">
                    Es <b className="text-white">una sola factura</b>
                    {razonSocialSegura && razonSocialSegura !== '---' ? <> · {razonSocialSegura}</> : null}
                  </p>

                  <div className="bg-white/10 rounded-xl px-4 py-3 border border-white/15">
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Paso {avanceManual.numero || 1} de {avanceManual.total || 11}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 tabular-nums">
                        {segundosEmitiendo}s
                      </span>
                    </div>
                    <div className="h-1.5 bg-white/15 rounded-full overflow-hidden mb-3">
                      <div className="h-full bg-blue-500 rounded-full transition-all duration-500"
                           style={{ width: `${Math.round(((avanceManual.numero || 1) / (avanceManual.total || 11)) * 100)}%` }} />
                    </div>
                    <p className="text-sm text-white font-bold text-center min-h-[1.4em]">
                      {avanceManual.paso || 'Preparando…'}
                    </p>
                  </div>

                  <p className="text-slate-500 text-[11px] text-center mt-4 leading-relaxed">
                    El robot está trabajando en el portal del SII. Puede tardar
                    hasta minuto y medio si el SII está lento.
                    <br />No cierres esta ventana.
                  </p>
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
                   <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
                      <Building2 className="text-blue-500" size={26} />
                   </div>
                   <div>
                      <DialogTitle className="text-2xl font-black italic uppercase tracking-tighter leading-none">{DOC_CONFIG.title}</DialogTitle>
                      <DialogDescription className="text-slate-400 text-[10px] uppercase font-bold tracking-[0.2em] mt-1">{DOC_CONFIG.code} • {DOC_CONFIG.description}</DialogDescription>
                   </div>
                </div>
              </div>
            </DialogHeader>

            <div className="flex bg-slate-50 p-1 rounded-xl border border-[#efe8dd] mb-4">
                <button onClick={() => setActiveTab(TABS.UNICA)} className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeTab === TABS.UNICA ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}>Factura Única</button>
                <button onClick={() => setActiveTab(TABS.MASIVA)} className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeTab === TABS.MASIVA ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}><FileText size={14} /> Factura Masiva (CSV o Manual)</button>
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
              
              {/* ================================================= */}
              {/* PESTAÑA: FACTURA ÚNICA */}
              {/* ================================================= */}
              {activeTab === TABS.UNICA && (
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 animate-in fade-in duration-300">
                  <div className="space-y-6 pb-4">
                    {/* EMPRESA EMISORA · con qué RUT se emite en el SII */}
                    <div className="bg-white border border-[#efe8dd] rounded-2xl p-6 shadow-inner relative">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Building2 size={14} /> Empresa Emisora
                      </h4>
                      {empresasEmisoras.length > 0 ? (
                        <select
                          value={rutEmisor}
                          onChange={(e) => setRutEmisor(e.target.value)}
                          className="w-full h-12 bg-slate-50 border border-[#efe8dd] rounded-xl px-4 text-sm font-bold text-slate-700 outline-none focus:border-blue-500 cursor-pointer"
                        >
                          {empresasEmisoras.map((e) => {
                            const rutLimpio = cleanRut(e.rut || '');
                            return (
                              <option key={e.id} value={rutLimpio}>
                                {(e.razonSocial || e.razon_social)} — {formatRutSimple(e.rut)}
                              </option>
                            );
                          })}
                        </select>
                      ) : (
                        <p className="text-xs text-amber-600 font-semibold">
                          No hay empresas emisoras asignadas a tu usuario. La factura saldrá con la empresa que el SII tenga por defecto.
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-2">
                        Es la empresa con cuyo RUT se emite en el SII. El robot la selecciona automáticamente.
                      </p>
                    </div>

                    <div className="bg-white border border-[#efe8dd] rounded-2xl p-6 shadow-inner relative">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Search size={14} /> {selectedCompany ? 'Cliente Seleccionado' : 'Buscador de Clientes Búnker'}
                      </h4>

                      {!selectedCompany && (
                        <div className="mb-6 relative">
                          <div className="relative">
                            <Search className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors z-10 ${empresaEncontrada ? 'text-emerald-500' : 'text-slate-400'}`} size={18} />
                            <Input 
                              placeholder="Nombre de Empresa o RUT..."
                              value={searchTerm}
                              onChange={handleSearchChange}
                              onFocus={() => setShowSuggestions(true)}
                              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                              className="pl-12 h-12 bg-slate-50 border-[#efe8dd] rounded-xl text-sm focus:border-emerald-500 shadow-xl transition-all"
                            />
                          </div>

                          {showSuggestions && (
                            <div className="absolute top-full left-0 w-full mt-2 bg-white border border-[#efe8dd] rounded-xl shadow-2xl overflow-hidden z-[60] animate-in fade-in slide-in-from-top-2">
                              {filteredSuggestions.map((c, i) => (
                                <div key={i} onMouseDown={() => onSelectCliente(c)} className="px-5 py-3 cursor-pointer hover:bg-blue-600/20 border-b border-[#efe8dd] flex justify-between items-center group transition-colors">
                                  <div>
                                    <div className="text-sm font-bold text-slate-900">{cleanStr(c.razon_social || c.razonSocial)}</div>
                                    <div className="text-[10px] text-slate-400 font-mono mt-0.5 tracking-widest">{formatRutSimple(c.rut || c.rut_encrypted)}</div>
                                  </div>
                                  <CheckCircle2 size={16} className="text-blue-500 opacity-0 group-hover:opacity-100 transition-all" />
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
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4 bg-slate-50 rounded-xl border border-[#efe8dd]">
                        <div>
                          <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">Razón Social</p>
                          <p className={`text-sm font-black truncate ${empresaEfectiva ? 'text-slate-700' : 'text-slate-600'}`}>{razonSocialSegura}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">RUT Receptor</p>
                          <p className={`text-sm font-mono font-bold ${empresaEfectiva ? 'text-blue-600' : 'text-slate-600'}`}>{item.rutFacturar || '---'}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-1 mb-1">
                            <Mail size={10} /> Correo Receptor
                          </p>
                          {isExternal ? (
                            <Input 
                              placeholder="email@..."
                              value={item.contactoReceptor}
                              onChange={(e) => setItem({...item, contactoReceptor: e.target.value})}
                              className="h-8 bg-blue-500/10 border-blue-500/30 text-xs rounded-lg focus:border-emerald-500 text-blue-700 placeholder:text-blue-500/40"
                            />
                          ) : (
                            <p className={`text-sm truncate font-medium ${empresaEfectiva ? 'text-slate-600' : 'text-slate-600'}`}>{item.contactoReceptor || '---'}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Plan / Concepto</Label>
                        <div className="relative">
                          <Tag className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                          <Input value={cleanStr(item.name)} onChange={(e) => setItem({...item, name: e.target.value})} className="pl-11 h-12 bg-slate-50 border-[#efe8dd] rounded-xl uppercase" placeholder="EJ: PLAN CONTABLE" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Valor Neto ($)</Label>
                        <div className="relative">
                          <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                          <Input type="number" value={item.precio} onChange={(e) => setItem({...item, precio: e.target.value})} className="pl-11 h-12 bg-slate-50 border-[#efe8dd] rounded-xl font-mono text-lg font-bold text-emerald-500" placeholder="0"/>
                        </div>
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Observaciones / Mes</Label>
                        <Input value={cleanStr(item.descripcionProducto)} onChange={(e) => setItem({ ...item, descripcionProducto: e.target.value })} className="h-12 bg-slate-50 border-[#efe8dd] rounded-xl uppercase" placeholder="EJ: SERVICIOS CORRESPONDIENTES A..." />
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
                              <Loader2 className="animate-spin text-blue-600 w-6 h-6" />
                              <div>
                                  <p className="text-slate-900 font-black uppercase text-xs tracking-widest">
                                      Robot Facturando en Segundo Plano...
                                  </p>
                                  <p className="text-blue-700 text-[10px] font-mono mt-0.5">
                                      Procesando RUT: {progresoRobot.rutActual || '...'}
                                  </p>
                              </div>
                          </div>
                          <div className="flex items-center gap-4 text-right">
                              <div>
                                  <p className="text-2xl font-black text-slate-900 italic leading-none">
                                      {progresoRobot.actual} / {progresoRobot.total}
                                  </p>
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
                    <div className="flex-1 bg-blue-900/10 border border-blue-500/30 rounded-xl p-3 flex flex-col items-center justify-center border-dashed cursor-pointer hover:bg-blue-900/20 transition-all" onClick={() => fileInputRef.current?.click()}>
                      <UploadCloud size={20} className="text-blue-600 mb-1" />
                      <span className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">Subir Excel / CSV</span>
                      <Input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,.txt" onChange={handleCsvUpload} className="hidden" disabled={isBulkSubmitting}/>
                    </div>

                    <div className="flex-1 bg-emerald-900/10 border border-emerald-500/30 rounded-xl p-3 flex flex-col items-center justify-center border-dashed cursor-pointer hover:bg-emerald-900/20 transition-all" onClick={handleAddManualRow}>
                      <Plus size={20} className="text-emerald-600 mb-1" />
                      <span className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">+ Fila Manual</span>
                    </div>
                  </div>

                  {bulkRows.length > 0 && (
                    <div className="flex-1 flex flex-col overflow-hidden rounded-xl border border-[#efe8dd] bg-white shadow-2xl">
                      
                      <div className="bg-slate-50 px-6 py-2 border-b border-[#efe8dd] flex justify-between items-center flex-shrink-0">
                        <div className="flex gap-6">
                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                            A Facturar: <span className="text-slate-700">{bulkRows.filter(r => r.estado !== 'omitido').length}</span>
                          </span>
                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                            Ignoradas ($0): <span className="text-red-500">{bulkRows.filter(r => r.estado === 'omitido').length}</span>
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-black uppercase tracking-widest">
                          Proyección Neta: <span className="text-emerald-600 font-mono tracking-tighter text-sm">${bulkRows.filter(r => r.estado !== 'omitido').reduce((acc, curr) => acc + (Number(curr.precio) || 0), 0).toLocaleString('es-CL')}</span>
                        </div>
                      </div>

                      {/* 🔥 CONTENEDOR DE LA TABLA COMPACTA (Scrollea solo en móvil) */}
                      <div className="flex-1 overflow-x-auto overflow-y-auto md:overflow-y-hidden custom-scrollbar">
                        <table className="w-full text-left whitespace-nowrap border-collapse">
                          <thead className="bg-slate-50 sticky top-0 z-10 border-b border-[#efe8dd]">
                            <tr className="text-slate-400 font-black uppercase tracking-widest text-[9px]">
                              <th className="px-4 py-2.5 w-56 text-blue-600">Buscador Búnker</th>
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
                                <tr key={absoluteIndex} className={`transition-all duration-200 group ${activeRowIndex === absoluteIndex ? 'bg-blue-600/10 z-50 relative' : 'hover:bg-slate-50 z-0 relative'} ${isOmitted ? 'opacity-40 grayscale' : ''}`}>
                                  
                                  {/* 1. BUSCADOR INTELIGENTE EN CADA FILA */}
                                  <td className={`px-4 py-1.5 relative ${activeRowIndex === absoluteIndex ? 'z-50' : 'z-0'}`}>
                                    <div className="flex items-center gap-2">
                                      <Search size={12} className={`absolute left-6 transition-colors z-20 ${activeRowIndex === absoluteIndex ? 'text-blue-600' : 'text-slate-400'}`} />
                                      <Input 
                                        value={row.searchQuery !== undefined ? row.searchQuery : row.rut} 
                                        onChange={(e) => handleBulkSearchChange(absoluteIndex, e.target.value)} 
                                        onFocus={() => setActiveRowIndex(absoluteIndex)}
                                        onBlur={() => setTimeout(() => setActiveRowIndex(null), 250)}
                                        className={`h-9 pl-7 bg-slate-50 border-[#efe8dd] hover:border-[#e5ddd0] focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 text-[10px] font-bold rounded-lg shadow-none uppercase transition-all relative z-10 ${activeRowIndex === absoluteIndex ? 'text-blue-700' : 'text-slate-600 font-mono'}`} 
                                        placeholder="BUSCAR..." 
                                        disabled={isBulkSubmitting || row.estado === 'completado' || isOmitted}
                                      />
                                    </div>
                                    
                                    {/* DROPDOWN DESPLEGABLE */}
                                    {activeRowIndex === absoluteIndex && (row.searchQuery || row.rut)?.length >= 2 && !isOmitted && (
                                      <div className="absolute top-[calc(100%-4px)] left-4 w-[350px] bg-white border-2 border-blue-500 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.9)] z-[9999] overflow-hidden animate-in fade-in slide-in-from-top-2">
                                        {(() => {
                                           const term = cleanStr(row.searchQuery !== undefined ? row.searchQuery : row.rut);
                                           const termRut = String(row.searchQuery !== undefined ? row.searchQuery : row.rut).replace(/[^0-9kK]/gi, '').toLowerCase();
                                           const matches = allClientes.filter(c => {
                                              const rs = cleanStr(c.razon_social || c.razonSocial || "");
                                              const rutPuro = String(c.rut || c.rut_encrypted || "").replace(/[^0-9kK]/gi, '').toLowerCase();
                                              return rs.includes(term) || (termRut !== "" && rutPuro.includes(termRut));
                                           }).slice(0, 5);

                                           return (
                                             <>
                                               {matches.map((c, idx) => (
                                                 <div key={idx} onMouseDown={() => applyClientToRow(absoluteIndex, c)} className="px-5 py-2.5 cursor-pointer hover:bg-blue-600/20 border-b border-[#efe8dd] flex justify-between items-center group transition-colors">
                                                   <div>
                                                     <div className="text-xs font-bold text-slate-900">{cleanStr(c.razon_social || c.razonSocial)}</div>
                                                     <div className="text-[9px] text-slate-400 font-mono mt-0.5 tracking-widest">{formatRutSimple(c.rut || c.rut_encrypted)}</div>
                                                   </div>
                                                   <CheckCircle2 size={14} className="text-blue-500 opacity-0 group-hover:opacity-100 transition-all" />
                                                 </div>
                                               ))}
                                               
                                               {(term.length >= 3 || termRut.length >= 3) && (
                                                 <button type="button" onMouseDown={() => setRowAsExternal(absoluteIndex, (row.searchQuery || row.rut))} className="w-full p-3 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-500 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 border-t border-[#efe8dd] transition-all">
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
                                      className="h-9 bg-transparent border-transparent hover:border-[#efe8dd] focus:bg-slate-50 focus:border-emerald-500 text-[9px] font-bold text-slate-700 rounded-lg shadow-none uppercase transition-all" 
                                      placeholder="RAZÓN SOCIAL..." 
                                      disabled={isBulkSubmitting || row.estado === 'completado' || isOmitted}
                                    />
                                    {row.id === 'EXTERNO' && <span className="block text-[7px] text-orange-600 font-black tracking-widest ml-3 mt-0.5">⚠️ EXTERNO</span>}
                                  </td>

                                  {/* 3. RUT RECEPTOR */}
                                  <td className="px-3 py-1.5">
                                    <Input 
                                      value={row.rut} 
                                      onChange={(e) => updateBulkRow(absoluteIndex, 'rut', formatRutSimple(e.target.value))} 
                                      className="w-full min-w-[90px] h-9 bg-transparent border-transparent hover:border-[#efe8dd] focus:bg-slate-50 focus:border-emerald-500 text-[10px] font-mono font-bold text-blue-600 rounded-lg shadow-none uppercase transition-all" 
                                      placeholder="RUT..." 
                                      disabled={isBulkSubmitting || row.estado === 'completado' || isOmitted}
                                    />
                                  </td>

                                  {/* 4. CORREO RECEPTOR */}
                                  <td className="px-3 py-1.5">
                                    <Input 
                                      value={row.contacto} 
                                      onChange={(e) => updateBulkRow(absoluteIndex, 'contacto', e.target.value)} 
                                      className="h-9 bg-transparent border-transparent hover:border-[#efe8dd] focus:bg-slate-50 focus:border-emerald-500 text-[9px] font-medium text-slate-600 rounded-lg shadow-none transition-all" 
                                      placeholder="EMAIL@..." 
                                      disabled={isBulkSubmitting || row.estado === 'completado' || isOmitted}
                                    />
                                  </td>

                                  {/* 5. PLAN / CONCEPTO */}
                                  <td className="px-3 py-1.5">
                                    <Input 
                                      value={formatData(row.plan)} 
                                      onChange={(e) => updateBulkRow(absoluteIndex, 'plan', e.target.value)} 
                                      className="h-9 bg-transparent border-transparent hover:border-[#efe8dd] focus:bg-slate-50 focus:border-emerald-500 text-[9px] font-bold text-slate-600 rounded-lg shadow-none uppercase transition-all" 
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
                                      className="h-9 bg-transparent border-transparent hover:border-[#efe8dd] focus:bg-slate-50 focus:border-emerald-500 text-[11px] font-black font-mono text-emerald-600 rounded-lg shadow-none transition-all text-right" 
                                      placeholder="0" 
                                      disabled={isBulkSubmitting || row.estado === 'completado' || isOmitted}
                                    />
                                  </td>

                                  {/* 7. OBSERVACIONES / MES */}
                                  <td className="px-3 py-1.5">
                                    <Input 
                                      value={formatData(row.observacion)} 
                                      onChange={(e) => updateBulkRow(absoluteIndex, 'observacion', e.target.value)} 
                                      className="h-9 bg-transparent border-transparent hover:border-[#efe8dd] focus:bg-slate-50 focus:border-emerald-500 text-[9px] font-medium text-slate-500 rounded-lg shadow-none uppercase transition-all" 
                                      placeholder="GLOSA FACTURA..." 
                                      disabled={isBulkSubmitting || row.estado === 'completado' || isOmitted}
                                    />
                                  </td>

                                  <td className="px-3 py-1.5 text-center">
                                    <div className="flex justify-center" title={row.motivo || ''}>
                                      {isOmitted && <span className="px-2 py-1 rounded-full bg-gray-500/10 text-slate-400 font-black text-[7px] uppercase border border-gray-500/20 tracking-widest">🚫 Omite</span>}
                                      {row.estado === "pendiente" && <span className="px-2 py-1 rounded-full bg-slate-50 text-slate-500 font-black text-[7px] uppercase border border-[#efe8dd] tracking-widest">En Fila</span>}
                                      {row.estado === "completado" && <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 font-black text-[7px] uppercase border border-emerald-500/20 flex items-center gap-1"><CheckCircle2 size={8}/> Listo</span>}
                                      {row.estado === "procesando" && <span className="px-2 py-1 rounded-full bg-blue-500/10 text-blue-600 font-black text-[7px] uppercase border border-blue-500/20 flex items-center gap-1"><Loader2 size={8} className="animate-spin"/> Emite</span>}
                                      {row.estado === "error" && <span className="px-2 py-1 rounded-full bg-red-500/10 text-red-500 font-black text-[7px] uppercase border border-red-500/20 flex items-center gap-1" title={row.motivo || 'Revisar fila'}><AlertCircle size={8}/> Error</span>}
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
                        <div className="bg-slate-50 border-t border-[#efe8dd] px-6 py-2.5 flex items-center justify-between flex-shrink-0">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            Mostrando {((currentPage - 1) * ROWS_PER_PAGE) + 1} - {Math.min(currentPage * ROWS_PER_PAGE, bulkRows.length)} de {bulkRows.length} facturas
                          </p>
                          <div className="flex items-center gap-3">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={goToPrevPage} 
                              disabled={currentPage === 1 || isBulkSubmitting}
                              className="bg-slate-50 border-[#efe8dd] text-slate-700 hover:bg-slate-100 hover:text-slate-900 h-7 text-[10px] px-3"
                            >
                              <ChevronLeft size={14} className="mr-1"/> Anterior
                            </Button>
                            <span className="text-[11px] font-black font-mono text-slate-600">
                              PAG {currentPage} / {totalPages}
                            </span>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={goToNextPage} 
                              disabled={currentPage === totalPages || isBulkSubmitting}
                              className="bg-slate-50 border-[#efe8dd] text-slate-700 hover:bg-slate-100 hover:text-slate-900 h-7 text-[10px] px-3"
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

          <div className="flex gap-4 pt-4 mt-2 border-t border-[#efe8dd] flex-shrink-0 relative z-20">
            <Button type="button" onClick={() => setIsOpen(false)} className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-500 uppercase font-black text-[11px] tracking-widest h-10 rounded-xl transition-all">Cerrar</Button>
            
            {activeTab === TABS.UNICA && (
              <Button onClick={handleSubmitUnica} disabled={!empresaEfectiva || isSubmitting} className="flex-[2] bg-emerald-600 hover:bg-emerald-500 text-slate-900 font-black uppercase text-[11px] tracking-widest h-10 rounded-xl shadow-lg shadow-blue-600/20 transition-all">
                {isSubmitting ? 'Procesando...' : 'Emitir Factura Individual'}
              </Button>
            )}
            {activeTab === TABS.MASIVA && (
              <Button onClick={handleBulkSubmit} disabled={isBulkSubmitting || bulkRows.filter(r => r.estado === 'pendiente').length === 0} className="flex-[2] bg-emerald-600 hover:bg-emerald-500 text-slate-900 font-black uppercase text-[11px] tracking-widest h-10 rounded-xl shadow-lg shadow-blue-600/20 transition-all">
                {isBulkSubmitting ? 'Procesando Lote...' : `Facturar Todo el Lote (${bulkRows.filter(r => r.estado === 'pendiente').length})`}
              </Button>
            )}
          </div>
          
        </div>
      </DialogContent>
    </Dialog>
  );
}