import { GoogleGenAI } from '@google/genai'
import { CONOCIMIENTO, INSTRUCCIONES } from './conocimiento.js'

// Modelo por defecto. Se puede sobreescribir por organización desde
// whatsapp_ia_config.modelo. Los flash-lite entran en la capa gratis.
export const MODELO_POR_DEFECTO = 'gemini-3.1-flash-lite'

// El cliente de Gemini se construye de forma perezosa (lazy): así el servidor
// puede arrancar aunque no exista GEMINI_API_KEY. La key solo hace falta cuando
// la IA tiene que responder de verdad.
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

// Arma el texto de conocimiento a partir de las filas de whatsapp_conocimiento.
// Si la organización todavía no cargó nada, cae al archivo conocimiento.js para
// no dejar a la IA sin contexto.
export function construirConocimiento(filas = []) {
  if (!filas.length) return CONOCIMIENTO

  const porSeccion = new Map()
  for (const f of filas) {
    if (!porSeccion.has(f.seccion)) porSeccion.set(f.seccion, [])
    porSeccion.get(f.seccion).push(f)
  }

  const partes = []
  for (const [seccion, items] of porSeccion) {
    partes.push(`## ${seccion}`)
    for (const it of items) {
      partes.push(it.titulo ? `- **${it.titulo}**: ${it.contenido}` : `- ${it.contenido}`)
    }
    partes.push('')
  }
  return partes.join('\n').trim()
}

/**
 * Genera una respuesta. No guarda historial: se lo pasan ya armado (lo
 * reconstruye whatsappRepo desde los mensajes de la BD), así sobrevive a
 * reinicios y no hay dos fuentes de verdad.
 *
 * @param {object}   opts
 * @param {Array}    opts.historial      turnos previos [{role:'user'|'model', parts:[{text}]}]
 * @param {string}   opts.mensaje        mensaje nuevo del cliente
 * @param {string}   [opts.conocimiento] contexto (de la BD o del archivo)
 * @param {string}   [opts.instrucciones] cómo debe comportarse
 * @param {string}   [opts.modelo]
 * @returns {Promise<string>} texto de la respuesta
 */
export async function responder({
  historial = [],
  mensaje,
  conocimiento = CONOCIMIENTO,
  instrucciones = INSTRUCCIONES,
  modelo = MODELO_POR_DEFECTO,
}) {
  const contents = [...historial, { role: 'user', parts: [{ text: mensaje }] }]

  const res = await cliente().models.generateContent({
    model: modelo,
    contents,
    config: {
      systemInstruction: `${instrucciones}\n\n${conocimiento}`,
      maxOutputTokens: 1024,
      // Contestar con lo que ya está en el conocimiento no requiere razonar:
      // pensar solo suma latencia y costo por token.
      thinkingConfig: { thinkingBudget: 0 },
    },
  })

  const texto = res.text?.trim()

  // Gemini puede no devolver texto: filtro de seguridad, o corte por tokens.
  if (!texto) {
    const razon = res.candidates?.[0]?.finishReason ?? 'desconocida'
    throw new Error(`Gemini no devolvió texto (finishReason: ${razon})`)
  }

  return texto
}
