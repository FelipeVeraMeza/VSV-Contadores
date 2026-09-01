import { pool } from '../database/db.js';
import { encrypt, decrypt, generateHash } from '../utils/crypto.js';
import { cleanRut } from '../lib/rut.js';

// ============================================================
// VALIDACIONES
// ============================================================

// RUT chileno con dígito verificador (módulo 11)
export const validarRutDV = (rut) => {
    const limpio = cleanRut(rut); // "BODY-DV"
    if (!/^\d+-[\dkK]$/.test(limpio)) return false;
    const [body, dv] = limpio.split('-');
    let suma = 0, mul = 2;
    for (let i = body.length - 1; i >= 0; i--) {
        suma += parseInt(body[i], 10) * mul;
        mul = mul < 7 ? mul + 1 : 2;
    }
    const resto = 11 - (suma % 11);
    const esperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
    return dv.toUpperCase() === esperado;
};

const validarCorreo = (correo) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(correo).trim());

const normalizarTelefono = (tel) => String(tel || '').replace(/\D/g, '');
const validarTelefono = (tel) => normalizarTelefono(tel).length >= 8;

const decryptSafe = (val) => {
    if (!val) return null;
    try { return decrypt(val) || null; } catch { return null; }
};

// ============================================================
// ALCANCE DE VISIBILIDAD ("cuaderno propio")
// Cada usuario trabaja su propia cartera: ve los prospectos que creó y los
// que le asignaron como ejecutivo. El Administrador ve los de toda su
// organización. Ninguna cuenta cruza el límite de su organización.
// ============================================================
const esAdmin = (req) => req.user?.rol === 'Administrador';

// Verifica que la ficha pertenezca al usuario antes de leerla o tocarla.
// Devuelve la persona, o null si no existe o no es suya (mismo trato: 404,
// para no delatar la existencia de fichas ajenas).
const cargarPersonaPermitida = async (req, personaId, ejecutor = pool) => {
    const { rows } = await ejecutor.query(
        `SELECT id, estado, organizacion_id, creado_por, ejecutivo_id FROM persona WHERE id = $1`,
        [personaId]
    );
    const p = rows[0];
    if (!p) return null;
    if ((p.organizacion_id || null) !== (req.user?.organizacionId || null)) return null;
    if (esAdmin(req)) return p;
    const usuarioId = req.user?.usuarioId || null;
    if (p.creado_por === usuarioId || p.ejecutivo_id === usuarioId) return p;
    return null;
};

const NO_ENCONTRADO = { success: false, message: 'Cliente no encontrado.' };

// Upsert de etiquetas (por nombre) y vínculo con la persona
const setEtiquetas = async (client, personaId, etiquetas) => {
    if (!Array.isArray(etiquetas)) return;
    await client.query('DELETE FROM persona_etiqueta WHERE persona_id = $1', [personaId]);
    for (const raw of etiquetas) {
        const nombre = String(raw || '').trim();
        if (!nombre) continue;
        let r = await client.query('SELECT id FROM etiqueta WHERE lower(nombre) = lower($1)', [nombre]);
        let etId = r.rows[0]?.id;
        if (!etId) {
            const ins = await client.query('INSERT INTO etiqueta (nombre) VALUES ($1) RETURNING id', [nombre]);
            etId = ins.rows[0].id;
        }
        await client.query('INSERT INTO persona_etiqueta (persona_id, etiqueta_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [personaId, etId]);
    }
};

// Servicios de interés (por id de servicio)
const setServiciosInteres = async (client, personaId, servicioIds) => {
    if (!Array.isArray(servicioIds)) return;
    await client.query('DELETE FROM persona_servicio_interes WHERE persona_id = $1', [personaId]);
    for (const sid of servicioIds) {
        if (!sid) continue;
        await client.query('INSERT INTO persona_servicio_interes (persona_id, servicio_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [personaId, sid]);
    }
};

// ============================================================
// DETECCIÓN DE DUPLICADOS
// ============================================================
const buscarCoincidencias = async ({ rut, correos = [], telefonos = [], nombre, apellidos }, excluirId = null, organizacionId = null) => {
    const matches = new Map(); // persona_id -> { id, nombre, criterios:Set }
    // Filtro de organización: la dedupe nunca cruza datos entre despachos.
    // Se aplica siempre — también cuando la organización es NULL, porque si no
    // esas cuentas verían coincidencias de todos los despachos.
    const orgSql = ' AND p.organizacion_id IS NOT DISTINCT FROM $ORG::uuid ';
    const orgSqlSimple = ' AND organizacion_id IS NOT DISTINCT FROM $ORG::uuid ';

    const agregar = (rows, criterio) => {
        for (const r of rows) {
            if (excluirId && r.id === excluirId) continue;
            if (!matches.has(r.id)) matches.set(r.id, { id: r.id, nombre: r.nombre, apellidos: r.apellidos, estado: r.estado, criterios: new Set() });
            matches.get(r.id).criterios.add(criterio);
        }
    };

    const org = organizacionId || null;

    if (rut) {
        const hash = generateHash(cleanRut(rut));
        const { rows } = await pool.query(
            `SELECT id, nombre, apellidos, estado FROM persona WHERE rut_hash = $1 AND activo${orgSqlSimple.replace('$ORG', '$2')}`,
            [hash, org]);
        agregar(rows, 'rut');
    }
    for (const c of correos.filter(Boolean)) {
        const { rows } = await pool.query(
            `SELECT p.id, p.nombre, p.apellidos, p.estado FROM persona p JOIN persona_correo pc ON pc.persona_id = p.id WHERE pc.correo_norm = $1 AND p.activo${orgSql.replace('$ORG', '$2')}`,
            [String(c).trim().toLowerCase(), org]);
        agregar(rows, 'correo');
    }
    for (const t of telefonos.filter(Boolean)) {
        const norm = normalizarTelefono(t);
        if (norm.length < 8) continue;
        const { rows } = await pool.query(
            `SELECT p.id, p.nombre, p.apellidos, p.estado FROM persona p JOIN persona_telefono pt ON pt.persona_id = p.id WHERE pt.telefono_norm = $1 AND p.activo${orgSql.replace('$ORG', '$2')}`,
            [norm, org]);
        agregar(rows, 'telefono');
    }
    if (nombre && apellidos) {
        const { rows } = await pool.query(
            `SELECT id, nombre, apellidos, estado FROM persona WHERE activo AND lower(nombre) = lower($1) AND lower(coalesce(apellidos,'')) = lower($2)${orgSqlSimple.replace('$ORG', '$3')}`,
            [nombre.trim(), apellidos.trim(), org]);
        agregar(rows, 'nombre');
    }

    return Array.from(matches.values()).map(m => ({ ...m, criterios: Array.from(m.criterios) }));
};

// GET /personas/duplicados?rut=&correo=&telefono=&nombre=&apellidos=
export const buscarDuplicadosCRM = async (req, res) => {
    try {
        const { rut, correo, telefono, nombre, apellidos } = req.query;
        // Nunca se buscan coincidencias fuera de la organización del usuario.
        const matches = await buscarCoincidencias({
            rut,
            correos: correo ? [correo] : [],
            telefonos: telefono ? [telefono] : [],
            nombre, apellidos
        }, null, req.user?.organizacionId || null);
        return res.json({ success: true, duplicados: matches });
    } catch (error) {
        console.error('❌ Error buscando duplicados:', error.message);
        return res.status(500).json({ success: false, message: 'Error al buscar duplicados.' });
    }
};

// ============================================================
// CREAR PERSONA / CLIENTE
// ============================================================
export const crearPersona = async (req, res) => {
    const client = await pool.connect();
    try {
        const {
            nombre, segundoNombre, apellidos, fechaNacimiento, rut,
            telefonos = [], correos = [],
            direccion, comuna, region, rubro, observaciones,
            origen = 'manual', ejecutivoId, empresaId,
            etiquetas = [], serviciosInteres = [],
            proximoContacto,
            necesidad, estadoComercial, accionSiguiente,
            forzar = false
        } = req.body;

        // Limpieza de listas (acepta string único o array)
        const tels = (Array.isArray(telefonos) ? telefonos : [telefonos]).map(t => String(t || '').trim()).filter(Boolean);
        const mails = (Array.isArray(correos) ? correos : [correos]).map(c => String(c || '').trim()).filter(Boolean);

        // Regla: se puede crear con UN solo dato (nombre | teléfono | correo | rut)
        if (!nombre?.trim() && !rut?.trim() && tels.length === 0 && mails.length === 0) {
            return res.status(400).json({ success: false, message: 'Debes ingresar al menos un dato: nombre, teléfono, correo o RUT.' });
        }

        // Validaciones de formato
        if (rut?.trim() && !validarRutDV(rut)) {
            return res.status(400).json({ success: false, message: 'El RUT no es válido (dígito verificador incorrecto).' });
        }
        for (const c of mails) {
            if (!validarCorreo(c)) return res.status(400).json({ success: false, message: `Correo inválido: ${c}` });
        }
        for (const t of tels) {
            if (!validarTelefono(t)) return res.status(400).json({ success: false, message: `Teléfono inválido (mínimo 8 dígitos): ${t}` });
        }

        const organizacionId = req.user?.organizacionId || null;

        // Detección de duplicados dentro de la organización (salvo que el usuario fuerce)
        const duplicados = await buscarCoincidencias({ rut, correos: mails, telefonos: tels, nombre, apellidos }, null, organizacionId);
        if (duplicados.length > 0 && !forzar) {
            return res.status(409).json({ success: false, message: 'Posible cliente duplicado.', duplicados });
        }

        await client.query('BEGIN');

        const rutEncrypted = rut?.trim() ? encrypt(cleanRut(rut)) : null;
        const rutHash = rut?.trim() ? generateHash(cleanRut(rut)) : null;

        const insertPersona = await client.query(
            `INSERT INTO persona
                (nombre, segundo_nombre, apellidos, fecha_nacimiento, rut_encrypted, rut_hash,
                 estado, origen, rubro, direccion, comuna, region, ejecutivo_id, observaciones,
                 organizacion_id, proximo_contacto, creado_por,
                 necesidad, estado_comercial, accion_siguiente, fecha_ultimo_contacto)
             VALUES ($1,$2,$3,$4,$5,$6,'prospecto',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW())
             RETURNING id, nombre, segundo_nombre, apellidos, estado, origen, created_at`,
            [
                nombre?.trim() || null, segundoNombre?.trim() || null, apellidos?.trim() || null,
                fechaNacimiento || null, rutEncrypted, rutHash,
                ['manual','whatsapp','correo','web','import','integracion'].includes(origen) ? origen : 'manual',
                rubro?.trim() || null, direccion?.trim() || null, comuna?.trim() || null, region?.trim() || null,
                // DUEÑO. Si no se indica uno, queda a nombre de quien lo crea.
                //
                // Antes esto guardaba null cuando el formulario no mandaba
                // ejecutivo, y así 3 de los 4 prospectos que había en el sistema
                // terminaron sin dueño: no aparecían en la cartera de nadie y
                // nadie los llamaba. Un prospecto sin dueño es un prospecto
                // perdido, así que ya no se permite que nazca así.
                ejecutivoId || req.user?.usuarioId || null,
                observaciones?.trim() || null,
                organizacionId,
                proximoContacto || null,
                // Quién lo dio de alta. Es historia: no cambia aunque el
                // prospecto se traspase después a otra persona.
                req.user?.usuarioId || null,
                necesidad?.trim() || null, estadoComercial?.trim() || null, accionSiguiente?.trim() || null
            ]
        );
        const persona = insertPersona.rows[0];

        // Teléfonos
        for (let i = 0; i < tels.length; i++) {
            await client.query(
                `INSERT INTO persona_telefono (persona_id, telefono, telefono_norm, principal) VALUES ($1,$2,$3,$4)`,
                [persona.id, tels[i], normalizarTelefono(tels[i]), i === 0]
            );
        }
        // Correos
        for (let i = 0; i < mails.length; i++) {
            await client.query(
                `INSERT INTO persona_correo (persona_id, correo, correo_norm, principal) VALUES ($1,$2,$3,$4)`,
                [persona.id, mails[i], mails[i].toLowerCase(), i === 0]
            );
        }
        // Vínculo con empresa (opcional)
        if (empresaId) {
            await client.query(
                `INSERT INTO persona_empresa (persona_id, empresa_id, principal) VALUES ($1,$2,TRUE)
                 ON CONFLICT (persona_id, empresa_id) DO NOTHING`,
                [persona.id, empresaId]
            );
        }
        // Etiquetas y servicios de interés
        await setEtiquetas(client, persona.id, etiquetas);
        await setServiciosInteres(client, persona.id, serviciosInteres);

        // Historial de estado inicial
        await client.query(
            `INSERT INTO persona_estado_historial (persona_id, estado_anterior, estado_nuevo, motivo, usuario_id, usuario_nombre)
             VALUES ($1, NULL, 'prospecto', 'Alta manual', $2, $3)`,
            [persona.id, req.user?.usuarioId || null, req.user?.nombre || null]
        );
        // Si se forzó pese a duplicados, dejar rastro
        if (duplicados.length > 0 && forzar) {
            for (const d of duplicados) {
                await client.query(
                    `INSERT INTO duplicado_potencial (persona_id, match_persona_id, criterio) VALUES ($1,$2,$3)`,
                    [persona.id, d.id, d.criterios[0] || null]
                );
            }
        }

        await client.query('COMMIT');
        return res.status(201).json({ success: true, persona });
    } catch (error) {
        await client.query('ROLLBACK');
        // El RUT es único dentro de la organización: si otro usuario del mismo
        // despacho ya lo registró, el prospecto puede no estar a la vista.
        if (error.code === '23505') {
            return res.status(409).json({
                success: false,
                message: 'Ese RUT ya está registrado en tu organización (puede pertenecer a la cartera de otro usuario).'
            });
        }
        console.error('❌ Error creando persona:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo crear el cliente.' });
    } finally {
        client.release();
    }
};

// ============================================================
// LISTAR PERSONAS
// ============================================================
// CÓMO SE ORDENA LA LISTA
//
// Por omisión salía siempre lo más nuevo primero, y con 128 prospectos que ya
// tienen fecha de próximo contacto cargada eso no responde la pregunta del
// vendedor, que es «¿a quién llamo hoy?». Ordenar por esa fecha convierte la
// lista en la agenda del día.
//
// El orden va en un DICCIONARIO y no se concatena lo que llegue en la URL:
// `ORDER BY` no admite parámetros, así que meter texto de la petición ahí
// directamente sería una inyección de SQL de manual. Lo que no esté en esta
// lista cae al orden por omisión.
//
// NULLS LAST en el orden por contacto: un prospecto sin fecha no es urgente,
// es que nadie la puso. Arriba estorbaría justo a quien vino a ver qué toca hoy.
const ORDEN_PERSONAS = {
    recientes: 'p.created_at DESC',
    contacto:  'p.proximo_contacto ASC NULLS LAST, p.created_at DESC',
    contacto_lejano: 'p.proximo_contacto DESC NULLS LAST, p.created_at DESC',
    nombre:    'LOWER(p.nombre) ASC, LOWER(COALESCE(p.apellidos, \'\')) ASC',
    ultimo:    'p.fecha_ultimo_contacto DESC NULLS LAST',
};

export const listarPersonas = async (req, res) => {
    try {
        const { estado, q, ejecutivo, orden } = req.query;
        const organizacionId = req.user?.organizacionId || null;
        const where = ['p.activo'];
        const params = [];
        // Aislamiento por organización (ningún despacho ve prospectos de otro).
        // Se aplica siempre: con organizacion_id NULL la cuenta solo ve las
        // fichas que también son NULL, nunca las del resto.
        params.push(organizacionId);
        where.push(`p.organizacion_id IS NOT DISTINCT FROM $${params.length}::uuid`);
        // Cuaderno propio: el usuario ve lo que creó y lo que le asignaron.
        // El Administrador ve la cartera completa de su organización.
        if (!esAdmin(req)) {
            params.push(req.user?.usuarioId || null);
            where.push(`(p.creado_por = $${params.length} OR p.ejecutivo_id = $${params.length})`);
        }
        if (estado && ['prospecto', 'activo', 'inactivo', 'perdido'].includes(estado)) {
            params.push(estado);
            where.push(`p.estado = $${params.length}`);
        }
        // "Mi cartera": filtra por el ejecutivo indicado
        if (ejecutivo) {
            params.push(ejecutivo);
            where.push(`p.ejecutivo_id = $${params.length}`);
        }
        const result = await pool.query(
            `SELECT p.id, p.nombre, p.segundo_nombre, p.apellidos, p.estado, p.origen,
                    p.rubro, p.comuna, p.region, p.rut_encrypted, p.created_at, p.observaciones,
                    p.ejecutivo_id, p.proximo_contacto, p.fecha_ultimo_contacto,
                    p.necesidad, p.estado_comercial, p.accion_siguiente,
                    u.nombre AS ejecutivo_nombre,
                    COALESCE(json_agg(DISTINCT pt.telefono) FILTER (WHERE pt.id IS NOT NULL), '[]') AS telefonos,
                    COALESCE(json_agg(DISTINCT pc.correo) FILTER (WHERE pc.id IS NOT NULL), '[]') AS correos
             FROM persona p
             LEFT JOIN persona_telefono pt ON pt.persona_id = p.id
             LEFT JOIN persona_correo pc ON pc.persona_id = p.id
             LEFT JOIN usuario u ON u.id = p.ejecutivo_id
             WHERE ${where.join(' AND ')}
             GROUP BY p.id, u.nombre
             ORDER BY ${ORDEN_PERSONAS[orden] || ORDEN_PERSONAS.recientes}`,
            params
        );

        const term = (q || '').trim().toLowerCase();
        const personas = result.rows.map(r => {
            const nombreCompleto = [r.nombre, r.segundo_nombre, r.apellidos].filter(Boolean).join(' ');
            return {
                id: r.id,
                nombre: r.nombre,
                segundoNombre: r.segundo_nombre,
                apellidos: r.apellidos,
                nombreCompleto,
                estado: r.estado,
                origen: r.origen,
                rubro: r.rubro,
                observaciones: r.observaciones,
                comuna: r.comuna,
                region: r.region,
                rut: decryptSafe(r.rut_encrypted),
                telefonos: r.telefonos || [],
                correos: r.correos || [],
                ejecutivoId: r.ejecutivo_id,
                ejecutivoNombre: r.ejecutivo_nombre || null,
                proximoContacto: r.proximo_contacto,
                fechaUltimoContacto: r.fecha_ultimo_contacto,
                necesidad: r.necesidad,
                estadoComercial: r.estado_comercial,
                accionSiguiente: r.accion_siguiente,
                createdAt: r.created_at
            };
        }).filter(p => {
            if (!term) return true;
            return (
                p.nombreCompleto.toLowerCase().includes(term) ||
                (p.rut || '').toLowerCase().includes(term) ||
                (p.observaciones || '').toLowerCase().includes(term) ||
                (p.necesidad || '').toLowerCase().includes(term) ||
                (p.rubro || '').toLowerCase().includes(term) ||
                p.correos.some(c => c.toLowerCase().includes(term)) ||
                p.telefonos.some(t => t.replace(/\D/g, '').includes(term.replace(/\D/g, '')))
            );
        });

        return res.json({ success: true, personas, total: personas.length });
    } catch (error) {
        console.error('❌ Error listando personas:', error.message);
        return res.status(500).json({ success: false, message: 'Error al listar clientes.' });
    }
};

// ============================================================
// DETALLE DE UNA PERSONA (ficha)
// ============================================================
export const obtenerPersona = async (req, res) => {
    try {
        const { id } = req.params;
        if (!await cargarPersonaPermitida(req, id)) return res.status(404).json(NO_ENCONTRADO);
        const pRes = await pool.query(`SELECT * FROM persona WHERE id = $1`, [id]);
        if (pRes.rows.length === 0) return res.status(404).json(NO_ENCONTRADO);
        const p = pRes.rows[0];

        const [tels, mails, emps, notas, hist, etiq, servInt, ejec, reus] = await Promise.all([
            pool.query(`SELECT id, telefono, tipo, principal FROM persona_telefono WHERE persona_id = $1`, [id]),
            pool.query(`SELECT id, correo, tipo, principal FROM persona_correo WHERE persona_id = $1`, [id]),
            pool.query(`SELECT pe.empresa_id, pe.cargo, pe.principal, e.razon_social
                        FROM persona_empresa pe JOIN empresa e ON e.id = pe.empresa_id
                        WHERE pe.persona_id = $1`, [id]),
            pool.query(`SELECT id, texto, usuario_nombre, es_ia, created_at FROM nota WHERE persona_id = $1 ORDER BY created_at DESC`, [id]),
            pool.query(`SELECT estado_anterior, estado_nuevo, motivo, usuario_nombre, created_at FROM persona_estado_historial WHERE persona_id = $1 ORDER BY created_at DESC`, [id]),
            pool.query(`SELECT e.id, e.nombre FROM persona_etiqueta pe JOIN etiqueta e ON e.id = pe.etiqueta_id WHERE pe.persona_id = $1`, [id]),
            pool.query(`SELECT s.id, s.nombre FROM persona_servicio_interes psi JOIN servicio s ON s.id = psi.servicio_id WHERE psi.persona_id = $1`, [id]),
            p.ejecutivo_id ? pool.query(`SELECT nombre FROM usuario WHERE id = $1`, [p.ejecutivo_id]) : Promise.resolve({ rows: [] }),
            // LAS REUNIONES CON ESTE CLIENTE, Y LO QUE SE ACORDÓ EN ELLAS.
            // La nota de una reunión se guardaba solo en la reunión, así que al
            // mes siguiente —cuando uno busca «qué le dijimos a este cliente»—
            // había que acordarse de que hubo una reunión y en qué fecha. Acá es
            // donde se busca, así que acá tiene que estar.
            pool.query(
                `SELECT id, titulo, inicia_at, estado, notas, duracion_min
                   FROM reunion WHERE persona_id = $1
                  ORDER BY COALESCE(inicia_at, created_at) DESC
                  LIMIT 20`, [id]),
        ]);

        return res.json({
            success: true,
            persona: {
                id: p.id,
                nombre: p.nombre, segundoNombre: p.segundo_nombre, apellidos: p.apellidos,
                fechaNacimiento: p.fecha_nacimiento,
                rut: decryptSafe(p.rut_encrypted),
                estado: p.estado, origen: p.origen, rubro: p.rubro,
                direccion: p.direccion, comuna: p.comuna, region: p.region,
                observaciones: p.observaciones, ejecutivoId: p.ejecutivo_id,
                ejecutivoNombre: ejec.rows[0]?.nombre || null,
                proximoContacto: p.proximo_contacto,
                fechaUltimoContacto: p.fecha_ultimo_contacto,
                necesidad: p.necesidad,
                estadoComercial: p.estado_comercial,
                accionSiguiente: p.accion_siguiente,
                consentimiento: p.consentimiento_contacto !== false,
                etiquetas: etiq.rows.map(e => e.nombre),
                serviciosInteres: servInt.rows.map(s => ({ id: s.id, nombre: s.nombre })),
                createdAt: p.created_at,
                telefonos: tels.rows,
                correos: mails.rows,
                empresas: emps.rows.map(e => ({ empresaId: e.empresa_id, razonSocial: e.razon_social, cargo: e.cargo, principal: e.principal })),
                notas: notas.rows.map(n => ({ id: n.id, texto: n.texto, autor: n.usuario_nombre || 'Sistema', esIa: n.es_ia === true, fecha: n.created_at ? new Date(n.created_at).toLocaleString('es-CL') : '' })),
                historialEstado: hist.rows.map(h => ({ anterior: h.estado_anterior, nuevo: h.estado_nuevo, motivo: h.motivo, autor: h.usuario_nombre || 'Sistema', fecha: h.created_at ? new Date(h.created_at).toLocaleString('es-CL') : '' })),
                reuniones: reus.rows.map(r => ({
                    id: r.id, titulo: r.titulo, estado: r.estado,
                    iniciaAt: r.inicia_at, duracionMin: r.duracion_min,
                    // Lo que se acordó. Es el dato que se viene a buscar acá.
                    notas: r.notas || null,
                    fecha: r.inicia_at
                        ? new Date(r.inicia_at).toLocaleString('es-CL', {
                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                        : null,
                })),
            }
        });
    } catch (error) {
        console.error('❌ Error obteniendo persona:', error.message);
        return res.status(500).json({ success: false, message: 'Error al obtener el cliente.' });
    }
};

// ============================================================
// ACTUALIZAR DATOS DE PERSONA
// ============================================================
export const actualizarPersona = async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const {
            nombre, segundoNombre, apellidos, fechaNacimiento, rut,
            telefonos, correos, direccion, comuna, region, rubro, observaciones, ejecutivoId,
            etiquetas, serviciosInteres, proximoContacto, consentimiento,
            necesidad, estadoComercial, accionSiguiente
        } = req.body;

        if (!await cargarPersonaPermitida(req, id)) return res.status(404).json(NO_ENCONTRADO);

        if (rut?.trim() && !validarRutDV(rut)) {
            return res.status(400).json({ success: false, message: 'El RUT no es válido (dígito verificador).' });
        }

        await client.query('BEGIN');

        const rutEncrypted = rut?.trim() ? encrypt(cleanRut(rut)) : null;
        const rutHash = rut?.trim() ? generateHash(cleanRut(rut)) : null;

        // ACTUALIZACIÓN PARCIAL: solo se escriben los campos que VIENEN.
        //
        // Antes esta consulta escribía TODAS las columnas de corrido, así que una
        // petición con un solo campo —corregir «qué necesita» desde la lista, por
        // ejemplo— dejaba en NULL apellidos, rubro, dirección, comuna, región,
        // observaciones, ejecutivo, próximo contacto y estado comercial. Con la
        // ficha completa no se notaba porque siempre mandaba todo; en cuanto algo
        // manda un campo suelto, borra el resto del prospecto sin avisar.
        //
        // Se distingue «no lo mandó» de «lo mandó vacío»: mandar un campo en
        // blanco a propósito TIENE que poder borrarlo.
        const sets = [];
        const vals = [];
        const poner = (columna, valor) => { vals.push(valor); sets.push(`${columna} = $${vals.length}`); };
        const texto = (v) => (v === null ? null : (String(v).trim() || null));

        if (nombre !== undefined && nombre?.trim()) poner('nombre', nombre.trim());
        if (segundoNombre !== undefined)  poner('segundo_nombre', texto(segundoNombre));
        if (apellidos !== undefined)      poner('apellidos', texto(apellidos));
        if (fechaNacimiento !== undefined) poner('fecha_nacimiento', fechaNacimiento || null);
        if (rutEncrypted) { poner('rut_encrypted', rutEncrypted); poner('rut_hash', rutHash); }
        if (rubro !== undefined)          poner('rubro', texto(rubro));
        if (direccion !== undefined)      poner('direccion', texto(direccion));
        if (comuna !== undefined)         poner('comuna', texto(comuna));
        if (region !== undefined)         poner('region', texto(region));
        if (observaciones !== undefined)  poner('observaciones', texto(observaciones));
        if (ejecutivoId !== undefined)    poner('ejecutivo_id', ejecutivoId || null);
        if (proximoContacto !== undefined) poner('proximo_contacto', proximoContacto || null);
        if (consentimiento !== undefined) poner('consentimiento_contacto', !!consentimiento);
        if (necesidad !== undefined)      poner('necesidad', texto(necesidad));
        if (estadoComercial !== undefined) poner('estado_comercial', texto(estadoComercial));
        if (accionSiguiente !== undefined) poner('accion_siguiente', texto(accionSiguiente));

        if (sets.length > 0) {
            vals.push(id);
            await client.query(
                `UPDATE persona SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${vals.length}`,
                vals);
        }

        // Reemplazar teléfonos / correos si vienen
        if (Array.isArray(telefonos)) {
            await client.query(`DELETE FROM persona_telefono WHERE persona_id = $1`, [id]);
            const tels = telefonos.map(t => String(t || '').trim()).filter(Boolean);
            for (let i = 0; i < tels.length; i++) {
                await client.query(`INSERT INTO persona_telefono (persona_id, telefono, telefono_norm, principal) VALUES ($1,$2,$3,$4)`,
                    [id, tels[i], normalizarTelefono(tels[i]), i === 0]);
            }
        }
        if (Array.isArray(correos)) {
            await client.query(`DELETE FROM persona_correo WHERE persona_id = $1`, [id]);
            const mails = correos.map(c => String(c || '').trim()).filter(Boolean);
            for (let i = 0; i < mails.length; i++) {
                await client.query(`INSERT INTO persona_correo (persona_id, correo, correo_norm, principal) VALUES ($1,$2,$3,$4)`,
                    [id, mails[i], mails[i].toLowerCase(), i === 0]);
            }
        }

        if (etiquetas !== undefined) await setEtiquetas(client, id, etiquetas);
        if (serviciosInteres !== undefined) await setServiciosInteres(client, id, serviciosInteres);

        await client.query('COMMIT');
        return res.json({ success: true, message: 'Cliente actualizado.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error actualizando persona:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo actualizar el cliente.' });
    } finally {
        client.release();
    }
};

// ============================================================
// NOTAS
// ============================================================
export const agregarNotaPersona = async (req, res) => {
    try {
        const { id } = req.params;
        const { texto } = req.body;
        if (!texto || !texto.trim()) return res.status(400).json({ success: false, message: 'La nota no puede estar vacía.' });
        if (!await cargarPersonaPermitida(req, id)) return res.status(404).json(NO_ENCONTRADO);
        const result = await pool.query(
            `INSERT INTO nota (persona_id, texto, usuario_id, usuario_nombre, es_ia)
             VALUES ($1,$2,$3,$4,FALSE) RETURNING id, texto, usuario_nombre, created_at`,
            [id, texto.trim(), req.user?.usuarioId || null, req.user?.nombre || null]
        );
        // Registrar una nota cuenta como contacto → actualiza la fecha de último contacto.
        await pool.query(`UPDATE persona SET fecha_ultimo_contacto = NOW() WHERE id = $1`, [id]);
        const n = result.rows[0];
        return res.json({
            success: true,
            nota: { id: n.id, texto: n.texto, autor: n.usuario_nombre || 'Sistema', esIa: false, fecha: n.created_at ? new Date(n.created_at).toLocaleString('es-CL') : '' }
        });
    } catch (error) {
        console.error('❌ Error agregando nota:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo guardar la nota.' });
    }
};

// ============================================================
// ELIMINAR (borrado físico definitivo — cascada a tablas relacionadas)
// ============================================================
export const eliminarPersona = async (req, res) => {
    try {
        const { id } = req.params;
        if (!await cargarPersonaPermitida(req, id)) return res.status(404).json(NO_ENCONTRADO);
        const result = await pool.query(`DELETE FROM persona WHERE id = $1 RETURNING id`, [id]);
        if (result.rows.length === 0) return res.status(404).json(NO_ENCONTRADO);
        return res.json({ success: true, message: 'Cliente eliminado definitivamente.' });
    } catch (error) {
        console.error('❌ Error eliminando persona:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo eliminar el cliente.' });
    }
};

// ============================================================
// CAMBIO DE ESTADO (manual, con historial)
// ============================================================
export const cambiarEstadoPersona = async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { estado, motivo } = req.body;
        if (!['prospecto', 'activo', 'inactivo', 'perdido'].includes(estado)) {
            return res.status(400).json({ success: false, message: 'Estado inválido.' });
        }
        const permitida = await cargarPersonaPermitida(req, id, client);
        if (!permitida) return res.status(404).json(NO_ENCONTRADO);
        const anterior = permitida.estado;
        if (anterior === estado) return res.status(400).json({ success: false, message: 'El cliente ya está en ese estado.' });

        await client.query('BEGIN');
        await client.query(`UPDATE persona SET estado = $1, updated_at = NOW() WHERE id = $2`, [estado, id]);
        await client.query(
            `INSERT INTO persona_estado_historial (persona_id, estado_anterior, estado_nuevo, motivo, usuario_id, usuario_nombre)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [id, anterior, estado, motivo?.trim() || 'Cambio manual', req.user?.usuarioId || null, req.user?.nombre || null]
        );
        await client.query('COMMIT');
        return res.json({ success: true, estado });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error cambiando estado:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo cambiar el estado.' });
    } finally {
        client.release();
    }
};

// ============================================================
// CATÁLOGOS (etiquetas, ejecutivos, servicios) para los formularios
// ============================================================
export const catalogosCRM = async (req, res) => {
    try {
        // Los ejecutivos asignables son los de la propia organización.
        const org = req.user?.organizacionId || null;
        const [etiq, ejec, serv] = await Promise.all([
            pool.query(`SELECT id, nombre, color FROM etiqueta ORDER BY nombre`),
            pool.query(
                `SELECT id, nombre FROM usuario
                 WHERE activo = true AND organizacion_id IS NOT DISTINCT FROM $1::uuid
                 ORDER BY nombre`, [org]),
            pool.query(`SELECT id, nombre, categoria FROM servicio
                 WHERE activo = true AND organizacion_id IS NOT DISTINCT FROM $1::uuid
                 ORDER BY nombre`, [org]),
        ]);
        // ESTADO DEL CLIENTE · LISTA CERRADA (definida por Felipe el 31-08-2026).
        //
        // Antes esta lista se armaba sumando los valores YA USADOS en la base, así
        // que cada texto que alguien escribía se volvía una opción nueva y la lista
        // crecía sola. Terminó con 65 valores distintos para 133 prospectos: dejó de
        // servir para filtrar, y peor, se usó de libreta —había RUT y claves del SII
        // de clientes escritos ahí, a la vista de cualquiera—. Los 80 textos que
        // había se movieron a las observaciones del prospecto el 31-08 y el campo
        // quedó limpio.
        //
        // Por eso la lista es FIJA y no se alimenta de lo escrito: si vuelve a sumar
        // lo usado, vuelve el mismo problema. Para agregar un estado se agrega acá.
        // Lo que no es un estado —un recordatorio, una nota de la conversación— va a
        // las observaciones o a la agenda de acciones, que para eso están.
        const estadosComerciales = [
            'Por contactar', 'En conversación', 'Reunión',
            'Propuesta enviada', 'Ganado', 'Perdido', 'En pausa',
        ];
        return res.json({
            success: true,
            etiquetas: etiq.rows,
            ejecutivos: ejec.rows.map(u => ({ id: u.id, nombre: u.nombre })),
            servicios: serv.rows.map(s => ({ id: s.id, nombre: s.nombre, categoria: s.categoria })),
            estadosComerciales,
            accionesSugeridas: ['Llamar', 'Enviar WhatsApp', 'Enviar correo', 'Agendar reunión', 'Hacer seguimiento'],
        });
    } catch (error) {
        console.error('❌ Error catálogos CRM:', error.message);
        return res.status(500).json({ success: false, message: 'Error al cargar catálogos.' });
    }
};

// Lista liviana de empresas (para asociar a una persona)
export const empresasLista = async (req, res) => {
    try {
        const q = (req.query.q || '').trim().toLowerCase();
        // Solo empresas de la organización del usuario.
        const { rows } = await pool.query(
            `SELECT id, razon_social FROM empresa
             WHERE organizacion_id IS NOT DISTINCT FROM $1::uuid
             ORDER BY razon_social`,
            [req.user?.organizacionId || null]
        );
        let empresas = rows.map(e => ({ id: e.id, razonSocial: e.razon_social }));
        if (q) empresas = empresas.filter(e => (e.razonSocial || '').toLowerCase().includes(q));
        return res.json({ success: true, empresas: empresas.slice(0, 50) });
    } catch (error) {
        console.error('❌ Error empresas lista:', error.message);
        return res.status(500).json({ success: false, message: 'Error al cargar empresas.' });
    }
};

// Editar una nota existente
export const editarNotaPersona = async (req, res) => {
    try {
        const { notaId } = req.params;
        const { texto } = req.body;
        if (!texto || !texto.trim()) return res.status(400).json({ success: false, message: 'La nota no puede estar vacía.' });
        // La nota se identifica sola: hay que subir hasta su persona para
        // comprobar que la ficha es del usuario.
        const duenio = await pool.query(`SELECT persona_id FROM nota WHERE id = $1`, [notaId]);
        const personaId = duenio.rows[0]?.persona_id;
        if (!personaId || !await cargarPersonaPermitida(req, personaId)) {
            return res.status(404).json({ success: false, message: 'Nota no encontrada.' });
        }
        const result = await pool.query(
            `UPDATE nota SET texto = $1, updated_at = NOW() WHERE id = $2 RETURNING id`,
            [texto.trim(), notaId]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Nota no encontrada.' });
        return res.json({ success: true });
    } catch (error) {
        console.error('❌ Error editando nota:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo editar la nota.' });
    }
};

// Eliminar una nota de prospecto (mismo control de dueño que editar)
export const eliminarNotaPersona = async (req, res) => {
    try {
        const { notaId } = req.params;
        const duenio = await pool.query(`SELECT persona_id FROM nota WHERE id = $1`, [notaId]);
        const personaId = duenio.rows[0]?.persona_id;
        if (!personaId || !await cargarPersonaPermitida(req, personaId)) {
            return res.status(404).json({ success: false, message: 'Nota no encontrada.' });
        }
        await pool.query(`DELETE FROM nota WHERE id = $1`, [notaId]);
        return res.json({ success: true });
    } catch (error) {
        console.error('❌ Error eliminando nota:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo eliminar la nota.' });
    }
};

// Asociar una empresa a la persona
export const asociarEmpresa = async (req, res) => {
    try {
        const { id } = req.params;
        const { empresaId, cargo, principal } = req.body;
        if (!empresaId) return res.status(400).json({ success: false, message: 'Debe indicar la empresa.' });
        if (!await cargarPersonaPermitida(req, id)) return res.status(404).json(NO_ENCONTRADO);
        // La empresa también debe ser de la organización del usuario.
        const emp = await pool.query(
            `SELECT id FROM empresa WHERE id = $1 AND organizacion_id IS NOT DISTINCT FROM $2::uuid`,
            [empresaId, req.user?.organizacionId || null]
        );
        if (emp.rows.length === 0) return res.status(404).json({ success: false, message: 'Empresa no encontrada.' });
        await pool.query(
            `INSERT INTO persona_empresa (persona_id, empresa_id, cargo, principal)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (persona_id, empresa_id) DO UPDATE SET cargo = EXCLUDED.cargo, principal = EXCLUDED.principal`,
            [id, empresaId, cargo?.trim() || null, principal === true]
        );
        return res.json({ success: true });
    } catch (error) {
        console.error('❌ Error asociando empresa:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo asociar la empresa.' });
    }
};

// Crear una empresa nueva (o reusar por RUT) y asociarla a la persona
export const crearEmpresaParaPersona = async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params; // persona
        const { razonSocial, rut, giro, regimen } = req.body;
        if (!razonSocial?.trim()) return res.status(400).json({ success: false, message: 'La razón social es obligatoria.' });
        if (!rut?.trim() || !validarRutDV(rut)) return res.status(400).json({ success: false, message: 'El RUT de la empresa no es válido.' });
        if (!await cargarPersonaPermitida(req, id)) return res.status(404).json(NO_ENCONTRADO);

        const rutHash = generateHash(cleanRut(rut));
        await client.query('BEGIN');

        // Datos de la persona: se traspasan a la empresa como contacto y representante legal.
        // Sin esto la empresa nace "sin contacto" y la tabla de Clientes la clasifica como inactiva.
        const perRes = await client.query(
            `SELECT nombre, segundo_nombre, apellidos, rut_encrypted, direccion, comuna, region
             FROM persona WHERE id = $1`, [id]
        );
        const per = perRes.rows[0] || {};
        const nombreCompleto = [per.nombre, per.segundo_nombre, per.apellidos].filter(Boolean).join(' ') || null;
        const rutPersona = decryptSafe(per.rut_encrypted);
        const correoRes = await client.query('SELECT correo FROM persona_correo WHERE persona_id = $1 LIMIT 1', [id]);
        const telRes = await client.query('SELECT telefono FROM persona_telefono WHERE persona_id = $1 LIMIT 1', [id]);
        const correoPersona = correoRes.rows[0]?.correo || null;
        const telPersona = telRes.rows[0]?.telefono || null;

        // Multi-tenant: la empresa nace en la organización del usuario. Sin esto,
        // getClientesCRM (que filtra por organizacion_id) nunca la mostraría.
        const organizacionId = req.user?.organizacionId || null;

        // Reusar empresa existente por RUT — solo dentro de la MISMA organización
        let emp = await client.query(
            `SELECT id, razon_social FROM empresa
             WHERE rut_hash = $1 AND organizacion_id IS NOT DISTINCT FROM $2`,
            [rutHash, organizacionId]
        );
        let empresaId, razon, reusada = false;
        if (emp.rows.length) {
            empresaId = emp.rows[0].id; razon = emp.rows[0].razon_social; reusada = true;
        } else {
            const ins = await client.query(
                `INSERT INTO empresa (
                    razon_social, rut_encrypted, rut_hash, giro, regimen_tributario,
                    nombre_rep, rut_rep_encrypted, rut_rep_hash,
                    email_corporativo, telefono_corporativo, organizacion_id
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, razon_social`,
                [
                    razonSocial.trim(), encrypt(cleanRut(rut)), rutHash,
                    giro?.trim() || 'Sin especificar', regimen?.trim() || 'Sin especificar',
                    nombreCompleto,
                    rutPersona ? encrypt(cleanRut(rutPersona)) : null,
                    rutPersona ? generateHash(cleanRut(rutPersona)) : null,
                    correoPersona,
                    telPersona,
                    organizacionId
                ]
            );
            empresaId = ins.rows[0].id; razon = ins.rows[0].razon_social;

            // Filas necesarias para que luego se puedan editar claves y dirección desde la ficha
            await client.query(
                `INSERT INTO empresa_credenciales
                    (empresa_id, sii_rut_encrypted, sii_email_encrypted, sii_password_encrypted, web_password_encrypted)
                 VALUES ($1, '', '', '', '')`,
                [empresaId]
            );
            await client.query(
                `INSERT INTO sucursal (empresa_id, direccion, comuna, ciudad, es_casa_matriz)
                 VALUES ($1, $2, $3, $4, TRUE)`,
                [empresaId, per.direccion?.trim() || 'Sin dirección', per.comuna?.trim() || 'Sin especificar', per.region?.trim() || 'Sin especificar']
            );
            if (req.user?.usuarioId) {
                await client.query(
                    `INSERT INTO audita (usuario_id, empresa_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                    [req.user.usuarioId, empresaId]
                );
            }
        }

        const cnt = await client.query('SELECT COUNT(*)::int AS n FROM persona_empresa WHERE persona_id = $1', [id]);
        await client.query(
            `INSERT INTO persona_empresa (persona_id, empresa_id, principal)
             VALUES ($1,$2,$3) ON CONFLICT (persona_id, empresa_id) DO NOTHING`,
            [id, empresaId, cnt.rows[0].n === 0]
        );

        // Si la persona tiene empresa, es cliente: la pasamos a 'activo' y dejamos rastro.
        const cur = await client.query('SELECT estado FROM persona WHERE id = $1', [id]);
        const anterior = cur.rows[0]?.estado;
        let convertida = false;
        if (anterior && anterior !== 'activo') {
            await client.query(`UPDATE persona SET estado = 'activo', updated_at = NOW() WHERE id = $1`, [id]);
            await client.query(
                `INSERT INTO persona_estado_historial (persona_id, estado_anterior, estado_nuevo, motivo, usuario_id, usuario_nombre)
                 VALUES ($1,$2,'activo',$3,$4,$5)`,
                [id, anterior, `Convertido a cliente al ${reusada ? 'asociar' : 'crear'} la empresa ${razon}`,
                 req.user?.usuarioId || null, req.user?.nombre || null]
            );
            convertida = true;
        }

        await client.query('COMMIT');
        return res.json({
            success: true,
            empresa: { empresaId, razonSocial: razon, reusada },
            estado: 'activo',
            convertida
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error creando empresa para persona:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo crear la empresa.' });
    } finally {
        client.release();
    }
};

export const desasociarEmpresa = async (req, res) => {
    try {
        const { id, empresaId } = req.params;
        if (!await cargarPersonaPermitida(req, id)) return res.status(404).json(NO_ENCONTRADO);
        await pool.query(`DELETE FROM persona_empresa WHERE persona_id = $1 AND empresa_id = $2`, [id, empresaId]);
        return res.json({ success: true });
    } catch (error) {
        console.error('❌ Error desasociando empresa:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo quitar la empresa.' });
    }
};

// Fusionar: absorbe `duplicadoId` dentro de `id` (objetivo) y elimina el duplicado
export const fusionarPersona = async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;            // objetivo (se conserva)
        const { duplicadoId } = req.body;     // se absorbe y elimina
        if (!duplicadoId || duplicadoId === id) {
            return res.status(400).json({ success: false, message: 'Indica un duplicado distinto para fusionar.' });
        }
        // Ambas fichas deben ser del usuario: no se absorbe la cartera ajena.
        if (!await cargarPersonaPermitida(req, id, client)) return res.status(404).json(NO_ENCONTRADO);
        if (!await cargarPersonaPermitida(req, duplicadoId, client)) return res.status(404).json(NO_ENCONTRADO);

        await client.query('BEGIN');
        // Mover datos relacionados al objetivo
        await client.query(`UPDATE persona_telefono SET persona_id = $1 WHERE persona_id = $2`, [id, duplicadoId]);
        await client.query(`UPDATE persona_correo  SET persona_id = $1 WHERE persona_id = $2`, [id, duplicadoId]);
        await client.query(`UPDATE nota            SET persona_id = $1 WHERE persona_id = $2`, [id, duplicadoId]);
        // persona_empresa puede chocar por PK (persona_id, empresa_id): mover solo las que no existan
        await client.query(
            `UPDATE persona_empresa pe SET persona_id = $1
             WHERE pe.persona_id = $2
               AND NOT EXISTS (SELECT 1 FROM persona_empresa x WHERE x.persona_id = $1 AND x.empresa_id = pe.empresa_id)`,
            [id, duplicadoId]
        );
        await client.query(`UPDATE persona_etiqueta pe SET persona_id = $1
             WHERE pe.persona_id = $2 AND NOT EXISTS (SELECT 1 FROM persona_etiqueta x WHERE x.persona_id = $1 AND x.etiqueta_id = pe.etiqueta_id)`, [id, duplicadoId]);
        await client.query(`UPDATE persona_servicio_interes psi SET persona_id = $1
             WHERE psi.persona_id = $2 AND NOT EXISTS (SELECT 1 FROM persona_servicio_interes x WHERE x.persona_id = $1 AND x.servicio_id = psi.servicio_id)`, [id, duplicadoId]);
        // Registrar y eliminar el duplicado
        await client.query(
            `INSERT INTO nota (persona_id, texto, usuario_id, usuario_nombre, es_ia)
             VALUES ($1, $2, $3, $4, FALSE)`,
            [id, `Fusionado con un registro duplicado.`, req.user?.usuarioId || null, req.user?.nombre || null]
        );
        await client.query(`DELETE FROM persona WHERE id = $1`, [duplicadoId]);
        await client.query('COMMIT');
        return res.json({ success: true, message: 'Registros fusionados.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error fusionando personas:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo fusionar.' });
    } finally {
        client.release();
    }
};

// ============================================================
// AGENDA DE ACCIONES DEL PROSPECTO  (pedidos de Mati #5, #6, #7)
// ------------------------------------------------------------
// Cada acción es algo que hay que hacer con el prospecto: llamar, reunión,
// seguimiento… con su fecha/hora y una nota. La "próxima acción" del prospecto
// (persona.proximo_contacto + accion_siguiente) se mantiene en sincronía con la
// acción pendiente más cercana, así el dashboard y la lista siguen funcionando.
// ============================================================
const TIPOS_ACCION = ['llamar', 'reunion', 'seguimiento', 'prospectar', 'otro'];

// Deja en persona.proximo_contacto / accion_siguiente la acción pendiente más próxima.
const sincronizarProxima = async (client, personaId) => {
    const { rows } = await client.query(
        `SELECT tipo, titulo, fecha_hora FROM persona_accion
          WHERE persona_id = $1 AND estado = 'pendiente' AND fecha_hora IS NOT NULL
          ORDER BY fecha_hora ASC LIMIT 1`, [personaId]);
    const prox = rows[0] || null;
    await client.query(
        `UPDATE persona SET proximo_contacto = $2, accion_siguiente = $3, updated_at = NOW() WHERE id = $1`,
        [personaId, prox?.fecha_hora || null, prox ? (prox.titulo || prox.tipo) : null]);
};

export const listarAcciones = async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await pool.query(
            `SELECT a.id, a.tipo, a.titulo, a.fecha_hora AS "fechaHora", a.nota, a.estado,
                    a.completed_at AS "completedAt", u.nombre AS "creadoPor"
               FROM persona_accion a LEFT JOIN usuario u ON u.id = a.creado_por
              WHERE a.persona_id = $1
              ORDER BY (a.estado = 'pendiente') DESC, a.fecha_hora ASC NULLS LAST, a.created_at DESC`,
            [id]);
        return res.json({ success: true, acciones: rows });
    } catch (e) {
        console.error('❌ listarAcciones:', e.message);
        return res.status(500).json({ success: false, message: 'No se pudieron cargar las acciones.' });
    }
};

export const crearAccion = async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { tipo = 'llamar', titulo, fechaHora, nota } = req.body;
        const tipoOk = TIPOS_ACCION.includes(tipo) ? tipo : 'otro';
        if (!titulo?.trim() && !fechaHora && !nota?.trim()) {
            return res.status(400).json({ success: false, message: 'La acción necesita al menos un título, una fecha o una nota.' });
        }
        const p = await client.query(
            `SELECT id FROM persona WHERE id = $1 AND organizacion_id IS NOT DISTINCT FROM $2::uuid`,
            [id, req.user?.organizacionId || null]);
        if (!p.rows.length) return res.status(404).json({ success: false, message: 'Prospecto no encontrado.' });

        await client.query('BEGIN');
        const { rows } = await client.query(
            `INSERT INTO persona_accion (persona_id, tipo, titulo, fecha_hora, nota, creado_por)
             VALUES ($1,$2,$3,$4,$5,$6)
             RETURNING id, tipo, titulo, fecha_hora AS "fechaHora", nota, estado`,
            [id, tipoOk, titulo?.trim() || null, fechaHora || null, nota?.trim() || null, req.user?.usuarioId || null]);
        await sincronizarProxima(client, id);
        await client.query('COMMIT');
        return res.status(201).json({ success: true, accion: rows[0] });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('❌ crearAccion:', e.message);
        return res.status(500).json({ success: false, message: 'No se pudo crear la acción.' });
    } finally { client.release(); }
};

export const completarAccion = async (req, res) => {
    const client = await pool.connect();
    try {
        const { accionId } = req.params;
        const nuevo = req.body?.estado === 'pendiente' ? 'pendiente' : 'completada';
        await client.query('BEGIN');
        const { rows } = await client.query(
            `UPDATE persona_accion
                SET estado = $2, completed_at = CASE WHEN $2 = 'completada' THEN NOW() ELSE NULL END
              WHERE id = $1 RETURNING persona_id`,
            [accionId, nuevo]);
        if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, message: 'Acción no encontrada.' }); }
        // Completar una acción cuenta como contacto hecho.
        if (nuevo === 'completada') {
            await client.query(`UPDATE persona SET fecha_ultimo_contacto = NOW() WHERE id = $1`, [rows[0].persona_id]);
        }
        await sincronizarProxima(client, rows[0].persona_id);
        await client.query('COMMIT');
        return res.json({ success: true });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('❌ completarAccion:', e.message);
        return res.status(500).json({ success: false, message: 'No se pudo actualizar la acción.' });
    } finally { client.release(); }
};

export const eliminarAccion = async (req, res) => {
    const client = await pool.connect();
    try {
        const { accionId } = req.params;
        await client.query('BEGIN');
        const { rows } = await client.query(`DELETE FROM persona_accion WHERE id = $1 RETURNING persona_id`, [accionId]);
        if (rows.length) await sincronizarProxima(client, rows[0].persona_id);
        await client.query('COMMIT');
        return res.json({ success: true });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('❌ eliminarAccion:', e.message);
        return res.status(500).json({ success: false, message: 'No se pudo eliminar la acción.' });
    } finally { client.release(); }
};

// Crear un servicio "al vuelo" desde el formulario de prospecto (pedido #4).
// Sin duplicados: si el slug ya existe, se devuelve el que había.
export const crearServicioCRM = async (req, res) => {
    try {
        const nombre = String(req.body?.nombre || '').trim();
        if (!nombre) return res.status(400).json({ success: false, message: 'Falta el nombre del servicio.' });
        const CATS = ['Tributaria', 'Contabilidad', 'RRHH', 'Soporte', 'Legal'];
        const categoria = CATS.includes(req.body?.categoria) ? req.body.categoria : 'Soporte';
        const slug = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
        if (!slug) return res.status(400).json({ success: false, message: 'Nombre de servicio inválido.' });

        const dup = await pool.query(`SELECT id, nombre FROM servicio WHERE slug = $1`, [slug]);
        if (dup.rows.length) return res.json({ success: true, servicio: dup.rows[0], yaExistia: true });

        const { rows } = await pool.query(
            `INSERT INTO servicio (id, nombre, slug, es_critico, categoria, activo, organizacion_id)
             VALUES (gen_random_uuid(), $1, $2, false, $3, true, $4)
             RETURNING id, nombre`,
            [nombre, slug, categoria, req.user?.organizacionId || null]);
        return res.status(201).json({ success: true, servicio: rows[0] });
    } catch (e) {
        console.error('❌ crearServicioCRM:', e.message);
        return res.status(500).json({ success: false, message: 'No se pudo crear el servicio.' });
    }
};
