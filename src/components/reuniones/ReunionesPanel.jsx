// =====================================================================
// REUNIONES · agendar, entrar y dejar constancia
// ---------------------------------------------------------------------
// La pantalla tiene dos modos y no más:
//
//   LISTA · lo que viene y lo que ya pasó. Desde acá se entra.
//   SALA  · la videollamada ocupando todo, sin nada alrededor que distraiga.
//
// LO QUE HACE DISTINTO A ABRIR UN MEET: al colgar, si eres quien la convocó,
// se pide la nota de lo que se acordó. Esa nota es la razón de tener las
// reuniones acá adentro; sin ella esto es un enlace de Meet con más pasos.
//
// El video en sí lo pone Jitsi (ver SalaJitsi.jsx). Esta pantalla solo sabe el
// nombre de la sala, que se lo pide al servidor al entrar.
// =====================================================================
import React, { useState, useEffect, useCallback } from 'react';
import {
    Video, VideoOff, Plus, Loader2, X, Calendar, Clock, Users, User,
    Building2, CheckCircle2, PhoneOff, Search, Radio, Settings2, UserPlus,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import SalaJitsi from '@/components/reuniones/SalaJitsi';
import DetalleReunion from '@/components/reuniones/DetalleReunion';
import {
    listarReunionesApi, crearReunionApi, entrarReunionApi,
    salirReunionApi, terminarReunionApi, cancelarReunionApi,
} from '@/services/reunionesService';
import { getCatalogosApi, listarPersonasApi } from '@/services/personaService';

const getUser = () => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } };
const getSessionId = () => getUser().sessionId;

const inp = 'w-full bg-white border border-[#efe8dd] rounded-lg px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500';

const cuandoTexto = (r) => {
    if (r.estado === 'en_curso') return 'En curso ahora';
    if (!r.iniciaAt) return 'Sala abierta';
    const f = new Date(r.iniciaAt);
    const hoy = new Date();
    const mismoDia = f.toDateString() === hoy.toDateString();
    return `${mismoDia ? 'Hoy' : f.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })} · ${f.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`;
};

const ESTADO_PINTA = {
    agendada:  { txt: 'Agendada',  c: 'text-slate-500 bg-slate-100 border-slate-200' },
    en_curso:  { txt: 'En curso',  c: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    terminada: { txt: 'Terminada', c: 'text-slate-400 bg-slate-50 border-slate-200' },
    cancelada: { txt: 'Cancelada', c: 'text-red-600 bg-red-50 border-red-200' },
};

// ---------------------------------------------------------------------
// CREAR · una reunión de ahora o una agendada
// ---------------------------------------------------------------------
// Las dos formas están en el mismo formulario porque son la misma cosa con una
// fecha distinta, y separarlas en dos botones obligaba a decidir antes de
// escribir el título.
const CrearReunionModal = ({ onClose, onCreada, usuarios, ahoraPorDefecto }) => {
    const yo = getUser().id;
    const [form, setForm] = useState({
        titulo: '', descripcion: '', iniciaAt: '', duracionMin: 30,
        participantes: [], personaId: null, personaNombre: '',
    });
    const [ahora, setAhora] = useState(!!ahoraPorDefecto);
    const [guardando, setGuardando] = useState(false);

    // Buscador de cliente. Se busca contra el CRM en vez de traer la lista
    // entera: son cientos de personas y un desplegable con cientos no se usa.
    const [busca, setBusca] = useState('');
    const [resultados, setResultados] = useState([]);
    useEffect(() => {
        const q = busca.trim();
        if (q.length < 3) { setResultados([]); return; }
        const t = setTimeout(async () => {
            try {
                const r = await listarPersonasApi(getSessionId(), { q });
                const d = await r.json();
                if (d.success) setResultados((d.personas || []).slice(0, 6));
            } catch { /* sin resultados, se sigue sin cliente */ }
        }, 300);
        return () => clearTimeout(t);
    }, [busca]);

    const toggle = (id) => setForm(p => ({
        ...p,
        participantes: p.participantes.includes(id)
            ? p.participantes.filter(x => x !== id)
            : [...p.participantes, id],
    }));

    const guardar = async () => {
        if (!form.titulo.trim()) { toast({ variant: 'destructive', title: 'Falta el título' }); return; }
        if (!ahora && !form.iniciaAt) { toast({ variant: 'destructive', title: 'Falta la fecha y hora' }); return; }
        setGuardando(true);
        try {
            const r = await crearReunionApi(getSessionId(), {
                titulo: form.titulo, descripcion: form.descripcion,
                ahora, iniciaAt: ahora ? null : form.iniciaAt,
                duracionMin: form.duracionMin,
                participantes: form.participantes,
                personaId: form.personaId,
            });
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            toast({
                title: ahora ? 'Sala abierta' : 'Reunión agendada',
                description: form.participantes.length
                    ? `Se avisó a ${form.participantes.length} persona(s) por la campana.`
                    : 'Sin invitados: puedes agregarlos después.',
            });
            onCreada(d.reunion, ahora);
            onClose();
        } catch (e) { toast({ variant: 'destructive', title: 'No se pudo crear', description: e.message }); }
        finally { setGuardando(false); }
    };

    return (
        <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="w-full max-w-lg bg-white rounded-2xl border border-[#efe8dd] shadow-2xl max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Nueva reunión</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={18} /></button>
                </div>

                <div className="px-5 pb-1 flex-1 min-h-0 overflow-y-auto space-y-3">
                    {/* Ahora o agendada. Es lo primero porque cambia todo lo demás. */}
                    <div className="flex gap-1.5">
                        {[[true, 'Empezar ahora'], [false, 'Agendar']].map(([v, label]) => (
                            <button key={String(v)} type="button" onClick={() => setAhora(v)}
                                className={`flex-1 text-[11px] font-black uppercase tracking-widest px-3 py-2 rounded-lg border transition-colors ${
                                    ahora === v ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-50 border-[#efe8dd] text-slate-500'}`}>
                                {label}
                            </button>
                        ))}
                    </div>

                    <input className={inp} placeholder="¿De qué es la reunión? *" autoFocus
                        value={form.titulo} onChange={(e) => setForm(p => ({ ...p, titulo: e.target.value }))} />

                    {!ahora && (
                        <div className="grid grid-cols-2 gap-2">
                            <label className="block">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Cuándo</span>
                                <input type="datetime-local" className={inp} value={form.iniciaAt}
                                    onChange={(e) => setForm(p => ({ ...p, iniciaAt: e.target.value }))} />
                            </label>
                            <label className="block">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Dura (min)</span>
                                <input type="number" min="5" max="480" step="5" className={inp} value={form.duracionMin}
                                    onChange={(e) => setForm(p => ({ ...p, duracionMin: e.target.value }))} />
                            </label>
                        </div>
                    )}

                    <div>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Con quién</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                            {usuarios.filter(u => u.id !== yo).map(u => (
                                <button type="button" key={u.id} onClick={() => toggle(u.id)}
                                    className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors ${
                                        form.participantes.includes(u.id)
                                            ? 'bg-emerald-600 border-emerald-500 text-white'
                                            : 'bg-slate-50 border-[#efe8dd] text-slate-500'}`}>
                                    {u.nombre}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* El cliente. Es opcional: una reunión interna no tiene. */}
                    <div>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Cliente (opcional)</span>
                        {form.personaId ? (
                            <div className="mt-1 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                                <Building2 size={13} className="text-emerald-700 shrink-0" />
                                <span className="text-xs text-emerald-900 flex-1 truncate">{form.personaNombre}</span>
                                <button onClick={() => setForm(p => ({ ...p, personaId: null, personaNombre: '' }))}
                                    className="text-emerald-700 hover:text-red-500"><X size={13} /></button>
                            </div>
                        ) : (
                            <>
                                <div className="relative mt-1">
                                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                                    <input className={`${inp} pl-8`} placeholder="Buscar por nombre o RUT…"
                                        value={busca} onChange={(e) => setBusca(e.target.value)} />
                                </div>
                                {resultados.length > 0 && (
                                    <div className="mt-1 border border-[#efe8dd] rounded-lg overflow-hidden">
                                        {resultados.map(p => (
                                            <button key={p.id} type="button"
                                                onClick={() => {
                                                    setForm(f => ({ ...f, personaId: p.id, personaNombre: `${p.nombre || ''} ${p.apellidos || ''}`.trim() }));
                                                    setBusca(''); setResultados([]);
                                                }}
                                                className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 border-b border-[#efe8dd] last:border-0">
                                                {`${p.nombre || ''} ${p.apellidos || ''}`.trim()}
                                                {p.rut && <span className="text-slate-400 ml-2">{p.rut}</span>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    <textarea className={`${inp} resize-none`} rows={2} placeholder="Temas a tratar (opcional)"
                        value={form.descripcion} onChange={(e) => setForm(p => ({ ...p, descripcion: e.target.value }))} />
                </div>

                <div className="px-5 py-4 shrink-0 border-t border-[#efe8dd]">
                    <button onClick={guardar} disabled={guardando}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg h-10 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                        {guardando ? <Loader2 size={14} className="animate-spin" /> : <Video size={14} />}
                        {ahora ? 'Abrir la sala y entrar' : 'Agendar reunión'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------
// LA NOTA AL COLGAR · solo a quien convocó
// ---------------------------------------------------------------------
// Se pregunta en el momento de colgar y no después, porque diez minutos más
// tarde ya nadie escribe nada. Se puede saltar: obligar a escribir para poder
// salir de la pantalla sería peor.
const NotaFinalModal = ({ reunion, onListo, onSaltar }) => {
    const [notas, setNotas] = useState('');
    const [guardando, setGuardando] = useState(false);
    const cerrar = async () => {
        setGuardando(true);
        try {
            await terminarReunionApi(getSessionId(), reunion.id, notas.trim() || null);
            toast({ title: 'Reunión cerrada', description: notas.trim() ? 'La nota quedó guardada.' : undefined });
            onListo();
        } catch { toast({ variant: 'destructive', title: 'No se pudo cerrar la reunión' }); onListo(); }
        finally { setGuardando(false); }
    };
    return (
        <div className="fixed inset-0 z-[130] bg-black/60 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-2xl border border-[#efe8dd] shadow-2xl p-5">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-1">¿Qué quedó acordado?</h3>
                <p className="text-[11px] text-slate-500 mb-3">
                    Queda guardado en la reunión{reunion.personaNombre ? ` y en la ficha de ${reunion.personaNombre}` : ''}.
                </p>
                <textarea className={`${inp} resize-none`} rows={5} autoFocus
                    placeholder="Los acuerdos, los pendientes, lo que hay que hacer…"
                    value={notas} onChange={(e) => setNotas(e.target.value)} />
                <div className="flex gap-2 mt-3">
                    <button onClick={onSaltar} className="flex-1 text-[11px] font-bold text-slate-500 hover:text-slate-800 py-2">
                        Dejarla abierta
                    </button>
                    <button onClick={cerrar} disabled={guardando}
                        className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg py-2 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                        {guardando ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                        Guardar y cerrar
                    </button>
                </div>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------
const ReunionesPanel = () => {
    const yo = getUser().id;
    const [cuando, setCuando] = useState('proximas');
    const [reuniones, setReuniones] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [loading, setLoading] = useState(true);
    const [crear, setCrear] = useState(null);      // null | 'ahora' | 'agendar'
    const [enSala, setEnSala] = useState(null);    // { reunion, sala }
    const [pedirNota, setPedirNota] = useState(null);
    const [detalle, setDetalle] = useState(null);   // la reunión abierta en el panel de gestión

    // EL RELOJ DE LA REUNIÓN.
    // Al esconder la barra de Jitsi —que mostraba el nombre aleatorio de la
    // sala— se fue con ella su cronómetro, y saber cuánto llevas hablando sí
    // sirve: es lo que hace que una reunión de 20 minutos no termine en 50.
    // Cuenta desde que la reunión quedó en curso, no desde que entré yo.
    const [transcurrido, setTranscurrido] = useState('');
    useEffect(() => {
        if (!enSala) { setTranscurrido(''); return; }
        const desde = new Date(enSala.reunion?.iniciadaAt || Date.now()).getTime();
        const marcar = () => {
            const s = Math.max(0, Math.floor((Date.now() - desde) / 1000));
            const dosDigitos = (n) => String(n).padStart(2, '0');
            const h = Math.floor(s / 3600);
            setTranscurrido(h
                ? `${h}:${dosDigitos(Math.floor(s / 60) % 60)}:${dosDigitos(s % 60)}`
                : `${dosDigitos(Math.floor(s / 60))}:${dosDigitos(s % 60)}`);
        };
        marcar();
        const id = setInterval(marcar, 1000);
        return () => clearInterval(id);
    }, [enSala]);

    const cargar = useCallback(async () => {
        setLoading(true);
        try {
            const r = await listarReunionesApi(getSessionId(), { cuando });
            const d = await r.json();
            if (d.success) setReuniones(d.reuniones || []);
        } catch { /* se queda con lo que había */ } finally { setLoading(false); }
    }, [cuando]);
    useEffect(() => { cargar(); }, [cargar]);

    useEffect(() => {
        (async () => {
            try { const r = await getCatalogosApi(getSessionId()); const d = await r.json();
                  if (d.success) setUsuarios(d.ejecutivos || []); } catch { /* */ }
        })();
    }, []);

    const entrar = async (reunion) => {
        try {
            const r = await entrarReunionApi(getSessionId(), reunion.id);
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            setEnSala({ reunion: d.reunion || reunion, sala: d.sala, dominio: d.dominio, jwt: d.jwt });
        } catch (e) { toast({ variant: 'destructive', title: 'No se pudo entrar', description: e.message }); }
    };

    // Colgar: siempre se registra la salida. La nota se pide solo a quien
    // convocó — al invitado que se va antes no le corresponde cerrar nada.
    const colgar = useCallback(async () => {
        const actual = enSala?.reunion;
        setEnSala(null);
        if (!actual) return;
        try { await salirReunionApi(getSessionId(), actual.id); } catch { /* da igual */ }
        if (actual.creadoPor === yo) setPedirNota(actual); else cargar();
    }, [enSala, yo, cargar]);

    const cancelar = async (reunion) => {
        if (!window.confirm(`¿Cancelar «${reunion.titulo}»?\n\nSe avisa a los invitados. La reunión queda en el historial como cancelada.`)) return;
        try {
            await cancelarReunionApi(getSessionId(), reunion.id);
            toast({ title: 'Reunión cancelada' });
            cargar();
        } catch { toast({ variant: 'destructive', title: 'No se pudo cancelar' }); }
    };

    // ── LA SALA ───────────────────────────────────────────────────────
    // Una sola caja, no dos. Antes el video traía su propio marco redondeado
    // adentro del marco de la pantalla: se veía una caja dentro de otra, con
    // dos grises que no calzaban. Ahora el borde y el fondo los pone esta
    // pantalla y el video llena el resto sin adornos.
    //
    // La barra de arriba dice lo único que hay que saber mientras se habla: de
    // qué es la reunión, con quién, cuántos hay, y cómo salir. El nombre de la
    // sala —una tira aleatoria— no se muestra en ninguna parte.
    if (enSala) {
        const r = enSala.reunion;
        return (
            <div className="flex flex-col h-full min-h-0 rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-xl">
                <div className="flex items-center gap-3 px-4 py-2.5 shrink-0 bg-gradient-to-b from-slate-900 to-slate-900/60 border-b border-slate-800">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" title="En curso" />

                    <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold text-white truncate leading-tight">{r.titulo}</p>
                        {r.personaNombre && (
                            <p className="text-[10px] text-slate-400 truncate leading-tight">con {r.personaNombre}</p>
                        )}
                    </div>

                    {transcurrido && (
                        <span className="text-[11px] font-semibold text-slate-300 tabular-nums shrink-0"
                            title="Tiempo de la reunión">{transcurrido}</span>
                    )}

                    {r.participantes?.length > 0 && (
                        <span className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-400 shrink-0 pl-1 border-l border-slate-700"
                            title={r.participantes.map(p => p.nombre).join(', ')}>
                            <Users size={13} /> {r.participantes.length}
                        </span>
                    )}

                    <button onClick={colgar}
                        className="flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg px-3 py-1.5 text-[11px] font-bold shrink-0 transition-colors">
                        <PhoneOff size={13} /> Salir
                    </button>
                </div>

                <div className="flex-1 min-h-0">
                    <SalaJitsi
                        sala={enSala.sala} dominio={enSala.dominio} jwt={enSala.jwt}
                        titulo={r.titulo} nombreUsuario={getUser().nombre} onColgar={colgar} />
                </div>
            </div>
        );
    }

    // ── LA LISTA ──────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full min-h-0 gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex bg-slate-100 rounded-lg p-0.5">
                    {[['proximas', 'Próximas'], ['pasadas', 'Historial']].map(([v, label]) => (
                        <button key={v} onClick={() => setCuando(v)}
                            className={`px-3 py-1.5 rounded-md text-[11px] font-black uppercase tracking-widest transition-colors ${
                                cuando === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                            {label}
                        </button>
                    ))}
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setCrear('agendar')}
                        className="flex items-center gap-1.5 bg-white border border-[#efe8dd] hover:border-emerald-400 text-slate-600 hover:text-emerald-700 rounded-lg px-3 py-1.5 text-[12px] font-semibold">
                        <Calendar size={14} /> Agendar
                    </button>
                    <button onClick={() => setCrear('ahora')}
                        className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-3 py-1.5 text-[12px] font-bold">
                        <Video size={14} /> Reunirse ahora
                    </button>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
                {loading ? (
                    <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="animate-spin" /></div>
                ) : reuniones.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-sm gap-2 text-center px-6">
                        <VideoOff size={28} />
                        {cuando === 'proximas'
                            ? <span>No hay reuniones. Usa <span className="text-emerald-600 font-bold">Reunirse ahora</span> para abrir una sala al tiro.</span>
                            : <span>Todavía no hay reuniones en el historial.</span>}
                    </div>
                ) : reuniones.map(r => {
                    const pinta = ESTADO_PINTA[r.estado] || ESTADO_PINTA.agendada;
                    const viva = r.estado === 'agendada' || r.estado === 'en_curso';
                    return (
                        <div key={r.id}
                            className={`bg-white border rounded-xl p-3 flex flex-wrap items-center gap-3 ${
                                r.estado === 'en_curso' ? 'border-emerald-300 shadow-sm' : 'border-[#efe8dd]'}`}>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    {r.estado === 'en_curso' && <Radio size={13} className="text-emerald-600 animate-pulse shrink-0" />}
                                    <span className="text-[13px] font-bold text-slate-900 truncate">{r.titulo}</span>
                                    <span className={`text-[9px] font-black uppercase tracking-wider border rounded px-1.5 py-0.5 ${pinta.c}`}>
                                        {pinta.txt}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 mt-1 flex-wrap text-[11px] text-slate-500">
                                    <span className="flex items-center gap-1"><Clock size={11} /> {cuandoTexto(r)}</span>
                                    <span className="flex items-center gap-1">
                                        <Users size={11} /> {r.participantes.length}
                                        {r.dentro > 0 && <span className="text-emerald-600 font-bold">· {r.dentro} dentro</span>}
                                    </span>
                                    {r.personaNombre && <span className="flex items-center gap-1 truncate"><Building2 size={11} /> {r.personaNombre}</span>}
                                    {r.creadorNombre && <span className="flex items-center gap-1 truncate"><User size={11} /> {r.creadorNombre}</span>}
                                </div>
                                {r.notas && (
                                    <p className="mt-1.5 text-[11px] text-slate-600 bg-slate-50 border border-[#efe8dd] rounded-lg px-2 py-1.5 whitespace-pre-wrap">
                                        {r.notas}
                                    </p>
                                )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                {/* Un solo lugar para todo lo demás —invitar, sacar,
                                    copiar el enlace, corregir la nota, borrar— en vez
                                    de cinco botones en cada fila. */}
                                <button onClick={() => setDetalle(r)}
                                    title="Invitados, enlace, nota y más"
                                    className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-emerald-700 border border-[#efe8dd] hover:border-emerald-300 rounded-lg px-2.5 py-1.5 transition-colors">
                                    <Settings2 size={13} /> Gestionar
                                </button>
                                {viva && (
                                    <button onClick={() => entrar(r)}
                                        className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-3 py-1.5 text-[11px] font-black uppercase tracking-widest">
                                        <Video size={13} /> Entrar
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {crear && (
                <CrearReunionModal
                    onClose={() => setCrear(null)}
                    ahoraPorDefecto={crear === 'ahora'}
                    usuarios={usuarios}
                    onCreada={(reunion, entrarYa) => {
                        cargar();
                        // Si la abrió para ahora, entra sola: pedirle un clic más
                        // después de decir "reunirse ahora" no tiene sentido.
                        if (entrarYa) entrar(reunion);
                    }}
                />
            )}

            {detalle && (
                <DetalleReunion
                    reunion={detalle}
                    usuarios={usuarios}
                    onCerrar={() => setDetalle(null)}
                    onCambio={cargar}
                    onEntrar={(r) => { setDetalle(null); entrar(r); }}
                />
            )}

            {pedirNota && (
                <NotaFinalModal
                    reunion={pedirNota}
                    onListo={() => { setPedirNota(null); cargar(); }}
                    onSaltar={() => { setPedirNota(null); cargar(); }}
                />
            )}
        </div>
    );
};

export default ReunionesPanel;
