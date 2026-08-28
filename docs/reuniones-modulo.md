# Reuniones · videollamada dentro del sistema

**Creado:** 26 de agosto de 2026
**Dónde vive:** Comunicaciones → Reuniones (`/comunicaciones?sub=reuniones`)

> Vivió en **Tickets** hasta el 27-08-2026, con el argumento de que una reunión
> es trabajo que entra igual que un ticket. Se mudó a Comunicaciones: hablar con
> alguien es hablar con alguien, sea por correo, por WhatsApp o por video, y ese
> es el módulo donde se busca. La ruta vieja ya no existe.

---

## 1. Qué problema resuelve

Una reunión con un cliente hoy pasa fuera del sistema: alguien arma un Meet, manda
el link por WhatsApp, hablan media hora, y de eso no queda **nada**. Al mes
siguiente nadie recuerda qué se acordó, ni si el cliente asistió, ni cuándo fue.

Este módulo no viene a competir con Meet en video —Meet es gratis y funciona—.
Viene a guardar **lo que Meet no guarda**:

- de qué cliente y de qué ticket es la reunión,
- a quién se invitó y **quién entró de verdad**,
- el aviso por la campana que ya existe, sin salir a WhatsApp a avisar,
- **lo que se acordó**, escrito en el momento de colgar.

---

## 2. La decisión de arquitectura

> **El video no pasa por este sistema.** Lo sirve Jitsi y viaja directo entre los
> navegadores de los participantes.

Es la decisión que hace que esto sea barato y sencillo. Repartir video de varias
personas exige un servidor que reciba y redistribuya cada cámara (un *SFU*), y
esa pieza es la cara: CPU y ancho de banda. Se puede pagar (LiveKit, Daily),
autohospedar (Jitsi propio en un VPS) o **usar el público**, que es lo que se
eligió para empezar.

**Lo importante es que la decisión no está soldada.** El sistema guarda de la
reunión un solo dato del proveedor: **el nombre de la sala**. Quién sirve esa
sala lo decide el **backend** (`VIDEO_DOMINIO` en el `.env`, leído por
`src/utils/videoReunion.js`) y viaja al navegador en la respuesta de *entrar*.

> Estuvo un rato en el frontend (`VITE_JITSI_DOMAIN`) y fue un error: las
> variables `VITE_` quedan grabadas dentro del archivo compilado, así que
> cambiar de servidor de video obligaba a recompilar y redesplegar la pantalla.
> Ahora se cambia una variable del backend y la próxima reunión ya sale por el
> servidor nuevo.

### Elegir servidor de video: hay que cumplir DOS condiciones

Este fue el enredo real, y conviene dejarlo escrito porque parece una cosa y son
dos:

**1. Que no pida iniciar sesión.** `meet.jit.si` —el Jitsi público más
conocido— obliga al primero que abre una sala a entrar con Google o GitHub
(*«The conference has not yet started because no moderators have arrived»*). Se
ve en su configuración pública:

```
meet.jit.si     anonymousdomain: 'guest.meet.jit.si'   ← activo: el moderador se autentica
meet.ffmuc.net  // anonymousdomain: ...                ← comentado: nadie inicia sesión
```

**2. Que se deje incrustar.** Acá se cayó el primer reemplazo: `meet.ffmuc.net`
no pide login, pero manda `X-Frame-Options: SAMEORIGIN` y una lista blanca de
dominios propios. El navegador se niega a mostrarlo dentro de la ventana y
aparece **«meet.ffmuc.net rechazó la conexión»**. Se comprueba así:

```bash
curl -sI https://<dominio>/ | grep -i "x-frame-options\|frame-ancestors"
```

| Servidor | Sin login | Incrustable |
|---|---|---|
| meet.jit.si | ❌ | ✅ |
| meet.ffmuc.net | ✅ | ❌ |
| **jitsi.riot.im** (Element/Matrix) | ✅ | ✅ ← **el que usa el sistema** |
| vc.autistici.org · meet.evolix.org | ✅ | ✅ (alternativas) |

`jitsi.riot.im` es el Jitsi de Element: está pensado justamente para ir dentro de
otra aplicación, que es lo que hacemos acá.

> Igual es un servicio ajeno y gratuito: **no hay SLA**. Si un día se cae, se
> cambia `VIDEO_DOMINIO` por otro de la tabla y la próxima reunión sale por ahí.
> La pantalla, además, se defiende sola: si a los 12 segundos no entró a la sala,
> ofrece abrirla en otra pestaña, que funciona aunque incrustar no funcione.

**Las tres salidas de fondo, todas soportadas por el código:**

| Opción | Login | Costo | Cuándo conviene |
|---|---|---|---|
| Servidor público sin autenticación (**hoy**) | No | $0 | Para partir y ver si se usa |
| **JaaS** (Jitsi as a Service, de 8x8) | No | Plan gratis, después por uso | Cuando haga falta que no se caiga |
| Jitsi propio en un VPS | No | 20-40 USD/mes | Control total, hay que mantenerlo |

**JaaS ya está implementado**: con `JAAS_APP_ID`, `JAAS_API_KEY` y
`JAAS_PRIVATE_KEY` en el `.env`, el servidor firma un token (RS256, con el
`crypto` de Node, sin librerías nuevas) que acredita como moderador a quien ya
inició sesión en VSV PRO. Nadie entra con Google, y está hecho para incrustarse.
No hay que tocar código: se ponen las tres variables y el sistema las usa solo.

---

## 3. El modelo

Migración `2026-08-26_reuniones.sql`.

| Tabla | Qué guarda |
|---|---|
| `reunion` | Título, sala, cuándo, duración, estado, cliente (`persona_id`), ticket (`tarea_id`), quién la creó, cuándo empezó y terminó de verdad, y las **notas** |
| `reunion_participante` | A quién se invitó, con qué rol (`anfitrion` / `invitado`), y `entro_at` / `salio_at` |

**Por qué `reunion` y no `tarea`.** La convención del proyecto es que toda
actividad del CRM va a `tarea`, y una "reunión" como registro de contacto sigue
yendo ahí. Una videollamada es otra cosa: tiene sala, hora real de inicio y fin,
varios participantes con asistencia individual y un estado en vivo. Forzarlo en
`tarea` habría significado usar `vence_at` como hora de inicio y
`tarea_colaborador` como lista de asistencia — el tipo de reutilización que seis
meses después nadie entiende. Se enlazan con `tarea_id`: una reunión puede
colgar de un ticket.

**Invitado ≠ asistente.** Se guardan por separado a propósito: `entro_at` es lo
que permite responder "¿el cliente asistió a la reunión del martes?", que es la
pregunta que se hace de verdad.

---

## 4. Cómo se usa

**Reunirse ahora** abre una sala al tiro y entra. A los invitados les suena la
campana en el momento (usa el canal SSE que ya existía para las notificaciones).

**Agendar** guarda día, hora, duración, invitados y —si corresponde— el cliente
del CRM, buscándolo por nombre o RUT.

**Entrar** es lo que convierte la reunión en `en_curso`: la abre el primero que
llega, sin que nadie tenga que "iniciarla" aparte. Ahí se registra su asistencia.

**Al colgar**, quien convocó recibe la pregunta *"¿qué quedó acordado?"*. Se
puede saltar. Esa nota es la razón de que el módulo exista: se pregunta en el
momento porque diez minutos después ya nadie escribe nada.

---

## 5. Permisos

Una reunión la ve **quien la creó o quien está invitado**: la lista de
participantes es el permiso. Encima está el aislamiento por organización, como
en todo el sistema.

La ruta **no** se recorta con `requireModulo`: reunirse es transversal, igual que
los tickets. Dejar a alguien fuera de una reunión a la que lo invitaron, por una
bandera de módulo mal puesta, no tiene arreglo a la hora en que ocurre.

> ⚠️ **Ojo con un efecto de la mudanza (27-08-2026).** La API sigue abierta a
> cualquiera con sesión, pero la ENTRADA DEL MENÚ ahora cuelga de Comunicaciones,
> que se esconde con la bandera del CRM (`puedeVerCrm`, ver `BANDERA_POR_MODULO`
> en `MainPage.jsx`). Antes colgaba de Tickets, que no se recorta por nadie. O
> sea: a un usuario con `puedeVerCrm = false` le desaparecería el acceso a
> Reuniones del menú, aunque la pantalla siga funcionando si escribe la URL.
> Hoy no afecta a nadie —los tres usuarios tienen la bandera en `true`, medido el
> 27-08-2026—, pero si algún día se recorta el CRM a alguien, hay que acordarse
> de esto o darle a Comunicaciones su propia bandera.

Cancelar es solo del que convocó. Cancelar **no borra**: una reunión agendada con
un cliente que no se hizo también es información.

---

## 5 bis. La llamada no vive en la pantalla

**El problema.** La sala estaba dentro de `ReunionesPanel`, que se monta bajo el
`<Outlet />` del router. Bastaba ir a Contabilidad —o a otra sección del mismo módulo,
que además remonta por `key`— para que React desmontara el panel y su cleanup
llamara a `dispose()`. Traducido: mirar cualquier otra pantalla **colgaba la
reunión**, y sin aviso.

**Por qué no bastaba con subir el estado.** El video de Jitsi es un `<iframe>`.
Moverlo de un padre a otro en el DOM lo recarga —el navegador reinicia el
documento de adentro— y eso es exactamente colgar y volver a entrar. La caja del
video **no puede cambiar de sitio en el DOM, nunca**.

**Cómo quedó.** `LlamadaProvider` se monta en `MainPage`, que es la ruta padre de
todos los módulos y no se desmonta al navegar. Dibuja **una sola caja**, en un
portal a `<body>`, que vive lo que dura la llamada. Lo único que cambia son sus
coordenadas:

| Modo | Cuándo | Qué se ve |
|---|---|---|
| **Acoplada** | estás en Comunicaciones → Reuniones | ocupa el panel entero, igual que antes |
| **Flotando** | te fuiste a otro módulo, o la minimizaste | ventanita en una esquina, arrastrable, con «volver» y «salir» |

La pantalla de Reuniones ya no dibuja ningún video: deja un **hueco** vacío
(`registrarHueco`) y el proveedor lo mide cuadro a cuadro con
`getBoundingClientRect` y se dibuja justo encima. Se mide cada cuadro y no al
cambiar de ruta porque el hueco se mueve por cosas que no avisan: el menú lateral
que se colapsa, la animación de entrada de la pantalla, la ventana que cambia de
tamaño.

Con la llamada se subieron el cronómetro, el botón de salir y **la nota de lo
acordado**: si colgar desde la ventanita flotante no la pidiera, se perdería justo
lo que hace que las reuniones estén en el sistema.

⚠️ **Al tocar `SalaJitsi.jsx`**: su efecto depende SOLO de `sala`, `dominio` y
`jwt`. Si dependiera además de una función del padre, cualquier redibujo la traería
con otra identidad, el efecto se volvería a ejecutar y su cleanup colgaría la
llamada. Por eso lo demás se lee de refs.

Recargar la página (F5) sigue cortando —el navegador tira el iframe—; ahora al
menos el navegador pregunta antes.

---

## 6. Dónde vive cada cosa

| Pieza | Archivo |
|---|---|
| Tablas | `src/DatabaseThings/migrations/2026-08-26_reuniones.sql` |
| Backend | `src/controllers/reuniones.controllers.js` · `src/routes/reuniones.routes.js` |
| Quién sirve el video | `src/utils/videoReunion.js` (dominio y token JaaS) |
| Montaje | `src/server.js` → `/api/reuniones` |
| Llamadas | `src/services/reunionesService.js` |
| Pantalla | `src/components/reuniones/ReunionesPanel.jsx` |
| **La llamada en curso** | `src/contexts/LlamadaContext.jsx` (montado en `MainPage`) |
| El video | `src/components/reuniones/SalaJitsi.jsx` |
| Menú | `src/components/Comunicaciones.jsx` (sección `reuniones`) · `src/components/MainPage.jsx` |

---

## 7. Lo que este módulo todavía NO hace

- **Invitar a un cliente por link.** Hoy solo entran usuarios del sistema. Falta
  una página pública de acceso con el nombre de la sala firmado.
- **Convocar desde la ficha del cliente o desde un ticket.** El modelo ya guarda
  `persona_id` y `tarea_id`; falta el botón en esas pantallas.
- **Que la nota aparezca en la ficha del cliente.** Hoy queda en la reunión. El
  enlace existe (`persona_id`), falta mostrarla en el historial de la persona.
- **Recordatorio antes de la hora.** La reunión avisa al invitar y al empezar,
  no diez minutos antes.
- **Grabar.** El Jitsi público lo ofrece contra Dropbox; no está integrado.
