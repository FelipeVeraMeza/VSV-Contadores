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
