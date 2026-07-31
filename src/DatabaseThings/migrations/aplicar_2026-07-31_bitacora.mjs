// Aplica la migración del 31-jul: bitácora + organizacion_id en correos_facturas.
// Se puede correr más de una vez sin romper nada.
//
//   node src/DatabaseThings/migrations/aplicar_2026-07-31_bitacora.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../../database/db.js';
import { generateHash } from '../../utils/crypto.js';
import { cleanRut } from '../../lib/rut.js';

const SQL = path.resolve(process.cwd(), 'src/DatabaseThings/migrations/2026-07-31_bitacora_y_organizacion_correos.sql');

const main = async () => {
    console.log('▶ Aplicando 2026-07-31_bitacora_y_organizacion_correos.sql\n');
    await pool.query(fs.readFileSync(SQL, 'utf8'));

    // Los que no calzaron por folio: se completan cruzando el RUT contra
    // empresa.rut_hash, que se calcula en JS con la ENCRYPTION_KEY del sistema.
    const { rows: pendientes } = await pool.query(
        `SELECT id, rut FROM correos_facturas WHERE organizacion_id IS NULL AND rut IS NOT NULL`
    );

    let completados = 0;
    if (pendientes.length) {
        const { rows: emps } = await pool.query(
            `SELECT rut_hash, organizacion_id FROM empresa WHERE rut_hash IS NOT NULL AND organizacion_id IS NOT NULL`
        );
        const porHash = new Map(emps.map(e => [e.rut_hash, e.organizacion_id]));

        for (const p of pendientes) {
            const org = porHash.get(generateHash(cleanRut(String(p.rut))));
            if (!org) continue;
            await pool.query('UPDATE correos_facturas SET organizacion_id = $1 WHERE id = $2', [org, p.id]);
            completados++;
        }
    }

    const { rows: [r] } = await pool.query(
        `SELECT COUNT(*)::int total,
                COUNT(organizacion_id)::int con_org,
                COUNT(*) FILTER (WHERE organizacion_id IS NULL)::int sin_org
           FROM correos_facturas`
    );
    const { rows: [b] } = await pool.query(
        `SELECT to_regclass('public.bitacora_sistema') IS NOT NULL AS existe`
    );

    console.log('✅ Listo\n');
    console.log(`   bitacora_sistema creada : ${b.existe ? 'sí' : 'NO'}`);
    console.log(`   correos_facturas        : ${r.total} filas`);
    console.log(`     con organización      : ${r.con_org}  (${completados} completados por RUT)`);
    console.log(`     sin organización      : ${r.sin_org}`);
    if (r.sin_org) {
        console.log('\n   ⚠️  Las que quedan sin organización son folios que no calzan con ningún');
        console.log('      cobro ni empresa. Se dejan en NULL a propósito: la consulta las muestra');
        console.log('      solo a quien no tiene organización, no a todo el mundo.');
    }

    await pool.end();
};

main().catch(async (e) => { console.error('❌', e.message); await pool.end(); process.exit(1); });
