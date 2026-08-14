// =====================================================================
// ÁRBOL · las tareas con su jerarquía a la vista
// ---------------------------------------------------------------------
// POR QUÉ EXISTE
// La lista pide `soloRaiz`, así que de 59 tareas mostraba 10. Las otras 49
// vivían dentro del panel de detalle, de a una: para saber qué había bajo
// «SISTEMA DE TAREAS» (14 subtareas) había que abrirla, mirar, volver y
// repetir con la siguiente. El trabajo real estaba escondido.
//
// Acá el padre y sus hijos se ven juntos, y cada fila muestra al lado su
// estado, prioridad, responsable y vencimiento. La jerarquía llega a tres
// niveles (raíz → subtarea → sub-subtarea), así que el dibujo es recursivo.
//
// IGUAL QUE EL TABLERO: no vuelve a pedir nada al servidor. Arma el árbol con
// las tareas que la lista ya trajo, con los mismos filtros. Si pidiera las
// suyas, los contadores de una vista y otra dejarían de calzar.
// =====================================================================
import React, { useState, useMemo } from 'react';
import {
    ChevronRight, ChevronDown, Circle, CircleDot, Eye, CheckCircle2, X,
    User, Calendar, FolderOpen,
} from 'lucide-react';

const ESTADO = {
    pendiente:   { label: 'Activa',     icon: Circle,       c: 'text-blue-600' },
    en_proceso:  { label: 'En proceso', icon: CircleDot,    c: 'text-amber-600' },
    en_revision: { label: 'Revisión',   icon: Eye,          c: 'text-violet-600' },
    completada:  { label: 'Finalizada', icon: CheckCircle2, c: 'text-emerald-600' },
    cancelada:   { label: 'Cancelada',  icon: X,            c: 'text-slate-400' },
};

// La prioridad «media» no se pinta: es la de casi todas (26 de 39 abiertas) y
// marcarlas todas hace que ninguna destaque, que es lo contrario de para lo que
// sirve una prioridad.
const PRIO = {
    critica: 'text-red-700 bg-red-600/15 border-red-600/40',
    alta:    'text-orange-600 bg-orange-500/10 border-orange-500/30',
    baja:    'text-slate-500 bg-slate-500/10 border-slate-400/30',
};

const fechaCorta = (d) => d
    ? new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
    : null;

// Solo el primer nombre y la inicial del apellido: «MATIAS IGNACIO OLIVOS
// BUSTAMANTE» completo empuja las columnas fuera de la pantalla.
const nombreCorto = (n) => {
    if (!n) return null;
    const partes = String(n).trim().split(/\s+/);
    if (partes.length === 1) return partes[0];
    return `${partes[0]} ${partes[partes.length - 1][0]}.`;
};

// ---------------------------------------------------------------------
// Una fila. Se dibuja a sí misma y después a sus hijos, un nivel más adentro.
// ---------------------------------------------------------------------
const Fila = ({ t, nivel, hijosDe, colapsados, alternar, selId, onAbrir, onCompletar }) => {
    const hijos = hijosDe.get(t.id) || [];
    const abierto = !colapsados.has(t.id);
    const meta = ESTADO[t.estado] || ESTADO.pendiente;
    const Icono = meta.icon;
    const hecha = t.estado === 'completada';
    const vencida = t.venceAt && new Date(t.venceAt) < new Date() && !hecha;

    return (
        <>
            <div
                onClick={() => onAbrir(t.id)}
                className={`flex items-center gap-2 pr-3 py-2 border-b border-[#efe8dd] cursor-pointer hover:bg-slate-50 group
                    ${selId === t.id ? 'bg-emerald-500/5' : ''}`}
                // La sangría va en el estilo y no en una clase de Tailwind porque
                // el nivel es un dato, y Tailwind solo compila las clases que ve
                // escritas en el archivo: `pl-${n*18}` no existiría en el CSS.
                style={{ paddingLeft: 12 + nivel * 22 }}
            >
                {/* Desplegar. Ocupa su lugar aunque no haya hijos, para que los
                    títulos de un mismo nivel queden alineados entre sí. */}
                {hijos.length > 0 ? (
                    <button
                        onClick={(e) => { e.stopPropagation(); alternar(t.id); }}
                        title={abierto ? 'Contraer' : 'Desplegar'}
                        className="shrink-0 text-slate-400 hover:text-slate-900"
                    >
                        {abierto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                ) : <span className="w-[14px] shrink-0" />}

                {/* Completar de un clic, igual que en la lista. */}
                <button onClick={(e) => onCompletar(t, e)} title="Finalizar" className="shrink-0">
                    {hecha
                        ? <CheckCircle2 size={15} className="text-emerald-500" />
                        : <Circle size={15} className="text-slate-300 hover:text-emerald-500" />}
                </button>

                <span className={`flex-1 min-w-0 truncate text-[12px] ${
                    hecha ? 'text-slate-400 line-through' : 'text-slate-900'
                } ${nivel === 0 ? 'font-black' : 'font-medium'}`}>
                    {t.titulo}
                </span>

                {/* Cuántas de sus hijas están cerradas. Solo en las que tienen. */}
                {hijos.length > 0 && (
                    <span className="shrink-0 text-[9px] font-black text-slate-400 tabular-nums">
                        {hijos.filter(h => h.estado === 'completada').length}/{hijos.length}
                    </span>
                )}

                {/* ---- Lo que se ve al lado ---- */}
                {t.prioridad && PRIO[t.prioridad] && (
                    <span className={`shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded border uppercase ${PRIO[t.prioridad]}`}>
                        {t.prioridad === 'critica' ? 'crítica' : t.prioridad}
                    </span>
                )}

                <span className={`shrink-0 hidden sm:flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider ${meta.c}`}>
                    <Icono size={11} /> {meta.label}
                </span>

                <span className="shrink-0 hidden md:flex items-center gap-1 w-24 text-[10px] text-slate-500 truncate">
                    {t.responsableNombre && <><User size={10} className="text-slate-400 shrink-0" />{nombreCorto(t.responsableNombre)}</>}
                </span>

                <span className={`shrink-0 hidden md:flex items-center gap-1 w-16 text-[10px] font-bold ${
                    vencida ? 'text-red-600' : 'text-slate-400'
                }`}>
                    {t.venceAt && <><Calendar size={10} /> {fechaCorta(t.venceAt)}</>}
                </span>
            </div>

            {abierto && hijos.map(h => (
                <Fila key={h.id} t={h} nivel={nivel + 1}
                    hijosDe={hijosDe} colapsados={colapsados} alternar={alternar}
                    selId={selId} onAbrir={onAbrir} onCompletar={onCompletar} />
            ))}
        </>
    );
};

const ArbolTareas = ({ tareas, selId, onAbrir, onCompletar }) => {
    // Se guardan los CONTRAÍDOS y no los desplegados: el árbol nace abierto,
    // que es justamente lo que se venía a buscar acá («verlo todo de una»).
    const [colapsados, setColapsados] = useState(() => new Set());

    const alternar = (id) => setColapsados(prev => {
        const s = new Set(prev);
        s.has(id) ? s.delete(id) : s.add(id);
        return s;
    });

    const { raices, hijosDe, conHijos } = useMemo(() => {
        const hijosDe = new Map();
        const presentes = new Set(tareas.map(t => t.id));

        for (const t of tareas) {
            // Una hija cuyo padre NO vino en esta página —o quedó fuera por un
            // filtro— se trata como raíz. Si no, desaparecería de la pantalla:
            // ningún padre la dibujaría y el total dejaría de cuadrar.
            if (!t.parentId || !presentes.has(t.parentId)) continue;
            if (!hijosDe.has(t.parentId)) hijosDe.set(t.parentId, []);
            hijosDe.get(t.parentId).push(t);
        }

        const raices = tareas.filter(t => !t.parentId || !presentes.has(t.parentId));
        const conHijos = tareas.filter(t => hijosDe.has(t.id)).map(t => t.id);
        return { raices, hijosDe, conHijos };
    }, [tareas]);

    // Las raíces se juntan por proyecto: son los «epics». Con un proyecto que
    // concentra casi todo, el encabezado igual sirve de separador.
    const grupos = useMemo(() => {
        const m = new Map();
        for (const t of raices) {
            const clave = t.proyectoId || '_sin';
            if (!m.has(clave)) {
                m.set(clave, {
                    clave,
                    nombre: t.proyectoNombre || 'Sin proyecto',
                    color: t.proyectoColor || '#94a3b8',
                    tareas: [],
                });
            }
            m.get(clave).tareas.push(t);
        }
        return [...m.values()];
    }, [raices]);

    const todoAbierto = colapsados.size === 0;

    return (
        <div>
            {conHijos.length > 0 && (
                <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-[#efe8dd] px-3 py-1.5 flex justify-end">
                    <button
                        onClick={() => setColapsados(todoAbierto ? new Set(conHijos) : new Set())}
                        className="text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-slate-900"
                    >
                        {todoAbierto ? 'Contraer todo' : 'Desplegar todo'}
                    </button>
                </div>
            )}

            {grupos.map(g => (
                <div key={g.clave}>
                    <div className="sticky top-[29px] z-10 bg-[#faf7f2]/95 backdrop-blur-sm border-b border-[#efe8dd] px-4 py-1.5 flex items-center gap-2">
                        <FolderOpen size={11} style={{ color: g.color }} className="shrink-0" />
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest truncate">{g.nombre}</span>
                        <span className="text-[10px] font-black text-slate-400 tabular-nums">{g.tareas.length}</span>
                    </div>
                    {g.tareas.map(t => (
                        <Fila key={t.id} t={t} nivel={0}
                            hijosDe={hijosDe} colapsados={colapsados} alternar={alternar}
                            selId={selId} onAbrir={onAbrir} onCompletar={onCompletar} />
                    ))}
                </div>
            ))}
        </div>
    );
};

export default ArbolTareas;
