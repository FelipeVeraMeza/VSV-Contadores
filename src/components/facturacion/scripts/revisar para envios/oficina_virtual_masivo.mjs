import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import csv from 'csv-parser';
import nodemailer from 'nodemailer';
import 'dotenv/config';

// =====================================================================
// 📍 AUTOLOCALIZACIÓN DEL ROBOT
// =====================================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CARPETA_DATA = path.join(__dirname, '../../data');

// =====================================================================
// ⚙️ CONFIGURACIÓN DE ARCHIVOS
// =====================================================================
// 🔧 CAMBIA AQUÍ el nombre del CSV que tengas en la carpeta 'data'
const NOMBRE_ARCHIVO = 'OFICINA VIRTUAL.csv';
const RUTA_EXACTA = path.join(CARPETA_DATA, NOMBRE_ARCHIVO);
const RUTA_FIRMA = path.join(CARPETA_DATA, 'firma mati.jpeg'); // Ruta de la firma
const SEPARADOR = ',';

// Columnas mínimas esperadas en el CSV (los nombres pueden variar, el buscador es inteligente):
//   RAZON SOCIAL | CORREO | FECHA INICIO | FECHA FIN | DIAS VENCIDO | ESTADO
// Solo se envían las filas donde la columna ESTADO = NOTIFICAR

const clientes = [];

// =====================================================================
// 🧠 BUSCADOR INTELIGENTE DE COLUMNAS
// =====================================================================
function buscarDato(fila, palabrasClave, valorPorDefecto) {
    const clavesArchivo = Object.keys(fila);

    for (let palabra of palabrasClave) {
        const encontrada = clavesArchivo.find(k => k === palabra);
        if (encontrada && fila[encontrada] && fila[encontrada].trim() !== '') {
            return fila[encontrada].trim();
        }
    }

    for (let palabra of palabrasClave) {
        const encontrada = clavesArchivo.find(k => k.includes(palabra));
        if (encontrada && fila[encontrada] && fila[encontrada].trim() !== '') {
            return fila[encontrada].trim();
        }
    }

    return valorPorDefecto;
}

// =====================================================================
// 📧 FUNCIÓN PARA ENVIAR EL CORREO DE OFICINA VIRTUAL
// =====================================================================
async function enviarCorreoOficinaVirtual(cliente) {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.GMAIL_EMAIL_PRINCIPAL, // matias.olivos@vsvconsultores.com
                pass: process.env.GMAIL_PASSWORD_PRINCIPAL
            }
        });

        const asunto = `VENCIMIENTO OFICINA VIRTUAL - ${cliente.razonSocial}`;

        const htmlCorreo = `
        <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 800px;">
            <p>Hola Buenas tardes <strong>${cliente.razonSocial}</strong>,</p>

            <p>Espero te encuentres muy bien, escribo para informarte que la oficina virtual de tu empresa está <strong>vencida</strong>.</p>

            <p>¿Te gustaría renovar dicho servicio? El valor sigue siendo el mismo <strong>$70.000 + IVA</strong>.</p>

            <p>
                Fecha de inicio del contrato: <strong>${cliente.fechaInicio}</strong><br>
                Fecha de fin del contrato: <strong>${cliente.fechaFin}</strong><br>
                Días vencido: <strong>${cliente.diasVencido}</strong>
            </p>

            <p style="font-weight: bold;">EN CASO DE NO RENOVAR FAVOR INFORMAR. ANTE LA NO RESPUESTA EN UN MES INFORMAREMOS AL SII QUE YA NO ESTÁS DOMICILIADO CON NOSOTROS.</p>

            <p>Si deseas renovar favor responder a este mail con el comprobante de pago.</p>

            <h3 style="color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 5px;">CUENTA BANCARIA</h3>
            <p>
                VOLLAIRE &amp; OLIVOS SIMPLE PYME LTDA<br>
                Banco BCI<br>
                Cuenta corriente<br>
                Rut 78.306.207-0<br>
                Número de cuenta: 70809538<br>
                MATIAS.OLIVOS@VSVCONSULTORES.COM
            </p>

            <h3 style="color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 5px;">LINK DE PAGO DEBITO O CREDITO</h3>
            <p><a href="https://www.flow.cl/btn.php?token=xe78c9acb73c3eff5e917d5c932a4a2f7f971abe" style="color: #0056b3;">https://www.flow.cl/btn.php?token=xe78c9acb73c3eff5e917d5c932a4a2f7f971abe</a></p>

            <p>Quedamos atentos a tu respuesta.<br>
            Saludos cordiales,</p>
            <br>
            <!-- 🔥 FIRMA INCRUSTADA -->
            <img src="cid:firma_mati" style="width: 250px; height: auto;" alt="Firma Matías Olivos">
        </div>
        `;

        const mailOptions = {
            from: `"Matías Olivos" <matias.olivos@vsvconsultores.com>`,
            to: cliente.correo, // DESTINATARIO REAL DEL CLIENTE
            subject: asunto,
            html: htmlCorreo,
            attachments: [
                {
                    filename: 'firma mati.jpeg',
                    path: RUTA_FIRMA,
                    cid: 'firma_mati' // Mismo ID que en el atributo src de la etiqueta img
                }
            ]
        };

        await transporter.sendMail(mailOptions);

        console.log(`   ✅ CORREO ENVIADO EXITOSAMENTE A: ${cliente.correo}`);
        return true;

    } catch (error) {
        console.error(`   ❌ ERROR AL ENVIAR a ${cliente.correo}:`, error.message);
        return false;
    }
}

// =====================================================================
// 🚀 MOTOR DE LECTURA Y ENVÍO EN PRODUCCIÓN
// =====================================================================
async function iniciarProceso() {
    console.log("==================================================");
    console.log("🚀 ENVÍO MASIVO: VENCIMIENTO OFICINA VIRTUAL");
    console.log("==================================================\n");

    if (!fs.existsSync(RUTA_EXACTA)) {
        console.error("❌ ERROR: El archivo CSV no se encuentra en la ruta:", RUTA_EXACTA);
        return;
    }

    if (!fs.existsSync(RUTA_FIRMA)) {
        console.warn("⚠️ ADVERTENCIA: No se encontró la imagen de la firma en:", RUTA_FIRMA);
        console.warn("   Los correos se enviarán sin la imagen de la firma.\n");
    }

    fs.createReadStream(RUTA_EXACTA)
        .pipe(csv({
            separator: SEPARADOR,
            mapHeaders: ({ header }) => header.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase()
        }))
        .on('data', (fila) => {
            const razonSocial = buscarDato(fila, ['RAZON SOCIAL', 'EMPRESA', 'CLIENTE'], '');

            if (razonSocial !== '') {
                clientes.push({
                    razonSocial: razonSocial,
                    correo: buscarDato(fila, ['CORREO', 'EMAIL', 'E-MAIL'], 'Sin Correo'),
                    fechaInicio: buscarDato(fila, ['FECHA INICIO', 'INICIO CONTRATO', 'FECHA DE INICIO', 'INICIO'], 'Sin Fecha'),
                    fechaFin: buscarDato(fila, ['FECHA FIN', 'FIN CONTRATO', 'FECHA DE FIN', 'VENCIMIENTO', 'FIN'], 'Sin Fecha'),
                    diasVencido: buscarDato(fila, ['DIAS VENCIDO', 'DIAS VENCIDOS', 'DIAS', 'DIAS DE VENCIMIENTO'], '0'),
                    estado: buscarDato(fila, ['ESTADO'], 'Sin Estado')
                });
            }
        })
        .on('end', async () => {
            // Filtro por la palabra NOTIFICAR en la columna ESTADO
            const clientesNotificar = clientes.filter(cliente =>
                cliente.estado.toUpperCase() === 'NOTIFICAR'
            );

            console.log(`📌 Clientes filtrados listos para envío real: ${clientesNotificar.length}\n`);

            for (let i = 0; i < clientesNotificar.length; i++) {
                console.log(`Procesando [${i + 1}/${clientesNotificar.length}] - ${clientesNotificar[i].razonSocial}`);

                // Si el cliente no tiene correo, nos saltamos el envío
                if (clientesNotificar[i].correo.toLowerCase() === 'sin correo') {
                    console.log(`   ⚠️ SALTADO: ${clientesNotificar[i].razonSocial} no tiene correo registrado.`);
                    continue;
                }

                await enviarCorreoOficinaVirtual(clientesNotificar[i]);

                if (i < clientesNotificar.length - 1) {
                    console.log("   ⏱️ Esperando 1 segundo para el siguiente envío...");
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            console.log("\n==================================================");
            console.log("🎉 ENVÍO MASIVO DE OFICINA VIRTUAL FINALIZADO");
            console.log("==================================================");
        })
        .on('error', (error) => {
            console.error('❌ Error interno al leer CSV:', error.message);
        });
}

iniciarProceso();
