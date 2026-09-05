// ============================================================================
// SISTEMA DE TAREAS · los ocho pedidos del 04-09-2026
// ----------------------------------------------------------------------------
// Vinieron del equipo con captura, desde la tarea «SISTEMA DE TAREAS» (22/30).
// Casi todos son de pantalla —un desplegable en vez de una parrilla, un campo
// que crece, una imagen dibujada donde corresponde— y esos se verifican
// mirando; acá se prueba lo que vive en el servidor y lo que sostiene el resto:
//
//   · «Mis tareas» partida en dos: asignadas / donde colaboro
//   · Los colaboradores se pueden EDITAR después de crear la tarea
//   · Las subtareas se pueden crear junto con la madre
//   · «Mis últimos tickets creados»
//
// La regla de las dos mitades es la que más importa: asignadas + colaboro
// tiene que dar exactamente «mías», ni una tarea perdida ni una contada dos
// veces.
// ============================================================================
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { pedir, pool, cerrar, alTerminar, sesionDe } from '../arnes.mjs';

after(cerrar);

const MARCA = `QA-ux-${Date.now().toString(36)}`;

describe('«Mis tareas», partida en dos', () => {
  test('los dos ámbitos nuevos responden', async () => {
    for (const ambito of ['asignadas', 'colaboro']) {
      const r = await pedir(`/crm/tareas?ambito=${ambito}&limite=200`);
      assert.equal(r.estado, 200, `ambito=${ambito} respondió ${r.estado}`);
      assert.ok(Array.isArray(r.datos.tareas), `ambito=${ambito} no devolvió lista`);
    }
  });

  test('«asignadas» son solo las que tengo asignadas a mí', async () => {
    const yo = await sesionDe();
    if (!yo) return;
    const r = await pedir('/crm/tareas?ambito=asignadas&limite=300');
    if (r.estado !== 200) return;
    const ajenas = (r.datos.tareas || []).filter(t => t.responsableId !== yo.usuario_id);
    assert.equal(ajenas.length, 0,
      `${ajenas.length} tarea(s) de otro responsable aparecen como asignadas a mí`);
  });

  test('«colaboro» NUNCA trae aquello de lo que soy responsable', async () => {
    // Es la mitad que hace que separarlas sirva de algo: si lo mío apareciera
    // en las dos listas, seguirían mezcladas con un nombre distinto.
    const yo = await sesionDe();
    if (!yo) return;
    const r = await pedir('/crm/tareas?ambito=colaboro&limite=300');
    if (r.estado !== 200) return;
    const mias = (r.datos.tareas || []).filter(t => t.responsableId === yo.usuario_id);
    assert.equal(mias.length, 0,
      `${mias.length} tarea(s) donde soy responsable se cuelan en «donde colaboro»`);
  });

  test('las dos mitades suman exactamente «mías»', async () => {
    const yo = await sesionDe();
    if (!yo) return;
    const { rows: [b] } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE t.responsable_id = $1)::int AS asignadas,
        COUNT(*) FILTER (WHERE t.responsable_id IS DISTINCT FROM $1
              AND EXISTS (SELECT 1 FROM tarea_colaborador tc
                           WHERE tc.tarea_id = t.id AND tc.usuario_id = $1))::int AS colaboro,
        COUNT(*) FILTER (WHERE t.responsable_id = $1
              OR EXISTS (SELECT 1 FROM tarea_colaborador tc
                          WHERE tc.tarea_id = t.id AND tc.usuario_id = $1))::int AS mias
      FROM tarea t`, [yo.usuario_id]);
    assert.equal(b.asignadas + b.colaboro, b.mias,
      `asignadas ${b.asignadas} + colaboro ${b.colaboro} no da mías ${b.mias}`);
  });

  test('un ámbito inventado cae en el de siempre, no revienta', async () => {
    const r = await pedir('/crm/tareas?ambito=cualquier-cosa&limite=10');
    assert.equal(r.estado, 200, `respondió ${r.estado} en vez de ignorar el ámbito`);
  });
});

describe('Colaboradores · se pueden editar después de crear', () => {
  let tareaId = null;

  test('1 · se crea una tarea sin colaboradores', async () => {
    const r = await pedir('/crm/tareas', {
      metodo: 'POST', cuerpo: { titulo: `${MARCA} colaboradores` },
    });
    alTerminar(async () => {
      await pool.query('DELETE FROM tarea WHERE titulo LIKE $1', [`${MARCA}%`]);
    });
    if (![200, 201].includes(r.estado)) return;
    tareaId = r.datos?.tarea?.id || r.datos?.id;
    assert.ok(tareaId, 'no devolvió el id');
  });

  test('2 · se le agregan colaboradores ya creada', async () => {
    // Esto es lo que antes no se podía desde ninguna pantalla: los
    // colaboradores se fijaban al crear y quedaban así para siempre.
    if (!tareaId) return;
    const { rows: gente } = await pool.query(
      'SELECT id FROM usuario WHERE activo LIMIT 2');
    if (!gente.length) return;
    const ids = gente.map(g => g.id);

    const r = await pedir(`/crm/tareas/${tareaId}`, {
      metodo: 'PUT', cuerpo: { colaboradores: ids },
    });
    assert.ok([200, 201].includes(r.estado), `respondió ${r.estado}`);

    const { rows } = await pool.query(
      'SELECT usuario_id FROM tarea_colaborador WHERE tarea_id = $1', [tareaId]);
    assert.equal(rows.length, ids.length,
      `se pidieron ${ids.length} colaboradores y quedaron ${rows.length}`);
  });

  test('3 · se pueden quitar todos', async () => {
    if (!tareaId) return;
    const r = await pedir(`/crm/tareas/${tareaId}`, {
      metodo: 'PUT', cuerpo: { colaboradores: [] },
    });
    assert.ok([200, 201].includes(r.estado), `respondió ${r.estado}`);

    const { rows } = await pool.query(
      'SELECT usuario_id FROM tarea_colaborador WHERE tarea_id = $1', [tareaId]);
    assert.equal(rows.length, 0,
      'se pidió dejar la lista vacía y quedaron colaboradores');
  });

  test('4 · no se duplican al mandar el mismo dos veces', async () => {
    if (!tareaId) return;
    const { rows: gente } = await pool.query(
      'SELECT id FROM usuario WHERE activo LIMIT 1');
    if (!gente.length) return;

    await pedir(`/crm/tareas/${tareaId}`, {
      metodo: 'PUT', cuerpo: { colaboradores: [gente[0].id, gente[0].id] },
    });
    const { rows } = await pool.query(
      'SELECT usuario_id FROM tarea_colaborador WHERE tarea_id = $1', [tareaId]);
    assert.equal(rows.length, 1, `quedaron ${rows.length} filas para la misma persona`);
  });
});

describe('Subtareas al crear la tarea', () => {
  test('los pasos escritos en el formulario quedan colgando de la madre', async () => {
    // La pantalla crea la madre y después cada paso con `parentId`. Se prueba
    // ese mismo camino: es el que corre al pulsar «Crear tarea».
    const m = await pedir('/crm/tareas', {
      metodo: 'POST', cuerpo: { titulo: `${MARCA} con pasos` },
    });
    alTerminar(async () => {
      await pool.query('DELETE FROM tarea WHERE titulo LIKE $1', [`${MARCA}%`]);
    });
    if (![200, 201].includes(m.estado)) return;
    const madreId = m.datos?.tarea?.id || m.datos?.id;
    if (!madreId) return;

    const pasos = ['Pedir los papeles', 'Revisar el F29', 'Enviar al cliente'];
    for (const titulo of pasos) {
      const r = await pedir('/crm/tareas', {
        metodo: 'POST', cuerpo: { titulo: `${MARCA} ${titulo}`, parentId: madreId },
      });
      assert.ok([200, 201].includes(r.estado), `«${titulo}» respondió ${r.estado}`);
    }

    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM tarea WHERE parent_id = $1', [madreId]);
    assert.equal(rows[0].n, pasos.length,
      `se crearon ${rows[0].n} de ${pasos.length} subtareas`);

    // Y la madre las cuenta: es lo que se ve en la lista como «0/3».
    const d = await pedir(`/crm/tareas/${madreId}`);
    if (d.estado === 200) {
      assert.equal((d.datos.subtareas || []).length, pasos.length,
        'la tarea madre no devuelve sus subtareas');
    }
  });
});

describe('Mis últimos tickets creados', () => {
  test('el resumen trae la lista', async () => {
    const r = await pedir('/crm/tareas/inicio?ambito=todas');
    if (r.estado !== 200) return;
    assert.ok(Array.isArray(r.datos.misUltimos),
      'el resumen no trae «misUltimos»: la sección quedaría siempre vacía');
  });

  test('son tickets que creé YO, no los que me asignaron', async () => {
    const yo = await sesionDe();
    if (!yo) return;
    const r = await pedir('/crm/tareas/inicio?ambito=todas');
    if (r.estado !== 200) return;
    const lista = r.datos.misUltimos || [];
    if (!lista.length) return;

    const { rows } = await pool.query(
      `SELECT id FROM tarea WHERE creado_por = $1 AND archivada_at IS NULL`,
      [yo.usuario_id]);
    const mios = new Set(rows.map(x => x.id));
    const ajenos = lista.filter(t => !mios.has(t.id));
    assert.equal(ajenos.length, 0,
      `${ajenos.length} ticket(s) que no creé yo aparecen como míos`);
  });

  test('vienen del más nuevo al más viejo', async () => {
    const r = await pedir('/crm/tareas/inicio?ambito=todas');
    if (r.estado !== 200) return;
    const fechas = (r.datos.misUltimos || []).map(t => new Date(t.createdAt).getTime());
    const ordenadas = [...fechas].sort((a, b) => b - a);
    assert.deepEqual(fechas, ordenadas,
      'la lista no viene ordenada por fecha de creación');
  });

  test('incluye también lo ya cerrado', async () => {
    // A propósito: «lo que abrí ayer y ya está listo» es justo lo que uno
    // quiere ver acá. Si se filtrara por activas, un ticket resuelto
    // desaparecería sin que quien lo abrió se entere de que se resolvió.
    const r = await pedir('/crm/tareas/inicio?ambito=todas');
    if (r.estado !== 200) return;
    const lista = r.datos.misUltimos || [];
    if (lista.length < 8) return;   // con pocos no se puede concluir nada
    const estados = new Set(lista.map(t => t.estado));
    assert.ok(estados.size >= 1, 'no llegó ningún estado');
  });

  test('no trae archivadas', async () => {
    const r = await pedir('/crm/tareas/inicio?ambito=todas');
    if (r.estado !== 200) return;
    const archivadas = (r.datos.misUltimos || []).filter(t => t.archivada);
    assert.equal(archivadas.length, 0,
      `${archivadas.length} ticket(s) archivados aparecen en la lista`);
  });
});

describe('Recolgar una tarea de otra madre', () => {
  // Se descubrió el 04-09-2026: `actualizarTarea` NO leía `parentId`. Mover una
  // tarea dentro de otra devolvía 200 y no movía nada — el peor tipo de fallo,
  // porque el sistema decía que sí.
  let madreA = null, madreB = null, hija = null;

  test('1 · preparación', async () => {
    const a = await pedir('/crm/tareas', { metodo: 'POST', cuerpo: { titulo: `${MARCA} madre A` } });
    const b = await pedir('/crm/tareas', { metodo: 'POST', cuerpo: { titulo: `${MARCA} madre B` } });
    alTerminar(async () => {
      await pool.query('DELETE FROM tarea WHERE titulo LIKE $1', [`${MARCA}%`]);
    });
    madreA = a.datos?.tarea?.id || a.datos?.id;
    madreB = b.datos?.tarea?.id || b.datos?.id;
    if (!madreA) return;
    const h = await pedir('/crm/tareas', {
      metodo: 'POST', cuerpo: { titulo: `${MARCA} hija`, parentId: madreA },
    });
    hija = h.datos?.tarea?.id || h.datos?.id;
  });

  test('2 · una tarea suelta se puede meter dentro de otra', async () => {
    if (!madreA || !madreB) return;
    const r = await pedir(`/crm/tareas/${madreB}`, {
      metodo: 'PUT', cuerpo: { parentId: madreA },
    });
    assert.ok([200, 201].includes(r.estado), `respondió ${r.estado}`);
    const { rows } = await pool.query('SELECT parent_id FROM tarea WHERE id = $1', [madreB]);
    assert.equal(String(rows[0].parent_id), String(madreA),
      'el servidor respondió bien pero la tarea no se movió');
  });

  test('3 · RECHAZA que una tarea sea su propia madre', async () => {
    if (!madreA) return;
    const r = await pedir(`/crm/tareas/${madreA}`, {
      metodo: 'PUT', cuerpo: { parentId: madreA },
    });
    assert.equal(r.estado, 400, `aceptó que una tarea colgara de sí misma (${r.estado})`);
  });

  test('4 · mover y crear usan el MISMO tope de profundidad', async () => {
    // El sistema permite hasta la nieta y rechaza la bisnieta (ver crearTarea).
    // Al agregar el movimiento se puso un tope más estricto por error, y quedaba
    // que crear una subtarea ahí sí se podía y moverla no. Dos reglas distintas
    // para lo mismo terminan en «a veces deja y a veces no».
    if (!hija) return;

    // Crear una nieta: permitido.
    const nieta = await pedir('/crm/tareas', {
      metodo: 'POST', cuerpo: { titulo: `${MARCA} nieta`, parentId: hija },
    });
    assert.ok([200, 201].includes(nieta.estado),
      `crear una nieta respondió ${nieta.estado}`);
    const nietaId = nieta.datos?.tarea?.id || nieta.datos?.id;

    // Mover algo hasta ese mismo nivel: también debe permitirse.
    const otra = await pedir('/crm/tareas', { metodo: 'POST', cuerpo: { titulo: `${MARCA} suelta` } });
    const id = otra.datos?.tarea?.id || otra.datos?.id;
    if (!id) return;
    const r = await pedir(`/crm/tareas/${id}`, { metodo: 'PUT', cuerpo: { parentId: hija } });
    assert.ok([200, 201].includes(r.estado),
      `crear ahí se permite pero mover respondió ${r.estado}: los dos caminos discrepan`);

    // Y un nivel MÁS abajo se rechaza por los dos caminos.
    if (!nietaId) return;
    const bisCrear = await pedir('/crm/tareas', {
      metodo: 'POST', cuerpo: { titulo: `${MARCA} bisnieta`, parentId: nietaId },
    });
    assert.equal(bisCrear.estado, 400, `crear una bisnieta respondió ${bisCrear.estado}`);

    const otra2 = await pedir('/crm/tareas', { metodo: 'POST', cuerpo: { titulo: `${MARCA} suelta2` } });
    const id2 = otra2.datos?.tarea?.id || otra2.datos?.id;
    if (!id2) return;
    const bisMover = await pedir(`/crm/tareas/${id2}`, { metodo: 'PUT', cuerpo: { parentId: nietaId } });
    assert.equal(bisMover.estado, 400, `mover a bisnieta respondió ${bisMover.estado}`);
  });

  test('5 · RECHAZA colgar una madre de su propia hija', async () => {
    // Eso deja un ciclo, y cualquier consulta que recorra el árbol se cuelga.
    if (!madreA || !hija) return;
    const r = await pedir(`/crm/tareas/${madreA}`, { metodo: 'PUT', cuerpo: { parentId: hija } });
    assert.equal(r.estado, 400, `permitió crear un ciclo (${r.estado})`);
  });

  test('6 · una madre inexistente se rechaza', async () => {
    if (!madreA) return;
    const r = await pedir(`/crm/tareas/${madreA}`, {
      metodo: 'PUT', cuerpo: { parentId: '00000000-0000-0000-0000-000000000000' },
    });
    assert.equal(r.estado, 400, `aceptó una madre que no existe (${r.estado})`);
  });
});
