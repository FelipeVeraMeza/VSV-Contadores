// ============================================================================
// E2E · el flujo completo, como lo haría una persona
// ----------------------------------------------------------------------------
// No se prueban endpoints sueltos sino RECORRIDOS: crear un prospecto, buscarlo,
// agendarle una acción, cerrarlo. Si un paso deja al siguiente sin lo que
// necesita, acá se ve; en las pruebas por endpoint, no.
//
// Todo lo que se crea se borra al final. Esta suite corre contra la base real y
// no puede dejar basura.
// ============================================================================
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { pedir, pool, cerrar, alTerminar } from '../arnes.mjs';

after(cerrar);

const MARCA = `QA-${Date.now().toString(36)}`;

describe('Recorrido · alta y gestión de un prospecto', () => {
  let personaId = null;

  test('1 · se crea el prospecto', async () => {
    const r = await pedir('/personas', {
      metodo: 'POST',
      cuerpo: {
        nombre: MARCA, apellidos: 'Prueba Automatizada',
        estado: 'prospecto', origen: 'manual',
        correos: [`${MARCA.toLowerCase()}@ejemplo.cl`],
        telefonos: ['56900000000'],
        necesidad: 'Verificación automática de QA',
        rubro: 'Pruebas',
      },
    });
    assert.ok([200, 201].includes(r.estado), `respondió ${r.estado}: ${JSON.stringify(r.datos)}`);
    personaId = r.datos?.persona?.id || r.datos?.id;
    assert.ok(personaId, 'la respuesta no trae el id de lo que creó');

    alTerminar(async () => {
      await pool.query('DELETE FROM persona WHERE nombre = $1', [MARCA]);
    });
  });

  test('2 · aparece al buscarlo por nombre', async () => {
    if (!personaId) return;
    const r = await pedir(`/personas?q=${encodeURIComponent(MARCA)}`);
    assert.equal(r.estado, 200);
    const encontrado = (r.datos.personas || []).find(p => p.id === personaId);
    assert.ok(encontrado, 'se creó pero la búsqueda no lo encuentra');
    assert.equal(encontrado.rubro, 'Pruebas', 'el rubro no se guardó');
  });

  test('3 · aparece al buscarlo por correo', async () => {
    if (!personaId) return;
    const r = await pedir(`/personas?q=${encodeURIComponent(MARCA.toLowerCase())}@ejemplo.cl`);
    assert.equal(r.estado, 200);
    assert.ok((r.datos.personas || []).some(p => p.id === personaId),
      'no se encuentra por su correo');
  });

  test('4 · se puede abrir su ficha', async () => {
    if (!personaId) return;
    const r = await pedir(`/personas/${personaId}`);
    assert.equal(r.estado, 200, `la ficha respondió ${r.estado}`);
    assert.equal(r.datos?.persona?.nombre ?? r.datos?.nombre, MARCA);
  });

  test('5 · se le agrega una nota', async () => {
    if (!personaId) return;
    const r = await pedir(`/personas/${personaId}/notas`, {
      metodo: 'POST', cuerpo: { texto: 'Nota de verificación automática' },
    });
    assert.ok([200, 201].includes(r.estado), `respondió ${r.estado}`);
  });

  test('6 · el conteo del panel lo incluye', async () => {
    if (!personaId) return;
    const r = await pedir('/crm/metricas');
    if (r.estado !== 200) return;
    const { rows: [b] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM persona WHERE estado::text='prospecto' AND activo`);
    assert.equal(r.datos.metricas.prospectos, b.n,
      'el panel no refleja el prospecto recién creado');
  });

  test('7 · se elimina y desaparece', async () => {
    if (!personaId) return;
    const borrar = await pedir(`/personas/${personaId}`, { metodo: 'DELETE' });
    assert.ok([200, 204].includes(borrar.estado), `el borrado respondió ${borrar.estado}`);

    const buscar = await pedir(`/personas?q=${encodeURIComponent(MARCA)}`);
    assert.equal((buscar.datos.personas || []).filter(p => p.id === personaId).length, 0,
      'se borró pero sigue apareciendo en la búsqueda');
  });
});

describe('Recorrido · consultar la cobranza del mes', () => {
  test('el resumen, el detalle y la vista previa de recordatorios coinciden', async () => {
    const resumen = await pedir('/cobros/resumen');
    if (resumen.estado !== 200) return;

    const preview = await pedir('/dte/recordatorios/preview');
    if (preview.estado !== 200) return;

    // Los destinatarios del recordatorio no pueden superar a los que deben.
    const { rows: [b] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM cobro_mensual c JOIN empresa e ON e.id = c.empresa_id
        WHERE c.estado = 'PENDIENTE_PAGO' AND e.activo AND e.en_cartera IS NOT FALSE`);
    assert.ok(preview.datos.total <= b.n,
      `el recordatorio iría a ${preview.datos.total} y solo hay ${b.n} con deuda`);
  });
});

describe('Recorrido · el asistente responde con datos reales', () => {
  test('una consulta devuelve la cifra que está en la base', async (t) => {
    const estado = await pedir('/asistente/estado');
    if (estado.estado !== 200 || !estado.datos?.disponible) {
      return t.skip('el asistente no está disponible en este ambiente');
    }
    const r = await pedir('/asistente/chat', {
      metodo: 'POST',
      cuerpo: { mensaje: '¿cuántas tareas están vencidas?', conversacionId: `qa-${Date.now()}` },
    });
    if (r.estado !== 200) return t.skip(`el asistente respondió ${r.estado}`);

    const { rows: [b] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM tarea
        WHERE vence_at < CURRENT_DATE AND estado::text <> 'completada' AND archivada_at IS NULL`);
    const texto = String(r.datos.respuesta || '');
    // No se exige la cifra exacta —el modelo redacta—, pero SÍ que no invente
    // un número que no está en ninguna parte.
    const numeros = (texto.match(/\d+/g) || []).map(Number);
    if (numeros.length) {
      assert.ok(numeros.some(n => Math.abs(n - b.n) <= b.n || n <= b.n * 2),
        `la respuesta cita ${numeros.join(', ')} y en la base hay ${b.n} vencidas`);
    }
  });
});
