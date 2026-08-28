// =====================================================================
// LA LLAMADA · vive FUERA de la pantalla que la abrió
// ---------------------------------------------------------------------
// EL PROBLEMA QUE RESUELVE
// La sala vivía dentro de `ReunionesPanel`. Ese panel se monta bajo el
// `<Outlet />` del router, así que bastaba ir a Contabilidad —o a otra sección
// de Tickets, que encima remonta por `key`— para que React lo desmontara, se
// ejecutara el cleanup de SalaJitsi y `dispose()` cortara la conferencia.
// Estabas hablando con un cliente, ibas a mirar un saldo, y colgabas sin querer.
//
// Y NO ALCANZA CON GUARDAR EL ESTADO MÁS ARRIBA. El video de Jitsi es un
// <iframe>: moverlo de un padre a otro en el DOM lo RECARGA —el navegador
// reinicia el documento de adentro— y eso es exactamente colgar y volver a
// entrar. O sea que la caja del video no puede cambiar de sitio nunca.
//
// CÓMO FUNCIONA ENTONCES
// Hay UNA sola caja, montada acá arriba en un portal a <body>, que no se
// desmonta ni cambia de padre en toda la llamada. Lo único que cambia son sus
// coordenadas:
//
//   ACOPLADA · la pantalla de Reuniones deja un hueco vacío y le pasa el
//              elemento por `registrarHueco`. Cada cuadro se mide ese hueco y
//              la caja se dibuja justo encima. Se ve como si estuviera adentro.
//   FLOTANDO · no hay hueco —te fuiste a otro módulo, o la minimizaste—: la
//              caja se va a una esquina como ventanita, y se puede arrastrar.
//
// El cambio entre los dos modos es mover un `transform`. El iframe ni se entera:
// para él no pasó nada, y por eso la llamada sigue.
//
// LO QUE SE MUEVE ACÁ ARRIBA CON ELLA: el cronómetro, el botón de salir y la
// nota de lo acordado. Si colgar desde la ventanita flotante no pidiera la nota,
// se perdería justo lo que hace que las reuniones estén en el sistema.
// =====================================================================
import React, {
    createContext, useContext, useState, useRef, useEffect, useCallback, useMemo,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
    PhoneOff, Users, Minimize2, Maximize2, Loader2, CheckCircle2, GripHorizontal,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import SalaJitsi from '@/components/reuniones/SalaJitsi';
import { entrarReunionApi, salirReunionApi, terminarReunionApi } from '@/services/reunionesService';

const getUser = () => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } };
const getSessionId = () => getUser().sessionId;

const LlamadaContext = createContext(null);

export const useLlamada = () => {
    const ctx = useContext(LlamadaContext);
    if (!ctx) throw new Error('useLlamada() se usó fuera de <LlamadaProvider>');
    return ctx;
};

// La ventanita flotante. Ancho tope de 380 para que quepa en un teléfono, y el
// alto sale de la proporción del video más la barra de arriba.
const MARGEN = 16;
const ALTO_BARRA = 42;
const tamFlotante = () => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const ancho = Math.max(200, Math.min(380, vw - MARGEN * 2));
    const alto = Math.min(Math.round(ancho * 9 / 16) + ALTO_BARRA, vh - MARGEN * 2);
    return { ancho, alto };
};

// EL CRONÓMETRO ES SU PROPIO COMPONENTE A PROPÓSITO.
// Cuenta una vez por segundo, y si ese estado viviera en el proveedor la
// aplicación ENTERA se volvería a dibujar cada segundo mientras hablas. Acá el
// tic queda encerrado en estas cuatro líneas.
const Cronometro = ({ desde }) => {
    const [texto, setTexto] = useState('');
    useEffect(() => {
        const inicio = new Date(desde || Date.now()).getTime();
        const dd = (n) => String(n).padStart(2, '0');
        const marcar = () => {
            const s = Math.max(0, Math.floor((Date.now() - inicio) / 1000));
            const h = Math.floor(s / 3600);
            setTexto(h ? `${h}:${dd(Math.floor(s / 60) % 60)}:${dd(s % 60)}` : `${dd(Math.floor(s / 60))}:${dd(s % 60)}`);
        };
        marcar();
        const id = setInterval(marcar, 1000);
        return () => clearInterval(id);
    }, [desde]);
    return <span className="text-[11px] font-semibold text-slate-300 tabular-nums shrink-0" title="Tiempo de la reunión">{texto}</span>;
};

// ---------------------------------------------------------------------
// LA NOTA AL COLGAR · solo a quien convocó
// ---------------------------------------------------------------------
// Se pregunta en el momento de colgar y no después, porque diez minutos más
// tarde ya nadie escribe nada. Se puede saltar: obligar a escribir para poder
// seguir usando el sistema sería peor. Vive acá y no en la pantalla de
// Reuniones porque ahora se puede colgar desde cualquier módulo.
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
                    De «{reunion.titulo}». Queda guardado en la reunión{reunion.personaNombre ? ` y en la ficha de ${reunion.personaNombre}` : ''}.
                </p>
                <textarea
                    className="w-full bg-white border border-[#efe8dd] rounded-lg px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500 resize-none"
                    rows={5} autoFocus placeholder="Los acuerdos, los pendientes, lo que hay que hacer…"
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
export const LlamadaProvider = ({ children }) => {
    const navigate = useNavigate();

    const [llamada, setLlamada] = useState(null);   // { reunion, sala, dominio, jwt }
    const [modo, setModo] = useState('dock');       // 'dock' (quiere ir acoplada) | 'flotante'
    const [hueco, setHueco] = useState(null);       // el div que dejó la pantalla de Reuniones
    const [pedirNota, setPedirNota] = useState(null);
    // Sube al colgar: la lista de reuniones lo mira para volver a leerse sola.
    const [cambios, setCambios] = useState(0);

    // Hay hueco solo si estás en la pantalla de Reuniones Y no la minimizaste.
    const acoplada = modo === 'dock' && !!hueco;

    // Espejos en refs. Todo lo que corre por fuera del ciclo de React —el bucle
    // que dibuja cada cuadro, el arrastre, el evento de Jitsi al colgar— lee de
    // acá, y así esas funciones no cambian de identidad nunca. Eso último no es
    // cosmético: si `colgar` cambiara de identidad, el efecto de SalaJitsi se
    // volvería a ejecutar y la llamada se cortaría sola.
    const llamadaRef = useRef(null);
    const acopladaRef = useRef(false);
    const huecoRef = useRef(null);
    const cajaRef = useRef(null);
    const posRef = useRef(null);         // esquina de la ventanita flotante
    const ultimaGeo = useRef({});
    useEffect(() => { llamadaRef.current = llamada; }, [llamada]);
    useEffect(() => { acopladaRef.current = acoplada; huecoRef.current = hueco; }, [acoplada, hueco]);

    const registrarHueco = useCallback((el) => setHueco(el), []);

    // ── DÓNDE SE DIBUJA LA CAJA ───────────────────────────────────────
    // Se escribe directo en el estilo del nodo, no por estado de React: esto
    // corre una vez por cuadro y un `setState` a 60 por segundo redibujaría
    // media aplicación mientras hablas.
    const escribir = useCallback((x, y, w, h) => {
        const c = cajaRef.current;
        if (!c) return;
        const u = ultimaGeo.current;
        if (u.x === x && u.y === y && u.w === w && u.h === h) return;   // nada cambió
        ultimaGeo.current = { x, y, w, h };
        c.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
        c.style.width = `${Math.round(w)}px`;
        c.style.height = `${Math.round(h)}px`;
    }, []);

    const aplicarGeometria = useCallback(() => {
        if (!cajaRef.current) return;
        const h = huecoRef.current;
        // Acoplada: se calca el hueco. Se mide cada cuadro porque el hueco se
        // mueve por razones que no avisan —el menú lateral que se colapsa, la
        // animación de entrada de la pantalla, el scroll, la ventana que cambia
        // de tamaño— y perseguirlas una por una es una lista que nunca termina.
        if (acopladaRef.current && h?.isConnected) {
            const r = h.getBoundingClientRect();
            if (r.width > 80 && r.height > 80) { escribir(r.left, r.top, r.width, r.height); return; }
            // Si el hueco todavía no tiene tamaño (el primer cuadro), se deja lo
            // anterior en vez de encoger la caja a cero y hacerla parpadear.
            if (ultimaGeo.current.w) return;
        }
        const { ancho, alto } = tamFlotante();
        if (!posRef.current) posRef.current = { x: window.innerWidth - ancho - MARGEN, y: window.innerHeight - alto - MARGEN };
        const p = posRef.current;
        p.x = Math.min(Math.max(MARGEN, p.x), Math.max(MARGEN, window.innerWidth - ancho - MARGEN));
        p.y = Math.min(Math.max(MARGEN, p.y), Math.max(MARGEN, window.innerHeight - alto - MARGEN));
        escribir(p.x, p.y, ancho, alto);
    }, [escribir]);

    // El bucle solo existe mientras hay llamada.
    useEffect(() => {
        if (!llamada) { ultimaGeo.current = {}; return; }
        let raf = requestAnimationFrame(function tic() {
            aplicarGeometria();
            raf = requestAnimationFrame(tic);
        });
        return () => cancelAnimationFrame(raf);
    }, [llamada, aplicarGeometria]);

    // ── ARRASTRAR LA VENTANITA ────────────────────────────────────────
    // Tapa cosas: si cae justo encima del botón que necesitas, tiene que poder
    // correrse. Mueve `posRef` y el bucle de arriba la dibuja.
    const arrastre = useRef(null);
    const empezarArrastre = useCallback((e) => {
        if (acopladaRef.current) return;
        if (e.target.closest('button, a')) return;   // los botones de la barra siguen siendo botones
        const p = posRef.current || { x: 0, y: 0 };
        arrastre.current = { dx: e.clientX - p.x, dy: e.clientY - p.y };
        e.currentTarget.setPointerCapture?.(e.pointerId);
    }, []);
    const moverArrastre = useCallback((e) => {
        if (!arrastre.current) return;
        posRef.current = { x: e.clientX - arrastre.current.dx, y: e.clientY - arrastre.current.dy };
    }, []);
    const soltarArrastre = useCallback((e) => {
        arrastre.current = null;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
    }, []);

    // ── ENTRAR Y COLGAR ───────────────────────────────────────────────
    const entrar = useCallback(async (reunion) => {
        const actual = llamadaRef.current;
        if (actual) {
            // Ya está adentro de esta misma: es "volver a la reunión", no entrar.
            if (actual.reunion?.id === reunion.id) { setModo('dock'); return; }
            toast({
                variant: 'destructive',
                title: 'Ya estás en una reunión',
                description: `Sal de «${actual.reunion?.titulo}» antes de entrar a otra.`,
            });
            return;
        }
        try {
            const r = await entrarReunionApi(getSessionId(), reunion.id);
            const d = await r.json(); if (!d.success) throw new Error(d.message);
            setLlamada({ reunion: d.reunion || reunion, sala: d.sala, dominio: d.dominio, jwt: d.jwt });
            setModo('dock');
        } catch (e) {
            toast({ variant: 'destructive', title: 'No se pudo entrar', description: e.message });
        }
    }, []);

    // Colgar: siempre se registra la salida. La nota se pide solo a quien
    // convocó — al invitado que se va antes no le corresponde cerrar nada.
    const colgar = useCallback(async () => {
        const actual = llamadaRef.current?.reunion;
        setLlamada(null);
        setModo('dock');
        posRef.current = null;
        if (!actual) return;
        try { await salirReunionApi(getSessionId(), actual.id); } catch { /* da igual: ya salió */ }
        setCambios((n) => n + 1);
        if (actual.creadoPor === getUser().id) setPedirNota(actual);
    }, []);

    const minimizar = useCallback(() => setModo('flotante'), []);
    // Ampliar desde otro módulo tiene que llevarte a la pantalla: si solo
    // cambiara el modo, no habría hueco donde acoplarla y no pasaría nada.
    const ampliar = useCallback(() => {
        setModo('dock');
        // La pantalla vive en Comunicaciones desde el 27-08-2026; antes estaba en
        // Tickets. Si esta ruta queda vieja, «volver a la reunión» lleva a una
        // pantalla sin hueco y la llamada se queda flotando sin acoplarse.
        navigate('/comunicaciones?sub=reuniones');
    }, [navigate]);

    // Recargar la página SÍ corta la llamada —el navegador tira el iframe— y es
    // fácil apretar F5 por costumbre. Este es el único aviso posible.
    useEffect(() => {
        if (!llamada) return;
        const avisar = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', avisar);
        return () => window.removeEventListener('beforeunload', avisar);
    }, [llamada]);

    const valor = useMemo(() => ({
        llamada, modo, acoplada, cambios,
        enLlamada: !!llamada, reunionEnCurso: llamada?.reunion || null,
        entrar, colgar, minimizar, ampliar, registrarHueco,
    }), [llamada, modo, acoplada, cambios, entrar, colgar, minimizar, ampliar, registrarHueco]);

    const r = llamada?.reunion;

    return (
        <LlamadaContext.Provider value={valor}>
            {children}

            {/* LA CAJA. Se monta cuando empieza la llamada y no se vuelve a
                tocar hasta que se cuelga: ni se desmonta, ni cambia de padre.
                Va en un portal a <body> porque el armazón tiene `overflow-hidden`
                y transformaciones que recortarían un elemento fijo.

                Capas del sistema: header 30 · menú 60 · modales 100+. Acoplada va
                en 40 (dentro del contenido, debajo del menú); flotando en 90, que
                la deja encima de todo salvo los modales. */}
            {llamada && createPortal(
                <div
                    ref={cajaRef}
                    data-llamada={acoplada ? 'acoplada' : 'flotante'}
                    style={{ position: 'fixed', left: 0, top: 0, willChange: 'transform' }}
                    className={`flex flex-col overflow-hidden bg-slate-950 border shadow-xl ${
                        acoplada
                            ? 'z-[40] rounded-2xl border-slate-800'
                            : 'z-[90] rounded-xl border-slate-700 shadow-2xl ring-1 ring-black/20'}`}
                >
                    <div
                        onPointerDown={empezarArrastre}
                        onPointerMove={moverArrastre}
                        onPointerUp={soltarArrastre}
                        onPointerCancel={soltarArrastre}
                        className={`flex items-center gap-2 px-3 shrink-0 bg-gradient-to-b from-slate-900 to-slate-900/60 border-b border-slate-800 ${
                            acoplada ? 'sm:gap-3 sm:px-4 py-2.5' : 'py-2 cursor-grab active:cursor-grabbing select-none'}`}
                        style={{ height: acoplada ? undefined : ALTO_BARRA }}
                    >
                        {!acoplada && <GripHorizontal size={13} className="text-slate-600 shrink-0" />}
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" title="En curso" />

                        <div className="min-w-0 flex-1">
                            <p className={`font-bold text-white truncate leading-tight ${acoplada ? 'text-[13px]' : 'text-[11px]'}`}>
                                {r?.titulo}
                            </p>
                            {acoplada && r?.personaNombre && (
                                <p className="text-[10px] text-slate-400 truncate leading-tight">con {r.personaNombre}</p>
                            )}
                        </div>

                        <Cronometro desde={r?.iniciadaAt} />

                        {acoplada && r?.participantes?.length > 0 && (
                            <span className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-400 shrink-0 pl-1 border-l border-slate-700"
                                title={r.participantes.map((p) => p.nombre).join(', ')}>
                                <Users size={13} /> {r.participantes.length}
                            </span>
                        )}

                        {acoplada ? (
                            <button onClick={minimizar} title="Dejarla flotando y seguir trabajando"
                                className="flex items-center justify-center h-7 w-7 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 shrink-0 transition-colors">
                                <Minimize2 size={14} />
                            </button>
                        ) : (
                            <button onClick={ampliar} title="Volver a la reunión"
                                className="flex items-center justify-center h-7 w-7 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 shrink-0 transition-colors">
                                <Maximize2 size={13} />
                            </button>
                        )}

                        <button onClick={colgar} title="Salir de la reunión"
                            className={`flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold shrink-0 transition-colors ${
                                acoplada ? 'px-3 py-1.5 text-[11px]' : 'px-2 py-1.5 text-[10px]'}`}>
                            <PhoneOff size={acoplada ? 13 : 12} />{acoplada && 'Salir'}
                        </button>
                    </div>

                    <div className="flex-1 min-h-0">
                        <SalaJitsi
                            sala={llamada.sala} dominio={llamada.dominio} jwt={llamada.jwt}
                            titulo={r?.titulo} nombreUsuario={getUser().nombre} correoUsuario={getUser().correo}
                            onColgar={colgar} />
                    </div>
                </div>,
                document.body,
            )}

            {pedirNota && (
                <NotaFinalModal
                    reunion={pedirNota}
                    onListo={() => { setPedirNota(null); setCambios((n) => n + 1); }}
                    onSaltar={() => { setPedirNota(null); setCambios((n) => n + 1); }}
                />
            )}
        </LlamadaContext.Provider>
    );
};

export default LlamadaProvider;
