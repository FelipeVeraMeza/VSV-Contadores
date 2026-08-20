// ============================================================================
// 📥 BANDEJA DE ENTRADA — lo que contestan los clientes
// ----------------------------------------------------------------------------
// Va en su propio archivo y no en `correos.controllers.js` porque son dos
// problemas distintos: allá se ARMA y se manda un correo a 130 clientes; acá se
// LEE lo que volvió. Comparten la ruta `/api/correos` para no partir los
// permisos en dos, pero nada más.
//
// La lectura sale siempre de la copia local (`correo_recibido`), nunca de IMAP:
// abrir una conexión por clic haría la pantalla inusable. IMAP se toca solo al
// sincronizar.
// ============================================================================
import { pool } from '../database/db.js';
import { registrar } from '../utils/bitacora.js';
import { sincronizarBandeja, estadoBandeja, imapConfigurado } from '../utils/imapBandeja.js';
import { enviarCorreo, correoConfigurado } from '../utils/mailer.js';
import {
    sanitizarHtmlCorreo, esHtmlCorreo, cuerpoVacio, escaparValor,
} from '../utils/htmlCorreo.js';
// El remitente de cada persona se arma en un solo lugar: si acá se armara
// aparte, una respuesta saldría con otra dirección que un envío de campaña.
import { perfilDe, armarRemitente } from './correos.controllers.js';

const CORREO_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const limpiarCuerpo = (cuerpo) =>
    esHtmlCorreo(cuerpo) ? sanitizarHtmlCorreo(cuerpo)
                         : `<p>${escaparValor(cuerpo).replace(/\n/g, '<br>')}</p>`;

// Cuántos correos por página. La bandeja se lee de arriba hacia abajo y nadie
// baja 500 filas: se piden más solo si se pide más.
const POR_PAGINA = 50;

export const bandejaConfigurada = (_req, res) =>
    res.json({ success: true, configurada: imapConfigurado() });

export const listarBandeja = async (req, res) => {
    try {
        const org = req.user?.organizacionId || null;
        const q = String(req.query.q || '').trim();
        const filtro = String(req.query.filtro || 'todos');
        const pagina = Math.max(0, parseInt(req.query.pagina, 10) || 0);

        const cond = ['r.organizacion_id IS NOT DISTINCT FROM $1::uuid'];
        const args = [org];

        // «Archivado» es lo que uno ya despachó: sigue estando, pero no estorba
        // en la bandeja. Solo aparece si se pide.
        if (filtro !== 'archivados') cond.push('r.archivado = false');
        if (filtro === 'no_leidos')  cond.push('r.visto = false');
        if (filtro === 'destacados') cond.push('r.destacado = true');
        if (filtro === 'archivados') cond.push('r.archivado = true');
        if (filtro === 'clientes')   cond.push('r.empresa_id IS NOT NULL');

        if (q) {
            args.push(`%${q}%`);
            const i = args.length;
            cond.push(`(r.asunto ILIKE $${i} OR r.de_correo ILIKE $${i}
                        OR r.de_nombre ILIKE $${i} OR r.cuerpo_texto ILIKE $${i}
                        OR e.razon_social ILIKE $${i})`);
        }

        args.push(POR_PAGINA + 1, pagina * POR_PAGINA);

        // El cuerpo NO viaja en el listado: son 50 correos y el texto completo
        // de cada uno pesa más que todo lo demás junto. Se pide al abrir uno.
        const { rows } = await pool.query(
            `SELECT r.id, r.de_nombre, r.de_correo, r.asunto, r.fecha,
                    r.visto, r.destacado, r.archivado, r.tiene_adjuntos,
                    r.empresa_id, e.razon_social,
                    left(coalesce(r.cuerpo_texto, ''), 160) AS resumen
               FROM correo_recibido r
               LEFT JOIN empresa e ON e.id = r.empresa_id
              WHERE ${cond.join(' AND ')}
              ORDER BY r.fecha DESC NULLS LAST
              LIMIT $${args.length - 1} OFFSET $${args.length}`,
            args);

        const hayMas = rows.length > POR_PAGINA;

        const { rows: cuenta } = await pool.query(
            `SELECT count(*) FILTER (WHERE NOT visto AND NOT archivado)::int AS sin_leer,
                    count(*)::int AS total
               FROM correo_recibido
              WHERE organizacion_id IS NOT DISTINCT FROM $1::uuid`,
            [org]);

        return res.json({
            success: true,
            correos: rows.slice(0, POR_PAGINA),
            hayMas,
            sinLeer: cuenta[0]?.sin_leer ?? 0,
            total: cuenta[0]?.total ?? 0,
            configurada: imapConfigurado(),
            sincronizando: estadoBandeja.activo,
            ultimaAt: estadoBandeja.ultimaAt,
        });
    } catch (error) {
        console.error('❌ Error listando la bandeja:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo cargar la bandeja.' });
    }
};

export const detalleCorreoRecibido = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT r.*, e.razon_social
               FROM correo_recibido r
               LEFT JOIN empresa e ON e.id = r.empresa_id
              WHERE r.id = $1 AND r.organizacion_id IS NOT DISTINCT FROM $2::uuid`,
            [req.params.id, req.user?.organizacionId || null]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'No se encontró ese correo.' });

        // Abrirlo lo marca leído. Es lo que espera cualquiera que haya usado un
        // cliente de correo, y evita tener que apretar otro botón.
        await pool.query('UPDATE correo_recibido SET visto = true WHERE id = $1', [req.params.id]);

        return res.json({ success: true, correo: { ...rows[0], visto: true } });
    } catch (error) {
        console.error('❌ Error abriendo un correo recibido:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo abrir el correo.' });
    }
};

export const marcarCorreoRecibido = async (req, res) => {
    try {
        const { visto, destacado, archivado } = req.body || {};
        const campos = [];
        const args = [req.params.id, req.user?.organizacionId || null];
        for (const [nombre, valor] of [['visto', visto], ['destacado', destacado], ['archivado', archivado]]) {
            if (typeof valor === 'boolean') { args.push(valor); campos.push(`${nombre} = $${args.length}`); }
        }
        if (!campos.length) return res.status(400).json({ success: false, message: 'Nada que cambiar.' });

        const { rowCount } = await pool.query(
            `UPDATE correo_recibido SET ${campos.join(', ')}
              WHERE id = $1 AND organizacion_id IS NOT DISTINCT FROM $2::uuid`, args);
        if (!rowCount) return res.status(404).json({ success: false, message: 'No se encontró ese correo.' });
        return res.json({ success: true });
    } catch (error) {
        console.error('❌ Error marcando un correo recibido:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo actualizar.' });
    }
};

// Responde AL TOQUE y sigue en segundo plano, igual que el envío de campañas:
// la primera sincronización puede tardar minutos y el navegador cortaría por
// tiempo. El avance se consulta con `progresoBandeja`.
export const sincronizarBandejaController = async (req, res) => {
    if (!imapConfigurado()) {
        return res.status(503).json({
            success: false,
            message: 'La bandeja no está configurada. Faltan IMAP_HOST, IMAP_USER e IMAP_PASSWORD en el .env del servidor.',
        });
    }
    if (estadoBandeja.activo) {
        return res.json({ success: true, yaCorriendo: true, mensaje: 'Ya hay una sincronización en curso.' });
    }

    const org = req.user?.organizacionId || null;
    res.json({ success: true, mensaje: 'Buscando correos nuevos…' });

    sincronizarBandeja({ organizacionId: org })
        .then(async (r) => {
            console.log(`📥 [BANDEJA] ${r.nuevos} nuevos de ${r.revisados} revisados.`);
            if (r.nuevos > 0) {
                await registrar(req, {
                    modulo: 'correos', accion: 'sincronizar', entidad: 'bandeja', entidadId: null,
                    descripcion: `Sincronizó la bandeja: ${r.nuevos} correos nuevos`,
                }).catch(() => { /* la bitácora no puede romper la sincronización */ });
            }
        })
        .catch(e => console.error('❌ [BANDEJA] Falló la sincronización:', e.message));
};

export const progresoBandeja = (_req, res) =>
    res.json({ success: true, ...estadoBandeja, configurada: imapConfigurado() });

// ============================================================================
// ENVIADOS · la lista plana, un correo por fila
// ----------------------------------------------------------------------------
// La pantalla de Enviados mostraba CAMPAÑAS y, al elegir una, sus 33
// destinatarios. Eso responde «¿cómo salió la campaña del F29?», que es una
// pregunta de operación. Pero la pregunta del día a día es otra: «¿qué le
// mandamos a este cliente?», y para eso la agrupación estorba — hay que
// acordarse de en qué campaña iba antes de poder buscarlo.
//
// Esto es la misma información leída al revés: una fila por correo, lo más
// nuevo arriba, como cualquier carpeta de enviados. La vista por campaña sigue
// existiendo, con sus totales y sus fallidos; es un botón al lado.
//
// El resumen se limpia de etiquetas EN SQL: los cuerpos nuevos son HTML y un
// resumen que empiece con «<p style=...» no dice nada. Se hace acá y no en la
// pantalla para no traer 50 cuerpos completos solo para cortarlos.
const POR_PAGINA_ENVIADOS = 50;

export const listarEnviados = async (req, res) => {
    try {
        const org = req.user?.organizacionId || null;
        const q = String(req.query.q || '').trim();
        const filtro = String(req.query.filtro || 'todos');
        const pagina = Math.max(0, parseInt(req.query.pagina, 10) || 0);

        const cond = ['e.organizacion_id IS NOT DISTINCT FROM $1::uuid'];
        const args = [org];

        // Las pruebas no se mezclan con lo que salió a clientes, igual que en el
        // historial por campaña: mientras se prepara un envío, TODO es prueba.
        if (filtro !== 'pruebas') cond.push('e.es_prueba = false');
        if (filtro === 'pruebas')  cond.push('e.es_prueba = true');
        if (filtro === 'fallidos') cond.push("e.estado <> 'enviado'");

        if (q) {
            args.push(`%${q}%`);
            const i = args.length;
            cond.push(`(e.destinatario ILIKE $${i} OR e.razon_social ILIKE $${i}
                        OR e.asunto_final ILIKE $${i} OR e.cuerpo_final ILIKE $${i})`);
        }

        args.push(POR_PAGINA_ENVIADOS + 1, pagina * POR_PAGINA_ENVIADOS);

        const { rows } = await pool.query(
            `SELECT e.id, e.destinatario, e.razon_social, e.asunto_final,
                    e.estado, e.motivo, e.es_prueba, e.enviado_at, e.empresa_id,
                    e.campana_id, c.remitente, u.nombre AS autor,
                    left(regexp_replace(coalesce(e.cuerpo_final, ''), '<[^>]*>', ' ', 'g'), 200) AS resumen
               FROM correo_envio e
               LEFT JOIN correo_campana c ON c.id = e.campana_id
               LEFT JOIN usuario u ON u.id = c.enviado_por
              WHERE ${cond.join(' AND ')}
              ORDER BY coalesce(e.enviado_at, e.created_at) DESC NULLS LAST
              LIMIT $${args.length - 1} OFFSET $${args.length}`,
            args);

        return res.json({
            success: true,
            enviados: rows.slice(0, POR_PAGINA_ENVIADOS),
            hayMas: rows.length > POR_PAGINA_ENVIADOS,
        });
    } catch (error) {
        console.error('❌ Error listando los enviados:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo cargar lo enviado.' });
    }
};

export const detalleEnviado = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT e.*, c.remitente, c.firma, c.firma_imagen, u.nombre AS autor
               FROM correo_envio e
               LEFT JOIN correo_campana c ON c.id = e.campana_id
               LEFT JOIN usuario u ON u.id = c.enviado_por
              WHERE e.id = $1 AND e.organizacion_id IS NOT DISTINCT FROM $2::uuid`,
            [req.params.id, req.user?.organizacionId || null]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'No se encontró ese envío.' });
        return res.json({ success: true, envio: rows[0] });
    } catch (error) {
        console.error('❌ Error abriendo un envío:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo abrir el envío.' });
    }
};

// ============================================================================
// RESPONDER Y REENVIAR
// ----------------------------------------------------------------------------
// Sin esto, leer la bandeja quedaba a medias: uno ve la consulta del cliente y
// tiene que irse a Gmail a contestarla, con lo que la respuesta no queda en
// ninguna parte del sistema.
//
// Sale por la MISMA vía que todo lo demás (Resend, desde el dominio verificado)
// y con el remitente de quien contesta, no con uno fijo.
//
// SE CITA EL ORIGINAL abajo, como hace cualquier cliente de correo: sin eso el
// cliente recibe una respuesta suelta y no sabe a qué correo suyo contesta.
// El original va escapado aunque venga de nuestra base: lo escribió un
// desconocido y acá se está armando HTML con él.
const citar = (correo) => {
    const cuando = correo.fecha ? new Date(correo.fecha).toLocaleString('es-CL') : '';
    const quien = escaparValor(correo.de_nombre || correo.de_correo || '');
    const cuerpo = correo.cuerpo_html
        ? sanitizarHtmlCorreo(correo.cuerpo_html)
        : `<p>${escaparValor(correo.cuerpo_texto || '').replace(/\n/g, '<br>')}</p>`;
    return `
      <div style="margin-top:18px;padding-left:12px;border-left:2px solid #e5e7eb;color:#6b7280;font-size:13px">
        <p style="margin:0 0 8px">El ${escaparValor(cuando)}, ${quien} escribió:</p>
        ${cuerpo}
      </div>`;
};

export const responderCorreoRecibido = async (req, res) => {
    try {
        const { cuerpo, asunto, para, reenviar } = req.body || {};
        if (cuerpoVacio(cuerpo)) {
            return res.status(400).json({ success: false, message: 'Falta el texto de la respuesta.' });
        }
        if (!correoConfigurado()) {
            return res.status(503).json({ success: false, message: 'Este servidor no tiene ninguna vía de correo configurada.' });
        }

        const { rows } = await pool.query(
            `SELECT * FROM correo_recibido
              WHERE id = $1 AND organizacion_id IS NOT DISTINCT FROM $2::uuid`,
            [req.params.id, req.user?.organizacionId || null]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'No se encontró ese correo.' });
        const original = rows[0];

        // Al REENVIAR el destino lo escribe la persona; al RESPONDER es siempre
        // quien escribió. Dejar que se pueda cambiar el destino de una respuesta
        // es la forma más fácil de mandarle a un cliente lo que le contestaste a
        // otro.
        const destino = reenviar ? String(para || '').trim() : original.de_correo;
        if (!destino || !CORREO_VALIDO.test(destino.split(/[;,\s]+/)[0])) {
            return res.status(400).json({ success: false, message: 'Falta una dirección válida a quién enviar.' });
        }

        const perfil = await perfilDe(req.user?.usuarioId);
        const remitente = armarRemitente(perfil);
        const prefijo = reenviar ? 'Rv: ' : 'Re: ';
        const base = String(asunto || original.asunto || '(sin asunto)').trim();
        const asuntoFinal = new RegExp(`^(re|rv|fwd?):`, 'i').test(base) ? base : prefijo + base;

        await enviarCorreo({
            from: remitente,
            to: destino,
            subject: asuntoFinal.slice(0, 300),
            html: `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;line-height:1.6;color:#1f2937;max-width:600px">
                     ${limpiarCuerpo(cuerpo)}
                     ${perfil?.firma_texto ? `<div style="margin-top:18px;color:#6b7280;font-size:12px">${escaparValor(perfil.firma_texto).replace(/\n/g, '<br>')}</div>` : ''}
                     ${citar(original)}
                   </div>`,
        });

        // Queda marcado como despachado: es la señal de «esto ya lo contesté»
        // cuando se vuelve a mirar la bandeja mañana.
        await pool.query('UPDATE correo_recibido SET visto = true WHERE id = $1', [req.params.id]);

        await registrar(req, {
            modulo: 'correos', accion: reenviar ? 'reenviar' : 'responder',
            entidad: 'correo_recibido', entidadId: req.params.id,
            descripcion: `${reenviar ? 'Reenvió' : 'Respondió'} «${base.slice(0, 60)}» a ${destino}`,
        });

        return res.json({ success: true, destino, asunto: asuntoFinal });
    } catch (error) {
        console.error('❌ Error respondiendo un correo:', error.message);
        return res.status(500).json({ success: false, message: `No se pudo enviar: ${error.message}` });
    }
};
