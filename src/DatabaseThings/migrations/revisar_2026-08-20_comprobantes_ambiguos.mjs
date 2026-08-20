/**
 * =============================================================================
 * Los comprobantes que quedaron SIN empresa · para revisión contable
 * =============================================================================
 *
 * PARA QUÉ
 * La migración `2026-08-20_reasignar_comprobantes_sin_empresa.sql` devolvió a su
 * empresa 1.159 de los 1.172 asientos que habían quedado huérfanos. Los que no
 * pudo resolver son aquellos cuyo folio aparece en MÁS DE UNA empresa: elegir
 * una sería adivinar sobre un asiento contable ya emitido.
 *
 * Este script los lista con todo lo necesario para que un contador decida cuál
 * corresponde. No modifica nada: solo lee.
 *
 * CÓMO SE USA
 *     node src/DatabaseThings/migrations/revisar_2026-08-20_comprobantes_ambiguos.mjs
 *
 * CÓMO SE RESUELVE UNO, una vez decidido
 *     UPDATE comprobantes SET empresa_id = '<uuid de la empresa correcta>'
 *      WHERE id = '<id del comprobante>';
 *
 * CUÁNDO SE TERMINA
 * Cuando esta lista salga vacía. Ahí conviene volver a correr:
 *     verificar_2026-08-19_aislamiento_contabilidad.mjs   (debería dar 21/21)
 *     verificar_2026-08-20_contabilidad_funcional.mjs     (41/41)
 * =============================================================================
 */
import 'dotenv/config';
import { pool } from '../../database/db.js';

const clp = (n) => '$' + Number(n || 0).toLocaleString('es-CL');

const main = async () => {
    const { rows } = await pool.query(`
      WITH docs AS (
          SELECT 'venta'::text AS clase, tipo_dte, folio, empresa_id
            FROM documentos_emitidos          WHERE empresa_id IS NOT NULL
          UNION ALL SELECT 'venta',  tipo_dte, folio, empresa_id
            FROM documentos_emitidos_empresa  WHERE empresa_id IS NOT NULL
          UNION ALL SELECT 'compra', tipo_dte, folio, empresa_id
            FROM documentos_recibidos         WHERE empresa_id IS NOT NULL
          UNION ALL SELECT 'compra', tipo_dte, folio, empresa_id
            FROM documentos_recibidos_empresa WHERE empresa_id IS NOT NULL
      )
      SELECT c.id,
             c.numero_comprobante,
             c.fecha::date                              AS fecha,
             c.clase,
             c.tipo_dte,
             c.folio,
             c.rut_contraparte,
             c.glosa,
             c.contabilizado_por,
             -- El monto del asiento: la suma del debe (que por partida doble
             -- iguala al haber). Es el dato con el que el contador reconoce el
             -- documento sin tener que abrirlo.
             (SELECT COALESCE(SUM(cd.debe), 0) FROM comprobantes_detalle cd
               WHERE cd.comprobante_id = c.id)          AS monto,
             -- Las empresas entre las que hay que elegir.
             (SELECT string_agg(DISTINCT e.razon_social, '  |  ' ORDER BY e.razon_social)
                FROM docs d JOIN empresa e ON e.id = d.empresa_id
               WHERE d.clase = c.clase AND d.tipo_dte = c.tipo_dte AND d.folio = c.folio)
                                                        AS empresas_candidatas,
             (SELECT count(DISTINCT d.empresa_id) FROM docs d
               WHERE d.clase = c.clase AND d.tipo_dte = c.tipo_dte AND d.folio = c.folio)
                                                        AS n_candidatas
        FROM comprobantes c
       WHERE c.empresa_id IS NULL
       ORDER BY c.fecha, c.numero_comprobante`);

    if (rows.length === 0) {
        console.log('\n✅ No queda ningún comprobante sin empresa. Nada que revisar.');
        console.log('   Conviene volver a correr las suites de verificación.\n');
        await pool.end();
        return;
    }

    console.log(`\n═══ ${rows.length} COMPROBANTES PENDIENTES DE REVISIÓN CONTABLE ═══\n`);
    console.table(rows.map(r => ({
        'Nº comp.': r.numero_comprobante,
        fecha: r.fecha ? new Date(r.fecha).toISOString().slice(0, 10) : '—',
        clase: r.clase,
        DTE: r.tipo_dte,
        folio: r.folio,
        'RUT contraparte': r.rut_contraparte || '—',
        monto: clp(r.monto),
        'candidatas': r.n_candidatas,
    })));

    console.log('\n── A qué empresas podría corresponder cada uno ──');
    for (const r of rows) {
        console.log(`\n  Nº ${r.numero_comprobante} · ${r.clase} DTE ${r.tipo_dte} folio ${r.folio} · ${clp(r.monto)}`);
        console.log(`     RUT contraparte : ${r.rut_contraparte || '—'}`);
        console.log(`     Candidatas      : ${r.empresas_candidatas || '(ninguna)'}`);
        console.log(`     Para asignarlo  : UPDATE comprobantes SET empresa_id='<uuid>' WHERE id='${r.id}';`);
    }

    console.log('\n── Los uuid de las empresas candidatas ──');
    const { rows: emp } = await pool.query(`
      WITH docs AS (
          SELECT 'venta'::text AS clase, tipo_dte, folio, empresa_id FROM documentos_emitidos WHERE empresa_id IS NOT NULL
          UNION ALL SELECT 'venta',  tipo_dte, folio, empresa_id FROM documentos_emitidos_empresa  WHERE empresa_id IS NOT NULL
          UNION ALL SELECT 'compra', tipo_dte, folio, empresa_id FROM documentos_recibidos         WHERE empresa_id IS NOT NULL
          UNION ALL SELECT 'compra', tipo_dte, folio, empresa_id FROM documentos_recibidos_empresa WHERE empresa_id IS NOT NULL
      )
      SELECT DISTINCT e.id, e.razon_social
        FROM comprobantes c
        JOIN docs d ON d.clase = c.clase AND d.tipo_dte = c.tipo_dte AND d.folio = c.folio
        JOIN empresa e ON e.id = d.empresa_id
       WHERE c.empresa_id IS NULL
       ORDER BY e.razon_social`);
    console.table(emp);

    await pool.end();
};

main().catch(async (e) => { console.error('💥', e.message); await pool.end(); process.exit(1); });
