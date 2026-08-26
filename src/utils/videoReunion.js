// ============================================================================
// QUIÉN SIRVE EL VIDEO · la única pieza que sabe de proveedores
// ----------------------------------------------------------------------------
// El sistema guarda de cada reunión un solo dato del proveedor: el nombre de la
// sala. Todo lo demás —qué servidor la sirve, si hace falta un token, cómo se
// arma el nombre— se decide acá y viaja en la respuesta de "entrar".
//
// POR QUÉ ACÁ Y NO EN LA PANTALLA
// Estaba en el frontend (`VITE_JITSI_DOMAIN`) y eso tenía un defecto que se ve
// recién cuando lo necesitas: las variables `VITE_` se meten dentro del archivo
// compilado, así que cambiar de servidor de video obligaba a recompilar y
// redesplegar el frontend. Acá es una variable de entorno normal: se cambia y
// la próxima reunión ya sale por el servidor nuevo.
//
// ----------------------------------------------------------------------------
// EL PROBLEMA DEL LOGIN, QUE ES POR LO QUE ESTE ARCHIVO EXISTE
// ----------------------------------------------------------------------------
// `meet.jit.si` —el Jitsi público— tiene configurado un dominio de
// autenticación: el primero que abre una sala ve «The conference has not yet
// started because no moderators have arrived» y tiene que entrar con Google o
// GitHub. Para una oficina que abre cinco reuniones al día, eso es inaceptable.
//
// Hay tres salidas, y las tres se resuelven con variables de entorno:
//
//   1. OTRO SERVIDOR PÚBLICO SIN AUTENTICACIÓN (lo que está puesto hoy).
//      `meet.ffmuc.net` tiene `anonymousdomain` y `authdomain` comentados en su
//      configuración: nadie inicia sesión y el primero que entra es moderador.
//      Gratis y sin cuenta. Es un servicio comunitario: no hay nadie a quien
//      reclamarle si un día se cae.
//
//   2. JaaS (8x8), que es Jitsi como servicio. Sigue siendo Jitsi y sigue
//      siendo este mismo código: la diferencia es que el moderador se acredita
//      con un token que firma NUESTRO servidor, así que nadie inicia sesión con
//      Google — quien ya entró a VSV PRO está acreditado. Se activa poniendo
//      JAAS_APP_ID, JAAS_API_KEY y JAAS_PRIVATE_KEY. Tiene plan gratis.
//
//   3. Un Jitsi propio en un VPS: se pone su dominio en VIDEO_DOMINIO y listo.
//
// El código soporta las tres SIN CAMBIOS. Se elige con el `.env`.
// ============================================================================
import crypto from 'node:crypto';

// El servidor de video.
//
// El valor por defecto importa MÁS de lo que parece: el `.env` no viaja al
// despliegue —Railway y Vercel tienen sus propias variables—, así que si alguien
// sube esto sin configurar `VIDEO_DOMINIO`, lo que corre en producción es
// exactamente esta línea.
//
// Por eso el defecto tiene que ser un servidor que cumpla LAS DOS condiciones:
// que no pida iniciar sesión y que se deje incrustar. `meet.ffmuc.net` cumple
// solo la primera —manda X-Frame-Options y el navegador responde «rechazó la
// conexión»—, así que estuvo mal puesto acá y se corrigió.
export const dominioVideo = () => process.env.VIDEO_DOMINIO || 'jitsi.riot.im';

const jaasConfigurado = () =>
    !!(process.env.JAAS_APP_ID && process.env.JAAS_API_KEY && process.env.JAAS_PRIVATE_KEY);

const base64url = (obj) =>
    Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj))
        .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Token de JaaS. Se firma acá, con node y sin librerías: un JWT es
// base64(cabecera).base64(cuerpo).firma, y la firma RS256 la hace `crypto`.
// Agregar una dependencia para tres líneas no se justifica.
const firmarJaas = ({ usuario, sala, moderador }) => {
    const ahora = Math.floor(Date.now() / 1000);
    const cabecera = { alg: 'RS256', typ: 'JWT', kid: process.env.JAAS_API_KEY };
    const cuerpo = {
        aud: 'jitsi',
        iss: 'chat',
        sub: process.env.JAAS_APP_ID,
        room: sala,
        nbf: ahora - 10,
        // Dos horas alcanzan de sobra para una reunión, y un token que dura poco
        // es un token que sirve de poco si se filtra.
        exp: ahora + 2 * 60 * 60,
        context: {
            user: {
                id: usuario?.usuarioId || 'anon',
                name: usuario?.nombre || 'Invitado',
                email: usuario?.correo || undefined,
                // Todos los que entran son del equipo y ya pasaron por el login
                // del sistema: no hay razón para degradar a nadie a invitado.
                moderator: moderador === false ? 'false' : 'true',
            },
            features: {
                livestreaming: 'false', recording: 'false',
                transcription: 'false', 'outbound-call': 'false',
            },
        },
    };
    const cuerpoFirmable = `${base64url(cabecera)}.${base64url(cuerpo)}`;
    const firma = crypto.createSign('RSA-SHA256')
        .update(cuerpoFirmable)
        .sign(process.env.JAAS_PRIVATE_KEY.replace(/\\n/g, '\n'))
        .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${cuerpoFirmable}.${firma}`;
};

/**
 * Todo lo que la pantalla necesita para levantar el video de una sala.
 * @returns {{ dominio:string, sala:string, jwt:string|null }}
 */
export const configVideo = ({ usuario, sala, moderador = true }) => {
    if (!jaasConfigurado()) {
        return { dominio: dominioVideo(), sala, jwt: null };
    }
    // En JaaS la sala se llama «<AppID>/<sala>»: el identificador de la cuenta
    // va adentro del nombre. Si no, el servidor no sabe de quién es la sala.
    const salaJaas = `${process.env.JAAS_APP_ID}/${sala}`;
    return {
        dominio: process.env.JAAS_DOMINIO || '8x8.vc',
        sala: salaJaas,
        jwt: firmarJaas({ usuario, sala: salaJaas, moderador }),
    };
};
