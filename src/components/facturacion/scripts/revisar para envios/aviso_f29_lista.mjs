// =====================================================================
// 🧾 AVISO F29 — LISTA FIJA (HARDCODEADA)
// ---------------------------------------------------------------------
// Manda a cada empresa el aviso de que el Formulario 29 está disponible
// para pago, con sus datos (RUT, ventas netas, compras netas, monto a pagar).
// Reutiliza el motor de envío (Gmail API / Resend / SMTP con reintentos)
// de mensajes_facturador_masivo.mjs.
//
// Correr solo:  node "src/components/facturacion/scripts/revisar para envios/aviso_f29_lista.mjs"
// =====================================================================
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { enviarConReintentos } from './mensajes_facturador_masivo.mjs';

const __filename = fileURLToPath(import.meta.url);
const delay = (ms) => new Promise(res => setTimeout(res, ms));

// ⚙️ Datos que cambian mes a mes. ⚠️ REVÍSALOS antes de enviar.
const ASUNTO = 'Hoy último plazo para pagar el F29';
const MES_PERIODO = 'JUNIO 2026';        // el mes que se elige en el SII
const FECHA_LIMITE = '20 de este mes';   // fecha límite de pago mostrada

// Firma que ya usa el facturador (misma imagen, misma ruta relativa al cwd del server).
export const RUTA_FIRMA = './src/components/facturacion/data/firma mati.jpeg';
export const ADJUNTOS_FIRMA = [{ filename: 'firma mati.jpeg', path: RUTA_FIRMA, cid: 'firma_mati' }];

// =====================================================================
// 👥 LISTA FIJA DE DESTINATARIOS
// Campos: razonSocial, rut, correo, comprasNetas, ventasNetas, impuesto.
// Los montos se guardan tal cual (ya formateados) para no re-calcular.
// Una fila puede tener 2 correos separados por ";" o espacio (ambos reciben).
// =====================================================================
export const DESTINATARIOS = [
    { razonSocial: 'AGUSTO LE GLACE SPA', rut: '77087108-5', correo: 'mrprovoste@gmail.com', comprasNetas: '$294.319', ventasNetas: '$10.318.908', impuesto: '$1.214.264' },
    { razonSocial: 'AMIL SPA', rut: '78137171-8', correo: 'ALGD1986@GMAIL.COM', comprasNetas: '$6.679.810', ventasNetas: '$2.430.000', impuesto: '$51.030' },
    { razonSocial: 'ANDRES IVAN LEIVA LURASCHI, TATUAJES E.I.R.L.', rut: '77941998-3', correo: 'andyluraschi72@gmail.com', comprasNetas: '$635.769', ventasNetas: '$2.681.511', impuesto: '$392.043' },
    { razonSocial: 'BZF CAMBIOS SPA', rut: '77902854-2', correo: 'bzfcambios@gmail.com', comprasNetas: '$35.409', ventasNetas: '$820.548', impuesto: '$150.238' },
    { razonSocial: 'CARVAJAL Y ANACONA KINESIOLOGIA LTDA', rut: '78228538-6', correo: 'gabriel.carvajalsoto@gmail.com', comprasNetas: '$226.961', ventasNetas: '$4.888.801', impuesto: '$9.847' },
    { razonSocial: 'CLIMATIZACION Y MONTAJES VIDELA & TORO SPA', rut: '77938492-6', correo: 'carolina.videla@hotmail.com', comprasNetas: '$173.424', ventasNetas: '$5.520.000', impuesto: '$1.022.751' },
    { razonSocial: 'COMERCIAL C&H', rut: '78418797-7', correo: 'ignacio.herrea.s@gmail.com', comprasNetas: '$575.447', ventasNetas: '$143.781', impuesto: '$1.438' },
    { razonSocial: 'COMERCIAL OFTATO', rut: '77852913-0', correo: 'Pabloceballosmadrid@gmail.com', comprasNetas: '$20.377.369', ventasNetas: '$22.356.218', impuesto: '$695.374' },
    { razonSocial: 'COMERCIALIZADORA A&R LIMITADA', rut: '77758342-5', correo: 'alejandroperez170293@live.com', comprasNetas: '$439.185', ventasNetas: '$2.970.110', impuesto: '$484.587' },
    { razonSocial: 'COMERCIALIZADORA AM MARQUEZ SPA', rut: '78285107-1', correo: 'Alvaronicolas.marquez@gmail.com', comprasNetas: '$1.288.432', ventasNetas: '$24.800.000', impuesto: '$246.788' },
    { razonSocial: 'COMERCIALIZADORA HUMERES URIBE LIMITADA', rut: '78209664-8', correo: 'FELIPEHUMERESD@GMAIL.COM', comprasNetas: '$66.963', ventasNetas: '$270.900', impuesto: '$339' },
    { razonSocial: 'COMPAÑIA DE SOLUCIONES SERVICIOS ARQUITECTURA Y TECNOLOGIA SPA', rut: '77854265-K', correo: 'jhidalgo@itechsolutions.cl', comprasNetas: '$690.143', ventasNetas: '$4.618.716', impuesto: '$750.663' },
    { razonSocial: 'CONGELADOS Y GOURMET B&B SPA', rut: '78169825-3', correo: 'jessicabadilla@gmail.com', comprasNetas: '$713.368', ventasNetas: '$1.448.678', impuesto: '$141.522' },
    { razonSocial: 'ECYLING SPA', rut: '77756574-5', correo: 'elisetteporras@gmail.com', comprasNetas: '$72.432', ventasNetas: '$348.000', impuesto: '$56.341' },
    { razonSocial: 'ELECTROPROYECT', rut: '77835246-K', correo: 'eproyect2023@yahoo.com', comprasNetas: '$1.255.991', ventasNetas: '$14.502.000', impuesto: '$2.534.870' },
    { razonSocial: 'ELKIN ALEXANDER OVIEDO FABRICA DE EMPANADAS LA PERLA EIRL', rut: '78116703-7', correo: 'LOO-0528@HOTMAIL.COM', comprasNetas: '$8.640.272', ventasNetas: '$13.819.452', impuesto: '$911.561' },
    { razonSocial: 'EXOVET LABORATORIO LIMITADA', rut: '77782757-K', correo: 'mfbecerraya@gmail.com', comprasNetas: '$80.870', ventasNetas: '$408.193', impuesto: '$510' },
    { razonSocial: 'FAY INVERSIONES INMOBILIARIAS SpA', rut: '78221287-7', correo: 'anita@fayinversiones.cl', comprasNetas: '$2.709.550', ventasNetas: '$23.995.930', impuesto: '$60.889' },
    { razonSocial: 'FUNDACIÓN ASOCIACIÓN SEMBRANDO UN SUEÑO', rut: '65198387-8', correo: 'karlla@sembrandounsueno.cl; mary@sembrandounsueno.cl', comprasNetas: '$118.769', ventasNetas: '$0', impuesto: '$351.117' },
    { razonSocial: 'GAC INGENIERIA ELECTRICA SpA', rut: '78044219-0', correo: 'ARACENA226@GMAIL.COM', comprasNetas: '$714.760', ventasNetas: '$1.706.978', impuesto: '$2.134' },
    { razonSocial: 'GERARDO LAGOS PUBLICIDAD E.I.R.L.', rut: '78226429-K', correo: 'GERA_7_90@HOTMAIL.COM', comprasNetas: '$454.369', ventasNetas: '$22.521', impuesto: '$278' },
    { razonSocial: 'GOMEZ Y UNDURRAGA ACCESORIOS LTDA', rut: '78217204-2', correo: 'Carolinaundurraga@hotmail.com', comprasNetas: '$507.146', ventasNetas: '$442.857', impuesto: '$554' },
    { razonSocial: 'GOOK PRODUCCIONES', rut: '77493132-5', correo: 'yessicaandreasilva@gmail.com', comprasNetas: '$9.131.170', ventasNetas: '$11.999.029', impuesto: '$501.038' },
    { razonSocial: 'GRUPO CONSTRUCTOR G&D SpA', rut: '78076436-8', correo: 'dalton.marin@gydconstructora.com', comprasNetas: '$79.654.109', ventasNetas: '$184.697.207', impuesto: '$20.189.056' },
    { razonSocial: 'ILUMINA VENTANAS', rut: '78305639-9', correo: 'MAURILOPEZX25@GMAIL.COM', comprasNetas: '$3.369.624', ventasNetas: '$1.126.387', impuesto: '$1.408' },
    { razonSocial: 'INVERSIONES MUNDO CANINO SPA', rut: '77336372-2', correo: 'inversionesmundocanino@gmail.com', comprasNetas: '$932.439', ventasNetas: '$6.677.836', impuesto: '$1.098.306' },
    { razonSocial: 'JOSÉ MARTINEZ CONSTRUCCIONES E.I.R.L.', rut: '78155728-5', correo: 'jose.aguevec@gmail.com', comprasNetas: '$0', ventasNetas: '$25.000.000', impuesto: '$481.757' },
    { razonSocial: 'LORETO VARGAS MINIMARKET EIRL', rut: '78093448-4', correo: 'LORETO.VARGAS.CE@GMAIL.COM', comprasNetas: '$3.341.229', ventasNetas: '$4.804.419', impuesto: '$6.005' },
    { razonSocial: 'MAESTRANZA CVM SPA', rut: '77837991-0', correo: 'maestranza.cvm@gmail.com', comprasNetas: '$21.085.257', ventasNetas: '$29.877.374', impuesto: '$1.707.847' },
    { razonSocial: 'MIARTE SPA', rut: '78262268-4', correo: 'orlandoalzamora591420@gmail.com', comprasNetas: '$125.091', ventasNetas: '$1.867.056', impuesto: '$303.589' },
    { razonSocial: 'MODOESPACIAL SPA', rut: '76587522-6', correo: 'felipe@modoespacial.cl', comprasNetas: '$7.352.463', ventasNetas: '$6.069.000', impuesto: '$6.069' },
    { razonSocial: 'MR PASTA SPA', rut: '77944164-4', correo: 'cfellay@forsend.cl; jm_astudillo@hotmail.com', comprasNetas: '$20.450.296', ventasNetas: '$29.428.794', impuesto: '$3.662.554' },
    { razonSocial: 'NATY RUZ COSMETICS', rut: '78064268-8', correo: 'NATALIARUZMORENO@GMAIL.COM', comprasNetas: '$947.315', ventasNetas: '$606.722', impuesto: '$758' },
    { razonSocial: 'NUTRICIÓN ÁLVARO FARFÁN DIAZ SPA', rut: '78142901-5', correo: 'alvarofarfandiaz@gmail.com', comprasNetas: '$75.385', ventasNetas: '$735.000', impuesto: '$735' },
    { razonSocial: 'OV SPORTS LIMITADA', rut: '77597208-4', correo: 'MATIAS.OLIVOSB@GMAIL.COM', comprasNetas: '$722.800', ventasNetas: '$0', impuesto: '$92.624' },
    { razonSocial: 'P & R FIJACION - SUJECION', rut: '77862673-K', correo: 'Pedroescalona0@gmail.com', comprasNetas: '$1.342.420', ventasNetas: '$2.343.665', impuesto: '$193.168' },
    { razonSocial: 'PIPAZ SERVICE SPA', rut: '78384658-6', correo: 'pipazservice@gmail.com', comprasNetas: '$839.222', ventasNetas: '$123.000', impuesto: '$154' },
    { razonSocial: 'PROHOME SPA', rut: '77807269-6', correo: 'welcomeinn.chile@gmail.com', comprasNetas: '$330.942', ventasNetas: '$2.921.198', impuesto: '$621.030' },
    { razonSocial: 'R&R COMIDA RÁPIDA ROGER PAREDES E.I.R.L.', rut: '78209313-4', correo: 'rogerparedes060782@gmail.com', comprasNetas: '$5.245.229', ventasNetas: '$5.449.124', impuesto: '$6.811' },
    { razonSocial: 'SALUD Y RENDIMIENTO', rut: '77847561-8', correo: 'pvillalbaf@gmail.com', comprasNetas: '$39.273', ventasNetas: '$640.000', impuesto: '$800' },
    { razonSocial: 'SANHUEZA MANSO SPA', rut: '76916588-6', correo: 'lsanhueza@virttux.cl', comprasNetas: '$57.876', ventasNetas: '$1.595.600', impuesto: '$294.163' },
    { razonSocial: 'SARAOS SYSTEMS SPA', rut: '78198808-1', correo: 'CSARAOSQ@GMAIL.COM', comprasNetas: '$454.991', ventasNetas: '$1.395.000', impuesto: '$105.505' },
    { razonSocial: 'SERVICIOS DE SALUD REICHEL LTDA', rut: '77901312-K', correo: 'marareichel@hotmail.com', comprasNetas: '$735.077', ventasNetas: '$0', impuesto: '$11.339' },
    { razonSocial: 'SERVICIOS PROFESIONALES DE ASESORÍA COMERCIAL ISIDORA TORRES E.I.R.L', rut: '78134009-K', correo: 'ISITORRESR@GMAIL.COM', comprasNetas: '$88.000', ventasNetas: '$1.386.135', impuesto: '$1.733' },
    { razonSocial: 'SERVICIOS Y MAQUINARIAS INDUSTRIALES SPA', rut: '78184026-2', correo: '1985cabm@gmail.com', comprasNetas: '$30.000', ventasNetas: '$730.080', impuesto: '$913' },
    { razonSocial: 'SOLUCIONES GASTRONÓMICAS RK', rut: '78109295-9', correo: 'Entre.planchas@gmail.com', comprasNetas: '$3.210.126', ventasNetas: '$506.711', impuesto: '$233.134' },
    { razonSocial: 'SVETLANA HIGIENE Y LIMPIEZA', rut: '78165722-0', correo: 'Abimfer@hotmail.com', comprasNetas: '$9.567.317', ventasNetas: '$9.652.734', impuesto: '$12.066' },
    { razonSocial: 'TCG HUB SPA', rut: '77970718-0', correo: 'ISITORRESR@GMAIL.COM', comprasNetas: '$303.161', ventasNetas: '$818.513', impuesto: '$13.951' },
    { razonSocial: 'TELEX SPA', rut: '77994026-8', correo: 'J.jarakern@gmail.com', comprasNetas: '$20.544.342', ventasNetas: '$19.711.986', impuesto: '$24.640' },
    { razonSocial: 'TRANSPORTES MJM SPA', rut: '77951107-3', correo: 'transportesmjm2024@gmail.com', comprasNetas: '$4.398.349', ventasNetas: '$11.163.360', impuesto: '$13.954' },
    { razonSocial: 'TRANSPORTES Y SERVICIOS YERSIN CARRASQUEL SPA', rut: '78203384-0', correo: 'yersyjcf@gmail.com', comprasNetas: '$128.979', ventasNetas: '$886.400', impuesto: '$133.555' },
    { razonSocial: 'VIMAGU TRUCKS SPA', rut: '78418049-2', correo: 'dubchakalexandra5@gmail.com', comprasNetas: '$15.990', ventasNetas: '$3.160.003', impuesto: '$606.035' },
    { razonSocial: 'VISION ARTE CONSTRUCTORA SPA', rut: '78071957-5', correo: 'LEONARDO.ACUNA.TORO@GMAIL.COM', comprasNetas: '$1.338.298', ventasNetas: '$2.893.500', impuesto: '$299.107' },
];

// =====================================================================
// 📊 Estado en vivo (por si se conecta a la página).
// =====================================================================
export const estadoAvisoF29 = {
    activo: false, total: 0, actual: 0, enviados: 0, fallidos: 0,
    ultimoCorreo: '', finalizado: false, error: null,
};

function resetEstado(total) {
    Object.assign(estadoAvisoF29, {
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
// ✉️ CONTENIDO DEL CORREO F29 (por destinatario)
// =====================================================================
export function construirCorreoF29(dest) {
    const nombre = dest.razonSocial || 'cliente';

    const texto = `Estimados ${nombre},

Junto con saludar, les informamos que el Formulario 29 (F29) ya se encuentra disponible para su pago. Si ya pagaste el impuesto, favor no considerar este correo.
Antes que todo, queremos pedir disculpas por el envío tardío de este correo 🙏. Esto se debió a inconvenientes con la página del SII, lo que nos impidió presentar los impuestos con la anticipación habitual.

A continuación, detallamos la información correspondiente:

Empresa: ${dest.razonSocial}
RUT: ${dest.rut}
VENTAS NETAS: ${dest.ventasNetas}
COMPRAS NETAS: ${dest.comprasNetas}
Monto a pagar: ${dest.impuesto}

📅 Fecha límite de pago: ${FECHA_LIMITE}

En caso de que deseen aplazar el pago, pueden indicarlo respondiendo directamente a este correo y los orientaremos 👍

💻 Pasos para realizar el pago:
Ingresar a Servicios Online
Seleccionar Declaración Mensual (F29)
Elegir el mes de ${MES_PERIODO}
Hacer clic en Continuar desde declaración guardada
Luego, Continuar desde datos guardados
Enviar declaración
Seleccionar medio de pago 💳

Quedamos atentos a cualquier duda o apoyo que necesiten en el proceso 😊

Saludos cordiales,
Equipo Simple Pyme`;

    // HTML: negrita en los datos clave y firma en imagen al final.
    let html = texto
        .replace(/\n/g, '<br>')
        .replace('Monto a pagar: ' + dest.impuesto, `<strong>Monto a pagar: ${dest.impuesto}</strong>`);
    html = `<div style="font-family: Arial, sans-serif; color: #333; line-height: 1.5;">${html}<br><br><img src="cid:firma_mati" style="width: 200px; height: auto;"></div>`;

    return { asunto: ASUNTO, texto, html };
}

// =====================================================================
// 🚀 ENVÍO MASIVO DEL AVISO F29
// =====================================================================
export async function enviarAvisoF29Lista() {
    const destinatarios = DESTINATARIOS
        .map(d => ({ ...d, correos: parsearCorreos(d.correo) }))
        .filter(d => d.correos.length > 0);

    resetEstado(destinatarios.length);

    console.log('==================================================');
    console.log(`🧾 AVISO F29 (LISTA FIJA): ${destinatarios.length} empresa(s)`);
    console.log(`   Periodo: ${MES_PERIODO} | Fecha límite: ${FECHA_LIMITE}`);
    console.log('==================================================');

    for (let i = 0; i < destinatarios.length; i++) {
        const dest = destinatarios[i];
        estadoAvisoF29.actual = i + 1;
        estadoAvisoF29.ultimoCorreo = dest.correos.join(', ');

        const { asunto, html } = construirCorreoF29(dest);
        const mailOptions = {
            from: `"Matías Olivos" <matias.olivos@vsvconsultores.com>`,
            to: dest.correos,
            subject: asunto,
            html,
            attachments: ADJUNTOS_FIRMA,
        };

        try {
            console.log(`📧 [${i + 1}/${destinatarios.length}] F29 → ${dest.razonSocial} (${dest.correos.join(', ')})`);
            await enviarConReintentos(mailOptions);
            estadoAvisoF29.enviados++;
        } catch (e) {
            estadoAvisoF29.fallidos++;
            console.log(`   ❌ Falló ${dest.correos.join(', ')}: ${e.message}`);
        }

        if (i < destinatarios.length - 1) await delay(1500);
    }

    estadoAvisoF29.activo = false;
    estadoAvisoF29.finalizado = true;
    console.log(`✅ AVISO F29 TERMINADO. Enviados: ${estadoAvisoF29.enviados} | Fallidos: ${estadoAvisoF29.fallidos}`);
    return { ok: true, enviados: estadoAvisoF29.enviados, fallidos: estadoAvisoF29.fallidos, total: destinatarios.length };
}

// ⚠️ Solo se ejecuta si corres ESTE archivo directamente con node.
const ejecutadoDirectamente = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (ejecutadoDirectamente) {
    enviarAvisoF29Lista().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
