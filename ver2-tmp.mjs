import { pool, cerrar } from './qa/arnes.mjs';
const ORG='e5815fad-7ecb-4903-a28c-0c2188583e24';
const q=async(s)=>(await pool.query(s,[ORG])).rows;
const SW=`t.proyecto_id=(SELECT id FROM proyecto WHERE organizacion_id=$1 AND nombre='SOFTWARE SIMPLE PYME')`;
const a=(await q(`SELECT COUNT(*)::int abiertas, COUNT(*) FILTER (WHERE t.vence_at IS NULL)::int sin_fecha,
   COUNT(*) FILTER (WHERE t.vence_at::date='2026-09-30')::int al_30
   FROM tarea t WHERE t.organizacion_id=$1 AND t.archivada_at IS NULL AND ${SW} AND t.estado NOT IN ('completada','cancelada')`))[0];
console.log('SOFTWARE SIMPLE PYME · abiertas:', a.abiertas, '| sin fecha:', a.sin_fecha, '| al 30-09:', a.al_30);
const b=(await q(`SELECT COUNT(*)::int abiertas, COUNT(*) FILTER (WHERE t.vence_at IS NULL)::int sin_fecha
   FROM tarea t WHERE t.organizacion_id=$1 AND t.archivada_at IS NULL AND NOT (${SW}) AND t.estado NOT IN ('completada','cancelada')`))[0];
console.log('RESTO DEL SISTEMA   · abiertas:', b.abiertas, '| sin fecha:', b.sin_fecha, '(intactas)');
const c=(await q(`SELECT COUNT(*)::int c FROM tarea t WHERE t.organizacion_id=$1 AND t.archivada_at IS NULL AND ${SW}
   AND t.estado NOT IN ('completada','cancelada') AND t.vence_at::date IN ('2026-08-25','2026-08-28','2026-09-17')`))[0];
console.log('las 3 que ya tenian fecha, sin pisar:', c.c, 'de 3');
console.log('\nEL TABLERO AHORA (11 raices):');
for (const x of await q(`SELECT t.titulo, t.vence_at::date v, t.prioridad, t.estado FROM tarea t
   WHERE t.organizacion_id=$1 AND t.archivada_at IS NULL AND ${SW} AND t.parent_id IS NULL
     AND t.estado NOT IN ('completada','cancelada')
   ORDER BY CASE t.estado WHEN 'pendiente' THEN 0 WHEN 'en_proceso' THEN 1 ELSE 2 END,
     t.vence_at ASC NULLS LAST, CASE t.prioridad WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
     t.created_at DESC, t.id`))
  console.log('  ', String(x.titulo).slice(0,42).padEnd(43), String(x.v).slice(0,10).padEnd(11), String(x.prioridad).padEnd(7), x.estado);
await cerrar();
