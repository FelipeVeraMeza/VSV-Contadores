// ============================================================================
// PRUEBA DE CONEXIÓN A LA CASILLA (IMAP)
// ----------------------------------------------------------------------------
// Antes de pelearse con la pantalla, comprobar que el buzón contesta. Este
// script usa las MISMAS variables que `imapBandeja.js`, así que si acá conecta,
// la bandeja también.
//
//   node src/utils/imapBandeja.prueba.mjs
//
// NO imprime la contraseña ni el contenido de los correos: solo si conecta,
// qué carpetas hay y cuántos mensajes tiene INBOX.
// ============================================================================
import 'dotenv/config';
import { ImapFlow } from 'imapflow';

const falta = ['IMAP_HOST', 'IMAP_USER', 'IMAP_PASSWORD'].filter(k => !process.env[k]);
if (falta.length) {
    console.log(`\n❌ Faltan variables en el .env: ${falta.join(', ')}\n`);
    console.log('Agrégalas así (la contraseña es la de la casilla en cPanel):\n');
    console.log('   IMAP_HOST=mail.vsvconsultores.com');
    console.log('   IMAP_PORT=993');
    console.log('   IMAP_USER=lacasilla@vsvconsultores.com');
    console.log('   IMAP_PASSWORD=...\n');
    process.exit(1);
}

const host = process.env.IMAP_HOST;
const port = parseInt(process.env.IMAP_PORT, 10) || 993;
const user = process.env.IMAP_USER;
const secure = String(process.env.IMAP_TLS ?? 'true') !== 'false';

console.log(`\nProbando  ${user}  en  ${host}:${port}  (TLS: ${secure ? 'sí' : 'no'})\n`);

const cliente = new ImapFlow({
    host, port, secure,
    auth: { user, pass: process.env.IMAP_PASSWORD },
    logger: false,
    tls: { rejectUnauthorized: String(process.env.IMAP_TLS_ESTRICTO ?? 'true') !== 'false' },
});

try {
    await cliente.connect();
    console.log('✅ CONECTÓ. El usuario y la contraseña son correctos.\n');

    const buzones = await cliente.list();
    console.log('Carpetas del buzón:');
    for (const b of buzones) console.log(`   · ${b.path}`);

    const lock = await cliente.getMailboxLock('INBOX');
    try {
        console.log(`\nINBOX: ${cliente.mailbox.exists} mensajes · ${cliente.mailbox.unseen ?? '?'} sin leer`);
        console.log(`UIDVALIDITY: ${cliente.mailbox.uidValidity}`);
    } finally { lock.release(); }

    console.log('\nTodo en orden. Ya puedes pulsar «Actualizar» en la pantalla de Correo.\n');
} catch (e) {
    console.log(`❌ NO CONECTÓ: ${e.message}\n`);
    // Los tres errores que salen de verdad, con qué hacer en cada uno.
    if (/auth|credential|login/i.test(e.message)) {
        console.log('Es la CONTRASEÑA o el USUARIO. En cPanel el usuario es el correo');
        console.log('completo (casilla@vsvconsultores.com), no solo la parte de antes de la @.');
    } else if (/ENOTFOUND|EAI_AGAIN/i.test(e.message)) {
        console.log(`El host «${host}» no existe. Míralo en cPanel → Cuentas de correo →`);
        console.log('«Conectar dispositivos», que muestra el servidor exacto.');
    } else if (/ETIMEDOUT|ECONNREFUSED/i.test(e.message)) {
        console.log(`El host responde pero no en el puerto ${port}. Con TLS suele ser 993;`);
        console.log('sin TLS, 143 (y ahí hay que poner IMAP_TLS=false).');
    } else if (/certificate|self.signed/i.test(e.message)) {
        console.log('El certificado del servidor no valida. Si el hosting usa uno propio,');
        console.log('IMAP_TLS_ESTRICTO=false lo deja pasar (menos seguro, pero funciona).');
    }
    process.exitCode = 1;
} finally {
    try { await cliente.logout(); } catch { /* ya estaba cerrado */ }
}
