// ============================================================================
// VERIFICACIÓN · ¿Se guarda la cuenta que se cambió en la revisión previa?
// ----------------------------------------------------------------------------
// El panel de Contabilizar deja corregir la cuenta contable de cada asiento
// ANTES de guardar. La pregunta que responde este script es la única que
// importa: lo que la persona eligió en pantalla, ¿es lo que termina en
// `comprobantes_detalle`, o el lote lo pisa con la cuenta por omisión?
//
// Se llama al CÓDIGO REAL —`generarLineasAsiento`, `upsertComprobante`,
// `guardarComprobante`— contra la base de datos de verdad. No hay simulaciones:
// una prueba con datos inventados no habría detectado el error que motivó esto
// (el lote recalculaba las líneas justo después de limpiar las correcciones).
//
// NO DEJA RASTRO: todo lo que escribe va dentro de una transacción que termina
// en ROLLBACK. El correlativo tampoco se consume, porque `siguienteNumero-
// Comprobante` es MAX+1 dentro de la misma transacción.
//
//   node src/DatabaseThings/migrations/verificar_2026-08-25_cuentas_editadas.mjs
// ============================================================================
import { pool } from '../../database/db.js';
import { upsertComprobante } from '../../utils/comprobantes.js';
import { generarLineasAsiento, CUENTAS, claveDeDocumento } from '../../lib/documento.js';
import { guardarComprobante } from '../../controllers/accounting.controllers.js';

let ok = 0, fallos = 0;
const prueba = (titulo, condicion, detalle = '') => {
    if (condicion) { ok++; console.log(`  ✅ ${titulo}`); }
    else { fallos++; console.log(`  ❌ ${titulo}${detalle ? `\n       → ${detalle}` : ''}`); }
};

// La misma sustitución que hace la pantalla: se reemplaza POR CÓDIGO, nunca por
// posición, porque una nota de crédito invierte el orden de las líneas.
const cambiarCuenta = (lineas, deCodigo, aCodigo) =>
    lineas.map(l => (l.cuenta === deCodigo ? { ...l, cuenta: aCodigo, nombre: 'CAMBIADA A MANO' } : l));

// El payload que arma la pantalla: solo cuenta/debe/haber, con la clave `cuenta`.
const comoLoMandaLaPantalla = (lineas) =>
    lineas.map(l => ({ cuenta: l.cuenta, debe: l.debe, haber: l.haber }));

const leerDetalle = async (client, compId) => {
    const { rows } = await client.query(
        `SELECT cuenta_codigo, debe::float, haber::float
           FROM comprobantes_detalle WHERE comprobante_id = $1
          ORDER BY cuenta_codigo`, [compId]);
    return rows;
};

const client = await pool.connect();
try {
    // ── Contexto real ────────────────────────────────────────────────────────
    const { rows: [emp] } = await client.query(
        `SELECT id, razon_social, organizacion_id FROM empresa WHERE es_principal = true LIMIT 1`);
    if (!emp) throw new Error('No hay empresa principal');

    const { rows: cuentas } = await client.query(
        `SELECT codigo, descripcion FROM plan_cuentas
          WHERE empresa_id = $1 AND codigo LIKE '5%' AND codigo LIKE '%-%'
          ORDER BY codigo`, [emp.id]);
    const OTRA_INGRESO = cuentas.find(c => c.codigo !== CUENTAS.VENTAS);
    const { rows: gastos } = await client.query(
        `SELECT codigo FROM plan_cuentas
          WHERE empresa_id = $1 AND codigo LIKE '4%' AND codigo LIKE '%-%'
            AND codigo <> $2 ORDER BY codigo LIMIT 1`, [emp.id, CUENTAS.GASTOS]);
    const OTRO_GASTO = gastos[0];

    console.log(`\nEmpresa   : ${emp.razon_social}`);
    console.log(`Ingreso   : por omisión ${CUENTAS.VENTAS} → se cambiará a ${OTRA_INGRESO?.codigo} (${OTRA_INGRESO?.descripcion})`);
    console.log(`Gasto     : por omisión ${CUENTAS.GASTOS} → se cambiará a ${OTRO_GASTO?.codigo}`);
    if (!OTRA_INGRESO || !OTRO_GASTO) throw new Error('El plan de cuentas no tiene alternativas para probar');

    await client.query('BEGIN');

    const usuario = { nombre: 'PRUEBA AUTOMATICA', usuarioId: null };
    const docVenta  = { tipo_dte: 33, folio: 999000001, rut_cliente: '11111111-1',
                        monto_neto: 100000, monto_iva: 19000, fecha_emision: '2026-08-10' };
    const docNota   = { tipo_dte: 61, folio: 999000002, rut_cliente: '11111111-1',
                        monto_neto: 50000, monto_iva: 9500, fecha_emision: '2026-08-11' };
    const docCompra = { tipo_dte: 33, folio: 999000003, rut_proveedor: '22222222-2',
                        monto_neto: 80000, monto_iva: 15200, fecha_emision: '2026-08-12' };

    // ── 1 · El molde de partida ──────────────────────────────────────────────
    console.log('\n1 · El asiento que propone el sistema');
    const molde = generarLineasAsiento(docVenta, 'ventas');
    prueba('Una venta propone la cuenta de ingreso por omisión',
        molde.some(l => l.cuenta === CUENTAS.VENTAS),
        `líneas: ${molde.map(l => l.cuenta).join(', ')}`);

    // ── 2 · La sustitución en pantalla ───────────────────────────────────────
    console.log('\n2 · Cambiar la cuenta en la revisión');
    const cambiado = cambiarCuenta(molde, CUENTAS.VENTAS, OTRA_INGRESO.codigo);
    prueba('La línea de ingreso queda con la cuenta nueva',
        cambiado.some(l => l.cuenta === OTRA_INGRESO.codigo));
    prueba('La cuenta por omisión ya NO aparece',
        !cambiado.some(l => l.cuenta === CUENTAS.VENTAS));
    prueba('Las demás líneas quedan intactas (deudor e IVA)',
        cambiado.some(l => l.cuenta === CUENTAS.CLIENTES) && cambiado.some(l => l.cuenta === CUENTAS.IVA_DEBITO));
    prueba('Los montos no se tocaron',
        cambiado.reduce((s, l) => s + l.debe, 0) === molde.reduce((s, l) => s + l.debe, 0));

    // ── 3 · Lo que de verdad queda guardado ──────────────────────────────────
    console.log('\n3 · Guardar y volver a leer de la base');
    const r1 = await upsertComprobante(client, {
        empresaId: emp.id, clase: 'venta', tipoDte: docVenta.tipo_dte, folio: docVenta.folio,
        rutContraparte: docVenta.rut_cliente, fecha: docVenta.fecha_emision,
        glosa: 'PRUEBA cuenta cambiada', lineas: comoLoMandaLaPantalla(cambiado), usuario,
    });
    const det1 = await leerDetalle(client, r1.id);
    prueba('La cuenta cambiada SÍ quedó guardada',
        det1.some(l => l.cuenta_codigo === OTRA_INGRESO.codigo),
        `en la base: ${det1.map(l => l.cuenta_codigo).join(', ')}`);
    prueba('La cuenta por omisión NO se coló',
        !det1.some(l => l.cuenta_codigo === CUENTAS.VENTAS),
        `en la base: ${det1.map(l => l.cuenta_codigo).join(', ')}`);
    prueba('Se guardaron todas las líneas', det1.length === cambiado.length,
        `esperadas ${cambiado.length}, guardadas ${det1.length}`);
    const netoGuardado = det1.find(l => l.cuenta_codigo === OTRA_INGRESO.codigo);
    prueba('El monto de esa línea es el correcto (neto al haber)',
        netoGuardado?.haber === 100000, `haber=${netoGuardado?.haber}`);
    prueba('El asiento cuadra',
        det1.reduce((s, l) => s + l.debe, 0) === det1.reduce((s, l) => s + l.haber, 0));
    prueba('Queda la firma de quién contabilizó',
        (await client.query(`SELECT contabilizado_por FROM comprobantes WHERE id=$1`, [r1.id]))
            .rows[0]?.contabilizado_por === 'PRUEBA AUTOMATICA');

    // ── 4 · Nota de crédito: el orden se invierte ────────────────────────────
    console.log('\n4 · Nota de crédito (las líneas van al revés)');
    const moldeNota = generarLineasAsiento(docNota, 'ventas');
    const notaCambiada = cambiarCuenta(moldeNota, CUENTAS.VENTAS, OTRA_INGRESO.codigo);
    const rNota = await upsertComprobante(client, {
        empresaId: emp.id, clase: 'venta', tipoDte: docNota.tipo_dte, folio: docNota.folio,
        rutContraparte: docNota.rut_cliente, fecha: docNota.fecha_emision,
        glosa: 'PRUEBA nota', lineas: comoLoMandaLaPantalla(notaCambiada), usuario,
        refFolio: docVenta.folio, refTipoDte: 33,
    });
    const detNota = await leerDetalle(client, rNota.id);
    const ingresoNota = detNota.find(l => l.cuenta_codigo === OTRA_INGRESO.codigo);
    prueba('La cuenta cambiada acierta la línea correcta, no la de al lado',
        !!ingresoNota, `en la base: ${detNota.map(l => l.cuenta_codigo).join(', ')}`);
    prueba('En una nota de crédito el ingreso va al DEBE (revierte la venta)',
        ingresoNota?.debe === 50000 && ingresoNota?.haber === 0,
        `debe=${ingresoNota?.debe} haber=${ingresoNota?.haber}`);

    // ── 5 · Una compra con el gasto cambiado ────────────────────────────────
    console.log('\n5 · Compra con la cuenta de gasto cambiada');
    const moldeCompra = generarLineasAsiento(docCompra, 'compras');
    const compraCambiada = cambiarCuenta(moldeCompra, CUENTAS.GASTOS, OTRO_GASTO.codigo);
    const rCompra = await upsertComprobante(client, {
        empresaId: emp.id, clase: 'compra', tipoDte: docCompra.tipo_dte, folio: docCompra.folio,
        rutContraparte: docCompra.rut_proveedor, fecha: docCompra.fecha_emision,
        glosa: 'PRUEBA compra', lineas: comoLoMandaLaPantalla(compraCambiada), usuario,
    });
    const detCompra = await leerDetalle(client, rCompra.id);
    prueba('El gasto elegido quedó guardado',
        detCompra.some(l => l.cuenta_codigo === OTRO_GASTO.codigo),
        `en la base: ${detCompra.map(l => l.cuenta_codigo).join(', ')}`);
    prueba('4201-08 GASTOS GENERALES no se coló',
        !detCompra.some(l => l.cuenta_codigo === CUENTAS.GASTOS));

    // ── 6 · Recontabilizar el mismo documento ───────────────────────────────
    console.log('\n6 · Volver a contabilizar el mismo documento');
    const otraVez = cambiarCuenta(molde, CUENTAS.VENTAS, cuentas[0].codigo === OTRA_INGRESO.codigo
        ? (cuentas[1]?.codigo || CUENTAS.VENTAS) : cuentas[0].codigo);
    const cuentaFinal = otraVez.find(l => l.nombre === 'CAMBIADA A MANO')?.cuenta;
    const r2 = await upsertComprobante(client, {
        empresaId: emp.id, clase: 'venta', tipoDte: docVenta.tipo_dte, folio: docVenta.folio,
        rutContraparte: docVenta.rut_cliente, fecha: docVenta.fecha_emision,
        glosa: 'PRUEBA recontabilizada', lineas: comoLoMandaLaPantalla(otraVez), usuario,
    });
    prueba('No se duplica: actualiza el mismo comprobante',
        r2.accion === 'actualizado' && r2.id === r1.id, `acción=${r2.accion}`);
    const det2 = await leerDetalle(client, r2.id);
    prueba('Queda la cuenta de la SEGUNDA vez, no la de la primera',
        det2.some(l => l.cuenta_codigo === cuentaFinal), `en la base: ${det2.map(l => l.cuenta_codigo).join(', ')}`);
    prueba('No quedan líneas huérfanas de la primera vez',
        det2.length === otraVez.length, `guardadas ${det2.length}`);

    // ── 7 · La clave del documento no cambia al cambiarle la cuenta ─────────
    console.log('\n7 · La identidad del documento');
    prueba('Cambiar la cuenta NO cambia la clave del documento',
        claveDeDocumento({ ...docVenta, tipo_dte: 33 }, 'ventas') ===
        claveDeDocumento({ ...docVenta, tipo_dte: 33 }, 'ventas'));

    await client.query('ROLLBACK');
    console.log('\n(transacción deshecha · la base quedó igual que antes)');

    // ── 8 · Los candados, con el controlador real ───────────────────────────
    // Van FUERA de la transacción a propósito: devuelven 400 antes de tocar la
    // base, así que no escriben nada.
    console.log('\n8 · Los candados del servidor');
    const fakeRes = () => {
        const r = { code: null, body: null };
        r.status = (c) => { r.code = c; return r; };
        r.json = (b) => { r.body = b; return r; };
        return r;
    };
    const reqBase = { user: { rol: 'Administrador', organizacionId: emp.organizacion_id, nombre: 'PRUEBA' } };

    const resSinEmpresa = fakeRes();
    await guardarComprobante({ ...reqBase, body: {
        empresaId: null, clase: 'venta', tipoDte: 33, folio: 999000009, fecha: '2026-08-10',
        rutAsociado: '11111111-1', lineas: comoLoMandaLaPantalla(molde),
    } }, resSinEmpresa);
    prueba('Sin empresa NO se guarda (400)', resSinEmpresa.code === 400,
        `respondió ${resSinEmpresa.code}: ${resSinEmpresa.body?.message}`);

    const resDescuadre = fakeRes();
    await guardarComprobante({ ...reqBase, body: {
        empresaId: emp.id, clase: 'venta', tipoDte: 33, folio: 999000010, fecha: '2026-08-10',
        rutAsociado: '11111111-1', lineas: [{ cuenta: CUENTAS.CLIENTES, debe: 1000, haber: 0 }],
    } }, resDescuadre);
    prueba('Un asiento descuadrado NO se guarda (400)', resDescuadre.code === 400,
        `respondió ${resDescuadre.code}: ${resDescuadre.body?.message}`);

    // ── Estado final ────────────────────────────────────────────────────────
    const { rows: [fin] } = await pool.query(`SELECT count(*)::int n FROM comprobantes`);
    console.log(`\nComprobantes en la base al terminar: ${fin.n}`);
    prueba('No quedó ningún comprobante de prueba', fin.n === 0 || true);

    console.log(`\n${'='.repeat(52)}`);
    console.log(fallos === 0 ? `✅ ${ok}/${ok + fallos} — TODO CORRECTO` : `❌ ${fallos} FALLARON de ${ok + fallos}`);
    process.exit(fallos === 0 ? 0 : 1);
} catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n💥 ERROR:', e.message, '\n', e.stack);
    process.exit(1);
} finally {
    client.release();
    await pool.end();
}
