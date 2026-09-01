import 'dotenv/config';
import pg from 'pg';
const pool = new pg.Pool({
  user: process.env.DBS_USER, password: process.env.DBS_PASSWORD,
  host: process.env.DBS_HOST, port: process.env.DBS_PORT,
  database: process.env.DBS_DATABASE, ssl: { rejectUnauthorized: false }
});
const { rows: cols } = await pool.query(
  `SELECT column_name FROM information_schema.columns WHERE table_name='servicio' ORDER BY ordinal_position`);
console.log('columnas servicio:', cols.map(c=>c.column_name).join(', '));
const { rows: ej } = await pool.query(`SELECT * FROM servicio LIMIT 1`);
console.log('\nejemplo:', JSON.stringify(ej[0], null, 2));
const { rows: y } = await pool.query(`SELECT id, nombre FROM servicio WHERE nombre ILIKE '%bloqueo%'`);
console.log('\nya existe "bloqueo"?:', y.length ? y : 'no');
await pool.end();
