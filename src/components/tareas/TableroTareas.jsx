// =====================================================================
// TABLERO · las mismas tareas, ordenadas por estado
// ---------------------------------------------------------------------
// La lista responde "qué tengo que hacer". El tablero responde "cómo va el
// trabajo": de un vistazo se ve si todo está atascado en «en proceso» o si hay
// una fila de cosas esperando revisión.
//
// Se arrastra la tarjeta de una columna a otra para cambiar el estado. Está
// hecho con el arrastre que trae el navegador, sin librería: son cuatro
// columnas y una tarjeta, no justifica sumar una dependencia.
//
// IMPORTANTE: el tablero NO vuelve a pedir las tareas. Dibuja exactamente las
// que ya trajo la lista, con los mismos filtros aplicados. Si trajera las
// suyas, los contadores de una vista y otra dejarían de calzar.
// =====================================================================
import React, { useState } from 'react';
import {
    Circle, CircleDot, Eye, CheckCircle2, X,
    User, ListChecks, MessageSquare, Calendar,
} from 'lucide-react';

const PRIO = {
    critica: 'text-red-700 bg-red-600/15 border-red-600/40',
    alta: 'text-orange-600 bg-orange-500/10 border-orange-500/30',
    media: 'text-amber-600 bg-amber-500/10 border-amber-500/30',
    baja: 'text-slate-500 bg-slate-500/10 border-slate-400/30',
};

// El borde de arriba es lo que distingue una columna de otra a distancia.
const COLUMNAS = [
    { estado: 'pendiente',   label: 'Activas',      icon: Circle,       color: 'text-blue-600',    barra: 'bg-blue-500' },
    { estado: 'en_proceso',  label: 'En proceso',   icon: CircleDot,    color: 'text-amber-600',   barra: 'bg-amber-500' },
    { estado: 'en_revision', label: 'En revisión',  icon: Eye,          color: 'text-violet-600',  barra: 'bg-violet-500' },
    { estado: 'completada',  label: 'Finalizadas',  icon: CheckCircle2, color: 'text-emerald-600', barra: 'bg-emerald-500' },
];
const CANCELADA = { estado: 'cancelada', label: 'Canceladas', icon: X, color: 'text-slate-400', barra: 'bg-slate-300' };

const fechaCorta = (d) => d ? new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) : null;

const Tarjeta = ({ t, seleccionada, onAbrir, onArrastrar }) => {
    const vencida = t.venceAt && new Date(t.venceAt) < new Date() && t.estado !== 'completada';
    const hecha = t.estado === 'completada';
    return (
        <div
            draggable
            onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onArrastrar(t); }}
            onClick={() => onAbrir(t.id)}
            className={`bg-white border rounded-xl p-2.5 cursor-pointer transition-colors active:cursor-grabbing
                ${seleccionada ? 'border-emerald-500 ring-1 ring-emerald-500/30' : 'border-[#efe8dd] hover:border-emerald-500/50'}`}
        >
            <p className={`text-[11px] font-bold leading-snug ${hecha ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                {t.titulo}
            </p>

            {t.proyectoNombre && (
                <span className="text-[9px] font-bold block mt-1" style={{ color: t.proyectoColor || '#199b4d' }}>
                    ● {t.proyectoNombre}
                </span>
            )}

            <div className="flex items-center gap-2 flex-wrap mt-1.5">
                {t.prioridad && t.prioridad !== 'media' && (
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase ${PRIO[t.prioridad]}`}>
                        {t.prioridad === 'critica' ? 'crítica' : t.prioridad}
                    </span>
                )}
                {t.venceAt && (
                    <span className={`text-[9px] font-bold flex items-center gap-0.5 ${vencida ? 'text-red-600' : 'text-slate-500'}`}>
                        <Calendar size={9} /> {fechaCorta(t.venceAt)}
                    </span>
                )}
                {t.subtareasTotal > 0 && (
                    <span className="text-[9px] text-slate-500 flex items-center gap-0.5"><ListChecks size={9} /> {t.subtareasHechas}/{t.subtareasTotal}</span>
                )}
                {t.comentarios > 0 && (
                    <span className="text-[9px] text-slate-500 flex items-center gap-0.5"><MessageSquare size={9} /> {t.comentarios}</span>
                )}
            </div>

            {t.responsableNombre && (
                <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-[#f5f0e8]">
                    <User size={9} className="text-slate-400" />
                    <span className="text-[9px] text-slate-500 truncate">{t.responsableNombre}</span>
                </div>
            )}
        </div>
    );
};

const TableroTareas = ({ tareas, selId, onAbrir, onMover }) => {
    // Qué se está arrastrando y sobre qué columna está. Lo segundo es solo para
    // pintar el destino: sin esa señal uno suelta a ciegas.
    const [arrastrando, setArrastrando] = useState(null);
    const [encima, setEncima] = useState(null);

    const porEstado = (estado) => tareas.filter(t => (t.estado || 'pendiente') === estado);
    // La columna de canceladas solo aparece si hay alguna. Tener una columna
    // vacía permanente ocupa espacio y no dice nada.
    const columnas = porEstado('cancelada').length > 0 ? [...COLUMNAS, CANCELADA] : COLUMNAS;

    const soltar = (estado) => {
        setEncima(null);
        const t = arrastrando;
        setArrastrando(null);
        if (!t || t.estado === estado) return;   // soltar donde ya estaba no es un cambio
        onMover(t, estado);
    };

    return (
        <div className="flex-1 min-h-0 overflow-x-auto">
            <div className="flex gap-3 h-full min-w-max pb-1">
                {columnas.map(col => {
                    const items = porEstado(col.estado);
                    const Icono = col.icon;
                    const activa = encima === col.estado;
                    return (
                        <div
                            key={col.estado}
                            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setEncima(col.estado); }}
                            onDragLeave={() => setEncima(c => c === col.estado ? null : c)}
                            onDrop={(e) => { e.preventDefault(); soltar(col.estado); }}
                            className={`w-60 shrink-0 flex flex-col rounded-2xl border transition-colors
                                ${activa ? 'border-emerald-500 bg-emerald-500/5' : 'border-[#efe8dd] bg-[#faf7f2]'}`}
                        >
                            <div className={`h-1 rounded-t-2xl ${col.barra}`} />
                            <div className="flex items-center justify-between px-3 py-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
                                    <Icono size={12} className={col.color} /> {col.label}
                                </span>
                                <span className="text-[10px] font-black text-slate-400 tabular-nums">{items.length}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 scrollbar-thin">
                                {items.length === 0 ? (
                                    <p className="text-[10px] text-slate-400 italic text-center py-6">
                                        {activa ? 'Suelta acá' : 'Vacío'}
                                    </p>
                                ) : items.map(t => (
                                    <Tarjeta key={t.id} t={t} seleccionada={selId === t.id}
                                        onAbrir={onAbrir} onArrastrar={setArrastrando} />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default TableroTareas;
