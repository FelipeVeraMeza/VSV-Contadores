# Correo: por qué funciona en local y no en Railway

**Fecha:** 30-jul-2026 · *actualizado 14-ago-2026.*

**Estado:** ✅ **Resuelto en local.** El dominio `vsvconsultores.com` quedó verificado en
Resend y ya envía desde `matias.olivos@vsvconsultores.com` (prueba con HTTP 200).
**Falta un paso para producción:** subir `RESEND_API_KEY` y `RESEND_FROM` a Railway
(pendiente 3, sección 6).

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

*(Revisado el 14-ago-2026. Antes esta sección decía que los 11 archivos usaban SMTP
salvo uno; eso quedó viejo.)*

Hay que separar dos grupos, porque no corren en el mismo lugar.

### A. Lo que envía la APLICACIÓN (botones de la pantalla) — ✅ todo por la cascada

| Qué lo dispara | Cadena | Sirve en Railway |
|---|---|---|
| Facturación **manual** | `factura_manual.mjs:532` → `enviarCorreoFacturaEnSesion` → `enviarCorreo` → `enviarConReintentos` | ✅ |
| Facturación **masiva** | `factura_masiva.mjs:887` → idem | ✅ |
| Reenvío individual / masivo | `dte.controllers.js` → `reenviarCorreoIndividual` / `reenviarCorreosMasivo` → idem | ✅ |
| Recordatorios de pago | `recordatorio_pago.mjs:294` → `enviarConReintentos` | ✅ |
| Liquidaciones de Remuneraciones | `utils/mailer.js:49` → `enviarConReintentos` | ✅ |

El adjunto también está cubierto: `enviarPorResend` manda el PDF de la factura como
adjunto y embebe la firma de Mati como imagen dentro del HTML.

### B. Scripts que se corren A MANO (`node "src/.../archivo.mjs"`)

Ninguno está enganchado a un botón: no los ejecuta el servidor, así que **no los afecta
el bloqueo de Railway**. Se corren desde el computador, donde SMTP sí funciona.

| Script | Método |
|---|---|
| `aviso_general.mjs`, `aviso_f29_lista.mjs`, `aviso_suspension_lista.mjs`, `recordatorio_pago_lista.mjs` | cascada ✅ |
| `factura_impaga_masivo.mjs`, `f29_disponible_masivo.mjs`, `f29_declarado_masivo.mjs`, `oficina_virtual_masivo.mjs`, `notificar_mensaje.mjs`, `notificados_mensaje.mjs`, `notificar_socios_mensaje.mjs`, `aviso_oficina_virtual_por_vencer.mjs`, `enviador_correos.mjs` | SMTP crudo ⚠️ |

Los del segundo grupo solo se romperían si algún día se enganchan a un botón. Si eso pasa,
hay que cambiarles el `transporter.sendMail(...)` por `enviarConReintentos(...)`.

### La cascada

En [`mensajes_facturador_masivo.mjs`](../src/components/facturacion/scripts/revisar%20para%20envios/mensajes_facturador_masivo.mjs)
(`enviarConReintentos`), tres vías en orden:

```
1. Gmail API por HTTPS   → si hay GMAIL_CLIENT_ID + SECRET + REFRESH_TOKEN
2. Resend por HTTPS      → si hay RESEND_API_KEY
3. Gmail SMTP            → funciona en local, bloqueado en Railway
```

Intenta una, y si falla pasa a la siguiente, y escribe en la consola del servidor por cuál
salió. Ese dato importa: que el correo llegue no basta, si salió por SMTP en Railway
habría fallado.

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

## 4. Estado de Resend

### ✅ Resuelto el 14-ago-2026

Con el dominio ya verificado (sección 5), se repitió el envío que antes fallaba:

| Fecha | Remitente | HTTP | Resultado |
|---|---|---|---|
| 30-jul | `matias.olivos@vsvconsultores.com` | **403** | `The vsvconsultores.com domain is not verified` |
| 30-jul | `onboarding@resend.dev` | 200 | Enviado, pero el remitente dice "resend.dev" |
| **14-ago** | **`matias.olivos@vsvconsultores.com`** | **200** | **Enviado, id `6a5c16ee-fabc-...`** |

**El dominio propio ya envía.** El 403 desapareció al publicar los registros DNS.

### Lo que sigue valiendo

- **Resend NUNCA va a poder enviar desde `@gmail.com`.** Estos servicios solo permiten
  remitentes de dominios verificados por DNS, y `gmail.com` no es nuestro. Si se necesita
  que el correo salga literalmente del Gmail de Mati, la única vía es la **API de Gmail**
  (Camino B, sección 5).
- Los primeros correos de un dominio recién verificado pueden caer en **spam** hasta que
  gane reputación. Es normal y se corrige solo con volumen legítimo.

---

## 5. Los dos caminos posibles

### Camino A — Verificar el dominio en Resend *(recomendado, más rápido)*

Los correos saldrían desde **`matias.olivos@vsvconsultores.com`**.

**Dónde está el DNS:** los nameservers son `dns1.dnscl.net` / `dns2.dnscl.net` →
el dominio se administra en **DonWeb**, que entrega un **cPanel** (usuario `vsvconsu`,
IP compartida `192.141.51.210`). El editor de zona es **Zone Editor**, en la sección
*Dominios*. El correo actual de `@vsvconsultores.com` lo recibe ese mismo servidor
(el MX del dominio apunta al propio dominio, con prioridad 0) y hay 13 cuentas de correo
activas ahí — por eso no se toca nada de la raíz.

#### Los 3 registros a agregar

Resend los entregó el **14-ago-2026** para la región `sa-east-1` (São Paulo). Van tal cual:

| # | Tipo | Nombre | Valor | Prioridad | TTL |
|---|---|---|---|---|---|
| 1 | `TXT` | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC/PfLYZkphm3VUYA0EZYBw51Td1Jd7cER0rTU07q15ZRJ9OFR29ZuenTVmWBF4LS2TK61BGss/d4yM0iC3ApKiUDspV4BeQ4PQl2BocQKWgv0g+aVoc0wrScOTpYupxdDCaY1TicQBIGwJArfHtSYg1QrFLWBs5L0ohuKy2Yl6nQIDAQAB` | — | Auto / 3600 |
| 2 | `MX` | `send` | `feedback-smtp.sa-east-1.amazonses.com` | `10` | Auto / 3600 |
| 3 | `TXT` | `send` | `v=spf1 include:amazonses.com ~all` | — | Auto / 3600 |

- El **1** es el DKIM: la firma con la que Resend prueba que el correo es nuestro.
- El **2 y 3** son del subdominio `send`, que Resend usa como *Return-Path* (rebotes).

#### Pasos en cPanel (DonWeb entrega cPanel, usuario `vsvconsu`)

1. En cPanel, sección **Dominios** → **Zone Editor**.
   *(No confundir con "Dominios", "Subdominios" ni "Email Deliverability".)*
2. En la fila de `vsvconsultores.com` → botón **Administrar**. Se abre la zona completa.
3. **Agregar registro** (arriba a la derecha) → se llena una fila nueva. Repetir 3 veces:

   **Registro 1 — DKIM**
   - Nombre: `resend._domainkey`
   - TTL: `14400`
   - Tipo: `TXT`
   - Registro / Valor: el `p=MIGf...AQAB` completo de la tabla de arriba

   **Registro 2 — MX de rebotes**
   - Nombre: `send`
   - TTL: `14400`
   - Tipo: `MX`
   - Prioridad: `10`
   - Destino: `feedback-smtp.sa-east-1.amazonses.com`

   **Registro 3 — SPF del subdominio**
   - Nombre: `send`
   - TTL: `14400`
   - Tipo: `TXT`
   - Registro / Valor: `v=spf1 include:amazonses.com ~all`

4. **Guardar registro** en cada uno.
5. Volver a [resend.com/domains](https://resend.com/domains) → `vsvconsultores.com` →
   **Verify DNS Records**. Tarda entre 5 minutos y un par de horas.

#### Trampas de este panel (leer antes de pegar)

- **Nombre:** cPanel agrega el dominio solo. Escribir únicamente `send` y
  `resend._domainkey`, **NO** `send.vsvconsultores.com` — queda
  `send.vsvconsultores.com.vsvconsultores.com` y falla. Después de escribirlo, cPanel
  muestra el nombre final: tiene que decir `resend._domainkey.vsvconsultores.com.`
  (con un solo `vsvconsultores.com` y punto al final).
- **NO crear un subdominio `send`** en *Subdominios*. Es solo un registro DNS; crear el
  subdominio arma carpetas y un sitio web que no queremos. Además quedan 4/5 usados.
- **NO usar *Email Deliverability* para "reparar"** nada. Ese botón reescribe el SPF y el
  DKIM del dominio raíz y puede pisar el SPF de DonWeb que hace andar el correo actual.
  Todo esto va por Zone Editor a mano.
- **NO tocar el SPF que ya existe** en la raíz:
  `v=spf1 +a +mx +ip4:192.141.51.208 +ip4:192.141.51.210 include:spff.dww.cl ~all`.
  Ese hace andar el correo actual. El de Resend va en el subdominio `send` y conviven sin
  pisarse. **Nunca puede haber dos SPF en el mismo nombre** — por eso van separados.
- **NO tocar el MX de la raíz** (`vsvconsultores.com`, prioridad 0). El de Resend es del
  subdominio `send`, es otro registro distinto.
- **DKIM:** son 218 caracteres, bajo el límite de 255, así que entra en un solo registro,
  sin partir en trozos. Pegarlo **completo y sin espacios ni saltos de línea** — es el error
  más común. Empieza en `p=` y termina en `AQAB`. Si el panel exige comillas, van rodeando
  todo el valor.
- **MX:** cPanel suele agregarle el punto final solo. Si te deja escribirlo, va
  `feedback-smtp.sa-east-1.amazonses.com.` (con el punto final). El campo **Prioridad**
  aparece recién al elegir el tipo `MX`.
- **TXT:** cPanel pone las comillas solo. No las escribas tú o quedan dobles.
- También hay un TXT `brevo-code:1091dfd8...` en la raíz, de una prueba vieja con Brevo.
  No estorba, se puede dejar.

#### Cómo comprobar que quedó (antes de darle Verify)

Desde PowerShell:

```powershell
nslookup -type=TXT resend._domainkey.vsvconsultores.com 8.8.8.8
nslookup -type=TXT send.vsvconsultores.com 8.8.8.8
nslookup -type=MX  send.vsvconsultores.com 8.8.8.8
```

Los tres tienen que devolver valor. Si dicen `Non-existent domain`, todavía no propaga
(esperar) o el nombre quedó mal escrito (revisar la trampa del nombre duplicado).

**Estado al 14-ago-2026, 10:45:** ✅ **los 3 registros están publicados y correctos.**
Se cargaron por Zone Editor y se verificaron contra los valores que pidió Resend:

| Chequeo | Resultado |
|---|---|
| DKIM `resend._domainkey` | coincide **exacto**, 218/218 caracteres |
| SPF `send` | `v=spf1 include:amazonses.com ~all` |
| MX `send` | `feedback-smtp.sa-east-1.amazonses.com`, prioridad 10 |
| SPF y MX de la **raíz** | intactos, el correo de las 13 cuentas no se tocó |

Resend pasó de `Failed` a **DNS verified** y el envío de prueba desde
`matias.olivos@vsvconsultores.com` devolvió **HTTP 200** (ver sección 4). La verificación
quedó completa; no queda nada por hacer en cPanel.

#### Después de que Resend diga *Verified*

- `RESEND_FROM` ya está en `matias.olivos@vsvconsultores.com`, no hay que cambiarlo.
- Subir `RESEND_API_KEY` y `RESEND_FROM` a las *Variables* de Railway (ver pendiente 3).
- Probar primero a `felipe.veram2001@gmail.com`, nunca directo a un cliente.

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

1. ~~**Elegir camino A o B** y ejecutarlo.~~ ✅ **Hecho el 14-ago-2026.** Se tomó el
   **Camino A**: los 3 registros DNS están publicados en cPanel, verificados, y el envío
   de prueba desde el dominio propio dio 200 (secciones 4 y 5).
   El Camino B (API de Gmail) queda disponible si algún día se necesita que el correo
   salga literalmente desde el Gmail de Mati — la cascada usa la vía que esté configurada.
2. ~~**Llevar la cascada de 3 vías a `src/utils/mailer.js`.**~~ ✅ **Hecho.**
   [`mailer.js`](../src/utils/mailer.js) ya importa `enviarConReintentos` del facturador
   masivo, así que todo el sistema (Remuneraciones, recordatorios, F29, suspensiones) usa
   la misma cascada.
3. **Subir `RESEND_API_KEY` y `RESEND_FROM` a Railway** (*Variables* del proyecto).
   El `.env` local no viaja al deploy.
   - `RESEND_FROM` = `Matías Olivos <matias.olivos@vsvconsultores.com>`
   - `RESEND_API_KEY` = la misma del `.env` local

   → *El 14-ago a las 11:40 el botón de prueba mandó un correo que llegó bien y decía
   entorno **`production`**. Si eso salió del despliegue de Railway, este pendiente ya
   está hecho: allá el SMTP está bloqueado, así que el correo solo pudo salir por Resend.
   Queda confirmar que la prueba no fue local con `NODE_ENV=production`.*
4. **Unificar los nombres de las variables** — hoy hay tres convenciones y dos variables
   muertas (`GMAIL_EMAIL`, `GMAIL_PASSWORD`).
5. **Rotar credenciales**: el 30-jul se pegaron en un chat las claves de Anthropic, OpenAI,
   Supabase, Resend y la contraseña de la base de datos.

---

## 7. El botón "Correo de prueba" *(agregado y retirado el 14-ago-2026)*

Se hizo un botón en **Correo Masivo** que mandaba un correo a una casilla fija y decía por
cuál vía había salido. Cumplió su función: con él se comprobó que el envío funciona desde
Railway (llegó marcado como entorno `production`, ver sección 4).

**Se retiró el mismo día**, una vez confirmado. Vivió en el commit `07a2d78`, por si algún
día hay que reponerlo: tocaba `CorreoMasivo.jsx`, `apiDTE.js`, `dte.routes.js`,
`dte.controllers.js`, `security.js` y `mensajes_facturador_masivo.mjs`.

Si vuelve a hacer falta diagnosticar el envío, la forma rápida sin tocar la interfaz es
mirar la **consola del servidor**: `enviarConReintentos` ya escribe por cuál vía salió
(`✅ Enviado vía Resend (HTTPS)` / `✅ Enviado por SMTP puerto …`).

---

## 7bis. El módulo de envío a clientes *(16-ago-2026)*

Este documento trata de **cómo sale** un correo (la cascada, el dominio, Railway).
La pantalla para **escribirle a los clientes** —seleccionar empresas, redactar con
datos combinables, plantillas y firmas por persona— es otra cosa y tiene su propio
documento: **[correos-requerimientos.md](correos-requerimientos.md)**, con los
requerimientos funcionales, los no funcionales, los legales y lo que falta.

Dos cosas de ahí que conviene saber acá, porque dependen de este diagnóstico:

- El envío por persona **solo es posible porque el dominio quedó verificado**: una
  vez verificado, Resend deja enviar desde cualquier dirección `@vsvconsultores.com`.
- Queda **sin confirmar el límite diario del plan de Resend**. El gratuito ronda
  los 100 correos por día y la cartera con correo son 132.

---

## 7ter. La firma no se veía en Gmail *(16-ago-2026)*

**Síntoma:** el correo llegaba bien pero la imagen de la firma no aparecía.

**Causa:** la imagen viajaba **incrustada como data URI** dentro del HTML. Dos
problemas independientes, y cada uno bastaba por sí solo:

1. **Gmail elimina las imágenes `data:`** al mostrar un correo recibido. No las
   bloquea a la espera de un clic: las saca.
2. La firma pesa ~130 KB, que en base64 dejaban el HTML en ~170 KB. **Gmail
   recorta los mensajes sobre 102 KB** y esconde el resto tras «Ver mensaje
   completo» — y lo que recorta es el final, justo donde va la firma.

**Arreglo:** la imagen va como **adjunto en línea con `Content-ID`** y el HTML la
referencia con `<img src="cid:firma_vsv">`. Es la forma estándar. El HTML volvió
a pesar **0,3 KB** en vez de 170.

Hubo que tocar **dos** lugares, porque el arreglo a medias no servía:

- `correos.controllers.js` — escribe la firma a `tmp/` una vez por campaña y la
  suma a los adjuntos con `cid`, igual que los adjuntos normales.
- `mensajes_facturador_masivo.mjs` → `enviarPorResend()` — **este era el que
  mandaba**. Recibía el `cid:` y lo **volvía a convertir en data URI**, así que
  arreglar solo el controlador no habría cambiado nada. Ahora manda la imagen
  como adjunto con `content_id`.

> Ese segundo cambio **también arregla la firma del facturador**, que tenía el
> mismo problema por el mismo motivo (usa `cid:firma_mati`).

**Ojo con la cascada:** hoy **Gmail API no está configurada**, así que todo sale
por **Resend**. Los caminos de Gmail API y SMTP arman el MIME con nodemailer, que
maneja `cid` bien desde siempre; el único que lo rompía era Resend.

---

## 8. Notas sueltas

- **Correo de pruebas:** `felipe.veram2001@gmail.com`. Siempre enviar ahí antes de escribirle
  a un cliente real.
- **Remitente:** `matias.olivosb@gmail.com` (Gmail) o `matias.olivos@vsvconsultores.com`
  (dominio), según el camino que se elija. No confundir con el de pruebas.
- **`onboarding@resend.dev`** funciona hoy sin configurar nada, pero **no sirve para clientes**:
  el remitente dice "resend.dev" y no pueden responder.
- El panel **Correo del CRM** (`src/components/crm/views/EmailPanel.jsx`) es una pantalla
  **sin backend**: no hace ninguna llamada a la API. Es trabajo aparte del envío.
- Se agregó `.env.backup-*` al `.gitignore`: los respaldos del `.env` contienen secretos.
