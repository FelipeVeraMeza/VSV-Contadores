// ============================================================================
// SESIONES · caducar sin dejar a nadie colgado
// ----------------------------------------------------------------------------
// Reportado el 04-09-2026: «inicio sesión, pasa mucho tiempo y después debo
// cerrar sesión y volver a entrar».
//
// El diagnóstico NO fue que la sesión caducara —dura 24 h y se renueva sola
// mientras se use— sino que al caducar nadie avisaba: `fetchWithAuth` recibía
// el 401, lo escribía en la consola y devolvía la respuesta como si nada. La
// pantalla se quedaba con los datos viejos, sin responder, y la única forma de
// enterarse era cerrar sesión a mano.
//
// Acá se prueba lo que sostiene el arreglo por el lado del servidor: que el
// 401 llegue de verdad cuando toca, que la renovación deslizante funcione, y
// que el barrido no se lleve nunca una sesión viva.
// ============================================================================
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { pedir, pool, cerrar, sesionDe, API } from '../arnes.mjs';
import { barrerSesiones } from '../../src/utils/limpiezaSesiones.js';

after(cerrar);

const comoSesion = async (sessionId, ruta = '/crm/metricas') => {
  const res = await fetch(`${API}${ruta}`, {
    headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
  });
  return res.status;
};

describe('El 401 llega cuando tiene que llegar', () => {
  test('sin sesión no se entra', async () => {
    const r = await pedir('/crm/metricas', { sinSesion: true });
    assert.equal(r.estado, 401, `respondió ${r.estado} sin sesión`);
  });

  test('una sesión inventada no sirve', async () => {
    const estado = await comoSesion('00000000-0000-0000-0000-000000000000');
    assert.equal(estado, 401, `una sesión falsa obtuvo ${estado}`);
  });

  test('una sesión VENCIDA da 401, no 500', async () => {
    // El caso del reporte. Tiene que ser 401 —«vuelve a entrar»— y no un 500,
    // que la pantalla leería como «se rompió algo» y no como sesión caducada.
    const yo = await sesionDe();
    if (!yo) return;
    const { rows: [u] } = await pool.query(
      'SELECT id, organizacion_id FROM usuario WHERE activo LIMIT 1');

    const { rows: [s] } = await pool.query(
      `INSERT INTO sessions (session_id, usuario_id, expires_at)
       VALUES (gen_random_uuid(), $1, NOW() - INTERVAL '1 hour')
       RETURNING session_id`, [u.id]);
    try {
      const estado = await comoSesion(s.session_id);
      assert.equal(estado, 401,
        `una sesión vencida obtuvo ${estado}: la pantalla no sabría que caducó`);
    } finally {
      await pool.query('DELETE FROM sessions WHERE session_id = $1', [s.session_id]);
    }
  });
});

describe('La renovación deslizante', () => {
  test('usar el sistema estira la sesión', async () => {
    // Es lo que hace que trabajando no te eche: si quedan menos de 12 h, el
    // middleware la extiende a 24. Sin esto habría que volver a entrar cada
    // día a la misma hora, estuvieras usándolo o no.
    const { rows: [u] } = await pool.query(
      'SELECT id FROM usuario WHERE activo LIMIT 1');

    // Una sesión viva pero por debajo del umbral de 12 h.
    const { rows: [s] } = await pool.query(
      `INSERT INTO sessions (session_id, usuario_id, expires_at)
       VALUES (gen_random_uuid(), $1, NOW() + INTERVAL '2 hours')
       RETURNING session_id, expires_at`, [u.id]);
    try {
      const estado = await comoSesion(s.session_id);
      assert.ok(estado !== 401, `la sesión válida fue rechazada con ${estado}`);

      // La extensión se manda sin esperar respuesta, así que se le da un
      // instante antes de mirar la base.
      await new Promise(r => setTimeout(r, 600));
      const { rows: [d] } = await pool.query(
        'SELECT expires_at FROM sessions WHERE session_id = $1', [s.session_id]);
      const antes = new Date(s.expires_at).getTime();
      const despues = new Date(d.expires_at).getTime();
      assert.ok(despues > antes,
        'usar el sistema no estiró la sesión: caducaría en medio del trabajo');

      const horas = (despues - Date.now()) / 3600000;
      assert.ok(horas > 20, `quedó en ${horas.toFixed(1)} h, se esperaban ~24`);
    } finally {
      await pool.query('DELETE FROM sessions WHERE session_id = $1', [s.session_id]);
    }
  });

  test('una sesión con mucho tiempo por delante no se toca', async () => {
    const { rows: [u] } = await pool.query(
      'SELECT id FROM usuario WHERE activo LIMIT 1');
    const { rows: [s] } = await pool.query(
      `INSERT INTO sessions (session_id, usuario_id, expires_at)
       VALUES (gen_random_uuid(), $1, NOW() + INTERVAL '23 hours')
       RETURNING session_id, expires_at`, [u.id]);
    try {
      await comoSesion(s.session_id);
      await new Promise(r => setTimeout(r, 600));
      const { rows: [d] } = await pool.query(
        'SELECT expires_at FROM sessions WHERE session_id = $1', [s.session_id]);
      assert.equal(new Date(d.expires_at).getTime(), new Date(s.expires_at).getTime(),
        'se reescribió una sesión que no lo necesitaba: escrituras de más en cada petición');
    } finally {
      await pool.query('DELETE FROM sessions WHERE session_id = $1', [s.session_id]);
    }
  });
});

describe('El barrido de sesiones caducadas', () => {
  test('se lleva las vencidas', async () => {
    const { rows: [u] } = await pool.query(
      'SELECT id FROM usuario WHERE activo LIMIT 1');
    const { rows: [s] } = await pool.query(
      `INSERT INTO sessions (session_id, usuario_id, expires_at)
       VALUES (gen_random_uuid(), $1, NOW() - INTERVAL '2 days')
       RETURNING session_id`, [u.id]);

    await barrerSesiones();
    const { rows } = await pool.query(
      'SELECT 1 FROM sessions WHERE session_id = $1', [s.session_id]);
    assert.equal(rows.length, 0, 'la sesión vencida sigue en la tabla');
  });

  test('NUNCA se lleva una viva', async () => {
    // Lo que importa de verdad: si el barrido se equivocara, echaría a gente
    // conectada. Se comprueba con una sesión a punto de vencer, que es el
    // borde donde un error de signo se notaría.
    const { rows: [u] } = await pool.query(
      'SELECT id FROM usuario WHERE activo LIMIT 1');
    const { rows: [s] } = await pool.query(
      `INSERT INTO sessions (session_id, usuario_id, expires_at)
       VALUES (gen_random_uuid(), $1, NOW() + INTERVAL '1 minute')
       RETURNING session_id`, [u.id]);
    try {
      await barrerSesiones();
      const { rows } = await pool.query(
        'SELECT 1 FROM sessions WHERE session_id = $1', [s.session_id]);
      assert.equal(rows.length, 1,
        'el barrido borró una sesión todavía válida: echaría a alguien conectado');
    } finally {
      await pool.query('DELETE FROM sessions WHERE session_id = $1', [s.session_id]);
    }
  });

  test('las sesiones del equipo siguen sirviendo después de barrer', async () => {
    await barrerSesiones();
    const r = await pedir('/crm/metricas');
    assert.notEqual(r.estado, 401,
      'tras el barrido la sesión de trabajo dejó de servir');
  });

  test('cuántas quedan en la tabla', async () => {
    const { rows: [b] } = await pool.query(
      `SELECT COUNT(*)::int total,
              COUNT(*) FILTER (WHERE expires_at <= NOW())::int caducadas
         FROM sessions`);
    console.log(`      ℹ sessions: ${b.total} fila(s), ${b.caducadas} caducada(s)`);
    assert.equal(b.caducadas, 0,
      `quedaron ${b.caducadas} sesiones caducadas después de barrer`);
  });
});
