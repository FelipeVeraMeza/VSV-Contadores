import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, Search, CheckCircle2, AlertTriangle, Clock, FileText, Receipt,
  RefreshCw, CalendarClock, Wallet, Building2, Zap, X
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth.jsx';
import { toast } from '@/components/ui/use-toast';
import {
  getCobrosApi, getResumenCobrosApi, generarCobrosApi,
  cambiarEstadoCobroApi, editarMontoCobroApi,
  previsualizarFacturacionApi, facturarMasivoApi, progresoFacturacionApi, vincularFoliosApi
} from '@/services/cobrosService';

const clp = (n) => `$${Number(n || 0).toLocaleString('es-CL')}`;
const mesActual = () => new Date().toISOString().slice(0, 7); // YYYY-MM

// Etiqueta y color por estado del cobro
const estiloEstado = (c) => {
  if (c.estado === 'POR_EMITIR')       return { label: 'Por emitir',   c: 'text-blue-700 bg-blue-500/10 border-blue-500/30' };
  if (c.estado === 'PAGADA')           return { label: 'Pagada',       c: 'text-emerald-700 bg-emerald-500/10 border-emerald-500/30' };
  if (c.estado === 'PENDIENTE_RECIBO') return { label: 'Pend. recibo', c: 'text-sky-700 bg-sky-500/10 border-sky-500/30' };
  if (c.vencido)                       return { label: 'Vencido',      c: 'text-red-600 bg-red-500/10 border-red-500/30' };
  return { label: 'Pend. pago', c: 'text-amber-700 bg-amber-500/10 border-amber-500/30' };
};

const Kpi = ({ icon: Icon, label, value, sub, color }) => (
  <div className="flex items-center gap-3 bg-slate-50 border border-[#efe8dd] rounded-2xl px-4 py-3">
    <span className={`p-2 rounded-xl ${color}`}><Icon size={16} /></span>
    <div className="min-w-0">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="text-lg font-black text-slate-900 leading-tight tabular-nums">{value}</p>
      {sub && <p className="text-[9px] text-slate-400 font-bold">{sub}</p>}
    </div>
  </div>
);

const CobrosMensuales = () => {
  const { user } = useAuth();
  const [periodo, setPeriodo] = useState(mesActual());
  const [cobros, setCobros] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [filtro, setFiltro] = useState('TODOS');
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [editando, setEditando] = useState(null);   // id del cobro en edición
  const [montoTmp, setMontoTmp] = useState('');
  // Facturación masiva (robot SII)
  const [showConfirm, setShowConfirm] = useState(false);
  const [facturando, setFacturando] = useState(false);
  const [progreso, setProgreso] = useState(null);   // { activo, total, actual, exitos, errores, rutActual }
  const pollRef = useRef(null);
  // Previsualización editable antes de emitir
  const [preparando, setPreparando] = useState(false);
  const [lista, setLista] = useState([]);                 // TODAS las candidatas del periodo
  const [seleccion, setSeleccion] = useState(new Set());  // _keys marcadas para emitir
  const [buscarModal, setBuscarModal] = useState('');
  const [orden, setOrden] = useState({ campo: 'razonSocial', dir: 'asc' });
  const [confirmando, setConfirmando] = useState(false);  // paso final de confirmación
  const [resultado, setResultado] = useState(null);       // resumen tras emitir

  // Corta el sondeo de progreso si se desmonta el componente
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const cargar = useCallback(async () => {
    if (!user?.sessionId) return;
    setLoading(true);
    try {
      const [rc, rr] = await Promise.all([
        getCobrosApi(user.sessionId, { periodo }),
        getResumenCobrosApi(user.sessionId, periodo)
      ]);
      const dc = await rc.json();
      const dr = await rr.json();
      if (dc?.success) setCobros(dc.cobros || []);
      if (dr?.success) setResumen(dr);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los cobros.' });
    } finally {
      setLoading(false);
    }
  }, [user?.sessionId, periodo]);

  useEffect(() => { cargar(); }, [cargar]);

  const generar = async () => {
    setGenerando(true);
    try {
      const res = await generarCobrosApi(user.sessionId);
      const d = await res.json();
      toast({ title: '✅ Cobros sincronizados con el CRM', description: d?.message || '' });
      cargar();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron generar los cobros.' });
    } finally {
      setGenerando(false);
    }
  };

  // Abre la previsualización: trae TODO lo del periodo y lo deja listo para revisar.
  const abrirPreview = async () => {
    setPreparando(true);
    try {
      const res = await previsualizarFacturacionApi(user.sessionId);
      const d = await res.json();
      if (!d?.success) {
        toast({ variant: 'destructive', title: 'Error', description: d?.message || 'No se pudo previsualizar.' });
        return;
      }
      const norm = (arr, p) => (arr || []).map((it, i) => ({ ...it, _key: it.cobroId || `${p}${i}`, monto: Number(it.monto) || 0 }));
      const todas = [...norm(d.facturar, 'f'), ...norm(d.omitidas, 'o')];
      setLista(todas);
      // Por defecto quedan marcadas las que se pueden emitir (RUT + monto > 0)
      setSeleccion(new Set(todas.filter(it => it.rut && it.monto > 0).map(it => it._key)));
      setBuscarModal('');
      setOrden({ campo: 'razonSocial', dir: 'asc' });
      setConfirmando(false);
      setShowConfirm(true);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo previsualizar la facturación.' });
    } finally {
      setPreparando(false);
    }
  };

  // Motivo por el que una fila NO se puede facturar (null = sí se puede)
  const motivoNoEmitible = (it) => !it.rut ? 'Sin RUT' : (Number(it.monto) <= 0 ? 'Monto inválido' : null);

  const editarMontoLista = (k, valor) => {
    const monto = Number(String(valor).replace(/[^\d]/g, '')) || 0;
    setLista(prev => prev.map(it => it._key === k ? { ...it, monto } : it));
  };
  const toggleSel = (k) => setSeleccion(prev => {
    const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n;
  });
  // Marca / desmarca TODAS las emitibles visibles de una sola vez
  const toggleTodas = (visibles) => {
    const emitiblesKeys = visibles.filter(it => it.rut && Number(it.monto) > 0).map(it => it._key);
    const todasMarcadas = emitiblesKeys.length > 0 && emitiblesKeys.every(k => seleccion.has(k));
    setSeleccion(prev => {
      const n = new Set(prev);
      if (todasMarcadas) emitiblesKeys.forEach(k => n.delete(k));
      else emitiblesKeys.forEach(k => n.add(k));
      return n;
    });
  };
  const ordenarPor = (campo) => setOrden(prev => ({ campo, dir: prev.campo === campo && prev.dir === 'asc' ? 'desc' : 'asc' }));

  // Emite el lote con las empresas SELECCIONADAS, y sigue el progreso.
  // Se llama solo tras la confirmación final (setConfirmando).
  const facturarMasivo = async () => {
    const finales = lista
      .filter(it => it.rut && Number(it.monto) > 0 && seleccion.has(it._key))
      .map(({ cobroId, empresaId, rut, razonSocial, plan, monto, correo }) =>
        ({ cobroId, empresaId, rut, razonSocial, plan, monto: Number(monto), correo }));
    if (finales.length === 0) {
      return toast({ variant: 'destructive', title: 'Nada que emitir', description: 'No hay empresas seleccionadas con monto válido.' });
    }
    const enviadas = finales.length;
    setConfirmando(false);
    setShowConfirm(false);
    setFacturando(true);
    setProgreso(null);
    try {
      const res = await facturarMasivoApi(user.sessionId, finales);
      const d = await res.json();
      if (!d?.success) {
        toast({ variant: 'destructive', title: 'No se pudo iniciar', description: d?.message || 'El robot está ocupado.' });
        setFacturando(false);
        return;
      }
      toast({ title: '🚀 Facturación masiva iniciada', description: d.message });

      // La pantalla manda la lista que tenía cargada. Si mientras tanto se creó un
      // cobro nuevo, queda fuera del lote sin que nadie se entere (le pasó a VIMAGU
      // TRUCKS dos veces el 2026-07-28). El backend los detecta y los devuelve.
      if (Array.isArray(d.noIncluidas) && d.noIncluidas.length > 0) {
        toast({
          variant: 'destructive',
          title: `⚠️ ${d.noIncluidas.length} cobro(s) quedaron fuera`,
          description: `${d.noIncluidas.join(', ')}. Se crearon después de abrir esta pantalla: refresca y factúralos aparte.`,
        });
      }

      // Sondea el progreso cada 3s. Solo damos por terminado tras haber visto
      // el robot activo (evita el falso "terminó" del arranque). Si nunca se
      // activa (p.ej. todo ya emitido), cortamos tras unos ciclos de gracia.
      let vistoActivo = false;
      let ticks = 0;
      const finalizar = async (p) => {
        clearInterval(pollRef.current);
        pollRef.current = null;
        let vinc = '';
        try {
          const vr = await vincularFoliosApi(user.sessionId);
          const vd = await vr.json();
          vinc = vd?.message || '';
        } catch { /* la vinculación se puede reintentar luego */ }
        const detalle = Array.isArray(p?.resultados) ? p.resultados : [];
        const exitos = p?.exitos ?? detalle.filter(r => r.estado === 'exito').length;
        const errores = p?.errores ?? detalle.filter(r => r.estado === 'error').length;

        // El robot corta el lote cuando el SII deja de aceptar el ingreso; hay que
        // decirlo, si no parece que "terminó" con la mitad de las facturas.
        if (p?.detenidoPorSii) {
          toast({
            variant: 'destructive',
            title: '🛑 El SII cortó la sesión',
            description: p.motivoDetencion || 'Se detuvo la emisión. Las facturas ya emitidas quedaron registradas; retoma con las que faltan.',
          });
        }

        // Resumen final para mostrar al usuario
        setResultado({
          enviadas, exitos, errores,
          noProcesadas: Math.max(0, enviadas - exitos - errores),
          detalle, vinc,
          detenidoPorSii: Boolean(p?.detenidoPorSii),
          motivoDetencion: p?.motivoDetencion || '',
        });
        setFacturando(false);
        setProgreso(null);
        cargar();
      };

      pollRef.current = setInterval(async () => {
        ticks++;
        try {
          const pr = await progresoFacturacionApi(user.sessionId);
          const p = await pr.json();
          setProgreso(p);
          if (p?.activo) vistoActivo = true;
          if (vistoActivo && p && p.activo === false) await finalizar(p);
          else if (!vistoActivo && ticks >= 6) await finalizar(p || {});
        } catch { /* reintenta en el próximo ciclo */ }
      }, 3000);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo iniciar la facturación masiva.' });
      setFacturando(false);
    }
  };

  const marcar = async (cobro, estado) => {
    try {
      const res = await cambiarEstadoCobroApi(user.sessionId, cobro.id, estado);
      const d = await res.json();
      if (d?.success) {
        setCobros(prev => prev.map(c => c.id === cobro.id ? { ...c, estado, vencido: false } : c));
        cargar();
      } else {
        toast({ variant: 'destructive', title: 'Error', description: d?.message || 'No se pudo actualizar.' });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el cobro.' });
    }
  };

  // Corrige el monto a mano (excepciones negociadas / planes sin precio)
  const guardarMonto = async (cobro) => {
    const monto = Number(String(montoTmp).replace(/[^\d]/g, ''));
    setEditando(null);
    if (!Number.isFinite(monto) || monto === cobro.montoEsperado) return;
    try {
      const res = await editarMontoCobroApi(user.sessionId, cobro.id, monto);
      const d = await res.json();
      if (d?.success) {
        setCobros(prev => prev.map(c => c.id === cobro.id ? { ...c, montoEsperado: monto } : c));
        toast({ title: '✅ Monto actualizado', description: `${cobro.razonSocial}: ${clp(monto)}` });
        cargar();
      } else {
        toast({ variant: 'destructive', title: 'Error', description: d?.message || 'No se pudo guardar.' });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar el monto.' });
    }
  };

  const filtrados = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    return cobros.filter(c => {
      const matchTexto = !term || String(c.razonSocial || '').toLowerCase().includes(term);
      if (!matchTexto) return false;
      if (filtro === 'TODOS') return true;
      if (filtro === 'VENCIDOS') return c.vencido;
      return c.estado === filtro;
    });
  }, [cobros, filtro, busqueda]);

  const FILTROS = [
    { id: 'TODOS', label: 'Todos' },
    { id: 'POR_EMITIR', label: 'Por emitir' },
    { id: 'PENDIENTE_PAGO', label: 'Pend. pago' },
    { id: 'VENCIDOS', label: 'Vencidos' },
    { id: 'PAGADA', label: 'Pagadas' },
  ];

  // Lo que realmente se emitiría en la facturación masiva: por emitir con monto > 0
  const porEmitir = useMemo(() => {
    const f = cobros.filter(c => c.estado === 'POR_EMITIR' && c.montoEsperado > 0);
    return { n: f.length, total: f.reduce((s, c) => s + (c.montoEsperado || 0), 0) };
  }, [cobros]);

  // Lista visible en el modal: filtrada por búsqueda y ordenada por la columna elegida
  const listaVisible = useMemo(() => {
    const t = buscarModal.trim().toLowerCase();
    const arr = lista.filter(it =>
      !t || String(it.razonSocial || '').toLowerCase().includes(t) || String(it.rut || '').toLowerCase().includes(t));
    const { campo, dir } = orden;
    return [...arr].sort((a, b) => {
      if (campo === 'monto') {
        const va = Number(a.monto) || 0, vb = Number(b.monto) || 0;
        return dir === 'asc' ? va - vb : vb - va;
      }
      const va = String(a[campo] || '').toLowerCase(), vb = String(b[campo] || '').toLowerCase();
      return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }, [lista, buscarModal, orden]);

  // Resumen de selección (para las tarjetas del modal)
  const seleccionadas = lista.filter(it => it.rut && Number(it.monto) > 0 && seleccion.has(it._key));
  const totalSel = seleccionadas.reduce((s, it) => s + Number(it.monto), 0);
  const nOmitidas = lista.length - seleccionadas.length;
  // ¿Están todas las emitibles visibles marcadas? (para el check "seleccionar todas")
  const emitiblesVisibles = listaVisible.filter(it => it.rut && Number(it.monto) > 0);
  const todasVisiblesMarcadas = emitiblesVisibles.length > 0 && emitiblesVisibles.every(it => seleccion.has(it._key));

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">

      {/* AVISO DEL DÍA 26 — o cuenta regresiva si aún no toca */}
      {resumen?.avisoFacturacion ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3">
          <CalendarClock className="h-5 w-5 text-amber-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-amber-200 font-black uppercase tracking-widest text-[11px]">Toca facturar</p>
            <p className="text-slate-600 text-xs">
              Quedan <span className="font-black text-slate-900">{resumen.porEmitir}</span> empresas por facturar este periodo
              ({clp(resumen.montoPorEmitir)}).
            </p>
          </div>
        </div>
      ) : resumen?.porEmitir > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-blue-500/[0.07] border border-blue-500/20 rounded-2xl px-4 py-3">
          <CalendarClock className="h-5 w-5 text-blue-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-blue-700 font-black uppercase tracking-widest text-[11px]">
              Próxima facturación: día {resumen.diaFacturacion}
            </p>
            <p className="text-slate-500 text-xs">
              {resumen.diasParaFacturar === 0
                ? 'Es hoy.'
                : <>Faltan <span className="font-black text-slate-900">{resumen.diasParaFacturar}</span> días.</>}
              {' '}Hay <span className="font-black text-slate-900">{resumen.porEmitir}</span> empresas por facturar ({clp(resumen.montoPorEmitir)}).
            </p>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={FileText} label="Por emitir" value={resumen?.porEmitir ?? 0}
             sub={clp(resumen?.montoPorEmitir)} color="bg-blue-500/15 text-blue-600" />
        <Kpi icon={Clock} label="Pendiente pago" value={resumen?.pendientePago ?? 0}
             color="bg-amber-500/15 text-amber-600" />
        <Kpi icon={AlertTriangle} label="Vencidos" value={resumen?.vencidos ?? 0}
             color="bg-red-500/15 text-red-500" />
        <Kpi icon={Wallet} label="Total del mes" value={clp(resumen?.montoEsperado)}
             sub={`${resumen?.total ?? 0} empresas`} color="bg-emerald-500/15 text-emerald-600" />
      </div>

      {/* Barra de control */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <input
          type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)}
          className="bg-slate-50 border border-[#efe8dd] rounded-xl px-3 py-2 text-xs text-slate-900 [color-scheme:light] focus:outline-none focus:border-emerald-500/60"
        />
        <div className="flex flex-wrap gap-1.5 bg-slate-50 p-1 rounded-xl border border-[#efe8dd] w-fit">
          {FILTROS.map(f => (
            <button key={f.id} onClick={() => setFiltro(f.id)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                filtro === f.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            placeholder="Buscar empresa..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-[#efe8dd] rounded-xl text-xs text-slate-900 placeholder-gray-600 focus:outline-none focus:border-emerald-500/60"
          />
        </div>
        <button onClick={generar} disabled={generando || facturando}
          title="Sincroniza con el CRM: genera el cobro de cada cliente activo y depura los que ya no lo son"
          className="flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 border border-[#efe8dd] text-slate-700 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-60">
          {generando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Sincronizar con CRM
        </button>
        <button onClick={abrirPreview} disabled={facturando || generando || preparando || porEmitir.n === 0}
          title="Revisa y emite en lote las facturas de honorarios de los clientes por emitir (robot SII)"
          className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
          {(facturando || preparando) ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
          {facturando ? 'Facturando…' : preparando ? 'Preparando…' : `Facturar${porEmitir.n > 0 ? ` (${porEmitir.n})` : ''}`}
        </button>
      </div>

      {/* Progreso del robot de facturación masiva */}
      {facturando && (
        <div className="flex flex-col gap-2 bg-blue-500/[0.06] border border-blue-500/20 rounded-2xl px-4 py-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-black uppercase tracking-widest text-blue-700 flex items-center gap-2">
              <Loader2 size={13} className="animate-spin" /> Emitiendo facturas en el SII…
            </span>
            <span className="font-bold text-slate-500 tabular-nums">
              {progreso ? `${progreso.actual || 0} / ${progreso.total || porEmitir.n}` : 'Iniciando…'}
              {progreso?.rutActual ? ` · RUT ${progreso.rutActual}` : ''}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-blue-500/10 overflow-hidden">
            <div className="h-full bg-blue-600 transition-all duration-500"
              style={{ width: progreso?.total ? `${Math.round((progreso.actual / progreso.total) * 100)}%` : '8%' }} />
          </div>
          {progreso && (progreso.exitos > 0 || progreso.errores > 0) && (
            <p className="text-[10px] font-bold text-slate-500">
              ✅ {progreso.exitos} emitidas · ⚠️ {progreso.errores} con error
            </p>
          )}
          <p className="text-[10px] text-slate-400 font-bold">No cierres esta pestaña mientras se emite. El proceso continúa en el servidor.</p>
        </div>
      )}

      {/* Tabla */}
      <div className="rounded-2xl border border-[#efe8dd] bg-white overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 text-blue-500 animate-spin" /></div>
        ) : (
          <div className="overflow-auto max-h-[52vh]">
            <table className="w-full min-w-[720px] text-left border-collapse">
              <thead className="bg-white sticky top-0 z-10">
                <tr className="border-b border-[#efe8dd] text-[10px] uppercase tracking-widest text-slate-400">
                  <th className="px-4 py-2.5 font-black">Empresa</th>
                  <th className="px-4 py-2.5 font-black">Plan</th>
                  <th className="px-4 py-2.5 font-black text-right">Monto</th>
                  <th className="px-4 py-2.5 font-black">Folio</th>
                  <th className="px-4 py-2.5 font-black">Estado</th>
                  <th className="px-4 py-2.5 font-black text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(c => {
                  const st = estiloEstado(c);
                  return (
                    <tr key={c.id} className="border-b border-[#efe8dd] hover:bg-white transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="w-7 h-7 rounded-lg bg-blue-500/15 border border-[#efe8dd] flex items-center justify-center text-blue-600 shrink-0">
                            <Building2 size={13} />
                          </span>
                          <span className="font-bold text-slate-900 text-xs uppercase truncate max-w-[220px]" title={c.razonSocial}>
                            {c.razonSocial}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-[9px] font-black uppercase text-slate-500 bg-slate-50 border border-[#efe8dd] px-2 py-0.5 rounded-md">{c.plan}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {editando === c.id ? (
                          <input
                            autoFocus type="text" value={montoTmp}
                            onChange={(e) => setMontoTmp(e.target.value)}
                            onBlur={() => guardarMonto(c)}
                            onKeyDown={(e) => { if (e.key === 'Enter') guardarMonto(c); if (e.key === 'Escape') setEditando(null); }}
                            className="w-28 text-right bg-slate-50 border border-blue-500/60 rounded-lg px-2 py-1 text-sm text-slate-900 font-mono focus:outline-none"
                          />
                        ) : (
                          <button
                            onClick={() => { setEditando(c.id); setMontoTmp(String(c.montoEsperado)); }}
                            title="Clic para corregir el monto"
                            className={`font-mono font-bold text-sm hover:underline decoration-dotted ${c.montoEsperado > 0 ? 'text-slate-700' : 'text-amber-600'}`}
                          >
                            {clp(c.montoEsperado)}
                          </button>
                        )}
                        {c.montoFacturado !== null && !c.montoCoincide && c.estado !== 'POR_EMITIR' && (
                          <p className="text-[9px] font-black text-red-500 uppercase">Facturado {clp(c.montoFacturado)} ⚠</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-[10px] font-mono text-slate-500">{c.folio || '—'}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex text-[9px] font-black px-2 py-0.5 rounded-full border uppercase ${st.c}`}>{st.label}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          {c.estado !== 'PAGADA' && c.estado !== 'POR_EMITIR' && (
                            <button onClick={() => marcar(c, 'PAGADA')} title="Marcar como pagada"
                              className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-emerald-700 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-1 rounded-lg transition-colors">
                              <CheckCircle2 size={11} /> Pagada
                            </button>
                          )}
                          {c.estado === 'PENDIENTE_PAGO' && (
                            <button onClick={() => marcar(c, 'PENDIENTE_RECIBO')} title="Pagó, falta el recibo"
                              className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-sky-700 hover:text-sky-200 bg-sky-500/10 hover:bg-sky-500/20 px-2 py-1 rounded-lg transition-colors">
                              <Receipt size={11} /> Recibo
                            </button>
                          )}
                          {c.estado === 'PAGADA' && (
                            <button onClick={() => marcar(c, 'PENDIENTE_PAGO')} title="Revertir a pendiente"
                              className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors px-2 py-1">
                              Revertir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtrados.length === 0 && (
                  <tr><td colSpan="6" className="p-10 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">
                    No hay cobros que coincidan con el filtro.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center">
        Mostrando {filtrados.length} de {cobros.length} cobros · Refleja los clientes activos del CRM · Vencimiento: día 5 del mes siguiente
      </p>

      {/* Previsualización editable de la facturación masiva (en portal al body
          para que el `fixed` se ancle a la ventana y no a un padre con transform) */}
      {createPortal(
      <AnimatePresence>
        {showConfirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={() => { if (!confirmando) setShowConfirm(false); }}
          >
            <motion.div
              initial={{ scale: 0.97, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-6xl max-h-[90vh] bg-white rounded-3xl border border-[#efe8dd] shadow-2xl overflow-hidden flex flex-col"
            >
              {/* Encabezado */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#efe8dd] flex-shrink-0">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
                    <Zap size={15} className="text-blue-600" /> Revisar facturación masiva
                  </h3>
                  <p className="text-[11px] text-slate-500 font-bold mt-0.5">Marca las empresas, ajusta montos y busca; luego confirma para emitir.</p>
                </div>
                <button onClick={() => setShowConfirm(false)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
              </div>

              {/* Resumen (seleccionadas / total / omitidas) + búsqueda */}
              <div className="px-6 py-3 border-b border-[#efe8dd] flex flex-col lg:flex-row lg:items-center gap-3 flex-shrink-0 bg-slate-50/50">
                <div className="grid grid-cols-3 gap-2 lg:flex">
                  <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2">
                    <CheckCircle2 size={17} className="text-blue-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[8px] font-black uppercase tracking-widest text-blue-700/70 leading-none">Seleccionadas</p>
                      <p className="text-base font-black text-blue-700 leading-tight tabular-nums">{seleccionadas.length}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2">
                    <Wallet size={17} className="text-emerald-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[8px] font-black uppercase tracking-widest text-emerald-700/70 leading-none">Total neto</p>
                      <p className="text-base font-black text-emerald-700 leading-tight tabular-nums truncate">{clp(totalSel)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                    <AlertTriangle size={17} className="text-amber-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[8px] font-black uppercase tracking-widest text-amber-700/70 leading-none">Omitidas</p>
                      <p className="text-base font-black text-amber-700 leading-tight tabular-nums">{nOmitidas}</p>
                    </div>
                  </div>
                </div>
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <input placeholder="Buscar por empresa o RUT..." value={buscarModal} onChange={(e) => setBuscarModal(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-[#efe8dd] rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500/60" />
                </div>
              </div>

              {/* Tabla editable con selección */}
              <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                <table className="w-full min-w-[680px] text-left border-collapse">
                  <thead className="bg-slate-50 sticky top-0 z-10">
                    <tr className="border-b border-[#efe8dd] text-[10px] uppercase tracking-widest text-slate-400">
                      <th className="px-3 py-2.5 w-8">
                        <input type="checkbox" checked={todasVisiblesMarcadas} onChange={() => toggleTodas(listaVisible)}
                          title="Seleccionar / quitar todas" className="w-4 h-4 accent-blue-600 cursor-pointer align-middle" />
                      </th>
                      <th className="px-3 py-2.5 font-black">
                        <button onClick={() => ordenarPor('razonSocial')} className="inline-flex items-center gap-1 uppercase tracking-widest hover:text-slate-700">Empresa {orden.campo === 'razonSocial' && <span className="text-[8px]">{orden.dir === 'asc' ? '▲' : '▼'}</span>}</button>
                      </th>
                      <th className="px-3 py-2.5 font-black">
                        <button onClick={() => ordenarPor('rut')} className="inline-flex items-center gap-1 uppercase tracking-widest hover:text-slate-700">RUT {orden.campo === 'rut' && <span className="text-[8px]">{orden.dir === 'asc' ? '▲' : '▼'}</span>}</button>
                      </th>
                      <th className="px-3 py-2.5 font-black">Plan</th>
                      <th className="px-3 py-2.5 font-black text-right">
                        <button onClick={() => ordenarPor('monto')} className="inline-flex items-center gap-1 uppercase tracking-widest hover:text-slate-700">Monto neto {orden.campo === 'monto' && <span className="text-[8px]">{orden.dir === 'asc' ? '▲' : '▼'}</span>}</button>
                      </th>
                      <th className="px-3 py-2.5 font-black">Correo</th>
                      <th className="px-3 py-2.5 font-black">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listaVisible.map(it => {
                      const motivo = motivoNoEmitible(it);
                      const marcada = seleccion.has(it._key);
                      const seEmite = !motivo && marcada;
                      return (
                        <tr key={it._key} className={`border-b border-[#efe8dd] hover:bg-slate-50/60 transition-colors ${seEmite ? '' : 'opacity-70'}`}>
                          <td className="px-3 py-2">
                            <input type="checkbox" checked={marcada} disabled={!it.rut} onChange={() => toggleSel(it._key)}
                              className="w-4 h-4 accent-blue-600 cursor-pointer align-middle disabled:cursor-not-allowed disabled:opacity-40" />
                          </td>
                          <td className="px-3 py-2"><span className="font-bold text-slate-900 text-xs uppercase truncate block max-w-[200px]" title={it.razonSocial}>{it.razonSocial}</span></td>
                          <td className="px-3 py-2"><span className="text-[11px] font-mono text-slate-500">{it.rut || '—'}</span></td>
                          <td className="px-3 py-2"><span className="text-[9px] font-black uppercase text-slate-500 bg-slate-50 border border-[#efe8dd] px-2 py-0.5 rounded-md">{it.plan}</span></td>
                          <td className="px-3 py-2 text-right">
                            <input type="text" inputMode="numeric" disabled={!it.rut}
                              value={it.monto ? Number(it.monto).toLocaleString('es-CL') : ''}
                              onChange={(e) => editarMontoLista(it._key, e.target.value)} placeholder="0"
                              className={`w-24 text-right bg-slate-50 border rounded-lg px-2 py-1 text-sm font-mono focus:outline-none focus:border-blue-500/60 disabled:opacity-40 ${Number(it.monto) > 0 ? 'border-[#efe8dd] text-slate-800' : 'border-amber-400/60 text-amber-600'}`} />
                          </td>
                          <td className="px-3 py-2">
                            {it.correo
                              ? <span className="text-[10px] text-slate-500 truncate block max-w-[150px]" title={it.correo}>{it.correo}</span>
                              : <span className="text-[9px] font-black uppercase text-amber-600" title="Se emite la factura pero no se enviará correo">Sin correo</span>}
                          </td>
                          <td className="px-3 py-2">
                            {motivo
                              ? <span className="inline-flex text-[9px] font-black px-2 py-0.5 rounded-full border uppercase text-red-600 bg-red-500/10 border-red-500/30">{motivo}</span>
                              : marcada
                                ? <span className="inline-flex text-[9px] font-black px-2 py-0.5 rounded-full border uppercase text-blue-700 bg-blue-500/10 border-blue-500/30">Se emite</span>
                                : <span className="inline-flex text-[9px] font-black px-2 py-0.5 rounded-full border uppercase text-slate-400 bg-slate-100 border-[#efe8dd]">Excluida</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {listaVisible.length === 0 && (
                      <tr><td colSpan="7" className="p-8 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">
                        No hay empresas que coincidan con la búsqueda.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pie: acciones — con paso de confirmación final */}
              {!confirmando ? (
                <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#efe8dd] bg-slate-50 flex-shrink-0">
                  <button onClick={() => setShowConfirm(false)}
                    className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors">
                    Cancelar
                  </button>
                  <button onClick={() => setConfirmando(true)} disabled={seleccionadas.length === 0}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                    <Zap size={13} /> Emitir {seleccionadas.length} factura(s)
                  </button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-6 py-4 border-t border-red-500/30 bg-red-500/[0.06] flex-shrink-0">
                  <p className="flex-1 text-[11px] font-bold text-slate-700 flex items-start gap-2">
                    <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />
                    <span>Vas a generar <b className="text-slate-900">{seleccionadas.length}</b> factura(s) por <b className="text-slate-900">{clp(totalSel)}</b> de forma <b className="uppercase text-red-600">definitiva</b> en el SII y se enviará el correo a cada cliente. Esta acción no se puede deshacer.</span>
                  </p>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => setConfirmando(false)}
                      className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors">
                      Volver
                    </button>
                    <button onClick={facturarMasivo}
                      className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm">
                      <Zap size={13} /> Sí, emitir definitivamente
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      , document.body)}

      {/* Resumen de resultados tras la emisión (también en portal al body) */}
      {createPortal(
      <AnimatePresence>
        {resultado && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={() => setResultado(null)}
          >
            <motion.div
              initial={{ scale: 0.97, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl max-h-[85vh] bg-white rounded-3xl border border-[#efe8dd] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#efe8dd] flex-shrink-0">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-emerald-600" /> Resumen de facturación
                </h3>
                <button onClick={() => setResultado(null)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
              </div>

              <div className="px-6 py-4 grid grid-cols-3 gap-3 flex-shrink-0">
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-4 py-3 text-center">
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Emitidas</p>
                  <p className="text-2xl font-black text-emerald-600 tabular-nums">{resultado.exitos}</p>
                </div>
                <div className="bg-red-500/10 border border-red-500/30 rounded-2xl px-4 py-3 text-center">
                  <p className="text-[9px] font-black uppercase tracking-widest text-red-600">Con error</p>
                  <p className="text-2xl font-black text-red-500 tabular-nums">{resultado.errores}</p>
                </div>
                <div className="bg-slate-100 border border-[#efe8dd] rounded-2xl px-4 py-3 text-center">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">No procesadas</p>
                  <p className="text-2xl font-black text-slate-500 tabular-nums">{resultado.noProcesadas}</p>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-auto custom-scrollbar px-6 pb-2 space-y-3">
                {resultado.detalle.filter(r => r.estado === 'error').length > 0 && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-red-600 mb-1.5">Empresas que fallaron</p>
                    <div className="flex flex-col gap-1">
                      {resultado.detalle.filter(r => r.estado === 'error').map((r, i) => (
                        <div key={`e${i}`} className="flex items-start justify-between gap-3 bg-red-500/[0.05] border border-red-500/20 rounded-lg px-3 py-1.5">
                          <span className="text-[11px] font-bold text-slate-700 uppercase truncate">{r.razonSocial || r.nombre || r.rut}</span>
                          <span className="text-[10px] text-red-600 text-right max-w-[55%]">{r.error || 'Error desconocido'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {resultado.detalle.filter(r => r.estado === 'exito').length > 0 && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 mb-1.5">Emitidas correctamente</p>
                    <div className="flex flex-col gap-1">
                      {resultado.detalle.filter(r => r.estado === 'exito').map((r, i) => (
                        <div key={`s${i}`} className="flex items-center justify-between gap-3 bg-emerald-500/[0.05] border border-emerald-500/20 rounded-lg px-3 py-1.5">
                          <span className="text-[11px] font-bold text-slate-700 uppercase truncate">{r.razonSocial || r.nombre || r.rut}</span>
                          <span className="text-[10px] font-mono text-emerald-700">Folio {r.folio}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {resultado.noProcesadas > 0 && (
                  <p className="text-[10px] text-slate-400 font-bold">
                    {resultado.noProcesadas} no se procesaron (ya facturadas este mes o sin datos válidos) — el sistema evita duplicados.
                  </p>
                )}
                {resultado.vinc && <p className="text-[10px] text-slate-500 font-bold">{resultado.vinc}</p>}
              </div>

              <div className="flex items-center justify-end px-6 py-4 border-t border-[#efe8dd] bg-slate-50 flex-shrink-0">
                <button onClick={() => setResultado(null)}
                  className="bg-slate-900 hover:bg-slate-700 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors">
                  Cerrar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      , document.body)}
    </motion.div>
  );
};

export default CobrosMensuales;
