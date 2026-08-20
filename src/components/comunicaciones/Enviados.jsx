// ============================================================================
// 📤 ENVIADOS — la lista plana, un correo por fila
// ----------------------------------------------------------------------------
// Antes esta pantalla mostraba CAMPAÑAS y, al elegir una, sus 33 destinatarios.
// Eso responde «¿cómo salió la campaña del F29?». Pero la pregunta del día a
// día es otra: «¿qué le mandamos a este cliente?», y ahí la agrupación estorba
// —hay que acordarse de en qué campaña iba para poder encontrarlo—.
//
// Acá va la misma información leída al revés: una fila por correo, lo más nuevo
// arriba, buscable por cliente, dirección, asunto o texto. La vista por campaña
// no se botó: es el botón «Por campaña», y sigue siendo la buena para revisar
// un envío recién hecho —cuántos salieron, cuántos fallaron y por qué—.
//
// EL TEXTO SE LEE DE LO GUARDADO, no se vuelve a armar: el plan del cliente o
// las cifras del mes pudieron cambiar desde entonces, y reconstruirlo hoy daría
// un correo que nadie recibió.
// ============================================================================
import React, { useState, useEffect, useCallback } from 'react';
import {
    Send, Search, Loader2, CheckCircle2, AlertTriangle, Clock, Ban,
    Building2, ChevronLeft, LayoutList, FlaskConical, Mail,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import CuerpoCorreo from '@/components/comunicaciones/CuerpoCorreo';
import { HistorialCorreos } from '@/components/crm/modals/HistorialCorreosModal';
import { enviadosApi, enviadoApi } from '@/services/correosService';

const getUser = () => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } };
const getSessionId = () => getUser().sessionId;

const inp = 'w-full bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500';

const ESTADO = {
    enviado:   { texto: 'Llegó',     Icono: CheckCircle2,  clase: 'text-emerald-600' },
    fallido:   { texto: 'Falló',     Icono: AlertTriangle, clase: 'text-red-500' },
    omitido:   { texto: 'Omitido',   Icono: Ban,           clase: 'text-slate-400' },
    rebotado:  { texto: 'Rebotó',    Icono: AlertTriangle, clase: 'text-amber-600' },
    pendiente: { texto: 'Pendiente', Icono: Clock,         clase: 'text-slate-400' },
};

const FILTROS = [['todos', 'Todos'], ['fallidos', 'Fallidos'], ['pruebas', 'Pruebas']];

const fecha = (v) => {
    if (!v) return '';
    const d = new Date(v);
    return d.toDateString() === new Date().toDateString()
        ? d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
};

const Enviados = () => {
    const [porCampana, setPorCampana] = useState(false);

    const [lista, setLista] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [hayMas, setHayMas] = useState(false);
    const [pagina, setPagina] = useState(0);
    const [busqueda, setBusqueda] = useState('');
    const [filtro, setFiltro] = useState('todos');

    const [abierto, setAbierto] = useState(null);
    const [cargandoUno, setCargandoUno] = useState(false);

    const cargar = useCallback(async (p = 0) => {
        setCargando(true);
        try {
            const r = await enviadosApi(getSessionId(), { q: busqueda, filtro, pagina: p });
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            setLista(prev => p === 0 ? (d.enviados || []) : [...prev, ...(d.enviados || [])]);
            setHayMas(!!d.hayMas);
            setPagina(p);
        } catch (e) {
            toast({ variant: 'destructive', title: 'No se pudo cargar', description: e.message });
        } finally { setCargando(false); }
    }, [busqueda, filtro]);

    // No se pide en cada tecla: se espera a que la persona termine de escribir.
    useEffect(() => {
        if (porCampana) return;
        const t = setTimeout(() => cargar(0), busqueda ? 350 : 0);
        return () => clearTimeout(t);
    }, [cargar, busqueda, porCampana]);

    const abrir = async (e) => {
        setCargandoUno(true);
        setAbierto({ id: e.id });
        try {
            const r = await enviadoApi(getSessionId(), e.id);
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            setAbierto(d.envio);
        } catch (err) {
            setAbierto(null);
            toast({ variant: 'destructive', title: 'No se pudo abrir', description: err.message });
        } finally { setCargandoUno(false); }
    };

    // ---- la vista de siempre, por campaña ----
    if (porCampana) {
        return (
            <div className="h-full min-h-0 flex flex-col gap-2">
                <button onClick={() => setPorCampana(false)}
                    className="self-start text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-emerald-600 inline-flex items-center gap-1">
                    <ChevronLeft size={12} /> Volver a la lista
                </button>
                <div className="flex-1 min-h-0 rounded-2xl border border-[#efe8dd] bg-[#faf7f2] overflow-hidden">
                    <HistorialCorreos />
                </div>
            </div>
        );
    }

    return (
        <div className="h-full min-h-0 flex flex-col lg:flex-row gap-3">

            {/* ═══ 1 · LA LISTA ═══ */}
            <div className={`w-full lg:w-96 shrink-0 flex-col bg-white border border-[#efe8dd] rounded-2xl overflow-hidden
                             ${abierto ? 'hidden lg:flex' : 'flex'}`}>
                <div className="px-3 py-2.5 border-b border-[#efe8dd] flex items-center gap-2">
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
                        <Send size={13} className="text-emerald-600" /> Enviados
                    </span>
                    {/* La vista por campaña no se botó: sigue siendo la buena para
                        revisar un envío recién hecho, con sus totales y fallidos. */}
                    <button onClick={() => setPorCampana(true)}
                        title="Ver agrupados por campaña, con totales y fallidos"
                        className="ml-auto text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-emerald-600 inline-flex items-center gap-1 border border-[#efe8dd] rounded-lg px-2 py-1">
                        <LayoutList size={11} /> Por campaña
                    </button>
                </div>

                <div className="px-3 py-2 border-b border-[#efe8dd]">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                            placeholder="Buscar por cliente, correo, asunto o texto…" className={`${inp} pl-8`} />
                    </div>
                </div>

                <div className="flex border-b border-[#efe8dd] px-1">
                    {FILTROS.map(([id, texto]) => (
                        <button key={id} onClick={() => { setFiltro(id); setAbierto(null); }}
                            className={`px-3 py-2 text-[10px] font-black uppercase tracking-wider border-b-2 -mb-px transition-colors ${
                                filtro === id ? 'border-emerald-500 text-emerald-700'
                                              : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
                            {texto}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto">
                    {cargando && lista.length === 0 ? (
                        <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="animate-spin" size={18} /></div>
                    ) : lista.length === 0 ? (
                        <div className="text-center py-14 px-6 flex flex-col items-center gap-2 text-slate-400">
                            <Send size={26} className="opacity-40" />
                            <p className="text-xs">
                                {busqueda || filtro !== 'todos'
                                    ? 'Ningún correo calza con eso.'
                                    : 'Todavía no se ha enviado ningún correo.'}
                            </p>
                        </div>
                    ) : (
                        <>
                            {lista.map(e => {
                                const est = ESTADO[e.estado] || ESTADO.pendiente;
                                return (
                                    <button key={e.id} onClick={() => abrir(e)}
                                        className={`w-full text-left px-3 py-2.5 border-b border-[#f5f0e8] flex items-start gap-2.5 transition-colors
                                            ${abierto?.id === e.id ? 'bg-emerald-500/5 border-l-2 border-l-emerald-500' : 'hover:bg-slate-50'}`}>
                                        <est.Icono size={14} className={`${est.clase} shrink-0 mt-0.5`} />
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-1.5">
                                                {/* «Para: …», como cualquier carpeta de enviados. */}
                                                <span className="block text-[11px] font-bold text-slate-800 truncate flex-1">
                                                    Para: {e.razonSocial || e.destinatario}
                                                </span>
                                                <span className="text-[9px] text-slate-400 shrink-0">{fecha(e.enviadoAt)}</span>
                                            </span>
                                            <span className="block text-[10px] text-slate-700 truncate">{e.asuntoFinal}</span>
                                            <span className="block text-[9px] text-slate-400 truncate">{e.resumen}</span>
                                            <span className="flex items-center gap-1.5 mt-0.5">
                                                {e.esPrueba && (
                                                    <span className="text-[8px] font-black uppercase tracking-wider text-slate-500 bg-slate-500/10 border border-slate-400/30 rounded px-1">
                                                        Prueba
                                                    </span>
                                                )}
                                                {e.empresaId && (
                                                    <span className="text-[8px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-500/10 border border-emerald-500/30 rounded px-1">
                                                        Cliente
                                                    </span>
                                                )}
                                                {e.motivo && (
                                                    <span className="text-[9px] text-red-500 truncate">{e.motivo}</span>
                                                )}
                                            </span>
                                        </span>
                                    </button>
                                );
                            })}
                            {hayMas && (
                                <button onClick={() => cargar(pagina + 1)} disabled={cargando}
                                    className="w-full py-2.5 text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:bg-emerald-500/5">
                                    {cargando ? 'Cargando…' : 'Ver más'}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ═══ 2 · EL CORREO ═══ */}
            <div className={`flex-1 min-w-0 flex-col bg-white border border-[#efe8dd] rounded-2xl overflow-hidden
                             ${abierto ? 'flex' : 'hidden lg:flex'}`}>
                {!abierto ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400 px-8 text-center">
                        <Mail size={28} className="opacity-40" />
                        <p className="text-xs">Elige un correo para ver exactamente qué se envió.</p>
                    </div>
                ) : cargandoUno ? (
                    <div className="flex-1 flex items-center justify-center text-slate-400"><Loader2 className="animate-spin" size={18} /></div>
                ) : (
                    <>
                        <div className="shrink-0 px-4 py-3 border-b border-[#efe8dd]">
                            <div className="flex items-start gap-2">
                                <button onClick={() => setAbierto(null)}
                                    className="lg:hidden text-slate-400 hover:text-slate-700 mt-0.5"><ChevronLeft size={16} /></button>
                                <p className="text-base font-black text-slate-900 flex-1 min-w-0">{abierto.asuntoFinal}</p>
                                {abierto.esPrueba && (
                                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 bg-slate-500/10 border border-slate-400/30 rounded px-1.5 py-0.5 mt-1 inline-flex items-center gap-1">
                                        <FlaskConical size={10} /> Prueba
                                    </span>
                                )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1.5">
                                <b className="text-slate-700">Para:</b> {abierto.razonSocial || '—'}
                                <span className="text-slate-400"> &lt;{abierto.destinatario}&gt;</span>
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                                De {abierto.remitente} · {abierto.enviadoAt && new Date(abierto.enviadoAt).toLocaleString('es-CL')}
                                {abierto.autor && ` · lo mandó ${abierto.autor}`}
                            </p>
                            {abierto.motivo && (
                                <p className="text-[10px] text-red-600 mt-1 flex items-center gap-1">
                                    <AlertTriangle size={11} /> {abierto.motivo}
                                </p>
                            )}
                            {abierto.empresaId && (
                                <p className="text-[10px] text-emerald-700 mt-1 flex items-center gap-1">
                                    <Building2 size={10} /> Cliente de la cartera
                                </p>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto p-4">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">
                                Lo que recibió, tal cual
                            </p>
                            <CuerpoCorreo texto={abierto.cuerpoFinal}
                                className="text-xs text-slate-700 leading-relaxed" />
                            {(abierto.firma || abierto.firmaImagen) && (
                                <div className="border-t border-[#efe8dd] mt-4 pt-3">
                                    {abierto.firma && (
                                        <p className="text-[10px] text-slate-500 whitespace-pre-wrap">{abierto.firma}</p>
                                    )}
                                    {abierto.firmaImagen && (
                                        <img src={abierto.firmaImagen} alt="" className="max-w-[160px] h-auto mt-2" />
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default Enviados;
