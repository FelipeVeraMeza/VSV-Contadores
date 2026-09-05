// ============================================================================
// CORREDOR DE QA · VSV PRO
// ----------------------------------------------------------------------------
//   node qa/correr.mjs              todas las suites
//   node qa/correr.mjs seguridad    una sola
//   node qa/correr.mjs --rapido     salta rendimiento (para el commit)
//
// Antes de correr nada comprueba que el backend responda: una suite entera en
// rojo porque el servidor no estaba levantado no dice nada sobre el código y
// hace perder tiempo buscando bugs donde no los hay.
// ============================================================================
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const API = process.env.QA_API || 'http://127.0.0.1:4000/api';

// Orden deliberado: seguridad primero. Si el aislamiento está roto, el resto
// de los resultados importa poco.
const ORDEN = ['seguridad', 'sesion', 'conectados', 'roles', 'api', 'funcional', 'crm', 'catalogo', 'contactos', 'prospectos', 'documentacion', 'tareas', 'tareas-ux', 'comunicaciones',
               'cobro-de-factura', 'integracion', 'auditoria', 'rendimiento',
               'e2e', 'regresion'];

const args = process.argv.slice(2);
const rapido = args.includes('--rapido');
const pedidas = args.filter(a => !a.startsWith('--'));

async function backendVivo() {
  try {
    const res = await fetch(`${API}/crm/metricas`, { signal: AbortSignal.timeout(8000) });
    return res.status === 401 || res.status === 200;   // responde = está vivo
  } catch { return false; }
}

const disponibles = readdirSync(join(AQUI, 'casos'))
  .filter(f => f.endsWith('.test.mjs'))
  .map(f => f.replace('.test.mjs', ''));

const suites = ORDEN.filter(s => disponibles.includes(s))
  .concat(disponibles.filter(s => !ORDEN.includes(s)))
  .filter(s => (!pedidas.length || pedidas.includes(s)))
  .filter(s => !(rapido && s === 'rendimiento'));

console.log(`\n  QA · VSV PRO`);
console.log(`  ${API}`);
console.log(`  ${suites.length} suite(s): ${suites.join(', ')}\n`);

if (!await backendVivo()) {
  console.error(`  ✖ El backend no responde en ${API}\n`);
  console.error(`    Levántalo con:  node src/server.js\n`);
  process.exit(2);
}

const resultados = [];
for (const suite of suites) {
  const inicio = Date.now();
  const codigo = await new Promise(resolve => {
    const p = spawn(process.execPath,
      ['--test', join(AQUI, 'casos', `${suite}.test.mjs`)],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    let salida = '';
    p.stdout.on('data', d => { salida += d; });
    p.stderr.on('data', d => { salida += d; });
    p.on('close', c => {
      // node --test emite «ℹ pass 22». El carácter inicial no es ASCII, así que
      // la expresión no puede anclarse a un `.` de un byte.
      const cuenta = { pass: /pass (\d+)/, fail: /fail (\d+)/, skipped: /skipped (\d+)/ };
      const n = (t) => (salida.match(cuenta[t]) || [])[1] ?? '?';
      const pasadas = n('pass'), fallidas = n('fail'), saltadas = n('skipped');
      const marca = c === 0 ? '✔' : '✖';
      const seg = ((Date.now() - inicio) / 1000).toFixed(1);
      console.log(`  ${marca} ${suite.padEnd(14)} ${String(pasadas).padStart(3)} ok` +
                  (Number(fallidas) ? `  ${fallidas} FALLA(S)` : '           ') +
                  (Number(saltadas) ? `  ${saltadas} saltada(s)` : '              ') +
                  `  ${seg}s`);
      // Los detalles solo de lo que falló: el ruido esconde lo importante.
      if (c !== 0) {
        salida.split('\n')
          .filter(l => /✖|AssertionError|Error:/.test(l))
          .slice(0, 8)
          .forEach(l => console.log(`      ${l.trim().slice(0, 150)}`));
      }
      // Notas informativas de las suites (datos de negocio, no fallos).
      salida.split('\n').filter(l => l.includes('ℹ ') && !l.startsWith('ℹ'))
        .forEach(l => console.log(`   ${l.trim()}`));
      resolve(c);
    });
  });
  resultados.push({ suite, codigo });
}

const fallidas = resultados.filter(r => r.codigo !== 0);
console.log('');
if (fallidas.length) {
  console.log(`  ${fallidas.length} suite(s) con fallos: ${fallidas.map(r => r.suite).join(', ')}\n`);
  process.exit(1);
}
console.log(`  Todo en verde.\n`);
