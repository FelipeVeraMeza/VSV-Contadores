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
const RUTA_FIRMA = path.join(CARPETA_DATA, 'firma mati.jpeg'); // Ruta de la firma
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
async function enviarCorreoOperacionRenta(cliente) {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.GMAIL_EMAIL_PRINCIPAL, // Debe ser matiasolivosb@gmail.com en el .env
                pass: process.env.GMAIL_PASSWORD_PRINCIPAL
            }
        });

        const asunto = `Información Proceso Operación Renta – Declaración y Pago de Impuesto`;
        
        const htmlCorreo = `
        <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 800px;">
            <p>Estimados <strong>${cliente.razonSocial}</strong><br>
            RUT: <strong>${cliente.rut}</strong></p>

            <p>Junto con saludar, informamos que <strong>Simple Pyme</strong> ha preparado exitosamente su Declaración de Renta correspondiente al presente período tributario.</p>
            
            <p>A continuación, se detallan los principales resultados de su proceso:</p>
            
            <ul>
                <li><strong>Ingresos:</strong> ${cliente.ingresos}</li>
                <li><strong>Egresos:</strong> ${cliente.egresos}</li>
                <li><strong>IMPUESTO A LA RENTA:</strong> <span style="color: #d9534f; font-weight: bold; font-size: 1.1em;">${cliente.impuestoRenta}</span></li>
            </ul>

            <h3 style="color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 5px;">💳 Pago del Impuesto</h3>
            <p>El impuesto determinado debe ser pagado <strong>a más tardar el 30 de abril</strong>.</p>
            <p>En caso de no contar con liquidez suficiente en este momento, existe la opción de <strong>solicitar pago diferido</strong>, lo que permitirá realizar el pago del impuesto en el mes de <strong>junio</strong>.</p>

            <h3 style="color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 5px;">📎 Envío de Gastos Adicionales</h3>
            <p>Si su empresa cuenta con gastos adicionales no facturados, estos pueden ser incorporados enviando una planilla Excel con el siguiente detalle:</p>
            <ul>
                <li>Fecha del gasto</li>
                <li>Nombre del proveedor</li>
                <li>Monto</li>
                <li>Concepto</li>
            </ul>
            <p><strong>Condiciones obligatorias:</strong> El gasto debe estar reflejado en la cartola bancaria (empresa o socios).</p>

            <h3 style="color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 5px;">🖥️ Cómo pagar el impuesto</h3>
            <p>Para revisar o gestionar su declaración, debe seguir estos pasos:</p>
            <ol>
                <li>Ingresar a: <a href="https://www.sii.cl" style="color: #0056b3;">www.sii.cl</a></li>
                <li>Acceder con el RUT y clave tributaria de la empresa:
                    <ul>
                        <li><strong>RUT EMPRESA:</strong> ${cliente.rut}</li>
                        <li><strong>CLAVE SII EMPRESA:</strong> ${cliente.clave}</li>
                    </ul>
                </li>
                <li>Seleccionar <strong>SERVICIOS ONLINE</strong></li>
                <li>Seleccionar <strong>DECLARAR RENTA (F22)</strong></li>
                <li>Seleccionar <strong>2026 Y CONTINUAR</strong></li>
                <li>Seleccionar <strong>RECUPERAR DECLARACIÓN GUARDADA</strong></li>
                <li><strong>VALIDAR Y ENVIAR DECLARACIÓN</strong> (Aparece botón en azul)</li>
                <li><strong>PAGO EN LÍNEA CON TARJETA DE CRÉDITO O CUENTA CORRIENTE</strong></li>
                <li>SELECCIONAR MEDIO DE PAGO Y EJECUTAR EL PAGO</li>
                <li><strong>DARNOS AVISO CUANDO REALICE EL PAGO</strong></li>
            </ol>

            <p style="margin-top: 30px;">Quedamos atentos a cualquier consulta y a la recepción de información adicional en caso de ser necesario.</p>

            <p>Saludos cordiales,<br>
            <strong>Equipo Simple Pyme</strong></p>
            <br>
            <!-- 🔥 FIRMA INCRUSTADA -->
            <img src="cid:firma_mati" style="width: 250px; height: auto;" alt="Firma Matías Olivos">
        </div>
        `;

        const mailOptions = {
            // 🔥 REMITENTE ACTUALIZADO A MATÍAS OLIVOS
            from: `"Matías Olivos" <matias.olivos@vsvconsultores.com>`,
            to: cliente.correo, // DESTINATARIO REAL DEL CLIENTE
            subject: asunto,
            html: htmlCorreo,
            // 🔥 IMAGEN ADJUNTA COMO CID PARA EL HTML
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
    console.log("🚀 INICIANDO MODO PRODUCCIÓN: ENVÍO REAL Y RÁPIDO");
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
            mapHeaders: ({ header }) => header.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase() 
        }))
        .on('data', (fila) => {
            const razonSocial = buscarDato(fila, ['RAZON SOCIAL', 'EMPRESA', 'CLIENTE'], '');

            if (razonSocial !== '') {
                clientes.push({
                    razonSocial: razonSocial,
                    rut: buscarDato(fila, ['RUT', 'R.U.T'], 'Sin RUT'),
                    clave: buscarDato(fila, ['CLAVE', 'CLAVE SII', 'PASSWORD'], 'Sin Clave'),
                    correo: buscarDato(fila, ['CORREO', 'EMAIL', 'E-MAIL'], 'Sin Correo'),
                    ingresos: buscarDato(fila, ['INGRESOS', 'VENTAS NETAS', 'VENTAS'], '$0'),
                    egresos: buscarDato(fila, ['EGRESOS', 'COMPRAS NETAS', 'COMPRAS'], '$0'),
                    impuestoRenta: buscarDato(fila, ['IMPUESTO RENTA', 'IMPUESTO A PAGAR', 'IMPUESTO UNICO'], '$0'),
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

                await enviarCorreoOperacionRenta(clientesNotificar[i]);

                if (i < clientesNotificar.length - 1) {
                    console.log("   ⏱️ Esperando 1 segundo para el siguiente envío...");
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            console.log("\n==================================================");
            console.log("🎉 ENVÍO MASIVO REAL FINALIZADO CON ÉXITO");
            console.log("==================================================");
        })
        .on('error', (error) => {
            console.error('❌ Error interno al leer CSV:', error.message);
        });
}

iniciarProceso();