// =====================================================================
// QUIÉN ESTÁ CONECTADO · el equipo, ahora mismo
// ---------------------------------------------------------------------
// PARA QUÉ SIRVE
// Saber si la persona a la que le vas a asignar algo está al otro lado, o si
// vas a dejarle un ticket que no verá hasta mañana. Y al revés: enterarte de
// que alguien está trabajando sobre lo mismo que tú antes de pisarse.
//
// SOLO TU ORGANIZACIÓN
// El servidor filtra por la organización de TU sesión, no por un parámetro. Es
// la regla de todo el sistema, y acá pesa más: esto expone hábitos de trabajo
// —a qué hora entra cada quien— y eso no cruza la frontera entre despachos.
//
// «CONECTADO» ES UNA VENTANA, NO UN INTERRUPTOR
// Nadie avisa al cerrar el navegador: se cierra la pestaña y ya. Así que se
// mira la última señal de vida — menos de 5 minutos es «en línea», hasta 30 es
// «inactivo», más allá no se muestra. Por eso los puntos son ámbar y verde y
// no un binario: prometer «está ahí» cuando puede haberse ido a almorzar es
// peor que no decir nada.
//
// SE PREGUNTA CADA 60 SEGUNDOS
// Y solo con la pestaña visible: si está en segundo plano no hay a quién
// mostrárselo, y seguir preguntando es gastar batería y conexión para nada.
// =====================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Users } from 'lucide-react';
import { conectadosApi } from '@/services/crmService';
import { iniciales } from '@/components/tareas/estilos';

const CADA_MS = 60000;

const getSessionId = () => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').sessionId; } catch { return null; }
};

// «recién» dice más que «hace 0 minutos», y en un semáforo de presencia lo que
// importa es la sensación de cercanía, no el número exacto.
const haceCuanto = (min) => {
    if (min < 1) return 'recién';
    if (min === 1) return 'hace 1 min';
    return `hace ${min} min`;
};

const QuienEstaConectado = () => {
    const [abierta, setAbierta] = useState(false);
    const [gente, setGente] = useState([]);
    const [enLinea, setEnLinea] = useState(0);
    const caja = useRef(null);

    const cargar = useCallback(async () => {
        const s = getSessionId();
        if (!s) return;
        try {
            const r = await conectadosApi(s);
            const d = await r.json();
            if (d.success) { setGente(d.conectados || []); setEnLinea(d.enLinea || 0); }
        } catch { /* si falla, el indicador simplemente no se actualiza */ }
    }, []);

    useEffect(() => {
        cargar();
        const id = setInterval(() => {
            // Con la pestaña oculta no hay a quién mostrárselo.
            if (document.visibilityState === 'visible') cargar();
        }, CADA_MS);
        // Al volver a la pestaña se pregunta enseguida: si no, el primer minuto
        // se vería el estado de cuando uno se fue.
        const alVolver = () => { if (document.visibilityState === 'visible') cargar(); };
        document.addEventListener('visibilitychange', alVolver);
        return () => { clearInterval(id); document.removeEventListener('visibilitychange', alVolver); };
    }, [cargar]);

    useEffect(() => {
        if (!abierta) return;
        const fuera = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierta(false); };
        document.addEventListener('mousedown', fuera);
        return () => document.removeEventListener('mousedown', fuera);
    }, [abierta]);

    // Sin nadie más conectado no se dibuja nada. Un «1» que siempre eres tú es
    // ruido permanente en el encabezado.
    const otros = gente.filter(g => !g.soyYo);
    if (otros.length === 0) return null;

    return (
        <div className="relative" ref={caja}>
            <button
                onClick={() => { setAbierta(v => !v); cargar(); }}
                aria-label={`${enLinea} conectados`}
                title="Quién está conectado de tu organización"
                className="flex items-center gap-1.5 text-slate-400 hover:text-slate-700 transition-colors p-1"
            >
                <Users size={19} />
                <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span className="text-[11px] font-black text-slate-600 tabular-nums">{enLinea}</span>
                </span>
            </button>

            {abierta && (
                <div className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-2rem)] bg-white border border-[#efe8dd] rounded-2xl shadow-2xl z-50 overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-[#efe8dd]">
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                            Conectados {enLinea > 0 && <span className="text-emerald-600">({enLinea})</span>}
                        </span>
                        <p className="text-[9px] text-slate-400 mt-0.5">Solo tu organización</p>
                    </div>

                    <div className="max-h-72 overflow-y-auto">
                        {gente.map(g => (
                            <div key={g.id}
                                className="flex items-center gap-2.5 px-4 py-2 border-b border-[#f5f0e8] last:border-0">
                                <span className="relative shrink-0">
                                    <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 text-[9px] font-black flex items-center justify-center">
                                        {iniciales(g.nombre)}
                                    </span>
                                    {/* El punto va sobre la inicial, como en cualquier
                                        mensajería: se lee sin buscarlo. */}
                                    <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                                        g.estado === 'en_linea' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[11px] font-bold text-slate-800 truncate">
                                        {g.nombre}{g.soyYo && <span className="text-slate-400 font-normal"> · tú</span>}
                                    </span>
                                    <span className="block text-[9px] text-slate-400">
                                        {g.estado === 'en_linea' ? 'En línea' : `Inactivo · ${haceCuanto(g.minutos)}`}
                                    </span>
                                </span>
                                {/* Dos sesiones = dos dispositivos abiertos, no dos personas. */}
                                {g.sesiones > 1 && (
                                    <span className="text-[9px] text-slate-300 shrink-0" title={`${g.sesiones} dispositivos`}>
                                        {g.sesiones}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default QuienEstaConectado;
