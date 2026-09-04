// ============================================================================
// SISTEMA DE TAREAS · los tres pendientes de §10.5
// ----------------------------------------------------------------------------
// docs/tareas-requerimientos.md §10.5 «Lo que se puede hacer sin preguntarle a
// nadie» dejó tres puntos anotados el 14-ago-2026 y cerrados sin hacerse:
//
//   1. Reabrir una subtarea finalizada la hacía desaparecer de todas partes.
//   2. Faltaba el pop-up de tarea asignada con su urgencia.
//   3. Faltaba la lista «Tareas de hoy» en Inicio (había contador, no lista).
//
// Se cierran el 04-09-2026. Acá se prueba lo que vive en el servidor: que los
// grupos de Inicio sean excluyentes, que la lista de hoy exista y cuadre con
// su contador, y que la urgencia viaje con el aviso.
// ============================================================================
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { pedir, pool, cerrar, alTerminar, sesionDe } from '../arnes.mjs';

after(cerrar);

const MARCA = `QA-tareas-${Date.now().toString(36)}`;
const ACTIVOS = ['pendiente', 'en_proceso', 'en_revision'];

describe('Inicio · la lista «Vencen hoy» (punto 3)', () => {
  test('el resumen trae la lista, no solo el número', async () => {
    const r = await pedir('/crm/tareas/inicio?ambito=todas');
    if (r.estado !== 200) return;
    assert.ok(Array.isArray(r.datos.hoy),
      'el resumen no trae la lista «hoy»: la tarjeta daría un número sin dónde verlo');
  });

  test('lo que dice la tarjeta es lo que hay en la base', async () => {
    // OJO: hay que contrastar contra lo que ESTE usuario puede ver, no contra
    // toda la tabla. La primera versión de esta prueba contaba las tareas sin
    // el filtro de permisos y falló el 04-09-2026 con «la tarjeta dice 0 y en
    // la base hay 1»: la tarea era «SU HOUSE», de Matías, que yo no veo. El
    // panel estaba bien; la prueba comparaba contra otra cosa.
    const sesion = await sesionDe();
    if (!sesion) return;
    const r = await pedir('/crm/tareas/inicio?ambito=todas');
    if (r.estado !== 200) return;

    const { rows: [b] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM tarea t
        WHERE t.organizacion_id IS NOT DISTINCT FROM $1::uuid
          AND t.archivada_at IS NULL AND t.parent_id IS NULL
          AND t.estado::text = ANY($3)
          AND t.vence_at::date = CURRENT_DATE
          AND (t.responsable_id = $2 OR t.creado_por = $2
               OR EXISTS (SELECT 1 FROM tarea_colaborador tc
                           WHERE tc.tarea_id = t.id AND tc.usuario_id = $2)
               OR EXISTS (SELECT 1 FROM proyecto_integrante pi
                           WHERE pi.proyecto_id = t.proyecto_id AND pi.usuario_id = $2))`,
      [sesion.organizacion_id, sesion.usuario_id, ACTIVOS]);

    assert.equal(r.datos.resumen.vencen_hoy, b.n,
      `la tarjeta dice ${r.datos.resumen.vencen_hoy} y visibles para mí hay ${b.n}`);
  });

  test('todas las de la lista vencen HOY, ni ayer ni mañana', async () => {
    const r = await pedir('/crm/tareas/inicio?ambito=todas');
    if (r.estado !== 200) return;
    const hoy = new Date().toISOString().slice(0, 10);
    for (const t of r.datos.hoy || []) {
      assert.equal(String(t.venceAt).slice(0, 10), hoy,
        `«${t.titulo}» está en «vencen hoy» y vence ${t.venceAt}`);
    }
  });

  test('ninguna tarea aparece en dos grupos a la vez', async () => {
    // Ya pasó una vez en los contadores: una tarea contada como atrasada Y
    // como de hoy es el mismo trabajo sumado dos veces.
    const r = await pedir('/crm/tareas/inicio?ambito=todas');
    if (r.estado !== 200) return;

    const grupos = {
      vencidas: r.datos.vencidas || [], hoy: r.datos.hoy || [],
      proximas: r.datos.proximas || [], recientes: r.datos.recientes || [],
    };
    const donde = new Map();
    for (const [nombre, lista] of Object.entries(grupos)) {
      for (const t of lista) {
        if (donde.has(t.id)) {
          assert.fail(`«${t.titulo}» aparece en «${donde.get(t.id)}» y en «${nombre}»`);
        }
        donde.set(t.id, nombre);
      }
    }
  });

  test('las de hoy ya no se cuelan en «próximas a vencer»', async () => {
    const r = await pedir('/crm/tareas/inicio?ambito=todas');
    if (r.estado !== 200) return;
    const hoy = new Date().toISOString().slice(0, 10);
    const coladas = (r.datos.proximas || [])
      .filter(t => String(t.venceAt).slice(0, 10) === hoy);
    assert.equal(coladas.length, 0,
      `${coladas.length} tarea(s) de hoy siguen mezcladas en «próximas a vencer»`);
  });
});

describe('Inicio · una tarea que vence hoy cae en su lista', () => {
  test('se crea con vencimiento hoy y sale en «hoy», no en «próximas»', async () => {
    const sesion = await sesionDe();
    if (!sesion) return;
    const hoy = new Date().toISOString().slice(0, 10);

    const c = await pedir('/crm/tareas', {
      metodo: 'POST',
      cuerpo: { titulo: `${MARCA} vence hoy`, venceAt: hoy, prioridad: 'alta',
                responsableId: sesion.usuario_id },
    });
    alTerminar(async () => {
      await pool.query('DELETE FROM tarea WHERE titulo LIKE $1', [`${MARCA}%`]);
    });
    if (![200, 201].includes(c.estado)) return;
    const id = c.datos?.tarea?.id || c.datos?.id;
    if (!id) return;

    const r = await pedir('/crm/tareas/inicio?ambito=todas');
    assert.equal(r.estado, 200);
    assert.ok((r.datos.hoy || []).some(t => t.id === id),
      'se creó una tarea que vence hoy y no aparece en la lista de hoy');
    assert.ok(!(r.datos.proximas || []).some(t => t.id === id),
      'aparece además en «próximas»: estaría contada dos veces');
  });
});

describe('Reabrir una subtarea (punto 1)', () => {
  let madreId = null, subId = null;

  test('1 · se prepara una madre con una subtarea finalizada', async () => {
    const m = await pedir('/crm/tareas', {
      metodo: 'POST', cuerpo: { titulo: `${MARCA} madre` },
    });
    alTerminar(async () => {
      await pool.query('DELETE FROM tarea WHERE titulo LIKE $1', [`${MARCA}%`]);
    });
    if (![200, 201].includes(m.estado)) return;
    madreId = m.datos?.tarea?.id || m.datos?.id;
    if (!madreId) return;

    const s = await pedir('/crm/tareas', {
      metodo: 'POST', cuerpo: { titulo: `${MARCA} sub`, parentId: madreId },
    });
    if (![200, 201].includes(s.estado)) return;
    subId = s.datos?.tarea?.id || s.datos?.id;
    assert.ok(subId, 'no se pudo crear la subtarea');

    const f = await pedir(`/crm/tareas/${subId}`, {
      metodo: 'PUT', cuerpo: { estado: 'completada' },
    });
    assert.ok([200, 201].includes(f.estado), `finalizar respondió ${f.estado}`);
  });

  test('2 · al reabrirla, el servidor le limpia la fecha de cierre', async () => {
    if (!subId) return;
    const r = await pedir(`/crm/tareas/${subId}`, {
      metodo: 'PUT', cuerpo: { estado: 'pendiente' },
    });
    assert.ok([200, 201].includes(r.estado), `reabrir respondió ${r.estado}`);

    const { rows } = await pool.query(
      'SELECT estado::text AS estado, completed_at FROM tarea WHERE id = $1', [subId]);
    assert.equal(rows[0].estado, 'pendiente');
    assert.equal(rows[0].completed_at, null,
      'quedó activa pero con fecha de cierre: seguiría contando como cerrada');
  });

  test('3 · reabierta SIGUE siendo alcanzable por su id', async () => {
    // Es lo que sostiene el arreglo: el aviso de pantalla ofrece «Mostrarla»,
    // pero la tarea tiene que poder abrirse igual por su id, que es el camino
    // de la campana y del enlace directo.
    if (!subId) return;
    const r = await pedir(`/crm/tareas/${subId}`);
    assert.equal(r.estado, 200,
      'una subtarea reabierta dejó de poder abrirse: es el bug de §10.5 punto 1');
    assert.equal(r.datos?.tarea?.estado, 'pendiente');
  });

  test('4 · sale de «finalizadas», que es lo que la hacía desaparecer', async () => {
    if (!subId) return;
    const r = await pedir('/crm/tareas?ambito=todas&estado=cerradas&limite=200');
    if (r.estado !== 200) return;
    assert.ok(!(r.datos.tareas || []).some(t => t.id === subId),
      'sigue apareciendo entre las cerradas aunque está activa');
  });

  test('5 · y se encuentra pidiendo las subtareas sueltas', async () => {
    // Sin `soloRaiz` la lista sí la trae: es lo que hace el interruptor
    // «Con subtareas», al que ahora lleva el aviso de pantalla.
    if (!subId) return;
    const r = await pedir('/crm/tareas?ambito=todas&estado=activas&limite=300');
    if (r.estado !== 200) return;
    assert.ok((r.datos.tareas || []).some(t => t.id === subId),
      'no aparece ni pidiendo las sueltas: quedaría inalcanzable');
  });
});

describe('La urgencia viaja con el aviso (punto 2)', () => {
  // Si la migración todavía no se aplicó, estas pruebas lo dicen y se saltan
  // en vez de fallar por algo que no es del código.
  const hayColumna = async () => {
    const { rows } = await pool.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_name = 'notificacion' AND column_name = 'prioridad'`);
    if (!rows.length) {
      console.log('      ℹ falta aplicar 2026-09-04_notificacion_prioridad.sql');
      return false;
    }
    return true;
  };

  test('la columna solo acepta el catálogo de prioridades', async () => {
    if (!await hayColumna()) return;
    // Un valor fuera del catálogo tiene que rebotar: si entrara, la pantalla no
    // sabría de qué color pintarlo y el aviso saldría sin urgencia, en silencio.
    await assert.rejects(
      () => pool.query(
        `INSERT INTO notificacion (usuario_id, tipo, titulo, prioridad)
         VALUES ((SELECT id FROM usuario WHERE activo LIMIT 1),
                 'tarea_asignada', $1, 'urgentisima')`,
        [`${MARCA} mala`]),
      /check|constraint/i,
      'la base aceptó una prioridad que no existe');
  });

  test('asignar una tarea crítica deja el aviso con su urgencia', async () => {
    if (!await hayColumna()) return;

    // Se le asigna a OTRO: nadie se notifica a sí mismo.
    const yo = await sesionDe();
    const { rows: otros } = await pool.query(
      'SELECT id FROM usuario WHERE activo AND id <> $1 LIMIT 1', [yo?.usuario_id]);
    if (!otros.length) return;

    const c = await pedir('/crm/tareas', {
      metodo: 'POST',
      cuerpo: { titulo: `${MARCA} critica`, prioridad: 'critica',
                responsableId: otros[0].id },
    });
    alTerminar(async () => {
      await pool.query('DELETE FROM notificacion WHERE titulo LIKE $1', [`%${MARCA}%`]);
      await pool.query('DELETE FROM tarea WHERE titulo LIKE $1', [`${MARCA}%`]);
    });
    if (![200, 201].includes(c.estado)) return;
    const id = c.datos?.tarea?.id || c.datos?.id;
    if (!id) return;

    const { rows: avisos } = await pool.query(
      `SELECT prioridad FROM notificacion
        WHERE entidad = 'tarea' AND entidad_id = $1 AND tipo = 'tarea_asignada'`, [id]);
    assert.ok(avisos.length, 'asignar la tarea no generó ningún aviso');
    assert.equal(avisos[0].prioridad, 'critica',
      `el aviso quedó en "${avisos[0].prioridad}": el pop-up no podría distinguirla`);
  });

  test('la campana devuelve la prioridad al frontend', async () => {
    if (!await hayColumna()) return;
    const r = await pedir('/crm/notificaciones');
    if (r.estado !== 200) return;
    for (const n of r.datos.notificaciones || []) {
      assert.ok(Object.hasOwn(n, 'prioridad'),
        'los avisos llegan sin el campo prioridad: el pop-up no sabría qué mostrar');
    }
  });

  test('un aviso que no es de una tarea no inventa urgencia', async () => {
    if (!await hayColumna()) return;
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM notificacion
        WHERE tipo <> 'tarea_asignada' AND prioridad IS NOT NULL`);
    assert.equal(rows[0].n, 0,
      `${rows[0].n} aviso(s) que no son de asignación traen prioridad`);
  });
});
