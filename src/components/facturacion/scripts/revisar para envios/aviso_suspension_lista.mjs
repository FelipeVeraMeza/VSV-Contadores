// =====================================================================
// ⚠️ AVISO DE SUSPENSIÓN DE SERVICIO — LISTA FIJA (HARDCODEADA)
// ---------------------------------------------------------------------
// Avisa a cada empresa que su servicio contable fue suspendido por una
// factura vencida impaga, con su N° de factura y monto (neto + IVA).
// Reutiliza el motor de envío (Gmail API / Resend / SMTP con reintentos)
// de mensajes_facturador_masivo.mjs.
//
// Correr solo:  node "src/components/facturacion/scripts/revisar para envios/aviso_suspension_lista.mjs"
// =====================================================================
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { enviarConReintentos } from './mensajes_facturador_masivo.mjs';

const __filename = fileURLToPath(import.meta.url);
const delay = (ms) => new Promise(res => setTimeout(res, ms));

const LINK_PAGO = 'https://www.flow.cl/btn.php?token=xe78c9acb73c3eff5e917d5c932a4a2f7f971abe';

// Firma que ya usa el facturador (misma imagen, misma ruta relativa al cwd del server).
export const RUTA_FIRMA = './src/components/facturacion/data/firma mati.jpeg';
export const ADJUNTOS_FIRMA = [{ filename: 'firma mati.jpeg', path: RUTA_FIRMA, cid: 'firma_mati' }];

// =====================================================================
// 👥 LISTA FIJA DE DESTINATARIOS
// Campos: razonSocial, correo, folio, neto, bruto.
// Una fila puede tener 2 correos separados por ";" o espacio (ambos reciben).
// =====================================================================
export const DESTINATARIOS = [
    { razonSocial: 'A&L SOLUCIONES Y SERVICIOS', correo: 'ayl.transportesyservicios@gmail.com; salcedo840@gmail.com', folio: '1206', neto: '$10.000', bruto: '$11.900' },
    { razonSocial: 'ARQUITECTURA MATÍAS IGNACIO ALFARO ACEVEDO E.I.R.L.', correo: 'matignacio.arq@gmail.com', folio: '1148', neto: '$50.000', bruto: '$59.500' },
    { razonSocial: 'COMERCIALIZADORA ROVIRA', correo: 'robertosalas02@hotmail.com', folio: '1208', neto: '$220.000', bruto: '$261.800' },
    { razonSocial: 'COMERCIALIZADORA TORRES ASEO KEEN LIMITADA', correo: 'Ernestotorresduarte@Gmail.com', folio: '1215', neto: '$50.000', bruto: '$59.500' },
    { razonSocial: 'ESMEC SpA', correo: 'jonnyjos90@gmail.com', folio: '1209', neto: '$40.000', bruto: '$47.600' },
    { razonSocial: 'FARMACIAS HIGIA SPA', correo: 'karlafranv@gmail.com', folio: '1232', neto: '$50.000', bruto: '$59.500' },
    { razonSocial: 'GOVINDA CANO SPA', correo: 'perezjuanf94@gmail.com', folio: '1216', neto: '$30.000', bruto: '$35.700' },
    { razonSocial: 'JLT MAQUINARIA SPA', correo: 'Maquinarias.jlt@gmail.com', folio: '1179', neto: '$30.000', bruto: '$35.700' },
    { razonSocial: 'PRE-AFTER SCHOOL BURBUJITAS', correo: 'caro85_21@hotmail.com', folio: '1205', neto: '$10.000', bruto: '$11.900' },
    { razonSocial: 'RO GRUPO ARQUITECTURA Y DISEÑO IBEROAMERICANO', correo: 'contacto@ro-gadi.com', folio: '1142', neto: '$60.504', bruto: '$72.000' },
];

// =====================================================================
// 📊 Estado en vivo (por si se conecta a la página).
// =====================================================================
export const estadoAvisoSuspension = {
    activo: false, total: 0, actual: 0, enviados: 0, fallidos: 0,
    ultimoCorreo: '', finalizado: false, error: null,
};

function resetEstado(total) {
    Object.assign(estadoAvisoSuspension, {
        activo: true, total, actual: 0, enviados: 0, fallidos: 0,
        ultimoCorreo: '', finalizado: false, error: null,
    });
}

// Separa un campo "correo" en varias direcciones (por ; , o espacio) y deja solo las válidas.
function parsearCorreos(campo) {
    return String(campo || '')
        .split(/[;,\s]+/)
        .map(c => c.trim())
        .filter(c => c.includes('@'));
}

// =====================================================================
// ✉️ CONTENIDO DEL CORREO DE SUSPENSIÓN (por destinatario)
// =====================================================================
export function construirCorreoSuspension(dest) {
    const nombre = dest.razonSocial || 'cliente';
    const asunto = `Aviso de suspensión de servicio contable por factura pendiente N°${dest.folio}`;

    const texto = `Estimados ${nombre},

Junto con saludar, informamos que a la fecha aún se encuentra pendiente el pago de la factura N°${dest.folio}, la cual se encuentra vencida. Si ya realizaste el pago, favor enviar comprobante de pago por este medio lo antes posible.

Debido a lo anterior, y conforme a nuestras condiciones de servicio, el servicio ha sido suspendido temporalmente ⚠️ Esto implica no declaración de formularios (F29), no envio de documentación y no reuniones (si tu plan lo incluye). No nos haremos cargo de multas que esto implique.

Para reactivar el servicio, es necesario regularizar el pago por el siguiente monto:

Monto pendiente: ${dest.neto} + IVA = ${dest.bruto}

💳 Opciones de pago:
Transferencia bancaria:

*CUENTA BANCARIA*

VOLLAIRE & OLIVOS SIMPLE PYME LTDA

Banco BCI Cuenta corriente

Rut 78.306.207-0

Número de cuenta: 70809538

MATIAS.OLIVOS@VSVCONSULTORES.COM

Pago online:
👉 ${LINK_PAGO}

Una vez realizado el pago, agradeceremos enviar el comprobante para gestionar la reactivación a la brevedad ✅

Quedamos atentos ante cualquier consulta.

Saludos cordiales,
Equipo Simple Pyme`;

    // HTML: negrita en el monto, link clickeable y firma en imagen al final.
    let html = texto
        .replace(/\n/g, '<br>')
        .replace(LINK_PAGO, `<a href="${LINK_PAGO}">${LINK_PAGO}</a>`)
        .replace(`Monto pendiente: ${dest.neto} + IVA = ${dest.bruto}`, `<strong>Monto pendiente: ${dest.neto} + IVA = ${dest.bruto}</strong>`);
    html = `<div style="font-family: Arial, sans-serif; color: #333; line-height: 1.5;">${html}<br><br><img src="cid:firma_mati" style="width: 200px; height: auto;"></div>`;

    return { asunto, texto, html };
}

// =====================================================================
// 🚀 ENVÍO MASIVO DEL AVISO DE SUSPENSIÓN
// =====================================================================
export async function enviarAvisoSuspensionLista() {
    const destinatarios = DESTINATARIOS
        .map(d => ({ ...d, correos: parsearCorreos(d.correo) }))
        .filter(d => d.correos.length > 0);

    resetEstado(destinatarios.length);

    console.log('==================================================');
    console.log(`⚠️ AVISO DE SUSPENSIÓN (LISTA FIJA): ${destinatarios.length} empresa(s)`);
    console.log('==================================================');

    for (let i = 0; i < destinatarios.length; i++) {
        const dest = destinatarios[i];
        estadoAvisoSuspension.actual = i + 1;
        estadoAvisoSuspension.ultimoCorreo = dest.correos.join(', ');

        const { asunto, html } = construirCorreoSuspension(dest);
        const mailOptions = {
            from: `"Matías Olivos" <matias.olivos@vsvconsultores.com>`,
            to: dest.correos,
            subject: asunto,
            html,
            attachments: ADJUNTOS_FIRMA,
        };

        try {
            console.log(`📧 [${i + 1}/${destinatarios.length}] Suspensión → ${dest.razonSocial} (${dest.correos.join(', ')})`);
            await enviarConReintentos(mailOptions);
            estadoAvisoSuspension.enviados++;
        } catch (e) {
            estadoAvisoSuspension.fallidos++;
            console.log(`   ❌ Falló ${dest.correos.join(', ')}: ${e.message}`);
        }

        if (i < destinatarios.length - 1) await delay(1500);
    }

    estadoAvisoSuspension.activo = false;
    estadoAvisoSuspension.finalizado = true;
    console.log(`✅ AVISO DE SUSPENSIÓN TERMINADO. Enviados: ${estadoAvisoSuspension.enviados} | Fallidos: ${estadoAvisoSuspension.fallidos}`);
    return { ok: true, enviados: estadoAvisoSuspension.enviados, fallidos: estadoAvisoSuspension.fallidos, total: destinatarios.length };
}

// ⚠️ Solo se ejecuta si corres ESTE archivo directamente con node.
const ejecutadoDirectamente = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (ejecutadoDirectamente) {
    enviarAvisoSuspensionLista().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
