import nodemailer from 'nodemailer';
import 'dotenv/config'; // Esto carga automáticamente tu archivo .env

async function enviarCorreoTodoEnUno() {
    console.log("🚀 Preparando el envío del correo...");

    try {
        // 1. Configurar la conexión leyendo tu .env
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.GMAIL_EMAIL_Masivo,
                pass: process.env.GMAIL_PASSWORD_Masivo
            }
        });

        // 2. El texto exacto de tu correo
        const textoCorreo = `Estimados CONGELADOS Y GOURMET B&B SPA

Junto con saludar, informamos que ya hemos emitido la factura N°860 correspondiente al servicio de contabilidad FULL EMPRENDEDOR, la cual se encuentra disponible para pago.

📅 Fecha de vencimiento: 5 de abril

Solicitamos realizar el pago antes de esa fecha para evitar la suspensión del servicio y asegurar la continuidad normal de tus procesos contables y tributarios.

VALOR: $60,504 + IVA = $72,000

🔄 Mecanismos de pago

Transferencia bancaria:
VOLLAIRE & OLIVOS SIMPLE PYME LTDA
Banco BCI
Cuenta Corriente
RUT: 78.306.207-0
N° Cuenta: 70809538
Correo: MATIAS.OLIVOS@VSVCONSULTORES.COM

🌐 Pago en línea:
https://www.flow.cl/btn.php?token=xe78c9acb73c3eff5e917d5c932a4a2f7f971abe

Una vez realizado el pago, agradecemos enviar el comprobante para su registro.

Quedamos atentos a tu confirmación y, si deseas cotizar la Operación Renta, podemos enviarte el detalle del servicio.

Saludos cordiales,
Simple Pyme`;

        // 3. Armar el paquete completo (Destinatario, Asunto, HTML y Adjuntos)
        const correoDestino = 'matias.olivosb@gmail.com'; // <--- CORREO QUE RECIBE

        const mailOptions = {
            from: `"Proyecto VS Consultores" <${process.env.GMAIL_EMAIL_Masivo}>`,
            to: correoDestino,
            subject: 'Factura N°860 - Servicio Contabilidad FULL EMPRENDEDOR - Simple Pyme',
            html: `
                <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.5;">
                    ${textoCorreo.replace(/\n/g, '<br>')}
                    <br><br>
                    <img src="cid:firma_mati" style="width: 200px; height: auto;">
                </div>
            `,
            attachments: [
                {
                    filename: 'Factura_860.pdf',
                    // Asegúrate de que el PDF exista en esta ruta exacta
                    path: './src/components/facturacion/data/prueba.pdf' 
                },
                {
                    filename: 'firma mati.jpeg',
                    // Asegúrate de que la imagen exista en esta ruta exacta
                    path: './src/components/facturacion/data/firma mati.jpeg',
                    cid: 'firma_mati' // Conecta la imagen con la etiqueta <img> del HTML
                }
            ]
        };

        // 4. Enviar
        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ ¡ÉXITO! Correo enviado correctamente a: ${correoDestino}`);
        console.log(`📩 Respuesta del servidor: ${info.response}`);

    } catch (error) {
        console.error('❌ ERROR AL ENVIAR EL CORREO:');
        console.error(error.message);
    }
}

// Ejecutar la función
enviarCorreoTodoEnUno();