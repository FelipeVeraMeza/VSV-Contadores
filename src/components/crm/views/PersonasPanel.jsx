import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Search, User, Phone, Mail, Loader2, UserPlus, RefreshCw, ArrowRightCircle, Trash2, RotateCcw, CheckCircle2, X, UserMinus, AlertTriangle, FileSpreadsheet, CalendarClock, ChevronDown, Check } from 'lucide-react';
import {
    listarPersonasApi, cambiarEstadoPersonaApi, eliminarPersonaApi,
    actualizarPersonaApi, obtenerPersonaApi, agregarNotaPersonaApi,
    listarAccionesApi, crearAccionApi, completarAccionApi,
} from '@/services/personaService';
import { toast } from '@/components/ui/use-toast';
import PlantillaRapida from '@/components/crm/PlantillaRapida';
import PersonaDetailDrawer from '../modals/PersonaDetailDrawer';
import ConvertirClienteModal from '../modals/ConvertirClienteModal';
import ImportarProspectosModal from '../modals/ImportarProspectosModal';

const getUser = () => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); }
    catch { return {}; }
};
const getSessionId = () => getUser().sessionId;

const ESTADO_STYLE = {
    prospecto: 'text-amber-600 border-amber-400/30 bg-amber-400/10',
    activo: 'text-emerald-600 border-emerald-400/30 bg-emerald-400/10',
    inactivo: 'text-slate-500 border-gray-400/30 bg-gray-400/10',
    perdido: 'text-red-500 border-red-400/30 bg-red-400/10',
};

const ESTADOS = ['Todos', 'prospecto', 'activo', 'inactivo', 'perdido'];

// Días sin contacto para considerar un lead "estancado"
const DIAS_ESTANCADO = 15;
const diasDesde = (fecha) => {
    if (!fecha) return null;
    const d = new Date(fecha);
    if (isNaN(d)) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
};

// --- Cuándo hay que contactar ------------------------------------------------
// `proximo_contacto` es timestamptz y llega como "2026-08-06T00:00:00.000Z".
// Se toma el día tal cual viene y se rearma en horario local: pasarlo por
// `new Date(...)` a secas lo corre un día hacia atrás en Chile (UTC-4) y una
// llamada agendada para el 6 aparecería como el 5.
const soloFecha = (valor) => {
    if (!valor) return null;
    const m = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(valor);
    return isNaN(d) ? null : d;
};
// Días que faltan. Negativo = ya se pasó la fecha.
const diasHasta = (d) => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - hoy.getTime()) / 86400000);
};

// La fecha sola no dice nada a las 9 de la mañana con 80 prospectos al frente.
// Lo que se necesita saber de un vistazo es a quién le toca HOY y a quién se le
// pasó la fecha, así que el color y el "hace 3d" van junto al dato.
const CuandoContactar = ({ valor, estado }) => {
    const d = soloFecha(valor);
    if (!d) return <span className="text-[10px] text-slate-400">—</span>;

    // Un perdido o un inactivo no está "atrasado": no se le sigue.
    const enCarrera = estado === 'prospecto' || estado === 'activo';
    const dias = diasHasta(d);

    const tono = !enCarrera ? 'text-slate-500 border-[#efe8dd] bg-slate-50'
        : dias < 0 ? 'text-red-600 border-red-400/30 bg-red-400/10'
        : dias === 0 ? 'text-amber-700 border-amber-400/40 bg-amber-400/15'
        : dias <= 7 ? 'text-emerald-700 border-emerald-400/30 bg-emerald-400/10'
        : 'text-slate-600 border-[#efe8dd] bg-slate-50';

    const cuando = !enCarrera ? null
        : dias < 0 ? `vencido hace ${Math.abs(dias)}d`
        : dias === 0 ? 'hoy'
        : dias === 1 ? 'mañana'
        : `en ${dias}d`;

    return (
        <div className="flex flex-col items-start gap-0.5">
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap ${tono}`}>
                <CalendarClock size={10} /> {d.toLocaleDateString('es-CL')}
            </span>
            {cuando && <span className="text-[9px] text-slate-400">{cuando}</span>}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Atajos de contacto
// ---------------------------------------------------------------------------
const soloDigitos = (t) => String(t || '').replace(/\D/g, '');
const tel1 = (p) => (p.telefonos || [])[0] || '';
const correo1 = (p) => (p.correos || [])[0] || '';

// wa.me quiere el número con código de país y sin signos. Los teléfonos chilenos
// se cargan de mil formas ("+56 9 1234 5678", "912345678", "56912345678"); se
// normaliza acá para que el enlace no falle según cómo lo escribió cada uno.
const enlaceWhatsapp = (tel) => {
    let n = soloDigitos(tel);
    if (n.length === 8) n = `569${n}`;          // 12345678
    else if (n.length === 9 && n.startsWith('9')) n = `56${n}`;   // 912345678
    else if (n.length === 11 && n.startsWith('56')) n = n;        // 56912345678
    return `https://wa.me/${n}`;
};

// El <input type="datetime-local"> quiere "aaaa-mm-ddThh:mm" en hora LOCAL.
// Un toISOString() acá corre la hora: guardarías las 13:30 y verías las 17:30.
const aDatetimeLocal = (v) => {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

// Las acciones que Mati pidió por nombre.
//
// OJO CON `tipo`: el servidor solo acepta llamar | reunion | seguimiento |
// prospectar | otro, y lo que no esté en esa lista lo guarda como «otro» SIN
// avisar. Por eso el tipo va mapeado a uno válido y el detalle («1ª vez»,
// «cotización») viaja en el título, que es lo que se lee en pantalla.
const ACCIONES_RAPIDAS = [
    { tipo: 'prospectar',  label: 'Prospectar 1ª vez' },
    { tipo: 'prospectar',  label: 'Prospectar 2ª vez' },
    { tipo: 'prospectar',  label: 'Prospectar 3ª vez' },
    { tipo: 'reunion',     label: 'Agendar reunión' },
    { tipo: 'llamar',      label: 'Llamar' },
    { tipo: 'seguimiento', label: 'Enviar WhatsApp' },
    { tipo: 'seguimiento', label: 'Enviar cotización' },
];

const cuando = (v) => {
    if (!v) return '';
    const d = new Date(v);
    return d.toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

// ---------------------------------------------------------------------------
// El prospecto por dentro: lo que antes obligaba a abrir la ficha
// ---------------------------------------------------------------------------
const PanelProspecto = ({ persona, datos, onNota, onAccion, onCompletarAccion,
                          onConvertir, onEstado, onEliminar }) => {
    const [nota, setNota] = useState('');
    const [guardando, setGuardando] = useState(false);
    const ultima = datos?.notas?.[0];
    const pendientes = (datos?.acciones || []).filter(a => a.estado !== 'completada');

    const enviar = async () => {
        const t = nota.trim();
        if (!t || guardando) return;
        setGuardando(true);
        setNota('');
        try { await onNota(t); } finally { setGuardando(false); }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* NOTAS */}
            <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Notas</p>
                {!datos ? (
                    <Loader2 size={13} className="animate-spin text-slate-300" />
                ) : ultima ? (
                    <div className="bg-white border border-[#efe8dd] rounded-lg px-2.5 py-2 mb-1.5">
                        <p className="text-[11px] text-slate-700 whitespace-pre-wrap leading-snug">{ultima.texto}</p>
                        {/* El servidor manda `fecha` ya formateada a la chilena y
                            `autor`. No son `createdAt`/`usuarioNombre`: leerlas así
                            dejaba la línea de abajo en blanco. */}
                        <p className="text-[9px] text-slate-400 mt-1">
                            {ultima.fecha}{ultima.autor ? ` · ${ultima.autor}` : ''}
                            {datos.notas.length > 1 && ` · ${datos.notas.length - 1} más`}
                        </p>
                    </div>
                ) : (
                    <p className="text-[10px] text-slate-400 italic mb-1.5">Sin notas todavía.</p>
                )}
                <div className="flex gap-1.5">
                    <input value={nota} onChange={(e) => setNota(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') enviar(); }}
                        placeholder="Anotar algo rápido y Enter…"
                        className="flex-1 bg-white border border-[#efe8dd] rounded-lg px-2 py-1.5 text-[11px] outline-none focus:border-emerald-500" />
                    <button onClick={enviar} disabled={!nota.trim() || guardando}
                        className="px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white">
                        {guardando ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    </button>
                </div>
            </div>

            {/* ACCIONES */}
            <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Acciones</p>
                {pendientes.length > 0 && (
                    <div className="space-y-1 mb-1.5">
                        {pendientes.slice(0, 3).map(a => (
                            <div key={a.id} className="flex items-center gap-1.5 bg-white border border-[#efe8dd] rounded-lg px-2 py-1">
                                <button onClick={() => onCompletarAccion(a)} title="Marcar hecha"
                                    className="text-slate-300 hover:text-emerald-600 shrink-0"><Check size={12} /></button>
                                <span className="text-[10px] text-slate-700 truncate flex-1">{a.titulo}</span>
                                {a.fechaHora && <span className="text-[9px] text-slate-400 shrink-0">{cuando(a.fechaHora)}</span>}
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex flex-wrap gap-1">
                    {ACCIONES_RAPIDAS.map(a => (
                        <button key={a.tipo} onClick={() => onAccion(a)}
                            title={`Agendar «${a.label}» para este prospecto`}
                            className="text-[9px] font-bold px-2 py-1 rounded-lg bg-white border border-[#efe8dd] text-slate-600 hover:border-emerald-500/60 hover:text-emerald-700 transition-colors">
                            + {a.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ORIGEN Y ESTADO · lo que antes eran dos columnas de la tabla */}
            <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Origen y estado</p>
                <p className="text-[10px] text-slate-600 mb-2">
                    Origen: <b className="uppercase tracking-widest">{persona.origen || '—'}</b>
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                    {persona.estado === 'prospecto' && (
                        <button onClick={onConvertir} title="Convertir a Cliente (crea su empresa)"
                            className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 px-2 py-1 rounded-lg">
                            <ArrowRightCircle size={12} /> Convertir
                        </button>
                    )}
                    {(persona.estado === 'prospecto' || persona.estado === 'activo') && (
                        <button onClick={(e) => onEstado(e, 'perdido')} title="Marcar como perdido (con motivo)"
                            className="text-slate-500 hover:text-red-500 p-1.5 rounded-lg"><UserMinus size={13} /></button>
                    )}
                    {persona.estado === 'activo' && (
                        <button onClick={(e) => onEstado(e, 'inactivo')} title="Marcar Inactivo"
                            className="text-slate-500 hover:text-orange-400 p-1.5 rounded-lg"><RotateCcw size={13} /></button>
                    )}
                    {(persona.estado === 'inactivo' || persona.estado === 'perdido') && (
                        <button onClick={(e) => onEstado(e, 'prospecto')} title="Reactivar como prospecto"
                            className="text-slate-500 hover:text-emerald-600 p-1.5 rounded-lg"><ArrowRightCircle size={13} /></button>
                    )}
                    <button onClick={onEliminar} title="Eliminar"
                        className="text-slate-500 hover:text-red-500 p-1.5 rounded-lg"><Trash2 size={13} /></button>
                </div>
            </div>
        </div>
    );
};

const PersonasPanel = ({ reloadKey = 0, onCrear }) => {
    const navigate = useNavigate();
    const [personas, setPersonas] = useState([]);
    const [loading, setLoading] = useState(true);
    // Por defecto solo prospectos: al convertir a cliente, la persona sale de esta vista.
    const [estado, setEstado] = useState('prospecto');
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState(null);
    const [personaAConvertir, setPersonaAConvertir] = useState(null);
    const [importando, setImportando] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [miCartera, setMiCartera] = useState(false);
    // Cómo se ordena la lista. Por omisión lo más nuevo primero, que es como
    // venía; «a quién contactar» la ordena por la fecha de próximo contacto y
    // convierte la lista en la agenda del día.
    const [orden, setOrden] = useState('recientes');

    // ---- Trabajar sin salir de la lista ----
    // `expandido` es el prospecto abierto; `panel` guarda sus notas y acciones
    // ya cargadas, para no volver a pedirlas al cerrarlo y abrirlo de nuevo.
    const [expandido, setExpandido] = useState(null);
    const [panel, setPanel] = useState({});
    const [editando, setEditando] = useState(null);   // { id, campo }
    const [borrador, setBorrador] = useState('');
    const userId = getUser().id || null;
    // Un usuario normal ya recibe solo su propia cartera desde el servidor;
    // el filtro solo tiene sentido para el Administrador, que ve la del equipo.
    const esAdmin = getUser().rol === 'Administrador';

    const cargar = useCallback(async () => {
        setLoading(true);
        try {
            const res = await listarPersonasApi(getSessionId(), { orden });
            const data = await res.json();
            if (data.success) setPersonas(data.personas || []);
        } catch {
            setPersonas([]);
        } finally {
            setLoading(false);
        }
        // `orden` va en las dependencias: sin él, `cargar` se quedaría con el
        // valor de la primera vez y cambiar el orden no pediría nada al servidor.
    }, [orden]);

    useEffect(() => { cargar(); }, [cargar, reloadKey]);

    // ---- Editar en la propia fila ----
    // Se actualiza primero en pantalla y después se manda: corregir una palabra
    // no puede sentirse como esperar al servidor. Si falla, se recarga y se
    // avisa, que es mejor que dejar en pantalla algo que no se guardó.
    const guardarCampo = async (p, campo, valor) => {
        setEditando(null);
        const previo = p[campo];
        const limpio = campo === 'proximoContacto'
            ? (valor ? new Date(valor).toISOString() : null)
            : (valor || '').trim();
        if (String(previo || '') === String(limpio || '')) return;

        setPersonas(prev => prev.map(x => x.id === p.id ? { ...x, [campo]: limpio } : x));
        try {
            const r = await actualizarPersonaApi(getSessionId(), p.id, { [campo]: limpio });
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
        } catch (e) {
            toast({ variant: 'destructive', title: 'No se pudo guardar', description: e.message });
            cargar();
        }
    };

    // ---- El panel del prospecto ----
    const abrirPanel = async (id) => {
        if (expandido === id) { setExpandido(null); return; }
        setExpandido(id);
        if (panel[id]) return;              // ya cargado, no se vuelve a pedir
        try {
            const [rp, ra] = await Promise.all([
                obtenerPersonaApi(getSessionId(), id),
                listarAccionesApi(getSessionId(), id),
            ]);
            const [dp, da] = await Promise.all([rp.json(), ra.json()]);
            setPanel(prev => ({
                ...prev,
                [id]: { notas: dp?.persona?.notas || [], acciones: da?.acciones || [] },
            }));
        } catch {
            setPanel(prev => ({ ...prev, [id]: { notas: [], acciones: [] } }));
        }
    };

    const agregarNota = async (p, texto) => {
        try {
            const r = await agregarNotaPersonaApi(getSessionId(), p.id, texto);
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            // La nota nueva va arriba: el panel muestra la última primero.
            setPanel(prev => ({
                ...prev,
                [p.id]: {
                    ...prev[p.id],
                    notas: [d.nota || { texto, fecha: new Date().toLocaleString('es-CL') }, ...(prev[p.id]?.notas || [])],
                },
            }));
        } catch (e) {
            toast({ variant: 'destructive', title: 'No se pudo anotar', description: e.message });
        }
    };

    const crearAccionRapida = async (p, accion) => {
        try {
            const r = await crearAccionApi(getSessionId(), p.id, {
                tipo: accion.tipo,
                titulo: `${accion.label} — ${p.nombreCompleto || 'prospecto'}`,
            });
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            setPanel(prev => ({
                ...prev,
                [p.id]: { ...prev[p.id], acciones: [d.accion, ...(prev[p.id]?.acciones || [])] },
            }));
            toast({ title: accion.label, description: 'Acción agendada.' });
            // Crear una acción puede mover el próximo contacto en el servidor.
            cargar();
        } catch (e) {
            toast({ variant: 'destructive', title: 'No se pudo agendar', description: e.message });
        }
    };

    const completarAccionPanel = async (p, a) => {
        setPanel(prev => ({
            ...prev,
            [p.id]: {
                ...prev[p.id],
                acciones: (prev[p.id]?.acciones || []).map(x => x.id === a.id ? { ...x, estado: 'completada' } : x),
            },
        }));
        try { await completarAccionApi(getSessionId(), a.id); }
        catch { toast({ variant: 'destructive', title: 'No se pudo marcar como hecha' }); }
    };

    // Al inactivar o marcar perdido se pide un motivo (queda en el historial)
    const pideMotivo = (estado) => estado === 'inactivo' || estado === 'perdido';
    const convertir = async (e, p, nuevoEstado) => {
        e.stopPropagation();
        let motivo = '';
        if (pideMotivo(nuevoEstado)) {
            motivo = window.prompt(`Motivo de "${nuevoEstado}" (opcional):`, '') ?? '';
        }
        try {
            const r = await cambiarEstadoPersonaApi(getSessionId(), p.id, nuevoEstado, motivo);
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            toast({ title: nuevoEstado === 'activo' ? 'Pasó a Cliente Activo' : nuevoEstado === 'perdido' ? 'Marcado como perdido' : 'Estado actualizado' });
            cargar();
        } catch (err) { toast({ variant: 'destructive', title: 'Error', description: err.message }); }
    };
    const eliminar = async (e, p) => {
        e.stopPropagation();
        if (!window.confirm(`¿Eliminar definitivamente a "${p.nombreCompleto || 'este cliente'}"?`)) return;
        try {
            const r = await eliminarPersonaApi(getSessionId(), p.id);
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            toast({ title: 'Eliminado' });
            cargar();
        } catch (err) { toast({ variant: 'destructive', title: 'Error', description: err.message }); }
    };

    // ---- Selección múltiple ----
    const toggleRow = (id, e) => {
        e.stopPropagation();
        setSelectedIds(prev => {
            const n = new Set(prev);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });
    };
    const clearSel = () => setSelectedIds(new Set());

    const bulkEstado = async (nuevo) => {
        const ids = [...selectedIds];
        let motivo = '';
        if (pideMotivo(nuevo)) {
            motivo = window.prompt(`Motivo de "${nuevo}" para ${ids.length} prospecto(s) (opcional):`, '') ?? '';
        }
        let ok = 0, sin = 0;
        for (const id of ids) {
            try {
                const r = await cambiarEstadoPersonaApi(getSessionId(), id, nuevo, motivo);
                const d = await r.json();
                if (d.success) ok++; else sin++;
            } catch { sin++; }
        }
        toast({ title: `${ok} actualizado(s)`, description: sin ? `${sin} ya estaban en ese estado` : undefined });
        clearSel();
        cargar();
    };

    const bulkEliminar = async () => {
        if (!window.confirm(`¿Eliminar definitivamente ${selectedIds.size} prospecto(s)? Esta acción no se puede deshacer.`)) return;
        const ids = [...selectedIds];
        let ok = 0, fail = 0;
        for (const id of ids) {
            try {
                const r = await eliminarPersonaApi(getSessionId(), id);
                const d = await r.json();
                if (d.success) ok++; else fail++;
            } catch { fail++; }
        }
        toast({ title: `${ok} eliminado(s)`, description: fail ? `${fail} no se pudieron eliminar` : undefined });
        clearSel();
        cargar();
    };

    const conteos = useMemo(() => {
        const c = { Todos: personas.length, prospecto: 0, activo: 0, inactivo: 0 };
        personas.forEach(p => { c[p.estado] = (c[p.estado] || 0) + 1; });
        return c;
    }, [personas]);

    const lista = useMemo(() => {
        const term = search.trim().toLowerCase();
        return personas
            .filter(p => estado === 'Todos' || p.estado === estado)
            .filter(p => !miCartera || (userId && p.ejecutivoId === userId))
            .filter(p => {
                if (!term) return true;
                return (
                    (p.nombreCompleto || '').toLowerCase().includes(term) ||
                    (p.rut || '').toLowerCase().includes(term) ||
                    (p.correos || []).some(c => c.toLowerCase().includes(term)) ||
                    (p.telefonos || []).some(t => t.replace(/\D/g, '').includes(term.replace(/\D/g, '')))
                );
            });
    }, [personas, estado, search, miCartera, userId]);

    // Al cambiar de filtro, la selección se limpia (evita operar sobre filas ocultas)
    useEffect(() => { setSelectedIds(new Set()); }, [estado, miCartera]);
    const allSelected = lista.length > 0 && lista.every(p => selectedIds.has(p.id));
    const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(lista.map(p => p.id)));

    return (
        <div className="flex-1 min-h-0 flex flex-col gap-3 lg:gap-4 h-full">
            {/* Toolbar */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-3 flex-shrink-0">
                <div className="flex items-center gap-2 flex-wrap flex-1">
                    {ESTADOS.map(e => (
                        <button key={e} onClick={() => setEstado(e)}
                            className={`px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all ${estado === e ? 'bg-emerald-50 border-[#199b4d]/40 text-[#199b4d]' : 'bg-white border-[#efe8dd] text-slate-500 hover:text-slate-900'}`}>
                            {e === 'Todos' ? 'Todos' : e} <span className="ml-1 px-1.5 rounded bg-slate-50">{conteos[e] || 0}</span>
                        </button>
                    ))}
                    {esAdmin && (
                        <button onClick={() => setMiCartera(v => !v)} title="Ver solo mis prospectos"
                            className={`px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all ${miCartera ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white border-[#efe8dd] text-slate-500 hover:text-slate-900'}`}>
                            Mi cartera
                        </button>
                    )}
                    {/* A QUIÉN CONTACTAR HOY.
                        La lista salía siempre por fecha de creación, que es el
                        orden en que se cargaron y no le sirve a nadie por la
                        mañana. Con 128 prospectos que ya tienen fecha de próximo
                        contacto, ordenar por ella es lo que convierte esta
                        pantalla en la agenda del día. */}
                    <button
                        onClick={() => setOrden(o => o === 'contacto' ? 'recientes' : 'contacto')}
                        title={orden === 'contacto'
                            ? 'Volver al orden por fecha de creación'
                            : 'Ordenar por la fecha en que hay que contactar'}
                        className={`px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all inline-flex items-center gap-1.5 ${
                            orden === 'contacto' ? 'bg-emerald-600 border-emerald-500 text-white'
                                                 : 'bg-white border-[#efe8dd] text-slate-500 hover:text-slate-900'}`}>
                        <CalendarClock size={12} /> A quién contactar
                    </button>
                    <button onClick={cargar} title="Recargar" className="p-2 rounded-lg border border-[#efe8dd] bg-slate-50 text-slate-500 hover:text-slate-900">
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
                <div className="flex gap-2">
                    <div className="relative flex-1 lg:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, RUT, correo o teléfono..."
                            className="w-full bg-slate-50 border border-[#efe8dd] rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500 placeholder:text-slate-500" />
                    </div>
                    {/* Cargar una planilla completa. Los prospectos que traes
                        quedan en TU cartera, no en un montón común. */}
                    <button onClick={() => setImportando(true)} title="Importar prospectos desde una planilla"
                        className="flex items-center gap-1.5 shrink-0 bg-white border border-[#efe8dd] hover:border-emerald-500/50 text-slate-600 hover:text-emerald-700 rounded-xl px-3 text-[10px] font-black uppercase tracking-widest transition-colors">
                        <FileSpreadsheet size={13} /> <span className="hidden sm:inline">Importar</span>
                    </button>
                </div>
            </div>

            {/* Barra de acciones en lote */}
            {selectedIds.size > 0 && (
                <div className="flex items-center flex-wrap gap-2 flex-shrink-0 bg-blue-600/15 border border-blue-500/30 rounded-xl px-3 py-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-700">{selectedIds.size} seleccionado(s)</span>
                    <div className="h-4 w-px bg-slate-100 mx-1" />
                    <button onClick={() => bulkEstado('activo')} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-700 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-lg transition-colors">
                        <CheckCircle2 size={12} /> Activar
                    </button>
                    <button onClick={() => bulkEstado('inactivo')} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-700 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1 rounded-lg transition-colors">
                        <RotateCcw size={12} /> Inactivar
                    </button>
                    <button onClick={() => bulkEstado('perdido')} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-red-600 hover:text-red-200 bg-red-500/10 hover:bg-red-500/20 px-2.5 py-1 rounded-lg transition-colors">
                        <UserMinus size={12} /> Perder
                    </button>
                    <button onClick={bulkEliminar} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-red-600 hover:text-slate-900 bg-red-600/20 hover:bg-red-600 px-2.5 py-1 rounded-lg transition-colors">
                        <Trash2 size={12} /> Eliminar
                    </button>
                    <button onClick={clearSel} className="ml-auto flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 transition-colors">
                        <X size={12} /> Limpiar
                    </button>
                </div>
            )}

            {/* Tabla + Ficha */}
            <div className="flex-1 min-h-0 flex gap-4 items-stretch">
            <div className={`min-h-[420px] overflow-hidden rounded-2xl border border-[#efe8dd] bg-white flex flex-col transition-all ${selectedId ? 'lg:w-3/5' : 'w-full'}`}>
                <div className="overflow-auto flex-1 scrollbar-hide">
                    <table className="w-full min-w-[760px] text-left border-collapse">
                        <thead className="bg-white sticky top-0 z-10">
                            <tr className="border-b border-[#efe8dd] text-[10px] uppercase tracking-widest text-slate-500">
                                <th className="pl-3 pr-1 py-2.5 w-8">
                                    <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Seleccionar todos" className="w-3.5 h-3.5 accent-blue-500 cursor-pointer" />
                                </th>
                                {/* «Origen» y «Acciones» salieron de la tabla: ahora viven
                                    DENTRO del prospecto, en el panel que se abre con la
                                    flecha. Eran dos columnas que se miraban poco y le
                                    quitaban ancho a lo que sí se usa todos los días. */}
                                <th className="px-4 py-2.5 font-black">Cliente</th>
                                <th className="px-4 py-2.5 font-black">Contacto</th>
                                <th className="px-4 py-2.5 font-black">Qué necesita</th>
                                <th className="px-4 py-2.5 font-black">Contactar</th>
                                <th className="px-4 py-2.5 font-black">Estado</th>
                                <th className="px-4 py-2.5 font-black w-8"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="8" className="p-8 text-center text-slate-500"><Loader2 size={20} className="animate-spin inline" /></td></tr>
                            ) : lista.length === 0 ? (
                                <tr><td colSpan="8" className="p-8 text-center text-slate-500 text-sm">No hay registros para este filtro. Usa <span className="text-blue-600 font-bold">+ Crear Prospecto</span>.</td></tr>
                            ) : lista.map(p => (
                                <React.Fragment key={p.id}>
                                <tr onClick={() => setSelectedId(p.id)} className={`border-b border-[#efe8dd] hover:bg-white/[0.04] transition-colors cursor-pointer ${selectedId === p.id ? 'bg-blue-500/10' : selectedIds.has(p.id) ? 'bg-blue-500/[0.06]' : ''}`}>
                                    <td className="pl-3 pr-1 py-2.5" onClick={(e) => toggleRow(p.id, e)}>
                                        <input type="checkbox" checked={selectedIds.has(p.id)} onChange={(e) => toggleRow(p.id, e)} onClick={(e) => e.stopPropagation()} aria-label="Seleccionar" className="w-3.5 h-3.5 accent-blue-500 cursor-pointer" />
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-[#efe8dd] flex items-center justify-center text-blue-600 shrink-0">
                                                <User size={15} />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-slate-900 text-xs">{p.nombreCompleto || <span className="text-slate-500 italic">(sin nombre)</span>}</span>
                                                {p.rut && <span className="text-[10px] text-slate-500 font-mono">{p.rut}</span>}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <div className="flex flex-col gap-0.5">
                                            {(p.telefonos || []).slice(0, 1).map((t, i) => (
                                                <span key={i} className="flex items-center gap-1 text-[10px] text-emerald-600"><Phone size={10} /> {t}</span>
                                            ))}
                                            {(p.correos || []).slice(0, 1).map((c, i) => (
                                                <span key={i} className="flex items-center gap-1 text-[10px] text-slate-500 truncate max-w-[180px]"><Mail size={10} /> {c}</span>
                                            ))}
                                    {(p.telefonos || []).length === 0 && (p.correos || []).length === 0 && (
                                                <span className="text-[10px] text-slate-500 italic">Sin contacto</span>
                                            )}

                                            {/* WHATSAPP · CORREO · LLAMAR
                                                Tres atajos para no copiar y pegar el número.
                                                WhatsApp abre la conversación (en la app o en
                                                web.whatsapp) y desde ahí se puede llamar;
                                                iniciar la llamada de WhatsApp desde el
                                                navegador no es algo que se pueda hacer por
                                                código. El teléfono marca por línea normal. */}
                                            {(tel1(p) || correo1(p)) && (
                                                <span className="flex items-center gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
                                                    {/* Ya no abren la conversación en blanco: abren la
                                                        viñeta con las plantillas de Comunicaciones, que
                                                        era lo que faltaba del ticket. «Abrir en blanco»
                                                        sigue estando dentro, primero de la lista. */}
                                                    {tel1(p) && (
                                                        <PlantillaRapida via="whatsapp" persona={p}
                                                            destino={enlaceWhatsapp(tel1(p))}
                                                            titulo={`WhatsApp a ${tel1(p)} — con plantillas`} />
                                                    )}
                                                    {correo1(p) && (
                                                        <PlantillaRapida via="correo" persona={p}
                                                            destino={correo1(p)}
                                                            titulo={`Escribir a ${correo1(p)} — con plantillas`} />
                                                    )}
                                                    {tel1(p) && (
                                                        <a href={`tel:${soloDigitos(tel1(p))}`}
                                                            title={`Llamar por línea telefónica a ${tel1(p)}`}
                                                            className="h-6 w-6 flex items-center justify-center rounded-md text-blue-600 hover:bg-blue-500/10">
                                                            <Phone size={13} />
                                                        </a>
                                                    )}
                                                </span>
                                            )}
                                            {/* Estancado: sin fecha agendada y hace rato sin hablarle.
                                                El atraso de los que SÍ tienen fecha lo muestra la
                                                columna "Contactar", no se repite acá. */}
                                            {(() => {
                                                const activoParaSeguir = p.estado === 'prospecto' || p.estado === 'activo';
                                                const dUlt = diasDesde(p.fechaUltimoContacto);
                                                if (!activoParaSeguir || p.proximoContacto) return null;
                                                if (dUlt === null || dUlt < DIAS_ESTANCADO) return null;
                                                return (
                                                    <span className="flex items-center gap-1 text-[9px] font-bold text-amber-700"><AlertTriangle size={9} /> {dUlt}d sin contacto</span>
                                                );
                                            })()}
                                        </div>
                                    </td>
                                    {/* QUÉ NECESITA · editable en la propia fila.
                                        Antes había que abrir la ficha para corregir una
                                        palabra. Un clic sobre el texto lo convierte en
                                        campo; Enter guarda, Escape cancela. */}
                                    <td className="px-4 py-2.5 text-xs text-slate-600 max-w-[260px]"
                                        onClick={(e) => e.stopPropagation()}>
                                        {editando?.id === p.id && editando.campo === 'necesidad' ? (
                                            <input
                                                autoFocus
                                                value={borrador}
                                                onChange={(e) => setBorrador(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') guardarCampo(p, 'necesidad', borrador);
                                                    if (e.key === 'Escape') setEditando(null);
                                                }}
                                                onBlur={() => guardarCampo(p, 'necesidad', borrador)}
                                                className="w-full bg-white border border-emerald-500 rounded px-2 py-1 text-xs outline-none"
                                            />
                                        ) : (
                                            (() => {
                                                // Campo propio "qué necesita"; si está vacío, cae al respaldo antiguo
                                                // (primera línea de observaciones) para prospectos previos a la columna.
                                                const nec = (p.necesidad || '').trim();
                                                const obs = (p.observaciones || '').trim();
                                                const linea = obs ? obs.split('\n')[0].replace(/^necesita:\s*/i, '') : '';
                                                const texto = nec || linea || p.rubro || '';
                                                return (
                                                    <span
                                                        onClick={() => { setEditando({ id: p.id, campo: 'necesidad' }); setBorrador(nec || linea || ''); }}
                                                        title="Pulsa para editar"
                                                        className="block truncate cursor-text hover:bg-emerald-500/5 rounded px-1 -mx-1">
                                                        {texto || <span className="text-slate-400">— anotar —</span>}
                                                    </span>
                                                );
                                            })()
                                        )}
                                        {p.rubro && <span className="block text-[9px] text-slate-500 truncate">🏷️ {p.rubro}</span>}
                                        {p.ejecutivoNombre && <span className="block text-[9px] text-slate-500">👤 {p.ejecutivoNombre}</span>}
                                    </td>

                                    {/* CONTACTAR · editable sin salir de la lista. */}
                                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                                        {editando?.id === p.id && editando.campo === 'proximoContacto' ? (
                                            <input
                                                autoFocus
                                                type="datetime-local"
                                                value={borrador}
                                                onChange={(e) => setBorrador(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') guardarCampo(p, 'proximoContacto', borrador);
                                                    if (e.key === 'Escape') setEditando(null);
                                                }}
                                                onBlur={() => guardarCampo(p, 'proximoContacto', borrador)}
                                                className="bg-white border border-emerald-500 rounded px-2 py-1 text-[10px] outline-none"
                                            />
                                        ) : (
                                            <span
                                                onClick={() => { setEditando({ id: p.id, campo: 'proximoContacto' }); setBorrador(aDatetimeLocal(p.proximoContacto)); }}
                                                title="Pulsa para cambiar cuándo contactarlo"
                                                className="block cursor-text hover:bg-emerald-500/5 rounded px-1 -mx-1">
                                                <CuandoContactar valor={p.proximoContacto} estado={p.estado} />
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase ${ESTADO_STYLE[p.estado] || ESTADO_STYLE.inactivo}`}>{p.estado}</span>
                                    </td>
                                    <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                                        <button onClick={() => abrirPanel(p.id)}
                                            title={expandido === p.id ? 'Cerrar' : 'Notas, acciones y más'}
                                            className={`h-7 w-7 flex items-center justify-center rounded-lg transition-colors ${
                                                expandido === p.id ? 'bg-emerald-500/15 text-emerald-700' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}>
                                            <ChevronDown size={15} className={`transition-transform ${expandido === p.id ? 'rotate-180' : ''}`} />
                                        </button>
                                    </td>
                                </tr>
                                {/* ═══ EL PROSPECTO POR DENTRO ═══
                                    Acá viven ahora el origen y los botones de estado que
                                    antes eran columnas, más lo que pedía Mati: la última
                                    nota con su fecha, una caja para anotar rápido sin
                                    abrir nada, y las acciones tipificadas. La agenda de
                                    acciones ya existía en la ficha y tenía CERO uso: nadie
                                    entra a la ficha estando a full. */}
                                {expandido === p.id && (
                                    <tr key={`${p.id}-panel`} className="bg-slate-50/70 border-b border-[#efe8dd]">
                                        <td colSpan="7" className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                            <PanelProspecto
                                                persona={p}
                                                datos={panel[p.id]}
                                                onNota={(texto) => agregarNota(p, texto)}
                                                onAccion={(tipo) => crearAccionRapida(p, tipo)}
                                                onCompletarAccion={(a) => completarAccionPanel(p, a)}
                                                onConvertir={() => setPersonaAConvertir(p)}
                                                onEstado={(e, estado) => convertir(e, p, estado)}
                                                onEliminar={(e) => eliminar(e, p)}
                                            />
                                        </td>
                                    </tr>
                                )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {importando && (
                <ImportarProspectosModal
                    onClose={() => setImportando(false)}
                    onImportado={cargar}
                />
            )}

            <AnimatePresence>
                {selectedId && (
                    <PersonaDetailDrawer
                        personaId={selectedId}
                        onClose={() => setSelectedId(null)}
                        onChanged={cargar}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {personaAConvertir && (
                    <ConvertirClienteModal
                        persona={personaAConvertir}
                        onClose={() => setPersonaAConvertir(null)}
                        onConverted={() => {
                            cargar();
                            navigate('/CRM?sub=list');
                        }}
                    />
                )}
            </AnimatePresence>
            </div>
        </div>
    );
};

export default PersonasPanel;
