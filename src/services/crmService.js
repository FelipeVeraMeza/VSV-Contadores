import { fetchWithAuth } from './apiClient';

export const getCrmDataApi = (sessionId, empresaId = null) => {
  return fetchWithAuth('/clientes/crm', sessionId, {}, empresaId);
};

export const updateClienteApi = (sessionId, empresaId, clientData) => {
  return fetchWithAuth(`/clientes/crm/${empresaId}`, sessionId, {
    method: 'PUT',
    body: clientData
  });
};

export const createNotaApi = (sessionId, empresaId, texto, tipo = 'conversacion') => {
  return fetchWithAuth(`/clientes/crm/${empresaId}/notas`, sessionId, {
    method: 'POST',
    body: { texto, tipo }
  });
};

export const toggleTicketApi = (sessionId, notaId, resuelto) => {
  return fetchWithAuth(`/clientes/crm/notas/${notaId}/resuelto`, sessionId, {
    method: 'PATCH',
    body: { resuelto }
  });
};

export const cambiarPlanApi = (sessionId, empresaId, planId, motivo = '') => {
  return fetchWithAuth(`/clientes/crm/${empresaId}/plan`, sessionId, {
    method: 'PUT',
    body: { planId, motivo }
  });
};

export const addServicioApi = (sessionId, empresaId, servicioId, precioPactado) => {
  return fetchWithAuth(`/clientes/crm/${empresaId}/servicios`, sessionId, {
    method: 'POST',
    body: { servicioId, precioPactado }
  });
};

export const removeServicioApi = (sessionId, empresaServicioId) => {
  return fetchWithAuth(`/clientes/crm/servicios/${empresaServicioId}`, sessionId, {
    method: 'DELETE'
  });
};
