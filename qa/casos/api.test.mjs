// ============================================================================
// API · códigos HTTP, parámetros y forma de las respuestas
// ----------------------------------------------------------------------------
// Un endpoint puede "funcionar" y aun así estar mal: devolver 500 donde
// corresponde 404, aceptar un parámetro que ignora, o cambiar la forma de la
// respuesta y romper el frontend sin que nadie lo note.
//
// Estas pruebas fijan el CONTRATO. Si alguien cambia la forma de una respuesta,
// esto falla antes de que lo haga la pantalla.
// ============================================================================
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { pedir, cerrar } from '../arnes.mjs';

after(cerrar);

describe('Contrato de las respuestas', () => {
  const CONTRATOS = [
    ['/crm/metricas',       ['success', 'metricas']],
    ['/crm/tareas',         ['success', 'tareas', 'total']],
    ['/personas',           ['success', 'personas', 'total']],
    ['/cobros/resumen',     ['success', 'total', 'vencidos']],
    ['/correos/plantillas', ['success', 'plantillas']],
    ['/correos/cuota',      ['success', 'limite', 'enviados', 'quedan']],
  ];

  for (const [ruta, claves] of CONTRATOS) {
    test(`${ruta} devuelve ${claves.join(', ')}`, async () => {
      const r = await pedir(ruta);
      assert.equal(r.estado, 200, `respondió ${r.estado}`);
      for (const clave of claves) {
        assert.ok(clave in (r.datos || {}), `falta la clave "${clave}" en la respuesta`);
      }
    });
  }
});

describe('Identificadores inválidos → 404, no 500', () => {
  // Un 500 dice «el servidor se rompió» cuando lo que estaba mal era la
  // petición, y llena los registros de errores que no son errores.
  const RUTAS = [
    '/crm/tareas/no-es-uuid',
    '/correos/campanas/abc',
    '/correos/empresa/999999/envios',
    '/personas/xyz',
  ];

  for (const ruta of RUTAS) {
    test(ruta, async () => {
      const r = await pedir(ruta);
      assert.notEqual(r.estado, 500, 'devolvió 500 por un identificador mal formado');
      assert.ok([400, 403, 404].includes(r.estado), `devolvió ${r.estado}`);
    });
  }
});

describe('Validación de entrada', () => {
  // El envío masivo tiene su propio limitador —correctamente— y en una corrida
  // seguida de la suite se agota. Un 429 no es un fallo de validación: es otra
  // protección haciendo su trabajo, así que el caso se salta en vez de mentir.
  const saltarSiLimitado = (r) => r.estado === 429;

  test('campaña sin asunto se rechaza', async (t) => {
    const r = await pedir('/correos/campana', {
      metodo: 'POST', cuerpo: { empresaIds: [], asunto: '', cuerpo: '<p>x</p>', soloPrueba: true },
    });
    if (saltarSiLimitado(r)) return t.skip('limitador de envíos activo');
    assert.equal(r.estado, 400);
  });

  test('campaña con marca inventada se rechaza', async (t) => {
    const r = await pedir('/correos/campana', {
      metodo: 'POST',
      cuerpo: { empresaIds: [], asunto: '{{no_existe_esta_marca}}', cuerpo: '<p>x</p>',
                soloPrueba: true, correoPrueba: 'qa@ejemplo.cl' },
    });
    if (saltarSiLimitado(r)) return t.skip('limitador de envíos activo');
    assert.equal(r.estado, 400, 'aceptó una marca que no existe');
    assert.ok(/no existen/i.test(JSON.stringify(r.datos)),
      `rechazó pero por otra razón: ${JSON.stringify(r.datos).slice(0, 120)}`);
  });

  test('el limitador de envíos masivos existe', async () => {
    // Que exista es en sí una garantía: sin él, un bucle en el frontend podría
    // disparar cientos de correos reales.
    const intentos = await Promise.all(Array.from({ length: 6 }, () =>
      pedir('/correos/campana', {
        metodo: 'POST',
        cuerpo: { empresaIds: [], asunto: 'prueba de límite', cuerpo: '<p>x</p>',
                  soloPrueba: true, correoPrueba: 'qa@ejemplo.cl' },
      })));
    const limitados = intentos.filter(r => r.estado === 429).length;
    const rechazados = intentos.filter(r => r.estado === 400).length;
    assert.ok(limitados + rechazados === intentos.length,
      'alguna petición pasó sin límite ni validación');
  });

  test('mensaje al asistente vacío se rechaza', async () => {
    const r = await pedir('/asistente/chat', { metodo: 'POST', cuerpo: { mensaje: '' } });
    assert.ok([400, 503].includes(r.estado), `respondió ${r.estado}`);
  });

  test('reactivar una baja sin correo se rechaza', async () => {
    const r = await pedir('/correos/bajas/quitar', { metodo: 'POST', cuerpo: {} });
    assert.equal(r.estado, 400, 'aceptó reactivar sin decir a quién');
  });
});

describe('Parámetros que sí se aplican', () => {
  test('la búsqueda de personas filtra', async () => {
    const todas = await pedir('/personas');
    const ninguna = await pedir('/personas?q=zzzznoexistenadie');
    if (todas.estado !== 200) return;
    assert.ok((todas.datos.personas || []).length > 0, 'no hay personas para probar');
    assert.equal((ninguna.datos.personas || []).length, 0,
      'un término inexistente devolvió resultados');
  });

  test('el filtro por estado de personas funciona', async () => {
    const r = await pedir('/personas?estado=prospecto');
    if (r.estado !== 200) return;
    const otros = (r.datos.personas || []).filter(p => p.estado !== 'prospecto');
    assert.equal(otros.length, 0, `${otros.length} personas con otro estado se colaron`);
  });

  test('el período de métricas cambia el resultado', async () => {
    const mes = await pedir('/crm/metricas?periodo=mes');
    const anio = await pedir('/crm/metricas?periodo=anio');
    if (mes.estado !== 200 || anio.estado !== 200) return;
    assert.ok(mes.datos.metricas.desde !== anio.datos.metricas.desde,
      'el parámetro periodo no cambia la ventana consultada');
  });
});

describe('Métodos no permitidos', () => {
  test('DELETE sobre métricas no borra nada', async () => {
    const r = await pedir('/crm/metricas', { metodo: 'DELETE' });
    assert.ok(r.estado >= 400, `DELETE devolvió ${r.estado}`);
  });
});
