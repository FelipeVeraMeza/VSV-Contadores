import { pool, cerrar } from './qa/arnes.mjs';
const r = await pool.query(`SELECT current_setting('TimeZone') tz,
  '2026-09-30T23:59:00-03:00'::timestamptz AS guardado,
  ('2026-09-30T23:59:00-03:00'::timestamptz)::date AS fecha_que_se_ve`);
console.log(JSON.stringify(r.rows[0],null,1));
await cerrar();
