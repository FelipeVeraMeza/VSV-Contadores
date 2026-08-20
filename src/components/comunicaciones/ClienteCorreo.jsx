// ============================================================================
// ✉️ CORREO — el cliente de correo completo
// ----------------------------------------------------------------------------
// Una barra de carpetas a la izquierda y el contenido al lado, como cualquier
// cliente de correo. Antes esto estaba partido en tres entradas distintas del
// menú lateral —Correo, Recibidos, Historial— y había que salir de una para
// entrar a la otra. Las carpetas van acá adentro, que es donde se esperan.
//
// CADA CARPETA APUNTA A ALGO QUE EXISTE DE VERDAD
// Es la parte que importa. Un cliente de correo tiene Pospuestos, Borradores,
// Spam y Papelera; acá NO están, porque no hay nada detrás: ni tabla de
// borradores, ni posponer, ni clasificación de spam. Una carpeta que se ve
// bien y no hace nada es peor que no tenerla — se pulsa, no pasa nada, y el
// sistema parece roto.
//
// Lo que sí hay, y a qué corresponde:
//   Recibidos   → correo_recibido, lo que llega por IMAP
//   Destacados  → correo_recibido.destacado
//   De clientes → los recibidos que calzan con una ficha del CRM
//   Enviados    → correo_campana / correo_envio, el registro de lo que salió
//   Archivados  → correo_recibido.archivado
//
// Y EN VEZ DE LA BARRA DE ALMACENAMIENTO va la CUOTA DEL DÍA, que acá sí es un
// número que decide cosas: el proveedor corta sobre los ~100 diarios y la
// cartera con correo son 132.
// ============================================================================
import React, { useState, useEffect, useCallback } from 'react';
import {
    PenSquare, Inbox, Star, Building2, Send, Archive, Loader2,
} from 'lucide-react';
import BandejaEntrada from '@/components/comunicaciones/BandejaEntrada';
import EnvioCorreos from '@/components/crm/views/EnvioCorreos';
import Enviados from '@/components/comunicaciones/Enviados';
import { cuotaCorreoApi } from '@/services/correosService';

const getUser = () => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } };
const getSessionId = () => getUser().sessionId;

// `filtro` es lo que entiende el backend; null = no es una carpeta de la bandeja.
const CARPETAS = [
    { id: 'recibidos',  nombre: 'Recibidos',   icono: Inbox,     filtro: 'todos' },
    { id: 'destacados', nombre: 'Destacados',  icono: Star,      filtro: 'destacados' },
    { id: 'clientes',   nombre: 'De clientes', icono: Building2, filtro: 'clientes' },
    { id: 'enviados',   nombre: 'Enviados',    icono: Send,      filtro: null },
    { id: 'archivados', nombre: 'Archivados',  icono: Archive,   filtro: 'archivados' },
];

const ClienteCorreo = () => {
    const [carpeta, setCarpeta] = useState('recibidos');
    const [redactando, setRedactando] = useState(false);
    const [sinLeer, setSinLeer] = useState(0);
    const [cuota, setCuota] = useState(null);

    const cargarCuota = useCallback(async () => {
        try {
            const r = await cuotaCorreoApi(getSessionId());
            const d = await r.json();
            if (d.success) setCuota(d);
        } catch { /* el contador es informativo: si falla, no se muestra */ }
    }, []);
    useEffect(() => { cargarCuota(); }, [cargarCuota]);

    const activa = CARPETAS.find(c => c.id === carpeta) || CARPETAS[0];
    const usado = cuota ? Math.min(100, Math.round((cuota.enviados / cuota.limite) * 100)) : 0;

    return (
        <div className="h-full min-h-0 flex gap-3">

            {/* ═══ BARRA DE CARPETAS ═══ */}
            <div className="w-52 shrink-0 hidden md:flex flex-col bg-white border border-[#efe8dd] rounded-2xl overflow-hidden">
                <div className="p-3">
                    <button
                        onClick={() => { setRedactando(true); }}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl h-11 text-[11px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-colors">
                        <PenSquare size={15} /> Redactar
                    </button>
                </div>

                <nav className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
                    {CARPETAS.map(c => {
                        const Icono = c.icono;
                        const puesta = !redactando && carpeta === c.id;
                        return (
                            <button key={c.id}
                                onClick={() => { setCarpeta(c.id); setRedactando(false); }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-left ${
                                    puesta ? 'bg-emerald-500/10 text-emerald-700'
                                           : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>
                                <Icono size={14} className="shrink-0" />
                                <span className={`text-[11px] flex-1 truncate ${puesta ? 'font-black' : 'font-bold'}`}>
                                    {c.nombre}
                                </span>
                                {/* Solo en Recibidos y solo si hay: un «0» permanente
                                    al lado de cada carpeta es ruido. */}
                                {c.id === 'recibidos' && sinLeer > 0 && (
                                    <span className="text-[9px] font-black tabular-nums text-emerald-700">{sinLeer}</span>
                                )}
                            </button>
                        );
                    })}
                </nav>

                {/* CUOTA DEL DÍA · acá no tiene sentido una barra de almacenamiento
                    —esto no es un buzón con límite de disco— pero sí este número:
                    el proveedor rechaza lo que pase del tope diario. */}
                <div className="px-3 py-3 border-t border-[#efe8dd]">
                    {!cuota ? (
                        <Loader2 size={12} className="animate-spin text-slate-300" />
                    ) : (
                        <>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Envíos de hoy</p>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden my-1.5">
                                <div className={`h-full transition-all ${
                                    cuota.quedan === 0 ? 'bg-red-500'
                                    : cuota.quedan < 20 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                    style={{ width: `${usado}%` }} />
                            </div>
                            <p className="text-[9px] text-slate-500 tabular-nums">
                                {cuota.enviados} de {cuota.limite} · quedan <b>{cuota.quedan}</b>
                            </p>
                            {cuota.pruebas > 0 && (
                                <p className="text-[9px] text-slate-400 mt-0.5">
                                    Incluye {cuota.pruebas} {cuota.pruebas === 1 ? 'prueba' : 'pruebas'}
                                </p>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ═══ CONTENIDO ═══ */}
            <div className="flex-1 min-w-0 flex flex-col">
                {/* En pantalla angosta la barra se esconde y las carpetas pasan a
                    ser una fila de pastillas: la alternativa era un menú lateral
                    encima del correo que se está leyendo. */}
                <div className="md:hidden flex gap-1.5 mb-2 overflow-x-auto pb-1">
                    <button onClick={() => setRedactando(true)}
                        className="shrink-0 bg-emerald-600 text-white rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1.5">
                        <PenSquare size={12} /> Redactar
                    </button>
                    {CARPETAS.map(c => (
                        <button key={c.id} onClick={() => { setCarpeta(c.id); setRedactando(false); }}
                            className={`shrink-0 text-[10px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg border transition-colors ${
                                !redactando && carpeta === c.id
                                    ? 'bg-emerald-600 border-emerald-500 text-white'
                                    : 'bg-white border-[#efe8dd] text-slate-500'}`}>
                            {c.nombre}
                        </button>
                    ))}
                </div>

                <div className="flex-1 min-h-0">
                    {redactando ? (
                        <EnvioCorreos />
                    ) : activa.id === 'enviados' ? (
                        <Enviados />
                    ) : (
                        <BandejaEntrada
                            filtro={activa.filtro}
                            titulo={activa.nombre}
                            onSinLeer={setSinLeer}
                            onResponder={cargarCuota}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default ClienteCorreo;
