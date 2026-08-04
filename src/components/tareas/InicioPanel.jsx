// =====================================================================
// INICIO · el resumen del día
// ---------------------------------------------------------------------
// Es la primera pantalla del módulo y la que más se va a abrir, así que la
// regla acá es que cargue rápido y se entienda de una mirada:
//
//   · UNA sola llamada al servidor trae los conteos y las tres listas. Antes
//     de tener esto, la tentación era pedir cada lista por separado y la
//     pantalla mostraba números de momentos distintos.
//   · Lo primero que se ve es lo que está atrasado, no el total. Un número
//     grande que dice "23 tareas activas" no ayuda a decidir qué hacer ahora.
//
// Las tarjetas de arriba son atajos: cada una lleva a la lista ya filtrada.
// =====================================================================
import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Loader2, AlertTriangle, Clock, CheckCircle2, ListChecks, Flame,
    Plus, FolderPlus, CalendarDays, User, ArrowRight,
} from 'lucide-react';
import { resumenInicioApi } from '@/services/crmService';

const getUser = () => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } };
const getSessionId = () => getUser().sessionId;

const PRIO = {
    critica: 'text-red-700 bg-red-600/15 border-red-600/40',
    alta: 'text-orange-600 bg-orange-500/10 border-orange-500/30',
    media: 'text-amber-600 bg-amber-500/10 border-amber-500/30',
    baja: 'text-slate-500 bg-slate-500/10 border-slate-400/30',
};

// "hace 3 días" / "en 2 días" dice más que una fecha cuando lo que importa es
// cuánto falta o cuánto se pasó.
const cuandoTexto = (fecha) => {
    if (!fecha) return null;
    const dias = Math.round((new Date(fecha) - new Date()) / 86400000);
    if (dias === 0) return 'hoy';
    if (dias === 1) return 'mañana';
    if (dias === -1) return 'ayer';
    if (dias < 0) return `hace ${Math.abs(dias)} días`;
    return `en ${dias} días`;
};

const Tarjeta = ({ icono: Icono, n, label, tono, onClick }) => (
    <button onClick={onClick}
        className={`flex-1 min-w-[8.5rem] text-left bg-white border rounded-2xl p-3.5 transition-colors hover:border-emerald-500/50 ${tono.borde}`}>
        <div className="flex items-center gap-2 mb-1.5">
            <Icono size={15} className={tono.icono} />
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
        </div>
        <span className={`text-2xl font-black ${n > 0 ? tono.numero : 'text-slate-300'}`}>{n}</span>
    </button>
);

const FilaTarea = ({ t, atrasada }) => (
    <div className="flex items-center gap-2.5 px-3 py-2 border-b border-[#f5f0e8] last:border-0">
        <div className="min-w-0 flex-1">
            <p className={`text-xs font-bold truncate ${t.estado === 'completada' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                {t.titulo}
            </p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {t.proyectoNombre && (
                    <span className="text-[9px] font-bold" style={{ color: t.proyectoColor || '#199b4d' }}>● {t.proyectoNombre}</span>
                )}
                {t.responsableNombre && (
                    <span className="text-[9px] text-slate-500 flex items-center gap-0.5"><User size={9} /> {t.responsableNombre}</span>
                )}
            </div>
        </div>
        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase shrink-0 ${PRIO[t.prioridad] || PRIO.media}`}>
            {t.prioridad}
        </span>
        <span className={`text-[10px] font-bold shrink-0 w-20 text-right ${atrasada ? 'text-red-600' : 'text-slate-500'}`}>
            {cuandoTexto(t.estado === 'completada' ? t.completedAt : t.venceAt)}
        </span>
    </div>
);

const Bloque = ({ titulo, icono: Icono, tono, tareas, vacio, atrasadas, onVerTodas }) => (
    <div className="bg-white border border-[#efe8dd] rounded-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[#efe8dd]">
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
                <Icono size={13} className={tono} /> {titulo}
                {tareas.length > 0 && <span className="text-slate-400">({tareas.length})</span>}
            </span>
            {tareas.length > 0 && onVerTodas && (
                <button onClick={onVerTodas} className="text-[9px] font-black text-emerald-600 hover:text-emerald-700 uppercase tracking-widest flex items-center gap-0.5">
                    Ver todas <ArrowRight size={10} />
                </button>
            )}
        </div>
        <div className="flex-1">
            {tareas.length === 0
                ? <p className="text-[11px] text-slate-400 italic px-3.5 py-5 text-center">{vacio}</p>
                : tareas.map(t => <FilaTarea key={t.id} t={t} atrasada={atrasadas} />)}
        </div>
    </div>
);

const InicioPanel = ({ modo = 'todas' }) => {
    const [, setSearchParams] = useSearchParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const cargar = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const r = await resumenInicioApi(getSessionId(), modo);
            const d = await r.json();
            if (!d.success) throw new Error(d.message || 'No se pudo cargar el resumen.');
            setData(d);
        } catch (e) { setError(e.message); }
        finally { setLoading(false); }
    }, [modo]);
    useEffect(() => { cargar(); }, [cargar]);

    const irA = (params) => setSearchParams({ sub: 'todas', ...params });

    if (loading) return (
        <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 className="animate-spin" /></div>
    );
    if (error) return (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
            <AlertTriangle className="text-amber-500" size={28} />
            <p className="text-xs text-slate-500">{error}</p>
            <button onClick={cargar} className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Reintentar</button>
        </div>
    );

    const r = data.resumen;
    const nombre = (getUser().nombre || '').split(' ')[0];

    return (
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3">
            {/* Saludo + accesos rápidos */}
            <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs text-slate-500">
                    {r.vencidas > 0
                        ? <>Hola{nombre ? ` ${nombre}` : ''}, tienes <b className="text-red-600">{r.vencidas} {r.vencidas === 1 ? 'tarea atrasada' : 'tareas atrasadas'}</b>.</>
                        : r.activas > 0
                            ? <>Hola{nombre ? ` ${nombre}` : ''}, no tienes nada atrasado. Buen día.</>
                            : <>Hola{nombre ? ` ${nombre}` : ''}, no tienes tareas pendientes.</>}
                </p>
                <div className="flex items-center gap-2">
                    <button onClick={() => irA({ nueva: '1' })}
                        className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest">
                        <Plus size={13} /> Tarea
                    </button>
                    <button onClick={() => setSearchParams({ sub: 'proyectos' })}
                        className="flex items-center gap-1.5 bg-white border border-[#efe8dd] hover:border-emerald-500/50 text-slate-600 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest">
                        <FolderPlus size={13} /> Proyectos
                    </button>
                </div>
            </div>

            {/* Conteos */}
            <div className="flex flex-wrap gap-2">
                <Tarjeta icono={AlertTriangle} n={r.vencidas} label="Atrasadas" onClick={() => irA({})}
                    tono={{ borde: r.vencidas > 0 ? 'border-red-300' : 'border-[#efe8dd]', icono: 'text-red-500', numero: 'text-red-600' }} />
                <Tarjeta icono={CalendarDays} n={r.vencen_hoy} label="Vencen hoy" onClick={() => irA({})}
                    tono={{ borde: 'border-[#efe8dd]', icono: 'text-amber-500', numero: 'text-amber-600' }} />
                <Tarjeta icono={Clock} n={r.proximas} label={`Próximos ${r.diasProximas} días`} onClick={() => irA({})}
                    tono={{ borde: 'border-[#efe8dd]', icono: 'text-blue-500', numero: 'text-blue-600' }} />
                <Tarjeta icono={Flame} n={r.criticas} label="Críticas" onClick={() => irA({})}
                    tono={{ borde: r.criticas > 0 ? 'border-red-200' : 'border-[#efe8dd]', icono: 'text-red-600', numero: 'text-red-700' }} />
                <Tarjeta icono={ListChecks} n={r.activas} label="Activas" onClick={() => irA({})}
                    tono={{ borde: 'border-[#efe8dd]', icono: 'text-slate-500', numero: 'text-slate-900' }} />
                <Tarjeta icono={CheckCircle2} n={r.recientes} label={`Cerradas (${r.diasRecientes}d)`} onClick={() => irA({})}
                    tono={{ borde: 'border-[#efe8dd]', icono: 'text-emerald-500', numero: 'text-emerald-600' }} />
            </div>

            {/* Las tres listas */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 flex-1 min-h-0">
                <Bloque titulo="Atrasadas" icono={AlertTriangle} tono="text-red-500" atrasadas
                    tareas={data.vencidas} vacio="Nada atrasado." onVerTodas={() => irA({})} />
                <Bloque titulo="Próximas a vencer" icono={Clock} tono="text-blue-500"
                    tareas={data.proximas} vacio={`Nada vence en los próximos ${r.diasProximas} días.`} onVerTodas={() => irA({})} />
                <Bloque titulo="Cerradas hace poco" icono={CheckCircle2} tono="text-emerald-500"
                    tareas={data.recientes} vacio="Todavía no cierras nada esta semana." />
            </div>
        </div>
    );
};

export default InicioPanel;
