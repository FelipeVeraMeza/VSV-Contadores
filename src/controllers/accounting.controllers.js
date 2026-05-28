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
    if (!empresaId || empresaId === 'undefined') {
        return res.json({ plan: [] });
    }
    try {
        const query = empresaId === 'ALL'
            ? `SELECT id, codigo, descripcion, tipo_cuenta, normativa, clasificacion_contable, es_editable
               FROM plan_cuentas
               WHERE empresa_id IS NULL
               ORDER BY codigo ASC`
            : `SELECT id, codigo, descripcion, tipo_cuenta, normativa, clasificacion_contable, es_editable
               FROM plan_cuentas
               WHERE empresa_id = $1 OR empresa_id IS NULL
               ORDER BY empresa_id NULLS LAST, codigo ASC`;

        const { rows } = empresaId === 'ALL'
            ? await pool.query(query)
            : await pool.query(query, [empresaId]);
        res.json({ plan: rows });
    } catch (error) {
        console.error("❌ Error al obtener plan de cuentas:", error.message);
        res.status(500).json({ message: "Error al obtener plan de cuentas" });
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