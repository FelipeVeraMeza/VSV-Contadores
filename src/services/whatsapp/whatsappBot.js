// ===============================================================
// MOTOR WHATSAPP — Baileys (conexión por QR, sin Chromium).
// Singleton: una sola sesión de WhatsApp por proceso del servidor.
// Mantiene conversaciones en memoria y responde con IA (Gemini) si el
// toggle de auto-respuesta está activo. Basado en el bot de bot-whatsapp.
// ===============================================================
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import QRCode from 'qrcode'
import path from 'node:path'

import { olvidar, responder, iaDisponible } from './ia.js'

const SIN_TEXTO =
  'Por ahora solo puedo leer mensajes de texto. ¿Me lo puede escribir?'

// La sesión de WhatsApp se persiste aquí (credenciales del dispositivo
// vinculado). Está en .gitignore: nunca se sube al repo.
const AUTH_DIR = path.join(process.cwd(), 'whatsapp_auth')

// ----- Estado del módulo (singleton) -----
let sock = null
let estado = 'desconectado' // desconectado | conectando | qr | conectado
let qrDataUrl = null // imagen del QR (data URL) para mostrar en el navegador
let ultimoError = null
let arrancando = false
let autoIAGlobal = true // toggle global de respuesta automática

// jid -> { jid, nombre, telefono, noLeidos, autoIA, mensajes: [...] }
const conversaciones = new Map()

// Baileys no espera a que terminemos de responder un mensaje antes de
// entregarnos el siguiente. Serializamos por jid para no corromper el orden.
const colas = new Map()

const ahora = () =>
  new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })

const telefonoDe = (jid) => (jid || '').split('@')[0]

function encolar(jid, tarea) {
  const previa = colas.get(jid) ?? Promise.resolve()
  const actual = previa
    .then(tarea)
    .catch((err) => console.error(`[WA] Error atendiendo a ${jid}:`, err?.message || err))
  colas.set(jid, actual)
  actual.then(() => {
    if (colas.get(jid) === actual) colas.delete(jid)
  })
}

function textoDe(msg) {
  const m = msg.message
  if (!m) return null
  return m.conversation ?? m.extendedTextMessage?.text ?? null
}

function esConversacion(jid) {
  if (!jid) return false
  // Grupos, estados y canales: el bot es de atención uno a uno.
  return !/@(g\.us|newsletter|broadcast)$/.test(jid) && jid !== 'status@broadcast'
}

function obtenerConv(jid, nombre) {
  if (!conversaciones.has(jid)) {
    conversaciones.set(jid, {
      jid,
      nombre: nombre || telefonoDe(jid),
      telefono: telefonoDe(jid),
      noLeidos: 0,
      autoIA: true, // por conversación; permite silenciar la IA en un chat puntual
      mensajes: [],
    })
  }
  const c = conversaciones.get(jid)
  // Si llegó el nombre real (pushName) y antes solo teníamos el teléfono, lo actualizamos.
  if (nombre && c.nombre === c.telefono) c.nombre = nombre
  return c
}

function pushMensaje(jid, { direccion, cuerpo, estado: estadoMsg, esIA = false, nombre }) {
  const c = obtenerConv(jid, nombre)
  const m = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    direccion, // 'in' | 'out'
    cuerpo,
    hora: ahora(),
    ts: Date.now(),
    estado: estadoMsg,
    esIA,
  }
  c.mensajes.push(m)
  if (direccion === 'in') c.noLeidos += 1
  return c
}

// ----- API pública del módulo -----

export function estadoActual() {
  return {
    estado,
    qr: estado === 'qr' ? qrDataUrl : null,
    autoIA: autoIAGlobal,
    iaDisponible: iaDisponible(),
    error: ultimoError,
  }
}

export function listarConversaciones() {
  return Array.from(conversaciones.values())
    .map((c) => {
      const ultimo = c.mensajes[c.mensajes.length - 1] || null
      return {
        id: c.jid,
        nombre: c.nombre,
        telefono: c.telefono,
        noLeidos: c.noLeidos,
        autoIA: c.autoIA,
        ultimo: ultimo && { cuerpo: ultimo.cuerpo, hora: ultimo.hora, direccion: ultimo.direccion },
        ultimoTs: ultimo?.ts || 0,
      }
    })
    .sort((a, b) => b.ultimoTs - a.ultimoTs)
}

export function obtenerMensajes(jid, marcarLeido = true) {
  const c = conversaciones.get(jid)
  if (!c) return null
  if (marcarLeido) c.noLeidos = 0
  return {
    id: c.jid,
    nombre: c.nombre,
    telefono: c.telefono,
    autoIA: c.autoIA,
    mensajes: c.mensajes,
  }
}

export function setAutoGlobal(valor) {
  autoIAGlobal = !!valor
  return autoIAGlobal
}

export function setAutoConversacion(jid, valor) {
  const c = conversaciones.get(jid)
  if (!c) return null
  c.autoIA = !!valor
  return c.autoIA
}

export async function enviarMensaje(jid, texto, { esIA = false } = {}) {
  if (!sock || estado !== 'conectado') {
    throw new Error('WhatsApp no está conectado.')
  }
  await sock.sendMessage(jid, { text: texto })
  pushMensaje(jid, { direccion: 'out', cuerpo: texto, estado: 'enviado', esIA })
  return true
}

export function reiniciarConversacion(jid) {
  olvidar(jid)
  const c = conversaciones.get(jid)
  if (c) c.mensajes = []
}

// Crea (o recrea) el socket de WhatsApp y engancha los eventos. NO se llama
// directo desde el controlador: usa iniciar(), que no espera a que esto termine.
async function arrancarSocket() {
  if (arrancando) return
  arrancando = true
  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
    const { version } = await fetchLatestBaileysVersion()

    sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      browser: ['VSV Contadores', 'Chrome', '1.0.0'],
      // Si el bot se marca en línea, el teléfono deja de notificar al dueño.
      markOnlineOnConnect: false,
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        estado = 'qr'
        try {
          qrDataUrl = await QRCode.toDataURL(qr)
          console.log('📱 [WA] QR generado, esperando escaneo…')
        } catch (e) {
          console.error('[WA] No se pudo generar el QR:', e.message)
        }
      }

      if (connection === 'open') {
        estado = 'conectado'
        qrDataUrl = null
        console.log('✅ [WA] Conectado a WhatsApp.')
      }

      if (connection === 'close') {
        const codigo = new Boom(lastDisconnect?.error).output?.statusCode
        sock = null

        if (codigo === DisconnectReason.loggedOut) {
          estado = 'desconectado'
          ultimoError = 'Sesión cerrada desde el teléfono. Vuelve a conectar y escanea el QR.'
          console.error('⚠️ [WA] Sesión cerrada desde el teléfono.')
          return
        }

        // Caída temporal (incluye el 515 'restartRequired' tras escanear el QR):
        // reconectamos reusando las credenciales guardadas.
        estado = 'conectando'
        console.warn(`⚠️ [WA] Conexión cerrada (código ${codigo ?? '?'}), reconectando…`)
        arrancarSocket().catch((e) => {
          estado = 'desconectado'
          ultimoError = e.message
          console.error('❌ [WA] Falló la reconexión:', e.message)
        })
      }
    })

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return

      for (const msg of messages) {
        const jid = msg.key.remoteJid
        if (msg.key.fromMe || !esConversacion(jid)) continue

        const nombre = msg.pushName || null
        const texto = textoDe(msg)

        if (!texto) {
          pushMensaje(jid, { direccion: 'in', cuerpo: '[mensaje no de texto]', nombre })
          encolar(jid, () => enviarMensaje(jid, SIN_TEXTO).catch(() => {}))
          continue
        }

        const conv = pushMensaje(jid, { direccion: 'in', cuerpo: texto, nombre })

        if (texto.trim().toLowerCase() === '/reiniciar') {
          reiniciarConversacion(jid)
          encolar(jid, () =>
            enviarMensaje(jid, 'Listo, empecemos de nuevo.').catch(() => {})
          )
          continue
        }

        // Auto-respuesta: solo si el toggle global y el de la conversación están
        // activos, y hay key de IA configurada.
        if (autoIAGlobal && conv.autoIA && iaDisponible()) {
          encolar(jid, async () => {
            await sock.sendPresenceUpdate('composing', jid)
            const respuesta = await responder(jid, texto)
            await enviarMensaje(jid, respuesta, { esIA: true })
          })
        }
      }
    })
  } catch (e) {
    estado = 'desconectado'
    ultimoError = e.message
    console.error('❌ [WA] Error al arrancar el socket:', e.message)
  } finally {
    arrancando = false
  }
}

// Arranca la sesión de WhatsApp. Responde al instante (no espera a Baileys):
// el QR llega por polling de estado. Idempotente si ya hay un socket vivo, pero
// reintenta si quedó trabado en 'conectando' sin socket.
export async function iniciar() {
  if (estado === 'conectado') return estadoActual()
  if ((estado === 'conectando' || estado === 'qr') && sock) return estadoActual()

  estado = 'conectando'
  qrDataUrl = null
  ultimoError = null
  // Sin await: el socket arranca en segundo plano; el estado/QR se consultan aparte.
  arrancarSocket()
  return estadoActual()
}
