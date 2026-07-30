// ============================================================================
// GENERADOR DEL REFRESH TOKEN DE GMAIL  (se corre UNA sola vez)
// ----------------------------------------------------------------------------
// Para qué sirve: permitir que el sistema envíe correo por la API de Gmail
// (HTTPS, puerto 443) en vez de SMTP (puertos 465/587). Railway BLOQUEA los
// puertos SMTP salientes, por eso el correo funciona en local y no en producción.
// Con la API el correo sale igual desde la cuenta de Gmail de la oficina.
//
// ANTES de correr esto, en https://console.cloud.google.com:
//   1. Crear un proyecto (o usar uno existente).
//   2. "APIs y servicios" → "Biblioteca" → habilitar **Gmail API**.
//   3. "Pantalla de consentimiento OAuth" → tipo Externo → agregar la cuenta que
//      enviará (matias.olivosb@gmail.com) como "Usuario de prueba".
//   4. "Credenciales" → "Crear credenciales" → "ID de cliente de OAuth" →
//      tipo **Aplicación de escritorio**.
//   5. Copiar el Client ID y el Client Secret.
//
// USO:
//   node src/utils/obtenerTokenGmail.mjs <CLIENT_ID> <CLIENT_SECRET>
//
// Abre el navegador, inicias sesión con la cuenta que enviará, aceptas, y el
// script imprime las tres líneas listas para pegar en el .env.
// ============================================================================
import http from 'node:http';
import { exec } from 'node:child_process';

const [, , CLIENT_ID, CLIENT_SECRET] = process.argv;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('\n❌ Faltan datos.\n');
  console.error('   Uso: node src/utils/obtenerTokenGmail.mjs <CLIENT_ID> <CLIENT_SECRET>\n');
  console.error('   Los sacas de console.cloud.google.com → Credenciales →');
  console.error('   ID de cliente de OAuth → tipo "Aplicación de escritorio".\n');
  process.exit(1);
}

const PUERTO = 53682;
const REDIRECT = `http://localhost:${PUERTO}`;
// gmail.send: solo permite ENVIAR. No da acceso a leer el correo de la cuenta,
// que es el mínimo necesario para esto.
const SCOPE = 'https://www.googleapis.com/auth/gmail.send';

const urlAutorizacion =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',   // sin esto Google NO devuelve refresh_token
    prompt: 'consent',        // fuerza que lo devuelva aunque ya hayas autorizado
  }).toString();

const intercambiarCodigo = async (code) => {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT,
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.refresh_token) {
    throw new Error(
      `Google no devolvió refresh_token (${res.status}): ${JSON.stringify(data)}\n` +
      `Si dice "invalid_grant", el código ya se usó: corre el script de nuevo.`
    );
  }
  return data;
};

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.end('Autorizacion cancelada. Puedes cerrar esta pestana.');
    console.error(`\n❌ Cancelaste la autorización: ${error}\n`);
    servidor.close();
    process.exit(1);
  }
  if (!code) { res.end('Esperando el código...'); return; }

  try {
    const data = await intercambiarCodigo(code);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<h2>Listo</h2><p>Ya puedes cerrar esta pestana y volver a la terminal.</p>');

    console.log('\n✅ Token obtenido. Pega estas tres líneas en tu .env:\n');
    console.log(`GMAIL_CLIENT_ID="${CLIENT_ID}"`);
    console.log(`GMAIL_CLIENT_SECRET="${CLIENT_SECRET}"`);
    console.log(`GMAIL_REFRESH_TOKEN="${data.refresh_token}"`);
    console.log('\n   El refresh token no expira mientras no lo revoques.');
    console.log('   Súbelas también a las Variables de Railway.\n');
  } catch (e) {
    res.end('Hubo un error. Revisa la terminal.');
    console.error(`\n❌ ${e.message}\n`);
  } finally {
    servidor.close();
    process.exit(0);
  }
});

servidor.listen(PUERTO, () => {
  console.log('\n🔑 Autoriza la cuenta que va a ENVIAR los correos.');
  console.log('   (la de la oficina, no la personal de quien configura)\n');
  console.log('   Si el navegador no se abre solo, entra a esta dirección:\n');
  console.log('   ' + urlAutorizacion + '\n');
  // Windows: `start`. En macOS sería `open` y en Linux `xdg-open`.
  exec(`start "" "${urlAutorizacion}"`, () => {});
});
