// ============================================================================
// PRUEBAS DEL PUENTE · /api/asistente
// ----------------------------------------------------------------------------
// Se monta el router REAL en un Express de verdad y se le hacen peticiones. No
// se prueba una réplica: si el reenvío, las cabeceras o el manejo de errores
// estuvieran mal, esto tiene que fallar acá y no en producción.
//
// VSV AI se simula con un servidor HTTP que se puede hacer fallar a voluntad:
// caerse, tardar de más, responder basura. Esos son los casos que importan.
//
//   node tmp/test_puente.mjs
// ============================================================================
import express from 'express';
import http from 'node:http';

const fallos = [];
let n = 0;
const revisar = (d, ok, detalle = '') => {
  n++;
  console.log(ok ? `  ok   ${d}` : `  FALLA ${d}${detalle ? `\n        ${detalle}` : ''}`);
  if (!ok) fallos.push(d);
};

// ── VSV AI simulado ─────────────────────────────────────────────────────────
let modo = 'normal';
const recibido = [];

const aiFalso = http.createServer((req, res) => {
  recibido.push({
    url: req.url,
    metodo: req.method,
    sesion: req.headers['x-session-id'],
    empresa: req.headers['x-company-id'],
    autorizacion: req.headers['authorization'],
  });

  if (modo === 'lento') return;                        // nunca responde
  if (modo === 'basura') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end('<html><body>502 Bad Gateway</body></html>');
  }
  if (modo === 'error500') {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ detail: 'postgres://usuario:clave@interno/db falló' }));
  }
  if (modo === 'modelo_caido') {
    if (req.url === '/salud') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ servicio: 'ok', modelo_alcanzable: false, modelo: 'qwen2.5:7b' }));
    }
    res.writeHead(503, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ detail: 'El asistente no está disponible en este momento.' }));
  }

  if (req.url === '/salud') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ servicio: 'ok', modelo_alcanzable: true, modelo: 'qwen2.5:7b' }));
  }
  if (req.url.startsWith('/api/chat') && req.method === 'DELETE') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }
  let cuerpo = '';
  req.on('data', c => { cuerpo += c; });
  req.on('end', () => {
    recibido[recibido.length - 1].cuerpo = cuerpo ? JSON.parse(cuerpo) : null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      respuesta: 'En agosto se cobraron $4.671.956 en 43 pagos.',
      herramienta: 'consultar_recaudacion',
      ms: 3600,
      modelo: 'qwen2.5:7b',
    }));
  });
});

await new Promise(r => aiFalso.listen(8091, r));
process.env.VSV_AI_URL = 'http://127.0.0.1:8091';

// El controlador lee VSV_AI_URL al importarse, así que va después de fijarla.
const { conversar, olvidarConversacion, estado } = await import('../src/controllers/asistente.controllers.js');

// ── Backend con el router real ──────────────────────────────────────────────
// requireSession se sustituye por un doble: probar la autenticación de VSV PRO
// no es lo de acá, y exigir Postgres haría estas pruebas imposibles de correr.
const app = express();
app.use(express.json());
app.use('/api/asistente', (req, res, next) => {
  if (!req.headers['x-session-id']) return res.status(401).json({ message: 'No se encontró el ID de sesión' });
  req.user = {
    sessionId: req.headers['x-session-id'],
    empresaId: req.headers['x-company-id'] || null,
    usuarioId: 1, rol: 'Administrador', nombre: 'Felipe',
  };
  next();
});
const router = express.Router();
router.get('/estado', estado);
router.post('/chat', conversar);
router.delete('/chat/:conversacionId', olvidarConversacion);
app.use('/api/asistente', router);

const servidor = app.listen(4091);
const BASE = 'http://127.0.0.1:4091/api/asistente';
const CAB = { 'Content-Type': 'application/json', 'x-session-id': 'sesion-abc', 'x-company-id': 'empresa-9' };

const pedir = (ruta, opciones = {}) =>
  fetch(`${BASE}${ruta}`, { headers: CAB, ...opciones });

// ═══════════════════════════════════════════════════════════════════════════
console.log('\nAUTENTICACIÓN');
// ═══════════════════════════════════════════════════════════════════════════

let r = await fetch(`${BASE}/chat`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mensaje: 'hola' }),
});
revisar('sin sesión responde 401', r.status === 401);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\nVALIDACIÓN DE ENTRADA');
// ═══════════════════════════════════════════════════════════════════════════

for (const [nombre, cuerpo, esperado] of [
  ['mensaje vacío', { mensaje: '' }, 400],
  ['solo espacios', { mensaje: '   ' }, 400],
  ['sin mensaje', {}, 400],
  ['mensaje numérico', { mensaje: 42 }, 400],
  ['mensaje nulo', { mensaje: null }, 400],
  ['mensaje enorme', { mensaje: 'x'.repeat(3000) }, 400],
]) {
  r = await pedir('/chat', { method: 'POST', body: JSON.stringify(cuerpo) });
  revisar(`rechaza ${nombre}`, r.status === esperado, `respondió ${r.status}`);
}

// El tope se valida acá para no gastar inferencia, pero 2.000 justos sí pasan.
r = await pedir('/chat', { method: 'POST', body: JSON.stringify({ mensaje: 'x'.repeat(2000) }) });
revisar('acepta el máximo exacto (2.000)', r.status === 200, `respondió ${r.status}`);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\nREENVÍO · lo que le llega a VSV AI');
// ═══════════════════════════════════════════════════════════════════════════

recibido.length = 0;
r = await pedir('/chat', {
  method: 'POST',
  body: JSON.stringify({ mensaje: '  ¿cuánto cobramos en agosto?  ', conversacionId: 'hilo-7' }),
});
const cuerpo = await r.json();

revisar('responde 200', r.status === 200);
revisar('con la respuesta del asistente', cuerpo.respuesta?.includes('4.671.956'));
revisar('y con qué herramienta se usó', cuerpo.herramienta === 'consultar_recaudacion');

const ult = recibido.at(-1);
revisar('la sesión del usuario viaja a VSV AI', ult.sesion === 'sesion-abc');
revisar('y la empresa activa también', ult.empresa === 'empresa-9');
revisar('NO se manda Authorization (VSV PRO no lo usa)', !ult.autorizacion);
revisar('el mensaje llega sin espacios sobrantes', ult.cuerpo.mensaje === '¿cuánto cobramos en agosto?');
revisar('el id de conversación se respeta', ult.cuerpo.conversacion_id === 'hilo-7');

// Sin conversacionId se usa 'default'; si no, VSV AI recibiría undefined.
recibido.length = 0;
await pedir('/chat', { method: 'POST', body: JSON.stringify({ mensaje: 'hola' }) });
revisar('sin conversacionId usa "default"', recibido.at(-1).cuerpo.conversacion_id === 'default');

// Sin empresa seleccionada no se manda la cabecera vacía.
recibido.length = 0;
await fetch(`${BASE}/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-session-id': 'sesion-abc' },
  body: JSON.stringify({ mensaje: 'hola' }),
});
revisar('sin empresa no manda la cabecera vacía', !recibido.at(-1).empresa);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\nESTADO');
// ═══════════════════════════════════════════════════════════════════════════

modo = 'normal';
r = await pedir('/estado');
let e = await r.json();
revisar('informa disponible cuando todo anda', e.disponible === true);
revisar('y qué modelo hay detrás', e.modelo === 'qwen2.5:7b');

modo = 'modelo_caido';
e = await (await pedir('/estado')).json();
revisar('detecta el modelo caído', e.disponible === false);
revisar('y lo distingue del servicio caído', e.motivo === 'modelo_caido');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\nERRORES · nada interno se filtra');
// ═══════════════════════════════════════════════════════════════════════════

modo = 'error500';
r = await pedir('/chat', { method: 'POST', body: JSON.stringify({ mensaje: 'hola' }) });
let texto = await r.text();
revisar('un 500 de VSV AI se traduce a 502', r.status === 502, `respondió ${r.status}`);
revisar('sin filtrar la cadena de conexión',
  !texto.includes('postgres') && !texto.includes('clave'), texto.slice(0, 150));

modo = 'basura';
r = await pedir('/chat', { method: 'POST', body: JSON.stringify({ mensaje: 'hola' }) });
revisar('una respuesta que no es JSON no rompe el puente', r.status === 502, `respondió ${r.status}`);
revisar('y da un mensaje legible', (await r.json()).message?.length > 10);

modo = 'modelo_caido';
r = await pedir('/chat', { method: 'POST', body: JSON.stringify({ mensaje: 'hola' }) });
revisar('un 503 se propaga como 503', r.status === 503, `respondió ${r.status}`);

// VSV AI caído del todo: se apaga el simulador.
modo = 'normal';
await new Promise(r2 => aiFalso.close(r2));
r = await pedir('/chat', { method: 'POST', body: JSON.stringify({ mensaje: 'hola' }) });
texto = await r.text();
revisar('con VSV AI apagado responde 503', r.status === 503, `respondió ${r.status}`);
revisar('sin filtrar la dirección interna',
  !texto.includes('8091') && !texto.includes('127.0.0.1') && !texto.includes('ECONNREFUSED'),
  texto.slice(0, 150));

r = await pedir('/estado');
e = await r.json();
revisar('el estado no revienta con VSV AI apagado', r.status === 200 && e.disponible === false);
revisar('y dice que el servicio está caído', e.motivo === 'servicio_caido');

// Borrar la conversación con VSV AI caído: el usuario ya vació su pantalla.
r = await pedir('/chat/hilo-7', { method: 'DELETE' });
revisar('borrar el hilo funciona aunque VSV AI esté caído', r.status === 200);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\nSIN CONFIGURAR · el asistente apagado');
// ═══════════════════════════════════════════════════════════════════════════

delete process.env.VSV_AI_URL;
const limpio = await import(`../src/controllers/asistente.controllers.js?sin=${Date.now()}`);
const app2 = express();
app2.use(express.json());
app2.use((req, _res, next) => { req.user = { sessionId: 's', empresaId: null }; next(); });
app2.get('/estado', limpio.estado);
app2.post('/chat', limpio.conversar);
const srv2 = app2.listen(4092);

r = await fetch('http://127.0.0.1:4092/chat', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mensaje: 'hola' }),
});
e = await r.json();
revisar('responde 503 sin VSV_AI_URL', r.status === 503);
revisar('con motivo "sin_configurar"', e.motivo === 'sin_configurar');
revisar('y un mensaje claro para el usuario', /habilitado/i.test(e.message), e.message);

e = await (await fetch('http://127.0.0.1:4092/estado')).json();
revisar('el estado lo informa sin error', e.disponible === false && e.motivo === 'sin_configurar');

srv2.close();
servidor.close();

console.log(`\n${'─'.repeat(58)}`);
if (fallos.length) {
  console.log(`${n - fallos.length}/${n} · ${fallos.length} FALLAS\n`);
  fallos.forEach(f => console.log(`  · ${f}`));
  process.exit(1);
}
console.log(`${n}/${n} pruebas ok · el puente aísla al frontend de VSV AI\n`);
