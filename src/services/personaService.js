import { fetchWithAuth } from './apiClient';

/** `orden`: recientes (por omisión) | contacto | contacto_lejano | nombre | ultimo */
export const listarPersonasApi = (sessionId, { estado = '', q = '', ejecutivo = '', orden = '' } = {}) => {
  const params = new URLSearchParams();
  if (estado) params.set('estado', estado);
  if (q) params.set('q', q);
  if (ejecutivo) params.set('ejecutivo', ejecutivo);
  if (orden) params.set('orden', orden);
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

// ---- Agenda de acciones del prospecto (#5/#6/#7) ----
export const listarAccionesApi = (sessionId, personaId) =>
  fetchWithAuth(`/personas/${personaId}/acciones`, sessionId);

export const crearAccionApi = (sessionId, personaId, data) =>
  fetchWithAuth(`/personas/${personaId}/acciones`, sessionId, { method: 'POST', body: data });

export const completarAccionApi = (sessionId, accionId, estado = 'completada') =>
  fetchWithAuth(`/personas/acciones/${accionId}`, sessionId, { method: 'PATCH', body: { estado } });

export const eliminarAccionApi = (sessionId, accionId) =>
  fetchWithAuth(`/personas/acciones/${accionId}`, sessionId, { method: 'DELETE' });

// Crear un servicio de interés al vuelo (#4)
export const crearServicioApi = (sessionId, nombre, categoria = 'Soporte') =>
  fetchWithAuth('/personas/catalogos/servicio', sessionId, { method: 'POST', body: { nombre, categoria } });

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

export const eliminarNotaApi = (sessionId, notaId) => {
  return fetchWithAuth(`/personas/notas/${notaId}`, sessionId, { method: 'DELETE' });
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

// ---- Importar prospectos desde planilla ----
// La planilla se lee en el navegador y viajan las filas ya en JSON: así no hay
// que manejar archivos en el servidor y la vista previa es inmediata.
export const previsualizarImportacionApi = (sessionId, filas, mapa) =>
  fetchWithAuth('/personas/importar/previsualizar', sessionId, { method: 'POST', body: { filas, mapa } });

// Quien importa queda como dueño de los prospectos: el servidor toma el
// ejecutivo de la sesión, no de lo que mande la pantalla.
export const importarProspectosApi = (sessionId, filas, mapa, opciones = {}) =>
  fetchWithAuth('/personas/importar', sessionId, { method: 'POST', body: { filas, mapa, ...opciones } });
