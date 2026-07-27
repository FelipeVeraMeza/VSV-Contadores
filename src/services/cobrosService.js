import { fetchWithAuth } from './apiClient';

// Cobros del periodo (por defecto, el mes en curso)
export const getCobrosApi = (sessionId, { periodo, estado } = {}) => {
  const qs = new URLSearchParams();
  if (periodo) qs.set('periodo', periodo);
  if (estado) qs.set('estado', estado);
  const q = qs.toString();
  return fetchWithAuth(`/cobros${q ? `?${q}` : ''}`, sessionId);
};

// KPIs del periodo + aviso del día 26
export const getResumenCobrosApi = (sessionId, periodo) => {
  return fetchWithAuth(`/cobros/resumen${periodo ? `?periodo=${periodo}` : ''}`, sessionId);
};

// Genera los cobros POR_EMITIR del mes en curso
export const generarCobrosApi = (sessionId) => {
  return fetchWithAuth('/cobros/generar', sessionId, { method: 'POST' });
};

// Registra la emisión de la factura (folio + monto)
export const emitirCobroApi = (sessionId, cobroId, data) => {
  return fetchWithAuth(`/cobros/${cobroId}/emitir`, sessionId, { method: 'PUT', body: data });
};

// Marca pagada / pendiente de recibo / pendiente de pago
export const cambiarEstadoCobroApi = (sessionId, cobroId, estado) => {
  return fetchWithAuth(`/cobros/${cobroId}/estado`, sessionId, { method: 'PUT', body: { estado } });
};

// Recalcula los montos aún no emitidos según el precio del plan
export const recalcularMontosApi = (sessionId, periodo) => {
  return fetchWithAuth('/cobros/recalcular', sessionId, { method: 'POST', body: { periodo } });
};

// Corrige a mano el monto esperado de un cobro (excepciones negociadas)
export const editarMontoCobroApi = (sessionId, cobroId, montoEsperado) => {
  return fetchWithAuth(`/cobros/${cobroId}/monto`, sessionId, { method: 'PUT', body: { montoEsperado } });
};

// Previsualiza la facturación masiva: lista lo que se emitiría (para revisar/editar)
export const previsualizarFacturacionApi = (sessionId) => {
  return fetchWithAuth('/cobros/previsualizar-facturacion', sessionId);
};

// Facturación masiva: emite el lote. Si se pasa `facturas` (lista revisada), emite
// exactamente esa; si no, el backend la arma sola desde la BD.
export const facturarMasivoApi = (sessionId, facturas) => {
  return fetchWithAuth('/cobros/facturar-masivo', sessionId,
    { method: 'POST', body: facturas ? { facturas } : {} });
};

// Progreso en vivo del robot masivo
export const progresoFacturacionApi = (sessionId) => {
  return fetchWithAuth('/cobros/progreso', sessionId);
};

// Vincula los folios emitidos con sus cobros (POR_EMITIR → PENDIENTE_PAGO)
export const vincularFoliosApi = (sessionId) => {
  return fetchWithAuth('/cobros/vincular-folios', sessionId, { method: 'POST' });
};
