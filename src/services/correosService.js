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
