import { pedir, pool, cerrar } from './qa/arnes.mjs';
const ORG='e5815fad-7ecb-4903-a28c-0c2188583e24';
// Las 84 que quedaron el 01-10 por el desfase de zona horaria.
const { rows } = await pool.query(`
  SELECT t.id FROM tarea t WHERE t.organizacion_id=$1 AND t.archivada_at IS NULL
    AND t.proyecto_id=(SELECT id FROM proyecto WHERE organizacion_id=$1 AND nombre='SOFTWARE SIMPLE PYME')
    AND t.estado NOT IN ('completada','cancelada')
    AND t.vence_at = '2026-10-01T02:59:00.000Z'::timestamptz`, [ORG]);
console.log('a corregir:', rows.length);
// 18:00 en Chile (UTC-3) = 21:00 UTC del MISMO dia: no cruza la medianoche.
const FECHA = '2026-09-30T18:00:00-03:00';
let ok=0, mal=0;
for (const t of rows) {
  const r = await pedir('/crm/tareas/'+t.id, { metodo:'PUT', cuerpo:{ venceAt: FECHA } });
  r.estado===200 ? ok++ : mal++;
}
console.log('corregidas:', ok, '| fallidas:', mal);
await cerrar();
