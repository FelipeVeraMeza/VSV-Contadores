// =====================================================================
// 📢 F29 DECLARADO — ENVÍO MASIVO
// ---------------------------------------------------------------------
// Avisa a cada cliente que su Formulario 29 (F29) YA FUE DECLARADO y que
// no debe hacer nada. Distinto de f29_disponible_masivo.mjs (ese es para
// pagar; este es solo informativo).
//
// Correos: la planilla nueva NO traía correo, así que se resolvieron por
// RUT desde empresa.email_corporativo (+ PARTY CARS desde la lista de
// recordatorios). Las empresas sin correo quedan con correo:'' y el motor
// las salta automáticamente.
//
// Correr con:
//   node "src/components/facturacion/scripts/revisar para envios/f29_declarado_masivo.mjs"
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
const MES = 'JUNIO 2026';                             // mes del F29
const PAUSA_MS = 1500;                               // pausa entre envíos

// =====================================================================
// 👥 DESTINATARIOS (RUT y montos de la planilla; correo desde la BD)
// correo:'' → se salta (no tiene email registrado en ninguna parte).
// =====================================================================
const DESTINATARIOS = [
  { razonSocial: 'MCB CONSULTORES SPA',                          rut: '77871935-5', correo: 'mcorvalan@mcbconsultores.cl',        comprasExentas: 0,     comprasNetas: 10000,    ventasExentas: 0,    ventasNetas: 0,   impuesto: 0 },
  { razonSocial: 'CARLOS ALBERTO BASTARDO MARTINEZ',             rut: '26617699-6', correo: '1985cabm@gmail.com',                comprasExentas: 5265,  comprasNetas: 0,        ventasExentas: 0,    ventasNetas: 0,   impuesto: 0 },
  { razonSocial: 'CONSTRUCCIONES Y REMODELACIONES S.V SPA',      rut: '77904639-7', correo: 'construciones.sv@gmail.com',         comprasExentas: 0,     comprasNetas: 3024475,  ventasExentas: 0,    ventasNetas: 0,   impuesto: 0 },
  { razonSocial: 'EMPRESA S&J SpA',                              rut: '77849617-8', correo: 'empresa.syj.spa@gmail.com',          comprasExentas: 0,     comprasNetas: 49266,    ventasExentas: 0,    ventasNetas: 0,   impuesto: 0 },
  { razonSocial: 'VISION 400 SPA',                               rut: '77937684-2', correo: 'wunexpo@gmail.com',                 comprasExentas: 0,     comprasNetas: 10000,    ventasExentas: 0,    ventasNetas: 0,   impuesto: 0 },
  { razonSocial: 'INVERSIONES A Y E SpA',                        rut: '77955178-4', correo: 'alexanderabermudezb@hotmail.com',    comprasExentas: 0,     comprasNetas: 70603,    ventasExentas: 0,    ventasNetas: 0,   impuesto: 0 },
  { razonSocial: 'VENTA DE ALIMENTOS ALEJANDRO FUENTES E.I.R.L.', rut: '77871555-4', correo: 'Elmichideltechobar@gmail.com',       comprasExentas: 0,     comprasNetas: 10000,    ventasExentas: 0,    ventasNetas: 0,   impuesto: 0 },
  { razonSocial: 'HI GREEN TECH SPA',                            rut: '77139803-0', correo: 'aguilarr_m@hotmail.com',            comprasExentas: 0,     comprasNetas: 0,        ventasExentas: 0,    ventasNetas: 0,   impuesto: 0 },
  { razonSocial: 'ROCKPERO SPA',                                 rut: '78000714-1', correo: 'BERLAHEM@HOTMAIL.COM',              comprasExentas: 0,     comprasNetas: 0,        ventasExentas: 0,    ventasNetas: 0,   impuesto: 0 },
  { razonSocial: 'FERNANDO FERRUZOLA CONSTRUCCIONES SPA',        rut: '77891881-1', correo: 'fernandoferruzola9@gmail.com',       comprasExentas: 0,     comprasNetas: 10000,    ventasExentas: 0,    ventasNetas: 0,   impuesto: 0 },
  { razonSocial: 'P Y P INGENIEROS SPA',                         rut: '78064752-3', correo: 'nestor.ingemec@gmail.com',          comprasExentas: 0,     comprasNetas: 30000,    ventasExentas: 0,    ventasNetas: 0,   impuesto: 0 },
  { razonSocial: 'GLADYS MONTIEL ALIMENTACIÓN EIRL',             rut: '78072524-9', correo: 'GLADYSTAVITAMONTIEL@GMAIL.COM',      comprasExentas: 0,     comprasNetas: 0,        ventasExentas: 0,    ventasNetas: 0,   impuesto: 0 },
  { razonSocial: 'EVANO SPA',                                    rut: '78097527-K', correo: 'davidmaita623@gmail.com',           comprasExentas: 0,     comprasNetas: 10000,    ventasExentas: 0,    ventasNetas: 0,   impuesto: 0 },
  { razonSocial: 'H&S EQUIPOS Y HERRAMIENTAS SPA',               rut: '77992106-9', correo: 'hespinozabaeza@gmail.com',          comprasExentas: 0,     comprasNetas: 10000,    ventasExentas: 0,    ventasNetas: 0,   impuesto: 0 },
  { razonSocial: 'IGNACIO MARCELO TORRES MENDEZ',                rut: '19087425-7', correo: 'ignaciotorres095@gmail.com',        comprasExentas: 0,     comprasNetas: 30000,    ventasExentas: 0,    ventasNetas: 0,   impuesto: 0 },
  { razonSocial: 'NEW MEDIA PRODUCCION',                         rut: '77839119-8', correo: 'filmatica1970@gmail.com',           comprasExentas: 0,     comprasNetas: 22322,    ventasExentas: 0,    ventasNetas: 0,   impuesto: 0 },
  { razonSocial: 'GATICA SPA',                                   rut: '78123097-9', correo: 'sebastian.gaticalagos@gmail.com',    comprasExentas: 11094, comprasNetas: 123757,   ventasExentas: 0,    ventasNetas: 0,   impuesto: 0 },
  { razonSocial: 'JL MONTERO SPA',                               rut: '78056692-2', correo: 'JLMONTERO.SPA@GMAIL.COM',           comprasExentas: 0,     comprasNetas: 10000,    ventasExentas: 0,    ventasNetas: 0,   impuesto: 0 },
  { razonSocial: 'KEOA GROUP SPA',                               rut: '78119754-8', correo: 'k.hernandez@hotmail.com',           comprasExentas: 0,     comprasNetas: 10179,    ventasExentas: 0,    ventasNetas: 0,   impuesto: 0 },
  { razonSocial: 'HR INSIGHT CONSULTING SPA',                    rut: '78074297-6', correo: 'nicocastillo@me.com',               comprasExentas: 0,     comprasNetas: 10000,    ventasExentas: 0,    ventasNetas: 0,   impuesto: 0 },
  { razonSocial: 'AYV INVERSIONES SPA',                          rut: '78248387-0', correo: 'VLADYINCA@GMAIL.COM',               comprasExentas: 0,     comprasNetas: 10000,    ventasExentas: 0,    ventasNetas: 0,   impuesto: 0 },
  { razonSocial: 'MGC INVERSIÓNES',                              rut: '78271993-9', correo: 'talo19@gmail.com',                  comprasExentas: null,  comprasNetas: 65093,    ventasExentas: null, ventasNetas: null, impuesto: null },
  { razonSocial: 'M.A.V.A CONSTURCIONES SPA',                    rut: '78271922-K', correo: 'marcelovargas0606@gmail.com',        comprasExentas: null,  comprasNetas: 10000,    ventasExentas: null, ventasNetas: null, impuesto: null },
  { razonSocial: 'PARTY CARS SPA',                               rut: '78394454-5', correo: 'Partycarschicureo@gmail.com',        comprasExentas: null,  comprasNetas: 8487164,  ventasExentas: null, ventasNetas: 84,   impuesto: null },
  // Correos aportados por el cliente (agregados también a la BD):
  { razonSocial: 'CONSTRUYE B&F SPA',                            rut: '78398566-7', correo: 'CESAR.BAEZA.S@GMAIL.COM',         comprasExentas: null,  comprasNetas: 68458,    ventasExentas: null, ventasNetas: null, impuesto: null },
  { razonSocial: 'MAJU MINING SAFETY SPA',                       rut: '78419568-6', correo: 'DELIATABILO@HOTMAIL.COM',         comprasExentas: null,  comprasNetas: 1571618,  ventasExentas: null, ventasNetas: null, impuesto: null },
  { razonSocial: 'FERLU TALLER CREATIVO SPA',                    rut: '78446463-6', correo: 'COLPIANTEFERNANDA@GMAIL.COM',     comprasExentas: null,  comprasNetas: 62561,    ventasExentas: null, ventasNetas: null, impuesto: null },
  { razonSocial: 'YOVANKA MATULIC ENSEÑANZA EIRL',               rut: '78334402-5', correo: 'Estudio.balaskas@gmail.com',      comprasExentas: 0,     comprasNetas: 0,        ventasExentas: 0,    ventasNetas: 0,   impuesto: 0 },
  { razonSocial: 'FIAMMA COGNITIVA SpA',                         rut: '78370168-5', correo: 'fiammacognitiva@gmail.com',       comprasExentas: null,  comprasNetas: 554202,   ventasExentas: null, ventasNetas: null, impuesto: null },
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
// ✉️ CONTENIDO DEL CORREO (F29 DECLARADO)
// =====================================================================
function construirCorreo(dest) {
  const asunto = `F29 DECLARADO – ${dest.razonSocial}`;

  const html = `
  <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 800px;">
    <p>Estimados <strong>${dest.razonSocial}${dest.rut ? ` - ${dest.rut}` : ''}</strong>,</p>

    <p>Junto con saludar, les informamos que el <strong>Formulario 29 (F29)</strong> ya fue declarado.</p>

    <p>A continuación, detallamos la información correspondiente:</p>

    <ul style="list-style: none; padding-left: 0;">
      <li>• <strong>Empresa:</strong> ${dest.razonSocial}</li>
      <li>• <strong>RUT:</strong> ${dest.rut || '-'}</li>
      <li>• <strong>VENTAS EXENTAS:</strong> ${money(dest.ventasExentas)}</li>
      <li>• <strong>VENTAS NETAS:</strong> ${money(dest.ventasNetas)}</li>
      <li>• <strong>COMPRAS EXENTAS:</strong> ${money(dest.comprasExentas)}</li>
      <li>• <strong>COMPRAS NETAS:</strong> ${money(dest.comprasNetas)}</li>
      <li>• <strong>IMPUESTO A PAGAR:</strong> ${money(dest.impuesto)}</li>
    </ul>

    <p style="font-weight: bold;">NO DEBE HACER NADA, TODO ESTÁ EN ORDEN</p>

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

  const sinCorreo = DESTINATARIOS.filter((d) => parsearCorreos(d.correo).length === 0);
  let lista = DESTINATARIOS
    .map((d) => ({ ...d, correos: parsearCorreos(d.correo) }))
    .filter((d) => d.correos.length > 0);

  if (LIMITE > 0) lista = lista.slice(0, LIMITE);

  console.log('==================================================');
  console.log('📢 F29 DECLARADO — ENVÍO MASIVO');
  console.log(`   Mes: ${MES}`);
  console.log(`   Modo: ${MODO_PRUEBA ? `🧪 PRUEBA (todo va a ${CORREO_PRUEBA})` : '🚨 REAL (a clientes)'}`);
  console.log(`   A enviar: ${lista.length}  |  Sin correo (saltadas): ${sinCorreo.length}`);
  if (sinCorreo.length) console.log(`   ⚠️ Sin correo: ${sinCorreo.map((d) => d.razonSocial).join(', ')}`);
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
      console.log(`📧 [${i + 1}/${lista.length}] ${dest.razonSocial} → ${destino.join(', ')}`);
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
