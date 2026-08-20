/**
 * =============================================================================
 * Verificación de punta a punta · «el que empieza de cero crea su cliente»
 * =============================================================================
 *
 * QUÉ PRUEBA
 * El flujo completo tal como lo pidió el negocio:
 *
 *   0. Victor tiene el catálogo del negocio: planes, precios, servicios,
 *      ejecutivos. Sin eso no puede crear nada.
 *   1. Victor (o quien tenga `ve_solo_empresas_asignadas`) crea un cliente.
 *   2. El cliente queda guardado y asignado a él en `audita`.
 *   3. Victor ve SOLO ese cliente.
 *   4. Victor puede trabajar la contabilidad de ESE cliente.
 *   5. Victor NO puede ver la contabilidad de los demás.
 *   6. Lo mismo para Remuneraciones.
 *
 * Los pasos 0 a 4 son la funcionalidad; los pasos 5 y 6 son el aislamiento.
 * Se prueban juntos a propósito: un aislamiento que además le impide trabajar
 * no sirve, y una funcionalidad que le muestra todo tampoco. El paso 0 es el
 * contrapeso: recuerda que lo que se le quita son las EMPRESAS, no el catálogo.
 *
 * CÓMO SE USA
 *     node src/DatabaseThings/migrations/verificar_2026-08-19_flujo_victor_crea_cliente.mjs
 *
 * ⚠️ ESTE SCRIPT ESCRIBE: crea una empresa de prueba y la borra al terminar,
 * pase lo que pase (el borrado va en `finally`). Al final informa si quedó
 * algún residuo. No levanta el servidor.
 *
 * RESULTADO AL 19-08-2026: los pasos 1 a 4 pasan, los pasos 5 y 6 fallan.
 * Ver `docs/contabilidad-modulo.md`, sección 3.
 * =============================================================================
 */
import 'dotenv/config';
import { pool } from '../../database/db.js';
import { crearEmpresaCRM, getClientesCRM, eliminarEmpresaCRM } from '../../controllers/clientes.controllers.js';
import { catalogosCRM } from '../../controllers/personas.controllers.js';
import { listCompaniesLista } from '../../controllers/companies.controllers.js';
import * as acc from '../../controllers/accounting.controllers.js';
import {
    consultarHistorialBunkerController,
    consultarComprasBunkerController,
} from '../../controllers/dteConsulta.controllers.js';
import { listTrabajadores, getMetrics } from '../../controllers/remuneraciones.controllers.js';

// RUT de prueba con dígito verificador válido; el alta lo valida y lo rechaza si no.
const RUT_PRUEBA    = '77111222-6';
const NOMBRE_PRUEBA = 'PRUEBA AISLAMIENTO — BORRAR SI QUEDA';

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

const cuantos = (p, ...ks) => {
    for (const k of ks) if (Array.isArray(p?.[k])) return p[k].length;
    return Array.isArray(p) ? p.length : -1;
};
const titulo = (t) => console.log(`\n──────── ${t} ────────`);
const marca  = (ok) => (ok ? '✅' : '❌');

let empresaId = null;

const main = async () => {
    // ── Actores, resueltos desde la base ──────────────────────────────────────
    const { rows: usuarios } = await pool.query(
        `SELECT id, nombre, rol, organizacion_id, ve_solo_empresas_asignadas
           FROM usuario WHERE activo = true`
    );
    const aSesion = (u) => ({
        usuarioId: u.id, nombre: u.nombre, rol: u.rol,
        organizacionId: u.organizacion_id,
        veSoloEmpresasAsignadas: u.ve_solo_empresas_asignadas === true,
    });
    const desdeCeroRow = usuarios.find(u => u.ve_solo_empresas_asignadas === true);
    const dePlantaRow  = usuarios.find(u => !u.ve_solo_empresas_asignadas && u.rol === 'Administrador');
    if (!desdeCeroRow || !dePlantaRow) {
        console.log('⚠️ No hay un usuario con `ve_solo_empresas_asignadas` y un administrador de planta. No se puede probar.');
        return;
    }
    const DESDE_CERO = aSesion(desdeCeroRow);
    const DE_PLANTA  = aSesion(dePlantaRow);

    // Una empresa que ya tenga contabilidad cargada y que NO sea la de prueba.
    const { rows: [ajena] } = await pool.query(
        `SELECT e.id, e.razon_social FROM empresa e
          WHERE EXISTS (SELECT 1 FROM plan_cuentas pc WHERE pc.empresa_id = e.id)
             OR EXISTS (SELECT 1 FROM comprobantes c WHERE c.empresa_id = e.id)
          LIMIT 1`
    );
    if (!ajena) { console.log('⚠️ No hay ninguna empresa con datos contables contra la cual contrastar.'); return; }

    console.log('\n═══ FLUJO: EL QUE EMPIEZA DE CERO CREA SU CLIENTE ═══');
    console.log(`Empieza de cero : ${DESDE_CERO.nombre}`);
    console.log(`De planta       : ${DE_PLANTA.nombre}`);
    console.log(`Empresa ajena   : ${ajena.razon_social}`);

    // ── PASO 0 · ¿Tiene con qué crear el cliente? ─────────────────────────────
    // El aislamiento le quita las EMPRESAS, no el catálogo del negocio: los
    // planes, sus precios, los servicios y los ejecutivos son de la oficina, y
    // sin ellos el formulario de alta queda con los desplegables vacíos y no se
    // puede crear nada. Se comprueba ANTES de crear, y contra lo que ve un
    // administrador de planta, porque el riesgo acá es apretar de más.
    titulo('PASO 0 · Tiene el catálogo para poder crear');
    const catalogoDe = async (sesion) => {
        const crm = await llamar(getClientesCRM, sesion);
        const cat = await llamar(catalogosCRM, sesion);
        return {
            planes:    cuantos(crm.payload, 'planes'),
            servicios: cuantos(crm.payload, 'serviciosDisponibles'),
            precios:   cuantos(crm.payload, 'preciosPlanTramo'),
            ejecutivos: cuantos(cat.payload, 'ejecutivos'),
        };
    };
    const catCero  = await catalogoDe(DESDE_CERO);
    const catPlanta = await catalogoDe(DE_PLANTA);
    for (const k of ['planes', 'servicios', 'precios', 'ejecutivos']) {
        const igual = catCero[k] === catPlanta[k] && catCero[k] > 0;
        console.log(`${marca(igual)} ${k.padEnd(11)} ${catCero[k]} (el de planta ve ${catPlanta[k]}; deben coincidir y ser > 0)`);
    }

    // ── PASO 1 · Crea el cliente ──────────────────────────────────────────────
    titulo('PASO 1 · Crea el cliente');
    const alta = await llamar(crearEmpresaCRM, DESDE_CERO, {
        body: { razonSocial: NOMBRE_PRUEBA, rut: RUT_PRUEBA, giro: 'PRUEBA', repNombre: 'REP PRUEBA', repRut: '11111111-1' },
    });
    empresaId = alta.payload?.empresaId || alta.payload?.id;
    if (!empresaId) {
        const { rows } = await pool.query(`SELECT id FROM empresa WHERE razon_social = $1`, [NOMBRE_PRUEBA]);
        empresaId = rows[0]?.id;
    }
    console.log(`${marca(alta.status === 201 && !!empresaId)} alta HTTP ${alta.status} · ${alta.payload?.message || alta.payload?.error || ''}`);
    if (!empresaId) throw new Error('No se creó la empresa: no se puede seguir.');

    // ── PASO 2 · Cómo quedó guardada ──────────────────────────────────────────
    titulo('PASO 2 · Cómo quedó guardada');
    const { rows: [e] } = await pool.query(
        `SELECT e.organizacion_id IS NOT NULL AS tiene_organizacion,
                (SELECT count(*) FROM audita a WHERE a.empresa_id = e.id) AS filas_audita,
                (SELECT u.nombre FROM audita a JOIN usuario u ON u.id = a.usuario_id
                  WHERE a.empresa_id = e.id LIMIT 1) AS asignada_a
           FROM empresa e WHERE e.id = $1`, [empresaId]);
    console.log(`${marca(e.tiene_organizacion)} lleva organizacion_id`);
    console.log(`${marca(Number(e.filas_audita) === 1)} queda asignada en audita a: ${e.asignada_a}`);

    // ── PASO 3 · Qué empresas ve ──────────────────────────────────────────────
    titulo('PASO 3 · Qué empresas ve');
    const crm = cuantos((await llamar(getClientesCRM, DESDE_CERO)).payload, 'clients', 'clientes', 'empresas');
    const sel = cuantos((await llamar(listCompaniesLista, DESDE_CERO)).payload, 'empresas');
    console.log(`${marca(crm === 1)} lista del CRM: ${crm} (debería ser 1, la que acaba de crear)`);
    console.log(`${marca(sel === 1)} selector del encabezado: ${sel} (debería ser 1)`);

    // ── PASO 4 · Puede trabajar SU contabilidad ───────────────────────────────
    titulo('PASO 4 · Puede trabajar la contabilidad de SU cliente');
    const suyos = {
        plan:    await llamar(acc.getChartOfAccounts, DESDE_CERO, { query: { empresaId } }),
        comp:    await llamar(acc.getComprobantes,    DESDE_CERO, { query: { empresaId } }),
        ventas:  await llamar(consultarHistorialBunkerController, DESDE_CERO, { query: { empresa_id: empresaId } }),
        compras: await llamar(consultarComprasBunkerController,   DESDE_CERO, { query: { empresa_id: empresaId } }),
    };
    for (const [k, r] of Object.entries(suyos)) {
        const n = cuantos(r.payload, 'plan', 'comprobantes', 'documentos');
        console.log(`${marca(r.status === 200 && n === 0)} ${k.padEnd(8)} HTTP ${r.status}, ${n} filas (0 es correcto: cliente recién creado)`);
    }

    // ── PASO 5 · NO puede ver la contabilidad ajena ───────────────────────────
    titulo('PASO 5 · NO debería ver la contabilidad de los demás');
    const ajenos = {
        'plan ajeno':   [await llamar(acc.getChartOfAccounts, DESDE_CERO, { query: { empresaId: ajena.id } }), 'plan'],
        'comprob.aj.':  [await llamar(acc.getComprobantes,    DESDE_CERO, { query: { empresaId: ajena.id } }), 'comprobantes'],
        'ventas aj.':   [await llamar(consultarHistorialBunkerController, DESDE_CERO, { query: { empresa_id: ajena.id } }), 'documentos'],
        'consolidado':  [await llamar(acc.getComprobantes,    DESDE_CERO, { query: { empresaId: 'ALL' } }), 'comprobantes'],
    };
    // Negar el acceso vale de las dos formas: cerrando la puerta (403) o
    // devolviendo cero filas. Lo que no vale es entregar datos.
    for (const [k, [r, clave]] of Object.entries(ajenos)) {
        const n = cuantos(r.payload, clave);
        const negado = r.status >= 400 || n === 0;
        const como = r.status >= 400 ? `HTTP ${r.status}` : `${n} filas`;
        console.log(`${marca(negado)} ${k.padEnd(13)} ${como} (debería quedar bloqueado)`);
    }

    // ── PASO 6 · Remuneraciones ───────────────────────────────────────────────
    titulo('PASO 6 · Remuneraciones');
    const remSuya  = await llamar(listTrabajadores, DESDE_CERO, { query: { empresaId } });
    const remAjena = await llamar(listTrabajadores, DESDE_CERO, { query: { empresaId: ajena.id } });
    const metAjena = await llamar(getMetrics,       DESDE_CERO, { query: { empresaId: ajena.id } });
    console.log(`${marca(remSuya.status === 200)} trabajadores de SU empresa: HTTP ${remSuya.status} (debe responder)`);
    console.log(`${marca(remAjena.status >= 400)} trabajadores de empresa AJENA: HTTP ${remAjena.status} (debería ser 403/404)`);
    console.log(`${marca(metAjena.status >= 400)} indicadores RRHH de empresa AJENA: HTTP ${metAjena.status} (debería ser 403/404)`);

    const { rows: [rt] } = await pool.query(`SELECT count(*) FROM rem_trabajador`);
    if (rt.count === '0') {
        console.log('\n   ℹ️  OJO: no hay NINGÚN trabajador cargado en el sistema. Que las');
        console.log('       consultas devuelvan vacío no prueba aislamiento — prueba que la');
        console.log('       bodega está vacía. Lo que sí vale acá es el código HTTP.');
    }
};

main()
    .catch(err => console.error('\n💥 Error en la prueba:', err.message))
    .finally(async () => {
        titulo('LIMPIEZA');
        if (empresaId) {
            // Se borra con el mismo controlador que usa la pantalla; si fallara,
            // se limpia a mano para no dejar basura en la base.
            const { rows: usuarios } = await pool.query(
                `SELECT id, nombre, rol, organizacion_id FROM usuario
                  WHERE activo = true AND ve_solo_empresas_asignadas = false LIMIT 1`);
            const admin = usuarios[0] && {
                usuarioId: usuarios[0].id, nombre: usuarios[0].nombre,
                rol: usuarios[0].rol, organizacionId: usuarios[0].organizacion_id,
            };
            if (admin) {
                const del = await llamar(eliminarEmpresaCRM, admin, { params: { empresaId } });
                console.log(`borrado con el controlador: HTTP ${del.status}`);
            }
            const { rows } = await pool.query(`SELECT count(*) FROM empresa WHERE id = $1`, [empresaId]);
            if (Number(rows[0].count) > 0) {
                for (const t of ['audita', 'empresa_representante', 'empresa_plan', 'empresa_servicio', 'sucursal']) {
                    await pool.query(`DELETE FROM ${t} WHERE empresa_id = $1`, [empresaId]).catch(() => {});
                }
                await pool.query(`DELETE FROM empresa WHERE id = $1`, [empresaId]);
                console.log('borrado de respaldo a mano: hecho');
            }
        }
        const { rows: resto } = await pool.query(
            `SELECT count(*) FROM empresa WHERE razon_social = $1`, [NOMBRE_PRUEBA]);
        console.log(resto[0].count === '0'
            ? '✅ la base quedó como estaba'
            : `⚠️ QUEDARON ${resto[0].count} empresas de prueba — hay que borrarlas a mano`);
        await pool.end();
    });
