import { pool } from '../database/db.js';
import { registrar } from '../utils/bitacora.js';
import { notificar, notificarA, misNotificaciones, contarPendientes, marcarLeidas } from '../utils/notificaciones.js';

// ============================================================
// CRM · Tareas / actividades y métricas del dashboard
// Aislamiento: todo filtra por organización. Un usuario normal ve sus
// tareas (responsable o creador); el Administrador ve las de su equipo.
// ============================================================

const esAdmin = (req) => req.user?.rol === 'Administrador';
const TIPOS = ['tarea', 'reunion', 'llamada', 'whatsapp', 'correo', 'ticket'];
const PRIORIDADES = ['baja', 'media', 'alta', 'critica'];
// Flujo: pendiente → en_proceso → en_revision → completada. 'cancelada' lo corta.
// Archivar NO está acá: es `archivada_at`, un eje aparte (ver la migración
// 2026-07-31_tareas_fase1_modelo.sql). Una tarea archivada conserva su estado.
const ESTADOS = ['pendiente', 'en_proceso', 'en_revision', 'completada', 'cancelada'];
// Los que cuentan como trabajo vivo: lo que aparece por defecto y lo que suma
// al avance de un proyecto. 'en_revision' cuenta como activa (todavía no está
// dada por buena), y 'cancelada' no cuenta para ningún lado.
const ESTADOS_ACTIVOS = ['pendiente', 'en_proceso', 'en_revision'];

// Orden de la lista: primero lo vivo, después lo cerrado; dentro de eso, por
// fecha de entrega y por prioridad. Se repite en varias consultas.
const ORDEN_TAREAS = `
    CASE t.estado WHEN 'pendiente' THEN 0 WHEN 'en_proceso' THEN 1 WHEN 'en_revision' THEN 2 ELSE 3 END,
    t.vence_at ASC NULLS LAST,
    CASE t.prioridad WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END`;

// ---------------------------------------------------------------------------
// ÁMBITO DE UNA CONSULTA DE TAREAS · las tres secciones del módulo
//
//   todas   Las tareas en las que participo: soy responsable, colaboro, o la creé.
//   mias    Solo lo que tengo encima: responsable o colaborador. Deja fuera lo
//           que creé y le asigné a otro — eso es trabajo suyo, no mío.
//   equipo  Toda la organización. SOLO Administradores.
//
// La diferencia entre "todas" y "mias" está en `creado_por`, y no es un detalle:
// quien reparte trabajo termina con una lista llena de tareas ajenas si no se
// separan.
//
// Antes ninguno de los dos miraba `tarea_colaborador`: un colaborador no veía
// en su lista las tareas donde lo habían sumado (RF-TA-13 lo pide explícito).
// ---------------------------------------------------------------------------
const AMBITOS = ['todas', 'mias', 'equipo'];

// ---------------------------------------------------------------------------
// QUIÉN PUEDE VER UNA TAREA · el modelo que pidió el negocio el 05-08-2026
//
//   «Al crear un proyecto se debe añadir a los usuarios que uno desee, y todos
//    los usuarios del proyecto pueden ver todas las tareas, a no ser que quien
//    cree la tarea lo configure de otra forma.»
//
// De ahí salen exactamente dos caminos para ver una tarea:
//
//   1. ESTAR METIDO EN ELLA — responsable, quien la creó, o colaborador.
//      Esto manda siempre, incluso si la tarea es privada.
//
//   2. SER INTEGRANTE DE SU PROYECTO, y que la tarea no esté marcada como
//      privada. Ese "salvo que la configure de otra forma" es `visibilidad`.
//
// Ser Administrador ya NO alcanza. Antes veía todos los proyectos de la
// organización; ahora ve los suyos, como todos. El aislamiento por organización
// sigue por encima de esto: son dos candados distintos, no uno.
// ---------------------------------------------------------------------------
const puedeVerTarea = (i) => `(
        t.responsable_id = $${i}
     OR t.creado_por = $${i}
     OR EXISTS (SELECT 1 FROM tarea_colaborador tc WHERE tc.tarea_id = t.id AND tc.usuario_id = $${i})
     OR (t.visibilidad = 'proyecto' AND t.proyecto_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM proyecto_integrante pi
                      WHERE pi.proyecto_id = t.proyecto_id AND pi.usuario_id = $${i}))
    )`;

const condicionAmbito = (ambito, indiceUsuario) => {
    const colabora = `EXISTS (SELECT 1 FROM tarea_colaborador tc WHERE tc.tarea_id = t.id AND tc.usuario_id = $${indiceUsuario})`;
    // "Mías" sigue siendo lo que tengo encima: responsable o colaborador. No
    // incluye lo que solo veo por pertenecer al proyecto.
    if (ambito === 'mias') return `(t.responsable_id = $${indiceUsuario} OR ${colabora})`;
    // "Todas" y "Equipo" son ahora lo mismo: todo lo que puedo ver. Con
    // integrantes por proyecto la distinción dejó de tener sentido — antes
    // "Equipo" significaba "toda la organización", y eso ya no existe.
    return puedeVerTarea(indiceUsuario);
};

// `scope=equipo|mias` era el nombre viejo; se sigue aceptando para no romper
// llamadas existentes (el dashboard del CRM todavía lo usa).
const ambitoPedido = (req) => {
    const crudo = req.query.ambito || req.query.scope || 'todas';
    return AMBITOS.includes(crudo) ? crudo : 'todas';
};

// ------------------------------------------------------------
// LISTAR TAREAS
//   ?estado=  ?tipo=  ?personaId=  ?desde=&hasta= (vence_at)
//   ?ambito=todas|mias|equipo   (equipo solo para administradores)
// ------------------------------------------------------------
export const listarTareas = async (req, res) => {
    try {
        const { estado, tipo, personaId, desde, hasta } = req.query;
        const org = req.user?.organizacionId || null;
        const where = ['t.organizacion_id IS NOT DISTINCT FROM $1::uuid'];
        const params = [org];

        const ambito = ambitoPedido(req);
        // Tercer candado de "Equipo". El menú la esconde y la página rebota, pero
        // el que decide es este: sin él, cualquiera pide ?ambito=equipo y ve todo.
        if (ambito === 'equipo' && !esAdmin(req)) {
            return res.status(403).json({ success: false, message: 'La vista de equipo es solo para administradores.' });
        }
        if (ambito !== 'equipo') {
            params.push(req.user?.usuarioId || null);
            where.push(condicionAmbito(ambito, params.length));
        }
        if (estado && ESTADOS.includes(estado)) { params.push(estado); where.push(`t.estado = $${params.length}`); }
        if (tipo && TIPOS.includes(tipo)) { params.push(tipo); where.push(`t.tipo = $${params.length}`); }
        if (personaId) { params.push(personaId); where.push(`t.persona_id = $${params.length}`); }
        if (desde) { params.push(desde); where.push(`t.vence_at >= $${params.length}::timestamptz`); }
        if (hasta) { params.push(hasta); where.push(`t.vence_at <= $${params.length}::timestamptz`); }

        // ------------------------------------------------------------------
        // BUSCAR Y FILTRAR EN EL SERVIDOR · RF-TA-11, RF-TA-12, RNF-TA-02
        // ------------------------------------------------------------------
        // Antes la pantalla se traía TODAS las tareas y filtraba en el
        // navegador. Con 0 tareas da igual; con 2.000 el navegador se arrastra
        // y encima el usuario espera a que baje todo para ver tres resultados.
        //
        // 'activas' no es un estado: es el atajo de la pantalla para "lo que
        // sigue abierto". Se resuelve acá para que el filtro de la lista y el
        // que usa el resumen de Inicio no puedan discrepar.
        if (req.query.estado === 'activas') where.push(`t.estado = ANY($${params.push(ESTADOS_ACTIVOS)})`);

        if (PRIORIDADES.includes(req.query.prioridad)) {
            params.push(req.query.prioridad); where.push(`t.prioridad = $${params.length}`);
        }
        if (req.query.responsableId) {
            params.push(req.query.responsableId); where.push(`t.responsable_id = $${params.length}`);
        }

        // Texto libre. Busca donde el usuario espera que busque: el nombre de la
        // tarea, su descripción, el responsable y el proyecto. Se escapan los
        // comodines de LIKE para que un guion bajo o un % escrito por el usuario
        // se busquen como texto y no como patrón.
        const q = String(req.query.q || '').trim();
        if (q) {
            params.push(`%${q.replace(/[\\%_]/g, c => '\\' + c)}%`);
            const i = params.length;
            where.push(`(t.titulo ILIKE $${i} OR t.descripcion ILIKE $${i}
                         OR u.nombre ILIKE $${i} OR pr.nombre ILIKE $${i})`);
        }
        // Filtros del módulo de tareas.
        if (req.query.proyectoId) { params.push(req.query.proyectoId); where.push(`t.proyecto_id = $${params.length}`); }
        if (req.query.soloRaiz === '1') where.push(`t.parent_id IS NULL`);

        // ARCHIVADAS · por defecto NO se ven. Se archiva justamente para sacarlas
        // de en medio; si siguieran apareciendo, archivar no serviría de nada.
        //   (sin parámetro) → solo las vivas
        //   ?archivadas=solo    → solo el archivo
        //   ?archivadas=incluir → todo junto
        const arch = req.query.archivadas;
        if (arch === 'solo') where.push(`t.archivada_at IS NOT NULL`);
        else if (arch !== 'incluir') where.push(`t.archivada_at IS NULL`);

        // PAGINACIÓN. Con tope siempre puesto: sin él, el día que haya 5.000
        // tareas una pantalla las pide todas y se lleva el servidor por delante.
        // `COUNT(*) OVER()` devuelve el total sin una segunda consulta.
        const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 100, 1), 500);
        const desplazamiento = Math.max(parseInt(req.query.desplazamiento, 10) || 0, 0);
        params.push(limite, desplazamiento);

        const { rows } = await pool.query(
            `SELECT t.*, u.nombre AS responsable_nombre,
                    (p.nombre || ' ' || COALESCE(p.apellidos,'')) AS persona_nombre,
                    pr.nombre AS proyecto_nombre, pr.color AS proyecto_color,
                    COUNT(*) OVER()::int AS total_filtrado,
                    (SELECT COUNT(*)::int FROM tarea st WHERE st.parent_id = t.id) AS subtareas_total,
                    (SELECT COUNT(*)::int FROM tarea st WHERE st.parent_id = t.id AND st.estado='completada') AS subtareas_hechas,
                    (SELECT COUNT(*)::int FROM tarea_comentario tc WHERE tc.tarea_id = t.id) AS comentarios,
                    COALESCE((SELECT json_agg(json_build_object('id', cu.id, 'nombre', cu.nombre))
                              FROM tarea_colaborador tcol JOIN usuario cu ON cu.id = tcol.usuario_id
                              WHERE tcol.tarea_id = t.id), '[]') AS colaboradores
             FROM tarea t
             LEFT JOIN usuario u ON u.id = t.responsable_id
             LEFT JOIN persona p ON p.id = t.persona_id
             LEFT JOIN proyecto pr ON pr.id = t.proyecto_id
             WHERE ${where.join(' AND ')}
             ORDER BY ${ORDEN_TAREAS}
             LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        );

        const total = rows[0]?.total_filtrado ?? 0;
        return res.json({
            success: true,
            tareas: rows.map(mapTarea),
            total,                                        // cuántas calzan con el filtro
            desplazamiento,
            hayMas: desplazamiento + rows.length < total, // para el botón "ver más"
        });
    } catch (error) {
        console.error('❌ Error listando tareas:', error.message);
        return res.status(500).json({ success: false, message: 'Error al listar tareas.' });
    }
};

const mapTarea = (t) => ({
    id: t.id,
    personaId: t.persona_id,
    personaNombre: (t.persona_nombre || '').trim() || null,
    empresaId: t.empresa_id,
    titulo: t.titulo,
    descripcion: t.descripcion,
    tipo: t.tipo,
    prioridad: t.prioridad,
    estado: t.estado,
    responsableId: t.responsable_id,
    responsableNombre: t.responsable_nombre || null,
    venceAt: t.vence_at,
    origen: t.origen,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    completedAt: t.completed_at,
    // Archivar es un eje aparte del estado: `archivada` sale de la fecha.
    archivada: !!t.archivada_at,
    archivadaAt: t.archivada_at,
    // 'proyecto' = la ven todos los integrantes · 'privada' = solo los involucrados
    visibilidad: t.visibilidad || 'proyecto',
    // Módulo de tareas
    proyectoId: t.proyecto_id,
    proyectoNombre: t.proyecto_nombre || null,
    proyectoColor: t.proyecto_color || null,
    parentId: t.parent_id,
    subtareasTotal: t.subtareas_total ?? 0,
    subtareasHechas: t.subtareas_hechas ?? 0,
    comentarios: t.comentarios ?? 0,
    colaboradores: t.colaboradores || [],
});

// Colaboradores: reemplaza la lista de una tarea.
const setColaboradores = async (tareaId, ids) => {
    if (!Array.isArray(ids)) return;
    await pool.query(`DELETE FROM tarea_colaborador WHERE tarea_id = $1`, [tareaId]);
    for (const uid of [...new Set(ids.filter(Boolean))]) {
        await pool.query(`INSERT INTO tarea_colaborador (tarea_id, usuario_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [tareaId, uid]);
    }
};

// Devuelve una tarea enriquecida (nombres, contadores, colaboradores) por id.
const tareaCompleta = async (id) => {
    const { rows } = await pool.query(
        `SELECT t.*, u.nombre AS responsable_nombre,
                (p.nombre || ' ' || COALESCE(p.apellidos,'')) AS persona_nombre,
                pr.nombre AS proyecto_nombre, pr.color AS proyecto_color,
                (SELECT COUNT(*)::int FROM tarea st WHERE st.parent_id = t.id) AS subtareas_total,
                (SELECT COUNT(*)::int FROM tarea st WHERE st.parent_id = t.id AND st.estado='completada') AS subtareas_hechas,
                (SELECT COUNT(*)::int FROM tarea_comentario tc WHERE tc.tarea_id = t.id) AS comentarios,
                COALESCE((SELECT json_agg(json_build_object('id', cu.id, 'nombre', cu.nombre))
                          FROM tarea_colaborador tcol JOIN usuario cu ON cu.id = tcol.usuario_id
                          WHERE tcol.tarea_id = t.id), '[]') AS colaboradores
         FROM tarea t
         LEFT JOIN usuario u ON u.id = t.responsable_id
         LEFT JOIN persona p ON p.id = t.persona_id
         LEFT JOIN proyecto pr ON pr.id = t.proyecto_id
         WHERE t.id = $1`, [id]);
    return rows[0] ? mapTarea(rows[0]) : null;
};

// ------------------------------------------------------------
// CREAR TAREA
// ------------------------------------------------------------
export const crearTarea = async (req, res) => {
    try {
        const { titulo, descripcion, tipo, prioridad, personaId, empresaId, responsableId, venceAt, origen,
            proyectoId, parentId, colaboradores, estado, visibilidad } = req.body;
        if (!titulo?.trim()) return res.status(400).json({ success: false, message: 'El título es obligatorio.' });

        // Una subtarea pertenece al mismo proyecto que su tarea principal, y no
        // puede colgar de otra subtarea de segundo nivel: dos niveles es el tope.
        // Sin lo primero, la subtarea quedaba «sin proyecto» y no la veía nadie
        // del equipo; sin lo segundo, la pantalla se vuelve ilegible.
        let proyectoFinal = proyectoId || null;
        let padreFinal = parentId || null;
        if (padreFinal) {
            const { rows: padre } = await pool.query(
                `SELECT proyecto_id, parent_id FROM tarea WHERE id = $1
                  AND organizacion_id IS NOT DISTINCT FROM $2::uuid`,
                [padreFinal, req.user?.organizacionId || null]);
            if (!padre.length) return res.status(404).json({ success: false, message: 'La tarea principal no existe.' });
            proyectoFinal = padre[0].proyecto_id || proyectoFinal;
            if (padre[0].parent_id) {
                const { rows: abuelo } = await pool.query(`SELECT parent_id FROM tarea WHERE id = $1`, [padre[0].parent_id]);
                if (abuelo[0]?.parent_id) {
                    return res.status(400).json({
                        success: false,
                        message: 'Se permiten hasta dos niveles de subtareas. Crea esta al mismo nivel.',
                    });
                }
            }
        }

        const { rows } = await pool.query(
            `INSERT INTO tarea
                (organizacion_id, persona_id, empresa_id, titulo, descripcion, tipo, prioridad, estado,
                 responsable_id, vence_at, origen, creado_por, proyecto_id, parent_id, visibilidad)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
            [
                req.user?.organizacionId || null,
                personaId || null, empresaId || null,
                titulo.trim(), descripcion?.trim() || null,
                TIPOS.includes(tipo) ? tipo : 'tarea',
                PRIORIDADES.includes(prioridad) ? prioridad : 'media',
                ESTADOS.includes(estado) ? estado : 'pendiente',
                responsableId || req.user?.usuarioId || null,
                venceAt || null,
                origen === 'ia' ? 'ia' : 'manual',
                req.user?.usuarioId || null,
                proyectoFinal,
                padreFinal,
                visibilidad === 'privada' ? 'privada' : 'proyecto',
            ]
        );
        const nuevaId = rows[0].id;
        if (Array.isArray(colaboradores)) await setColaboradores(nuevaId, colaboradores);
        // Devuelve la tarea ya enriquecida (con nombres, contadores, colaboradores).
        const full = await tareaCompleta(nuevaId);

        // Avisar a quien le tocó el trabajo. Sin esto, la persona se entera
        // cuando abre la pantalla — y la pantalla no se abre sola.
        await notificarA(
            [full.responsableId, ...(colaboradores || [])],
            {
                actor: req.user, tipo: 'tarea_asignada',
                titulo: `${req.user?.nombre || 'Alguien'} te asignó: ${full.titulo}`,
                descripcion: full.proyectoNombre ? `En el proyecto ${full.proyectoNombre}` : null,
                entidad: 'tarea', entidadId: nuevaId,
            }
        );

        return res.status(201).json({ success: true, tarea: full });
    } catch (error) {
        console.error('❌ Error creando tarea:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo crear la tarea.' });
    }
};

// ------------------------------------------------------------
// ACTUALIZAR / COMPLETAR / CANCELAR TAREA
// ------------------------------------------------------------
export const actualizarTarea = async (req, res) => {
    try {
        const { id } = req.params;
        const org = req.user?.organizacionId || null;
        // Debe pertenecer a la organización del usuario.
        // Se guarda el responsable anterior para saber si CAMBIÓ, y avisar solo
        // en ese caso.
        const chk = await pool.query(
            `SELECT id, responsable_id FROM tarea WHERE id = $1 AND organizacion_id IS NOT DISTINCT FROM $2::uuid`, [id, org]);
        if (chk.rows.length === 0) return res.status(404).json({ success: false, message: 'Tarea no encontrada.' });
        const antes = chk.rows[0];

        const { titulo, descripcion, tipo, prioridad, estado, responsableId, venceAt, proyectoId,
                colaboradores, visibilidad } = req.body;
        const completedAt = estado === 'completada' ? 'NOW()' : (estado ? 'NULL' : 'completed_at');
        // La descripción necesita poder BORRARSE, no solo cambiarse: con COALESCE
        // nunca se podía dejar en blanco. Vale para tareas y subtareas por igual.
        const tocaDescripcion = Object.hasOwn(req.body, 'descripcion');
        await pool.query(
            `UPDATE tarea SET
                titulo = COALESCE($2, titulo),
                descripcion = CASE WHEN $3::boolean THEN $4 ELSE descripcion END,
                tipo = COALESCE($5, tipo),
                prioridad = COALESCE($6, prioridad),
                estado = COALESCE($7, estado),
                responsable_id = COALESCE($8, responsable_id),
                vence_at = COALESCE($9, vence_at),
                proyecto_id = COALESCE($10, proyecto_id),
                visibilidad = COALESCE($11, visibilidad),
                completed_at = ${completedAt}
             WHERE id = $1`,
            [
                id, titulo?.trim() || null,
                tocaDescripcion, descripcion?.trim() || null,
                (tipo && TIPOS.includes(tipo)) ? tipo : null,
                (prioridad && PRIORIDADES.includes(prioridad)) ? prioridad : null,
                (estado && ESTADOS.includes(estado)) ? estado : null,
                responsableId || null, venceAt || null, proyectoId || null,
                ['proyecto', 'privada'].includes(visibilidad) ? visibilidad : null,
            ]
        );
        if (Array.isArray(colaboradores)) await setColaboradores(id, colaboradores);

        const actualizada = await tareaCompleta(id);
        // Solo se avisa si el responsable CAMBIÓ. Si no, cada vez que alguien
        // corrige una fecha le llegaría un aviso a la misma persona.
        if (responsableId && responsableId !== antes?.responsable_id) {
            await notificar({
                para: responsableId, actor: req.user, tipo: 'tarea_asignada',
                titulo: `${req.user?.nombre || 'Alguien'} te pasó: ${actualizada.titulo}`,
                descripcion: actualizada.proyectoNombre ? `En el proyecto ${actualizada.proyectoNombre}` : null,
                entidad: 'tarea', entidadId: id,
            });
        }

        return res.json({ success: true, tarea: actualizada });
    } catch (error) {
        console.error('❌ Error actualizando tarea:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo actualizar la tarea.' });
    }
};

// ------------------------------------------------------------
// ARCHIVAR / DESARCHIVAR UNA TAREA · RF-TA-17
// ------------------------------------------------------------
// Archivar NO es borrar y no es un estado: es sacar la tarea de la vista
// conservando todo —estado, comentarios, archivos, subtareas—. Al desarchivar
// vuelve exactamente como estaba, porque el estado nunca se tocó.
//
// Las subtareas siguen a su tarea principal: archivar el padre y dejar los
// hijos sueltos dejaría huérfanos flotando en la lista.
// ------------------------------------------------------------
export const archivarTarea = async (req, res) => {
    try {
        const { id } = req.params;
        const org = req.user?.organizacionId || null;
        const archivar = req.body?.archivar !== false;   // por defecto, archiva

        const { rows } = await pool.query(
            `UPDATE tarea
                SET archivada_at  = CASE WHEN $2::boolean THEN NOW() ELSE NULL END,
                    archivada_por = CASE WHEN $2::boolean THEN $3::uuid ELSE NULL END
              WHERE (id = $1 OR parent_id = $1)
                AND organizacion_id IS NOT DISTINCT FROM $4::uuid
              RETURNING id, parent_id`,
            [id, archivar, req.user?.usuarioId || null, org]
        );
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Tarea no encontrada.' });

        const subtareas = rows.filter(r => r.parent_id).length;
        await registrar(req, {
            modulo: 'tareas',
            accion: archivar ? 'archivar' : 'desarchivar',
            entidad: 'tarea', entidadId: id,
            descripcion: `${archivar ? 'Archivó' : 'Desarchivó'} una tarea${subtareas ? ` y sus ${subtareas} subtareas` : ''}`,
        });

        return res.json({ success: true, archivada: archivar, subtareas, tarea: await tareaCompleta(id) });
    } catch (error) {
        console.error('❌ Error archivando tarea:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo archivar la tarea.' });
    }
};

export const eliminarTarea = async (req, res) => {
    try {
        const { id } = req.params;
        const org = req.user?.organizacionId || null;
        const r = await pool.query(`DELETE FROM tarea WHERE id = $1 AND organizacion_id IS NOT DISTINCT FROM $2::uuid RETURNING id`, [id, org]);
        if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Tarea no encontrada.' });
        return res.json({ success: true });
    } catch (error) {
        console.error('❌ Error eliminando tarea:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo eliminar la tarea.' });
    }
};

// Limpiar (borrar definitivamente) las tareas ya completadas.
// Respeta el alcance: un usuario normal solo borra las suyas; el admin puede
// borrar las del equipo o solo las suyas con ?scope=mias.
export const eliminarTareasCompletadas = async (req, res) => {
    try {
        const org = req.user?.organizacionId || null;
        const uid = req.user?.usuarioId || null;
        const soloMias = !esAdmin(req) || req.query.scope === 'mias';
        const scope = soloMias ? ' AND (responsable_id = $2 OR creado_por = $2) ' : '';
        const params = soloMias ? [org, uid] : [org];
        const r = await pool.query(
            `DELETE FROM tarea
             WHERE organizacion_id IS NOT DISTINCT FROM $1::uuid AND estado = 'completada' ${scope}
             RETURNING id`, params);
        return res.json({ success: true, eliminadas: r.rows.length });
    } catch (error) {
        console.error('❌ Error limpiando tareas completadas:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudieron limpiar las tareas.' });
    }
};

// ============================================================
// NOTIFICACIONES · la campana del encabezado
// ============================================================
export const listarNotificaciones = async (req, res) => {
    try {
        const uid = req.user?.usuarioId;
        if (!uid) return res.json({ success: true, notificaciones: [], pendientes: 0 });
        const [lista, pendientes] = await Promise.all([
            misNotificaciones(uid, { soloPendientes: req.query.pendientes === '1' }),
            contarPendientes(uid),
        ]);
        return res.json({
            success: true,
            pendientes,
            notificaciones: lista.map(n => ({
                id: n.id, tipo: n.tipo, titulo: n.titulo, descripcion: n.descripcion,
                entidad: n.entidad, entidadId: n.entidad_id, actor: n.actor_nombre,
                leida: !!n.leida_at, fecha: n.created_at,
            })),
        });
    } catch (error) {
        console.error('❌ Error listando notificaciones:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudieron cargar los avisos.' });
    }
};

export const marcarNotificaciones = async (req, res) => {
    try {
        // Sin id se marcan todas: es el "marcar todo como leído" de la campana.
        const n = await marcarLeidas(req.user?.usuarioId, req.params.id || null);
        return res.json({ success: true, marcadas: n, pendientes: await contarPendientes(req.user?.usuarioId) });
    } catch (error) {
        console.error('❌ Error marcando notificaciones:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo marcar.' });
    }
};

// ============================================================
// INICIO DEL MÓDULO · el resumen del día
// ------------------------------------------------------------
// Es la pantalla que más se va a abrir, así que la regla es no hacerla cara:
//
//   · Los seis conteos salen de UNA consulta con COUNT(*) FILTER, no de seis
//     viajes a la base. Con seis, la pantalla tarda seis veces más y encima
//     puede mostrar números de momentos distintos.
//   · Las listas salen de OTRA consulta, una sola, que marca cada tarea con el
//     grupo al que pertenece en vez de repetir la consulta por grupo.
//
// Son dos viajes en total, y van en paralelo.
// ============================================================
const DIAS_PROXIMAS = 7;   // qué se considera "próxima a vencer"
const DIAS_RECIENTES = 7;  // cuánto dura algo en "finalizadas recientemente"
const TOPE_LISTA = 8;      // por grupo; la pantalla es un resumen, no un listado

// ATRASADA se compara por DÍA, no por instante. Con `vence_at < NOW()`, una
// tarea que vence hoy a las 09:00 pasaba a contarse como atrasada a las 09:01 y
// aparecía a la vez en "Atrasadas" y en "Vencen hoy": el mismo trabajo sumado
// dos veces, y la sensación de ir atrasado apenas empieza el día.
// Con el corte por día los dos grupos quedan separados: hoy es hoy, atrasado es
// de ayer para atrás.
const ATRASADA = `t.vence_at::date < CURRENT_DATE`;

export const resumenInicio = async (req, res) => {
    try {
        const org = req.user?.organizacionId || null;
        const uid = req.user?.usuarioId || null;
        const ambito = ambitoPedido(req);
        if (ambito === 'equipo' && !esAdmin(req)) {
            return res.status(403).json({ success: false, message: 'La vista de equipo es solo para administradores.' });
        }

        // Los parámetros se arman según el ámbito, no con posiciones fijas. En
        // "equipo" no se filtra por usuario, así que ese parámetro NO se manda:
        // si se mandara sin aparecer en el SQL, Postgres no puede deducir su
        // tipo y la consulta falla entera con "could not determine data type".
        const params = [org];
        let alcance = '';
        if (ambito !== 'equipo') {
            params.push(uid);
            alcance = ` AND ${condicionAmbito(ambito, params.length)}`;
        }
        params.push(ESTADOS_ACTIVOS);
        const activa = `t.estado = ANY($${params.length})`;

        const base = `FROM tarea t
                      WHERE t.organizacion_id IS NOT DISTINCT FROM $1::uuid
                        AND t.archivada_at IS NULL
                        AND t.parent_id IS NULL ${alcance}`;

        const [conteos, listas] = await Promise.all([
            pool.query(
                `SELECT
                    COUNT(*) FILTER (WHERE ${activa})::int AS activas,
                    COUNT(*) FILTER (WHERE ${activa} AND ${ATRASADA})::int AS vencidas,
                    COUNT(*) FILTER (WHERE ${activa} AND t.vence_at::date = CURRENT_DATE)::int AS vencen_hoy,
                    COUNT(*) FILTER (WHERE ${activa} AND t.vence_at::date >= CURRENT_DATE
                        AND t.vence_at <= NOW() + INTERVAL '${DIAS_PROXIMAS} days')::int AS proximas,
                    COUNT(*) FILTER (WHERE t.estado = 'completada'
                        AND t.completed_at >= NOW() - INTERVAL '${DIAS_RECIENTES} days')::int AS recientes,
                    COUNT(*) FILTER (WHERE ${activa} AND t.prioridad = 'critica')::int AS criticas
                 ${base}`, params),

            // Un solo viaje para las tres listas. `grupo` decide dónde se dibuja
            // cada una; el ORDER las deja listas para pintar sin reordenar.
            pool.query(
                `SELECT * FROM (
                    SELECT t.*, u.nombre AS responsable_nombre,
                           pr.nombre AS proyecto_nombre, pr.color AS proyecto_color,
                           NULL AS persona_nombre, 0 AS subtareas_total, 0 AS subtareas_hechas,
                           0 AS comentarios, '[]'::json AS colaboradores,
                           CASE
                             WHEN t.estado = 'completada' THEN 'reciente'
                             WHEN ${ATRASADA} THEN 'vencida'
                             ELSE 'proxima'
                           END AS grupo,
                           ROW_NUMBER() OVER (
                             PARTITION BY CASE
                               WHEN t.estado = 'completada' THEN 'reciente'
                               WHEN ${ATRASADA} THEN 'vencida'
                               ELSE 'proxima' END
                             ORDER BY
                               CASE WHEN t.estado = 'completada' THEN t.completed_at END DESC,
                               t.vence_at ASC
                           ) AS n
                    FROM tarea t
                    LEFT JOIN usuario u ON u.id = t.responsable_id
                    LEFT JOIN proyecto pr ON pr.id = t.proyecto_id
                    WHERE t.organizacion_id IS NOT DISTINCT FROM $1::uuid
                      AND t.archivada_at IS NULL
                      AND t.parent_id IS NULL ${alcance}
                      AND (
                        (${activa} AND t.vence_at IS NOT NULL
                         AND t.vence_at <= NOW() + INTERVAL '${DIAS_PROXIMAS} days')
                        OR (t.estado = 'completada'
                            AND t.completed_at >= NOW() - INTERVAL '${DIAS_RECIENTES} days')
                      )
                 ) q WHERE q.n <= ${TOPE_LISTA}`, params),
        ]);

        const porGrupo = (g) => listas.rows.filter(r => r.grupo === g).map(mapTarea);

        return res.json({
            success: true,
            resumen: { ...conteos.rows[0], diasProximas: DIAS_PROXIMAS, diasRecientes: DIAS_RECIENTES },
            vencidas: porGrupo('vencida'),
            proximas: porGrupo('proxima'),
            recientes: porGrupo('reciente'),
        });
    } catch (error) {
        console.error('❌ Error en el resumen de inicio:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo cargar el resumen.' });
    }
};

// ------------------------------------------------------------
// MÉTRICAS DEL DASHBOARD
//   ventas del mes (cobrado), meta mensual, avance %, tasa de conversión,
//   conteos de prospectos/activos y de tareas.
// ------------------------------------------------------------
// Rango [desde, hasta] del filtro de período (hoy/semana/mes/año/personalizado).
const rangoPeriodo = (periodo, desde, hasta) => {
    const now = new Date();
    const fin = new Date(now);
    let ini;
    switch (periodo) {
        case 'hoy': ini = new Date(now); ini.setHours(0, 0, 0, 0); break;
        case 'semana': ini = new Date(now); ini.setDate(ini.getDate() - 7); break;
        case 'anio': ini = new Date(now.getFullYear(), 0, 1); break;
        case 'custom':
            ini = desde ? new Date(desde) : new Date(now.getFullYear(), now.getMonth(), 1);
            return { desde: ini.toISOString(), hasta: (hasta ? new Date(hasta) : fin).toISOString(), label: 'personalizado' };
        default: ini = new Date(now.getFullYear(), now.getMonth(), 1); // mes
    }
    return { desde: ini.toISOString(), hasta: fin.toISOString(), label: periodo || 'mes' };
};

export const metricasDashboard = async (req, res) => {
    try {
        const org = req.user?.organizacionId || null;
        const uid = req.user?.usuarioId || null;
        // Un usuario normal siempre ve solo lo suyo. El admin puede alternar
        // entre su cartera ("mias") y la del equipo (RF-008).
        const soloMias = !esAdmin(req) || req.query.scope === 'mias';
        const { periodo = 'mes', desde: qDesde, hasta: qHasta } = req.query;
        const seguimientoDias = Math.max(1, parseInt(req.query.seguimientoDias, 10) || 15);
        const { desde, hasta, label } = rangoPeriodo(periodo, qDesde, qHasta);

        // Fragmentos de alcance (cartera propia salvo admin en modo equipo).
        const pScope = soloMias ? ' AND (p.creado_por = $2 OR p.ejecutivo_id = $2) ' : '';
        const tScope = soloMias ? ' AND (responsable_id = $2 OR creado_por = $2) ' : '';
        const pParams = soloMias ? [org, uid] : [org];

        const [
            cobrosRes, serieRes, metaRes, convRes, nuevosRes,
            tareasRes, pipelineRes, seguimientoRes, actividadRes, rankingRes
        ] = await Promise.all([
            // Indicadores de dinero (nivel firma / organización). RF-001, RF-007, RF-013
            pool.query(
                `SELECT
                    COALESCE(SUM(COALESCE(monto_facturado,monto_esperado)) FILTER (WHERE periodo=date_trunc('month',CURRENT_DATE)::date AND estado='PAGADA'),0)::float AS ventas_mes,
                    COALESCE(SUM(monto_esperado) FILTER (WHERE periodo=date_trunc('month',CURRENT_DATE)::date AND estado IN ('POR_EMITIR','PENDIENTE_PAGO')),0)::float AS ingresos_esperados,
                    COUNT(*) FILTER (WHERE estado='PENDIENTE_PAGO')::int AS facturas_pendientes,
                    COUNT(*) FILTER (WHERE estado='PENDIENTE_PAGO' AND fecha_vencimiento < CURRENT_DATE)::int AS cobros_vencidos,
                    COALESCE(SUM(COALESCE(monto_facturado,monto_esperado)) FILTER (WHERE fecha_pago::date = CURRENT_DATE AND estado='PAGADA'),0)::float AS cobrado_hoy
                 FROM cobro_mensual WHERE organizacion_id IS NOT DISTINCT FROM $1::uuid`, [org]),
            pool.query(
                `SELECT to_char(periodo,'YYYY-MM') AS mes,
                        COALESCE(SUM(COALESCE(monto_facturado,monto_esperado)) FILTER (WHERE estado='PAGADA'),0)::float AS recaudado
                 FROM cobro_mensual
                 WHERE organizacion_id IS NOT DISTINCT FROM $1::uuid
                   AND periodo >= (date_trunc('month',CURRENT_DATE) - INTERVAL '5 months')::date
                 GROUP BY periodo ORDER BY periodo`, [org]),
            pool.query(`SELECT meta_mensual FROM crm_config WHERE organizacion_id IS NOT DISTINCT FROM $1::uuid`, [org]),
            // Conteos de personas + clientes activos (empresas). RF-001, RF-013
            pool.query(
                `SELECT
                    COUNT(*) FILTER (WHERE p.estado='prospecto')::int AS prospectos,
                    COUNT(*) FILTER (WHERE p.estado='activo')::int AS activos,
                    COUNT(*) FILTER (WHERE p.estado='inactivo')::int AS inactivos,
                    COUNT(*)::int AS total,
                    (SELECT COUNT(*)::int FROM empresa e WHERE e.activo AND e.en_cartera IS NOT FALSE AND e.organizacion_id IS NOT DISTINCT FROM $1::uuid) AS clientes_activos
                 FROM persona p WHERE p.activo AND p.organizacion_id IS NOT DISTINCT FROM $1::uuid ${pScope}`, pParams),
            // Prospectos nuevos en el período. RF-013
            pool.query(
                `SELECT COUNT(*)::int AS n FROM persona p
                 WHERE p.activo AND p.organizacion_id IS NOT DISTINCT FROM $1::uuid ${pScope}
                   AND p.created_at >= $${soloMias ? 3 : 2}::timestamptz AND p.created_at <= $${soloMias ? 4 : 3}::timestamptz`,
                soloMias ? [org, uid, desde, hasta] : [org, desde, hasta]),
            // Tareas: pendientes, vencidas, completadas/reuniones en período, reuniones de hoy. RF-003/004/017
            // "Pendiente" acá significa "sin terminar", no el estado literal: con
            // los estados nuevos, una tarea en proceso o en revisión seguía sin
            // contarse en ningún lado y el tablero mostraba menos trabajo del real.
            // Las archivadas no cuentan: se archivan justamente para sacarlas.
            pool.query(
                `SELECT
                    COUNT(*) FILTER (WHERE estado = ANY($${soloMias ? 4 : 3}))::int AS pendientes,
                    COUNT(*) FILTER (WHERE estado = ANY($${soloMias ? 4 : 3}) AND vence_at < NOW())::int AS vencidas,
                    COUNT(*) FILTER (WHERE estado='completada' AND completed_at >= $${soloMias ? 3 : 2}::timestamptz)::int AS completadas,
                    COUNT(*) FILTER (WHERE tipo='reunion' AND estado='completada' AND completed_at >= $${soloMias ? 3 : 2}::timestamptz)::int AS reuniones_realizadas,
                    COUNT(*) FILTER (WHERE tipo='reunion' AND estado = ANY($${soloMias ? 4 : 3}) AND vence_at::date = CURRENT_DATE)::int AS reuniones_hoy,
                    COUNT(*) FILTER (WHERE estado = ANY($${soloMias ? 4 : 3}) AND vence_at::date = CURRENT_DATE)::int AS vencen_hoy
                 FROM tarea
                 WHERE organizacion_id IS NOT DISTINCT FROM $1::uuid AND archivada_at IS NULL ${tScope}`,
                soloMias ? [org, uid, desde, ESTADOS_ACTIVOS] : [org, desde, ESTADOS_ACTIVOS]),
            // Pipeline comercial (embudo). RF-014
            pool.query(
                `SELECT
                    COUNT(*) FILTER (WHERE p.estado='prospecto' AND (p.estado_comercial IS NULL OR p.estado_comercial='' OR p.estado_comercial ILIKE '%nuevo%'))::int AS prospectos,
                    COUNT(*) FILTER (WHERE p.estado_comercial ILIKE '%contact%' OR p.estado_comercial ILIKE '%esperando%')::int AS contactados,
                    COUNT(*) FILTER (WHERE p.estado_comercial ILIKE '%cotiz%' OR p.estado_comercial ILIKE '%propuesta%')::int AS cotizaciones,
                    COUNT(*) FILTER (WHERE p.estado_comercial ILIKE '%negoci%' OR p.estado_comercial ILIKE '%pens%' OR p.estado_comercial ILIKE '%reuni%')::int AS negociaciones,
                    COUNT(*) FILTER (WHERE p.estado='activo' OR p.estado_comercial ILIKE '%ganad%')::int AS ganados,
                    COUNT(*) FILTER (WHERE p.estado='perdido' OR p.estado_comercial ILIKE '%perdid%')::int AS perdidos
                 FROM persona p WHERE p.activo AND p.organizacion_id IS NOT DISTINCT FROM $1::uuid ${pScope}`, pParams),
            // Seguimiento comercial: prospectos sin contacto en N días. RF-015
            pool.query(
                `SELECT COUNT(*)::int AS n FROM persona p
                 WHERE p.activo AND p.estado='prospecto' AND p.organizacion_id IS NOT DISTINCT FROM $1::uuid ${pScope}
                   AND (p.fecha_ultimo_contacto IS NULL OR p.fecha_ultimo_contacto < NOW() - ($${soloMias ? 3 : 2} || ' days')::interval)`,
                soloMias ? [org, uid, seguimientoDias] : [org, seguimientoDias]),
            // Actividad reciente (feed unificado). RF-010
            pool.query(
                `(SELECT 'prospecto_nuevo' AS tipo, COALESCE(NULLIF(TRIM(nombre||' '||COALESCE(apellidos,'')),''),'(sin nombre)') AS titulo, created_at AS fecha
                  FROM persona WHERE organizacion_id IS NOT DISTINCT FROM $1::uuid ORDER BY created_at DESC LIMIT 8)
                 UNION ALL
                 (SELECT CASE WHEN tipo='reunion' THEN 'reunion_creada' ELSE 'tarea_creada' END, titulo, created_at
                  FROM tarea WHERE organizacion_id IS NOT DISTINCT FROM $1::uuid ORDER BY created_at DESC LIMIT 8)
                 UNION ALL
                 (SELECT 'tarea_completada', titulo, completed_at
                  FROM tarea WHERE organizacion_id IS NOT DISTINCT FROM $1::uuid AND estado='completada' AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 8)
                 UNION ALL
                 (SELECT 'cobro_registrado', e.razon_social, cm.fecha_pago
                  FROM cobro_mensual cm JOIN empresa e ON e.id=cm.empresa_id
                  WHERE cm.organizacion_id IS NOT DISTINCT FROM $1::uuid AND cm.estado='PAGADA' AND cm.fecha_pago IS NOT NULL ORDER BY cm.fecha_pago DESC LIMIT 8)
                 ORDER BY fecha DESC NULLS LAST LIMIT 12`, [org]),
            // Ranking de vendedores (solo admin). RF-016
            esAdmin(req) ? pool.query(
                `SELECT u.nombre,
                        COUNT(p.id)::int AS prospectos,
                        COUNT(p.id) FILTER (WHERE p.estado='activo')::int AS ganados,
                        (SELECT COUNT(*)::int FROM tarea t WHERE t.responsable_id=u.id AND t.estado='completada'
                          AND t.completed_at >= date_trunc('month',CURRENT_DATE)) AS tareas_mes
                 FROM usuario u
                 LEFT JOIN persona p ON (p.creado_por=u.id OR p.ejecutivo_id=u.id) AND p.activo AND p.organizacion_id IS NOT DISTINCT FROM $1::uuid
                 WHERE u.activo AND u.organizacion_id IS NOT DISTINCT FROM $1::uuid
                 GROUP BY u.id, u.nombre
                 ORDER BY ganados DESC, prospectos DESC LIMIT 8`, [org])
                : Promise.resolve({ rows: [] }),
        ]);

        const money = cobrosRes.rows[0];
        const meta = Number(metaRes.rows[0]?.meta_mensual) || 0;
        const c = convRes.rows[0];
        const t = tareasRes.rows[0];
        const pl = pipelineRes.rows[0];
        const ventasMes = money.ventas_mes || 0;
        const tasaConversion = c.total > 0 ? Math.round((c.activos / c.total) * 100) : 0;

        return res.json({
            success: true,
            metricas: {
                periodo: label, desde, hasta,
                // RF-001
                ventasMes, metaMensual: meta,
                avance: meta > 0 ? Math.min(100, Math.round((ventasMes / meta) * 100)) : 0,
                tasaConversion,
                // conteos personas + RF-013
                prospectos: c.prospectos, activos: c.activos, inactivos: c.inactivos, totalPersonas: c.total,
                clientesActivos: c.clientes_activos,
                prospectosNuevos: nuevosRes.rows[0].n,
                facturasPendientes: money.facturas_pendientes,
                cobrosVencidos: money.cobros_vencidos,
                ingresosEsperados: money.ingresos_esperados,
                cobradoHoy: money.cobrado_hoy,
                // RF-003/004/017
                tareasPendientes: t.pendientes, tareasVencidas: t.vencidas,
                tareasCompletadas: t.completadas, reunionesRealizadas: t.reuniones_realizadas,
                reunionesHoy: t.reuniones_hoy, vencenHoy: t.vencen_hoy,
                // RF-007
                serieRecaudado: serieRes.rows.map(r => ({ mes: r.mes, recaudado: r.recaudado })),
                // RF-014
                pipeline: [
                    { etapa: 'Prospectos', n: pl.prospectos },
                    { etapa: 'Contactados', n: pl.contactados },
                    { etapa: 'Cotizaciones', n: pl.cotizaciones },
                    { etapa: 'Negociaciones', n: pl.negociaciones },
                    { etapa: 'Ganados', n: pl.ganados },
                    { etapa: 'Perdidos', n: pl.perdidos },
                ],
                // RF-015
                sinSeguimiento: seguimientoRes.rows[0].n, sinSeguimientoDias: seguimientoDias,
                // RF-016
                ranking: rankingRes.rows.map(r => ({
                    nombre: r.nombre, prospectos: r.prospectos, ganados: r.ganados,
                    conversion: r.prospectos > 0 ? Math.round((r.ganados / r.prospectos) * 100) : 0,
                    tareasMes: r.tareas_mes,
                })),
                // RF-010
                actividad: actividadRes.rows.map(a => ({ tipo: a.tipo, titulo: a.titulo, fecha: a.fecha })),
            }
        });
    } catch (error) {
        console.error('❌ Error métricas dashboard:', error.message);
        return res.status(500).json({ success: false, message: 'Error al calcular métricas.' });
    }
};

// Guardar la meta mensual (solo administradores).
export const guardarMeta = async (req, res) => {
    try {
        if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'Solo el administrador puede fijar la meta.' });
        const meta = Number(req.body?.metaMensual);
        if (!Number.isFinite(meta) || meta < 0) return res.status(400).json({ success: false, message: 'Meta inválida.' });
        const org = req.user?.organizacionId || null;
        await pool.query(
            `INSERT INTO crm_config (organizacion_id, meta_mensual, updated_at)
             VALUES ($1,$2,NOW())
             ON CONFLICT (organizacion_id) DO UPDATE SET meta_mensual = EXCLUDED.meta_mensual, updated_at = NOW()`,
            [org, meta]
        );
        return res.json({ success: true, metaMensual: meta });
    } catch (error) {
        console.error('❌ Error guardando meta:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo guardar la meta.' });
    }
};

// ============================================================
// MÓDULO DE TAREAS · detalle, subtareas y comentarios
// ============================================================

// Verifica que la tarea sea de la organización del usuario.
const tareaEnOrg = async (id, org) => {
    const { rows } = await pool.query(`SELECT id FROM tarea WHERE id = $1 AND organizacion_id IS NOT DISTINCT FROM $2::uuid`, [id, org]);
    return rows.length > 0;
};

// GET /crm/tareas/:id  → tarea + subtareas + comentarios
export const obtenerTarea = async (req, res) => {
    try {
        const { id } = req.params;
        const org = req.user?.organizacionId || null;
        if (!await tareaEnOrg(id, org)) return res.status(404).json({ success: false, message: 'Tarea no encontrada.' });

        const [tarea, subRes, comRes, adjRes] = await Promise.all([
            tareaCompleta(id),
            pool.query(
                `SELECT t.*, u.nombre AS responsable_nombre, NULL AS persona_nombre, NULL AS proyecto_nombre, NULL AS proyecto_color,
                        0 AS subtareas_total, 0 AS subtareas_hechas, 0 AS comentarios, '[]'::json AS colaboradores
                 FROM tarea t LEFT JOIN usuario u ON u.id = t.responsable_id
                 WHERE t.parent_id = $1 ORDER BY t.created_at ASC`, [id]),
            pool.query(
                `SELECT id, usuario_id, usuario_nombre, texto, created_at
                 FROM tarea_comentario WHERE tarea_id = $1 ORDER BY created_at ASC`, [id]),
            // Solo metadatos (nunca el binario en el listado).
            pool.query(
                `SELECT id, nombre, mime, tamano, usuario_nombre, created_at
                 FROM tarea_adjunto WHERE tarea_id = $1 ORDER BY created_at ASC`, [id]),
        ]);

        // En qué nivel está: 0 = tarea principal, 1 = subtarea, 2 = subtarea de
        // subtarea. La pantalla lo usa para dejar de ofrecer "nueva subtarea" en
        // el último nivel, en vez de dejar intentarlo y que el servidor lo
        // rechace después.
        let nivel = 0;
        if (tarea?.parentId) {
            const { rows: padre } = await pool.query(`SELECT parent_id FROM tarea WHERE id = $1`, [tarea.parentId]);
            nivel = padre[0]?.parent_id ? 2 : 1;
        }

        return res.json({
            success: true,
            tarea: tarea ? { ...tarea, nivel, puedeTenerSubtareas: nivel < 2 } : tarea,
            subtareas: subRes.rows.map(mapTarea),
            comentarios: comRes.rows.map(c => ({
                id: c.id, usuarioId: c.usuario_id, autor: c.usuario_nombre || 'Sistema',
                texto: c.texto, fecha: c.created_at ? new Date(c.created_at).toLocaleString('es-CL') : '',
            })),
            adjuntos: adjRes.rows.map(a => ({
                id: a.id, nombre: a.nombre, mime: a.mime, tamano: a.tamano,
                autor: a.usuario_nombre || 'Sistema', fecha: a.created_at ? new Date(a.created_at).toLocaleString('es-CL') : '',
            })),
            // Los topes viajan desde acá para que la pantalla no los repita: si
            // se repitieran, el día que cambien quedaría avisando un número que
            // la base ya no acepta.
            limites: {
                ...LIMITES_ADJUNTO,
                usado: adjRes.rows.reduce((s, a) => s + Number(a.tamano || 0), 0),
            },
        });
    } catch (error) {
        console.error('❌ Error obteniendo tarea:', error.message);
        return res.status(500).json({ success: false, message: 'Error al obtener la tarea.' });
    }
};

// POST /crm/tareas/:id/comentarios
export const agregarComentario = async (req, res) => {
    try {
        const { id } = req.params;
        const { texto } = req.body;
        if (!texto?.trim()) return res.status(400).json({ success: false, message: 'El comentario no puede estar vacío.' });
        if (!await tareaEnOrg(id, req.user?.organizacionId || null)) return res.status(404).json({ success: false, message: 'Tarea no encontrada.' });
        const { rows } = await pool.query(
            `INSERT INTO tarea_comentario (tarea_id, usuario_id, usuario_nombre, texto)
             VALUES ($1,$2,$3,$4) RETURNING id, usuario_id, usuario_nombre, texto, created_at`,
            [id, req.user?.usuarioId || null, req.user?.nombre || null, texto.trim()]
        );
        const c = rows[0];

        // Avisar a los involucrados. Esto es lo que hace que un comentario sirva
        // para responderle a alguien y no sea una nota que nadie lee: era la
        // tarea «Mejorar respuesta real en dejar una tarea a otro usuario».
        const { rows: [t] } = await pool.query(
            `SELECT t.titulo, t.responsable_id, t.creado_por,
                    COALESCE((SELECT json_agg(tc.usuario_id) FROM tarea_colaborador tc WHERE tc.tarea_id = t.id), '[]') AS colaboradores
               FROM tarea t WHERE t.id = $1`, [id]);
        await notificarA(
            [t?.responsable_id, t?.creado_por, ...(t?.colaboradores || [])],
            {
                actor: req.user, tipo: 'tarea_comentada',
                titulo: `${req.user?.nombre || 'Alguien'} comentó en: ${t?.titulo || 'una tarea'}`,
                descripcion: texto.trim().slice(0, 140),
                entidad: 'tarea', entidadId: id,
            }
        );

        return res.status(201).json({ success: true, comentario: { id: c.id, usuarioId: c.usuario_id, autor: c.usuario_nombre || 'Sistema', texto: c.texto, fecha: new Date(c.created_at).toLocaleString('es-CL') } });
    } catch (error) {
        console.error('❌ Error agregando comentario:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo agregar el comentario.' });
    }
};

// DELETE /crm/comentarios/:comentarioId
export const eliminarComentario = async (req, res) => {
    try {
        const { comentarioId } = req.params;
        const org = req.user?.organizacionId || null;
        const r = await pool.query(
            `DELETE FROM tarea_comentario tc USING tarea t
             WHERE tc.id = $1 AND tc.tarea_id = t.id AND t.organizacion_id IS NOT DISTINCT FROM $2::uuid
             RETURNING tc.id`, [comentarioId, org]);
        if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Comentario no encontrado.' });
        return res.json({ success: true });
    } catch (error) {
        console.error('❌ Error eliminando comentario:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo eliminar el comentario.' });
    }
};

// ============================================================
// ADJUNTOS de tarea (guardados como binario EN LA BASE)
// ============================================================
// ============================================================================
// LÍMITES DE ADJUNTOS · RNF-TA-03
// ----------------------------------------------------------------------------
// Los archivos se guardan DENTRO de la base (`tarea_adjunto.contenido`). Es
// cómodo —no hay que administrar almacenamiento aparte, y el respaldo de la
// base ya se los lleva— pero tiene un costo que se paga después: cada respaldo
// arrastra todos los archivos, y unos cientos de PDF empiezan a pesar en el
// tiempo de restauración y en la memoria del servidor.
//
// Por eso hay DOS topes, no uno:
//   · por archivo, para que nadie suba un video;
//   · por tarea, porque un tope por archivo no impide subir cien archivos.
//
// Un solo lugar donde cambiarlos: el frontend los recibe del servidor en vez de
// repetirlos, así no pueden quedar desalineados y mostrar un aviso que no
// corresponde con lo que la base acepta.
//
// ⚠️ MAX_ADJUNTO no puede subir sin subir también el límite de express.json en
// server.js: un archivo viaja en base64 y crece un tercio por el camino.
// Hoy: 7 MB de archivo ≈ 9,4 MB de JSON, contra un tope de 10 MB.
// ============================================================================
const MAX_ADJUNTO = 7 * 1024 * 1024;        // 7 MB por archivo
const MAX_POR_TAREA = 25 * 1024 * 1024;     // 25 MB sumando todos los de una tarea

export const LIMITES_ADJUNTO = { porArchivo: MAX_ADJUNTO, porTarea: MAX_POR_TAREA };

const enMegas = (bytes) => `${(bytes / 1024 / 1024).toFixed(bytes % (1024 * 1024) === 0 ? 0 : 1)} MB`;

// POST /crm/tareas/:id/adjuntos   body: { nombre, mime, dataBase64 }
export const subirAdjunto = async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, mime, dataBase64 } = req.body;
        if (!nombre?.trim() || !dataBase64) return res.status(400).json({ success: false, message: 'Falta el archivo.' });
        if (!await tareaEnOrg(id, req.user?.organizacionId || null)) return res.status(404).json({ success: false, message: 'Tarea no encontrada.' });

        // Acepta "data:...;base64,XXXX" o el base64 pelado.
        const base64 = String(dataBase64).includes(',') ? String(dataBase64).split(',').pop() : dataBase64;
        const buffer = Buffer.from(base64, 'base64');
        if (buffer.length === 0) return res.status(400).json({ success: false, message: 'Archivo vacío o inválido.' });

        if (buffer.length > MAX_ADJUNTO) {
            return res.status(413).json({
                success: false,
                message: `«${nombre}» pesa ${enMegas(buffer.length)} y el máximo por archivo es ${enMegas(MAX_ADJUNTO)}.`,
            });
        }

        // Tope acumulado: un límite por archivo no impide subir cien archivos.
        const { rows: [uso] } = await pool.query(
            `SELECT COALESCE(SUM(tamano),0)::bigint AS usado FROM tarea_adjunto WHERE tarea_id = $1`, [id]);
        const usado = Number(uso.usado);
        if (usado + buffer.length > MAX_POR_TAREA) {
            const libre = Math.max(0, MAX_POR_TAREA - usado);
            return res.status(413).json({
                success: false,
                message: libre === 0
                    ? `Esta tarea ya ocupa los ${enMegas(MAX_POR_TAREA)} disponibles. Elimina algún archivo antes de subir otro.`
                    : `No cabe: la tarea lleva ${enMegas(usado)} de ${enMegas(MAX_POR_TAREA)} y solo quedan ${enMegas(libre)} libres.`,
            });
        }

        const { rows } = await pool.query(
            `INSERT INTO tarea_adjunto (tarea_id, nombre, mime, tamano, contenido, subido_por, usuario_nombre)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, nombre, mime, tamano, usuario_nombre, created_at`,
            [id, String(nombre).slice(0, 255), (mime || 'application/octet-stream').slice(0, 120), buffer.length, buffer, req.user?.usuarioId || null, req.user?.nombre || null]
        );
        const a = rows[0];
        return res.status(201).json({ success: true, adjunto: { id: a.id, nombre: a.nombre, mime: a.mime, tamano: a.tamano, autor: a.usuario_nombre || 'Sistema', fecha: new Date(a.created_at).toLocaleString('es-CL') } });
    } catch (error) {
        console.error('❌ Error subiendo adjunto:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo subir el archivo.' });
    }
};

// GET /crm/adjuntos/:adjuntoId  → descarga el binario
export const descargarAdjunto = async (req, res) => {
    try {
        const { adjuntoId } = req.params;
        const org = req.user?.organizacionId || null;
        const { rows } = await pool.query(
            `SELECT a.nombre, a.mime, a.contenido
             FROM tarea_adjunto a JOIN tarea t ON t.id = a.tarea_id
             WHERE a.id = $1 AND t.organizacion_id IS NOT DISTINCT FROM $2::uuid`, [adjuntoId, org]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Archivo no encontrado.' });
        const a = rows[0];
        res.setHeader('Content-Type', a.mime || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(a.nombre)}"`);
        return res.send(a.contenido); // Buffer → binario
    } catch (error) {
        console.error('❌ Error descargando adjunto:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo descargar el archivo.' });
    }
};

// DELETE /crm/adjuntos/:adjuntoId
export const eliminarAdjunto = async (req, res) => {
    try {
        const { adjuntoId } = req.params;
        const org = req.user?.organizacionId || null;
        const r = await pool.query(
            `DELETE FROM tarea_adjunto a USING tarea t
             WHERE a.id = $1 AND a.tarea_id = t.id AND t.organizacion_id IS NOT DISTINCT FROM $2::uuid
             RETURNING a.id`, [adjuntoId, org]);
        if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Archivo no encontrado.' });
        return res.json({ success: true });
    } catch (error) {
        console.error('❌ Error eliminando adjunto:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo eliminar el archivo.' });
    }
};

// ============================================================
// PROYECTOS
// ============================================================
const ESTADOS_PROYECTO = ['activo', 'pausado', 'completado', 'archivado'];

// ---------------------------------------------------------------------------
// AVANCE DE UN PROYECTO · tres decisiones, todas discutibles, todas explícitas
//
//   1. Cuenta SOLO tareas principales (parent_id IS NULL). Si contara subtareas,
//      una tarea partida en diez pasos pesaría diez veces más que otra igual de
//      grande que nadie desglosó, y el porcentaje diría más sobre el estilo de
//      cada uno que sobre el proyecto.
//   2. 'en_revision' NO cuenta como terminada: está entregada, no aprobada.
//   3. Las archivadas y las canceladas salen del cálculo ENTERO — ni arriba ni
//      abajo de la división. Archivar algo no debería mover el porcentaje.
//
// El denominador vive en TAREAS_QUE_CUENTAN para que numerador y denominador no
// se puedan desincronizar por un cambio en uno solo.
// ---------------------------------------------------------------------------
const TAREAS_QUE_CUENTAN = `
    t.proyecto_id = pr.id
    AND t.parent_id IS NULL
    AND t.archivada_at IS NULL
    AND t.estado <> 'cancelada'`;

// ---------------------------------------------------------------------------
// INTEGRANTES DE UN PROYECTO · derivados, no mantenidos a mano
//
// La especificación pedía mostrar los integrantes. Se podría haber creado una
// tabla `proyecto_integrante`, pero sería un dato más que alguien tiene que
// acordarse de actualizar cada vez que entra o sale gente — y que en la
// práctica queda desactualizado a la semana.
//
// Acá salen de quienes REALMENTE participan: el responsable del proyecto, los
// responsables de sus tareas y sus colaboradores. Siempre está al día porque
// no hay nada que mantener. Incluye las subtareas: quien solo tiene una
// subtarea también es parte del proyecto.
// ---------------------------------------------------------------------------
// Los integrantes ahora son EXPLÍCITOS: salen de `proyecto_integrante`, no de
// quién aparece en las tareas.
//
// La versión anterior los deducía —un dato menos que mantener a mano— y era una
// buena idea mientras la lista fuera informativa. Dejó de serlo cuando el negocio
// decidió que la pertenencia al proyecto DECIDE QUIÉN VE QUÉ: un permiso no se
// puede deducir de un efecto secundario, porque entonces asignarle una tarea a
// alguien le daría acceso al proyecto entero sin que nadie lo decidiera.
const INTEGRANTES_DEL_PROYECTO = `
    COALESCE((
        SELECT json_agg(json_build_object('id', us.id, 'nombre', us.nombre, 'rol', pi.rol) ORDER BY us.nombre)
          FROM proyecto_integrante pi
          JOIN usuario us ON us.id = pi.usuario_id
         WHERE pi.proyecto_id = pr.id
    ), '[]')`;

export const listarProyectos = async (req, res) => {
    try {
        const org = req.user?.organizacionId || null;
        const uid = req.user?.usuarioId || null;
        const { rows } = await pool.query(
            `SELECT pr.*, u.nombre AS creador, r.nombre AS responsable_nombre,
                    (SELECT pi.rol FROM proyecto_integrante pi
                      WHERE pi.proyecto_id = pr.id AND pi.usuario_id = $2) AS mi_rol,
                    (SELECT COUNT(*)::int FROM tarea t WHERE ${TAREAS_QUE_CUENTAN}) AS tareas_total,
                    (SELECT COUNT(*)::int FROM tarea t WHERE ${TAREAS_QUE_CUENTAN} AND t.estado='completada') AS tareas_hechas,
                    (SELECT COUNT(*)::int FROM tarea t WHERE ${TAREAS_QUE_CUENTAN}
                       AND t.estado <> 'completada' AND t.vence_at < NOW()) AS tareas_atrasadas,
                    ${INTEGRANTES_DEL_PROYECTO} AS integrantes
             FROM proyecto pr
             LEFT JOIN usuario u ON u.id = pr.creado_por
             LEFT JOIN usuario r ON r.id = pr.responsable_id
             WHERE pr.organizacion_id IS NOT DISTINCT FROM $1::uuid
               -- Solo mis proyectos. Ser Administrador ya no alcanza: si nadie te
               -- agregó, no lo ves. Es lo que pidió la tarea SISTEMA DE TAREAS.
               AND EXISTS (SELECT 1 FROM proyecto_integrante pi
                            WHERE pi.proyecto_id = pr.id AND pi.usuario_id = $2)
             ORDER BY
                CASE pr.estado WHEN 'activo' THEN 0 WHEN 'pausado' THEN 1 WHEN 'completado' THEN 2 ELSE 3 END,
                pr.created_at DESC`, [org, uid]);
        return res.json({ success: true, proyectos: rows.map(mapProyecto) });
    } catch (error) {
        console.error('❌ Error listando proyectos:', error.message);
        return res.status(500).json({ success: false, message: 'Error al listar proyectos.' });
    }
};

const mapProyecto = (p) => ({
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    color: p.color,
    estado: p.estado,
    creador: p.creador || null,
    responsableId: p.responsable_id || null,
    responsableNombre: p.responsable_nombre || null,
    fechaInicio: p.fecha_inicio,
    fechaTermino: p.fecha_termino,
    archivado: p.estado === 'archivado',
    archivadoAt: p.archivado_at,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    tareasTotal: p.tareas_total ?? 0,
    tareasHechas: p.tareas_hechas ?? 0,
    tareasPendientes: Math.max(0, (p.tareas_total ?? 0) - (p.tareas_hechas ?? 0)),
    tareasAtrasadas: p.tareas_atrasadas ?? 0,
    integrantes: p.integrantes || [],
    // Qué puedo hacer yo acá: solo el responsable reparte accesos.
    miRol: p.mi_rol || null,
    puedoAdministrar: p.mi_rol === 'responsable',
    avance: p.tareas_total > 0 ? Math.round((p.tareas_hechas / p.tareas_total) * 100) : 0,
});

// Relee un proyecto con sus contadores, para devolverlo ya armado.
const proyectoCompleto = async (id, usuarioId = null) => {
    const { rows } = await pool.query(
        `SELECT pr.*, u.nombre AS creador, r.nombre AS responsable_nombre,
                (SELECT pi.rol FROM proyecto_integrante pi
                  WHERE pi.proyecto_id = pr.id AND pi.usuario_id = $2) AS mi_rol,
                (SELECT COUNT(*)::int FROM tarea t WHERE ${TAREAS_QUE_CUENTAN}) AS tareas_total,
                (SELECT COUNT(*)::int FROM tarea t WHERE ${TAREAS_QUE_CUENTAN} AND t.estado='completada') AS tareas_hechas,
                (SELECT COUNT(*)::int FROM tarea t WHERE ${TAREAS_QUE_CUENTAN}
                   AND t.estado <> 'completada' AND t.vence_at < NOW()) AS tareas_atrasadas,
                ${INTEGRANTES_DEL_PROYECTO} AS integrantes
         FROM proyecto pr
         LEFT JOIN usuario u ON u.id = pr.creado_por
         LEFT JOIN usuario r ON r.id = pr.responsable_id
         WHERE pr.id = $1`, [id, usuarioId]);
    return rows[0] ? mapProyecto(rows[0]) : null;
};

// Una fecha vacía del formulario llega como '' y no como null.
const fechaONull = (v) => (v && String(v).trim()) ? String(v).trim() : null;

export const crearProyecto = async (req, res) => {
    try {
        const { nombre, descripcion, color, responsableId, fechaInicio, fechaTermino, integrantes } = req.body;
        if (!nombre?.trim()) return res.status(400).json({ success: false, message: 'El nombre es obligatorio.' });

        const desde = fechaONull(fechaInicio), hasta = fechaONull(fechaTermino);
        if (desde && hasta && hasta < desde) {
            return res.status(400).json({ success: false, message: 'La fecha de término no puede ser anterior al inicio.' });
        }

        const { rows } = await pool.query(
            `INSERT INTO proyecto (organizacion_id, nombre, descripcion, color, creado_por,
                                   responsable_id, fecha_inicio, fecha_termino)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
            [req.user?.organizacionId || null, nombre.trim(), descripcion?.trim() || null,
             color?.trim() || '#199b4d', req.user?.usuarioId || null,
             responsableId || req.user?.usuarioId || null, desde, hasta]
        );
        const proyectoId = rows[0].id;

        // Quien crea el proyecto queda dentro como responsable. Si no, crearía un
        // proyecto que no puede ver —el filtro de integrantes lo dejaría fuera de
        // su propia lista— y ya no habría forma de recuperarlo.
        const aInvitar = new Map();
        aInvitar.set(req.user?.usuarioId, 'responsable');
        if (responsableId) aInvitar.set(responsableId, 'responsable');
        for (const id of (Array.isArray(integrantes) ? integrantes : [])) {
            if (id && !aInvitar.has(id)) aInvitar.set(id, 'integrante');
        }
        for (const [usuarioId, rol] of aInvitar) {
            if (!usuarioId) continue;
            await pool.query(
                `INSERT INTO proyecto_integrante (proyecto_id, usuario_id, rol, agregado_por)
                 VALUES ($1,$2,$3,$4) ON CONFLICT (proyecto_id, usuario_id) DO NOTHING`,
                [proyectoId, usuarioId, rol, req.user?.usuarioId || null]
            );
        }

        return res.status(201).json({ success: true, proyecto: await proyectoCompleto(proyectoId, req.user?.usuarioId) });
    } catch (error) {
        // La base impide dos proyectos con el mismo nombre en una organización
        // (uq_proyecto_nombre_por_organizacion). Sin este mensaje, el segundo
        // intento salía como un error técnico incomprensible.
        if (error.code === '23505') {
            return res.status(409).json({
                success: false,
                message: `Ya existe un proyecto llamado «${req.body?.nombre?.trim()}». Ábrelo en vez de crear otro.`,
            });
        }
        console.error('❌ Error creando proyecto:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo crear el proyecto.' });
    }
};

export const actualizarProyecto = async (req, res) => {
    try {
        const { id } = req.params;
        const org = req.user?.organizacionId || null;
        const { nombre, descripcion, color, estado, responsableId, fechaInicio, fechaTermino } = req.body;

        // Las fechas necesitan poder BORRARSE, no solo cambiarse: por eso van con
        // una bandera de "vino en el body" en vez del COALESCE de los demás
        // campos, que nunca deja volver a null.
        const tocaInicio = Object.hasOwn(req.body, 'fechaInicio');
        const tocaTermino = Object.hasOwn(req.body, 'fechaTermino');

        const r = await pool.query(
            `UPDATE proyecto SET
                nombre         = COALESCE($2, nombre),
                descripcion    = COALESCE($3, descripcion),
                color          = COALESCE($4, color),
                estado         = COALESCE($5, estado),
                responsable_id = COALESCE($6, responsable_id),
                fecha_inicio   = CASE WHEN $7::boolean THEN $8::date  ELSE fecha_inicio  END,
                fecha_termino  = CASE WHEN $9::boolean THEN $10::date ELSE fecha_termino END,
                archivado_at   = CASE WHEN $5 = 'archivado' AND estado <> 'archivado' THEN NOW()
                                      WHEN $5 IS NOT NULL AND $5 <> 'archivado'       THEN NULL
                                      ELSE archivado_at END
             WHERE id = $1 AND organizacion_id IS NOT DISTINCT FROM $11::uuid RETURNING id`,
            [id, nombre?.trim() || null, descripcion?.trim() || null, color?.trim() || null,
             ESTADOS_PROYECTO.includes(estado) ? estado : null,
             responsableId || null,
             tocaInicio, tocaInicio ? fechaONull(fechaInicio) : null,
             tocaTermino, tocaTermino ? fechaONull(fechaTermino) : null,
             org]
        );
        if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Proyecto no encontrado.' });
        return res.json({ success: true, proyecto: await proyectoCompleto(id, req.user?.usuarioId) });
    } catch (error) {
        // La restricción de fechas coherentes llega hasta acá si el cliente la saltó.
        if (error.constraint === 'proyecto_fechas_coherentes') {
            return res.status(400).json({ success: false, message: 'La fecha de término no puede ser anterior al inicio.' });
        }
        console.error('❌ Error actualizando proyecto:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo actualizar el proyecto.' });
    }
};

// ============================================================================
// INTEGRANTES DE UN PROYECTO
// ----------------------------------------------------------------------------
// Agregar a alguien a un proyecto le da acceso a todo lo que hay dentro, así que
// no lo puede hacer cualquiera: solo quien figura como `responsable` del
// proyecto. Un integrante común ve y trabaja, pero no reparte accesos.
// ============================================================================

/** Devuelve el rol del usuario en el proyecto, o null si no pertenece. */
const miRolEnProyecto = async (proyectoId, usuarioId, organizacionId) => {
    const { rows } = await pool.query(
        `SELECT pi.rol
           FROM proyecto_integrante pi
           JOIN proyecto pr ON pr.id = pi.proyecto_id
          WHERE pi.proyecto_id = $1 AND pi.usuario_id = $2
            AND pr.organizacion_id IS NOT DISTINCT FROM $3::uuid`,
        [proyectoId, usuarioId, organizacionId]
    );
    return rows[0]?.rol || null;
};

export const agregarIntegrante = async (req, res) => {
    try {
        const { id } = req.params;
        const { usuarioId, rol } = req.body;
        const org = req.user?.organizacionId || null;

        const miRol = await miRolEnProyecto(id, req.user?.usuarioId, org);
        if (!miRol) return res.status(404).json({ success: false, message: 'Proyecto no encontrado.' });
        if (miRol !== 'responsable') {
            return res.status(403).json({ success: false, message: 'Solo el responsable del proyecto puede agregar integrantes.' });
        }
        if (!usuarioId) return res.status(400).json({ success: false, message: 'Falta indicar a quién agregar.' });

        // No se puede invitar a alguien de otra organización: sería una fuga por
        // la puerta de atrás, dándole acceso a datos de una firma que no es suya.
        const { rows: destino } = await pool.query(
            `SELECT nombre FROM usuario WHERE id = $1 AND activo
              AND organizacion_id IS NOT DISTINCT FROM $2::uuid`, [usuarioId, org]);
        if (!destino.length) {
            return res.status(404).json({ success: false, message: 'Esa persona no pertenece a tu organización.' });
        }

        await pool.query(
            `INSERT INTO proyecto_integrante (proyecto_id, usuario_id, rol, agregado_por)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (proyecto_id, usuario_id) DO UPDATE SET rol = EXCLUDED.rol`,
            [id, usuarioId, rol === 'responsable' ? 'responsable' : 'integrante', req.user?.usuarioId || null]
        );

        await registrar(req, {
            modulo: 'tareas', accion: 'agregar_integrante',
            entidad: 'proyecto', entidadId: id,
            descripcion: `Agregó a ${destino[0].nombre} al proyecto`,
        });

        const { rows: [pr] } = await pool.query(`SELECT nombre FROM proyecto WHERE id = $1`, [id]);
        await notificar({
            para: usuarioId, actor: req.user, tipo: 'agregado_a_proyecto',
            titulo: `${req.user?.nombre || 'Alguien'} te agregó al proyecto ${pr?.nombre || ''}`.trim(),
            descripcion: 'Ya puedes ver sus tareas.',
            entidad: 'proyecto', entidadId: id,
        });

        return res.json({ success: true, proyecto: await proyectoCompleto(id, req.user?.usuarioId) });
    } catch (error) {
        console.error('❌ Error agregando integrante:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo agregar la persona.' });
    }
};

export const quitarIntegrante = async (req, res) => {
    try {
        const { id, usuarioId } = req.params;
        const org = req.user?.organizacionId || null;

        const miRol = await miRolEnProyecto(id, req.user?.usuarioId, org);
        if (!miRol) return res.status(404).json({ success: false, message: 'Proyecto no encontrado.' });
        if (miRol !== 'responsable' && req.user?.usuarioId !== usuarioId) {
            return res.status(403).json({ success: false, message: 'Solo el responsable puede quitar a otras personas.' });
        }

        // Un proyecto sin responsables queda huérfano: nadie puede volver a
        // administrarlo ni agregar gente, y no hay forma de arreglarlo desde la
        // pantalla. Se impide antes de que pase.
        const { rows: [conteo] } = await pool.query(
            `SELECT COUNT(*) FILTER (WHERE rol = 'responsable')::int responsables
               FROM proyecto_integrante WHERE proyecto_id = $1`, [id]);
        const { rows: [suyo] } = await pool.query(
            `SELECT rol FROM proyecto_integrante WHERE proyecto_id = $1 AND usuario_id = $2`, [id, usuarioId]);
        if (suyo?.rol === 'responsable' && conteo.responsables <= 1) {
            return res.status(409).json({
                success: false,
                message: 'Es el único responsable del proyecto. Nombra a otro antes de quitarlo.',
            });
        }

        const r = await pool.query(
            `DELETE FROM proyecto_integrante WHERE proyecto_id = $1 AND usuario_id = $2 RETURNING usuario_id`,
            [id, usuarioId]);
        if (!r.rows.length) return res.status(404).json({ success: false, message: 'Esa persona no está en el proyecto.' });

        await registrar(req, {
            modulo: 'tareas', accion: 'quitar_integrante',
            entidad: 'proyecto', entidadId: id,
            descripcion: 'Quitó a una persona del proyecto',
        });

        return res.json({ success: true, proyecto: await proyectoCompleto(id, req.user?.usuarioId) });
    } catch (error) {
        console.error('❌ Error quitando integrante:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo quitar la persona.' });
    }
};

export const eliminarProyecto = async (req, res) => {
    try {
        const { id } = req.params;
        const org = req.user?.organizacionId || null;
        // Las tareas del proyecto quedan sin proyecto (proyecto_id → NULL por la FK).
        const r = await pool.query(`DELETE FROM proyecto WHERE id = $1 AND organizacion_id IS NOT DISTINCT FROM $2::uuid RETURNING id`, [id, org]);
        if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Proyecto no encontrado.' });
        return res.json({ success: true });
    } catch (error) {
        console.error('❌ Error eliminando proyecto:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo eliminar el proyecto.' });
    }
};
