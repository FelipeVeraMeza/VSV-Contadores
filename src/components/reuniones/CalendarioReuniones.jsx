// ============================================================================
// CALENDARIO DE REUNIONES · vista de mes
// ----------------------------------------------------------------------------
// POR QUÉ UN MES Y NO UNA AGENDA DE DÍA
// La pregunta que trae a alguien a esta pantalla es «¿cuándo lo puedo atender?»,
// y esa se responde mirando los huecos, no las citas. Una lista ordenada por
// fecha —que es lo que ya existe— muestra bien lo que viene, pero no deja ver
// que el martes está libre y el jueves tiene tres. Por eso el mes.
//
// LA REJILLA ES FIJA, DE 6 SEMANAS
// Un mes puede ocupar 4, 5 o 6 filas según en qué día caiga el 1. Si la rejilla
// creciera y se encogiera, la pantalla saltaría al cambiar de mes y los días
// quedarían en distinto lugar cada vez. Con 6 filas siempre, el calendario no
// se mueve: los días de otros meses se pintan apagados y se sigue pudiendo
// hacer clic en ellos, porque agendar el 1 del mes que viene desde la última
// fila es exactamente lo que uno quiere hacer.
//
// LAS HORAS SE MUESTRAN, NO SE CALCULAN
// El servidor devuelve `iniciaAt` en ISO y el proceso corre en hora de Chile
// (src/config/zonaHoraria.js), así que acá solo se formatea.
// ============================================================================
import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';

const DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
               'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Clave local YYYY-MM-DD. A propósito NO se usa toISOString(): eso pasa a UTC y
// una reunión de las 21:00 en Chile cae al día siguiente, que es justo el tipo
// de error que hace desconfiar de un calendario entero.
const claveDia = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Lunes de la semana en que cae el día 1. getDay() da 0 para domingo, así que
// se corre para que la semana empiece el lunes, como se lee un calendario acá.
const primerLunes = (anio, mes) => {
    const uno = new Date(anio, mes, 1);
    const desplazamiento = (uno.getDay() + 6) % 7;
    return new Date(anio, mes, 1 - desplazamiento);
};

const ESTADO_PUNTO = {
    agendada:  'bg-slate-400',
    en_curso:  'bg-emerald-500',
    terminada: 'bg-slate-300',
    cancelada: 'bg-red-300',
};

const CalendarioReuniones = ({ reuniones = [], onAbrir, onAgendarEn }) => {
    const hoy = new Date();
    const [cursor, setCursor] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1));

    // Las reuniones agrupadas por día, ordenadas por hora dentro de cada uno.
    const porDia = useMemo(() => {
        const m = new Map();
        for (const r of reuniones) {
            if (!r.iniciaAt) continue;          // las salas de "ahora" no tienen fecha
            const k = claveDia(new Date(r.iniciaAt));
            if (!m.has(k)) m.set(k, []);
            m.get(k).push(r);
        }
        for (const arr of m.values()) arr.sort((a, b) => new Date(a.iniciaAt) - new Date(b.iniciaAt));
        return m;
    }, [reuniones]);

    const celdas = useMemo(() => {
        const inicio = primerLunes(cursor.getFullYear(), cursor.getMonth());
        return Array.from({ length: 42 }, (_, i) => {
            const d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
            return {
                fecha: d,
                clave: claveDia(d),
                delMes: d.getMonth() === cursor.getMonth(),
                esHoy: claveDia(d) === claveDia(hoy),
            };
        });
    }, [cursor]);

    const mover = (n) => setCursor(c => new Date(c.getFullYear(), c.getMonth() + n, 1));
    const volverAHoy = () => setCursor(new Date(hoy.getFullYear(), hoy.getMonth(), 1));

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Cabecera: mes y navegación */}
            <div className="flex items-center gap-2 mb-2 shrink-0">
                <span className="text-[13px] font-semibold text-slate-800 capitalize">
                    {MESES[cursor.getMonth()]} {cursor.getFullYear()}
                </span>
                <div className="flex items-center gap-0.5 ml-1">
                    <button onClick={() => mover(-1)} title="Mes anterior"
                        className="p-1 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors">
                        <ChevronLeft size={15} />
                    </button>
                    <button onClick={() => mover(1)} title="Mes siguiente"
                        className="p-1 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors">
                        <ChevronRight size={15} />
                    </button>
                </div>
                <button onClick={volverAHoy}
                    className="text-[11px] text-slate-500 hover:text-slate-800 px-2 py-0.5 rounded-md hover:bg-slate-100 transition-colors">
                    Hoy
                </button>
            </div>

            {/* Encabezado de días */}
            <div className="grid grid-cols-7 gap-px shrink-0">
                {DIAS.map(d => (
                    <div key={d} className="text-[10px] font-medium text-slate-400 uppercase tracking-wider text-center py-1">
                        {d}
                    </div>
                ))}
            </div>

            {/* La rejilla. `min-h-0` + overflow para que en una pantalla baja
                se pueda desplazar en vez de aplastar las celdas. */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="grid grid-cols-7 grid-rows-6 gap-px bg-[#efe8dd] border border-[#efe8dd] rounded-lg overflow-hidden h-full min-h-[420px]">
                    {celdas.map(c => {
                        const delDia = porDia.get(c.clave) || [];
                        return (
                            <div key={c.clave}
                                className={`group relative flex flex-col gap-0.5 p-1 min-h-0 overflow-hidden ${
                                    c.delMes ? 'bg-white' : 'bg-slate-50/60'}`}>
                                <div className="flex items-center justify-between shrink-0">
                                    <span className={`text-[11px] tabular-nums leading-none px-1 py-0.5 rounded ${
                                        c.esHoy ? 'bg-emerald-600 text-white font-semibold'
                                                : c.delMes ? 'text-slate-600' : 'text-slate-300'}`}>
                                        {c.fecha.getDate()}
                                    </span>
                                    {/* Agendar en ese día: aparece al pasar por encima para no
                                        llenar la rejilla de 42 botones siempre visibles. */}
                                    {onAgendarEn && (
                                        <button onClick={() => onAgendarEn(c.fecha)}
                                            title={`Agendar el ${c.fecha.getDate()} de ${MESES[c.fecha.getMonth()]}`}
                                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-0.5 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50">
                                            <Plus size={12} />
                                        </button>
                                    )}
                                </div>

                                <div className="flex flex-col gap-0.5 overflow-y-auto min-h-0">
                                    {delDia.slice(0, 3).map(r => {
                                        const hora = new Date(r.iniciaAt).toLocaleTimeString('es-CL', {
                                            hour: '2-digit', minute: '2-digit',
                                        });
                                        return (
                                            <button key={r.id} onClick={() => onAbrir?.(r)}
                                                title={`${hora} · ${r.titulo}${r.personaNombre ? ` · ${r.personaNombre}` : ''}`}
                                                className={`flex items-center gap-1 text-left rounded px-1 py-0.5 hover:bg-slate-100 transition-colors min-w-0 ${
                                                    r.estado === 'cancelada' ? 'opacity-50' : ''}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                                    ESTADO_PUNTO[r.estado] || ESTADO_PUNTO.agendada}`} />
                                                <span className="text-[10px] tabular-nums text-slate-500 shrink-0">{hora}</span>
                                                <span className={`text-[10px] truncate ${
                                                    r.estado === 'cancelada' ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                                                    {r.titulo}
                                                </span>
                                            </button>
                                        );
                                    })}
                                    {delDia.length > 3 && (
                                        <span className="text-[9px] text-slate-400 px-1">+{delDia.length - 3} más</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default CalendarioReuniones;
