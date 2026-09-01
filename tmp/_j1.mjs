import 'dotenv/config';
import pg from 'pg';
const pool = new pg.Pool({
  user: process.env.DBS_USER, password: process.env.DBS_PASSWORD,
  host: process.env.DBS_HOST, port: process.env.DBS_PORT,
  database: process.env.DBS_DATABASE, ssl: { rejectUnauthorized: false }
});
const { rows } = await pool.query(`
  SELECT p.id, trim(concat_ws(' ', p.nombre, p.apellidos)) persona,
         p.estado_comercial ec, p.necesidad, p.observaciones
    FROM persona p
   WHERE coalesce(trim(p.estado_comercial),'') <> ''
   ORDER BY p.nombre`);
const RUT = /\d{1,2}[.\s]?\d{3}[.\s]?\d{3}\s*[-\s]\s*[0-9kK]\b|\b\d{7,9}\s*[-]\s*[0-9kK]\b/;
const CLAVE = /clave|pass|contrase/i;
let n = 0;
for (const r of rows) {
  n++;
  const t = r.ec.replace(/\s+/g, ' ').trim();
  const flags = [];
  if (RUT.test(t)) flags.push('RUT');
  if (CLAVE.test(t)) flags.push('CLAVE');
  if (t.length > 40) flags.push('LARGO');
  console.log(`${String(n).padStart(2)}. ${flags.length ? '[' + flags.join('+') + '] ' : ''}${r.persona}`);
  console.log(`    "${t}"`);
}
console.log(`\nTOTAL: ${rows.length}`);
await pool.end();
