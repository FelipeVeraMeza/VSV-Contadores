import { pool } from '../database/db.js';
import { decrypt } from '../utils/crypto.js';
import { cleanRut } from '../lib/rut.js';
// Robot masivo del SII (el mismo de Emisión de DTE → Factura Electrónica).
import { emitirLotePuppeteer, estadoRobot } from '../components/facturacion/scripts/factura_masiva.mjs';

// ============================================================================
// CICLO DE COBRO MENSUAL (honorarios del despacho a sus clientes)
//
//   · Fin de mes (26) → se emiten las facturas de las empresas con servicio activo.
//   · El pago vence el día 5 del mes siguiente.
//   · Estados: POR_EMITIR → PENDIENTE_PAGO → PAGADA | PENDIENTE_RECIBO
//     ("vencido" se DERIVA de PENDIENTE_PAGO + fecha_vencimiento pasada, no se almacena)
//
// Todo va filtrado por organizacion_id (aislamiento multi-tenant).
// ============================================================================

const DIA_AVISO_FACTURACION = 26; // desde este día se avisa que hay que facturar

// Precio mensual del cliente, en orden de prioridad:
//   1. empresa.precio_mensual → el NETO negociado de la planilla (ej. ROVIRA $220.000)
//   2. plan.precio_base       → el precio del plan, si no hay negociado
//   3. 0                      → plan FREE o sin plan
// Se usa como SQL escalar; las tablas se referencian como `e` (empresa) y `p` (plan).
const SQL_PRECIO_MENSUAL = `COALESCE(e.precio_mensual, p.precio_base, 0)`;

// EMPRESA FACTURABLE — el CRM manda.
// Reproduce en SQL, tal cual, lo que el CRM muestra como cliente ACTIVO en su
// control de clientes (clasificarCliente + exclusión de empresas creadas por
// clientes). Así el "Cobro del Mes" factura exactamente a los mismos clientes
// que el CRM marca como activos, ni uno más:
//   · en_cartera IS NOT FALSE  → sigue en la planilla de trabajo (no archivada)
//   · activo    IS NOT FALSE   → no está dada de baja en su ficha
//   · su creador NO es un usuario Cliente (esas empresas van a la pestaña
//     "usuarios" del CRM; no son clientes del despacho y no se facturan)
//   · NO tuvo servicios y todos inactivos (si tuvo y ninguno sigue activo → baja)
// La tabla empresa se referencia siempre como `e`.
const SQL_EMPRESA_FACTURABLE = `
    e.en_cartera IS NOT FALSE
    AND e.activo IS NOT FALSE
    AND (
        SELECT u.rol::text FROM audita a JOIN usuario u ON a.usuario_id = u.id
        WHERE a.empresa_id = e.id ORDER BY a.fecha_asignacion ASC LIMIT 1
    ) IS DISTINCT FROM 'Cliente'
    AND NOT (
        EXISTS (SELECT 1 FROM empresa_servicio es WHERE es.empresa_id = e.id)
        AND NOT EXISTS (SELECT 1 FROM empresa_servicio es WHERE es.empresa_id = e.id AND es.estado = 'Activo')
    )`;

// periodo: 'YYYY-MM' → primer día del mes. Sin parámetro, el mes en curso.
const periodoSql = (periodo) => (periodo ? `${periodo}-01` : null);

// Lista los cobros de un periodo, con datos de la empresa
export const listarCobros = async (req, res) => {
    try {
        const organizacionId = req.user?.organizacionId || null;
        const { periodo, estado, vencidos } = req.query;

        const params = [];
        const where = [];

        if (organizacionId) { params.push(organizacionId); where.push(`cm.organizacion_id = $${params.length}`); }

        // Al pedir los vencidos NO se filtra por mes: la mora se arrastra de períodos
        // anteriores y acotarla al mes elegido la dejaba invisible.
        const soloVencidos = String(vencidos) === 'true';
        if (soloVencidos) {
            where.push(`cm.estado = 'PENDIENTE_PAGO'`);
            where.push(`cm.fecha_vencimiento < CURRENT_DATE`);
        } else {
            const per = periodoSql(periodo);
            if (per) { params.push(per); where.push(`cm.periodo = $${params.length}::date`); }
            else where.push(`cm.periodo = date_trunc('month', CURRENT_DATE)::date`);

            if (estado) { params.push(estado); where.push(`cm.estado = $${params.length}`); }
        }

        const { rows } = await pool.query(
            `SELECT cm.id, cm.empresa_id, cm.periodo, cm.monto_esperado, cm.monto_facturado,
                    cm.folio, cm.tipo_dte, cm.estado, cm.fecha_emision, cm.fecha_vencimiento, cm.fecha_pago,
                    e.razon_social, p.nombre AS plan
             FROM cobro_mensual cm
             JOIN empresa e ON e.id = cm.empresa_id
             LEFT JOIN plan p ON p.id = e.plan_id
             ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
             ORDER BY e.razon_social ASC`,
            params
        );

        const hoy = new Date();
        const cobros = rows.map(r => {
            const vence = r.fecha_vencimiento ? new Date(r.fecha_vencimiento) : null;
            return {
                id: r.id,
                empresaId: r.empresa_id,
                razonSocial: r.razon_social,
                plan: r.plan || 'Sin plan',
                periodo: r.periodo,
                montoEsperado: parseFloat(r.monto_esperado) || 0,
                montoFacturado: r.monto_facturado === null ? null : parseFloat(r.monto_facturado),
                folio: r.folio,
                tipoDte: r.tipo_dte,
                estado: r.estado,
                fechaEmision: r.fecha_emision,
                fechaVencimiento: r.fecha_vencimiento,
                fechaPago: r.fecha_pago,
                // Derivado: pendiente de pago y ya pasó el vencimiento
                vencido: r.estado === 'PENDIENTE_PAGO' && !!vence && vence < hoy,
                // El monto emitido coincide con el esperado
                montoCoincide: r.monto_facturado !== null &&
                               parseFloat(r.monto_facturado) === parseFloat(r.monto_esperado)
            };
        });

        return res.json({ success: true, cobros, total: cobros.length });
    } catch (err) {
        console.error('❌ Error listando cobros:', err.message);
        return res.status(500).json({ success: false, message: 'Error al obtener los cobros.' });
    }
};

// Resumen (KPIs) del periodo + si toca avisar que hay que facturar
export const resumenCobros = async (req, res) => {
    try {
        const organizacionId = req.user?.organizacionId || null;
        const { periodo } = req.query;
        const per = periodoSql(periodo);

        const params = [];
        const where = [];
        if (organizacionId) { params.push(organizacionId); where.push(`organizacion_id = $${params.length}`); }
        if (per) { params.push(per); where.push(`periodo = $${params.length}::date`); }
        else where.push(`periodo = date_trunc('month', CURRENT_DATE)::date`);

        const { rows } = await pool.query(
            `SELECT
                COUNT(*)                                                   AS total,
                COUNT(*) FILTER (WHERE estado = 'POR_EMITIR')              AS por_emitir,
                COUNT(*) FILTER (WHERE estado = 'PENDIENTE_PAGO')          AS pendiente_pago,
                COUNT(*) FILTER (WHERE estado = 'PAGADA')                  AS pagada,
                COUNT(*) FILTER (WHERE estado = 'PENDIENTE_RECIBO')        AS pendiente_recibo,
                COUNT(*) FILTER (WHERE estado = 'PENDIENTE_PAGO'
                                   AND fecha_vencimiento < CURRENT_DATE)   AS vencidos,
                COALESCE(SUM(monto_esperado), 0)                           AS monto_esperado,
                COALESCE(SUM(monto_esperado) FILTER (WHERE estado = 'POR_EMITIR'), 0) AS monto_por_emitir
             FROM cobro_mensual
             ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`,
            params
        );
        const r = rows[0];

        // Los vencidos NO se acotan al período elegido: una factura vencida lo está
        // sin importar de qué mes sea. Acotado al mes, el indicador daba 0 hasta el
        // día 5 del mes siguiente —cuando vencen las del mes— y escondía la mora real
        // arrastrada de meses anteriores.
        const { rows: [glob] } = await pool.query(
            `SELECT COUNT(*) AS n, COALESCE(SUM(monto_esperado), 0) AS monto,
                    MIN(fecha_vencimiento) AS mas_antiguo
             FROM cobro_mensual
             WHERE estado = 'PENDIENTE_PAGO' AND fecha_vencimiento < CURRENT_DATE
               AND ($1::uuid IS NULL OR organizacion_id = $1)`,
            [organizacionId]
        );

        const hoy = new Date();
        const diaDelMes = hoy.getDate();
        const porEmitir = parseInt(r.por_emitir) || 0;
        // Cuántos días faltan para la fecha de facturación (0 = ya toca)
        const diasParaFacturar = diaDelMes >= DIA_AVISO_FACTURACION ? 0 : DIA_AVISO_FACTURACION - diaDelMes;

        return res.json({
            success: true,
            periodo: per || new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10),
            total: parseInt(r.total) || 0,
            porEmitir,
            pendientePago: parseInt(r.pendiente_pago) || 0,
            pagada: parseInt(r.pagada) || 0,
            pendienteRecibo: parseInt(r.pendiente_recibo) || 0,
            // vencidos = TODA la mora, de cualquier período (ver comentario arriba).
            // vencidosDelPeriodo queda por si se necesita el dato acotado al mes.
            vencidos: parseInt(glob.n) || 0,
            montoVencido: parseFloat(glob.monto) || 0,
            vencidoMasAntiguo: glob.mas_antiguo || null,
            vencidosDelPeriodo: parseInt(r.vencidos) || 0,
            montoEsperado: parseFloat(r.monto_esperado) || 0,
            montoPorEmitir: parseFloat(r.monto_por_emitir) || 0,
            // Aviso: desde el día 26 y mientras queden facturas por emitir
            avisoFacturacion: diaDelMes >= DIA_AVISO_FACTURACION && porEmitir > 0,
            diaFacturacion: DIA_AVISO_FACTURACION,  // día del mes en que toca facturar
            diasParaFacturar                        // cuenta regresiva
        });
    } catch (err) {
        console.error('❌ Error en resumen de cobros:', err.message);
        return res.status(500).json({ success: false, message: 'Error al obtener el resumen.' });
    }
};

// Genera los cobros POR_EMITIR del periodo en curso y los reconcilia con el CRM.
// Es idempotente y actúa como "sincronizar con el CRM":
//   1. Da de alta un cobro POR_EMITIR por cada cliente facturable (= activos del CRM).
//   2. Da de baja los cobros AÚN NO EMITIDOS de empresas que ya no son facturables
//      (archivadas, dadas de baja, creadas por clientes o con el servicio suspendido).
//      Nunca se tocan las facturas ya emitidas o pagadas.
export const generarCobros = async (req, res) => {
    const client = await pool.connect();
    try {
        const organizacionId = req.user?.organizacionId || null;
        await client.query('BEGIN');

        // 1. ALTA: un cobro por cada cliente que el CRM muestra como activo
        const ins = await client.query(
            `INSERT INTO cobro_mensual
                (organizacion_id, empresa_id, periodo, monto_esperado, estado, fecha_vencimiento)
             SELECT
                e.organizacion_id, e.id,
                date_trunc('month', CURRENT_DATE)::date,
                ${SQL_PRECIO_MENSUAL},
                'POR_EMITIR',
                (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' + INTERVAL '4 days')::date
             FROM empresa e
             LEFT JOIN plan p ON p.id = e.plan_id
             WHERE ($1::uuid IS NULL OR e.organizacion_id = $1)
               AND ${SQL_EMPRESA_FACTURABLE}
             ON CONFLICT (empresa_id, periodo) DO NOTHING`,
            [organizacionId]
        );

        // 2. BAJA: depura los cobros sin emitir de empresas que el CRM ya no
        //    considera clientes activos. Solo POR_EMITIR (las facturas emitidas
        //    o pagadas se conservan: corresponden a un documento real).
        const del = await client.query(
            `DELETE FROM cobro_mensual cm
             WHERE cm.periodo = date_trunc('month', CURRENT_DATE)::date
               AND cm.estado = 'POR_EMITIR'
               AND ($1::uuid IS NULL OR cm.organizacion_id = $1)
               AND NOT EXISTS (
                   SELECT 1 FROM empresa e
                   WHERE e.id = cm.empresa_id AND ${SQL_EMPRESA_FACTURABLE}
               )`,
            [organizacionId]
        );

        await client.query('COMMIT');
        return res.json({
            success: true,
            generados: ins.rowCount,
            removidos: del.rowCount,
            message: `${ins.rowCount} cobros generados` +
                     (del.rowCount ? `, ${del.rowCount} depurados (ya no son clientes activos)` : '') + '.'
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error generando cobros:', err.message);
        return res.status(500).json({ success: false, message: 'Error al generar los cobros.' });
    } finally {
        client.release();
    }
};

// Recalcula el monto esperado de los cobros aún no emitidos, según plan × tramo.
// Útil cuando se corrigen planes o precios.
export const recalcularMontos = async (req, res) => {
    try {
        const organizacionId = req.user?.organizacionId || null;
        const { periodo } = req.body || {};
        const per = periodo ? `${periodo}-01` : null;

        const { rowCount } = await pool.query(
            `UPDATE cobro_mensual cm
             SET monto_esperado = sub.precio, updated_at = NOW()
             FROM (
                SELECT e.id AS empresa_id, ${SQL_PRECIO_MENSUAL} AS precio
                FROM empresa e LEFT JOIN plan p ON p.id = e.plan_id
             ) sub
             WHERE cm.empresa_id = sub.empresa_id
               AND cm.estado = 'POR_EMITIR'
               AND cm.periodo = COALESCE($1::date, date_trunc('month', CURRENT_DATE)::date)
               AND ($2::uuid IS NULL OR cm.organizacion_id = $2)`,
            [per, organizacionId]
        );
        // Las empresas dadas de baja no se facturan
        await pool.query(
            `DELETE FROM cobro_mensual cm USING empresa e
             WHERE cm.empresa_id = e.id AND e.activo = FALSE
               AND cm.estado = 'POR_EMITIR'
               AND cm.periodo = COALESCE($1::date, date_trunc('month', CURRENT_DATE)::date)`,
            [per]
        );
        return res.json({ success: true, actualizados: rowCount, message: `${rowCount} montos recalculados.` });
    } catch (err) {
        console.error('❌ Error recalculando montos:', err.message);
        return res.status(500).json({ success: false, message: 'Error al recalcular los montos.' });
    }
};

// Corrige a mano el monto esperado de un cobro (casos negociados / excepciones)
export const editarMontoCobro = async (req, res) => {
    try {
        const { id } = req.params;
        const { montoEsperado } = req.body;
        const organizacionId = req.user?.organizacionId || null;

        const monto = Number(montoEsperado);
        if (!Number.isFinite(monto) || monto < 0) {
            return res.status(400).json({ success: false, message: 'Monto no válido.' });
        }

        const { rows } = await pool.query(
            `UPDATE cobro_mensual
             SET monto_esperado = $2, updated_at = NOW()
             WHERE id = $1 AND ($3::uuid IS NULL OR organizacion_id = $3)
             RETURNING id`,
            [id, monto, organizacionId]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'Cobro no encontrado.' });
        return res.json({ success: true, message: 'Monto actualizado.' });
    } catch (err) {
        console.error('❌ Error editando monto:', err.message);
        return res.status(500).json({ success: false, message: 'Error al actualizar el monto.' });
    }
};

// Registra la emisión de la factura: guarda folio + monto y pasa a PENDIENTE_PAGO
export const emitirCobro = async (req, res) => {
    try {
        const { id } = req.params;
        const { folio, montoFacturado, tipoDte } = req.body;
        const organizacionId = req.user?.organizacionId || null;

        const { rows } = await pool.query(
            `UPDATE cobro_mensual
             SET folio = COALESCE($2, folio),
                 monto_facturado = COALESCE($3, monto_facturado),
                 tipo_dte = COALESCE($4, tipo_dte),
                 estado = 'PENDIENTE_PAGO',
                 fecha_emision = NOW(),
                 updated_at = NOW()
             WHERE id = $1
               AND ($5::uuid IS NULL OR organizacion_id = $5)
             RETURNING id, monto_esperado, monto_facturado`,
            [id, folio || null, montoFacturado ?? null, tipoDte || null, organizacionId]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'Cobro no encontrado.' });

        const r = rows[0];
        const coincide = r.monto_facturado !== null &&
                         parseFloat(r.monto_facturado) === parseFloat(r.monto_esperado);
        return res.json({
            success: true,
            montoCoincide: coincide,
            message: coincide
                ? 'Factura emitida. El monto coincide con el esperado.'
                : 'Factura emitida. ⚠️ El monto NO coincide con el esperado.'
        });
    } catch (err) {
        console.error('❌ Error emitiendo cobro:', err.message);
        return res.status(500).json({ success: false, message: 'Error al registrar la emisión.' });
    }
};

// Cambia el estado del cobro (marcar pagada, pendiente de recibo, revertir a pendiente de pago)
const ESTADOS_MANUALES = ['PENDIENTE_PAGO', 'PAGADA', 'PENDIENTE_RECIBO'];

export const cambiarEstadoCobro = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;
        const organizacionId = req.user?.organizacionId || null;

        if (!ESTADOS_MANUALES.includes(estado)) {
            return res.status(400).json({ success: false, message: 'Estado no válido.' });
        }

        const { rows } = await pool.query(
            `UPDATE cobro_mensual
             SET estado = $2::text,
                 fecha_pago = CASE WHEN $2::text IN ('PAGADA','PENDIENTE_RECIBO') THEN COALESCE(fecha_pago, NOW()) ELSE NULL END,
                 updated_at = NOW()
             WHERE id = $1
               AND ($3::uuid IS NULL OR organizacion_id = $3)
             RETURNING id`,
            [id, estado, organizacionId]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'Cobro no encontrado.' });
        return res.json({ success: true, message: 'Estado actualizado.' });
    } catch (err) {
        console.error('❌ Error cambiando estado del cobro:', err.message);
        return res.status(500).json({ success: false, message: 'Error al actualizar el estado.' });
    }
};

// ============================================================================
// FACTURACIÓN MASIVA — emite en lote las facturas de honorarios de los cobros
// POR_EMITIR del mes, reutilizando el robot del SII (factura afecta 33).
// Flujo: previsualizar (revisar/editar/quitar/incluir) → facturar la lista final.
// El robot inicia sesión solo y corre en segundo plano; el progreso se sigue con
// GET /cobros/progreso y al terminar se vinculan los folios con /cobros/vincular-folios.
// ============================================================================

// Arma el objeto que espera el robot a partir de un cliente + monto.
const construirFacturaRobot = ({ empresaId, rut, razonSocial, plan, monto, correo }, mesNombre) => {
    const rutLimpio = cleanRut(String(rut || ''));
    const [rutFull, dv] = rutLimpio.includes('-') ? rutLimpio.split('-') : [rutLimpio, ''];
    if (!rutFull) return null;                       // sin RUT no se puede facturar
    const precio = Math.round(Number(monto) || 0);
    if (precio <= 0) return null;                    // no se emiten facturas en $0
    return {
        empresa_id: empresaId || 'EXTERNO',          // receptor = el cliente que se factura
        tipo_documento: '33',
        rutReceptor: rutFull,
        dvReceptor: dv,
        ciudadEmisor: 'Santiago',
        telefonoEmisor: '56978278733',
        ciudadReceptor: 'Santiago',
        contactoReceptor: correo || '',
        producto: {
            nombre: plan || 'Servicios Contables',
            cantidad: '1', unidad: '1',
            precio: String(precio),
            descripcion: `Servicios contables ${mesNombre}`,
        },
        datosCorreo: { razonSocial: razonSocial || '', planContable: plan || '', neto: String(precio) },
    };
};

// Trae los cobros POR_EMITIR del mes con datos del cliente (RUT desencriptado).
const cobrosDelMesParaFacturar = async (organizacionId) => {
    const { rows } = await pool.query(
        `SELECT cm.id AS cobro_id, cm.monto_esperado,
                e.id AS empresa_id, e.razon_social, e.rut_encrypted, e.email_corporativo,
                p.nombre AS plan
         FROM cobro_mensual cm
         JOIN empresa e ON e.id = cm.empresa_id
         LEFT JOIN plan p ON p.id = e.plan_id
         WHERE cm.periodo = date_trunc('month', CURRENT_DATE)::date
           AND cm.estado = 'POR_EMITIR'
           AND ($1::uuid IS NULL OR cm.organizacion_id = $1)
         ORDER BY e.razon_social`,
        [organizacionId]
    );
    return rows.map(r => {
        let rut = '';
        try { rut = cleanRut(decrypt(r.rut_encrypted) || ''); } catch { /* rut inválido */ }
        return {
            cobroId: r.cobro_id,
            empresaId: r.empresa_id,
            razonSocial: r.razon_social,
            rut,
            plan: r.plan || 'Sin plan',
            monto: Math.round(parseFloat(r.monto_esperado) || 0),
            correo: r.email_corporativo || '',
        };
    });
};

// PREVISUALIZACIÓN: devuelve lo que se facturaría para revisarlo antes de emitir.
//   facturar → listos (monto > 0 y RUT válido)   ·   omitidas → por incluir a mano
export const previsualizarFacturacion = async (req, res) => {
    try {
        const organizacionId = req.user?.organizacionId || null;
        const items = await cobrosDelMesParaFacturar(organizacionId);
        const facturar = [], omitidas = [];
        for (const it of items) {
            if (it.rut && it.monto > 0) facturar.push(it);
            else omitidas.push({ ...it, motivo: !it.rut ? 'Sin RUT' : 'Monto $0' });
        }
        return res.json({ success: true, facturar, omitidas });
    } catch (err) {
        console.error('❌ Error previsualizando facturación:', err.message);
        return res.status(500).json({ success: false, message: 'Error al previsualizar la facturación.' });
    }
};

export const facturarCobrosMasivo = async (req, res) => {
    try {
        if (estadoRobot.activo) {
            return res.status(409).json({ success: false, message: 'El facturador masivo ya está en ejecución. Espera a que termine.' });
        }
        const organizacionId = req.user?.organizacionId || null;
        const mesNombre = new Date().toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });

        // Lista revisada desde el frontend (preview editable); si no viene, se arma
        // sola desde la BD (compatibilidad).
        const revisadas = Array.isArray(req.body?.facturas) ? req.body.facturas : null;
        const origen = revisadas || await cobrosDelMesParaFacturar(organizacionId);

        const facturas = [];
        let omitidas = 0;
        for (const it of origen) {
            const factura = construirFacturaRobot(it, mesNombre);
            if (!factura) { omitidas++; continue; }
            // Si el usuario ajustó el monto en la revisión, lo persistimos al cobro
            // para que quede consistente con lo que se emite.
            if (it.cobroId) {
                try {
                    await pool.query(
                        `UPDATE cobro_mensual SET monto_esperado = $2, updated_at = NOW()
                         WHERE id = $1 AND estado = 'POR_EMITIR' AND ($3::uuid IS NULL OR organizacion_id = $3)`,
                        [it.cobroId, Math.round(Number(it.monto) || 0), organizacionId]
                    );
                } catch { /* no bloquea la emisión */ }
            }
            facturas.push(factura);
        }

        if (facturas.length === 0) {
            return res.status(400).json({ success: false, message: `No hay facturas válidas para emitir (${omitidas} omitida(s) por monto $0 o RUT inválido).` });
        }

        // Cobros que quedaron fuera: la pantalla manda la lista que tenía cargada,
        // así que si se creó un cobro después de abrirla, no viaja en el body y no
        // se factura. Se avisa en la respuesta en vez de dejarlo pasar en silencio.
        const enviados = new Set(origen.map(it => it.cobroId).filter(Boolean));
        const { rows: pendientesBD } = await pool.query(
            `SELECT cm.id, e.razon_social
             FROM cobro_mensual cm JOIN empresa e ON e.id = cm.empresa_id
             WHERE cm.periodo = date_trunc('month', CURRENT_DATE)::date
               AND cm.estado = 'POR_EMITIR'
               AND ($1::uuid IS NULL OR cm.organizacion_id = $1)`,
            [organizacionId]
        );
        const noIncluidas = pendientesBD.filter(c => !enviados.has(c.id)).map(c => c.razon_social);

        // Respondemos de inmediato y disparamos el robot en segundo plano.
        res.json({
            success: true,
            total: facturas.length,
            omitidas,
            noIncluidas,
            message: `Emisión iniciada para ${facturas.length} factura(s).`
                + (omitidas ? ` ${omitidas} omitida(s).` : '')
                + (noIncluidas.length ? ` ⚠️ ${noIncluidas.length} cobro(s) creados después de abrir la pantalla quedaron fuera: ${noIncluidas.join(', ')}. Refresca y vuelve a facturar para incluirlos.` : '')
        });

        // La vinculación de folios la hace el BACKEND al terminar, no el navegador.
        // Antes dependía de que la pestaña siguiera abierta sondeando el progreso:
        // si el usuario la cerraba —o si el robot se colgaba y nunca "terminaba"—
        // las facturas quedaban emitidas en el SII pero marcadas POR_EMITIR, listas
        // para volver a emitirse. El frontend la sigue llamando como respaldo.
        emitirLotePuppeteer(facturas)
            .then(async () => {
                try {
                    const n = await vincularFoliosDeOrganizacion(organizacionId);
                    console.log(`🔗 [COBROS] ${n} cobro(s) vinculados a su folio tras el lote.`);
                } catch (e) {
                    console.error('⚠️ [COBROS] No se pudieron vincular los folios:', e.message);
                }
            })
            .catch(async err => {
                console.error('❌ Error en facturación masiva de cobros:', err);
                estadoRobot.activo = false;
                // Aunque el lote falle a medias, lo ya emitido debe quedar vinculado.
                try {
                    const n = await vincularFoliosDeOrganizacion(organizacionId);
                    console.log(`🔗 [COBROS] ${n} cobro(s) vinculados tras el fallo del lote.`);
                } catch { /* se puede reintentar desde la pantalla */ }
            });
    } catch (err) {
        console.error('❌ Error en facturarCobrosMasivo:', err.message);
        if (!res.headersSent) res.status(500).json({ success: false, message: 'Error al iniciar la facturación masiva.' });
    }
};

// Progreso en vivo del robot masivo (para la barra en Cobro del Mes).
export const progresoFacturacion = (req, res) => res.status(200).json(estadoRobot);

// Vincula los folios recién emitidos con sus cobros POR_EMITIR, pasándolos a
// PENDIENTE_PAGO.
//
// Un folio solo sirve para UN cobro. Antes se tomaba cualquier documento emitido
// dentro del mes, sin mirar si ese folio ya estaba asignado a otro período: si una
// factura de junio se emitía en julio (pasa cuando el cliente se atrasa), ese folio
// se volvía a enganchar al cobro de julio y el cliente quedaba marcado como
// facturado sin estarlo. Por eso se excluyen los folios ya usados por otro cobro.
export const vincularFoliosDeOrganizacion = async (organizacionId) => {
    const { rowCount } = await pool.query(
        `UPDATE cobro_mensual cm
         SET folio = de.folio,
             monto_facturado = de.monto_neto,
             tipo_dte = '33',
             estado = 'PENDIENTE_PAGO',
             fecha_emision = de.fecha_emision,
             updated_at = NOW()
         FROM (
            SELECT DISTINCT ON (de.empresa_id) de.empresa_id, de.folio, de.monto_neto, de.fecha_emision
            FROM documentos_emitidos de
            WHERE de.tipo_dte = 33
              AND de.fecha_emision >= date_trunc('month', CURRENT_DATE)
              AND NOT EXISTS (
                    -- documentos_emitidos.folio es bigint y cobro_mensual.folio es
                    -- varchar: hay que castear o Postgres no compara.
                    SELECT 1 FROM cobro_mensual usado
                    WHERE usado.folio = de.folio::text AND usado.empresa_id = de.empresa_id
              )
            ORDER BY de.empresa_id, de.fecha_emision DESC
         ) de
         WHERE cm.empresa_id = de.empresa_id
           AND cm.periodo = date_trunc('month', CURRENT_DATE)::date
           AND cm.estado = 'POR_EMITIR'
           AND ($1::uuid IS NULL OR cm.organizacion_id = $1)`,
        [organizacionId]
    );
    return rowCount;
};

export const vincularFolios = async (req, res) => {
    try {
        const vinculados = await vincularFoliosDeOrganizacion(req.user?.organizacionId || null);
        return res.json({ success: true, vinculados, message: `${vinculados} cobro(s) pasaron a Pendiente de pago.` });
    } catch (err) {
        console.error('❌ Error vinculando folios:', err.message);
        return res.status(500).json({ success: false, message: 'Error al vincular los folios emitidos.' });
    }
};
