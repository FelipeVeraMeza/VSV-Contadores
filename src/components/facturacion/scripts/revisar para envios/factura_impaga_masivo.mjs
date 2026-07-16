// =====================================================================
// 📢 FACTURA IMPAGA — SERVICIO SUSPENDIDO — ENVÍO MASIVO
// ---------------------------------------------------------------------
// Avisa a cada cliente que su factura del servicio contable está vencida
// e impaga, que el servicio quedó suspendido temporalmente, y cómo pagar
// para reactivar. Campaña independiente de las de F29.
//
// Correr con:
//   node "src/components/facturacion/scripts/revisar para envios/factura_impaga_masivo.mjs"
//
// ⚠️ Arranca en MODO_PRUEBA = true (todo va a CORREO_PRUEBA). Pon false
// para el envío real.
// =====================================================================
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RUTA_FIRMA = path.join(__dirname, '../../data/firma mati.jpeg');
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// =====================================================================
// ⚙️ CONFIGURACIÓN — EDITA ESTO ANTES DE ENVIAR
// =====================================================================
const MODO_PRUEBA = false;                            // ← ponlo en false para el envío REAL a clientes
const CORREO_PRUEBA = 'felipe.veram2001@gmail.com';  // en prueba, todo llega aquí
const LIMITE = 0;                                     // 0 = todos; N = solo los primeros N (útil para muestra)
const PAUSA_MS = 1500;                               // pausa entre envíos

// =====================================================================
// 👥 DESTINATARIOS (de la planilla)
// neto/bruto en pesos; folio = N° de factura. Una fila puede tener 2 correos.
// =====================================================================
const DESTINATARIOS = [
  { razonSocial: 'FARMACIAS HIGIA SPA',                                 rut: '77583495-1', correo: 'karlafranv@gmail.com',                                        neto: 50000,  bruto: 59500,  folio: '1232' },
  { razonSocial: 'GOOK PRODUCCIONES',                                   rut: '77493132-5', correo: 'yessicaandreasilva@gmail.com',                                neto: 25210,  bruto: 30000,  folio: '1231' },
  { razonSocial: 'INVERSIONES MUNDO CANINO SPA',                        rut: '77336372-2', correo: 'inversionesmundocanino@gmail.com',                            neto: 70000,  bruto: 83300,  folio: '1217' },
  { razonSocial: 'GOVINDA CANO SPA',                                    rut: '77753277-4', correo: 'perezjuanf94@gmail.com',                                      neto: 30000,  bruto: 35700,  folio: '1216' },
  { razonSocial: 'COMERCIALIZADORA TORRES ASEO KEEN LIMITADA',          rut: '77149046-8', correo: 'Ernestotorresduarte@Gmail.com',                                neto: 50000,  bruto: 59500,  folio: '1215' },
  { razonSocial: 'ESMEC SpA',                                           rut: '77877135-7', correo: 'jonnyjos90@gmail.com',                                        neto: 40000,  bruto: 47600,  folio: '1209' },
  { razonSocial: 'COMERCIALIZADORA ROVIRA',                             rut: '77852939-4', correo: 'robertosalas02@hotmail.com',                                  neto: 220000, bruto: 261800, folio: '1208' },
  { razonSocial: 'APRENDIZAJE ACTIVO SPA',                              rut: '78016722-K', correo: 'Ventas@aprendizajeactivo.cl',                                 neto: 30000,  bruto: 35700,  folio: '1207' },
  { razonSocial: 'A&L SOLUCIONES Y SERVICIOS',                          rut: '77984639-3', correo: 'ayl.transportesyservicios@gmail.com; salcedo840@gmail.com',  neto: 10000,  bruto: 11900,  folio: '1206' },
  { razonSocial: 'PRE-AFTER SCHOOL BURBUJITAS',                         rut: '77961583-9', correo: 'caro85_21@hotmail.com',                                       neto: 10000,  bruto: 11900,  folio: '1205' },
  { razonSocial: 'JLT MAQUINARIA SPA',                                  rut: '78020281-5', correo: 'Maquinarias.jlt@gmail.com',                                   neto: 30000,  bruto: 35700,  folio: '1179' },
  { razonSocial: 'KALA MARÍA SPA',                                      rut: '77937906-K', correo: 'angelica.gutierrez.silva@gmail.com',                          neto: 10000,  bruto: 11900,  folio: '1176' },
  { razonSocial: 'LORETO VARGAS MINIMARKET EIRL',                       rut: '78093448-4', correo: 'LORETO.VARGAS.CE@GMAIL.COM',                                  neto: 30000,  bruto: 35700,  folio: '1172' },
  { razonSocial: 'MODOESPACIAL SPA',                                    rut: '76587522-6', correo: 'felipe@modoespacial.cl',                                     neto: 50000,  bruto: 59500,  folio: '1160' },
  { razonSocial: 'COMERCIALIZADORA HUMERES URIBE LIMITADA',             rut: '78209664-8', correo: 'FELIPEHUMERESD@GMAIL.COM',                                     neto: 30000,  bruto: 35700,  folio: '1159' },
  { razonSocial: 'GERARDO LAGOS PUBLICIDAD E.I.R.L.',                   rut: '78226429-K', correo: 'GERA_7_90@HOTMAIL.COM',                                       neto: 30000,  bruto: 35700,  folio: '1158' },
  { razonSocial: 'ANITA MARIA VEAS VILLAGRA ASESORIAS E.I.R.L',         rut: '78229656-6', correo: 'anitamariaveas@gmail.com',                                     neto: 10000,  bruto: 11900,  folio: '1157' },
  { razonSocial: 'MIARTE SPA',                                          rut: '78262268-4', correo: 'orlandoalzamora591420@gmail.com',                              neto: 30000,  bruto: 35700,  folio: '1153' },
  { razonSocial: 'ARQUITECTURA MATÍAS IGNACIO ALFARO ACEVEDO E.I.R.L.', rut: '78128622-2', correo: 'matignacio.arq@gmail.com',                                     neto: 50000,  bruto: 59500,  folio: '1148' },
  { razonSocial: 'RO GRUPO ARQUITECTURA Y DISEÑO IBEROAMERICANO',       rut: '78397835-0', correo: 'contacto@ro-gadi.com',                                        neto: 60504,  bruto: 72000,  folio: '1142' },
];

// =====================================================================
// 🔧 Utilidades
// =====================================================================
function money(v) {
  if (v === null || v === undefined || v === '') return '-';
  const n = parseInt(String(v).replace(/[^0-9-]/g, ''), 10);
  if (isNaN(n)) return '-';
  return '$' + n.toLocaleString('es-CL');
}

function parsearCorreos(campo) {
  return String(campo || '')
    .split(/[;,\s]+/)
    .map((c) => c.trim())
    .filter((c) => c.includes('@'));
}

// =====================================================================
// ✉️ CONTENIDO DEL CORREO (FACTURA IMPAGA / SERVICIO SUSPENDIDO)
// =====================================================================
function construirCorreo(dest) {
  const asunto = `FACTURA N°${dest.folio} - IMPAGA | SERVICIO CONTABLE`;

  const html = `
  <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 800px;">
    <p>Estimados <strong>${dest.razonSocial}${dest.rut ? ` - ${dest.rut}` : ''}</strong></p>

    <p>Junto con saludar, informamos que a la fecha aún se encuentra pendiente el pago de la factura <strong>N°${dest.folio}</strong>, la cual se encuentra vencida. Si ya realizaste el pago, favor enviar comprobante de pago por este medio.</p>

    <p>Debido a lo anterior, y conforme a nuestras condiciones de servicio, el servicio ha sido <strong>suspendido temporalmente</strong> ⚠️ Esto implica no declaración de formularios, no envío de documentación y no reuniones (si tu plan lo incluye).</p>

    <p>Para reactivar el servicio, es necesario regularizar el pago por el siguiente monto:</p>

    <p><strong>Monto pendiente:</strong> ${money(dest.neto)} + IVA = <strong>${money(dest.bruto)}</strong></p>

    <p>💳 <strong>Opciones de pago:</strong></p>

    <p><strong>Transferencia bancaria:</strong><br>
    VOLLAIRE &amp; OLIVOS SIMPLE PYME LTDA<br>
    Banco BCI<br>
    Cuenta corriente<br>
    Rut 78.306.207-0<br>
    Número de cuenta: 70809538<br>
    MATIAS.OLIVOS@VSVCONSULTORES.COM</p>

    <p><strong>Pago online:</strong><br>
    👉 <a href="https://www.flow.cl/btn.php?token=xe78c9acb73c3eff5e917d5c932a4a2f7f971abe">https://www.flow.cl/btn.php?token=xe78c9acb73c3eff5e917d5c932a4a2f7f971abe</a></p>

    <p>Una vez realizado el pago, agradeceremos enviar el comprobante para gestionar la reactivación a la brevedad ✅</p>

    <p>Quedamos atentos ante cualquier consulta.</p>

    <p>Saludos cordiales,<br><strong>Equipo Simple Pyme</strong></p>

    <img src="cid:firma_mati" style="width: 250px; height: auto;" alt="Firma Matías Olivos">
  </div>`;

  return { asunto, html };
}

// =====================================================================
// 🚀 MOTOR DE ENVÍO
// =====================================================================
async function iniciarProceso() {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_EMAIL_PRINCIPAL,
      pass: process.env.GMAIL_PASSWORD_PRINCIPAL,
    },
  });

  let lista = DESTINATARIOS
    .map((d) => ({ ...d, correos: parsearCorreos(d.correo) }))
    .filter((d) => d.correos.length > 0);

  if (LIMITE > 0) lista = lista.slice(0, LIMITE);

  console.log('==================================================');
  console.log('📢 FACTURA IMPAGA — SERVICIO SUSPENDIDO — ENVÍO MASIVO');
  console.log(`   Modo: ${MODO_PRUEBA ? `🧪 PRUEBA (todo va a ${CORREO_PRUEBA})` : '🚨 REAL (a clientes)'}`);
  console.log(`   Empresas: ${lista.length}`);
  console.log('==================================================\n');

  let enviados = 0;
  let fallidos = 0;

  for (let i = 0; i < lista.length; i++) {
    const dest = lista[i];
    const { asunto, html } = construirCorreo(dest);
    const destino = MODO_PRUEBA ? [CORREO_PRUEBA] : dest.correos;

    const mailOptions = {
      from: '"Matías Olivos" <matias.olivos@vsvconsultores.com>',
      to: destino,
      subject: asunto,
      html,
      attachments: [
        { filename: 'firma mati.jpeg', path: RUTA_FIRMA, cid: 'firma_mati' },
      ],
    };

    try {
      console.log(`📧 [${i + 1}/${lista.length}] ${dest.razonSocial} (N°${dest.folio}) → ${destino.join(', ')}`);
      await transporter.sendMail(mailOptions);
      enviados++;
    } catch (e) {
      fallidos++;
      console.log(`   ❌ Falló: ${e.message}`);
    }

    if (i < lista.length - 1) await delay(PAUSA_MS);
  }

  console.log('\n==================================================');
  console.log(`✅ FINALIZADO. Enviados: ${enviados} | Fallidos: ${fallidos}`);
  if (MODO_PRUEBA) console.log('   (Fue una PRUEBA — nada llegó a los clientes reales.)');
  console.log('==================================================');
}

iniciarProceso().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
