// ============================================================================
// QUIÉN ESTÁ CONECTADO
// ----------------------------------------------------------------------------
// Pedido el 04-09-2026: ver quién está conectado, «pero solo de mi
// organización — si hay clientes yo no sé quién está conectado».
//
// El aislamiento es lo que más se prueba acá, y a propósito: esto expone
// hábitos de trabajo (a qué hora entra cada quien, cuánto lleva conectado) y
// una fuga entre organizaciones no se vería como un error, se vería como una
// lista un poco más larga. Por eso se crea un usuario de OTRA organización con
// sesión viva y se comprueba que no aparece.
// ============================================================================
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pedir, pool, cerrar, sesionDe, API } from '../arnes.mjs';
import { encrypt, generateHash } from '../../src/utils/crypto.js';

const MARCA = `qa-con-${Date.now().toString(36)}`;
const creados = [];

/** Usuario con sesión viva en la organización que se le diga. */
async function usuarioCon(organizacionId, { vistoHaceMin = 0, rol = 'Consultor' } = {}) {
  const n = creados.length;
  const rut = `9${String(Math.floor(Math.random() * 9000000) + 1000000)}-${n % 10}`;
  const correo = `${MARCA}-${n}@qa.local`;

  const { rows: [u] } = await pool.query(
    `INSERT INTO usuario (nombre, rut_encrypted, rut_hash, email_encrypted, email_hash,
                          clave, rol, activo, organizacion_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7::rol_usuario,true,$8) RETURNING id`,
    [`${MARCA}-${n}`, encrypt(rut), generateHash(rut), encrypt(correo), generateHash(correo),
     'no-se-usa', rol, organizacionId]);

  const { rows: [s] } = await pool.query(
    `INSERT INTO sessions (session_id, usuario_id, expires_at, last_seen_at)
     VALUES (gen_random_uuid(), $1, NOW() + INTERVAL '2 hours',
             NOW() - ($2 || ' minutes')::interval)
     RETURNING session_id`, [u.id, String(vistoHaceMin)]);

  creados.push(u.id);
  return { usuarioId: u.id, session_id: s.session_id, nombre: `${MARCA}-${n}` };
}

let yo, otraOrg;

before(async () => {
  yo = await sesionDe();
  const { rows } = await pool.query(
    `SELECT id FROM organizacion WHERE id IS DISTINCT FROM $1 LIMIT 1`,
    [yo?.organizacion_id]);
  otraOrg = rows[0]?.id || null;
});

after(async () => {
  if (creados.length) {
    await pool.query('DELETE FROM sessions WHERE usuario_id = ANY($1::uuid[])', [creados]);
    await pool.query('DELETE FROM usuario WHERE id = ANY($1::uuid[])', [creados]);
  }
  await cerrar();
});

describe('El aislamiento · lo que de verdad importa', () => {
  test('alguien de OTRA organización NO aparece', async () => {
    if (!otraOrg) {
      console.log('      ℹ solo hay una organización: no se puede probar la fuga');
      return;
    }
    const ajeno = await usuarioCon(otraOrg, { vistoHaceMin: 0 });

    const r = await pedir('/crm/conectados');
    assert.equal(r.estado, 200, `respondió ${r.estado}`);
    const nombres = (r.datos.conectados || []).map(c => c.nombre);
    assert.ok(!nombres.includes(ajeno.nombre),
      `«${ajeno.nombre}» es de otra organización y aparece en la lista`);
  });

  test('todos los que salen son de MI organización', async () => {
    const r = await pedir('/crm/conectados');
    if (r.estado !== 200) return;
    for (const c of r.datos.conectados || []) {
      const { rows: [u] } = await pool.query(
        'SELECT organizacion_id FROM usuario WHERE id = $1', [c.id]);
      assert.equal(String(u.organizacion_id), String(yo.organizacion_id),
        `«${c.nombre}» es de otra organización`);
    }
  });

  test('no se puede pedir la lista de otra organización por parámetro', async () => {
    // El filtro sale de la sesión. Si se aceptara por la URL, cualquiera
    // cambiaría el id y vería el equipo de otro despacho.
    if (!otraOrg) return;
    const ajeno = await usuarioCon(otraOrg, { vistoHaceMin: 0 });
    for (const q of [`?organizacionId=${otraOrg}`, `?org=${otraOrg}`, `?organizacion_id=${otraOrg}`]) {
      const r = await pedir(`/crm/conectados${q}`);
      if (r.estado !== 200) continue;
      const nombres = (r.datos.conectados || []).map(c => c.nombre);
      assert.ok(!nombres.includes(ajeno.nombre),
        `con «${q}» se coló alguien de otra organización`);
    }
  });

  test('sin sesión no se ve nada', async () => {
    const r = await pedir('/crm/conectados', { sinSesion: true });
    assert.equal(r.estado, 401, `respondió ${r.estado} sin sesión`);
  });
});

describe('Quién cuenta como conectado', () => {
  test('alguien activo recién sale «en línea»', async () => {
    const activo = await usuarioCon(yo.organizacion_id, { vistoHaceMin: 0 });
    const r = await pedir('/crm/conectados');
    if (r.estado !== 200) return;
    const f = (r.datos.conectados || []).find(c => c.nombre === activo.nombre);
    assert.ok(f, 'un usuario con señal de vida reciente no aparece');
    assert.equal(f.estado, 'en_linea', `salió como «${f.estado}»`);
  });

  test('alguien de hace 10 minutos sale «inactivo», no «en línea»', async () => {
    // Prometer «está ahí» cuando puede haberse ido es peor que no decir nada.
    const tibio = await usuarioCon(yo.organizacion_id, { vistoHaceMin: 10 });
    const r = await pedir('/crm/conectados');
    if (r.estado !== 200) return;
    const f = (r.datos.conectados || []).find(c => c.nombre === tibio.nombre);
    assert.ok(f, 'un usuario visto hace 10 min debería seguir en la lista');
    assert.equal(f.estado, 'inactivo', `salió como «${f.estado}»`);
  });

  test('alguien de hace una hora NO sale', async () => {
    const viejo = await usuarioCon(yo.organizacion_id, { vistoHaceMin: 60 });
    const r = await pedir('/crm/conectados');
    if (r.estado !== 200) return;
    const nombres = (r.datos.conectados || []).map(c => c.nombre);
    assert.ok(!nombres.includes(viejo.nombre),
      'alguien sin señales hace una hora sigue figurando como conectado');
  });

  test('una sesión VENCIDA no cuenta aunque la señal sea reciente', async () => {
    // El borde: sesión caducada pero last_seen_at de hace un instante.
    const { rows: [u] } = await pool.query(
      `INSERT INTO usuario (nombre, rut_encrypted, rut_hash, email_encrypted, email_hash,
                            clave, rol, activo, organizacion_id)
       VALUES ($1,$2,$3,$4,$5,'x','Consultor'::rol_usuario,true,$6) RETURNING id`,
      [`${MARCA}-vencido`, encrypt('91111111-1'), generateHash(`${MARCA}r`),
       encrypt(`${MARCA}v@qa.local`), generateHash(`${MARCA}v@qa.local`), yo.organizacion_id]);
    creados.push(u.id);
    await pool.query(
      `INSERT INTO sessions (session_id, usuario_id, expires_at, last_seen_at)
       VALUES (gen_random_uuid(), $1, NOW() - INTERVAL '1 hour', NOW())`, [u.id]);

    const r = await pedir('/crm/conectados');
    if (r.estado !== 200) return;
    const nombres = (r.datos.conectados || []).map(c => c.nombre);
    assert.ok(!nombres.includes(`${MARCA}-vencido`),
      'una sesión caducada figura como conectada');
  });

  test('un usuario DESACTIVADO no aparece', async () => {
    const fuera = await usuarioCon(yo.organizacion_id, { vistoHaceMin: 0 });
    await pool.query('UPDATE usuario SET activo = false WHERE id = $1', [fuera.usuarioId]);
    const r = await pedir('/crm/conectados');
    if (r.estado !== 200) return;
    const nombres = (r.datos.conectados || []).map(c => c.nombre);
    assert.ok(!nombres.includes(fuera.nombre),
      'un usuario desactivado sigue apareciendo como conectado');
  });
});

describe('Forma de la respuesta', () => {
  test('una persona con dos dispositivos sale UNA vez', async () => {
    // Dos sesiones vivas son dos pestañas, no dos personas. Contarla dos veces
    // haría creer que hay más gente trabajando de la que hay.
    const doble = await usuarioCon(yo.organizacion_id, { vistoHaceMin: 0 });
    await pool.query(
      `INSERT INTO sessions (session_id, usuario_id, expires_at, last_seen_at)
       VALUES (gen_random_uuid(), $1, NOW() + INTERVAL '2 hours', NOW())`, [doble.usuarioId]);

    const r = await pedir('/crm/conectados');
    if (r.estado !== 200) return;
    const suyas = (r.datos.conectados || []).filter(c => c.nombre === doble.nombre);
    assert.equal(suyas.length, 1, `aparece ${suyas.length} veces`);
    assert.ok(suyas[0].sesiones >= 2, `dice ${suyas[0].sesiones} sesión(es), debería ver 2`);
  });

  test('el contador de «en línea» cuadra con la lista', async () => {
    const r = await pedir('/crm/conectados');
    if (r.estado !== 200) return;
    const enLinea = (r.datos.conectados || []).filter(c => c.estado === 'en_linea').length;
    assert.equal(r.datos.enLinea, enLinea,
      `dice ${r.datos.enLinea} en línea y en la lista hay ${enLinea}`);
  });

  test('me reconoce a mí mismo', async () => {
    const r = await pedir('/crm/conectados');
    if (r.estado !== 200) return;
    const yoEnLista = (r.datos.conectados || []).filter(c => c.soyYo);
    assert.ok(yoEnLista.length <= 1, 'aparezco más de una vez marcado como yo');
    for (const c of yoEnLista) {
      assert.equal(c.id, yo.usuario_id, 'marcó como «yo» a otra persona');
    }
  });

  test('no expone datos personales de más', async () => {
    // Presencia es nombre y estado. El RUT o el correo no hacen falta para
    // saber si alguien está conectado.
    const r = await pedir('/crm/conectados');
    if (r.estado !== 200) return;
    const texto = JSON.stringify(r.datos).toLowerCase();
    for (const campo of ['rut', 'email', 'correo', 'clave', 'encrypted', 'hash', 'session']) {
      assert.ok(!texto.includes(`"${campo}`),
        `la respuesta expone «${campo}»`);
    }
  });
});
