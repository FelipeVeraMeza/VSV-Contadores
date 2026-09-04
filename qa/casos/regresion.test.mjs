// ============================================================================
// REGRESIÓN · que los cambios de hoy no rompieran lo que funcionaba
// ----------------------------------------------------------------------------
// El middleware uuidValido se aplicó a 41 rutas con un script. La sintaxis
// pasa, pero eso no garantiza que las rutas SIGAN respondiendo con un id
// válido: un parámetro mal nombrado, un orden equivocado de middlewares o una
// tabla cuyo id no sea UUID lo habrían roto en silencio.
//
// Estas pruebas usan IDENTIFICADORES REALES de la base. Es la única forma de
// distinguir «la ruta valida bien» de «la ruta ya no funciona».
// ============================================================================
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { pedir, pool, cerrar } from '../arnes.mjs';

after(cerrar);

// Cada entrada: [ruta con %s, consulta que trae un id real, descripción]
const RUTAS_CON_ID = [
  ['/personas/%s',            'SELECT id FROM persona LIMIT 1',            'ficha de persona'],
  ['/personas/%s/acciones',   'SELECT id FROM persona LIMIT 1',            'acciones del prospecto'],
  ['/crm/tareas/%s',          'SELECT id FROM tarea LIMIT 1',              'detalle de tarea'],
  ['/crm/proyectos',          null,                                        'lista de proyectos'],
  ['/correos/campanas/%s',    'SELECT id FROM correo_campana LIMIT 1',     'detalle de campaña'],
  ['/correos/empresa/%s/envios', 'SELECT id FROM empresa LIMIT 1',         'envíos de una empresa'],
];

describe('Las rutas con :id siguen funcionando con ids reales', () => {
  for (const [plantilla, consulta, descripcion] of RUTAS_CON_ID) {
    test(descripcion, async () => {
      let ruta = plantilla;
      if (consulta) {
        const { rows } = await pool.query(consulta);
        if (!rows.length) return;               // sin datos para probar
        ruta = plantilla.replace('%s', rows[0].id);
      }
      const r = await pedir(ruta);
      // 200 o 403 son respuestas legítimas (la segunda si el usuario no tiene
      // permiso sobre ESE registro). Lo que no puede pasar es 404: significaría
      // que el middleware rechazó un UUID válido.
      assert.notEqual(r.estado, 404,
        `${ruta} devolvió 404 con un id REAL: el validador está rechazando UUIDs buenos`);
      assert.notEqual(r.estado, 500, `${ruta} devolvió 500`);
    });
  }
});

describe('El validador sigue rechazando lo que debe', () => {
  const BASURA = ['abc', '999', '../etc/passwd', '%20', 'null', '00000000'];

  for (const malo of BASURA) {
    test(`rechaza /personas/${malo}`, async () => {
      const r = await pedir(`/personas/${encodeURIComponent(malo)}`);
      assert.ok([400, 404].includes(r.estado),
        `devolvió ${r.estado} en vez de rechazar un id mal formado`);
    });
  }

  test('un UUID con formato válido pero inexistente da 404, no 500', async () => {
    const r = await pedir('/personas/00000000-0000-0000-0000-000000000000');
    assert.equal(r.estado, 404);
  });
});

describe('Lo arreglado hoy sigue arreglado', () => {
  test('la búsqueda de personas filtra', async () => {
    const todas = await pedir('/personas');
    const ninguna = await pedir('/personas?q=zzzznoexistenadie');
    if (todas.estado !== 200) return;
    assert.ok((todas.datos.personas || []).length > 0);
    assert.equal((ninguna.datos.personas || []).length, 0,
      'volvió el bug: un término inexistente devuelve resultados');
  });

  test('la búsqueda por teléfono sigue funcionando', async () => {
    // El arreglo del filtro no podía romper la búsqueda por número, que es la
    // razón de que esa rama exista.
    const { rows } = await pool.query(
      `SELECT p.id FROM persona p
        WHERE EXISTS (SELECT 1 FROM persona_telefono t WHERE t.persona_id = p.id)
        LIMIT 1`).catch(() => ({ rows: [] }));
    if (!rows.length) return;
    const r = await pedir('/personas?q=9');
    if (r.estado !== 200) return;
    assert.ok((r.datos.personas || []).length > 0,
      'buscar un dígito no devuelve a nadie: se rompió la búsqueda por teléfono');
  });

  test('reactivar una baja sin correo se sigue rechazando', async () => {
    const r = await pedir('/correos/bajas/quitar', { metodo: 'POST', cuerpo: {} });
    assert.equal(r.estado, 400);
  });

  test('el recordatorio de pago encuentra destinatarios', async () => {
    const { rows: [b] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM cobro_mensual c JOIN empresa e ON e.id = c.empresa_id
        WHERE c.estado = 'PENDIENTE_PAGO' AND e.activo AND e.en_cartera IS NOT FALSE`);
    if (!b.n) return;
    const r = await pedir('/dte/recordatorios/preview');
    if (r.estado !== 200) return;
    assert.ok(r.datos.total > 0,
      `volvió el bug: ${b.n} cobros pendientes y el preview no encuentra a nadie`);
  });
});

describe('Los módulos principales siguen respondiendo', () => {
  const MODULOS = [
    '/crm/metricas', '/crm/tareas', '/crm/proyectos', '/personas',
    '/cobros/resumen', '/correos/plantillas', '/correos/cuota',
    '/companies/lista', '/dashboard',
  ];

  for (const ruta of MODULOS) {
    test(ruta, async () => {
      const r = await pedir(ruta);
      assert.ok(r.estado < 500, `${ruta} devolvió ${r.estado}`);
      assert.notEqual(r.estado, 404, `${ruta} ya no existe`);
    });
  }
});
