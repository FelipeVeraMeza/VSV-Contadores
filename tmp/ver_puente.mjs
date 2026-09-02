// Verifica la cadena COMPLETA en el navegador:
//   panel → fetchWithAuth → backend (/api/asistente) → VSV AI
//
// Esto es lo que no probaron las pruebas del puente: que el frontend hable con
// el backend y no con VSV AI directamente, y que el estado se consulte al
// abrir el panel.
import puppeteer from 'puppeteer';

const SALIDA = 'C:/Users/felip/AppData/Local/Temp/claude/c--Users-felip-OneDrive-Documentos-VS-VSV-Contadores/28d8a9f6-e00f-4fe2-b2d1-8b64ce01f3b8/scratchpad';
const fallos = [];
let n = 0;
const revisar = (d, ok, det = '') => {
  n++;
  console.log(ok ? `  ok    ${d}` : `  FALLA ${d}${det ? `\n         ${det}` : ''}`);
  if (!ok) fallos.push(d);
};

const nav = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const p = await nav.newPage();
await p.setViewport({ width: 1440, height: 900 });

// Se registra a dónde va cada petición: lo importante es que NINGUNA salga
// hacia VSV AI (:8097). Todo tiene que pasar por el backend.
const peticiones = [];
p.on('request', r => {
  const u = r.url();
  if (u.includes('/api/') || u.includes('8097')) peticiones.push({ url: u, metodo: r.method() });
});
const errores = [];
p.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
p.on('pageerror', e => errores.push(e.message));

await p.evaluateOnNewDocument(() => {
  localStorage.setItem('user', JSON.stringify({
    id: 1, nombre: 'Felipe', rol: 'Administrador', sessionId: 'sesion-navegador',
  }));
  localStorage.setItem('asistenteAbierto', '0');
});

await p.goto('http://127.0.0.1:4173/dashboard', { waitUntil: 'networkidle2', timeout: 45000 });
await new Promise(r => setTimeout(r, 2500));

console.log('\nEL PANEL CONSULTA EL ESTADO AL ABRIRSE');
peticiones.length = 0;
await p.click('button[title="Asistente VSV AI"]');
await new Promise(r => setTimeout(r, 1500));

const pidioEstado = peticiones.some(x => x.url.includes('/asistente/estado'));
revisar('pide /api/asistente/estado al abrir', pidioEstado,
  JSON.stringify(peticiones.map(x => x.url.split('/api')[1]).slice(0, 5)));

const entradaActiva = await p.evaluate(() => {
  const t = document.querySelector('aside textarea');
  return t && !t.disabled;
});
revisar('con el asistente disponible la entrada queda activa', entradaActiva);

const hayAviso = await p.evaluate(() =>
  document.querySelector('aside')?.innerText.includes('no está'));
revisar('y no muestra el aviso de no disponible', !hayAviso);

console.log('\nUNA CONSULTA COMPLETA');
peticiones.length = 0;
await p.evaluate(() => {
  [...document.querySelectorAll('aside button')]
    .find(b => b.textContent.includes('¿Quién me debe?')).click();
});
await new Promise(r => setTimeout(r, 4000));

const texto = await p.evaluate(() =>
  [...document.querySelectorAll('aside')].find(x => x.querySelector('textarea')).innerText);

revisar('responde con la cifra', texto.includes('4.328.000'),
  texto.slice(0, 200).replace(/\n/g, ' | '));
revisar('y dice de qué herramienta salió', /consultar deudas/i.test(texto));

// ── LO IMPORTANTE DEL PUENTE ────────────────────────────────────────────────
const alBackend = peticiones.filter(x => x.url.includes('/api/asistente/chat'));
const aVsvAi = peticiones.filter(x => x.url.includes('8097'));

revisar('la consulta va al backend de VSV PRO', alBackend.length === 1,
  JSON.stringify(peticiones.map(x => x.url)));
revisar('el navegador NUNCA habla con VSV AI', aVsvAi.length === 0,
  `se escaparon ${aVsvAi.length} peticiones a :8097`);

// La cabecera de sesión tiene que ir en la petición del navegador.
const cabeceras = await p.evaluate(async () => {
  const r = await fetch('http://127.0.0.1:4000/api/asistente/estado', {
    headers: { 'x-session-id': 'sesion-navegador' },
  });
  return r.ok;
});
revisar('el backend acepta la sesión del navegador', cabeceras);

console.log('\nCONVERSACIÓN');
await p.type('aside textarea', '¿cuánto cobramos este mes?');
await p.keyboard.press('Enter');
await new Promise(r => setTimeout(r, 4000));
const texto2 = await p.evaluate(() =>
  [...document.querySelectorAll('aside')].find(x => x.querySelector('textarea')).innerText);
revisar('Enter envía y responde', texto2.includes('4.671.956'),
  texto2.slice(-150).replace(/\n/g, ' | '));
revisar('la conversación conserva lo anterior', texto2.includes('4.328.000'));

await p.screenshot({ path: `${SALIDA}/puente-ok.png` });

console.log('\nBORRAR LA CONVERSACIÓN');
peticiones.length = 0;
await p.evaluate(() => document.querySelector('button[title="Borrar conversación"]')?.click());
await new Promise(r => setTimeout(r, 1200));
const vacio = await p.evaluate(() =>
  !document.querySelector('aside').innerText.includes('4.328.000'));
revisar('la pantalla queda limpia', vacio);
revisar('y avisa al backend',
  peticiones.some(x => x.url.includes('/asistente/chat/') && x.metodo === 'DELETE'),
  JSON.stringify(peticiones.map(x => `${x.metodo} ${x.url.split('/api')[1]}`)));

const relevantes = errores.filter(e => !/favicon|manifest|Failed to load resource|net::ERR/i.test(e));
revisar('sin errores de JavaScript', relevantes.length === 0, relevantes.slice(0, 2).join(' | '));

await nav.close();

console.log(`\n${'─'.repeat(58)}`);
if (fallos.length) {
  console.log(`${n - fallos.length}/${n} · ${fallos.length} FALLAS\n`);
  fallos.forEach(f => console.log(`  · ${f}`));
  process.exit(1);
}
console.log(`${n}/${n} ok · la cadena completa funciona por una sola URL\n`);
