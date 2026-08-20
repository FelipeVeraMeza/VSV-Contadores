// ============================================================================
// 📥 LA BANDEJA DE ENTRADA — leer por IMAP lo que contestan los clientes
// ----------------------------------------------------------------------------
// El sistema solo sabía enviar: los correos salen por Resend, por HTTPS, y
// nada volvía. Mientras tanto el MX de vsvconsultores.com apunta a DonWeb, así
// que todas las respuestas de los clientes llevaban meses cayendo en una
// casilla del hosting que no leía nadie. Esto la lee.
//
// UNA COPIA LOCAL, NO UNA VENTANA AL SERVIDOR
// Se descarga y se guarda en `correo_recibido` en vez de consultar IMAP en cada
// pantallazo. Tres razones: IMAP es lento y abrir una conexión por clic se
// nota; se puede buscar con SQL sobre lo guardado; y —lo que justifica todo—
// se puede CRUZAR con el CRM para saber de qué cliente viene cada correo.
//
// LO QUE LLEGA NO SE PUEDE CREER
// El HTML de un correo entrante lo escribió un desconocido: es contenido
// hostil por definición, mucho más que lo que escribe uno en el editor. Pasa
// por el mismo saneo con lista blanca antes de tocar la base, porque después
// se va a mostrar en la pantalla del contador.
//
// LAS IMÁGENES SE DESCARTAN en ese saneo. Es lo correcto acá: las imágenes
// remotas de un correo son el mecanismo clásico para saber que lo abriste, y
// por eso todos los clientes de correo las bloquean por omisión.
// ============================================================================
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { pool } from '../database/db.js';
import { sanitizarHtmlCorreo } from './htmlCorreo.js';

export const imapConfigurado = () => !!(
    process.env.IMAP_HOST && process.env.IMAP_USER && process.env.IMAP_PASSWORD
);

// Cuánto se trae la PRIMERA vez. Después solo llega lo nuevo, así que este
// número solo decide el peso del arranque.
const DIAS_INICIALES = Math.max(1, parseInt(process.env.IMAP_DIAS_INICIALES, 10) || 90);

// Techo por pasada. Sin esto, una casilla con años sin leer intentaría bajar
// decenas de miles de mensajes en una sola petición HTTP y se caería a la
// mitad, dejando huecos difíciles de detectar.
const MAX_POR_PASADA = Math.max(1, parseInt(process.env.IMAP_MAX_POR_PASADA, 10) || 400);

// Una sola sincronización a la vez, y su avance. Mismo patrón que el envío de
// campañas: dos corriendo juntas se pisarían en el mismo rango de UID.
export const estadoBandeja = {
    activo: false, iniciadoAt: null, revisados: 0, nuevos: 0,
    error: null, ultimaAt: null, quedanMas: false,
};

const nuevoCliente = () => new ImapFlow({
    host: process.env.IMAP_HOST,
    port: parseInt(process.env.IMAP_PORT, 10) || 993,
    secure: String(process.env.IMAP_TLS ?? 'true') !== 'false',
    auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASSWORD },
    // La librería es MUY habladora; su log llenaría la consola del servidor.
    logger: false,
    tls: {
        // Algunos hostings compartidos sirven un certificado que no valida
        // contra su propio dominio. Se puede bajar la guardia con una variable,
        // pero por omisión NO: si se apaga sin querer, la conexión queda
        // expuesta a que alguien se ponga en el medio y nadie se entera.
        rejectUnauthorized: String(process.env.IMAP_TLS_ESTRICTO ?? 'true') !== 'false',
    },
});

// De qué cliente del CRM viene cada correo. Se arma UNA vez por sincronización
// y no una consulta por mensaje. Varias fichas traen más de una dirección
// separadas por ; , o espacio, igual que en el envío.
const mapaDeEmpresas = async (organizacionId) => {
    const { rows } = await pool.query(
        `SELECT id, email_corporativo FROM empresa
          WHERE organizacion_id IS NOT DISTINCT FROM $1::uuid
            AND email_corporativo IS NOT NULL AND trim(email_corporativo) <> ''`,
        [organizacionId]);
    const mapa = new Map();
    for (const e of rows) {
        for (const dir of String(e.email_corporativo).split(/[;,\s]+/)) {
            const k = dir.trim().toLowerCase();
            if (k && !mapa.has(k)) mapa.set(k, e.id);
        }
    }
    return mapa;
};

const guardar = async (msg, parsed, { organizacionId, buzon, uidValidity, empresas }) => {
    const de = parsed.from?.value?.[0] || {};
    const correoDe = String(de.address || '').toLowerCase();

    const adjuntos = (parsed.attachments || [])
        // Las imágenes incrustadas en la firma del que escribe aparecen como
        // adjuntos y no son archivos que nadie quiera abrir: se dejan fuera de
        // la lista para no mostrar «3 adjuntos» en un correo sin adjuntos.
        .filter(a => a.contentDisposition !== 'inline' && a.filename)
        .map(a => ({ nombre: a.filename, tipo: a.contentType || null, bytes: a.size || 0 }));

    const { rowCount } = await pool.query(
        `INSERT INTO correo_recibido
            (organizacion_id, buzon, uid, uid_validity, message_id, in_reply_to, referencias,
             de_nombre, de_correo, para, asunto, fecha,
             cuerpo_texto, cuerpo_html, tiene_adjuntos, adjuntos, empresa_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17)
         ON CONFLICT (organizacion_id, buzon, uid_validity, uid) DO NOTHING`,
        [
            organizacionId, buzon, Number(msg.uid), uidValidity,
            parsed.messageId?.slice(0, 500) || null,
            parsed.inReplyTo?.slice(0, 500) || null,
            Array.isArray(parsed.references) ? parsed.references.join(' ') : (parsed.references || null),
            (de.name || '').slice(0, 300) || null,
            correoDe.slice(0, 320) || null,
            (parsed.to?.text || '').slice(0, 2000) || null,
            (parsed.subject || '(sin asunto)').slice(0, 500),
            parsed.date || null,
            parsed.text || null,
            // Acá está el saneo del contenido hostil.
            parsed.html ? sanitizarHtmlCorreo(parsed.html) : null,
            adjuntos.length > 0,
            JSON.stringify(adjuntos),
            empresas.get(correoDe) || null,
        ]);
    return rowCount > 0;
};

/**
 * Trae lo nuevo de la casilla. La primera vez baja los últimos
 * `IMAP_DIAS_INICIALES` días; después, solo lo que llegó desde el último UID.
 */
export const sincronizarBandeja = async ({ organizacionId = null, buzon = 'INBOX' } = {}) => {
    if (!imapConfigurado()) {
        const e = new Error(
            'La bandeja no está configurada. Faltan IMAP_HOST, IMAP_USER e IMAP_PASSWORD en el .env');
        e.code = 'IMAP_NO_CONFIG';
        throw e;
    }
    if (estadoBandeja.activo) return { yaCorriendo: true, ...estadoBandeja };

    Object.assign(estadoBandeja, {
        activo: true, iniciadoAt: new Date().toISOString(),
        revisados: 0, nuevos: 0, error: null, quedanMas: false,
    });

    const cliente = nuevoCliente();
    try {
        await cliente.connect();
        const cerrojo = await cliente.getMailboxLock(buzon);
        try {
            const uidValidity = Number(cliente.mailbox.uidValidity);

            // Hasta dónde llegamos la última vez. Se pregunta POR uidValidity: si
            // el servidor la cambió, no hay «último UID» que valga y se vuelve a
            // partir de cero en vez de mezclar mensajes distintos.
            const { rows } = await pool.query(
                `SELECT max(uid) AS ultimo FROM correo_recibido
                  WHERE organizacion_id IS NOT DISTINCT FROM $1::uuid
                    AND buzon = $2 AND uid_validity = $3`,
                [organizacionId, buzon, uidValidity]);
            const ultimo = rows[0]?.ultimo ? Number(rows[0].ultimo) : null;

            let aTraer;
            if (ultimo) {
                aTraer = `${ultimo + 1}:*`;
            } else {
                const desde = new Date(Date.now() - DIAS_INICIALES * 24 * 3600 * 1000);
                const uids = await cliente.search({ since: desde }, { uid: true });
                if (!uids?.length) return { ...estadoBandeja, nuevos: 0, revisados: 0 };
                // Los más recientes primero si hay que recortar: si la casilla
                // trae más de lo que cabe en una pasada, lo último es lo que
                // alguien está esperando leer.
                const orden = [...uids].sort((a, b) => b - a);
                estadoBandeja.quedanMas = orden.length > MAX_POR_PASADA;
                aTraer = orden.slice(0, MAX_POR_PASADA);
            }

            const empresas = await mapaDeEmpresas(organizacionId);

            for await (const msg of cliente.fetch(aTraer, { uid: true, source: true }, { uid: true })) {
                estadoBandeja.revisados++;
                try {
                    const parsed = await simpleParser(msg.source);
                    if (await guardar(msg, parsed, { organizacionId, buzon, uidValidity, empresas })) {
                        estadoBandeja.nuevos++;
                    }
                } catch (e) {
                    // Un correo raro —un MIME roto, un adjunto gigante— no puede
                    // botar la sincronización entera y dejar la bandeja a medias.
                    console.error(`⚠️  [BANDEJA] No se pudo leer el UID ${msg.uid}: ${e.message}`);
                }
                if (estadoBandeja.revisados >= MAX_POR_PASADA) {
                    estadoBandeja.quedanMas = true;
                    break;
                }
            }
        } finally {
            cerrojo.release();
        }
        return { ...estadoBandeja };
    } catch (error) {
        estadoBandeja.error = error.message;
        console.error('❌ [BANDEJA] Error sincronizando:', error.message);
        throw error;
    } finally {
        await cliente.logout().catch(() => cliente.close?.());
        estadoBandeja.activo = false;
        estadoBandeja.ultimaAt = new Date().toISOString();
    }
};
