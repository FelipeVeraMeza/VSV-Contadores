// ============================================================================
// PUENTE HACIA VSV AI
// ----------------------------------------------------------------------------
// El frontend le habla SOLO a este backend. Acá se reenvía a VSV AI, que corre
// en su propio contenedor porque está escrito en Python.
//
//   Frontend  →  /api/asistente/chat  →  [esto]  →  VSV AI (Python)  →  modelo
//
// POR QUÉ UN PUENTE Y NO DOS URLs EN EL FRONTEND
//   · Una sola dirección que configurar y que mantener.
//   · La sesión ya viene validada por requireSession: al asistente le llega el
//     usuario resuelto, no una cabecera que tenga que volver a comprobar.
//   · Un CORS menos. El navegador nunca habla con VSV AI.
//
// POR QUÉ VSV AI SIGUE SIENDO UN SERVICIO APARTE
// Si se cuelga o se queda sin memoria, se cae SOLO él. Facturación,
// Contabilidad y el resto siguen funcionando. Es la parte más nueva del sistema
// y no puede llevarse por delante a los módulos que ya son estables.
// ============================================================================

// Sin la variable, el asistente queda apagado y se responde 503. No se inventa
// un valor por omisión: apuntar a una URL equivocada daría errores de red
// confusos en vez de un "no está configurado" claro.
const VSV_AI_URL = (process.env.VSV_AI_URL || '').replace(/\/$/, '');

// El modelo hace dos pasadas —decide y redacta— y la primera consulta del día
// lo encuentra en frío. Cortar antes daría "no responde" con el asistente
// todavía trabajando.
const TIEMPO_LIMITE_MS = 90_000;
const TIEMPO_LIMITE_SALUD_MS = 5_000;

/**
 * Reenvía a VSV AI con la sesión del usuario.
 *
 * VSV AI vuelve a llamar a ESTE backend para consultar los datos, usando la
 * misma sesión. Suena redundante, pero es lo que hace que el asistente no pueda
 * ver nada que el usuario no pueda ver: no hay una credencial de servicio con
 * la que saltarse los permisos.
 */
async function llamarAsistente(ruta, { metodo = 'GET', cuerpo, req, tiempoLimite = TIEMPO_LIMITE_MS }) {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), tiempoLimite);

  try {
    const respuesta = await fetch(`${VSV_AI_URL}${ruta}`, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        // La sesión viaja tal cual: VSV AI la reenvía a este backend cuando
        // consulta datos, y ahí requireSession la valida como cualquier otra.
        'x-session-id': req.user.sessionId,
        ...(req.user.empresaId ? { 'x-company-id': req.user.empresaId } : {}),
      },
      ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
      signal: control.signal,
    });

    const texto = await respuesta.text();
    let datos;
    try {
      datos = texto ? JSON.parse(texto) : {};
    } catch {
      // VSV AI devolvió algo que no es JSON: normalmente una página de error del
      // contenedor. Se registra completo y al usuario se le da algo legible.
      console.error('⚠️ VSV AI respondió algo que no es JSON:', texto.slice(0, 300));
      return { ok: false, status: 502, datos: { message: 'El asistente respondió de forma inesperada.' } };
    }
    return { ok: respuesta.ok, status: respuesta.status, datos };
  } finally {
    clearTimeout(temporizador);
  }
}

/** Traduce un fallo de red a algo que el usuario pueda entender. */
function explicarFallo(error) {
  if (error.name === 'AbortError' || error.name === 'TimeoutError') {
    return { status: 504, message: 'El asistente demoró demasiado. Inténtalo de nuevo.' };
  }
  // ECONNREFUSED, ENOTFOUND y compañía: el contenedor está caído o mal
  // apuntado. Nunca se devuelve el mensaje original — trae la URL interna.
  return { status: 503, message: 'El asistente no está disponible en este momento.' };
}

// ── POST /api/asistente/chat ────────────────────────────────────────────────
export const conversar = async (req, res) => {
  if (!VSV_AI_URL) {
    return res.status(503).json({
      message: 'El asistente todavía no está habilitado en este ambiente.',
      motivo: 'sin_configurar',
    });
  }

  const { mensaje, conversacionId } = req.body || {};
  if (typeof mensaje !== 'string' || !mensaje.trim()) {
    return res.status(400).json({ message: 'Falta el mensaje.' });
  }
  // El tope existe acá además de en VSV AI: un mensaje enorme es tiempo de
  // inferencia, y conviene cortarlo antes de que salga de este servidor.
  if (mensaje.length > 2000) {
    return res.status(400).json({ message: 'El mensaje es demasiado largo (máximo 2.000 caracteres).' });
  }

  try {
    const r = await llamarAsistente('/api/chat', {
      metodo: 'POST',
      cuerpo: { mensaje: mensaje.trim(), conversacion_id: conversacionId || 'default' },
      req,
    });

    if (!r.ok) {
      // Solo se le repite al usuario el mensaje de VSV AI cuando el error es
      // ESPERADO (503: el modelo no está). Un 500 significa que algo se rompió
      // ahí adentro, y su `detail` puede traer una traza, una ruta del servidor
      // o una cadena de conexión. Eso se registra, no se reenvía.
      const esperado = r.status === 503;
      if (!esperado) {
        console.error('❌ VSV AI respondió', r.status, JSON.stringify(r.datos).slice(0, 300));
      }
      return res.status(esperado ? 503 : 502).json({
        message: esperado
          ? (r.datos?.detail || 'El asistente no está disponible en este momento.')
          : 'El asistente no pudo responder. Inténtalo de nuevo.',
      });
    }
    return res.json(r.datos);
  } catch (error) {
    console.error('❌ Error consultando a VSV AI:', error.name, error.message);
    const { status, message } = explicarFallo(error);
    return res.status(status).json({ message });
  }
};

// ── DELETE /api/asistente/chat/:conversacionId ──────────────────────────────
export const olvidarConversacion = async (req, res) => {
  if (!VSV_AI_URL) return res.json({ ok: true });   // nada que olvidar

  try {
    await llamarAsistente(`/api/chat/${encodeURIComponent(req.params.conversacionId)}`, {
      metodo: 'DELETE',
      req,
      tiempoLimite: TIEMPO_LIMITE_SALUD_MS,
    });
  } catch (error) {
    // Si falla, el usuario ya vació su pantalla. Un error acá no le sirve de
    // nada y la conversación caduca sola.
    console.warn('⚠️ No se pudo borrar la conversación en VSV AI:', error.message);
  }
  return res.json({ ok: true });
};

// ── GET /api/asistente/estado ───────────────────────────────────────────────
// El panel lo consulta al abrirse para desactivar la caja de escritura en vez
// de aceptar una pregunta y fallar después.
export const estado = async (req, res) => {
  if (!VSV_AI_URL) {
    return res.json({ disponible: false, motivo: 'sin_configurar' });
  }

  try {
    const r = await llamarAsistente('/salud', { req, tiempoLimite: TIEMPO_LIMITE_SALUD_MS });
    if (!r.ok) return res.json({ disponible: false, motivo: 'servicio_caido' });

    const disponible = r.datos?.modelo_alcanzable === true;
    return res.json({
      disponible,
      // Se distingue el servicio caído del modelo caído: son problemas
      // distintos y el mensaje al usuario también.
      motivo: disponible ? null : 'modelo_caido',
      modelo: r.datos?.modelo ?? null,
    });
  } catch {
    return res.json({ disponible: false, motivo: 'servicio_caido' });
  }
};
