// ===============================================================
// GESTOR MULTI-SESIÓN DE WHATSAPP — Baileys.
// Mantiene N sockets en paralelo (uno por whatsapp_sesion) y persiste
// conversaciones, mensajes y credenciales en Postgres.
//
// Este módulo solo maneja el "runtime" (sockets + QR en memoria); todo lo que
// deba sobrevivir a un reinicio vive en la BD vía whatsappRepo.
// ===============================================================
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import QRCode from 'qrcode'

import { usePostgresAuthState, limpiarCredenciales } from './authStatePg.js'
import { responder, iaDisponible, construirConocimiento, MODELO_POR_DEFECTO } from './ia.js'
import * as repo from './whatsappRepo.js'

const SIN_TEXTO = 'Por ahora solo puedo leer mensajes de texto. ¿Me lo puede escribir?'
const REINICIADO = 'Listo, empecemos de nuevo.'

// Códigos de estado de WhatsApp (proto.WebMessageInfo.Status) → nuestra columna
// whatsapp_mensaje.estado. PLAYED (5, audio escuchado) lo tratamos como leído.
const ESTADO_POR_STATUS = {
  0: 'error',
  1: 'pendiente',
  2: 'enviado',
  3: 'entregado',
  4: 'leido',
  5: 'leido',
}

// sesionId -> { sock, estado, qr, error, arrancando }
const runtime = new Map()

// `${sesionId}:${jid}` -> Promise (serializa las respuestas por contacto)
const colas = new Map()

function rt(sesionId) {
  if (!runtime.has(sesionId)) {
    runtime.set(sesionId, { sock: null, estado: 'desconectado', qr: null, error: null, arrancando: false })
  }
  return runtime.get(sesionId)
}

// Cambia el estado en memoria y lo refleja en la BD (para que el panel lo vea
// aunque el socket viva en otro proceso).
async function setEstado(sesionId, estado, telefono = null) {
  rt(sesionId).estado = estado
  try {
    await repo.actualizarEstadoSesion(sesionId, estado, telefono)
  } catch (e) {
    console.error('[WA] No se pudo guardar el estado:', e.message)
  }
}

function encolar(clave, tarea) {
  const previa = colas.get(clave) ?? Promise.resolve()
  const actual = previa
    .then(tarea)
    .catch((err) => console.error(`[WA] Error atendiendo ${clave}:`, err?.message || err))
  colas.set(clave, actual)
  actual.then(() => {
    if (colas.get(clave) === actual) colas.delete(clave)
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

// ----------------------------------------------------------------
// API pública
// ----------------------------------------------------------------

export function estadoDe(sesionId) {
  const r = rt(sesionId)
  return {
    sesionId,
    estado: r.estado,
    qr: r.estado === 'qr' ? r.qr : null,
    iaDisponible: iaDisponible(),
    error: r.error,
  }
}

export async function enviarTexto(sesionId, conversacion, texto, { esIA = false, enviadoPor = null } = {}) {
  const r = rt(sesionId)
  if (!r.sock || r.estado !== 'conectado') {
    throw new Error('Esta sesión de WhatsApp no está conectada.')
  }
  const res = await r.sock.sendMessage(conversacion.jid, { text: texto })
  await repo.guardarMensaje({
    conversacionId: conversacion.id,
    direccion: 'out',
    cuerpo: texto,
    waMessageId: res?.key?.id ?? null,
    estado: 'enviado',
    esIA,
    enviadoPor,
  })
  return true
}

export async function cerrar(sesionId) {
  const r = rt(sesionId)
  try {
    await r.sock?.logout()
  } catch {
    /* si ya está caído, da igual */
  }
  r.sock = null
  r.qr = null
  await setEstado(sesionId, 'desconectado')
}

// Arranca la sesión. Responde al instante: el socket levanta en segundo plano
// y el QR/estado se consultan aparte. Idempotente si ya hay socket vivo, pero
// reintenta si quedó trabada sin socket.
export async function iniciar(sesionId) {
  const r = rt(sesionId)
  if (r.estado === 'conectado' && r.sock) return estadoDe(sesionId)
  if ((r.estado === 'conectando' || r.estado === 'qr') && r.sock) return estadoDe(sesionId)

  r.qr = null
  r.error = null
  await setEstado(sesionId, 'conectando')
  arrancarSocket(sesionId) // sin await
  return estadoDe(sesionId)
}

// ----------------------------------------------------------------
// Motor
// ----------------------------------------------------------------

async function arrancarSocket(sesionId) {
  const r = rt(sesionId)
  if (r.arrancando) return
  r.arrancando = true

  try {
    const { state, saveCreds } = await usePostgresAuthState(sesionId)
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      browser: ['VSV Contadores', 'Chrome', '1.0.0'],
      // Si el bot se marca en línea, el teléfono deja de notificar al dueño.
      markOnlineOnConnect: false,
    })
    r.sock = sock

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        try {
          r.qr = await QRCode.toDataURL(qr)
          await setEstado(sesionId, 'qr')
          console.log(`📱 [WA:${sesionId.slice(0, 8)}] QR generado, esperando escaneo…`)
        } catch (e) {
          console.error('[WA] No se pudo generar el QR:', e.message)
        }
      }

      if (connection === 'open') {
        r.qr = null
        // El JID propio trae el número con el que quedó vinculada la sesión.
        const telefono = (sock.user?.id || '').split(':')[0].split('@')[0] || null
        await setEstado(sesionId, 'conectado', telefono)
        console.log(`✅ [WA:${sesionId.slice(0, 8)}] Conectado (${telefono || 's/n'}).`)
      }

      if (connection === 'close') {
        const codigo = new Boom(lastDisconnect?.error).output?.statusCode
        r.sock = null

        if (codigo === DisconnectReason.loggedOut) {
          // Sesión cerrada desde el teléfono: las credenciales ya no sirven,
          // hay que borrarlas o reintentaría en bucle contra un vínculo muerto.
          await limpiarCredenciales(sesionId)
          r.error = 'Sesión cerrada desde el teléfono. Vuelve a conectar y escanea el QR.'
          await setEstado(sesionId, 'desconectado')
          console.error(`⚠️ [WA:${sesionId.slice(0, 8)}] Sesión cerrada desde el teléfono.`)
          return
        }

        // 440 = connectionReplaced: OTRA instancia tomó esta sesión (p. ej. el
        // server de producción usando las mismas credenciales de la BD). NO
        // reconectar: si lo hiciéramos, las dos instancias se botarían en bucle
        // infinito. Nos rendimos y dejamos que la otra instancia se quede con la
        // sesión. (Ver L-08: falta un lock multi-instancia.)
        if (codigo === DisconnectReason.connectionReplaced) {
          r.error = 'Otra instancia (¿producción?) tomó esta sesión. Usa un solo servidor a la vez.'
          await setEstado(sesionId, 'desconectado')
          console.error(`⛔ [WA:${sesionId.slice(0, 8)}] Conexión reemplazada (440): otra instancia tomó la sesión. No reconecto.`)
          return
        }

        // Caída temporal (incluye el 515 'restartRequired' tras escanear).
        await setEstado(sesionId, 'conectando')
        console.warn(`⚠️ [WA:${sesionId.slice(0, 8)}] Conexión cerrada (${codigo ?? '?'}), reconectando…`)
        r.arrancando = false
        arrancarSocket(sesionId).catch((e) => {
          r.error = e.message
          setEstado(sesionId, 'desconectado')
        })
      }
    })

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return
      for (const msg of messages) {
        const jid = msg.key.remoteJid
        // Procesamos también los fromMe: son mensajes que el dueño escribió
        // desde su propio teléfono; hay que reflejarlos en el panel.
        if (!esConversacion(jid)) continue
        encolar(`${sesionId}:${jid}`, () => procesarEntrante(sesionId, msg, jid))
      }
    })

    // RF-06: recibos de entrega. WhatsApp avisa por aquí cuando un mensaje
    // nuestro fue entregado o leído; sin esto el doble check nunca cambiaba.
    sock.ev.on('messages.update', (updates) => {
      for (const u of updates) {
        const estado = ESTADO_POR_STATUS[u.update?.status]
        if (!estado || !u.key?.id) continue
        repo.actualizarEstadoMensaje(u.key.id, estado).catch((e) =>
          console.error('[WA] No se pudo actualizar el estado del mensaje:', e.message)
        )
      }
    })
  } catch (e) {
    r.error = e.message
    await setEstado(sesionId, 'desconectado')
    console.error(`❌ [WA:${sesionId.slice(0, 8)}] Error al arrancar:`, e.message)
  } finally {
    r.arrancando = false
  }
}

async function procesarEntrante(sesionId, msg, jid) {
  const r = rt(sesionId)
  const fromMe = !!msg.key.fromMe
  const nombre = msg.pushName || null
  const texto = textoDe(msg)
  // En un fromMe el pushName es el del dueño, no el del contacto: no lo usamos
  // para nombrar la conversación.
  const conv = await repo.obtenerOCrearConversacion(sesionId, jid, fromMe ? null : nombre)

  // Mensaje escrito desde el propio teléfono (o eco de uno enviado por el CRM):
  // se guarda como saliente para que el panel muestre la conversación completa.
  // Es idempotente (mismo wa_message_id) y NUNCA dispara la IA.
  if (fromMe) {
    if (texto) {
      await repo.guardarMensaje({
        conversacionId: conv.id, direccion: 'out', cuerpo: texto, waMessageId: msg.key.id,
      })
    }
    return
  }

  // Guardamos el entrante (sea texto o no) para que el panel muestre la
  // conversación completa, INDEPENDIENTE de si la IA está activa.
  const guardado = await repo.guardarMensaje({
    conversacionId: conv.id, direccion: 'in',
    cuerpo: texto || '[mensaje no de texto]',
    tipo: texto ? 'text' : 'otro',
    waMessageId: msg.key.id,
  })
  // null = ya lo teníamos (mismo wa_message_id): no procesar dos veces.
  if (!guardado) return

  // PUERTA ÚNICA para toda respuesta automática. Si la IA está apagada (a nivel
  // de número o de este chat), el bot no envía NADA — ni el aviso de "solo
  // texto" ni una respuesta de IA. Así, al desactivar la IA, el humano toma el
  // control de verdad y el cliente no recibe mensajes automáticos inesperados.
  const sesion = await repo.obtenerSesion(sesionId)
  if (!sesion || !iaDisponible() || !sesion.auto_ia || !conv.auto_ia) return

  // Mensaje que no es texto (sticker, audio, imagen): avisamos (solo con IA on).
  if (!texto) {
    await enviarTexto(sesionId, conv, SIN_TEXTO).catch(() => {})
    return
  }

  // RF-14: el cliente puede reiniciar el hilo de la IA. No borra el chat (el
  // humano necesita verlo): solo marca desde dónde vuelve a leer la IA.
  if (texto.trim().toLowerCase() === '/reiniciar') {
    await repo.reiniciarHilaIA(conv.id)
    await enviarTexto(sesionId, conv, REINICIADO).catch(() => {})
    return
  }

  try {
    await r.sock?.sendPresenceUpdate('composing', jid)

    const [historial, filasConoc, cfg] = await Promise.all([
      repo.historialParaIA(conv.id),
      repo.obtenerConocimiento(sesion.organizacion_id, sesionId),
      repo.obtenerIaConfig(sesion.organizacion_id),
    ])

    if (cfg && cfg.activo === false) return

    // El historial ya incluye el mensaje recién guardado: lo sacamos para
    // pasarlo aparte y no duplicar el último turno.
    historial.pop()

    const respuesta = await responder({
      historial,
      mensaje: texto,
      conocimiento: construirConocimiento(filasConoc),
      instrucciones: cfg?.instrucciones || undefined,
      modelo: cfg?.modelo || MODELO_POR_DEFECTO,
    })

    await enviarTexto(sesionId, conv, respuesta, { esIA: true })
  } catch (e) {
    // Que falle la IA no puede romper el chat ni tumbar el proceso.
    console.error(`[WA:${sesionId.slice(0, 8)}] IA falló:`, e.message)
  }
}

// ----------------------------------------------------------------
// Arranque del servidor: reconecta las sesiones que ya tienen credenciales.
// Las que nunca se vincularon quedan esperando a que alguien pulse "Conectar".
// ----------------------------------------------------------------
export async function reconectarSesionesGuardadas() {
  try {
    const sesiones = await repo.listarSesionesActivas()
    for (const s of sesiones) {
      const { state } = await usePostgresAuthState(s.id)
      // La señal de que la sesión ya se vinculó es tener la cuenta (creds.me).
      // OJO: no usar creds.registered — queda en false aunque el dispositivo
      // esté perfectamente vinculado, y entonces nunca reconectaría.
      if (!state.creds?.me?.id) continue // nunca se escaneó el QR
      console.log(`🔄 [WA] Reconectando sesión "${s.nombre}"…`)
      iniciar(s.id).catch((e) => console.error('[WA] Falló reconexión:', e.message))
    }
  } catch (e) {
    console.error('[WA] No se pudieron reconectar sesiones:', e.message)
  }
}
