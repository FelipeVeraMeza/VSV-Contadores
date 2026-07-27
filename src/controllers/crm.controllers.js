import { pool } from '../database/db.js';

// ============================================================
// CRM · Tareas / actividades y métricas del dashboard
// Aislamiento: todo filtra por organización. Un usuario normal ve sus
// tareas (responsable o creador); el Administrador ve las de su equipo.
// ============================================================

const esAdmin = (req) => req.user?.rol === 'Administrador';
const TIPOS = ['tarea', 'reunion', 'llamada', 'whatsapp', 'correo', 'ticket'];
const PRIORIDADES = ['alta', 'media', 'baja'];
const ESTADOS = ['pendiente', 'completada', 'cancelada'];

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

        const { rows } = await pool.query(
            `SELECT t.*, u.nombre AS responsable_nombre,
                    (p.nombre || ' ' || COALESCE(p.apellidos,'')) AS persona_nombre
             FROM tarea t
             LEFT JOIN usuario u ON u.id = t.responsable_id
             LEFT JOIN persona p ON p.id = t.persona_id
             WHERE ${where.join(' AND ')}
             ORDER BY
                CASE t.estado WHEN 'pendiente' THEN 0 ELSE 1 END,
                t.vence_at ASC NULLS LAST,
                CASE t.prioridad WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END`,
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
    completedAt: t.completed_at,
});

// ------------------------------------------------------------
// CREAR TAREA
// ------------------------------------------------------------
export const crearTarea = async (req, res) => {
    try {
        const { titulo, descripcion, tipo, prioridad, personaId, empresaId, responsableId, venceAt, origen } = req.body;
        if (!titulo?.trim()) return res.status(400).json({ success: false, message: 'El título es obligatorio.' });

        const { rows } = await pool.query(
            `INSERT INTO tarea
                (organizacion_id, persona_id, empresa_id, titulo, descripcion, tipo, prioridad,
                 responsable_id, vence_at, origen, creado_por)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
            [
                req.user?.organizacionId || null,
                personaId || null, empresaId || null,
                titulo.trim(), descripcion?.trim() || null,
                TIPOS.includes(tipo) ? tipo : 'tarea',
                PRIORIDADES.includes(prioridad) ? prioridad : 'media',
                responsableId || req.user?.usuarioId || null,
                venceAt || null,
                origen === 'ia' ? 'ia' : 'manual',
                req.user?.usuarioId || null,
            ]
        );
        return res.status(201).json({ success: true, tarea: mapTarea(rows[0]) });
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

        const { titulo, descripcion, tipo, prioridad, estado, responsableId, venceAt } = req.body;
        const completedAt = estado === 'completada' ? 'NOW()' : (estado ? 'NULL' : 'completed_at');
        const { rows } = await pool.query(
            `UPDATE tarea SET
                titulo = COALESCE($2, titulo),
                descripcion = COALESCE($3, descripcion),
                tipo = COALESCE($4, tipo),
                prioridad = COALESCE($5, prioridad),
                estado = COALESCE($6, estado),
                responsable_id = COALESCE($7, responsable_id),
                vence_at = COALESCE($8, vence_at),
                completed_at = ${completedAt}
             WHERE id = $1 RETURNING *`,
            [
                id, titulo?.trim() || null, descripcion?.trim() || null,
                (tipo && TIPOS.includes(tipo)) ? tipo : null,
                (prioridad && PRIORIDADES.includes(prioridad)) ? prioridad : null,
                (estado && ESTADOS.includes(estado)) ? estado : null,
                responsableId || null, venceAt || null,
            ]
        );
        return res.json({ success: true, tarea: mapTarea(rows[0]) });
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
            pool.query(
                `SELECT
                    COUNT(*) FILTER (WHERE estado='pendiente')::int AS pendientes,
                    COUNT(*) FILTER (WHERE estado='pendiente' AND vence_at < NOW())::int AS vencidas,
                    COUNT(*) FILTER (WHERE estado='completada' AND completed_at >= $${soloMias ? 3 : 2}::timestamptz)::int AS completadas,
                    COUNT(*) FILTER (WHERE tipo='reunion' AND estado='completada' AND completed_at >= $${soloMias ? 3 : 2}::timestamptz)::int AS reuniones_realizadas,
                    COUNT(*) FILTER (WHERE tipo='reunion' AND estado='pendiente' AND vence_at::date = CURRENT_DATE)::int AS reuniones_hoy,
                    COUNT(*) FILTER (WHERE estado='pendiente' AND vence_at::date = CURRENT_DATE)::int AS vencen_hoy
                 FROM tarea WHERE organizacion_id IS NOT DISTINCT FROM $1::uuid ${tScope}`,
                soloMias ? [org, uid, desde] : [org, desde]),
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
