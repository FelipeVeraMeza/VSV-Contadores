// Verificación final: el panel contra la base REAL de VSV, con Groq
// respondiendo de verdad. No hay nada simulado en esta prueba.
import puppeteer from 'puppeteer';
import 'dotenv/config';

const SALIDA = 'C:/Users/felip/AppData/Local/Temp/claude/c--Users-felip-OneDrive-Documentos-VS-VSV-Contadores/28d8a9f6-e00f-4fe2-b2d1-8b64ce01f3b8/scratchpad';
const fallos = [];
let n = 0;
const revisar = (d, ok, det = '') => {
  n++;
  console.log(ok ? `  ok    ${d}` : `  FALLA ${d}${det ? `\n         ${det}` : ''}`);
  if (!ok) fallos.push(d);
};

// Sesión real de la base: es la única forma de que requireSession la acepte.
const { pool } = await import('../src/database/db.js');
const { rows } = await pool.query(
  `SELECT s.session_id, u.nombre FROM sessions s JOIN usuario u ON s.usuario_id = u.id
   WHERE s.expires_at > NOW() AND u.activo = true ORDER BY s.expires_at DESC LIMIT 1`);
await pool.end();
if (!rows.length) { console.log('No hay sesiones activas.'); process.exit(1); }
const { session_id: sesion, nombre } = rows[0];
console.log(`\nSesión de ${nombre}\n`);

const nav = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const p = await nav.newPage();
await p.setViewport({ width: 1440, height: 900 });

const errores = [];
p.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
p.on('pageerror', e => errores.push(e.message));
const peticiones = [];
p.on('request', r => { if (r.url().includes('/api/asistente')) peticiones.push(r.url()); });

await p.evaluateOnNewDocument((s) => {
  localStorage.setItem('user', JSON.stringify({
    id: 1, nombre: 'Felipe', rol: 'Administrador', sessionId: s,
  }));
  localStorage.setItem('asistenteAbierto', '1');
}, sesion);

await p.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle2', timeout: 45000 });
await new Promise(r => setTimeout(r, 3000));

console.log('ESTADO AL ABRIR');
revisar('consulta el estado por el backend',
  peticiones.some(u => u.includes('/asistente/estado')),
  JSON.stringify(peticiones));

const entradaActiva = await p.evaluate(() => {
  const t = document.querySelector('aside textarea');
  return t && !t.disabled;
});
revisar('el asistente está disponible y deja escribir', entradaActiva);

const aviso = await p.evaluate(() =>
  document.querySelector('aside')?.innerText.match(/no está (habilitado|disponible)|No se pudo conectar/i)?.[0]);
revisar('sin aviso de indisponible', !aviso, aviso || '');

console.log('\nCONSULTA REAL · datos de la base de VSV');
await p.type('aside textarea', '¿cuánto cobramos en agosto?');
await p.keyboard.press('Enter');

// Groq puede hacer esperar por el límite de tokens; se da margen.
await new Promise(r => setTimeout(r, 40000));

const texto = await p.evaluate(() =>
  [...document.querySelectorAll('aside')].find(x => x.querySelector('textarea')).innerText);

// $4.671.956 es lo que la base devuelve para agosto de 2026.
revisar('responde con la cifra real de agosto', texto.includes('4.671.956'),
  texto.slice(-320).replace(/\n/g, ' | '));
revisar('dice de qué herramienta salió', /consultar metricas/i.test(texto));
revisar('la consulta pasó por el backend',
  peticiones.some(u => u.includes('/asistente/chat')));

await p.screenshot({ path: `${SALIDA}/real.png` });

const relevantes = errores.filter(e => !/favicon|manifest|Failed to load resource|net::ERR/i.test(e));
revisar('sin errores de JavaScript', relevantes.length === 0, relevantes.slice(0, 2).join(' | '));

await nav.close();

console.log(`\n${'─'.repeat(58)}`);
if (fallos.length) {
  console.log(`${n - fallos.length}/${n} · ${fallos.length} FALLAS\n`);
  fallos.forEach(f => console.log(`  · ${f}`));
  process.exit(1);
}
console.log(`${n}/${n} ok · el asistente responde con datos reales de VSV\n`);
