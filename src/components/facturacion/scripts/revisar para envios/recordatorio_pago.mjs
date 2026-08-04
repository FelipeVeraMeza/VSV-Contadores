// =====================================================================
// 📢 MÓDULO DE RECORDATORIO DE PAGO (independiente del facturador masivo)
// ---------------------------------------------------------------------
// Le manda un correo a quien tiene el cobro del mes PENDIENTE_PAGO
// recordándole que debe pagar. NO adjunta la factura (es solo aviso).
// La lista sale de `cobro_mensual`, no de las facturas enviadas: al que ya
// pagó no se le cobra de nuevo. Ver obtenerDestinatariosRecordatorio().
//
// Reutiliza el motor de envío (Gmail API / Resend / SMTP con reintentos)
// de mensajes_facturador_masivo.mjs para no duplicar credenciales/lógica.
//
// Se dispara desde un botón en Facturación (endpoint /dte/enviar-recordatorios).
// =====================================================================
import 'dotenv/config';
import { pool } from '../../../../database/db.js';
import { enviarConReintentos } from './mensajes_facturador_masivo.mjs';
import { registrar } from '../../../../utils/bitacora.js';
import { abrirProceso, latir, cerrarProceso } from '../../../../utils/procesoEnCurso.js';

const delay = (ms) => new Promise(res => setTimeout(res, ms));

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
               'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Fecha tope de pago que se le escribe al cliente: el 5 del mes SIGUIENTE al
// periodo que se está cobrando (el cobro de julio vence el 5 de agosto).
//
// Antes era la constante '5 de julio' escrita a mano. El 30-jul seguía diciendo
// eso, o sea que el correo le habría pedido a 93 clientes pagar en una fecha ya
// pasada. Calculándola no vuelve a quedar vieja.
//
// Si algún mes la fecha es otra, se manda `fechaLimite` en el cuerpo del POST a
// /dte/enviar-recordatorios y este cálculo no se usa.
export const fechaLimitePorDefecto = (periodo = null) => {
    const base = periodo ? new Date(`${String(periodo).slice(0, 7)}-01T00:00:00`) : new Date();
    const siguiente = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    return `5 de ${MESES[siguiente.getMonth()]}`;
};

// Firma que ya usa el facturador (misma imagen, misma ruta relativa al cwd del server).
const RUTA_FIRMA = './src/components/facturacion/data/firma mati.jpeg';

const ES_CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Algunas fichas traen VARIOS correos en un solo campo, separados con punto y
// coma: "uno@gmail.com; otro@gmail.com". Nodemailer entiende la lista separada
// por COMA, no por punto y coma: si se le pasa tal cual, trata todo como una
// sola dirección malformada y ese cliente no recibe nada.
//
// Devuelve la lista lista para el campo `to`, o null si no quedó ninguna válida.
export const normalizarCorreos = (crudo) => {
    const validos = String(crudo || '')
        .split(/[;,]/)
        .map(c => c.trim())
        .filter(c => ES_CORREO.test(c));
    return validos.length ? [...new Set(validos)].join(', ') : null;
};

// 📊 Estado en vivo para que la página pueda mostrar el progreso (como estadoRobot).
export const estadoRecordatorio = {
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
    estadoRecordatorio.activo = true;
    estadoRecordatorio.total = total;
    estadoRecordatorio.actual = 0;
    estadoRecordatorio.enviados = 0;
    estadoRecordatorio.fallidos = 0;
    estadoRecordatorio.ultimoCorreo = '';
    estadoRecordatorio.finalizado = false;
    estadoRecordatorio.error = null;
}

// =====================================================================
// 👥 DESTINATARIOS: los que DEBEN, no los que recibieron factura
// ---------------------------------------------------------------------
// La fuente es `cobro_mensual`, la cuenta por cobrar del mes, filtrada por
// estado PENDIENTE_PAGO. Antes la lista salía de `correos_facturas` (todas las
// facturas enviadas desde el 27-jun), que es otra cosa: ahí está quien recibió
// la factura, haya pagado o no. Con esa fuente el recordatorio le llegaba
// también a quien ya había pagado.
//
// Cuando un cobro se hace efectivo pasa a PAGADA y sale solo de esta lista, así
// que el recordatorio siempre refleja la deuda real del momento en que se manda.
//
// El correo se toma del que se usó para enviar la factura (cruce por folio, que
// es la llave común entre `cobro_mensual` y `correos_facturas`); si no hay, cae
// al email corporativo de la ficha.
//
// ⚠️ SIEMPRE acotado a `organizacionId`. Sin ese filtro, un administrador de otra
// firma veía —y podía escribirle a— los clientes de esta. Se detectó el 31-jul,
// al separar a Victor en su propia organización.
// =====================================================================
export async function obtenerDestinatariosRecordatorio({ periodo = null, soloActivos = true, folios = null, organizacionId = null } = {}) {
    const filtroCartera = soloActivos
        ? `AND e.es_principal = false AND e.en_cartera IS NOT FALSE AND e.activo IS NOT FALSE`
        : '';

    // `folios`: si viene, se manda SOLO a esos (lo que el usuario marcó en la
    // pantalla). Si no viene, a todos los pendientes del periodo.
    const lista = Array.isArray(folios)
        ? folios.map(f => String(f).trim()).filter(Boolean)
        : null;
    const filtroFolios = lista?.length ? `AND TRIM(c.folio) = ANY($3::text[])` : '';

    const { rows } = await pool.query(
        `SELECT e.razon_social       AS "razonSocial",
                c.folio,
                c.monto_facturado    AS "monto",
                to_char(c.periodo, 'YYYY-MM') AS "periodo",
                COALESCE(cf.correo, e.email_corporativo) AS correo
           FROM cobro_mensual c
           JOIN empresa e ON e.id = c.empresa_id
           LEFT JOIN LATERAL (
                SELECT f.correo
                  FROM correos_facturas f
                 WHERE TRIM(f.folio) = TRIM(c.folio)
                   AND f.estado = 'enviado'
                   AND f.correo LIKE '%@%'
                   AND f.correo NOT ILIKE '%No_encontrado%'
                   AND f.correo NOT ILIKE '%Error_al_leer%'
                   AND f.correo NOT ILIKE '%falta_correo%'
                 ORDER BY f.fecha DESC
                 LIMIT 1
           ) cf ON true
          WHERE c.periodo = COALESCE(
                    $1::date,
                    -- Sin periodo explícito: EL ÚLTIMO QUE TIENE DEUDA, no el mes
                    -- en curso.
                    --
                    -- El cobro de un mes se persigue al mes siguiente: el de julio
                    -- vence el 5 de agosto. Tomando el mes en curso a secas,
                    -- el 1 de agosto el recordatorio se ponía a buscar cobros de
                    -- agosto —que todavía no existen— y respondía "sin
                    -- destinatarios" teniendo 81 clientes con deuda de julio a la
                    -- vista en la pantalla. Pasó el 03-08-2026.
                    --
                    -- Así se corrige solo: cuando se generen los cobros de agosto y
                    -- julio quede saldado, el periodo avanza sin tocar nada.
                    (SELECT MAX(c2.periodo)
                       FROM cobro_mensual c2
                      WHERE c2.estado = 'PENDIENTE_PAGO'
                        AND c2.organizacion_id IS NOT DISTINCT FROM $2::uuid)
                )
            AND c.estado = 'PENDIENTE_PAGO'
            AND c.organizacion_id IS NOT DISTINCT FROM $2::uuid
            ${filtroCartera}
            ${filtroFolios}
          ORDER BY e.razon_social`,
        lista?.length ? [periodo, organizacionId, lista] : [periodo, organizacionId]
    );

    // Sin correo no hay a quién escribirle. Se devuelven aparte para que la
    // pantalla los muestre: son cobros que hay que perseguir por otra vía.
    const destinatarios = [];
    const excluidos = [];

    for (const d of rows) {
        const correo = normalizarCorreos(d.correo);
        if (!correo) {
            excluidos.push({ ...d, motivo: 'no tiene correo válido registrado' });
        } else {
            destinatarios.push({ ...d, correo });
        }
    }

    return { destinatarios, excluidos };
}

// =====================================================================
// ✉️ CONTENIDO DEL CORREO RECORDATORIO
// =====================================================================
export function construirCorreoRecordatorio(razonSocial, { fechaLimite = fechaLimitePorDefecto() } = {}) {
    const nombre = razonSocial || 'Estimado cliente';

    const asunto = 'Recordatorio de pago – Factura servicio contable';

    const texto = `Estimados ${nombre}:

Junto con saludar, le recordamos que se encuentra pendiente el pago de la factura correspondiente al servicio de contabilidad mensual contratado por la empresa.

Le solicitamos regularizar el pago a más tardar el ${fechaLimite}. Si ya realizó el pago, por favor ignore este mensaje y le agradecemos enviarnos el comprobante por este medio.

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
// 🚀 ENVÍO MASIVO DE RECORDATORIOS
// Corre en segundo plano. Actualiza estadoRecordatorio en cada paso.
// =====================================================================
export async function enviarRecordatoriosPago({ periodo = null, fechaLimite = null, soloActivos = true, folios = null, usuario = null } = {}) {
    const { destinatarios, excluidos } = await obtenerDestinatariosRecordatorio({
        periodo, soloActivos, folios,
        organizacionId: usuario?.organizacionId || null,
    });
    resetEstado(destinatarios.length);

    // El tope se calcula sobre el periodo que se está cobrando, no sobre el día
    // de hoy: si el cobro de julio se manda en agosto, el vencimiento sigue
    // siendo el 5 de agosto.
    const tope = fechaLimite || fechaLimitePorDefecto(destinatarios[0]?.periodo || periodo);

    const deuda = destinatarios.reduce((a, d) => a + Number(d.monto || 0), 0);

    // Espejo en la base: si el servidor se reinicia a media corrida, la pantalla
    // puede seguir mostrando dónde quedó en vez de verse quieta.
    const procesoId = await abrirProceso({
        tipo: 'recordatorio_pago', usuario, total: destinatarios.length,
        detalle: { periodo: destinatarios[0]?.periodo || periodo, deuda, fechaLimite: tope },
    });

    console.log('==================================================');
    console.log(`📢 RECORDATORIO DE PAGO: ${destinatarios.length} cobro(s) PENDIENTE_PAGO`);
    console.log(`   Periodo: ${destinatarios[0]?.periodo || periodo || 'mes en curso'} | Límite de pago: ${tope}`);
    console.log(`   Deuda cubierta: $${deuda.toLocaleString('es-CL')}`);
    if (excluidos.length) {
        console.log(`   Sin correo, no se les puede avisar (${excluidos.length}):`);
        for (const e of excluidos) console.log(`     · ${e.razonSocial} (folio ${e.folio}) — ${e.motivo}`);
    }
    console.log('==================================================');

    for (let i = 0; i < destinatarios.length; i++) {
        const dest = destinatarios[i];
        estadoRecordatorio.actual = i + 1;
        estadoRecordatorio.ultimoCorreo = dest.correo;

        const { asunto, html } = construirCorreoRecordatorio(dest.razonSocial, { fechaLimite: tope });
        const mailOptions = {
            from: `"Matias Olivos" <matias.olivos@vsvconsultores.com>`,
            to: dest.correo,
            subject: asunto,
            html,
            attachments: [
                { filename: 'firma mati.jpeg', path: RUTA_FIRMA, cid: 'firma_mati' }
            ]
        };

        try {
            console.log(`📧 [${i + 1}/${destinatarios.length}] Recordatorio → ${dest.razonSocial} (${dest.correo})`);
            await enviarConReintentos(mailOptions);
            estadoRecordatorio.enviados++;
            // Se confirma explícitamente cada envío: `enviarConReintentos` NO
            // imprime nada cuando sale por SMTP 587 a la primera (el caso
            // normal), así que en pantalla solo se veía el aviso de que Resend
            // había fallado y parecía que no se había mandado nada.
            console.log(`   ✅ [${estadoRecordatorio.enviados}/${destinatarios.length}] Entregado a ${dest.correo}`);
            // Sin await: el latido no debe frenar el envío.
            latir(procesoId, { actual: i + 1, exitos: estadoRecordatorio.enviados, fallidos: estadoRecordatorio.fallidos, ultimo: dest.correo });
            // Uno por uno, no solo el total: esto es lo que permite responder
            // después "¿a quién se le mandó?" sin depender de una terminal.
            await registrar({ user: usuario }, {
                modulo: 'correos', accion: 'recordatorio_pago',
                entidad: 'cobro', entidadId: dest.folio,
                descripcion: `Recordatorio de pago a ${dest.razonSocial} (${dest.correo})`,
                detalle: { folio: dest.folio, correo: dest.correo, monto: dest.monto, periodo: dest.periodo, fechaLimite: tope },
            });
        } catch (e) {
            estadoRecordatorio.fallidos++;
            console.log(`   ❌ Falló ${dest.correo}: ${e.message}`);
            latir(procesoId, { actual: i + 1, exitos: estadoRecordatorio.enviados, fallidos: estadoRecordatorio.fallidos, ultimo: dest.correo });
            await registrar({ user: usuario }, {
                modulo: 'correos', accion: 'recordatorio_pago',
                entidad: 'cobro', entidadId: dest.folio,
                descripcion: `Falló el recordatorio a ${dest.razonSocial} (${dest.correo})`,
                resultado: 'error', detalle: { folio: dest.folio, correo: dest.correo, error: e.message },
            });
        }

        // Pausa corta para no saturar el envío (mismo criterio que el facturador).
        if (i < destinatarios.length - 1) await delay(1500);
    }

    estadoRecordatorio.activo = false;
    estadoRecordatorio.finalizado = true;

    await cerrarProceso(procesoId, {
        estado: estadoRecordatorio.fallidos ? 'finalizado' : 'finalizado',
        exitos: estadoRecordatorio.enviados,
        fallidos: estadoRecordatorio.fallidos,
    });

    await registrar({ user: usuario }, {
        modulo: 'correos', accion: 'recordatorio_pago_lote',
        descripcion: `Recordatorio de pago: ${estadoRecordatorio.enviados} enviados, ${estadoRecordatorio.fallidos} fallidos`,
        resultado: estadoRecordatorio.fallidos ? 'parcial' : 'ok',
        detalle: {
            total: destinatarios.length,
            enviados: estadoRecordatorio.enviados,
            fallidos: estadoRecordatorio.fallidos,
            periodo: destinatarios[0]?.periodo || periodo,
            fechaLimite: tope,
            deuda,
            sinCorreo: excluidos.map(e => ({ folio: e.folio, razonSocial: e.razonSocial, motivo: e.motivo })),
        },
    });
    console.log(`✅ RECORDATORIOS TERMINADOS. Enviados: ${estadoRecordatorio.enviados} | Fallidos: ${estadoRecordatorio.fallidos}`);
    return { ok: true, enviados: estadoRecordatorio.enviados, fallidos: estadoRecordatorio.fallidos, total: destinatarios.length };
}
