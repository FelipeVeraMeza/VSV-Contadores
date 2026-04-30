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
const CARPETA_DATA = path.join(__dirname, '../data');

// =====================================================================
// ⚙️ CONFIGURACIÓN DE ARCHIVOS
// =====================================================================
const NOMBRE_ARCHIVO = 'CONTABILIDAD 2026 - DDDJJ RENTA .csv';
const RUTA_EXACTA = path.join(CARPETA_DATA, NOMBRE_ARCHIVO);
const RUTA_FIRMA = path.join(CARPETA_DATA, 'firma mati.jpeg');
const SEPARADOR = ','; 

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
// 📧 FUNCIÓN PARA ENVIAR EL CORREO REAL A SOCIOS
// =====================================================================
async function enviarCorreoSociosReal(cliente) {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.GMAIL_EMAIL_PRINCIPAL,
                pass: process.env.GMAIL_PASSWORD_PRINCIPAL
            }
        });

        const asunto = `Declaración de Renta Socios 2026 declarada`;
        
        const htmlCorreo = `
        <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 800px;">
            <p>Estimados socios de <strong>${cliente.razonSocial}</strong>,</p>

            <p>Junto con saludar, les informamos que su <strong>Declaración de Renta Socios 2026</strong> ya se encuentra preparada.</p>
            
            <p>Para finalizar correctamente el proceso, cada socio debe ingresar al SII con su <strong>RUT y clave tributaria personal</strong>, recuperar la declaración guardada y completar el envío según corresponda: <strong>pago de impuesto</strong> o <strong>solicitud de devolución</strong>.</p>

            <h3 style="color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 5px;">💰 En caso de tener impuesto a pagar</h3>
            <p>Para revisar, enviar y pagar la declaración, deben seguir estos pasos:</p>
            <ol>
                <li>Ingresar a <a href="https://www.sii.cl" style="color: #0056b3;">www.sii.cl</a></li>
                <li>Acceder con el <strong>RUT y clave tributaria del socio</strong></li>
                <li>Ir a <strong>Servicios Online</strong></li>
                <li>Seleccionar <strong>Declarar Renta (F22)</strong></li>
                <li>Seleccionar <strong>Año Tributario 2026</strong> y presionar <strong>Continuar</strong></li>
                <li>Seleccionar <strong>Recuperar declaración guardada</strong></li>
                <li>Presionar <strong>Validar y enviar declaración</strong> (aparece abajo en color azul)</li>
                <li>Seleccionar <strong>Pago en línea con tarjeta de crédito o cuenta corriente</strong></li>
                <li>Elegir el medio de pago y ejecutar el pago</li>
                <li>Una vez realizado el pago, favor <strong>darnos aviso</strong> para dejar respaldo del proceso</li>
            </ol>

            <h3 style="color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 5px;">🏦 En caso de tener devolución de impuestos</h3>
            <p>Para solicitar la devolución en su cuenta bancaria, deben seguir estos pasos:</p>
            <ol>
                <li>Ingresar a <a href="https://www.sii.cl" style="color: #0056b3;">www.sii.cl</a></li>
                <li>Acceder con el <strong>RUT y clave tributaria del socio</strong></li>
                <li>Ir a <strong>Servicios Online</strong></li>
                <li>Seleccionar <strong>Declarar Renta (F22)</strong></li>
                <li>Seleccionar <strong>Año Tributario 2026</strong> y presionar <strong>Continuar</strong></li>
                <li>Seleccionar <strong>Recuperar declaración guardada</strong></li>
                <li>Presionar <strong>Continuar</strong></li>
                <li>Seleccionar <strong>Acepto cobertura total</strong></li>
                <li>Presionar <strong>Continuar</strong></li>
                <li>Bajar hasta la sección de datos bancarios</li>
                <li>Ingresar el <strong>tipo de cuenta</strong> y los datos de la cuenta bancaria asociada al RUT del socio</li>
                <li>Enviar el formulario</li>
                <li>Una vez enviado, favor <strong>darnos aviso</strong> para dejar respaldo del proceso</li>
            </ol>

            <p style="margin-top: 20px;"><strong>Es importante que cada socio realice este proceso a la brevedad</strong> para finalizar correctamente su Declaración de Renta 2026 ante el SII.</p>
            
            <p>Quedamos atentos ante cualquier duda o inconveniente.</p>

            <p>Saludos cordiales,<br>
            <strong>Equipo Simple Pyme</strong></p>
            <br>
            <img src="cid:firma_mati" style="width: 250px; height: auto;" alt="Firma Matías Olivos">
        </div>
        `;

        const mailOptions = {
            from: `"Matías Olivos" <matias.olivos@vsvconsultores.com>`,
            to: cliente.correo, // 🔥 ENVÍO REAL AL CLIENTE
            subject: asunto,
            html: htmlCorreo,
            attachments: [
                {
                    filename: 'firma mati.jpeg',
                    path: RUTA_FIRMA,
                    cid: 'firma_mati'
                }
            ]
        };
        
        await transporter.sendMail(mailOptions);
        console.log(`   ✅ CORREO ENVIADO A: ${cliente.correo} (${cliente.razonSocial})`);
        return true;

    } catch (error) {
        console.error(`   ❌ ERROR AL ENVIAR A ${cliente.correo}:`, error.message);
        return false;
    }
}

// =====================================================================
// 🚀 MOTOR DE PRODUCCIÓN TOTAL
// =====================================================================
async function iniciarProcesoSociosReal() {
    console.log("==================================================");
    console.log("🚨 INICIANDO PRODUCCIÓN: NOTIFICACIÓN REAL SOCIOS");
    console.log("==================================================\n");

    if (!fs.existsSync(RUTA_EXACTA)) {
        console.error("❌ ERROR: No se encuentra el archivo CSV.");
        return;
    }

    fs.createReadStream(RUTA_EXACTA)
        .pipe(csv({ 
            separator: SEPARADOR,
            mapHeaders: ({ header }) => header.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase() 
        }))
        .on('data', (fila) => {
            const razonSocial = buscarDato(fila, ['RAZON SOCIAL', 'EMPRESA', 'CLIENTE'], '');
            if (razonSocial !== '') {
                clientes.push({
                    razonSocial: razonSocial,
                    correo: buscarDato(fila, ['CORREO', 'EMAIL', 'E-MAIL'], 'Sin Correo'),
                    estado: buscarDato(fila, ['ESTADO'], 'Sin Estado'),
                    socios: buscarDato(fila, ['SOCIOS'], 'Sin Estado Socios')
                });
            }
        })
        .on('end', async () => {
            // 🔥 FILTRO PARA LOS 97:
            const sociosParaNotificar = clientes.filter(cliente => {
                const estadoActual = cliente.estado.toUpperCase();
                const estadoSocios = cliente.socios.toUpperCase();
                const cumpleEstado = estadoActual.includes('DECLARADO') || 
                                     estadoActual.includes('NOTIFICADO') || 
                                     estadoActual.includes('REVISAR') ||
                                     estadoActual.includes('NOTIFICAR');
                const cumpleSocios = estadoSocios.includes('NOTIFICAR');
                return cumpleEstado && cumpleSocios;
            });

            console.log(`📌 Total en base: ${clientes.length}`);
            console.log(`🎯 Iniciando envío masivo a ${sociosParaNotificar.length} socios registrados.\n`);
            
            for (let i = 0; i < sociosParaNotificar.length; i++) {
                console.log(`Enviando [${i + 1}/${sociosParaNotificar.length}] - ${sociosParaNotificar[i].razonSocial}`);
                
                if (sociosParaNotificar[i].correo.toLowerCase() === 'sin correo') {
                    console.log(`   ⚠️ SALTADO: No tiene correo.`);
                    continue;
                }

                await enviarCorreoSociosReal(sociosParaNotificar[i]);

                if (i < sociosParaNotificar.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000)); // ⏱️ 1 Segundo de espera
                }
            }

            console.log("\n==================================================");
            console.log("🎉 ENVÍO MASIVO DE SOCIOS FINALIZADO CON ÉXITO");
            console.log("==================================================");
        })
        .on('error', (error) => {
            console.error('❌ Error al procesar CSV:', error.message);
        });
}

iniciarProcesoSociosReal();