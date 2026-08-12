// ============================================================================
// IMPORTAR PROSPECTOS DESDE PLANILLA
// ----------------------------------------------------------------------------
// Las planillas de prospección reales no vienen ordenadas. La que sirvió de
// guía (123 filas) tenía:
//
//   · el 41% de las filas SIN nombre → el teléfono es la identidad, no el nombre
//   · una columna "TELEFONO 2" que no traía teléfonos sino intentos de llamada
//     ("nc1", "nc2", "ok"): 84 de 85 valores no eran números
//   · "Estado del cliente" en texto libre: "contrató full ofv", "PROYECYO EN
//     PAUSA", "contrata ?" — 25 variantes distintas
//   · fechas como número de serie de Excel (46233 = 20-07-2026)
//
// Por eso acá no se asume nada del encabezado: el que importa dice qué columna
// es cada cosa, y este archivo se encarga de que lo que entre quede utilizable.
//
// DUEÑO: quien importa queda como ejecutivo de cada prospecto que trae. Un
// prospecto sin dueño es un prospecto que nadie llama.
// ============================================================================
import { pool } from '../database/db.js';

// --- Normalizar teléfono -----------------------------------------------------
// "56 9 9484 9335" y "+56994849335" son el mismo número. Se compara por los
// últimos 8 dígitos: es lo único estable entre formatos chilenos.
const soloDigitos = (v) => String(v ?? '').replace(/\D/g, '');
export const claveTelefono = (v) => {
    const d = soloDigitos(v);
    return d.length >= 8 ? d.slice(-8) : null;
};

const textoLimpio = (v) => {
    const t = String(v ?? '').trim();
    return t && t.toLowerCase() !== 'null' ? t : null;
};

// --- Fechas ------------------------------------------------------------------
// Excel guarda las fechas como días desde el 30-12-1899. Un 46233 suelto no es
// una fecha para nadie, así que se convierte acá.
//
// Cuando la celda viene como texto —que es lo normal en las planillas de
// prospección, porque se escriben a mano— llega en formato chileno: día
// primero. Eso NO se puede dejar en manos de `new Date()`, que lee al revés:
//
//   "6/8/2026"  → new Date lo entiende como 8 de junio, siendo el 6 de agosto
//   "26/5/2026" → new Date devuelve Invalid Date (no existe el mes 26)
//
// O sea: la mitad de las fechas quedaban corridas y la otra mitad se perdía en
// silencio. Por eso se parsea explícitamente antes de tocar `new Date`.
export const fechaDesdeExcel = (v) => {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === 'number' && Number.isFinite(v)) {
        // Rango defensivo: 20000 ≈ 1954, 60000 ≈ 2064. Fuera de ahí no es fecha.
        if (v < 20000 || v > 60000) return null;
        return new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    }

    const s = String(v).trim();
    if (!s) return null;

    // Formato chileno: d/m/aaaa, d-m-aaaa o d.m.aaaa. Año de 2 dígitos → 2000+.
    const cl = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
    if (cl) {
        const dia = Number(cl[1]);
        const mes = Number(cl[2]);
        const anio = Number(cl[3]) < 100 ? 2000 + Number(cl[3]) : Number(cl[3]);
        if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
        const d = new Date(Date.UTC(anio, mes - 1, dia));
        // Un 31/02 no revienta: Date lo corre al mes siguiente. Se descarta,
        // porque una fecha inventada agenda una llamada el día equivocado.
        return d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia ? d : null;
    }

    // Serial de Excel que llegó como texto ("46233").
    if (/^\d{4,6}$/.test(s)) return fechaDesdeExcel(Number(s));

    // ISO (2026-08-06) y cualquier otro formato que el motor sepa leer.
    const d = new Date(s);
    return isNaN(d) ? null : d;
};

// --- Intentos de llamada -----------------------------------------------------
// "nc1" = no contesta, primer intento. "ok" = se logró hablar. El asterisco lo
// usaban para marcar los que además dejaron mensaje.
export const leerIntentos = (v) => {
    const t = String(v ?? '').trim().toLowerCase();
    if (!t) return null;
    if (t === 'ok') return { contactado: true, intentos: 1, nota: 'Contactado' };
    const m = t.match(/^nc\s*(\d+)\s*(\*?)$/);
    if (m) {
        return {
            contactado: false,
            intentos: parseInt(m[1], 10),
            nota: `No contesta · ${m[1]} ${m[1] === '1' ? 'intento' : 'intentos'}${m[2] ? ' (dejó mensaje)' : ''}`,
        };
    }
    // Si trae un número largo es un teléfono de verdad mal puesto en esa columna.
    if (soloDigitos(t).length >= 8) return { telefono: t };
    return { nota: String(v).trim() };
};

// --- Estado comercial desde texto libre --------------------------------------
// No se inventa un estado: si el texto no dice nada reconocible, la persona
// queda como prospecto y el texto original se guarda tal cual. Perder el matiz
// de una nota escrita a mano es peor que no clasificar.
export const leerEstado = (v) => {
    const t = String(v ?? '').trim().toLowerCase();
    if (!t) return { estado: 'prospecto', etapa: null };
    // Un signo de pregunta cambia el sentido de la frase entera: "contrata ?"
    // no es que contrató, es que todavía no se sabe. Darlo por ganado lo saca
    // de la lista de prospectos —que filtra por ese estado— y el lead se pierde
    // de vista justo cuando había que insistirle.
    if (t.includes('?')) return { estado: 'prospecto', etapa: 'En conversación' };
    if (/contrat|pagando|acept/.test(t))       return { estado: 'activo',    etapa: 'Ganado' };
    if (/pausa|no aplica|desist|rechaz/.test(t)) return { estado: 'inactivo', etapa: 'En pausa' };
    if (/perdid|no le interes/.test(t))        return { estado: 'perdido',   etapa: 'Perdido' };
    if (/reuni/.test(t))                       return { estado: 'prospecto', etapa: 'Reunión' };
    if (/cotiz|pensarlo|viendo|preguntas|clave|enviar|whatsapp/.test(t))
                                               return { estado: 'prospecto', etapa: 'En conversación' };
    if (/vender|prospect/.test(t))             return { estado: 'prospecto', etapa: 'Por contactar' };
    return { estado: 'prospecto', etapa: null };
};

// --- Nombre ------------------------------------------------------------------
// La planilla trae "paz" o "Fernanda Colpiante" en un solo campo. Se parte en
// nombre y apellidos porque así lo guarda la tabla, sin inventar apellidos.
const partirNombre = (v) => {
    const t = textoLimpio(v);
    if (!t) return { nombre: null, apellidos: null };
    const partes = t.split(/\s+/);
    if (partes.length === 1) return { nombre: partes[0], apellidos: null };
    return { nombre: partes[0], apellidos: partes.slice(1).join(' ') };
};

const CORREO_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --- Límites ----------------------------------------------------------------
// Una planilla de prospección de verdad tiene cientos de filas, no cientos de
// miles. El tope existe para que un archivo equivocado —o una hoja con 50.000
// filas vacías arrastradas— falle con un mensaje claro en vez de dejar la
// pantalla colgada y la conexión ocupada.
const MAX_FILAS = 5000;
// Postgres NO recorta: si un valor excede el varchar, revienta la fila entera.
// Estos son los largos reales de la tabla. Recortar acá es lo que hace que una
// celda con una novela adentro pierda el final en vez de perder el prospecto.
const LARGO = {
    nombre: 150,
    apellidos: 200,
    telefono: 30,
    correo: 255,
    etapa: 120,          // estado_comercial
    accion: 120,         // accion_siguiente
    texto: 4000,         // necesidad y observaciones son TEXT; esto es orden, no obligación
};
const recorta = (v, max) => {
    if (!v) return v;
    const s = String(v);
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

/** Revisa lo que llegó antes de procesarlo. Devuelve el mensaje del problema, o null. */
const problemaCon = (filas, mapa) => {
    if (!Array.isArray(filas) || filas.length === 0) {
        return 'No llegó ninguna fila. Revisa que la planilla tenga datos.';
    }
    if (filas.length > MAX_FILAS) {
        return `La planilla trae ${filas.length.toLocaleString('es-CL')} filas y el máximo es `
             + `${MAX_FILAS.toLocaleString('es-CL')}. Divídela en partes y súbelas por separado.`;
    }
    if (!mapa || typeof mapa !== 'object') {
        return 'Falta indicar qué columna es cada cosa.';
    }
    if (!mapa.telefono && !mapa.nombre && !mapa.correo) {
        return 'Indica al menos qué columna trae el teléfono, el nombre o el correo. '
             + 'Sin ninguno de los tres no hay a quién contactar.';
    }
    return null;
};

/**
 * Convierte una fila cruda de la planilla en lo que se va a guardar.
 * `mapa` dice qué columna de la planilla es cada campo.
 * Exportado para poder probarlo sin tocar la base.
 */
export const prepararFila = (fila, mapa) => {
    const de = (campo) => (mapa[campo] ? fila[mapa[campo]] : null);

    const telPrincipal = textoLimpio(de('telefono'));
    const clave = claveTelefono(telPrincipal);

    const { nombre, apellidos } = partirNombre(de('nombre'));
    const correo = textoLimpio(de('correo'));

    const segunda = leerIntentos(de('telefono2'));
    const telefonos = [telPrincipal, segunda?.telefono].filter(Boolean);

    const estadoTexto = textoLimpio(de('estado'));
    const { estado, etapa } = leerEstado(estadoTexto);

    // Todo lo que no cabe en una columna se conserva como observación. La
    // planilla es el registro de trabajo de alguien: no se descarta.
    const observaciones = [
        estadoTexto && `Estado en la planilla: ${estadoTexto}`,
        segunda?.nota && `Llamadas: ${segunda.nota}`,
        textoLimpio(de('llamados')) && `Notas: ${textoLimpio(de('llamados'))}`,
        textoLimpio(de('accion')) && `Acción: ${textoLimpio(de('accion'))}`,
    ].filter(Boolean).join('\n');

    const proximo = fechaDesdeExcel(de('proximoContacto'));
    const llegada = fechaDesdeExcel(de('fechaLlegada'));

    const correoValido = correo && CORREO_OK.test(correo) && correo.length <= LARGO.correo;

    return {
        clave,
        nombre: recorta(nombre, LARGO.nombre),
        apellidos: recorta(apellidos, LARGO.apellidos),
        // Un "teléfono" más largo que 30 caracteres no es un teléfono: es otra
        // cosa metida en esa columna. Se descarta en vez de recortarse, porque
        // medio número marca peor que ningún número.
        telefonos: telefonos.filter(t => t.length <= LARGO.telefono),
        telefonosDescartados: telefonos.filter(t => t.length > LARGO.telefono),
        correos: correoValido ? [correo] : [],
        correoInvalido: correo && !correoValido ? correo : null,
        necesidad: recorta(textoLimpio(de('necesidad')), LARGO.texto),
        accionSiguiente: recorta(textoLimpio(de('accion')), LARGO.accion),
        estado,
        etapa: recorta(etapa, LARGO.etapa),
        observaciones: recorta(observaciones, LARGO.texto) || null,
        proximoContacto: proximo ? proximo.toISOString().slice(0, 10) : null,
        fechaLlegada: llegada,
        contactado: segunda?.contactado === true,
        // Sin teléfono, sin nombre y sin correo no hay a quién llamar.
        utilizable: !!(clave || nombre || correoValido),
    };
};

// ============================================================================
// VISTA PREVIA · no escribe nada
// ============================================================================
export const previsualizarImportacion = async (req, res) => {
    try {
        const { filas = [], mapa = {} } = req.body;
        const problema = problemaCon(filas, mapa);
        if (problema) return res.status(400).json({ success: false, message: problema });

        const organizacionId = req.user?.organizacionId || null;
        const preparadas = filas.map(f => prepararFila(f, mapa));

        const utiles = preparadas.filter(p => p.utilizable);
        const descartadas = preparadas.length - utiles.length;

        // Repetidas dentro de la MISMA planilla
        const vistos = new Set();
        let repetidasEnPlanilla = 0;
        for (const p of utiles) {
            if (!p.clave) continue;
            if (vistos.has(p.clave)) repetidasEnPlanilla++;
            else vistos.add(p.clave);
        }

        // Ya existentes en la base, comparando por los últimos 8 dígitos
        const claves = [...vistos];
        let yaExisten = 0;
        const ejemplosExistentes = [];
        if (claves.length) {
            const { rows } = await pool.query(
                // Se compara contra `telefono_norm`, la columna que ya usa el
                // detector de duplicados del CRM. Por los últimos 8 dígitos,
                // que es lo único estable entre "56 9 9484 9335" y "994849335".
                `SELECT DISTINCT RIGHT(pt.telefono_norm, 8) AS clave,
                        p.nombre, p.apellidos
                   FROM persona_telefono pt
                   JOIN persona p ON p.id = pt.persona_id
                  WHERE RIGHT(pt.telefono_norm, 8) = ANY($1)
                    AND p.activo
                    AND ($2::uuid IS NULL OR p.organizacion_id = $2)`,
                [claves, organizacionId]
            );
            yaExisten = rows.length;
            ejemplosExistentes.push(...rows.slice(0, 5).map(r =>
                [r.nombre, r.apellidos].filter(Boolean).join(' ') || 'sin nombre'));
        }

        const porEstado = {};
        for (const p of utiles) porEstado[p.estado] = (porEstado[p.estado] || 0) + 1;

        return res.json({
            success: true,
            total: preparadas.length,
            nuevas: utiles.length - repetidasEnPlanilla - yaExisten,
            yaExisten,
            repetidasEnPlanilla,
            descartadas,
            sinNombre: utiles.filter(p => !p.nombre).length,
            sinTelefono: utiles.filter(p => !p.clave).length,
            conProximoContacto: utiles.filter(p => p.proximoContacto).length,
            correosInvalidos: utiles.filter(p => p.correoInvalido).length,
            porEstado,
            ejemplosExistentes,
            // Las primeras filas ya interpretadas, para que se vea ANTES de guardar
            muestra: utiles.slice(0, 8),
        });
    } catch (error) {
        console.error('❌ Error en la vista previa de importación:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo leer la planilla.' });
    }
};

// ============================================================================
// IMPORTAR de verdad
// ============================================================================
export const importarProspectos = async (req, res) => {
    const client = await pool.connect();
    try {
        const { filas = [], mapa = {}, omitirExistentes = true, origen = 'import' } = req.body;
        const problema = problemaCon(filas, mapa);
        if (problema) return res.status(400).json({ success: false, message: problema });

        const organizacionId = req.user?.organizacionId || null;
        // EL DUEÑO. Quien importa se queda con los prospectos que trae.
        const duenoId = req.user?.usuarioId || null;
        if (!duenoId) {
            return res.status(401).json({ success: false, message: 'Sesión no válida.' });
        }

        const preparadas = filas.map(f => prepararFila(f, mapa)).filter(p => p.utilizable);

        // Qué teléfonos ya están en la base
        const claves = [...new Set(preparadas.map(p => p.clave).filter(Boolean))];
        const existentes = new Set();
        if (claves.length) {
            const { rows } = await client.query(
                `SELECT DISTINCT RIGHT(pt.telefono_norm, 8) AS clave
                   FROM persona_telefono pt
                   JOIN persona p ON p.id = pt.persona_id
                  WHERE RIGHT(pt.telefono_norm, 8) = ANY($1)
                    AND p.activo
                    AND ($2::uuid IS NULL OR p.organizacion_id = $2)`,
                [claves, organizacionId]
            );
            for (const r of rows) existentes.add(r.clave);
        }

        const resultado = { creados: 0, omitidos: 0, fallidos: 0, errores: [] };
        const enEstaTanda = new Set();

        await client.query('BEGIN');

        for (const [i, p] of preparadas.entries()) {
            // Repetida dentro de la propia planilla
            if (p.clave && enEstaTanda.has(p.clave)) { resultado.omitidos++; continue; }
            // Ya estaba en la base
            if (p.clave && existentes.has(p.clave) && omitirExistentes) { resultado.omitidos++; continue; }

            try {
                const { rows } = await client.query(
                    `INSERT INTO persona
                        (nombre, apellidos, estado, origen, necesidad, observaciones,
                         estado_comercial, accion_siguiente, proximo_contacto,
                         fecha_ultimo_contacto, ejecutivo_id, creado_por,
                         organizacion_id, activo, consentimiento_contacto)
                     VALUES ($1,$2,$3::estado_persona,$4::origen_persona,$5,$6,$7,$8,$9,$10,$11,$12,$13,TRUE,FALSE)
                     RETURNING id`,
                    [
                        p.nombre, p.apellidos, p.estado, origen,
                        p.necesidad, p.observaciones,
                        p.etapa, p.accionSiguiente, p.proximoContacto,
                        // "Cuando llegó" es el primer contacto que hubo con el lead.
                        p.fechaLlegada || null,
                        duenoId, duenoId, organizacionId,
                    ]
                );
                const personaId = rows[0].id;

                // `telefono_norm` y `correo_norm` NO son opcionales aunque la
                // columna acepte nulos: es lo que consulta el detector de
                // duplicados del CRM. Sin llenarlas, estos prospectos quedarían
                // invisibles para él y se volverían a cargar en la próxima
                // planilla.
                for (const [j, t] of p.telefonos.entries()) {
                    await client.query(
                        `INSERT INTO persona_telefono (persona_id, telefono, telefono_norm, principal)
                         VALUES ($1,$2,$3,$4)`,
                        [personaId, t, soloDigitos(t), j === 0]
                    );
                }
                for (const [j, c] of p.correos.entries()) {
                    await client.query(
                        `INSERT INTO persona_correo (persona_id, correo, correo_norm, principal)
                         VALUES ($1,$2,$3,$4)`,
                        [personaId, c, c.trim().toLowerCase(), j === 0]
                    );
                }

                if (p.clave) enEstaTanda.add(p.clave);
                resultado.creados++;
            } catch (err) {
                resultado.fallidos++;
                // Se guarda la fila y el motivo: sin eso, "fallaron 3" no sirve.
                if (resultado.errores.length < 10) {
                    resultado.errores.push({
                        fila: i + 2,   // +2: encabezado + base 1, como lo ve Excel
                        quien: [p.nombre, p.apellidos].filter(Boolean).join(' ') || p.telefonos[0] || 'sin datos',
                        motivo: err.message,
                    });
                }
            }
        }

        await client.query('COMMIT');

        return res.json({
            success: true,
            ...resultado,
            duenoId,
            message: `${resultado.creados} prospectos importados a tu cartera.`,
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error importando prospectos:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo completar la importación.' });
    } finally {
        client.release();
    }
};
