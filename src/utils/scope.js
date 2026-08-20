// Utilidad de aislamiento de datos por rol.
// Regla: SOLO el Administrador puede acceder a la "vista global" (sin empresa / empresa_id NULL).
// Un Cliente/Consultor SIEMPRE debe estar acotado a una empresa asignada.
// Si un no-admin no tiene una empresa válida seleccionada, no debe ver datos del búnker global.
//
// OJO — esta regla es de ROL y se escribió antes del multi-tenant
// (2026-07-06_organizacion_multitenant.sql). Por sí sola no alcanza: la "vista
// global" de un Administrador tiene que estar acotada además a SU organización.
// Para eso está `empresasDeLaOrganizacion` más abajo.

import { pool } from "../database/db.js";

const VALORES_VACIOS = new Set(['', 'undefined', 'null', 'ALL', 'all']);

export const empresaEsValida = (empresaId) =>
    !!empresaId && !VALORES_VACIOS.has(String(empresaId));

// Devuelve true cuando un usuario NO administrador intenta ver la vista global
// (sin empresa válida). En ese caso, el controlador debe responder con un espacio vacío.
export const clienteSinEmpresa = (req, empresaId) => {
    const esAdmin = req.user?.rol === 'Administrador';
    return !esAdmin && !empresaEsValida(empresaId);
};

// IDs de las empresas de la organización del usuario de la sesión.
//
// Sirve para acotar la "vista global" (sin empresa seleccionada) en las tablas
// que NO llevan organizacion_id y cuelgan de la empresa: movimientos_caja,
// movimientos_bancarios, plan_cuentas, comprobantes, sucursal. En esas tablas
// "global" tiene que significar "todas MIS empresas", no "todas las del
// sistema", que era lo que devolvían antes.
//
// Devuelve [] si la organización no tiene ninguna empresa (un tenant nuevo):
// quien consulte debe responder vacío, no sin filtro.
export const empresasDeLaOrganizacion = async (req) => {
    const organizacionId = req.user?.organizacionId || null;
    const { rows } = await pool.query(
        `SELECT id FROM empresa WHERE organizacion_id IS NOT DISTINCT FROM $1::uuid`,
        [organizacionId]
    );
    return rows.map(r => r.id);
};

// =============================================================================
// EL PORTERO · quién puede ver qué empresa
// -----------------------------------------------------------------------------
// Hay DOS recortes, y son independientes:
//
//   1. Por organización — ningún dueño ve datos de otro. Es absoluto.
//   2. Por usuario — quien entra al equipo empezando desde cero
//      (`ve_solo_empresas_asignadas`) ve únicamente las empresas que tenga en
//      `audita`: las que él cree, más las que le entreguen.
//
// El segundo recorte se escribía al crear la empresa (la fila de `audita`) pero
// casi nadie lo leía después: el 19-08-2026 se midió que Contabilidad,
// Remuneraciones y el selector global lo ignoraban por completo, así que un
// usuario "desde cero" veía las 99 empresas de la oficina. Esto es lo que
// faltaba, en un solo lugar, para que no se vuelva a olvidar en el próximo
// endpoint que alguien agregue.
//
// El rol NO entra en la decisión. La regla anterior eximía a los
// Administradores, y como el usuario que empieza desde cero es Administrador
// —tiene que serlo para trabajar—, la exención se comía la regla entera.
// =============================================================================

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const veSoloAsignadas = (req) =>
    req.user?.veSoloEmpresasAsignadas === true || req.user?.rol === 'Cliente';

/**
 * ¿Puede este usuario tocar esta empresa?
 * Devuelve la fila de empresa (id, organizacion_id) si sí, o null si no.
 * null significa 403/404 — nunca "sin filtro".
 */
export const empresaPermitida = async (req, empresaId) => {
    if (!empresaEsValida(empresaId) || !RE_UUID.test(String(empresaId))) return null;

    const { rows } = await pool.query(
        'SELECT id, organizacion_id FROM empresa WHERE id = $1',
        [empresaId]
    );
    const empresa = rows[0];
    if (!empresa) return null;

    // 1 · Aislamiento entre organizaciones. No se negocia.
    if ((empresa.organizacion_id || null) !== (req.user?.organizacionId || null)) return null;

    // 2 · Recorte por usuario, solo para quien empieza desde cero.
    if (veSoloAsignadas(req)) {
        if (!req.user?.usuarioId) return null;
        const { rows: asignada } = await pool.query(
            'SELECT 1 FROM audita WHERE usuario_id = $1 AND empresa_id = $2 LIMIT 1',
            [req.user.usuarioId, empresaId]
        );
        if (!asignada.length) return null;
    }

    return empresa;
};

/**
 * Las empresas que este usuario puede ver, para acotar la vista consolidada
 * ("Todas las empresas").
 *
 * Devuelve `null` cuando no hay recorte por usuario — quien consulte sigue
 * filtrando por organización como siempre. Devuelve un arreglo (posiblemente
 * VACÍO) cuando sí lo hay: un arreglo vacío significa "no ve nada", y quien
 * consulte tiene que respetarlo, no interpretarlo como "sin filtro".
 */
export const empresasVisibles = async (req) => {
    if (!veSoloAsignadas(req)) return null;
    if (!req.user?.usuarioId) return [];
    const { rows } = await pool.query(
        `SELECT e.id
           FROM empresa e
           JOIN audita a ON a.empresa_id = e.id AND a.usuario_id = $1
          WHERE e.organizacion_id IS NOT DISTINCT FROM $2::uuid`,
        [req.user.usuarioId, req.user.organizacionId || null]
    );
    return rows.map(r => r.id);
};
