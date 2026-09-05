import { pool, cerrar } from './qa/arnes.mjs';
const ORG='e5815fad-7ecb-4903-a28c-0c2188583e24';
const SW = `t.proyecto_id=(SELECT id FROM proyecto WHERE organizacion_id=$1 AND nombre='SOFTWARE SIMPLE PYME')`;
const q=async(s)=>(await pool.query(s,[ORG])).rows;
const g=(await q(`SELECT
  COUNT(*)::int abiertas,
  COUNT(*) FILTER (WHERE t.vence_at IS NULL)::int sin_fecha,
  COUNT(*) FILTER (WHERE t.vence_at IS NOT NULL)::int con_fecha,
  COUNT(*) FILTER (WHERE t.parent_id IS NULL)::int raices,
  COUNT(*) FILTER (WHERE t.parent_id IS NOT NULL)::int subtareas
  FROM tarea t WHERE t.organizacion_id=$1 AND t.archivada_at IS NULL AND ${SW}
    AND t.estado NOT IN ('completada','cancelada')`))[0];
console.log('ABIERTAS EN SOFTWARE SIMPLE PYME:', g.abiertas);
console.log('  sin fecha (se les pondria):', g.sin_fecha);
console.log('  ya tienen fecha           :', g.con_fecha, '<- decidir si se pisan');
console.log('  de esas: raices', g.raices, '| subtareas', g.subtareas);
console.log('\nLAS 3 QUE YA TIENEN FECHA:');
for (const x of await q(`SELECT t.titulo, t.vence_at::date v FROM tarea t
  WHERE t.organizacion_id=$1 AND t.archivada_at IS NULL AND ${SW}
   AND t.estado NOT IN ('completada','cancelada') AND t.vence_at IS NOT NULL ORDER BY t.vence_at`))
  console.log('   ', String(x.titulo).slice(0,46).padEnd(47), String(x.v).slice(0,10));
await cerrar();
