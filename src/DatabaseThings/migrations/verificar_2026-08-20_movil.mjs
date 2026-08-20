/**
 * =============================================================================
 * Verificación · ¿la aplicación se ve bien en un teléfono?
 * =============================================================================
 *
 * QUÉ MIDE, y por qué son dos cosas distintas:
 *
 *   1. SCROLL LATERAL — que la página no se pueda arrastrar de lado. Es el
 *      síntoma que se nota: todo "se ve corrido".
 *   2. CONTENIDO RECORTADO — que ningún elemento quede FUERA de la pantalla
 *      sin forma de alcanzarlo. Esto es peor y no se nota: la regla global
 *      `overflow-x: hidden` esconde el desborde, así que la página se ve
 *      derecha mientras un botón queda cortado y no se puede tocar.
 *      Por eso el script ignora lo que sí se puede desplazar dentro de una
 *      caja con scroll propio (una tabla ancha, por ejemplo) y solo marca lo
 *      que quedó verdaderamente inalcanzable.
 *
 * CÓMO SE USA — con el sistema andando como siempre (`npm run start:all`):
 *     node src/DatabaseThings/migrations/verificar_2026-08-20_movil.mjs
 *
 * ⚠️ APUNTA AL 3000 A PROPÓSITO, y no es un detalle:
 * el CORS del backend solo acepta los orígenes 3000, 5173 y Vercel
 * (`src/config/security.js`). Si se mide contra un `vite preview` en otro
 * puerto, TODAS las llamadas a la API quedan bloqueadas, las pantallas salen
 * vacías… y el script aprueba igual, porque una tabla sin filas nunca
 * desborda. Es un falso aprobado silencioso: pasó el 20-08-2026 y costó
 * descubrirlo. Para usar otro puerto hay que agregarlo antes a `allowedOrigins`
 * y pasarlo en `BASE_MOVIL`.
 *
 * No levanta nada por su cuenta (no toca WhatsApp): usa lo que ya esté corriendo.
 *
 * ⚠️ Crea una sesión de prueba propia en `sessions` —no reutiliza la de
 * nadie— y la BORRA al terminar, pase lo que pase.
 *
 * RESULTADO AL 20-08-2026: 26/26 combinaciones bien.
 * =============================================================================
 */
import 'dotenv/config';
import { pool } from '../../database/db.js';
import puppeteer from 'puppeteer';
import { randomUUID } from 'crypto';

const BASE = process.env.BASE_MOVIL || 'http://localhost:3000';
const SESSION_ID = randomUUID(); // session_id es uuid; se borra en el finally

const PANTALLAS = [
  { nombre: 'iPhone SE',     w: 375, h: 667 },
  { nombre: 'Android chico', w: 360, h: 740 },
];
const RUTAS = [
  '/contabilidad?sub=compras', '/contabilidad?sub=ventas',
  '/contabilidad?sub=recaudaciones', '/contabilidad?sub=centralizacion',
  '/contabilidad?sub=reportes',
  '/CRM?sub=list', '/CRM?sub=prospectos', '/tareas', '/facturacion', '/rrhh',
  '/bancos', '/admin', '/comunicaciones',
];

let browser;
try {
  const { rows: [u] } = await pool.query(
    `SELECT id, nombre, rol FROM usuario WHERE activo = true AND ve_solo_empresas_asignadas = false LIMIT 1`);
  if (!u) throw new Error('no hay usuario');

  await pool.query(
    `INSERT INTO sessions (session_id, usuario_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
    [SESSION_ID, u.id]);
  console.log(`sesión de prueba creada para ${u.nombre}\n`);

  const USER = { id: u.id, nombre: u.nombre, rol: u.rol, sessionId: SESSION_ID,
    modulos: { puedeVerContabilidad: true, puedeVerFacturacion: true, puedeVerRrhh: true,
               puedeVerOperacionRenta: true, puedeVerCrm: true, puedeVerAdmin: true } };

  browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const filas = [];

  for (const p of PANTALLAS) {
    for (const ruta of RUTAS) {
      const page = await browser.newPage();
      await page.setViewport({ width: p.w, height: p.h, isMobile: true, hasTouch: true });
      page.on('pageerror', () => {}); page.on('console', () => {});
      try {
        await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.evaluate((u) => { localStorage.setItem('user', JSON.stringify(u)); localStorage.setItem('companyScope','ALL'); }, USER);
        await page.goto(BASE + ruta, { waitUntil: 'networkidle2', timeout: 40000 });
        await new Promise(r => setTimeout(r, 2000));

        const m = await page.evaluate(() => {
          const de = document.documentElement;
          const fuera = [];
          for (const el of document.querySelectorAll('body *')) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.right > window.innerWidth + 2) {
              // ¿Algún antepasado permite desplazarlo? Entonces es scroll, no recorte.
              let p = el.parentElement, rescatable = false;
              while (p && p !== document.body) {
                const ox = getComputedStyle(p).overflowX;
                if (ox === 'auto' || ox === 'scroll') { rescatable = true; break; }
                p = p.parentElement;
              }
              if (!rescatable) fuera.push({
                tag: el.tagName.toLowerCase(),
                cls: (typeof el.className === 'string' ? el.className : '').split(' ').slice(0,3).join('.'),
                sobra: Math.round(r.right - window.innerWidth),
                texto: (el.textContent || '').trim().slice(0, 30),
              });
            }
          }
          fuera.sort((a,b) => b.sobra - a.sobra);
          return { desborde: de.scrollWidth - de.clientWidth, recortados: fuera.slice(0,2),
                   nRecortados: fuera.length };
        });

        filas.push({
          pantalla: p.nombre, ruta: ruta.replace('/contabilidad?sub=','cont/'),
          'scroll lateral': m.desborde > 1 ? `${m.desborde}px ❌` : 'no ✅',
          'recortado': m.nRecortados === 0 ? 'no ✅' : `${m.nRecortados} ❌`,
          detalle: m.recortados[0] ? `${m.recortados[0].tag}.${m.recortados[0].cls} +${m.recortados[0].sobra}px "${m.recortados[0].texto}"` : '—',
        });
      } catch (e) {
        filas.push({ pantalla: p.nombre, ruta, 'scroll lateral': 'ERROR', recortado: '—', detalle: e.message.slice(0,40) });
      }
      await page.close();
    }
  }

  console.table(filas);
  const malas = filas.filter(f => String(f.recortado).includes('❌') || String(f['scroll lateral']).includes('❌'));
  console.log(malas.length ? `\n❌ ${malas.length} de ${filas.length} con problema` : `\n✅ ${filas.length}/${filas.length} bien`);
} catch (e) {
  console.error('💥', e.message);
} finally {
  if (browser) await browser.close();
  const { rowCount } = await pool.query('DELETE FROM sessions WHERE session_id = $1', [SESSION_ID]);
  console.log(`\nsesión de prueba borrada (${rowCount} fila)`);
  const { rows: [r] } = await pool.query('SELECT count(*) FROM sessions WHERE session_id = $1', [SESSION_ID]);
  console.log(r.count === '0' ? '✅ no quedan sesiones de prueba' : `⚠️ quedan ${r.count}`);
  await pool.end();
}
