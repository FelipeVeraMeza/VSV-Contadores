import { fetchWithAuth } from './apiClient';

// Credencial global del usuario (5 campos para facturar). Desencriptadas al leer,
// se encriptan en el backend al guardar.
export const getCredencialGlobalApi = (sessionId) => {
  return fetchWithAuth('/credenciales/global', sessionId);
};

export const saveCredencialGlobalApi = (sessionId, data) => {
  return fetchWithAuth('/credenciales/global', sessionId, {
    method: 'PUT',
    body: data
  });
};
