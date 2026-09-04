// =====================================================================
// LA CAMPANA · avisos dentro del sistema
// ---------------------------------------------------------------------
// Hasta hoy el sistema no avisaba nada: si te asignaban una tarea, te
// enterabas al abrir la pantalla. Y como la pantalla no se abre sola, en la
// práctica te enterabas cuando alguien te escribía por WhatsApp.
//
// El servidor EMPUJA los avisos por una conexión abierta (SSE), así que si te
// asignan una tarea mientras estás mirando la pantalla, la campana se enciende
// sola. Antes preguntaba cada 60 segundos y había que refrescar para enterarse.
//
// Se mantiene una consulta de respaldo, pero espaciada: cubre el rato en que la
// conexión se cae y el navegador todavía no reconecta, y el caso de que el
// canal no funcione en algún entorno. Los avisos llegan igual, más lento.
// =====================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, Check, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { listarNotificacionesApi, marcarNotificacionesApi } from '@/services/crmService';
import { avisarTareaAsignada } from '@/components/tareas/avisoTareaAsignada';
import { API_BASE_URL } from '../../../config.js';

// Un "tin" corto generado acá mismo: sin archivo externo que cargar ni que
// pueda faltar al desplegar.
const TIN = 'data:audio/wav;base64,UklGRnoAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YVYAAAAAABAAIAAwAEAAUABgAHAAgACQAKAAsADAANAA4ADwAP8A7wDfAM8AvwCvAJ8AjwB/AG8AXwBPAD8ALwAfAA8A/////+/f39/Pz8+/v7+vr6+fn5+Pj4';

const getSessionId = () => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').sessionId; } catch { return null; }
};

// "hace 5 min" dice más que una hora exacta cuando lo que importa es si es reciente.
const haceCuanto = (fecha) => {
    const min = Math.round((Date.now() - new Date(fecha)) / 60000);
    if (min < 1) return 'recién';
    if (min < 60) return `hace ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.round(h / 24);
    return d === 1 ? 'ayer' : `hace ${d} días`;
};

const ICONO = {
    tarea_asignada: '📋',
    tarea_comentada: '💬',
    agregado_a_proyecto: '📁',
    tarea_vence: '⏰',
};

const CampanaNotificaciones = () => {
    const navigate = useNavigate();
    const [abierta, setAbierta] = useState(false);
    const [avisos, setAvisos] = useState([]);
    const [pendientes, setPendientes] = useState(0);
    const [cargando, setCargando] = useState(false);
    const caja = useRef(null);
    // Los ids ya avisados en esta sesión de pantalla, para no sonar ni saltar
    // dos veces por el mismo aviso (el canal en vivo y la consulta de respaldo
    // pueden traerlo los dos).
    const vistos = useRef(new Set());

    const cargar = useCallback(async () => {
        const s = getSessionId();
        if (!s) return;
        try {
            const r = await listarNotificacionesApi(s);
            const d = await r.json();
            if (d.success) { setAvisos(d.notificaciones || []); setPendientes(d.pendientes || 0); }
        } catch { /* si falla, la campana simplemente no se actualiza */ }
    }, []);

    useEffect(() => {
        cargar();
        // Respaldo espaciado. Con el canal en vivo funcionando esto casi nunca
        // trae novedades; existe para el rato en que la conexión se cae.
        const id = setInterval(cargar, 120000);
        return () => clearInterval(id);
    }, [cargar]);

    // ---- El canal en vivo ----
    // `EventSource` no admite cabeceras, por eso la sesión va en la URL. Y
    // reconecta solo si se corta, así que no hay que vigilarlo.
    useEffect(() => {
        const s = getSessionId();
        if (!s || typeof EventSource === 'undefined') return;

        const canal = new EventSource(`${API_BASE_URL}/crm/notificaciones/stream?sesion=${encodeURIComponent(s)}`);

        canal.addEventListener('aviso', (e) => {
            try {
                const aviso = JSON.parse(e.data);
                // Si ya lo teníamos (la consulta de respaldo pudo haberlo
                // traído primero) no se vuelve a contar ni a avisar: si no, el
                // mismo aviso suena y salta dos veces.
                //
                // La marca va en un ref y NO se deduce dentro de `setAvisos`:
                // React puede ejecutar el actualizador más de una vez por
                // cambio, así que decidir ahí dentro si sonar o no es decidirlo
                // un número de veces que no controlamos.
                if (vistos.current.has(aviso.id)) return;
                vistos.current.add(aviso.id);

                setAvisos(prev => prev.some(a => a.id === aviso.id) ? prev : [aviso, ...prev].slice(0, 30));
                setPendientes(p => p + 1);
                // Un sonido corto: si estás mirando otra pestaña del sistema,
                // el número rojo solo no se nota.
                try { new Audio(TIN).play().catch(() => {}); } catch { /* sin sonido */ }

                // Y el pop-up, solo para lo que te asignaron a ti. Un aviso de
                // comentario o de proyecto se queda en la campana: si TODO
                // saltara en pantalla, en una semana nadie lo miraría.
                // Es el punto 2 de §10.5 de docs/tareas-requerimientos.md.
                if (aviso.tipo === 'tarea_asignada') {
                    avisarTareaAsignada(aviso, (id) =>
                        navigate(`/tareas?sub=todas&tarea=${encodeURIComponent(id)}`));
                }
            } catch { /* si viene mal formado se ignora */ }
        });

        // Si el canal se cae, el respaldo de arriba sigue cubriendo.
        canal.onerror = () => { /* EventSource reintenta solo */ };

        return () => canal.close();
    }, [navigate]);

    // Cerrar al pulsar fuera: si no, el panel queda abierto tapando la pantalla.
    useEffect(() => {
        if (!abierta) return;
        const fuera = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierta(false); };
        document.addEventListener('mousedown', fuera);
        return () => document.removeEventListener('mousedown', fuera);
    }, [abierta]);

    const marcarTodas = async () => {
        setCargando(true);
        try {
            await marcarNotificacionesApi(getSessionId());
            setAvisos(prev => prev.map(a => ({ ...a, leida: true })));
            setPendientes(0);
        } catch { /* */ } finally { setCargando(false); }
    };

    const abrir = async (a) => {
        setAbierta(false);
        if (!a.leida) {
            marcarNotificacionesApi(getSessionId(), a.id).catch(() => {});
            setPendientes(p => Math.max(0, p - 1));
            setAvisos(prev => prev.map(x => x.id === a.id ? { ...x, leida: true } : x));
        }
        // Llevar a donde ocurrió. Una notificación que no lleva a ninguna parte
        // obliga a buscar la tarea a mano, que es justo lo que se quería evitar.
        //
        // Con `?tarea=<id>` la lista abre ESA tarea al llegar, en vez de dejar
        // en la lista completa para que uno la busque. Sirve también cuando el
        // aviso es de una subtarea: el detalle se pide por id.
        //
        // Si el aviso viejo no trae `entidadId` se cae a la lista, como antes.
        if (a.entidad === 'tarea') {
            navigate(a.entidadId
                ? `/tareas?sub=todas&tarea=${encodeURIComponent(a.entidadId)}`
                : '/tareas?sub=todas');
        }
        else if (a.entidad === 'proyecto') navigate('/tareas?sub=proyectos');
        // Los avisos de reunión (`entidad: 'reunion'`) no llevaban a ninguna
        // parte: se pulsaban y no pasaba nada, justo cuando el aviso dice que la
        // reunión empieza. Se conecta ahora que la pantalla se mudó a
        // Comunicaciones. La lista no abre una reunión concreta por id —no
        // acepta ese parámetro—, así que lleva a la lista, donde la que está en
        // curso aparece arriba y marcada.
        else if (a.entidad === 'reunion') navigate('/comunicaciones?sub=reuniones');
    };

    return (
        <div className="relative" ref={caja}>
            <button
                onClick={() => setAbierta(v => !v)}
                aria-label={pendientes ? `${pendientes} avisos sin leer` : 'Avisos'}
                title={pendientes ? `${pendientes} sin leer` : 'Sin avisos nuevos'}
                className="relative text-slate-400 hover:text-slate-700 transition-colors p-1"
            >
                <Bell size={20} />
                {pendientes > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center tabular-nums">
                        {pendientes > 9 ? '9+' : pendientes}
                    </span>
                )}
            </button>

            {abierta && (
                <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white border border-[#efe8dd] rounded-2xl shadow-2xl z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#efe8dd]">
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                            Avisos {pendientes > 0 && <span className="text-red-600">({pendientes})</span>}
                        </span>
                        {pendientes > 0 && (
                            <button onClick={marcarTodas} disabled={cargando}
                                className="text-[9px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                                {cargando ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Marcar leídos
                            </button>
                        )}
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                        {avisos.length === 0 ? (
                            <p className="text-[11px] text-slate-400 italic text-center py-8">
                                No tienes avisos.
                            </p>
                        ) : avisos.map(a => (
                            <button key={a.id} onClick={() => abrir(a)}
                                className={`w-full text-left px-4 py-2.5 border-b border-[#f5f0e8] last:border-0 hover:bg-slate-50 transition-colors flex gap-2.5 ${a.leida ? '' : 'bg-emerald-500/5'}`}>
                                <span className="text-sm shrink-0 mt-0.5">{ICONO[a.tipo] || '•'}</span>
                                <span className="min-w-0 flex-1">
                                    <span className={`block text-[11px] leading-snug ${a.leida ? 'text-slate-600' : 'text-slate-900 font-bold'}`}>
                                        {a.titulo}
                                    </span>
                                    {a.descripcion && (
                                        <span className="block text-[10px] text-slate-400 truncate mt-0.5">{a.descripcion}</span>
                                    )}
                                    <span className="block text-[9px] text-slate-400 mt-0.5">{haceCuanto(a.fecha)}</span>
                                </span>
                                {!a.leida && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-1.5" />}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default CampanaNotificaciones;
