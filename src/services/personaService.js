import { fetchWithAuth } from './apiClient';

export const listarPersonasApi = (sessionId, { estado = '', q = '' } = {}) => {
  const params = new URLSearchParams();
  if (estado) params.set('estado', estado);
  if (q) params.set('q', q);
  const qs = params.toString();
  return fetchWithAuth(`/personas${qs ? `?${qs}` : ''}`, sessionId);
};

export const crearPersonaApi = (sessionId, data) => {
  return fetchWithAuth('/personas', sessionId, {
    method: 'POST',
    body: data
  });
};

export const obtenerPersonaApi = (sessionId, id) => {
  return fetchWithAuth(`/personas/${id}`, sessionId);
};

export const actualizarPersonaApi = (sessionId, id, data) => {
  return fetchWithAuth(`/personas/${id}`, sessionId, { method: 'PUT', body: data });
};

export const agregarNotaPersonaApi = (sessionId, id, texto) => {
  return fetchWithAuth(`/personas/${id}/notas`, sessionId, { method: 'POST', body: { texto } });
};

export const cambiarEstadoPersonaApi = (sessionId, id, estado, motivo = '') => {
  return fetchWithAuth(`/personas/${id}/estado`, sessionId, { method: 'PUT', body: { estado, motivo } });
};

export const eliminarPersonaApi = (sessionId, id) => {
  return fetchWithAuth(`/personas/${id}`, sessionId, { method: 'DELETE' });
};

export const getCatalogosApi = (sessionId) => {
  return fetchWithAuth('/personas/catalogos', sessionId);
};

export const getEmpresasListaApi = (sessionId, q = '') => {
  const qs = q ? `?q=${encodeURIComponent(q)}` : '';
  return fetchWithAuth(`/personas/empresas-lista${qs}`, sessionId);
};

export const editarNotaApi = (sessionId, notaId, texto) => {
  return fetchWithAuth(`/personas/notas/${notaId}`, sessionId, { method: 'PATCH', body: { texto } });
};

export const asociarEmpresaApi = (sessionId, personaId, data) => {
  return fetchWithAuth(`/personas/${personaId}/empresas`, sessionId, { method: 'POST', body: data });
};

export const crearEmpresaParaPersonaApi = (sessionId, personaId, data) => {
  return fetchWithAuth(`/personas/${personaId}/empresas/nueva`, sessionId, { method: 'POST', body: data });
};

export const desasociarEmpresaApi = (sessionId, personaId, empresaId) => {
  return fetchWithAuth(`/personas/${personaId}/empresas/${empresaId}`, sessionId, { method: 'DELETE' });
};

export const fusionarPersonaApi = (sessionId, personaId, duplicadoId) => {
  return fetchWithAuth(`/personas/${personaId}/fusionar`, sessionId, { method: 'POST', body: { duplicadoId } });
};

export const buscarDuplicadosApi = (sessionId, { rut = '', correo = '', telefono = '', nombre = '', apellidos = '' }) => {
  const params = new URLSearchParams();
  if (rut) params.set('rut', rut);
  if (correo) params.set('correo', correo);
  if (telefono) params.set('telefono', telefono);
  if (nombre) params.set('nombre', nombre);
  if (apellidos) params.set('apellidos', apellidos);
  return fetchWithAuth(`/personas/duplicados?${params.toString()}`, sessionId);
};
