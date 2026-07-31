// ============================================================================
// AVANCE DE LOS PROCESOS LARGOS, ESPEJADO EN LA BASE
// ----------------------------------------------------------------------------
// La memoria sigue mandando: los objetos `estadoRecordatorio` y `estadoRobot`
// no se tocan. Esto escribe EN PARALELO, para que:
//
//   · la pantalla pueda mostrar el avance aunque el proceso ya no esté en
//     memoria (servidor reiniciado, otra instancia, el navegador entró después);
//   · quede constancia de que un envío quedó a medias, en vez de desaparecer.
//
// Nada de lo que pasa acá puede voltear el envío: si la base falla, se avisa por
// consola y el proceso sigue. Es una red de seguridad, no una validación.
//
// Un proceso "activo" que lleva más de LATIDO_MUERTO sin refrescarse murió con
// el servidor: se muestra como abandonado en vez de quedar colgado para siempre.
// ============================================================================
import { pool } from '../database/db.js';

const LATIDO_MUERTO = '15 minutes';

const seguro = async (fn) => {
    try { return await fn(); }
    catch (err) { console.warn(`⚠️  No se pudo registrar el avance del proceso: ${err.message}`); return null; }
};

/** Abre el proceso y devuelve su id (o null si la base no respondió). */
export const abrirProceso = async ({ tipo, usuario, total = 0, detalle = null }) => seguro(async () => {
    const { rows } = await pool.query(
        `INSERT INTO proceso_en_curso (tipo, organizacion_id, usuario_id, usuario_nombre, total, detalle)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [tipo, usuario?.organizacionId || null, usuario?.usuarioId || null,
         usuario?.nombre || null, total, detalle ? JSON.stringify(detalle) : null]
    );
    return rows[0].id;
});

/** Late en cada paso. Sin await a propósito en los bucles: no debe frenar el envío. */
export const latir = async (id, { actual, exitos, fallidos, ultimo }) => {
    if (!id) return;
    return seguro(() => pool.query(
        `UPDATE proceso_en_curso
            SET actual = COALESCE($2, actual),
                exitos = COALESCE($3, exitos),
                fallidos = COALESCE($4, fallidos),
                ultimo = COALESCE($5, ultimo),
                latido_at = NOW()
          WHERE id = $1`,
        [id, actual ?? null, exitos ?? null, fallidos ?? null, ultimo ?? null]
    ));
};

export const cerrarProceso = async (id, { estado = 'finalizado', error = null, exitos, fallidos } = {}) => {
    if (!id) return;
    return seguro(() => pool.query(
        `UPDATE proceso_en_curso
            SET estado = $2, error = $3,
                exitos = COALESCE($4, exitos),
                fallidos = COALESCE($5, fallidos),
                latido_at = NOW(), finalizado_at = NOW()
          WHERE id = $1`,
        [id, estado, error, exitos ?? null, fallidos ?? null]
    ));
};

/**
 * Último proceso de un tipo, para que la pantalla pueda retomar el avance
 * aunque la memoria esté vacía. Marca como 'abandonado' lo que dejó de latir.
 */
export const ultimoProceso = async (tipo, organizacionId = null) => seguro(async () => {
    await pool.query(
        `UPDATE proceso_en_curso
            SET estado = 'abandonado', finalizado_at = NOW()
          WHERE estado = 'activo' AND latido_at < NOW() - INTERVAL '${LATIDO_MUERTO}'`
    );

    const { rows } = await pool.query(
        `SELECT * FROM proceso_en_curso
          WHERE tipo = $1
            AND organizacion_id IS NOT DISTINCT FROM $2::uuid
          ORDER BY iniciado_at DESC LIMIT 1`,
        [tipo, organizacionId]
    );
    return rows[0] || null;
});
