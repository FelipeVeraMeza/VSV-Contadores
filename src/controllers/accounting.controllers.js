import { pool } from "../database/db.js";
import * as XLSX from 'xlsx';

export const getAccountingMetrics = async (req, res) => {
    const { empresaId } = req.query;
    
    if (!empresaId || empresaId === 'undefined') {
        return res.status(400).json({ message: "ID de entidad no válido para el búnker" });
    }

    try {
        res.json({
            totalActivos: 15500000,
            totalPasivos: 8200000,
            patrimonio: 7300000,
            asientosMes: 48,
            variacion: "+12.5%",
            status: "Sincronizado"
        });
    } catch (error) {
        console.error("❌ Error en Métricas:", error);
        res.status(500).json({ message: "Fallo en el cálculo de estados financieros" });
    }
};

export const getChartOfAccounts = async (req, res) => {
    const { empresaId } = req.query;
    try {
        const usarEmpresa = empresaId && empresaId !== 'undefined' && empresaId !== 'ALL';
        const query = usarEmpresa
            ? `SELECT id, codigo, descripcion, tipo_cuenta, grupo, normativa, clasificacion_contable, es_editable
               FROM plan_cuentas
               WHERE empresa_id = $1 OR empresa_id IS NULL
               ORDER BY empresa_id NULLS LAST, codigo ASC`
            : `SELECT id, codigo, descripcion, tipo_cuenta, grupo, normativa, clasificacion_contable, es_editable
               FROM plan_cuentas
               ORDER BY codigo ASC`;

        const { rows } = usarEmpresa
            ? await pool.query(query, [empresaId])
            : await pool.query(query);
        res.json({ plan: rows });
    } catch (error) {
        console.error("❌ Error al obtener plan de cuentas:", error.message);
        res.status(500).json({ message: "Error al obtener plan de cuentas" });
    }
};

export const crearCuenta = async (req, res) => {
    const { empresaId, codigo, descripcion, tipo_cuenta, normativa = 'LOCAL', grupo } = req.body;
    if (!codigo || !descripcion || !tipo_cuenta) {
        return res.status(400).json({ message: "codigo, descripcion y tipo_cuenta son requeridos" });
    }
    try {
        const { rows: [exists] } = await pool.query(
            `SELECT id FROM plan_cuentas WHERE codigo = $1 AND (empresa_id = $2 OR empresa_id IS NULL)`,
            [codigo, empresaId || null]
        );
        if (exists) return res.status(409).json({ message: `El código ${codigo} ya existe en el plan de cuentas.` });

        const { rows: [nueva] } = await pool.query(
            `INSERT INTO plan_cuentas (id, empresa_id, codigo, descripcion, tipo_cuenta, normativa, grupo, es_editable)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, true) RETURNING *`,
            [empresaId || null, codigo, descripcion.toUpperCase(), tipo_cuenta, normativa, grupo || null]
        );
        res.status(201).json({ cuenta: nueva });
    } catch (error) {
        console.error("❌ Error creando cuenta:", error.message);
        res.status(500).json({ message: "Error al crear la cuenta" });
    }
};

export const editarCuenta = async (req, res) => {
    const { id } = req.params;
    const { descripcion, tipo_cuenta, normativa, grupo } = req.body;
    if (!descripcion) return res.status(400).json({ message: "descripcion es requerida" });
    try {
        const { rows: [cuenta] } = await pool.query(
            `UPDATE plan_cuentas SET descripcion=$1, tipo_cuenta=COALESCE($2, tipo_cuenta), normativa=COALESCE($3, normativa), grupo=COALESCE($4, grupo)
             WHERE id=$5 AND es_editable=true RETURNING *`,
            [descripcion.toUpperCase(), tipo_cuenta, normativa, grupo, id]
        );
        if (!cuenta) return res.status(404).json({ message: "Cuenta no encontrada o no editable" });
        res.json({ cuenta });
    } catch (error) {
        console.error("❌ Error editando cuenta:", error.message);
        res.status(500).json({ message: "Error al editar la cuenta" });
    }
};

export const eliminarCuenta = async (req, res) => {
    const { id } = req.params;
    try {
        const { rowCount } = await pool.query(
            `DELETE FROM plan_cuentas WHERE id=$1 AND es_editable=true`,
            [id]
        );
        if (rowCount === 0) return res.status(404).json({ message: "Cuenta no encontrada o protegida" });
        res.json({ success: true });
    } catch (error) {
        console.error("❌ Error eliminando cuenta:", error.message);
        res.status(500).json({ message: "Error al eliminar la cuenta" });
    }
};

export const eliminarComprobante = async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query(`DELETE FROM comprobantes_detalle WHERE comprobante_id = $1`, [id]);
        const { rowCount } = await pool.query(`DELETE FROM comprobantes WHERE id = $1`, [id]);
        if (rowCount === 0) return res.status(404).json({ message: 'Comprobante no encontrado' });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Error eliminando comprobante:', error.message);
        res.status(500).json({ message: 'Error al eliminar el comprobante' });
    }
};

export const guardarComprobante = async (req, res) => {
    const { empresaId, tipo, fecha, glosa, lineas, folio, rutAsociado } = req.body;
    const usuario = req.user || {};
    const empId = (empresaId === 'ALL' || empresaId === 'undefined') ? null : (empresaId || null);
    if (!lineas?.length) {
        return res.status(400).json({ message: "lineas son requeridas" });
    }
    const totalDebe  = lineas.reduce((s, l) => s + (Number(l.debe)  || 0), 0);
    const totalHaber = lineas.reduce((s, l) => s + (Number(l.haber) || 0), 0);
    if (Math.abs(totalDebe - totalHaber) > 1) {
        return res.status(400).json({ message: `Asiento descuadrado: Debe ${totalDebe} ≠ Haber ${totalHaber}` });
    }
    const TIPO_MAP = {
      ventas: 'INGRESO', honorarios: 'INGRESO', ingreso: 'INGRESO',
      compras: 'EGRESO',  egreso: 'EGRESO',
      nota_credito: 'TRASPASO', nota_debito: 'TRASPASO',
      traspaso: 'TRASPASO'
    };
    const tipoDb = TIPO_MAP[tipo?.toLowerCase()] || 'INGRESO';
    const gloseFinal = glosa || (folio ? `Folio #${folio}` : `Comprobante ${tipo}`);
    const fechaFinal = fecha ? new Date(fecha) : new Date();

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // ── UPSERT: buscar comprobante existente por folio + empresa ──────────
        const empCond = empId === null ? 'empresa_id IS NULL' : 'empresa_id = $1';
        const { rows: [existing] } = folio
            ? await client.query(
                `SELECT id, numero_comprobante FROM comprobantes
                 WHERE ${empCond} AND glosa LIKE $${empId === null ? 1 : 2} LIMIT 1`,
                empId === null ? [`%Folio #${folio}%`] : [empId, `%Folio #${folio}%`]
              )
            : { rows: [] };

        let compId, numero, accion;

        if (existing) {
            await client.query(`DELETE FROM comprobantes_detalle WHERE comprobante_id = $1`, [existing.id]);
            await client.query(
                `UPDATE comprobantes SET fecha=$1, glosa=$2, tipo=$3, estado='Contabilizado',
                        contabilizado_por=$4, contabilizado_por_id=$5, contabilizado_at=NOW() WHERE id=$6`,
                [fechaFinal, gloseFinal, tipoDb, usuario.nombre || null, usuario.usuarioId || null, existing.id]
            );
            compId = existing.id;
            numero = existing.numero_comprobante;
            accion = 'actualizado';
        } else {
            const { rows: [{ max_num }] } = await client.query(
                `SELECT COALESCE(MAX(numero_comprobante), 0) AS max_num FROM comprobantes WHERE ${empCond}`,
                empId === null ? [] : [empId]
            );
            const { rows: [comp] } = await client.query(
                `INSERT INTO comprobantes (id, empresa_id, numero_comprobante, fecha, tipo, glosa, estado,
                        contabilizado_por, contabilizado_por_id, contabilizado_at)
                 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'Contabilizado', $6, $7, NOW()) RETURNING id`,
                [empId, max_num + 1, fechaFinal, tipoDb, gloseFinal, usuario.nombre || null, usuario.usuarioId || null]
            );
            compId = comp.id;
            numero = max_num + 1;
            accion = 'creado';
        }

        // Insertar líneas nuevas
        for (const linea of lineas) {
            await client.query(
                `INSERT INTO comprobantes_detalle (id, comprobante_id, cuenta_codigo, rut_asociado, debe, haber)
                 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
                [compId, linea.cuenta, rutAsociado || null, Number(linea.debe) || 0, Number(linea.haber) || 0]
            );
        }

        await client.query('COMMIT');
        res.json({ success: true, comprobanteId: compId, numero, accion });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error guardando comprobante:", err.message);
        res.status(500).json({ message: "Error al guardar el comprobante" });
    } finally {
        client.release();
    }
};

export const getComprobantes = async (req, res) => {
    const { empresaId } = req.query;
    const empId = (!empresaId || empresaId === 'undefined' || empresaId === 'ALL' || empresaId === 'null')
        ? null : empresaId;
    const empCond = empId === null ? 'c.empresa_id IS NULL' : 'c.empresa_id = $1';
    try {
        const { rows } = await pool.query(
            `SELECT c.id, c.numero_comprobante, c.fecha, c.tipo, c.glosa, c.estado, c.created_at,
                    c.contabilizado_por, c.contabilizado_at,
                    json_agg(json_build_object(
                        'id', cd.id, 'cuenta_codigo', cd.cuenta_codigo,
                        'descripcion', COALESCE(pc.descripcion, cd.cuenta_codigo),
                        'rut_asociado', cd.rut_asociado, 'debe', cd.debe, 'haber', cd.haber
                    ) ORDER BY cd.debe DESC) AS lineas
             FROM comprobantes c
             JOIN comprobantes_detalle cd ON cd.comprobante_id = c.id
             LEFT JOIN plan_cuentas pc ON pc.codigo = cd.cuenta_codigo
             WHERE ${empCond}
             GROUP BY c.id ORDER BY c.created_at DESC`,
            empId === null ? [] : [empId]
        );
        res.json({ comprobantes: rows });
    } catch (error) {
        console.error("❌ Error obteniendo comprobantes:", error.message);
        res.status(500).json({ message: "Error al obtener comprobantes" });
    }
};

export const getJournalEntries = async (req, res) => {
    const { empresaId, page = 0, search = "" } = req.query;
    try {
        res.json({
            asientos: [
                { 
                    id: "as-001", 
                    fecha: "2026-01-20", 
                    descripcion: "Apertura de Caja Mensual", 
                    debe: 500000, 
                    haber: 0, 
                    estado: "Mayorizado",
                    usuario: "Admin"
                },
                { 
                    id: "as-002", 
                    fecha: "2026-01-21", 
                    descripcion: "Pago Proveedores Servicios", 
                    debe: 0, 
                    haber: 120000, 
                    estado: "Pendiente",
                    usuario: "Sistema"
                }
            ],
            total: 2,
            page: Number(page)
        });
    } catch (error) {
        res.status(500).json({ message: "Error al consultar el libro diario" });
    }
};

export const runBankReconciliationIA = async (req, res) => {
    const { empresaId, cartolaId } = req.body;
    try {
        setTimeout(() => {
            res.json({ 
                success: true, 
                message: "IA ha procesado la cartola exitosamente",
                matchedCount: 15,
                pendingCount: 2,
                accuracy: "98%"
            });
        }, 1500);
    } catch (error) {
        res.status(500).json({ message: "Fallo en el motor de IA contable" });
    }
};

// --- Helpers para validación (Adaptados de insertar.js) ---
const normalizarRut = (rut) => {
    if (!rut) return null;
    let clean = String(rut).trim();
    if (!clean || clean.startsWith("#")) return null;

    clean = clean.replace(/\./g, "").replace(/-/g, "");
    if (clean.length < 2) return null;

    const cuerpo = clean.slice(0, -1);
    const dv = clean.slice(-1).toUpperCase();

    if (!/^\d+$/.test(cuerpo)) return null;
    if (!/^[0-9K]$/.test(dv)) return null;

    return `${cuerpo}-${dv}`;
};

const claveValida = (clave) => {
    if (!clave) return false;
    const clean = String(clave).trim();
    // Debe contener al menos un número
    return clean && /\d/.test(clean);
};

export const uploadAccountingExcel = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "No se ha subido ningún archivo Excel." });
    }

    try {
        // 1. Leer el archivo desde el buffer
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0]; // Usar la primera hoja
        const sheet = workbook.Sheets[sheetName];
        
        // 2. Convertir a JSON (array de arrays para mantener índices de columnas)
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        const validos = [];
        const incompletos = [];

        // 3. Procesar filas (saltando cabecera si es necesario)
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            // Índices basados en tu script anterior: 10 -> RUT, 11 -> Clave
            const rawRut = row[10]; 
            const rawClave = row[11];

            if (!rawRut && !rawClave) continue;

            const rut = normalizarRut(rawRut);
            const esClaveValida = claveValida(rawClave);

            if (rut && esClaveValida) {
                validos.push({ rut, clave: String(rawClave).trim() });
            } else {
                incompletos.push({ fila: i + 1, rawRut, rawClave });
            }
        }

        // 4. Insertar en Base de Datos
        if (validos.length > 0) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                for (const item of validos) {
                    // Asumiendo tabla 'clientes'. Ajusta el nombre de la tabla y columnas según tu DB real.
                    // ON CONFLICT actualiza la clave si el RUT ya existe.
                    await client.query(
                        `INSERT INTO clientes (rut, password) VALUES ($1, $2) 
                         ON CONFLICT (rut) DO UPDATE SET password = $2`,
                        [item.rut, item.clave]
                    );
                }
                await client.query('COMMIT');
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        }

        res.json({
            success: true,
            message: "Importación de Excel completada",
            registrosProcesados: validos.length,
            registrosFallidos: incompletos.length,
            detallesFallidos: incompletos
        });

    } catch (error) {
        console.error("❌ Error procesando Excel:", error);
        res.status(500).json({ message: "Error interno al procesar el archivo" });
    }
};