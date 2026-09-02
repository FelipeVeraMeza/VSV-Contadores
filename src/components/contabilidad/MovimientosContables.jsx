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
import CampoFecha from '@/components/ui/CampoFecha';
import {
  TIPO_DTE_CORTO as TIPO_DTE_MAP, CUENTAS_NOMBRE, CUENTAS, soloImputables,
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
// Los años del selector se calculan, no se escriben. La lista fija
// ['2024'…'2027'] deja de ofrecer el año en curso apenas llega 2028, y el
// síntoma es de los que nadie relaciona con esto: «no me deja elegir el año».
const ANIOS = (() => {
  const y = new Date().getFullYear();
  return Array.from({ length: 4 }, (_, i) => String(y - 2 + i));
})();
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

// «1.225», no «1225». A partir de cuatro cifras el ojo tiene que contar los
// dígitos para saber si son mil doscientos o doce mil.
const formatNum = (n) => new Intl.NumberFormat('es-CL').format(Number(n) || 0);


const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// La fecha en palabras: «1 de enero de 2025». En un panel que decide más de mil
// asientos, «01-01-2025 → 25-08-2026» son dos códigos que hay que descifrar, y
// el día y el mes se confunden entre sí. La frase se lee de corrido.
const fechaEnPalabras = (iso) => {
  if (!iso) return null;
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return null;
  return `${d} de ${MESES_LARGO[m - 1]} de ${a}`;
};

const COLOR_MAP = {
  ventas:    { active: 'bg-emerald-500/10 text-emerald-600 border-b-2 border-emerald-500', badge: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20', total: 'text-emerald-600', row: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  compras:   { active: 'bg-red-500/10 text-red-500 border-b-2 border-red-500',             badge: 'bg-red-500/10 text-red-500 border border-red-500/20',             total: 'text-red-500',     row: 'bg-red-500/10 text-red-500 border-red-500/20' },
  honorarios:{ active: 'bg-amber-500/10 text-amber-600 border-b-2 border-amber-500',       badge: 'bg-amber-500/10 text-amber-600 border border-amber-500/20',       total: 'text-amber-600',   row: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
};

// El asiento por defecto lo genera `generarLineasAsiento` (src/lib/documento.js),
// compartido con AsientoDocumentoModal para que un mismo documento no produzca
// asientos distintos según desde dónde se contabilice.
const calcLineasDefault = (doc, tipo) => generarLineasAsiento(doc, tipo);

// ---------------------------------------------------------------------------
// UN ASIENTO EN LA REVISIÓN PREVIA
// ---------------------------------------------------------------------------
// El documento arriba y sus líneas abajo, con el CÓDIGO de cuenta a la vista y
// no solo el nombre. El código no es decoración: el Balance clasifica por su
// primer dígito —1 activo, 2/3 pasivo y patrimonio, 4 gasto, 5 ingreso— así
// que una cuenta mal elegida se lee bien por el nombre y deja la cifra en la
// mitad equivocada del informe. Es justo lo que esta pantalla viene a atrapar.
// Memorizado: en un lote grande son cientos de filas con su tabla, y cambiarle
// la cuenta a UNA no puede costar redibujarlas todas. Funciona solo si las
// props se mantienen iguales entre renders — de ahí que `getNombre` y los dos
// manejadores estén con `useCallback`, y que `conEdicion` devuelva el mismo
// objeto cuando el asiento no se tocó.
const AsientoRevision = React.memo(({ r, plan = [], getNombre, onCambiarCuenta, onDeshacer,
                                      marcado = true, onAlternar }) => {
  const { doc, tipoMov, lineas, esNotaDoc, editada } = r;
  const esCompra = tipoMov === 'compras';

  // Qué línea está abierta para elegir cuenta. El desplegable se monta SOLO
  // para esa: con 25 asientos de tres líneas serían 75 listas de 289 cuentas
  // cada una dibujadas de entrada, y el panel se arrastraría al abrirse.
  const [editando, setEditando] = useState(null);

  const opcionesDe = (codigoActual) => {
    const imputables = soloImputables(plan);
    const base = imputables.length
      ? imputables
      : Object.entries(CUENTAS_NOMBRE).map(([codigo, descripcion]) => ({ codigo, descripcion }));
    // La cuenta que ya tiene la línea va siempre, aunque no esté en el plan de
    // esta empresa: si no, el desplegable se abriría en blanco y el primer
    // cambio accidental la reemplazaría sin que nadie lo pidiera.
    return base.some(c => c.codigo === codigoActual)
      ? base
      : [{ codigo: codigoActual, descripcion: getNombre(codigoActual) }, ...base];
  };
  const quien = formatText(esCompra ? doc.razon_social_proveedor : doc.razon_social)
    || (esCompra ? doc.rut_proveedor : doc.rut_cliente) || '—';
  const debe  = lineas.reduce((s, l) => s + (Number(l.debe)  || 0), 0);
  const haber = lineas.reduce((s, l) => s + (Number(l.haber) || 0), 0);
  const cuadra = Math.abs(debe - haber) <= 1;

  return (
    // Un documento desmarcado se apaga: se sigue viendo y se puede revisar, pero
    // queda claro de un vistazo que NO va a entrar al lote.
    <div className={`rounded-xl border bg-white overflow-hidden transition-opacity ${
      marcado === false ? 'border-[#efe8dd] opacity-45' : 'border-[#efe8dd]'}`}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border-b border-[#efe8dd] flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {/* La palomita. Va primero y con área de clic grande: es la decisión
              de si este documento entra o no, y se toma antes de mirar nada más. */}
          {onAlternar && (
            <input type="checkbox" checked={marcado !== false}
              onChange={() => onAlternar(r.clave)}
              title={marcado !== false ? 'Quitar del lote' : 'Volver a incluir'}
              className="h-3.5 w-3.5 shrink-0 accent-emerald-600 cursor-pointer" />
          )}
          <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border whitespace-nowrap ${
            esCompra ? 'bg-red-500/10 text-red-600 border-red-500/20' : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'}`}>
            {TIPO_DTE_MAP[doc.tipo_dte] || `Tipo ${doc.tipo_dte}`}
          </span>
          <span className="text-[11px] font-black text-slate-900 tabular-nums">#{doc.folio}</span>
          <span className="text-[10px] text-slate-500 truncate max-w-[15rem]">{quien}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {editada && (
            <button onClick={() => onDeshacer?.(doc, tipoMov)} title="Volver a la cuenta propuesta"
              className="text-[8px] font-black uppercase tracking-wider text-blue-700 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded hover:bg-blue-500/20">
              Editado · deshacer
            </button>
          )}
          {esNotaDoc && (
            <span className="text-[8px] font-black uppercase tracking-wider text-amber-700 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
              Nota
            </span>
          )}
          <span className="text-[10px] text-slate-400 tabular-nums">{String(doc.fecha_emision || '').slice(0, 10)}</span>
        </div>
      </div>

      {/* El scroll horizontal va acá adentro: sin esto, en un teléfono el
          modal entero se corre de lado al llegar a los montos. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[24rem]">
          <thead>
            <tr className="text-[8px] font-black uppercase tracking-widest text-slate-300">
              <th className="px-3 pt-2 text-left">Cuenta</th>
              <th className="px-2 pt-2 text-left" />
              <th className="px-2 pt-2 text-right">Debe</th>
              <th className="px-3 pt-2 text-right">Haber</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={`${l.cuenta}-${i}`} className="border-b border-[#f5f0e8] last:border-0">
                {editando === i ? (
                  // Desplegable nativo a propósito: es una lista de 289 cuentas
                  // y el del sistema de diseño se vuelve pesado repetido. Se
                  // cierra al elegir o al salir, sin botón de confirmar.
                  <td className="px-3 py-1.5" colSpan={2}>
                    <select
                      autoFocus
                      value={l.cuenta}
                      onChange={(e) => { onCambiarCuenta?.(doc, tipoMov, i, e.target.value); setEditando(null); }}
                      onBlur={() => setEditando(null)}
                      onKeyDown={(e) => { if (e.key === 'Escape') setEditando(null); }}
                      className="w-full bg-white border border-blue-400 rounded-md px-2 py-1 text-[11px] font-mono text-slate-900 focus:outline-none"
                    >
                      {opcionesDe(l.cuenta).map(c => (
                        <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.descripcion}</option>
                      ))}
                    </select>
                  </td>
                ) : (
                  <>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <button onClick={() => setEditando(i)}
                        title="Cambiar la cuenta de esta línea"
                        className="font-mono text-[11px] font-bold text-slate-700 hover:text-blue-600 hover:underline decoration-dotted underline-offset-2">
                        {l.cuenta || '— elegir —'}
                      </button>
                    </td>
                    <td className="px-2 py-1.5 text-[10px] text-slate-500">{l.nombre || getNombre(l.cuenta)}</td>
                  </>
                )}
                <td className="px-2 py-1.5 text-[11px] text-right tabular-nums text-slate-700 whitespace-nowrap">{l.debe ? formatCLP(l.debe) : ''}</td>
                <td className="px-3 py-1.5 text-[11px] text-right tabular-nums text-slate-700 whitespace-nowrap">{l.haber ? formatCLP(l.haber) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Un asiento descuadrado lo rechaza el servidor. Mejor verlo acá que
          contarlo como «1 con error» al final del lote. */}
      {!cuadra && (
        <p className="px-3 py-1.5 text-[10px] font-bold text-red-600 bg-red-500/5 border-t border-red-500/20 flex items-center gap-1">
          <AlertCircle className="h-3 w-3 shrink-0" /> No cuadra: debe {formatCLP(debe)} ≠ haber {formatCLP(haber)}
        </p>
      )}
    </div>
  );
});
AsientoRevision.displayName = 'AsientoRevision';

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
  // `useMemo` y no `planData || []` a secas: ese `[]` es un array NUEVO en cada
  // render mientras la consulta no ha vuelto, y `plan` viaja como prop a
  // `AsientoRevision`, que esta memorizado. Con una identidad distinta cada vez,
  // la memorizacion no sirve de nada y vuelven a redibujarse todas las filas.
  const plan = useMemo(() => planData || [], [planData]);
  // Estable entre renders: `AsientoRevision` está memorizado y una función
  // nueva en cada render le rompería la memorización a todas las filas.
  const getNombre = useCallback(
    (codigo) => plan.find(c => c.codigo === codigo)?.descripcion || CUENTAS_NOMBRE[codigo] || codigo,
    [plan]
  );

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
  // Cuántos van y de cuántos. Antes el botón solo decía «CONTABILIZANDO...»:
  // con 100 documentos son varios minutos sin saber si avanza o se colgó.
  const [progreso, setProgreso] = useState(null);   // { hechos, total }
  // Los motivos de los que fallaron. Antes se contaban (`3 con error`) y se
  // perdía el porqué, así que no había forma de arreglarlos sin ir uno por uno.
  const erroresRef = React.useRef([]);

  // De a 4 en paralelo, no de a uno.
  //
  // El bucle anterior era `await` documento por documento: cada uno esperaba a
  // que terminara el anterior, y con 100 documentos eso son 100 viajes en fila.
  // 4 a la vez lo acorta a la cuarta parte sin castigar al servidor ni perder
  // el orden del informe final. Más de 4 no ayuda: el cuello es la base.
  const EN_PARALELO = 4;

  // Recibe las LÍNEAS YA RESUELTAS, no el criterio para calcularlas.
  //
  // Antes las volvía a calcular acá adentro. Desde que la revisión deja
  // corregir cuentas a mano eso es una trampa: el lote arranca justo cuando el
  // panel se cierra, y recalcular en ese momento —leyendo un estado que ya se
  // está limpiando— contabilizaría la propuesta original en vez de lo que la
  // persona aprobó. Se resuelve antes de arrancar y se pasa hecho.
  const contabilizarUno = async ({ doc, tipoMov, lineas }) => {
    try {
      // Las notas cuyo documento afectado no se puede determinar sin
      // ambigüedad quedan fuera del lote: las asigna la persona en el modal.
      let referencia = null;
      if (esNota(doc.tipo_dte)) {
        referencia = await sugerirReferencia(doc, tipoMov);
        if (!referencia) return 'sinReferencia';
      }
      const res = await fetchWithAuth('/accounting/comprobantes', user.sessionId, {
        method: 'POST',
        body: construirPayload(doc, tipoMov, lineas, referencia),
      });
      if (res.ok) return 'ok';
      // Se guarda el motivo que devuelve el servidor, no solo que falló.
      const detalle = await res.json().catch(() => ({}));
      erroresRef.current.push(`Folio ${doc.folio}: ${detalle?.message || detalle?.error || `HTTP ${res.status}`}`);
      return 'fail';
    } catch (e) {
      erroresRef.current.push(`Folio ${doc.folio}: ${e.message}`);
      return 'fail';
    }
  };

  const contabilizarLote = async (entradas, avance) => {
    const cuenta = { ok: 0, fail: 0, sinReferencia: 0 };
    for (let i = 0; i < entradas.length; i += EN_PARALELO) {
      const tanda = entradas.slice(i, i + EN_PARALELO);
      const salidas = await Promise.all(tanda.map(e => contabilizarUno(e)));
      salidas.forEach(s => { cuenta[s]++; });
      avance?.(tanda.length);
    }
    return cuenta;
  };

  // ── Panel de contabilización ──────────────────────────────────
  // Antes el botón decía «CONTABILIZAR TODO» y disparaba de inmediato sobre el
  // período que estuviera aplicado en la pantalla, con un `confirm()` del
  // navegador como única barrera. «Todo» no decía todo de QUÉ, y para
  // contabilizar otro mes había que salir a cambiar el filtro de arriba y
  // volver. Ahora el botón dice «Contabilizar» y abre este panel, donde se
  // elige el período y se ve cuántos documentos entran antes de confirmar.
  const [panelContab, setPanelContab] = useState(false);

  // ── QUÉ DOCUMENTOS ENTRAN, UNO POR UNO ──────────────────────────
  //
  // Antes era todo o nada: el período completo se contabilizaba entero, sin
  // forma de dejar afuera una factura que estaba en revisión, un documento
  // repetido o algo que todavía no correspondía imputar. Para excluir UNO había
  // que achicar el rango de fechas hasta que no lo tomara, o contabilizar y
  // borrar el asiento después.
  //
  // Se guardan las claves DESMARCADAS, no las marcadas: por omisión entran
  // todas —que es lo que se hace el 95% de las veces— y la lista arranca vacía.
  // Si se guardaran las marcadas habría que rellenarla cada vez que cambia el
  // período, y un documento nuevo entraría por accidente sin haber sido visto.
  const [excluidos, setExcluidos] = useState(() => new Set());

  const alternarDocumento = useCallback((clave) => {
    setExcluidos(prev => {
      const s = new Set(prev);
      if (s.has(clave)) s.delete(clave); else s.add(clave);
      return s;
    });
  }, []);

  // ── QUÉ PERÍODO ENTRA AL LOTE ───────────────────────────────────
  //
  // Tres opciones, todas ACOTADAS. Ya no existe «todo lo pendiente»: con la
  // base cargada de arrastre eso eran 1.225 documentos de dos años en un solo
  // acto, y contabilizar dos años de una vez no es una operación que alguien
  // quiera hacer sin querer. Lo que se contabiliza es un mes, o un tramo de
  // meses, o un rango de fechas que uno escribe. Siempre con principio y fin.
  //
  //   mesActual · el mes en curso, de un clic (lo habitual)
  //   meses     · de un mes a otro (el trimestre, el semestre, el año)
  //   rango     · fechas exactas, tecleadas o del calendario
  //
  const [alcance, setAlcance] = useState('mesActual');   // 'mesActual' | 'meses' | 'rango'

  const AHORA = new Date();
  const MES_HOY  = String(AHORA.getMonth() + 1).padStart(2, '0');
  const ANIO_HOY = String(AHORA.getFullYear());

  // Tramo de meses. Arranca y termina en el mes actual: así «meses» equivale a
  // «mes actual» hasta que se toque algo, y nunca amplía el alcance sin pedirlo.
  const [mesDesde,  setMesDesde]  = useState(MES_HOY);
  const [anioDesde, setAnioDesde] = useState(ANIO_HOY);
  const [mesHasta,  setMesHasta]  = useState(MES_HOY);
  const [anioHasta, setAnioHasta] = useState(ANIO_HOY);

  // Rango de fechas exacto. Se inicializa al mes en curso por el mismo motivo.
  const ultimoDiaDelMes = (a, m) => new Date(Number(a), Number(m), 0).getDate();
  const [fechaDesde, setFechaDesde] = useState(`${ANIO_HOY}-${MES_HOY}-01`);
  const [fechaHasta, setFechaHasta] = useState(
    `${ANIO_HOY}-${MES_HOY}-${String(ultimoDiaDelMes(ANIO_HOY, MES_HOY)).padStart(2, '0')}`
  );

  // ── El panel tiene DOS PASOS ────────────────────────────────────
  //
  // «Las cuentas contables se ven ANTES de contabilizar, no después»: una vez
  // creado el asiento, revisar en qué cuenta quedó cada documento obliga a
  // abrirlos de a uno y descontabilizar los que estén mal. Así que la revisión
  // se movió a donde sirve — antes de apretar.
  //
  //   config   · qué período y con qué cuenta de ingreso
  //   revision · qué asiento va a quedar, con sus cuentas, y quién lo firma
  //
  const [pasoPanel, setPasoPanel] = useState('config');   // 'config' | 'revision'

  // La ÚNICA cuenta que se pregunta. Las demás del asiento no son una decisión:
  // el IVA débito, el deudor y el proveedor salen del tipo de documento, no del
  // criterio de quien contabiliza. La de ingreso sí cambia según el giro, y es
  // la que hoy quedaba fija en 5101-01 para todo el mundo.
  const [cuentaIngreso, setCuentaIngreso] = useState(CUENTAS.VENTAS);

  // ── LAS CUENTAS QUE SE CAMBIARON A MANO EN LA REVISIÓN ──────────
  //
  // La revisión no es solo para mirar: cada asiento se puede corregir ahí
  // mismo. La cuenta de ingreso del paso 1 es el valor de partida para las 25;
  // acá se aparta la que tenga que ir distinta, que es el caso real —el gasto
  // de una compra depende del proveedor, y hay ventas que no van al mismo
  // ingreso que el resto—.
  //
  // La clave es `claveDeDocumento`, la identidad completa del documento
  // (clase|tipo|folio|rut). NO el folio ni la posición en la lista: el folio se
  // repite entre tipos y años, y la posición cambia al cambiar el período.
  const [edicionRevision, setEdicionRevision] = useState({});   // clave → líneas

  // Cambiar la cuenta de ingreso GENERAL rehace la propuesta entera, así que
  // las correcciones puntuales anteriores dejan de tener sentido: estaban
  // hechas sobre otros asientos. Se limpian en vez de quedar escondidas y
  // aplicarse sin que nadie se acuerde de ellas.
  React.useEffect(() => { setEdicionRevision({}); }, [cuentaIngreso]);

  // Las cuentas de ingreso del plan. En el plan chileno el 5 es resultado por
  // ingreso; si el plan de la empresa todavía no está cargado se ofrece al
  // menos la de siempre, para que el panel nunca quede sin opciones.
  const cuentasIngreso = useMemo(() => {
    const delPlan = soloImputables(plan).filter(c => String(c.codigo || '').startsWith('5'));
    if (delPlan.length) return delPlan;
    return [{ codigo: CUENTAS.VENTAS, descripcion: CUENTAS_NOMBRE[CUENTAS.VENTAS] }];
  }, [plan]);

  // El asiento que va a quedar. Es `generarLineasAsiento` —el mismo molde que
  // usa la fila y el modal, para que un documento no produzca dos asientos
  // distintos según desde dónde se contabilice— con la cuenta de ingreso
  // cambiada por la elegida.
  //
  // Se reemplaza POR CÓDIGO y no por posición: en una nota de crédito el orden
  // de las líneas se invierte, así que «la segunda línea» sería la equivocada.
  const lineasConCuentas = useCallback((doc, tipoMov) => {
    const lineas = calcLineasDefault(doc, tipoMov);
    if (tipoMov !== 'ventas' || !cuentaIngreso || cuentaIngreso === CUENTAS.VENTAS) return lineas;
    return lineas.map(l => l.cuenta === CUENTAS.VENTAS
      ? { ...l, cuenta: cuentaIngreso, nombre: getNombre(cuentaIngreso) }
      : l);
  }, [cuentaIngreso, plan]); // eslint-disable-line react-hooks/exhaustive-deps

  // EL asiento definitivo de un documento: lo corregido a mano si se tocó, y si
  // no la propuesta. Es la única función que debe usarse para contabilizar —
  // volver a llamar a `lineasConCuentas` desde el lote descartaría en silencio
  // lo que la persona acaba de corregir en pantalla.
  const lineasFinales = useCallback((doc, tipoMov) => {
    return edicionRevision[claveDeDocumento(doc, tipoMov)] || lineasConCuentas(doc, tipoMov);
  }, [edicionRevision, lineasConCuentas]);

  // Cambiar la cuenta de UNA línea de UN asiento, desde la revisión.
  const cambiarCuentaRevision = useCallback((doc, tipoMov, idx, codigo) => {
    const clave = claveDeDocumento(doc, tipoMov);
    setEdicionRevision(prev => {
      const base = prev[clave] || lineasConCuentas(doc, tipoMov);
      return {
        ...prev,
        [clave]: base.map((l, i) => i === idx
          ? { ...l, cuenta: codigo, nombre: getNombre(codigo) }
          : l),
      };
    });
  }, [lineasConCuentas]); // eslint-disable-line react-hooks/exhaustive-deps

  // Devolver un asiento a la propuesta original.
  const deshacerRevision = useCallback((doc, tipoMov) => {
    const clave = claveDeDocumento(doc, tipoMov);
    setEdicionRevision(prev => {
      const { [clave]: _fuera, ...resto } = prev;
      return resto;
    });
  }, []);

  // ── EL RANGO DE FECHAS DEL LOTE ─────────────────────────────────
  //
  // Las tres opciones terminan siendo lo mismo: un día de inicio y uno de
  // término. Antes cada una filtraba a su manera —una por mes, otra por el
  // período de la pantalla, otra sin filtrar— y había que sostener tres
  // caminos en paralelo. Ahora se resuelve el rango UNA vez y el filtro es
  // uno solo, que además es el mismo que se muestra en pantalla: lo que dice
  // la frase «del … al …» es literalmente lo que se va a contabilizar.
  //
  // `invertido` marca el caso de quien pone el «hasta» antes que el «desde».
  // No se corrige solo dando vuelta las fechas —eso contabilizaría un período
  // que nadie pidió— sino que se avisa y no se deja seguir.
  const rangoAlcance = useMemo(() => {
    if (alcance === 'meses') {
      const fin = ultimoDiaDelMes(anioHasta, mesHasta);
      const desde = `${anioDesde}-${mesDesde}-01`;
      const hasta = `${anioHasta}-${mesHasta}-${String(fin).padStart(2, '0')}`;
      return { desde, hasta, invertido: desde > hasta };
    }
    if (alcance === 'rango') {
      return {
        desde: fechaDesde || null,
        hasta: fechaHasta || null,
        invertido: !!(fechaDesde && fechaHasta && fechaDesde > fechaHasta),
      };
    }
    // 'mesActual'
    const fin = ultimoDiaDelMes(ANIO_HOY, MES_HOY);
    return {
      desde: `${ANIO_HOY}-${MES_HOY}-01`,
      hasta: `${ANIO_HOY}-${MES_HOY}-${String(fin).padStart(2, '0')}`,
    };
  }, [alcance, mesDesde, anioDesde, mesHasta, anioHasta, fechaDesde, fechaHasta, ANIO_HOY, MES_HOY]);

  // Los documentos que entrarían. Se calcula sobre los datos EN CRUDO, no sobre
  // la lista ya filtrada en pantalla: el panel puede apuntar a un mes distinto
  // del que se está viendo.
  //
  // Un documento sin fecha de emisión queda FUERA. Antes, con «todo lo
  // pendiente», entraba igual y terminaba con la fecha que le tocara; ahora no
  // hay forma de saber a qué período pertenece, así que no se adivina.
  const docsDelAlcance = useMemo(() => {
    const { desde, hasta, invertido } = rangoAlcance;
    if (!desde || !hasta || invertido) return { ventas: [], compras: [] };
    const dentro = (d) => {
      const f = String(d.fecha_emision || '').slice(0, 10);
      return !!f && f >= desde && f <= hasta;
    };
    return {
      ventas: rawVentas.filter(d => dentro(d) && !comprobanteDe(d, 'ventas')),
      compras: rawCompras.filter(d => dentro(d) && !comprobanteDe(d, 'compras')),
    };
  }, [rangoAlcance, rawVentas, rawCompras, comprobanteDe]);

  const totalAlcance = docsDelAlcance.ventas.length + docsDelAlcance.compras.length;

  // Las claves de TODO lo del período, para poder desmarcar de una sola vez.
  const clavesDelAlcance = useMemo(() => [
    ...docsDelAlcance.ventas.map(d => claveDeDocumento(d, 'ventas')),
    ...docsDelAlcance.compras.map(d => claveDeDocumento(d, 'compras')),
  ], [docsDelAlcance]);

  // Cuántos van a entrar de verdad al lote.
  const marcadosTotal = useMemo(
    () => clavesDelAlcance.filter(k => !excluidos.has(k)).length,
    [clavesDelAlcance, excluidos]);

  // Al cambiar de período se limpian las exclusiones: son de los documentos que
  // se estaban mirando, no del nuevo tramo. Si se conservaran, una clave que
  // coincidiera dejaría fuera un documento sin que nadie lo hubiera desmarcado.
  // `React.useEffect` y no `useEffect` a secas: este archivo no importa el hook
  // suelto, y usarlo así reventaba al abrir el panel («useEffect is not
  // defined»). No lo detecta el build: es un error de ejecución.
  React.useEffect(() => { setExcluidos(new Set()); }, [rangoAlcance.desde, rangoAlcance.hasta]);

  // ── LO QUE SE VA A REVISAR ANTES DE APRETAR ─────────────────────
  //
  // TODOS los documentos, ventas y compras, sin muestra.
  //
  // Al principio las ventas se mostraban de a cinco, con el argumento de que el
  // asiento es el mismo molde —deudor, ingreso, IVA débito— y que ochenta
  // iguales entrenan a firmar sin leer. El argumento se cae por dos lados: la
  // cuenta se corrige acá mismo, y no se puede corregir lo que no se ve; y el
  // molde no es tan uniforme como parecía —las notas de crédito invierten el
  // debe y el haber, y en una muestra de cinco pueden salir las cinco notas y
  // ninguna factura, que es exactamente lo que pasó al probarlo—.
  // ⚠️ NO depende de `edicionRevision`, a propósito.
  //
  // Si dependiera, cambiarle la cuenta a UN documento rearmaría la lista
  // COMPLETA —con un lote de mil, son mil asientos recalculados y mil filas
  // redibujadas por cada clic en un desplegable—. Acá se arma la propuesta
  // base, que solo cambia cuando cambia el período o la cuenta de ingreso, y
  // la corrección de cada uno se aplica al dibujar (ver `conEdicion`).
  const revisionBase = useMemo(() => {
    if (!panelContab) return null;   // no vale la pena armarlo con el panel cerrado
    const arma = (docs, tipoMov) => docs.map(d => ({
      clave: claveDeDocumento(d, tipoMov),
      doc: d, tipoMov,
      lineas: lineasConCuentas(d, tipoMov),
      esNotaDoc: esNota(d.tipo_dte),
    }));
    return {
      ventas: arma(docsDelAlcance.ventas, 'ventas'),
      compras: arma(docsDelAlcance.compras, 'compras'),
    };
  }, [panelContab, docsDelAlcance, lineasConCuentas]);

  // La propuesta con la corrección de ESE documento, si la tiene. Devuelve el
  // MISMO objeto cuando no hay corrección, para que `AsientoRevision` —que está
  // memorizado— no se redibuje: sin esta igualdad, memorizarlo no serviría de
  // nada porque cada render traería props nuevas.
  const conEdicion = useCallback((r) => {
    const lineas = edicionRevision[r.clave];
    return lineas ? { ...r, lineas, editada: true } : r;
  }, [edicionRevision]);

  // Cerrar el panel lo devuelve al primer paso y descarta las correcciones. Si
  // no, la próxima vez se abriría directo en la revisión de un período que ya
  // no es el elegido, y con cuentas cambiadas para documentos que quizá ni
  // siquiera entran en el nuevo alcance.
  const cerrarPanel = () => {
    setPanelContab(false);
    setPasoPanel('config');
    setEdicionRevision({});
    // Y las palomitas, por la misma razón que las correcciones de cuenta: son
    // de la sesión de revisión que se está cerrando.
    //
    // Sin esto, cancelar dejaba las exclusiones puestas: al reabrir el panel
    // —incluso al día siguiente, o para otra empresa— seguían desmarcados los
    // documentos de la vez anterior y el lote salía incompleto sin que nadie lo
    // hubiera pedido. Medido en la prueba del componente real: se desmarcaban 2
    // de 5, se cancelaba, y al volver a abrir seguían marcados solo 3.
    setExcluidos(new Set());
  };

  // Sin parámetro `auto`: la confirmación es SIEMPRE obligatoria.
  //
  // Antes recibía `auto = true` desde la extracción del SII y en ese modo se
  // saltaba el confirm, así que contabilizaba en lote sin preguntar. Se quitó el
  // parámetro en vez de solo dejar de pasarlo, para que nadie pueda reactivar el
  // atajo sin darse cuenta.
  const handleContabilizarTodo = async () => {
    // Solo lo MARCADO. Un documento desmarcado no se contabiliza: queda
    // pendiente y se puede tomar en otro lote, cuando corresponda.
    const marcado = (d, tipoMov) => !excluidos.has(claveDeDocumento(d, tipoMov));
    const ventasPend  = docsDelAlcance.ventas.filter(d => marcado(d, 'ventas'));
    const comprasPend = docsDelAlcance.compras.filter(d => marcado(d, 'compras'));
    const total = ventasPend.length + comprasPend.length;
    if (total === 0) {
      // Se distingue «no hay nada pendiente» de «los desmarcaste todos»: son
      // dos situaciones distintas y el aviso genérico dejaba pensando que el
      // sistema no había encontrado los documentos.
      const habia = docsDelAlcance.ventas.length + docsDelAlcance.compras.length;
      toast(habia > 0
        ? { variant: 'destructive', title: 'No hay nada marcado',
            description: `Marca al menos un documento: los ${formatNum(habia)} del período están desmarcados.` }
        : { title: 'Todo contabilizado', description: 'No hay documentos pendientes en el período elegido.' });
      return;
    }
    // El `confirm()` del navegador se reemplazó por el panel: ahí se ve el
    // período elegido y el número de documentos ANTES de apretar. Confirmar a
    // ciegas «¿contabilizar 87?» no es una confirmación, es un trámite.
    // Se congela AHORA lo aprobado, antes de cerrar el panel: `cerrarPanel`
    // limpia las correcciones a mano, y resolverlas después sería contabilizar
    // la propuesta original en vez de lo que se acaba de aprobar en pantalla.
    const entradasVentas  = ventasPend.map(d  => ({ doc: d, tipoMov: 'ventas',  lineas: lineasFinales(d, 'ventas') }));
    const entradasCompras = comprasPend.map(d => ({ doc: d, tipoMov: 'compras', lineas: lineasFinales(d, 'compras') }));

    cerrarPanel();
    setIsContabilizando(true);
    erroresRef.current = [];
    let hechos = 0;
    setProgreso({ hechos: 0, total });
    const avanzar = (n) => { hechos += n; setProgreso({ hechos, total }); };
    try {
      const r1 = await contabilizarLote(entradasVentas, avanzar);
      const r2 = await contabilizarLote(entradasCompras, avanzar);
      const ok = r1.ok + r2.ok;
      const fail = r1.fail + r2.fail;
      const sinRef = r1.sinReferencia + r2.sinReferencia;
      const notas = [];
      if (fail) notas.push(`${fail} con error`);
      if (sinRef) notas.push(`${sinRef} nota(s) esperan que indiques el documento afectado`);
      // QUIÉN LO HIZO, dicho de vuelta. El nombre ya se guarda en
      // `comprobantes.contabilizado_por` desde el servidor y se ve en cada fila,
      // pero el aviso del lote no lo decía: en una oficina donde tres personas
      // contabilizan el mismo mes, «se hicieron 87» sin firma no le sirve a
      // nadie para reclamar ni para revisar después.
      const firma = user?.nombre ? ` Quedan a nombre de ${user.nombre}.` : '';
      toast({
        title: `✅ ${ok} contabilizado${ok !== 1 ? 's' : ''} de ${total}`,
        description: (notas.length ? `${notas.join(' · ')}.` : 'Pendientes del período listos.') + firma,
      });
      // Los motivos, aparte y con nombre y apellido. Un aviso que dice
      // «3 con error» obliga a revisar 100 documentos a mano para dar con los 3.
      if (erroresRef.current.length) {
        const muestra = erroresRef.current.slice(0, 4).join('\n');
        const resto = erroresRef.current.length - 4;
        toast({
          variant: 'destructive',
          title: `No se pudieron contabilizar ${erroresRef.current.length}`,
          description: resto > 0 ? `${muestra}\n…y ${resto} más.` : muestra,
        });
        console.warn('Documentos que no se contabilizaron:', erroresRef.current);
      }
      cargarDatos();
      queryClient.invalidateQueries(['comprobantes', targetId]);
    } finally {
      setIsContabilizando(false);
      setProgreso(null);
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
    // ACÁ NO SE VALIDAN LAS CREDENCIALES, a propósito.
    //
    // Este chequeo miraba `selectedCompany.claveSII`, y ese campo casi nunca
    // viene: el objeto del selector solo trae RUT y clave cuando la empresa está
    // en la cartera del CRM. Para la empresa PRINCIPAL y para las que están
    // fuera de cartera se arma uno mínimo —id y razón social— así que el botón
    // respondía «La empresa no tiene RUT o Clave SII configurada» aunque las
    // tuviera, y no había forma de avanzar. Reportado el 27-08-2026 sobre
    // VOLLAIRE & OLIVOS SIMPLE PYME LTDA, que es la principal.
    //
    // Las credenciales viven cifradas en la base y solo el servidor las lee
    // (`src/utils/credencialesSii.js`); por eso ya no viajan al navegador y por
    // eso no se pueden comprobar desde acá. Si falta alguna, el backend responde
    // diciendo CUÁL —«falta el RUT del representante legal y la clave del SII»—,
    // que es más útil que este aviso. `RegistroComprasVentas.jsx` ya se había
    // corregido así; esta pantalla se quedó atrás.
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
      const respuesta = await fetch(`${API_BASE_URL}/sincronizar-sii`, {
        method:'POST', headers:{'Content-Type':'application/json', 'x-session-id': user?.sessionId},
        // Sin credenciales: el backend las lee de la ficha del cliente. Antes se
        // enviaban el RUT y la clave del SII desde el navegador.
        body: JSON.stringify({ mesDesde, anioDesde, mesHasta, anioHasta, empresaId: targetId }),
      });
      const result = await respuesta.json();
      if (result.success) {
        // Traer CERO documentos no es un fracaso —el SII puede no tener nada en
        // ese periodo— pero tampoco es «listo, revísalos»: no hay nada que
        // revisar. El texto de «quedaron como Pendientes» solo corresponde
        // cuando de verdad entró algo, si no manda a buscar lo que no existe.
        const entraron = (result.compras || 0) + (result.ventas || 0);
        toast({
          title: entraron > 0 ? '✅ Extracción Exitosa' : 'Extracción terminada sin novedades',
          description: entraron > 0
            ? `${result.message} Quedaron como Pendientes: revísalos y contabiliza cuando corresponda.`
            : result.message,
        });
        setIsSyncModalOpen(false);
        cargarDatos();
      } else {
        // «Error en el robot» para TODO era parte de la confusión: cuando falta
        // la clave del SII de la empresa, el robot ni siquiera llegó a arrancar
        // y el título mandaba a buscar el problema donde no estaba. El servidor
        // responde 400 cuando el problema son los datos de la ficha y 500 cuando
        // se cayó de verdad en el portal.
        toast({
          variant: 'destructive',
          description: result.message,
          title: respuesta.status === 400 ? 'Faltan datos de la empresa' : '❌ Error en el Robot',
        });
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
          <Button onClick={() => setPanelContab(v => !v)} disabled={isContabilizando || !hayDatos}
            className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 disabled:opacity-50 text-slate-900 font-black uppercase text-[10px] tracking-widest">
            {isContabilizando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Bot className="h-4 w-4 mr-2" />}
            {isContabilizando
              ? (progreso ? `CONTABILIZANDO ${progreso.hechos}/${progreso.total}` : 'CONTABILIZANDO...')
              : 'CONTABILIZAR'}
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

      {/* ¿QUÉ SE VA A CONTABILIZAR? · pantalla flotante
          Antes esto era un `confirm()` del navegador que solo decía un número.
          Contabilizar es irreversible en la práctica —deja asientos con folio
          correlativo— así que la pantalla tiene que responder tres cosas ANTES
          de apretar: desde qué día hasta qué día, cuántos documentos, y de qué
          tipo. Un «AGOSTO / 2026» no responde la primera. */}
      {panelContab && !isContabilizando && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
             onClick={cerrarPanel}>
          {/* La revisión necesita más ancho: son asientos con cuatro columnas.
              El paso de configuración se queda angosto, que es lo que pide. */}
          <div className={`w-full bg-white border border-[#efe8dd] rounded-2xl shadow-2xl flex flex-col max-h-[92vh] ${
                 pasoPanel === 'revision' ? 'max-w-3xl' : 'max-w-lg'}`}
               onClick={(e) => e.stopPropagation()}>

            {/* Encabezado */}
            <div className="p-5 border-b border-[#efe8dd] flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-600 shrink-0">
                  {pasoPanel === 'revision' ? <FileCheck size={20} /> : <Bot size={20} />}
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                    {pasoPanel === 'revision' ? 'Revisar antes de contabilizar' : 'Contabilizar'}
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    {pasoPanel === 'revision'
                      ? 'Pulsa cualquier cuenta para cambiarla antes de guardar'
                      : 'Primero lo básico. Después revisas todo, y recién ahí se guarda.'}
                  </p>
                </div>
              </div>
              <button onClick={cerrarPanel} aria-label="Cerrar"
                      className="p-2 rounded-xl bg-slate-50 text-slate-500 hover:text-red-500 shrink-0">
                <span className="text-sm">✕</span>
              </button>
            </div>

            {/* ═══════════ PASO 2 · REVISIÓN ═══════════ */}
            {pasoPanel === 'revision' && revisionBase && (
              <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar">

                {/* MARCAR Y DESMARCAR TODO, con la cuenta de lo que va a entrar.
                    Sin este contador habría que ir sumando a ojo cuáles quedaron
                    marcados en una lista de ochenta. */}
                <div className="flex items-center justify-between gap-3 rounded-xl border border-[#efe8dd] bg-white px-4 py-2.5">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input type="checkbox" checked={excluidos.size === 0}
                      // Indeterminado cuando hay algunos marcados y otros no: es
                      // el estado real de la lista, y decir «marcado» o «vacío»
                      // en ese caso sería mentir.
                      ref={el => { if (el) el.indeterminate = excluidos.size > 0 && marcadosTotal > 0; }}
                      onChange={() => setExcluidos(excluidos.size === 0 ? new Set(clavesDelAlcance) : new Set())}
                      className="h-4 w-4 accent-emerald-600 cursor-pointer" />
                    <span className="text-[11px] font-bold text-slate-700">
                      {excluidos.size === 0 ? 'Todos marcados' : 'Marcar todos'}
                    </span>
                  </label>
                  <p className="text-[11px] text-slate-600 tabular-nums">
                    <b className={marcadosTotal === 0 ? 'text-red-600' : 'text-slate-900'}>{formatNum(marcadosTotal)}</b>
                    {' '}de {formatNum(totalAlcance)} entran al lote
                  </p>
                </div>

                {/* Quién firma. Va ARRIBA y no en la letra chica del pie: el
                    asiento queda con nombre y apellido en la base, así que
                    quien aprieta tiene que saber que está firmando. */}
                <div className="flex items-center gap-2.5 rounded-xl border border-[#efe8dd] bg-slate-50 px-4 py-2.5">
                  <Award className="h-4 w-4 text-slate-400 shrink-0" />
                  <p className="text-[11px] text-slate-600 leading-tight">
                    {marcadosTotal === 0
                      ? <>No hay ningún documento marcado: no se va a contabilizar nada.</>
                      : <>Los {formatNum(marcadosTotal)} asientos marcados van a quedar a nombre de{' '}
                         <b className="text-slate-900">{user?.nombre || 'tu usuario'}</b>, con la fecha y hora de ahora.</>}
                  </p>
                </div>

                {/* Cuántas se cambiaron a mano. Con 25 asientos abiertos es la
                    única forma de saber qué se tocó sin recorrerlos de nuevo. */}
                {Object.keys(edicionRevision).length > 0 && (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-2">
                    <p className="text-[11px] text-blue-900">
                      <b>{Object.keys(edicionRevision).length}</b>{' '}
                      {Object.keys(edicionRevision).length === 1 ? 'asiento corregido' : 'asientos corregidos'} a mano
                    </p>
                    <button onClick={() => setEdicionRevision({})}
                      className="text-[9px] font-black uppercase tracking-widest text-blue-700 hover:text-blue-900">
                      Deshacer todo
                    </button>
                  </div>
                )}

                {/* ── VENTAS · todas ── */}
                {revisionBase.ventas.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-emerald-700 mb-2">
                      Ventas · {formatNum(revisionBase.ventas.length)}
                    </p>
                    <div className="space-y-2">
                      {revisionBase.ventas.map(base => { const r = conEdicion(base); return (
                        <AsientoRevision key={r.clave} r={r} plan={plan} getNombre={getNombre}
                          onCambiarCuenta={cambiarCuentaRevision} onDeshacer={deshacerRevision}
                          marcado={!excluidos.has(r.clave)} onAlternar={alternarDocumento} />
                      ); })}
                    </div>
                  </div>
                )}

                {/* ── COMPRAS · todas ── */}
                {revisionBase.compras.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-red-600 mb-2">
                      Compras · {formatNum(revisionBase.compras.length)}
                    </p>
                    {/* En compras la cuenta de gasto la decide el proveedor y
                        todas se proponen contra la misma. Se avisa acá, junto a
                        la lista, que es donde se puede corregir. */}
                    <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 mb-2">
                      <p className="text-[10px] text-amber-800 leading-relaxed">
                        <b>Ojo con el gasto.</b> Todas se proponen contra{' '}
                        <span className="font-mono">{CUENTAS.GASTOS}</span> {getNombre(CUENTAS.GASTOS)}, que es el
                        cajón por omisión. Si alguna va a otra cuenta, <b>pulsa su código acá abajo y cámbialo</b>:
                        una vez contabilizada hay que descontabilizarla para corregirla.
                      </p>
                    </div>
                    <div className="space-y-2">
                      {revisionBase.compras.map(base => { const r = conEdicion(base); return (
                        <AsientoRevision key={r.clave} r={r} plan={plan} getNombre={getNombre}
                          onCambiarCuenta={cambiarCuentaRevision} onDeshacer={deshacerRevision}
                          marcado={!excluidos.has(r.clave)} onAlternar={alternarDocumento} />
                      ); })}
                    </div>
                  </div>
                )}

                {totalAlcance === 0 && (
                  <p className="text-sm font-bold text-slate-400 text-center py-8">No hay nada pendiente que revisar.</p>
                )}
              </div>
            )}

            {/* ═══════════ PASO 1 · CONFIGURACIÓN ═══════════ */}
            {pasoPanel === 'config' && (
            <div className="p-5 space-y-5 overflow-y-auto custom-scrollbar">
              {/* Todo en minúsculas y en forma de pregunta. Antes cada bloque
                  llevaba un «1 · QUÉ PERÍODO» en versalitas negras: cuatro
                  encabezados gritando convierten una decisión de dos clics en
                  la sensación de estar llenando un formulario del SII. */}
              <div>
                <p className="text-sm font-bold text-slate-800 mb-2.5">¿Qué quieres contabilizar?</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    ['mesActual', 'El mes actual', `${MESES.find(m => m.value === MES_HOY)?.label.toLowerCase()} ${ANIO_HOY}`],
                    ['meses',     'Varios meses',  'De un mes a otro'],
                    ['rango',     'Un período',    'Con fechas exactas'],
                  ].map(([id, titulo, ayuda]) => (
                    <button key={id} onClick={() => setAlcance(id)}
                      className={`text-left px-3 py-2.5 rounded-xl border transition-all ${
                        alcance === id
                          ? 'bg-amber-50 border-amber-400 ring-1 ring-amber-300 shadow-sm'
                          : 'bg-white border-[#efe8dd] hover:border-amber-300 hover:bg-amber-50/30'}`}>
                      <span className={`block text-xs font-bold ${alcance === id ? 'text-amber-800' : 'text-slate-700'}`}>{titulo}</span>
                      <span className="block text-[10px] text-slate-400 leading-tight mt-0.5">{ayuda}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tramo de meses: de uno a otro. Sirve para el trimestre, el
                  semestre o el año, sin tener que escribir los días. */}
              {alcance === 'meses' && (
                <div className="flex items-center gap-2 flex-wrap bg-slate-50 border border-[#efe8dd] rounded-xl px-3 py-2.5">
                  <CalendarDays className="h-4 w-4 text-amber-600 shrink-0" />
                  <span className="text-[11px] text-slate-500">Desde</span>
                  <select value={mesDesde} onChange={e => setMesDesde(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer">
                    {MESES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <select value={anioDesde} onChange={e => setAnioDesde(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer">
                    {ANIOS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <span className="text-[11px] text-slate-500 ml-1">hasta</span>
                  <select value={mesHasta} onChange={e => setMesHasta(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer">
                    {MESES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <select value={anioHasta} onChange={e => setAnioHasta(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer">
                    {ANIOS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              )}

              {/* Fechas exactas. Es el mismo campo del filtro de arriba: se
                  teclea o se elige del calendario, sin dos formas distintas de
                  poner una fecha en la misma pantalla. */}
              {alcance === 'rango' && (
                <div className="flex items-center gap-4 flex-wrap bg-slate-50 border border-[#efe8dd] rounded-xl px-3 py-2.5">
                  <CalendarDays className="h-4 w-4 text-amber-600 shrink-0" />
                  <CampoFecha label="Desde" value={fechaDesde} onChange={setFechaDesde} />
                  <CampoFecha label="Hasta" value={fechaHasta} onChange={setFechaHasta} />
                </div>
              )}

              {/* EL RANGO, dicho como una frase. Sigue siendo el dato que más
                  importa —desde qué día hasta cuál— pero «del 1 de enero de 2025
                  al 25 de agosto de 2026» se entiende sin descifrar, y no deja
                  dudas de si el 01-08 es enero o agosto. */}
              <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${
                rangoAlcance.invertido ? 'border-red-300 bg-red-50/70' : 'border-amber-200 bg-amber-50/60'}`}>
                <CalendarDays className={`h-4 w-4 shrink-0 mt-0.5 ${rangoAlcance.invertido ? 'text-red-500' : 'text-amber-600'}`} />
                <div className="min-w-0">
                  {rangoAlcance.invertido ? (
                    // Las fechas al revés no se dan vuelta solas: corregirlas por
                    // dentro contabilizaría un período que nadie eligió.
                    <>
                      <p className="text-[13px] font-bold text-red-700 leading-snug">La fecha de término es anterior a la de inicio</p>
                      <p className="text-[11px] text-red-600/80 mt-0.5 leading-tight">
                        Corrige el «hasta» para poder seguir.
                      </p>
                    </>
                  ) : rangoAlcance.desde && rangoAlcance.hasta ? (
                    <p className="text-[13px] text-slate-800 leading-snug">
                      Del <b className="text-slate-900">{fechaEnPalabras(rangoAlcance.desde)}</b>{' '}
                      al <b className="text-slate-900">{fechaEnPalabras(rangoAlcance.hasta)}</b>
                    </p>
                  ) : (
                    <p className="text-[13px] font-bold text-slate-400">Falta indicar las fechas</p>
                  )}
                </div>
              </div>

              {/* LA ÚNICA CUENTA QUE SE PREGUNTA.
                  El resto del asiento no es una decisión de quien contabiliza:
                  el deudor, el proveedor y el IVA salen del tipo de documento.
                  La de ingreso sí cambia según el giro de la empresa, y hasta
                  ahora quedaba clavada en 5101-01 para todas. */}
              <div>
                <p className="text-sm font-bold text-slate-800 mb-2.5">¿Contra qué cuenta van las ventas?</p>
                <Select value={cuentaIngreso} onValueChange={setCuentaIngreso}>
                  <SelectTrigger className="w-full bg-white border border-[#efe8dd] rounded-xl h-11 text-xs text-slate-900">
                    <SelectValue>
                      <span className="font-mono">{cuentaIngreso} — {getNombre(cuentaIngreso)}</span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {cuentasIngreso.map(c => (
                      <SelectItem key={c.codigo} value={c.codigo}>
                        <span className="font-mono text-xs">{c.codigo} — {c.descripcion}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                  Es el punto de partida. En el paso siguiente puedes cambiársela a cualquiera, una por una.
                </p>
              </div>

              {/* EL RESUMEN, como una frase con el número grande al lado.
                  Antes eran tres recuadros con rótulos en versalitas —VENTAS,
                  COMPRAS, EN TOTAL— que hay que leer de a uno y cruzar mentalmente.
                  Una sola frase dice lo mismo y se lee de un vistazo. */}
              <div className="rounded-2xl border border-[#efe8dd] bg-slate-50 px-4 py-4 flex items-center gap-4">
                <div className="text-center shrink-0">
                  <p className="text-3xl font-black text-slate-900 tabular-nums leading-none">{formatNum(totalAlcance)}</p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {totalAlcance === 1 ? 'documento' : 'documentos'}
                  </p>
                </div>
                <div className="min-w-0 border-l border-[#e6ded2] pl-4">
                  <p className="text-[13px] text-slate-700 leading-snug">
                    <b className="text-emerald-700">{formatNum(docsDelAlcance.ventas.length)}</b>{' '}
                    {docsDelAlcance.ventas.length === 1 ? 'venta' : 'ventas'}
                    {' · '}
                    <b className="text-red-600">{formatNum(docsDelAlcance.compras.length)}</b>{' '}
                    {docsDelAlcance.compras.length === 1 ? 'compra' : 'compras'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Solo los que están pendientes. Lo ya contabilizado no se toca ni se duplica.
                  </p>
                </div>
              </div>

              {/* La advertencia de las notas de crédito, más corta y aparte: es
                  una excepción, no parte de lo que hay que decidir acá. */}
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Las notas de crédito cuyo documento afectado no se pueda deducir quedan fuera del lote;
                esas se asignan a mano desde su fila.
              </p>
            </div>
            )}

            {/* Pie · cambia con el paso.
                El botón que contabiliza SOLO existe en la revisión: mientras no
                se hayan visto los asientos no hay a qué darle el visto bueno. */}
            <div className="p-4 border-t border-[#efe8dd] flex flex-wrap items-center justify-end gap-2 bg-white">
              {pasoPanel === 'config' ? (
                <>
                  <Button variant="ghost" onClick={cerrarPanel}
                    className="text-xs font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 h-10 rounded-xl px-4 whitespace-nowrap shrink-0">
                    Cancelar
                  </Button>
                  <Button onClick={() => setPasoPanel('revision')} disabled={totalAlcance === 0}
                    className="bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-bold h-10 rounded-xl px-4 whitespace-nowrap shrink-0 flex-1 sm:flex-none">
                    <Eye className="h-4 w-4 mr-2" />
                    {totalAlcance === 0 ? 'Nada pendiente' : `Veamos cómo quedan`}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => setPasoPanel('config')}
                    className="text-xs font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 h-10 rounded-xl px-4 whitespace-nowrap shrink-0">
                    <ChevronLeft className="h-4 w-4 mr-1" /> Volver
                  </Button>
                  {/* El botón dice cuántos van a entrar DE VERDAD, no cuántos hay
                      en el período, y se apaga si no queda ninguno marcado. */}
                  <Button onClick={handleContabilizarTodo} disabled={marcadosTotal === 0}
                    title={marcadosTotal === 0 ? 'Marca al menos un documento' : undefined}
                    className="bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-bold h-10 rounded-xl px-4 whitespace-nowrap shrink-0 flex-1 sm:flex-none">
                    <Bot className="h-4 w-4 mr-2" />
                    {marcadosTotal === 0
                      ? 'Marca al menos uno'
                      : `Está bien, contabilizar ${formatNum(marcadosTotal)}`}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

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
                                                  {/* `z-50` explícito era más bajo que la capa de modales y
                                                      dejaba la lista debajo. Se quita para que valga el z-[120]
                                                      del componente. */}
                                                  <SelectContent className="bg-white border-[#efe8dd] text-slate-700 max-h-[200px] overflow-y-auto">
                                                    {soloImputables(plan).map(c => (
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
