// ============================================================================
// Envío de correo reutilizable (nodemailer + Gmail).
//
// Usa las mismas credenciales de los envíos masivos del sistema:
//   GMAIL_EMAIL_Masivo / GMAIL_PASSWORD_Masivo (definidas en .env).
//
// Si faltan credenciales lanza un error claro para que la capa HTTP responda
// 503 en vez de romper silenciosamente.
// ============================================================================
import nodemailer from 'nodemailer';

let transporter = null;

const getTransporter = () => {
  const user = process.env.GMAIL_EMAIL_Masivo;
  const pass = process.env.GMAIL_PASSWORD_Masivo;
  if (!user || !pass) {
    const err = new Error('El correo no está configurado (faltan GMAIL_EMAIL_Masivo / GMAIL_PASSWORD_Masivo).');
    err.code = 'MAIL_NO_CONFIG';
    throw err;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  }
  return transporter;
};

/**
 * Envía un correo. Devuelve la respuesta del servidor SMTP.
 * @param {{to:string, subject:string, html:string, attachments?:Array, replyTo?:string}} opts
 */
export const enviarCorreo = async ({ to, subject, html, attachments, replyTo }) => {
  const t = getTransporter();
  const from = `"VS Consultores — Remuneraciones" <${process.env.GMAIL_EMAIL_Masivo}>`;
  const info = await t.sendMail({ from, to, subject, html, attachments, replyTo });
  return info;
};

export const correoConfigurado = () =>
  Boolean(process.env.GMAIL_EMAIL_Masivo && process.env.GMAIL_PASSWORD_Masivo);
