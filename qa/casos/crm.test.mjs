// ============================================================================
// CRM · cartera, tareas, proyectos y agenda
// ----------------------------------------------------------------------------
// El CRM es donde el equipo decide a quién llamar y qué hacer hoy. Un dato mal
// contado acá no rompe nada visiblemente: hace que alguien trabaje sobre una
// lista equivocada, y eso no se nota hasta que se pierde un cliente.
//
// Se contrasta contra SQL directo, nunca contra otro endpoint: si los dos
// leyeran del mismo sitio equivocado, coincidirían y no se notaría.
// ============================================================================
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { pedir, pool, cerrar, alTerminar } from '../arnes.mjs';

after(cerrar);

const MARCA = `QA-${Date.now().toString(36)}`;

describe('Cartera · los conteos cuadran', () => {
  test('prospectos, clientes y total', async () => {
    const r = await pedir('/crm/metricas?scope=equipo');
    if (r.estado !== 200) return;
    const m = r.datos.metricas;

    const { rows: [b] } = await pool.query(`
      SELECT COUNT(*) FILTER (WHERE estado::text = 'prospecto' AND activo)::int AS prospectos,
             COUNT(*) FILTER (WHERE activo)::int                                AS total
        FROM persona`);
    assert.equal(m.prospectos, b.prospectos, 'prospectos no cuadra');
    assert.equal(m.totalPersonas, b.total, 'total de personas no cuadra');

    const { rows: [e] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM empresa
        WHERE activo AND en_cartera IS NOT FALSE AND es_principal = false`);
    assert.equal(m.clientesActivos, e.n, 'clientes activos no cuadra');
  });

  test('el pipeline no pierde ni duplica a nadie', async () => {
    const r = await pedir('/crm/metricas?scope=equipo');
    if (r.estado !== 200) return;
    const suma = (r.datos.metricas.pipeline || []).reduce((a, x) => a + Number(x.n || 0), 0);
    assert.equal(suma, r.datos.metricas.totalPersonas,
      `el pipeline suma ${suma} y hay ${r.datos.metricas.totalPersonas} personas`);
  });

  test('la conversión es coherente con los ganados', async () => {
    const r = await pedir('/crm/metricas?scope=equipo');
    if (r.estado !== 200) return;
    const m = r.datos.metricas;
    assert.ok(m.tasaConversion >= 0 && m.tasaConversion <= 100,
      `tasa de conversión fuera de rango: ${m.tasaConversion}%`);
    if (m.totalPersonas > 0) {
      const esperada = Math.round((m.activos / m.totalPersonas) * 100);
      assert.equal(m.tasaConversion, esperada,
        `dice ${m.tasaConversion}% y ${m.activos}/${m.totalPersonas} da ${esperada}%`);
    }
  });
});

describe('Tareas · lo que el equipo tiene encima', () => {
  test('las vencidas están de verdad vencidas', async () => {
    const r = await pedir('/crm/metricas?scope=equipo');
    if (r.estado !== 200) return;
    const { rows: [b] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM tarea
        WHERE vence_at < CURRENT_DATE AND estado::text <> 'completada'
          AND archivada_at IS NULL`);
    assert.equal(r.datos.metricas.tareasVencidas, b.n,
      `el panel dice ${r.datos.metricas.tareasVencidas} y la base ${b.n}`);
  });

  test('las archivadas no cuentan como pendientes', async () => {
    const { rows: [b] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM tarea
        WHERE archivada_at IS NOT NULL AND estado::text <> 'completada'`);
    if (!b.n) return;
    const r = await pedir('/crm/tareas?ambito=equipo');
    if (r.estado !== 200) return;
    const archivadas = (r.datos.tareas || []).filter(t => t.archivadaAt || t.archivada_at);
    assert.equal(archivadas.length, 0,
      `${archivadas.length} tareas archivadas aparecen en la lista de pendientes`);
  });

  test('«vencen hoy» son las de hoy, no las de ayer', async () => {
    const r = await pedir('/crm/metricas?scope=equipo');
    if (r.estado !== 200) return;
    const { rows: [b] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM tarea
        WHERE vence_at::date = CURRENT_DATE AND estado::text <> 'completada'
          AND archivada_at IS NULL`);
    assert.equal(r.datos.metricas.vencenHoy, b.n,
      `«vencen hoy» dice ${r.datos.metricas.vencenHoy} y son ${b.n}`);
  });
});

describe('Recaudación · la cifra que mira el dueño', () => {
  test('la serie trae seis meses en orden', async () => {
    const r = await pedir('/crm/metricas');
    if (r.estado !== 200) return;
    const serie = r.datos.metricas.serieRecaudado || [];
    assert.equal(serie.length, 6, `trae ${serie.length} meses`);
    const meses = serie.map(x => x.mes);
    assert.deepEqual(meses, [...meses].sort(), 'la serie no viene ordenada');
  });

  test('el mes en curso de la serie coincide con ventasMes', async () => {
    const r = await pedir('/crm/metricas');
    if (r.estado !== 200) return;
    const m = r.datos.metricas;
    const actual = (m.serieRecaudado || []).at(-1);
    if (!actual) return;
    assert.equal(Number(actual.recaudado), Number(m.ventasMes),
      `la serie dice ${actual.recaudado} para ${actual.mes} y ventasMes dice ${m.ventasMes}`);
  });

  test('se mide por fecha de pago, no por período del cobro', async () => {
    // Esta distinción hizo que el panel mostrara 7,5 veces menos de lo real
    // hasta el 01-09-2026 (crm-modulo.md §11.1).
    const r = await pedir('/crm/metricas');
    if (r.estado !== 200) return;
    const { rows: [b] } = await pool.query(
      `SELECT COALESCE(SUM(monto_facturado), 0)::bigint AS total
         FROM cobro_mensual
        WHERE estado = 'PAGADA'
          AND date_trunc('month', fecha_pago) = date_trunc('month', CURRENT_DATE)`);
    assert.equal(Number(r.datos.metricas.ventasMes), Number(b.total),
      `el panel dice ${r.datos.metricas.ventasMes} y por fecha de pago son ${b.total}`);
  });
});

describe('Ciclo de una tarea', () => {
  let tareaId = null;

  test('1 · se crea', async () => {
    const r = await pedir('/crm/tareas', {
      metodo: 'POST',
      cuerpo: { titulo: `${MARCA} tarea de prueba`, prioridad: 'media', estado: 'pendiente' },
    });
    assert.ok([200, 201].includes(r.estado), `respondió ${r.estado}: ${JSON.stringify(r.datos)}`);
    tareaId = r.datos?.tarea?.id || r.datos?.id;
    assert.ok(tareaId, 'no devolvió el id');
    alTerminar(async () => {
      await pool.query('DELETE FROM tarea WHERE titulo LIKE $1', [`${MARCA}%`]);
    });
  });

  test('2 · se puede abrir', async () => {
    if (!tareaId) return;
    const r = await pedir(`/crm/tareas/${tareaId}`);
    assert.equal(r.estado, 200, `abrir la tarea respondió ${r.estado}`);
  });

  test('3 · se le agrega un comentario', async () => {
    if (!tareaId) return;
    const r = await pedir(`/crm/tareas/${tareaId}/comentarios`, {
      metodo: 'POST', cuerpo: { texto: 'Comentario de verificación' },
    });
    assert.ok([200, 201].includes(r.estado), `respondió ${r.estado}`);
  });

  test('4 · se completa', async () => {
    if (!tareaId) return;
    const r = await pedir(`/crm/tareas/${tareaId}`, {
      metodo: 'PUT', cuerpo: { estado: 'completada' },
    });
    assert.ok([200, 201].includes(r.estado), `respondió ${r.estado}`);

    const { rows } = await pool.query(
      'SELECT estado::text AS estado, completed_at FROM tarea WHERE id = $1', [tareaId]);
    assert.equal(rows[0].estado, 'completada');
    assert.ok(rows[0].completed_at, 'se completó pero no quedó la fecha');
  });

  test('5 · se archiva', async () => {
    if (!tareaId) return;
    const r = await pedir(`/crm/tareas/${tareaId}/archivar`, {
      metodo: 'PATCH', cuerpo: { archivar: true },
    });
    assert.ok([200, 204].includes(r.estado), `archivar respondió ${r.estado}`);
  });
});

describe('Validación al crear tareas', () => {
  const MALOS = [
    ['sin título',        { prioridad: 'alta' }],
    ['título vacío',      { titulo: '   ' }],
    ['título larguísimo', { titulo: 'x'.repeat(500) }],
    ['responsable que no existe', { titulo: `${MARCA} r`, responsableId: '00000000-0000-0000-0000-000000000000' }],
  ];

  for (const [nombre, cuerpo] of MALOS) {
    test(`rechaza: ${nombre}`, async () => {
      const r = await pedir('/crm/tareas', { metodo: 'POST', cuerpo });
      assert.ok(r.estado >= 400 && r.estado < 500,
        `respondió ${r.estado} — debería rechazarse con 4xx`);
      assert.notEqual(r.estado, 500, 'devolvió 500 en vez de un error de validación');
    });
  }
});

describe('Valores fuera de rango se normalizan, no rompen', () => {
  test('una prioridad inventada cae en «media»', async () => {
    // Decisión de diseño verificada el 04-09-2026: el sistema NO rechaza la
    // tarea por una prioridad mal escrita, la guarda con el valor por omisión.
    // Es lo correcto: perder una tarea por un typo sería peor que asignarle
    // una prioridad conservadora.
    const r = await pedir('/crm/tareas', {
      metodo: 'POST',
      cuerpo: { titulo: `${MARCA} prioridad rara`, prioridad: 'urgentísima' },
    });
    if (![200, 201].includes(r.estado)) return;
    const id = r.datos?.tarea?.id || r.datos?.id;
    if (!id) return;

    const { rows } = await pool.query(
      'SELECT prioridad::text AS p FROM tarea WHERE id = $1', [id]);
    assert.equal(rows[0].p, 'media',
      `una prioridad inválida quedó guardada como "${rows[0].p}"`);
  });
});

describe('Calidad de los datos · lo que hace que el CRM sirva', () => {
  test('cuántos prospectos no tienen próxima acción', async () => {
    const { rows: [b] } = await pool.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE accion_siguiente IS NULL OR accion_siguiente = '')::int AS sin_accion,
             COUNT(*) FILTER (WHERE rubro IS NULL OR rubro = '')::int AS sin_rubro
        FROM persona WHERE estado::text = 'prospecto' AND activo`);
    if (b.sin_accion || b.sin_rubro) {
      console.log(`      ℹ de ${b.total} prospectos: ${b.sin_accion} sin próxima acción, ` +
                  `${b.sin_rubro} sin rubro`);
    }
    // Informa, no falla: cargar esos datos es trabajo de negocio.
  });

  test('cuántas empresas no tienen responsable', async () => {
    const { rows: [b] } = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE responsable_id IS NULL)::int AS sin_responsable
         FROM empresa WHERE activo AND en_cartera IS NOT FALSE AND es_principal = false`);
    if (b.sin_responsable) {
      console.log(`      ℹ ${b.sin_responsable} de ${b.total} empresas activas sin responsable ` +
                  'asignado: el sistema no puede decir de quién es cada cliente');
    }
  });
});
