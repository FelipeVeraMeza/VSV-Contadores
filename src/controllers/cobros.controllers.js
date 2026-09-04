import { pool } from '../database/db.js';
import { decrypt, generateHash } from '../utils/crypto.js';
import { cleanRut } from '../lib/rut.js';
// Robot masivo del SII (el mismo de Emisión de DTE → Factura Electrónica).
import { emitirLotePuppeteer, estadoRobot } from '../components/facturacion/scripts/factura_masiva.mjs';
import { registrar } from '../utils/bitacora.js';

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

        // `suspendida` viaja con cada cobro: una factura vencida hay que cobrarla
        // aunque el cliente ya no esté en cartera, y quien la cobra necesita saber
        // que se dio de baja —el trato es distinto y ya no hay servicio que cortar.
        const { rows } = await pool.query(
            `SELECT cm.id, cm.empresa_id, cm.periodo, cm.monto_esperado, cm.monto_facturado,
                    cm.monto_anulado,
                    cm.folio, cm.tipo_dte, cm.estado, cm.fecha_emision, cm.fecha_vencimiento, cm.fecha_pago,
                    e.razon_social, p.nombre AS plan,
                    e.rut_encrypted, e.email_corporativo, e.nombre_rep,
                    (e.activo IS FALSE OR e.en_cartera IS FALSE) AS suspendida,
                    -- Personas ligadas a la empresa. Quien cobra se acuerda del
                    -- interlocutor, no siempre de la razón social, así que la
                    -- búsqueda tiene que alcanzarlas.
                    --
                    -- Son DOS orígenes distintos y hay que unir los dos:
                    --   · empresa_representante → los representantes legales
                    --     (es la tabla que está poblada de verdad).
                    --   · persona_empresa       → terceros del CRM ligados a la
                    --     empresa con un cargo (hoy vacía, pero es por donde
                    --     entran los contactos que no son representantes).
                    (SELECT json_agg(x ORDER BY x->>'orden')
                       FROM (
                            SELECT json_build_object(
                                     'nombre', er.nombre,
                                     'cargo',  'rep. legal',
                                     'correo', er.email,
                                     'orden',  CASE WHEN er.principal THEN '0' ELSE '1' END) AS x
                              FROM empresa_representante er
                             WHERE er.empresa_id = e.id AND er.nombre IS NOT NULL
                            UNION ALL
                            SELECT json_build_object(
                                     'nombre', trim(concat_ws(' ', ps.nombre, ps.apellidos)),
                                     'cargo',  pe.cargo,
                                     'correo', (SELECT pc.correo FROM persona_correo pc
                                                 WHERE pc.persona_id = ps.id
                                                 ORDER BY pc.principal DESC NULLS LAST LIMIT 1),
                                     'orden',  '2') AS x
                              FROM persona_empresa pe
                              JOIN persona ps ON ps.id = pe.persona_id
                             WHERE pe.empresa_id = e.id
                       ) t) AS personas
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
            const facturado = r.monto_facturado === null ? null : parseFloat(r.monto_facturado);
            const anulado = parseFloat(r.monto_anulado) || 0;
            return {
                id: r.id,
                empresaId: r.empresa_id,
                razonSocial: r.razon_social,
                // El RUT viaja cifrado en la base: se descifra acá porque el
                // buscador de la pantalla filtra por él y SQL no puede verlo.
                rut: (() => { try { return decrypt(r.rut_encrypted) || ''; } catch { return ''; } })(),
                correo: r.email_corporativo || '',
                // Representante legal y demás personas asociadas, para que buscar
                // por el nombre de un contacto encuentre el cobro de su empresa.
                nombreRep: r.nombre_rep || '',
                personas: r.personas || [],
                plan: r.plan || 'Sin plan',
                // Cliente dado de baja que aún debe: sigue en cobranza, ya no en cartera
                suspendida: r.suspendida === true,
                periodo: r.periodo,
                montoEsperado: parseFloat(r.monto_esperado) || 0,
                montoFacturado: facturado,
                // Lo devuelto por notas de crédito y lo que queda realmente por cobrar
                montoAnulado: anulado,
                montoCobrable: facturado === null ? null : Math.max(0, facturado - anulado),
                folio: r.folio,
                tipoDte: r.tipo_dte,
                estado: r.estado,
                anulada: r.estado === 'ANULADA',
                fechaEmision: r.fecha_emision,
                fechaVencimiento: r.fecha_vencimiento,
                fechaPago: r.fecha_pago,
                // Derivado: pendiente de pago y ya pasó el vencimiento.
                // Una anulada nunca vence: no hay nada que cobrar.
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

        // El id de la organización va SIEMPRE como parámetro fijo (puede ser null),
        // porque la subconsulta de mora lo necesita aunque el WHERE de arriba lo
        // omita. Armarlo solo cuando existe dejaba a `facturables` apuntando a un
        // $1 inexistente en el caso sin organización.
        const params = [organizacionId];
        const where = [];
        if (organizacionId) where.push(`organizacion_id = $1`);
        if (per) { params.push(per); where.push(`periodo = $${params.length}::date`); }
        else where.push(`periodo = date_trunc('month', CURRENT_DATE)::date`);

        // `facturables` = lo que realmente saldría en la emisión masiva: por emitir,
        // con monto, y del cliente que no arrastra deuda vencida. El botón mostraba
        // `por_emitir` a secas y prometía más facturas de las que iba a emitir.
        const { rows } = await pool.query(
            `SELECT
                -- El total acompaña al monto del mes, así que cuenta lo mismo
                -- que él: sin las anuladas. Decir "92 empresas" junto a un monto
                -- que solo cubre 91 no cuadra con nada.
                COUNT(*) FILTER (WHERE estado <> 'ANULADA')                AS total,
                COUNT(*) FILTER (WHERE estado = 'POR_EMITIR')              AS por_emitir,
                COUNT(*) FILTER (WHERE estado = 'POR_EMITIR' AND monto_esperado > 0
                                   AND empresa_id NOT IN (
                                       SELECT v.empresa_id FROM cobro_mensual v
                                        WHERE v.estado = 'PENDIENTE_PAGO'
                                          AND v.fecha_vencimiento < CURRENT_DATE
                                          AND ($1::uuid IS NULL OR v.organizacion_id = $1)
                                   ))                                      AS facturables,
                COUNT(*) FILTER (WHERE estado = 'PENDIENTE_PAGO')          AS pendiente_pago,
                COUNT(*) FILTER (WHERE estado = 'PAGADA')                  AS pagada,
                COUNT(*) FILTER (WHERE estado = 'PENDIENTE_RECIBO')        AS pendiente_recibo,
                COUNT(*) FILTER (WHERE estado = 'PENDIENTE_PAGO'
                                   AND fecha_vencimiento < CURRENT_DATE)   AS vencidos,
                COUNT(*) FILTER (WHERE estado = 'ANULADA')                 AS anuladas,
                -- Las ANULADAS no suman: su factura se dio de baja con nota de
                -- crédito y no hay nada que cobrar. Incluirlas hacía que el
                -- "Total del mes" mostrara plata que ya no existe —YOVANKA
                -- MATULIC, $60.500 anulados el 28-08-2026, seguía sumando—.
                COALESCE(SUM(monto_esperado) FILTER (WHERE estado <> 'ANULADA'), 0) AS monto_esperado,
                COALESCE(SUM(monto_esperado) FILTER (WHERE estado = 'POR_EMITIR'), 0) AS monto_por_emitir,
                COALESCE(SUM(monto_anulado), 0)                            AS monto_anulado,
                -- Lo realmente facturado del período: emitido menos lo devuelto por notas
                COALESCE(SUM(COALESCE(monto_facturado,0) - COALESCE(monto_anulado,0))
                         FILTER (WHERE estado <> 'ANULADA'), 0)            AS monto_neto
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
            // Los que de verdad se emitirían (sin los $0 ni los que están en mora)
            facturables: parseInt(r.facturables) || 0,
            pendientePago: parseInt(r.pendiente_pago) || 0,
            pagada: parseInt(r.pagada) || 0,
            pendienteRecibo: parseInt(r.pendiente_recibo) || 0,
            // vencidos = TODA la mora, de cualquier período (ver comentario arriba).
            // vencidosDelPeriodo queda por si se necesita el dato acotado al mes.
            vencidos: parseInt(glob.n) || 0,
            montoVencido: parseFloat(glob.monto) || 0,
            vencidoMasAntiguo: glob.mas_antiguo || null,
            vencidosDelPeriodo: parseInt(r.vencidos) || 0,
            // Facturas dadas de baja con nota de crédito: no son mora, no se cobran.
            anuladas: parseInt(r.anuladas) || 0,
            montoAnulado: parseFloat(r.monto_anulado) || 0,
            // Ingreso real del período = lo emitido menos lo anulado
            montoNeto: parseFloat(r.monto_neto) || 0,
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

        // Generar el ciclo del mes crea ~100 cobros de una vez y define a quién
        // se le va a facturar. Sin registro, un mes con cobros de más o de
        // menos no se puede rastrear hasta quién apretó el botón ni cuándo.
        await registrar(req, {
            modulo: 'cobros', accion: 'generar_ciclo',
            entidad: 'periodo', entidadId: null,
            descripcion: `Ciclo del mes generado: ${ins.rowCount} cobro(s) creado(s)`
                       + (del.rowCount ? `, ${del.rowCount} depurado(s) por baja del cliente` : ''),
            detalle: { generados: ins.rowCount, removidos: del.rowCount },
        });

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
        // Recalcular reescribe el monto de todos los cobros sin emitir del mes.
        // Es una acción masiva sobre dinero: tiene que quedar quién la hizo.
        if (rowCount) {
            await registrar(req, {
                modulo: 'cobros', accion: 'recalcular_montos',
                entidad: 'periodo', entidadId: null,
                descripcion: `${rowCount} monto(s) recalculado(s) desde el plan y el tramo`,
                detalle: { actualizados: rowCount, periodo: per },
            });
        }
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

        // El monto ANTERIOR se captura en el mismo UPDATE con una subconsulta:
        // sin él la bitácora diría «cambió el monto a $50.000» sin decir desde
        // cuánto, que es justo el dato que se necesita cuando un cliente
        // reclama que le cobraron de más.
        const { rows } = await pool.query(
            `UPDATE cobro_mensual c
             SET monto_esperado = $2, updated_at = NOW()
             FROM (SELECT id, monto_esperado AS antes FROM cobro_mensual WHERE id = $1) v
             WHERE c.id = v.id AND ($3::uuid IS NULL OR c.organizacion_id = $3)
             RETURNING c.id, c.empresa_id, c.periodo, v.antes`,
            [id, monto, organizacionId]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'Cobro no encontrado.' });

        const previo = Number(rows[0].antes || 0);
        const { rows: [empresa] } = await pool.query(
            'SELECT razon_social FROM empresa WHERE id = $1', [rows[0].empresa_id]);
        await registrar(req, {
            modulo: 'cobros', accion: 'editar_monto',
            entidad: 'cobro', entidadId: id,
            descripcion: `Monto de ${empresa?.razon_social || 'un cobro'} cambiado de `
                       + `$${previo.toLocaleString('es-CL')} a $${monto.toLocaleString('es-CL')}`,
            detalle: { antes: previo, despues: monto, diferencia: monto - previo,
                       empresaId: rows[0].empresa_id, periodo: rows[0].periodo },
        });

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
             RETURNING id, empresa_id, periodo, monto_esperado, monto_facturado`,
            [id, folio || null, montoFacturado ?? null, tipoDte || null, organizacionId]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'Cobro no encontrado.' });

        const r = rows[0];
        const coincide = r.monto_facturado !== null &&
                         parseFloat(r.monto_facturado) === parseFloat(r.monto_esperado);

        // ────────────────────────────────────────────────────────────────────
        // QUIÉN EMITIÓ ESTA FACTURA
        // ────────────────────────────────────────────────────────────────────
        // Emitir es la acción más grave del módulo: genera un documento
        // tributario real ante el SII y no se puede deshacer, solo anular con
        // nota de crédito.
        //
        // Hasta el 03-09-2026 NO se registraba. Se detectó buscando quién había
        // emitido dos facturas a empresas dadas de baja (folios 1478 y 1482) y
        // no había forma de saberlo: la bitácora anotaba los cambios de estado
        // pero no la emisión.
        //
        // Se guarda el desajuste de monto en el detalle: una factura emitida
        // por un monto distinto al esperado es lo primero que se busca cuando
        // un cliente reclama.
        const { rows: [empresa] } = await pool.query(
            'SELECT razon_social FROM empresa WHERE id = $1', [r.empresa_id]);
        await registrar(req, {
            modulo: 'cobros', accion: 'emitir_factura',
            entidad: 'cobro', entidadId: id,
            descripcion: `Factura ${folio ? `N°${folio}` : '(sin folio)'} emitida a `
                       + `${empresa?.razon_social || 'empresa desconocida'} por `
                       + `$${Number(r.monto_facturado || 0).toLocaleString('es-CL')}`
                       + (coincide ? '' : ' ⚠️ monto distinto al esperado'),
            detalle: {
                folio: folio || null,
                tipoDte: tipoDte || null,
                empresaId: r.empresa_id,
                periodo: r.periodo,
                montoEsperado: r.monto_esperado,
                montoFacturado: r.monto_facturado,
                montoCoincide: coincide,
            },
        });

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
// POR_EMITIR permite reabrir un cobro anulado para volver a facturarlo (pasa cuando
// una factura se anula por error de monto y hay que reemitirla).
const ESTADOS_MANUALES = ['PENDIENTE_PAGO', 'PAGADA', 'PENDIENTE_RECIBO', 'ANULADA', 'POR_EMITIR'];

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

        if (rows.length) {
            await registrar(req, {
                modulo: 'cobros', accion: 'cambiar_estado',
                entidad: 'cobro', entidadId: id,
                descripcion: `Cobro marcado como ${estado}`,
                detalle: { estado },
            });
        }
        if (!rows.length) return res.status(404).json({ success: false, message: 'Cobro no encontrado.' });
        return res.json({ success: true, message: 'Estado actualizado.' });
    } catch (err) {
        console.error('❌ Error cambiando estado del cobro:', err.message);
        return res.status(500).json({ success: false, message: 'Error al actualizar el estado.' });
    }
};

// ============================================================================
// REGISTRAR EL PAGO DE UN CLIENTE DESDE EL CRM
// ----------------------------------------------------------------------------
// En el CRM se trabaja por cliente, no por cobro: quien atiende no sabe (ni
// tiene por qué saber) qué folio corresponde a qué mes. Este endpoint traduce
// «este cliente pagó» a lo que hay que tocar de verdad, que son sus cobros
// pendientes.
//
// Devuelve SIEMPRE qué se marcó y por cuánto, para que la pantalla pueda
// confirmarlo antes y dejar constancia después. Registrar un pago que no
// ocurrió es tan grave como no registrar uno que sí.
// ============================================================================
export const registrarPagoCliente = async (req, res) => {
    try {
        const { empresaId } = req.params;
        const organizacionId = req.user?.organizacionId || null;
        // `soloVencidos`: por defecto se salda TODO lo pendiente. Con esta bandera
        // se saldan solo los meses ya vencidos y se deja lo que aún está en plazo.
        const soloVencidos = req.query.soloVencidos === '1' || req.body?.soloVencidos === true;

        const filtroVencidos = soloVencidos ? `AND cm.fecha_vencimiento < CURRENT_DATE` : '';

        const { rows } = await pool.query(
            `UPDATE cobro_mensual cm
                SET estado = 'PAGADA',
                    fecha_pago = COALESCE(cm.fecha_pago, NOW()),
                    updated_at = NOW()
              FROM empresa e
              WHERE cm.empresa_id = e.id
                AND e.id = $1
                AND cm.estado = 'PENDIENTE_PAGO'
                AND ($2::uuid IS NULL OR cm.organizacion_id = $2)
                ${filtroVencidos}
              RETURNING cm.id, cm.folio, to_char(cm.periodo,'YYYY-MM') AS periodo,
                        COALESCE(cm.monto_facturado, cm.monto_esperado) AS monto`,
            [empresaId, organizacionId]
        );

        const total = rows.reduce((s, r) => s + Number(r.monto || 0), 0);

        if (rows.length) {
            await registrar(req, {
                modulo: 'cobros', accion: 'registrar_pago',
                entidad: 'empresa', entidadId: empresaId,
                descripcion: `Pago registrado: ${rows.length} cobro(s) por $${total.toLocaleString('es-CL')}`,
                detalle: { periodos: rows.map(r => r.periodo), folios: rows.map(r => r.folio), total },
            });
        }

        return res.json({
            success: true,
            marcados: rows.length,
            total,
            periodos: rows.map(r => r.periodo),
            message: rows.length
                ? `${rows.length} cobro(s) marcados como pagados por $${total.toLocaleString('es-CL')}.`
                : 'Este cliente no tenía cobros pendientes.',
        });
    } catch (err) {
        console.error('❌ Error registrando el pago del cliente:', err.message);
        return res.status(500).json({ success: false, message: 'No se pudo registrar el pago.' });
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
// `reemitir` viaja hasta el robot para saltarse su candado anti-duplicados
// cuando la segunda factura del mes es intencional (ver factura_masiva.mjs).
const construirFacturaRobot = ({ empresaId, rut, razonSocial, plan, monto, correo, reemitir }, mesNombre) => {
    const rutLimpio = cleanRut(String(rut || ''));
    const [rutFull, dv] = rutLimpio.includes('-') ? rutLimpio.split('-') : [rutLimpio, ''];
    if (!rutFull) return null;                       // sin RUT no se puede facturar
    const precio = Math.round(Number(monto) || 0);
    if (precio <= 0) return null;                    // no se emiten facturas en $0
    return {
        empresa_id: empresaId || 'EXTERNO',          // receptor = el cliente que se factura
        reemitir: Boolean(reemitir),
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
//
// Junto a cada cobro viaja la MORA del cliente: cuántas facturas suyas están
// vencidas sin pagar y por cuánto. No se factura a ciegas a quien ya debe —
// emitirle otra factura al que lleva meses sin pagar agranda la deuda y ensucia
// la cobranza. La decisión final es del usuario (la pantalla las desmarca pero
// las deja visibles), así que acá solo se informa, no se excluye.
const cobrosDelMesParaFacturar = async (organizacionId) => {
    const { rows } = await pool.query(
        `SELECT cm.id AS cobro_id, cm.monto_esperado,
                e.id AS empresa_id, e.razon_social, e.rut_encrypted, e.email_corporativo,
                p.nombre AS plan,
                COALESCE(mora.n, 0)     AS mora_n,
                COALESCE(mora.monto, 0) AS mora_monto,
                mora.mas_antiguo        AS mora_mas_antiguo,
                -- Factura del mes que este cliente YA tiene. El robot no vuelve a
                -- emitirle salvo que se le pida expresamente, así que la pantalla
                -- tiene que mostrarlo: si no, se manda el lote creyendo que va y
                -- el cobro vuelve marcado con el folio viejo, sin factura nueva.
                (SELECT de.folio FROM documentos_emitidos de
                  WHERE de.empresa_id = e.id AND de.tipo_dte = 33
                    AND de.fecha_emision >= date_trunc('month', CURRENT_DATE)
                  ORDER BY de.fecha_emision DESC LIMIT 1) AS folio_del_mes
         FROM cobro_mensual cm
         JOIN empresa e ON e.id = cm.empresa_id
         LEFT JOIN plan p ON p.id = e.plan_id
         LEFT JOIN (
            -- Deuda vencida del cliente, de CUALQUIER período anterior.
            SELECT v.empresa_id,
                   COUNT(*)                                                   AS n,
                   SUM(COALESCE(v.monto_facturado, v.monto_esperado))         AS monto,
                   MIN(v.fecha_vencimiento)                                   AS mas_antiguo
            FROM cobro_mensual v
            WHERE v.estado = 'PENDIENTE_PAGO'
              AND v.fecha_vencimiento < CURRENT_DATE
              AND ($1::uuid IS NULL OR v.organizacion_id = $1)
            GROUP BY v.empresa_id
         ) mora ON mora.empresa_id = cm.empresa_id
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
            // Mora arrastrada: 0 = al día
            moraCobros: parseInt(r.mora_n) || 0,
            moraMonto: Math.round(parseFloat(r.mora_monto) || 0),
            moraDesde: r.mora_mas_antiguo || null,
            // Folio que este cliente ya tiene este mes (null = ninguno)
            folioDelMes: r.folio_del_mes ? String(r.folio_del_mes) : null,
        };
    });
};

// PREVISUALIZACIÓN: devuelve lo que se facturaría para revisarlo antes de emitir.
//   facturar → listos (monto > 0, RUT válido y cliente al día)
//   omitidas → hay que decidirlos a mano (sin RUT, monto $0, o con deuda vencida)
//
// Los morosos NO se descartan: viajan en `omitidas` con su motivo y su deuda para
// que la pantalla los muestre desmarcados. Excluir en silencio a un cliente que
// solo debe $10.000 sería peor que emitirle la factura.
export const previsualizarFacturacion = async (req, res) => {
    try {
        const organizacionId = req.user?.organizacionId || null;
        const items = await cobrosDelMesParaFacturar(organizacionId);
        const facturar = [], omitidas = [];
        for (const it of items) {
            if (!it.rut)            omitidas.push({ ...it, motivo: 'Sin RUT' });
            else if (it.monto <= 0) omitidas.push({ ...it, motivo: 'Monto $0' });
            else if (it.moraCobros > 0) {
                omitidas.push({
                    ...it,
                    motivo: `Debe ${it.moraCobros} factura(s) por $${it.moraMonto.toLocaleString('es-CL')}`,
                });
            }
            else facturar.push(it);
        }
        const conMora = omitidas.filter(o => o.moraCobros > 0);
        return res.json({
            success: true, facturar, omitidas,
            // Resumen de la mora, para el aviso de la pantalla
            morosos: conMora.length,
            montoMoroso: conMora.reduce((s, o) => s + o.moraMonto, 0),
        });
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
        const origenBruto = revisadas || await cobrosDelMesParaFacturar(organizacionId);

        // REGLA: al cliente con facturas vencidas sin pagar no se le emite otra.
        //
        // Se comprueba acá, contra la BD, y no solo en la pantalla: el body lo arma
        // el navegador y puede venir con un cobro cuyo cliente cayó en mora después
        // de abrir la previsualización (o de un cliente que ya la tenía, si alguien
        // llama al endpoint directamente). La emisión en el SII es irreversible, así
        // que el filtro tiene que estar del lado que ejecuta.
        const { rows: enMora } = await pool.query(
            `SELECT DISTINCT cm.empresa_id
               FROM cobro_mensual cm
              WHERE cm.estado = 'PENDIENTE_PAGO'
                AND cm.fecha_vencimiento < CURRENT_DATE
                AND ($1::uuid IS NULL OR cm.organizacion_id = $1)`,
            [organizacionId]
        );
        const morosos = new Set(enMora.map(r => r.empresa_id));
        const bloqueadas = [];
        const origen = origenBruto.filter(it => {
            if (it.empresaId && morosos.has(it.empresaId)) {
                bloqueadas.push(it.razonSocial || it.rut || 'sin nombre');
                return false;
            }
            return true;
        });

        const facturas = [];
        let omitidas = 0;
        const desviadas = [];   // montos que se apartaron de lo pactado
        for (const it of origen) {
            const factura = construirFacturaRobot(it, mesNombre);
            if (!factura) { omitidas++; continue; }
            // Si el usuario ajustó el monto en la revisión, lo persistimos al cobro
            // para que quede consistente con lo que se emite. Antes de pisarlo,
            // dejamos constancia de cuánto se apartó del precio que había: es el
            // único registro de que la factura no salió por el valor pactado.
            if (it.cobroId) {
                try {
                    // El precio pactado se lee ANTES de pisarlo: dentro del propio
                    // UPDATE ya vendría con el valor nuevo y la comparación siempre
                    // daría cero diferencia.
                    const { rows: [previo] } = await pool.query(
                        `SELECT monto_esperado FROM cobro_mensual
                          WHERE id = $1 AND ($2::uuid IS NULL OR organizacion_id = $2)`,
                        [it.cobroId, organizacionId]
                    );
                    const antes = Number(previo?.monto_esperado) || 0;
                    const ahora = Math.round(Number(it.monto) || 0);
                    if (antes > 0 && Math.abs((ahora - antes) / antes) >= 0.20) {
                        desviadas.push({ razonSocial: it.razonSocial, pactado: antes, emitido: ahora });
                    }
                    await pool.query(
                        `UPDATE cobro_mensual SET monto_esperado = $2, updated_at = NOW()
                         WHERE id = $1 AND estado = 'POR_EMITIR' AND ($3::uuid IS NULL OR organizacion_id = $3)`,
                        [it.cobroId, ahora, organizacionId]
                    );
                } catch { /* no bloquea la emisión */ }
            }
            facturas.push(factura);
        }

        // Queda en el log del servidor: si mañana aparece una factura por diez veces
        // lo pactado, hay dónde mirar qué pasó y cuándo.
        if (desviadas.length) {
            console.warn(`⚠️ [COBROS] ${desviadas.length} factura(s) con monto fuera de lo pactado:`,
                desviadas.map(d => `${d.razonSocial}: ${d.pactado} → ${d.emitido}`).join(' | '));
        }

        if (facturas.length === 0) {
            return res.status(400).json({
                success: false,
                message: `No hay facturas válidas para emitir (${omitidas} omitida(s) por monto $0 o RUT inválido`
                       + (bloqueadas.length ? `, ${bloqueadas.length} con deuda vencida` : '') + ').',
                bloqueadas,
            });
        }

        // Cobros que quedaron fuera: la pantalla manda la lista que tenía cargada,
        // así que si se creó un cobro después de abrirla, no viaja en el body y no
        // se factura. Se avisa en la respuesta en vez de dejarlo pasar en silencio.
        // Los morosos NO cuentan acá: quedaron fuera porque así se decidió, no por
        // un descuido de la pantalla. Mezclarlos convertiría la alerta en ruido de
        // ocho nombres todos los meses y taparía el caso real que sí importa.
        const enviados = new Set(origen.map(it => it.cobroId).filter(Boolean));
        const { rows: pendientesBD } = await pool.query(
            `SELECT cm.id, cm.empresa_id, e.razon_social
             FROM cobro_mensual cm JOIN empresa e ON e.id = cm.empresa_id
             WHERE cm.periodo = date_trunc('month', CURRENT_DATE)::date
               AND cm.estado = 'POR_EMITIR'
               AND ($1::uuid IS NULL OR cm.organizacion_id = $1)`,
            [organizacionId]
        );
        const noIncluidas = pendientesBD
            .filter(c => !enviados.has(c.id) && !morosos.has(c.empresa_id))
            .map(c => c.razon_social);

        // ────────────────────────────────────────────────────────────────────
        // QUIÉN LANZÓ LA FACTURACIÓN MASIVA
        // ────────────────────────────────────────────────────────────────────
        // Un solo clic emite decenas de documentos tributarios irreversibles.
        // Se registra ANTES de disparar el robot: si el proceso se cae a mitad,
        // igual queda constancia de quién lo lanzó y con qué alcance.
        //
        // Van también las bloqueadas y las desviadas: son las decisiones que el
        // sistema tomó por su cuenta, y hay que poder explicarlas después.
        await registrar(req, {
            modulo: 'cobros', accion: 'facturacion_masiva',
            entidad: 'periodo', entidadId: null,
            descripcion: `Facturación masiva de ${mesNombre}: ${facturas.length} factura(s)`
                       + (bloqueadas.length ? `, ${bloqueadas.length} bloqueada(s) por deuda vencida` : '')
                       + (omitidas ? `, ${omitidas} omitida(s)` : ''),
            detalle: {
                total: facturas.length,
                omitidas,
                bloqueadas,
                desviadas,
                noIncluidas,
            },
        });

        // Respondemos de inmediato y disparamos el robot en segundo plano.
        res.json({
            success: true,
            total: facturas.length,
            omitidas,
            noIncluidas,
            bloqueadas,
            desviadas,
            message: `Emisión iniciada para ${facturas.length} factura(s).`
                + (omitidas ? ` ${omitidas} omitida(s).` : '')
                + (bloqueadas.length ? ` ${bloqueadas.length} no se facturan por deuda vencida.` : '')
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
              -- El folio tiene que ser POSTERIOR a la reapertura del cobro. Sin
              -- esto, a un cobro reabierto para refacturar se le enganchaba de
              -- vuelta su factura antigua del mismo mes: quedaba en
              -- PENDIENTE_PAGO con el folio viejo, aparentando estar facturado
              -- cuando el robot ni siquiera lo había procesado.
              AND de.fecha_emision >= (
                    SELECT c.updated_at FROM cobro_mensual c
                     WHERE c.empresa_id = de.empresa_id
                       AND c.periodo = date_trunc('month', CURRENT_DATE)::date
                       AND c.estado = 'POR_EMITIR'
                     LIMIT 1
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
        const anulados = await sincronizarAnulaciones(req.user?.organizacionId || null);
        return res.json({
            success: true, vinculados, anulados,
            message: `${vinculados} cobro(s) pasaron a Pendiente de pago.`
                + (anulados ? ` ${anulados} quedaron anulados por nota de crédito.` : '')
        });
    } catch (err) {
        console.error('❌ Error vinculando folios:', err.message);
        return res.status(500).json({ success: false, message: 'Error al vincular los folios emitidos.' });
    }
};

// Descuenta del ciclo de cobro las notas de crédito emitidas.
//
// Una nota de crédito (DTE 61) anula o rebaja una factura. Sin esto, un cobro cuya
// factura se anuló seguía figurando como cobrado y los ingresos salían inflados.
// La nota apunta a su factura por folio_ref + tipo_dte_ref (nunca por folio solo:
// los folios de nota son una serie aparte que arranca en 1 y choca con los de factura).
//
//   anulada del todo  → estado ANULADA, no se le puede cobrar nada al cliente
//   rebajada en parte → sigue cobrable, pero por monto_facturado - monto_anulado
//
// Es idempotente: recalcula siempre desde los documentos, así que se puede correr
// las veces que sea. Y va en los dos sentidos — si un cobro se repunta a otro folio
// que no está anulado, hay que devolverle el estado, no dejarlo ANULADA para siempre.
export const sincronizarAnulaciones = async (organizacionId = null) => {
    // 1. Revertir: quedó marcado como anulado pero ya no hay nota que lo respalde.
    const { rowCount: revertidos } = await pool.query(
        `UPDATE cobro_mensual cm
            SET monto_anulado = 0,
                estado = CASE
                    WHEN cm.fecha_pago IS NOT NULL THEN 'PAGADA'
                    WHEN cm.folio IS NOT NULL      THEN 'PENDIENTE_PAGO'
                    ELSE 'POR_EMITIR'
                END,
                updated_at = NOW()
          WHERE (cm.estado = 'ANULADA' OR cm.monto_anulado > 0)
            AND ($1::uuid IS NULL OR cm.organizacion_id = $1)
            AND NOT EXISTS (
                SELECT 1 FROM documentos_emitidos nc
                 WHERE nc.tipo_dte = 61 AND nc.folio_ref IS NOT NULL
                   AND nc.empresa_id = cm.empresa_id
                   AND nc.folio_ref::text = cm.folio)`,
        [organizacionId]
    );

    // 2. Aplicar: descontar las notas vigentes.
    const { rowCount } = await pool.query(
        `WITH creditos AS (
             SELECT nc.empresa_id,
                    nc.folio_ref,
                    SUM(nc.monto_neto) AS anulado
               FROM documentos_emitidos nc
              WHERE nc.tipo_dte = 61 AND nc.folio_ref IS NOT NULL
                AND nc.tipo_dte_ref IN (33, 34)
              GROUP BY nc.empresa_id, nc.folio_ref
         )
         UPDATE cobro_mensual cm
            SET monto_anulado = c.anulado,
                estado = CASE
                    -- Anulación total: el cobro deja de existir comercialmente.
                    WHEN c.anulado >= COALESCE(cm.monto_facturado, 0) - 1 THEN 'ANULADA'
                    -- Anulación parcial sobre una que ya se había pagado: se respeta.
                    WHEN cm.estado = 'PAGADA' THEN 'PAGADA'
                    ELSE 'PENDIENTE_PAGO'
                END,
                -- Una anulada no puede arrastrar la fecha de pago que traía de antes:
                -- si la factura se dio de baja, ese pago no corresponde a nada.
                fecha_pago = CASE
                    WHEN c.anulado >= COALESCE(cm.monto_facturado, 0) - 1 THEN NULL
                    ELSE cm.fecha_pago
                END,
                updated_at = NOW()
           FROM creditos c
          WHERE cm.empresa_id = c.empresa_id
            AND cm.folio = c.folio_ref::text
            AND ($1::uuid IS NULL OR cm.organizacion_id = $1)
            AND (cm.monto_anulado IS DISTINCT FROM c.anulado
                 OR (c.anulado >= COALESCE(cm.monto_facturado, 0) - 1
                     AND (cm.estado <> 'ANULADA' OR cm.fecha_pago IS NOT NULL)))`,
        [organizacionId]
    );
    return rowCount + revertidos;
};

export const sincronizarNotasCredito = async (req, res) => {
    try {
        const anulados = await sincronizarAnulaciones(req.user?.organizacionId || null);
        return res.json({
            success: true, anulados,
            message: anulados
                ? `${anulados} cobro(s) actualizados por notas de crédito.`
                : 'No hay notas de crédito nuevas que descontar.'
        });
    } catch (err) {
        console.error('❌ Error sincronizando notas de crédito:', err.message);
        return res.status(500).json({ success: false, message: 'Error al descontar las notas de crédito.' });
    }
};

// ============================================================================
// CONCILIAR EL MES CONTRA LA PLANILLA DE COBRANZA
// ----------------------------------------------------------------------------
// La planilla mensual lista a los que DEBEN. Todo el resto del periodo, por
// definición, ya pagó. Antes eso se traducía a mano: buscar 39 empresas de a
// una en una lista de 169 y marcar el resto.
//
// DOS REGLAS QUE NO SE NEGOCIAN:
//
//   1. `simular: true` (el modo por defecto) NO escribe nada. Devuelve
//      exactamente lo que cambiaría. Marcar pagado a quien no pagó lo saca de
//      la cobranza y nadie vuelve a cobrarle: eso tiene que verse antes.
//
//   2. El cruce es por RUT, nunca por nombre. "ANITA MARIA VEAS VILLAGRA
//      ASESORIAS E.I.R.L" no se escribe igual en la planilla que en la base, y
//      un nombre mal pareado marca pagada a la empresa equivocada.
// ============================================================================
export const conciliarCobranza = async (req, res) => {
    try {
        const organizacionId = req.user?.organizacionId || null;
        const { rutsQueDeben = [], periodo, simular = true } = req.body;

        if (!Array.isArray(rutsQueDeben) || rutsQueDeben.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No llegó ningún RUT. Si la planilla viniera vacía se marcaría '
                       + 'todo el mes como pagado, así que se prefiere no hacer nada.',
            });
        }

        // ¿Sobre qué mes se concilia?
        //
        // NO es el mes en curso. La cobranza va siempre un mes atrás: la planilla
        // "agosto cobranza" lista lo que se está cobrando en agosto, que son las
        // facturas de JULIO. Al 06-08-2026 agosto todavía no tenía ni un cobro
        // generado, así que apuntar al mes actual conciliaba sobre cero: cero
        // marcados, cero deudores, y la sensación de que funcionó.
        //
        // Por eso, si no se indica un periodo, se toma el más reciente que
        // TENGA cobros pendientes. Es el que se está cobrando de verdad.
        let mes = /^\d{4}-\d{2}$/.test(periodo || '') ? `${periodo}-01` : null;
        if (!mes) {
            const { rows: [ultimo] } = await pool.query(
                `SELECT to_char(MAX(periodo), 'YYYY-MM-DD') AS p
                   FROM cobro_mensual
                  WHERE estado IN ('PENDIENTE_PAGO','PENDIENTE_RECIBO')
                    AND ($1::uuid IS NULL OR organizacion_id = $1)`,
                [organizacionId]
            );
            mes = ultimo?.p || null;
        }
        if (!mes) {
            return res.json({
                success: true, simulado: true,
                seMarcarianPagados: 0, montoQueSeDaPorPagado: 0,
                seguirianDebiendo: 0, deudaQueQueda: 0, empresas: [],
                message: 'No hay ningún cobro pendiente en ningún periodo. No hay nada que conciliar.',
            });
        }

        // Los hash de RUT de quienes deben. Se comparan contra empresa.rut_hash,
        // que es como el sistema identifica a una empresa sin descifrar nada.
        //
        // El hash se calcula SIEMPRE sobre el formato de `cleanRut` —cuerpo-DV,
        // con guion—, que es el que se usó al guardar. Normalizar de otra forma
        // (por ejemplo quitando el guion) da un hash distinto, no calza ninguna
        // empresa, y el resultado es que TODOS quedarían fuera de la planilla y
        // se marcarían como pagados. Eso ya pasó: con el guion quitado la
        // simulación daba 81 marcados y 0 deudores.
        const rutsLimpios = [...new Set(
            rutsQueDeben.map(r => cleanRut(String(r || ''))).filter(r => r.length > 2)
        )];
        const hashes = rutsLimpios.map(generateHash);

        // Si la planilla trae RUT pero NINGUNO calza con la base, algo está mal:
        // el archivo equivocado, otra columna, otro formato. Seguir marcaría el
        // periodo completo como pagado.
        const { rows: [calce] } = await pool.query(
            `SELECT COUNT(*)::int n FROM empresa WHERE rut_hash = ANY($1)`, [hashes]);
        if (calce.n === 0) {
            return res.status(400).json({
                success: false,
                message: `Ninguno de los ${rutsLimpios.length} RUT de la planilla existe en el sistema. `
                       + `Revisa que sea el archivo correcto y que la columna del RUT sea la que corresponde. `
                       + `No se marcó nada.`,
            });
        }

        // Qué se marcaría como pagado: pendientes del periodo que NO están en la
        // planilla y pertenecen a la organización de quien pide.
        const seleccion = `
              FROM cobro_mensual cm
              JOIN empresa e ON e.id = cm.empresa_id
             WHERE cm.estado IN ('PENDIENTE_PAGO','PENDIENTE_RECIBO')
               AND ($1::uuid IS NULL OR cm.organizacion_id = $1)
               AND cm.periodo = $2::date
               AND NOT (e.rut_hash = ANY($3))`;

        const { rows: afectados } = await pool.query(
            `SELECT cm.id, cm.folio, e.razon_social,
                    COALESCE(cm.monto_facturado, cm.monto_esperado) AS monto
             ${seleccion}
             ORDER BY e.razon_social`,
            [organizacionId, mes, hashes]
        );

        // Y cuántos de la planilla sí quedan como deudores (para cuadrar).
        const { rows: [quedan] } = await pool.query(
            `SELECT COUNT(*)::int n,
                    COALESCE(SUM(COALESCE(cm.monto_facturado, cm.monto_esperado)),0)::float total
               FROM cobro_mensual cm
               JOIN empresa e ON e.id = cm.empresa_id
              WHERE cm.estado IN ('PENDIENTE_PAGO','PENDIENTE_RECIBO')
                AND ($1::uuid IS NULL OR cm.organizacion_id = $1)
                AND cm.periodo = $2::date
                AND e.rut_hash = ANY($3)`,
            [organizacionId, mes, hashes]
        );

        const total = afectados.reduce((s, r) => s + Number(r.monto || 0), 0);

        if (simular) {
            return res.json({
                success: true, simulado: true,
                periodo: String(mes).slice(0, 7),
                seMarcarianPagados: afectados.length,
                montoQueSeDaPorPagado: total,
                seguirianDebiendo: quedan.n,
                deudaQueQueda: quedan.total,
                empresas: afectados.map(r => ({
                    folio: r.folio, razonSocial: r.razon_social, monto: Number(r.monto || 0),
                })),
                message: `Simulación: se marcarían ${afectados.length} cobros como pagados `
                       + `por $${total.toLocaleString('es-CL')}. No se cambió nada.`,
            });
        }

        // ---- De verdad ----
        const ids = afectados.map(r => r.id);
        if (!ids.length) {
            return res.json({ success: true, marcados: 0, message: 'No había nada pendiente que marcar.' });
        }
        const { rows: hechos } = await pool.query(
            `UPDATE cobro_mensual
                SET estado = 'PAGADA',
                    fecha_pago = COALESCE(fecha_pago, NOW()),
                    updated_at = NOW()
              WHERE id = ANY($1)
              RETURNING id, folio`,
            [ids]
        );

        await registrar(req, {
            modulo: 'cobros', accion: 'conciliar_cobranza',
            entidad: 'periodo', entidadId: null,
            descripcion: `Conciliación con planilla: ${hechos.length} cobros marcados como pagados `
                       + `por $${total.toLocaleString('es-CL')}. Siguen debiendo ${quedan.n}.`,
            detalle: {
                folios: hechos.map(h => h.folio),
                rutsQueDeben: rutsQueDeben.length,
                total,
            },
        });

        return res.json({
            success: true, marcados: hechos.length, monto: total,
            periodo: String(mes).slice(0, 7),
            seguirianDebiendo: quedan.n,
            message: `${hechos.length} cobros marcados como pagados. Quedan ${quedan.n} deudores.`,
        });
    } catch (error) {
        console.error('❌ Error conciliando cobranza:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo conciliar la cobranza.' });
    }
};
