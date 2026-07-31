// =====================================================================
// 📄 LLAMADAS AL FACTURADOR (rutas /api/dte/*)
// ---------------------------------------------------------------------
// Punto ÚNICO de entrada. Antes cada pantalla hacía su propio `fetch` y
// armaba las cabeceras a mano: 18 llamadas repartidas en 7 archivos. Por eso
// se coló el bug del registro de correos, que pedía los datos sin la cabecera
// de sesión, recibía 401 y mostraba la tabla vacía aunque hubiera 169 filas.
//
// Con esto, agregar `requireSession` en el servidor deja de ser riesgoso:
// todas las llamadas ya viajan autenticadas.
//
// OJO: acá NO se usa `fetchWithAuth` de apiClient.js a propósito. Ese envoltorio
// pasa todas las respuestas por `mapperToCamel`, que reescribiría las llaves de
// los objetos `datos` (jsonb) que el reenvío de correos devuelve y vuelve a
// mandar. Se usa `fetch` directo para que la forma de las respuestas quede
// exactamente igual que antes.
//
// Este archivo también lo importa el backend (dte.controllers.js), así que no
// puede tocar APIs del navegador fuera de una función.
// =====================================================================
import { API_BASE_URL } from "../../config.js";

const sesionActual = () => {
  if (typeof localStorage === 'undefined') return '';
  try {
    return JSON.parse(localStorage.getItem('user') || '{}')?.sessionId || '';
  } catch {
    return '';
  }
};

/**
 * `fetch` contra /api/dte con la sesión siempre puesta.
 * Devuelve la Response tal cual, igual que el `fetch` que reemplaza.
 */
export const dteFetch = (ruta, opciones = {}) => {
  const { body, headers, ...resto } = opciones;
  const llevaCuerpo = body !== undefined && body !== null;

  return fetch(`${API_BASE_URL}/dte${ruta}`, {
    ...resto,
    headers: {
      ...(llevaCuerpo ? { 'Content-Type': 'application/json' } : {}),
      'x-session-id': sesionActual(),
      ...headers,
    },
    ...(llevaCuerpo ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });
};

// ---------------------------------------------------------------------
// Emisión
// ---------------------------------------------------------------------
export const emitirManual        = (payload)  => dteFetch('/emitir-manual', { method: 'POST', body: payload });
export const emitirMasivo        = (facturas) => dteFetch('/emitir-masivo', { method: 'POST', body: { facturas } });
export const getProgresoMasivo   = ()         => dteFetch('/progreso-masivo');
export const detenerMasivo       = ()         => dteFetch('/detener-masivo', { method: 'POST' });

export const emitirExentaManual      = (payload)  => dteFetch('/emitir-exenta-manual', { method: 'POST', body: payload });
export const emitirMasivoExenta      = (facturas) => dteFetch('/emitir-masivo-exenta', { method: 'POST', body: { facturas } });
export const getProgresoMasivoExenta = ()         => dteFetch('/progreso-masivo-exenta');
export const detenerRobotExenta      = ()         => dteFetch('/detener-robot-exenta', { method: 'POST' });

export const emitirNota = (payload) => dteFetch('/emitir-nota', { method: 'POST', body: payload });
export const emitirDte  = (dteJson) => dteFetch('/emitir-dte',  { method: 'POST', body: { dteJson } });

// ---------------------------------------------------------------------
// Correos
// ---------------------------------------------------------------------
export const getCorreosLog          = ()              => dteFetch('/correos-log');
export const reenviarCorreo         = (folio, datos)  => dteFetch('/reenviar-correo', { method: 'POST', body: { folio, datos: datos || null } });
export const reenviarCorreosMasivo  = (items)         => dteFetch('/reenviar-correos-masivo', { method: 'POST', body: { items } });

// ---------------------------------------------------------------------
// Recordatorios de pago
// ---------------------------------------------------------------------
export const previewRecordatorios = (folios) => {
  const query = folios?.length ? `?folios=${encodeURIComponent(folios.join(','))}` : '';
  return dteFetch(`/recordatorios/preview${query}`);
};
export const enviarRecordatorios     = (folios) => dteFetch('/enviar-recordatorios', { method: 'POST', body: folios?.length ? { folios } : {} });
export const getProgresoRecordatorios = ()      => dteFetch('/recordatorios/progreso');

// ---------------------------------------------------------------------
// Compatibilidad: lo usaba GuiaDespachoModal antes de este archivo.
// ---------------------------------------------------------------------
export async function enviarDteABackend(dteJson) {
  const res = await emitirDte(dteJson);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Error enviando DTE al búnker");
  }
  return res.json();
}
