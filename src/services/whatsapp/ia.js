import { GoogleGenAI } from '@google/genai'
import { CONOCIMIENTO, INSTRUCCIONES } from './conocimiento.js'

const MAX_TURNOS = 20

// Modelo de Gemini. Los flash-lite son gratis en la capa gratuita de
// Google AI Studio y de sobra para un bot de FAQ.
const MODELO = 'gemini-3.1-flash-lite'

// El cliente de Gemini se construye de forma perezosa (lazy): así el servidor
// puede arrancar aunque no exista GEMINI_API_KEY. La key solo hace falta cuando
// alguien conecta el bot y la IA tiene que responder.
let ia = null

function cliente() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('Falta GEMINI_API_KEY en el .env para que la IA responda.')
  }
  if (!ia) ia = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  return ia
}

export function iaDisponible() {
  return !!process.env.GEMINI_API_KEY
}

// Historial por chat. En memoria: se pierde al reiniciar el proceso.
// Formato de mensajes de Gemini: { role: 'user' | 'model', parts: [{ text }] }.
const historiales = new Map()

function historialDe(jid) {
  if (!historiales.has(jid)) historiales.set(jid, [])
  return historiales.get(jid)
}

export async function responder(jid, mensaje) {
  const historial = historialDe(jid)
  historial.push({ role: 'user', parts: [{ text: mensaje }] })

  const res = await cliente().models.generateContent({
    model: MODELO,
    contents: historial,
    config: {
      systemInstruction: `${INSTRUCCIONES}\n\n${CONOCIMIENTO}`,
      maxOutputTokens: 1024,
      // Contestar con lo que ya está en el conocimiento no requiere razonar:
      // pensar solo suma latencia y costo por token.
      thinkingConfig: { thinkingBudget: 0 },
    },
  })

  const texto = res.text?.trim()

  // Gemini puede no devolver texto: filtro de seguridad, o corte por tokens.
  // Sin sacar el mensaje del usuario, el historial quedaría con dos turnos
  // 'user' seguidos y la siguiente consulta fallaría.
  if (!texto) {
    historial.pop()
    const razon = res.candidates?.[0]?.finishReason ?? 'desconocida'
    throw new Error(`Gemini no devolvió texto (finishReason: ${razon})`)
  }

  historial.push({ role: 'model', parts: [{ text: texto }] })
  if (historial.length > MAX_TURNOS) historial.splice(0, historial.length - MAX_TURNOS)

  return texto
}

export function olvidar(jid) {
  historiales.delete(jid)
}
