// ============================================================================
// COBRO AUTOMÁTICO AL EMITIR
// ----------------------------------------------------------------------------
// Esta función se va a conectar a los cuatro caminos que emiten facturas al
// SII. Un fallo acá crea cobros duplicados —se le cobra dos veces al cliente—
// o pisa el cobro del plan mensual.
//
// Se prueba contra la base REAL, dentro de transacciones que se revierten: así
// se ejerce la restricción de verdad sin dejar nada escrito.
// ============================================================================
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, cerrar } from '../arnes.mjs';
import { asegurarCobroDeFactura } from '../../src/utils/cobroDeFactura.js';

after(cerrar);

// Cada caso corre en su propia transacción y se revierte. Sin esto la suite
// dejaría cobros de prueba en producción.
async function enTransaccion(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    return await fn(c);
  } finally {
    await c.query('ROLLBACK');
    c.release();
  }
}

async function unaEmpresa(c) {
  const { rows } = await c.query(
    `SELECT id, organizacion_id FROM empresa WHERE activo AND es_principal = false LIMIT 1`);
  return rows[0];
}

const folioNuevo = () => String(900000 + Math.floor(Math.random() * 99999));

describe('Caso normal', () => {
  test('crea el cobro de una factura sin cobro previo', async () => {
    await enTransaccion(async (c) => {
      const e = await unaEmpresa(c);
      const folio = folioNuevo();
      const r = await asegurarCobroDeFactura(c, {
        empresaId: e.id, folio, montoTotal: 47600, tipoDte: 33,
        fechaEmision: '2026-09-15', organizacionId: e.organizacion_id,
      });
      assert.equal(r.creado, true, `no se creó: ${r.motivo}`);

      const { rows } = await c.query(
        'SELECT estado, monto_esperado, fecha_vencimiento FROM cobro_mensual WHERE id = $1',
        [r.cobroId]);
      assert.equal(rows[0].estado, 'PENDIENTE_PAGO', 'no nació como pendiente de pago');
      assert.equal(Number(rows[0].monto_esperado), 47600);
      // Vence el 5 del mes siguiente, igual que el ciclo mensual.
      assert.equal(rows[0].fecha_vencimiento.toISOString().slice(0, 10), '2026-10-05');
    });
  });

  test('el cobro creado aparece como deuda pendiente', async () => {
    await enTransaccion(async (c) => {
      const e = await unaEmpresa(c);
      const folio = folioNuevo();
      await asegurarCobroDeFactura(c, {
        empresaId: e.id, folio, montoTotal: 59500,
        fechaEmision: '2026-09-10', organizacionId: e.organizacion_id,
      });
      const { rows } = await c.query(
        `SELECT COUNT(*)::int AS n FROM cobro_mensual
          WHERE TRIM(folio) = $1 AND estado = 'PENDIENTE_PAGO'`, [folio]);
      assert.equal(rows[0].n, 1, 'la factura no quedó como deuda perseguible');
    });
  });
});

describe('Idempotencia · los procesos masivos reintentan', () => {
  test('llamarla dos veces con el mismo folio no duplica', async () => {
    await enTransaccion(async (c) => {
      const e = await unaEmpresa(c);
      const folio = folioNuevo();
      const datos = { empresaId: e.id, folio, montoTotal: 35700,
                      fechaEmision: '2026-09-20', organizacionId: e.organizacion_id };

      const primera = await asegurarCobroDeFactura(c, datos);
      const segunda = await asegurarCobroDeFactura(c, datos);

      assert.equal(primera.creado, true);
      assert.equal(segunda.creado, false, 'creó un segundo cobro para el mismo folio');

      const { rows } = await c.query(
        'SELECT COUNT(*)::int AS n FROM cobro_mensual WHERE TRIM(folio) = $1', [folio]);
      assert.equal(rows[0].n, 1, `quedaron ${rows[0].n} cobros con el mismo folio`);
    });
  });

  test('no toca un cobro que ya existía con ese folio', async () => {
    await enTransaccion(async (c) => {
      // El caso normal del ciclo mensual: el cobro nace primero y emitirCobro
      // le pone el folio. La función no debe crear nada ni modificarlo.
      const { rows: [existente] } = await c.query(
        `SELECT id, empresa_id, folio, monto_esperado FROM cobro_mensual
          WHERE folio IS NOT NULL AND TRIM(folio) <> '' LIMIT 1`);
      if (!existente) return;

      const r = await asegurarCobroDeFactura(c, {
        empresaId: existente.empresa_id, folio: existente.folio, montoTotal: 999999,
      });
      assert.equal(r.creado, false, 'creó un cobro duplicado');

      const { rows: [despues] } = await c.query(
        'SELECT monto_esperado FROM cobro_mensual WHERE id = $1', [existente.id]);
      assert.equal(Number(despues.monto_esperado), Number(existente.monto_esperado),
        'modificó el monto del cobro que ya existía');
    });
  });
});

describe('Factura EXTRA · el caso que motivó todo', () => {
  test('convive con el cobro del plan del mismo mes', async () => {
    await enTransaccion(async (c) => {
      const e = await unaEmpresa(c);
      const periodo = '2026-11-01';

      // El cobro del plan, como lo crea el ciclo mensual.
      await c.query(
        `INSERT INTO cobro_mensual (organizacion_id, empresa_id, periodo, monto_esperado,
                                    folio, estado, fecha_vencimiento)
         VALUES ($1, $2, $3, 70000, $4, 'PENDIENTE_PAGO', '2026-12-05')`,
        [e.organizacion_id, e.id, periodo, folioNuevo()]);

      // Ahora un trabajo extra del mismo mes: PARTY CARS tuvo tres así.
      const extra = folioNuevo();
      const r = await asegurarCobroDeFactura(c, {
        empresaId: e.id, folio: extra, montoTotal: 178500,
        fechaEmision: '2026-11-20', organizacionId: e.organizacion_id,
      });
      assert.equal(r.creado, true,
        `la factura extra no obtuvo cobro: ${r.motivo}`);

      const { rows } = await c.query(
        `SELECT COUNT(*)::int AS n, SUM(monto_esperado)::bigint AS total
           FROM cobro_mensual WHERE empresa_id = $1 AND periodo = $2`, [e.id, periodo]);
      assert.equal(rows[0].n, 2, 'no quedaron los dos cobros del mes');
      assert.equal(Number(rows[0].total), 248500, 'el total del mes no suma plan + extra');
    });
  });

  test('tres facturas del mismo mes conviven', async () => {
    await enTransaccion(async (c) => {
      const e = await unaEmpresa(c);
      for (const monto of [70000, 178500, 59500]) {
        const r = await asegurarCobroDeFactura(c, {
          empresaId: e.id, folio: folioNuevo(), montoTotal: monto,
          fechaEmision: '2026-12-10', organizacionId: e.organizacion_id,
        });
        assert.equal(r.creado, true, `no se creó el cobro de $${monto}: ${r.motivo}`);
      }
      const { rows } = await c.query(
        `SELECT COUNT(*)::int AS n FROM cobro_mensual
          WHERE empresa_id = $1 AND periodo = '2026-12-01'`, [e.id]);
      assert.equal(rows[0].n, 3, `quedaron ${rows[0].n} de 3 cobros`);
    });
  });
});

describe('Entradas inválidas · no revientan', () => {
  const CASOS = [
    ['sin empresa',        { folio: '123', montoTotal: 1000 }],
    ['sin folio',          { empresaId: 'x', montoTotal: 1000 }],
    ['ambos vacíos',       {}],
    ['folio vacío',        { empresaId: 'x', folio: '   ', montoTotal: 1000 }],
    ['fecha inválida',     { empresaId: 'x', folio: '123', fechaEmision: 'no-es-fecha' }],
    ['monto nulo',         { empresaId: 'x', folio: '123', montoTotal: null }],
  ];

  for (const [nombre, datos] of CASOS) {
    test(nombre, async () => {
      await enTransaccion(async (c) => {
        // Lo importante: NUNCA lanzar. La factura ya está en el SII y tumbar el
        // proceso de facturación a mitad es peor que no crear el cobro.
        const r = await asegurarCobroDeFactura(c, datos);
        assert.equal(typeof r.creado, 'boolean', 'no devolvió un resultado válido');
        assert.equal(r.creado, false);
        assert.ok(r.motivo, 'no explica por qué no se creó');
      });
    });
  }

  test('una empresa inexistente no rompe el proceso', async () => {
    await enTransaccion(async (c) => {
      const r = await asegurarCobroDeFactura(c, {
        empresaId: '00000000-0000-0000-0000-000000000000',
        folio: folioNuevo(), montoTotal: 1000, fechaEmision: '2026-09-01',
      });
      assert.equal(r.creado, false, 'creó un cobro para una empresa que no existe');
      assert.ok(r.motivo && r.motivo.length > 0);
    });
  });
});

describe('La restricción de la base sigue protegiendo', () => {
  test('el ciclo mensual no puede generar dos cobros sin folio', async () => {
    await enTransaccion(async (c) => {
      const e = await unaEmpresa(c);
      const periodo = '2027-01-01';
      await c.query(
        `INSERT INTO cobro_mensual (organizacion_id, empresa_id, periodo, monto_esperado, estado)
         VALUES ($1, $2, $3, 30000, 'POR_EMITIR')`, [e.organizacion_id, e.id, periodo]);

      // El segundo POR_EMITIR del mismo mes tiene que rebotar: es el duplicado
      // que el índice parcial evita.
      await assert.rejects(
        () => c.query(
          `INSERT INTO cobro_mensual (organizacion_id, empresa_id, periodo, monto_esperado, estado)
           VALUES ($1, $2, $3, 30000, 'POR_EMITIR')`, [e.organizacion_id, e.id, periodo]),
        /duplicate key|unique/i,
        'la base permitió dos cobros sin emitir del mismo mes');
    });
  });
});
