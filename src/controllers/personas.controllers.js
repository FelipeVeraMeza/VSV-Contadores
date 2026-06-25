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
const buscarCoincidencias = async ({ rut, correos = [], telefonos = [], nombre, apellidos }, excluirId = null) => {
    const matches = new Map(); // persona_id -> { id, nombre, criterios:Set }

    const agregar = (rows, criterio) => {
        for (const r of rows) {
            if (excluirId && r.id === excluirId) continue;
            if (!matches.has(r.id)) matches.set(r.id, { id: r.id, nombre: r.nombre, apellidos: r.apellidos, estado: r.estado, criterios: new Set() });
            matches.get(r.id).criterios.add(criterio);
        }
    };

    if (rut) {
        const hash = generateHash(cleanRut(rut));
        const { rows } = await pool.query('SELECT id, nombre, apellidos, estado FROM persona WHERE rut_hash = $1 AND activo', [hash]);
        agregar(rows, 'rut');
    }
    for (const c of correos.filter(Boolean)) {
        const { rows } = await pool.query(
            'SELECT p.id, p.nombre, p.apellidos, p.estado FROM persona p JOIN persona_correo pc ON pc.persona_id = p.id WHERE pc.correo_norm = $1 AND p.activo',
            [String(c).trim().toLowerCase()]
        );
        agregar(rows, 'correo');
    }
    for (const t of telefonos.filter(Boolean)) {
        const norm = normalizarTelefono(t);
        if (norm.length < 8) continue;
        const { rows } = await pool.query(
            'SELECT p.id, p.nombre, p.apellidos, p.estado FROM persona p JOIN persona_telefono pt ON pt.persona_id = p.id WHERE pt.telefono_norm = $1 AND p.activo',
            [norm]
        );
        agregar(rows, 'telefono');
    }
    if (nombre && apellidos) {
        const { rows } = await pool.query(
            "SELECT id, nombre, apellidos, estado FROM persona WHERE activo AND lower(nombre) = lower($1) AND lower(coalesce(apellidos,'')) = lower($2)",
            [nombre.trim(), apellidos.trim()]
        );
        agregar(rows, 'nombre');
    }

    return Array.from(matches.values()).map(m => ({ ...m, criterios: Array.from(m.criterios) }));
};

// GET /personas/duplicados?rut=&correo=&telefono=&nombre=&apellidos=
export const buscarDuplicadosCRM = async (req, res) => {
    try {
        const { rut, correo, telefono, nombre, apellidos } = req.query;
        const matches = await buscarCoincidencias({
            rut,
            correos: correo ? [correo] : [],
            telefonos: telefono ? [telefono] : [],
            nombre, apellidos
        });
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

        // Detección de duplicados (salvo que el usuario fuerce)
        const duplicados = await buscarCoincidencias({ rut, correos: mails, telefonos: tels, nombre, apellidos });
        if (duplicados.length > 0 && !forzar) {
            return res.status(409).json({ success: false, message: 'Posible cliente duplicado.', duplicados });
        }

        await client.query('BEGIN');

        const rutEncrypted = rut?.trim() ? encrypt(cleanRut(rut)) : null;
        const rutHash = rut?.trim() ? generateHash(cleanRut(rut)) : null;

        const insertPersona = await client.query(
            `INSERT INTO persona
                (nombre, segundo_nombre, apellidos, fecha_nacimiento, rut_encrypted, rut_hash,
                 estado, origen, rubro, direccion, comuna, region, ejecutivo_id, observaciones)
             VALUES ($1,$2,$3,$4,$5,$6,'prospecto',$7,$8,$9,$10,$11,$12,$13)
             RETURNING id, nombre, segundo_nombre, apellidos, estado, origen, created_at`,
            [
                nombre?.trim() || null, segundoNombre?.trim() || null, apellidos?.trim() || null,
                fechaNacimiento || null, rutEncrypted, rutHash,
                ['manual','whatsapp','correo','web','import','integracion'].includes(origen) ? origen : 'manual',
                rubro?.trim() || null, direccion?.trim() || null, comuna?.trim() || null, region?.trim() || null,
                ejecutivoId || null, observaciones?.trim() || null
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
        console.error('❌ Error creando persona:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo crear el cliente.' });
    } finally {
        client.release();
    }
};

// ============================================================
// LISTAR PERSONAS
// ============================================================
export const listarPersonas = async (req, res) => {
    try {
        const { estado, q } = req.query;
        const where = ['p.activo'];
        const params = [];
        if (estado && ['prospecto', 'activo', 'inactivo'].includes(estado)) {
            params.push(estado);
            where.push(`p.estado = $${params.length}`);
        }
        const result = await pool.query(
            `SELECT p.id, p.nombre, p.segundo_nombre, p.apellidos, p.estado, p.origen,
                    p.rubro, p.comuna, p.region, p.rut_encrypted, p.created_at,
                    COALESCE(json_agg(DISTINCT pt.telefono) FILTER (WHERE pt.id IS NOT NULL), '[]') AS telefonos,
                    COALESCE(json_agg(DISTINCT pc.correo) FILTER (WHERE pc.id IS NOT NULL), '[]') AS correos
             FROM persona p
             LEFT JOIN persona_telefono pt ON pt.persona_id = p.id
             LEFT JOIN persona_correo pc ON pc.persona_id = p.id
             WHERE ${where.join(' AND ')}
             GROUP BY p.id
             ORDER BY p.created_at DESC`,
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
                comuna: r.comuna,
                region: r.region,
                rut: decryptSafe(r.rut_encrypted),
                telefonos: r.telefonos || [],
                correos: r.correos || [],
                createdAt: r.created_at
            };
        }).filter(p => {
            if (!term) return true;
            return (
                p.nombreCompleto.toLowerCase().includes(term) ||
                (p.rut || '').toLowerCase().includes(term) ||
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
        const pRes = await pool.query(`SELECT * FROM persona WHERE id = $1`, [id]);
        if (pRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Cliente no encontrado.' });
        const p = pRes.rows[0];

        const [tels, mails, emps, notas, hist, etiq, servInt, ejec] = await Promise.all([
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
                etiquetas: etiq.rows.map(e => e.nombre),
                serviciosInteres: servInt.rows.map(s => ({ id: s.id, nombre: s.nombre })),
                createdAt: p.created_at,
                telefonos: tels.rows,
                correos: mails.rows,
                empresas: emps.rows.map(e => ({ empresaId: e.empresa_id, razonSocial: e.razon_social, cargo: e.cargo, principal: e.principal })),
                notas: notas.rows.map(n => ({ id: n.id, texto: n.texto, autor: n.usuario_nombre || 'Sistema', esIa: n.es_ia === true, fecha: n.created_at ? new Date(n.created_at).toLocaleString('es-CL') : '' })),
                historialEstado: hist.rows.map(h => ({ anterior: h.estado_anterior, nuevo: h.estado_nuevo, motivo: h.motivo, autor: h.usuario_nombre || 'Sistema', fecha: h.created_at ? new Date(h.created_at).toLocaleString('es-CL') : '' })),
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
            etiquetas, serviciosInteres
        } = req.body;

        if (rut?.trim() && !validarRutDV(rut)) {
            return res.status(400).json({ success: false, message: 'El RUT no es válido (dígito verificador).' });
        }

        await client.query('BEGIN');

        const rutEncrypted = rut?.trim() ? encrypt(cleanRut(rut)) : null;
        const rutHash = rut?.trim() ? generateHash(cleanRut(rut)) : null;

        await client.query(
            `UPDATE persona SET
                nombre = COALESCE($1, nombre),
                segundo_nombre = $2,
                apellidos = $3,
                fecha_nacimiento = $4,
                rut_encrypted = COALESCE($5, rut_encrypted),
                rut_hash = COALESCE($6, rut_hash),
                rubro = $7, direccion = $8, comuna = $9, region = $10,
                observaciones = $11, ejecutivo_id = $12,
                updated_at = NOW()
             WHERE id = $13`,
            [
                nombre?.trim() || null, segundoNombre?.trim() || null, apellidos?.trim() || null,
                fechaNacimiento || null, rutEncrypted, rutHash,
                rubro?.trim() || null, direccion?.trim() || null, comuna?.trim() || null, region?.trim() || null,
                observaciones?.trim() || null, ejecutivoId || null, id
            ]
        );

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
        const result = await pool.query(
            `INSERT INTO nota (persona_id, texto, usuario_id, usuario_nombre, es_ia)
             VALUES ($1,$2,$3,$4,FALSE) RETURNING id, texto, usuario_nombre, created_at`,
            [id, texto.trim(), req.user?.usuarioId || null, req.user?.nombre || null]
        );
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
        const result = await pool.query(`DELETE FROM persona WHERE id = $1 RETURNING id`, [id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Cliente no encontrado.' });
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
        if (!['prospecto', 'activo', 'inactivo'].includes(estado)) {
            return res.status(400).json({ success: false, message: 'Estado inválido.' });
        }
        const cur = await client.query(`SELECT estado FROM persona WHERE id = $1`, [id]);
        if (cur.rows.length === 0) return res.status(404).json({ success: false, message: 'Cliente no encontrado.' });
        const anterior = cur.rows[0].estado;
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
        const [etiq, ejec, serv] = await Promise.all([
            pool.query(`SELECT id, nombre, color FROM etiqueta ORDER BY nombre`),
            pool.query(`SELECT id, nombre FROM usuario WHERE activo = true ORDER BY nombre`),
            pool.query(`SELECT id, nombre, categoria FROM servicio WHERE activo = true ORDER BY nombre`),
        ]);
        return res.json({
            success: true,
            etiquetas: etiq.rows,
            ejecutivos: ejec.rows.map(u => ({ id: u.id, nombre: u.nombre })),
            servicios: serv.rows.map(s => ({ id: s.id, nombre: s.nombre, categoria: s.categoria })),
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
        const { rows } = await pool.query(`SELECT id, razon_social FROM empresa ORDER BY razon_social`);
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

// Asociar una empresa a la persona
export const asociarEmpresa = async (req, res) => {
    try {
        const { id } = req.params;
        const { empresaId, cargo, principal } = req.body;
        if (!empresaId) return res.status(400).json({ success: false, message: 'Debe indicar la empresa.' });
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

        const rutHash = generateHash(cleanRut(rut));
        await client.query('BEGIN');

        // Reusar empresa existente por RUT, o crearla
        let emp = await client.query('SELECT id, razon_social FROM empresa WHERE rut_hash = $1', [rutHash]);
        let empresaId, razon, reusada = false;
        if (emp.rows.length) {
            empresaId = emp.rows[0].id; razon = emp.rows[0].razon_social; reusada = true;
        } else {
            const ins = await client.query(
                `INSERT INTO empresa (razon_social, rut_encrypted, rut_hash, giro, regimen_tributario)
                 VALUES ($1,$2,$3,$4,$5) RETURNING id, razon_social`,
                [razonSocial.trim(), encrypt(cleanRut(rut)), rutHash, giro?.trim() || 'Sin especificar', regimen?.trim() || 'Sin especificar']
            );
            empresaId = ins.rows[0].id; razon = ins.rows[0].razon_social;
        }

        const cnt = await client.query('SELECT COUNT(*)::int AS n FROM persona_empresa WHERE persona_id = $1', [id]);
        await client.query(
            `INSERT INTO persona_empresa (persona_id, empresa_id, principal)
             VALUES ($1,$2,$3) ON CONFLICT (persona_id, empresa_id) DO NOTHING`,
            [id, empresaId, cnt.rows[0].n === 0]
        );
        await client.query('COMMIT');
        return res.json({ success: true, empresa: { empresaId, razonSocial: razon, reusada } });
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
        const chk = await client.query(`SELECT id FROM persona WHERE id IN ($1,$2)`, [id, duplicadoId]);
        if (chk.rows.length < 2) return res.status(404).json({ success: false, message: 'Cliente(s) no encontrado(s).' });

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
