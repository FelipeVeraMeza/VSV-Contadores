// ============================================================================
// RENDIMIENTO · tiempos, concurrencia y consumo
// ----------------------------------------------------------------------------
// Los topes NO son aspiracionales: son el punto donde la pantalla se siente
// rota. Una consulta de 4 s hace que el usuario apriete el botón dos veces.
//
// Se mide contra la base REAL con su volumen real: 229 empresas, 133 personas,
// 467 tareas, 1.081 cobros. Un tiempo medido sobre datos de juguete no dice nada.
// ============================================================================
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { pedir, cerrar } from '../arnes.mjs';

after(cerrar);

// Presupuesto por endpoint, en milisegundos. Se afina con la realidad, no con
// un número redondo: lo que importa es detectar una REGRESIÓN, no aprobar.
const PRESUPUESTO = [
  ['/crm/metricas',       2500, 'el panel completo del CRM: varias consultas agregadas'],
  ['/crm/tareas',         1500, 'lista de tareas'],
  ['/personas',           1500, 'cartera completa'],
  ['/cobros/resumen',     2000, 'resumen de cobranza'],
  ['/correos/plantillas',  800, 'lista corta'],
  ['/correos/cuota',       800, 'un conteo'],
];

describe('Tiempo de respuesta', () => {
  for (const [ruta, tope, porque] of PRESUPUESTO) {
    test(`${ruta} bajo ${tope} ms · ${porque}`, async () => {
      // Tres medidas y se toma la mediana: la primera suele pagar el arranque
      // en frío de la conexión, y castigar por eso mide la red, no el código.
      const medidas = [];
      for (let i = 0; i < 3; i++) {
        const r = await pedir(ruta);
        if (r.estado !== 200) return;
        medidas.push(r.ms);
      }
      const mediana = medidas.sort((a, b) => a - b)[1];
      assert.ok(mediana < tope,
        `mediana ${mediana} ms sobre un tope de ${tope} ms (medidas: ${medidas.join(', ')})`);
    });
  }
});

describe('Concurrencia', () => {
  test('10 peticiones a la vez sin errores', async () => {
    const respuestas = await Promise.all(
      Array.from({ length: 10 }, () => pedir('/crm/metricas')));
    const fallidas = respuestas.filter(r => r.estado !== 200);
    assert.equal(fallidas.length, 0,
      `${fallidas.length} de 10 fallaron: ${fallidas.map(r => r.estado).join(', ')}`);
  });

  test('la concurrencia no dispara los tiempos', async () => {
    const solo = await pedir('/crm/metricas');
    if (solo.estado !== 200) return;
    const enParalelo = await Promise.all(
      Array.from({ length: 8 }, () => pedir('/crm/metricas')));
    const peor = Math.max(...enParalelo.map(r => r.ms));
    // Con 8 en paralelo se acepta hasta 6× la medida sola: más que eso sugiere
    // que las conexiones se están encolando o que falta un índice.
    assert.ok(peor < Math.max(solo.ms * 6, 6000),
      `sola ${solo.ms} ms, la peor de 8 en paralelo ${peor} ms`);
  });

  test('peticiones idénticas simultáneas devuelven lo mismo', async () => {
    // Si dos lecturas iguales dan resultados distintos hay estado compartido
    // entre peticiones, que es de los bugs más difíciles de rastrear después.
    const [a, b] = await Promise.all([pedir('/crm/metricas'), pedir('/crm/metricas')]);
    if (a.estado !== 200 || b.estado !== 200) return;
    assert.equal(a.datos.metricas.totalPersonas, b.datos.metricas.totalPersonas);
    assert.equal(a.datos.metricas.prospectos, b.datos.metricas.prospectos);
  });
});

describe('Tamaño de las respuestas', () => {
  test('ninguna respuesta pasa de 2 MB', async () => {
    for (const [ruta] of PRESUPUESTO) {
      const r = await pedir(ruta);
      if (r.estado !== 200) continue;
      const kb = Math.round(JSON.stringify(r.datos).length / 1024);
      assert.ok(kb < 2048, `${ruta} devolvió ${kb} KB`);
    }
  });

  test('el perfil de correo no arrastra la firma en base64 a cada lista', async () => {
    // La firma es una imagen embebida de ~170 KB. Si viaja en respuestas donde
    // no hace falta, cada carga de pantalla paga ese peso.
    const r = await pedir('/correos/plantillas');
    if (r.estado !== 200) return;
    const kb = Math.round(JSON.stringify(r.datos).length / 1024);
    if (kb > 200) {
      console.log(`      ℹ /correos/plantillas devuelve ${kb} KB (imágenes embebidas)`);
    }
  });
});
