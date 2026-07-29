import { API_BASE_URL } from "../../config.js";

// Estos endpoints devuelven los documentos tal cual vienen de la BD (snake_case),
// así que se llaman con fetch directo en vez de fetchWithAuth (que convierte las
// claves a camelCase y rompería las tablas). Lo que sí hace falta es la sesión:
// sin ella el backend responde 401 y, antes, cualquiera podía leer los documentos
// de todas las empresas.
const pedir = async (ruta, sessionId) => {
    const res = await fetch(`${API_BASE_URL}${ruta}`, {
        headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId || '' },
    });
    if (res.status === 401) return { ok: false, error: 'Sesión expirada', documentos: [] };
    return await res.json();
};

export const obtenerHistorialBunker = (empresaId, sessionId) =>
    pedir(`/dte-consulta/historial?empresa_id=${empresaId}`, sessionId);

export const obtenerComprasBunker = (empresaId, sessionId) =>
    pedir(`/dte-consulta/compras?empresa_id=${empresaId}`, sessionId);
