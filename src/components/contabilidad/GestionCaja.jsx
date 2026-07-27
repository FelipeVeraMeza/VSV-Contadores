import React, { useState, useMemo } from 'react';
import {
  Plus, Loader2, Trash2, Wallet, ArrowDownRight, Banknote, CreditCard,
  ArrowLeftRight, Coins, Search, CheckCircle2, Check, CircleDollarSign, RefreshCcw, Pencil,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { crearMovimientoCajaApi, crearMovimientosCajaLoteApi, listarMovimientosCajaApi, editarMovimientoCajaApi, eliminarMovimientoCajaApi } from '@/services/cajaService';
import { obtenerHistorialBunker, obtenerComprasBunker } from '@/services/dteConsultasService';
import { fetchWithAuth } from '@/services/apiClient';

const formatCLP = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(v || 0);
const formatFecha = (f) => f ? new Date(String(f).length === 10 ? f + 'T00:00:00' : f).toLocaleDateString('es-CL', { timeZone: 'UTC' }) : '—';
// Normaliza un folio a SOLO dígitos para que el match sea inmune a formato/tipo (#, espacios, etc.)
const limpiarFolio = (v) => String(v ?? '').replace(/[^0-9]/g, '');

const MEDIOS = [
  { id: 'efectivo',      label: 'Efectivo',      icon: Coins },
  { id: 'transferencia', label: 'Transferencia', icon: ArrowLeftRight },
  { id: 'cheque',        label: 'Cheque',        icon: Banknote },
  { id: 'tarjeta',       label: 'Tarjeta',       icon: CreditCard },
  { id: 'otro',          label: 'Otro',          icon: Wallet },
];

const GestionCaja = ({ empresaId, rango, tipo }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const esRecaudacion = tipo === 'recaudacion';
  const targetId = empresaId || 'ALL';
  const labelContraparte = esRecaudacion ? 'Cliente' : 'Proveedor';
  const verboEfectivo = esRecaudacion ? 'Cobrar' : 'Pagar';
  const estadoEfectivoLabel = esRecaudacion ? 'Cobrado' : 'Pagado';
  const estadoPendienteLabel = esRecaudacion ? 'Por cobrar' : 'Por pagar';

  const [busqueda, setBusqueda]       = useState('');
  const [vista, setVista]             = useState('pendientes'); // 'pendientes' | 'pagados'
  const [seleccion, setSeleccion]     = useState(new Set());
  const [deshaciendoFolio, setDeshaciendoFolio] = useState(null);
  const [isEfectivizando, setIsEfectivizando] = useState(false);
  const [efectivizandoId, setEfectivizandoId] = useState(null);
  const [isOpen, setIsOpen]           = useState(false);
  const [isSaving, setIsSaving]       = useState(false);
  const [deletingId, setDeletingId]   = useState(null);
  const [medioModal, setMedioModal]   = useState(null); // { titulo, ids:[], actual }
  const [savingMedio, setSavingMedio] = useState(false);
  const [form, setForm] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    rut: '', nombre: '', folio_asociado: '', monto: '', medio_pago: 'transferencia', glosa: '',
  });

  const desde = rango?.desde, hasta = rango?.hasta;

  // ── Documentos del SII (ventas para recaudación / compras para pago) ──
  const { data: docsData, isLoading: loadingDocs } = useQuery({
    queryKey: ['caja-docs', tipo, targetId],
    queryFn: async () => {
      const res = esRecaudacion ? await obtenerHistorialBunker(targetId) : await obtenerComprasBunker(targetId);
      return res.ok ? (res.documentos || []) : [];
    },
    enabled: !!user?.sessionId,
    staleTime: 15000,
    refetchOnMount: 'always',
  });
  const documentosRaw = Array.isArray(docsData) ? docsData : [];

  // ── Comprobantes contabilizados (un documento solo aparece si está contabilizado) ──
  const { data: compData } = useQuery({
    queryKey: ['comprobantes', targetId],
    queryFn: async () => {
      const param = (!targetId || targetId === 'ALL') ? 'null' : targetId;
      const res = await fetchWithAuth(`/accounting/comprobantes?empresaId=${param}`, user.sessionId);
      if (!res.ok) return { comprobantes: [] };
      return res.json();
    },
    enabled: !!user?.sessionId,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const foliosContabilizados = useMemo(() => {
    const s = new Set();
    (compData?.comprobantes || []).forEach(c => {
      const match = c.glosa?.match(/#(\d+)/);
      if (match) s.add(limpiarFolio(match[1]));
    });
    return s;
  }, [compData]);

  // ── Movimientos de caja (todos, sin filtro de fecha, para calcular lo ya cobrado/pagado) ──
  const { data: movData } = useQuery({
    queryKey: ['caja-mov', tipo, targetId],
    queryFn: async () => {
      const res = await listarMovimientosCajaApi(user.sessionId, empresaId, tipo);
      if (!res.ok) return { movimientos: [] };
      return res.json();
    },
    enabled: !!user?.sessionId,
    staleTime: 0,
  });
  // fetchWithAuth pasa la respuesta por mapperToCamel, que renombra folio_asociado → folioAsociado.
  // Normalizamos para que el enlace por folio funcione con o sin el mapper.
  const movimientos = (movData?.movimientos || []).map(m => ({
    ...m,
    folio_asociado: m.folio_asociado ?? m.folioAsociado ?? '',
    medio_pago: m.medio_pago ?? m.medioPago ?? 'efectivo',
  }));

  const pagadoPorFolio = useMemo(() => {
    const m = {};
    movimientos.forEach(mv => {
      const f = limpiarFolio(mv.folio_asociado);
      if (!f) return;
      m[f] = (m[f] || 0) + Number(mv.monto || 0);
    });
    return m;
  }, [movimientos]);

  // Medio(s) de pago por folio: Set con los medios usados en los movimientos de ese folio
  const mediosPorFolio = useMemo(() => {
    const m = {};
    movimientos.forEach(mv => {
      const f = limpiarFolio(mv.folio_asociado);
      if (!f) return;
      (m[f] ||= new Set()).add(mv.medio_pago || 'efectivo');
    });
    return m;
  }, [movimientos]);

  const infoMedio = (id) => MEDIOS.find(x => x.id === id) || MEDIOS[MEDIOS.length - 1];

  const dentroRango = (fecha) => {
    if (!fecha) return false;
    if (desde && hasta) { const f = String(fecha).slice(0, 10); return f >= desde && f <= hasta; }
    return true;
  };

  // ── Cuentas por cobrar / pagar = documentos contabilizados dentro del rango ──
  const cuentas = useMemo(() => {
    return documentosRaw
      .filter(d => foliosContabilizados.has(limpiarFolio(d.folio)) && dentroRango(d.fecha_emision))
      .map(d => {
        const neto  = Number(d.monto_neto) || 0;
        const iva   = Number(d.monto_iva)  || Math.round(neto * 0.19);
        const total = Number(d.monto_total) || (neto + iva);
        const pagado = pagadoPorFolio[limpiarFolio(d.folio)] || 0;
        const saldo  = Math.max(0, total - pagado);
        const estado = saldo <= 1 ? 'efectivo' : pagado > 0 ? 'parcial' : 'pendiente';
        return {
          id: String(d.id || d.folio),
          folio: d.folio,
          fecha: d.fecha_emision,
          rut: esRecaudacion ? d.rut_cliente : d.rut_proveedor,
          nombre: esRecaudacion ? d.razon_social : d.razon_social_proveedor,
          total, pagado, saldo, estado,
        };
      })
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  }, [documentosRaw, foliosContabilizados, pagadoPorFolio, desde, hasta, esRecaudacion]);

  const cuentasFiltradas = useMemo(() => {
    if (!busqueda.trim()) return cuentas;
    const q = busqueda.toLowerCase().replace(/[.\-\s]/g, '');
    return cuentas.filter(c => `${c.folio || ''} ${c.rut || ''} ${c.nombre || ''}`.toLowerCase().replace(/[.\-\s]/g, '').includes(q));
  }, [cuentas, busqueda]);

  // Separación en las 2 pestañas: Por cobrar/pagar vs Cobrado/Pagado
  const pendientesList = useMemo(() => cuentasFiltradas.filter(c => c.estado !== 'efectivo'), [cuentasFiltradas]);
  const pagadosList    = useMemo(() => cuentasFiltradas.filter(c => c.estado === 'efectivo'), [cuentasFiltradas]);
  const cuentasVista   = vista === 'pagados' ? pagadosList : pendientesList;

  const seleccionables = pendientesList; // solo se puede seleccionar lo pendiente
  const seleccionValida = useMemo(() => [...seleccion].filter(id => seleccionables.some(c => c.id === id)), [seleccion, seleccionables]);
  const totalSeleccion = useMemo(() => seleccionables.filter(c => seleccion.has(c.id)).reduce((s, c) => s + c.saldo, 0), [seleccionables, seleccion]);

  // Limpiar selección cuando cambia el contexto o la pestaña
  React.useEffect(() => { setSeleccion(new Set()); }, [tipo, targetId, desde, hasta, vista]);

  const totalPorCobrar = cuentas.reduce((s, c) => s + c.saldo, 0);
  const totalEfectivo  = cuentas.reduce((s, c) => s + c.pagado, 0);
  const pendientesCount = cuentas.filter(c => c.estado !== 'efectivo').length;

  // Movimientos manuales sin documento asociado (no quedan ocultos)
  const foliosCuentas = useMemo(() => new Set(cuentas.map(c => limpiarFolio(c.folio))), [cuentas]);
  const otrosMovimientos = useMemo(() => movimientos.filter(mv => {
    const f = limpiarFolio(mv.folio_asociado);
    if (f && foliosCuentas.has(f)) return false;
    return dentroRango(mv.fecha);
  }), [movimientos, foliosCuentas, desde, hasta]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresca TODO lo que alimenta esta vista (cobros, documentos y comprobantes)
  const refrescar = () => {
    queryClient.invalidateQueries(['caja-mov', tipo, targetId]);
    queryClient.invalidateQueries(['caja-docs', tipo, targetId]);
    queryClient.invalidateQueries(['comprobantes', targetId]);
  };

  // ── Selección ──
  const toggleSel = (id) => setSeleccion(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSeleccion(prev => {
    const todos = seleccionables.length > 0 && seleccionables.every(c => prev.has(c.id));
    return todos ? new Set() : new Set(seleccionables.map(c => c.id));
  });

  // ── Hacer efectivo (hoy + efectivo, por el saldo pendiente) ──
  const hacerEfectivo = async (ids) => {
    const objetivo = cuentasFiltradas.filter(c => ids.includes(c.id) && c.saldo > 0);
    if (objetivo.length === 0) return;
    objetivo.length > 1 ? setIsEfectivizando(true) : setEfectivizandoId(objetivo[0].id);
    try {
      const hoy = new Date().toISOString().slice(0, 10);
      const res = await crearMovimientosCajaLoteApi(user.sessionId, {
        empresaId: targetId, tipo,
        movimientos: objetivo.map(c => ({
          fecha: hoy, rut: c.rut || '', nombre: c.nombre || '',
          folio_asociado: String(c.folio), monto: c.saldo, medio_pago: 'transferencia',
          glosa: `${esRecaudacion ? 'Cobro' : 'Pago'} folio #${c.folio}`,
        })),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Error al registrar');
      const monto = objetivo.reduce((s, c) => s + c.saldo, 0);
      toast({ title: `✅ ${objetivo.length} ${esRecaudacion ? 'cobrad' : 'pagad'}${objetivo.length !== 1 ? 'os' : 'o'}`, description: formatCLP(monto) });
      setSeleccion(new Set());
      refrescar();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally { setIsEfectivizando(false); setEfectivizandoId(null); }
  };

  // ── Deshacer efectivo: borra los movimientos del folio y vuelve a pendiente ──
  const deshacerEfectivo = async (folio) => {
    const ids = movimientos.filter(mv => limpiarFolio(mv.folio_asociado) === limpiarFolio(folio)).map(mv => mv.id);
    if (ids.length === 0) return;
    if (!confirm(`¿Deshacer el ${esRecaudacion ? 'cobro' : 'pago'} del folio #${folio}? Volverá a quedar ${estadoPendienteLabel.toLowerCase()}.`)) return;
    setDeshaciendoFolio(String(folio));
    try {
      for (const id of ids) {
        const res = await eliminarMovimientoCajaApi(user.sessionId, id);
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Error al deshacer'); }
      }
      toast({ title: '↩️ Deshecho', description: `Folio #${folio} volvió a ${estadoPendienteLabel.toLowerCase()}.` });
      refrescar();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally { setDeshaciendoFolio(null); }
  };

  // ── Registro manual ──
  const onChangeFolio = (val) => {
    const doc = documentosRaw.find(d => String(d.folio) === val.trim());
    if (doc) {
      const rut    = esRecaudacion ? doc.rut_cliente : doc.rut_proveedor;
      const nombre = esRecaudacion ? doc.razon_social : doc.razon_social_proveedor;
      const neto  = Number(doc.monto_neto) || 0;
      const iva   = Number(doc.monto_iva) || Math.round(neto * 0.19);
      const totalDoc = Number(doc.monto_total) || (neto + iva);
      setForm(f => ({ ...f, folio_asociado: val, rut: rut || f.rut, nombre: nombre || f.nombre, monto: String(totalDoc) }));
    } else {
      setForm(f => ({ ...f, folio_asociado: val }));
    }
  };

  const resetForm = () => setForm({
    fecha: new Date().toISOString().slice(0, 10),
    rut: '', nombre: '', folio_asociado: '', monto: '', medio_pago: 'transferencia', glosa: '',
  });

  const handleGuardar = async () => {
    if (!(Number(form.monto) > 0)) { toast({ variant: 'destructive', title: 'Monto requerido', description: 'Ingresa un monto mayor a 0.' }); return; }
    setIsSaving(true);
    try {
      const res = await crearMovimientoCajaApi(user.sessionId, { empresaId: targetId, tipo, ...form, monto: Number(form.monto) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Error al registrar');
      toast({ title: `✅ ${esRecaudacion ? 'Recaudación' : 'Pago'} registrad${esRecaudacion ? 'a' : 'o'}`, description: formatCLP(form.monto) });
      resetForm(); setIsOpen(false);
      refrescar();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally { setIsSaving(false); }
  };

  const handleEliminar = async (id) => {
    if (!confirm('¿Eliminar este movimiento? Volverá a quedar pendiente.')) return;
    setDeletingId(id);
    try {
      const res = await eliminarMovimientoCajaApi(user.sessionId, id);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast({ title: '🗑️ Eliminado' });
      refrescar();
    } catch (e) { toast({ variant: 'destructive', title: 'Error', description: e.message }); }
    finally { setDeletingId(null); }
  };

  // ── Editar medio de pago ──
  // Para un documento pagado: edita TODOS los movimientos de ese folio.
  const abrirMedioFolio = (folio) => {
    const ids = movimientos.filter(mv => limpiarFolio(mv.folio_asociado) === limpiarFolio(folio)).map(mv => mv.id);
    if (ids.length === 0) return;
    const medios = mediosPorFolio[limpiarFolio(folio)];
    const actual = medios && medios.size === 1 ? [...medios][0] : 'efectivo';
    setMedioModal({ titulo: `Folio #${folio}`, ids, actual });
  };
  // Para un movimiento manual suelto.
  const abrirMedioMovimiento = (mv) =>
    setMedioModal({ titulo: mv.glosa || mv.nombre || 'Movimiento', ids: [mv.id], actual: mv.medio_pago || 'efectivo' });

  const guardarMedio = async (nuevoMedio) => {
    if (!medioModal || savingMedio) return;
    setSavingMedio(true);
    try {
      for (const id of medioModal.ids) {
        const res = await editarMovimientoCajaApi(user.sessionId, id, { medio_pago: nuevoMedio });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Error al actualizar'); }
      }
      toast({ title: '✅ Medio de pago actualizado', description: infoMedio(nuevoMedio).label });
      setMedioModal(null);
      refrescar();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally { setSavingMedio(false); }
  };

  // Badge del medio de pago (clickeable para editar)
  const MedioBadge = ({ folio, onClick }) => {
    const medios = mediosPorFolio[limpiarFolio(folio)];
    if (!medios || medios.size === 0) return null;
    const varios = medios.size > 1;
    const info = varios ? { label: 'Varios', icon: Wallet } : infoMedio([...medios][0]);
    const Icon = info.icon;
    return (
      <button onClick={onClick} title="Cambiar medio de pago"
        className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-slate-50 border border-[#efe8dd] text-slate-600 hover:text-slate-900 hover:border-blue-400/40 transition-all whitespace-nowrap">
        <Icon className="h-3 w-3" /> {info.label} <Pencil className="h-2.5 w-2.5 opacity-60" />
      </button>
    );
  };

  const EstadoBadge = ({ c }) => {
    if (c.estado === 'efectivo') return <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-emerald-600 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 whitespace-nowrap"><Check className="h-3 w-3" /> {estadoEfectivoLabel}</span>;
    if (c.estado === 'parcial') return <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-blue-600 bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20 whitespace-nowrap">Parcial</span>;
    return <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-amber-600 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20 whitespace-nowrap">{estadoPendienteLabel}</span>;
  };

  return (
    <div className="space-y-5">
      {/* RESUMEN */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-50 rounded-xl border border-[#efe8dd] px-5 py-3.5">
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Documentos</p>
          <p className="font-black text-slate-900 text-lg">{cuentas.length}</p>
        </div>
        <div className="bg-slate-50 rounded-xl border border-[#efe8dd] px-5 py-3.5">
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{estadoPendienteLabel}</p>
          <p className="font-black text-amber-600 text-lg font-mono tracking-tighter">{formatCLP(totalPorCobrar)}</p>
          <p className="text-[9px] text-slate-400 font-bold uppercase">{pendientesCount} pendiente{pendientesCount !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-slate-50 rounded-xl border border-[#efe8dd] px-5 py-3.5">
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Total {estadoEfectivoLabel}</p>
          <p className="font-black text-emerald-600 text-lg font-mono tracking-tighter">{formatCLP(totalEfectivo)}</p>
        </div>
        <div className="bg-slate-50 rounded-xl border border-[#efe8dd] px-5 py-3.5">
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Total Período</p>
          <p className="font-black text-slate-900 text-lg font-mono tracking-tighter">{formatCLP(totalPorCobrar + totalEfectivo)}</p>
        </div>
      </div>

      {/* TOOLBAR: buscador propio + acciones */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder={`Buscar por folio, RUT o nombre de ${labelContraparte.toLowerCase()}...`}
            className="w-full bg-slate-50 border border-[#efe8dd] rounded-xl pl-9 pr-8 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 transition-colors" />
          {busqueda && (
            <button onClick={() => setBusqueda('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900 text-xs">✕</button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={() => hacerEfectivo(seleccionValida)} disabled={seleccionValida.length === 0 || isEfectivizando}
            className={`${esRecaudacion ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700' : 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700'} disabled:opacity-40 text-slate-900 font-black uppercase text-[10px] tracking-widest h-11 px-5`}>
            {isEfectivizando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            {verboEfectivo} {seleccionValida.length > 0 ? `(${seleccionValida.length})` : 'seleccionados'}
          </Button>
          <Button onClick={() => setIsOpen(true)}
            className="bg-slate-50 border border-[#efe8dd] hover:bg-slate-100 text-slate-700 font-black uppercase text-[10px] tracking-widest h-11 px-4">
            <Plus className="h-4 w-4 mr-2" /> Registro manual
          </Button>
          <Button onClick={refrescar} title="Refrescar datos"
            className="bg-slate-50 border border-[#efe8dd] hover:bg-slate-100 text-slate-500 hover:text-slate-900 h-11 px-3">
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {seleccionValida.length > 0 && (
        <div className="flex items-center justify-between bg-emerald-500/[0.07] border border-emerald-500/20 rounded-xl px-4 py-2.5">
          <p className="text-[11px] font-bold text-emerald-700">
            {seleccionValida.length} documento{seleccionValida.length !== 1 ? 's' : ''} seleccionado{seleccionValida.length !== 1 ? 's' : ''} — total a {verboEfectivo.toLowerCase()}: <span className="font-black font-mono">{formatCLP(totalSeleccion)}</span>
          </p>
          <button onClick={() => setSeleccion(new Set())} className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900">Limpiar</button>
        </div>
      )}

      {/* PESTAÑAS: Por cobrar/pagar | Cobrado/Pagado */}
      <div className="flex items-center gap-1 bg-slate-50 border border-[#efe8dd] rounded-xl p-1 w-fit">
        {[
          { id: 'pendientes', label: estadoPendienteLabel, count: pendientesList.length, on: 'bg-amber-600 text-white' },
          { id: 'pagados',    label: estadoEfectivoLabel,  count: pagadosList.length,    on: 'bg-emerald-600 text-white' },
        ].map(t => (
          <button key={t.id} onClick={() => setVista(t.id)}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
              vista === t.id ? t.on : 'text-slate-500 hover:text-slate-900'
            }`}>
            {t.label}
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-black ${vista === t.id ? 'bg-black/25' : 'bg-slate-50 text-slate-400'}`}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* LISTADO CUENTAS POR COBRAR / PAGAR */}
      <div className="bg-white rounded-xl border border-[#efe8dd] overflow-hidden shadow-2xl">
        {loadingDocs ? (
          <div className="py-16 flex justify-center"><Loader2 className="h-8 w-8 text-blue-500 animate-spin opacity-40" /></div>
        ) : cuentas.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3 text-center px-6">
            <div className="bg-slate-50 p-5 rounded-full border border-[#efe8dd]">
              {esRecaudacion ? <CircleDollarSign className="h-8 w-8 text-slate-400" /> : <ArrowDownRight className="h-8 w-8 text-slate-400" />}
            </div>
            <p className="text-slate-900 font-black uppercase text-sm">Sin documentos contabilizados</p>
            <p className="text-slate-400 text-[10px] uppercase tracking-widest font-bold max-w-sm leading-relaxed">
              Aquí aparecen las {esRecaudacion ? 'ventas' : 'compras'} ya contabilizadas del período. Contabiliza {esRecaudacion ? 'ventas' : 'compras'} primero para verlas acá.
            </p>
          </div>
        ) : cuentasVista.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-2 text-center px-6">
            <Search className="h-7 w-7 text-slate-400" />
            <p className="text-slate-500 font-black uppercase text-xs tracking-widest">
              {busqueda.trim()
                ? `Sin resultados para "${busqueda}"`
                : vista === 'pagados'
                  ? `No hay documentos ${estadoEfectivoLabel.toLowerCase()}s en el período`
                  : `No hay documentos ${estadoPendienteLabel.toLowerCase()} — ¡todo al día!`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm min-w-[820px]">
              <thead className="bg-slate-50 border-b border-[#efe8dd] text-[10px] uppercase tracking-widest font-black text-slate-500">
                <tr>
                  <th className="px-4 py-4 w-10">
                    <input type="checkbox" checked={vista === 'pendientes' && seleccionables.length > 0 && seleccionables.every(c => seleccion.has(c.id))}
                      onChange={toggleAll} disabled={vista !== 'pendientes' || seleccionables.length === 0}
                      className="h-4 w-4 rounded accent-emerald-500 cursor-pointer disabled:opacity-30" />
                  </th>
                  <th className="px-4 py-4">Fecha</th>
                  <th className="px-4 py-4">Folio</th>
                  <th className="px-4 py-4">{labelContraparte}</th>
                  <th className="px-4 py-4 text-right">Total</th>
                  <th className="px-4 py-4 text-right">{estadoEfectivoLabel}</th>
                  <th className="px-4 py-4 text-right">Saldo</th>
                  <th className="px-4 py-4 text-center">Estado</th>
                  <th className="px-4 py-4 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {cuentasVista.map((c) => {
                  const checked = seleccion.has(c.id);
                  const selectable = c.estado !== 'efectivo';
                  return (
                    <tr key={c.id} className={`group transition-colors ${checked ? 'bg-emerald-500/[0.06]' : 'hover:bg-white'}`}>
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={checked} disabled={!selectable} onChange={() => toggleSel(c.id)}
                          className="h-4 w-4 rounded accent-emerald-500 cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed" />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-bold whitespace-nowrap">{formatFecha(c.fecha)}</td>
                      <td className="px-4 py-3 font-black text-slate-900 italic text-sm whitespace-nowrap">#{c.folio}</td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-slate-900 font-bold truncate max-w-[220px]">{c.nombre || '—'}</p>
                        <p className="text-[9px] text-slate-400 font-mono">{c.rut || '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-bold font-mono text-slate-600 whitespace-nowrap">{formatCLP(c.total)}</td>
                      <td className="px-4 py-3 text-right font-bold font-mono text-emerald-600/80 whitespace-nowrap">{c.pagado > 0 ? formatCLP(c.pagado) : '—'}</td>
                      <td className={`px-4 py-3 text-right font-black font-mono whitespace-nowrap ${c.saldo > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{c.saldo > 0 ? formatCLP(c.saldo) : '—'}</td>
                      <td className="px-4 py-3 text-center"><EstadoBadge c={c} /></td>
                      <td className="px-4 py-3 text-center">
                        {selectable ? (
                          <button onClick={() => hacerEfectivo([c.id])} disabled={efectivizandoId === c.id || isEfectivizando}
                            title={`${verboEfectivo} saldo completo`}
                            className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg bg-slate-50 border border-[#efe8dd] text-emerald-600 hover:bg-emerald-500/15 hover:border-emerald-500/30 transition-all disabled:opacity-40 whitespace-nowrap">
                            {efectivizandoId === c.id ? <Loader2 className="h-3 w-3 animate-spin inline" /> : verboEfectivo}
                          </button>
                        ) : (
                          <div className="flex items-center justify-center gap-2">
                            <MedioBadge folio={c.folio} onClick={() => abrirMedioFolio(c.folio)} />
                            <button onClick={() => deshacerEfectivo(c.folio)} disabled={deshaciendoFolio === String(c.folio)}
                              title="Deshacer y volver a pendiente"
                              className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg bg-slate-50 border border-[#efe8dd] text-slate-500 hover:bg-red-500/15 hover:border-red-500/30 hover:text-red-500 transition-all disabled:opacity-40 whitespace-nowrap">
                              {deshaciendoFolio === String(c.folio) ? <Loader2 className="h-3 w-3 animate-spin inline" /> : 'Deshacer'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* OTROS MOVIMIENTOS MANUALES (sin documento asociado) */}
      {otrosMovimientos.length > 0 && (
        <div className="bg-white rounded-xl border border-[#efe8dd] overflow-hidden">
          <div className="px-5 py-3 border-b border-[#efe8dd] bg-white">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Otros movimientos manuales (sin documento)</p>
          </div>
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm min-w-[640px]">
              <tbody className="divide-y divide-white/5">
                {otrosMovimientos.map((m) => (
                  <tr key={m.id} className="hover:bg-white group">
                    <td className="px-5 py-3 text-xs text-slate-500 font-bold whitespace-nowrap">{formatFecha(m.fecha)}</td>
                    <td className="px-5 py-3">
                      <p className="text-xs text-slate-900 font-bold truncate max-w-[200px]">{m.nombre || '—'}</p>
                      <p className="text-[9px] text-slate-400 font-mono">{m.rut}</p>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500 truncate max-w-[200px]">{m.glosa || '—'}</td>
                    <td className={`px-5 py-3 text-right font-black font-mono ${esRecaudacion ? 'text-emerald-600' : 'text-red-500'}`}>{formatCLP(m.monto)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {(() => { const info = infoMedio(m.medio_pago || 'efectivo'); const Icon = info.icon; return (
                          <button onClick={() => abrirMedioMovimiento(m)} title="Cambiar medio de pago"
                            className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-slate-50 border border-[#efe8dd] text-slate-600 hover:text-slate-900 hover:border-blue-400/40 transition-all whitespace-nowrap">
                            <Icon className="h-3 w-3" /> {info.label} <Pencil className="h-2.5 w-2.5 opacity-60" />
                          </button>
                        ); })()}
                        <button onClick={() => handleEliminar(m.id)} disabled={deletingId === m.id}
                          className="p-1.5 text-slate-400 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-all disabled:opacity-40">
                          {deletingId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL REGISTRO MANUAL */}
      <Dialog open={isOpen} onOpenChange={(o) => { if (!o) resetForm(); setIsOpen(o); }}>
        <DialogContent className="sm:max-w-[560px] bg-white border-[#efe8dd] text-slate-700">
          <DialogHeader>
            <DialogTitle className={`text-lg font-black uppercase tracking-tight ${esRecaudacion ? 'text-emerald-600' : 'text-red-500'}`}>
              {esRecaudacion ? 'Registrar Recaudación' : 'Registrar Pago'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <Campo label="Fecha">
                <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className="inp [color-scheme:light]" />
              </Campo>
              <Campo label="Monto">
                <input type="number" min="0" placeholder="0" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} className="inp font-mono" />
              </Campo>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Campo label={`RUT ${labelContraparte}`}>
                <input type="text" placeholder="76.123.456-7" value={form.rut} onChange={e => setForm(f => ({ ...f, rut: e.target.value }))} className="inp font-mono" />
              </Campo>
              <Campo label={`Nombre ${labelContraparte}`}>
                <input type="text" placeholder="Razón social" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className="inp" />
              </Campo>
            </div>
            <Campo label="Folio asociado (escribe el N° y se autocompleta)">
              <input type="text" placeholder="N° de factura" value={form.folio_asociado} onChange={e => onChangeFolio(e.target.value)} className="inp" />
              {form.folio_asociado.trim() && (
                documentosRaw.some(d => String(d.folio) === form.folio_asociado.trim())
                  ? <p className="text-[9px] text-emerald-600 font-bold mt-1">✓ Documento encontrado — datos autocompletados</p>
                  : <p className="text-[9px] text-slate-400 mt-1">No se encontró factura con ese folio (puedes registrar igual).</p>
              )}
            </Campo>

            <div>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-2">Medio de Pago</p>
              <div className="grid grid-cols-5 gap-2">
                {MEDIOS.map(med => {
                  const Icon = med.icon; const active = form.medio_pago === med.id;
                  return (
                    <button key={med.id} onClick={() => setForm(f => ({ ...f, medio_pago: med.id }))}
                      className={`flex flex-col items-center gap-1 py-2.5 rounded-lg text-[8px] font-black uppercase tracking-wide transition-all border ${
                        active ? 'bg-blue-600 border-blue-400/50 text-white' : 'bg-slate-50 border-[#efe8dd] text-slate-500 hover:text-slate-900'
                      }`}>
                      <Icon className="h-4 w-4" /> {med.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <Campo label="Glosa / Descripción">
              <input type="text" placeholder="Ej: Pago factura #123" value={form.glosa} onChange={e => setForm(f => ({ ...f, glosa: e.target.value }))} className="inp" />
            </Campo>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="ghost" onClick={() => { resetForm(); setIsOpen(false); }} className="text-slate-500 hover:text-slate-900">Cancelar</Button>
            <Button onClick={handleGuardar} disabled={isSaving || !(Number(form.monto) > 0)}
              className={`${esRecaudacion ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'} text-slate-900 font-black uppercase text-xs tracking-widest disabled:opacity-40`}>
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />} Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL EDITAR MEDIO DE PAGO */}
      <Dialog open={!!medioModal} onOpenChange={(o) => { if (!o) setMedioModal(null); }}>
        <DialogContent className="sm:max-w-[460px] bg-white border-[#efe8dd] text-slate-700">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase tracking-tight text-blue-600">Cambiar medio de pago</DialogTitle>
          </DialogHeader>
          {medioModal && (
            <div className="space-y-4 mt-2">
              <p className="text-[11px] text-slate-500 font-bold">
                {medioModal.titulo}
                {medioModal.ids.length > 1 && <span className="text-slate-400"> · {medioModal.ids.length} movimientos</span>}
              </p>
              <div className="grid grid-cols-5 gap-2">
                {MEDIOS.map(med => {
                  const Icon = med.icon; const active = medioModal.actual === med.id;
                  return (
                    <button key={med.id} disabled={savingMedio} onClick={() => guardarMedio(med.id)}
                      className={`flex flex-col items-center gap-1 py-2.5 rounded-lg text-[8px] font-black uppercase tracking-wide transition-all border disabled:opacity-40 ${
                        active ? 'bg-blue-600 border-blue-400/50 text-white' : 'bg-slate-50 border-[#efe8dd] text-slate-500 hover:text-slate-900'
                      }`}>
                      <Icon className="h-4 w-4" /> {med.label}
                    </button>
                  );
                })}
              </div>
              {savingMedio && <p className="text-[10px] text-blue-600 font-bold flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Guardando…</p>}
            </div>
          )}
          <DialogFooter className="mt-4">
            <Button variant="ghost" onClick={() => setMedioModal(null)} className="text-slate-500 hover:text-slate-900">Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style>{`.inp{width:100%;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.1);border-radius:.5rem;padding:.5rem .75rem;font-size:.875rem;color:#fff;outline:none}.inp:focus{border-color:#3b82f6}`}</style>
    </div>
  );
};

const Campo = ({ label, children }) => (
  <div>
    <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1.5 block">{label}</label>
    {children}
  </div>
);

export default GestionCaja;
