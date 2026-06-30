import { fetchWithAuth } from './apiClient';

export const crearMovimientoCajaApi = (sessionId, data) =>
  fetchWithAuth('/caja', sessionId, { method: 'POST', body: data });

// Registrar varios movimientos a la vez ("hacer efectivo" en lote)
export const crearMovimientosCajaLoteApi = (sessionId, data) =>
  fetchWithAuth('/caja/lote', sessionId, { method: 'POST', body: data });

export const listarMovimientosCajaApi = (sessionId, empresaId, tipo, desde, hasta) => {
  const params = new URLSearchParams({ empresaId: empresaId ?? 'ALL', tipo });
  if (desde) params.set('desde', desde);
  if (hasta) params.set('hasta', hasta);
  return fetchWithAuth(`/caja?${params.toString()}`, sessionId);
};

export const eliminarMovimientoCajaApi = (sessionId, id) =>
  fetchWithAuth(`/caja/${id}`, sessionId, { method: 'DELETE' });
