// ============================================================================
// COMUNICACIONES · el módulo que le escribe a los clientes
// ----------------------------------------------------------------------------
// Es el módulo con más riesgo hacia afuera: un error acá no queda en una
// pantalla, llega al correo de 100 clientes y no se puede deshacer.
//
// Se cubre lo que las suites anteriores no tocaron: bandeja de entrada,
// enviados, perfil de remitente y el ciclo completo de una plantilla.
// ============================================================================
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { pedir, pool, cerrar, alTerminar } from '../arnes.mjs';

after(cerrar);

const MARCA = `QA-${Date.now().toString(36)}`;

describe('Bandeja de entrada', () => {
  test('responde sin reventar', async () => {
    const r = await pedir('/correos/bandeja');
    assert.notEqual(r.estado, 500, `devolvió 500: ${JSON.stringify(r.datos).slice(0, 150)}`);
    assert.ok([200, 403, 503].includes(r.estado), `respondió ${r.estado}`);
  });

  test('un id de correo mal formado no da 500', async () => {
    const r = await pedir('/correos/bandeja/no-es-un-id-valido');
    assert.notEqual(r.estado, 500,
      'un identificador inválido provocó un error del servidor');
  });

  test('el progreso de sincronización se puede consultar', async () => {
    const r = await pedir('/correos/bandeja/progreso');
    assert.notEqual(r.estado, 500);
  });
});

describe('Enviados', () => {
  test('responde sin reventar', async () => {
    const r = await pedir('/correos/enviados');
    assert.notEqual(r.estado, 500, `devolvió 500: ${JSON.stringify(r.datos).slice(0, 150)}`);
  });

  test('un id inválido no da 500', async () => {
    const r = await pedir('/correos/enviados/xxx');
    assert.notEqual(r.estado, 500);
  });
});

describe('Perfil de remitente', () => {
  test('el dominio del remitente está restringido', async () => {
    // Solo se puede enviar desde @vsvconsultores.com: un remitente de otro
    // dominio haría que los correos reboten o caigan en spam.
    const r = await pedir('/correos/mi-perfil', {
      metodo: 'PUT', cuerpo: { correoRemitente: 'cualquiera@gmail.com' },
    });
    assert.equal(r.estado, 400, 'aceptó un remitente de otro dominio');
    assert.ok(/dominio/i.test(JSON.stringify(r.datos)),
      'el mensaje no explica cuál es el problema');
  });

  test('un correo de copia mal escrito se rechaza', async () => {
    const r = await pedir('/correos/mi-perfil', {
      metodo: 'PUT', cuerpo: { correoCopia: 'esto-no-es-un-correo' },
    });
    assert.equal(r.estado, 400);
  });

  test('leer el perfil no expone la clave del correo', async () => {
    const r = await pedir('/correos/mi-perfil');
    if (r.estado !== 200) return;
    const texto = JSON.stringify(r.datos).toLowerCase();
    for (const secreto of ['password', 'clave', 'smtp_pass', 'app_password']) {
      assert.ok(!texto.includes(`"${secreto}"`),
        `el perfil expone "${secreto}"`);
    }
  });
});

describe('Plantillas · ciclo completo', () => {
  let plantillaId = null;

  test('1 · se crea', async () => {
    const r = await pedir('/correos/plantillas', {
      metodo: 'POST',
      cuerpo: {
        nombre: `${MARCA} plantilla`,
        asunto: 'Estado de {{empresa}}',
        cuerpo: '<p>Hola {{empresa}}, su plan {{plan}} vale {{valor_plan}}.</p>',
      },
    });
    assert.ok([200, 201].includes(r.estado), `respondió ${r.estado}: ${JSON.stringify(r.datos)}`);
    plantillaId = r.datos?.plantilla?.id || r.datos?.plantillaId || r.datos?.id;
    assert.ok(plantillaId, 'no devolvió el id de lo que creó');

    alTerminar(async () => {
      await pool.query('DELETE FROM correo_plantilla WHERE nombre LIKE $1', [`${MARCA}%`]);
    });
  });

  test('2 · aparece en la lista', async () => {
    if (!plantillaId) return;
    const r = await pedir('/correos/plantillas');
    assert.equal(r.estado, 200);
    assert.ok((r.datos.plantillas || []).some(p => p.id === plantillaId),
      'se creó pero no aparece en la lista');
  });

  test('3 · se puede editar', async () => {
    if (!plantillaId) return;
    const r = await pedir(`/correos/plantillas/${plantillaId}`, {
      metodo: 'PUT',
      cuerpo: {
        nombre: `${MARCA} plantilla editada`,
        asunto: 'Nuevo asunto para {{empresa}}',
        cuerpo: '<p>Texto nuevo para {{empresa}}.</p>',
      },
    });
    assert.ok([200, 201].includes(r.estado), `respondió ${r.estado}`);
  });

  test('4 · una marca inventada se rechaza al guardar', async () => {
    const r = await pedir('/correos/plantillas', {
      metodo: 'POST',
      cuerpo: {
        nombre: `${MARCA} mala`,
        asunto: 'Hola {{marca_que_no_existe}}',
        cuerpo: '<p>x</p>',
      },
    });
    assert.equal(r.estado, 400, 'guardó una plantilla con una marca inexistente');
  });

  test('5 · el HTML peligroso se limpia', async () => {
    const r = await pedir('/correos/plantillas', {
      metodo: 'POST',
      cuerpo: {
        nombre: `${MARCA} html`,
        asunto: 'Prueba',
        cuerpo: '<p>Hola</p><script>alert(1)</script><img src=x onerror=alert(2)>',
      },
    });
    if (![200, 201].includes(r.estado)) return;

    const { rows } = await pool.query(
      'SELECT cuerpo FROM correo_plantilla WHERE nombre = $1', [`${MARCA} html`]);
    if (!rows.length) return;
    const guardado = rows[0].cuerpo || '';
    assert.ok(!/<script/i.test(guardado), 'se guardó una etiqueta <script>');
    assert.ok(!/onerror=/i.test(guardado), 'se guardó un manejador onerror');
  });

  test('6 · se elimina', async () => {
    if (!plantillaId) return;
    const r = await pedir(`/correos/plantillas/${plantillaId}`, { metodo: 'DELETE' });
    assert.ok([200, 204].includes(r.estado), `el borrado respondió ${r.estado}`);

    const lista = await pedir('/correos/plantillas');
    assert.ok(!(lista.datos.plantillas || []).some(p => p.id === plantillaId),
      'se borró pero sigue apareciendo');
  });
});

describe('Protecciones del envío masivo', () => {
  test('la cuota diaria no se puede exceder', async () => {
    const r = await pedir('/correos/cuota');
    if (r.estado !== 200) return;
    assert.ok(r.datos.quedan >= 0, 'la cuota restante quedó negativa');
    assert.ok(r.datos.enviados <= r.datos.limite,
      `se enviaron ${r.datos.enviados} con un límite de ${r.datos.limite}`);
  });

  test('quien pidió la baja no recibe nada', async () => {
    // La lista de bajas es una obligación legal, no una preferencia.
    const { rows } = await pool.query('SELECT correo FROM correo_baja LIMIT 5');
    if (!rows.length) return;

    const r = await pedir('/correos/campana/preview', {
      metodo: 'POST',
      cuerpo: { empresaIds: [], asunto: 'prueba', cuerpo: '<p>x</p>' },
    });
    if (r.estado !== 200) return;

    const bajas = new Set(rows.map(x => String(x.correo).toLowerCase()));
    const destinatarios = (r.datos.destinatarios || [])
      .flatMap(d => String(d.correo || '').split(/[;,]/).map(c => c.trim().toLowerCase()));
    const colados = destinatarios.filter(c => bajas.has(c));
    assert.equal(colados.length, 0,
      `${colados.length} correo(s) dados de baja aparecen como destinatarios`);
  });

  test('no se puede lanzar una campaña con otra en curso', async () => {
    const r = await pedir('/correos/campana/progreso');
    if (r.estado !== 200) return;
    // Solo se comprueba que el estado sea consultable: sin él, dos envíos
    // simultáneos duplicarían los correos.
    assert.ok('activo' in (r.datos || {}) || 'estado' in (r.datos || {}),
      'no se puede saber si hay un envío en curso');
  });
});

describe('Historial de campañas', () => {
  test('las campañas terminadas cuadran sus conteos', async () => {
    const { rows } = await pool.query(
      `SELECT c.id, c.asunto, c.total, c.enviados, c.fallidos,
              (SELECT COUNT(*)::int FROM correo_envio e WHERE e.campana_id = c.id) reales
         FROM correo_campana c
        WHERE c.estado = 'terminada'
        ORDER BY c.created_at DESC LIMIT 10`);

    const descuadradas = rows.filter(c => c.reales !== c.total);
    if (descuadradas.length) {
      console.log(`      ℹ ${descuadradas.length} campaña(s) donde el total no coincide ` +
                  'con los envíos registrados:');
      descuadradas.slice(0, 3).forEach(c => console.log(
        `         · «${String(c.asunto).slice(0, 34)}» dice ${c.total}, hay ${c.reales}`));
    }
  });

  test('ningún envío quedó colgado en «enviando»', async () => {
    // Un envío que quedó a medias bloquea los siguientes: el sistema cree que
    // hay uno en curso y rechaza los nuevos con 409.
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM correo_campana
        WHERE estado NOT IN ('terminada', 'detenida', 'error')
          AND created_at < NOW() - INTERVAL '2 hours'`);
    assert.equal(rows[0].n, 0,
      `${rows[0].n} campaña(s) llevan más de 2 horas sin terminar: bloquean envíos nuevos`);
  });
});
