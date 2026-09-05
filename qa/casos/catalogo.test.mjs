// ============================================================================
// CATÁLOGO · planes, tramos de precio y servicios
// ----------------------------------------------------------------------------
// Del ticket VARIANTES DE SERVICIOS: «los planes de contabilidad cambian según
// el nivel de facturación de la empresa, eso es una variante. Otra puede ser
// la cantidad de trabajadores para RRHH. Hay que poder configurarlo en algún
// lugar y no solo a nivel de código».
//
// Lo que más se prueba acá es que los TRAMOS NO SE PISEN. Un solape no da
// error: hace que una empresa caiga en dos precios a la vez y gane el que el
// ORDER decida. Eso no se ve hasta que alguien factura de menos, y para
// entonces ya se facturó mal varios meses.
// ============================================================================
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { pedir, pool, cerrar, alTerminar } from '../arnes.mjs';

after(cerrar);

const MARCA = `QA-cat-${Date.now().toString(36)}`;

describe('Leer el catálogo', () => {
  test('trae planes y servicios en una sola llamada', async () => {
    const r = await pedir('/clientes/catalogo');
    assert.equal(r.estado, 200, `respondió ${r.estado}`);
    assert.ok(Array.isArray(r.datos.planes), 'no trae planes');
    assert.ok(Array.isArray(r.datos.servicios), 'no trae servicios');
  });

  test('cada plan trae sus tramos anidados', async () => {
    const r = await pedir('/clientes/catalogo');
    if (r.estado !== 200) return;
    for (const p of r.datos.planes) {
      assert.ok(Array.isArray(p.tramos), `el plan «${p.nombre}» no trae tramos`);
    }
  });

  test('los tramos cargados coinciden con la base', async () => {
    const r = await pedir('/clientes/catalogo');
    if (r.estado !== 200) return;
    const { rows: [b] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM plan_precio_tramo t
         JOIN plan p ON p.id = t.plan_id`);
    const enApi = r.datos.planes.reduce((a, p) => a + p.tramos.length, 0);
    assert.equal(enApi, b.n, `la API trae ${enApi} tramos y en la base hay ${b.n}`);
  });

  test('dice cuántas empresas usan cada plan', async () => {
    // Sin este número, borrar un plan es a ciegas.
    const r = await pedir('/clientes/catalogo');
    if (r.estado !== 200) return;
    for (const p of r.datos.planes) {
      assert.equal(typeof p.empresas, 'number', `«${p.nombre}» no dice cuántas empresas lo usan`);
      const { rows: [b] } = await pool.query(
        'SELECT COUNT(*)::int AS n FROM empresa_plan WHERE plan_id = $1', [p.id]);
      assert.equal(p.empresas, b.n, `«${p.nombre}» dice ${p.empresas} y son ${b.n}`);
    }
  });

  test('sin sesión no se ve el catálogo', async () => {
    const r = await pedir('/clientes/catalogo', { sinSesion: true });
    assert.equal(r.estado, 401, `respondió ${r.estado}`);
  });
});

describe('Ciclo de un plan', () => {
  let planId = null;

  test('1 · se crea', async () => {
    const r = await pedir('/clientes/catalogo/planes', {
      metodo: 'POST', cuerpo: { nombre: `${MARCA} plan`, precioBase: 25000 },
    });
    alTerminar(async () => {
      await pool.query(
        `DELETE FROM plan_precio_tramo WHERE plan_id IN (SELECT id FROM plan WHERE nombre LIKE $1)`,
        [`${MARCA}%`]);
      await pool.query('DELETE FROM plan WHERE nombre LIKE $1', [`${MARCA}%`]);
      await pool.query('DELETE FROM servicio WHERE nombre LIKE $1', [`${MARCA}%`]);
    });
    assert.ok([200, 201].includes(r.estado), `respondió ${r.estado}: ${JSON.stringify(r.datos)}`);
    planId = r.datos?.plan?.id;
    assert.ok(planId, 'no devolvió el id');
  });

  test('2 · no deja crear otro con el mismo nombre', async () => {
    // Dos planes iguales se confunden en cada desplegable donde se eligen.
    const r = await pedir('/clientes/catalogo/planes', {
      metodo: 'POST', cuerpo: { nombre: `${MARCA} plan`, precioBase: 999 },
    });
    assert.equal(r.estado, 409, `respondió ${r.estado} en vez de rechazar el duplicado`);
  });

  test('3 · se le cambia el nombre y el precio', async () => {
    if (!planId) return;
    const r = await pedir(`/clientes/catalogo/planes/${planId}`, {
      metodo: 'PUT', cuerpo: { nombre: `${MARCA} plan editado`, precioBase: 33000 },
    });
    assert.equal(r.estado, 200, `respondió ${r.estado}`);
    const { rows } = await pool.query('SELECT nombre, precio_base FROM plan WHERE id = $1', [planId]);
    assert.equal(rows[0].nombre, `${MARCA} plan editado`);
    assert.equal(Number(rows[0].precio_base), 33000);
  });

  test('4 · se elimina', async () => {
    if (!planId) return;
    const r = await pedir(`/clientes/catalogo/planes/${planId}`, { metodo: 'DELETE' });
    assert.equal(r.estado, 200, `respondió ${r.estado}`);
    const { rows } = await pool.query('SELECT 1 FROM plan WHERE id = $1', [planId]);
    assert.equal(rows.length, 0, 'se borró pero sigue en la base');
  });

  test('5 · un plan EN USO no se puede borrar', async () => {
    // Borrarlo dejaría empresas apuntando a un plan inexistente y el cobro del
    // mes no sabría qué cobrarles.
    const { rows } = await pool.query(
      `SELECT plan_id FROM empresa_plan LIMIT 1`);
    if (!rows.length) return;
    const r = await pedir(`/clientes/catalogo/planes/${rows[0].plan_id}`, { metodo: 'DELETE' });
    assert.equal(r.estado, 409, `respondió ${r.estado}: habría borrado un plan en uso`);
    assert.ok(/empresa/i.test(JSON.stringify(r.datos)), 'el mensaje no explica por qué');
  });
});

describe('Los tramos · las variantes del plan', () => {
  let planId = null;

  test('preparación', async () => {
    const r = await pedir('/clientes/catalogo/planes', {
      metodo: 'POST', cuerpo: { nombre: `${MARCA} tramos`, precioBase: 0 },
    });
    if ([200, 201].includes(r.estado)) planId = r.datos?.plan?.id;
    alTerminar(async () => {
      await pool.query(
        `DELETE FROM plan_precio_tramo WHERE plan_id IN (SELECT id FROM plan WHERE nombre LIKE $1)`,
        [`${MARCA}%`]);
      await pool.query('DELETE FROM plan WHERE nombre LIKE $1', [`${MARCA}%`]);
    });
  });

  test('se guarda una escalera completa', async () => {
    if (!planId) return;
    const r = await pedir(`/clientes/catalogo/planes/${planId}/tramos`, {
      metodo: 'PUT',
      cuerpo: { tramos: [
        { min: 0,        max: 3000000,   precioNeto: 30000,  rrhhGratis: 0 },
        { min: 3000000,  max: 10000000,  precioNeto: 40000,  rrhhGratis: 2 },
        { min: 10000000, max: 50000000,  precioNeto: 50000,  rrhhGratis: 3 },
      ] },
    });
    assert.equal(r.estado, 200, `respondió ${r.estado}: ${JSON.stringify(r.datos)}`);

    const { rows } = await pool.query(
      `SELECT tramo_orden, tramo_min, tramo_max, precio_neto, rrhh_gratis
         FROM plan_precio_tramo WHERE plan_id = $1 ORDER BY tramo_orden`, [planId]);
    assert.equal(rows.length, 3, `quedaron ${rows.length} tramos`);
    assert.equal(Number(rows[1].precio_neto), 40000);
    assert.equal(rows[1].rrhh_gratis, 2, 'no guardó los trabajadores incluidos');
  });

  test('RECHAZA dos tramos que se pisan', async () => {
    // Es la prueba que justifica todo lo demás: con un solape, una empresa cae
    // en dos precios y no hay error visible.
    if (!planId) return;
    const r = await pedir(`/clientes/catalogo/planes/${planId}/tramos`, {
      metodo: 'PUT',
      cuerpo: { tramos: [
        { min: 0,       max: 5000000, precioNeto: 30000 },
        { min: 3000000, max: 9000000, precioNeto: 40000 },   // se pisa con el anterior
      ] },
    });
    assert.equal(r.estado, 400, `aceptó tramos solapados (respondió ${r.estado})`);
    assert.ok(/pisan|solap/i.test(JSON.stringify(r.datos)),
      'el mensaje no dice que el problema es el solape');
  });

  test('RECHAZA un tramo que termina antes de empezar', async () => {
    if (!planId) return;
    const r = await pedir(`/clientes/catalogo/planes/${planId}/tramos`, {
      metodo: 'PUT', cuerpo: { tramos: [{ min: 9000000, max: 1000000, precioNeto: 30000 }] },
    });
    assert.equal(r.estado, 400, `aceptó un tramo invertido (${r.estado})`);
  });

  test('RECHAZA precios negativos', async () => {
    if (!planId) return;
    const r = await pedir(`/clientes/catalogo/planes/${planId}/tramos`, {
      metodo: 'PUT', cuerpo: { tramos: [{ min: 0, max: 1000000, precioNeto: -5000 }] },
    });
    assert.equal(r.estado, 400, `aceptó un precio negativo (${r.estado})`);
  });

  test('un precio de CERO sí se acepta', async () => {
    // El plan FREE cuesta 0. Si se validara con `if (!precio)`, el 0 se
    // trataría como «falta el dato» y no se podría cargar.
    if (!planId) return;
    const r = await pedir(`/clientes/catalogo/planes/${planId}/tramos`, {
      metodo: 'PUT', cuerpo: { tramos: [{ min: 0, max: 300000000, precioNeto: 0 }] },
    });
    assert.equal(r.estado, 200, `rechazó un precio de 0 (${r.estado}): el plan FREE no se podría cargar`);
  });

  test('los tramos se reordenan solos y quedan numerados', async () => {
    if (!planId) return;
    const r = await pedir(`/clientes/catalogo/planes/${planId}/tramos`, {
      metodo: 'PUT',
      cuerpo: { tramos: [
        { min: 10000000, max: 50000000, precioNeto: 50000 },
        { min: 0,        max: 3000000,  precioNeto: 30000 },   // llega segundo
      ] },
    });
    if (r.estado !== 200) return;
    const { rows } = await pool.query(
      `SELECT tramo_orden, tramo_min FROM plan_precio_tramo
        WHERE plan_id = $1 ORDER BY tramo_orden`, [planId]);
    assert.equal(Number(rows[0].tramo_min), 0, 'no ordenó por monto de inicio');
    assert.deepEqual(rows.map(r => r.tramo_orden), [1, 2], 'la numeración quedó con huecos');
  });

  test('guardar de nuevo REEMPLAZA, no acumula', async () => {
    if (!planId) return;
    await pedir(`/clientes/catalogo/planes/${planId}/tramos`, {
      metodo: 'PUT', cuerpo: { tramos: [{ min: 0, max: 1000000, precioNeto: 10000 }] },
    });
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM plan_precio_tramo WHERE plan_id = $1', [planId]);
    assert.equal(rows[0].n, 1, `quedaron ${rows[0].n} tramos: se acumularon en vez de reemplazarse`);
  });

  test('un plan de otra organización no se puede tocar', async () => {
    const { rows } = await pool.query(
      `SELECT p.id FROM plan p
        WHERE p.organizacion_id IS DISTINCT FROM
              (SELECT organizacion_id FROM usuario WHERE activo LIMIT 1) LIMIT 1`);
    if (!rows.length) return;
    const r = await pedir(`/clientes/catalogo/planes/${rows[0].id}/tramos`, {
      metodo: 'PUT', cuerpo: { tramos: [{ min: 0, max: 100, precioNeto: 1 }] },
    });
    assert.ok([403, 404].includes(r.estado),
      `se pudieron editar los precios de otra organización (${r.estado})`);
  });
});

describe('Servicios', () => {
  test('se crea uno nuevo', async () => {
    const r = await pedir('/clientes/catalogo/servicios', {
      metodo: 'POST', cuerpo: { nombre: `${MARCA} servicio` },
    });
    alTerminar(async () => {
      await pool.query('DELETE FROM servicio WHERE nombre LIKE $1', [`${MARCA}%`]);
    });
    assert.ok([200, 201].includes(r.estado), `respondió ${r.estado}: ${JSON.stringify(r.datos)}`);
    assert.ok(r.datos?.servicio?.slug, 'no generó el slug');
  });

  test('se desactiva en vez de borrarse', async () => {
    // Un servicio contratado no puede desaparecer del historial de nadie.
    const { rows } = await pool.query(
      'SELECT id FROM servicio WHERE nombre LIKE $1 LIMIT 1', [`${MARCA}%`]);
    if (!rows.length) return;
    const r = await pedir(`/clientes/catalogo/servicios/${rows[0].id}`, {
      metodo: 'PUT', cuerpo: { activo: false },
    });
    assert.equal(r.estado, 200, `respondió ${r.estado}`);
    const { rows: d } = await pool.query('SELECT activo FROM servicio WHERE id = $1', [rows[0].id]);
    assert.equal(d[0].activo, false, 'no quedó desactivado');
  });

  test('no deja dos servicios con el mismo nombre', async () => {
    const r = await pedir('/clientes/catalogo/servicios', {
      metodo: 'POST', cuerpo: { nombre: `${MARCA} servicio` },
    });
    assert.equal(r.estado, 409, `respondió ${r.estado} en vez de rechazar el duplicado`);
  });

  test('un id mal formado no da 500', async () => {
    const r = await pedir('/clientes/catalogo/servicios/no-es-uuid', {
      metodo: 'PUT', cuerpo: { activo: true },
    });
    assert.notEqual(r.estado, 500, 'un id inválido provocó un error del servidor');
  });
});

describe('Permisos', () => {
  test('cambiar el catálogo es solo del administrador', async () => {
    const { rows } = await pool.query(
      `SELECT s.session_id FROM sessions s JOIN usuario u ON u.id = s.usuario_id
        WHERE s.expires_at > NOW() AND u.activo AND u.rol::text <> 'Administrador' LIMIT 1`);
    if (!rows.length) {
      console.log('      ℹ no hay sesión de un rol no-administrador para probarlo');
      return;
    }
    const r = await pedir('/clientes/catalogo/planes', {
      metodo: 'POST', cuerpo: { nombre: `${MARCA} colado` },
      sesion: { session_id: rows[0].session_id },
    });
    assert.ok([401, 403].includes(r.estado),
      `un no-administrador pudo crear un plan (${r.estado})`);
  });
});

describe('Lo que el catálogo revela del negocio', () => {
  test('cuántos planes no tienen tramos definidos', async () => {
    const { rows } = await pool.query(`
      SELECT p.nombre,
             (SELECT COUNT(*)::int FROM plan_precio_tramo t WHERE t.plan_id = p.id) AS tramos
        FROM plan p ORDER BY p.nombre`);
    const sin = rows.filter(r => r.tramos === 0);
    if (sin.length) {
      console.log(`      ℹ ${sin.length} plan(es) sin tramos, cobran precio único: ` +
                  sin.map(r => r.nombre).join(', '));
    }
  });

  test('cuántas empresas tienen servicios contratados', async () => {
    const { rows: [b] } = await pool.query(
      `SELECT (SELECT COUNT(*)::int FROM servicio WHERE activo) AS ofrecidos,
              (SELECT COUNT(DISTINCT empresa_id)::int FROM empresa_servicio) AS empresas`);
    if (b.empresas === 0) {
      console.log(`      ℹ ${b.ofrecidos} servicios definidos y NINGUNA empresa con servicios ` +
                  'contratados: el catálogo está armado pero sin usar');
    }
  });
});

describe('Precio cobrado vs. tramo de facturación', () => {
  // El plan no cobra lo mismo a todos: cobra según cuánto factura la empresa.
  // La ficha ya lo comparaba de a un cliente; lo que faltaba era verlo en la
  // lista sin abrir 102 fichas una por una.
  test('la lista trae el precio sugerido por tramo', async () => {
    const r = await pedir('/clientes/crm');
    if (r.estado !== 200) return;
    const c = (r.datos.clients || [])[0];
    if (!c) return;
    assert.ok(Object.hasOwn(c, 'precioSugerido'),
      'la lista no trae «precioSugerido»: no se podría avisar del descalce');
  });

  test('el sugerido coincide con el tramo que le corresponde', async () => {
    const r = await pedir('/clientes/crm');
    if (r.estado !== 200) return;

    for (const c of (r.datos.clients || []).slice(0, 40)) {
      if (c.precioSugerido === null || c.precioSugerido === undefined) continue;
      const { rows } = await pool.query(
        `SELECT t.precio_neto FROM plan_precio_tramo t
           JOIN empresa e ON e.plan_id = t.plan_id
          WHERE e.id = $1 AND t.activo
            AND e.ventas_mensuales >= t.tramo_min
            AND e.ventas_mensuales <  t.tramo_max
          LIMIT 1`, [c.id]);
      if (!rows.length) continue;
      assert.equal(Number(c.precioSugerido), Number(rows[0].precio_neto),
        `«${c.razonSocial}» dice sugerido ${c.precioSugerido} y su tramo es ${rows[0].precio_neto}`);
    }
  });

  test('un plan SIN tramos no inventa un sugerido', async () => {
    // Con precio único no hay nada que comparar, y marcarlo como descalce
    // sería una falsa alarma.
    const { rows } = await pool.query(
      `SELECT e.id FROM empresa e
        WHERE e.activo AND e.es_principal = false AND e.plan_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM plan_precio_tramo t WHERE t.plan_id = e.plan_id)
        LIMIT 1`);
    if (!rows.length) return;
    const r = await pedir('/clientes/crm');
    if (r.estado !== 200) return;
    const c = (r.datos.clients || []).find(x => x.id === rows[0].id);
    if (!c) return;
    assert.ok(c.precioSugerido === null || c.precioSugerido === undefined,
      `un plan sin tramos devolvió un sugerido de ${c.precioSugerido}`);
  });

  test('cuántas empresas cobran distinto a su tramo', async () => {
    // Informa, no falla: ajustar un precio es una decisión comercial, no un
    // error del sistema. Pero sale en cada corrida para que no se pierda de vista.
    const { rows: [b] } = await pool.query(`
      SELECT COUNT(*)::int AS n,
             COUNT(*) FILTER (WHERE t.precio_neto > e.precio_mensual)::int AS de_menos,
             COUNT(*) FILTER (WHERE t.precio_neto < e.precio_mensual)::int AS de_mas
        FROM empresa e
        JOIN plan_precio_tramo t ON t.plan_id = e.plan_id AND t.activo
       WHERE e.activo AND e.es_principal = false AND e.ventas_mensuales > 0
         AND e.ventas_mensuales >= t.tramo_min AND e.ventas_mensuales < t.tramo_max
         AND ABS(t.precio_neto - e.precio_mensual) >= 1000`);
    if (b.n) {
      console.log(`      ℹ ${b.n} empresa(s) cobran distinto a su tramo: ` +
                  `${b.de_menos} de menos y ${b.de_mas} de más`);
    }
  });

  test('las diferencias de centavos NO cuentan como descalce', async () => {
    // Hay precios históricos con centavos: BARBERIA cobra 60.504 contra un
    // tramo de 60.500. Marcar 4 pesos como descalce enseña a ignorar el aviso.
    const { rows } = await pool.query(`
      SELECT COUNT(*)::int AS n FROM empresa e
        JOIN plan_precio_tramo t ON t.plan_id = e.plan_id AND t.activo
       WHERE e.activo AND e.ventas_mensuales > 0
         AND e.ventas_mensuales >= t.tramo_min AND e.ventas_mensuales < t.tramo_max
         AND e.precio_mensual <> t.precio_neto
         AND ABS(t.precio_neto - e.precio_mensual) < 1000`);
    if (rows[0].n) {
      console.log(`      ℹ ${rows[0].n} empresa(s) difieren en menos de $1.000 ` +
                  '(redondeo histórico): no se marcan como descalce');
    }
  });
});
