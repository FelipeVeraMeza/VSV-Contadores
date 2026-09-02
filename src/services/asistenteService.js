// ============================================================================
// SERVICIO DEL ASISTENTE · VSV AI
// ----------------------------------------------------------------------------
// El frontend le habla al backend de VSV PRO, como cualquier otro módulo. El
// backend hace de puente hacia VSV AI, que corre aparte porque está en Python.
//
//   este archivo → /api/asistente/* → backend → VSV AI → modelo
//
// Por eso acá no hay ninguna URL propia ni cabeceras a mano: se usa
// `fetchWithAuth`, igual que cobrosService o accountingService.
// ============================================================================
import { fetchWithAuth } from './apiClient.js';

// El modelo hace dos pasadas —decide y redacta— y la primera consulta del día
// lo encuentra en frío. Cortar a los 30 s daría «no responde» con el asistente
// todavía trabajando.
const TIEMPO_LIMITE_MS = 95_000;

/** Mensaje legible desde una respuesta de error, sin filtrar detalles internos. */
async function mensajeDeError(res, porOmision) {
  try {
    const cuerpo = await res.json();
    return cuerpo?.message || porOmision;
  } catch {
    return porOmision;
  }
}

export async function preguntar({ mensaje, conversacionId, sessionId, empresaId, signal }) {
  const abortador = new AbortController();
  const temporizador = setTimeout(() => abortador.abort(), TIEMPO_LIMITE_MS);
  // Se combina el corte por tiempo con el que venga de afuera (cerrar el panel).
  signal?.addEventListener('abort', () => abortador.abort(), { once: true });

  try {
    const res = await fetchWithAuth('/asistente/chat', sessionId, {
      method: 'POST',
      body: { mensaje, conversacionId },
      signal: abortador.signal,
    }, empresaId);

    if (res.status === 401) throw new Error('Tu sesión expiró. Vuelve a entrar.');
    if (!res.ok) {
      throw new Error(await mensajeDeError(res, 'No pude responder. Inténtalo de nuevo.'));
    }
    return await res.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('La consulta demoró demasiado. Inténtalo de nuevo.');
    }
    throw error;
  } finally {
    clearTimeout(temporizador);
  }
}

/** Borra el hilo en el servidor. Si falla no se avisa: el usuario ya vació la
 *  pantalla y un error acá no le sirve de nada. */
export async function olvidarConversacion({ conversacionId, sessionId }) {
  try {
    await fetchWithAuth(`/asistente/chat/${encodeURIComponent(conversacionId)}`, sessionId, {
      method: 'DELETE',
    });
  } catch { /* no molestar al usuario por esto */ }
}

/**
 * Si el asistente puede responder ahora mismo. El panel lo consulta al abrirse
 * para desactivar la entrada en vez de aceptar una pregunta y fallar después.
 *
 * `motivo` distingue tres situaciones que se ven igual desde afuera pero no lo
 * son: no está habilitado en este ambiente, el servicio no responde, o el
 * servicio está bien y el modelo no.
 */
export async function estadoAsistente({ sessionId } = {}) {
  try {
    const res = await fetchWithAuth('/asistente/estado', sessionId, { method: 'GET' });
    if (!res.ok) return { disponible: false, motivo: 'servicio_caido' };
    return await res.json();
  } catch {
    return { disponible: false, motivo: 'servicio_caido' };
  }
}
