// ============================================================================
// DOCUMENTACIÓN · los .md del proyecto, servidos dentro de la página
// ----------------------------------------------------------------------------
// Del pedido del 04-09-2026: «pasar la documentación que está en el código
// directamente a la página, para que ellos también puedan verlo sin necesidad
// de explicarlo siempre todos los días».
//
// LO QUE MÁS SE CUIDA ACÁ ES LA RUTA DE ARCHIVO.
// Este módulo lee archivos del disco a partir de algo que llega del navegador.
// Hecho mal, permite pedir `../../.env` y llevarse las credenciales de la base,
// las claves del SII y el token de la IA. Por eso el id NO se usa para
// construir una ruta: se busca en una lista fija, y lo que no está en la lista
// no existe.
//
// Las pruebas de abajo intentan salirse de la carpeta de varias formas. Si
// alguna devuelve 200, hay una fuga de archivos del servidor.
// ============================================================================
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { pedir, pool, cerrar } from '../arnes.mjs';

after(cerrar);

describe('Leer la documentación', () => {
  test('la lista responde y trae documentos', async () => {
    const r = await pedir('/documentacion');
    assert.equal(r.estado, 200, `respondió ${r.estado}`);
    assert.ok(Array.isArray(r.datos.documentos), 'no devolvió la lista');
    assert.ok(r.datos.documentos.length > 0, 'la lista está vacía');
  });

  test('cada documento de la lista dice qué es', async () => {
    const r = await pedir('/documentacion');
    if (r.estado !== 200) return;
    for (const d of r.datos.documentos) {
      assert.ok(d.id && d.titulo, 'un documento no tiene id o título');
      assert.ok(d.resumen, `«${d.titulo}» no dice de qué trata`);
    }
  });

  test('el documento del CRM se lee entero', async () => {
    const r = await pedir('/documentacion/crm');
    assert.equal(r.estado, 200, `respondió ${r.estado}`);
    const doc = r.datos.documento;
    assert.ok(doc, 'no devolvió el documento');
    assert.ok(doc.contenido && doc.contenido.length > 5000,
      `el contenido vino con ${doc.contenido?.length} caracteres: parece truncado`);
  });

  test('el índice sale de los encabezados del propio texto', async () => {
    // Si el índice se mantuviera aparte, envejecería sin que nadie lo note:
    // alguien agrega una sección al .md y el índice sigue diciendo lo de antes.
    const r = await pedir('/documentacion/crm');
    if (r.estado !== 200) return;
    const { contenido, indice } = r.datos.documento;
    assert.ok(indice.length > 0, 'el documento no trae índice');

    for (const s of indice) {
      assert.ok(s.texto && s.ancla, 'una sección del índice viene incompleta');
      assert.ok([2, 3].includes(s.nivel), `nivel inesperado: ${s.nivel}`);
      // El título de cada sección tiene que existir de verdad en el texto.
      assert.ok(contenido.includes(s.texto),
        `el índice dice «${s.texto}» y esa sección no está en el documento`);
    }
  });

  test('las anclas del índice no se repiten', async () => {
    // Dos secciones con la misma ancla harían que el índice salte siempre a la
    // primera, y la segunda quedaría inalcanzable.
    const r = await pedir('/documentacion/crm');
    if (r.estado !== 200) return;
    const anclas = r.datos.documento.indice.map(s => s.ancla);
    const repetidas = anclas.filter((a, i) => anclas.indexOf(a) !== i);
    if (repetidas.length) {
      console.log(`      ℹ ${repetidas.length} ancla(s) repetidas: ${[...new Set(repetidas)].join(', ')}`);
    }
  });

  test('un ## dentro de un bloque de código NO entra al índice', async () => {
    // En un bloque de código, `## algo` es un comentario, no un encabezado.
    const r = await pedir('/documentacion/crm');
    if (r.estado !== 200) return;
    const { contenido, indice } = r.datos.documento;

    // Se recogen los encabezados que están DENTRO de bloques de código.
    const dentro = [];
    let enBloque = false;
    for (const l of contenido.split('\n')) {
      if (l.startsWith('```')) { enBloque = !enBloque; continue; }
      if (enBloque) {
        const m = /^(#{2,3})\s+(.+?)\s*$/.exec(l);
        if (m) dentro.push(m[2].replace(/[*_`]/g, '').trim());
      }
    }
    for (const t of dentro) {
      assert.ok(!indice.some(s => s.texto === t),
        `«${t}» está dentro de un bloque de código y se coló en el índice`);
    }
  });
});

describe('No se puede leer cualquier archivo del servidor', () => {
  // Si alguna de estas devuelve 200, hay una fuga: el .env tiene la conexión a
  // la base, las claves de cifrado y el token de la IA.
  const INTENTOS = [
    '../.env',
    '../../.env',
    '..%2F.env',
    '..%2f..%2f.env',
    '%2e%2e%2f.env',
    '../package.json',
    '../../src/database/db.js',
    '/etc/passwd',
    'crm-modulo',          // sin extensión, pero tampoco es un id válido
    'crm-modulo.md',       // el nombre del archivo NO es el id
  ];

  for (const intento of INTENTOS) {
    test(`rechaza «${intento}»`, async () => {
      const r = await pedir(`/documentacion/${encodeURIComponent(intento)}`);
      assert.notEqual(r.estado, 200,
        `¡FUGA! «${intento}» devolvió 200 y expuso un archivo del servidor`);
      assert.ok([400, 404].includes(r.estado),
        `respondió ${r.estado}, se esperaba 404`);
    });
  }

  test('el error nunca revela una ruta del disco', async () => {
    // Un mensaje que incluya la ruta real le dice a quien prueba dónde están
    // los archivos del servidor.
    //
    // OJO CON QUÉ SE BUSCA: `../.env` lo normaliza el propio navegador antes de
    // salir, así que la petición llega como `/api/.env` y la contesta el 404 de
    // Express —que repite la ruta pedida—. Eso NO es una fuga: el archivo no se
    // lee y el controlador ni se entera. Buscar la palabra «.env» ahí daba un
    // falso positivo. Acá se usa un id que SÍ llega al controlador, y se buscan
    // rutas del disco.
    const r = await pedir('/documentacion/inventado-que-no-existe');
    assert.equal(r.estado, 404);
    const texto = JSON.stringify(r.datos || {});
    for (const pista of ['C:\\', '/home/', 'node_modules', '/docs/', 'Users']) {
      assert.ok(!texto.includes(pista),
        `el error revela «${pista}»: eso orienta a quien esté probando`);
    }
  });

  test('pedir el .env NUNCA devuelve su contenido', async () => {
    // La comprobación que de verdad importa: sea cual sea el 404 que responda,
    // lo que no puede pasar es que salga el archivo.
    for (const intento of ['../.env', '..%2F.env', '../../.env']) {
      const r = await pedir(`/documentacion/${encodeURIComponent(intento)}`);
      const texto = JSON.stringify(r.datos || {});
      for (const secreto of ['DATABASE_URL', 'GROQ', 'SECRET', 'PASSWORD', 'postgres://']) {
        assert.ok(!texto.includes(secreto),
          `¡FUGA! «${intento}» devolvió contenido del .env («${secreto}»)`);
      }
    }
  });
});

describe('Permisos', () => {
  test('sin sesión no se ve nada', async () => {
    const r = await pedir('/documentacion', { sinSesion: true });
    assert.equal(r.estado, 401, `respondió ${r.estado} sin sesión`);
  });

  test('sin sesión tampoco se lee un documento', async () => {
    const r = await pedir('/documentacion/crm', { sinSesion: true });
    assert.equal(r.estado, 401, `respondió ${r.estado} sin sesión`);
  });

  test('un rol Cliente no ve documentación interna', async () => {
    const { rows } = await pool.query(
      `SELECT s.session_id FROM sessions s JOIN usuario u ON u.id = s.usuario_id
        WHERE s.expires_at > NOW() AND u.activo AND u.rol::text = 'Cliente' LIMIT 1`);
    if (!rows.length) {
      console.log('      ℹ no hay sesión de un rol Cliente para comprobarlo');
      return;
    }
    const r = await pedir('/documentacion', { sesion: { session_id: rows[0].session_id } });
    assert.equal(r.estado, 403,
      `un Cliente obtuvo ${r.estado}: vería documentación interna del despacho`);
  });
});

describe('El documento está al día', () => {
  test('cuántos documentos hay publicados de los que existen', async () => {
    // Informa, no falla: publicar los 23 de una vez publicaría también los que
    // están desactualizados. Se suman de a uno, revisándolos.
    const r = await pedir('/documentacion');
    if (r.estado !== 200) return;
    const publicados = (r.datos.documentos || []).length;
    console.log(`      ℹ ${publicados} documento(s) publicado(s) en la página. ` +
                'El resto sigue solo en docs/ hasta que se revise.');
  });
});
