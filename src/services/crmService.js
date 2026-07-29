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

export const crearEmpresaApi = (sessionId, empresaData) => {
  return fetchWithAuth('/clientes/crm', sessionId, {
    method: 'POST',
    body: empresaData
  });
};

export const eliminarEmpresaApi = (sessionId, empresaId) => {
  return fetchWithAuth(`/clientes/crm/${empresaId}`, sessionId, {
    method: 'DELETE'
  });
};

export const createNotaApi = (sessionId, empresaId, texto, tipo = 'conversacion', meta = {}) => {
  return fetchWithAuth(`/clientes/crm/${empresaId}/notas`, sessionId, {
    method: 'POST',
    body: { texto, tipo, ...meta }
  });
};

export const editarNotaApi = (sessionId, notaId, data) => {
  return fetchWithAuth(`/clientes/crm/notas/${notaId}`, sessionId, {
    method: 'PATCH',
    body: data
  });
};

export const eliminarNotaApi = (sessionId, notaId) => {
  return fetchWithAuth(`/clientes/crm/notas/${notaId}`, sessionId, {
    method: 'DELETE'
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

export const addServicioApi = (sessionId, empresaId, data) => {
  // data: { servicioId, precioPactado, periodicidad, primeraFacturacion }
  return fetchWithAuth(`/clientes/crm/${empresaId}/servicios`, sessionId, {
    method: 'POST',
    body: data
  });
};

export const removeServicioApi = (sessionId, empresaServicioId) => {
  return fetchWithAuth(`/clientes/crm/servicios/${empresaServicioId}`, sessionId, {
    method: 'DELETE'
  });
};

export const reactivarServicioApi = (sessionId, empresaServicioId) => {
  return fetchWithAuth(`/clientes/crm/servicios/${empresaServicioId}/reactivar`, sessionId, {
    method: 'PATCH'
  });
};

// ============================================================
// Dashboard: métricas y meta mensual
// ============================================================
export const getMetricasCrmApi = (sessionId, { periodo = '', scope = '', seguimientoDias = '', desde = '', hasta = '' } = {}) => {
  const p = new URLSearchParams();
  if (periodo) p.set('periodo', periodo);
  if (scope) p.set('scope', scope);
  if (seguimientoDias) p.set('seguimientoDias', seguimientoDias);
  if (desde) p.set('desde', desde);
  if (hasta) p.set('hasta', hasta);
  const qs = p.toString();
  return fetchWithAuth(`/crm/metricas${qs ? `?${qs}` : ''}`, sessionId);
};

export const guardarMetaCrmApi = (sessionId, metaMensual) =>
  fetchWithAuth('/crm/meta', sessionId, { method: 'PUT', body: { metaMensual } });

// ============================================================
// Tareas / actividades (dashboard, WhatsApp, automatización)
// ============================================================
export const listarTareasApi = (sessionId, { estado = '', tipo = '', personaId = '', desde = '', hasta = '', scope = '' } = {}) => {
  const p = new URLSearchParams();
  if (estado) p.set('estado', estado);
  if (tipo) p.set('tipo', tipo);
  if (personaId) p.set('personaId', personaId);
  if (desde) p.set('desde', desde);
  if (hasta) p.set('hasta', hasta);
  if (scope) p.set('scope', scope);
  const qs = p.toString();
  return fetchWithAuth(`/crm/tareas${qs ? `?${qs}` : ''}`, sessionId);
};

export const crearTareaApi = (sessionId, data) =>
  fetchWithAuth('/crm/tareas', sessionId, { method: 'POST', body: data });

export const actualizarTareaApi = (sessionId, id, data) =>
  fetchWithAuth(`/crm/tareas/${id}`, sessionId, { method: 'PUT', body: data });

export const completarTareaApi = (sessionId, id) =>
  fetchWithAuth(`/crm/tareas/${id}`, sessionId, { method: 'PUT', body: { estado: 'completada' } });

export const eliminarTareaApi = (sessionId, id) =>
  fetchWithAuth(`/crm/tareas/${id}`, sessionId, { method: 'DELETE' });

export const limpiarTareasCompletadasApi = (sessionId, scope = '') =>
  fetchWithAuth(`/crm/tareas/completadas${scope ? `?scope=${scope}` : ''}`, sessionId, { method: 'DELETE' });

// ---- Módulo de Tareas: detalle, subtareas, comentarios ----
export const obtenerTareaApi = (sessionId, id) =>
  fetchWithAuth(`/crm/tareas/${id}`, sessionId);

export const agregarComentarioApi = (sessionId, tareaId, texto) =>
  fetchWithAuth(`/crm/tareas/${tareaId}/comentarios`, sessionId, { method: 'POST', body: { texto } });

export const eliminarComentarioApi = (sessionId, comentarioId) =>
  fetchWithAuth(`/crm/comentarios/${comentarioId}`, sessionId, { method: 'DELETE' });

// ---- Adjuntos (binario en la base) ----
export const subirAdjuntoApi = (sessionId, tareaId, data) =>
  fetchWithAuth(`/crm/tareas/${tareaId}/adjuntos`, sessionId, { method: 'POST', body: data });

// Devuelve la Response cruda; el llamador hace .blob() para descargar.
export const descargarAdjuntoApi = (sessionId, adjuntoId) =>
  fetchWithAuth(`/crm/adjuntos/${adjuntoId}`, sessionId);

export const eliminarAdjuntoApi = (sessionId, adjuntoId) =>
  fetchWithAuth(`/crm/adjuntos/${adjuntoId}`, sessionId, { method: 'DELETE' });

// ---- Proyectos ----
export const listarProyectosApi = (sessionId) =>
  fetchWithAuth('/crm/proyectos', sessionId);

export const crearProyectoApi = (sessionId, data) =>
  fetchWithAuth('/crm/proyectos', sessionId, { method: 'POST', body: data });

export const actualizarProyectoApi = (sessionId, id, data) =>
  fetchWithAuth(`/crm/proyectos/${id}`, sessionId, { method: 'PUT', body: data });

export const eliminarProyectoApi = (sessionId, id) =>
  fetchWithAuth(`/crm/proyectos/${id}`, sessionId, { method: 'DELETE' });
