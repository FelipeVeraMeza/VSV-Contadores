import { pool } from '../database/db.js';

// ========================================================
// 1. CONTROLADOR DE VENTAS (Historial)
// ========================================================
export const consultarHistorialBunkerController = async (req, res) => {
    try {
        const { empresa_id } = req.query;
        if (!empresa_id) {
            return res.status(400).json({ ok: false, error: "Falta el identificador de la empresa." });
        }

        let query = "";
        let values = [];

        // 🌐 BÓVEDA GLOBAL: Consulta la tabla general antigua
        if (empresa_id === 'ALL') {
            query = `
                SELECT d.id, d.folio, d.tipo_dte, d.monto_neto, d.fecha_emision, d.url_pdf, 
                       d.rut_cliente, e.razon_social
                FROM documentos_emitidos d
                LEFT JOIN empresa e ON d.empresa_id = e.id
                ORDER BY d.fecha_emision DESC;
            `;
        } else {
            // 🏢 EMPRESA ESPECÍFICA: Consulta la tabla NUEVA que llena el robot
            query = `
                SELECT *, razon_social_cliente AS razon_social
                FROM documentos_emitidos_empresa
                WHERE empresa_id = $1
                ORDER BY fecha_emision DESC;
            `;
            values = [empresa_id];
        }

        const result = await pool.query(query, values);
        return res.json({ ok: true, documentos: result.rows });
    } catch (error) {
        console.error('❌ Error Ventas:', error.message);
        return res.status(500).json({ ok: false, error: 'Error al obtener ventas.' });
    }
};

// ========================================================
// 2. CONTROLADOR DE COMPRAS (Recibidos)
// ========================================================
export const consultarComprasBunkerController = async (req, res) => {
    try {
        const { empresa_id } = req.query;
        if (!empresa_id) {
            return res.status(400).json({ ok: false, error: "Falta el identificador de la empresa." });
        }

        let query = "";
        let values = [];

        // 🌐 BÓVEDA GLOBAL: Consulta la tabla general antigua
        if (empresa_id === 'ALL') {
            query = `
                SELECT id, rut_proveedor, razon_social_proveedor, tipo_dte, folio, 
                       monto_neto, monto_iva, monto_total, fecha_emision, url_pdf
                FROM documentos_recibidos
                ORDER BY fecha_emision DESC;
            `;
        } else {
            // 🏢 EMPRESA ESPECÍFICA: Consulta la tabla NUEVA que llena el robot
            query = `
                SELECT * FROM documentos_recibidos_empresa
                WHERE empresa_id = $1
                ORDER BY fecha_emision DESC;
            `;
            values = [empresa_id];
        }

        const result = await pool.query(query, values);
        return res.json({ ok: true, documentos: result.rows });
    } catch (error) {
        console.error('❌ Error Compras:', error.message);
        return res.status(500).json({ ok: false, error: 'Error al obtener compras.' });
    }
};