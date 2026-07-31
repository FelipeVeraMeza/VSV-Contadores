// =====================================================================
// 📧 CORREO MASIVO
// ---------------------------------------------------------------------
// Antes esto vivía como una pestaña dentro del modal "Facturador
// Electrónico", así que para ver a quién se le había mandado la factura
// había que abrir el modal de emitir. Es una vista de consulta y de envío,
// no de emisión: va como sub-página propia de Facturación.
//
// Dos cosas distintas conviven acá a propósito, porque las dos son "mandar
// correo a los clientes":
//   · el registro de las facturas enviadas, con reenvío individual o en lote
//   · el recordatorio de pago, que va a los que tienen el cobro PENDIENTE
// =====================================================================
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Mail, Loader2, CheckCircle2, AlertCircle, RefreshCw, Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth.jsx';
import * as apiDTE from '@/services/apiDTE.js';

// Estado del COBRO de cada folio (no del correo). Sale de `cobro_mensual`.
const ESTILO_PAGO = {
  PAGADA:            { label: 'Pagada',      c: 'text-emerald-700 bg-emerald-500/10 border-emerald-500/30' },
  PENDIENTE_PAGO:    { label: 'Debe',        c: 'text-amber-700 bg-amber-500/10 border-amber-500/30' },
  PENDIENTE_RECIBO:  { label: 'Pend. recibo',c: 'text-sky-700 bg-sky-500/10 border-sky-500/30' },
  POR_EMITIR:        { label: 'Por emitir',  c: 'text-blue-700 bg-blue-500/10 border-blue-500/30' },
  ANULADA:           { label: 'Anulada',     c: 'text-slate-500 bg-slate-500/10 border-slate-400/30' },
};

const FILTROS = [
  { id: 'deben',     label: 'Deben' },
  { id: 'pagaron',   label: 'Ya pagaron' },
  { id: 'sin_cobro', label: 'Sin cobro asociado' },
  { id: 'todos',     label: 'Todos' },
];

// Al cambiar de sub-página, Facturacion.jsx desmonta este componente y se
// pierde todo lo que estuvieras haciendo. Por eso el filtro vive en la URL
// (igual que `?sub=`, la convención del resto de la app) y la selección en
// sessionStorage: marcar 20 folios y perderlos por ir a mirar otra pantalla
// es trabajo tirado a la basura.
const LLAVE_SELECCION = 'correoMasivo.selectedFolios';

const leerSeleccionGuardada = () => {
  try {
    const crudo = sessionStorage.getItem(LLAVE_SELECCION);
    const lista = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(lista) ? lista.map(String) : [];
  } catch {
    return [];
  }
};

const CorreoMasivo = () => {
  const { user } = useAuth();

  // Se abre en "Deben": es la lista que interesa: los cobros del mes todavía
  // impagos, que son exactamente los destinatarios del recordatorio. Ver
  // "Todos" incluye el histórico completo (169 filas) y esconde lo importante.
  const [searchParams, setSearchParams] = useSearchParams();
  const filtroPago = searchParams.get('pago') || 'deben';
  const setFiltroPago = (id) => {
    const params = new URLSearchParams(searchParams);
    params.set('pago', id);
    setSearchParams(params, { replace: true });
  };

  const [correosLog, setCorreosLog] = useState([]);
  const [isLoadingCorreos, setIsLoadingCorreos] = useState(false);
  const [reenviandoFolio, setReenviandoFolio] = useState(null);
  const [manualFolio, setManualFolio] = useState('');
  const [selectedFolios, setSelectedFolios] = useState(leerSeleccionGuardada);
  const [isReenviandoMasivo, setIsReenviandoMasivo] = useState(false);

  const [isEnviandoRecordatorios, setIsEnviandoRecordatorios] = useState(false);
  const [progresoRecordatorio, setProgresoRecordatorio] = useState(null);

  const timers = useRef([]);
  const programar = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // ====================================================
  // 📒 REGISTRO DE CORREOS
  // ====================================================
  // `/dte/correos-log` exige sesión (requireSession). La versión anterior
  // llamaba con `fetch` pelado, sin la cabecera, así que el servidor
  // respondía 401 y la tabla salía siempre vacía: "aún no hay correos
  // registrados" aunque la base tuviera cientos.
  const cargarCorreosLog = async () => {
    setIsLoadingCorreos(true);
    try {
      const res = await apiDTE.getCorreosLog();
      if (res.status === 401) {
        return toast({ variant: 'destructive', title: 'Sesión expirada', description: 'Vuelve a iniciar sesión para ver el registro.' });
      }
      const data = await res.json();
      if (data?.correos) setCorreosLog(data.correos);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo cargar el registro', description: e.message });
    } finally {
      setIsLoadingCorreos(false);
    }
  };

  useEffect(() => { if (user?.sessionId) cargarCorreosLog(); }, [user?.sessionId]);

  // La selección sobrevive a cambiar de sub-página y volver.
  useEffect(() => {
    try { sessionStorage.setItem(LLAVE_SELECCION, JSON.stringify(selectedFolios)); } catch { /* modo privado */ }
  }, [selectedFolios]);

  // Si al entrar hay un envío corriendo en el servidor, se retoma la barra de
  // avance. El envío vive en el backend y sigue aunque el navegador se cierre;
  // sin esto la pantalla se veía quieta y parecía que no estaba pasando nada.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await apiDTE.getProgresoRecordatorios();
        if (!res.ok) return;
        const data = await res.json();
        if (cancelado) return;
        setProgresoRecordatorio(data);
        if (data.activo) setIsEnviandoRecordatorios(true);
      } catch { /* si no responde, se muestra la pantalla normal */ }
    })();
    return () => { cancelado = true; };
  }, [user?.sessionId]);

  // ====================================================
  // 📧 REENVÍO
  // ====================================================
  const reenviarCorreo = async (folio, datos) => {
    const folioLimpio = String(folio || '').replace(/[^0-9]/g, '');
    if (!folioLimpio) {
      return toast({ variant: 'destructive', title: 'Falta el folio', description: 'Ingresa el N° de folio de la factura.' });
    }

    setReenviandoFolio(folioLimpio);
    try {
      const res = await apiDTE.reenviarCorreo(folioLimpio, datos);
      const data = await res.json();
      if (data.ok) {
        toast({ title: '📧 Reenvío iniciado', description: data.mensaje || `Folio ${folioLimpio}: enviando en segundo plano. Se refresca solo en ~1 min.`, duration: 9000 });
        programar(cargarCorreosLog, 65000);
      } else {
        toast({ variant: 'destructive', title: 'No se pudo iniciar', description: data.error || 'Revisa el registro.' });
      }
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error de conexión', description: e.message });
    } finally {
      setReenviandoFolio(null);
    }
  };

  const toggleFolio = (folio) => {
    const f = String(folio);
    setSelectedFolios((prev) => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  };
  // Solo sobre lo que se está viendo: si hay un filtro puesto, no se seleccionan
  // filas escondidas.
  const seleccionarPendientes = () =>
    setSelectedFolios(filas.filter(c => c.estado === 'fallido' || c.estado === 'omitido').map(c => String(c.folio)));
  const limpiarSeleccion = () => setSelectedFolios([]);

  const reenviarSeleccionados = async () => {
    if (selectedFolios.length === 0) return;
    const items = correosLog
      .filter(c => selectedFolios.includes(String(c.folio)))
      .map(c => ({ folio: String(c.folio), datos: c.datos || { razonSocial: c.razonSocial, rut: c.rut, correo: c.correo } }));

    setIsReenviandoMasivo(true);
    toast({ title: '📧 Reenvío masivo iniciado', description: `Procesando ${items.length} correo(s) en segundo plano. Puede tardar varios minutos.`, duration: 10000 });
    try {
      const res = await apiDTE.reenviarCorreosMasivo(items);
      const data = await res.json();
      if (!data.ok) {
        toast({ variant: 'destructive', title: 'No se pudo iniciar', description: data.error || 'Error' });
      } else {
        setSelectedFolios([]);
        programar(cargarCorreosLog, 30000);
        programar(cargarCorreosLog, 90000);
      }
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error de conexión', description: e.message });
    } finally {
      setIsReenviandoMasivo(false);
    }
  };

  // ====================================================
  // 📢 RECORDATORIO DE PAGO
  // La lista sale de los cobros PENDIENTE_PAGO del mes, no de las facturas
  // enviadas: al que ya pagó no se le cobra de nuevo.
  // ====================================================
  const enviarRecordatoriosPago = async () => {
    try {
      // Si hay filas marcadas, el recordatorio va SOLO a esas. Antes este botón
      // ignoraba la selección y mandaba a los 93 siempre: quedaba pegado al lado
      // de "Enviar seleccionados" y era muy fácil confundirlos.
      const folios = selectedFolios.length ? selectedFolios : null;
      const query = folios ? `?folios=${encodeURIComponent(folios.join(','))}` : '';

      const prev = await apiDTE.previewRecordatorios(folios);
      const prevData = await prev.json();
      if (!prevData.ok) {
        return toast({ variant: 'destructive', title: 'No se pudo calcular', description: prevData.error || 'Error al obtener destinatarios.' });
      }
      if (!prevData.total) {
        return toast({ title: 'Sin destinatarios', description: 'No hay cobros pendientes con correo en el periodo.' });
      }

      const detalleExcluidos = (prevData.excluidos || [])
        .map(e => `  · ${e.razonSocial} (folio ${e.folio}) — ${e.motivo}`)
        .join('\n');
      const deuda = Number(prevData.deuda || 0).toLocaleString('es-CL');

      // Con pocos destinatarios se listan por nombre: es la única forma de estar
      // seguro de a quién le llega antes de apretar.
      const aQuienes = prevData.total <= 10
        ? '\n' + prevData.destinatarios.map(d => `  · ${d.razonSocial} (${d.correo})`).join('\n') + '\n'
        : '';

      const ok = window.confirm(
        (folios
          ? `Se enviará el RECORDATORIO DE PAGO a los ${prevData.total} SELECCIONADO(S):\n${aQuienes}`
          : `Se enviará el RECORDATORIO DE PAGO a TODOS los ${prevData.total} cliente(s) con el pago PENDIENTE del periodo ${prevData.periodo || 'en curso'}.${aQuienes}`) +
        `\nDeuda cubierta: $${deuda}\n` +
        `Los que ya pagaron NO reciben nada.\n\n` +
        (prevData.totalExcluidos
          ? `Quedan fuera ${prevData.totalExcluidos} que deben pero no tienen correo:\n${detalleExcluidos}\n\n`
          : '') +
        `Este correo SÍ se manda de verdad a los clientes. ¿Continuar?`
      );
      if (!ok) return;

      setIsEnviandoRecordatorios(true);
      const res = await apiDTE.enviarRecordatorios(folios);
      const data = await res.json();
      if (data.ok) {
        toast({ title: '📢 Recordatorios en camino', description: data.mensaje || `Enviando a ${prevData.total} cliente(s) en segundo plano.`, duration: 9000 });
      } else {
        setIsEnviandoRecordatorios(false);
        toast({ variant: 'destructive', title: 'No se pudo iniciar', description: data.error || 'Error.' });
      }
    } catch (e) {
      setIsEnviandoRecordatorios(false);
      toast({ variant: 'destructive', title: 'Error de conexión', description: e.message });
    }
  };

  // Progreso en vivo mientras se envían los recordatorios.
  useEffect(() => {
    if (!isEnviandoRecordatorios) return;
    const interval = setInterval(async () => {
      try {
        const res = await apiDTE.getProgresoRecordatorios();
        if (!res.ok) return;
        const data = await res.json();
        setProgresoRecordatorio(data);
        if (data.finalizado || (!data.activo && data.total > 0 && data.actual >= data.total)) {
          setIsEnviandoRecordatorios(false);
          toast({ title: '✅ Recordatorios enviados', description: `Enviados: ${data.enviados} · Fallidos: ${data.fallidos}`, duration: 10000 });
        }
      } catch { /* silencioso: es solo el indicador de avance */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [isEnviandoRecordatorios, user?.sessionId]);

  // Filtro por estado del COBRO. "Deben" son los que todavía no pagan, que es
  // exactamente a quienes va el recordatorio.
  const coincideFiltro = (c, id) => {
    if (id === 'todos') return true;
    if (id === 'sin_cobro') return !c.estadoPago;
    if (id === 'pagaron') return c.estadoPago === 'PAGADA';
    if (id === 'deben') return c.estadoPago === 'PENDIENTE_PAGO' || c.estadoPago === 'PENDIENTE_RECIBO';
    return true;
  };

  const filas = useMemo(
    () => correosLog.filter(c => coincideFiltro(c, filtroPago)),
    [correosLog, filtroPago]
  );

  const cuentaFiltro = (id) => correosLog.filter(c => coincideFiltro(c, id)).length;

  // Los contadores de arriba hablan del ENVÍO del correo y siguen al filtro:
  // con "Total: 169" fijo mientras la tabla muestra 93 no se entiende nada.
  const cuenta = (estado) => filas.filter(c => c.estado === estado).length;

  const deudaVisible = filas
    .filter(c => c.estadoPago === 'PENDIENTE_PAGO' || c.estadoPago === 'PENDIENTE_RECIBO')
    .reduce((a, c) => a + Number(c.montoCobro || 0), 0);

  // Al cambiar de filtro se limpia lo seleccionado: si no, quedarían marcados
  // folios que ya no se ven y el "enviar seleccionados" mandaría de más.
  //
  // Salvo en el primer render: ahí el filtro no cambió, solo se leyó de la URL,
  // y borrar acá tiraría al tacho la selección recién restaurada.
  const primerRender = useRef(true);
  useEffect(() => {
    if (primerRender.current) { primerRender.current = false; return; }
    setSelectedFolios([]);
  }, [filtroPago]);

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300">
      {/* Contadores + acciones por folio */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0 gap-4 flex-wrap">
        <div className="flex gap-6 text-[10px] font-bold uppercase tracking-widest">
          <span className="text-slate-500">Mostrando: <span className="text-slate-700">{filas.length}</span> de {correosLog.length}</span>
          <span className="text-emerald-600 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Enviados: {cuenta('enviado')}</span>
          <span className="text-red-500 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Fallidos: {cuenta('fallido')}</span>
          <span className="text-slate-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-gray-500" />Omitidos: {cuenta('omitido')}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-50 border border-[#efe8dd] rounded-lg pl-3 pr-1 h-9">
            <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Folio N°</span>
            <Input
              value={manualFolio}
              onChange={(e) => setManualFolio(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="1145"
              className="h-7 w-24 bg-transparent border-0 text-xs font-mono font-bold text-blue-700 focus:ring-0 shadow-none"
            />
            <Button
              onClick={() => reenviarCorreo(manualFolio, null)}
              disabled={!manualFolio || reenviandoFolio !== null}
              className="h-7 px-3 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-700 text-[10px] font-black uppercase tracking-widest rounded-md"
            >
              {reenviandoFolio === manualFolio ? <Loader2 size={13} className="animate-spin" /> : 'Enviar'}
            </Button>
          </div>
          <Button
            onClick={cargarCorreosLog}
            disabled={isLoadingCorreos}
            className="h-9 px-4 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-700 text-[10px] font-black uppercase tracking-widest rounded-lg inline-flex items-center gap-2"
          >
            {isLoadingCorreos ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refrescar
          </Button>
        </div>
      </div>

      {/* Filtro por estado de pago: para ver a quién le corresponde el cobro
          ANTES de mandar nada. */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0 gap-3 flex-wrap bg-white border border-[#efe8dd] rounded-xl px-4 py-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTROS.map(f => (
            <button
              key={f.id}
              onClick={() => setFiltroPago(f.id)}
              className={`px-3 h-7 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${
                filtroPago === f.id
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-slate-50 text-slate-500 border-[#efe8dd] hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              {f.label} <span className="opacity-70">({cuentaFiltro(f.id)})</span>
            </button>
          ))}
        </div>
        {deudaVisible > 0 && (
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-700">
            Deuda a la vista: ${deudaVisible.toLocaleString('es-CL')}
          </span>
        )}
      </div>

      {/* Acciones masivas */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0 gap-3 flex-wrap bg-white border border-[#efe8dd] rounded-xl px-4 py-2">
        <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest">
          <span className="text-slate-500">Seleccionados: <span className="text-blue-600">{selectedFolios.length}</span></span>
          <button onClick={seleccionarPendientes} className="text-orange-600 hover:text-orange-700 underline-offset-2 hover:underline">Seleccionar los que faltan</button>
          {selectedFolios.length > 0 && <button onClick={limpiarSeleccion} className="text-slate-400 hover:text-slate-600">Limpiar</button>}
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={enviarRecordatoriosPago}
            disabled={isEnviandoRecordatorios || isReenviandoMasivo || reenviandoFolio !== null}
            title={selectedFolios.length
              ? `Recordatorio de pago solo a los ${selectedFolios.length} seleccionado(s)`
              : 'Recordatorio de pago a TODOS los clientes con el cobro del mes pendiente'}
            className="h-9 px-5 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow-lg shadow-amber-600/20 inline-flex items-center gap-2"
          >
            {isEnviandoRecordatorios
              ? <><Loader2 size={14} className="animate-spin" />{progresoRecordatorio?.total ? ` ${progresoRecordatorio.actual}/${progresoRecordatorio.total}` : ' Enviando…'}</>
              : <><Mail size={14} /> {selectedFolios.length
                    ? `Recordatorio a seleccionados (${selectedFolios.length})`
                    : `Recordatorio a todos (${cuentaFiltro('deben')})`}</>}
          </Button>
          <Button
            onClick={reenviarSeleccionados}
            disabled={selectedFolios.length === 0 || isReenviandoMasivo || reenviandoFolio !== null}
            className="h-9 px-5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow-lg shadow-emerald-600/20 inline-flex items-center gap-2"
          >
            {isReenviandoMasivo ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Enviar seleccionados ({selectedFolios.length})
          </Button>
        </div>
      </div>

      {/* Tabla */}
      <div className="flex-1 overflow-y-auto custom-scrollbar rounded-xl border border-[#efe8dd] bg-white">
        {isLoadingCorreos && correosLog.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2 py-16">
            <Loader2 size={28} className="animate-spin opacity-60" />
            <p className="text-xs font-bold uppercase tracking-widest">Cargando registro…</p>
          </div>
        ) : filas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2 py-16">
            <Mail size={32} className="opacity-40" />
            <p className="text-xs font-bold uppercase tracking-widest">
              {correosLog.length === 0 ? 'Aún no hay correos registrados' : 'Ningún correo con ese filtro'}
            </p>
          </div>
        ) : (
          <table className="w-full text-left whitespace-nowrap border-collapse">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-[#efe8dd]">
              <tr className="text-slate-400 font-black uppercase tracking-widest text-[9px]">
                <th className="px-3 py-2.5 w-8 text-center">
                  <input
                    type="checkbox"
                    className="accent-emerald-500 cursor-pointer"
                    checked={filas.length > 0 && selectedFolios.length === filas.length}
                    onChange={(e) => setSelectedFolios(e.target.checked ? filas.map(c => String(c.folio)) : [])}
                    title="Seleccionar todos los visibles"
                  />
                </th>
                <th className="px-4 py-2.5">Fecha</th>
                <th className="px-3 py-2.5">Folio</th>
                <th className="px-3 py-2.5 min-w-[160px]">Razón Social</th>
                <th className="px-3 py-2.5 min-w-[160px]">Correo</th>
                <th className="px-3 py-2.5 text-center">Envío</th>
                <th className="px-3 py-2.5 text-center">Pago</th>
                <th className="px-3 py-2.5 min-w-[200px]">Detalle</th>
                <th className="px-3 py-2.5 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f3ede4]">
              {filas.map((c, i) => (
                <tr key={`${c.folio}-${i}`} className={`hover:bg-slate-50 transition-colors ${selectedFolios.includes(String(c.folio)) ? 'bg-emerald-500/5' : ''}`}>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      className="accent-emerald-500 cursor-pointer"
                      checked={selectedFolios.includes(String(c.folio))}
                      onChange={() => toggleFolio(c.folio)}
                    />
                  </td>
                  <td className="px-4 py-2 text-[10px] text-slate-500 font-mono">{c.fecha ? new Date(c.fecha).toLocaleString('es-CL') : '—'}</td>
                  <td className="px-3 py-2 text-[10px] font-mono font-bold text-blue-600">{c.folio || '—'}</td>
                  <td className="px-3 py-2 text-[10px] font-bold text-slate-700 uppercase truncate max-w-[200px]">{c.razonSocial || '—'}</td>
                  <td className="px-3 py-2 text-[10px] text-slate-600 truncate max-w-[200px]">{c.correo || '—'}</td>
                  <td className="px-3 py-2 text-center">
                    {c.estado === 'enviado' && <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 font-black text-[8px] uppercase border border-emerald-500/20 inline-flex items-center gap-1"><CheckCircle2 size={9} /> Enviado</span>}
                    {c.estado === 'fallido' && <span className="px-2 py-1 rounded-full bg-red-500/10 text-red-500 font-black text-[8px] uppercase border border-red-500/20 inline-flex items-center gap-1"><AlertCircle size={9} /> Fallido</span>}
                    {c.estado === 'omitido' && <span className="px-2 py-1 rounded-full bg-gray-500/10 text-slate-500 font-black text-[8px] uppercase border border-gray-500/20">Omitido</span>}
                    {!['enviado', 'fallido', 'omitido'].includes(c.estado) && <span className="text-slate-400 text-[9px]">{c.estado}</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {c.estadoPago ? (
                      <span className={`px-2 py-1 rounded-full font-black text-[8px] uppercase border inline-block ${(ESTILO_PAGO[c.estadoPago] || ESTILO_PAGO.PENDIENTE_PAGO).c}`}>
                        {(ESTILO_PAGO[c.estadoPago] || { label: c.estadoPago }).label}
                        {c.montoCobro ? ` · $${Number(c.montoCobro).toLocaleString('es-CL')}` : ''}
                      </span>
                    ) : (
                      <span className="text-slate-300 text-[9px] font-bold uppercase">sin cobro</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[9px] text-slate-400 whitespace-normal max-w-[260px]">{c.motivo || (c.estado === 'enviado' ? '✓ Entregado al cliente' : '—')}</td>
                  <td className="px-3 py-2 text-center">
                    <Button
                      onClick={() => reenviarCorreo(c.folio, c.datos)}
                      disabled={!c.folio || reenviandoFolio !== null}
                      title="Reenviar este correo"
                      className="h-7 px-3 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-700 text-[9px] font-black uppercase tracking-widest rounded-md inline-flex items-center gap-1"
                    >
                      {reenviandoFolio === String(c.folio) ? <Loader2 size={12} className="animate-spin" /> : <><Mail size={11} /> {c.estado === 'enviado' ? 'Reenviar' : 'Enviar'}</>}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default CorreoMasivo;
