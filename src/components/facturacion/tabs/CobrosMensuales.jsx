import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Search, AlertTriangle, RefreshCw, Zap, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth.jsx';
import { toast } from '@/components/ui/use-toast';
import {
  getCobrosApi, getResumenCobrosApi, generarCobrosApi,
  cambiarEstadoCobroApi, editarMontoCobroApi,
  previsualizarFacturacionApi, facturarMasivoApi, progresoFacturacionApi, vincularFoliosApi
} from '@/services/cobrosService';

const clp = (n) => `$${Number(n || 0).toLocaleString('es-CL')}`;
const mesActual = () => new Date().toISOString().slice(0, 7); // YYYY-MM

// Desplaza un 'YYYY-MM' N meses. Se construye con día 1 y en UTC: con `new Date`
// local, un periodo como '2026-03' en zona GMT-3 caía en febrero.
const mesRelativo = (periodo, delta) => {
  const [a, m] = periodo.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};

// Etiqueta y color por estado del cobro. Un punto de color + texto normal: en una
// tabla de 100 filas, cien píldoras en mayúscula compiten entre sí y no dejan leer
// los montos, que es a lo que uno viene.
const estiloEstado = (c) => {
  // Anulada por nota de crédito: no se cobra y no cuenta como mora.
  if (c.estado === 'ANULADA')          return { label: 'Anulada',      punto: 'bg-slate-300',   texto: 'text-slate-400' };
  if (c.estado === 'POR_EMITIR')       return { label: 'Por emitir',   punto: 'bg-slate-400',   texto: 'text-slate-600' };
  if (c.estado === 'PAGADA')           return { label: 'Pagada',       punto: 'bg-emerald-500', texto: 'text-slate-600' };
  if (c.estado === 'PENDIENTE_RECIBO') return { label: 'Pend. recibo', punto: 'bg-sky-500',     texto: 'text-slate-600' };
  if (c.vencido)                       return { label: 'Vencido',      punto: 'bg-red-500',     texto: 'text-red-600 font-medium' };
  return { label: 'Pend. pago', punto: 'bg-amber-500', texto: 'text-slate-600' };
};

// Indicador del encabezado. `acento` tiñe solo la cifra, para que el color
// signifique algo (rojo = hay que actuar) en vez de decorar la tarjeta entera.
const Kpi = ({ label, value, sub, acento = 'text-slate-900', onClick, activo, title }) => {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      title={title}
      className={`text-left bg-white border rounded-lg px-3 py-2 transition-colors ${
        activo ? 'border-slate-300 ring-1 ring-slate-200' : 'border-[#efe8dd]'
      } ${onClick ? 'hover:border-slate-300 cursor-pointer' : ''}`}
    >
      <p className="text-[11px] text-slate-500 truncate">{label}</p>
      {/* Cifra y detalle en la misma línea: apilados gastaban una fila entera
          por tarjeta para un dato que se lee de un vistazo. */}
      <div className="flex items-baseline gap-1.5 flex-wrap">
        {/* Un cero es ausencia de dato, no un dato: en gris no compite con las
            cifras que sí importan. */}
        <span className={`text-lg font-semibold leading-tight tabular-nums ${
          Number(String(value).replace(/\D/g, '')) === 0 ? 'text-slate-300' : acento}`}>{value}</span>
        {sub && <span className="text-[11px] text-slate-400 tabular-nums truncate">{sub}</span>}
      </div>
    </Tag>
  );
};

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
  const [resumenMora, setResumenMora] = useState(null);   // { morosos, monto } del preview
  const [aceptaDesvio, setAceptaDesvio] = useState(false); // aprobó los montos fuera de lo pactado

  // Corta el sondeo de progreso si se desmonta el componente
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // RETOMA UNA EMISIÓN EN CURSO AL VOLVER A LA PANTALLA.
  //
  // El robot corre en el SERVIDOR, pero la barra de progreso vivía solo en el
  // estado local: bastaba cambiar de sección para que el componente se
  // desmontara y, al volver, `facturando` arrancaba en false. La emisión seguía
  // avanzando sin que nadie la viera, y no había forma de saber cuánto llevaba
  // ni cuándo terminó. Al montar se le pregunta al servidor si hay un lote
  // activo y, si lo hay, se reengancha el sondeo.
  useEffect(() => {
    if (!user?.sessionId) return;
    let cancelado = false;
    (async () => {
      try {
        const r = await progresoFacturacionApi(user.sessionId);
        const p = await r.json();
        if (!cancelado && p?.activo) {
          setProgreso(p);
          setFacturando(true);
          seguirProgreso(p.total || 0);
        }
      } catch { /* si falla, la pantalla queda como siempre */ }
    })();
    return () => { cancelado = true; };
    // Solo al montar: reengancharse en cada cambio dispararía sondeos duplicados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.sessionId]);

  const cargar = useCallback(async () => {
    if (!user?.sessionId) return;
    setLoading(true);
    try {
      // Con el filtro "Vencidos" se pide la mora completa, sin acotar al mes.
      const [rc, rr] = await Promise.all([
        getCobrosApi(user.sessionId, filtro === 'VENCIDOS' ? { vencidos: true } : { periodo }),
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
  }, [user?.sessionId, periodo, filtro]);

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

  // ¿Esta fila se puede emitir? Un solo criterio para toda la pantalla: la
  // selección por defecto, el "marcar todas", el contador y el lote que se manda
  // al robot. Cuando cada uno lo calculaba por su lado, bastaba con olvidar una
  // condición en uno para que se emitiera algo que no correspondía.
  const esEmitible = (it) => Boolean(it.rut) && Number(it.monto) > 0 && !(it.moraCobros > 0);

  // Ya tiene factura de este mes. Se PUEDE emitir otra (a veces corresponde: una
  // por un servicio puntual y otra por el honorario del ciclo), pero nunca por
  // defecto — hay que marcarla a mano.
  const yaFacturadoEsteMes = (it) => Boolean(it.folioDelMes);

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
      // `montoPactado` guarda el precio con el que llegó el cobro. Sin ese ancla no
      // hay forma de saber que un monto se editó: si el usuario escribe 500.000
      // donde decía 50.000, el sistema solo ve 500.000 y lo emite tan campante.
      // Ya pasó (PARTY CARS, junio 2026: $50.000 pactados, $500.000 facturados).
      const norm = (arr, p) => (arr || []).map((it, i) => ({
        ...it, _key: it.cobroId || `${p}${i}`,
        monto: Number(it.monto) || 0,
        montoPactado: Number(it.monto) || 0,
      }));
      const todas = [...norm(d.facturar, 'f'), ...norm(d.omitidas, 'o')];
      setLista(todas);
      // Se marcan las que se pueden emitir. Quedan fuera por regla —no por
      // olvido— los deudores y quienes ya tienen factura de este mes: ambos se
      // ven en la lista, y la segunda factura se marca a mano si corresponde.
      setSeleccion(new Set(
        todas.filter(it => esEmitible(it) && !yaFacturadoEsteMes(it)).map(it => it._key)
      ));
      setResumenMora({ morosos: d.morosos || 0, monto: d.montoMoroso || 0 });
      setBuscarModal('');
      setOrden({ campo: 'razonSocial', dir: 'asc' });
      setConfirmando(false);
      setAceptaDesvio(false);
      setShowConfirm(true);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo previsualizar la facturación.' });
    } finally {
      setPreparando(false);
    }
  };

  // Motivo por el que una fila NO se factura (null = sí se factura).
  //
  // La REGLA DEL DESPACHO: al que arrastra una factura vencida no se le emite otra.
  // Seguir facturándole agranda una deuda que ya no se está pagando y ensucia la
  // cobranza. Por eso la mora es un impedimento como cualquier otro y el checkbox
  // queda bloqueado: si hiciera falta emitirle igual, primero se le registra el
  // pago (o se marca la factura vencida como pagada) y deja de estar en mora.
  const motivoNoEmitible = (it) =>
    !it.rut ? 'Sin RUT'
    : Number(it.monto) <= 0 ? 'Monto inválido'
    : it.moraCobros > 0 ? `Debe ${clp(it.moraMonto)}`
    : null;

  // ¿El monto a emitir se aparta de lo pactado? Devuelve el % de diferencia, o
  // null si está dentro de lo normal.
  //
  // Un ajuste chico es rutina (un mes con trabajo extra). Un salto grande suele
  // ser un dedazo: PARTY CARS se facturó por $500.000 con $50.000 pactados —un
  // cero de más— y nadie lo vio hasta que estaba pagada. No se bloquea (a veces
  // el cambio es legítimo), pero hay que verlo y confirmarlo.
  const TOLERANCIA = 20; // %
  const desvio = (it) => {
    const pactado = Number(it.montoPactado) || 0;
    const actual = Number(it.monto) || 0;
    if (pactado <= 0 || actual === pactado) return null;
    const pct = ((actual - pactado) / pactado) * 100;
    return Math.abs(pct) >= TOLERANCIA ? Math.round(pct) : null;
  };

  const editarMontoLista = (k, valor) => {
    const monto = Number(String(valor).replace(/[^\d]/g, '')) || 0;
    setLista(prev => prev.map(it => it._key === k ? { ...it, monto } : it));
    // Cambiar un monto invalida la aprobación anterior: se aprobó otra cifra.
    setAceptaDesvio(false);
  };
  const toggleSel = (k) => setSeleccion(prev => {
    const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n;
  });
  // Marca / desmarca las emitibles visibles de una sola vez. Las que ya tienen
  // factura del mes quedan fuera del atajo: reemitir es siempre uno a uno.
  const toggleTodas = (visibles) => {
    const emitiblesKeys = visibles
      .filter(it => esEmitible(it) && !yaFacturadoEsteMes(it)).map(it => it._key);
    const todasMarcadas = emitiblesKeys.length > 0 && emitiblesKeys.every(k => seleccion.has(k));
    setSeleccion(prev => {
      const n = new Set(prev);
      if (todasMarcadas) emitiblesKeys.forEach(k => n.delete(k));
      else emitiblesKeys.forEach(k => n.add(k));
      return n;
    });
  };
  const ordenarPor = (campo) => setOrden(prev => ({ campo, dir: prev.campo === campo && prev.dir === 'asc' ? 'desc' : 'asc' }));

  // SONDEA EL PROGRESO DEL ROBOT HASTA QUE TERMINA.
  //
  // Vive aparte de `facturarMasivo` porque se usa desde dos lados: al lanzar el
  // lote y al volver a la pantalla con una emisión ya en curso. Estaba embebido
  // en el lanzamiento, así que la única forma de ver el avance era no moverse
  // de la pestaña.
  //
  // `enviadas` sirve para el resumen final. Al reengancharse no se conoce
  // (la pantalla no lanzó el lote), y se usa el total que reporta el robot.
  const seguirProgreso = (enviadas) => {
    if (pollRef.current) clearInterval(pollRef.current);
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
      const total = enviadas || p?.total || (exitos + errores);

      // El robot corta el lote cuando el SII deja de aceptar el ingreso; hay que
      // decirlo, si no parece que "terminó" con la mitad de las facturas.
      if (p?.detenidoPorSii) {
        toast({
          variant: 'destructive',
          title: '🛑 El SII cortó la sesión',
          description: p.motivoDetencion || 'Se detuvo la emisión. Las facturas ya emitidas quedaron registradas; retoma con las que faltan.',
        });
      }

      setResultado({
        enviadas: total, exitos, errores,
        noProcesadas: Math.max(0, total - exitos - errores),
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
  };

  // Emite el lote con las empresas SELECCIONADAS, y sigue el progreso.
  // Se llama solo tras la confirmación final (setConfirmando).
  const facturarMasivo = async () => {
    const finales = lista
      .filter(it => esEmitible(it) && seleccion.has(it._key))
      .map(({ cobroId, empresaId, rut, razonSocial, plan, monto, correo, folioDelMes }) =>
        ({ cobroId, empresaId, rut, razonSocial, plan, monto: Number(monto), correo,
           // Marcarla equivale a decir «sí, emítele una segunda de este mes»: el
           // robot descarta por defecto a quien ya tiene factura del período.
           reemitir: Boolean(folioDelMes) }));
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

      // El seguimiento vive en `seguirProgreso`, que también se usa al volver a
      // la pantalla con un lote ya corriendo.
      seguirProgreso(enviadas);
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
    { id: 'ANULADA', label: 'Anuladas' },
  ];

  // Lo que realmente se emitiría en la facturación masiva.
  //
  // El conteo (`n`) viene del backend, que es el único que sabe qué clientes están
  // en mora —eso se calcula sobre TODOS los períodos, y esta pantalla solo tiene
  // cargado el mes elegido—. Calculado acá, el botón prometía facturas que después
  // el servidor no emitía.
  //
  // `sinPrecio` sí sale de la lista local: son los del mes sin plan ni precio
  // negociado. No es un detalle menor, es plata que no se cobra.
  const porEmitir = useMemo(() => {
    const todos = cobros.filter(c => c.estado === 'POR_EMITIR');
    return {
      n: resumen?.facturables ?? todos.filter(c => c.montoEsperado > 0).length,
      sinPrecio: todos.filter(c => !(c.montoEsperado > 0)),
    };
  }, [cobros, resumen?.facturables]);

  // Lista visible en el modal: filtrada por búsqueda y ordenada por la columna elegida
  const listaVisible = useMemo(() => {
    const t = buscarModal.trim().toLowerCase();
    const arr = lista.filter(it =>
      !t || String(it.razonSocial || '').toLowerCase().includes(t) || String(it.rut || '').toLowerCase().includes(t));
    const { campo, dir } = orden;
    return [...arr].sort((a, b) => {
      // Lo que requiere una decisión va primero: los deudores y los que no se
      // pueden emitir. Ordenados solo por nombre quedaban repartidos entre 100
      // filas y había que ir a buscarlos, aunque el aviso dijera que existían.
      const pesoA = a.moraCobros > 0 ? 0 : (!a.rut || Number(a.monto) <= 0 ? 1 : 2);
      const pesoB = b.moraCobros > 0 ? 0 : (!b.rut || Number(b.monto) <= 0 ? 1 : 2);
      if (pesoA !== pesoB) return pesoA - pesoB;

      if (campo === 'monto' || campo === 'moraMonto') {
        const va = Number(a[campo]) || 0, vb = Number(b[campo]) || 0;
        return dir === 'asc' ? va - vb : vb - va;
      }
      const va = String(a[campo] || '').toLowerCase(), vb = String(b[campo] || '').toLowerCase();
      return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }, [lista, buscarModal, orden]);

  // Resumen de selección (para las cifras del modal)
  const seleccionadas = lista.filter(it => esEmitible(it) && seleccion.has(it._key));
  // Montos que se apartan de lo pactado y correos que faltan: las dos cosas que
  // hay que mirar ANTES de emitir, porque después la factura ya está en el SII.
  const desviadas = seleccionadas.filter(it => desvio(it) !== null);
  const sinCorreo = seleccionadas.filter(it => !it.correo);
  // Clientes a los que se les emitirá una segunda factura del mismo mes
  const segundaFactura = seleccionadas.filter(yaFacturadoEsteMes);
  const totalSel = seleccionadas.reduce((s, it) => s + Number(it.monto), 0);
  const nOmitidas = lista.length - seleccionadas.length;
  // ¿Están todas las emitibles visibles marcadas? (para el check "seleccionar todas")
  const emitiblesVisibles = listaVisible.filter(it => esEmitible(it) && !yaFacturadoEsteMes(it));
  const todasVisiblesMarcadas = emitiblesVisibles.length > 0 && emitiblesVisibles.every(it => seleccion.has(it._key));

  return (
    // Ocupa el alto del panel: la tabla se estira hasta el pie y hace scroll ella
    // misma cuando hay más filas de las que caben. Dejarla con alto natural sacaba
    // el pie fuera de la ventana con 100 filas; con `max-h` fijo en vh se cortaba
    // a media fila. El vacío con pocas filas se resuelve en la tabla, no acá.
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-3 h-full min-h-0">

      {/* Sin título propio: el contenedor (Facturacion.jsx) ya rotula la pestaña
          como «Cobro del Mes», y repetirlo acá gastaba dos líneas para decir lo
          mismo. El aviso de cuándo toca facturar se movió junto al selector de mes.

          Cifras del mes: la de vencidos filtra al hacer clic, que es lo que uno
          quiere hacer apenas la ve; antes había un banner que explicaba dónde
          estaba el filtro en vez de llevarte a él. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-shrink-0">
        <Kpi label="Por emitir" value={resumen?.porEmitir ?? 0}
             sub={clp(resumen?.montoPorEmitir)}
             onClick={() => setFiltro('POR_EMITIR')} activo={filtro === 'POR_EMITIR'} />
        <Kpi label="Pendiente de pago" value={resumen?.pendientePago ?? 0}
             onClick={() => setFiltro('PENDIENTE_PAGO')} activo={filtro === 'PENDIENTE_PAGO'} />
        {/* La mora no se acota al mes elegido: una factura vencida lo está venga del
            período que venga. Acotada al mes, esta cifra marcaba 0 hasta el día 5
            del mes siguiente y escondía lo que se arrastra de meses anteriores. */}
        <Kpi label="Vencidos · todos los meses" value={resumen?.vencidos ?? 0}
             sub={resumen?.vencidos > 0 ? clp(resumen.montoVencido) : 'al día'}
             acento={resumen?.vencidos > 0 ? 'text-red-600' : 'text-slate-900'}
             title={resumen?.vencidoMasAntiguo
               ? `La más antigua venció el ${new Date(resumen.vencidoMasAntiguo).toLocaleDateString('es-CL')}`
               : undefined}
             onClick={() => setFiltro('VENCIDOS')} activo={filtro === 'VENCIDOS'} />
        <Kpi label="Total del mes" value={clp(resumen?.montoEsperado)}
             sub={`${resumen?.total ?? 0} empresas`} />
      </div>

      {/* Cobros en $0: no se emiten y no entran en ningún contador, así que sin
          este aviso se pierden de vista. Un monto en $0 puede ser un dato que
          falta (hay que cargarlo) o un cliente que deliberadamente no se factura
          —TCG HUB se cobra a través de la EIRL de su dueña—, y la pantalla no
          puede distinguirlos: por eso el texto invita a revisar, no acusa. */}
      {porEmitir.sinPrecio.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-slate-600 flex-shrink-0">
          <AlertTriangle size={14} className="text-amber-600 shrink-0" />
          <span className="truncate" title={porEmitir.sinPrecio.map(c => c.razonSocial).join('\n')}>
            <span className="font-medium text-slate-900">{porEmitir.sinPrecio.length} en $0</span>
            {' '}{porEmitir.sinPrecio.length === 1 ? 'no se factura' : 'no se facturan'} — revisa si falta cargar el precio.
          </span>
          <button onClick={() => { setFiltro('POR_EMITIR'); setBusqueda(''); }}
            className="text-slate-500 hover:text-slate-900 underline decoration-dotted underline-offset-2 shrink-0">
            ver
          </button>
        </div>
      )}

      {/* Barra de control */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-2.5 flex-shrink-0">
        {/* Navegación por mes con flechas. El `<input type="month">` abría el
            calendario del sistema —una rejilla gris de 12 meses que no combina
            con nada— para algo que casi siempre es «el mes anterior». */}
        <div className="flex items-center bg-white border border-[#efe8dd] rounded-lg overflow-hidden flex-shrink-0">
          <button onClick={() => setPeriodo(mesRelativo(periodo, -1))}
            aria-label="Mes anterior"
            className="px-2 py-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-50 transition-colors">
            <ChevronLeft size={14} />
          </button>
          <span className="px-2 text-xs text-slate-700 whitespace-nowrap min-w-[104px] text-center">
            {new Date(`${periodo}-02`).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={() => setPeriodo(mesRelativo(periodo, 1))}
            disabled={periodo >= mesActual()}
            aria-label="Mes siguiente"
            className="px-2 py-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-50 transition-colors disabled:opacity-30 disabled:hover:bg-transparent">
            <ChevronRight size={14} />
          </button>
        </div>
        {periodo !== mesActual() && (
          <button onClick={() => setPeriodo(mesActual())}
            className="text-xs text-slate-500 hover:text-slate-900 underline decoration-dotted underline-offset-2 flex-shrink-0">
            Mes actual
          </button>
        )}
        <div className="flex flex-wrap gap-0.5 bg-slate-100/70 p-0.5 rounded-lg w-fit">
          {FILTROS.map(f => (
            <button key={f.id} onClick={() => setFiltro(f.id)}
              className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                filtro === f.id
                  ? 'bg-white text-slate-900 shadow-sm font-medium'
                  : 'text-slate-500 hover:text-slate-800'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            placeholder="Buscar empresa..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-[#efe8dd] rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400"
          />
        </div>
        <button onClick={generar} disabled={generando || facturando}
          title="Sincroniza con el CRM: genera el cobro de cada cliente activo y depura los que ya no lo son"
          className="flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 border border-[#efe8dd] text-slate-600 px-3 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-60">
          {generando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Sincronizar con CRM
        </button>
        {/* El botón solo aparece cuando hay algo que emitir. Deshabilitado y gris
            no explicaba nada: en un mes ya facturado se veía apagado sin motivo. */}
        {porEmitir.n > 0 ? (
          <button onClick={abrirPreview} disabled={facturando || generando || preparando}
            className="flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0">
            {(facturando || preparando) ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
            {facturando ? 'Facturando…' : preparando ? 'Preparando…' : `Facturar ${porEmitir.n}`}
          </button>
        ) : (
          <span className="text-xs text-slate-400 px-2 whitespace-nowrap flex-shrink-0">
            {(resumen?.total ?? 0) === 0 ? 'Sin cobros este mes' : 'Todo facturado'}
          </span>
        )}
      </div>

      {/* Progreso del robot de facturación masiva */}
      {facturando && (
        <div className="flex flex-col gap-2 bg-white border border-[#efe8dd] rounded-xl px-4 py-3 flex-shrink-0">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-700 flex items-center gap-2">
              <Loader2 size={13} className="animate-spin text-slate-400" /> Emitiendo facturas en el SII…
            </span>
            <span className="text-slate-500 tabular-nums">
              {progreso ? `${progreso.actual || 0} / ${progreso.total || porEmitir.n}` : 'Iniciando…'}
              {progreso?.rutActual ? ` · RUT ${progreso.rutActual}` : ''}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-slate-800 transition-all duration-500"
              style={{ width: progreso?.total ? `${Math.round((progreso.actual / progreso.total) * 100)}%` : '8%' }} />
          </div>
          {progreso && (progreso.exitos > 0 || progreso.errores > 0) && (
            <p className="text-[11px] text-slate-500">
              {progreso.exitos} emitidas{progreso.errores > 0 && <span className="text-red-600"> · {progreso.errores} con error</span>}
            </p>
          )}
          <p className="text-[11px] text-slate-400">
            El proceso corre en el servidor: puedes cambiar de sección y al volver acá verás el avance.
          </p>
        </div>
      )}

      {/* Tabla — ocupa el alto disponible y hace scroll cuando sobran filas.
          El borde envuelve solo las filas reales (va en el hijo, no acá): con 8
          de 93 filas, un recuadro a pantalla completa dejaba media hoja en blanco
          enmarcada como si faltaran datos por cargar. */}
      <div className="flex-1 min-h-0 flex flex-col">
        {loading ? (
          <div className="flex items-center justify-center py-16 rounded-xl border border-[#efe8dd] bg-white">
            <Loader2 className="h-5 w-5 text-slate-400 animate-spin" />
          </div>
        ) : (
          <div className="min-h-0 overflow-auto rounded-xl border border-[#efe8dd] bg-white">
            <table className="w-full min-w-[720px] text-left border-collapse">
              <thead className="bg-slate-50/80 sticky top-0 z-10 backdrop-blur">
                <tr className="border-b border-[#efe8dd] text-[11px] text-slate-500">
                  <th className="px-4 py-2 font-medium">Empresa</th>
                  <th className="px-4 py-2 font-medium">Plan</th>
                  <th className="px-4 py-2 font-medium text-right">Monto</th>
                  <th className="px-4 py-2 font-medium text-right">Folio</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                  <th className="pl-4 pr-2 py-2 font-medium text-right w-[1%]"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(c => {
                  const st = estiloEstado(c);
                  return (
                    <tr key={c.id} className="border-b border-[#f5f0e8] last:border-0 hover:bg-slate-50/60 transition-colors group">
                      <td className="px-4 py-2">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="text-[13px] text-slate-800 truncate max-w-[260px]" title={c.razonSocial}>
                            {c.razonSocial}
                          </span>
                          {/* Cliente dado de baja que todavía debe: se le cobra igual,
                              pero ya no es cartera y conviene verlo al llamar. */}
                          {c.suspendida && (
                            <span className="text-[10px] text-slate-500 bg-slate-100 border border-[#efe8dd] px-1.5 py-0.5 rounded shrink-0"
                              title="Cliente suspendido — la deuda sigue vigente">
                              suspendida
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-[11px] text-slate-500">{c.plan}</span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {editando === c.id ? (
                          <input
                            autoFocus type="text" value={montoTmp}
                            onChange={(e) => setMontoTmp(e.target.value)}
                            onBlur={() => guardarMonto(c)}
                            onKeyDown={(e) => { if (e.key === 'Enter') guardarMonto(c); if (e.key === 'Escape') setEditando(null); }}
                            className="w-28 text-right bg-white border border-slate-400 rounded-md px-2 py-0.5 text-[13px] text-slate-900 tabular-nums focus:outline-none"
                          />
                        ) : (
                          <button
                            onClick={() => { setEditando(c.id); setMontoTmp(String(c.montoEsperado)); }}
                            title="Clic para corregir el monto"
                            className={`text-[13px] tabular-nums hover:underline decoration-dotted underline-offset-2 ${c.montoEsperado > 0 ? 'text-slate-800' : 'text-amber-600'}`}
                          >
                            {c.montoEsperado > 0 ? clp(c.montoEsperado) : 'Sin precio'}
                          </button>
                        )}
                        {c.montoFacturado !== null && !c.montoCoincide && c.estado !== 'POR_EMITIR' && (
                          <p className="text-[11px] text-red-600 tabular-nums">Facturado {clp(c.montoFacturado)}</p>
                        )}
                        {c.montoAnulado > 0 && (
                          <p className="text-[11px] text-slate-400 tabular-nums">
                            NC −{clp(c.montoAnulado)}
                            {c.estado !== 'ANULADA' && <> · queda {clp(c.montoCobrable)}</>}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className="text-[11px] text-slate-400 tabular-nums">{c.folio || '—'}</span>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] ${st.texto}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${st.punto}`} />
                          {st.label}
                        </span>
                      </td>
                      <td className="pl-4 pr-2 py-2 whitespace-nowrap">
                        {/* Las acciones aparecen al pasar el mouse: en 100 filas, 100
                            botones siempre visibles hacen ruido y esconden los datos.
                            Sin `title`: el tooltip nativo del navegador es un cuadro
                            negro que se dibuja sobre la fila siguiente y tapa datos.
                            La etiqueta del botón ya dice lo que hace. */}
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          {/* Con fondo y borde propios: en texto plano se leían
                              como parte de la fila y no como algo clicable. */}
                          {c.estado !== 'PAGADA' && c.estado !== 'POR_EMITIR' && c.estado !== 'ANULADA' && (
                            <button onClick={() => marcar(c, 'PAGADA')}
                              className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 px-2.5 py-1 rounded-md transition-colors">
                              Marcar pagada
                            </button>
                          )}
                          {c.estado === 'PENDIENTE_PAGO' && (
                            <button onClick={() => marcar(c, 'PENDIENTE_RECIBO')}
                              className="text-[11px] font-medium text-sky-700 bg-sky-50 border border-sky-200 hover:bg-sky-100 hover:border-sky-300 px-2.5 py-1 rounded-md transition-colors">
                              Recibo
                            </button>
                          )}
                          {c.estado === 'PAGADA' && (
                            <button onClick={() => marcar(c, 'PENDIENTE_PAGO')}
                              className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:text-slate-700 px-2.5 py-1 rounded-md transition-colors">
                              Revertir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtrados.length === 0 && (
                  <tr><td colSpan="6" className="p-10 text-center text-slate-400 text-xs">
                    No hay cobros que coincidan con el filtro.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-400 flex-shrink-0">
        {filtrados.length} de {cobros.length} cobros · Refleja los clientes activos del CRM
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
              <div className="flex items-start justify-between px-6 py-4 border-b border-[#efe8dd] flex-shrink-0">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Revisar facturación masiva</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Revisa los montos y confirma. No se factura a quien tiene deuda vencida.</p>
                </div>
                <button onClick={() => setShowConfirm(false)} className="text-slate-400 hover:text-slate-700 -mr-1"><X size={18} /></button>
              </div>

              {/* Resumen (seleccionadas / total / omitidas) + búsqueda */}
              <div className="px-6 py-3 border-b border-[#efe8dd] flex flex-col lg:flex-row lg:items-center gap-4 flex-shrink-0">
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-[11px] text-slate-500">Se emiten</p>
                    <p className="text-lg font-semibold text-slate-900 leading-tight tabular-nums">{seleccionadas.length}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">Total neto</p>
                    <p className="text-lg font-semibold text-slate-900 leading-tight tabular-nums">{clp(totalSel)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">Quedan fuera</p>
                    <p className={`text-lg font-semibold leading-tight tabular-nums ${nOmitidas > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{nOmitidas}</p>
                  </div>
                </div>
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input placeholder="Buscar por empresa o RUT..." value={buscarModal} onChange={(e) => setBuscarModal(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-white border border-[#efe8dd] rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400" />
                </div>
              </div>

              {/* Deudores: quedan fuera de la emisión por regla, pero a la vista para
                  que se sepa a quién hay que salir a cobrar. */}
              {resumenMora?.morosos > 0 && (
                <div className="flex items-start gap-2.5 px-6 py-2.5 border-b border-[#efe8dd] bg-red-50/50 flex-shrink-0">
                  <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-600 leading-relaxed">
                    <span className="font-medium text-slate-900">{resumenMora.morosos} cliente(s) con deuda vencida</span> por{' '}
                    <span className="font-medium text-slate-900 tabular-nums">{clp(resumenMora.monto)}</span> no se facturan.
                    Para emitirles, primero registra el pago de su factura vencida.
                  </p>
                </div>
              )}

              {/* Tabla editable con selección */}
              <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                <table className="w-full min-w-[820px] text-left border-collapse">
                  <thead className="bg-slate-50/80 sticky top-0 z-10 backdrop-blur">
                    <tr className="border-b border-[#efe8dd] text-[11px] text-slate-500">
                      <th className="px-3 py-2 w-8">
                        <input type="checkbox" checked={todasVisiblesMarcadas} onChange={() => toggleTodas(listaVisible)}
                          title="Seleccionar / quitar todas las que están al día" className="w-3.5 h-3.5 accent-slate-800 cursor-pointer align-middle" />
                      </th>
                      <th className="px-3 py-2 font-medium">
                        <button onClick={() => ordenarPor('razonSocial')} className="inline-flex items-center gap-1 hover:text-slate-800">Empresa {orden.campo === 'razonSocial' && <span className="text-[8px]">{orden.dir === 'asc' ? '▲' : '▼'}</span>}</button>
                      </th>
                      <th className="px-3 py-2 font-medium">
                        <button onClick={() => ordenarPor('rut')} className="inline-flex items-center gap-1 hover:text-slate-800">RUT {orden.campo === 'rut' && <span className="text-[8px]">{orden.dir === 'asc' ? '▲' : '▼'}</span>}</button>
                      </th>
                      <th className="px-3 py-2 font-medium">Plan</th>
                      <th className="px-3 py-2 font-medium text-right">
                        <button onClick={() => ordenarPor('monto')} className="inline-flex items-center gap-1 hover:text-slate-800">Monto neto {orden.campo === 'monto' && <span className="text-[8px]">{orden.dir === 'asc' ? '▲' : '▼'}</span>}</button>
                      </th>
                      <th className="px-3 py-2 font-medium">Correo</th>
                      <th className="px-3 py-2 font-medium text-right">
                        <button onClick={() => ordenarPor('moraMonto')} className="inline-flex items-center gap-1 hover:text-slate-800">Deuda vencida {orden.campo === 'moraMonto' && <span className="text-[8px]">{orden.dir === 'asc' ? '▲' : '▼'}</span>}</button>
                      </th>
                      <th className="px-3 py-2 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listaVisible.map(it => {
                      const motivo = motivoNoEmitible(it);
                      const marcada = seleccion.has(it._key);
                      const seEmite = !motivo && marcada;
                      return (
                        <tr key={it._key} className={`border-b border-[#f5f0e8] last:border-0 hover:bg-slate-50/60 transition-colors ${seEmite ? '' : 'bg-slate-50/40'}`}>
                          <td className="px-3 py-2">
                            <input type="checkbox" checked={marcada && !motivo} disabled={Boolean(motivo)}
                              onChange={() => toggleSel(it._key)}
                              title={motivo || 'Incluir en la emisión'}
                              className="w-3.5 h-3.5 accent-slate-800 cursor-pointer align-middle disabled:cursor-not-allowed disabled:opacity-40" />
                          </td>
                          <td className="px-3 py-2"><span className={`text-[13px] truncate block max-w-[220px] ${seEmite ? 'text-slate-800' : 'text-slate-500'}`} title={it.razonSocial}>{it.razonSocial}</span></td>
                          <td className="px-3 py-2"><span className="text-[11px] text-slate-500 tabular-nums">{it.rut || '—'}</span></td>
                          <td className="px-3 py-2"><span className="text-[11px] text-slate-500">{it.plan}</span></td>
                          <td className="px-3 py-2 text-right">
                            {(() => {
                              const d = desvio(it);
                              return (
                                <>
                                  <input type="text" inputMode="numeric" disabled={!it.rut}
                                    value={it.monto ? Number(it.monto).toLocaleString('es-CL') : ''}
                                    onChange={(e) => editarMontoLista(it._key, e.target.value)} placeholder="0"
                                    title={d !== null ? `Pactado ${clp(it.montoPactado)}` : ''}
                                    className={`w-24 text-right bg-white border rounded-md px-2 py-0.5 text-[13px] tabular-nums focus:outline-none focus:border-slate-400 disabled:opacity-40 ${
                                      Number(it.monto) <= 0 ? 'border-amber-400 text-amber-600'
                                      : d !== null ? 'border-red-400 text-red-600' : 'border-[#efe8dd] text-slate-800'}`} />
                                  {d !== null && (
                                    <span className="block text-[11px] text-red-600 tabular-nums">
                                      {d > 0 ? '+' : ''}{d}% · pactado {clp(it.montoPactado)}
                                    </span>
                                  )}
                                </>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-2">
                            {it.correo
                              ? <span className="text-[11px] text-slate-400 truncate block max-w-[150px]" title={it.correo}>{it.correo}</span>
                              : <span className="text-[11px] text-amber-600" title="Se emite la factura pero no se enviará correo">Sin correo</span>}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {it.moraCobros > 0 ? (
                              <span title={it.moraDesde ? `La más antigua venció el ${new Date(it.moraDesde).toLocaleDateString('es-CL')}` : ''}>
                                <span className="text-[13px] text-red-600 tabular-nums">{clp(it.moraMonto)}</span>
                                <span className="block text-[11px] text-red-500/70">{it.moraCobros} factura(s)</span>
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {motivo
                              ? <span className="inline-flex items-center gap-1.5 text-[11px] text-red-600" title={it.moraCobros > 0 ? 'No se factura mientras tenga facturas vencidas sin pagar' : motivo}>
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                  {it.moraCobros > 0 ? 'No se factura' : motivo}
                                </span>
                              : marcada
                                ? <span className={`inline-flex items-center gap-1.5 text-[11px] ${it.folioDelMes ? 'text-amber-700' : 'text-slate-600'}`}
                                    title={it.folioDelMes ? `Se le emitirá una SEGUNDA factura de agosto (ya tiene la ${it.folioDelMes})` : ''}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${it.folioDelMes ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                    {it.folioDelMes ? '2ª factura' : 'Se emite'}
                                  </span>
                                : it.folioDelMes
                                  ? <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500" title="Ya tiene factura de este mes. Márcala solo si corresponde emitirle otra.">
                                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                      Ya facturada · {it.folioDelMes}
                                    </span>
                                  : <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400"><span className="w-1.5 h-1.5 rounded-full bg-slate-300" />Excluida</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {listaVisible.length === 0 && (
                      <tr><td colSpan="8" className="p-8 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">
                        No hay empresas que coincidan con la búsqueda.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pie: acciones — con paso de confirmación final */}
              {!confirmando ? (
                <div className="flex items-center justify-end gap-2 px-6 py-3.5 border-t border-[#efe8dd] bg-slate-50/60 flex-shrink-0">
                  <button onClick={() => setShowConfirm(false)}
                    className="px-3.5 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors">
                    Cancelar
                  </button>
                  <button onClick={() => setConfirmando(true)} disabled={seleccionadas.length === 0}
                    className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    <Zap size={13} /> Emitir {seleccionadas.length} factura(s)
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3 px-6 py-3.5 border-t border-red-200 bg-red-50/60 flex-shrink-0">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 flex items-start gap-2.5">
                      <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-slate-700 leading-relaxed">
                        Vas a emitir <span className="font-medium text-slate-900">{seleccionadas.length} factura(s)</span> por{' '}
                        <span className="font-medium text-slate-900 tabular-nums">{clp(totalSel)}</span> de forma definitiva en el SII,
                        y se enviará el correo a cada cliente. No se puede deshacer.
                        {segundaFactura.length > 0 && (
                          <span className="block mt-1 text-amber-700">
                            {segundaFactura.length} recibirá una <b>segunda factura de este mes</b>:{' '}
                            {segundaFactura.map(s => `${s.razonSocial} (ya tiene la ${s.folioDelMes})`).join(', ')}.
                          </span>
                        )}
                        {sinCorreo.length > 0 && (
                          <span className="block mt-1 text-slate-500">
                            {sinCorreo.length} sin correo: se emite la factura pero no le llega al cliente
                            ({sinCorreo.slice(0, 3).map(c => c.razonSocial).join(', ')}{sinCorreo.length > 3 ? '…' : ''}).
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => setConfirmando(false)}
                        className="px-3.5 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-800 hover:bg-white transition-colors">
                        Volver
                      </button>
                      <button onClick={facturarMasivo} disabled={desviadas.length > 0 && !aceptaDesvio}
                        className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                        <Zap size={13} /> Sí, emitir
                      </button>
                    </div>
                  </div>

                  {/* Montos fuera de lo pactado: hay que aprobarlos a mano. Un cero
                      de más pasa desapercibido en una lista de 89 y ya emitido no
                      se puede deshacer, solo anular con nota de crédito. */}
                  {desviadas.length > 0 && (
                    <label className="flex items-start gap-2.5 bg-white border border-red-300 rounded-lg px-3 py-2 cursor-pointer">
                      <input type="checkbox" checked={aceptaDesvio} onChange={(e) => setAceptaDesvio(e.target.checked)}
                        className="w-3.5 h-3.5 accent-red-600 cursor-pointer mt-0.5 shrink-0" />
                      <span className="text-xs text-slate-700 leading-relaxed">
                        Confirmo que <span className="font-medium text-slate-900">{desviadas.length} monto(s)</span> se
                        apartan de lo pactado y son correctos:{' '}
                        {desviadas.map(d => (
                          <span key={d._key} className="whitespace-nowrap">
                            {d.razonSocial} <span className="tabular-nums">({clp(d.montoPactado)} → {clp(d.monto)})</span>
                          </span>
                        )).reduce((a, b) => [a, ', ', b])}.
                      </span>
                    </label>
                  )}
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
                <h3 className="text-base font-semibold text-slate-900">Resumen de facturación</h3>
                <button onClick={() => setResultado(null)} className="text-slate-400 hover:text-slate-700 -mr-1"><X size={18} /></button>
              </div>

              <div className="px-6 py-4 flex items-center gap-8 flex-shrink-0 border-b border-[#efe8dd]">
                <div>
                  <p className="text-[11px] text-slate-500">Emitidas</p>
                  <p className="text-2xl font-semibold text-slate-900 tabular-nums leading-tight">{resultado.exitos}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500">Con error</p>
                  <p className={`text-2xl font-semibold tabular-nums leading-tight ${resultado.errores > 0 ? 'text-red-600' : 'text-slate-900'}`}>{resultado.errores}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500">No procesadas</p>
                  <p className="text-2xl font-semibold text-slate-500 tabular-nums leading-tight">{resultado.noProcesadas}</p>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-auto custom-scrollbar px-6 py-3 space-y-4">
                {resultado.detalle.filter(r => r.estado === 'error').length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-900 mb-2">Empresas que fallaron</p>
                    <div className="flex flex-col divide-y divide-[#f5f0e8] border border-[#efe8dd] rounded-lg overflow-hidden">
                      {resultado.detalle.filter(r => r.estado === 'error').map((r, i) => (
                        <div key={`e${i}`} className="flex items-start justify-between gap-3 px-3 py-2">
                          <span className="text-xs text-slate-700 truncate">{r.razonSocial || r.nombre || r.rut}</span>
                          <span className="text-[11px] text-red-600 text-right max-w-[55%]">{r.error || 'Error desconocido'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {resultado.detalle.filter(r => r.estado === 'exito').length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-900 mb-2">Emitidas correctamente</p>
                    <div className="flex flex-col divide-y divide-[#f5f0e8] border border-[#efe8dd] rounded-lg overflow-hidden">
                      {resultado.detalle.filter(r => r.estado === 'exito').map((r, i) => (
                        <div key={`s${i}`} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="text-xs text-slate-700 truncate">{r.razonSocial || r.nombre || r.rut}</span>
                          <span className="text-[11px] text-slate-500 tabular-nums">Folio {r.folio}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {resultado.noProcesadas > 0 && (
                  <p className="text-[11px] text-slate-400">
                    {resultado.noProcesadas} no se procesaron (ya facturadas este mes o sin datos válidos) — el sistema evita duplicados.
                  </p>
                )}
                {resultado.vinc && <p className="text-[11px] text-slate-500">{resultado.vinc}</p>}
              </div>

              <div className="flex items-center justify-end px-6 py-3.5 border-t border-[#efe8dd] bg-slate-50/60 flex-shrink-0">
                <button onClick={() => setResultado(null)}
                  className="bg-slate-900 hover:bg-slate-700 text-white px-4 py-1.5 rounded-lg text-xs font-medium transition-colors">
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
