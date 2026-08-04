// TEMPORAL · prueba y RESTAURA el valor original. No deja cambios.
import { pool } from '../../database/db.js';
import { updateClienteCRM } from '../../controllers/clientes.controllers.js';

const llamar = async (req) => {
    const r = { code: 200, body: null };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    await updateClienteCRM(req, r);
    return r;
};

let id = null, original = null;
try {
    const { rows: [u] } = await pool.query(
        `SELECT id, organizacion_id FROM usuario WHERE nombre ILIKE '%master%' AND activo LIMIT 1`);
    const user = { usuarioId: u.id, organizacionId: u.organizacion_id, rol: 'Administrador', nombre: 'prueba' };

    const { rows: [e] } = await pool.query(
        `SELECT id, razon_social, estado_pago FROM empresa
          WHERE activo AND en_cartera IS NOT FALSE AND organizacion_id = $1 ORDER BY razon_social LIMIT 1`,
        [u.organizacion_id]);
    id = e.id; original = e.estado_pago;
    console.log(`Cliente de prueba : ${e.razon_social}`);
    console.log(`estado_pago ahora : ${original}\n`);

    const nuevo = original === 'AL DIA' ? 'NO PAGADO' : 'AL DIA';
    // El parámetro se llama empresaId, igual que en la ruta real.
    const r = await llamar({ user, params: { empresaId: id }, body: { pagoServicio: nuevo } });
    const { rows: [d] } = await pool.query(`SELECT estado_pago FROM empresa WHERE id=$1`, [id]);
    console.log(`A) Guardar pagoServicio = '${nuevo}'`);
    console.log(`   respuesta HTTP : ${r.code}`);
    console.log(`   quedó en la BD : '${d.estado_pago}'`);
    console.log(d.estado_pago === nuevo ? '   ✓ SÍ se guarda\n' : '   ✗ NO se guarda\n');

    const { rows: [v] } = await pool.query(
        `SELECT e.estado_pago,
                (SELECT COALESCE(SUM(cm.monto_esperado),0) FROM cobro_mensual cm
                  WHERE cm.empresa_id=e.id AND cm.estado='PENDIENTE_PAGO'
                    AND cm.fecha_vencimiento < CURRENT_DATE) AS deuda_vencida,
                (SELECT cm.estado FROM cobro_mensual cm WHERE cm.empresa_id=e.id
                  ORDER BY cm.periodo DESC LIMIT 1) AS ultimo_cobro
           FROM empresa e WHERE e.id=$1`, [id]);
    console.log(`B) Qué muestra cada pantalla`);
    console.log(`   la FICHA guarda y muestra : '${v.estado_pago}'`);
    console.log(`   la LISTA calcula desde    : cobro_mensual → último cobro '${v.ultimo_cobro}', deuda vencida $${Number(v.deuda_vencida).toLocaleString('es-CL')}`);
    console.log(`\n   → La ficha dice "${v.estado_pago}" y la lista lo pinta según la deuda real.`);
    console.log(`   → Son DOS fuentes distintas: cambiar una no mueve la otra.`);

} catch (e) {
    console.error('ERROR:', e.message);
} finally {
    if (id) {
        await pool.query(`UPDATE empresa SET estado_pago=$2 WHERE id=$1`, [id, original]);
        const { rows: [chk] } = await pool.query(`SELECT estado_pago FROM empresa WHERE id=$1`, [id]);
        console.log(`\nRestaurado a '${chk.estado_pago}'. Sin cambios permanentes.`);
    }
    await pool.end();
}
