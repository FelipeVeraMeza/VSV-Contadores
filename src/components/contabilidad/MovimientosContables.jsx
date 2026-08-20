import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUpRight, ArrowDownRight, Eye, Plus, Loader2, FileCheck,
  CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Award,
  DownloadCloud, RefreshCcw, BookCopy, ChevronUp, Send,
  CheckCircle, AlertCircle, Trash2, Undo2, Save, Bot, Search
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
// getDocumentosAfectablesApi faltaba: se usaba sin importar, y como la llamada
// vive dentro de un try/catch el ReferenceError se tragaba en silencio. Efecto:
// la sugerencia automática del documento afectado SIEMPRE fallaba y toda nota
// de crédito exigía abrir el modal.
import { getChartOfAccountsApi, getDocumentosAfectablesApi } from '@/services/accountingService';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { obtenerHistorialBunker, obtenerComprasBunker } from '@/services/dteConsultasService';
import { fetchWithAuth } from '@/services/apiClient';
import NuevoMovimientoModal from '@/components/contabilidad/modals/NuevoMovimientoModal';
import AsientoDocumentoModal from '@/components/contabilidad/modals/AsientoDocumentoModal';
import SyncSIIModal from '@/components/contabilidad/modals/SyncSIIModal';
import {
  TIPO_DTE_CORTO as TIPO_DTE_MAP, CUENTAS_NOMBRE,
  generarLineasAsiento, construirGlosa, calcularMontos,
  claveDeDocumento, claveDeComprobante, esNota, esNotaCredito,
} from '@/lib/documento';
import { API_BASE_URL } from '../../../config.js';
const MESES = [
  { value: '01', label: 'ENERO' }, { value: '02', label: 'FEBRERO' },
  { value: '03', label: 'MARZO' }, { value: '04', label: 'ABRIL' },
  { value: '05', label: 'MAYO' }, { value: '06', label: 'JUNIO' },
  { value: '07', label: 'JULIO' }, { value: '08', label: 'AGOSTO' },
  { value: '09', label: 'SEPTIEMBRE' }, { value: '10', label: 'OCTUBRE' },
  { value: '11', label: 'NOVIEMBRE' }, { value: '12', label: 'DICIEMBRE' }
];
const ANIOS = ['2024', '2025', '2026', '2027'];
const ITEMS_PER_PAGE = 12;

// Selector del documento que afecta una nota de crédito/débito, para elegirlo
// SIN salir de la fila. Antes solo existía dentro de AsientoDocumentoModal: si
// el monto no calzaba con un único candidato, contabilizar desde la lista era
// imposible y había que abrir el modal solo para esto.
const SelectorDocAfectado = ({ doc, clase, empresaId, sessionId, valor, onChange }) => {
  const { data, isFetching } = useQuery({
    queryKey: ['documentos-afectables', empresaId, clase, doc.rut_cliente || doc.rut_proveedor, doc.fecha_emision],
    queryFn: async () => {
      const res = await getDocumentosAfectablesApi(sessionId, {
        empresaId,
        clase,
        rut: clase === 'compras' ? doc.rut_proveedor : doc.rut_cliente,
        fecha: doc.fecha_emision,
      });
      if (!res.ok) return [];
      return (await res.json()).documentos || [];
    },
    enabled: !!sessionId,
  });
  const afectables = data || [];

  // Preselección: solo si hay UN candidato del mismo monto. Con varios no se
  // elige, porque adivinar sería inventar contabilidad.
  React.useEffect(() => {
    if (valor || afectables.length === 0) return;
    const total = calcularMontos(doc).total;
    const exactos = afectables.filter(d => Number(d.monto_total) === total);
    if (exactos.length === 1) onChange(exactos[0]);
  }, [afectables, valor, doc, onChange]);

  return (
    <div className="px-5 py-3 border-b border-[#efe8dd] bg-amber-500/[0.04]" onClick={e => e.stopPropagation()}>
      <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
        ¿A qué documento afecta esta nota?
      </label>
      <select
        value={valor?.id ?? ''}
        disabled={isFetching}
        onChange={e => onChange(afectables.find(d => String(d.id) === String(e.target.value)) || null)}
        className={`w-full bg-white border rounded-lg px-2.5 py-2 text-xs text-slate-900 focus:outline-none disabled:opacity-50 ${
          valor ? 'border-emerald-500/50 focus:border-emerald-500' : 'border-amber-500/50 focus:border-amber-500'
        }`}
      >
        <option value="">{isFetching ? 'Buscando documentos…' : 'Seleccionar el documento afectado…'}</option>
        {afectables.map(d => (
          <option key={d.id} value={d.id}>
            {(TIPO_DTE_MAP[d.tipo_dte] || `Tipo ${d.tipo_dte}`)} #{d.folio}
            {' · '}{new Intl.NumberFormat('es-CL', { style:'currency', currency:'CLP', minimumFractionDigits:0 }).format(Number(d.monto_total) || 0)}
            {d.fecha_emision ? ` · ${String(d.fecha_emision).substring(0, 10)}` : ''}
          </option>
        ))}
      </select>
      {!isFetching && afectables.length === 0 && (
        <p className="text-[10px] text-amber-600/80 mt-1.5">
          No hay documentos anteriores de este mismo RUT para afectar.
        </p>
      )}
    </div>
  );
};

const formatText = (str) => str ? str.toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase() : '';
const formatCLP = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(val || 0);

const COLOR_MAP = {
  ventas:    { active: 'bg-emerald-500/10 text-emerald-600 border-b-2 border-emerald-500', badge: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20', total: 'text-emerald-600', row: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  compras:   { active: 'bg-red-500/10 text-red-500 border-b-2 border-red-500',             badge: 'bg-red-500/10 text-red-500 border border-red-500/20',             total: 'text-red-500',     row: 'bg-red-500/10 text-red-500 border-red-500/20' },
  honorarios:{ active: 'bg-amber-500/10 text-amber-600 border-b-2 border-amber-500',       badge: 'bg-amber-500/10 text-amber-600 border border-amber-500/20',       total: 'text-amber-600',   row: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
};

// El asiento por defecto lo genera `generarLineasAsiento` (src/lib/documento.js),
// compartido con AsientoDocumentoModal para que un mismo documento no produzca
// asientos distintos según desde dónde se contabilice.
const calcLineasDefault = (doc, tipo) => generarLineasAsiento(doc, tipo);

const MovimientosContables = ({ empresaId, onGenerarBorrador, mes: mesProp, anio: anioProp, setMes: setMesProp, setAnio: setAnioProp, tipoInicial, ocultarTabs, rango }) => {
  const { user, selectedCompany } = useAuth();
  const queryClient = useQueryClient();
  const targetId = empresaId || selectedCompany?.id || 'ALL';

  const [activeTab, setActiveTab]           = useState(tipoInicial || 'ventas');
  const [isLoading, setIsLoading]           = useState(false);
  const [isSyncing, setIsSyncing]           = useState(false);
  const [rawVentas, setRawVentas]           = useState([]);
  const [rawCompras, setRawCompras]         = useState([]);
  const [honorarios]                        = useState([]);
  const [currentPage, setCurrentPage]       = useState(1);
  const [busqueda, setBusqueda]             = useState('');
  // 'pendiente' por defecto: el trabajo del día es contabilizar lo que falta, así
  // que la pantalla abre mostrando eso. Si no queda nada pendiente, el aviso de
  // lista vacía ofrece el enlace para ver todas.
  const [filtroEstado, setFiltroEstado]     = useState('pendiente'); // contabilizado | pendiente | todos
  const [isNuevoModalOpen, setIsNuevoModalOpen]   = useState(false);
  const [isAsientoModalOpen, setIsAsientoModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen]     = useState(false);
  const [selectedDocumento, setSelectedDocumento] = useState(null);
  const [expandedRows, setExpandedRows]           = useState(new Set());
  const [rowEdits, setRowEdits]                   = useState({});
  // rowId → documento afectado elegido a mano para una nota de crédito/débito
  const [refPorFila, setRefPorFila]               = useState({});
  // rowId → { activo, medio } para marcar el documento como cobrado/pagado
  // en el mismo acto de contabilizarlo.
  const [pagoPorFila, setPagoPorFila]             = useState({});
  const [savingRows, setSavingRows]               = useState(new Set());
  const [isLibroModalOpen, setIsLibroModalOpen]   = useState(false);
  const [tipoPeriodoLibro, setTipoPeriodoLibro]   = useState('mensual');
  const [diaLibro, setDiaLibro]                   = useState('01');

  // Usar período del padre si viene como prop, sino estado interno
  const now = new Date();
  const [mesInterno,  setMesInterno]  = useState((now.getMonth() + 1).toString().padStart(2, '0'));
  const [anioInterno, setAnioInterno] = useState(now.getFullYear().toString());
  const mes  = mesProp  ?? mesInterno;
  const anio = anioProp ?? anioInterno;
  const setMes  = setMesProp  ?? setMesInterno;
  const setAnio = setAnioProp ?? setAnioInterno;

  // Período APLICADO: la lista solo se actualiza al presionar "Buscar" (no en vivo)
  const [periodoAplicado, setPeriodoAplicado] = useState({ desde: rango?.desde, hasta: rango?.hasta, mes, anio });
  const hayCambiosPeriodo =
    periodoAplicado.desde !== (rango?.desde ?? undefined) ||
    periodoAplicado.hasta !== (rango?.hasta ?? undefined) ||
    periodoAplicado.mes !== mes || periodoAplicado.anio !== anio;
  const aplicarBusqueda = () => setPeriodoAplicado({ desde: rango?.desde, hasta: rango?.hasta, mes, anio });

  // ── Cargar movimientos ────────────────────────────────────────
  const cargarDatos = useCallback(async () => {
    setIsLoading(true);
    try {
      const [resV, resC] = await Promise.all([
        obtenerHistorialBunker(targetId, user?.sessionId),
        obtenerComprasBunker(targetId, user?.sessionId),
      ]);
      setRawVentas(resV.ok ? (resV.documentos || []) : []);
      setRawCompras(resC.ok ? (resC.documentos || []) : []);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar los movimientos.' });
    } finally {
      setIsLoading(false);
    }
  }, [targetId, user?.sessionId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => { cargarDatos(); }, [targetId, user?.sessionId]);
  React.useEffect(() => { setCurrentPage(1); }, [activeTab, busqueda, periodoAplicado, filtroEstado]);
  React.useEffect(() => { if (tipoInicial) setActiveTab(tipoInicial); }, [tipoInicial]);

  // ── Plan de cuentas para dropdowns inline ────────────────────
  const { data: planData } = useQuery({
    queryKey: ['chart-of-accounts', targetId],
    queryFn: async () => {
      const res = await getChartOfAccountsApi(user.sessionId, targetId);
      if (!res.ok) return [];
      return (await res.json()).plan || [];
    },
    enabled: !!user?.sessionId,
  });
  const plan = planData || [];
  const getNombre = (codigo) => plan.find(c => c.codigo === codigo)?.descripcion || CUENTAS_NOMBRE[codigo] || codigo;

  // ── Cargar comprobantes guardados ─────────────────────────────
  const { data: dataComp } = useQuery({
    queryKey: ['comprobantes', targetId],
    queryFn: async () => {
      const param = (!targetId || targetId === 'ALL') ? 'null' : targetId;
      const res = await fetchWithAuth(`/accounting/comprobantes?empresaId=${param}`, user.sessionId);
      if (!res.ok) return { comprobantes: [] };
      return res.json();
    },
    enabled: !!user?.sessionId,
  });

  // Mapa documento → comprobante contabilizado (número, responsable, líneas).
  // La clave es la identidad completa del documento, no el folio suelto: antes
  // se indexaba por el número extraído de la glosa, así que una factura de este
  // año aparecía como contabilizada porque existía otro documento con el mismo
  // folio (una nota de crédito, otro proveedor o el año anterior).
  const folioMap = useMemo(() => {
    const map = {};
    (dataComp?.comprobantes || []).forEach(comp => {
      if (comp.folio === null || comp.folio === undefined) return;
      map[claveDeComprobante(comp)] = {
        guardado: true,
        estado: comp.estado,
        numero: comp.numeroComprobante ?? comp.numero_comprobante,
        contabilizadoPor: comp.contabilizadoPor ?? comp.contabilizado_por,
        contabilizadoAt: comp.contabilizadoAt ?? comp.contabilizado_at,
        lineas: comp.lineas || [],
        // Mismo motivo que en claveDeComprobante: la respuesta llega camelizada.
        refFolio: comp.refFolio ?? comp.ref_folio,
        refTipoDte: comp.refTipoDte ?? comp.ref_tipo_dte,
      };
    });
    return map;
  }, [dataComp]);

  // Comprobante de un documento del listado (o undefined si está pendiente).
  const comprobanteDe = useCallback(
    (doc, clase = activeTab) => folioMap[claveDeDocumento(doc, clase)],
    [folioMap, activeTab]
  );

  const periodo = `${periodoAplicado.anio}-${periodoAplicado.mes}`;
  // Se filtra por el período APLICADO (al presionar "Buscar"), no por el seleccionado en vivo.
  const dentroPeriodo = (d) => {
    if (!d.fecha_emision) return false;
    if (periodoAplicado.desde && periodoAplicado.hasta) {
      const f = String(d.fecha_emision).slice(0, 10);
      return f >= periodoAplicado.desde && f <= periodoAplicado.hasta;
    }
    return d.fecha_emision.startsWith(periodo);
  };
  const ventas  = useMemo(() => rawVentas.filter(dentroPeriodo),  [rawVentas, periodoAplicado]); // eslint-disable-line react-hooks/exhaustive-deps
  const compras = useMemo(() => rawCompras.filter(dentroPeriodo), [rawCompras, periodoAplicado]); // eslint-disable-line react-hooks/exhaustive-deps

  const docPorTab = activeTab === 'ventas' ? ventas : activeTab === 'compras' ? compras : honorarios;

  // Filtro de estado (contabilizado/pendiente) + buscador unificado (folio + RUT + nombre)
  const docActivos = useMemo(() => {
    let docs = docPorTab;
    if (filtroEstado === 'contabilizado') docs = docs.filter(d => comprobanteDe(d));
    else if (filtroEstado === 'pendiente') docs = docs.filter(d => !comprobanteDe(d));
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase().replace(/[.\-\s]/g, '');
      docs = docs.filter(doc => {
        const rut   = (activeTab === 'compras' ? doc.rut_proveedor : doc.rut_cliente) || '';
        const razon = (activeTab === 'compras' ? doc.razon_social_proveedor : doc.razon_social) || '';
        const hay = `${doc.folio || ''} ${rut} ${razon}`.toLowerCase().replace(/[.\-\s]/g, '');
        return hay.includes(q);
      });
    }
    return docs;
  }, [docPorTab, busqueda, activeTab, filtroEstado, comprobanteDe]);

  const totalPages = Math.ceil(docActivos.length / ITEMS_PER_PAGE) || 1;
  const currentData = docActivos.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Los totales salen de calcularMontos, igual que el asiento y el cobro. Antes
  // acá se calculaba aparte y con otra regla, así que la cabecera y el asiento
  // del mismo documento mostraban cifras distintas.
  const totales = useMemo(() => docActivos.reduce((acc, doc) => {
    const { neto, iva, total } = calcularMontos(doc);
    return { count: acc.count + 1, total: acc.total + total, neto: acc.neto + neto, iva: acc.iva + iva };
  }, { count: 0, total: 0, neto: 0, iva: 0 }), [docActivos]);

  const hayDatos = ventas.length > 0 || compras.length > 0;

  // ── Libro: filtrado reactivo por período ──────────────────────
  const diasDelMes = useMemo(() => {
    const n = new Date(parseInt(anio), parseInt(mes), 0).getDate();
    return Array.from({ length: n }, (_, i) => (i + 1).toString().padStart(2, '0'));
  }, [mes, anio]);

  const { libroVentas, libroCompras, libroPeriodo } = useMemo(() => {
    // El rango aplicado (al presionar "Buscar") prevalece sobre el período interno del modal
    if (periodoAplicado.desde && periodoAplicado.hasta) {
      const filtro = d => {
        if (!d.fecha_emision) return false;
        const f = String(d.fecha_emision).slice(0, 10);
        return f >= periodoAplicado.desde && f <= periodoAplicado.hasta;
      };
      return { libroVentas: rawVentas.filter(filtro), libroCompras: rawCompras.filter(filtro), libroPeriodo: `${periodoAplicado.desde} A ${periodoAplicado.hasta}` };
    }
    const mesNum = parseInt(mes);
    const trimestre = Math.ceil(mesNum / 3);
    const mesInicioTrim = ((trimestre - 1) * 3 + 1).toString().padStart(2, '0');
    const mesFinTrim = (trimestre * 3).toString().padStart(2, '0');
    let filtro, label;
    switch (tipoPeriodoLibro) {
      case 'diario':
        filtro = d => d.fecha_emision?.startsWith(`${anio}-${mes}-${diaLibro}`);
        label = `${diaLibro}/${mes}/${anio}`;
        break;
      case 'trimestral':
        filtro = d => {
          if (!d.fecha_emision) return false;
          const dMes = d.fecha_emision.substring(5, 7);
          const dAnio = d.fecha_emision.substring(0, 4);
          return dAnio === anio && dMes >= mesInicioTrim && dMes <= mesFinTrim;
        };
        label = `T${trimestre} ${anio}`;
        break;
      case 'anual':
        filtro = d => d.fecha_emision?.startsWith(anio);
        label = `AÑO ${anio}`;
        break;
      default:
        filtro = d => d.fecha_emision?.startsWith(`${anio}-${mes}`);
        label = `${mes}/${anio}`;
    }
    return { libroVentas: rawVentas.filter(filtro), libroCompras: rawCompras.filter(filtro), libroPeriodo: label };
  }, [tipoPeriodoLibro, mes, anio, diaLibro, rawVentas, rawCompras, periodoAplicado]);

  // Contabilizado = tiene comprobante en la BD (coherente con la centralización)
  const libroVentasGuardadas  = useMemo(() => libroVentas.filter(d => comprobanteDe(d, 'ventas')),   [libroVentas,  comprobanteDe]);
  const libroComprasGuardadas = useMemo(() => libroCompras.filter(d => comprobanteDe(d, 'compras')), [libroCompras, comprobanteDe]);
  const libroVentasPendientes  = libroVentas.length  - libroVentasGuardadas.length;
  const libroComprasPendientes = libroCompras.length - libroComprasGuardadas.length;
  const libroPendientesTotal   = libroVentasPendientes + libroComprasPendientes;

  const libroAsientos = useMemo(() => {
    // Solo se centraliza lo que YA está contabilizado (tiene comprobante).
    const getLineasDoc = (doc, clase) => {
      const comp = comprobanteDe(doc, clase);
      return comp ? comp.lineas.map(l => ({ cuenta: l.cuentaCodigo || l.cuenta_codigo, debe: Number(l.debe)||0, haber: Number(l.haber)||0 })) : [];
    };
    const acumular = (docs, tipo) => {
      const mapa = {};
      docs.forEach(doc => getLineasDoc(doc, tipo).forEach(l => {
        if (!l.cuenta) return;
        if (!mapa[l.cuenta]) mapa[l.cuenta] = { descripcion: getNombre(l.cuenta), debe: 0, haber: 0, detalle: [] };
        mapa[l.cuenta].debe  += Number(l.debe)  || 0;
        mapa[l.cuenta].haber += Number(l.haber) || 0;
        const rut   = tipo === 'compras' ? doc.rut_proveedor : doc.rut_cliente;
        const razon = formatText(tipo === 'compras' ? doc.razon_social_proveedor : doc.razon_social);
        mapa[l.cuenta].detalle.push({
          folio: doc.folio,
          razon: razon || rut || '—',
          fecha: doc.fecha_emision,
          debe: Number(l.debe) || 0,
          haber: Number(l.haber) || 0,
        });
      }));
      return mapa;
    };
    const ventasC  = libroVentas.filter(d => comprobanteDe(d, 'ventas'));
    const comprasC = libroCompras.filter(d => comprobanteDe(d, 'compras'));
    const mapaV = acumular(ventasC,  'ventas');
    const mapaC = acumular(comprasC, 'compras');
    const lineas = [];
    if (ventasC.length > 0) {
      lineas.push({ tipo: 'header', glosa: `CENTRALIZACIÓN VENTAS ${libroPeriodo}` });
      Object.entries(mapaV).forEach(([codigo, { descripcion, debe, haber, detalle }]) => { if (debe > 0 || haber > 0) lineas.push({ codigo, descripcion, debe, haber, detalle }); });
    }
    if (comprasC.length > 0) {
      lineas.push({ tipo: 'header', glosa: `CENTRALIZACIÓN COMPRAS ${libroPeriodo}` });
      Object.entries(mapaC).forEach(([codigo, { descripcion, debe, haber, detalle }]) => { if (debe > 0 || haber > 0) lineas.push({ codigo, descripcion, debe, haber, detalle }); });
    }
    return lineas;
  }, [libroVentas, libroCompras, libroPeriodo, comprobanteDe, plan]);

  // ── Toggle fila expandida ─────────────────────────────────────
  const toggleRow = (rowId, doc) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
        // Inicializar edición con líneas guardadas o por defecto
        if (!rowEdits[rowId]) {
          const comp = comprobanteDe(doc);
          const lineas = comp
            ? comp.lineas.map(l => ({ cuenta: l.cuentaCodigo || l.cuenta_codigo, nombre: l.descripcion || l.cuentaCodigo || l.cuenta_codigo, debe: Number(l.debe)||0, haber: Number(l.haber)||0 }))
            : calcLineasDefault(doc, activeTab);
          setRowEdits(e => ({ ...e, [rowId]: lineas }));
        }
      }
      return next;
    });
  };

  const updateLinea = (rowId, idx, field, value) => {
    setRowEdits(prev => ({
      ...prev,
      [rowId]: prev[rowId].map((l, i) => {
        if (i !== idx) return l;
        const updated = { ...l, [field]: field === 'cuenta' ? value : (Number(value) || 0) };
        if (field === 'cuenta') updated.nombre = getNombre(value);
        return updated;
      })
    }));
  };

  const addLinea = (rowId) => {
    setRowEdits(prev => ({ ...prev, [rowId]: [...(prev[rowId]||[]), { cuenta:'', nombre:'', debe:0, haber:0 }] }));
  };

  const removeLinea = (rowId, idx) => {
    setRowEdits(prev => ({ ...prev, [rowId]: prev[rowId].filter((_, i) => i !== idx) }));
  };

  // Payload de contabilización de un documento. `clase` y `tipoDte` viajan
  // separados: el tipo de DTE no se deduce de si es venta o compra.
  const construirPayload = (doc, clase, lineas, referencia, pago = null) => {
    const isCompra = clase === 'compras' || clase === 'compra';
    const rut = isCompra ? doc.rut_proveedor : doc.rut_cliente;
    const razon = formatText(isCompra ? doc.razon_social_proveedor : doc.razon_social);
    return {
      // El backend registra el movimiento de caja en la MISMA transacción del
      // asiento: si uno falla, no queda ninguno de los dos.
      pago: pago && {
        medio: pago.medio,
        fecha: doc.fecha_emision,
        monto: calcularMontos(doc).total,
        nombre: razon,
      },
      empresaId: (!targetId || targetId === 'ALL') ? null : targetId,
      clase,
      tipoDte: doc.tipo_dte,
      folio: doc.folio,
      fecha: doc.fecha_emision,
      glosa: construirGlosa({
        clase, tipoDte: doc.tipo_dte, folio: doc.folio, razonSocial: razon, rut,
        refTipoDte: referencia?.tipo_dte, refFolio: referencia?.folio,
      }),
      rutAsociado: rut,
      lineas: lineas.map(l => ({ cuenta: l.cuenta, debe: l.debe, haber: l.haber })),
      refFolio: referencia?.folio ?? null,
      refTipoDte: referencia?.tipo_dte ?? null,
      refRazon: referencia?.razon ?? null,
    };
  };

  // Busca el documento que afecta una nota de crédito/débito. Solo se acepta
  // automáticamente cuando hay UN candidato del mismo monto: adivinar entre
  // varios sería inventar contabilidad.
  const sugerirReferencia = useCallback(async (doc, clase) => {
    const isCompra = clase === 'compras' || clase === 'compra';
    const rut = isCompra ? doc.rut_proveedor : doc.rut_cliente;
    try {
      const res = await getDocumentosAfectablesApi(user.sessionId, {
        empresaId: targetId, clase, rut, fecha: doc.fecha_emision,
      });
      if (!res.ok) return null;
      const { documentos = [] } = await res.json();
      const total = calcularMontos(doc).total;
      const exactos = documentos.filter(d => Number(d.monto_total) === total);
      return exactos.length === 1 ? exactos[0] : null;
    } catch {
      return null;
    }
  }, [user.sessionId, targetId]);

  const saveLineas = async (rowId, doc) => {
    const lineas = rowEdits[rowId] || [];
    const totalDebe  = lineas.reduce((s,l) => s+(Number(l.debe)||0), 0);
    const totalHaber = lineas.reduce((s,l) => s+(Number(l.haber)||0), 0);
    if (Math.abs(totalDebe - totalHaber) > 1) {
      toast({ variant:'destructive', title:'Descuadre', description:`Debe ${formatCLP(totalDebe)} ≠ Haber ${formatCLP(totalHaber)}` });
      return;
    }
    setSavingRows(prev => new Set(prev).add(rowId));
    try {
      // Una nota necesita saber a qué documento pertenece. Manda lo elegido en
      // el selector de la fila; si no se tocó, se intenta deducir por monto.
      let referencia = null;
      if (esNota(doc.tipo_dte)) {
        referencia = refPorFila[rowId] || await sugerirReferencia(doc, activeTab);
        if (!referencia) {
          toast({
            variant: 'destructive',
            title: 'Falta el documento afectado',
            description: `Elegí a qué documento afecta la ${esNotaCredito(doc.tipo_dte) ? 'nota de crédito' : 'nota de débito'} #${doc.folio} en el selector de arriba.`,
          });
          return;
        }
      }
      const pago = pagoPorFila[rowId]?.activo ? pagoPorFila[rowId] : null;
      const res = await fetchWithAuth('/accounting/comprobantes', user.sessionId, {
        method: 'POST',
        body: construirPayload(doc, activeTab, lineas, referencia, pago),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      const accion = data.accion === 'actualizado' ? 'Asiento actualizado' : 'Asiento guardado';
      const detalle = referencia
        ? `Comprobante N° ${data.numero} — folio #${doc.folio}, afecta #${referencia.folio}`
        : `Comprobante N° ${data.numero} — folio #${doc.folio}`;
      toast({
        title: `✅ ${accion}${data.recaudacion ? ' + pago registrado' : ''}`,
        description: data.recaudacion
          ? `${detalle}. Se registró el ${activeTab === 'compras' ? 'pago' : 'cobro'} por ${formatCLP(Number(data.recaudacion.monto))}.`
          : detalle,
      });
      queryClient.invalidateQueries({ queryKey: ['comprobantes', targetId] });
    } catch (err) {
      toast({ variant:'destructive', title:'Error', description: err.message });
    } finally {
      setSavingRows(prev => { const n = new Set(prev); n.delete(rowId); return n; });
    }
  };

  // ── Asiento al hacer clic en ojo ──────────────────────────────
  const handleVerAsiento = (doc) => {
    setSelectedDocumento({ ...doc, tipoMovimiento: activeTab });
    setIsAsientoModalOpen(true);
  };

  // ── Descontabilizar: borra el asiento y devuelve el documento a Pendiente ──
  // Antes este botón llamaba a DELETE /movimiento/:id, que borra el documento
  // ADEMÁS del asiento. Como el ícono es un basurero en la columna "Asiento",
  // se leía como "borrar el asiento" y en realidad hacía perder una factura
  // traída del SII, que después hay que volver a extraer.
  const [deletingDocId, setDeletingDocId] = useState(null);
  const handleDescontabilizar = async (doc) => {
    if (!doc.id) {
      toast({ variant: 'destructive', title: 'No se puede deshacer', description: 'El documento no tiene identificador.' });
      return;
    }
    if (!confirm(`¿Quitar el asiento del folio #${doc.folio}?\n\nEl documento NO se borra: vuelve a quedar como Pendiente y lo puedes contabilizar de nuevo.`)) return;
    setDeletingDocId(doc.id);
    try {
      const params = new URLSearchParams({ tipo_movimiento: activeTab, empresa_id: String(targetId) });
      const res = await fetchWithAuth(`/dte-consulta/movimiento/${doc.id}/asiento?${params}`, user.sessionId, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al quitar el asiento');
      toast({ title: '↩️ Asiento eliminado', description: `Folio #${doc.folio} volvió a Pendiente.` });
      queryClient.invalidateQueries({ queryKey: ['comprobantes', targetId] });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setDeletingDocId(null);
    }
  };

  // ── Bot de contabilización (lote) ─────────────────────────────
  const [isContabilizando, setIsContabilizando] = useState(false);
  const [autoContabilizar, setAutoContabilizar] = useState(false);

  const contabilizarLote = async (docs, tipoMov) => {
    let ok = 0, fail = 0, sinReferencia = 0;
    for (const doc of docs) {
      try {
        // Las notas cuyo documento afectado no se puede determinar sin
        // ambigüedad quedan fuera del lote: las asigna la persona en el modal.
        let referencia = null;
        if (esNota(doc.tipo_dte)) {
          referencia = await sugerirReferencia(doc, tipoMov);
          if (!referencia) { sinReferencia++; continue; }
        }
        const res = await fetchWithAuth('/accounting/comprobantes', user.sessionId, {
          method: 'POST',
          body: construirPayload(doc, tipoMov, calcLineasDefault(doc, tipoMov), referencia),
        });
        if (res.ok) ok++; else fail++;
      } catch { fail++; }
    }
    return { ok, fail, sinReferencia };
  };

  // Sin parámetro `auto`: la confirmación es SIEMPRE obligatoria.
  //
  // Antes recibía `auto = true` desde la extracción del SII y en ese modo se
  // saltaba el confirm, así que contabilizaba en lote sin preguntar. Se quitó el
  // parámetro en vez de solo dejar de pasarlo, para que nadie pueda reactivar el
  // atajo sin darse cuenta.
  const handleContabilizarTodo = async () => {
    const ventasPend  = ventas.filter(d => !comprobanteDe(d, 'ventas'));
    const comprasPend = compras.filter(d => !comprobanteDe(d, 'compras'));
    const total = ventasPend.length + comprasPend.length;
    if (total === 0) {
      toast({ title: 'Todo contabilizado', description: 'No hay documentos pendientes en el período.' });
      return;
    }
    if (!confirm(`¿Contabilizar ${total} documento(s) pendiente(s) del período con su asiento sugerido?`)) return;
    setIsContabilizando(true);
    try {
      const r1 = await contabilizarLote(ventasPend, 'ventas');
      const r2 = await contabilizarLote(comprasPend, 'compras');
      const ok = r1.ok + r2.ok;
      const fail = r1.fail + r2.fail;
      const sinRef = r1.sinReferencia + r2.sinReferencia;
      const notas = [];
      if (fail) notas.push(`${fail} con error`);
      if (sinRef) notas.push(`${sinRef} nota(s) esperan que indiques el documento afectado`);
      toast({
        title: `✅ ${ok} contabilizado${ok !== 1 ? 's' : ''}`,
        description: notas.length
          ? `${notas.join(' · ')}.`
          : 'Pendientes del período listos.',
      });
      cargarDatos();
      queryClient.invalidateQueries(['comprobantes', targetId]);
    } finally {
      setIsContabilizando(false);
    }
  };

  // Extraer del SII ya NO contabiliza solo.
  //
  // Antes, al terminar una extracción exitosa se disparaba `handleContabilizarTodo`
  // sobre todo lo recién traído: una sola extracción de 3 meses generó 51 asientos
  // sin que nadie los pidiera. Contabilizar es una decisión del contador —revisar
  // cuentas, notas de crédito, documentos que no corresponden— así que se hace
  // desde el botón "Contabilizar todo" o fila por fila, nunca de forma implícita.
  React.useEffect(() => {
    if (autoContabilizar) setAutoContabilizar(false);
  }, [autoContabilizar]);

  const handleEnviarLibroDiario = () => {
    if (libroAsientos.length === 0) {
      toast({ variant: 'destructive', title: 'Sin movimientos', description: `No hay datos para ${libroPeriodo}.` });
      return;
    }
    onGenerarBorrador?.({ asientos: libroAsientos, periodoLabel: libroPeriodo, tipoPeriodo: tipoPeriodoLibro, mes, anio });
    toast({ title: '✅ Libro enviado', description: `Centralización ${libroPeriodo} disponible en Libro Diario.` });
    setIsLibroModalOpen(false);
  };

  // ── SII ───────────────────────────────────────────────────────
  const abrirSyncModal = () => {
    if (!selectedCompany?.rut || !selectedCompany?.claveSII) {
      toast({ variant:'destructive', title:'Credenciales Faltantes', description:'La empresa no tiene RUT o Clave SII configurada.' });
      return;
    }
    if (targetId === 'ALL') {
      toast({ variant:'destructive', title:'Selecciona una empresa', description:'Debes seleccionar una empresa para sincronizar.' });
      return;
    }
    setIsSyncModalOpen(true);
  };

  const handleSyncSII = async ({ mesDesde, anioDesde, mesHasta, anioHasta }) => {
    setIsSyncing(true);
    toast({ title:'🤖 Robot SII Iniciado', description:`Extrayendo ${mesDesde}/${anioDesde} → ${mesHasta}/${anioHasta}...` });
    try {
      const result = await (await fetch(`${API_BASE_URL}/sincronizar-sii`, {
        method:'POST', headers:{'Content-Type':'application/json', 'x-session-id': user?.sessionId},
        // Sin credenciales: el backend las lee de la ficha del cliente. Antes se
        // enviaban el RUT y la clave del SII desde el navegador.
        body: JSON.stringify({ mesDesde, anioDesde, mesHasta, anioHasta, empresaId: targetId }),
      })).json();
      if (result.success) {
        toast({
          title: '✅ Extracción Exitosa',
          description: `${result.message} Quedaron como Pendientes: revísalos y contabiliza cuando corresponda.`,
        });
        setIsSyncModalOpen(false);
        cargarDatos();
      } else {
        toast({ variant:'destructive', title:'❌ Error en el Robot', description: result.message });
      }
    } catch {
      toast({ variant:'destructive', title:'Error de Conexión', description:'No se pudo contactar al servidor.' });
    } finally {
      setIsSyncing(false);
    }
  };

  const colors = COLOR_MAP[activeTab];
  const TABS = [
    { id:'ventas',    label:'Ventas',    icon:ArrowUpRight,   count: ventas.length },
    { id:'compras',   label:'Compras',   icon:ArrowDownRight, count: compras.length },
    { id:'honorarios',label:'Honorarios',icon:Award,          count: honorarios.length },
  ];

  return (
    <div className="space-y-5">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* `flex-wrap`: en teléfono el selector de mes, el botón Buscar, el
            buscador y los filtros no caben en una fila. Sin envolver, los
            últimos quedaban FUERA de la pantalla y recortados — el filtro
            «Todos» no se podía tocar. Medido en un iPhone SE: se salían 126px. */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-1 min-w-0">
          {!rango?.desde && (
            <div className="flex items-center bg-slate-50 border border-[#efe8dd] rounded-xl px-1 py-1 flex-shrink-0">
              <div className="flex items-center pl-3 pr-1"><CalendarDays className="h-4 w-4 text-blue-600" /></div>
              <select value={mes} onChange={e => setMes(e.target.value)}
                className="bg-transparent text-slate-700 text-xs font-black uppercase tracking-widest px-2 py-2 focus:outline-none appearance-none cursor-pointer hover:text-blue-600 transition-colors">
                {MESES.map(m => <option key={m.value} value={m.value} className="bg-white text-slate-700">{m.label}</option>)}
              </select>
              <span className="text-slate-700/20 font-light mx-1">/</span>
              <select value={anio} onChange={e => setAnio(e.target.value)}
                className="bg-transparent text-slate-700 text-xs font-black uppercase tracking-widest px-2 py-2 focus:outline-none appearance-none cursor-pointer hover:text-blue-600 transition-colors">
                {ANIOS.map(a => <option key={a} value={a} className="bg-white text-slate-700">{a}</option>)}
              </select>
              <div className="pr-3 pl-1 pointer-events-none"><ChevronDown className="h-4 w-4 text-slate-400" /></div>
            </div>
          )}
          {/* BOTÓN BUSCAR: aplica el período seleccionado (la lista no cambia hasta presionarlo) */}
          <Button onClick={aplicarBusqueda}
            className={`flex-shrink-0 font-black uppercase text-[10px] tracking-widest h-[42px] px-4 transition-all ${
              hayCambiosPeriodo
                ? 'bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white shadow-lg shadow-emerald-900/40 ring-2 ring-blue-400/40 animate-pulse'
                : 'bg-blue-600/80 hover:bg-blue-600 text-white'
            }`}>
            <Search className="h-4 w-4 mr-2" /> Buscar
          </Button>
          {/* BUSCADOR unificado: folio + RUT + nombre.
              `min-w-[180px]` para que al envolverse no quede un campo de dos
              centímetros imposible de usar. */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por folio, RUT o nombre..."
              className="w-full bg-slate-50 border border-[#efe8dd] rounded-xl pl-9 pr-8 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 transition-colors" />
            {busqueda && (
              <button onClick={() => setBusqueda('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900">
                <span className="text-xs">✕</span>
              </button>
            )}
          </div>

          {/* FILTRO DE ESTADO */}
          <div className="flex items-center bg-slate-50 border border-[#efe8dd] rounded-xl p-1 flex-shrink-0">
            {[
              { id: 'contabilizado', label: '✓ Contabilizados' },
              { id: 'pendiente',     label: 'Pendientes' },
              { id: 'todos',         label: 'Todos' },
            ].map(f => (
              <button key={f.id} onClick={() => setFiltroEstado(f.id)}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                  filtroEstado === f.id
                    ? (f.id === 'contabilizado' ? 'bg-emerald-600 text-white' : f.id === 'pendiente' ? 'bg-amber-600 text-white' : 'bg-blue-600 text-white')
                    : 'text-slate-500 hover:text-slate-900'
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={abrirSyncModal} disabled={isSyncing || targetId === 'ALL'}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-900 font-black uppercase text-[10px] tracking-widest">
            {isSyncing ? <RefreshCcw className="h-4 w-4 mr-2 animate-spin" /> : <DownloadCloud className="h-4 w-4 mr-2" />}
            {isSyncing ? 'EXTRAYENDO...' : 'EXTRAER DE SII'}
          </Button>
          <Button onClick={() => setIsNuevoModalOpen(true)}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-slate-900 font-black uppercase text-[10px] tracking-widest">
            <Plus className="h-4 w-4 mr-2" />
            Nueva {activeTab === 'ventas' ? 'Venta' : activeTab === 'compras' ? 'Compra' : 'Honorario'}
          </Button>
          <Button onClick={() => handleContabilizarTodo()} disabled={isContabilizando || !hayDatos}
            className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 disabled:opacity-50 text-slate-900 font-black uppercase text-[10px] tracking-widest">
            {isContabilizando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Bot className="h-4 w-4 mr-2" />}
            {isContabilizando ? 'CONTABILIZANDO...' : 'CONTABILIZAR TODO'}
          </Button>
          <Button onClick={() => setIsLibroModalOpen(true)} disabled={!hayDatos}
            className={`font-black uppercase text-[10px] tracking-widest transition-all ${
              hayDatos ? 'bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white shadow-lg shadow-emerald-900/30'
              : 'bg-slate-50 border border-[#efe8dd] text-slate-400 opacity-50 cursor-not-allowed'
            }`}>
            <BookCopy className="h-4 w-4 mr-2" />
            CENTRALIZAR
          </Button>
        </div>
      </div>

      {/* SUB-TABS (se ocultan cuando la navegación viene del menú de Contabilidad) */}
      {!ocultarTabs && (
      <div className="flex border-b border-[#efe8dd]">
        {TABS.map(({ id, label, icon: Icon, count }) => {
          const isActive = activeTab === id;
          const cm = COLOR_MAP[id];
          return (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-6 py-3.5 font-black uppercase text-[10px] tracking-widest transition-all ${isActive ? cm.active : 'text-slate-400 hover:text-slate-900 hover:bg-slate-100'}`}>
              <Icon className="h-3.5 w-3.5" />
              {label}
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-black ${isActive ? cm.badge : 'bg-slate-50 text-slate-400'}`}>{count}</span>
            </button>
          );
        })}
      </div>
      )}

      {/* RESUMEN */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label:'Documentos', value: String(totales.count) },
          { label:'Neto',       value: formatCLP(totales.neto) },
          { label:'IVA 19%',    value: formatCLP(totales.iva) },
          { label:'Total',      value: formatCLP(totales.total) },
        ].map(item => (
          <div key={item.label} className="bg-slate-50 rounded-xl border border-[#efe8dd] p-4">
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">{item.label}</p>
            <p className="font-black text-slate-900 font-mono text-sm tracking-tighter">{item.value}</p>
          </div>
        ))}
      </div>

      {/* TABLA */}
      <div className="bg-white rounded-xl border border-[#efe8dd] overflow-hidden backdrop-blur-md shadow-2xl">
        {isLoading ? (
          <div className="p-16 flex flex-col items-center justify-center">
            <Loader2 className="h-10 w-10 text-blue-500 animate-spin mb-4" />
            <span className="text-blue-600 font-black text-xs uppercase tracking-widest animate-pulse">Consultando Bunker...</span>
          </div>
        ) : docActivos.length === 0 ? (
          <div className="p-16 text-center flex flex-col items-center justify-center">
            <div className="bg-slate-50 p-5 rounded-full mb-4 border border-[#efe8dd]">
              <FileCheck className="h-8 w-8 text-slate-400" />
            </div>
            <h4 className="text-slate-900 font-black tracking-wide uppercase text-sm">Sin Registros</h4>
            {/* Distingue "no hay documentos" de "los hay, pero el filtro los esconde":
                antes ambos casos decían lo mismo y parecía que faltaban los datos. */}
            {docPorTab.length > 0 ? (
              <p className="text-slate-500 text-[10px] mt-2 uppercase tracking-widest font-black">
                Hay {docPorTab.length} {activeTab} en el período, pero el filtro «{filtroEstado}» las oculta.{' '}
                <button onClick={() => setFiltroEstado('todos')} className="text-emerald-600 underline">Ver todas</button>
              </p>
            ) : (
              <p className="text-slate-400 text-[10px] mt-2 uppercase tracking-widest font-black">No hay {activeTab} para este período.</p>
            )}
            <Button onClick={abrirSyncModal} disabled={isSyncing || targetId === 'ALL'}
              className="mt-4 bg-emerald-600 hover:bg-emerald-500 text-slate-900 font-black uppercase text-[10px] tracking-widest disabled:opacity-50">
              {isSyncing ? <RefreshCcw className="h-3.5 w-3.5 mr-2 animate-spin" /> : <DownloadCloud className="h-3.5 w-3.5 mr-2" />}
              {isSyncing ? 'Extrayendo...' : 'Extraer del SII'}
            </Button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-sm text-slate-600 min-w-[900px]">
                <thead className="bg-slate-50 border-b border-[#efe8dd] text-[10px] uppercase tracking-widest font-black text-slate-500">
                  <tr>
                    <th className="px-5 py-4">Fecha Emisión</th>
                    <th className="px-5 py-4">Período</th>
                    <th className="px-5 py-4">Tipo Documento</th>
                    <th className="px-5 py-4">Folio</th>
                    <th className="px-5 py-4">RUT {activeTab === 'compras' ? 'Proveedor' : 'Cliente'}</th>
                    <th className="px-5 py-4">Razón Social</th>
                    <th className="px-5 py-4 text-center">Estado</th>
                    <th className="px-5 py-4 text-right">Monto</th>
                    <th className="px-5 py-4 text-center">Asiento</th>
                  </tr>
                </thead>
                <tbody>
                  {currentData.map((doc, idx) => {
                    const { neto, iva, total } = calcularMontos(doc);
                    const rut   = activeTab === 'compras' ? doc.rut_proveedor : doc.rut_cliente;
                    const razon = formatText(activeTab === 'compras' ? doc.razon_social_proveedor : doc.razon_social);
                    const fecha = doc.fecha_emision ? new Date(doc.fecha_emision).toLocaleDateString('es-CL', { timeZone:'UTC' }) : 'N/A';
                    const per   = doc.fecha_emision ? doc.fecha_emision.substring(0, 7) : 'N/A';
                    const folio = String(doc.folio);
                    const comp  = comprobanteDe(doc);
                    const isExpanded = expandedRows.has(doc.id || idx);

                    // Líneas a mostrar: guardadas o por defecto
                    const lineasMostrar = comp
                      ? comp.lineas.map(l => ({ cuenta: l.cuentaCodigo || l.cuenta_codigo, nombre: l.descripcion || l.cuentaCodigo || l.cuenta_codigo, debe: Number(l.debe)||0, haber: Number(l.haber)||0 }))
                      : calcLineasDefault(doc, activeTab);

                    return (
                      <React.Fragment key={doc.id || idx}>
                        {/* FILA PRINCIPAL */}
                        <motion.tr
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }}
                          className={`border-b transition-colors group cursor-pointer ${isExpanded ? 'bg-slate-50 border-[#efe8dd]' : 'hover:bg-white border-[#efe8dd]'}`}
                          onClick={() => toggleRow(doc.id || idx, doc)}
                        >
                          <td className="px-5 py-3.5 text-xs text-slate-500 font-bold whitespace-nowrap">{fecha}</td>
                          <td className="px-5 py-3.5 text-xs font-mono text-blue-600 font-bold">{per}</td>
                          <td className="px-5 py-3.5">
                            <span className={`px-2 py-1 rounded text-[9px] font-black uppercase border whitespace-nowrap ${
                              doc.tipo_dte === 61 ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' :
                              doc.tipo_dte === 56 ? 'bg-orange-500/10 text-orange-600 border-orange-500/20' :
                              colors.row
                            }`}>
                              {TIPO_DTE_MAP[doc.tipo_dte] || `TIPO ${doc.tipo_dte}`}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 font-black text-slate-900 italic text-sm">#{doc.folio}</td>
                          <td className="px-5 py-3.5 font-mono text-xs text-slate-500">{rut}</td>
                          <td className="px-5 py-3.5 max-w-[160px]">
                            <span className="text-xs text-slate-700 font-bold truncate block">{razon || 'SIN RAZÓN SOCIAL'}</span>
                          </td>
                          {/* ESTADO */}
                          <td className="px-5 py-3.5 text-center">
                            {comp ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 whitespace-nowrap">
                                  ✓ Contabilizado{comp.numero != null ? ` N°${comp.numero}` : ''}
                                </span>
                                {comp.contabilizadoPor && (
                                  <span className="text-[8px] text-slate-400 normal-case whitespace-nowrap" title={comp.contabilizadoAt ? new Date(comp.contabilizadoAt).toLocaleString('es-CL') : ''}>
                                    por {comp.contabilizadoPor}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[8px] font-black uppercase text-amber-600 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20 whitespace-nowrap">
                                Pendiente
                              </span>
                            )}
                          </td>
                          <td className={`px-5 py-3.5 text-right font-black font-mono tracking-tighter ${colors.total}`}>{formatCLP(total)}</td>
                          {/* ASIENTO — solo botones */}
                          <td className="px-5 py-3.5">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={e => { e.stopPropagation(); handleVerAsiento(doc); }}
                                className="p-1.5 text-blue-600 hover:bg-blue-500/20 rounded transition-colors"
                                title="Ver y editar asiento">
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={e => { e.stopPropagation(); toggleRow(doc.id || idx, doc); }}
                                className="p-1.5 text-slate-400 hover:text-slate-900 rounded transition-colors">
                                {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              </button>
                              {/* Solo aparece si hay algo que deshacer: sin asiento
                                  contabilizado, el botón no tiene sentido. */}
                              {comp && (
                                <button
                                  onClick={e => { e.stopPropagation(); handleDescontabilizar(doc); }}
                                  disabled={deletingDocId === doc.id}
                                  className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-500/20 rounded transition-colors disabled:opacity-40"
                                  title="Quitar el asiento (el documento vuelve a Pendiente)">
                                  {deletingDocId === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                                </button>
                              )}
                            </div>
                          </td>
                        </motion.tr>

                        {/* FILA EXPANDIDA — ASIENTO EDITABLE INLINE */}
                        <AnimatePresence>
                          {isExpanded && (() => {
                            const rowId = doc.id || idx;
                            const editLineas = rowEdits[rowId] || [];
                            const tDebe  = editLineas.reduce((s,l) => s+(Number(l.debe)||0), 0);
                            const tHaber = editLineas.reduce((s,l) => s+(Number(l.haber)||0), 0);
                            const cuadrado = editLineas.length > 0 && Math.abs(tDebe - tHaber) < 1;
                            const isSavingRow = savingRows.has(rowId);
                            return (
                              <tr>
                                <td colSpan={9} className="p-0 border-b border-[#efe8dd]">
                                  <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }} transition={{ duration:0.2 }} className="overflow-hidden">
                                    <div className="mx-5 my-3 bg-white rounded-xl border border-[#efe8dd] overflow-hidden shadow-xl">
                                      {/* Header */}
                                      <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between gap-2 bg-white">
                                        <div className="flex items-center gap-3">
                                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                                            Asiento — Folio #{folio}
                                          </span>
                                          {comp
                                            ? <span className="flex items-center gap-1 text-[9px] font-black uppercase text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20"><CheckCircle className="h-2.5 w-2.5" /> Guardado</span>
                                            : <span className="flex items-center gap-1 text-[9px] font-black uppercase text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20"><AlertCircle className="h-2.5 w-2.5" /> Sin guardar</span>
                                          }
                                          {cuadrado
                                            ? <span className="text-[9px] font-black uppercase text-emerald-600">✓ Cuadrado</span>
                                            : editLineas.length > 0 && <span className="text-[9px] font-black uppercase text-red-500 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">⚠ Descuadre {formatCLP(Math.abs(tDebe-tHaber))}</span>
                                          }
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <button onClick={e => { e.stopPropagation(); addLinea(rowId); }}
                                            className="flex items-center gap-1 text-[9px] font-black uppercase text-blue-600 hover:text-blue-700 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-blue-500/10 border border-transparent hover:border-blue-500/20">
                                            <Plus className="h-3 w-3" /> Línea
                                          </button>
                                          <button
                                            onClick={e => { e.stopPropagation(); saveLineas(rowId, doc); }}
                                            disabled={!cuadrado || isSavingRow}
                                            className="flex items-center gap-1.5 text-[9px] font-black uppercase px-3 py-1.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20">
                                            {isSavingRow ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                            {isSavingRow ? 'Contabilizando...' : 'Contabilizar'}
                                          </button>
                                        </div>
                                      </div>

                                      {/* Una nota de crédito/débito debe declarar a qué
                                          documento afecta. Se elige acá mismo, sin abrir el modal. */}
                                      {esNota(doc.tipo_dte) && (
                                        <SelectorDocAfectado
                                          doc={doc}
                                          clase={activeTab}
                                          empresaId={targetId}
                                          sessionId={user.sessionId}
                                          valor={refPorFila[rowId] || null}
                                          onChange={ref => setRefPorFila(prev => ({ ...prev, [rowId]: ref }))}
                                        />
                                      )}

                                      {/* Marcar cobrado/pagado en el mismo acto de contabilizar.
                                          El movimiento y su asiento se crean en la misma
                                          transacción del servidor: o quedan los dos, o ninguno. */}
                                      {!comp && (() => {
                                        const pago = pagoPorFila[rowId] || { activo: false, medio: 'transferencia' };
                                        const esVentaTab = activeTab !== 'compras';
                                        const setPago = (patch) => setPagoPorFila(prev => ({ ...prev, [rowId]: { ...pago, ...patch } }));
                                        return (
                                          <div className="px-5 py-3 border-b border-[#efe8dd] bg-emerald-500/[0.04] flex flex-wrap items-center gap-3" onClick={e => e.stopPropagation()}>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                              <input type="checkbox" checked={pago.activo}
                                                onChange={e => setPago({ activo: e.target.checked })}
                                                className="h-3.5 w-3.5 accent-emerald-600 cursor-pointer" />
                                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                                                {esVentaTab ? 'Pago recibido' : 'Pago efectuado'}
                                              </span>
                                            </label>
                                            {pago.activo && (
                                              <>
                                                <select value={pago.medio} onChange={e => setPago({ medio: e.target.value })}
                                                  className="bg-white border border-[#efe8dd] rounded-lg px-2 py-1.5 text-[11px] text-slate-900 focus:outline-none focus:border-emerald-500">
                                                  <option value="transferencia">Transferencia</option>
                                                  <option value="efectivo">Efectivo</option>
                                                  <option value="cheque">Cheque</option>
                                                </select>
                                                <span className="text-[10px] text-slate-500">
                                                  {formatCLP(calcularMontos(doc).total)} a{' '}
                                                  <span className="font-bold text-slate-700">
                                                    {pago.medio === 'efectivo' ? 'Caja (1101-01)' : 'Banco (1101-02)'}
                                                  </span>
                                                  {esVentaTab ? ' contra Deudores Clientes' : ' contra Facturas por Pagar'}
                                                </span>
                                              </>
                                            )}
                                          </div>
                                        );
                                      })()}

                                      {/* Tabla editable */}
                                      <div className="px-5 py-3">
                                        {/* Header columnas */}
                                        <div className="grid grid-cols-[1fr_130px_130px_32px] gap-3 mb-2 px-1">
                                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Cuenta</span>
                                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 text-right">Debe</span>
                                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 text-right">Haber</span>
                                          <span/>
                                        </div>

                                        {/* Líneas */}
                                        <div className="space-y-2">
                                          {editLineas.map((l, li) => (
                                            <div key={li} className="grid grid-cols-[1fr_130px_130px_32px] gap-3 items-center" onClick={e => e.stopPropagation()}>
                                              <div>
                                                <Select value={l.cuenta} onValueChange={val => updateLinea(rowId, li, 'cuenta', val)}>
                                                  <SelectTrigger className="bg-white border-[#efe8dd] text-[10px] text-slate-700 h-8 w-full">
                                                    <SelectValue placeholder="Seleccionar cuenta...">
                                                      {l.cuenta ? <span className="font-mono">{l.cuenta} — {l.nombre || getNombre(l.cuenta)}</span> : <span className="text-slate-400">Seleccionar cuenta...</span>}
                                                    </SelectValue>
                                                  </SelectTrigger>
                                                  <SelectContent className="bg-white border-[#efe8dd] text-slate-700 max-h-[200px] overflow-y-auto z-50">
                                                    {plan.map(c => (
                                                      <SelectItem key={c.codigo} value={c.codigo} className="text-[10px]">
                                                        <span className="font-mono text-blue-600">{c.codigo}</span> — {c.descripcion}
                                                      </SelectItem>
                                                    ))}
                                                  </SelectContent>
                                                </Select>
                                              </div>
                                              <input type="number" min="0" value={l.debe || ''} placeholder="0"
                                                onChange={e => updateLinea(rowId, li, 'debe', e.target.value)}
                                                className="w-full bg-white border border-[#efe8dd] rounded-lg px-3 py-1.5 text-[10px] text-emerald-600 font-mono text-right focus:outline-none focus:border-emerald-500 h-8" />
                                              <input type="number" min="0" value={l.haber || ''} placeholder="0"
                                                onChange={e => updateLinea(rowId, li, 'haber', e.target.value)}
                                                className="w-full bg-white border border-[#efe8dd] rounded-lg px-3 py-1.5 text-[10px] text-orange-600 font-mono text-right focus:outline-none focus:border-orange-500 h-8" />
                                              <div className="flex justify-center">
                                                {editLineas.length > 2 && (
                                                  <button onClick={e => { e.stopPropagation(); removeLinea(rowId, li); }}
                                                    className="text-slate-600 hover:text-red-500 transition-colors">
                                                    <Trash2 className="h-3 w-3" />
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>

                                        {/* Totales */}
                                        <div className="grid grid-cols-[1fr_130px_130px_32px] gap-3 mt-3 pt-3 border-t border-white/[0.06]">
                                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-1">Totales</span>
                                          <span className="text-right font-mono text-[10px] font-black text-emerald-600">{tDebe > 0 ? formatCLP(tDebe) : '—'}</span>
                                          <span className="text-right font-mono text-[10px] font-black text-orange-600">{tHaber > 0 ? formatCLP(tHaber) : '—'}</span>
                                          <span/>
                                        </div>
                                      </div>
                                    </div>
                                  </motion.div>
                                </td>
                              </tr>
                            );
                          })()}
                        </AnimatePresence>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-5 py-4 bg-slate-50 border-t border-[#efe8dd]">
              <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                Mostrando {(currentPage-1)*ITEMS_PER_PAGE+1}–{Math.min(currentPage*ITEMS_PER_PAGE, docActivos.length)} de {docActivos.length}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1,p-1))} disabled={currentPage===1}
                  className="h-8 bg-slate-50 border-[#efe8dd] text-slate-500 hover:text-slate-900 disabled:opacity-20 font-black text-xs uppercase">
                  <ChevronLeft size={14} className="mr-1" /> ANT
                </Button>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-2">Pág {currentPage} de {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages,p+1))} disabled={currentPage===totalPages}
                  className="h-8 bg-slate-50 border-[#efe8dd] text-slate-500 hover:text-slate-900 disabled:opacity-20 font-black text-xs uppercase">
                  SIG <ChevronRight size={14} className="ml-1" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* MODAL LIBRO DIARIO */}
      <Dialog open={isLibroModalOpen} onOpenChange={setIsLibroModalOpen}>
        <DialogContent className="sm:max-w-[820px] bg-white border-[#efe8dd] text-slate-700 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-lg font-black uppercase tracking-tight text-purple-600">
              <BookCopy className="h-5 w-5" />
              Centralización Contable
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[65vh] overflow-y-auto custom-scrollbar pr-1 space-y-4 mt-2">
            {/* Resumen del período a centralizar */}
            <div className="bg-slate-50 border border-[#efe8dd] rounded-xl p-4 space-y-3">
              {/* Tipo de período: solo cuando NO hay rango global activo */}
              {!rango?.desde && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-blue-700 mb-2 flex items-center gap-2">
                    <CalendarDays className="h-3.5 w-3.5" /> Tipo de Período
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[{v:'diario',l:'Diario'},{v:'mensual',l:'Mensual'},{v:'trimestral',l:'Trimestral'},{v:'anual',l:'Anual'}].map(({v,l}) => (
                      <button key={v} onClick={() => setTipoPeriodoLibro(v)}
                        className={`py-2 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                          tipoPeriodoLibro === v ? 'bg-purple-600 text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:text-slate-900 hover:bg-slate-100/50 border border-[#efe8dd]'
                        }`}>
                        {l}
                      </button>
                    ))}
                  </div>
                  {tipoPeriodoLibro === 'diario' && (
                    <div className="mt-3">
                      <label className="text-[9px] font-bold uppercase text-slate-400 mb-1.5 block">Día</label>
                      <select value={diaLibro} onChange={e => setDiaLibro(e.target.value)}
                        className="w-28 bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-purple-500">
                        {diasDelMes.map(d => <option key={d} value={d} className="bg-white">{d}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Chips de resumen */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-purple-700 bg-purple-500/10 border border-purple-500/20 px-2.5 py-1.5 rounded-lg">
                  <CalendarDays className="h-3 w-3" /> {libroPeriodo}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded-lg">
                  <CheckCircle className="h-3 w-3" /> {libroVentasGuardadas.length + libroComprasGuardadas.length} contabilizado{(libroVentasGuardadas.length + libroComprasGuardadas.length) !== 1 ? 's' : ''} a centralizar
                </span>
                {libroPendientesTotal > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-700 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-lg">
                    <AlertCircle className="h-3 w-3" /> {libroPendientesTotal} sin contabilizar (excluido{libroPendientesTotal !== 1 ? 's' : ''})
                  </span>
                )}
              </div>

              {/* Nota cuando hay pendientes */}
              {libroPendientesTotal > 0 && (
                <p className="text-[9px] text-amber-500/70 leading-relaxed">
                  Solo se centraliza lo que está contabilizado. Los documentos sin contabilizar quedan fuera —
                  contabilízalos primero (desde el listado o "Contabilizar Todo") si quieres incluirlos.
                </p>
              )}
            </div>

            {/* Tabla de asientos */}
            {libroAsientos.length === 0 ? (
              <div className="text-center py-12 flex flex-col items-center gap-2">
                <AlertCircle className="h-8 w-8 text-amber-600/40" />
                <p className="text-slate-600 font-black uppercase text-xs tracking-widest">Nada que centralizar</p>
                <p className="text-slate-400 text-[10px] max-w-sm leading-relaxed">
                  No hay documentos <span className="text-emerald-600">contabilizados</span> en este período.
                  Contabiliza compras o ventas primero y vuelve a centralizar.
                </p>
              </div>
            ) : (() => {
              const lineas = libroAsientos.filter(a => !a.tipo);
              const debe   = lineas.reduce((s,l) => s+(Number(l.debe)||0), 0);
              const haber  = lineas.reduce((s,l) => s+(Number(l.haber)||0), 0);
              const cuadrado = lineas.length > 0 && Math.abs(debe-haber) < 1;
              return (
                <div className="bg-slate-50 rounded-xl border border-[#efe8dd] overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-[#efe8dd] flex items-center justify-between bg-purple-900/10">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Asiento Centralizado</span>
                    {cuadrado && (
                      <span className="flex items-center gap-1 text-[9px] font-black uppercase text-emerald-600">
                        <CheckCircle className="h-3 w-3" /> Cuadrado
                      </span>
                    )}
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        {['Código','Descripción','Debe','Haber'].map(h => (
                          <th key={h} className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 ${h==='Debe'||h==='Haber'?'text-right':'text-left'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {libroAsientos.map((linea, idx) => linea.tipo === 'header' ? (
                        <tr key={idx} className="bg-purple-900/20">
                          <td colSpan={4} className="px-4 py-2 text-xs font-black text-purple-600 uppercase">{linea.glosa}</td>
                        </tr>
                      ) : (
                        <tr key={idx} className="hover:bg-white">
                          <td className="px-4 py-3 font-mono text-xs text-blue-700 font-bold">{linea.codigo}</td>
                          <td className="px-4 py-3 text-xs text-slate-900 font-bold">{linea.descripcion}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-emerald-600 font-bold">{linea.debe>0?formatCLP(linea.debe):<span className="text-slate-600">—</span>}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-orange-600 font-bold">{linea.haber>0?formatCLP(linea.haber):<span className="text-slate-600">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50">
                      <tr>
                        <td colSpan={2} className="px-4 py-3 text-[10px] font-black uppercase text-slate-500">Totales</td>
                        <td className="px-4 py-3 text-right font-mono text-xs font-black text-emerald-600">{formatCLP(debe)}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs font-black text-orange-600">{formatCLP(haber)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })()}
          </div>

          <DialogFooter className="mt-4">
            <Button variant="ghost" onClick={() => setIsLibroModalOpen(false)} className="text-slate-500 hover:text-slate-900">
              Cancelar
            </Button>
            <Button onClick={handleEnviarLibroDiario} disabled={libroAsientos.length === 0}
              className="bg-purple-600 hover:bg-purple-500 font-black uppercase text-xs tracking-widest disabled:opacity-40">
              <Send className="h-4 w-4 mr-2" /> Enviar al Libro Diario
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODALES */}
      <SyncSIIModal isOpen={isSyncModalOpen} setIsOpen={setIsSyncModalOpen} onSync={handleSyncSII} isSyncing={isSyncing}
        empresaNombre={selectedCompany?.razon_social || selectedCompany?.razonSocial} />
      <NuevoMovimientoModal isOpen={isNuevoModalOpen} setIsOpen={setIsNuevoModalOpen} tipo={activeTab} empresaId={targetId}
        onGuardado={() => { cargarDatos(); queryClient.invalidateQueries(['comprobantes', targetId]); }} />
      <AsientoDocumentoModal isOpen={isAsientoModalOpen} setIsOpen={setIsAsientoModalOpen} documento={selectedDocumento}
        empresaId={targetId}
        onGuardado={() => {
          cargarDatos();
          queryClient.invalidateQueries(['comprobantes', targetId]);
        }}
      />
    </div>
  );
};

export default MovimientosContables;
