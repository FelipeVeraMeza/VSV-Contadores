// ============================================================================
// CONFIRMARLE LA REUNIÓN AL CLIENTE
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE ESTE ARCHIVO
// Al agendar una reunión el sistema ya avisaba... a los del equipo. `notificarA`
// escribe a USUARIOS del sistema, y el cliente no es usuario: no tiene cuenta.
// O sea que a quien había que avisarle —el que se tiene que aparecer el jueves a
// las 15:30— era justo el único que no se enteraba. Se le mandaba el link a mano
// por WhatsApp, y cuando alguien se olvidaba, el cliente no llegaba.
//
// QUÉ HACE
// Le escribe al cliente por WhatsApp y por correo, con la fecha escrita completa
// y el enlace para entrar. Los dos canales, porque los dos se usan: el WhatsApp
// lo lee al toque y el correo le queda a mano el día de la reunión.
//
// POR QUÉ NO INTERRUMPE
// Todo va dentro de try/catch y la función NUNCA lanza. Si el WhatsApp está
// desconectado o el cliente no tiene correo, la reunión igual queda agendada:
// que falle un aviso no puede deshacer lo que el usuario acaba de hacer. Lo que
// se pudo mandar se informa de vuelta para poder decirlo en pantalla.
// ============================================================================
import { pool } from '../database/db.js';
import { enviarCorreo, correoConfigurado } from './mailer.js';
import * as bot from '../services/whatsapp/whatsappBot.js';
import * as repo from '../services/whatsapp/whatsappRepo.js';

// Chile: 9 dígitos móviles. Se arma el JID que espera WhatsApp (56 + número).
// Devuelve null si no parece un móvil chileno: mandarle un mensaje a un número
// mal formado no falla ruidosamente, simplemente no llega nunca.
const jidDesdeTelefono = (tel) => {
    const d = String(tel || '').replace(/\D/g, '');
    if (!d) return null;
    let n = d;
    if (n.startsWith('56')) n = n.slice(2);
    n = n.replace(/^0+/, '');
    if (n.length === 8) n = '9' + n;          // fijo antiguo o móvil sin el 9
    if (n.length !== 9) return null;
    return `56${n}@s.whatsapp.net`;
};

// La fecha, escrita como la diría una persona. El servidor corre en hora de
// Chile (src/config/zonaHoraria.js), así que toLocaleString ya da la hora local.
const cuandoLegible = (iso) => {
    if (!iso) return null;
    return new Date(iso).toLocaleString('es-CL', {
        weekday: 'long', day: 'numeric', month: 'long',
        hour: '2-digit', minute: '2-digit',
    });
};

const mayus = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Busca a quién escribirle: el teléfono y el correo del cliente de la reunión.
// Puede ser una persona (prospecto) o una empresa; se mira donde corresponda.
const contactoDeLaReunion = async ({ personaId, empresaId }) => {
    if (personaId) {
        const { rows } = await pool.query(
            `SELECT trim(concat_ws(' ', p.nombre, p.apellidos)) AS nombre,
                    (SELECT t.telefono FROM persona_telefono t
                      WHERE t.persona_id = p.id ORDER BY t.principal DESC NULLS LAST LIMIT 1) AS telefono,
                    (SELECT c.correo FROM persona_correo c
                      WHERE c.persona_id = p.id ORDER BY c.principal DESC NULLS LAST LIMIT 1) AS correo
               FROM persona p WHERE p.id = $1`, [personaId]);
        if (rows[0]) return rows[0];
    }
    if (empresaId) {
        const { rows } = await pool.query(
            `SELECT razon_social AS nombre,
                    COALESCE(NULLIF(whatsapp,''), telefono_corporativo) AS telefono,
                    email_corporativo AS correo
               FROM empresa WHERE id = $1`, [empresaId]);
        if (rows[0]) return rows[0];
    }
    return null;
};

// La sesión de WhatsApp por la que sale el mensaje: la primera conectada de la
// organización. Si no hay ninguna, no se manda y se dice por qué.
const sesionConectada = async (organizacionId) => {
    try {
        const activas = await repo.listarSesionesActivas();
        return (activas || []).find(s =>
            s.estado === 'conectado' &&
            (!organizacionId || String(s.organizacion_id) === String(organizacionId))) || null;
    } catch { return null; }
};

// Los tres avisos que se le mandan al cliente. Se arman acá, juntos, para que
// se lean como lo que son: tres versiones del mismo mensaje.
const REDACCION = {
    agendada:   { verbo: 'le confirmamos su reunión',   asunto: 'Reunión confirmada' },
    reagendada: { verbo: 'movimos su reunión',          asunto: 'Reunión reagendada' },
    cancelada:  { verbo: 'cancelamos su reunión',       asunto: 'Reunión cancelada'  },
};

// El envío en sí, común a los tres casos: a quién, por dónde y qué se pudo.
const avisar = async (reunion, { organizacionId, enlace, motivo }) => {
    const salida = { whatsapp: false, correo: false, motivo: null };
    const r = REDACCION[motivo] || REDACCION.agendada;
    const cancelada = motivo === 'cancelada';

    const contacto = await contactoDeLaReunion({
        personaId: reunion.personaId, empresaId: reunion.empresaId,
    });
    if (!contacto) { salida.motivo = 'la reunión no tiene cliente asociado'; return salida; }

    const cuando = mayus(cuandoLegible(reunion.iniciaAt));
    const saludo = contacto.nombre ? `Hola ${String(contacto.nombre).split(' ')[0]}` : 'Hola';

    const lineas = [
        `${saludo}, ${r.verbo}:`,
        '',
        cuando ? `📅 ${cuando} h` : null,
        cancelada ? null : `⏱ Duración: ${reunion.duracionMin || 30} minutos`,
        reunion.titulo ? `📋 ${reunion.titulo}` : null,
        cancelada ? null : (enlace ? `\nPara entrar: ${enlace}` : null),
        '',
        cancelada
            ? 'Si quiere que la reagendemos, responda este mensaje.'
            : 'Si no puede asistir, responda este mensaje y lo reagendamos.',
        '',
        'VSV Consultores',
    ].filter(Boolean);

    // --- WhatsApp ---
    const jid = jidDesdeTelefono(contacto.telefono);
    if (jid) {
        const sesion = await sesionConectada(organizacionId);
        if (sesion) {
            try {
                const conv = await repo.obtenerOCrearConversacion(sesion.id, jid, contacto.nombre || null);
                await bot.enviarTexto(sesion.id, conv, lineas.join('\n'));
                salida.whatsapp = true;
            } catch (e) { salida.motivo = `WhatsApp: ${e.message}`; }
        } else {
            salida.motivo = 'no hay una sesión de WhatsApp conectada';
        }
    }

    // --- Correo ---
    if (contacto.correo && correoConfigurado()) {
        try {
            await enviarCorreo({
                to: contacto.correo,
                subject: `${r.asunto}${cuando ? ` · ${cuando} h` : ''}`,
                html: `
                    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;color:#1f2937;line-height:1.6">
                      <p>${saludo}, ${r.verbo}:</p>
                      <table style="border-collapse:collapse;margin:16px 0">
                        ${cuando ? `<tr><td style="padding:4px 16px 4px 0;color:#6b7280">Cuándo</td><td style="padding:4px 0"><strong${cancelada ? ' style="text-decoration:line-through;color:#9ca3af"' : ''}>${cuando} h</strong></td></tr>` : ''}
                        ${cancelada ? '' : `<tr><td style="padding:4px 16px 4px 0;color:#6b7280">Duración</td><td style="padding:4px 0">${reunion.duracionMin || 30} minutos</td></tr>`}
                        ${reunion.titulo ? `<tr><td style="padding:4px 16px 4px 0;color:#6b7280">Tema</td><td style="padding:4px 0">${reunion.titulo}</td></tr>` : ''}
                      </table>
                      ${(!cancelada && enlace) ? `<p><a href="${enlace}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Entrar a la reunión</a></p>` : ''}
                      <p style="color:#6b7280;font-size:13px">${cancelada ? 'Si quiere que la reagendemos, responda este correo.' : 'Si no puede asistir, responda este correo y lo reagendamos.'}</p>
                      <p style="color:#6b7280;font-size:13px">VSV Consultores</p>
                    </div>`,
            });
            salida.correo = true;
        } catch (e) { salida.motivo = `Correo: ${e.message}`; }
    }

    if (!salida.whatsapp && !salida.correo && !salida.motivo) {
        salida.motivo = 'el cliente no tiene teléfono ni correo cargado';
    }
    return salida;
};

/**
 * Le confirma al cliente una reunión recién agendada.
 * Nunca lanza: devuelve qué se pudo enviar y qué no.
 *
 * @returns {Promise<{whatsapp: boolean, correo: boolean, motivo: string|null}>}
 */
export const confirmarReunionAlCliente = async (reunion, { organizacionId, enlace } = {}) => {
    try {
        // Una sala de "ahora" no se confirma: para cuando el cliente lea el
        // aviso, la llamada terminó. Solo se avisa lo que está agendado.
        if (!reunion?.iniciaAt) {
            return { whatsapp: false, correo: false, motivo: 'la reunión es de ahora, no se agenda aviso' };
        }
        return await avisar(reunion, { organizacionId, enlace, motivo: 'agendada' });
    } catch (e) {
        // Un aviso que falla no puede voltear la reunión que ya se creó.
        return { whatsapp: false, correo: false, motivo: e.message };
    }
};

/**
 * Le avisa al cliente que su reunión se movió o se cayó.
 * Nunca lanza, igual que la anterior.
 *
 * @param {'reagendada'|'cancelada'} opts.motivo
 */
export const avisarCambioAlCliente = async (reunion, { organizacionId, enlace, motivo } = {}) => {
    try {
        return await avisar(reunion, { organizacionId, enlace: enlace ?? reunion?.enlace, motivo });
    } catch (e) {
        return { whatsapp: false, correo: false, motivo: e.message };
    }
};
