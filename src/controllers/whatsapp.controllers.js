import * as bot from '../services/whatsapp/whatsappBot.js'
import * as repo from '../services/whatsapp/whatsappRepo.js'
import { pool } from '../database/db.js'

// ---------------------------------------------------------------------------
// ¿DE QUIÉN ES ESTE NÚMERO?
// ---------------------------------------------------------------------------
// La conversación de WhatsApp guarda el teléfono, no el cliente. Se cruza con
// la agenda del CRM por el número para poder decir «este chat es de Fulano», y
// así el ticket que se abra desde el chat nace ligado a él.
//
// Se comparan los ÚLTIMOS 8 DÍGITOS y no el número completo: los dos lados
// guardan 56XXXXXXXXX, pero basta que alguien haya escrito uno con +56, con un
// 9 de más o con espacios para que la comparación exacta falle. Ocho dígitos
// son el número chileno sin prefijo ni código de país: suficiente para
// identificar y corto para tolerar cómo esté escrito.
const clienteDelTelefono = async (telefono, org) => {
  const digitos = String(telefono || '').replace(/\D/g, '')
  if (digitos.length < 8) return { personaId: null, personaNombre: null, empresaId: null }
  try {
    const { rows } = await pool.query(
      `SELECT p.id, TRIM(CONCAT_WS(' ', p.nombre, p.apellidos)) AS nombre,
              (SELECT pe.empresa_id FROM persona_empresa pe WHERE pe.persona_id = p.id LIMIT 1) AS empresa_id
         FROM persona_telefono pt
         JOIN persona p ON p.id = pt.persona_id
        WHERE p.activo AND p.organizacion_id IS NOT DISTINCT FROM $2::uuid
          AND RIGHT(REGEXP_REPLACE(pt.telefono_norm, '\\D', '', 'g'), 8) = RIGHT($1, 8)
        LIMIT 1`,
      [digitos, org || null])
    if (!rows.length) return { personaId: null, personaNombre: null, empresaId: null }
    return { personaId: rows[0].id, personaNombre: rows[0].nombre || null, empresaId: rows[0].empresa_id || null }
  } catch (e) {
    // Que no se pueda identificar al cliente no debe dejar sin chat a nadie.
    console.warn('⚠️ No se pudo cruzar el teléfono con el CRM:', e.message)
    return { personaId: null, personaNombre: null, empresaId: null }
  }
}

// ----------------------------------------------------------------
// Helpers de autorización
// ----------------------------------------------------------------

// Resuelve el alcance del usuario y verifica que pueda tocar esa sesión.
// Devuelve la sesión, o null si no tiene permiso (el controlador corta con 403/404).
async function sesionAutorizada(req, res, sesionId) {
  const scope = await repo.resolverScope(req.user)
  const ok = await repo.puedeAcceder(scope, sesionId)
  if (!ok) {
    res.status(403).json({ message: 'No tienes acceso a esta sesión de WhatsApp.' })
    return null
  }
  return { scope, sesion: await repo.obtenerSesion(sesionId) }
}

// Igual, pero partiendo de una conversación (verifica la sesión dueña).
async function conversacionAutorizada(req, res, conversacionId) {
  const conv = await repo.obtenerConversacion(conversacionId)
  if (!conv) {
    res.status(404).json({ message: 'Conversación no encontrada.' })
    return null
  }
  const scope = await repo.resolverScope(req.user)
  const ok = await repo.puedeAcceder(scope, conv.sesion_id)
  if (!ok) {
    res.status(403).json({ message: 'No tienes acceso a esta conversación.' })
    return null
  }
  return { scope, conv }
}

// ----------------------------------------------------------------
// Sesiones
// ----------------------------------------------------------------

// GET /api/whatsapp/sesiones → las que el usuario puede ver
export const getSesiones = async (req, res) => {
  try {
    const scope = await repo.resolverScope(req.user)
    const sesiones = await repo.listarSesiones(scope)
    // Mezcla el estado guardado con el runtime (el QR solo vive en memoria).
    res.json(
      sesiones.map((s) => ({
        id: s.id,
        nombre: s.nombre,
        telefono: s.telefono,
        empresaId: s.empresa_id,
        empresaNombre: s.empresa_nombre,
        autoIa: s.auto_ia,
        ...bot.estadoDe(s.id),
      }))
    )
  } catch (e) {
    res.status(500).json({ message: 'No se pudieron listar las sesiones.', error: e.message })
  }
}

// POST /api/whatsapp/sesiones → crear (solo Administrador)
export const crearSesion = async (req, res) => {
  try {
    if (req.user.rol !== 'Administrador') {
      return res.status(403).json({ message: 'Solo un Administrador puede crear sesiones.' })
    }
    const { nombre, empresaId = null } = req.body || {}
    if (!nombre?.trim()) {
      return res.status(400).json({ message: 'El nombre de la sesión es obligatorio.' })
    }
    const sesion = await repo.crearSesion({
      organizacionId: req.user.organizacionId,
      empresaId: empresaId || null,
      nombre: nombre.trim(),
      creadoPor: req.user.usuarioId,
    })
    res.status(201).json(sesion)
  } catch (e) {
    // El índice único impide dos sesiones activas para la misma empresa.
    if (e.code === '23505') {
      return res.status(409).json({ message: 'Esa empresa ya tiene una sesión de WhatsApp activa.' })
    }
    res.status(500).json({ message: 'No se pudo crear la sesión.', error: e.message })
  }
}

// GET /api/whatsapp/sesiones/:id/estado
export const getEstado = async (req, res) => {
  const auth = await sesionAutorizada(req, res, req.params.id)
  if (!auth) return
  res.json({ ...bot.estadoDe(req.params.id), autoIa: auth.sesion?.auto_ia })
}

// POST /api/whatsapp/sesiones/:id/iniciar → arranca y genera el QR
export const iniciar = async (req, res) => {
  const auth = await sesionAutorizada(req, res, req.params.id)
  if (!auth) return
  try {
    res.json(await bot.iniciar(req.params.id))
  } catch (e) {
    res.status(500).json({ message: 'No se pudo iniciar la sesión.', error: e.message })
  }
}

// POST /api/whatsapp/sesiones/:id/cerrar → desvincula el teléfono
export const cerrar = async (req, res) => {
  const auth = await sesionAutorizada(req, res, req.params.id)
  if (!auth) return
  await bot.cerrar(req.params.id)
  res.json({ ok: true })
}

// DELETE /api/whatsapp/sesiones/:id → baja lógica (solo Administrador)
export const eliminarSesion = async (req, res) => {
  if (req.user.rol !== 'Administrador') {
    return res.status(403).json({ message: 'Solo un Administrador puede eliminar sesiones.' })
  }
  const auth = await sesionAutorizada(req, res, req.params.id)
  if (!auth) return
  await bot.cerrar(req.params.id)
  await repo.desactivarSesion(req.params.id)
  res.json({ ok: true })
}

// PATCH /api/whatsapp/sesiones/:id/auto → toggle IA de la sesión
export const setAutoSesion = async (req, res) => {
  const auth = await sesionAutorizada(req, res, req.params.id)
  if (!auth) return
  const valor = await repo.setAutoIaSesion(req.params.id, req.body?.activo)
  res.json({ autoIa: valor })
}

// ----------------------------------------------------------------
// Conversaciones y mensajes
// ----------------------------------------------------------------

// GET /api/whatsapp/sesiones/:id/conversaciones
export const getConversaciones = async (req, res) => {
  const auth = await sesionAutorizada(req, res, req.params.id)
  if (!auth) return
  const convs = await repo.listarConversaciones(req.params.id)
  res.json(
    convs.map((c) => ({
      id: c.id,
      nombre: c.nombre_contacto || c.telefono,
      telefono: c.telefono,
      noLeidos: c.no_leidos,
      autoIa: c.auto_ia,
      empresaNombre: c.empresa_nombre,
      ultimoMensaje: c.ultimo_mensaje_preview,
      ultimoMensajeAt: c.ultimo_mensaje_at,
    }))
  )
}

// GET /api/whatsapp/conversaciones/:convId/mensajes
export const getMensajes = async (req, res) => {
  const auth = await conversacionAutorizada(req, res, req.params.convId)
  if (!auth) return
  const mensajes = await repo.listarMensajes(req.params.convId)
  await repo.marcarLeido(req.params.convId)
  // Quién es este número en el CRM. Va acá para que el ticket que se abra desde
  // el chat nazca ligado al cliente: antes el panel mandaba `detalle.personaId`
  // y esa propiedad NUNCA venía en la respuesta, así que el vínculo se perdía
  // siempre y había que buscar el cliente a mano después.
  const cliente = await clienteDelTelefono(auth.conv.telefono, req.user?.organizacionId)
  res.json({
    id: auth.conv.id,
    nombre: auth.conv.nombre_contacto || auth.conv.telefono,
    telefono: auth.conv.telefono,
    autoIa: auth.conv.auto_ia,
    personaId: cliente.personaId,
    personaNombre: cliente.personaNombre,
    empresaId: auth.conv.empresa_id || cliente.empresaId,
    mensajes: mensajes.map((m) => ({
      id: m.id,
      direccion: m.direccion,
      cuerpo: m.cuerpo,
      estado: m.estado,
      esIa: m.es_ia,
      timestamp: m.timestamp,
    })),
  })
}

// POST /api/whatsapp/conversaciones/:convId/mensajes → enviar manual
export const enviarMensaje = async (req, res) => {
  const auth = await conversacionAutorizada(req, res, req.params.convId)
  if (!auth) return
  const { texto } = req.body || {}
  if (!texto?.trim()) {
    return res.status(400).json({ message: 'El mensaje está vacío.' })
  }
  try {
    await bot.enviarTexto(auth.conv.sesion_id, auth.conv, texto.trim(), {
      enviadoPor: req.user.usuarioId,
    })
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ message: e.message })
  }
}

// PATCH /api/whatsapp/conversaciones/:convId/auto → toggle IA del chat
export const setAutoConversacion = async (req, res) => {
  const auth = await conversacionAutorizada(req, res, req.params.convId)
  if (!auth) return
  const valor = await repo.setAutoIaConversacion(req.params.convId, req.body?.activo)
  res.json({ autoIa: valor })
}
