// ============================================================================
// 📥 BANDEJA DE ENTRADA — lo que contestan los clientes
// ----------------------------------------------------------------------------
// Hasta ahora el sistema solo enviaba. Todo lo que respondían los clientes caía
// en la casilla @vsvconsultores.com del hosting, que no leía nadie: el correo
// salía, el cliente contestaba, y esa respuesta se perdía sin error ni rebote.
// Esta pantalla es esa casilla, leída por IMAP y cruzada con el CRM.
//
// LO QUE LA HACE DISTINTA DE ABRIR EL WEBMAIL: cada correo viene con el CLIENTE
// al lado. No es «alguien escribió desde vladyinca@gmail.com», es «escribió AYV
// INVERSIONES SPA», que es la pregunta que uno se hace de verdad.
// ============================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Inbox, Search, RefreshCw, Loader2, Star, Archive, Paperclip, Mail,
    MailOpen, Building2, AlertTriangle, ChevronLeft, Settings2,
    CornerUpLeft, Forward,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import CuerpoCorreo from '@/components/comunicaciones/CuerpoCorreo';
import ResponderCorreo from '@/components/comunicaciones/ResponderCorreo';
import {
    bandejaApi, correoRecibidoApi, marcarRecibidoApi,
    sincronizarBandejaApi, progresoBandejaApi,
} from '@/services/correosService';

const getUser = () => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } };
const getSessionId = () => getUser().sessionId;

const inp = 'w-full bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500';

// Las pestañas de arriba de la lista. En Gmail son Principal/Social/Promociones,
// que son categorías que este sistema no tiene y no puede inventar. Estas dos sí
// significan algo: si el remitente calza con una ficha del CRM o no. Es la
// pregunta real al mirar la bandeja —«¿esto lo manda un cliente?»— y sale del
// cruce con `empresa.email_corporativo`.
const PESTANAS = [
    ['todos', 'Principal'], ['clientes', 'De clientes'], ['no_leidos', 'Sin leer'],
];

const fecha = (v) => {
    if (!v) return '';
    const d = new Date(v);
    const hoy = new Date();
    const mismoDia = d.toDateString() === hoy.toDateString();
    return mismoDia
        ? d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
};

const iniciales = (n) => {
    const p = String(n || '?').trim().split(/\s+/);
    return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?';
};

const BandejaEntrada = ({ filtro: carpeta = 'todos', titulo = 'Recibidos', onSinLeer, onResponder }) => {
    const [correos, setCorreos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [configurada, setConfigurada] = useState(true);
    const [sinLeer, setSinLeer] = useState(0);
    const [hayMas, setHayMas] = useState(false);
    const [pagina, setPagina] = useState(0);

    const [busqueda, setBusqueda] = useState('');
    // Las pestañas solo aplican dentro de Recibidos. En Destacados o Archivados
    // la carpeta YA es el filtro, y ofrecer otro encima solo confunde.
    const [pestana, setPestana] = useState('todos');
    const conPestanas = carpeta === 'todos';
    const filtro = conPestanas ? pestana : carpeta;

    const [abierto, setAbierto] = useState(null);
    const [cargandoUno, setCargandoUno] = useState(false);
    const [respondiendo, setRespondiendo] = useState(null);   // 'responder' | 'reenviar'

    const [sincronizando, setSincronizando] = useState(false);
    const timer = useRef(null);
    const navigate = useNavigate();

    // Al cambiar de carpeta se vuelve a Principal y se cierra lo abierto: si no,
    // quedaba en pantalla un correo que ya no pertenece a la carpeta que se ve.
    useEffect(() => { setPestana('todos'); setAbierto(null); }, [carpeta]);

    const cargar = useCallback(async (p = 0) => {
        setCargando(true);
        try {
            const r = await bandejaApi(getSessionId(), { q: busqueda, filtro, pagina: p });
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            setCorreos(prev => p === 0 ? (d.correos || []) : [...prev, ...(d.correos || [])]);
            setHayMas(!!d.hayMas);
            setSinLeer(d.sinLeer || 0);
            onSinLeer?.(d.sinLeer || 0);
            setConfigurada(d.configurada !== false);
            setPagina(p);
        } catch (e) {
            toast({ variant: 'destructive', title: 'No se pudo cargar la bandeja', description: e.message });
        } finally { setCargando(false); }
    }, [busqueda, filtro, onSinLeer]);

    // Al escribir en el buscador no se pide en cada tecla: se espera a que la
    // persona termine. Sin esto son 20 consultas para escribir «transportes».
    useEffect(() => {
        const t = setTimeout(() => cargar(0), busqueda ? 350 : 0);
        return () => clearTimeout(t);
    }, [cargar, busqueda]);

    // Mientras sincroniza se pregunta por el avance. Se corta solo al terminar.
    useEffect(() => {
        if (!sincronizando) return;
        timer.current = setInterval(async () => {
            try {
                const r = await progresoBandejaApi(getSessionId());
                const d = await r.json();
                if (!d.activo) {
                    setSincronizando(false);
                    clearInterval(timer.current);
                    if (d.error) {
                        toast({ variant: 'destructive', title: 'Falló la sincronización', description: d.error, duration: 12000 });
                    } else {
                        toast({ title: `${d.nuevos || 0} correos nuevos`, description: `Se revisaron ${d.revisados || 0}.` });
                        cargar(0);
                    }
                }
            } catch { /* se reintenta en el siguiente tic */ }
        }, 2500);
        return () => clearInterval(timer.current);
    }, [sincronizando, cargar]);

    const sincronizar = async () => {
        setSincronizando(true);
        try {
            const r = await sincronizarBandejaApi(getSessionId());
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
        } catch (e) {
            setSincronizando(false);
            toast({ variant: 'destructive', title: 'No se pudo sincronizar', description: e.message, duration: 12000 });
        }
    };

    const abrir = async (c) => {
        setCargandoUno(true);
        setAbierto({ id: c.id });         // pinta el panel de inmediato
        try {
            const r = await correoRecibidoApi(getSessionId(), c.id);
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            setAbierto(d.correo);
            // Se refleja al tiro en la lista para que el contador no mienta.
            setCorreos(p => p.map(x => x.id === c.id ? { ...x, visto: true } : x));
            if (!c.visto) setSinLeer(n => Math.max(0, n - 1));
        } catch (e) {
            setAbierto(null);
            toast({ variant: 'destructive', title: 'No se pudo abrir', description: e.message });
        } finally { setCargandoUno(false); }
    };

    const marcar = async (c, cambios) => {
        setCorreos(p => p.map(x => x.id === c.id ? { ...x, ...cambios } : x));
        if (abierto?.id === c.id) setAbierto(a => ({ ...a, ...cambios }));
        try {
            const r = await marcarRecibidoApi(getSessionId(), c.id, cambios);
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            if (cambios.archivado) setCorreos(p => p.filter(x => x.id !== c.id));
        } catch (e) {
            toast({ variant: 'destructive', title: 'No se pudo actualizar', description: e.message });
            cargar(0);
        }
    };

    // ---- sin configurar: se dice QUÉ falta, no «no hay correos» ----
    if (!configurada && !cargando) {
        return (
            <div className="h-full min-h-0 flex flex-col items-center justify-center text-center gap-3 px-8">
                <Settings2 size={34} className="text-amber-500" />
                <p className="text-sm font-black text-slate-600 uppercase tracking-widest">Falta configurar la casilla</p>
                <p className="text-xs text-slate-500 max-w-md leading-relaxed">
                    La bandeja lee por IMAP el buzón de <b>@vsvconsultores.com</b>, que es donde caen
                    las respuestas de los clientes. Para conectarla hay que poner en el <code>.env</code> del
                    servidor: <code className="bg-slate-100 px-1 rounded">IMAP_HOST</code>,{' '}
                    <code className="bg-slate-100 px-1 rounded">IMAP_PORT</code>,{' '}
                    <code className="bg-slate-100 px-1 rounded">IMAP_USER</code> y{' '}
                    <code className="bg-slate-100 px-1 rounded">IMAP_PASSWORD</code>.
                </p>
            </div>
        );
    }

    return (
        <div className="h-full min-h-0 flex flex-col lg:flex-row gap-3">

            {/* ═══ 1 · LA LISTA ═══ */}
            <div className={`w-full lg:w-96 shrink-0 flex flex-col bg-white border border-[#efe8dd] rounded-2xl overflow-hidden
                             ${abierto ? 'hidden lg:flex' : 'flex'}`}>
                <div className="px-3 py-2.5 border-b border-[#efe8dd] flex items-center gap-2">
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
                        <Inbox size={13} className="text-emerald-600" /> {titulo}
                    </span>
                    {conPestanas && sinLeer > 0 && (
                        <span className="text-[9px] font-black text-white bg-emerald-600 rounded-full px-1.5 py-0.5 tabular-nums">
                            {sinLeer}
                        </span>
                    )}
                    <button onClick={sincronizar} disabled={sincronizando}
                        title="Buscar correos nuevos en el servidor"
                        className="ml-auto text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-emerald-600 disabled:opacity-50 inline-flex items-center gap-1">
                        {sincronizando
                            ? <><Loader2 size={11} className="animate-spin" /> Buscando…</>
                            : <><RefreshCw size={11} /> Actualizar</>}
                    </button>
                </div>

                <div className="px-3 py-2 border-b border-[#efe8dd] space-y-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                            placeholder="Buscar por cliente, asunto o texto…" className={`${inp} pl-8`} />
                    </div>
                </div>

                {/* Pestañas al estilo de un cliente de correo, pero con
                    categorías que este sistema puede sostener de verdad. */}
                {conPestanas && (
                    <div className="flex border-b border-[#efe8dd] px-1">
                        {PESTANAS.map(([id, texto]) => (
                            <button key={id} onClick={() => { setPestana(id); setAbierto(null); }}
                                className={`px-3 py-2 text-[10px] font-black uppercase tracking-wider border-b-2 -mb-px transition-colors ${
                                    pestana === id ? 'border-emerald-500 text-emerald-700'
                                                   : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
                                {texto}
                            </button>
                        ))}
                    </div>
                )}

                <div className="flex-1 overflow-y-auto">
                    {cargando && correos.length === 0 ? (
                        <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="animate-spin" size={18} /></div>
                    ) : correos.length === 0 ? (
                        <div className="text-center py-14 px-6 flex flex-col items-center gap-2 text-slate-400">
                            <Inbox size={28} className="opacity-40" />
                            <p className="text-xs">
                                {busqueda || filtro !== 'todos'
                                    ? 'Ningún correo calza con eso.'
                                    : 'La bandeja está vacía. Pulsa «Actualizar» para traer los correos del servidor.'}
                            </p>
                        </div>
                    ) : (
                        <>
                            {correos.map(c => (
                                <button key={c.id} onClick={() => abrir(c)}
                                    className={`w-full text-left px-3 py-2.5 border-b border-[#f5f0e8] flex items-start gap-2.5 transition-colors
                                        ${abierto?.id === c.id ? 'bg-emerald-500/5 border-l-2 border-l-emerald-500' : 'hover:bg-slate-50'}`}>
                                    <span className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-[9px] font-black
                                        ${c.visto ? 'bg-slate-100 text-slate-500' : 'bg-emerald-600 text-white'}`}>
                                        {iniciales(c.razonSocial || c.deNombre || c.deCorreo)}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-1.5">
                                            {/* El CLIENTE primero. Si no está en la cartera,
                                                el nombre de quien escribe. */}
                                            <span className={`block text-[11px] truncate flex-1 ${c.visto ? 'font-medium text-slate-600' : 'font-black text-slate-900'}`}>
                                                {c.razonSocial || c.deNombre || c.deCorreo}
                                            </span>
                                            <span className="text-[9px] text-slate-400 shrink-0">{fecha(c.fecha)}</span>
                                        </span>
                                        <span className={`block text-[10px] truncate ${c.visto ? 'text-slate-500' : 'font-bold text-slate-800'}`}>
                                            {c.asunto}
                                        </span>
                                        <span className="block text-[9px] text-slate-400 truncate">{c.resumen}</span>
                                        <span className="flex items-center gap-1.5 mt-0.5">
                                            {c.empresaId && (
                                                <span className="text-[8px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-500/10 border border-emerald-500/30 rounded px-1">
                                                    Cliente
                                                </span>
                                            )}
                                            {c.tieneAdjuntos && <Paperclip size={9} className="text-slate-400" />}
                                            {c.destacado && <Star size={9} className="text-amber-500 fill-amber-500" />}
                                        </span>
                                    </span>
                                </button>
                            ))}
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
                        <MailOpen size={28} className="opacity-40" />
                        <p className="text-xs">Elige un correo para leerlo.</p>
                    </div>
                ) : cargandoUno ? (
                    <div className="flex-1 flex items-center justify-center text-slate-400"><Loader2 className="animate-spin" size={18} /></div>
                ) : (
                    <>
                        {/* ── barra de acciones, como en un cliente de correo ── */}
                        <div className="shrink-0 flex items-center gap-1 px-3 py-2 border-b border-[#efe8dd]">
                            <button onClick={() => setAbierto(null)} title="Volver a la lista"
                                className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                                <ChevronLeft size={16} />
                            </button>
                            <span className="w-px h-4 bg-[#efe8dd] mx-1" />
                            <button onClick={() => { marcar(abierto, { archivado: !abierto.archivado }); setAbierto(null); }}
                                title={abierto.archivado ? 'Sacar de archivados' : 'Archivar'}
                                className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                                <Archive size={15} />
                            </button>
                            <button onClick={() => { marcar(abierto, { visto: false }); setAbierto(null); }}
                                title="Marcar como no leído"
                                className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-emerald-600">
                                <Mail size={15} />
                            </button>
                            <button onClick={() => marcar(abierto, { destacado: !abierto.destacado })}
                                title={abierto.destacado ? 'Quitar destacado' : 'Destacar'}
                                className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-amber-500">
                                <Star size={15} className={abierto.destacado ? 'text-amber-500 fill-amber-500' : ''} />
                            </button>
                            {/* Ir a la ficha del cliente. Es el atajo que justifica leer
                                el correo acá adentro y no en el webmail. */}
                            {abierto.empresaId && (
                                <button onClick={() => navigate(`/CRM?sub=list`)}
                                    title={`Ver la ficha de ${abierto.razonSocial}`}
                                    className="h-7 px-2 flex items-center gap-1 rounded-lg text-emerald-700 hover:bg-emerald-500/10 text-[9px] font-black uppercase tracking-widest">
                                    <Building2 size={13} /> Ficha
                                </button>
                            )}
                        </div>

                        <div className="shrink-0 px-4 pt-3 pb-2 border-b border-[#efe8dd]">
                            <div className="flex items-start gap-2 flex-wrap">
                                <p className="text-base font-black text-slate-900 min-w-0">{abierto.asunto}</p>
                                {abierto.razonSocial && (
                                    <span className="text-[9px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-500/10 border border-emerald-500/30 rounded px-1.5 py-0.5 mt-1">
                                        Cliente
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2.5 mt-2">
                                <span className="w-8 h-8 rounded-full bg-emerald-600 text-white shrink-0 flex items-center justify-center text-[10px] font-black">
                                    {iniciales(abierto.razonSocial || abierto.deNombre || abierto.deCorreo)}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[11px] text-slate-800">
                                        <b>{abierto.razonSocial || abierto.deNombre || abierto.deCorreo}</b>
                                        <span className="text-slate-400"> &lt;{abierto.deCorreo}&gt;</span>
                                    </p>
                                    <p className="text-[10px] text-slate-400">
                                        para {abierto.para || 'mí'}
                                    </p>
                                </div>
                                <span className="text-[10px] text-slate-400 shrink-0">
                                    {abierto.fecha && new Date(abierto.fecha).toLocaleString('es-CL')}
                                </span>
                            </div>
                            {!abierto.razonSocial && (
                                <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
                                    <AlertTriangle size={10} /> Esta dirección no está en ninguna ficha del CRM.
                                </p>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto p-4">
                            {/* El HTML entrante ya lo saneó el servidor antes de
                                guardarlo: lo escribió un desconocido. */}
                            <CuerpoCorreo texto={abierto.cuerpoHtml || abierto.cuerpoTexto}
                                className="text-xs text-slate-700 leading-relaxed" />

                            {abierto.adjuntos?.length > 0 && (
                                <div className="mt-4 pt-3 border-t border-[#efe8dd]">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                                        {abierto.adjuntos.length} {abierto.adjuntos.length === 1 ? 'adjunto' : 'adjuntos'}
                                    </p>
                                    <div className="space-y-1">
                                        {abierto.adjuntos.map((a, i) => (
                                            <div key={i} className="flex items-center gap-2 bg-slate-50 border border-[#efe8dd] rounded-lg px-2 py-1">
                                                <Paperclip size={11} className="text-slate-400 shrink-0" />
                                                <span className="text-[10px] text-slate-700 flex-1 truncate">{a.nombre}</span>
                                                <span className="text-[9px] text-slate-400 shrink-0">
                                                    {a.bytes > 1048576 ? `${(a.bytes / 1048576).toFixed(1)} MB` : `${Math.round(a.bytes / 1024)} KB`}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    {/* Honestidad por delante: se ve que existen, pero el
                                        archivo se quedó en el servidor de correo. */}
                                    <p className="text-[9px] text-slate-400 mt-1.5">
                                        Los archivos se quedan en el servidor de correo; acá solo se guarda de qué se trata.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* ── responder, sin salir a Gmail ── */}
                        <div className="shrink-0 px-4 py-3 border-t border-[#efe8dd] flex gap-2 flex-wrap">
                            <button onClick={() => setRespondiendo('responder')}
                                className="inline-flex items-center gap-1.5 border border-[#efe8dd] hover:border-emerald-500/60 hover:text-emerald-700 text-slate-600 rounded-full px-4 h-9 text-[10px] font-black uppercase tracking-widest transition-colors">
                                <CornerUpLeft size={13} /> Responder
                            </button>
                            <button onClick={() => setRespondiendo('reenviar')}
                                className="inline-flex items-center gap-1.5 border border-[#efe8dd] hover:border-emerald-500/60 hover:text-emerald-700 text-slate-600 rounded-full px-4 h-9 text-[10px] font-black uppercase tracking-widest transition-colors">
                                <Forward size={13} /> Reenviar
                            </button>
                        </div>
                    </>
                )}
            </div>

            {respondiendo && abierto && (
                <ResponderCorreo
                    correo={abierto}
                    modo={respondiendo}
                    onClose={() => setRespondiendo(null)}
                    onEnviado={() => { onResponder?.(); cargar(0); }}
                />
            )}
        </div>
    );
};

export default BandejaEntrada;
