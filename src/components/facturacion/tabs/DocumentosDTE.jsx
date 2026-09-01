import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, FileWarning, Loader2, Search, Filter, Building2, FileText, Hash, ArrowUpRight, ArrowDownLeft, Globe, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth.jsx';
import { useEmpresasLista } from '@/hooks/useEmpresasLista';
import { obtenerHistorialBunker, obtenerComprasBunker } from '@/services/dteConsultasService';
import { descargarPdfFolio } from '@/services/apiDTE.js';
import { API_BASE_URL } from '../../../../config.js'; 

const NOMBRES_DTE = {
  33: "Factura Electrónica",
  34: "Factura Exenta",
  61: "Nota de Crédito",
  56: "Nota de Débito",
  52: "Guía de Despacho",
  39: "Boleta Electrónica",
  110: "Factura Exportación"
};

// UTILIDAD PARA BUSCADOR
const normalizeText = (text) => {
  if (!text) return "";
  return text.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

const cleanRutForSearch = (rut) => {
  if (!rut) return "";
  return rut.toString().replace(/[^0-9kK]/gi, '').toLowerCase();
};

// UTILIDAD PARA MOSTRAR DATOS
const formatDisplay = (str) => {
  if (!str) return '';
  return str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
};

const DocumentosDTE = () => {
  const { user, selectedCompany } = useAuth();
  const { principal } = useEmpresasLista();
  // Con la empresa principal seleccionada el backend devuelve el libro de la firma
  // —sus facturas a TODOS los clientes—, que es la vista global de facturación.
  // Se compara contra la lista y no solo contra la marca guardada, porque una
  // selección vieja en localStorage puede no traer el campo.
  const esPrincipal = Boolean(selectedCompany && (selectedCompany.esPrincipal || (principal && selectedCompany.id === principal.id)));
  const [documentos, setDocumentos] = useState([]);
  const [loading, setLoading] = useState(false);
  // El progreso vive en el SERVIDOR, no acá: por eso esto es un espejo de lo
  // que responde /sincronizar-sii/progreso y no el estado real. Así el avance
  // sobrevive a cambiar de sección o recargar la página.
  const [sync, setSync] = useState({ activo: false, paso: 0, total: 2, mensaje: '', ok: null });
  // Cuántos meses hacia atrás bajar. 1 por omisión, que es lo que se necesita a
  // diario: lo facturado desde la última sincronización.
  const [meses, setMeses] = useState(1);
  // Folio que se está bajando en este momento (uno a la vez: el SII no admite
  // dos sesiones simultáneas de la misma cuenta).
  const [bajando, setBajando] = useState(null);

  const [tipoVista, setTipoVista] = useState('VENTAS'); 
  const [vistaGlobal, setVistaGlobal] = useState(false); 

  const [searchTerm, setSearchTerm] = useState(""); 
  const [showSuggestions, setShowSuggestions] = useState(false); // NUEVO: Estado para mostrar/ocultar buscador

  const [filterTipo, setFilterTipo] = useState("TODOS");
  const [filterMes, setFilterMes] = useState("TODOS");
  const [filterAnio, setFilterAnio] = useState("TODOS");
  // Ordenamiento de la tabla: columna + dirección. Se alterna al clic en el encabezado.
  const [orden, setOrden] = useState({ col: 'fecha', dir: 'desc' });

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 9; 
  const tableContainerRef = useRef(null);

  useEffect(() => {
    if (selectedCompany) {
      setVistaGlobal(false);
    }
  }, [selectedCompany]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterTipo, filterMes, filterAnio, tipoVista, vistaGlobal, selectedCompany, orden]);

  useEffect(() => {
    if (tableContainerRef.current && currentPage > 1) {
      tableContainerRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  }, [currentPage]);

  const cargarHistorial = useCallback(async () => {
    // Con la principal se manda su id: el backend responde con el libro de la firma.
    const isGlobal = !selectedCompany || vistaGlobal;
    const targetId = isGlobal ? 'ALL' : selectedCompany.id;

    setLoading(true);
    setDocumentos([]);

    try {
      let data;
      if (tipoVista === 'VENTAS') {
        data = await obtenerHistorialBunker(targetId, user?.sessionId);
      } else {
        data = await obtenerComprasBunker(targetId, user?.sessionId);
      }

      if (data.ok) {
        setDocumentos(data.documentos || []);
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Error de Conexión", description: "Falla al sincronizar con el búnker." });
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, esPrincipal, tipoVista, vistaGlobal, user?.sessionId]);

  useEffect(() => {
    cargarHistorial();
  }, [cargarHistorial]);

  // ======================================================================
  // SINCRONIZAR CON EL SII · arranca y suelta
  // ----------------------------------------------------------------------
  // El robot abre un navegador, entra al portal del SII y baja el historial
  // de ventas y de compras. Eso tarda MINUTOS.
  //
  // Antes se esperaba la respuesta del POST con un spinner: la pantalla
  // quedaba tomada todo ese rato, sin decir en qué iba, y si alguien cerraba
  // la pestaña o se le caía la conexión no había forma de saber si había
  // terminado —el robot seguía corriendo en el servidor, invisible—.
  //
  // Ahora el POST vuelve al toque y el avance se pregunta aparte. Se puede
  // cambiar de sección y volver: el progreso sigue ahí, porque vive en el
  // servidor y no en esta pantalla.
  // ======================================================================
  const handleSincronizarSII = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/sincronizar-sii`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-session-id': user?.sessionId },
        body: JSON.stringify({ tipo: 'TODO', meses }),
      });
      const d = await r.json();
      if (!d.success) {
        // 409 = ya hay una corriendo, o el facturador masivo está usando el SII.
        // No es un error del usuario: se le dice qué pasa y se sigue.
        toast({ variant: "destructive", title: "No se puede sincronizar ahora", description: d.message });
        return;
      }
      setSync({ activo: true, paso: 1, total: 2, mensaje: 'Preparando el robot…', ok: null, meses });
      toast({
        title: "Sincronización iniciada",
        description: `Bajando ${meses === 1 ? 'el último mes' : `los últimos ${meses} meses`}. Puedes seguir trabajando.`,
      });
    } catch (error) {
      toast({ variant: "destructive", title: "Error de conexión", description: "No se pudo iniciar la sincronización." });
    }
  };

  // Sigue el avance mientras hay algo corriendo. Se pregunta cada 3 segundos:
  // el robot tarda minutos, así que preguntar más seguido solo ensucia el log
  // del servidor sin mostrar nada nuevo.
  useEffect(() => {
    if (!sync.activo) return;
    let vivo = true;
    const consulta = setInterval(async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/sincronizar-sii/progreso`, {
          headers: { 'x-session-id': user?.sessionId },
        });
        const d = await r.json();
        if (!vivo) return;
        setSync({
          activo: d.activo, paso: d.paso || 0, total: d.total || 2,
          mensaje: d.mensaje || '', ok: d.ok, meses: d.meses,
        });
        if (!d.activo) {
          clearInterval(consulta);
          if (d.ok) {
            toast({
              title: "Sincronización lista",
              description: d.mensaje || 'Ventas y compras actualizadas.',
              className: "bg-emerald-600 text-white border-none",
            });
            cargarHistorial();      // recién ahora hay datos nuevos que mostrar
          } else {
            toast({
              variant: "destructive",
              title: "La sincronización falló",
              description: d.error || d.mensaje || 'El robot no pudo terminar.',
            });
          }
        }
      } catch { /* si no responde, se reintenta en la próxima vuelta */ }
    }, 3000);
    return () => { vivo = false; clearInterval(consulta); };
  }, [sync.activo, user?.sessionId]);

  // Al entrar a la pantalla se pregunta si YA hay una sincronización corriendo.
  // Sin esto, alguien que la lanzó y se fue a otra sección volvía y veía el
  // botón como si nada estuviera pasando, y la lanzaba de nuevo.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/sincronizar-sii/progreso`, {
          headers: { 'x-session-id': user?.sessionId },
        });
        const d = await r.json();
        if (d?.activo) setSync({ activo: true, paso: d.paso || 0, total: d.total || 2, mensaje: d.mensaje || '', ok: null, meses: d.meses });
      } catch { /* si falla, la pantalla queda como siempre */ }
    })();
    // Solo al montar: reengancharse en cada cambio dispararía consultas de más.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ======================================================================
  // 🔍 LÓGICA DE BUSCADOR PROFESIONAL (Actualizado a Búsqueda por Inicio)
  // ======================================================================
  const entidadesUnicas = useMemo(() => {
    const mapa = new Map();
    documentos.forEach(doc => {
      const nombre = tipoVista === 'VENTAS' ? doc.razon_social : doc.razon_social_proveedor;
      const rut = tipoVista === 'VENTAS' ? doc.rut_cliente : doc.rut_proveedor;
      
      if (nombre && rut && !mapa.has(rut)) {
        mapa.set(rut, { nombre, rut });
      }
    });
    return Array.from(mapa.values());
  }, [documentos, tipoVista]);

  const sugerenciasBusqueda = useMemo(() => {
    if (!searchTerm) return [];
    
    // Normalizamos lo que el usuario escribe (ej. "A", "ae", "7")
    const termText = normalizeText(searchTerm);
    const termRut = cleanRutForSearch(searchTerm);
    
    // Filtramos la lista
    const coincidencias = entidadesUnicas.filter(ent => {
        // Normalizamos el nombre y rut de la base de datos
        const nombreNormalizado = normalizeText(ent.nombre);
        const rutLimpio = cleanRutForSearch(ent.rut);

        // El nombre o el rut deben CONTENER lo que se escribió (antes exigía que
        // empezara, y "pasta" no sugería "MR PASTA SPA").
        const coincideNombre = nombreNormalizado.includes(termText);
        const coincideRut = termRut !== "" && rutLimpio.includes(termRut);

        return coincideNombre || coincideRut;
    });

    // Ordenamos alfabéticamente para que se vea más profesional y limitamos a 6
    return coincidencias.sort((a, b) => a.nombre.localeCompare(b.nombre)).slice(0, 6);
  }, [searchTerm, entidadesUnicas]);
  // ======================================================================

  const documentosFiltrados = useMemo(() => {
    return documentos.filter(doc => {
      const fecha = new Date(doc.fecha_emision);
      const termText = normalizeText(searchTerm);
      const termRut = cleanRutForSearch(searchTerm);
      
      const razonSocialDoc = normalizeText(tipoVista === 'VENTAS' ? doc.razon_social : doc.razon_social_proveedor);
      const rutOriginal = tipoVista === 'VENTAS' ? doc.rut_cliente : doc.rut_proveedor;
      const rutDocClean = cleanRutForSearch(rutOriginal);

      // Búsqueda "contiene" (antes exigía que EMPEZARA con el texto, por eso
      // "pasta" no encontraba "MR PASTA SPA"). Ahora matchea el nombre en
      // cualquier parte, el RUT, o el número de folio.
      const termFolio = searchTerm.trim();
      const matchSearch = termText === "" ||
                          razonSocialDoc.includes(termText) ||
                          (termRut !== "" && rutDocClean.includes(termRut)) ||
                          (termFolio !== "" && String(doc.folio || '').includes(termFolio));

      const matchTipo = filterTipo === "TODOS" || doc.tipo_dte.toString() === filterTipo;
      const matchAnio = filterAnio === "TODOS" || fecha.getUTCFullYear().toString() === filterAnio;
      const matchMes = filterMes === "TODOS" || (fecha.getUTCMonth() + 1).toString() === filterMes;
      
      return matchSearch && matchTipo && matchAnio && matchMes;
    });
  }, [documentos, searchTerm, filterTipo, filterMes, filterAnio, tipoVista]);

  // Monto total de un documento, robusto: si monto_total viene en 0 (documentos
  // viejos que solo guardaron el neto) se cae al neto + IVA.
  const totalDe = (d) => (Number(d.monto_total) || 0) || ((Number(d.monto_neto) || 0) + (Number(d.monto_iva) || 0));

  // Clic en el encabezado: cambia la columna de orden, o alterna asc/desc.
  const cambiarOrden = (col) =>
    setOrden((o) => ({ col, dir: o.col === col && o.dir === 'desc' ? 'asc' : 'desc' }));

  const documentosOrdenados = useMemo(() => {
    const arr = [...documentosFiltrados];
    const signo = orden.dir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      let va, vb;
      if (orden.col === 'folio') { va = Number(a.folio) || 0; vb = Number(b.folio) || 0; }
      else if (orden.col === 'monto') { va = totalDe(a); vb = totalDe(b); }
      else { va = new Date(a.fecha_emision).getTime() || 0; vb = new Date(b.fecha_emision).getTime() || 0; }
      return (va - vb) * signo;
    });
    return arr;
  }, [documentosFiltrados, orden]);

  // Totales del filtro: suma sobre TODO lo filtrado (no solo la página visible).
  const totales = useMemo(() => documentosFiltrados.reduce((acc, d) => {
    const neto = Number(d.monto_neto) || 0;
    const iva = Number(d.monto_iva) || 0;
    acc.neto += neto; acc.iva += iva; acc.total += totalDe(d);
    return acc;
  }, { neto: 0, iva: 0, total: 0 }), [documentosFiltrados]);

  // Exporta lo que está filtrado (y ordenado) a un CSV que Excel abre directo.
  const exportarCSV = () => {
    if (documentosOrdenados.length === 0) return;
    const encabezado = ['Documento', 'Folio', 'Nombre', 'RUT', 'Emision', 'Neto', 'IVA', 'Total'];
    const filas = documentosOrdenados.map((d) => {
      const nombre = tipoVista === 'VENTAS' ? (d.razon_social || '') : (d.razon_social_proveedor || '');
      const rut = tipoVista === 'VENTAS' ? (d.rut_cliente || '') : (d.rut_proveedor || '');
      const fecha = d.fecha_emision ? new Date(d.fecha_emision).toLocaleDateString('es-CL', { timeZone: 'UTC' }) : '';
      return [
        NOMBRES_DTE[d.tipo_dte] || `DTE ${d.tipo_dte}`,
        d.folio, `"${String(nombre).replace(/"/g, '""')}"`, rut, fecha,
        Number(d.monto_neto) || 0, Number(d.monto_iva) || 0, totalDe(d),
      ].join(';');
    });
    const csv = [encabezado.join(';'), ...filas].join('\n');
    // El BOM (﻿) hace que Excel abra bien los acentos.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tipoVista.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.ceil(documentosOrdenados.length / ITEMS_PER_PAGE) || 1;
  const currentData = documentosOrdenados.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const isModoGlobalActivo = !selectedCompany || esPrincipal || vistaGlobal;


  // ==========================================================================
  // DESCARGAR EL PDF DE UN DOCUMENTO
  // --------------------------------------------------------------------------
  // No hay copia guardada: el servidor entra al SII, busca el folio y lo trae.
  // Tarda entre 30 y 90 segundos, así que se avisa antes de empezar; si no,
  // parece que el botón no hizo nada.
  // ==========================================================================
  const bajarPdf = async (dte) => {
    const folio = String(dte.folio || '').trim();
    if (!folio) {
      return toast({ variant: 'destructive', title: 'Sin folio', description: 'Este documento no tiene folio.' });
    }
    if (bajando) {
      return toast({ title: 'Espera un momento', description: 'Ya hay una descarga en curso. El SII acepta una sola a la vez.' });
    }

    setBajando(folio);
    toast({
      title: `Buscando el folio ${folio} en el SII`,
      description: 'Puede tardar hasta minuto y medio. No cierres la pestaña.',
      duration: 8000,
    });

    try {
      const res = await descargarPdfFolio(folio, dte.tipo_dte || 33);
      if (!res.ok) {
        // El servidor manda JSON cuando falla, para poder decir el motivo.
        let motivo = 'No se pudo obtener el documento.';
        try { motivo = (await res.json()).error || motivo; } catch { /* respuesta no-JSON */ }
        throw new Error(motivo);
      }

      // Llega el PDF en crudo: se arma la descarga en el navegador.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Factura_${folio}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Sin esto el blob queda en memoria toda la sesión.
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      toast({ title: `Folio ${folio} descargado` });
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo descargar', description: e.message });
    } finally {
      setBajando(null);
    }
  };


  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-2xl border border-[#efe8dd]">
        <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20 text-blue-600">
                <FileText size={20} />
            </div>
            <div>
                <h2 className="text-slate-900 font-black uppercase tracking-tighter text-lg">Bóveda de Documentos</h2>
                <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest">
                    {isModoGlobalActivo ? '🌐 TODAS LAS EMPRESAS' : formatDisplay(selectedCompany?.razon_social || selectedCompany?.razonSocial)}
                </p>
            </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
            {/* Con la principal el modo global ya está activo, el botón no aplica. */}
            {selectedCompany && !esPrincipal && (
              <Button
                  onClick={() => setVistaGlobal(!vistaGlobal)}
                  variant="outline" 
                  className={`h-10 text-[10px] font-black uppercase tracking-widest ${vistaGlobal ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30' : 'bg-slate-50 border-[#efe8dd] text-slate-500'}`}
              >
                  <Globe size={14} className="mr-2" /> {vistaGlobal ? 'Ocultar Global' : 'Modo Global'}
              </Button>
            )}

            <div className="flex bg-slate-50 p-1 rounded-xl border border-[#efe8dd] w-full sm:w-auto h-10">
                <button
                    onClick={() => setTipoVista('VENTAS')}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                        tipoVista === 'VENTAS' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:text-slate-600'
                    }`}
                >
                    <ArrowUpRight size={14} /> Ventas
                </button>
                <button
                    onClick={() => setTipoVista('COMPRAS')}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                        tipoVista === 'COMPRAS' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:text-slate-600'
                    }`}
                >
                    <ArrowDownLeft size={14} /> Compras
                </button>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white p-4 rounded-2xl border border-[#efe8dd]">
        
        {/* ========================================================== */}
        {/* BUSCADOR PROFESIONAL (DISEÑO ULTRA-MODERNO) */}
        {/* ========================================================== */}
        <div className="relative group z-50">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={15} />
          <input 
            type="text"
            placeholder="Buscar por Nombre, RUT o Folio..."
            value={searchTerm}
            onChange={(e) => {
                setSearchTerm(e.target.value);
                setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            className="w-full bg-slate-50 border border-[#efe8dd] rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all placeholder:text-slate-400 shadow-inner"
          />
          
          <AnimatePresence>
            {showSuggestions && searchTerm && sugerenciasBusqueda.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 5, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 5, scale: 0.98 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="absolute top-full left-0 right-0 mt-2 bg-white border border-[#efe8dd] rounded-xl shadow-lg z-50 overflow-hidden"
              >
                <div className="px-4 py-2 border-b border-[#efe8dd] bg-slate-50">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Sugerencias</span>
                </div>
                <div className="p-1.5">
                  {sugerenciasBusqueda.map((ent) => (
                    // === AQUÍ ESTÁ EL CAMBIO CLAVE PARA EL HOVER MÁS LLAMATIVO ===
                    <div 
                      key={ent.rut}
                      onClick={() => {
                        setSearchTerm(ent.nombre);
                        setShowSuggestions(false);
                      }}
                      // El hover era del tema oscuro: fondo azul translúcido y
                      // texto `blue-200`, que sobre blanco quedaba casi ilegible.
                      // Un fondo suave y el texto más oscuro dicen lo mismo y se
                      // leen.
                      className="group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="p-1.5 bg-slate-50 border border-[#efe8dd] rounded-md group-hover:border-slate-300 transition-colors">
                          <Building2 size={14} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
                        </div>
                        <span className="text-xs text-slate-600 group-hover:text-slate-900 font-medium truncate transition-colors">
                          {formatDisplay(ent.nombre)}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono tabular-nums flex-shrink-0 ml-2 group-hover:text-slate-600 transition-colors">
                        {formatDisplay(ent.rut)}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative">
            <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)} className="w-full bg-slate-50 border border-[#efe8dd] rounded-xl px-4 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 appearance-none cursor-pointer">
                <option value="TODOS">Todos los Tipos</option>
                <option value="33">Factura Electrónica (33)</option>
                <option value="34">Factura Exenta (34)</option>
                <option value="61">Nota de Crédito (61)</option>
                <option value="52">Guía de Despacho (52)</option>
                <option value="39">Boleta Electrónica (39)</option>
            </select>
        </div>
        <select value={filterMes} onChange={(e) => setFilterMes(e.target.value)} className="bg-slate-50 border border-[#efe8dd] rounded-xl px-4 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 appearance-none cursor-pointer">
          <option value="TODOS">Todos los Meses</option>
          {["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"].map((m, i) => (
            <option key={m} value={(i + 1).toString()}>{m}</option>
          ))}
        </select>
        <select value={filterAnio} onChange={(e) => setFilterAnio(e.target.value)} className="bg-slate-50 border border-[#efe8dd] rounded-xl px-4 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 appearance-none cursor-pointer">
          <option value="TODOS">Todos los Años</option>
          <option value="2024">2024</option>
          <option value="2025">2025</option>
          <option value="2026">2026</option>
        </select>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-2">
        {/* Conteo + TOTALES del filtro (neto / IVA / total) */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${tipoVista === 'VENTAS' ? 'text-blue-500' : 'text-emerald-500'}`}>
            <FileText size={12} /> {documentosFiltrados.length} {tipoVista} encontradas
          </span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Neto <b className="text-slate-700 font-mono normal-case">${totales.neto.toLocaleString('es-CL')}</b></span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">IVA <b className="text-slate-700 font-mono normal-case">${totales.iva.toLocaleString('es-CL')}</b></span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total <b className={`font-mono normal-case ${tipoVista === 'VENTAS' ? 'text-blue-600' : 'text-emerald-600'}`}>${totales.total.toLocaleString('es-CL')}</b></span>
        </div>

        <div className="flex items-center gap-2">
          {/* Exportar el filtro actual a Excel (CSV) */}
          <Button
            onClick={exportarCSV}
            disabled={documentosFiltrados.length === 0}
            variant="outline"
            size="sm"
            className="text-[10px] font-black uppercase tracking-widest border bg-slate-50 text-slate-500 hover:text-slate-900 hover:bg-slate-100 border-[#efe8dd] disabled:opacity-50"
          >
            <Download size={14} className="mr-2 text-emerald-600" /> Exportar Excel
          </Button>

          {/* CUÁNTO HISTORIAL SE BAJA · se elige acá, al lado del botón.
              Antes estaba fijo en 1 mes dentro del código: para traer marzo
              había que editar dos archivos y volver a desplegar. Va pegado al
              botón porque es una decisión del momento —"esta vez tráeme tres
              meses"—, no una configuración que uno va a buscar a otra pantalla.

              Cada mes extra son más páginas que recorrer en el portal del SII,
              que es lento y corta sesiones largas; por eso el aviso en las
              opciones grandes y por eso 1 mes sigue siendo lo normal. */}
          <select
            value={meses}
            onChange={(e) => setMeses(Number(e.target.value))}
            disabled={sync.activo}
            title="Cuántos meses hacia atrás bajar del SII"
            className="bg-slate-50 border border-[#efe8dd] rounded-md px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 cursor-pointer focus:outline-none focus:border-slate-400 disabled:opacity-50"
          >
            <option value={1}>Último mes</option>
            <option value={2}>2 meses</option>
            <option value={3}>3 meses</option>
            <option value={6}>6 meses (lento)</option>
            <option value={12}>12 meses (muy lento)</option>
          </select>

          {/* Sincronización con el SII. Corre en el servidor: el botón solo la
              lanza y muestra en qué va. Se puede cerrar la pantalla. */}
          <Button
            onClick={handleSincronizarSII}
            disabled={sync.activo}
            variant="outline"
            size="sm"
            title={sync.activo
              ? 'El robot está trabajando en el servidor. Puedes irte de esta pantalla.'
              : `Baja del SII las ventas y compras de ${meses === 1 ? 'el último mes' : `los últimos ${meses} meses`}. Tarda varios minutos.`}
            className={`text-[10px] font-black uppercase tracking-widest transition-all border ${
                sync.activo
                ? 'bg-indigo-50 text-indigo-600 border-indigo-200 cursor-wait'
                : 'bg-slate-50 text-slate-500 hover:text-slate-900 hover:bg-slate-100 border-[#efe8dd]'
            }`}
          >
            {sync.activo ? (
                <><Loader2 size={14} className="mr-2 animate-spin" /> Sincronizando {sync.paso}/{sync.total}</>
            ) : (
                <><Globe size={14} className="mr-2 text-indigo-400" /> Sincronizar el SII</>
            )}
          </Button>
        </div>
      </div>

      {/* EN QUÉ VA EL ROBOT. Aparece solo mientras corre. Dice el paso y lo que
          está haciendo, y deja claro que uno se puede ir: el trabajo es del
          servidor, no de esta pestaña. */}
      {sync.activo && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50">
          <Loader2 size={15} className="animate-spin text-indigo-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-semibold text-indigo-900">
                Sincronizando con el SII · paso {sync.paso} de {sync.total}
                {sync.meses ? ` · ${sync.meses === 1 ? 'último mes' : `${sync.meses} meses`}` : ''}
              </span>
              <span className="text-[11px] text-indigo-700 truncate">{sync.mensaje}</span>
            </div>
            <div className="mt-1.5 h-1 bg-indigo-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 transition-all duration-500"
                   style={{ width: `${Math.round((sync.paso / (sync.total || 2)) * 100)}%` }} />
            </div>
          </div>
          <span className="text-[10px] text-indigo-600 shrink-0 hidden sm:block">
            Puedes seguir trabajando
          </span>
        </div>
      )}

      <div ref={tableContainerRef} className="overflow-hidden rounded-2xl border border-[#efe8dd] bg-slate-50 flex flex-col pt-2 scroll-mt-24">
        <div className="overflow-x-auto custom-scrollbar w-full">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead className="bg-slate-50 border-b border-[#efe8dd]">
              <tr>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-500 tracking-widest">Documento</th>
                <th onClick={() => cambiarOrden('folio')} className="px-6 py-5 text-[10px] font-black uppercase text-slate-500 tracking-widest cursor-pointer select-none hover:text-slate-800 transition-colors">
                  Folio {orden.col === 'folio' ? (orden.dir === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-500 tracking-widest">
                    {tipoVista === 'VENTAS' ? 'Cliente' : 'Proveedor'}
                </th>
                <th onClick={() => cambiarOrden('fecha')} className="px-6 py-5 text-[10px] font-black uppercase text-slate-500 tracking-widest cursor-pointer select-none hover:text-slate-800 transition-colors">
                  Emisión {orden.col === 'fecha' ? (orden.dir === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th onClick={() => cambiarOrden('monto')} className="px-6 py-5 text-[10px] font-black uppercase text-slate-500 tracking-widest text-right cursor-pointer select-none hover:text-slate-800 transition-colors">
                  Monto {orden.col === 'monto' ? (orden.dir === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-500 text-center">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <AnimatePresence mode="popLayout">
                {loading ? (
                  <motion.tr key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <td colSpan={6} className="py-24 text-center">
                      <Loader2 className={`h-10 w-10 animate-spin mx-auto mb-4 ${tipoVista === 'VENTAS' ? 'text-blue-500' : 'text-emerald-500'}`} />
                      <p className={`text-[10px] font-black uppercase tracking-widest animate-pulse italic ${tipoVista === 'VENTAS' ? 'text-blue-600' : 'text-emerald-600'}`}>
                        Cargando bóveda {isModoGlobalActivo ? 'global' : 'local'}...
                      </p>
                    </td>
                  </motion.tr>
                ) : currentData.length > 0 ? (
                  currentData.map((dte, idx) => {
                    const nombreContraparte = tipoVista === 'VENTAS' 
                        ? (dte.razon_social || 'Cliente sin nombre') 
                        : (dte.razon_social_proveedor || 'Proveedor Desconocido');
                        
                    const rutContraparte = tipoVista === 'VENTAS' 
                        ? dte.rut_cliente 
                        : dte.rut_proveedor;

                    // Neto / IVA / Total del documento. El total se calcula robusto
                    // (monto_total viene como numeric → texto, y "0" es truthy): si
                    // está en 0 se cae a neto + IVA.
                    const netoDte = Number(dte.monto_neto) || 0;
                    const ivaDte = Number(dte.monto_iva) || 0;
                    const totalDte = totalDe(dte);

                    return (
                        <motion.tr 
                          key={dte.id || `dte-${idx}-${dte.folio}`} 
                          initial={{ opacity: 0, y: 10 }} 
                          animate={{ opacity: 1, y: 0 }} 
                          transition={{ delay: idx * 0.02 }}
                          className="hover:bg-white group transition-colors border-b border-[#efe8dd] last:border-none"
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase border ${
                                tipoVista === 'VENTAS' ? 'bg-blue-500/10 border-blue-500/20 text-blue-600' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
                            }`}>
                              {NOMBRES_DTE[dte.tipo_dte] || `DTE ${dte.tipo_dte}`}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-slate-900 italic tracking-tighter whitespace-nowrap">
                            #{dte.folio}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col">
                                <span className="text-xs text-slate-700 font-medium truncate max-w-[200px]" title={nombreContraparte}>
                                    {formatDisplay(nombreContraparte)}
                                </span>
                                <span className="text-[9px] text-slate-400 font-mono">
                                    {formatDisplay(rutContraparte)}
                                </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-500 font-medium whitespace-nowrap">
                            {dte.fecha_emision ? new Date(dte.fecha_emision).toLocaleDateString('es-CL', { timeZone: 'UTC' }) : 'Sin Fecha'}
                          </td>
                          <td className="px-6 py-4 text-right whitespace-nowrap">
                            <div className="flex flex-col items-end">
                                <span className={`text-sm font-black font-mono tracking-tighter ${tipoVista === 'VENTAS' ? 'text-blue-600' : 'text-emerald-600'}`}>
                                    ${totalDte.toLocaleString('es-CL')}
                                </span>
                                {ivaDte > 0 && (
                                    <span className="text-[9px] text-slate-400 uppercase tracking-widest mt-0.5">
                                        Neto ${netoDte.toLocaleString('es-CL')} · IVA ${ivaDte.toLocaleString('es-CL')}
                                    </span>
                                )}
                            </div>
                          </td>
                          {/* El PDF no se guarda en ninguna parte: se va a buscar
                              al SII en el momento. Por eso ya no existe el "Sin
                              PDF": cualquier documento emitido se puede bajar,
                              solo que hay que esperar a que el robot lo traiga. */}
                          <td className="px-6 py-4 text-center whitespace-nowrap">
                            <button
                              onClick={() => bajarPdf(dte)}
                              disabled={bajando === String(dte.folio)}
                              title={bajando === String(dte.folio)
                                ? 'Buscando el documento en el SII…'
                                : `Descargar el PDF del folio ${dte.folio} desde el SII`}
                              className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-slate-50 text-slate-600 border border-[#efe8dd] hover:bg-white hover:text-black transition-all shadow-lg active:scale-90 disabled:opacity-60 disabled:cursor-wait"
                            >
                              {bajando === String(dte.folio)
                                ? <Loader2 size={16} className="animate-spin text-blue-600" />
                                : <Download size={16} />}
                            </button>
                          </td>
                        </motion.tr>
                    );
                  })
                ) : (
                  <motion.tr key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <td colSpan={6} className="py-24 text-center">
                      <FileWarning size={56} className="text-slate-600 mx-auto mb-4" />
                      <p className="text-slate-900 font-black uppercase tracking-tighter italic text-xl">
                        Bóveda Vacía
                      </p>
                      <p className="text-xs text-slate-400 max-w-[300px] mx-auto uppercase tracking-widest mt-2 leading-relaxed">
                        No se encontraron resultados para "{searchTerm}". Intenta con otro término o limpia los filtros.
                      </p>
                    </td>
                  </motion.tr>
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {/* CONTROLES DE PAGINACIÓN */}
        {!loading && documentosFiltrados.length > 0 && (
          <div className="flex items-center justify-between px-6 py-4 bg-white border-t border-[#efe8dd] relative z-30">
            <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
              Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, documentosFiltrados.length)} de {documentosFiltrados.length}
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8 bg-slate-50 border-[#efe8dd] text-slate-500 hover:text-slate-900 disabled:opacity-20 transition-all font-bold text-xs"
              >
                <ChevronLeft size={14} className="mr-1" /> Ant
              </Button>
              
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-2">
                Pág {currentPage} de {totalPages}
              </div>
              
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="h-8 bg-slate-50 border-[#efe8dd] text-slate-500 hover:text-slate-900 disabled:opacity-20 transition-all font-bold text-xs"
              >
                Sig <ChevronRight size={14} className="ml-1" />
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default DocumentosDTE;