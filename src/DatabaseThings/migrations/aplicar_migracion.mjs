// Ejecuta un archivo .sql de migración usando la misma conexión de la app.
// Uso:  node src/DatabaseThings/migrations/aplicar_migracion.mjs <archivo.sql>
// Ej.:  node src/DatabaseThings/migrations/aplicar_migracion.mjs src/DatabaseThings/migrations/2026-06-10_crm_ficha_planes_bitacora.sql

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { pool } from '../../database/db.js';

const archivo = process.argv[2]
    || 'src/DatabaseThings/migrations/2026-06-10_crm_ficha_planes_bitacora.sql';

const run = async () => {
    try {
        const sql = readFileSync(resolve(process.cwd(), archivo), 'utf8');
        console.log(`▶️  Ejecutando migración: ${archivo}`);
        await pool.query(sql);
        console.log('✅ Migración aplicada correctamente.');
    } catch (err) {
        console.error('❌ Error aplicando la migración:', err.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
};

run();
