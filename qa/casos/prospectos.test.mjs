// ============================================================================
// PROSPECTOS · el buscador y la agenda de contacto
// ----------------------------------------------------------------------------
// EL BUG QUE ESTA SUITE EXISTE PARA QUE NO VUELVA
// «Buscar cualquier texto devuelve la lista entera.» Apareció el 03-09-2026 en
// el servidor y otra vez el 04-09 en la pantalla de Prospectos, por la misma
// razón las dos veces:
//
//   El buscador también busca por teléfono, así que quita todo lo que no sea
//   dígito. Al escribir texto —«juan»— eso deja una cadena VACÍA. Y en
//   JavaScript `"56911".includes("")` es SIEMPRE verdadero: cada persona pasa
//   el filtro por su teléfono.
//
// No falla, no avisa: simplemente el filtro deja de filtrar. Por eso se prueba
// buscando algo que NO existe y exigiendo cero resultados.
//
// LA AGENDA
// Medido el 04-09-2026: 129 de 132 prospectos tienen fecha de próximo contacto
// y las 129 están vencidas (la más vieja del 06-08). El dato existía y nadie
// lo miraba. Acá se vigila que la fecha siga llegando y ordenándose.
// ============================================================================
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { pedir, pool, cerrar } from '../arnes.mjs';

after(cerrar);

describe('El buscador de prospectos', () => {
  test('un texto que no existe NO devuelve a nadie', async () => {
    // Si esto falla con «devolvió N», el filtro dejó de filtrar otra vez.
    const r = await pedir('/personas?q=zzzznoexistezzzz');
    if (r.estado !== 200) return;
    assert.equal((r.datos.personas || []).length, 0,
      `buscar algo inexistente devolvió ${r.datos.personas.length} personas: ` +
      'el filtro no está filtrando (ver el encabezado de esta suite)');
  });

  test('buscar por nombre encuentra solo a quien corresponde', async () => {
    const { rows } = await pool.query(
      `SELECT nombre FROM persona WHERE activo AND nombre IS NOT NULL
        AND LENGTH(nombre) > 4 LIMIT 1`);
    if (!rows.length) return;
    const nombre = rows[0].nombre;

    const r = await pedir(`/personas?q=${encodeURIComponent(nombre)}`);
    if (r.estado !== 200) return;
    const lista = r.datos.personas || [];
    assert.ok(lista.length > 0, `buscar «${nombre}» no encontró a nadie`);

    const { rows: [total] } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM persona WHERE activo');
    assert.ok(lista.length < total.n,
      `buscar «${nombre}» devolvió las ${lista.length} de ${total.n}: no filtró`);
  });

  test('buscar por teléfono sigue funcionando', async () => {
    // La contraparte: al arreglar lo de arriba no se puede romper la búsqueda
    // por número, que es para lo que existía esa línea.
    // Los teléfonos NO viven en `persona`: están en `persona_telefono`, con la
    // versión normalizada (solo dígitos) en `telefono_norm`.
    const { rows } = await pool.query(
      `SELECT pt.telefono_norm AS tel
         FROM persona_telefono pt JOIN persona p ON p.id = pt.persona_id
        WHERE p.activo AND pt.telefono_norm IS NOT NULL
          AND LENGTH(pt.telefono_norm) >= 8 LIMIT 1`);
    if (!rows.length) return;
    const digitos = String(rows[0].tel).replace(/\D/g, '').slice(-6);
    if (digitos.length < 4) return;

    const r = await pedir(`/personas?q=${digitos}`);
    if (r.estado !== 200) return;
    assert.ok((r.datos.personas || []).length > 0,
      `buscar el teléfono «${digitos}» no encontró a nadie`);
  });

  test('una búsqueda vacía devuelve la lista completa', async () => {
    const r = await pedir('/personas?q=');
    if (r.estado !== 200) return;
    assert.ok((r.datos.personas || []).length > 0,
      'sin término de búsqueda la lista quedó vacía');
  });
});

describe('La agenda de contacto', () => {
  test('la fecha de próximo contacto llega a la pantalla', async () => {
    const r = await pedir('/personas');
    if (r.estado !== 200) return;
    const lista = r.datos.personas || [];
    if (!lista.length) return;
    assert.ok(Object.hasOwn(lista[0], 'proximoContacto'),
      'la lista no trae «proximoContacto»: la agenda no se podría dibujar');
  });

  test('se puede pedir ordenada por fecha de contacto', async () => {
    const r = await pedir('/personas?orden=contacto');
    assert.equal(r.estado, 200, `respondió ${r.estado}`);
    const fechas = (r.datos.personas || [])
      .map(p => p.proximoContacto)
      .filter(Boolean)
      .map(f => new Date(f).getTime());
    if (fechas.length < 2) return;
    assert.deepEqual(fechas, [...fechas].sort((a, b) => a - b),
      'pidiendo el orden por contacto, las fechas no vienen de la más antigua a la más nueva');
  });

  test('cuántos prospectos están atrasados', async () => {
    // Informa, no falla: contactarlos es trabajo de la oficina. Pero sale en
    // cada corrida para que el número no se vuelva a perder de vista.
    const { rows: [b] } = await pool.query(`
      SELECT COUNT(*) FILTER (WHERE proximo_contacto IS NOT NULL)::int AS con_fecha,
             COUNT(*) FILTER (WHERE proximo_contacto < NOW())::int      AS atrasados,
             MIN(proximo_contacto)::date::text                          AS mas_viejo,
             COUNT(*)::int                                              AS total
        FROM persona WHERE estado::text = 'prospecto' AND activo`);
    if (b.atrasados) {
      console.log(`      ℹ ${b.atrasados} de ${b.total} prospectos ya debieron contactarse ` +
                  `(el más antiguo: ${b.mas_viejo})`);
    }
    assert.ok(b.con_fecha >= b.atrasados, 'hay más atrasados que fechas cargadas');
  });

  test('cuántos no tienen etapa comercial', async () => {
    const { rows: [b] } = await pool.query(`
      SELECT COUNT(*) FILTER (WHERE estado_comercial IS NULL OR estado_comercial = '')::int AS sin_etapa,
             COUNT(*)::int AS total
        FROM persona WHERE estado::text = 'prospecto' AND activo`);
    if (b.sin_etapa) {
      console.log(`      ℹ ${b.sin_etapa} de ${b.total} prospectos sin etapa comercial: ` +
                  'sin eso no se puede automatizar el embudo');
    }
  });

  test('las etapas que ya se usan', async () => {
    // `estado_comercial` es texto libre, no una lista cerrada: cualquier cosa
    // que se escriba queda guardada. Se listan las que hay para que las
    // variantes de escritura se noten antes de fijar el catálogo.
    const { rows } = await pool.query(`
      SELECT estado_comercial AS etapa, COUNT(*)::int AS n
        FROM persona
       WHERE estado::text = 'prospecto' AND estado_comercial IS NOT NULL
         AND estado_comercial <> ''
       GROUP BY 1 ORDER BY 2 DESC`);
    if (rows.length) {
      console.log('      ℹ etapas en uso: ' +
                  rows.map(r => `${r.etapa} (${r.n})`).join(' · '));
    }
  });
});

describe('Aislamiento', () => {
  test('sin sesión no se ven prospectos', async () => {
    const r = await pedir('/personas', { sinSesion: true });
    assert.equal(r.estado, 401, `respondió ${r.estado} sin sesión`);
  });

  test('la lista no expone datos personales de más', async () => {
    // Se miran los NOMBRES DE CAMPO, no el texto suelto. Buscar la palabra
    // «clave» en toda la respuesta daba un falso positivo: una observación
    // escrita a mano decía «enviará clave y rut», y eso es contenido legítimo
    // que alguien anotó, no un campo expuesto.
    const r = await pedir('/personas');
    if (r.estado !== 200) return;
    const campos = new Set();
    for (const p of r.datos.personas || []) {
      for (const k of Object.keys(p)) campos.add(k.toLowerCase());
    }
    for (const prohibido of ['_encrypted', 'clave', 'password', 'hash']) {
      const filtrado = [...campos].filter(c => c.includes(prohibido));
      assert.equal(filtrado.length, 0,
        `la lista expone el/los campo(s): ${filtrado.join(', ')}`);
    }
  });
});
