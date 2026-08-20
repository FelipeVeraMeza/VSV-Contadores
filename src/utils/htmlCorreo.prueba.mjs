import {
    sanitizarHtmlCorreo, esHtmlCorreo, textoPlanoDeHtml, cuerpoVacio, escaparValor,
} from 'file:///C:/Users/felip/OneDrive/Documentos/VS/VSV-Contadores/src/utils/htmlCorreo.js';

let fallos = 0;
const ok = (nombre, real, esperado) => {
    const pasa = typeof esperado === 'function' ? esperado(real) : real === esperado;
    if (!pasa) { fallos++; console.log(`✗ ${nombre}\n   obtuve:  ${JSON.stringify(real)}\n   esperaba: ${esperado}`); }
    else console.log(`✓ ${nombre}`);
};
const sinScript = (s) => !/script|onerror|onload|javascript:/i.test(s);

console.log('\n--- ataques ---');
ok('script simple', sanitizarHtmlCorreo('<p>hola</p><script>alert(1)</script>'), '<p>hola</p>');
ok('script anidado partido', sanitizarHtmlCorreo('<scr<script>ipt>alert(1)</script>'), sinScript);
ok('onerror en tag permitida', sanitizarHtmlCorreo('<p onerror="alert(1)">hola</p>'), '<p>hola</p>');
ok('ONERROR mayúsculas', sanitizarHtmlCorreo('<p ONERROR="alert(1)">hola</p>'), '<p>hola</p>');
ok('href javascript', sanitizarHtmlCorreo('<a href="javascript:alert(1)">clic</a>'), sinScript);
ok('href JaVaScRiPt', sanitizarHtmlCorreo('<a href="JaVaScRiPt:alert(1)">clic</a>'), sinScript);
ok('iframe', sanitizarHtmlCorreo('<iframe src="http://malo.cl"></iframe><p>ok</p>'), '<p>ok</p>');
ok('style con url()', sanitizarHtmlCorreo('<p style="background-image:url(http://x.cl/a.png)">t</p>'), '<p>t</p>');
ok('style con expression', sanitizarHtmlCorreo('<p style="width:expression(alert(1))">t</p>'), '<p>t</p>');
ok('tag <style> completa', sanitizarHtmlCorreo('<style>body{display:none}</style><p>ok</p>'), '<p>ok</p>');
ok('img fuera', sanitizarHtmlCorreo('<p>a</p><img src="x" onerror="alert(1)">'), '<p>a</p>');
ok('comentario fuera', sanitizarHtmlCorreo('<p>a</p><!-- secreto -->'), '<p>a</p>');
ok('tag desconocida se desenvuelve', sanitizarHtmlCorreo('<article>texto</article>'), 'texto');
// Los que se colaban: script y style tienen tipo propio en el árbol, no 'tag'.
ok('script ANIDADO en div', sanitizarHtmlCorreo('<div><p>a</p><script>alert(1)</script></div>'), sinScript);
ok('style ANIDADO en div', sanitizarHtmlCorreo('<div><style>b{x:y}</style><p>a</p></div>'), (s) => !/<style/i.test(s));
ok('script hondo', sanitizarHtmlCorreo('<div><ul><li><script>alert(1)</script>x</li></ul></div>'), sinScript);

console.log('\n--- lo que SÍ debe sobrevivir ---');
ok('negrita', sanitizarHtmlCorreo('<p><strong>hola</strong></p>'), '<p><strong>hola</strong></p>');
ok('lista', sanitizarHtmlCorreo('<ul><li>uno</li><li>dos</li></ul>'), '<ul><li>uno</li><li>dos</li></ul>');
ok('enlace http', sanitizarHtmlCorreo('<a href="https://vsv.cl">ver</a>'),
   '<a href="https://vsv.cl" target="_blank" rel="noopener noreferrer">ver</a>');
ok('mailto', sanitizarHtmlCorreo('<a href="mailto:a@b.cl">correo</a>'), (s) => s.includes('mailto:a@b.cl'));
ok('color permitido', sanitizarHtmlCorreo('<span style="color:#199b4d">v</span>'), '<span style="color:#199b4d">v</span>');
ok('estilo mixto: filtra solo lo malo', sanitizarHtmlCorreo('<p style="color:red;position:fixed">t</p>'), '<p style="color:red">t</p>');

console.log('\n--- marcas partidas por el formato ---');
ok('marca partida', sanitizarHtmlCorreo('<p>{{emp<strong>resa}}</strong></p>'), (s) => s.includes('{{empresa}}'));
ok('marca con nbsp', sanitizarHtmlCorreo('<p>{{&nbsp;empresa&nbsp;}}</p>'), (s) => /\{\{\s*empresa\s*\}\}/.test(s));
ok('marca sana intacta', sanitizarHtmlCorreo('<p>Hola {{empresa}}</p>'), '<p>Hola {{empresa}}</p>');

console.log('\n--- detección y vacío ---');
ok('detecta html', esHtmlCorreo('<p>hola</p>'), true);
ok('texto plano no es html', esHtmlCorreo('Hola\n\nEstimado cliente'), false);
ok('texto con < suelto no es html', esHtmlCorreo('el monto es < 5000'), false);
ok('vacío: <p><br></p>', cuerpoVacio('<p><br></p>'), true);
ok('vacío: espacios', cuerpoVacio('   '), true);
ok('no vacío', cuerpoVacio('<p>hola</p>'), false);
ok('no vacío texto plano', cuerpoVacio('hola'), false);

console.log('\n--- texto plano y escape de valores ---');
ok('texto plano de html', textoPlanoDeHtml('<p>uno</p><p>dos</p>'), (s) => s.includes('uno') && s.includes('dos'));
ok('escapa razón social', escaparValor('GÓMEZ & CÍA <SPA>'), 'GÓMEZ &amp; CÍA &lt;SPA&gt;');

console.log(fallos === 0 ? '\n✅ TODO PASA' : `\n❌ ${fallos} FALLOS`);
process.exit(fallos === 0 ? 0 : 1);
