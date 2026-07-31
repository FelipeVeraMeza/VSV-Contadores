import { pool } from '../database/db.js';

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

// ------------------------------------------------------------
// LISTAR TAREAS
//   ?estado=pendiente|completada  ?tipo=  ?personaId=  ?desde=&hasta= (vence_at)
//   ?scope=mias|equipo   (equipo solo aplica a administradores)
// ------------------------------------------------------------
export const listarTareas = async (req, res) => {
    try {
        const { estado, tipo, personaId, desde, hasta, scope } = req.query;
        const org = req.user?.organizacionId || null;
        const where = ['t.organizacion_id IS NOT DISTINCT FROM $1::uuid'];
        const params = [org];

        // Cartera propia salvo que el admin pida ver el equipo.
        const verEquipo = esAdmin(req) && scope === 'equipo';
        if (!verEquipo) {
            params.push(req.user?.usuarioId || null);
            where.push(`(t.responsable_id = $${params.length} OR t.creado_por = $${params.length})`);
        }
        if (estado && ESTADOS.includes(estado)) { params.push(estado); where.push(`t.estado = $${params.length}`); }
        if (tipo && TIPOS.includes(tipo)) { params.push(tipo); where.push(`t.tipo = $${params.length}`); }
        if (personaId) { params.push(personaId); where.push(`t.persona_id = $${params.length}`); }
        if (desde) { params.push(desde); where.push(`t.vence_at >= $${params.length}::timestamptz`); }
        if (hasta) { params.push(hasta); where.push(`t.vence_at <= $${params.length}::timestamptz`); }
        // Filtros del módulo de tareas.
        if (req.query.proyectoId) { params.push(req.query.proyectoId); where.push(`t.proyecto_id = $${params.length}`); }
        if (req.query.soloRaiz === '1') where.push(`t.parent_id IS NULL`);

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
             WHERE ${where.join(' AND ')}
             ORDER BY ${ORDEN_TAREAS}`,
            params
        );
        return res.json({ success: true, tareas: rows.map(mapTarea) });
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
            proyectoId, parentId, colaboradores, estado } = req.body;
        if (!titulo?.trim()) return res.status(400).json({ success: false, message: 'El título es obligatorio.' });

        const { rows } = await pool.query(
            `INSERT INTO tarea
                (organizacion_id, persona_id, empresa_id, titulo, descripcion, tipo, prioridad, estado,
                 responsable_id, vence_at, origen, creado_por, proyecto_id, parent_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
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
                proyectoId || null,
                parentId || null,
            ]
        );
        const nuevaId = rows[0].id;
        if (Array.isArray(colaboradores)) await setColaboradores(nuevaId, colaboradores);
        // Devuelve la tarea ya enriquecida (con nombres, contadores, colaboradores).
        const full = await tareaCompleta(nuevaId);
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
        const chk = await pool.query(`SELECT id FROM tarea WHERE id = $1 AND organizacion_id IS NOT DISTINCT FROM $2::uuid`, [id, org]);
        if (chk.rows.length === 0) return res.status(404).json({ success: false, message: 'Tarea no encontrada.' });

        const { titulo, descripcion, tipo, prioridad, estado, responsableId, venceAt, proyectoId, colaboradores } = req.body;
        const completedAt = estado === 'completada' ? 'NOW()' : (estado ? 'NULL' : 'completed_at');
        await pool.query(
            `UPDATE tarea SET
                titulo = COALESCE($2, titulo),
                descripcion = COALESCE($3, descripcion),
                tipo = COALESCE($4, tipo),
                prioridad = COALESCE($5, prioridad),
                estado = COALESCE($6, estado),
                responsable_id = COALESCE($7, responsable_id),
                vence_at = COALESCE($8, vence_at),
                proyecto_id = COALESCE($9, proyecto_id),
                completed_at = ${completedAt}
             WHERE id = $1`,
            [
                id, titulo?.trim() || null, descripcion?.trim() || null,
                (tipo && TIPOS.includes(tipo)) ? tipo : null,
                (prioridad && PRIORIDADES.includes(prioridad)) ? prioridad : null,
                (estado && ESTADOS.includes(estado)) ? estado : null,
                responsableId || null, venceAt || null, proyectoId || null,
            ]
        );
        if (Array.isArray(colaboradores)) await setColaboradores(id, colaboradores);
        return res.json({ success: true, tarea: await tareaCompleta(id) });
    } catch (error) {
        console.error('❌ Error actualizando tarea:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo actualizar la tarea.' });
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
        return res.json({
            success: true,
            tarea,
            subtareas: subRes.rows.map(mapTarea),
            comentarios: comRes.rows.map(c => ({
                id: c.id, usuarioId: c.usuario_id, autor: c.usuario_nombre || 'Sistema',
                texto: c.texto, fecha: c.created_at ? new Date(c.created_at).toLocaleString('es-CL') : '',
            })),
            adjuntos: adjRes.rows.map(a => ({
                id: a.id, nombre: a.nombre, mime: a.mime, tamano: a.tamano,
                autor: a.usuario_nombre || 'Sistema', fecha: a.created_at ? new Date(a.created_at).toLocaleString('es-CL') : '',
            })),
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
const MAX_ADJUNTO = 7 * 1024 * 1024; // 7 MB por archivo

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
        if (buffer.length > MAX_ADJUNTO) return res.status(413).json({ success: false, message: 'El archivo supera el máximo de 7 MB.' });

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

export const listarProyectos = async (req, res) => {
    try {
        const org = req.user?.organizacionId || null;
        const { rows } = await pool.query(
            `SELECT pr.*, u.nombre AS creador, r.nombre AS responsable_nombre,
                    (SELECT COUNT(*)::int FROM tarea t WHERE ${TAREAS_QUE_CUENTAN}) AS tareas_total,
                    (SELECT COUNT(*)::int FROM tarea t WHERE ${TAREAS_QUE_CUENTAN} AND t.estado='completada') AS tareas_hechas,
                    (SELECT COUNT(*)::int FROM tarea t WHERE ${TAREAS_QUE_CUENTAN}
                       AND t.estado <> 'completada' AND t.vence_at < NOW()) AS tareas_atrasadas
             FROM proyecto pr
             LEFT JOIN usuario u ON u.id = pr.creado_por
             LEFT JOIN usuario r ON r.id = pr.responsable_id
             WHERE pr.organizacion_id IS NOT DISTINCT FROM $1::uuid
             ORDER BY
                CASE pr.estado WHEN 'activo' THEN 0 WHEN 'pausado' THEN 1 WHEN 'completado' THEN 2 ELSE 3 END,
                pr.created_at DESC`, [org]);
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
    tareasAtrasadas: p.tareas_atrasadas ?? 0,
    avance: p.tareas_total > 0 ? Math.round((p.tareas_hechas / p.tareas_total) * 100) : 0,
});

// Relee un proyecto con sus contadores, para devolverlo ya armado.
const proyectoCompleto = async (id) => {
    const { rows } = await pool.query(
        `SELECT pr.*, u.nombre AS creador, r.nombre AS responsable_nombre,
                (SELECT COUNT(*)::int FROM tarea t WHERE ${TAREAS_QUE_CUENTAN}) AS tareas_total,
                (SELECT COUNT(*)::int FROM tarea t WHERE ${TAREAS_QUE_CUENTAN} AND t.estado='completada') AS tareas_hechas,
                (SELECT COUNT(*)::int FROM tarea t WHERE ${TAREAS_QUE_CUENTAN}
                   AND t.estado <> 'completada' AND t.vence_at < NOW()) AS tareas_atrasadas
         FROM proyecto pr
         LEFT JOIN usuario u ON u.id = pr.creado_por
         LEFT JOIN usuario r ON r.id = pr.responsable_id
         WHERE pr.id = $1`, [id]);
    return rows[0] ? mapProyecto(rows[0]) : null;
};

// Una fecha vacía del formulario llega como '' y no como null.
const fechaONull = (v) => (v && String(v).trim()) ? String(v).trim() : null;

export const crearProyecto = async (req, res) => {
    try {
        const { nombre, descripcion, color, responsableId, fechaInicio, fechaTermino } = req.body;
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
        return res.status(201).json({ success: true, proyecto: await proyectoCompleto(rows[0].id) });
    } catch (error) {
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
        return res.json({ success: true, proyecto: await proyectoCompleto(id) });
    } catch (error) {
        // La restricción de fechas coherentes llega hasta acá si el cliente la saltó.
        if (error.constraint === 'proyecto_fechas_coherentes') {
            return res.status(400).json({ success: false, message: 'La fecha de término no puede ser anterior al inicio.' });
        }
        console.error('❌ Error actualizando proyecto:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo actualizar el proyecto.' });
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
