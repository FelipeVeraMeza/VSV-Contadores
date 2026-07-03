// Utilidad de aislamiento de datos por rol.
// Regla: SOLO el Administrador puede acceder a la "vista global" (sin empresa / empresa_id NULL).
// Un Cliente/Consultor SIEMPRE debe estar acotado a una empresa asignada.
// Si un no-admin no tiene una empresa válida seleccionada, no debe ver datos del búnker global.

const VALORES_VACIOS = new Set(['', 'undefined', 'null', 'ALL', 'all']);

export const empresaEsValida = (empresaId) =>
    !!empresaId && !VALORES_VACIOS.has(String(empresaId));

// Devuelve true cuando un usuario NO administrador intenta ver la vista global
// (sin empresa válida). En ese caso, el controlador debe responder con un espacio vacío.
export const clienteSinEmpresa = (req, empresaId) => {
    const esAdmin = req.user?.rol === 'Administrador';
    return !esAdmin && !empresaEsValida(empresaId);
};
