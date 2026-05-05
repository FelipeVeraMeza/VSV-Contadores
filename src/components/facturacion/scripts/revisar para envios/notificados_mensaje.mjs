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
// 📧 FUNCIÓN PARA ENVIAR EL CORREO REAL
// =====================================================================
async function enviarCorreoUrgente(cliente) {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.GMAIL_EMAIL_PRINCIPAL,
                pass: process.env.GMAIL_PASSWORD_PRINCIPAL
            }
        });

        // 🔥 ICONO DE EMERGENCIA EN EL ASUNTO
        const asunto = `🚨 URGENTE - AÚN NO TERMINAS TU DECLARACIÓN DE RENTA`;
        
        const htmlCorreo = `
        <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 800px;">
            <p>Estimados <strong>${cliente.razonSocial}</strong>,</p>

            <p>Junto con saludar, te informamos que al revisar tu estado, detectamos que aún no has completado tu proceso de Declaración de Renta.</p>
            
            <p>Recuerda que el plazo vence <strong style="color: #d9534f; font-size: 1.1em;">hoy a las 23:59 hrs</strong>, por lo que es fundamental que puedas finalizarlo dentro del horario establecido para evitar multas o inconvenientes con el SII.</p>

            <p>Te solicitamos revisar el <strong>último correo que te enviamos</strong>, donde se detallan las instrucciones necesarias para completar correctamente el proceso.</p>

            <p>Si tienes dudas o necesitas apoyo urgente, quedamos atentos para ayudarte.</p>

            <p>Saludos cordiales,<br>
            <strong>Equipo Simple Pyme</strong></p>
            <br>
            <img src="cid:firma_mati" style="width: 250px; height: auto;" alt="Firma Matías Olivos">
        </div>
        `;

        const mailOptions = {
            from: `"Matías Olivos" <matias.olivos@vsvconsultores.com>`,
            to: cliente.correo, // 🔥 DESTINATARIO REAL DEL CSV
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
        
        console.log(`   ✅ URGENCIA ENVIADA A: ${cliente.correo} (${cliente.razonSocial})`);
        return true;

    } catch (error) {
        console.error(`   ❌ ERROR AL ENVIAR A ${cliente.correo}:`, error.message);
        return false;
    }
}

// =====================================================================
// 🚀 MOTOR DE LECTURA Y ENVÍO (MODO PRODUCCIÓN TOTAL)
// =====================================================================
async function iniciarProcesoUrgente() {
    console.log("==================================================");
    console.log("🚨 INICIANDO PRODUCCIÓN: ENVÍO MASIVO REAL DE URGENCIA");
    console.log("==================================================\n");

    if (!fs.existsSync(RUTA_EXACTA)) {
        console.error("❌ ERROR: El archivo CSV no se encuentra en la ruta:", RUTA_EXACTA);
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
                    estado: buscarDato(fila, ['ESTADO'], 'Sin Estado')
                });
            }
        })
        .on('end', async () => {
            const clientesNotificados = clientes.filter(cliente => 
                cliente.estado.toUpperCase() === 'NOTIFICADO'
            );
            
            console.log(`📌 Se enviarán ${clientesNotificados.length} correos REALES a los clientes rezagados.\n`);
            
            for (let i = 0; i < clientesNotificados.length; i++) {
                console.log(`Procesando [${i + 1}/${clientesNotificados.length}] - Destino: ${clientesNotificados[i].razonSocial}`);
                
                // Si el cliente no tiene correo, nos saltamos el envío para que no crashee
                if (clientesNotificados[i].correo.toLowerCase() === 'sin correo') {
                    console.log(`   ⚠️ SALTADO: ${clientesNotificados[i].razonSocial} no tiene correo registrado.`);
                    continue;
                }

                await enviarCorreoUrgente(clientesNotificados[i]);

                // Pausa de 1 segundo entre correos para evitar bloqueos por spam
                if (i < clientesNotificados.length - 1) {
                    console.log("   ⏱️ Esperando 1 segundo...");
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            console.log("\n==================================================");
            console.log("🎉 ENVÍO REAL MASIVO FINALIZADO CON ÉXITO.");
            console.log("==================================================");
        })
        .on('error', (error) => {
            console.error('❌ Error interno al leer CSV:', error.message);
        });
}

iniciarProcesoUrgente();