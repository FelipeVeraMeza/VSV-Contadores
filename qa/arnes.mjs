// ============================================================================
// ARNÉS DE PRUEBAS · VSV PRO
// ----------------------------------------------------------------------------
// Sin dependencias: node:test y assert bastan, y así la suite corre en
// cualquier máquina y en CI sin instalar nada. Una suite que necesita `npm i`
// para arrancar es una suite que deja de correrse.
//
// Lo que aporta este archivo sobre node:test a secas:
//
//   · sesión real de la base — probar contra la autenticación de verdad, no
//     contra un doble, es lo que hace que las pruebas de permisos valgan
//   · un cliente HTTP que habla como el frontend (x-session-id, x-company-id)
//   · limpieza de lo que cada prueba crea, para poder correrla mil veces
// ============================================================================
import { pool } from '../src/database/db.js';

export const API = process.env.QA_API || 'http://127.0.0.1:4000/api';

// ── Sesiones ────────────────────────────────────────────────────────────────
const cache = new Map();

/**
 * Devuelve una sesión válida del rol pedido. Se toma una EXISTENTE en vez de
 * crearla: así la prueba se ejerce contra usuarios reales con sus permisos
 * reales, que es donde aparecen los problemas de aislamiento.
 */
export async function sesionDe(rol = 'Administrador') {
  if (cache.has(rol)) return cache.get(rol);
  const { rows } = await pool.query(
    `SELECT s.session_id, u.id AS usuario_id, u.nombre, u.rol::text AS rol,
            u.organizacion_id
       FROM sessions s JOIN usuario u ON u.id = s.usuario_id
      WHERE s.expires_at > NOW() AND u.activo = true AND u.rol::text = $1
      ORDER BY s.expires_at DESC LIMIT 1`, [rol]);
  if (!rows.length) return null;
  cache.set(rol, rows[0]);
  return rows[0];
}

/** Qué roles hay con sesión viva. Las pruebas de permisos se saltan solas si
 *  falta el rol que necesitan, en vez de fallar por algo ajeno al código. */
export async function rolesDisponibles() {
  const { rows } = await pool.query(
    `SELECT DISTINCT u.rol::text AS rol FROM sessions s JOIN usuario u ON u.id = s.usuario_id
      WHERE s.expires_at > NOW() AND u.activo = true`);
  return rows.map(r => r.rol);
}

// ── Cliente HTTP ────────────────────────────────────────────────────────────
export async function pedir(ruta, { metodo = 'GET', cuerpo, sesion, empresaId,
                                    sinSesion = false } = {}) {
  const cabeceras = { 'Content-Type': 'application/json' };
  if (!sinSesion) {
    const s = sesion || await sesionDe();
    if (s) cabeceras['x-session-id'] = s.session_id;
  }
  if (empresaId) cabeceras['x-company-id'] = empresaId;

  const inicio = performance.now();
  const res = await fetch(`${API}${ruta}`, {
    method: metodo, headers: cabeceras,
    ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
  });
  const ms = Math.round(performance.now() - inicio);

  const texto = await res.text();
  let datos = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch { datos = { _crudo: texto.slice(0, 300) }; }

  return { estado: res.status, ok: res.ok, datos, ms, cabeceras: res.headers };
}

// ── Limpieza ────────────────────────────────────────────────────────────────
// Lo que una prueba crea, la prueba lo borra. Sin esto la suite ensucia la base
// de producción y la segunda corrida falla por datos de la primera.
const basura = [];
export function alTerminar(fn) { basura.push(fn); }
export async function limpiar() {
  for (const fn of basura.reverse()) {
    try { await fn(); } catch (e) { console.error('  ⚠ limpieza:', e.message); }
  }
  basura.length = 0;
}

export { pool };
export async function cerrar() { await limpiar(); await pool.end(); }
