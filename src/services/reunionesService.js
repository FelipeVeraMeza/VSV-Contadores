import { fetchWithAuth } from './apiClient';

// Reuniones. El servidor solo maneja el contexto —quién, cuándo, de qué
// cliente, qué se acordó—; el video lo sirve Jitsi directamente entre los
// navegadores (ver SalaJitsi.jsx).

export const listarReunionesApi = (sessionId, { cuando = 'proximas', personaId, tareaId, desde, hasta } = {}) => {
  const qs = new URLSearchParams({ cuando });
  if (personaId) qs.set('personaId', personaId);
  if (tareaId) qs.set('tareaId', tareaId);
  // El calendario pide un rango de fechas: necesita el mes entero, con las
  // pasadas y las futuras juntas, que es lo que 'proximas' y 'pasadas' separan.
  if (desde) qs.set('desde', desde);
  if (hasta) qs.set('hasta', hasta);
  return fetchWithAuth(`/reuniones?${qs.toString()}`, sessionId);
};

// Mover una reunión a otra fecha, conservando notas, invitados y la sala.
export const reagendarReunionApi = (sessionId, id, { iniciaAt, duracionMin }) =>
  fetchWithAuth(`/reuniones/${id}/reagendar`, sessionId, {
    method: 'PATCH',
    body: JSON.stringify({ iniciaAt, duracionMin }),
  });

export const obtenerReunionApi = (sessionId, id) =>
  fetchWithAuth(`/reuniones/${id}`, sessionId);

export const crearReunionApi = (sessionId, datos) =>
  fetchWithAuth('/reuniones', sessionId, { method: 'POST', body: datos });

// Devuelve el nombre de la sala. Es lo único que la pantalla necesita del
// servidor para levantar el video.
export const entrarReunionApi = (sessionId, id) =>
  fetchWithAuth(`/reuniones/${id}/entrar`, sessionId, { method: 'POST' });

export const salirReunionApi = (sessionId, id) =>
  fetchWithAuth(`/reuniones/${id}/salir`, sessionId, { method: 'POST' });

export const terminarReunionApi = (sessionId, id, notas) =>
  fetchWithAuth(`/reuniones/${id}/terminar`, sessionId, { method: 'POST', body: { notas } });

export const cancelarReunionApi = (sessionId, id) =>
  fetchWithAuth(`/reuniones/${id}/cancelar`, sessionId, { method: 'POST' });

// Invitados después de creada. Sumar puede cualquiera que esté en la reunión;
// sacar, solo quien la convocó (lo decide el servidor).
export const agregarParticipanteApi = (sessionId, id, usuarioId) =>
  fetchWithAuth(`/reuniones/${id}/participantes`, sessionId, { method: 'POST', body: { usuarioId } });

export const quitarParticipanteApi = (sessionId, id, usuarioId) =>
  fetchWithAuth(`/reuniones/${id}/participantes/${usuarioId}`, sessionId, { method: 'DELETE' });

// La nota de lo acordado se corrige después: al colgar se escribe apurado.
export const editarNotasApi = (sessionId, id, notas) =>
  fetchWithAuth(`/reuniones/${id}/notas`, sessionId, { method: 'PATCH', body: { notas } });

// Borra de verdad, no archiva. Solo reuniones ya terminadas o canceladas.
export const eliminarReunionApi = (sessionId, id) =>
  fetchWithAuth(`/reuniones/${id}`, sessionId, { method: 'DELETE' });
