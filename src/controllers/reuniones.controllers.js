// ============================================================================
// REUNIONES · videollamada dentro del sistema
// ----------------------------------------------------------------------------
// LO QUE ESTE ARCHIVO NO HACE: video. El audio y la imagen los sirve Jitsi y
// viajan entre los navegadores de los participantes; por acá no pasa un solo
// byte de la llamada. Este controlador maneja lo que Meet no da y es la razón
// de tener las reuniones adentro del sistema:
//
//   · de qué cliente y de qué ticket es la reunión,
//   · a quién se invitó y quién entró de verdad,
//   · el aviso por la campana cuando alguien te invita o entra a llamarte,
//   · lo que se acordó, pegado a la ficha del cliente.
//
// EL PROVEEDOR DE VIDEO ES UNA VARIABLE, no una decisión de por vida. El
// servidor solo genera y guarda el NOMBRE de la sala; el dominio que la sirve
// lo elige la pantalla (`VITE_JITSI_DOMAIN`). Cambiar de Jitsi público a uno
// propio, o a LiveKit, no toca esta tabla ni este archivo.
//
// AISLAMIENTO: todo filtra por organización, como el resto del sistema.
// Y dentro de la organización, una reunión la ve quien la creó o quien está
// invitado: la lista de participantes ES el permiso.
// ============================================================================
import crypto from 'node:crypto';
import { pool } from '../database/db.js';
import { registrar } from '../utils/bitacora.js';
import { notificarA } from '../utils/notificaciones.js';
import { configVideo, dominioVideo } from '../utils/videoReunion.js';

const ESTADOS = ['agendada', 'en_curso', 'terminada', 'cancelada'];

// EL NOMBRE DE LA SALA ES LA LLAVE. En Jitsi público, cualquiera que escriba
// el nombre de una sala entra a ella: no hay lista de invitados del otro lado.
// Por eso no se usa el título ni un correlativo —«reunion-3» la abre un
// desconocido probando números— sino 24 caracteres al azar. El prefijo `vsv`
// solo sirve para reconocerlas si alguien mira el historial del navegador.
const nuevaSala = () => `vsv-${crypto.randomBytes(12).toString('hex')}`;

// Una reunión se ve si la creaste o si estás invitado. Se repite en varias
// consultas, así que vive en un solo lugar.
const puedoVerla = (i) => `(
        r.creado_por = $${i}
     OR EXISTS (SELECT 1 FROM reunion_participante rp
                 WHERE rp.reunion_id = r.id AND rp.usuario_id = $${i})
    )`;

const mapReunion = (r) => ({
    id: r.id,
    titulo: r.titulo,
    descripcion: r.descripcion,
    sala: r.sala,
    iniciaAt: r.inicia_at,
    duracionMin: r.duracion_min,
    estado: r.estado,
    personaId: r.persona_id,
    personaNombre: (r.persona_nombre || '').trim() || null,
    empresaId: r.empresa_id,
    tareaId: r.tarea_id,
    tareaTitulo: r.tarea_titulo || null,
    creadoPor: r.creado_por,
    creadorNombre: r.creador_nombre || null,
    iniciadaAt: r.iniciada_at,
    terminadaAt: r.terminada_at,
    notas: r.notas,
    createdAt: r.created_at,
    participantes: r.participantes || [],
    // EL ENLACE DIRECTO A LA SALA. Se arma acá y no en la pantalla porque el
    // nombre de la sala depende del proveedor (con JaaS lleva el identificador
    // de la cuenta adelante), y esa cuenta es del servidor.
    //
    // Ojo con lo que significa: en un servidor sin autenticación, este enlace
    // ES la llave. Quien lo tenga entra al video, tenga cuenta o no. Eso lo
    // hace útil —es como se invita hoy a alguien de fuera— y a la vez es la
    // razón de que la sala se llame con 24 caracteres al azar.
    enlace: r.sala ? `https://${dominioVideo()}/${r.sala}` : null,
    // Cuántos están adentro AHORA: entraron y no han salido. Es lo que
    // convierte la lista en algo vivo —«hay 2 esperándote»— en vez de una
    // agenda muerta.
    dentro: r.dentro ?? 0,
});

const SELECT_REUNION = `
    SELECT r.*,
           (p.nombre || ' ' || COALESCE(p.apellidos,'')) AS persona_nombre,
           t.titulo AS tarea_titulo,
           u.nombre AS creador_nombre,
           COALESCE((SELECT json_agg(json_build_object(
                        'id', pu.id, 'nombre', pu.nombre, 'rol', rp.rol,
                        'entroAt', rp.entro_at, 'salioAt', rp.salio_at)
                     ORDER BY pu.nombre)
                       FROM reunion_participante rp
                       JOIN usuario pu ON pu.id = rp.usuario_id
                      WHERE rp.reunion_id = r.id), '[]') AS participantes,
           (SELECT COUNT(*)::int FROM reunion_participante rp
             WHERE rp.reunion_id = r.id AND rp.entro_at IS NOT NULL AND rp.salio_at IS NULL) AS dentro
      FROM reunion r
      LEFT JOIN persona p ON p.id = r.persona_id
      LEFT JOIN tarea   t ON t.id = r.tarea_id
      LEFT JOIN usuario u ON u.id = r.creado_por`;

const reunionCompleta = async (id) => {
    const { rows } = await pool.query(`${SELECT_REUNION} WHERE r.id = $1`, [id]);
    return rows[0] ? mapReunion(rows[0]) : null;
};

// ------------------------------------------------------------
// LISTAR · ?cuando=proximas|pasadas|todas
// ------------------------------------------------------------
export const listarReuniones = async (req, res) => {
    try {
        const org = req.user?.organizacionId || null;
        const uid = req.user?.usuarioId || null;
        const params = [org, uid];
        const where = ['r.organizacion_id IS NOT DISTINCT FROM $1::uuid', puedoVerla(2)];

        // "Próximas" incluye las que están EN CURSO aunque su hora ya pasó: una
        // reunión que empezó hace diez minutos es lo más próximo que hay, y
        // mandarla al historial por el reloj sería absurdo.
        const cuando = req.query.cuando || 'proximas';
        if (cuando === 'proximas') {
            where.push(`(r.estado IN ('agendada','en_curso')
                         AND (r.inicia_at IS NULL OR r.inicia_at > NOW() - INTERVAL '12 hours'))`);
        } else if (cuando === 'pasadas') {
            where.push(`(r.estado IN ('terminada','cancelada')
                         OR (r.inicia_at IS NOT NULL AND r.inicia_at <= NOW() - INTERVAL '12 hours'))`);
        }
        if (req.query.personaId) { params.push(req.query.personaId); where.push(`r.persona_id = $${params.length}`); }
        if (req.query.tareaId)   { params.push(req.query.tareaId);   where.push(`r.tarea_id = $${params.length}`); }

        const { rows } = await pool.query(
            `${SELECT_REUNION}
              WHERE ${where.join(' AND ')}
              ORDER BY r.estado = 'en_curso' DESC,
                       COALESCE(r.inicia_at, r.created_at) ${cuando === 'pasadas' ? 'DESC' : 'ASC'}
              LIMIT 100`, params);

        return res.json({ success: true, reuniones: rows.map(mapReunion) });
    } catch (error) {
        console.error('❌ Error listando reuniones:', error.message);
        return res.status(500).json({ success: false, message: 'Error al listar las reuniones.' });
    }
};

export const obtenerReunion = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `${SELECT_REUNION} WHERE r.id = $1 AND r.organizacion_id IS NOT DISTINCT FROM $2::uuid
              AND ${puedoVerla(3)}`,
            [req.params.id, req.user?.organizacionId || null, req.user?.usuarioId || null]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Reunión no encontrada.' });
        return res.json({ success: true, reunion: mapReunion(rows[0]) });
    } catch (error) {
        console.error('❌ Error obteniendo reunión:', error.message);
        return res.status(500).json({ success: false, message: 'Error al abrir la reunión.' });
    }
};

// ------------------------------------------------------------
// CREAR · agendada o "ahora"
// ------------------------------------------------------------
export const crearReunion = async (req, res) => {
    try {
        const { titulo, descripcion, iniciaAt, duracionMin, participantes,
                personaId, empresaId, tareaId, ahora } = req.body || {};
        if (!titulo?.trim()) return res.status(400).json({ success: false, message: 'La reunión necesita un título.' });

        const uid = req.user?.usuarioId || null;
        const { rows } = await pool.query(
            `INSERT INTO reunion (organizacion_id, titulo, descripcion, sala, inicia_at, duracion_min,
                                  estado, persona_id, empresa_id, tarea_id, creado_por, iniciada_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
            [
                req.user?.organizacionId || null,
                titulo.trim().slice(0, 200),
                descripcion?.trim() || null,
                nuevaSala(),
                ahora ? null : (iniciaAt || null),
                Number.isFinite(+duracionMin) ? Math.min(Math.max(+duracionMin, 5), 480) : 30,
                // Una llamada de "ahora" nace EN CURSO: no tiene sentido que
                // quien la abre tenga que además pulsar "iniciar".
                ahora ? 'en_curso' : 'agendada',
                personaId || null, empresaId || null, tareaId || null,
                uid,
                ahora ? new Date() : null,
            ]
        );
        const id = rows[0].id;

        // El creador siempre queda dentro, como anfitrión. Si no, crearía una
        // reunión que después no ve en su propia lista.
        const invitados = [...new Set([...(Array.isArray(participantes) ? participantes : []), uid].filter(Boolean))];
        for (const usuarioId of invitados) {
            await pool.query(
                `INSERT INTO reunion_participante (reunion_id, usuario_id, rol)
                 VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
                [id, usuarioId, usuarioId === uid ? 'anfitrion' : 'invitado']);
        }

        const completa = await reunionCompleta(id);

        // ------------------------------------------------------------------
        // EL AVISO · y por qué la sala de "ahora" NO manda correo
        // ------------------------------------------------------------------
        // Los dos casos avisan por la campana, que empuja en vivo: si el otro
        // tiene el sistema abierto, le suena en el momento.
        //
        // El correo es distinto y va solo cuando la reunión se AGENDA. Una sala
        // abierta al tiro se atiende ahora o no se atiende: para cuando alguien
        // lea el correo, la llamada terminó, y lo único que queda es una
        // bandeja llena de avisos inútiles. Una reunión del jueves a las 15:30
        // sí hay que poder verla en el correo.
        //
        // El correo lleva la fecha escrita completa —no "revisa la hora en el
        // sistema"—, porque un aviso que obliga a entrar a otra parte para
        // saber cuándo es no sirve de nada.
        const cuando = completa.iniciaAt
            ? new Date(completa.iniciaAt).toLocaleString('es-CL', {
                weekday: 'long', day: 'numeric', month: 'long',
                hour: '2-digit', minute: '2-digit',
            })
            : null;

        await notificarA(invitados.filter(x => x !== uid), ahora
            ? {
                actor: req.user,
                tipo: 'reunion_ahora',                       // sin correo, a propósito
                titulo: `${req.user?.nombre || 'Alguien'} te está llamando: ${completa.titulo}`,
                descripcion: 'La sala está abierta ahora',
                entidad: 'reunion', entidadId: id,
            }
            : {
                actor: req.user,
                tipo: 'reunion_agendada',                    // este sí va por correo
                titulo: `Reunión: ${completa.titulo}`,
                descripcion: [
                    cuando ? `Cuándo: ${cuando} h` : null,
                    `Duración: ${completa.duracionMin} minutos`,
                    completa.personaNombre ? `Cliente: ${completa.personaNombre}` : null,
                    `Convoca: ${req.user?.nombre || 'el equipo'}`,
                    completa.descripcion ? `\nTemas:\n${completa.descripcion}` : null,
                ].filter(Boolean).join('\n'),
                entidad: 'reunion', entidadId: id,
            });

        await registrar(req, {
            modulo: 'reuniones', accion: 'crear', entidad: 'reunion', entidadId: id,
            descripcion: `${ahora ? 'Abrió una sala' : 'Agendó una reunión'}: «${completa.titulo}» con ${invitados.length} participante(s)`,
        });

        return res.status(201).json({ success: true, reunion: completa });
    } catch (error) {
        console.error('❌ Error creando reunión:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo crear la reunión.' });
    }
};

// ------------------------------------------------------------
// ENTRAR · devuelve la sala y deja constancia de la asistencia
// ------------------------------------------------------------
// Acá es donde una reunión pasa de agendada a en_curso: la abre el primero que
// llega, sin que nadie tenga que "iniciarla" aparte.
export const entrarReunion = async (req, res) => {
    try {
        const uid = req.user?.usuarioId || null;
        const { rows } = await pool.query(
            `SELECT r.id, r.sala, r.estado, r.titulo, r.creado_por
               FROM reunion r
              WHERE r.id = $1 AND r.organizacion_id IS NOT DISTINCT FROM $2::uuid AND ${puedoVerla(3)}`,
            [req.params.id, req.user?.organizacionId || null, uid]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Reunión no encontrada.' });
        const r = rows[0];
        if (r.estado === 'cancelada') return res.status(409).json({ success: false, message: 'Esa reunión fue cancelada.' });

        // Quien entra queda registrado aunque no estuviera invitado de antemano
        // —pasa: alguien manda el enlace a un tercero del equipo—.
        await pool.query(
            `INSERT INTO reunion_participante (reunion_id, usuario_id, entro_at)
             VALUES ($1,$2,NOW())
             ON CONFLICT (reunion_id, usuario_id)
             DO UPDATE SET entro_at = COALESCE(reunion_participante.entro_at, NOW()), salio_at = NULL`,
            [r.id, uid]);

        const primero = r.estado !== 'en_curso';
        if (primero) {
            await pool.query(
                `UPDATE reunion SET estado='en_curso', iniciada_at=COALESCE(iniciada_at, NOW()), updated_at=NOW()
                  WHERE id=$1`, [r.id]);

            // Avisar a los demás SOLO la primera vez. Un aviso por cada persona
            // que entra convierte la campana en ruido.
            const { rows: otros } = await pool.query(
                `SELECT usuario_id FROM reunion_participante WHERE reunion_id=$1 AND usuario_id <> $2`, [r.id, uid]);
            await notificarA(otros.map(o => o.usuario_id), {
                // `reunion_iniciada` no está en los tipos con correo: para
                // cuando alguien lo lea, la reunión ya habrá terminado.
                actor: req.user, tipo: 'reunion_iniciada',
                titulo: `Empezó la reunión: ${r.titulo}`,
                descripcion: `${req.user?.nombre || 'Alguien'} ya está en la sala`,
                entidad: 'reunion', entidadId: r.id,
            });
        }

        // Con qué servidor de video se levanta esta sala. Viaja desde el
        // servidor y no desde el frontend a propósito: cambiar de proveedor es
        // una variable de entorno, sin recompilar ni redesplegar la pantalla.
        const video = configVideo({ usuario: req.user, sala: r.sala });

        return res.json({
            success: true,
            sala: video.sala,
            dominio: video.dominio,
            jwt: video.jwt,
            reunion: await reunionCompleta(r.id),
        });
    } catch (error) {
        console.error('❌ Error entrando a la reunión:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo entrar a la reunión.' });
    }
};

// Salir solo marca la hora. NO termina la reunión: los demás siguen adentro.
export const salirReunion = async (req, res) => {
    try {
        await pool.query(
            `UPDATE reunion_participante SET salio_at = NOW()
              WHERE reunion_id = $1 AND usuario_id = $2 AND entro_at IS NOT NULL`,
            [req.params.id, req.user?.usuarioId || null]);
        return res.json({ success: true });
    } catch (error) {
        console.error('❌ Error saliendo de la reunión:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo registrar la salida.' });
    }
};

// ------------------------------------------------------------
// INVITADOS · agregar y quitar DESPUÉS de creada
// ------------------------------------------------------------
// Faltaba, y es el caso más común de todos: la reunión ya empezó y hay que
// sumar a alguien. Antes la única forma era cancelarla y volver a convocar.
//
// Puede invitar cualquiera que ya esté en la reunión, no solo quien la convocó:
// en una llamada en curso, pedirle al que convocó que agregue a un tercero es
// exactamente el trámite que hace que la gente termine mandando el enlace por
// WhatsApp.
export const agregarParticipante = async (req, res) => {
    try {
        const { usuarioId } = req.body || {};
        if (!usuarioId) return res.status(400).json({ success: false, message: 'Falta a quién invitar.' });

        const org = req.user?.organizacionId || null;
        const { rows } = await pool.query(
            `SELECT r.id, r.titulo FROM reunion r
              WHERE r.id = $1 AND r.organizacion_id IS NOT DISTINCT FROM $2::uuid AND ${puedoVerla(3)}`,
            [req.params.id, org, req.user?.usuarioId || null]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Reunión no encontrada.' });

        // Nadie de otra organización: el aislamiento manda por encima de todo.
        const { rows: u } = await pool.query(
            `SELECT id, nombre FROM usuario
              WHERE id = $1 AND activo = true AND organizacion_id IS NOT DISTINCT FROM $2::uuid`,
            [usuarioId, org]);
        if (!u.length) return res.status(404).json({ success: false, message: 'Esa persona no existe en tu organización.' });

        const { rowCount } = await pool.query(
            `INSERT INTO reunion_participante (reunion_id, usuario_id, rol)
             VALUES ($1,$2,'invitado') ON CONFLICT DO NOTHING`, [rows[0].id, usuarioId]);

        // Solo se avisa si de verdad se agregó: pulsar dos veces no puede
        // mandarle dos avisos a la misma persona.
        if (rowCount) {
            // Solo campana. Sumar a alguien pasa con la reunión ya en curso:
            // el correo llegaría tarde y de puro ruido.
            await notificarA([usuarioId], {
                actor: req.user, tipo: 'reunion_sumado',
                titulo: `${req.user?.nombre || 'Alguien'} te sumó a: ${rows[0].titulo}`,
                descripcion: 'La sala está abierta',
                entidad: 'reunion', entidadId: rows[0].id,
            });
            await registrar(req, {
                modulo: 'reuniones', accion: 'invitar', entidad: 'reunion', entidadId: rows[0].id,
                descripcion: `Sumó a ${u[0].nombre} a la reunión «${rows[0].titulo}»`,
            });
        }

        return res.json({ success: true, agregado: !!rowCount, reunion: await reunionCompleta(rows[0].id) });
    } catch (error) {
        console.error('❌ Error invitando a la reunión:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo invitar.' });
    }
};

// Sacar a alguien sí es del que convocó: es una decisión, no una comodidad.
// Y no se saca a quien ya entró — su asistencia es un hecho registrado, no una
// invitación que se pueda deshacer.
export const quitarParticipante = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `DELETE FROM reunion_participante rp
              USING reunion r
              WHERE rp.reunion_id = r.id
                AND r.id = $1 AND r.organizacion_id IS NOT DISTINCT FROM $2::uuid
                AND r.creado_por = $3
                AND rp.usuario_id = $4
                AND rp.usuario_id <> r.creado_por
                AND rp.entro_at IS NULL
              RETURNING rp.usuario_id`,
            [req.params.id, req.user?.organizacionId || null, req.user?.usuarioId || null, req.params.usuarioId]);
        if (!rows.length) {
            return res.status(409).json({
                success: false,
                message: 'No se puede quitar: o no eres quien convocó, o esa persona ya entró a la reunión.',
            });
        }
        return res.json({ success: true, reunion: await reunionCompleta(req.params.id) });
    } catch (error) {
        console.error('❌ Error quitando invitado:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo quitar al invitado.' });
    }
};

// ------------------------------------------------------------
// TERMINAR · con la nota de lo que se acordó
// ------------------------------------------------------------
// Esta es la parte que justifica todo lo demás. La nota se guarda en la reunión
// y, si la reunión era con un cliente, también queda en su ficha: al mes
// siguiente nadie se acuerda de qué se habló, y la ficha es donde se busca.
export const terminarReunion = async (req, res) => {
    try {
        const { notas } = req.body || {};
        const { rows } = await pool.query(
            `SELECT r.id, r.titulo, r.persona_id, r.creado_por
               FROM reunion r
              WHERE r.id=$1 AND r.organizacion_id IS NOT DISTINCT FROM $2::uuid AND ${puedoVerla(3)}`,
            [req.params.id, req.user?.organizacionId || null, req.user?.usuarioId || null]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Reunión no encontrada.' });
        const r = rows[0];

        await pool.query(
            `UPDATE reunion SET estado='terminada', terminada_at=NOW(),
                    notas = COALESCE($2, notas), updated_at=NOW()
              WHERE id=$1`, [r.id, notas?.trim() || null]);
        await pool.query(
            `UPDATE reunion_participante SET salio_at = COALESCE(salio_at, NOW())
              WHERE reunion_id=$1 AND entro_at IS NOT NULL`, [r.id]);

        await registrar(req, {
            modulo: 'reuniones', accion: 'terminar', entidad: 'reunion', entidadId: r.id,
            descripcion: `Cerró la reunión «${r.titulo}»${notas?.trim() ? ' con nota' : ' sin nota'}`,
        });

        return res.json({ success: true, reunion: await reunionCompleta(r.id) });
    } catch (error) {
        console.error('❌ Error terminando la reunión:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo cerrar la reunión.' });
    }
};

// ------------------------------------------------------------
// EDITAR LA NOTA DE UNA REUNIÓN YA CERRADA
// ------------------------------------------------------------
// La nota se escribe al colgar, apurado, con la otra persona todavía
// despidiéndose. Que no se pueda corregir después convierte el único registro
// de lo acordado en algo que nadie se atreve a llenar bien.
//
// Puede editarla quien convocó o quien ESTUVO en la reunión. No cualquiera que
// esté invitado: el que faltó no tiene cómo saber qué se acordó.
export const editarNotas = async (req, res) => {
    try {
        const { notas } = req.body || {};
        const uid = req.user?.usuarioId || null;
        const { rows } = await pool.query(
            `UPDATE reunion r SET notas = $4, updated_at = NOW()
              WHERE r.id = $1 AND r.organizacion_id IS NOT DISTINCT FROM $2::uuid
                AND (r.creado_por = $3
                     OR EXISTS (SELECT 1 FROM reunion_participante rp
                                 WHERE rp.reunion_id = r.id AND rp.usuario_id = $3
                                   AND rp.entro_at IS NOT NULL))
              RETURNING r.id, r.titulo`,
            [req.params.id, req.user?.organizacionId || null, uid, notas?.trim() || null]);
        if (!rows.length) {
            return res.status(403).json({
                success: false,
                message: 'Solo quien convocó la reunión o quien estuvo en ella puede editar la nota.',
            });
        }
        await registrar(req, {
            modulo: 'reuniones', accion: 'editar', entidad: 'reunion', entidadId: rows[0].id,
            descripcion: `Editó la nota de la reunión «${rows[0].titulo}»`,
        });
        return res.json({ success: true, reunion: await reunionCompleta(rows[0].id) });
    } catch (error) {
        console.error('❌ Error editando la nota:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo guardar la nota.' });
    }
};

// ------------------------------------------------------------
// BORRAR UNA REUNIÓN DEL HISTORIAL
// ------------------------------------------------------------
// Borrar de verdad, no archivar. Es a propósito y es la excepción en este
// sistema: una prueba, una sala abierta por error, una reunión duplicada. Ese
// ruido en el historial hace que el historial deje de mirarse.
//
// Tres candados, porque no tiene vuelta atrás:
//   · solo quien la convocó,
//   · solo si ya terminó o se canceló —una reunión en curso no se borra por
//     debajo de los que están hablando—,
//   · se lleva sus participantes con ella (ON DELETE CASCADE).
export const eliminarReunion = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `DELETE FROM reunion
              WHERE id = $1 AND organizacion_id IS NOT DISTINCT FROM $2::uuid
                AND creado_por = $3
                AND estado IN ('terminada','cancelada')
              RETURNING id, titulo`,
            [req.params.id, req.user?.organizacionId || null, req.user?.usuarioId || null]);
        if (!rows.length) {
            return res.status(409).json({
                success: false,
                message: 'Solo quien la convocó puede borrarla, y solo si ya terminó o fue cancelada.',
            });
        }
        await registrar(req, {
            modulo: 'reuniones', accion: 'eliminar', entidad: 'reunion', entidadId: rows[0].id,
            descripcion: `Borró del historial la reunión «${rows[0].titulo}»`,
            resultado: 'parcial',
        });
        return res.json({ success: true });
    } catch (error) {
        console.error('❌ Error borrando la reunión:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo borrar la reunión.' });
    }
};

// ------------------------------------------------------------
// ACTUALIZAR / CANCELAR
// ------------------------------------------------------------
// Solo el que la creó. Cancelar no borra: la reunión que se cayó también es
// información —quedó agendada con un cliente y no se hizo—.
export const cancelarReunion = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `UPDATE reunion SET estado='cancelada', updated_at=NOW()
              WHERE id=$1 AND organizacion_id IS NOT DISTINCT FROM $2::uuid AND creado_por = $3
              RETURNING id, titulo`,
            [req.params.id, req.user?.organizacionId || null, req.user?.usuarioId || null]);
        if (!rows.length) return res.status(403).json({ success: false, message: 'Solo quien la creó puede cancelarla.' });

        const { rows: otros } = await pool.query(
            `SELECT usuario_id FROM reunion_participante WHERE reunion_id=$1 AND usuario_id <> $2`,
            [rows[0].id, req.user?.usuarioId || null]);
        await notificarA(otros.map(o => o.usuario_id), {
            actor: req.user, tipo: 'reunion_cancelada',
            titulo: `Se canceló la reunión: ${rows[0].titulo}`,
            entidad: 'reunion', entidadId: rows[0].id,
        });

        return res.json({ success: true });
    } catch (error) {
        console.error('❌ Error cancelando la reunión:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo cancelar la reunión.' });
    }
};

export const ESTADOS_REUNION = ESTADOS;
