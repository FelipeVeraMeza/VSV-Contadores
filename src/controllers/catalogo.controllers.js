// =====================================================================
// CATÁLOGO · planes, sus tramos de precio, y servicios
// ---------------------------------------------------------------------
// POR QUÉ EXISTE
// El pedido: «los planes de contabilidad cambian según el nivel de facturación
// de la empresa, eso es una variante. Otra variante puede ser la cantidad de
// trabajadores para RRHH. Hay que poder configurarlo en algún lugar para que
// ciertos usuarios lo puedan hacer y no solo a nivel de código».
//
// LO QUE YA ESTABA (y por eso esto es más chico de lo que parece)
// La tabla `plan_precio_tramo` existe desde julio y está cargada: define, por
// plan, el precio según el tramo de facturación, y `rrhh_gratis` —cuántos
// trabajadores entran sin costo—. O sea, las dos variantes del pedido ya están
// modeladas.
//
// Lo que NO había era manera de tocarlas: solo se leían, en un sitio, para
// pintar una matriz. Cambiar un precio significaba entrar a la base a mano.
// Eso es exactamente «solo a nivel de código», y es lo que se resuelve acá.
//
// LOS TRAMOS NO SE PISAN
// Un tramo es un rango [min, max). Si dos se solapan, una empresa cae en dos
// precios a la vez y cuál gana depende del orden — un error que no se ve hasta
// que alguien factura de menos. Se valida antes de guardar.
//
// TODO ACOTADO A LA ORGANIZACIÓN
// Los precios son lo que cobra la firma. Un plan de otra organización no se
// ve, no se edita y no se borra.
// =====================================================================
import { pool } from '../database/db.js';
import { registrar } from '../utils/bitacora.js';

const esAdmin = (req) => req.user?.rol === 'Administrador';

const soloAdmin = (req, res) => {
    if (esAdmin(req)) return false;
    res.status(403).json({ success: false, message: 'Solo un administrador puede cambiar el catálogo.' });
    return true;
};

/** El plan es de mi organización. Sin esto se editarían precios ajenos. */
const planEsMio = async (planId, organizacionId) => {
    const { rows } = await pool.query(
        `SELECT 1 FROM plan WHERE id = $1 AND organizacion_id IS NOT DISTINCT FROM $2::uuid`,
        [planId, organizacionId]);
    return rows.length > 0;
};

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

// Las cinco del enum de la base. La categoría es OBLIGATORIA en `servicio`, así
// que un servicio nuevo sin categoría reventaba con un 500 en vez de decir qué
// faltaba. Se ofrece «Soporte» por omisión: es la más genérica y siempre se
// puede corregir después.
const CATEGORIAS = ['Tributaria', 'Contabilidad', 'RRHH', 'Soporte', 'Legal'];
export const categoriasDeServicio = () => [...CATEGORIAS];

// ---------------------------------------------------------------
// LEER EL CATÁLOGO COMPLETO
// ---------------------------------------------------------------
// Planes con sus tramos anidados y los servicios, en una sola llamada: la
// pantalla los muestra juntos y pedirlos por separado haría que se dibujaran
// en dos momentos distintos.
export const listarCatalogo = async (req, res) => {
    try {
        const org = req.user?.organizacionId || null;

        const [planes, tramos, servicios, uso] = await Promise.all([
            pool.query(
                `SELECT id, nombre, precio_base FROM plan
                  WHERE organizacion_id IS NOT DISTINCT FROM $1::uuid
                  ORDER BY nombre`, [org]),
            pool.query(
                `SELECT t.id, t.plan_id, t.tramo_orden, t.tramo_min, t.tramo_max,
                        t.precio_neto, t.rrhh_gratis, t.activo
                   FROM plan_precio_tramo t
                   JOIN plan p ON p.id = t.plan_id
                  WHERE p.organizacion_id IS NOT DISTINCT FROM $1::uuid
                  ORDER BY t.plan_id, t.tramo_orden`, [org]),
            pool.query(
                `SELECT id, nombre, slug, categoria::text AS categoria,
                        descripcion, es_critico, activo
                   FROM servicio
                  WHERE organizacion_id IS NOT DISTINCT FROM $1::uuid
                  ORDER BY nombre`, [org]),
            // Cuántas empresas usan cada plan: sin esto, borrar un plan es a
            // ciegas. La pantalla lo muestra al lado del botón de eliminar.
            pool.query(
                `SELECT plan_id, COUNT(*)::int AS n FROM empresa_plan GROUP BY plan_id`),
        ]);

        const porPlan = new Map();
        for (const t of tramos.rows) {
            if (!porPlan.has(t.plan_id)) porPlan.set(t.plan_id, []);
            porPlan.get(t.plan_id).push({
                id: t.id, orden: t.tramo_orden,
                min: Number(t.tramo_min), max: Number(t.tramo_max),
                precioNeto: Number(t.precio_neto),
                rrhhGratis: t.rrhh_gratis ?? 0,
                activo: t.activo !== false,
            });
        }
        const usoPorPlan = new Map(uso.rows.map(r => [r.plan_id, r.n]));

        return res.json({
            success: true,
            planes: planes.rows.map(p => ({
                id: p.id, nombre: p.nombre,
                precioBase: Number(p.precio_base || 0),
                empresas: usoPorPlan.get(p.id) || 0,
                tramos: porPlan.get(p.id) || [],
            })),
            // Las categorías viajan desde acá para que la pantalla no las repita:
            // si se repitieran, el día que cambie el enum quedaría ofreciendo una
            // opción que la base ya no acepta.
            categorias: CATEGORIAS,
            servicios: servicios.rows.map(s => ({
                id: s.id, nombre: s.nombre, slug: s.slug,
                categoria: s.categoria, descripcion: s.descripcion,
                esCritico: s.es_critico === true,
                activo: s.activo !== false,
            })),
        });
    } catch (error) {
        console.error('❌ Error listando el catálogo:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo cargar el catálogo.' });
    }
};

// ---------------------------------------------------------------
// PLANES
// ---------------------------------------------------------------
export const crearPlan = async (req, res) => {
    if (soloAdmin(req, res)) return;
    try {
        const nombre = String(req.body?.nombre || '').trim();
        if (!nombre) return res.status(400).json({ success: false, message: 'El plan necesita un nombre.' });
        if (nombre.length > 100) return res.status(400).json({ success: false, message: 'El nombre es muy largo.' });

        const precio = num(req.body?.precioBase) ?? 0;
        if (precio < 0) return res.status(400).json({ success: false, message: 'El precio no puede ser negativo.' });

        const org = req.user?.organizacionId || null;
        // Dos planes con el mismo nombre en la misma organización se confunden
        // en cada desplegable donde se eligen.
        const { rows: repe } = await pool.query(
            `SELECT 1 FROM plan WHERE LOWER(nombre) = LOWER($1)
              AND organizacion_id IS NOT DISTINCT FROM $2::uuid`, [nombre, org]);
        if (repe.length) return res.status(409).json({ success: false, message: `Ya existe un plan «${nombre}».` });

        const { rows } = await pool.query(
            `INSERT INTO plan (nombre, precio_base, organizacion_id)
             VALUES ($1,$2,$3) RETURNING id, nombre, precio_base`,
            [nombre, precio, org]);

        await registrar(req, {
            modulo: 'catalogo', accion: 'crear', entidad: 'plan', entidadId: rows[0].id,
            descripcion: `Creó el plan «${nombre}» con precio base ${precio}.`,
        });
        return res.status(201).json({ success: true, plan: rows[0] });
    } catch (error) {
        console.error('❌ Error creando el plan:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo crear el plan.' });
    }
};

export const actualizarPlan = async (req, res) => {
    if (soloAdmin(req, res)) return;
    try {
        const { id } = req.params;
        const org = req.user?.organizacionId || null;
        if (!await planEsMio(id, org)) {
            return res.status(404).json({ success: false, message: 'Plan no encontrado.' });
        }

        const sets = [], vals = [];
        if (Object.hasOwn(req.body, 'nombre')) {
            const n = String(req.body.nombre || '').trim();
            if (!n) return res.status(400).json({ success: false, message: 'El plan necesita un nombre.' });
            sets.push(`nombre = $${vals.push(n)}`);
        }
        if (Object.hasOwn(req.body, 'precioBase')) {
            const p = num(req.body.precioBase) ?? 0;
            if (p < 0) return res.status(400).json({ success: false, message: 'El precio no puede ser negativo.' });
            sets.push(`precio_base = $${vals.push(p)}`);
        }
        if (!sets.length) return res.status(400).json({ success: false, message: 'No hay nada que cambiar.' });

        vals.push(id);
        const { rows } = await pool.query(
            `UPDATE plan SET ${sets.join(', ')} WHERE id = $${vals.length}
             RETURNING id, nombre, precio_base`, vals);

        await registrar(req, {
            modulo: 'catalogo', accion: 'editar', entidad: 'plan', entidadId: id,
            descripcion: `Editó el plan «${rows[0].nombre}».`, detalle: req.body,
        });
        return res.json({ success: true, plan: rows[0] });
    } catch (error) {
        console.error('❌ Error actualizando el plan:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo actualizar el plan.' });
    }
};

// Un plan en uso NO se borra. Borrarlo dejaría empresas apuntando a un plan que
// ya no existe, y el cobro del mes no sabría qué cobrarles.
export const eliminarPlan = async (req, res) => {
    if (soloAdmin(req, res)) return;
    try {
        const { id } = req.params;
        const org = req.user?.organizacionId || null;
        if (!await planEsMio(id, org)) {
            return res.status(404).json({ success: false, message: 'Plan no encontrado.' });
        }

        const { rows: [u] } = await pool.query(
            `SELECT (SELECT COUNT(*)::int FROM empresa_plan WHERE plan_id = $1)
                  + (SELECT COUNT(*)::int FROM empresa WHERE plan_id = $1) AS n`, [id]);
        if (u.n > 0) {
            return res.status(409).json({
                success: false,
                message: `No se puede eliminar: ${u.n} empresa(s) tienen este plan. Quítaselo primero.`,
            });
        }

        const { rows } = await pool.query(
            `DELETE FROM plan WHERE id = $1 RETURNING nombre`, [id]);
        await registrar(req, {
            modulo: 'catalogo', accion: 'eliminar', entidad: 'plan', entidadId: id,
            descripcion: `Eliminó el plan «${rows[0]?.nombre}».`,
        });
        return res.json({ success: true });
    } catch (error) {
        console.error('❌ Error eliminando el plan:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo eliminar el plan.' });
    }
};

// ---------------------------------------------------------------
// TRAMOS · las variantes del plan
// ---------------------------------------------------------------
// Se guardan TODOS de una vez, no de a uno. Un tramo aislado no significa
// nada: lo que importa es que la escalera completa no tenga huecos ni
// solapes, y eso solo se puede comprobar mirándolos juntos.
export const guardarTramos = async (req, res) => {
    if (soloAdmin(req, res)) return;
    const cliente = await pool.connect();
    try {
        const { id: planId } = req.params;
        const org = req.user?.organizacionId || null;
        if (!await planEsMio(planId, org)) {
            return res.status(404).json({ success: false, message: 'Plan no encontrado.' });
        }

        const entrada = Array.isArray(req.body?.tramos) ? req.body.tramos : null;
        if (!entrada) return res.status(400).json({ success: false, message: 'Faltan los tramos.' });

        // Normalizar y validar cada uno por separado.
        const tramos = [];
        for (const [i, t] of entrada.entries()) {
            const min = num(t?.min) ?? 0;
            const max = num(t?.max);
            const precio = num(t?.precioNeto);
            const rrhh = num(t?.rrhhGratis) ?? 0;

            if (max === null) return res.status(400).json({ success: false, message: `Al tramo ${i + 1} le falta el tope.` });
            if (min < 0 || max < 0) return res.status(400).json({ success: false, message: 'Los montos no pueden ser negativos.' });
            if (max <= min) return res.status(400).json({ success: false, message: `El tramo ${i + 1} termina antes de empezar (${min} → ${max}).` });
            if (faltaElPrecio(precio)) return res.status(400).json({ success: false, message: `Al tramo ${i + 1} le falta el precio.` });
            if (precio < 0) return res.status(400).json({ success: false, message: 'El precio no puede ser negativo.' });
            if (rrhh < 0) return res.status(400).json({ success: false, message: 'Los trabajadores incluidos no pueden ser negativos.' });

            tramos.push({ min, max, precio, rrhh, activo: t?.activo !== false });
        }

        // Y ahora la escalera completa: ordenados por inicio, ninguno puede
        // empezar antes de que termine el anterior. Con un solape, una empresa
        // cae en dos precios y gana el que el ORDER decida — un error que
        // aparece recién cuando alguien factura de menos.
        const ordenados = [...tramos].sort((a, b) => a.min - b.min);
        for (let i = 1; i < ordenados.length; i++) {
            if (ordenados[i].min < ordenados[i - 1].max) {
                return res.status(400).json({
                    success: false,
                    message: `Dos tramos se pisan: uno llega a ${ordenados[i - 1].max} y el siguiente arranca en ${ordenados[i].min}.`,
                });
            }
        }

        await cliente.query('BEGIN');
        // Se reemplazan enteros: es una escalera, no filas sueltas. Editar de a
        // una dejaría estados intermedios con huecos.
        await cliente.query('DELETE FROM plan_precio_tramo WHERE plan_id = $1', [planId]);
        for (const [i, t] of ordenados.entries()) {
            await cliente.query(
                `INSERT INTO plan_precio_tramo
                    (plan_id, tramo_orden, tramo_min, tramo_max, precio_neto, rrhh_gratis, activo)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                [planId, i + 1, t.min, t.max, t.precio, t.rrhh, t.activo]);
        }
        await cliente.query('COMMIT');

        await registrar(req, {
            modulo: 'catalogo', accion: 'editar', entidad: 'plan', entidadId: planId,
            descripcion: `Actualizó los ${ordenados.length} tramo(s) de precio del plan.`,
            detalle: { tramos: ordenados },
        });
        return res.json({ success: true, tramos: ordenados.length });
    } catch (error) {
        await cliente.query('ROLLBACK').catch(() => {});
        console.error('❌ Error guardando los tramos:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudieron guardar los tramos.' });
    } finally {
        cliente.release();
    }
};

// Un precio de 0 es válido —el plan FREE cuesta 0—, así que no se puede
// preguntar `if (!precio)`: eso trataría el 0 como «falta el dato».
function faltaElPrecio(v) { return v === null || v === undefined || Number.isNaN(v); }

// ---------------------------------------------------------------
// SERVICIOS
// ---------------------------------------------------------------
export const crearServicio = async (req, res) => {
    if (soloAdmin(req, res)) return;
    try {
        const nombre = String(req.body?.nombre || '').trim();
        if (!nombre) return res.status(400).json({ success: false, message: 'El servicio necesita un nombre.' });

        const org = req.user?.organizacionId || null;
        const { rows: repe } = await pool.query(
            `SELECT 1 FROM servicio WHERE LOWER(nombre) = LOWER($1)
              AND organizacion_id IS NOT DISTINCT FROM $2::uuid`, [nombre, org]);
        if (repe.length) return res.status(409).json({ success: false, message: `Ya existe «${nombre}».` });

        // El slug identifica al servicio en el código; se deriva del nombre para
        // no pedirle a nadie que invente uno.
        const slug = String(req.body?.slug || nombre)
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);

        const categoria = CATEGORIAS.includes(req.body?.categoria) ? req.body.categoria : 'Soporte';

        const { rows } = await pool.query(
            `INSERT INTO servicio (nombre, slug, categoria, descripcion, es_critico, activo, organizacion_id)
             VALUES ($1,$2,$3::categoria_servicio,$4,$5,true,$6)
             RETURNING id, nombre, slug, categoria::text AS categoria, descripcion, es_critico, activo`,
            [nombre, slug, categoria, req.body?.descripcion?.trim() || null,
             req.body?.esCritico === true, org]);

        await registrar(req, {
            modulo: 'catalogo', accion: 'crear', entidad: 'servicio', entidadId: rows[0].id,
            descripcion: `Creó el servicio «${nombre}».`,
        });
        return res.status(201).json({ success: true, servicio: rows[0] });
    } catch (error) {
        console.error('❌ Error creando el servicio:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo crear el servicio.' });
    }
};

export const actualizarServicio = async (req, res) => {
    if (soloAdmin(req, res)) return;
    try {
        const { id } = req.params;
        const org = req.user?.organizacionId || null;
        const { rows: mio } = await pool.query(
            `SELECT 1 FROM servicio WHERE id = $1 AND organizacion_id IS NOT DISTINCT FROM $2::uuid`,
            [id, org]);
        if (!mio.length) return res.status(404).json({ success: false, message: 'Servicio no encontrado.' });

        const sets = [], vals = [];
        if (Object.hasOwn(req.body, 'nombre')) {
            const n = String(req.body.nombre || '').trim();
            if (!n) return res.status(400).json({ success: false, message: 'El servicio necesita un nombre.' });
            sets.push(`nombre = $${vals.push(n)}`);
        }
        if (Object.hasOwn(req.body, 'categoria')) {
            if (!CATEGORIAS.includes(req.body.categoria)) {
                return res.status(400).json({
                    success: false,
                    message: `Categoría no válida. Debe ser una de: ${CATEGORIAS.join(', ')}.`,
                });
            }
            sets.push(`categoria = $${vals.push(req.body.categoria)}::categoria_servicio`);
        }
        if (Object.hasOwn(req.body, 'descripcion')) sets.push(`descripcion = $${vals.push(req.body.descripcion?.trim() || null)}`);
        if (Object.hasOwn(req.body, 'esCritico')) sets.push(`es_critico = $${vals.push(req.body.esCritico === true)}`);
        // Desactivar en vez de borrar: un servicio contratado no puede
        // desaparecer del historial de nadie.
        if (Object.hasOwn(req.body, 'activo')) sets.push(`activo = $${vals.push(req.body.activo !== false)}`);
        if (!sets.length) return res.status(400).json({ success: false, message: 'No hay nada que cambiar.' });

        vals.push(id);
        const { rows } = await pool.query(
            `UPDATE servicio SET ${sets.join(', ')} WHERE id = $${vals.length}
             RETURNING id, nombre, slug, categoria::text AS categoria, descripcion, es_critico, activo`, vals);

        await registrar(req, {
            modulo: 'catalogo', accion: 'editar', entidad: 'servicio', entidadId: id,
            descripcion: `Editó el servicio «${rows[0].nombre}».`, detalle: req.body,
        });
        return res.json({ success: true, servicio: rows[0] });
    } catch (error) {
        console.error('❌ Error actualizando el servicio:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo actualizar el servicio.' });
    }
};
