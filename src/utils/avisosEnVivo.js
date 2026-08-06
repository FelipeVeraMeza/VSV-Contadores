// ============================================================================
// AVISOS EN VIVO · el servidor empuja, la pantalla no pregunta
// ----------------------------------------------------------------------------
// EL PROBLEMA: si le dejo una tarea a Mati y Mati está conectado, no se entera.
// La campana preguntaba cada 60 segundos, así que en el peor caso Mati veía la
// tarea un minuto tarde — o nunca, si no volvía a esa pestaña. En la práctica
// uno terminaba avisándole por WhatsApp, que es exactamente lo que el sistema
// venía a evitar.
//
// LA SOLUCIÓN: Server-Sent Events. Una conexión que el navegador deja abierta y
// por la que el servidor manda el aviso en el momento en que ocurre.
//
// ¿Por qué SSE y no WebSocket? Porque esto es de una sola dirección —el
// servidor avisa, la pantalla escucha— y SSE va sobre HTTP normal: no necesita
// otro servidor, atraviesa los proxies sin configurar nada y el navegador
// reconecta solo si se corta. Un WebSocket sería más de lo necesario.
//
// SI ESTO FALLA NO SE ROMPE NADA: la campana sigue preguntando cada tanto, solo
// que más espaciado. Los avisos llegan igual, más lento.
// ============================================================================

// usuarioId → Set de conexiones abiertas.
// Es un Set y no una sola conexión porque la misma persona puede tener el
// sistema abierto en dos pestañas, o en el computador y el teléfono.
const conexiones = new Map();

// Cada cuánto se manda una señal de vida. Sin esto, los proxies y los
// balanceadores cortan una conexión que lleva rato en silencio.
const LATIDO_MS = 25000;

const escribir = (res, evento, datos) => {
    try {
        res.write(`event: ${evento}\n`);
        res.write(`data: ${JSON.stringify(datos)}\n\n`);
        return true;
    } catch {
        return false;   // la conexión ya no sirve; el que llama la retira
    }
};

/**
 * Deja abierta la conexión de esta persona.
 * Devuelve la función para cerrarla.
 */
export const abrirCanal = (usuarioId, req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        // Nginx corta los streams si no se le dice explícitamente que no.
        'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    if (!conexiones.has(usuarioId)) conexiones.set(usuarioId, new Set());
    conexiones.get(usuarioId).add(res);

    // Primer mensaje: confirma que quedó conectado. La pantalla lo usa para
    // saber que ya no hace falta preguntar tan seguido.
    escribir(res, 'conectado', { ok: true, ts: Date.now() });

    const latido = setInterval(() => {
        // Los comentarios (`:`) no llegan como evento al navegador, pero
        // mantienen viva la conexión.
        try { res.write(': latido\n\n'); } catch { cerrar(); }
    }, LATIDO_MS);

    const cerrar = () => {
        clearInterval(latido);
        const suyas = conexiones.get(usuarioId);
        if (suyas) {
            suyas.delete(res);
            if (suyas.size === 0) conexiones.delete(usuarioId);
        }
        try { res.end(); } catch { /* ya estaba cerrada */ }
    };

    req.on('close', cerrar);
    req.on('error', cerrar);
    return cerrar;
};

/**
 * Empuja un aviso a una persona, si está conectada.
 * Si no lo está no pasa nada: el aviso ya quedó guardado en la base y lo verá
 * al entrar. Esto es el atajo, no el registro.
 */
export const empujarAviso = (usuarioId, aviso) => {
    const suyas = conexiones.get(usuarioId);
    if (!suyas || suyas.size === 0) return 0;

    let entregados = 0;
    for (const res of [...suyas]) {
        if (escribir(res, 'aviso', aviso)) entregados++;
        else suyas.delete(res);            // conexión muerta, se limpia sola
    }
    if (suyas.size === 0) conexiones.delete(usuarioId);
    return entregados;
};

/** Para el panel de estado y para las pruebas. */
export const estadoDelCanal = () => ({
    personasConectadas: conexiones.size,
    conexionesAbiertas: [...conexiones.values()].reduce((n, s) => n + s.size, 0),
});

export const estaConectado = (usuarioId) => (conexiones.get(usuarioId)?.size || 0) > 0;
