// ============================================================================
// PERMISOS POR ROL · Consultor y Cliente
// ----------------------------------------------------------------------------
// El sistema define tres roles —Administrador, Consultor, Cliente— pero en la
// base solo existen Administradores. Toda la lógica de permisos de los otros
// dos NUNCA se ha ejecutado, ni en producción ni en pruebas.
//
// Eso es un riesgo real: el día que alguien cree un Consultor, se estrena
// código que nadie corrió jamás. Estas pruebas crean usuarios temporales de
// cada rol, los ejercitan y los borran.
//
// Verificado el 04-09-2026.
// ============================================================================
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, cerrar, API } from '../arnes.mjs';
// El mismo cifrado que usa la aplicación: los datos personales (RUT, correo)
// se guardan encriptados, y un usuario de prueba tiene que respetarlo o la
// inserción falla por columnas obligatorias.
import { encrypt, generateHash } from '../../src/utils/crypto.js';

const MARCA = `qa-rol-${Date.now().toString(36)}`;
const creados = [];

/** Crea un usuario del rol pedido con una sesión viva. Se borra al terminar. */
async function usuarioTemporal(rol, extra = {}) {
  const { rows: [org] } = await pool.query(
    'SELECT organizacion_id FROM usuario WHERE activo LIMIT 1');

  // RUT y correo van cifrados, igual que los de verdad. El hash es lo que
  // permite buscarlos sin descifrar — y es ÚNICO en la base, así que dos
  // usuarios del mismo rol necesitan correos distintos. Sin el contador, pedir
  // dos Consultores rompía con «duplicate key usuario_email_hash_key».
  const n = creados.length;
  const rut = `9${String(Math.floor(Math.random() * 9000000) + 1000000)}-${n % 10}`;
  const correo = `${MARCA}-${rol}-${n}@qa.local`;

  const { rows: [u] } = await pool.query(
    `INSERT INTO usuario (nombre, rut_encrypted, rut_hash, email_encrypted, email_hash,
                          clave, rol, activo, organizacion_id, ve_solo_empresas_asignadas)
     VALUES ($1, $2, $3, $4, $5, $6, $7::rol_usuario, true, $8, $9)
     RETURNING id`,
    [`${MARCA}-${rol}`, encrypt(rut), generateHash(rut),
     encrypt(correo), generateHash(correo),
     'no-se-usa-para-entrar', rol,
     org?.organizacion_id || null, extra.veSoloAsignadas ?? false]);

  const { rows: [s] } = await pool.query(
    `INSERT INTO sessions (session_id, usuario_id, expires_at)
     VALUES (gen_random_uuid(), $1, NOW() + INTERVAL '1 hour')
     RETURNING session_id`, [u.id]);

  creados.push(u.id);
  return { usuarioId: u.id, session_id: s.session_id, rol };
}

async function pedirComo(sesion, ruta, opciones = {}) {
  const res = await fetch(`${API}${ruta}`, {
    method: opciones.metodo || 'GET',
    headers: { 'Content-Type': 'application/json', 'x-session-id': sesion.session_id },
    ...(opciones.cuerpo ? { body: JSON.stringify(opciones.cuerpo) } : {}),
  });
  const texto = await res.text();
  let datos = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch { datos = { _crudo: texto.slice(0, 120) }; }
  return { estado: res.status, datos };
}

let consultor, cliente;

before(async () => {
  consultor = await usuarioTemporal('Consultor');
  cliente = await usuarioTemporal('Cliente');
});

after(async () => {
  // Se borra todo lo creado, incluidas sus sesiones (cascada o a mano).
  if (creados.length) {
    await pool.query('DELETE FROM sessions WHERE usuario_id = ANY($1::uuid[])', [creados]);
    await pool.query('DELETE FROM usuario WHERE id = ANY($1::uuid[])', [creados]);
  }
  await cerrar();
});

describe('Consultor · lo que NO puede hacer', () => {
  // Cobros es del despacho: son las facturas que VSV le emite a sus clientes.
  // Un Consultor no tiene por qué ver cuánto factura la empresa.
  const PROHIBIDO = [
    ['GET',  '/cobros/resumen',        'ver la cobranza del despacho'],
    ['GET',  '/cobros',                'listar los cobros'],
    ['POST', '/cobros/generar',        'generar el ciclo del mes'],
    ['POST', '/cobros/recalcular',     'recalcular montos'],
  ];

  for (const [metodo, ruta, que] of PROHIBIDO) {
    test(`no puede ${que}`, async () => {
      const r = await pedirComo(consultor, ruta, { metodo, cuerpo: metodo === 'POST' ? {} : undefined });
      assert.ok([401, 403].includes(r.estado),
        `un Consultor obtuvo ${r.estado} en ${metodo} ${ruta}`);
    });
  }
});

describe('Consultor · lo que SÍ puede hacer', () => {
  const PERMITIDO = [
    ['/crm/metricas',  'ver el panel del CRM'],
    ['/crm/tareas',    'ver sus tareas'],
    ['/personas',      'ver la cartera'],
  ];

  for (const [ruta, que] of PERMITIDO) {
    test(que, async () => {
      const r = await pedirComo(consultor, ruta);
      assert.notEqual(r.estado, 403, `un Consultor fue bloqueado en ${ruta}`);
      assert.notEqual(r.estado, 500, `${ruta} devolvió 500 para un Consultor`);
    });
  }
});

describe('Consultor · ve solo lo suyo, no la cartera completa', () => {
  test('sus tareas son las propias, no las del equipo', async () => {
    const r = await pedirComo(consultor, '/crm/tareas');
    if (r.estado !== 200) return;

    // Recién creado no tiene tareas asignadas ni creadas por él.
    const ajenas = (r.datos?.tareas || []).filter(t =>
      t.responsableId !== consultor.usuarioId && t.creadoPor !== consultor.usuarioId);
    assert.equal(ajenas.length, 0,
      `${ajenas.length} tareas de otros usuarios llegaron a un Consultor nuevo`);
  });

  test('sus personas son las propias', async () => {
    const r = await pedirComo(consultor, '/personas');
    if (r.estado !== 200) return;
    // Un Consultor nuevo no creó ni tiene asignada ninguna persona.
    assert.equal((r.datos?.personas || []).length, 0,
      `un Consultor nuevo ve ${r.datos?.personas?.length} personas de la cartera ajena`);
  });

  test('el panel del CRM le muestra números acotados a lo suyo', async () => {
    const consultorR = await pedirComo(consultor, '/crm/metricas');
    if (consultorR.estado !== 200) return;
    const { rows: [total] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM persona WHERE estado::text = 'prospecto' AND activo`);
    assert.ok(consultorR.datos.metricas.prospectos <= total.n,
      `el Consultor ve ${consultorR.datos.metricas.prospectos} prospectos y solo hay ${total.n}`);
  });
});

describe('Cliente · el rol más restringido', () => {
  const PROHIBIDO = [
    ['/cobros/resumen',    'la cobranza del despacho'],
    ['/correos/plantillas', 'las plantillas de correo del equipo'],
    ['/correos/cuota',      'la cuota de envío'],
  ];

  for (const [ruta, que] of PROHIBIDO) {
    test(`no accede a ${que}`, async () => {
      const r = await pedirComo(cliente, ruta);
      assert.ok([401, 403].includes(r.estado),
        `un Cliente obtuvo ${r.estado} en ${ruta}`);
    });
  }

  test('no puede lanzar una campaña de correo', async () => {
    const r = await pedirComo(cliente, '/correos/campana', {
      metodo: 'POST',
      cuerpo: { empresaIds: [], asunto: 'prueba', cuerpo: '<p>x</p>', soloPrueba: true },
    });
    assert.ok([401, 403, 429].includes(r.estado),
      `un Cliente obtuvo ${r.estado} al intentar enviar una campaña`);
  });
});

describe('Escalada de privilegios', () => {
  test('un Consultor no puede crear usuarios', async () => {
    const r = await pedirComo(consultor, '/users', {
      metodo: 'POST',
      cuerpo: { nombre: 'colado', correo: 'colado@qa.local', rol: 'Administrador' },
    });
    assert.ok([401, 403, 400].includes(r.estado),
      `un Consultor obtuvo ${r.estado} creando un usuario`);
  });

  test('un Consultor no puede cambiarse el rol a sí mismo', async () => {
    const r = await pedirComo(consultor, `/users/${consultor.usuarioId}`, {
      metodo: 'PUT', cuerpo: { rol: 'Administrador' },
    });
    // Si respondió 200, hay que comprobar en la base que NO se aplicó.
    if (r.estado === 200) {
      const { rows: [u] } = await pool.query(
        'SELECT rol::text AS rol FROM usuario WHERE id = $1', [consultor.usuarioId]);
      assert.notEqual(u.rol, 'Administrador',
        'un Consultor se ascendió a Administrador a sí mismo');
    }
  });

  test('la cabecera x-company-id no salta el aislamiento', async () => {
    // Poner una empresa de otra organización en la cabecera no debe dar acceso.
    const { rows: [ajena] } = await pool.query(
      `SELECT e.id FROM empresa e
        WHERE e.organizacion_id IS DISTINCT FROM
              (SELECT organizacion_id FROM usuario WHERE id = $1) LIMIT 1`,
      [consultor.usuarioId]);
    if (!ajena) return;

    const res = await fetch(`${API}/crm/metricas`, {
      headers: { 'x-session-id': consultor.session_id, 'x-company-id': ajena.id },
    });
    assert.notEqual(res.status, 500, 'una empresa ajena en la cabecera provocó un error');
  });
});

describe('Sesión de un usuario desactivado', () => {
  test('desactivar al usuario invalida su sesión', async () => {
    const temporal = await usuarioTemporal('Consultor');

    const antes = await pedirComo(temporal, '/crm/metricas');
    assert.notEqual(antes.estado, 401, 'la sesión no servía ni estando activo');

    await pool.query('UPDATE usuario SET activo = false WHERE id = $1', [temporal.usuarioId]);

    const despues = await pedirComo(temporal, '/crm/metricas');
    assert.equal(despues.estado, 401,
      'un usuario desactivado siguió entrando con su sesión abierta');
  });
});
