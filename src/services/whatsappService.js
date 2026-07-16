import { fetchWithAuth } from './apiClient';

// ----- Sesiones (números de WhatsApp) -----
export const getSesionesApi = (sessionId) =>
  fetchWithAuth('/whatsapp/sesiones', sessionId);

export const crearSesionApi = (sessionId, { nombre, empresaId = null }) =>
  fetchWithAuth('/whatsapp/sesiones', sessionId, {
    method: 'POST',
    body: { nombre, empresaId },
  });

export const getEstadoSesionApi = (sessionId, sesionId) =>
  fetchWithAuth(`/whatsapp/sesiones/${sesionId}/estado`, sessionId);

export const iniciarSesionApi = (sessionId, sesionId) =>
  fetchWithAuth(`/whatsapp/sesiones/${sesionId}/iniciar`, sessionId, { method: 'POST' });

export const cerrarSesionApi = (sessionId, sesionId) =>
  fetchWithAuth(`/whatsapp/sesiones/${sesionId}/cerrar`, sessionId, { method: 'POST' });

export const eliminarSesionApi = (sessionId, sesionId) =>
  fetchWithAuth(`/whatsapp/sesiones/${sesionId}`, sessionId, { method: 'DELETE' });

export const setAutoSesionApi = (sessionId, sesionId, activo) =>
  fetchWithAuth(`/whatsapp/sesiones/${sesionId}/auto`, sessionId, {
    method: 'PATCH',
    body: { activo },
  });

// ----- Conversaciones y mensajes -----
export const getConversacionesApi = (sessionId, sesionId) =>
  fetchWithAuth(`/whatsapp/sesiones/${sesionId}/conversaciones`, sessionId);

export const getMensajesApi = (sessionId, conversacionId) =>
  fetchWithAuth(`/whatsapp/conversaciones/${conversacionId}/mensajes`, sessionId);

export const enviarMensajeApi = (sessionId, conversacionId, texto) =>
  fetchWithAuth(`/whatsapp/conversaciones/${conversacionId}/mensajes`, sessionId, {
    method: 'POST',
    body: { texto },
  });

export const setAutoConversacionApi = (sessionId, conversacionId, activo) =>
  fetchWithAuth(`/whatsapp/conversaciones/${conversacionId}/auto`, sessionId, {
    method: 'PATCH',
    body: { activo },
  });
