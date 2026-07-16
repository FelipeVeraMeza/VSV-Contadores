// ===============================================================
// Repositorio de WhatsApp: todo el acceso a la BD vive aquí.
// El motor (whatsappBot) y los controladores no escriben SQL.
// ===============================================================
import { pool } from '../../database/db.js'

// ----------------------------------------------------------------
// Alcance / permisos
// ----------------------------------------------------------------

// OJO (seguridad): req.user.empresaId viene del header 'x-company-id', que lo
// manda el navegador y por tanto NO es de fiar para autorizar. Para un Cliente
// resolvemos su empresa real desde la BD.
export async function resolverScope(user) {
  if (user.rol === 'Administrador') {
    return { rol: 'Administrador', organizacionId: user.organizacionId, empresaId: null }
  }
  const { rows } = await pool.query(
    'SELECT empresa_id, organizacion_id FROM usuario WHERE id = $1 AND activo = true',
    [user.usuarioId]
  )
  if (!rows.length) return { rol: user.rol, organizacionId: null, empresaId: null }
  return {
    rol: user.rol,
    organizacionId: rows[0].organizacion_id,
    empresaId: rows[0].empresa_id,
  }
}

// ¿Este usuario puede tocar esta sesión?
//   Administrador -> cualquier sesión de SU organización
//   Cliente       -> solo la sesión de SU empresa
export async function puedeAcceder(scope, sesionId) {
  const s = await obtenerSesion(sesionId)
  if (!s) return false
  if (scope.rol === 'Administrador') return s.organizacion_id === scope.organizacionId
  return !!scope.empresaId && s.empresa_id === scope.empresaId
}

// ----------------------------------------------------------------
// Sesiones
// ----------------------------------------------------------------

export async function listarSesiones(scope) {
  if (scope.rol === 'Administrador') {
    const { rows } = await pool.query(
      `SELECT s.*, e.razon_social AS empresa_nombre
         FROM whatsapp_sesion s
         LEFT JOIN empresa e ON e.id = s.empresa_id
        WHERE s.organizacion_id = $1 AND s.activo = true
        ORDER BY s.created_at`,
      [scope.organizacionId]
    )
    return rows
  }
  if (!scope.empresaId) return []
  const { rows } = await pool.query(
    `SELECT s.*, e.razon_social AS empresa_nombre
       FROM whatsapp_sesion s
       LEFT JOIN empresa e ON e.id = s.empresa_id
      WHERE s.empresa_id = $1 AND s.activo = true
      ORDER BY s.created_at`,
    [scope.empresaId]
  )
  return rows
}

export async function obtenerSesion(sesionId) {
  const { rows } = await pool.query('SELECT * FROM whatsapp_sesion WHERE id = $1', [sesionId])
  return rows[0] || null
}

// Todas las sesiones activas de todas las organizaciones (para reconectar al
// arrancar el servidor).
export async function listarSesionesActivas() {
  const { rows } = await pool.query(
    'SELECT * FROM whatsapp_sesion WHERE activo = true'
  )
  return rows
}

export async function crearSesion({ organizacionId, empresaId = null, nombre, creadoPor = null }) {
  const { rows } = await pool.query(
    `INSERT INTO whatsapp_sesion (organizacion_id, empresa_id, nombre, creado_por)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [organizacionId, empresaId, nombre, creadoPor]
  )
  return rows[0]
}

export async function actualizarEstadoSesion(sesionId, estado, telefono = null) {
  // Los ::varchar son necesarios: sin ellos Postgres no logra deducir el tipo
  // de $2 al usarse a la vez en la asignación y dentro del CASE
  // ("inconsistent types deduced for parameter $2").
  const { rows } = await pool.query(
    `UPDATE whatsapp_sesion
        SET estado = $2::varchar,
            telefono = COALESCE($3::varchar, telefono),
            ultimo_conectado_at = CASE WHEN $2::varchar = 'conectado'
                                       THEN now() ELSE ultimo_conectado_at END,
            updated_at = now()
      WHERE id = $1 RETURNING *`,
    [sesionId, estado, telefono]
  )
  return rows[0] || null
}

export async function setAutoIaSesion(sesionId, valor) {
  const { rows } = await pool.query(
    'UPDATE whatsapp_sesion SET auto_ia = $2, updated_at = now() WHERE id = $1 RETURNING auto_ia',
    [sesionId, !!valor]
  )
  return rows[0]?.auto_ia ?? null
}

// Baja lógica: conserva el historial de conversaciones.
export async function desactivarSesion(sesionId) {
  await pool.query(
    `UPDATE whatsapp_sesion SET activo = false, estado = 'desconectado', updated_at = now()
      WHERE id = $1`,
    [sesionId]
  )
}

// ----------------------------------------------------------------
// Conversaciones
// ----------------------------------------------------------------

const telefonoDe = (jid) => (jid || '').split('@')[0]

export async function obtenerOCrearConversacion(sesionId, jid, nombreContacto = null) {
  const telefono = telefonoDe(jid)
  const { rows } = await pool.query(
    `INSERT INTO whatsapp_conversacion (sesion_id, jid, telefono, nombre_contacto)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (sesion_id, jid) DO UPDATE
       SET nombre_contacto = COALESCE(EXCLUDED.nombre_contacto, whatsapp_conversacion.nombre_contacto),
           updated_at = now()
     RETURNING *`,
    [sesionId, jid, telefono, nombreContacto]
  )
  const conv = rows[0]

  // RF-25: si aún no sabemos de qué empresa es, intentamos identificarla.
  if (!conv.empresa_id) {
    const empresaId = await buscarEmpresaPorTelefono(telefono, sesionId)
    if (empresaId) {
      await pool.query('UPDATE whatsapp_conversacion SET empresa_id = $2 WHERE id = $1', [conv.id, empresaId])
      conv.empresa_id = empresaId
    }
  }
  return conv
}

// Cruza el teléfono del contacto contra las empresas de la organización dueña
// de la sesión. Los números del CRM vienen como '56 9 5954 3856' y el JID como
// '56959543856', así que comparamos solo dígitos.
//
// Se comparan los últimos 9 (el móvil chileno sin el código de país) para que
// dé igual si el número está guardado con o sin '56'.
//
// IMPORTANTE: si hay más de una empresa con ese teléfono (pasa: mismo dueño con
// dos sociedades) NO adivinamos — se deja sin vincular para no atribuir la
// conversación a la empresa equivocada.
export async function buscarEmpresaPorTelefono(telefono, sesionId) {
  const digitos = (telefono || '').replace(/\D/g, '')
  if (digitos.length < 8) return null

  const { rows } = await pool.query(
    `SELECT e.id
       FROM empresa e
       JOIN whatsapp_sesion s ON s.id = $2
      WHERE e.organizacion_id = s.organizacion_id
        AND e.activo = true
        AND right(regexp_replace(
              COALESCE(NULLIF(e.whatsapp, ''), e.telefono_corporativo, ''),
              '[^0-9]', '', 'g'), 9) = right($1, 9)
        AND length(regexp_replace(
              COALESCE(NULLIF(e.whatsapp, ''), e.telefono_corporativo, ''),
              '[^0-9]', '', 'g')) >= 8
      LIMIT 2`,
    [digitos, sesionId]
  )
  // 0 = desconocido, 2 = ambiguo -> en ambos casos, sin vincular.
  return rows.length === 1 ? rows[0].id : null
}

// RF-14: /reiniciar — corta el historial que ve la IA sin borrar el chat.
export async function reiniciarHilaIA(conversacionId) {
  await pool.query(
    'UPDATE whatsapp_conversacion SET ia_reset_at = now(), updated_at = now() WHERE id = $1',
    [conversacionId]
  )
}

// RF-06: recibos de entrega de WhatsApp.
export async function actualizarEstadoMensaje(waMessageId, estado) {
  await pool.query(
    'UPDATE whatsapp_mensaje SET estado = $2 WHERE wa_message_id = $1',
    [waMessageId, estado]
  )
}

export async function listarConversaciones(sesionId) {
  const { rows } = await pool.query(
    `SELECT c.id, c.jid, c.telefono, c.nombre_contacto, c.no_leidos, c.auto_ia,
            c.ultimo_mensaje_preview, c.ultimo_mensaje_at, c.empresa_id,
            e.razon_social AS empresa_nombre
       FROM whatsapp_conversacion c
       LEFT JOIN empresa e ON e.id = c.empresa_id
      WHERE c.sesion_id = $1
      ORDER BY c.ultimo_mensaje_at DESC NULLS LAST`,
    [sesionId]
  )
  return rows
}

export async function obtenerConversacion(conversacionId) {
  const { rows } = await pool.query(
    'SELECT * FROM whatsapp_conversacion WHERE id = $1',
    [conversacionId]
  )
  return rows[0] || null
}

export async function marcarLeido(conversacionId) {
  await pool.query(
    'UPDATE whatsapp_conversacion SET no_leidos = 0, updated_at = now() WHERE id = $1',
    [conversacionId]
  )
}

export async function setAutoIaConversacion(conversacionId, valor) {
  const { rows } = await pool.query(
    'UPDATE whatsapp_conversacion SET auto_ia = $2, updated_at = now() WHERE id = $1 RETURNING auto_ia',
    [conversacionId, !!valor]
  )
  return rows[0]?.auto_ia ?? null
}

// ----------------------------------------------------------------
// Mensajes
// ----------------------------------------------------------------

export async function guardarMensaje({
  conversacionId, direccion, cuerpo, tipo = 'text',
  waMessageId = null, estado = 'enviado', esIA = false, enviadoPor = null,
}) {
  const { rows } = await pool.query(
    `INSERT INTO whatsapp_mensaje
       (conversacion_id, direccion, tipo, cuerpo, wa_message_id, estado, es_ia, enviado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (wa_message_id) DO NOTHING
     RETURNING *`,
    [conversacionId, direccion, tipo, cuerpo, waMessageId, estado, esIA, enviadoPor]
  )

  // Mantiene el preview del hilo y suma no leídos si es entrante.
  await pool.query(
    `UPDATE whatsapp_conversacion
        SET ultimo_mensaje_preview = $2,
            ultimo_mensaje_at = now(),
            no_leidos = CASE WHEN $3 = 'in' THEN no_leidos + 1 ELSE no_leidos END,
            updated_at = now()
      WHERE id = $1`,
    [conversacionId, (cuerpo || '').slice(0, 200), direccion]
  )

  return rows[0] || null // null = era duplicado (mismo wa_message_id)
}

export async function listarMensajes(conversacionId, limite = 200) {
  const { rows } = await pool.query(
    `SELECT id, direccion, cuerpo, estado, es_ia, "timestamp"
       FROM whatsapp_mensaje
      WHERE conversacion_id = $1
      ORDER BY "timestamp" DESC
      LIMIT $2`,
    [conversacionId, limite]
  )
  return rows.reverse() // cronológico para pintar el chat
}

// El historial de la IA se reconstruye desde los mensajes guardados: así
// sobrevive a reinicios y no hay que mantener otra copia en memoria.
export async function historialParaIA(conversacionId, maxTurnos = 20) {
  // El JOIN aplica el corte de /reiniciar: si ia_reset_at está seteada, la IA
  // ignora todo lo anterior (el chat completo se sigue viendo en el panel).
  const { rows } = await pool.query(
    `SELECT m.direccion, m.cuerpo
       FROM whatsapp_mensaje m
       JOIN whatsapp_conversacion c ON c.id = m.conversacion_id
      WHERE m.conversacion_id = $1
        AND m.cuerpo IS NOT NULL
        AND m.tipo = 'text'
        AND (c.ia_reset_at IS NULL OR m."timestamp" > c.ia_reset_at)
      ORDER BY m."timestamp" DESC
      LIMIT $2`,
    [conversacionId, maxTurnos]
  )
  return rows.reverse().map((m) => ({
    role: m.direccion === 'in' ? 'user' : 'model',
    parts: [{ text: m.cuerpo }],
  }))
}

// ----------------------------------------------------------------
// Conocimiento de la IA (editable desde la BD, no desde el código)
// ----------------------------------------------------------------

export async function obtenerConocimiento(organizacionId, sesionId = null) {
  const { rows } = await pool.query(
    `SELECT seccion, titulo, contenido
       FROM whatsapp_conocimiento
      WHERE organizacion_id = $1
        AND activo = true
        AND (sesion_id IS NULL OR sesion_id = $2)
      ORDER BY seccion, orden`,
    [organizacionId, sesionId]
  )
  return rows
}

export async function obtenerIaConfig(organizacionId) {
  const { rows } = await pool.query(
    'SELECT * FROM whatsapp_ia_config WHERE organizacion_id = $1',
    [organizacionId]
  )
  return rows[0] || null
}
