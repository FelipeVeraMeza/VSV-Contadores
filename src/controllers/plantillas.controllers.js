// ============================================================================
// PLANTILLAS DE TAREAS · «CREAR PLANTILLAS DE TAREAS»
// ----------------------------------------------------------------------------
// El trabajo de la oficina se repite —dar de alta un cliente, cerrar un F29,
// armar la carpeta de renta— y hasta ahora esos pasos se volvían a escribir a
// mano cada vez, con el riesgo de que se olvidara alguno. Una plantilla guarda
// la estructura una vez y la vuelca en un clic.
//
// DOS DECISIONES QUE EXPLICAN EL RESTO DEL ARCHIVO
//
// 1. La plantilla guarda un PLAZO EN DÍAS, no una fecha. Una fecha fija
//    envejece: "vence el 20-08-2026" sirve un mes y después miente. "12 días"
//    sirve siempre, y la fecha se calcula el día que se usa.
//
// 2. Lo que manda quien usa la plantilla GANA sobre lo que ella guarda. La
//    plantilla propone; si no fuera así habría que crear la tarea y corregirle
//    el responsable y la fecha a mano, que es el trabajo que venía a evitar.
//
// Aislamiento: todo filtra por organización, como el resto del sistema.
// ============================================================================
import { pool } from '../database/db.js';
import { registrar } from '../utils/bitacora.js';
import { notificarA } from '../utils/notificaciones.js';
import { tareaEnOrg, tareaCompleta, PRIORIDADES } from './crm.controllers.js';

const mapPlantilla = (p) => ({
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    // El título va TAL CUAL está guardado, sin caer al nombre de la plantilla.
    //
    // Antes acá decía `p.titulo || p.nombre`, y como el formulario nunca ofreció
    // dónde escribir un título, en la práctica era SIEMPRE el nombre: la
    // plantilla «Alta de cliente nuevo» creaba una tarea llamada «Alta de
    // cliente nuevo», y con tres clientes quedaban tres tareas idénticas
    // imposibles de distinguir en la lista.
    //
    // Son dos cosas distintas: el nombre identifica la plantilla en el
    // administrador, el título es cómo se llamará la tarea. Devolver `null`
    // permite que la pantalla sepa que no hay título sugerido y deje que la
    // persona lo escriba.
    titulo: p.titulo || null,
    detalle: p.detalle,
    prioridad: p.prioridad,
    diasPlazo: p.dias_plazo,
    proyectoId: p.proyecto_id,
    proyectoNombre: p.proyecto_nombre || null,
    responsableId: p.responsable_id,
    responsableNombre: p.responsable_nombre || null,
    visibilidad: p.visibilidad,
    vecesUsada: p.veces_usada ?? 0,
    usadaAt: p.usada_at,
    pasos: p.pasos || [],
});

// Guarda los pasos de una plantilla. Se reemplazan enteros: reconciliar paso a
// paso no aporta nada acá y complica el guardado.
const setPasos = async (plantillaId, pasos) => {
    await pool.query(`DELETE FROM tarea_plantilla_item WHERE plantilla_id = $1`, [plantillaId]);
    if (!Array.isArray(pasos) || pasos.length === 0) return;
    let orden = 0;
    for (const paso of pasos) {
        const titulo = (typeof paso === 'string' ? paso : paso?.titulo || '').trim();
        if (!titulo) continue;   // un paso sin nombre no se puede mostrar
        const dias = Number.isInteger(paso?.diasPlazo) && paso.diasPlazo >= 0 ? paso.diasPlazo : null;
        await pool.query(
            `INSERT INTO tarea_plantilla_item (plantilla_id, titulo, detalle, dias_plazo, orden)
             VALUES ($1,$2,$3,$4,$5)`,
            [plantillaId, titulo.slice(0, 200), paso?.detalle?.trim() || null, dias, orden++]
        );
    }
};

// Fecha a partir de un plazo en días. Se fija a las 18:00 —fin de la jornada—
// en vez de la hora exacta en que se usó: "vence el jueves a las 14:37" es una
// precisión que nadie pidió y que hace ver tareas vencidas a media tarde.
const desdeDias = (d) => {
    if (!Number.isInteger(d)) return null;
    const f = new Date();
    f.setDate(f.getDate() + d);
    f.setHours(18, 0, 0, 0);
    return f.toISOString();
};

// ----------------------------------------------------------------------------
// LISTAR
// ----------------------------------------------------------------------------
export const listarPlantillas = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT p.*, pr.nombre AS proyecto_nombre, u.nombre AS responsable_nombre,
                    COALESCE((SELECT json_agg(json_build_object(
                                  'id', i.id, 'titulo', i.titulo, 'detalle', i.detalle, 'diasPlazo', i.dias_plazo)
                                  ORDER BY i.orden)
                              FROM tarea_plantilla_item i WHERE i.plantilla_id = p.id), '[]') AS pasos
               FROM tarea_plantilla p
               LEFT JOIN proyecto pr ON pr.id = p.proyecto_id
               LEFT JOIN usuario  u  ON u.id  = p.responsable_id
              WHERE p.organizacion_id IS NOT DISTINCT FROM $1::uuid
              ORDER BY p.veces_usada DESC, LOWER(p.nombre) ASC`,
            [req.user?.organizacionId || null]
        );
        return res.json({ success: true, plantillas: rows.map(mapPlantilla) });
    } catch (error) {
        console.error('❌ Error listando plantillas:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudieron cargar las plantillas.' });
    }
};

// ----------------------------------------------------------------------------
// CREAR · desde cero, o copiando una tarea que ya existe
// ----------------------------------------------------------------------------
export const crearPlantilla = async (req, res) => {
    try {
        const { nombre, descripcion, titulo, detalle, prioridad, diasPlazo,
                proyectoId, responsableId, visibilidad, pasos, desdeTareaId } = req.body;
        const org = req.user?.organizacionId || null;

        // "Guardar como plantilla" desde una tarea real, con sus subtareas. Es
        // el camino natural: la primera vez se arma la tarea a mano y recién
        // ahí se ve que va a repetirse.
        if (desdeTareaId) {
            if (!await tareaEnOrg(desdeTareaId, org)) {
                return res.status(404).json({ success: false, message: 'Tarea no encontrada.' });
            }
            const { rows: t } = await pool.query(`SELECT * FROM tarea WHERE id = $1`, [desdeTareaId]);
            const { rows: subs } = await pool.query(
                `SELECT titulo, descripcion FROM tarea WHERE parent_id = $1 ORDER BY created_at ASC`, [desdeTareaId]);
            const base = t[0];
            const nom = (nombre || base.titulo || '').trim();
            if (!nom) return res.status(400).json({ success: false, message: 'Falta el nombre de la plantilla.' });

            // El plazo sale de cuánto duró la tarea original: la distancia entre
            // cuándo se creó y cuándo vencía. Así conserva "esto toma N días".
            let dias = null;
            if (base.vence_at && base.created_at) {
                const d = Math.round((new Date(base.vence_at) - new Date(base.created_at)) / 86400000);
                if (d >= 0) dias = d;
            }
            const { rows: ins } = await pool.query(
                `INSERT INTO tarea_plantilla
                    (organizacion_id, nombre, descripcion, titulo, detalle, prioridad, dias_plazo,
                     proyecto_id, responsable_id, visibilidad, creado_por)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
                [org, nom.slice(0, 120), descripcion?.trim() || null, base.titulo, base.descripcion,
                 base.prioridad || 'media', dias, base.proyecto_id, base.responsable_id,
                 base.visibilidad || 'proyecto', req.user?.usuarioId || null]
            );
            await setPasos(ins[0].id, subs.map(s => ({ titulo: s.titulo, detalle: s.descripcion })));
            await registrar(req, {
                modulo: 'tareas', accion: 'crear', entidad: 'plantilla', entidadId: ins[0].id,
                descripcion: `Guardó como plantilla: ${nom}`,
            });
            return res.status(201).json({ success: true, plantillaId: ins[0].id, pasos: subs.length });
        }

        if (!nombre?.trim()) return res.status(400).json({ success: false, message: 'Falta el nombre de la plantilla.' });

        const dias = Number.isInteger(diasPlazo) && diasPlazo >= 0 ? diasPlazo : null;
        const { rows } = await pool.query(
            `INSERT INTO tarea_plantilla
                (organizacion_id, nombre, descripcion, titulo, detalle, prioridad, dias_plazo,
                 proyecto_id, responsable_id, visibilidad, creado_por)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
            [org, nombre.trim().slice(0, 120), descripcion?.trim() || null,
             titulo?.trim()?.slice(0, 200) || null, detalle?.trim() || null,
             PRIORIDADES.includes(prioridad) ? prioridad : 'media', dias,
             proyectoId || null, responsableId || null,
             visibilidad === 'privada' ? 'privada' : 'proyecto', req.user?.usuarioId || null]
        );
        await setPasos(rows[0].id, pasos);
        await registrar(req, {
            modulo: 'tareas', accion: 'crear', entidad: 'plantilla', entidadId: rows[0].id,
            descripcion: `Creó la plantilla: ${nombre.trim()}`,
        });
        return res.status(201).json({ success: true, plantillaId: rows[0].id });
    } catch (error) {
        // 23505 = el índice único de nombre. Es un choque, no una falla: hay que
        // decirle a la persona qué pasó, no devolverle un error genérico.
        if (error.code === '23505') {
            return res.status(409).json({ success: false, message: 'Ya existe una plantilla con ese nombre.' });
        }
        console.error('❌ Error creando plantilla:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo crear la plantilla.' });
    }
};

// ----------------------------------------------------------------------------
// ACTUALIZAR
// ----------------------------------------------------------------------------
export const actualizarPlantilla = async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, descripcion, titulo, detalle, prioridad, diasPlazo,
                proyectoId, responsableId, visibilidad, pasos } = req.body;
        const dias = Number.isInteger(diasPlazo) && diasPlazo >= 0 ? diasPlazo : null;

        const { rows } = await pool.query(
            `UPDATE tarea_plantilla SET
                nombre         = COALESCE($3, nombre),
                descripcion    = $4,
                titulo         = $5,
                detalle        = $6,
                prioridad      = COALESCE($7, prioridad),
                dias_plazo     = $8,
                proyecto_id    = $9,
                responsable_id = $10,
                visibilidad    = COALESCE($11, visibilidad)
              WHERE id = $1 AND organizacion_id IS NOT DISTINCT FROM $2::uuid
              RETURNING id`,
            [id, req.user?.organizacionId || null,
             nombre?.trim()?.slice(0, 120) || null, descripcion?.trim() || null,
             titulo?.trim()?.slice(0, 200) || null, detalle?.trim() || null,
             PRIORIDADES.includes(prioridad) ? prioridad : null, dias,
             proyectoId || null, responsableId || null,
             visibilidad === 'privada' || visibilidad === 'proyecto' ? visibilidad : null]
        );
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Plantilla no encontrada.' });

        // Los pasos solo se tocan si vinieron en el cuerpo: un guardado que solo
        // cambia el nombre no puede dejar la plantilla sin pasos.
        if (Object.hasOwn(req.body, 'pasos')) await setPasos(id, pasos);
        return res.json({ success: true });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ success: false, message: 'Ya existe una plantilla con ese nombre.' });
        }
        console.error('❌ Error actualizando plantilla:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo actualizar la plantilla.' });
    }
};

// ----------------------------------------------------------------------------
// ELIMINAR
// ----------------------------------------------------------------------------
export const eliminarPlantilla = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `DELETE FROM tarea_plantilla
              WHERE id = $1 AND organizacion_id IS NOT DISTINCT FROM $2::uuid
              RETURNING nombre`,
            [req.params.id, req.user?.organizacionId || null]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Plantilla no encontrada.' });
        await registrar(req, {
            modulo: 'tareas', accion: 'eliminar', entidad: 'plantilla', entidadId: req.params.id,
            descripcion: `Eliminó la plantilla: ${rows[0].nombre}`,
        });
        // Las tareas ya creadas desde ella NO se tocan: una vez creadas son
        // tareas normales y no dependen de la plantilla que las originó.
        return res.json({ success: true });
    } catch (error) {
        console.error('❌ Error eliminando plantilla:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo eliminar la plantilla.' });
    }
};

// ----------------------------------------------------------------------------
// USAR · crea la tarea y todas sus subtareas de una vez
// ----------------------------------------------------------------------------
export const usarPlantilla = async (req, res) => {
    try {
        const { id } = req.params;
        const org = req.user?.organizacionId || null;

        const { rows: pl } = await pool.query(
            `SELECT * FROM tarea_plantilla WHERE id = $1 AND organizacion_id IS NOT DISTINCT FROM $2::uuid`,
            [id, org]);
        if (pl.length === 0) return res.status(404).json({ success: false, message: 'Plantilla no encontrada.' });
        const p = pl[0];

        const { rows: pasos } = await pool.query(
            `SELECT titulo, detalle, dias_plazo FROM tarea_plantilla_item
              WHERE plantilla_id = $1 ORDER BY orden ASC`, [id]);

        const { titulo, venceAt, responsableId, proyectoId, prioridad, visibilidad } = req.body || {};

        // `!== undefined` y no `||`: mandar responsable en blanco a propósito
        // tiene que poder dejar la tarea sin responsable, y con `||` se colaría
        // el de la plantilla.
        const vence = venceAt !== undefined ? (venceAt || null) : desdeDias(p.dias_plazo);
        const proyFinal = proyectoId !== undefined ? (proyectoId || null) : p.proyecto_id;
        const respFinal = responsableId !== undefined
            ? (responsableId || null)
            : (p.responsable_id || req.user?.usuarioId || null);
        const visFinal = visibilidad === 'privada' ? 'privada'
            : visibilidad === 'proyecto' ? 'proyecto'
            : (p.visibilidad || 'proyecto');

        const { rows: ins } = await pool.query(
            `INSERT INTO tarea
                (organizacion_id, titulo, descripcion, tipo, prioridad, estado,
                 responsable_id, vence_at, origen, creado_por, proyecto_id, visibilidad)
             VALUES ($1,$2,$3,'tarea',$4,'pendiente',$5,$6,'manual',$7,$8,$9) RETURNING id`,
            [org, (titulo?.trim() || p.titulo || p.nombre).slice(0, 200), p.detalle,
             PRIORIDADES.includes(prioridad) ? prioridad : (p.prioridad || 'media'),
             respFinal, vence, req.user?.usuarioId || null, proyFinal, visFinal]
        );
        const tareaId = ins[0].id;

        // Las subtareas heredan proyecto y visibilidad de la principal —la misma
        // regla que al crearlas a mano— y usan su propio plazo si la plantilla
        // lo definió; si no, vencen con la tarea.
        for (const paso of pasos) {
            await pool.query(
                `INSERT INTO tarea
                    (organizacion_id, titulo, descripcion, tipo, prioridad, estado,
                     responsable_id, vence_at, origen, creado_por, proyecto_id, parent_id, visibilidad)
                 VALUES ($1,$2,$3,'tarea',$4,'pendiente',$5,$6,'manual',$7,$8,$9,$10)`,
                [org, paso.titulo, paso.detalle, p.prioridad || 'media', respFinal,
                 Number.isInteger(paso.dias_plazo) ? desdeDias(paso.dias_plazo) : vence,
                 req.user?.usuarioId || null, proyFinal, tareaId, visFinal]
            );
        }

        // Para saber cuáles sirven de verdad: una plantilla que nadie usa en
        // seis meses es ruido en la lista y conviene poder verlo.
        await pool.query(
            `UPDATE tarea_plantilla SET veces_usada = veces_usada + 1, usada_at = NOW() WHERE id = $1`, [id]);

        const full = await tareaCompleta(tareaId);
        await notificarA([full.responsableId], {
            actor: req.user, tipo: 'tarea_asignada',
            titulo: `${req.user?.nombre || 'Alguien'} te asignó: ${full.titulo}`,
            descripcion: pasos.length
                ? `Desde la plantilla «${p.nombre}» · ${pasos.length} subtareas`
                : `Desde la plantilla «${p.nombre}»`,
            entidad: 'tarea', entidadId: tareaId,
        });
        await registrar(req, {
            modulo: 'tareas', accion: 'crear', entidad: 'tarea', entidadId: tareaId,
            descripcion: `Creó una tarea desde la plantilla «${p.nombre}» (${pasos.length} subtareas)`,
        });

        return res.status(201).json({ success: true, tarea: full, subtareas: pasos.length });
    } catch (error) {
        console.error('❌ Error usando plantilla:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo crear la tarea desde la plantilla.' });
    }
};
