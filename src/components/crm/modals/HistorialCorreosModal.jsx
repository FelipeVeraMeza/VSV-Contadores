// =====================================================================
// ENVIADOS · qué se mandó, a quién y qué decía
// ---------------------------------------------------------------------
// POR QUÉ EXISTE ESTA PANTALLA
// Los correos salen por Resend, por HTTPS, desde sus servidores. Nunca
// pasan por Gmail, así que en «Enviados» de Gmail no van a aparecer
// jamás: no es una falla, es cómo funciona.
//
// Esto reemplaza esa carpeta y muestra más de lo que Gmail podría:
// a quién le llegó, a quién NO y por qué, y el texto exacto que recibió
// cada uno —con sus datos ya reemplazados—, que es lo que responde la
// pregunta del día siguiente: «¿qué decía el correo que le mandaste?».
//
// El texto se lee de lo GUARDADO al enviar, no se vuelve a armar: el
// plan del cliente o las cifras del mes pudieron cambiar desde entonces,
// y reconstruirlo hoy daría un correo que nadie recibió.
// =====================================================================
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    X, Send, Loader2, Search, CheckCircle2, AlertTriangle, Clock,
    Mail, User, ChevronRight, Inbox, Ban,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { historialCampanasApi, detalleCampanaApi } from '@/services/correosService';
import CuerpoCorreo from '@/components/comunicaciones/CuerpoCorreo';

const getUser = () => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } };
const getSessionId = () => getUser().sessionId;

// ⚠️ Los nombres llegan en camelCase, NO como los devuelve la base.
// `fetchWithAuth` pasa toda respuesta por `mapperToCamel`, así que
// `cuerpo_final` llega como `cuerpoFinal`. Leerlos en snake_case no da error:
// devuelve `undefined` y el campo se ve vacío, como si el dato no existiera.

const inp = 'w-full bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500';

const fecha = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    return d.toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

// Los estados de una campaña completa.
const ESTADO_CAMPANA = {
    terminada: { texto: 'Terminada', clase: 'text-emerald-700 bg-emerald-500/10 border-emerald-500/30' },
    enviando:  { texto: 'Enviando',  clase: 'text-blue-700 bg-blue-500/10 border-blue-500/30' },
    detenida:  { texto: 'Detenida',  clase: 'text-amber-700 bg-amber-500/10 border-amber-500/40' },
    fallida:   { texto: 'Fallida',   clase: 'text-red-700 bg-red-500/10 border-red-500/30' },
    pendiente: { texto: 'Pendiente', clase: 'text-slate-500 bg-slate-500/10 border-slate-400/30' },
};

// Los de cada destinatario. «Omitido» es el que más se explica solo mal: no es
// un error, es que no se alcanzó a enviar (normalmente por un reinicio).
const ESTADO_ENVIO = {
    enviado:   { texto: 'Llegó',    Icono: CheckCircle2,   clase: 'text-emerald-600' },
    fallido:   { texto: 'Falló',    Icono: AlertTriangle,  clase: 'text-red-500' },
    omitido:   { texto: 'Omitido',  Icono: Ban,            clase: 'text-slate-400' },
    rebotado:  { texto: 'Rebotó',   Icono: AlertTriangle,  clase: 'text-amber-600' },
    pendiente: { texto: 'Pendiente',Icono: Clock,          clase: 'text-slate-400' },
};

// El contenido, sin la ventana encima. Se usa en DOS lugares:
//   · dentro del modal, al redactar («¿esto ya lo mandé?»)
//   · como página propia en Comunicaciones → Historial
// Sin `onClose` no se dibuja la X: en una página no hay nada que cerrar.
export const HistorialCorreos = ({ onClose = null }) => {
    const [campanas, setCampanas] = useState([]);
    const [cargando, setCargando] = useState(true);

    const [elegida, setElegida] = useState(null);
    const [envios, setEnvios] = useState([]);
    const [cargandoDetalle, setCargandoDetalle] = useState(false);

    const [busqueda, setBusqueda] = useState('');
    const [filtro, setFiltro] = useState('todos');
    const [abierto, setAbierto] = useState(null);   // el destinatario cuyo texto se está leyendo
    // Las pruebas no se mezclan con lo que salió a clientes. Se pueden ver
    // igual: mientras se prepara una campaña, TODO lo enviado son pruebas.
    const [conPruebas, setConPruebas] = useState(false);

    useEffect(() => {
        setCargando(true);
        (async () => {
            try {
                const r = await historialCampanasApi(getSessionId(), conPruebas);
                const d = await r.json();
                if (!d.success) throw new Error(d.message);
                setCampanas(d.campanas || []);
                // Se abre la última sola: es la que uno viene a mirar.
                setElegida(d.campanas?.[0] || null);
            } catch (e) {
                toast({ variant: 'destructive', title: 'No se pudo cargar', description: e.message });
            } finally { setCargando(false); }
        })();
    }, [conPruebas]);

    const verDetalle = useCallback(async (c) => {
        setCargandoDetalle(true);
        setEnvios([]);
        setAbierto(null);
        setBusqueda('');
        setFiltro('todos');
        try {
            const r = await detalleCampanaApi(getSessionId(), c.id);
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            setEnvios(d.envios || []);
        } catch (e) {
            toast({ variant: 'destructive', title: 'No se pudo cargar el detalle', description: e.message });
        } finally { setCargandoDetalle(false); }
    }, []);

    useEffect(() => { if (elegida) verDetalle(elegida); }, [elegida, verDetalle]);

    const lista = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        return envios.filter(e => {
            if (filtro !== 'todos' && e.estado !== filtro) return false;
            if (!q) return true;
            return String(e.razonSocial || '').toLowerCase().includes(q)
                || String(e.destinatario || '').toLowerCase().includes(q);
        });
    }, [envios, busqueda, filtro]);

    const cuenta = useMemo(() => {
        const c = { enviado: 0, fallido: 0, omitido: 0, pendiente: 0, rebotado: 0 };
        for (const e of envios) if (c[e.estado] !== undefined) c[e.estado]++;
        return c;
    }, [envios]);

    return (
        <div className="h-full min-h-0 flex flex-col overflow-hidden">

            {/* ── cabecera ── */}
            <div className="shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-b border-[#efe8dd]">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                    <Send size={14} className="text-emerald-600" />
                </div>
                <div className="min-w-0">
                    <p className="text-sm font-black text-slate-900 tracking-tight">Enviados</p>
                    <p className="text-[10px] text-slate-400">
                        Los correos salen por Resend y no pasan por Gmail: este es el registro.
                    </p>
                </div>
                <label className="ml-auto flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 cursor-pointer">
                    <input type="checkbox" checked={conPruebas} onChange={(e) => setConPruebas(e.target.checked)}
                        className="accent-emerald-500" />
                    Ver también las pruebas
                </label>
                {onClose && (
                    <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={18} /></button>
                )}
            </div>

            {cargando ? (
                <div className="flex-1 flex items-center justify-center text-slate-400"><Loader2 className="animate-spin" /></div>
            ) : campanas.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400 px-8 text-center">
                    <Inbox size={30} className="opacity-40" />
                    <p className="text-xs">
                        {conPruebas ? 'No hay ningún envío registrado.' : 'Todavía no se ha enviado ninguna campaña.'}
                    </p>
                    {!conPruebas && (
                        <button onClick={() => setConPruebas(true)}
                            className="text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700">
                            Acá solo salen los envíos de verdad · ver también las pruebas
                        </button>
                    )}
                </div>
            ) : (
              <div className="flex-1 min-h-0 flex">

                {/* ── 1 · las campañas ── */}
                <div className="w-72 shrink-0 border-r border-[#efe8dd] bg-white overflow-y-auto">
                    {campanas.map(c => {
                        const activa = elegida?.id === c.id;
                        const est = ESTADO_CAMPANA[c.estado] || ESTADO_CAMPANA.pendiente;
                        return (
                            <button key={c.id} onClick={() => setElegida(c)}
                                className={`w-full text-left px-3 py-2.5 border-b border-[#f5f0e8] transition-colors
                                    ${activa ? 'bg-emerald-500/5 border-l-2 border-l-emerald-500' : 'hover:bg-slate-50'}`}>
                                <div className="flex items-center gap-1.5 mb-1">
                                    <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${est.clase}`}>
                                        {est.texto}
                                    </span>
                                    {/* Marcada, para no confundir un ensayo con
                                        un correo que sí le llegó a un cliente. */}
                                    {c.esPrueba && (
                                        <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border text-slate-500 bg-slate-500/10 border-slate-400/30">
                                            Prueba
                                        </span>
                                    )}
                                    <span className="text-[9px] text-slate-400 ml-auto">{fecha(c.createdAt)}</span>
                                </div>
                                <p className="text-[11px] font-bold text-slate-800 leading-tight line-clamp-2">{c.asunto}</p>
                                <div className="flex items-center gap-2 mt-1 text-[9px]">
                                    <span className="text-emerald-600 font-black tabular-nums">✓ {c.enviados}</span>
                                    {c.fallidos > 0 && <span className="text-red-500 font-black tabular-nums">✕ {c.fallidos}</span>}
                                    <span className="text-slate-400 tabular-nums">de {c.total}</span>
                                    {c.autor && <span className="text-slate-400 truncate ml-auto">{c.autor}</span>}
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* ── 2 · a quién le llegó ── */}
                <div className="flex-1 min-w-0 flex flex-col">
                    <div className="shrink-0 px-4 py-2.5 bg-white border-b border-[#efe8dd] space-y-2">
                        <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-black text-slate-900 truncate">{elegida?.asunto}</p>
                                <p className="text-[10px] text-slate-400 truncate">
                                    <Mail size={9} className="inline mr-1" />
                                    {elegida?.remitente} · {fecha(elegida?.createdAt)}
                                    {elegida?.autor && <> · <User size={9} className="inline mx-0.5" />{elegida.autor}</>}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                                <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                                    placeholder="Buscar cliente o correo…" className={`${inp} pl-8`} />
                            </div>
                            {/* Los estados con su cuenta: sirve de filtro y de resumen
                                a la vez. Los que no ocurrieron no se muestran, para
                                no llenar la barra de ceros. */}
                            <div className="flex gap-1">
                                {[['todos', `Todos ${envios.length}`],
                                  ...Object.entries(cuenta).filter(([, n]) => n > 0)
                                      .map(([k, n]) => [k, `${ESTADO_ENVIO[k]?.texto || k} ${n}`])
                                ].map(([k, texto]) => (
                                    <button key={k} onClick={() => setFiltro(k)}
                                        className={`text-[9px] font-black uppercase tracking-wider px-2 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
                                            filtro === k ? 'bg-emerald-600 border-emerald-500 text-white'
                                                         : 'bg-slate-50 border-[#efe8dd] text-slate-500 hover:border-emerald-500/60'}`}>
                                        {texto}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {cargandoDetalle ? (
                            <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="animate-spin" size={18} /></div>
                        ) : lista.length === 0 ? (
                            <p className="text-[11px] text-slate-400 italic text-center py-12">Ningún destinatario calza.</p>
                        ) : lista.map((e, i) => {
                            const est = ESTADO_ENVIO[e.estado] || ESTADO_ENVIO.pendiente;
                            const leyendo = abierto === i;
                            return (
                                <div key={i} className="border-b border-[#f5f0e8]">
                                    <button onClick={() => setAbierto(leyendo ? null : i)}
                                        className="w-full text-left px-4 py-2 flex items-center gap-2.5 hover:bg-white transition-colors">
                                        <est.Icono size={14} className={`${est.clase} shrink-0`} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-[11px] font-bold text-slate-800 truncate">{e.razonSocial}</span>
                                            <span className="block text-[9px] text-slate-400 truncate">{e.destinatario}</span>
                                            {/* El motivo del fallo va a la vista, no escondido:
                                                es lo único accionable de una fila que falló. */}
                                            {e.motivo && <span className="block text-[9px] text-red-500 truncate">{e.motivo}</span>}
                                        </span>
                                        <span className="text-[9px] text-slate-400 shrink-0 tabular-nums">{fecha(e.enviadoAt)}</span>
                                        <ChevronRight size={13}
                                            className={`text-slate-300 shrink-0 transition-transform ${leyendo ? 'rotate-90' : ''}`} />
                                    </button>

                                    {leyendo && (
                                        <div className="px-4 pb-3 bg-white">
                                            <div className="border border-[#efe8dd] rounded-xl p-3 bg-slate-50/60">
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                                    Lo que recibió, tal cual
                                                </p>
                                                <p className="text-[11px] font-black text-slate-900 mb-2">{e.asuntoFinal}</p>
                                                {/* Los envíos de antes del editor están en texto
                                                    plano y los nuevos en HTML: el componente
                                                    distingue y muestra cada uno como corresponde. */}
                                                <CuerpoCorreo texto={e.cuerpoFinal}
                                                    className="text-[11px] text-slate-700 leading-relaxed" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
              </div>
            )}
        </div>
    );
};

// La ventana: el mismo contenido, flotando sobre la pantalla de redactar.
const HistorialCorreosModal = ({ onClose }) => (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
         onClick={onClose}>
        <div className="bg-[#faf7f2] w-full max-w-6xl h-[85vh] rounded-2xl border border-[#efe8dd] shadow-2xl flex flex-col overflow-hidden"
             onClick={(e) => e.stopPropagation()}>
            <HistorialCorreos onClose={onClose} />
        </div>
    </div>
);

export default HistorialCorreosModal;
