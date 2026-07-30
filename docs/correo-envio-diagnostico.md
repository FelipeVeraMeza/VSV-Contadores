# Correo: por qué funciona en local y no en Railway

**Fecha:** 30-jul-2026 · **Estado:** diagnóstico cerrado, falta ejecutar la solución.

---

## 1. El problema

Los correos se envían bien desde `localhost` pero **no salen en Railway** (producción).

**Causa raíz:** todo el sistema envía con `nodemailer` usando `service: 'gmail'`, que es
**SMTP** por los puertos 465/587. **Railway bloquea los puertos SMTP salientes** para
evitar abuso de spam. No es un error del código: es la red del hosting.

La solución en todos los casos es la misma: **enviar por HTTPS (puerto 443)** en vez de
SMTP. Hay dos formas de hacerlo, ver sección 5.

---

## 2. Cómo está el envío hoy

Hay **11 archivos** que envían correo. Todos usan SMTP directo salvo uno.

| Archivo | Método | Sirve en Railway |
|---|---|---|
| `src/utils/mailer.js` | SMTP | ❌ |
| `src/components/facturacion/scripts/revisar para envios/*.mjs` (9 archivos) | SMTP | ❌ |
| `.../mensajes_facturador_masivo.mjs` | **cascada de 3 vías** | ✅ parcialmente |

### La cascada que ya existe

En [`mensajes_facturador_masivo.mjs`](../src/components/facturacion/scripts/revisar%20para%20envios/mensajes_facturador_masivo.mjs)
(líneas 296-450) ya está resuelto el problema, con tres vías en orden:

```
1. Gmail API por HTTPS   → si hay GMAIL_CLIENT_ID + SECRET + REFRESH_TOKEN
2. Resend por HTTPS      → si hay RESEND_API_KEY
3. Gmail SMTP            → funciona en local, bloqueado en Railway
```

Intenta una, y si falla pasa a la siguiente. **Ese patrón es el que hay que llevar a
`utils/mailer.js`** para que lo use todo el sistema, no solo ese script.

---

## 3. Variables de entorno

El código pide **7 variables** de Gmail bajo **tres convenciones de nombres distintas**.
Al 30-jul se corrigió el `.env` y quedó así:

| Variable | Estado | Para qué |
|---|---|---|
| `GMAIL_EMAIL_PRINCIPAL` / `GMAIL_PASSWORD_PRINCIPAL` | ✅ | SMTP de los scripts masivos |
| `GMAIL_EMAIL_Masivo` / `GMAIL_PASSWORD_Masivo` | ✅ *(se agregaron el 30-jul)* | SMTP de `utils/mailer.js` |
| `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN` | ❌ **faltan** | Gmail API (HTTPS) |
| `RESEND_API_KEY` / `RESEND_FROM` | ✅ | Resend (HTTPS) |
| `GMAIL_EMAIL` / `GMAIL_PASSWORD` | existen, **nadie las usa** | restos de una convención vieja |

> **Ojo:** antes del 30-jul faltaban `GMAIL_EMAIL_Masivo` y `GMAIL_PASSWORD_Masivo`, así que
> `utils/mailer.js` **no funcionaba en ningún entorno**, ni siquiera en local. Es el que envía
> las liquidaciones de Remuneraciones. Ya quedó configurado.

La cuenta que envía es **`matias.olivosb@gmail.com`** y la contraseña guardada es una
*App Password* de Google (16 caracteres en 4 grupos), que es lo correcto para SMTP.

---

## 4. Estado de Resend (probado el 30-jul)

Se hicieron dos envíos reales de prueba a `felipe.veram2001@gmail.com`:

| Remitente | HTTP | Resultado |
|---|---|---|
| `matias.olivos@vsvconsultores.com` (el `RESEND_FROM`) | **403** | `The vsvconsultores.com domain is not verified` |
| `onboarding@resend.dev` (dominio de pruebas) | **200** | Enviado, id `6b74b0fb-...` |

**Conclusiones:**

- La **API key de Resend funciona**. No hay problema de cuenta ni de plan.
- El **dominio `vsvconsultores.com` está en `Failed`** en resend.com/domains: nunca se
  completó la verificación DNS. Por eso rechaza los envíos.
- **Resend NUNCA va a poder enviar desde `@gmail.com`.** Estos servicios solo permiten
  remitentes de dominios verificados por DNS, y `gmail.com` no es nuestro. Si se necesita
  que el correo salga literalmente del Gmail de Mati, la única vía es la **API de Gmail**.

---

## 5. Los dos caminos posibles

### Camino A — Verificar el dominio en Resend *(recomendado, más rápido)*

Los correos saldrían desde **`matias.olivos@vsvconsultores.com`**.

**Dónde está el DNS:** los nameservers son `dns1.dnscl.net` / `dns2.dnscl.net` →
el dominio se administra en **DonWeb**. El correo actual de `@vsvconsultores.com` lo recibe
ese mismo servidor (el MX apunta al propio dominio).

**Pasos:**

1. En [resend.com/domains](https://resend.com/domains) → clic en `vsvconsultores.com`.
   Muestra 3 registros a copiar (un MX y dos TXT: SPF y DKIM).
2. En el panel de **DonWeb** → *Mis dominios* → `vsvconsultores.com` → **Zona DNS**.
3. Agregar los 3 registros tal cual.
   - **Nombre:** si el panel ya agrega el dominio solo, escribir únicamente `send`,
     NO `send.vsvconsultores.com` (queda duplicado y falla).
   - **No tocar el SPF existente** (`v=spf1 +a +mx +ip4:192.141.51.208 ... include:spff.dww.cl ~all`).
     Es el que hace andar el correo actual. El de Resend va en el subdominio `send` y conviven.
4. Volver a Resend → **Verify DNS Records**. Tarda entre 5 minutos y un par de horas.

### Camino B — API de Gmail

Los correos saldrían desde **`matias.olivosb@gmail.com`** (el Gmail real).

**Preparación en [console.cloud.google.com](https://console.cloud.google.com):**

1. Crear un proyecto.
2. *APIs y servicios* → *Biblioteca* → habilitar **Gmail API**.
3. *Pantalla de consentimiento OAuth* → Externo → agregar `matias.olivosb@gmail.com`
   como **Usuario de prueba**.
4. *Credenciales* → Crear → **ID de cliente de OAuth** → tipo **Aplicación de escritorio**.
5. Copiar Client ID y Client Secret.

**Después, generar el refresh token** con el script que ya está en el repo:

```bash
node src/utils/obtenerTokenGmail.mjs <CLIENT_ID> <CLIENT_SECRET>
```

Abre el navegador; hay que **iniciar sesión con la cuenta que enviará** (la de Mati, no la
de quien configura). Imprime las tres líneas listas para pegar en el `.env`.

El permiso pedido es solo `gmail.send`: puede enviar, **no puede leer** el correo.
El refresh token no expira mientras no se revoque.

---

## 6. Pendientes

1. **Elegir camino A o B** y ejecutarlo (son los pasos de la sección 5).
   Los dos pueden convivir: la cascada usa la vía que esté disponible.
2. **Llevar la cascada de 3 vías a `src/utils/mailer.js`**, para que todo el sistema
   (Remuneraciones, recordatorios, F29, suspensiones) funcione en Railway y no solo el
   facturador masivo. Es el trabajo de desarrollo que queda.
3. **Subir las variables nuevas a Railway** (*Variables* del proyecto). El `.env` local
   no viaja al deploy.
4. **Unificar los nombres de las variables** — hoy hay tres convenciones y dos variables
   muertas (`GMAIL_EMAIL`, `GMAIL_PASSWORD`).
5. **Rotar credenciales**: el 30-jul se pegaron en un chat las claves de Anthropic, OpenAI,
   Supabase, Resend y la contraseña de la base de datos.

---

## 7. Notas sueltas

- **Correo de pruebas:** `felipe.veram2001@gmail.com`. Siempre enviar ahí antes de escribirle
  a un cliente real.
- **Remitente:** `matias.olivosb@gmail.com` (Gmail) o `matias.olivos@vsvconsultores.com`
  (dominio), según el camino que se elija. No confundir con el de pruebas.
- **`onboarding@resend.dev`** funciona hoy sin configurar nada, pero **no sirve para clientes**:
  el remitente dice "resend.dev" y no pueden responder.
- El panel **Correo del CRM** (`src/components/crm/views/EmailPanel.jsx`) es una pantalla
  **sin backend**: no hace ninguna llamada a la API. Es trabajo aparte del envío.
- Se agregó `.env.backup-*` al `.gitignore`: los respaldos del `.env` contienen secretos.
