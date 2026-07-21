// ===============================================================
// Auth state de Baileys respaldado en Postgres.
// Reemplaza a useMultiFileAuthState (que guarda en la carpeta whatsapp_auth/).
//
// ¿Por qué? El filesystem de Railway es efímero: en cada redeploy se borraría
// la carpeta y habría que re-escanear el QR. En la BD, la sesión sobrevive.
// Además permite varias sesiones en paralelo (multi-WhatsApp).
// ===============================================================
import { initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys'
import { pool } from '../../database/db.js'

// Baileys guarda Buffers dentro de las credenciales. BufferJSON los convierte
// a/desde JSON plano para poder meterlos en una columna jsonb.
//
// Guardamos SIEMPRE el texto JSON (con ::jsonb en el INSERT), no el objeto ya
// parseado: si el valor es un string simple (algunas app-state keys lo son),
// pasarlo parseado hace que node-pg lo mande sin comillas y Postgres lance
// "invalid input syntax for type json". JSON.stringify garantiza JSON válido
// para cualquier tipo (objeto, string, número).
const aTexto = (valor) => JSON.stringify(valor, BufferJSON.replacer)
const desdeJson = (valor) => JSON.parse(JSON.stringify(valor), BufferJSON.reviver)

export async function usePostgresAuthState(sesionId) {
  const leer = async (clave) => {
    const { rows } = await pool.query(
      'SELECT valor FROM whatsapp_credencial WHERE sesion_id = $1 AND clave = $2',
      [sesionId, clave]
    )
    return rows.length ? desdeJson(rows[0].valor) : null
  }

  const escribir = async (clave, valor) => {
    await pool.query(
      `INSERT INTO whatsapp_credencial (sesion_id, clave, valor, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (sesion_id, clave)
       DO UPDATE SET valor = EXCLUDED.valor, updated_at = now()`,
      [sesionId, clave, aTexto(valor)]
    )
  }

  const borrar = async (clave) => {
    await pool.query(
      'DELETE FROM whatsapp_credencial WHERE sesion_id = $1 AND clave = $2',
      [sesionId, clave]
    )
  }

  // Si no hay credenciales guardadas, arrancamos unas nuevas → pedirá QR.
  const creds = (await leer('creds')) || initAuthCreds()

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {}
          await Promise.all(
            ids.map(async (id) => {
              let valor = await leer(`${type}-${id}`)
              // Baileys espera este tipo concreto, no un objeto plano.
              if (type === 'app-state-sync-key' && valor) {
                valor = proto.Message.AppStateSyncKeyData.fromObject(valor)
              }
              if (valor) data[id] = valor
            })
          )
          return data
        },
        set: async (data) => {
          const tareas = []
          for (const type in data) {
            for (const id in data[type]) {
              const valor = data[type][id]
              const clave = `${type}-${id}`
              tareas.push(valor ? escribir(clave, valor) : borrar(clave))
            }
          }
          await Promise.all(tareas)
        },
      },
    },
    saveCreds: () => escribir('creds', creds),
  }
}

// Borra toda la sesión guardada (tras un logout desde el teléfono): la próxima
// conexión pedirá un QR nuevo en vez de reintentar con credenciales muertas.
export async function limpiarCredenciales(sesionId) {
  await pool.query('DELETE FROM whatsapp_credencial WHERE sesion_id = $1', [sesionId])
}
