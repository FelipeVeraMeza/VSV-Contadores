// Verifica que la identidad del documento en los comprobantes funciona.
//
// Cada caso reproduce una colisión real que el criterio anterior (buscar el
// folio como texto dentro de la glosa) no distinguía. Los comprobantes de
// prueba se marcan en `contabilizado_por` y se borran al terminar.
//
// Uso:  node src/DatabaseThings/migrations/verificar_2026-07-21_comprobantes.mjs

import { pool } from '../../database/db.js';
import {
    upsertComprobante,
    construirGlosa,
    eliminarComprobanteDeDocumento,
} from '../../utils/comprobantes.js';

const MARCA = 'VERIFICACION-AUTOMATICA';
let pass = 0, fail = 0;

const check = (nombre, condicion, detalle = '') => {
    if (condicion) { pass++; console.log(`  ✅ ${nombre}`); }
    else { fail++; console.log(`  ❌ ${nombre} ${detalle}`); }
};

const LINEAS = [
    { cuenta: '1104-01', debe: 11900, haber: 0 },
    { cuenta: '5101-01', debe: 0, haber: 11900 },
];

let empresaId;

const contabilizar = async (documento) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const resultado = await upsertComprobante(client, {
            empresaId,
            lineas: LINEAS,
            usuario: { nombre: MARCA },
            glosa: construirGlosa(documento),
            ...documento,
        });
        await client.query('COMMIT');
        return resultado;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

const contarDePrueba = async () => {
    const { rows: [{ n }] } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM comprobantes WHERE contabilizado_por = $1`, [MARCA]);
    return n;
};

const limpiar = async () => {
    const { rowCount } = await pool.query(
        `DELETE FROM comprobantes WHERE contabilizado_por = $1`, [MARCA]);
    return rowCount;
};

try {
    const { rows: [empresa] } = await pool.query(`SELECT id FROM empresa ORDER BY created_at LIMIT 1`);
    if (!empresa) throw new Error('No hay ninguna empresa en la base para correr la verificación.');
    empresaId = empresa.id;

    // Arrastre de una corrida anterior interrumpida.
    await limpiar();

    console.log('\n── 1. Factura de 2025 y nota de crédito de 2026 con el MISMO folio ──');
    const factura = { clase: 'venta', tipoDte: 33, folio: 100, rutContraparte: '77397024-6', fecha: '2025-06-15' };
    const notaCredito = { clase: 'venta', tipoDte: 61, folio: 100, rutContraparte: '77397024-6', fecha: '2026-06-15',
                          refFolio: 100, refTipoDte: 33 };
    const rFactura = await contabilizar(factura);
    const rNota = await contabilizar(notaCredito);
    check('son dos comprobantes distintos', rFactura.id !== rNota.id);
    check('ninguno pisó al otro', rFactura.accion === 'creado' && rNota.accion === 'creado',
          `(${rFactura.accion}/${rNota.accion})`);
    check('tienen correlativos distintos', rFactura.numero !== rNota.numero);

    const { rows: [nota] } = await pool.query(
        `SELECT tipo, glosa, ref_folio, ref_tipo_dte FROM comprobantes WHERE id = $1`, [rNota.id]);
    check('la nota de crédito queda como TRASPASO', nota.tipo === 'TRASPASO', `(tipo=${nota.tipo})`);
    check('guarda a qué documento afecta',
          Number(nota.ref_folio) === 100 && Number(nota.ref_tipo_dte) === 33);
    check('la glosa dice a cuál pertenece', nota.glosa.includes('afecta Factura #100'),
          `\n     glosa: "${nota.glosa}"`);

    console.log('\n── 2. Recontabilizar el mismo documento actualiza, no duplica ──');
    const antes = await contarDePrueba();
    const reintento = await contabilizar(factura);
    check('reusa el mismo comprobante', reintento.id === rFactura.id);
    check('lo marca como actualizado', reintento.accion === 'actualizado', `(${reintento.accion})`);
    check('no creó filas nuevas', await contarDePrueba() === antes);

    console.log('\n── 3. El folio 1 ya no arrastra al 190600 (colisión por prefijo) ──');
    const folioUno = { clase: 'compra', tipoDte: 33, folio: 1, rutContraparte: '78306207-0', fecha: '2025-11-28' };
    const folioLargo = { clase: 'compra', tipoDte: 33, folio: 190600, rutContraparte: '77098227-8', fecha: '2025-12-13' };
    const rLargo = await contabilizar(folioLargo);
    const rUno = await contabilizar(folioUno);
    check('quedan separados', rLargo.id !== rUno.id);
    check('contabilizar el folio 1 no tocó al 190600',
          rLargo.accion === 'creado' && rUno.accion === 'creado');

    console.log('\n── 4. Mismo folio, distinto proveedor ──');
    const provA = { clase: 'compra', tipoDte: 33, folio: 500, rutContraparte: '76022832-K', fecha: '2026-01-10' };
    const provB = { clase: 'compra', tipoDte: 33, folio: 500, rutContraparte: '96786230-4', fecha: '2026-01-10' };
    const rProvA = await contabilizar(provA);
    const rProvB = await contabilizar(provB);
    check('no colisionan entre proveedores', rProvA.id !== rProvB.id && rProvB.accion === 'creado');

    console.log('\n── 5. El RUT se normaliza: "783062070" y "78306207-0" son el mismo ──');
    const rSinGuion = await contabilizar({ ...folioUno, rutContraparte: '783062070' });
    check('reconoce el documento pese al formato del RUT', rSinGuion.id === rUno.id, `(${rSinGuion.accion})`);

    console.log('\n── 6. Venta y compra del mismo folio no se mezclan ──');
    const venta = { clase: 'venta', tipoDte: 33, folio: 777, rutContraparte: '77397024-6', fecha: '2026-02-01' };
    const compra = { clase: 'compra', tipoDte: 33, folio: 777, rutContraparte: '77397024-6', fecha: '2026-02-01' };
    const rVenta = await contabilizar(venta);
    const rCompra = await contabilizar(compra);
    check('quedan separadas', rVenta.id !== rCompra.id && rCompra.accion === 'creado');

    console.log('\n── 7. Borrar un documento borra SOLO su comprobante ──');
    const totalAntes = await contarDePrueba();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        var borrados = await eliminarComprobanteDeDocumento(client, {
            empresaId, clase: 'compra', tipoDte: 33, folio: 1, rutContraparte: '78306207-0',
        });
        await client.query('COMMIT');
    } finally {
        client.release();
    }
    check('borró exactamente 1 comprobante', borrados === 1, `(borró ${borrados})`);
    check('los demás siguen ahí', await contarDePrueba() === totalAntes - 1);

    console.log('\n── 8. Asiento manual: respeta el tipo elegido y nunca deduplica ──');
    const manualA = await contabilizar({ clase: 'traspaso', tipoExplicito: 'ingreso', folio: null, fecha: '2026-03-01' });
    const manualB = await contabilizar({ clase: 'traspaso', tipoExplicito: 'ingreso', folio: null, fecha: '2026-03-01' });
    check('dos asientos manuales idénticos NO se pisan', manualA.id !== manualB.id);
    const { rows: [manual] } = await pool.query(`SELECT tipo FROM comprobantes WHERE id = $1`, [manualA.id]);
    check('conserva el tipo elegido a mano', manual.tipo === 'INGRESO', `(tipo=${manual.tipo})`);

    console.log('\n── 9. Conciliación bancaria: una por fecha, sin acumular ──');
    const concilia = (fecha) => contabilizar({
        clase: 'conciliacion', tipoExplicito: 'traspaso', folio: fecha.replace(/\D/g, ''), fecha,
    });
    const c1 = await concilia('2026-03-15');
    const c2 = await concilia('2026-03-15');
    const c3 = await concilia('2026-03-16');
    check('rehacer la del mismo día actualiza', c2.id === c1.id && c2.accion === 'actualizado');
    check('otra fecha es un asiento propio', c3.id !== c1.id && c3.accion === 'creado');

    console.log('\n── 10. El índice único bloquea el duplicado a nivel de motor ──');
    try {
        await pool.query(
            `INSERT INTO comprobantes (id, empresa_id, numero_comprobante, fecha, tipo, glosa, estado,
                    clase, tipo_dte, folio, rut_contraparte, contabilizado_por)
             VALUES (gen_random_uuid(), $1, 999999, '2025-06-15', 'INGRESO', 'duplicado forzado',
                    'Contabilizado', 'venta', 33, 100, '77397024-6', $2)`,
            [empresaId, MARCA]);
        check('rechaza el duplicado', false, '(el INSERT pasó y no debía)');
    } catch (error) {
        check('rechaza el duplicado', error.code === '23505', `(código ${error.code})`);
    }

} catch (error) {
    fail++;
    console.error('\n❌ Error durante la verificación:', error.message);
} finally {
    const borrados = await limpiar();
    console.log(`\n🧹 ${borrados} comprobantes de prueba eliminados.`);
    const { rows: [{ n }] } = await pool.query(`SELECT COUNT(*)::int AS n FROM comprobantes`);
    console.log(`   Comprobantes reales en la tabla: ${n}`);
    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} verificaciones pasaron, ${fail} fallaron`);
    await pool.end();
    process.exitCode = fail === 0 ? 0 : 1;
}
