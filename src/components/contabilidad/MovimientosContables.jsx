import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUpRight, ArrowDownRight, Eye, Plus, Loader2, FileCheck,
  CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Award,
  DownloadCloud, RefreshCcw, BookCopy, ChevronUp, Send,
  CheckCircle, AlertCircle, Trash2, Save
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { getChartOfAccountsApi } from '@/services/accountingService';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { obtenerHistorialBunker, obtenerComprasBunker } from '@/services/dteConsultasService';
import { fetchWithAuth } from '@/services/apiClient';
import NuevoMovimientoModal from '@/components/contabilidad/modals/NuevoMovimientoModal';
import AsientoDocumentoModal from '@/components/contabilidad/modals/AsientoDocumentoModal';
import SyncSIIModal from '@/components/contabilidad/modals/SyncSIIModal';
import { API_BASE_URL } from '../../../config.js';

const TIPO_DTE_MAP = {
  33: 'FAC. ELECTRÓNICA', 34: 'FAC. EXENTA', 61: 'NOTA DE CRÉDITO',
  56: 'NOTA DE DÉBITO', 52: 'GUÍA DE DESPACHO', 39: 'BOLETA', 110: 'FAC. EXPORTACIÓN'
};
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

const CUENTAS_NOMBRE = {
  '1104-01': 'DEUDORES CLIENTES', '5101-01': 'VENTAS', '2108-02': 'IVA DEBITO FISCAL',
  '4201-08': 'GASTOS GENERALES',  '1108-02': 'IVA CREDITO FISCAL', '2116-01': 'FACTURAS POR PAGAR',
};

const formatText = (str) => str ? str.toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase() : '';
const formatCLP = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(val || 0);

const COLOR_MAP = {
  ventas:    { active: 'bg-emerald-500/10 text-emerald-400 border-b-2 border-emerald-500', badge: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20', total: 'text-emerald-400', row: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  compras:   { active: 'bg-red-500/10 text-red-400 border-b-2 border-red-500',             badge: 'bg-red-500/10 text-red-400 border border-red-500/20',             total: 'text-red-400',     row: 'bg-red-500/10 text-red-400 border-red-500/20' },
  honorarios:{ active: 'bg-amber-500/10 text-amber-400 border-b-2 border-amber-500',       badge: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',       total: 'text-amber-400',   row: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
};

// Genera el asiento por defecto para un documento
const calcLineasDefault = (doc, tipo) => {
  const neto = Number(doc.monto_neto) || 0;
  const iva  = Number(doc.monto_iva)  || Math.round(neto * 0.19);
  const total = neto + iva;
  if (tipo === 'ventas')    return [{ cuenta: '1104-01', debe: total, haber: 0 }, { cuenta: '5101-01', debe: 0, haber: neto }, { cuenta: '2108-02', debe: 0, haber: iva }];
  if (tipo === 'compras')   return [{ cuenta: '4201-08', debe: neto,  haber: 0 }, { cuenta: '1108-02', debe: iva, haber: 0 },  { cuenta: '2116-01', debe: 0, haber: total }];
  return [{ cuenta: '4201-02', debe: total, haber: 0 }, { cuenta: '2105-04', debe: 0, haber: total }];
};

const MovimientosContables = ({ empresaId, onGenerarBorrador }) => {
  const { user, selectedCompany } = useAuth();
  const queryClient = useQueryClient();
  const targetId = empresaId || selectedCompany?.id || 'ALL';

  const [activeTab, setActiveTab]           = useState('ventas');
  const [isLoading, setIsLoading]           = useState(false);
  const [isSyncing, setIsSyncing]           = useState(false);
  const [rawVentas, setRawVentas]           = useState([]);
  const [rawCompras, setRawCompras]         = useState([]);
  const [honorarios]                        = useState([]);
  const [currentPage, setCurrentPage]       = useState(1);
  const [isNuevoModalOpen, setIsNuevoModalOpen]   = useState(false);
  const [isAsientoModalOpen, setIsAsientoModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen]     = useState(false);
  const [selectedDocumento, setSelectedDocumento] = useState(null);
  const [expandedRows, setExpandedRows]           = useState(new Set());
  const [rowEdits, setRowEdits]                   = useState({});   // docId → lineas[]
  const [savingRows, setSavingRows]               = useState(new Set());
  const [isLibroModalOpen, setIsLibroModalOpen]   = useState(false);
  const [tipoPeriodoLibro, setTipoPeriodoLibro]   = useState('mensual');
  const [diaLibro, setDiaLibro]                   = useState('01');

  const now = new Date();
  const [mes, setMes]   = useState((now.getMonth() + 1).toString().padStart(2, '0'));
  const [anio, setAnio] = useState(now.getFullYear().toString());

  // ── Cargar movimientos ────────────────────────────────────────
  const cargarDatos = useCallback(async () => {
    setIsLoading(true);
    try {
      const [resV, resC] = await Promise.all([
        obtenerHistorialBunker(targetId),
        obtenerComprasBunker(targetId),
      ]);
      setRawVentas(resV.ok ? (resV.documentos || []) : []);
      setRawCompras(resC.ok ? (resC.documentos || []) : []);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar los movimientos.' });
    } finally {
      setIsLoading(false);
    }
  }, [targetId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => { cargarDatos(); }, [targetId]);
  React.useEffect(() => { setCurrentPage(1); }, [activeTab, mes, anio]);

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
      if (!targetId || targetId === 'ALL') return { comprobantes: [] };
      const res = await fetchWithAuth(`/accounting/comprobantes?empresaId=${targetId}`, user.sessionId);
      if (!res.ok) return { comprobantes: [] };
      return res.json();
    },
    enabled: !!user?.sessionId && !!targetId && targetId !== 'ALL',
  });

  // Mapa folio → líneas del comprobante guardado
  const folioMap = useMemo(() => {
    const map = {};
    (dataComp?.comprobantes || []).forEach(comp => {
      const match = comp.glosa?.match(/#(\d+)/);
      if (match) {
        map[match[1]] = { guardado: true, estado: comp.estado, lineas: comp.lineas || [] };
      }
    });
    return map;
  }, [dataComp]);

  const periodo = `${anio}-${mes}`;
  const ventas  = useMemo(() => rawVentas.filter(d => d.fecha_emision?.startsWith(periodo)), [rawVentas, periodo]);
  const compras = useMemo(() => rawCompras.filter(d => d.fecha_emision?.startsWith(periodo)), [rawCompras, periodo]);

  const docActivos = activeTab === 'ventas' ? ventas : activeTab === 'compras' ? compras : honorarios;
  const totalPages = Math.ceil(docActivos.length / ITEMS_PER_PAGE) || 1;
  const currentData = docActivos.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const totales = useMemo(() => docActivos.reduce((acc, doc) => {
    const neto = Number(doc.monto_neto) || 0;
    const iva  = Number(doc.monto_iva)  || Math.round(neto * 0.19);
    const total = neto + iva;
    return { count: acc.count + 1, total: acc.total + total, neto: acc.neto + neto, iva: acc.iva + iva };
  }, { count: 0, total: 0, neto: 0, iva: 0 }), [docActivos]);

  const hayDatos = ventas.length > 0 || compras.length > 0;

  // ── Libro: filtrado reactivo por período ──────────────────────
  const diasDelMes = useMemo(() => {
    const n = new Date(parseInt(anio), parseInt(mes), 0).getDate();
    return Array.from({ length: n }, (_, i) => (i + 1).toString().padStart(2, '0'));
  }, [mes, anio]);

  const { libroVentas, libroCompras, libroPeriodo } = useMemo(() => {
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
  }, [tipoPeriodoLibro, mes, anio, diaLibro, rawVentas, rawCompras]);

  const libroAsientos = useMemo(() => {
    const getLineasDoc = (doc, tipo) => {
      const rowId = doc.id;
      if (rowId && rowEdits[rowId]) return rowEdits[rowId];
      const comp = folioMap[String(doc.folio)];
      if (comp) return comp.lineas.map(l => ({ cuenta: l.cuentaCodigo || l.cuenta_codigo, debe: Number(l.debe)||0, haber: Number(l.haber)||0 }));
      return calcLineasDefault(doc, tipo);
    };
    const acumular = (docs, tipo) => {
      const mapa = {};
      docs.forEach(doc => getLineasDoc(doc, tipo).forEach(l => {
        if (!l.cuenta) return;
        if (!mapa[l.cuenta]) mapa[l.cuenta] = { descripcion: getNombre(l.cuenta), debe: 0, haber: 0 };
        mapa[l.cuenta].debe  += Number(l.debe)  || 0;
        mapa[l.cuenta].haber += Number(l.haber) || 0;
      }));
      return mapa;
    };
    const mapaV = acumular(libroVentas, 'ventas');
    const mapaC = acumular(libroCompras, 'compras');
    const lineas = [];
    if (libroVentas.length > 0) {
      lineas.push({ tipo: 'header', glosa: `CENTRALIZACIÓN VENTAS ${libroPeriodo}` });
      Object.entries(mapaV).forEach(([codigo, { descripcion, debe, haber }]) => { if (debe > 0 || haber > 0) lineas.push({ codigo, descripcion, debe, haber }); });
    }
    if (libroCompras.length > 0) {
      lineas.push({ tipo: 'header', glosa: `CENTRALIZACIÓN COMPRAS ${libroPeriodo}` });
      Object.entries(mapaC).forEach(([codigo, { descripcion, debe, haber }]) => { if (debe > 0 || haber > 0) lineas.push({ codigo, descripcion, debe, haber }); });
    }
    return lineas;
  }, [libroVentas, libroCompras, libroPeriodo, rowEdits, folioMap, plan]);

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
          const comp = folioMap[String(doc.folio)];
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

  const saveLineas = async (rowId, doc) => {
    const lineas = rowEdits[rowId] || [];
    const totalDebe  = lineas.reduce((s,l) => s+(Number(l.debe)||0), 0);
    const totalHaber = lineas.reduce((s,l) => s+(Number(l.haber)||0), 0);
    if (Math.abs(totalDebe - totalHaber) > 1) {
      toast({ variant:'destructive', title:'Descuadre', description:`Debe ${formatCLP(totalDebe)} ≠ Haber ${formatCLP(totalHaber)}` });
      return;
    }
    if (!targetId || targetId === 'ALL') {
      toast({ variant:'destructive', title:'Sin empresa', description:'Selecciona una empresa específica.' });
      return;
    }
    setSavingRows(prev => new Set(prev).add(rowId));
    try {
      const isCompra = activeTab === 'compras';
      const rut = isCompra ? doc.rut_proveedor : doc.rut_cliente;
      const razon = formatText(isCompra ? doc.razon_social_proveedor : doc.razon_social);
      const res = await fetchWithAuth('/accounting/comprobantes', user.sessionId, {
        method: 'POST',
        body: {
          empresaId: targetId, tipo: activeTab,
          fecha: doc.fecha_emision,
          glosa: `${activeTab === 'ventas' ? 'Venta' : 'Compra'} Folio #${doc.folio} — ${razon || rut}`,
          folio: doc.folio, rutAsociado: rut,
          lineas: lineas.map(l => ({ cuenta: l.cuenta, debe: l.debe, haber: l.haber })),
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      const accion = data.accion === 'actualizado' ? 'Asiento actualizado' : 'Asiento guardado';
      toast({ title:`✅ ${accion}`, description:`Comprobante N° ${data.numero} — folio #${doc.folio}` });
      queryClient.invalidateQueries(['comprobantes', targetId]);
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

  const handleEnviarLibroDiario = () => {
    if (libroAsientos.length === 0) {
      toast({ variant: 'destructive', title: 'Sin movimientos', description: `No hay datos para ${libroPeriodo}.` });
      return;
    }
    onGenerarBorrador?.({ asientos: libroAsientos, periodoLabel: libroPeriodo });
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
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ rut: selectedCompany.rut, clave: selectedCompany.claveSII, mesDesde, anioDesde, mesHasta, anioHasta, empresaId: targetId }),
      })).json();
      if (result.success) {
        toast({ title:'✅ Extracción Exitosa', description: result.message });
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
        <div className="flex items-center bg-black/40 border border-white/10 rounded-xl px-1 py-1">
          <div className="flex items-center pl-3 pr-1"><CalendarDays className="h-4 w-4 text-blue-400" /></div>
          <select value={mes} onChange={e => setMes(e.target.value)}
            className="bg-transparent text-white text-xs font-black uppercase tracking-widest px-2 py-2 focus:outline-none appearance-none cursor-pointer hover:text-blue-400 transition-colors">
            {MESES.map(m => <option key={m.value} value={m.value} className="bg-slate-900 text-white">{m.label}</option>)}
          </select>
          <span className="text-white/20 font-light mx-1">/</span>
          <select value={anio} onChange={e => setAnio(e.target.value)}
            className="bg-transparent text-white text-xs font-black uppercase tracking-widest px-2 py-2 focus:outline-none appearance-none cursor-pointer hover:text-blue-400 transition-colors">
            {ANIOS.map(a => <option key={a} value={a} className="bg-slate-900 text-white">{a}</option>)}
          </select>
          <div className="pr-3 pl-1 pointer-events-none"><ChevronDown className="h-4 w-4 text-gray-500" /></div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={abrirSyncModal} disabled={isSyncing || targetId === 'ALL'}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black uppercase text-[10px] tracking-widest">
            {isSyncing ? <RefreshCcw className="h-4 w-4 mr-2 animate-spin" /> : <DownloadCloud className="h-4 w-4 mr-2" />}
            {isSyncing ? 'EXTRAYENDO...' : 'EXTRAER DE SII'}
          </Button>
          <Button onClick={() => setIsNuevoModalOpen(true)}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black uppercase text-[10px] tracking-widest">
            <Plus className="h-4 w-4 mr-2" />
            Nueva {activeTab === 'ventas' ? 'Venta' : activeTab === 'compras' ? 'Compra' : 'Honorario'}
          </Button>
          <Button onClick={() => setIsLibroModalOpen(true)} disabled={!hayDatos}
            className={`font-black uppercase text-[10px] tracking-widest transition-all ${
              hayDatos ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-900/30'
              : 'bg-black/40 border border-white/10 text-gray-500 opacity-50 cursor-not-allowed'
            }`}>
            <BookCopy className="h-4 w-4 mr-2" />
            GENERAR LIBRO
          </Button>
        </div>
      </div>

      {/* SUB-TABS */}
      <div className="flex border-b border-white/5">
        {TABS.map(({ id, label, icon: Icon, count }) => {
          const isActive = activeTab === id;
          const cm = COLOR_MAP[id];
          return (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-6 py-3.5 font-black uppercase text-[10px] tracking-widest transition-all ${isActive ? cm.active : 'text-gray-500 hover:text-white hover:bg-white/5'}`}>
              <Icon className="h-3.5 w-3.5" />
              {label}
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-black ${isActive ? cm.badge : 'bg-white/5 text-gray-600'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* RESUMEN */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label:'Documentos', value: String(totales.count) },
          { label:'Neto',       value: formatCLP(totales.neto) },
          { label:'IVA 19%',    value: formatCLP(totales.iva) },
          { label:'Total',      value: formatCLP(totales.total) },
        ].map(item => (
          <div key={item.label} className="bg-black/20 rounded-xl border border-white/5 p-4">
            <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1">{item.label}</p>
            <p className="font-black text-white font-mono text-sm tracking-tighter">{item.value}</p>
          </div>
        ))}
      </div>

      {/* TABLA */}
      <div className="bg-[#0f172a]/80 rounded-xl border border-white/5 overflow-hidden backdrop-blur-md shadow-2xl">
        {isLoading ? (
          <div className="p-16 flex flex-col items-center justify-center">
            <Loader2 className="h-10 w-10 text-blue-500 animate-spin mb-4" />
            <span className="text-blue-400 font-black text-xs uppercase tracking-widest animate-pulse">Consultando Bunker...</span>
          </div>
        ) : docActivos.length === 0 ? (
          <div className="p-16 text-center flex flex-col items-center justify-center">
            <div className="bg-white/5 p-5 rounded-full mb-4 border border-white/10">
              <FileCheck className="h-8 w-8 text-gray-500" />
            </div>
            <h4 className="text-white font-black tracking-wide uppercase text-sm">Sin Registros</h4>
            <p className="text-gray-500 text-[10px] mt-2 uppercase tracking-widest font-black">No hay {activeTab} para este período.</p>
            <Button onClick={abrirSyncModal} disabled={isSyncing || targetId === 'ALL'}
              className="mt-4 bg-blue-600 hover:bg-blue-500 text-white font-black uppercase text-[10px] tracking-widest disabled:opacity-50">
              {isSyncing ? <RefreshCcw className="h-3.5 w-3.5 mr-2 animate-spin" /> : <DownloadCloud className="h-3.5 w-3.5 mr-2" />}
              {isSyncing ? 'Extrayendo...' : 'Extraer del SII'}
            </Button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-sm text-gray-300 min-w-[900px]">
                <thead className="bg-white/5 border-b border-white/10 text-[10px] uppercase tracking-widest font-black text-gray-400">
                  <tr>
                    <th className="px-5 py-4">Fecha Emisión</th>
                    <th className="px-5 py-4">Período</th>
                    <th className="px-5 py-4">Tipo Documento</th>
                    <th className="px-5 py-4">Folio</th>
                    <th className="px-5 py-4">RUT {activeTab === 'compras' ? 'Proveedor' : 'Cliente'}</th>
                    <th className="px-5 py-4">Razón Social</th>
                    <th className="px-5 py-4 text-right">Monto</th>
                    <th className="px-5 py-4 text-center">Asiento</th>
                  </tr>
                </thead>
                <tbody>
                  {currentData.map((doc, idx) => {
                    const neto  = Number(doc.monto_neto) || 0;
                    const iva   = Number(doc.monto_iva)  || Math.round(neto * 0.19);
                    const total = neto + iva;
                    const rut   = activeTab === 'compras' ? doc.rut_proveedor : doc.rut_cliente;
                    const razon = formatText(activeTab === 'compras' ? doc.razon_social_proveedor : doc.razon_social);
                    const fecha = doc.fecha_emision ? new Date(doc.fecha_emision).toLocaleDateString('es-CL', { timeZone:'UTC' }) : 'N/A';
                    const per   = doc.fecha_emision ? doc.fecha_emision.substring(0, 7) : 'N/A';
                    const folio = String(doc.folio);
                    const comp  = folioMap[folio];
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
                          className={`border-b transition-colors group cursor-pointer ${isExpanded ? 'bg-white/[0.04] border-white/10' : 'hover:bg-white/[0.03] border-white/5'}`}
                          onClick={() => toggleRow(doc.id || idx, doc)}
                        >
                          <td className="px-5 py-3.5 text-xs text-gray-400 font-bold whitespace-nowrap">{fecha}</td>
                          <td className="px-5 py-3.5 text-xs font-mono text-blue-400 font-bold">{per}</td>
                          <td className="px-5 py-3.5">
                            <span className={`px-2 py-1 rounded text-[9px] font-black uppercase border ${colors.row}`}>
                              {TIPO_DTE_MAP[doc.tipo_dte] || `TIPO ${doc.tipo_dte}`}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 font-black text-white italic text-sm">#{doc.folio}</td>
                          <td className="px-5 py-3.5 font-mono text-xs text-gray-400">{rut}</td>
                          <td className="px-5 py-3.5 max-w-[160px]">
                            <span className="text-xs text-gray-200 font-bold truncate block">{razon || 'SIN RAZÓN SOCIAL'}</span>
                          </td>
                          <td className={`px-5 py-3.5 text-right font-black font-mono tracking-tighter ${colors.total}`}>{formatCLP(total)}</td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center justify-center gap-1.5">
                              {comp ? (
                                <span className="text-[8px] font-black uppercase text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                  ✓ Guardado
                                </span>
                              ) : (
                                <span className="text-[8px] font-black uppercase text-gray-500 bg-white/5 px-1.5 py-0.5 rounded border border-white/10">
                                  Pendiente
                                </span>
                              )}
                              <button
                                onClick={e => { e.stopPropagation(); handleVerAsiento(doc); }}
                                className="p-1.5 text-blue-400 hover:bg-blue-500/20 rounded transition-colors"
                                title="Ver y editar asiento"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={e => { e.stopPropagation(); toggleRow(doc.id || idx, doc); }}
                                className="p-1.5 text-gray-500 hover:text-white rounded transition-colors">
                                {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              </button>
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
                                <td colSpan={8} className="p-0 border-b border-white/5">
                                  <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }} transition={{ duration:0.2 }} className="overflow-hidden">
                                    <div className="mx-5 my-3 bg-black/30 rounded-xl border border-white/5 overflow-hidden">
                                      {/* Header */}
                                      <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between flex-wrap gap-2">
                                        <div className="flex items-center gap-3">
                                          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                                            Plan de Cuentas — Folio #{folio}
                                          </p>
                                          {comp
                                            ? <span className="flex items-center gap-1 text-[9px] font-black uppercase text-emerald-400"><CheckCircle className="h-2.5 w-2.5" /> Guardado</span>
                                            : <span className="flex items-center gap-1 text-[9px] font-black uppercase text-amber-400"><AlertCircle className="h-2.5 w-2.5" /> Sin guardar</span>
                                          }
                                          {cuadrado
                                            ? <span className="text-[9px] font-black uppercase text-emerald-400">✓ Cuadrado</span>
                                            : editLineas.length > 0 && <span className="text-[9px] font-black uppercase text-red-400">Descuadre: {formatCLP(Math.abs(tDebe-tHaber))}</span>
                                          }
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <button onClick={e => { e.stopPropagation(); addLinea(rowId); }}
                                            className="flex items-center gap-1 text-[9px] font-black uppercase text-blue-400 hover:text-blue-300 transition-colors px-2 py-1 rounded hover:bg-blue-500/10">
                                            <Plus className="h-3 w-3" /> Línea
                                          </button>
                                          <button
                                            onClick={e => { e.stopPropagation(); saveLineas(rowId, doc); }}
                                            disabled={!cuadrado || isSavingRow}
                                            className="flex items-center gap-1 text-[9px] font-black uppercase px-2.5 py-1 rounded transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500 text-white">
                                            {isSavingRow ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                            {isSavingRow ? 'Guardando...' : 'Guardar'}
                                          </button>
                                        </div>
                                      </div>

                                      {/* Tabla editable */}
                                      <table className="w-full">
                                        <thead>
                                          <tr className="bg-white/[0.02]">
                                            <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-widest text-gray-500 w-[45%]">Cuenta</th>
                                            <th className="px-3 py-2 text-right text-[9px] font-black uppercase tracking-widest text-gray-500 w-[22%]">Debe</th>
                                            <th className="px-3 py-2 text-right text-[9px] font-black uppercase tracking-widest text-gray-500 w-[22%]">Haber</th>
                                            <th className="w-[11%]"></th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                          {editLineas.map((l, li) => (
                                            <tr key={li} onClick={e => e.stopPropagation()}>
                                              <td className="px-3 py-1.5">
                                                <Select value={l.cuenta} onValueChange={val => updateLinea(rowId, li, 'cuenta', val)}>
                                                  <SelectTrigger className="bg-slate-900 border-white/10 text-[10px] text-white h-7 w-full">
                                                    <SelectValue placeholder="Seleccionar..." />
                                                  </SelectTrigger>
                                                  <SelectContent className="bg-slate-900 border-white/10 text-white max-h-[200px] overflow-y-auto z-50">
                                                    {plan.map(c => (
                                                      <SelectItem key={c.codigo} value={c.codigo} className="text-[10px]">
                                                        {c.codigo} — {c.descripcion}
                                                      </SelectItem>
                                                    ))}
                                                  </SelectContent>
                                                </Select>
                                                {l.nombre && <p className="text-[8px] text-gray-600 mt-0.5 px-1">{l.nombre}</p>}
                                              </td>
                                              <td className="px-3 py-1.5">
                                                <input type="number" min="0" value={l.debe || ''} placeholder="0"
                                                  onChange={e => updateLinea(rowId, li, 'debe', e.target.value)}
                                                  className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1 text-[10px] text-emerald-400 font-mono text-right focus:outline-none focus:border-emerald-500" />
                                              </td>
                                              <td className="px-3 py-1.5">
                                                <input type="number" min="0" value={l.haber || ''} placeholder="0"
                                                  onChange={e => updateLinea(rowId, li, 'haber', e.target.value)}
                                                  className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1 text-[10px] text-orange-400 font-mono text-right focus:outline-none focus:border-orange-500" />
                                              </td>
                                              <td className="px-3 py-1.5 text-center">
                                                {editLineas.length > 2 && (
                                                  <button onClick={e => { e.stopPropagation(); removeLinea(rowId, li); }}
                                                    className="text-red-400 hover:text-red-300 opacity-50 hover:opacity-100 transition-all">
                                                    <Trash2 className="h-3 w-3" />
                                                  </button>
                                                )}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                        <tfoot className="bg-white/[0.02]">
                                          <tr>
                                            <td className="px-3 py-1.5 text-[9px] font-black uppercase text-gray-500">Totales</td>
                                            <td className="px-3 py-1.5 text-right font-mono text-[10px] text-emerald-400 font-black">{tDebe > 0 ? formatCLP(tDebe) : '—'}</td>
                                            <td className="px-3 py-1.5 text-right font-mono text-[10px] text-orange-400 font-black">{tHaber > 0 ? formatCLP(tHaber) : '—'}</td>
                                            <td></td>
                                          </tr>
                                        </tfoot>
                                      </table>
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

            <div className="flex items-center justify-between px-5 py-4 bg-black/20 border-t border-white/10">
              <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
                Mostrando {(currentPage-1)*ITEMS_PER_PAGE+1}–{Math.min(currentPage*ITEMS_PER_PAGE, docActivos.length)} de {docActivos.length}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1,p-1))} disabled={currentPage===1}
                  className="h-8 bg-black/40 border-white/10 text-gray-400 hover:text-white disabled:opacity-20 font-black text-xs uppercase">
                  <ChevronLeft size={14} className="mr-1" /> ANT
                </Button>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2">Pág {currentPage} de {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages,p+1))} disabled={currentPage===totalPages}
                  className="h-8 bg-black/40 border-white/10 text-gray-400 hover:text-white disabled:opacity-20 font-black text-xs uppercase">
                  SIG <ChevronRight size={14} className="ml-1" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* MODAL LIBRO DIARIO */}
      <Dialog open={isLibroModalOpen} onOpenChange={setIsLibroModalOpen}>
        <DialogContent className="sm:max-w-[820px] bg-[#0f172a] border-white/10 text-white shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-lg font-black uppercase tracking-tight text-purple-400">
              <BookCopy className="h-5 w-5" />
              Libro Diario Centralizado
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[65vh] overflow-y-auto custom-scrollbar pr-1 space-y-4 mt-2">
            {/* Selector de período */}
            <div className="bg-black/40 border border-white/5 rounded-xl p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-blue-300 mb-3 flex items-center gap-2">
                <CalendarDays className="h-3.5 w-3.5" /> Tipo de Período
              </p>
              <div className="grid grid-cols-4 gap-2">
                {[{v:'diario',l:'Diario'},{v:'mensual',l:'Mensual'},{v:'trimestral',l:'Trimestral'},{v:'anual',l:'Anual'}].map(({v,l}) => (
                  <button key={v} onClick={() => setTipoPeriodoLibro(v)}
                    className={`py-2 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                      tipoPeriodoLibro === v ? 'bg-purple-600 text-white shadow-lg' : 'bg-slate-800/50 text-gray-500 hover:text-white hover:bg-slate-700/50 border border-white/5'
                    }`}>
                    {l}
                  </button>
                ))}
              </div>
              {tipoPeriodoLibro === 'diario' && (
                <div className="mt-3">
                  <label className="text-[9px] font-bold uppercase text-gray-500 mb-1.5 block">Día</label>
                  <select value={diaLibro} onChange={e => setDiaLibro(e.target.value)}
                    className="w-28 bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500">
                    {diasDelMes.map(d => <option key={d} value={d} className="bg-slate-900">{d}</option>)}
                  </select>
                </div>
              )}
              <div className="mt-3 flex items-center gap-4 text-[10px] font-black uppercase tracking-widest">
                <span className="text-purple-400">Período: {libroPeriodo}</span>
                <span className="text-emerald-400">{libroVentas.length} ventas</span>
                <span className="text-red-400">{libroCompras.length} compras</span>
              </div>
            </div>

            {/* Tabla de asientos */}
            {libroAsientos.length === 0 ? (
              <div className="text-center py-10 text-gray-500 font-bold uppercase text-xs tracking-widest">
                Sin movimientos para el período seleccionado.
              </div>
            ) : (() => {
              const lineas = libroAsientos.filter(a => !a.tipo);
              const debe   = lineas.reduce((s,l) => s+(Number(l.debe)||0), 0);
              const haber  = lineas.reduce((s,l) => s+(Number(l.haber)||0), 0);
              const cuadrado = lineas.length > 0 && Math.abs(debe-haber) < 1;
              return (
                <div className="bg-black/20 rounded-xl border border-white/10 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between bg-purple-900/10">
                    <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Asiento Centralizado</span>
                    {cuadrado && (
                      <span className="flex items-center gap-1 text-[9px] font-black uppercase text-emerald-400">
                        <CheckCircle className="h-3 w-3" /> Cuadrado
                      </span>
                    )}
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-white/5">
                        {['Código','Descripción','Debe','Haber'].map(h => (
                          <th key={h} className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400 ${h==='Debe'||h==='Haber'?'text-right':'text-left'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {libroAsientos.map((linea, idx) => linea.tipo === 'header' ? (
                        <tr key={idx} className="bg-purple-900/20">
                          <td colSpan={4} className="px-4 py-2 text-xs font-black text-purple-400 uppercase">{linea.glosa}</td>
                        </tr>
                      ) : (
                        <tr key={idx} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-3 font-mono text-xs text-blue-300 font-bold">{linea.codigo}</td>
                          <td className="px-4 py-3 text-xs text-white font-bold">{linea.descripcion}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-emerald-400 font-bold">{linea.debe>0?formatCLP(linea.debe):<span className="text-gray-700">—</span>}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-orange-400 font-bold">{linea.haber>0?formatCLP(linea.haber):<span className="text-gray-700">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-white/5">
                      <tr>
                        <td colSpan={2} className="px-4 py-3 text-[10px] font-black uppercase text-gray-400">Totales</td>
                        <td className="px-4 py-3 text-right font-mono text-xs font-black text-emerald-400">{formatCLP(debe)}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs font-black text-orange-400">{formatCLP(haber)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })()}
          </div>

          <DialogFooter className="mt-4">
            <Button variant="ghost" onClick={() => setIsLibroModalOpen(false)} className="text-gray-400 hover:text-white">
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
      <NuevoMovimientoModal isOpen={isNuevoModalOpen} setIsOpen={setIsNuevoModalOpen} tipo={activeTab} empresaId={targetId} onGuardado={cargarDatos} />
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
