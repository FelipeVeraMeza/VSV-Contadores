// ============================================================================
// Envío de correo reutilizable (liquidaciones, avisos, notificaciones)
// ----------------------------------------------------------------------------
// Antes esto mandaba por SMTP directo con nodemailer. Dos problemas:
//
//   1. Railway BLOQUEA los puertos SMTP salientes, así que en producción no
//      salía ni un correo. Funcionaba solo desde el computador local.
//   2. El facturador masivo ya tenía resuelto el problema con una cascada de
//      tres vías, pero vivía en su propio archivo y nadie más la usaba.
//
// Ahora todo el sistema manda por la misma cascada:
//
//      1. API de Gmail por HTTPS   (si hay GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN)
//      2. Resend por HTTPS         (si hay RESEND_API_KEY)
//      3. Gmail SMTP con reintentos en dos puertos  (solo sirve en local)
//
// Ver docs/correo-envio-diagnostico.md para el estado de cada vía.
// ============================================================================
import { enviarConReintentos } from '../components/facturacion/scripts/revisar para envios/mensajes_facturador_masivo.mjs';

const REMITENTE = 'matias.olivos@vsvconsultores.com';

// Hay alguna vía disponible si existe cualquiera de las tres configuraciones.
export const correoConfigurado = () => Boolean(
    (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN) ||
    process.env.RESEND_API_KEY ||
    (process.env.GMAIL_EMAIL_Masivo && process.env.GMAIL_PASSWORD_Masivo) ||
    (process.env.GMAIL_EMAIL_PRINCIPAL && process.env.GMAIL_PASSWORD_PRINCIPAL)
);

/**
 * Envía un correo por la primera vía que funcione.
 *
 * @param {{to:string, subject:string, html:string, attachments?:Array, replyTo?:string, from?:string, bcc?:string}} opts
 * @returns {Promise<boolean>} true si salió por alguna vía.
 * @throws  Si ninguna vía está configurada, o si todas fallaron.
 */
export const enviarCorreo = async ({ to, subject, html, attachments, replyTo, from, bcc }) => {
    if (!correoConfigurado()) {
        const err = new Error(
            'El correo no está configurado. Hace falta al menos una vía: ' +
            'Gmail API (GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN), Resend (RESEND_API_KEY) ' +
            'o SMTP (GMAIL_EMAIL_Masivo/GMAIL_PASSWORD_Masivo).'
        );
        err.code = 'MAIL_NO_CONFIG';
        throw err;
    }

    return enviarConReintentos({
        // Quien envía manda; si no pide ninguno, el de la variable de entorno; y
        // si tampoco está, la dirección de siempre. El orden importa: con el
        // valor fijo primero, `RESEND_FROM` no se aplicaba nunca, porque acá
        // siempre había un `from` armado antes de llegar al proveedor.
        from: from || process.env.RESEND_FROM || `"Matias Olivos" <${REMITENTE}>`,
        to,
        subject,
        html,
        ...(attachments ? { attachments } : {}),
        ...(replyTo ? { replyTo } : {}),
        // Copia oculta, para dejar registro en la casilla propia.
        ...(bcc ? { bcc } : {}),
    });
};
