import pg from 'pg';
import 'dotenv/config';

// El pooler (Supabase/PgBouncer) verifica la clave con una "auth_query" cada vez
// que se abre una conexión NUEVA. Si abrimos una conexión por request, en el
// arranque en frío esa verificación se satura y tira
// "(EAUTHQUERY) auth_query secret check timed out" -> login 500 al azar.
// Manteniendo conexiones vivas y reutilizándolas se hacen muchas menos
// autenticaciones y el error deja de aparecer.
export const pool = new pg.Pool({
    user: process.env.DBS_USER,
    password: process.env.DBS_PASSWORD,
    host: process.env.DBS_HOST,
    port: process.env.DBS_PORT,
    database: process.env.DBS_DATABASE,
    ssl: {
        rejectUnauthorized: false
    },
    // Reutilizar conexiones en vez de abrir una por request.
    max: 10,
    // No cerrar las conexiones ociosas enseguida: así la siguiente request
    // reusa una ya autenticada y no vuelve a pasar por la auth_query.
    idleTimeoutMillis: 60_000,
    // Si el pooler no da una conexión en 10s, fallar rápido y claro en vez de
    // quedar colgado.
    connectionTimeoutMillis: 10_000,
    // Mantener vivo el socket para que el pooler no lo dé por muerto.
    keepAlive: true,
})

// Sin este handler, un error en una conexión ociosa del pool tumba el proceso
// entero de Node. Lo logueamos y dejamos que el pool se recupere solo.
pool.on('error', (err) => {
    console.error('⚠️  Error inesperado en una conexión ociosa del pool:', err.message);
});