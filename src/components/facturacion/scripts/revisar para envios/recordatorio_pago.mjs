// =====================================================================
// 📢 MÓDULO DE RECORDATORIO DE PAGO (independiente del facturador masivo)
// ---------------------------------------------------------------------
// Toma los correos de las facturas ya ENVIADAS (registradas en la tabla
// correos_facturas) dentro de un rango de fechas y les manda un correo
// recordándoles que deben pagar. NO adjunta la factura (es solo aviso).
//
// Reutiliza el motor de envío (Gmail API / Resend / SMTP con reintentos)
// de mensajes_facturador_masivo.mjs para no duplicar credenciales/lógica.
//
// Se dispara desde un botón en Facturación (endpoint /dte/enviar-recordatorios).
// =====================================================================
import 'dotenv/config';
import { pool } from '../../../../database/db.js';
import { enviarConReintentos } from './mensajes_facturador_masivo.mjs';

const delay = (ms) => new Promise(res => setTimeout(res, ms));

// Firma que ya usa el facturador (misma imagen, misma ruta relativa al cwd del server).
const RUTA_FIRMA = './src/components/facturacion/data/firma mati.jpeg';

// 📊 Estado en vivo para que la página pueda mostrar el progreso (como estadoRobot).
export const estadoRecordatorio = {
    activo: false,
    total: 0,
    actual: 0,
    enviados: 0,
    fallidos: 0,
    ultimoCorreo: '',
    finalizado: false,
    error: null,
};

function resetEstado(total) {
    estadoRecordatorio.activo = true;
    estadoRecordatorio.total = total;
    estadoRecordatorio.actual = 0;
    estadoRecordatorio.enviados = 0;
    estadoRecordatorio.fallidos = 0;
    estadoRecordatorio.ultimoCorreo = '';
    estadoRecordatorio.finalizado = false;
    estadoRecordatorio.error = null;
}

// =====================================================================
// 👥 DESTINATARIOS
// Correos únicos y válidos de facturas ENVIADAS en el rango [desde, hasta].
// Por defecto: desde el 27-jun hasta hoy (lo que pidió el negocio).
// =====================================================================
export async function obtenerDestinatariosRecordatorio({ desde = '2026-06-27', hasta = null } = {}) {
    const params = [desde];
    let filtroHasta = '';
    if (hasta) { params.push(hasta); filtroHasta = `AND fecha < ($${params.length}::date + INTERVAL '1 day')`; }

    const { rows } = await pool.query(
        `SELECT DISTINCT ON (LOWER(TRIM(correo)))
                razon_social AS "razonSocial", correo, folio
         FROM correos_facturas
         WHERE fecha >= $1::date ${filtroHasta}
           AND estado = 'enviado'
           AND correo LIKE '%@%'
           AND correo NOT ILIKE '%No_encontrado%'
           AND correo NOT ILIKE '%Error_al_leer%'
           AND correo NOT ILIKE '%falta_correo%'
         ORDER BY LOWER(TRIM(correo)), fecha DESC`,
        params
    );
    return rows;
}

// =====================================================================
// ✉️ CONTENIDO DEL CORREO RECORDATORIO
// =====================================================================
export function construirCorreoRecordatorio(razonSocial, { fechaLimite = '5 de julio' } = {}) {
    const nombre = razonSocial || 'Estimado cliente';

    const asunto = 'Recordatorio de pago – Factura servicio contable';

    const texto = `Estimados ${nombre}:

Junto con saludar, le recordamos que se encuentra pendiente el pago de la factura correspondiente al servicio de contabilidad mensual contratado por la empresa.

Le solicitamos regularizar el pago a más tardar el ${fechaLimite}. Si ya realizó el pago, por favor ignore este mensaje y le agradecemos enviarnos el comprobante por este medio.

Medios de pago:

TRANSFERENCIA BANCARIA
VOLLAIRE & OLIVOS SIMPLE PYME LTDA
Banco BCI
Cuenta corriente
Rut 78.306.207-0
Numero de cuenta: 70809538
MATIAS.OLIVOS@VSVCONSULTORES.COM

LINK DE PAGO DEBITO O CREDITO

https://www.flow.cl/btn.php?token=xe78c9acb73c3eff5e917d5c932a4a2f7f971abe

Solicito enviar el comprobante de pago por este medio.

Saludos cordiales,`;

    const html = `<div style="font-family: Arial, sans-serif; color: #333; line-height: 1.5;">
                    ${texto.replace(/\n/g, '<br>')}
                    <br><br>
                    <img src="cid:firma_mati" style="width: 200px; height: auto;">
                   </div>`;

    return { asunto, texto, html };
}

// =====================================================================
// 🚀 ENVÍO MASIVO DE RECORDATORIOS
// Corre en segundo plano. Actualiza estadoRecordatorio en cada paso.
// =====================================================================
export async function enviarRecordatoriosPago({ desde = '2026-06-27', hasta = null, fechaLimite = '5 de julio' } = {}) {
    const destinatarios = await obtenerDestinatariosRecordatorio({ desde, hasta });
    resetEstado(destinatarios.length);

    console.log('==================================================');
    console.log(`📢 RECORDATORIO DE PAGO: ${destinatarios.length} empresa(s)`);
    console.log(`   Rango: desde ${desde}${hasta ? ` hasta ${hasta}` : ' hasta hoy'} | Límite de pago: ${fechaLimite}`);
    console.log('==================================================');

    for (let i = 0; i < destinatarios.length; i++) {
        const dest = destinatarios[i];
        estadoRecordatorio.actual = i + 1;
        estadoRecordatorio.ultimoCorreo = dest.correo;

        const { asunto, html } = construirCorreoRecordatorio(dest.razonSocial, { fechaLimite });
        const mailOptions = {
            from: `"Simple Pyme" <matias.olivos@vsvconsultores.com>`,
            to: dest.correo,
            subject: asunto,
            html,
            attachments: [
                { filename: 'firma mati.jpeg', path: RUTA_FIRMA, cid: 'firma_mati' }
            ]
        };

        try {
            console.log(`📧 [${i + 1}/${destinatarios.length}] Recordatorio → ${dest.razonSocial} (${dest.correo})`);
            await enviarConReintentos(mailOptions);
            estadoRecordatorio.enviados++;
        } catch (e) {
            estadoRecordatorio.fallidos++;
            console.log(`   ❌ Falló ${dest.correo}: ${e.message}`);
        }

        // Pausa corta para no saturar el envío (mismo criterio que el facturador).
        if (i < destinatarios.length - 1) await delay(1500);
    }

    estadoRecordatorio.activo = false;
    estadoRecordatorio.finalizado = true;
    console.log(`✅ RECORDATORIOS TERMINADOS. Enviados: ${estadoRecordatorio.enviados} | Fallidos: ${estadoRecordatorio.fallidos}`);
    return { ok: true, enviados: estadoRecordatorio.enviados, fallidos: estadoRecordatorio.fallidos, total: destinatarios.length };
}
