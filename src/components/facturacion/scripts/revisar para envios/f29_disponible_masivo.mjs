// =====================================================================
// 📢 F29 DISPONIBLE PARA PAGO — ENVÍO MASIVO
// ---------------------------------------------------------------------
// Envía a cada cliente el aviso de que su Formulario 29 (F29) del mes
// ya está disponible para pago, con el detalle de sus montos.
// Sigue el mismo motor de oficina_virtual_masivo.mjs (nodemailer + Gmail
// + firma incrustada). El remitente es matias.olivos@vsvconsultores.com
// pero se autentica con la cuenta de GMAIL_EMAIL_PRINCIPAL del .env.
//
// Correr con:
//   node "src/components/facturacion/scripts/revisar para envios/f29_disponible_masivo.mjs"
//
// ⚠️ SEGURIDAD: arranca en MODO_PRUEBA = true. En prueba TODOS los correos
// se envían a CORREO_PRUEBA (no a los clientes). Cuando ya revisaste que
// se ve bien, cambia MODO_PRUEBA a false para el envío real.
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
const FECHA_LIMITE = '20 de este mes';               // fecha límite de pago
const PAUSA_MS = 1500;                               // pausa entre envíos

// =====================================================================
// 👥 DESTINATARIOS (transcritos de la planilla; RUT desde la BD)
// Montos en pesos. Una fila puede tener 2 correos (separados por ; o espacio).
// =====================================================================
const DESTINATARIOS = [
  { razonSocial: 'SANHUEZA MANSO SPA',                                              rut: '76916588-6', correo: 'lsanhueza@virttux.cl',                                comprasExentas: 0,        comprasNetas: 57876,     ventasExentas: 0,        ventasNetas: 1595600,   impuesto: 294163 },
  { razonSocial: 'COMERCIALIZADORA A&R LIMITADA',                                   rut: '77758342-5', correo: 'alejandroperez170293@live.com',                       comprasExentas: 13980,    comprasNetas: 439185,    ventasExentas: 0,        ventasNetas: 2970110,   impuesto: 484587 },
  { razonSocial: 'EXOVET LABORATORIO LIMITADA',                                     rut: '77782757-K', correo: 'mfbecerraya@gmail.com',                               comprasExentas: 0,        comprasNetas: 80870,     ventasExentas: 0,        ventasNetas: 408193,    impuesto: 510 },
  { razonSocial: 'ELECTROPROYECT',                                                  rut: '77835246-K', correo: 'eproyect2023@yahoo.com',                              comprasExentas: 25000,    comprasNetas: 1255991,   ventasExentas: 0,        ventasNetas: 14502000,  impuesto: 2534870 },
  { razonSocial: 'COMPAÑIA DE SOLUCIONES SERVICIOS ARQUITECTURA Y TECNOLOGIA SPA',  rut: '77854265-K', correo: 'jhidalgo@itechsolutions.cl',                          comprasExentas: 0,        comprasNetas: 690143,    ventasExentas: 0,        ventasNetas: 4618716,   impuesto: 750663 },
  { razonSocial: 'P & R FIJACION - SUJECION',                                       rut: '77862673-K', correo: 'Pedroescalona0@gmail.com',                            comprasExentas: 0,        comprasNetas: 1342420,   ventasExentas: 0,        ventasNetas: 2343665,   impuesto: 193168 },
  { razonSocial: 'MR PASTA SPA',                                                    rut: '77944164-4', correo: 'cfellay@forsend.cl; jm_astudillo@hotmail.com',        comprasExentas: 0,        comprasNetas: 20450296,  ventasExentas: 0,        ventasNetas: 29428794,  impuesto: 3662554 },
  { razonSocial: 'TELEX SPA',                                                       rut: '77994026-8', correo: 'J.jarakern@gmail.com',                                comprasExentas: 0,        comprasNetas: 20544342,  ventasExentas: 0,        ventasNetas: 19711986,  impuesto: 24640 },
  { razonSocial: 'AGUSTO LE GLACE SPA',                                             rut: '77087108-5', correo: 'mrprovoste@gmail.com',                                comprasExentas: 8051,     comprasNetas: 294319,    ventasExentas: 0,        ventasNetas: 10318908,  impuesto: 1214264 },
  { razonSocial: 'NATY RUZ COSMETICS',                                              rut: '78064268-8', correo: 'NATALIARUZMORENO@GMAIL.COM',                          comprasExentas: 0,        comprasNetas: 947315,    ventasExentas: 0,        ventasNetas: 606722,    impuesto: 758 },
  { razonSocial: 'VISION ARTE CONSTRUCTORA SPA',                                    rut: '78071957-5', correo: 'LEONARDO.ACUNA.TORO@GMAIL.COM',                       comprasExentas: 0,        comprasNetas: 1338298,   ventasExentas: 0,        ventasNetas: 2893500,   impuesto: 299107 },
  { razonSocial: 'TRANSPORTES MJM SPA',                                             rut: '77951107-3', correo: 'transportesmjm2024@gmail.com',                        comprasExentas: 1443301,  comprasNetas: 4398349,   ventasExentas: 0,        ventasNetas: 11163360,  impuesto: 13954 },
  { razonSocial: 'OV SPORTS LIMITADA',                                              rut: '77597208-4', correo: 'MATIAS.OLIVOSB@GMAIL.COM',                            comprasExentas: 0,        comprasNetas: 722800,    ventasExentas: 0,        ventasNetas: 0,         impuesto: 92624 },
  { razonSocial: 'BZF CAMBIOS SPA',                                                 rut: '77902854-2', correo: 'bzfcambios@gmail.com',                                comprasExentas: 73134604, comprasNetas: 35409,     ventasExentas: 0,        ventasNetas: 820548,    impuesto: 150238 },
  { razonSocial: 'SOLUCIONES GASTRONÓMICAS RK',                                     rut: '78109295-9', correo: 'Entre.planchas@gmail.com',                            comprasExentas: 0,        comprasNetas: 3210126,   ventasExentas: 0,        ventasNetas: 506711,    impuesto: 233134 },
  { razonSocial: 'GOMEZ Y UNDURRAGA ACCESORIOS LTDA',                               rut: '78217204-2', correo: 'Carolinaundurraga@hotmail.com',                       comprasExentas: 0,        comprasNetas: 507146,    ventasExentas: 0,        ventasNetas: 442857,    impuesto: 554 },
  { razonSocial: 'SALUD Y RENDIMIENTO',                                             rut: '77847561-8', correo: 'pvillalbaf@gmail.com',                                comprasExentas: 0,        comprasNetas: 39273,     ventasExentas: 0,        ventasNetas: 640000,    impuesto: 800 },
  { razonSocial: 'AMIL SPA',                                                        rut: '78137171-8', correo: 'ALGD1986@GMAIL.COM',                                  comprasExentas: 0,        comprasNetas: 6679810,   ventasExentas: 0,        ventasNetas: 2430000,   impuesto: 51030 },
  { razonSocial: 'ECYLING SPA',                                                     rut: '77756574-5', correo: 'elisetteporras@gmail.com',                            comprasExentas: 0,        comprasNetas: 72432,     ventasExentas: 0,        ventasNetas: 348000,    impuesto: 56341 },
  { razonSocial: 'COMERCIAL OFTATO',                                                rut: '77852913-0', correo: 'Pabloceballosmadrid@gmail.com',                       comprasExentas: 708090,   comprasNetas: 20377369,  ventasExentas: 2043250,  ventasNetas: 22356218,  impuesto: 695374 },
  { razonSocial: 'CLIMATIZACION Y MONTAJES VIDELA & TORO SPA',                      rut: '77938492-6', correo: 'carolina.videla@hotmail.com',                         comprasExentas: 0,        comprasNetas: 173424,    ventasExentas: 0,        ventasNetas: 5520000,   impuesto: 1022751 },
  { razonSocial: 'JOSÉ MARTINEZ CONSTRUCCIONES E.I.R.L.',                           rut: '78155728-5', correo: 'jose.aguevec@gmail.com',                              comprasExentas: 40155,    comprasNetas: 0,         ventasExentas: 0,        ventasNetas: 25000000,  impuesto: 481757 },
  { razonSocial: 'NUTRICIÓN ÁLVARO FARFÁN DIAZ SPA',                                rut: '78142901-5', correo: 'alvarofarfandiaz@gmail.com',                          comprasExentas: 0,        comprasNetas: 75385,     ventasExentas: 0,        ventasNetas: 735000,    impuesto: 735 },
  { razonSocial: 'GAC INGENIERIA ELECTRICA SpA',                                    rut: '78044219-0', correo: 'ARACENA226@GMAIL.COM',                                comprasExentas: 0,        comprasNetas: 714760,    ventasExentas: 0,        ventasNetas: 1706978,   impuesto: 2134 },
  { razonSocial: 'GRUPO CONSTRUCTOR G&D SpA',                                       rut: '78076436-8', correo: 'dalton.marin@gydconstructora.com',                    comprasExentas: 2703291,  comprasNetas: 79654109,  ventasExentas: 0,        ventasNetas: 184697207, impuesto: 20189056 },
  { razonSocial: 'SERVICIOS DE SALUD REICHEL LTDA',                                 rut: '77901312-K', correo: 'marareichel@hotmail.com',                             comprasExentas: 3017336,  comprasNetas: 735077,    ventasExentas: 9070822,  ventasNetas: 0,         impuesto: 11339 },
  { razonSocial: 'SARAOS SYSTEMS SPA',                                              rut: '78198808-1', correo: 'CSARAOSQ@GMAIL.COM',                                  comprasExentas: 0,        comprasNetas: 454991,    ventasExentas: 0,        ventasNetas: 1395000,   impuesto: 105505 },
  { razonSocial: 'SERVICIOS Y MAQUINARIAS INDUSTRIALES SPA',                        rut: '78184026-2', correo: '1985cabm@gmail.com',                                  comprasExentas: 0,        comprasNetas: 30000,     ventasExentas: 0,        ventasNetas: 730080,    impuesto: 913 },
  { razonSocial: 'R&R COMIDA RÁPIDA ROGER PAREDES E.I.R.L.',                        rut: '78209313-4', correo: 'rogerparedes060782@gmail.com',                        comprasExentas: 3186,     comprasNetas: 5245229,   ventasExentas: 0,        ventasNetas: 5449124,   impuesto: 6811 },
  { razonSocial: 'TRANSPORTES Y SERVICIOS YERSIN CARRASQUEL SPA',                   rut: '78203384-0', correo: 'yersyjcf@gmail.com',                                  comprasExentas: 0,        comprasNetas: 128979,    ventasExentas: 0,        ventasNetas: 886400,    impuesto: 133555 },
  { razonSocial: 'CONGELADOS Y GOURMET B&B SPA',                                    rut: '78169825-3', correo: 'jessicabadilla@gmail.com',                            comprasExentas: 0,        comprasNetas: 713368,    ventasExentas: 0,        ventasNetas: 1448678,   impuesto: 141522 },
  { razonSocial: 'SVETLANA HIGIENE Y LIMPIEZA',                                     rut: '78165722-0', correo: 'Abimfer@hotmail.com',                                 comprasExentas: 445375,   comprasNetas: 9567317,   ventasExentas: 0,        ventasNetas: 9652734,   impuesto: 12066 },
  { razonSocial: 'CARVAJAL Y ANACONA KINESIOLOGIA LTDA',                            rut: '78228538-6', correo: 'gabriel.carvajalsoto@gmail.com',                      comprasExentas: 777206,   comprasNetas: 226961,    ventasExentas: null,     ventasNetas: 4888801,   impuesto: 9847 },
  { razonSocial: 'ANDRES IVAN LEIVA LURASCHI, TATUAJES E.I.R.L.',                   rut: '77941998-3', correo: 'andyluraschi72@gmail.com',                            comprasExentas: null,     comprasNetas: 635769,    ventasExentas: null,     ventasNetas: 2681511,   impuesto: 392043 },
  { razonSocial: 'ILUMINA VENTANAS',                                                rut: '78305639-9', correo: 'MAURILOPEZX25@GMAIL.COM',                             comprasExentas: null,     comprasNetas: 3369624,   ventasExentas: null,     ventasNetas: 1126387,   impuesto: 1408 },
  { razonSocial: 'ELKIN ALEXANDER OVIEDO FABRICA DE EMPANADAS LA PERLA EIRL',       rut: '78116703-7', correo: 'LOO-0528@HOTMAIL.COM',                                comprasExentas: 11973,    comprasNetas: 8640272,   ventasExentas: null,     ventasNetas: 13819452,  impuesto: 911561 },
  { razonSocial: 'MAESTRANZA CVM SPA',                                              rut: '77837991-0', correo: 'maestranza.cvm@gmail.com',                            comprasExentas: 33428,    comprasNetas: 21085257,  ventasExentas: null,     ventasNetas: 29877374,  impuesto: 1707847 },
  { razonSocial: 'PROHOME SPA',                                                     rut: '77807269-6', correo: 'welcomeinn.chile@gmail.com',                          comprasExentas: null,     comprasNetas: 330942,    ventasExentas: null,     ventasNetas: 2921198,   impuesto: 621030 },
  { razonSocial: 'FAY INVERSIONES INMOBILIARIAS SpA',                               rut: '78221287-7', correo: 'anita@fayinversiones.cl',                             comprasExentas: 18942,    comprasNetas: 2709550,   ventasExentas: null,     ventasNetas: 23995930,  impuesto: 60889 },
  { razonSocial: 'COMERCIAL C&H',                                                   rut: '78418797-7', correo: 'ignacio.herrea.s@gmail.com',                          comprasExentas: null,     comprasNetas: 575447,    ventasExentas: null,     ventasNetas: 143781,    impuesto: 1438 },
  { razonSocial: 'TCG HUB SPA',                                                     rut: '77970718-0', correo: 'ISITORRESR@GMAIL.COM',                                comprasExentas: null,     comprasNetas: 303161,    ventasExentas: null,     ventasNetas: 818513,    impuesto: 13951 },
  { razonSocial: 'SERVICIOS PROFESIONALES DE ASESORÍA COMERCIAL ISIDORA TORRES E.I.R.L', rut: '78134009-K', correo: 'ISITORRESR@GMAIL.COM',                            comprasExentas: null,     comprasNetas: 88000,     ventasExentas: null,     ventasNetas: 1386135,   impuesto: 1733 },
  { razonSocial: 'FUNDACIÓN ASOCIACIÓN SEMBRANDO UN SUEÑO',                         rut: '65198387-8', correo: 'karlla@sembrandounsueno.cl mary@sembrandounsueno.cl', comprasExentas: 265752,   comprasNetas: 118769,    ventasExentas: 15300000, ventasNetas: null,      impuesto: 351117 },
  { razonSocial: 'INGENIERÍA CODIGOCERO',                                           rut: '78434722-2', correo: 'RICARDO@CODIGOCERO.CL',                               comprasExentas: null,     comprasNetas: 298734,    ventasExentas: null,     ventasNetas: 1073945,   impuesto: 158030 },
  { razonSocial: 'COMERCIALIZADORA AM MARQUEZ SPA',                                 rut: '78285107-1', correo: 'Alvaronicolas.marquez@gmail.com',                     comprasExentas: 1512480,  comprasNetas: 1288432,   ventasExentas: null,     ventasNetas: 24800000,  impuesto: 246788 },
  { razonSocial: 'PIPAZ SERVICE SPA',                                               rut: '78384658-6', correo: 'pipazservice@gmail.com',                              comprasExentas: null,     comprasNetas: 839222,    ventasExentas: null,     ventasNetas: 123000,    impuesto: 154 },
  { razonSocial: 'VIMAGU TRUCKS SPA',                                               rut: '78418049-2', correo: 'dubchakalexandra5@gmail.com',                         comprasExentas: null,     comprasNetas: 15990,     ventasExentas: null,     ventasNetas: 3160003,   impuesto: 606035 },
];

// =====================================================================
// 🔧 Utilidades
// =====================================================================
// 57876 -> "$57.876" ; null/vacío -> "-"
function money(v) {
  if (v === null || v === undefined || v === '') return '-';
  const n = parseInt(String(v).replace(/[^0-9-]/g, ''), 10);
  if (isNaN(n)) return '-';
  return '$' + n.toLocaleString('es-CL');
}

// "a@x.cl; b@y.cl" o "a@x.cl b@y.cl" -> ['a@x.cl','b@y.cl']
function parsearCorreos(campo) {
  return String(campo || '')
    .split(/[;,\s]+/)
    .map((c) => c.trim())
    .filter((c) => c.includes('@'));
}

// =====================================================================
// ✉️ CONTENIDO DEL CORREO
// =====================================================================
function construirCorreo(dest) {
  const asunto = `F29 disponible para pago – ${dest.razonSocial}`;

  const html = `
  <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 800px;">
    <p>Estimados <strong>${dest.razonSocial}${dest.rut ? ` - ${dest.rut}` : ''}</strong>,</p>

    <p>Junto con saludar, les informamos que el <strong>Formulario 29 (F29)</strong> ya se encuentra disponible para su pago.</p>

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

    <p>📅 <strong>Fecha límite de pago:</strong> ${FECHA_LIMITE}</p>

    <p>En caso de que deseen aplazar el pago, pueden indicarlo respondiendo directamente a este correo y los orientaremos 👍</p>

    <hr>

    <p>🖥️ <strong>Pasos para realizar el pago:</strong></p>
    <ol>
      <li>Ingresar a <strong>Servicios Online</strong></li>
      <li>Seleccionar <strong>Declaración Mensual (F29)</strong></li>
      <li>Elegir el mes de <strong>${MES}</strong></li>
      <li>Hacer clic en <strong>Continuar desde declaración guardada</strong></li>
      <li>Luego, <strong>Continuar desde datos guardados</strong></li>
      <li><strong>Enviar declaración</strong></li>
      <li>Seleccionar medio de pago 💳</li>
    </ol>

    <hr>

    <p>Quedamos atentos a cualquier duda o apoyo que necesiten en el proceso 🙂</p>

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
  console.log('📢 F29 DISPONIBLE PARA PAGO — ENVÍO MASIVO');
  console.log(`   Mes: ${MES}  |  Fecha límite: ${FECHA_LIMITE}`);
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
