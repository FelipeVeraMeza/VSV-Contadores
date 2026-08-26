// =====================================================================
// LA SALA · la ventana de video, dentro del sistema
// ---------------------------------------------------------------------
// CÓMO FUNCIONA
// Jitsi publica un script (`external_api.js`) que arma la videollamada dentro
// de un div de esta página. Se le pasa el nombre de la sala —que generó el
// servidor— y él se encarga del resto: cámara, micrófono, quién entra, quién
// habla. El audio y el video van directo entre los participantes; por el
// servidor de VSV no pasa nada de la llamada.
//
// POR QUÉ EL SCRIPT Y NO UN <iframe> A SECAS
// Un iframe también muestra la reunión, pero es una caja cerrada: la página no
// se entera de nada de lo que pasa adentro. Con el script sí, y eso es lo que
// permite lo único que Meet no da — que al colgar el sistema sepa que la
// reunión terminó y pida la nota de lo que se acordó.
//
// ESTE COMPONENTE NO ELIGE NADA. Recibe la sala, el dominio y —si el proveedor
// lo pide— el token, todo desde la respuesta del servidor al entrar. Quién
// sirve el video se decide en `src/utils/videoReunion.js`, con variables de
// entorno del backend. Ver ahí por qué.
//
// ⚠️ NO USAR `meet.jit.si`: pide que el primero que abre la sala inicie sesión
// con Google o GitHub («The conference has not yet started because no
// moderators have arrived»). Por eso el sistema apunta a un servidor sin
// autenticación.
// =====================================================================
import React, { useEffect, useRef, useState } from 'react';
import { Loader2, AlertTriangle, ExternalLink } from 'lucide-react';

// EL DOMINIO LO MANDA EL SERVIDOR, no una variable compilada.
//
// Estaba en `VITE_JITSI_DOMAIN`, y eso tiene un defecto que aparece justo
// cuando hace falta: las variables `VITE_` quedan grabadas dentro del archivo
// compilado, así que cambiar de servidor de video obligaba a recompilar y
// redesplegar el frontend. Ahora viene en la respuesta de "entrar": se cambia
// una variable del backend y la próxima reunión ya sale por el servidor nuevo.
// Este valor es solo el paracaídas por si la respuesta viniera sin dominio.
// OJO al elegirlo: tiene que cumplir DOS condiciones, y casi ninguno cumple las
// dos —sin login, y que se deje incrustar—. `meet.ffmuc.net` no sirve acá
// aunque no pida login: manda X-Frame-Options y el navegador responde
// «rechazó la conexión» dentro de esta ventana.
const DOMINIO_RESPALDO = 'jitsi.riot.im';

// El script se carga UNA vez POR DOMINIO. Cargarlo en cada reunión deja copias
// colgando y Jitsi empieza a pelearse consigo mismo.
const promesasScript = new Map();
const cargarScript = (dominio) => {
    if (window.JitsiMeetExternalAPI && promesasScript.has(dominio)) return promesasScript.get(dominio);
    if (promesasScript.has(dominio)) return promesasScript.get(dominio);
    const promesa = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = `https://${dominio}/external_api.js`;
        s.async = true;
        s.onload = resolve;
        s.onerror = () => { promesasScript.delete(dominio); reject(new Error('No se pudo cargar el video')); };
        document.body.appendChild(s);
    });
    promesasScript.set(dominio, promesa);
    return promesa;
};

const SalaJitsi = ({ sala, dominio, jwt, titulo, nombreUsuario, correoUsuario, onColgar }) => {
    const DOMINIO = dominio || DOMINIO_RESPALDO;
    const caja = useRef(null);
    const api = useRef(null);
    const entro = useRef(false);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);
    // SALIDA DE EMERGENCIA. El script puede cargar perfecto y la sala no abrir
    // igual: pasa cuando el servidor de video manda `X-Frame-Options` y el
    // navegador se niega a mostrarlo acá adentro ("rechazó la conexión"), o
    // cuando la red de la oficina bloquea el video. En los dos casos el usuario
    // se queda mirando un cuadro gris sin nada que hacer. Si a los 12 segundos
    // no entró a la conferencia, se le ofrece abrirla en otra pestaña, que
    // funciona aunque incrustar no funcione.
    const [atascado, setAtascado] = useState(false);

    useEffect(() => {
        let vivo = true;

        cargarScript(DOMINIO)
            .then(() => {
                if (!vivo || !caja.current) return;
                api.current = new window.JitsiMeetExternalAPI(DOMINIO, {
                    roomName: sala,
                    // Solo lo usa JaaS (8x8): acredita al que entra como
                    // moderador con un token que firmó nuestro servidor, para
                    // que nadie tenga que iniciar sesión con Google. En los
                    // servidores sin autenticación va en blanco y se ignora.
                    jwt: jwt || undefined,
                    parentNode: caja.current,
                    width: '100%',
                    height: '100%',
                    userInfo: { displayName: nombreUsuario || 'Invitado', email: correoUsuario || undefined },
                    configOverwrite: {
                        // NADA DE PANTALLA PREVIA. La persona ya pulsó "Entrar" en
                        // nuestra lista: preguntarle otra vez «¿entrar a la
                        // reunión?» es un paso de más y encima se ve como otra
                        // aplicación distinta metida adentro.
                        //
                        // Van las DOS formas de decirlo a propósito: Jitsi
                        // renombró esta opción (`prejoinPageEnabled` es la vieja,
                        // `prejoinConfig.enabled` la nueva) y cada servidor
                        // público corre una versión distinta. Poner solo una
                        // funciona en unos y en otros no — que es justo lo que
                        // pasó acá.
                        prejoinPageEnabled: false,
                        prejoinConfig: { enabled: false },

                        startWithAudioMuted: false,
                        startWithVideoMuted: false,
                        disableDeepLinking: true,       // que no ofrezca abrir la app del teléfono

                        // Sin la marca de "moderador" ni el aviso de calidad de
                        // conexión encima de la cara: son de una app para
                        // desconocidos, no para tres personas de la misma oficina.
                        disableModeratorIndicator: true,
                        connectionIndicators: { autoHide: true, disabled: true },

                        // EL NOMBRE DE LA SALA NO SE MUESTRA.
                        // Es una tira aleatoria («vsv-e95e9d6f4412...»), que Jitsi
                        // además "embellece" partiéndola en pedazos —«Vsv E 95 E 9 D
                        // 6 F 209 F»— y la escribe grande arriba del video, dos
                        // veces. No le dice nada a nadie: el título de verdad ya
                        // está en nuestra barra, a dos centímetros.
                        subject: titulo || '',
                        hideConferenceSubject: true,

                        // Lo que sobra de una app ajena metida dentro de la nuestra:
                        // el perfil de Jitsi, su botón de invitar (se invita desde
                        // el sistema) y que le guarde la sala al navegador.
                        disableProfile: true,
                        disableInviteFunctions: true,
                        doNotStoreRoom: true,
                        // Sus avisos flotantes tapan la cara de quien habla.
                        notifications: [],
                        disableReactions: true,

                        // SIETE BOTONES, no quince. Hablar, verse, mostrar la
                        // pantalla, escribir, ver a todos, elegir micrófono y
                        // colgar. Lo demás es ruido en una reunión de trabajo.
                        toolbarButtons: [
                            'microphone', 'camera', 'desktop', 'chat',
                            'tileview', 'settings', 'hangup',
                        ],
                    },
                    interfaceConfigOverwrite: {
                        SHOW_JITSI_WATERMARK: false,
                        SHOW_BRAND_WATERMARK: false,
                        SHOW_POWERED_BY: false,
                        SHOW_CHROME_EXTENSION_BANNER: false,
                        MOBILE_APP_PROMO: false,
                        HIDE_INVITE_MORE_HEADER: true,
                        DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
                        // Que el fondo sea el mismo de la pantalla y no el gris
                        // de Jitsi: con dos grises distintos se ve como un
                        // parche pegado encima.
                        DEFAULT_BACKGROUND: '#020617',
                        TOOLBAR_BUTTONS: [
                            'microphone', 'camera', 'desktop', 'chat',
                            'tileview', 'settings', 'hangup',
                        ],
                    },
                });

                // Colgar desde adentro tiene que enterar a la pantalla: es lo
                // que dispara la pregunta por la nota de la reunión.
                api.current.addEventListener('readyToClose', () => onColgar?.());
                api.current.addEventListener('videoConferenceLeft', () => onColgar?.());
                api.current.addEventListener('videoConferenceJoined', () => {
                    entro.current = true;
                    if (vivo) { setCargando(false); setAtascado(false); }
                });
                // Por si el evento de entrada no llega (pasa en redes lentas):
                setTimeout(() => { if (vivo) setCargando(false); }, 6000);
                setTimeout(() => { if (vivo && !entro.current) setAtascado(true); }, 12000);
            })
            .catch(() => { if (vivo) { setError('No se pudo cargar el video.'); setCargando(false); } });

        return () => {
            vivo = false;
            // Sin esto la cámara sigue encendida al cerrar la ventana: el
            // objeto de Jitsi se queda con el micrófono tomado.
            try { api.current?.dispose(); } catch { /* ya estaba cerrado */ }
            api.current = null;
        };
    }, [sala, DOMINIO, jwt, titulo, nombreUsuario, correoUsuario, onColgar]);

    return (
        <div className="relative w-full h-full bg-slate-950 overflow-hidden">
            <div ref={caja} className="w-full h-full" />

            {cargando && !error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300 bg-slate-950">
                    <Loader2 className="animate-spin" size={28} />
                    <span className="text-xs font-semibold">Conectando la sala…</span>
                    <span className="text-[11px] text-slate-500">El navegador va a pedirte permiso de cámara y micrófono</span>
                </div>
            )}

            {/* No tapa el video: si la sala termina cargando, el aviso estorba
                pero no impide nada, y si no carga es la única salida que hay. */}
            {atascado && !error && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-slate-800/95 border border-slate-700 rounded-xl px-4 py-2.5 shadow-xl">
                    <span className="text-[11px] text-slate-300">¿No carga la sala?</span>
                    <a href={`https://${DOMINIO}/${sala}`} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-400 hover:text-emerald-300">
                        <ExternalLink size={12} /> Abrirla en otra pestaña
                    </a>
                    <button onClick={() => setAtascado(false)} className="text-slate-500 hover:text-slate-300 text-[11px]">✕</button>
                </div>
            )}

            {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-8 bg-slate-950">
                    <AlertTriangle className="text-amber-400" size={28} />
                    <span className="text-sm font-bold text-slate-200">{error}</span>
                    <span className="text-[11px] text-slate-400 max-w-sm">
                        Puede ser la red de la oficina bloqueando el video. Se puede entrar igual
                        desde el navegador, en una pestaña aparte.
                    </span>
                    <a href={`https://${DOMINIO}/${sala}`} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300">
                        <ExternalLink size={13} /> Abrir la sala en otra pestaña
                    </a>
                </div>
            )}
        </div>
    );
};

export default SalaJitsi;
export { DOMINIO_RESPALDO };
