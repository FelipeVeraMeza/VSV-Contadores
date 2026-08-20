/**
 * =============================================================================
 * Verificación · aislamiento del módulo de Contabilidad
 * =============================================================================
 *
 * PARA QUÉ
 * El negocio pide dos cosas a la vez sobre Contabilidad:
 *   1. Quien entra al equipo desde cero (`ve_solo_empresas_asignadas = true`)
 *      debe ver el módulo VACÍO hasta que se le asignen empresas.
 *   2. Ningún usuario debe ver datos contables de otra organización.
 *
 * Ninguna de las dos se puede comprobar mirando la pantalla: la pantalla se ve
 * bien igual. Este script las mide llamando a los controladores REALES contra
 * la base real, que es como se verificaron las fases del módulo de Tareas.
 *
 * CÓMO SE USA
 *     node src/DatabaseThings/migrations/verificar_2026-08-19_aislamiento_contabilidad.mjs
 *
 * No levanta el servidor, no escribe ni borra nada: solo lee.
 *
 * CÓMO SE LEE EL RESULTADO
 * Cada prueba afirma el comportamiento QUE DEBERÍA HABER, no el que hay. Al
 * 19-08-2026 fallan 13 de 21 — ver `docs/contabilidad-modulo.md`, sección
 * «Aislamiento». Una prueba en verde que se pone roja es una regresión.
 * =============================================================================
 */
import 'dotenv/config';
import { pool } from '../../database/db.js';
import * as acc from '../../controllers/accounting.controllers.js';
import { listCompaniesLista, getAssignedCompanies } from '../../controllers/companies.controllers.js';
import { getClientesCRM } from '../../controllers/clientes.controllers.js';
import {
    consultarHistorialBunkerController,
    consultarComprasBunkerController,
} from '../../controllers/dteConsulta.controllers.js';

// -----------------------------------------------------------------------------
// Los actores se resuelven desde la base, no se escriben a mano: los UUID
// cambian entre entornos y un script con IDs fijos deja de servir en silencio.
// -----------------------------------------------------------------------------
const cargarActores = async () => {
    const { rows: usuarios } = await pool.query(
        `SELECT id, nombre, rol, organizacion_id, ve_solo_empresas_asignadas
           FROM usuario WHERE activo = true`
    );

    const aSesion = (u) => ({
        usuarioId: u.id,
        nombre: u.nombre,
        rol: u.rol,
        organizacionId: u.organizacion_id,
        veSoloEmpresasAsignadas: u.ve_solo_empresas_asignadas === true,
    });

    // Un administrador de planta, para contrastar que sí ve lo suyo.
    const dePlanta = usuarios.find(u => !u.ve_solo_empresas_asignadas && u.rol === 'Administrador');

    // Quien empieza desde cero: la bandera puesta y ninguna empresa asignada.
    //
    // Si HOY no hay ningún usuario así —el 20-08-2026 se le quitó la bandera a
    // Victor, porque es de la oficina y debe ver la cartera completa— igual hay
    // que probar el recorte: sigue en el código y se le aplica a toda cuenta de
    // fuera de la organización (el rol `Cliente`). Una prueba que deja de
    // probar en silencio porque «no hay a quién» es peor que no tenerla: el
    // resumen sale en verde y nadie se entera de que dejó de mirar.
    //
    // Así que se arma una sesión de mentira: la bandera encendida y un
    // `usuarioId` que no existe, y por lo tanto no tiene ninguna fila en
    // `audita`. Es exactamente el caso que interesa —recortado y sin empresas
    // asignadas— y no toca la base.
    const usuarioReal = usuarios.find(u => u.ve_solo_empresas_asignadas === true);
    const desdeCero = usuarioReal || (dePlanta && {
        id: '00000000-0000-0000-0000-0000000000ff',   // no existe: 0 filas en audita
        nombre: '(simulado: cuenta recortada sin empresas)',
        rol: 'Administrador',
        organizacion_id: dePlanta.organizacion_id,
        ve_solo_empresas_asignadas: true,
    });

    // Una organización que no tenga ninguna empresa: sirve para probar el
    // aislamiento entre organizaciones sin inventar datos.
    const { rows: [orgVacia] } = await pool.query(
        `SELECT o.id, o.nombre FROM organizacion o
          WHERE NOT EXISTS (SELECT 1 FROM empresa e WHERE e.organizacion_id = o.id)
          LIMIT 1`
    );

    // Una empresa con datos contables que NO esté asignada a quien empieza de cero.
    const { rows: [empresaAjena] } = await pool.query(
        `SELECT e.id, e.razon_social
           FROM empresa e
          WHERE EXISTS (SELECT 1 FROM plan_cuentas pc WHERE pc.empresa_id = e.id)
             OR EXISTS (SELECT 1 FROM comprobantes c WHERE c.empresa_id = e.id)
          LIMIT 1`
    );

    return {
        desdeCero: desdeCero && aSesion(desdeCero),
        dePlanta:  dePlanta  && aSesion(dePlanta),
        tenantVacio: orgVacia && dePlanta && { ...aSesion(dePlanta), organizacionId: orgVacia.id, veSoloEmpresasAsignadas: false },
        orgVacia,
        empresaAjena,
    };
};

// -----------------------------------------------------------------------------
// Llama a un controlador de Express sin servidor: req y res de mentira.
// -----------------------------------------------------------------------------
const llamar = (handler, user, { query = {}, body = {}, params = {} } = {}) =>
    new Promise((resolve) => {
        const req = { user, query, body, params, header: () => null };
        const res = {
            statusCode: 200,
            status(c) { this.statusCode = c; return this; },
            json(p) { resolve({ status: this.statusCode, payload: p }); return this; },
            send(p) { resolve({ status: this.statusCode, payload: p }); return this; },
            setHeader() { return this; },
        };
        Promise.resolve(handler(req, res)).catch(e => resolve({ status: 500, payload: { error: e.message } }));
    });

// Cuenta los elementos de la primera clave que sea un arreglo. -1 si no hay.
const cuantos = (payload, ...claves) => {
    for (const k of claves) if (Array.isArray(payload?.[k])) return payload[k].length;
    return Array.isArray(payload) ? payload.length : -1;
};

// Un endpoint puede negar el acceso de dos maneras igual de válidas: cerrando la
// puerta (403) o abriéndola a una pieza vacía (0 filas). Las dos cuentan como
// "bloqueado"; lo que NO cuenta es devolver datos. Sin esto, la prueba leía un
// 403 —que es la respuesta correcta— como si fuera un fallo.
const bloqueado = (r, ...claves) => {
    if (r.status >= 400) return 'bloqueado (403)';
    const n = cuantos(r.payload, ...claves);
    return n === 0 ? 'bloqueado (vacío)' : n;
};
const esBloqueo = (v) => typeof v === 'string' && v.startsWith('bloqueado');

const filas = [];
const prueba = async (id, nombre, esperado, fn) => {
    let obtenido, ok;
    try { obtenido = await fn(); ok = esperado(obtenido); }
    catch (e) { obtenido = `ERROR: ${e.message}`; ok = false; }
    filas.push({ '#': id, prueba: nombre, esperado: esperado.desc, obtenido, r: ok ? '✅' : '❌' });
};
const cero  = (desc) => Object.assign((x) => x === 0, { desc });
const algo  = (desc) => Object.assign((x) => x > 0,   { desc });
const niega = (desc) => Object.assign(esBloqueo,      { desc });

// =============================================================================
const main = async () => {
    const { desdeCero, dePlanta, tenantVacio, orgVacia, empresaAjena } = await cargarActores();

    if (!desdeCero || !dePlanta || !empresaAjena) {
        console.log('⚠️  No se pudo armar el escenario:');
        console.log(`    usuario que empieza de cero: ${desdeCero?.nombre || 'NO HAY'}`);
        console.log(`    administrador de planta:     ${dePlanta?.nombre || 'NO HAY'}`);
        console.log(`    empresa con datos contables: ${empresaAjena?.razon_social || 'NO HAY'}`);
        await pool.end();
        return;
    }

    console.log('\n══════════ AISLAMIENTO DEL MÓDULO DE CONTABILIDAD ══════════');
    console.log(`Fecha            : ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`);
    console.log(`Empieza de cero  : ${desdeCero.nombre} (${desdeCero.rol})`);
    console.log(`De planta        : ${dePlanta.nombre} (${dePlanta.rol})`);
    console.log(`Organización vacía: ${orgVacia?.nombre || '—'}`);
    console.log(`Empresa ajena    : ${empresaAjena.razon_social}\n`);

    const AJENA = empresaAjena.id;

    // ── A · La puerta de entrada: qué empresas se le ofrecen ──────────────────
    await prueba('A1', 'Selector global /companies/lista · empieza de cero', cero('0'),
        async () => cuantos((await llamar(listCompaniesLista, desdeCero)).payload, 'empresas'));
    await prueba('A2', 'Selector global /companies/lista · de planta', algo('>0'),
        async () => cuantos((await llamar(listCompaniesLista, dePlanta)).payload, 'empresas'));
    await prueba('A3', 'Lista del CRM /clientes/crm · empieza de cero', cero('0'),
        async () => cuantos((await llamar(getClientesCRM, desdeCero)).payload, 'clients', 'clientes', 'empresas'));
    await prueba('A4', 'Lista del CRM /clientes/crm · de planta', algo('>0'),
        async () => cuantos((await llamar(getClientesCRM, dePlanta)).payload, 'clients', 'clientes', 'empresas'));
    await prueba('A5', '/companies/assigned · empieza de cero', cero('0'),
        async () => cuantos((await llamar(getAssignedCompanies, desdeCero)).payload, 'companies'));

    // ── B · Vista consolidada (sin empresa elegida) ───────────────────────────
    await prueba('B1', 'Plan de cuentas consolidado · empieza de cero', cero('0'),
        async () => cuantos((await llamar(acc.getChartOfAccounts, desdeCero, { query: { empresaId: 'ALL' } })).payload, 'plan'));
    await prueba('B2', 'Comprobantes consolidados · empieza de cero', cero('0'),
        async () => cuantos((await llamar(acc.getComprobantes, desdeCero, { query: { empresaId: 'ALL' } })).payload, 'comprobantes'));
    await prueba('B3', 'Balance consolidado · empieza de cero', cero('0'),
        async () => cuantos((await llamar(acc.getBalance, desdeCero, { query: { empresaId: 'ALL' } })).payload, 'libroMayor'));
    await prueba('B4', 'Ventas consolidadas /dte-consulta/historial · empieza de cero', cero('0'),
        async () => cuantos((await llamar(consultarHistorialBunkerController, desdeCero, { query: { empresa_id: 'ALL' } })).payload, 'documentos'));
    await prueba('B5', 'Compras consolidadas /dte-consulta/compras · empieza de cero', cero('0'),
        async () => cuantos((await llamar(consultarComprasBunkerController, desdeCero, { query: { empresa_id: 'ALL' } })).payload, 'documentos'));

    // ── C · Empresa concreta NO asignada, forzada por parámetro ───────────────
    // Es la prueba que la pantalla no puede hacer: aunque el selector no la
    // ofrezca, el parámetro se puede escribir a mano en la URL.
    await prueba('C1', 'Plan de cuentas de empresa ajena · empieza de cero', niega('bloqueado'),
        async () => bloqueado(await llamar(acc.getChartOfAccounts, desdeCero, { query: { empresaId: AJENA } }), 'plan'));
    await prueba('C2', 'Comprobantes de empresa ajena · empieza de cero', niega('bloqueado'),
        async () => bloqueado(await llamar(acc.getComprobantes, desdeCero, { query: { empresaId: AJENA } }), 'comprobantes'));
    await prueba('C3', 'Balance de empresa ajena · empieza de cero', niega('bloqueado'),
        async () => bloqueado(await llamar(acc.getBalance, desdeCero, { query: { empresaId: AJENA } }), 'libroMayor'));
    await prueba('C4', 'Ventas de empresa ajena · empieza de cero', niega('bloqueado'),
        async () => bloqueado(await llamar(consultarHistorialBunkerController, desdeCero, { query: { empresa_id: AJENA } }), 'documentos'));

    // ── D · Contraste: quien sí tiene que ver, ve ─────────────────────────────
    // Sin esto, una consulta rota que devuelva vacío para todos pasaría por
    // "aislamiento perfecto".
    await prueba('D1', 'Comprobantes consolidados · de planta (contraste)', algo('>0'),
        async () => cuantos((await llamar(acc.getComprobantes, dePlanta, { query: { empresaId: 'ALL' } })).payload, 'comprobantes'));
    await prueba('D2', 'Ventas consolidadas · de planta (contraste)', algo('>0'),
        async () => cuantos((await llamar(consultarHistorialBunkerController, dePlanta, { query: { empresa_id: 'ALL' } })).payload, 'documentos'));

    // ── E · Aislamiento entre ORGANIZACIONES ──────────────────────────────────
    if (tenantVacio) {
        await prueba('E1', 'Plan de cuentas consolidado · organización vacía', cero('0'),
            async () => cuantos((await llamar(acc.getChartOfAccounts, tenantVacio, { query: { empresaId: 'ALL' } })).payload, 'plan'));
        await prueba('E2', 'Comprobantes consolidados · organización vacía', cero('0'),
            async () => cuantos((await llamar(acc.getComprobantes, tenantVacio, { query: { empresaId: 'ALL' } })).payload, 'comprobantes'));
        await prueba('E3', 'Balance consolidado · organización vacía', cero('0'),
            async () => cuantos((await llamar(acc.getBalance, tenantVacio, { query: { empresaId: 'ALL' } })).payload, 'libroMayor'));
        await prueba('E4', 'Ventas consolidadas · organización vacía', cero('0'),
            async () => cuantos((await llamar(consultarHistorialBunkerController, tenantVacio, { query: { empresa_id: 'ALL' } })).payload, 'documentos'));
        await prueba('E5', 'Comprobantes de empresa de OTRA organización', niega('bloqueado'),
            async () => bloqueado(await llamar(acc.getComprobantes, tenantVacio, { query: { empresaId: AJENA } }), 'comprobantes'));
    }

    console.table(filas);
    const fallan = filas.filter(f => f.r === '❌');
    console.log(`\nRESUMEN: ${filas.length - fallan.length}/${filas.length} en verde · ${fallan.length} en rojo`);
    if (fallan.length) {
        console.log('\nEN ROJO:');
        fallan.forEach(f => console.log(`  ${f['#']} · ${f.prueba}`.padEnd(70) + `esperado ${f.esperado}, obtenido ${f.obtenido}`));
        console.log('\nVer docs/contabilidad-modulo.md, sección «Aislamiento», para la causa de cada uno.');
    }

    await pool.end();
};

main().catch(async (e) => {
    console.error('💥 Error ejecutando la verificación:', e);
    await pool.end();
    process.exit(1);
});
