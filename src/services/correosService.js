// Llamadas del envío de correos personalizados (rutas /api/correos/*).
import { fetchWithAuth } from './apiClient';

/** Qué datos se pueden insertar en el texto: {{empresa}}, {{plan}}, … */
export const camposCorreoApi = (sessionId) =>
    fetchWithAuth('/correos/campos', sessionId);

/** Cuántos correos quedan hoy. Las pruebas también gastan cuota. */
export const cuotaCorreoApi = (sessionId) =>
    fetchWithAuth('/correos/cuota', sessionId);

/** Empresas con facturas en PENDIENTE_PAGO, para el correo de cobranza. */
export const empresasImpagasApi = (sessionId) =>
    fetchWithAuth('/correos/impagas', sessionId);

/**
 * Qué recibiría cada empresa, con los datos ya reemplazados. No manda nada.
 * Devuelve también las que quedan fuera y las marcas mal escritas.
 */
export const previewCampanaApi = (sessionId, datos) =>
    fetchWithAuth('/correos/campana/preview', sessionId, { method: 'POST', body: datos });

/**
 * Manda de verdad. Responde al toque y sigue en segundo plano: el avance se
 * consulta con `progresoCampanaApi`.
 * `soloPrueba: true` manda UNO solo a la casilla interna.
 */
export const enviarCampanaApi = (sessionId, datos) =>
    fetchWithAuth('/correos/campana', sessionId, { method: 'POST', body: datos });

export const progresoCampanaApi = (sessionId) =>
    fetchWithAuth('/correos/campana/progreso', sessionId);

/** Corta lo que FALTA. Lo que ya salió no se puede volver atrás. */
export const detenerCampanaApi = (sessionId) =>
    fetchWithAuth('/correos/campana/detener', sessionId, { method: 'POST', body: {} });

// ---------------------------------------------------------------------
// Registro · qué se envió, a quién y con qué resultado
// ---------------------------------------------------------------------
/** Las campañas enviadas. Con `pruebas` también muestra los envíos de ensayo. */
export const historialCampanasApi = (sessionId, pruebas = false) =>
    fetchWithAuth(`/correos/campanas${pruebas ? '?pruebas=1' : ''}`, sessionId);

export const detalleCampanaApi = (sessionId, id) =>
    fetchWithAuth(`/correos/campanas/${id}`, sessionId);

/** «¿le llegó a este cliente?» */
export const enviosDeEmpresaApi = (sessionId, empresaId) =>
    fetchWithAuth(`/correos/empresa/${empresaId}/envios`, sessionId);

// ---------------------------------------------------------------------
// Bajas
// ---------------------------------------------------------------------
export const listarBajasApi = (sessionId) =>
    fetchWithAuth('/correos/bajas', sessionId);

export const quitarBajaApi = (sessionId, correo) =>
    fetchWithAuth('/correos/bajas/quitar', sessionId, { method: 'POST', body: { correo } });

// ---------------------------------------------------------------------
// Mi remitente y mi firma · cada persona manda desde su propia dirección
// ---------------------------------------------------------------------
export const miPerfilCorreoApi = (sessionId) =>
    fetchWithAuth('/correos/mi-perfil', sessionId);

export const guardarPerfilCorreoApi = (sessionId, datos) =>
    fetchWithAuth('/correos/mi-perfil', sessionId, { method: 'PUT', body: datos });

// ---------------------------------------------------------------------
// Plantillas · las propias más las que el equipo compartió
// ---------------------------------------------------------------------
export const listarPlantillasCorreoApi = (sessionId) =>
    fetchWithAuth('/correos/plantillas', sessionId);

/** Sin `id` crea; con `id` actualiza esa misma. */
export const guardarPlantillaCorreoApi = (sessionId, datos, id = null) =>
    fetchWithAuth(id ? `/correos/plantillas/${id}` : '/correos/plantillas', sessionId, {
        method: id ? 'PUT' : 'POST',
        body: datos,
    });

export const eliminarPlantillaCorreoApi = (sessionId, id) =>
    fetchWithAuth(`/correos/plantillas/${id}`, sessionId, { method: 'DELETE' });

// ---------------------------------------------------------------------
// Bandeja de entrada · lo que contestan los clientes, leído por IMAP
// ---------------------------------------------------------------------
/** El listado. `filtro`: todos | no_leidos | destacados | clientes | archivados */
export const bandejaApi = (sessionId, { q = '', filtro = 'todos', pagina = 0 } = {}) => {
    const p = new URLSearchParams({ filtro, pagina: String(pagina) });
    if (q) p.set('q', q);
    return fetchWithAuth(`/correos/bandeja?${p}`, sessionId);
};

/** Abrir uno. Al abrirlo queda marcado como leído. */
export const correoRecibidoApi = (sessionId, id) =>
    fetchWithAuth(`/correos/bandeja/${id}`, sessionId);

/** Destacar, archivar o volver a marcar como no leído. */
export const marcarRecibidoApi = (sessionId, id, cambios) =>
    fetchWithAuth(`/correos/bandeja/${id}`, sessionId, { method: 'PATCH', body: cambios });

/** Busca lo nuevo en el servidor de correo. Responde al toque y sigue detrás. */
export const sincronizarBandejaApi = (sessionId) =>
    fetchWithAuth('/correos/bandeja/sincronizar', sessionId, { method: 'POST', body: {} });

export const progresoBandejaApi = (sessionId) =>
    fetchWithAuth('/correos/bandeja/progreso', sessionId);

/**
 * Responder o reenviar. Sale por la misma vía que todo lo demás y con el
 * remitente de quien contesta. Con `reenviar: true` el destino lo pone quien
 * escribe; sin él, va siempre a quien mandó el original.
 */
export const responderRecibidoApi = (sessionId, id, datos) =>
    fetchWithAuth(`/correos/bandeja/${id}/responder`, sessionId, { method: 'POST', body: datos });

// ---------------------------------------------------------------------
// Enviados en lista plana · un correo por fila, no agrupados por campaña
// ---------------------------------------------------------------------
/** `filtro`: todos | fallidos | pruebas */
export const enviadosApi = (sessionId, { q = '', filtro = 'todos', pagina = 0 } = {}) => {
    const p = new URLSearchParams({ filtro, pagina: String(pagina) });
    if (q) p.set('q', q);
    return fetchWithAuth(`/correos/enviados?${p}`, sessionId);
};

export const enviadoApi = (sessionId, id) =>
    fetchWithAuth(`/correos/enviados/${id}`, sessionId);
