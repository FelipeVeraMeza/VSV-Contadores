import { fetchWithAuth } from './apiClient';

export const getWhatsappEstadoApi = (sessionId) =>
  fetchWithAuth('/whatsapp/estado', sessionId);

export const iniciarWhatsappApi = (sessionId) =>
  fetchWithAuth('/whatsapp/iniciar', sessionId, { method: 'POST' });

export const getConversacionesApi = (sessionId) =>
  fetchWithAuth('/whatsapp/conversaciones', sessionId);

export const getMensajesApi = (sessionId, jid) =>
  fetchWithAuth(`/whatsapp/conversaciones/${encodeURIComponent(jid)}/mensajes`, sessionId);

export const enviarMensajeApi = (sessionId, jid, texto) =>
  fetchWithAuth(`/whatsapp/conversaciones/${encodeURIComponent(jid)}/mensajes`, sessionId, {
    method: 'POST',
    body: { texto },
  });

export const setAutoGlobalApi = (sessionId, activo) =>
  fetchWithAuth('/whatsapp/auto', sessionId, {
    method: 'PATCH',
    body: { activo },
  });

export const setAutoConversacionApi = (sessionId, jid, activo) =>
  fetchWithAuth(`/whatsapp/conversaciones/${encodeURIComponent(jid)}/auto`, sessionId, {
    method: 'PATCH',
    body: { activo },
  });
