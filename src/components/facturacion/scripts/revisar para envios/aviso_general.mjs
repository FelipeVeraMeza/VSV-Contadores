// ============================================================================
// AVISO GENERAL A LOS CLIENTES ACTIVOS
// ----------------------------------------------------------------------------
// Para los comunicados que no dependen de facturas ni de deuda: cierre por
// feriado, cambio de horario, aviso de aniversario. Va a TODA la cartera
// activa, no a un subconjunto.
//
// TRES REGLAS:
//
//   1. `soloPrueba: true` (el modo por defecto) manda UN correo a la casilla de
//      prueba y no toca a ningún cliente. Un aviso mal escrito enviado a 93
//      clientes no se puede deshacer.
//
//   2. Se envía de a uno, con pausa. Gmail corta la conexión si se le tiran 93
//      correos seguidos, y los últimos quedarían sin salir sin que nadie se dé
//      cuenta.
//
//   3. Los correos de cada ficha pueden venir separados por punto y coma, coma
//      o espacio. `normalizarCorreos` los deja como los entiende nodemailer.
// ============================================================================
import 'dotenv/config';
import { pool } from '../../../../database/db.js';
import { enviarConReintentos } from './mensajes_facturador_masivo.mjs';
import { normalizarCorreos } from './recordatorio_pago.mjs';
import { registrar } from '../../../../utils/bitacora.js';

const CASILLA_DE_PRUEBA = 'felipe.veram2001@gmail.com';
const REMITENTE = '"Matias Olivos" <matias.olivos@vsvconsultores.com>';
const PAUSA_MS = 1200;

// Estado en vivo, para que la página pueda mostrar el avance.
export const estadoAviso = {
    activo: false, total: 0, actual: 0,
    enviados: 0, fallidos: 0, ultimoCorreo: '', finalizado: false, error: null,
};

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

// El cuerpo en HTML. Se arma desde el texto plano para no tener dos versiones
// del mensaje que se puedan desincronizar.
const armarHtml = (titulo, parrafos) => `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
            max-width:600px;margin:0 auto;color:#1e2320;line-height:1.6;">
  <div style="background:#199b4d;padding:20px 24px;border-radius:12px 12px 0 0;">
    <h1 style="margin:0;color:#fff;font-size:17px;font-weight:800;letter-spacing:.3px;">
      ${titulo}
    </h1>
  </div>
  <div style="border:1px solid #e9dfcf;border-top:0;border-radius:0 0 12px 12px;
              padding:24px;background:#fff;">
    ${parrafos.map(p => `<p style="margin:0 0 14px;font-size:14px;">${p}</p>`).join('')}
    <hr style="border:0;border-top:1px solid #e9dfcf;margin:20px 0 14px;">
    <p style="margin:0;font-size:12px;color:#8b8b80;">
      Simple Pyme · Este es un aviso informativo, no requiere respuesta.
    </p>
  </div>
</div>`;

/**
 * Quiénes reciben: la cartera activa, igual que la define el CRM.
 * Se devuelven también los excluidos, para poder decir a quién NO le llegó.
 */
export const destinatariosActivos = async (organizacionId = null) => {
    const { rows } = await pool.query(
        `SELECT e.id, e.razon_social AS "razonSocial", e.email_corporativo AS correo
           FROM empresa e
          WHERE e.en_cartera IS NOT FALSE
            AND e.activo IS NOT FALSE
            AND ($1::uuid IS NULL OR e.organizacion_id = $1)
            AND (
                SELECT u.rol::text FROM audita a JOIN usuario u ON a.usuario_id = u.id
                 WHERE a.empresa_id = e.id ORDER BY a.fecha_asignacion ASC LIMIT 1
            ) IS DISTINCT FROM 'Cliente'
          ORDER BY e.razon_social`,
        [organizacionId]
    );

    const destinatarios = [], excluidos = [];
    for (const r of rows) {
        const correo = normalizarCorreos(r.correo);
        if (correo) destinatarios.push({ ...r, correo });
        else excluidos.push({ ...r, motivo: r.correo ? `correo inválido: ${r.correo}` : 'sin correo' });
    }
    return { destinatarios, excluidos };
};

/**
 * Manda el aviso.
 * `soloPrueba` (por defecto TRUE) manda un único correo a la casilla de prueba.
 */
export const enviarAvisoGeneral = async ({
    asunto, titulo, parrafos, organizacionId = null, soloPrueba = true, req = null,
}) => {
    if (!asunto || !parrafos?.length) throw new Error('Falta el asunto o el cuerpo del aviso.');

    const { destinatarios, excluidos } = await destinatariosActivos(organizacionId);
    const html = armarHtml(titulo || asunto, parrafos);

    console.log('='.repeat(60));
    console.log(`📣 AVISO GENERAL: ${asunto}`);
    console.log(`   Clientes activos: ${destinatarios.length}`);
    if (excluidos.length) {
        console.log(`   NO les puede llegar (${excluidos.length}):`);
        for (const e of excluidos) console.log(`     · ${e.razonSocial} — ${e.motivo}`);
    }
    console.log('='.repeat(60));

    // ---- Modo prueba: un solo correo, a la casilla de prueba ----
    if (soloPrueba) {
        await enviarConReintentos({
            from: REMITENTE,
            to: CASILLA_DE_PRUEBA,
            subject: `[PRUEBA] ${asunto}`,
            html: `<div style="background:#fff3cd;border:1px solid #ffc107;padding:10px 14px;
                        border-radius:8px;margin-bottom:16px;font-family:sans-serif;font-size:13px;">
                     <b>Esto es una prueba.</b> Si se envía de verdad, saldría a
                     <b>${destinatarios.length} clientes activos</b>.
                     ${excluidos.length ? `<br>${excluidos.length} no lo recibirían por no tener correo válido.` : ''}
                   </div>${html}`,
        });
        console.log(`✅ Prueba enviada a ${CASILLA_DE_PRUEBA}. NO se envió a ningún cliente.`);
        return {
            prueba: true, enviados: 0,
            seEnviariaA: destinatarios.length,
            excluidos: excluidos.map(e => ({ razonSocial: e.razonSocial, motivo: e.motivo })),
            mensaje: `Prueba enviada a ${CASILLA_DE_PRUEBA}. De verdad saldría a ${destinatarios.length} clientes.`,
        };
    }

    // ---- Envío real ----
    Object.assign(estadoAviso, {
        activo: true, total: destinatarios.length, actual: 0,
        enviados: 0, fallidos: 0, ultimoCorreo: '', finalizado: false, error: null,
    });

    const fallidos = [];
    for (const [i, d] of destinatarios.entries()) {
        estadoAviso.actual = i + 1;
        estadoAviso.ultimoCorreo = d.correo;
        try {
            await enviarConReintentos({ from: REMITENTE, to: d.correo, subject: asunto, html });
            estadoAviso.enviados++;
            console.log(`📧 [${i + 1}/${destinatarios.length}] ${d.razonSocial} → ${d.correo}`);
        } catch (err) {
            estadoAviso.fallidos++;
            fallidos.push({ razonSocial: d.razonSocial, correo: d.correo, error: err.message });
            console.error(`❌ [${i + 1}/${destinatarios.length}] ${d.razonSocial}: ${err.message}`);
        }
        if (i < destinatarios.length - 1) await esperar(PAUSA_MS);
    }

    estadoAviso.activo = false;
    estadoAviso.finalizado = true;

    if (req) {
        await registrar(req, {
            modulo: 'correos', accion: 'aviso_general', entidad: 'organizacion', entidadId: null,
            descripcion: `Aviso "${asunto}": ${estadoAviso.enviados} enviados, ${estadoAviso.fallidos} fallidos.`,
            detalle: { asunto, total: destinatarios.length, fallidos },
        }).catch(() => {});
    }

    console.log(`\n✅ ${estadoAviso.enviados} enviados · ${estadoAviso.fallidos} fallidos`);
    return {
        prueba: false,
        enviados: estadoAviso.enviados,
        fallidos: estadoAviso.fallidos,
        detalleFallidos: fallidos,
        excluidos: excluidos.map(e => ({ razonSocial: e.razonSocial, motivo: e.motivo })),
    };
};
