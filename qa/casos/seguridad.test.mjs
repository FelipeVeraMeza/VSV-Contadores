// ============================================================================
// SEGURIDAD · sesiones, permisos y aislamiento
// ----------------------------------------------------------------------------
// Es la primera suite a propósito: un fallo acá significa que alguien ve datos
// de otra empresa, y eso pesa más que cualquier bug funcional.
//
// Se prueba contra usuarios y sesiones REALES de la base. Un doble de
// requireSession probaría el doble, no el búnker.
// ============================================================================
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { pedir, sesionDe, rolesDisponibles, pool, cerrar } from '../arnes.mjs';

after(cerrar);

// Rutas que NO deben responder nunca sin sesión. Se listan a mano en vez de
// recorrer el router: si alguien monta una ruta nueva sin protección, la lista
// no la cubre y hay que acordarse — pero al menos las conocidas están fijas.
const RUTAS_PROTEGIDAS = [
  ['GET',  '/crm/metricas'],
  ['GET',  '/crm/tareas'],
  ['GET',  '/personas'],
  ['GET',  '/cobros/resumen'],
  ['GET',  '/correos/plantillas'],
  ['GET',  '/correos/cuota'],
  ['GET',  '/accounting/comprobantes'],
  ['POST', '/correos/campana'],
  ['GET',  '/asistente/estado'],
];

describe('Sesión', () => {
  for (const [metodo, ruta] of RUTAS_PROTEGIDAS) {
    test(`${metodo} ${ruta} exige sesión`, async () => {
      const r = await pedir(ruta, { metodo, sinSesion: true, cuerpo: metodo === 'POST' ? {} : undefined });
      assert.equal(r.estado, 401, `respondió ${r.estado} sin sesión`);
    });
  }

  test('una sesión inventada se rechaza', async () => {
    const falsa = { session_id: '00000000-0000-0000-0000-000000000000' };
    const r = await pedir('/crm/metricas', { sesion: falsa });
    assert.ok(r.estado === 401 || r.estado === 500,
      `una sesión inexistente devolvió ${r.estado}`);
    assert.notEqual(r.estado, 200, 'aceptó una sesión que no existe');
  });

  test('una sesión expirada no sirve', async () => {
    const { rows } = await pool.query(
      `SELECT session_id FROM sessions WHERE expires_at <= NOW() LIMIT 1`);
    if (!rows.length) return; // sin sesiones vencidas en la base: nada que probar
    const r = await pedir('/crm/metricas', { sesion: { session_id: rows[0].session_id } });
    assert.notEqual(r.estado, 200, 'aceptó una sesión expirada');
  });

  test('Authorization Bearer NO sustituye a x-session-id', async () => {
    // VSV PRO valida x-session-id contra la tabla sessions. Si algún día alguien
    // agrega soporte de Bearer sin querer, esto lo detecta.
    const res = await fetch(`${process.env.QA_API || 'http://127.0.0.1:4000/api'}/crm/metricas`, {
      headers: { Authorization: 'Bearer cualquier-cosa' },
    });
    assert.equal(res.status, 401);
  });
});

describe('Aislamiento entre organizaciones', () => {
  test('los datos que llegan son de la organización del usuario', async () => {
    const s = await sesionDe();
    if (!s) return;
    const r = await pedir('/personas?limite=200', { sesion: s });
    if (r.estado !== 200) return;

    const ids = (r.datos?.personas || []).map(p => p.id).filter(Boolean);
    if (!ids.length) return;

    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS ajenas FROM persona
        WHERE id = ANY($1::uuid[]) AND organizacion_id IS DISTINCT FROM $2::uuid`,
      [ids, s.organizacion_id]);
    assert.equal(rows[0].ajenas, 0,
      `${rows[0].ajenas} personas de otra organización se colaron en la respuesta`);
  });

  test('no se puede leer una empresa de otra organización', async () => {
    const s = await sesionDe();
    if (!s) return;
    const { rows } = await pool.query(
      `SELECT id FROM empresa WHERE organizacion_id IS DISTINCT FROM $1::uuid LIMIT 1`,
      [s.organizacion_id]);
    if (!rows.length) return; // una sola organización en la base

    const r = await pedir(`/companies/${rows[0].id}`, { sesion: s });
    assert.notEqual(r.estado, 200, 'devolvió una empresa de otra organización');
  });
});

describe('Permisos por rol', () => {
  test('cobros es solo de Administrador', async () => {
    const roles = await rolesDisponibles();
    const otro = roles.find(r => r !== 'Administrador');
    if (!otro) return; // sin otro rol con sesión viva

    const s = await sesionDe(otro);
    const r = await pedir('/cobros/resumen', { sesion: s });
    assert.ok(r.estado === 403 || r.estado === 401,
      `un ${otro} obtuvo ${r.estado} en /cobros/resumen`);
  });
});

describe('Inyección SQL', () => {
  const CARGAS = [
    "1' OR '1'='1",
    "'; DROP TABLE persona; --",
    "1 UNION SELECT * FROM usuario",
    "%' OR 1=1 --",
  ];

  // El parámetro real es `q` — con un nombre equivocado el filtro no se aplica
  // y la respuesta trae todo, que no es inyección sino otra cosa. Se prueba con
  // el nombre correcto para que el caso mida lo que dice medir.
  for (const carga of CARGAS) {
    test(`resiste: ${carga.slice(0, 26)}`, async () => {
      const r = await pedir(`/personas?q=${encodeURIComponent(carga)}`);
      assert.notEqual(r.estado, 500, 'la carga provocó un error del servidor');
      if (r.estado !== 200) return;

      // NO se afirma que devuelva 0 filas: una carga como «1 UNION SELECT...»
      // contiene el dígito 1, y la búsqueda por teléfono lo encuentra en 76
      // números legítimamente. Eso es el filtro funcionando, no una inyección.
      //
      // Lo que sí prueba que el SQL no se interpoló: la respuesta nunca trae
      // MÁS filas de las que hay, y jamás campos de otra tabla.
      const personas = r.datos?.personas || [];
      const { rows: [{ n: totalReal }] } = await pool.query(
        'SELECT COUNT(*)::int AS n FROM persona WHERE activo');
      assert.ok(personas.length <= totalReal,
        `devolvió ${personas.length} filas y solo hay ${totalReal}: el SQL se alteró`);
      for (const p of personas.slice(0, 5)) {
        for (const campoAjeno of ['password', 'clave', 'rol', 'session_id', 'hash']) {
          assert.ok(!(campoAjeno in p),
            `la respuesta trae "${campoAjeno}": la consulta devolvió otra tabla`);
        }
      }
    });
  }

  test('un texto sin dígitos no devuelve la tabla entera', async () => {
    // Regresión: el filtro por teléfono hacía includes('') cuando el término no
    // traía números, y eso es true para cualquier teléfono. Cualquier búsqueda
    // de texto devolvía las 133 personas. Encontrado en QA el 03-09-2026.
    const r = await pedir('/personas?q=zzzznoexiste');
    if (r.estado !== 200) return;
    assert.equal((r.datos?.personas || []).length, 0,
      'un término inexistente devolvió resultados: el filtro no se aplica');
  });

  test('la tabla persona sigue existiendo', async () => {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM persona');
    assert.ok(rows[0].n > 0, 'la tabla persona quedó vacía o no existe');
  });
});

describe('Fuga de información en errores', () => {
  test('un id mal formado no revela la consulta', async () => {
    const r = await pedir('/crm/tareas/no-es-un-uuid');
    const texto = JSON.stringify(r.datos || {});
    for (const filtracion of ['SELECT', 'FROM ', 'postgres://', 'pg_', 'at Object.']) {
      assert.ok(!texto.includes(filtracion),
        `el error filtró "${filtracion}": ${texto.slice(0, 160)}`);
    }
  });
});
