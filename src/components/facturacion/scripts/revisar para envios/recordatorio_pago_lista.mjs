// =====================================================================
// 📢 RECORDATORIO DE PAGO — LISTA FIJA (HARDCODEADA)
// ---------------------------------------------------------------------
// Igual que recordatorio_pago.mjs, PERO en vez de sacar los destinatarios
// de la base de datos (tabla correos_facturas), usa la lista fija de
// abajo (DESTINATARIOS). Sirve para clientes cuyas facturas NO pasaron
// por el sistema y por eso no están registradas en la BD.
//
// Reutiliza el motor de envío (Gmail API / Resend / SMTP con reintentos)
// de mensajes_facturador_masivo.mjs para no duplicar credenciales/lógica.
//
// Se puede correr solo con:  node "src/components/facturacion/scripts/revisar para envios/recordatorio_pago_lista.mjs"
// o dispararse desde un botón en Facturación (endpoint /dte/enviar-recordatorios-lista).
// =====================================================================
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { enviarConReintentos } from './mensajes_facturador_masivo.mjs';

const __filename = fileURLToPath(import.meta.url);
const delay = (ms) => new Promise(res => setTimeout(res, ms));

// Firma que ya usa el facturador (misma imagen, misma ruta relativa al cwd del server).
const RUTA_FIRMA = './src/components/facturacion/data/firma mati.jpeg';

// 📅 Fecha en que venció el pago (día de ayer). ⚠️ EDÍTALA antes de enviar.
const FECHA_VENCIMIENTO = '5 de julio';

// =====================================================================
// 👥 LISTA FIJA DE DESTINATARIOS
// Transcrita del Excel. Campos: razonSocial, correo, folio, rut, bruto.
// - El saludo del correo usa la razón social completa.
// - folio y bruto se muestran en el correo para que el cliente identifique
//   exactamente qué factura debe pagar.
// - Una fila puede tener 2 correos separados por ";" (ambos reciben el correo).
// =====================================================================
export const DESTINATARIOS = [
    { razonSocial: 'FARMACIAS HIGIA SPA',                                       correo: 'karlafranv@gmail.com',                                       folio: '1233', rut: '77583495-1', bruto: 59500 },
    { razonSocial: 'GOOK PRODUCCIONES',                                         correo: 'yessicaandreasilva@gmail.com',                               folio: '1231', rut: '77493132-5', bruto: 30000 },
    { razonSocial: 'SANHUEZA MANSO SPA',                                        correo: 'lsanhueza@virttux.cl',                                       folio: '1131', rut: '76916588-6', bruto: 47600 },
    { razonSocial: 'MCB CONSULTORES SPA',                                       correo: 'mcorvalan@mcbconsultores.cl',                                folio: '1230', rut: '77871935-5', bruto: 11900 },
    { razonSocial: 'ELECTROPROYECT',                                            correo: 'eproyect2023@yahoo.com',                                     folio: '1227', rut: '77835246-K', bruto: 119000 },
    { razonSocial: 'CONSTRUCCIONES Y REMODELACIONES S.V SPA',                   correo: 'construciones.sv@gmail.com',                                 folio: '1225', rut: '77904639-7', bruto: 47600 },
    { razonSocial: 'INVERSIONES MUNDO CANINO SPA',                             correo: 'inversionesmundocanino@gmail.com',                           folio: '1217', rut: '77336372-2', bruto: 83300 },
    { razonSocial: 'GOVINDA CANO SPA',                                          correo: 'perezjuanf94@gmail.com',                                     folio: '1216', rut: '77753277-4', bruto: 35700 },
    { razonSocial: 'COMERCIALIZADORA TORRES ASEO KEEN LIMITADA',                correo: 'Ernestotorresduarte@Gmail.com',                              folio: '1215', rut: '77149046-8', bruto: 59500 },
    { razonSocial: 'ESMEC SpA',                                                 correo: 'jonnyjos90@gmail.com',                                       folio: '1209', rut: '77877135-7', bruto: 47600 },
    { razonSocial: 'COMERCIALIZADORA ROVIRA',                                   correo: 'robertosalas02@hotmail.com',                                 folio: '1208', rut: '77852939-4', bruto: 261800 },
    { razonSocial: 'APRENDIZAJE ACTIVO SPA',                                    correo: 'Ventas@aprendizajeactivo.cl',                                folio: '1207', rut: '78016722-K', bruto: 35700 },
    { razonSocial: 'A&L SOLUCIONES Y SERVICIOS',                                correo: 'ayl.transportesyservicios@gmail.com; salcedo840@gmail.com',  folio: '1206', rut: '77984639-3', bruto: 11900 },
    { razonSocial: 'PRE-AFTER SCHOOL BURBUJITAS',                               correo: 'caro85_21@hotmail.com',                                      folio: '1205', rut: '77961583-9', bruto: 11900 },
    { razonSocial: 'AGUSTO LE GLACE SPA',                                       correo: 'mrprovoste@gmail.com',                                       folio: '1200', rut: '77087108-5', bruto: 35700 },
    { razonSocial: 'NATY RUZ COSMETICS',                                        correo: 'NATALIARUZMORENO@GMAIL.COM',                                 folio: '1199', rut: '78064268-8', bruto: 35700 },
    { razonSocial: 'TRANSPORTES MJM SPA',                                       correo: 'transportesmjm2024@gmail.com',                               folio: '1197', rut: '77951107-3', bruto: 59500 },
    { razonSocial: 'BZF CAMBIOS SPA',                                           correo: 'bzfcambios@gmail.com',                                       folio: '1193', rut: '77902854-2', bruto: 35700 },
    { razonSocial: 'H&S EQUIPOS Y HERRAMIENTAS SPA',                            correo: 'hespinozabaeza@gmail.com',                                   folio: '1186', rut: '77992106-9', bruto: 11900 },
    { razonSocial: 'ECYLING SPA',                                               correo: 'elisetteporras@gmail.com',                                   folio: '',     rut: '77756574-5', bruto: 35700 },
    { razonSocial: 'IGNACIO MARCELO TORRES MENDEZ',                             correo: 'ignaciotorres095@gmail.com',                                 folio: '1185', rut: '19087425-7', bruto: 35700 },
    { razonSocial: 'COMERCIAL OFTATO',                                          correo: 'Pabloceballosmadrid@gmail.com',                              folio: '1184', rut: '77852913-0', bruto: 35700 },
    { razonSocial: 'CLIMATIZACION Y MONTAJES VIDELA & TORO SPA',                correo: 'carolina.videla@hotmail.com',                                folio: '1183', rut: '77938492-6', bruto: 35700 },
    { razonSocial: 'JLT MAQUINARIA SPA',                                        correo: 'Maquinarias.jlt@gmail.com',                                  folio: '1179', rut: '78020281-5', bruto: 35700 },
    { razonSocial: 'KALA MARÍA SPA',                                            correo: 'angelica.gutierrez.silva@gmail.com',                         folio: '1176', rut: '77937906-K', bruto: 11900 },
    { razonSocial: 'GRUPO CONSTRUCTOR G&D SpA',                                 correo: 'dalton.marin@gydconstructora.com',                           folio: '1174', rut: '78076436-8', bruto: 315350 },
    { razonSocial: 'SERVICIOS DE SALUD REICHEL LTDA',                           correo: 'marareichel@hotmail.com',                                    folio: '1173', rut: '77901312-K', bruto: 59500 },
    { razonSocial: 'LORETO VARGAS MINIMARKET EIRL',                             correo: 'LORETO.VARGAS.CE@GMAIL.COM',                                 folio: '1172', rut: '78093448-4', bruto: 35700 },
    { razonSocial: 'KEOA GROUP SPA',                                            correo: 'k.hernandez@hotmail.com',                                    folio: '1167', rut: '78119754-8', bruto: 11900 },
    { razonSocial: 'R&R COMIDA RÁPIDA ROGER PAREDES E.I.R.L.',                  correo: 'rogerparedes060782@gmail.com',                               folio: '1164', rut: '78209313-4', bruto: 35700 },
    { razonSocial: 'SVETLANA HIGIENE Y LIMPIEZA',                               correo: 'Abimfer@hotmail.com',                                        folio: '1161', rut: '78165722-0', bruto: 72000 },
    { razonSocial: 'MODOESPACIAL SPA',                                          correo: 'felipe@modoespacial.cl',                                     folio: '1160', rut: '76587522-6', bruto: 59500 },
    { razonSocial: 'COMERCIALIZADORA HUMERES URIBE LIMITADA',                   correo: 'FELIPEHUMERESD@GMAIL.COM',                                   folio: '1159', rut: '78209664-8', bruto: 35700 },
    { razonSocial: 'GERARDO LAGOS PUBLICIDAD E.I.R.L.',                         correo: 'GERA_7_90@HOTMAIL.COM',                                      folio: '1158', rut: '78226429-K', bruto: 35700 },
    { razonSocial: 'ANITA MARIA VEAS VILLAGRA ASESORIAS E.I.R.L',              correo: 'anitamariaveas@gmail.com',                                   folio: '1157', rut: '78229656-6', bruto: 11900 },
    { razonSocial: 'MGC INVERSIÓNES',                                           correo: 'talo19@gmail.com',                                           folio: '1154', rut: '78271993-9', bruto: 71400 },
    { razonSocial: 'MIARTE SPA',                                                correo: 'orlandoalzamora591420@gmail.com',                            folio: '1153', rut: '78262268-4', bruto: 35700 },
    { razonSocial: 'CIVIL PRO',                                                 correo: 'LUXOGARA@GMAIL.COM',                                         folio: '',     rut: '77886719-2', bruto: 11900 },
    { razonSocial: 'CAREGIVER SPA',                                             correo: 'CAREGIVER347@GMAIL.COM',                                     folio: '1150', rut: '77787781-K', bruto: 11900 },
    { razonSocial: 'ARQUITECTURA MATÍAS IGNACIO ALFARO ACEVEDO E.I.R.L.',       correo: 'matignacio.arq@gmail.com',                                   folio: '1148', rut: '78128622-2', bruto: 59500 },
    { razonSocial: 'ILUMINA VENTANAS',                                          correo: 'MAURILOPEZX25@GMAIL.COM',                                    folio: '1147', rut: '78305639-9', bruto: 72000 },
    { razonSocial: 'ELKIN ALEXANDER OVIEDO FABRICA DE EMPANADAS LA PERLA EIRL', correo: 'LOO-0528@HOTMAIL.COM',                                       folio: '1146', rut: '78116703-7', bruto: 35700 },
    { razonSocial: 'MAESTRANZA CVM SPA',                                        correo: 'maestranza.cvm@gmail.com',                                   folio: '1144', rut: '77837991-0', bruto: 59500 },
    { razonSocial: 'RO GRUPO ARQUITECTURA Y DISEÑO IBEROAMERICANO',             correo: 'contacto@ro-gadi.com',                                       folio: '1142', rut: '78397835-0', bruto: 72000 },
    { razonSocial: 'CARLOS OJEDA BARBERIA EIRL',                                correo: 'CDOV23@GMAIL.COM',                                           folio: '1140', rut: '78427091-2', bruto: 72000 },
    { razonSocial: 'INGENIERÍA CODIGOCERO',                                     correo: 'RICARDO@CODIGOCERO.CL',                                      folio: '1136', rut: '78434722-2', bruto: 71995 },
    { razonSocial: 'COMERCIALIZADORA AM MARQUEZ SPA',                           correo: 'Alvaronicolas.marquez@gmail.com',                            folio: '1135', rut: '78285107-1', bruto: 59500 },
    { razonSocial: 'PIPAZ SERVICE SPA',                                         correo: 'hector.avalos250@gmail.com',                                 folio: '1134', rut: '78384658-6', bruto: 35700 },
    { razonSocial: 'PARTY CARS SPA',                                            correo: 'Partycarschicureo@gmail.com',                                folio: '1133', rut: '78394454-5', bruto: 59500 },
];

// =====================================================================
// 📊 Estado en vivo para que la página pueda mostrar el progreso.
// (Independiente del estadoRecordatorio del módulo por-BD.)
// =====================================================================
export const estadoRecordatorioLista = {
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
    estadoRecordatorioLista.activo = true;
    estadoRecordatorioLista.total = total;
    estadoRecordatorioLista.actual = 0;
    estadoRecordatorioLista.enviados = 0;
    estadoRecordatorioLista.fallidos = 0;
    estadoRecordatorioLista.ultimoCorreo = '';
    estadoRecordatorioLista.finalizado = false;
    estadoRecordatorioLista.error = null;
}

// Formatea un monto a pesos chilenos con puntos de mil. 59500 -> "59.500"
function fmtMoneda(valor) {
    const n = parseInt(String(valor ?? '').replace(/[^0-9]/g, ''), 10);
    if (!n || isNaN(n)) return '0';
    return n.toLocaleString('es-CL');
}

// =====================================================================
// ✉️ CONTENIDO DEL CORREO RECORDATORIO (por destinatario)
// =====================================================================
export function construirCorreoRecordatorio(dest, { fechaVencimiento = FECHA_VENCIMIENTO } = {}) {
    const asunto = dest.folio
        ? `Factura N°${dest.folio} vencida – Pago pendiente`
        : 'Factura servicio contable vencida – Pago pendiente';

    const lineaFactura = dest.folio
        ? `Factura N°${dest.folio}${dest.bruto ? ` por un total de $${fmtMoneda(dest.bruto)}` : ''}`
        : `factura del servicio contable${dest.bruto ? ` por un total de $${fmtMoneda(dest.bruto)}` : ''}`;

    const nombre = dest.razonSocial || 'cliente';

    const texto = `Estimado ${nombre}:

Junto con saludar, le informamos que el plazo de pago de la ${lineaFactura}, correspondiente al servicio de contabilidad mensual contratado, venció el ${fechaVencimiento}, por lo que actualmente se encuentra impaga.

Le solicitamos cancelar el total de la factura a la brevedad. Si ya realizó el pago, por favor ignore este mensaje y le agradecemos enviarnos el comprobante por este medio.

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
// 🚀 ENVÍO MASIVO DE RECORDATORIOS (LISTA FIJA)
// Corre en segundo plano. Actualiza estadoRecordatorioLista en cada paso.
// =====================================================================
// Separa un campo "correo" en varias direcciones (por ; o ,) y deja solo las válidas.
function parsearCorreos(campo) {
    return String(campo || '')
        .split(/[;,]/)
        .map(c => c.trim())
        .filter(c => c.includes('@'));
}

export async function enviarRecordatoriosLista({ fechaVencimiento = FECHA_VENCIMIENTO } = {}) {
    // Deja cada fila con su lista de correos válidos y elimina filas sin correo.
    const destinatarios = DESTINATARIOS
        .map(d => ({ ...d, correos: parsearCorreos(d.correo) }))
        .filter(d => d.correos.length > 0);

    resetEstado(destinatarios.length);

    console.log('==================================================');
    console.log(`📢 RECORDATORIO DE PAGO (LISTA FIJA): ${destinatarios.length} empresa(s)`);
    console.log(`   Venció el: ${fechaVencimiento}`);
    console.log('==================================================');

    for (let i = 0; i < destinatarios.length; i++) {
        const dest = destinatarios[i];
        estadoRecordatorioLista.actual = i + 1;
        estadoRecordatorioLista.ultimoCorreo = dest.correos.join(', ');

        const { asunto, html } = construirCorreoRecordatorio(dest, { fechaVencimiento });
        const mailOptions = {
            from: `"Simple Pyme" <matias.olivos@vsvconsultores.com>`,
            to: dest.correos, // array → todas las direcciones de la fila reciben el mismo correo
            subject: asunto,
            html,
            attachments: [
                { filename: 'firma mati.jpeg', path: RUTA_FIRMA, cid: 'firma_mati' }
            ]
        };

        try {
            console.log(`📧 [${i + 1}/${destinatarios.length}] Recordatorio → ${dest.razonSocial} (${dest.correos.join(', ')})`);
            await enviarConReintentos(mailOptions);
            estadoRecordatorioLista.enviados++;
        } catch (e) {
            estadoRecordatorioLista.fallidos++;
            console.log(`   ❌ Falló ${dest.correos.join(', ')}: ${e.message}`);
        }

        // Pausa corta para no saturar el envío (mismo criterio que el facturador).
        if (i < destinatarios.length - 1) await delay(1500);
    }

    estadoRecordatorioLista.activo = false;
    estadoRecordatorioLista.finalizado = true;
    console.log(`✅ RECORDATORIOS (LISTA) TERMINADOS. Enviados: ${estadoRecordatorioLista.enviados} | Fallidos: ${estadoRecordatorioLista.fallidos}`);
    return { ok: true, enviados: estadoRecordatorioLista.enviados, fallidos: estadoRecordatorioLista.fallidos, total: destinatarios.length };
}

// ⚠️ Solo se ejecuta si corres ESTE archivo directamente con node.
// Si se importa desde el controlador, NO se auto-ejecuta.
const ejecutadoDirectamente = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (ejecutadoDirectamente) {
    enviarRecordatoriosLista().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
