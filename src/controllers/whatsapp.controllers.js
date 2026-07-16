import * as bot from '../services/whatsapp/whatsappBot.js'

// GET /api/whatsapp/estado  → estado de conexión + QR (si aplica)
export const getEstado = (req, res) => {
  res.json(bot.estadoActual())
}

// POST /api/whatsapp/iniciar  → arranca la sesión (muestra QR o reusa la existente)
export const iniciar = async (req, res) => {
  try {
    const estado = await bot.iniciar()
    res.json(estado)
  } catch (e) {
    res.status(500).json({ message: 'No se pudo iniciar WhatsApp.', error: e.message })
  }
}

// GET /api/whatsapp/conversaciones  → lista con último mensaje y no leídos
export const getConversaciones = (req, res) => {
  res.json(bot.listarConversaciones())
}

// GET /api/whatsapp/conversaciones/:jid/mensajes  → historial del hilo
export const getMensajes = (req, res) => {
  const jid = decodeURIComponent(req.params.jid)
  const conv = bot.obtenerMensajes(jid)
  if (!conv) return res.status(404).json({ message: 'Conversación no encontrada.' })
  res.json(conv)
}

// POST /api/whatsapp/conversaciones/:jid/mensajes  → enviar mensaje manual
export const enviarMensaje = async (req, res) => {
  const jid = decodeURIComponent(req.params.jid)
  const { texto } = req.body || {}
  if (!texto || !texto.trim()) {
    return res.status(400).json({ message: 'El mensaje está vacío.' })
  }
  try {
    await bot.enviarMensaje(jid, texto.trim())
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ message: e.message })
  }
}

// PATCH /api/whatsapp/auto  → toggle global de auto-respuesta IA
export const setAutoGlobal = (req, res) => {
  const { activo } = req.body || {}
  res.json({ autoIA: bot.setAutoGlobal(activo) })
}

// PATCH /api/whatsapp/conversaciones/:jid/auto  → toggle IA de una conversación
export const setAutoConversacion = (req, res) => {
  const jid = decodeURIComponent(req.params.jid)
  const { activo } = req.body || {}
  const valor = bot.setAutoConversacion(jid, activo)
  if (valor === null) return res.status(404).json({ message: 'Conversación no encontrada.' })
  res.json({ autoIA: valor })
}
