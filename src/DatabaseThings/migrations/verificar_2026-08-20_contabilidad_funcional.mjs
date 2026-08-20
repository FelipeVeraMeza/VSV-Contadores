/**
 * =============================================================================
 * Verificación FUNCIONAL del módulo de Contabilidad
 * =============================================================================
 *
 * QUÉ PRUEBA — y en qué se diferencia de las otras dos
 *
 *   verificar_..._aislamiento_contabilidad  → ¿se cruza la información?
 *   verificar_..._flujo_victor_crea_cliente → ¿el que empieza de cero puede trabajar?
 *   ESTE                                    → ¿el módulo hace bien su trabajo?
 *
 * Recorre el ciclo contable completo sobre una empresa de prueba: crear cuentas,
 * registrar una compra y una venta, contabilizarlas, cobrar y pagar por caja,
 * mirar el Libro Mayor y el Balance, y deshacerlo todo. Comprueba además que la
 * CONTABILIDAD CUADRE, que es lo único que de verdad dice si el módulo sirve:
 * un balance descuadrado se ve igual de bien en pantalla que uno correcto.
 *
 * CÓMO SE USA
 *     node src/DatabaseThings/migrations/verificar_2026-08-20_contabilidad_funcional.mjs
 *
 * ⚠️ ESCRIBE datos reales y los borra al terminar, pase lo que pase. Al final
 * informa si quedó algún residuo. No levanta el servidor.
 * =============================================================================
 */
import 'dotenv/config';
import { pool } from '../../database/db.js';
import * as acc from '../../controllers/accounting.controllers.js';
import * as caja from '../../controllers/caja.controllers.js';
import { crearEmpresaCRM, eliminarEmpresaCRM } from '../../controllers/clientes.controllers.js';
import {
    crearMovimientoManual, consultarHistorialBunkerController,
    consultarComprasBunkerController, eliminarMovimiento,
} from '../../controllers/dteConsulta.controllers.js';

const RUT_PRUEBA    = '77111222-6';
const NOMBRE_PRUEBA = 'PRUEBA CONTABILIDAD — BORRAR SI QUEDA';

const llamar = (h, user, { query = {}, body = {}, params = {} } = {}) =>
    new Promise((resolve) => {
        const req = { user, query, body, params, header: () => null };
        const res = {
            statusCode: 200,
            status(c) { this.statusCode = c; return this; },
            json(p) { resolve({ status: this.statusCode, payload: p }); return this; },
            send(p) { resolve({ status: this.statusCode, payload: p }); return this; },
            setHeader() { return this; },
        };
        Promise.resolve(h(req, res)).catch(e => resolve({ status: 500, payload: { error: e.message } }));
    });

const filas = [];
let bloque = '';
const seccion = (t) => { bloque = t; console.log(`\n──────── ${t} ────────`); };
const check = (nombre, ok, detalle = '') => {
    filas.push({ bloque, prueba: nombre, r: ok ? '✅' : '❌', detalle });
    console.log(`${ok ? '✅' : '❌'} ${nombre}${detalle ? ` · ${detalle}` : ''}`);
    return ok;
};
const clp = (n) => '$' + Number(n || 0).toLocaleString('es-CL');

let empresaId = null;
const creado = { cuentas: [], comprobantes: [], movsCaja: [], docs: [] };

const main = async () => {
    // Un administrador de planta: acá se prueba la funcionalidad, no el candado.
    const { rows: [u] } = await pool.query(
        `SELECT id, nombre, rol, organizacion_id FROM usuario
          WHERE activo = true AND ve_solo_empresas_asignadas = false
            AND rol = 'Administrador' LIMIT 1`);
    if (!u) { console.log('⚠️ No hay un administrador de planta con quien probar.'); return; }
    const USER = { usuarioId: u.id, nombre: u.nombre, rol: u.rol, organizacionId: u.organizacion_id,
                   veSoloEmpresasAsignadas: false };

    console.log('\n═══════ CONTABILIDAD · VERIFICACIÓN FUNCIONAL ═══════');
    console.log(`Fecha   : ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`);
    console.log(`Usuario : ${USER.nombre}`);

    // ── 0 · Empresa de prueba ────────────────────────────────────────────────
    seccion('0 · Preparar una empresa de prueba');
    const alta = await llamar(crearEmpresaCRM, USER, {
        body: { razonSocial: NOMBRE_PRUEBA, rut: RUT_PRUEBA, giro: 'PRUEBA' } });
    empresaId = alta.payload?.empresaId || alta.payload?.id;
    if (!empresaId) {
        const { rows } = await pool.query(`SELECT id FROM empresa WHERE razon_social = $1`, [NOMBRE_PRUEBA]);
        empresaId = rows[0]?.id;
    }
    if (!check('la empresa de prueba se crea', !!empresaId, `HTTP ${alta.status}`)) return;

    // ── 1 · Plan de cuentas · crear, listar, editar, borrar ──────────────────
    seccion('1 · Plan de cuentas (ABM)');
    const cuentasNuevas = [
        { codigo: '1901', descripcion: 'Caja prueba',          tipo_cuenta: 'ACTIVO' },
        { codigo: '2901', descripcion: 'Proveedores prueba',   tipo_cuenta: 'PASIVO' },
        { codigo: '4901', descripcion: 'Gasto prueba',         tipo_cuenta: 'GASTO'  },
        { codigo: '5901', descripcion: 'Ingreso prueba',       tipo_cuenta: 'INGRESO'},
    ];
    for (const c of cuentasNuevas) {
        const r = await llamar(acc.crearCuenta, USER, { body: { ...c, empresaId } });
        const id = r.payload?.cuenta?.id;
        if (id) creado.cuentas.push(id);
        check(`crear cuenta ${c.codigo}`, r.status === 201 && !!id, `HTTP ${r.status}`);
    }

    const plan = await llamar(acc.getChartOfAccounts, USER, { query: { empresaId } });
    const codigos = (plan.payload?.plan || []).map(c => c.codigo);
    check('el plan de cuentas devuelve las 4 recién creadas',
        cuentasNuevas.every(c => codigos.includes(c.codigo)),
        `${plan.payload?.plan?.length ?? 0} cuentas en total`);

    const dup = await llamar(acc.crearCuenta, USER, { body: { ...cuentasNuevas[0], empresaId } });
    check('rechaza un código duplicado', dup.status === 409, `HTTP ${dup.status}`);

    if (creado.cuentas[0]) {
        const ed = await llamar(acc.editarCuenta, USER,
            { params: { id: creado.cuentas[0] }, body: { descripcion: 'Caja prueba editada' } });
        check('editar una cuenta', ed.status === 200 &&
            ed.payload?.cuenta?.descripcion === 'CAJA PRUEBA EDITADA', `HTTP ${ed.status}`);
    }

    // ── 2 · Compras y ventas · registrar documentos ──────────────────────────
    seccion('2 · Registrar una compra y una venta');
    // `crearMovimientoManual` deduce los montos DESDE las líneas (no acepta
    // neto/iva/total sueltos), y detecta el IVA por el nombre de la cuenta.
    const venta = await llamar(crearMovimientoManual, USER, { body: {
        empresa_id: empresaId, tipo_movimiento: 'ventas', rut: '76543210-9',
        nombre: 'CLIENTE DE PRUEBA', tipo_documento: '33', folio: 900001,
        fecha: '2026-08-01', lineas: [
            { numero_cuenta: '1901', nombre_cuenta: 'Caja prueba',        debe: 119000, haber: 0 },
            { numero_cuenta: '5901', nombre_cuenta: 'Ingreso prueba',     debe: 0, haber: 100000 },
            { numero_cuenta: '2901', nombre_cuenta: 'IVA débito prueba',  debe: 0, haber: 19000 },
        ],
    }});
    check('registrar una venta (factura 900001)', venta.status < 400, `HTTP ${venta.status}`);

    const compra = await llamar(crearMovimientoManual, USER, { body: {
        empresa_id: empresaId, tipo_movimiento: 'compras', rut: '76111111-1',
        nombre: 'PROVEEDOR DE PRUEBA', tipo_documento: '33', folio: 800001,
        fecha: '2026-08-02', lineas: [
            { numero_cuenta: '4901', nombre_cuenta: 'Gasto prueba',        debe: 50000, haber: 0 },
            { numero_cuenta: '1901', nombre_cuenta: 'IVA crédito prueba',  debe: 9500,  haber: 0 },
            { numero_cuenta: '2901', nombre_cuenta: 'Proveedores prueba',  debe: 0, haber: 59500 },
        ],
    }});
    check('registrar una compra (factura 800001)', compra.status < 400, `HTTP ${compra.status}`);

    const libroV = await llamar(consultarHistorialBunkerController, USER, { query: { empresa_id: empresaId } });
    const libroC = await llamar(consultarComprasBunkerController,  USER, { query: { empresa_id: empresaId } });
    const docsV = libroV.payload?.documentos || [];
    const docsC = libroC.payload?.documentos || [];
    creado.docs = [...docsV.map(d => ({ id: d.id, tipo: 'ventas' })), ...docsC.map(d => ({ id: d.id, tipo: 'compras' }))];
    check('la venta aparece en el libro de ventas',  docsV.some(d => Number(d.folio) === 900001), `${docsV.length} docs`);
    check('la compra aparece en el libro de compras', docsC.some(d => Number(d.folio) === 800001), `${docsC.length} docs`);
    check('los montos se guardaron intactos',
        docsV.some(d => Number(d.folio) === 900001 && Number(d.monto_total) === 119000),
        'venta = ' + clp(docsV.find(d => Number(d.folio) === 900001)?.monto_total));

    // ── 3 · Contabilizar (comprobantes) ─────────────────────────────────────
    seccion('3 · Contabilizar los documentos');
    const asientoVenta = await llamar(acc.guardarComprobante, USER, { body: {
        empresaId, clase: 'venta', tipoDte: 33, folio: 900001, rutAsociado: '76543210-9',
        fecha: '2026-08-01', lineas: [
            { cuenta: '1901', debe: 119000, haber: 0 },
            { cuenta: '5901', debe: 0, haber: 100000 },
            { cuenta: '2901', debe: 0, haber: 19000 },
        ],
    }});
    if (asientoVenta.payload?.comprobanteId) creado.comprobantes.push(asientoVenta.payload.comprobanteId);
    check('contabilizar la venta', asientoVenta.status === 200 && !!asientoVenta.payload?.comprobanteId,
        `Nº ${asientoVenta.payload?.numero ?? '—'}`);

    const descuadrado = await llamar(acc.guardarComprobante, USER, { body: {
        empresaId, clase: 'compra', tipoDte: 33, folio: 800001, fecha: '2026-08-02',
        lineas: [{ cuenta: '4901', debe: 50000, haber: 0 },
                 { cuenta: '2901', debe: 0, haber: 40000 }],
    }});
    check('RECHAZA un asiento descuadrado (debe ≠ haber)', descuadrado.status === 400,
        `HTTP ${descuadrado.status}`);

    const asientoCompra = await llamar(acc.guardarComprobante, USER, { body: {
        empresaId, clase: 'compra', tipoDte: 33, folio: 800001, rutAsociado: '76111111-1',
        fecha: '2026-08-02', lineas: [
            { cuenta: '4901', debe: 50000, haber: 0 },
            { cuenta: '1901', debe: 9500,  haber: 0 },
            { cuenta: '2901', debe: 0, haber: 59500 },
        ],
    }});
    if (asientoCompra.payload?.comprobanteId) creado.comprobantes.push(asientoCompra.payload.comprobanteId);
    check('contabilizar la compra', asientoCompra.status === 200, `HTTP ${asientoCompra.status}`);

    const nota = await llamar(acc.guardarComprobante, USER, { body: {
        empresaId, clase: 'venta', tipoDte: 61, folio: 900002, fecha: '2026-08-03',
        lineas: [{ cuenta: '5901', debe: 10000, haber: 0 },
                 { cuenta: '1901', debe: 0, haber: 10000 }],
    }});
    check('RECHAZA una nota de crédito sin documento afectado', nota.status === 400, `HTTP ${nota.status}`);

    const comps = await llamar(acc.getComprobantes, USER, { query: { empresaId } });
    const listaComp = comps.payload?.comprobantes || [];
    check('los comprobantes se listan', listaComp.length === 2, `${listaComp.length} comprobantes`);
    check('cada comprobante trae sus líneas',
        listaComp.every(c => Array.isArray(c.lineas) && c.lineas.length >= 2),
        listaComp.map(c => `Nº${c.numero_comprobante}:${c.lineas?.length}L`).join(' '));
    check('la numeración es correlativa y sin repetidos',
        new Set(listaComp.map(c => c.numero_comprobante)).size === listaComp.length);

    // ── 4 · Caja · cobrar y pagar ───────────────────────────────────────────
    seccion('4 · Caja (recaudaciones y pagos)');
    const cobro = await llamar(caja.crearMovimientoCaja, USER, { body: {
        empresaId, tipo: 'recaudacion', fecha: '2026-08-05', rut: '76543210-9',
        nombre: 'CLIENTE DE PRUEBA', folio_asociado: '900001', monto: 119000, medio_pago: 'transferencia',
    }});
    if (cobro.payload?.movimiento?.id) creado.movsCaja.push(cobro.payload.movimiento.id);
    check('registrar una recaudación', cobro.status === 200 && !!cobro.payload?.movimiento?.id, `HTTP ${cobro.status}`);
    check('la recaudación genera su asiento contable', !!cobro.payload?.movimiento?.comprobante_id,
        cobro.payload?.movimiento?.comprobante_id ? 'con comprobante' : 'SIN comprobante');

    const pago = await llamar(caja.crearMovimientoCaja, USER, { body: {
        empresaId, tipo: 'pago', fecha: '2026-08-06', rut: '76111111-1',
        nombre: 'PROVEEDOR DE PRUEBA', folio_asociado: '800001', monto: 59500, medio_pago: 'transferencia',
    }});
    if (pago.payload?.movimiento?.id) creado.movsCaja.push(pago.payload.movimiento.id);
    check('registrar un pago', pago.status === 200, `HTTP ${pago.status}`);

    const lista = await llamar(caja.listarMovimientosCaja, USER, { query: { empresaId } });
    check('los movimientos de caja se listan', (lista.payload?.movimientos || []).length === 2,
        `${lista.payload?.movimientos?.length ?? 0} movimientos`);

    const montoMalo = await llamar(caja.crearMovimientoCaja, USER, { body: {
        empresaId, tipo: 'recaudacion', monto: 0 } });
    check('RECHAZA un movimiento con monto 0', montoMalo.status === 400, `HTTP ${montoMalo.status}`);

    if (creado.movsCaja[0]) {
        const edit = await llamar(caja.editarMovimientoCaja, USER, {
            params: { id: creado.movsCaja[0] }, body: { medio_pago: 'efectivo' } });
        check('editar un movimiento regenera su asiento',
            edit.status === 200 && !!edit.payload?.movimiento?.comprobante_id, `HTTP ${edit.status}`);
    }

    // ── 5 · Balance y Libro Mayor · que CUADRE ──────────────────────────────
    seccion('5 · Balance y Libro Mayor');
    const bal = await llamar(acc.getBalance, USER, { query: { empresaId } });
    const b = bal.payload;
    check('el balance responde', bal.status === 200 && b?.ok === true, `HTTP ${bal.status}`);

    const mayor = b?.libroMayor || [];
    check('el Libro Mayor trae las cuentas movidas', mayor.length >= 4, `${mayor.length} cuentas`);

    const sumaDebe  = mayor.reduce((s, c) => s + Number(c.total_debe  || c.debe  || 0), 0);
    const sumaHaber = mayor.reduce((s, c) => s + Number(c.total_haber || c.haber || 0), 0);
    check('PARTIDA DOBLE: total debe = total haber',
        Math.abs(sumaDebe - sumaHaber) < 1, `debe ${clp(sumaDebe)} vs haber ${clp(sumaHaber)}`);

    check('el balance se declara cuadrado', b?.totales?.cuadrado === true,
        `activos ${clp(b?.balanceGeneral?.totalActivos)} · pasivos ${clp(b?.balanceGeneral?.totalPasivos)} · utilidad ${clp(b?.balanceGeneral?.utilidad)}`);
    check('ACTIVO = PASIVO + UTILIDAD',
        Math.abs(Number(b?.balanceGeneral?.totalActivos || 0)
               - (Number(b?.balanceGeneral?.totalPasivos || 0) + Number(b?.balanceGeneral?.utilidad || 0))) < 1);

    const er = b?.estadoResultados;
    check('el Estado de Resultados tiene ingresos y gastos',
        (er?.ingresos?.length || 0) > 0 && (er?.gastos?.length || 0) > 0,
        `ingresos ${clp(er?.totalIngresos)} · gastos ${clp(er?.totalGastos)}`);
    check('utilidad = ingresos − gastos',
        Math.abs(Number(er?.utilidad || 0) - (Number(er?.totalIngresos || 0) - Number(er?.totalGastos || 0))) < 1,
        `utilidad ${clp(er?.utilidad)}`);

    const balMes = await llamar(acc.getBalance, USER, { query: { empresaId, mes: '08', anio: '2026' } });
    check('el filtro por período funciona', balMes.status === 200 && (balMes.payload?.libroMayor?.length || 0) > 0,
        `${balMes.payload?.libroMayor?.length ?? 0} cuentas en 08-2026`);
    const balVacio = await llamar(acc.getBalance, USER, { query: { empresaId, mes: '01', anio: '2020' } });
    check('un período sin movimientos da un balance vacío',
        (balVacio.payload?.libroMayor?.length || 0) === 0);

    // ── 6 · Documentos afectables (notas de crédito) ────────────────────────
    seccion('6 · Documentos afectables');
    const afect = await llamar(acc.getDocumentosAfectables, USER, {
        query: { empresaId, clase: 'ventas', rut: '76543210-9', fecha: '2026-08-10' } });
    check('busca los documentos que puede afectar una nota', afect.status === 200,
        `${afect.payload?.documentos?.length ?? 0} documentos`);

    // ── 7 · Deshacer ────────────────────────────────────────────────────────
    seccion('7 · Deshacer (borrar comprobantes y movimientos)');
    if (creado.movsCaja[0]) {
        const del = await llamar(caja.eliminarMovimientoCaja, USER, { params: { id: creado.movsCaja[0] } });
        if (del.status === 200) creado.movsCaja.shift();
        check('eliminar un movimiento de caja', del.status === 200, `HTTP ${del.status}`);
    }
    if (creado.comprobantes[0]) {
        const del = await llamar(acc.eliminarComprobante, USER, { params: { id: creado.comprobantes[0] } });
        if (del.status === 200) creado.comprobantes.shift();
        check('eliminar un comprobante', del.status === 200, `HTTP ${del.status}`);
    }
    const balDespues = await llamar(acc.getBalance, USER, { query: { empresaId } });
    check('el balance sigue cuadrando después de borrar',
        balDespues.payload?.totales?.cuadrado === true);

    // ── 8 · Endpoints que devuelven datos inventados ────────────────────────
    seccion('8 · Endpoints simulados (no consultan la base)');
    const met = await llamar(acc.getAccountingMetrics, USER, { query: { empresaId } });
    check('⚠️ /accounting/metrics devuelve cifras FIJAS, no calculadas',
        met.payload?.totalActivos === 15500000,
        `activos ${clp(met.payload?.totalActivos)} para una empresa recién creada`);
    const jrn = await llamar(acc.getJournalEntries, USER, { query: { empresaId } });
    check('⚠️ /accounting/journal-entries devuelve asientos de ejemplo',
        jrn.payload?.total === 2 && jrn.payload?.asientos?.[0]?.id === 'as-001',
        'ninguna pantalla los usa hoy');
};

main()
    .catch(err => console.error('\n💥 Error en la prueba:', err.message, '\n', err.stack))
    .finally(async () => {
        seccion('LIMPIEZA');
        try {
            if (empresaId) {
                for (const id of creado.movsCaja)   await pool.query('DELETE FROM movimientos_caja WHERE id=$1', [id]).catch(() => {});
                await pool.query('DELETE FROM movimientos_caja WHERE empresa_id=$1', [empresaId]).catch(() => {});
                await pool.query(`DELETE FROM comprobantes_detalle WHERE comprobante_id IN
                                  (SELECT id FROM comprobantes WHERE empresa_id=$1)`, [empresaId]).catch(() => {});
                await pool.query('DELETE FROM comprobantes WHERE empresa_id=$1', [empresaId]).catch(() => {});
                for (const t of ['documentos_emitidos_empresa', 'documentos_recibidos_empresa',
                                 'documentos_emitidos', 'documentos_recibidos']) {
                    await pool.query(`DELETE FROM ${t} WHERE empresa_id=$1`, [empresaId]).catch(() => {});
                }
                await pool.query('DELETE FROM plan_cuentas WHERE empresa_id=$1', [empresaId]).catch(() => {});
                for (const t of ['audita', 'empresa_representante', 'empresa_plan', 'empresa_servicio', 'sucursal']) {
                    await pool.query(`DELETE FROM ${t} WHERE empresa_id=$1`, [empresaId]).catch(() => {});
                }
                await pool.query('DELETE FROM empresa WHERE id=$1', [empresaId]).catch(() => {});
            }
            // Las contrapartes se dan de alta solas al registrar un documento.
            await pool.query(`DELETE FROM empresa WHERE razon_social IN
                              ('CLIENTE DE PRUEBA','PROVEEDOR DE PRUEBA')`).catch(() => {});

            const { rows: [r] } = await pool.query(
                `SELECT count(*) FROM empresa WHERE razon_social = $1
                    OR razon_social IN ('CLIENTE DE PRUEBA','PROVEEDOR DE PRUEBA')`, [NOMBRE_PRUEBA]);
            console.log(r.count === '0' ? '✅ la base quedó como estaba'
                                        : `⚠️ QUEDARON ${r.count} filas de prueba — borrar a mano`);
        } catch (e) { console.log('⚠️ Error limpiando:', e.message); }

        const malas = filas.filter(f => f.r === '❌');
        console.log(`\n═══ RESUMEN: ${filas.length - malas.length}/${filas.length} en verde ═══`);
        if (malas.length) {
            console.log('\nEN ROJO:');
            malas.forEach(f => console.log(`  [${f.bloque}] ${f.prueba}${f.detalle ? ` → ${f.detalle}` : ''}`));
        }
        await pool.end();
    });
