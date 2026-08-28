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
  Search, X, Upload, FileSpreadsheet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth.jsx';
import * as apiDTE from '@/services/apiDTE.js';
import { conciliarCobranzaApi } from '@/services/cobrosService';

// Estado del COBRO de cada folio (no del correo). Sale de `cobro_mensual`.
const ESTILO_PAGO = {
  PAGADA:            { label: 'Pagada',      c: 'text-emerald-700 bg-emerald-500/10 border-emerald-500/30' },
  PENDIENTE_PAGO:    { label: 'Debe',        c: 'text-amber-700 bg-amber-500/10 border-amber-500/30' },
  PENDIENTE_RECIBO:  { label: 'Pend. recibo',c: 'text-sky-700 bg-sky-500/10 border-sky-500/30' },
  POR_EMITIR:        { label: 'Por emitir',  c: 'text-blue-700 bg-blue-500/10 border-blue-500/30' },
  ANULADA:           { label: 'Anulada',     c: 'text-slate-500 bg-slate-500/10 border-slate-400/30' },
};

// «Anuladas» existe porque, sin ella, una factura dada de baja con nota de
// crédito no caía en ningún filtro: no debe, no pagó y sí tiene cobro asociado.
// Quedaba fuera de las tres pestañas y solo aparecía en «Todos», donde las
// cuentas no cuadraban (91 + 0 + 5 = 96 de 97).
const FILTROS = [
  { id: 'deben',     label: 'Deben' },
  { id: 'pagaron',   label: 'Ya pagaron' },
  { id: 'anuladas',  label: 'Anuladas' },
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
  // Mes que se está mirando (YYYY-MM). Vacío = el que se está cobrando.
  // Sin esto la pantalla mostraba siempre el mes en curso y no había forma de
  // revisar los envíos de meses anteriores.
  const [periodo, setPeriodo] = useState('');

  // Los últimos 12 meses para el desplegable. Se arman en el cliente en vez de
  // pedirlos: la lista de meses con envíos cambia poco y no vale una consulta.
  const mesesDisponibles = useMemo(() => {
    const out = [];
    const hoy = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth() - i, 1));
      const valor = d.toISOString().slice(0, 7);
      out.push({
        valor,
        label: d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      });
    }
    return out;
  }, []);
  const [reenviandoFolio, setReenviandoFolio] = useState(null);
  const [manualFolio, setManualFolio] = useState('');
  const [selectedFolios, setSelectedFolios] = useState(leerSeleccionGuardada);
  const [isReenviandoMasivo, setIsReenviandoMasivo] = useState(false);
  // Buscar dentro de la lista. Antes solo se podía marcar de a uno a ojo.
  const [busqueda, setBusqueda] = useState('');
  // Resultado de cruzar la planilla de cobranza contra la pantalla.
  const [conciliacion, setConciliacion] = useState(null);
  const [conciliando, setConciliando] = useState(false);
  const archivoRef = useRef(null);

  const [isEnviandoRecordatorios, setIsEnviandoRecordatorios] = useState(false);
  const [progresoRecordatorio, setProgresoRecordatorio] = useState(null);

  const timers = useRef([]);
  const programar = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };
  // Sondeo del reenvío masivo en curso (ver `seguirReenvio`).
  const pollReenvio = useRef(null);
  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    if (pollReenvio.current) clearInterval(pollReenvio.current);
  }, []);

  // ====================================================
  // 📒 REGISTRO DE CORREOS
  // ====================================================
  // `/dte/correos-log` exige sesión (requireSession). La versión anterior
  // llamaba con `fetch` pelado, sin la cabecera, así que el servidor
  // respondía 401 y la tabla salía siempre vacía: "aún no hay correos
  // registrados" aunque la base tuviera cientos.
  const cargarCorreosLog = async (per = periodo) => {
    setIsLoadingCorreos(true);
    try {
      const res = await apiDTE.getCorreosLog(per);
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

  // Recarga al cambiar de mes. `periodo` vacío = el mes que se está cobrando,
  // que es el criterio por omisión del backend.
  useEffect(() => { if (user?.sessionId) cargarCorreosLog(periodo); }, [user?.sessionId, periodo]);

  // Si al entrar hay un reenvío corriendo en el servidor, se retoma su
  // seguimiento: el proceso vive en el backend y sigue aunque uno cambie de
  // pantalla, pero sin esto nadie avisaría cuando termina.
  useEffect(() => {
    if (!user?.sessionId) return;
    let cancelado = false;
    (async () => {
      try {
        const r = await apiDTE.getProgresoReenvio();
        const p = await r.json();
        if (!cancelado && p?.activo) {
          setIsReenviandoMasivo(true);
          seguirReenvio(p.total || 0);
        }
      } catch { /* si falla, la pantalla queda como siempre */ }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.sessionId]);

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

  // ==========================================================================
  // CARGAR LA PLANILLA DE COBRANZA DEL MES
  // --------------------------------------------------------------------------
  // La planilla lista a los que DEBEN. Todo el resto del mes, por definición,
  // ya pagó. Antes eso se traducía a mano: buscar 39 empresas de a una en una
  // lista de 169 y marcarlas.
  //
  // Acá NO se cambia nada todavía. Se cruza, se muestra qué pasaría, y recién
  // después se confirma. Marcar un cobro como pagado toca plata: si se hace
  // sobre quien no corresponde, el cliente deja de aparecer como deudor y nadie
  // vuelve a cobrarle.
  //
  // El cruce es por RUT, no por nombre: "ANITA MARIA VEAS VILLAGRA ASESORIAS
  // E.I.R.L" en la planilla y en la base no se escriben igual, y un nombre mal
  // pareado marcaría pagado al cliente equivocado.
  // ==========================================================================
  const soloRut = (v) => String(v || '').replace(/[.\-\s]/g, '').toUpperCase();

  const cargarPlanillaCobranza = async (file) => {
    if (!file) return;
    setConciliando(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer());
      const filasExcel = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
      if (!filasExcel.length) throw new Error('La planilla está vacía.');

      // La columna del RUT se busca por nombre, sin exigir que se llame exacto.
      const columnas = Object.keys(filasExcel[0]);
      const colRut = columnas.find(c => /rut/i.test(c));
      if (!colRut) {
        throw new Error(`La planilla no tiene una columna de RUT. Trae: ${columnas.join(', ')}`);
      }
      const colNombre = columnas.find(c => /raz[oó]n|nombre|empresa/i.test(c));

      const deben = new Map();
      for (const f of filasExcel) {
        const r = soloRut(f[colRut]);
        if (r) deben.set(r, colNombre ? String(f[colNombre] || '').trim() : '');
      }

      // Cruce contra lo que hay en pantalla, sobre el mes en curso.
      const delMes = correosLog;
      const enPlanilla = [], fueraDePlanilla = [];
      const vistos = new Set();
      for (const c of delMes) {
        const r = soloRut(c.rut);
        if (r && deben.has(r)) { enPlanilla.push(c); vistos.add(r); }
        else fueraDePlanilla.push(c);
      }

      // Los de la planilla que no aparecen en la pantalla: o no tienen cobro
      // emitido este mes, o el RUT está mal en alguna de las dos partes.
      const sinCobro = [...deben.entries()]
        .filter(([r]) => !vistos.has(r))
        .map(([rut, nombre]) => ({ rut, nombre }));

      // Solo tiene sentido marcar pagado lo que hoy está pendiente.
      const aMarcarPagado = fueraDePlanilla.filter(
        c => c.estadoPago === 'PENDIENTE_PAGO' || c.estadoPago === 'PENDIENTE_RECIBO'
      );

      setConciliacion({
        archivo: file.name,
        totalPlanilla: deben.size,
        deben: enPlanilla,
        sinCobro,
        aMarcarPagado,
        yaPagados: fueraDePlanilla.filter(c => c.estadoPago === 'PAGADA').length,
        sinCobroAsociado: fueraDePlanilla.filter(c => !c.estadoPago).length,
      });

      // Se dejan seleccionados los que deben: es lo que se va a mandar.
      setSelectedFolios(enPlanilla.map(c => String(c.folio)));
      setFiltroPago('todos');

      toast({
        title: `${enPlanilla.length} deudores seleccionados`,
        description: sinCobro.length
          ? `${sinCobro.length} de la planilla no tienen cobro este mes. Revísalos abajo.`
          : 'Todos los de la planilla calzaron.',
      });
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo leer la planilla', description: e.message });
    } finally {
      setConciliando(false);
      if (archivoRef.current) archivoRef.current.value = '';
    }
  };

  // Marcar como pagados a los que NO están en la planilla.
  // Primero simula en el servidor y muestra el número exacto; recién con el
  // "sí" explícito escribe. Marcar pagado a quien no pagó lo saca de la
  // cobranza y nadie vuelve a cobrarle.
  const conciliarMes = async () => {
    if (!conciliacion) return;
    const ruts = conciliacion.deben.map(c => c.rut).filter(Boolean);
    if (!ruts.length) {
      toast({ variant: 'destructive', title: 'Sin RUT para cruzar',
              description: 'Ninguna fila seleccionada trae RUT. No se marca nada.' });
      return;
    }
    setConciliando(true);
    try {
      const sim = await conciliarCobranzaApi(user.sessionId, ruts, { simular: true });
      const d = await sim.json();
      if (!d.success) throw new Error(d.message);

      const confirmado = window.confirm(
        `Se van a marcar ${d.seMarcarianPagados} cobros como PAGADOS `
        + `por $${Number(d.montoQueSeDaPorPagado).toLocaleString('es-CL')}.\n\n`
        + `Después de esto seguirán debiendo ${d.seguirianDebiendo} clientes `
        + `($${Number(d.deudaQueQueda).toLocaleString('es-CL')}).\n\n`
        + `Un cobro marcado como pagado deja de aparecer en la cobranza.\n\n`
        + `¿Continuar?`
      );
      if (!confirmado) { setConciliando(false); return; }

      const r = await conciliarCobranzaApi(user.sessionId, ruts, { simular: false });
      const res = await r.json();
      if (!res.success) throw new Error(res.message);
      toast({ title: `${res.marcados} cobros marcados como pagados`, description: res.message });
      setConciliacion(null);
      cargarCorreosLog();
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo conciliar', description: e.message });
    } finally { setConciliando(false); }
  };

  const toggleFolio = (folio) => {
    const f = String(folio);
    setSelectedFolios((prev) => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  };
  // Solo sobre lo que se está viendo: si hay un filtro puesto, no se seleccionan
  // filas escondidas.
  const seleccionarPendientes = () =>
    setSelectedFolios(filas
      .filter(c => ['fallido', 'omitido', 'pendiente'].includes(c.estado))
      .map(c => String(c.folio)));
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
        setIsReenviandoMasivo(false);
        return;
      }
      setSelectedFolios([]);
      // Se sigue el proceso hasta que termina, en vez de refrescar a ciegas a
      // los 30 y 90 segundos: el reenvío abre el SII y baja un PDF por folio,
      // así que puede tardar más y el usuario se quedaba sin saber cómo salió.
      seguirReenvio(items.length);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error de conexión', description: e.message });
      setIsReenviandoMasivo(false);
    }
  };

  // Sondea el reenvío hasta que el servidor dice que terminó, y recién ahí
  // refresca la tabla y avisa con el resultado.
  const seguirReenvio = (enviados) => {
    if (pollReenvio.current) clearInterval(pollReenvio.current);
    let vistoActivo = false;
    let ticks = 0;

    pollReenvio.current = setInterval(async () => {
      ticks++;
      try {
        const r = await apiDTE.getProgresoReenvio();
        const p = await r.json();
        if (p?.activo) vistoActivo = true;

        // Termina cuando el servidor lo dice, o tras 10 minutos de gracia si
        // nunca se vio activo (el proceso pudo acabar entre dos sondeos).
        const termino = (vistoActivo && p && p.activo === false) || (!vistoActivo && ticks >= 200);
        if (!termino) return;

        clearInterval(pollReenvio.current);
        pollReenvio.current = null;
        setIsReenviandoMasivo(false);
        await cargarCorreosLog(periodo);

        const ok = p?.enviados ?? 0;
        const mal = p?.fallidos ?? 0;
        toast({
          variant: mal > 0 ? 'destructive' : undefined,
          title: mal > 0 ? `Reenvío terminado con ${mal} fallo(s)` : '✅ Reenvío terminado',
          description: `${ok} de ${enviados} correo(s) enviados correctamente.`,
          duration: 12000,
        });
      } catch { /* reintenta en el próximo ciclo */ }
    }, 3000);
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
    if (id === 'anuladas') return c.estadoPago === 'ANULADA';
    if (id === 'deben') return c.estadoPago === 'PENDIENTE_PAGO' || c.estadoPago === 'PENDIENTE_RECIBO';
    return true;
  };

  // BUSCAR. Hasta ahora solo se podía marcar de a uno recorriendo la lista con
  // el ojo: con 169 filas, encontrar una empresa era desplazarse y leer.
  // Busca en razón social, RUT, folio y correo a la vez, porque uno tiene a
  // mano cualquiera de los cuatro según de dónde venga el dato.
  const coincideBusqueda = (c, texto) => {
    if (!texto) return true;
    const t = texto.toLowerCase().trim();
    // El RUT se compara sin puntos ni guion: en la planilla viene de una forma
    // y en la base de otra, y nadie debería tener que adivinar el formato.
    const soloNum = t.replace(/[.\-\s]/g, '');
    return (
      String(c.razonSocial || '').toLowerCase().includes(t) ||
      String(c.correo || '').toLowerCase().includes(t) ||
      String(c.folio || '').includes(soloNum) ||
      String(c.rut || '').replace(/[.\-\s]/g, '').toLowerCase().includes(soloNum)
    );
  };

  const filas = useMemo(
    () => correosLog.filter(c => coincideFiltro(c, filtroPago) && coincideBusqueda(c, busqueda)),
    [correosLog, filtroPago, busqueda]
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
          {/* Facturas emitidas sin correo: si no se cuentan, pasan inadvertidas
              —no son un fallo, simplemente nunca se intentó enviarlas—. */}
          {cuenta('pendiente') > 0 && (
            <span className="text-amber-600 flex items-center gap-1 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Sin enviar: {cuenta('pendiente')}
            </span>
          )}
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
          {/* Mes que se está mirando. Es un desplegable y no un `<input
              type="month">` porque, vacío, el input pinta su máscara
              («---------- de ----») y parece un campo roto. Acá el valor por
              omisión se puede nombrar: "Mes en cobro". */}
          <select
            value={periodo} onChange={(e) => setPeriodo(e.target.value)}
            title="Mes de los envíos que se están mostrando."
            className="h-9 px-3 bg-white border border-[#efe8dd] rounded-lg text-xs text-slate-700 focus:outline-none focus:border-slate-400 cursor-pointer"
          >
            <option value="">Mes en cobro</option>
            {mesesDisponibles.map(m => (
              <option key={m.valor} value={m.valor}>{m.label}</option>
            ))}
          </select>
          <Button
            onClick={() => cargarCorreosLog(periodo)}
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
        <div className="flex items-center gap-2 flex-wrap">
          {deudaVisible > 0 && (
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-700">
              Deuda a la vista: ${deudaVisible.toLocaleString('es-CL')}
            </span>
          )}
          {/* BUSCADOR. Con 169 filas, encontrar una empresa era desplazarse y
              leer. Busca en nombre, RUT, folio y correo a la vez. */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar empresa, RUT, folio o correo…"
              className="w-56 lg:w-64 h-7 bg-slate-50 border border-[#efe8dd] rounded-lg pl-8 pr-7 text-[11px] text-slate-900 outline-none focus:border-blue-500 placeholder:text-slate-400"
            />
            {busqueda && (
              <button onClick={() => setBusqueda('')} title="Limpiar"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500">
                <X size={12} />
              </button>
            )}
          </div>
          {/* CARGAR LA PLANILLA DEL MES */}
          <input ref={archivoRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={(e) => cargarPlanillaCobranza(e.target.files?.[0])} />
          <Button
            onClick={() => archivoRef.current?.click()}
            disabled={conciliando}
            title="Cargar la planilla de cobranza del mes: los que vienen en ella deben, el resto ya pagó"
            className="h-7 px-3 bg-slate-100 hover:bg-slate-200 border border-[#efe8dd] text-slate-600 text-[10px] font-black uppercase tracking-widest rounded-lg inline-flex items-center gap-1.5"
          >
            {conciliando ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Cargar planilla
          </Button>
        </div>
      </div>

      {/* Resultado de cruzar la planilla. No cambia nada por sí solo. */}
      {conciliacion && (
        <div className="mb-2 flex-shrink-0 bg-white border border-blue-500/30 rounded-xl px-4 py-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-700 flex items-center gap-1.5">
                <FileSpreadsheet size={12} /> {conciliacion.archivo}
              </p>
              <p className="text-[11px] text-slate-600 mt-1">
                <b>{conciliacion.deben.length}</b> de la planilla quedaron seleccionados y siguen debiendo.
                {conciliacion.aMarcarPagado.length > 0 && <>
                  {' '}Los otros <b className="text-emerald-700">{conciliacion.aMarcarPagado.length}</b> pendientes
                  {' '}se darían por pagados.
                </>}
              </p>
              {conciliacion.sinCobro.length > 0 && (
                <details className="mt-1.5">
                  <summary className="text-[10px] font-bold text-amber-700 cursor-pointer">
                    {conciliacion.sinCobro.length} de la planilla NO tienen cobro este mes — revísalos
                  </summary>
                  <ul className="mt-1 text-[10px] text-slate-500 space-y-0.5 max-h-28 overflow-y-auto">
                    {conciliacion.sinCobro.map(x => (
                      <li key={x.rut}>· {x.rut} {x.nombre && `— ${x.nombre}`}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {conciliacion.aMarcarPagado.length > 0 && (
                <Button
                  onClick={conciliarMes}
                  disabled={conciliando}
                  className="h-8 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest rounded-lg inline-flex items-center gap-1.5"
                >
                  {conciliando ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                  Marcar {conciliacion.aMarcarPagado.length} como pagados
                </Button>
              )}
              <button onClick={() => setConciliacion(null)} className="text-slate-400 hover:text-red-500"><X size={16} /></button>
            </div>
          </div>
        </div>
      )}

      {/* Acciones masivas */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0 gap-3 flex-wrap bg-white border border-[#efe8dd] rounded-xl px-4 py-2">
        <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest">
          <span className="text-slate-500">Seleccionados: <span className="text-blue-600">{selectedFolios.length}</span></span>
          <button onClick={seleccionarPendientes} className="text-orange-600 hover:text-orange-700 underline-offset-2 hover:underline">Seleccionar los que faltan</button>
          {selectedFolios.length > 0 && <button onClick={limpiarSeleccion} className="text-slate-400 hover:text-slate-600">Limpiar</button>}
          {/* Qué manda cada botón, a la vista: son dos correos distintos y el
              tooltip solo aparece si uno sospecha que hay algo que leer. */}
          <span className="text-slate-400 hidden lg:inline">
            · <span className="text-amber-700">Cobrar</span> = aviso de pago (sin factura)
            · <span className="text-emerald-700">Reenviar</span> = la factura con su PDF
          </span>
        </div>
        {/* LOS DOS BOTONES MANDAN CORREOS DISTINTOS y estaban nombrados casi
            igual («Recordatorio a seleccionados» / «Enviar seleccionados»), así
            que no se sabía cuál hacía qué. Ahora cada uno dice QUÉ manda:
              · Cobrar   → recordatorio de pago, al que debe (no lleva factura)
              · Reenviar → la MISMA factura otra vez, con su PDF adjunto */}
        <div className="flex items-center gap-2">
          <Button
            onClick={enviarRecordatoriosPago}
            disabled={isEnviandoRecordatorios || isReenviandoMasivo || reenviandoFolio !== null}
            title={selectedFolios.length
              ? `Manda un correo de COBRO ("recuerda pagar") a los ${selectedFolios.length} seleccionado(s). No adjunta la factura.`
              : 'Manda un correo de COBRO ("recuerda pagar") a TODOS los que tienen el cobro del mes pendiente. No adjunta la factura.'}
            className="h-9 px-5 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow-lg shadow-amber-600/20 inline-flex items-center gap-2"
          >
            {isEnviandoRecordatorios
              ? <><Loader2 size={14} className="animate-spin" />{progresoRecordatorio?.total ? ` ${progresoRecordatorio.actual}/${progresoRecordatorio.total}` : ' Enviando…'}</>
              : <><Mail size={14} /> {selectedFolios.length
                    ? `Cobrar a ${selectedFolios.length} seleccionado(s)`
                    : `Cobrar a los ${cuentaFiltro('deben')} que deben`}</>}
          </Button>
          <Button
            onClick={reenviarSeleccionados}
            disabled={selectedFolios.length === 0 || isReenviandoMasivo || reenviandoFolio !== null}
            title="Vuelve a mandar la MISMA factura (con su PDF adjunto) a los seleccionados. Útil si el correo falló o el cliente dice que no le llegó."
            className="h-9 px-5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow-lg shadow-emerald-600/20 inline-flex items-center gap-2"
          >
            {isReenviandoMasivo ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Reenviar factura ({selectedFolios.length})
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
                    {/* Factura emitida a la que nunca se le mandó el correo: no
                        es un envío fallido —no hubo intento— pero el cliente
                        igual se quedó sin su factura. */}
                    {c.estado === 'pendiente' && <span className="px-2 py-1 rounded-full bg-amber-500/10 text-amber-600 font-black text-[8px] uppercase border border-amber-500/20 inline-flex items-center gap-1"><AlertCircle size={9} /> Sin enviar</span>}
                    {!['enviado', 'fallido', 'omitido', 'pendiente'].includes(c.estado) && <span className="text-slate-400 text-[9px]">{c.estado}</span>}
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
