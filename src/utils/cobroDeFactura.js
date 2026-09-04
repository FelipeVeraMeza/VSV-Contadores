// ============================================================================
// TODA FACTURA EMITIDA TIENE QUE TENER SU COBRO
// ----------------------------------------------------------------------------
// Emitir una factura y crear su cobro eran dos caminos separados. Nada obligaba
// a que quedaran unidos, y el resultado fue que 24 facturas por $2.132.080 se
// emitieron al SII sin que la cobranza las viera: no vencían el día 5, no
// salían en el recordatorio de pago y no contaban en «por cobrar».
//
// Detectado en la auditoría del 03-09-2026.
//
// POR QUÉ ACÁ Y NO EN CADA SITIO QUE FACTURA
// Hay cuatro lugares que insertan en `documentos_emitidos` —factura manual,
// factura masiva, exenta manual, exenta masiva— y parchear los cuatro deja el
// quinto que alguien agregue mañana sin cubrir. Con una función común, quien
// agregue un camino nuevo la llama y ya.
// ============================================================================

/**
 * Se asegura de que la factura recién emitida tenga un cobro que la persiga.
 *
 * Es IDEMPOTENTE: si ya existe un cobro con ese folio no hace nada, así que se
 * puede llamar sin miedo a duplicar. Eso importa porque los procesos masivos
 * reintentan.
 *
 * NO lanza excepción si algo falla: la factura ya está en el SII y es
 * irreversible. Perder el cobro es malo, pero tumbar el proceso de facturación
 * a mitad de camino es peor. Se devuelve el resultado para que quien llame lo
 * registre.
 *
 * @param {object} cliente  cliente de pg (puede ser una transacción en curso)
 * @param {object} datos
 * @param {string} datos.empresaId
 * @param {string|number} datos.folio
 * @param {number} datos.montoTotal      con IVA — lo que el cliente transfiere
 * @param {number} [datos.montoNeto]
 * @param {number} [datos.tipoDte]
 * @param {Date|string} [datos.fechaEmision]
 * @param {string} [datos.organizacionId]
 * @returns {Promise<{creado: boolean, motivo?: string, cobroId?: string}>}
 */
export async function asegurarCobroDeFactura(cliente, {
    empresaId, folio, montoTotal, montoNeto = null, tipoDte = null,
    fechaEmision = null, organizacionId = null,
} = {}) {
    if (!empresaId || !folio) {
        return { creado: false, motivo: 'faltan empresa o folio' };
    }

    const folioTexto = String(folio).trim();
    const emision = fechaEmision ? new Date(fechaEmision) : new Date();
    if (Number.isNaN(emision.getTime())) {
        return { creado: false, motivo: 'fecha de emisión inválida' };
    }

    try {
        // ¿Ya hay un cobro con este folio? Entonces no hay nada que hacer: es
        // el caso normal del ciclo mensual, donde el cobro nace antes que la
        // factura y `emitirCobro` le pone el folio.
        const { rows: existente } = await cliente.query(
            `SELECT id FROM cobro_mensual WHERE TRIM(folio) = $1 LIMIT 1`, [folioTexto]);
        if (existente.length) {
            return { creado: false, motivo: 'ya existe', cobroId: existente[0].id };
        }

        // El período es el MES DE EMISIÓN, y el vencimiento el día 5 del mes
        // siguiente: la misma regla que usa el ciclo mensual, para que estas
        // facturas se persigan igual que todas las demás.
        const periodo = new Date(emision.getFullYear(), emision.getMonth(), 1);
        const vencimiento = new Date(emision.getFullYear(), emision.getMonth() + 1, 5);

        // Una empresa puede tener varios cobros del mismo mes: el del plan más
        // los extras, cada uno con su factura. Lo permite la migración
        // 2026-09-04_cobros_multiples_por_mes.sql; antes la restricción
        // (empresa_id, periodo) lo impedía y por eso las facturas extra se
        // quedaban sin cobro que las persiguiera.
        //
        // El índice único va sobre (empresa, periodo, folio), así que un
        // reintento con el mismo folio no duplica.
        const { rows } = await cliente.query(
            `INSERT INTO cobro_mensual
                (organizacion_id, empresa_id, periodo, monto_esperado, monto_facturado,
                 folio, tipo_dte, estado, fecha_emision, fecha_vencimiento)
             VALUES ($1, $2, $3, $4, $4, $5, $6, 'PENDIENTE_PAGO', $7, $8)
             ON CONFLICT (empresa_id, periodo, TRIM(folio))
                  WHERE folio IS NOT NULL AND TRIM(folio) <> ''
             DO NOTHING
             RETURNING id`,
            [organizacionId, empresaId, periodo, montoTotal ?? montoNeto ?? 0,
             folioTexto, tipoDte, emision, vencimiento]);

        if (rows.length) return { creado: true, cobroId: rows[0].id };
        return { creado: false, motivo: 'ya existía un cobro con ese folio' };
    } catch (error) {
        // Nunca se propaga: la factura ya existe en el SII.
        console.error(`⚠️ No se pudo crear el cobro del folio ${folioTexto}:`, error.message);
        return { creado: false, motivo: `error: ${error.message}` };
    }
}
