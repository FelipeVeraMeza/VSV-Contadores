import { pedir, pool, cerrar } from './qa/arnes.mjs';
const ORG='e5815fad-7ecb-4903-a28c-0c2188583e24';
// Solo SOFTWARE SIMPLE PYME, solo abiertas, solo las que NO tienen fecha.
const { rows } = await pool.query(`
  SELECT t.id, t.titulo FROM tarea t
   WHERE t.organizacion_id=$1 AND t.archivada_at IS NULL
     AND t.proyecto_id=(SELECT id FROM proyecto WHERE organizacion_id=$1 AND nombre='SOFTWARE SIMPLE PYME')
     AND t.estado NOT IN ('completada','cancelada')
     AND t.vence_at IS NULL
   ORDER BY t.parent_id NULLS FIRST, t.created_at`, [ORG]);
console.log('a actualizar:', rows.length);
const FECHA = '2026-09-30T23:59:00-03:00';
let ok=0, mal=[];
for (const t of rows) {
  const r = await pedir('/crm/tareas/'+t.id, { metodo:'PUT', cuerpo:{ venceAt: FECHA } });
  if (r.estado===200) ok++; else mal.push(t.titulo.slice(0,40)+' -> '+r.estado);
}
console.log('actualizadas OK:', ok, '| fallidas:', mal.length);
if (mal.length) console.log(mal.slice(0,5).join('\n'));
await cerrar();
