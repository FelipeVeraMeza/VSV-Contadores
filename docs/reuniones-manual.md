# Reuniones · cómo funciona el sistema de llamadas

**Creado:** 26 de agosto de 2026
**Dónde está:** menú **Comunicaciones → Reuniones** (estuvo en Tickets hasta el 27-08-2026)

Este documento explica **qué hace el sistema de llamadas, cómo se usa y dónde
vive cada pieza**. Los otros dos documentos del módulo son:

- `reuniones-modulo.md` — por qué se construyó así (decisiones de arquitectura)
- `reuniones-requerimientos.md` — la lista completa de requerimientos y su estado

---

## 1. Qué es, en una frase

Una videollamada que se abre **dentro del sistema**, con la particularidad de que
lo importante no es el video: es que quede registrado **con quién se habló, de
qué cliente era, quién asistió de verdad y qué se acordó**.

El video en sí lo sirve Jitsi por fuera y viaja directo entre los computadores de
los participantes. **Por el servidor de VSV no pasa un solo byte de la llamada.**

---

## 2. Cómo se usa

### Reunirse ahora

Botón verde arriba a la derecha. Se le pone un título, se marca a quién invitar,
y se entra a la sala de inmediato. A los invitados les suena la campana en el
momento, sin que tengan que refrescar la pantalla.

**No manda correo**, a propósito: una llamada de ahora se atiende ahora, y para
cuando alguien lea un correo la conversación ya terminó.

### Agendar

Mismo formulario, botón «Agendar». Se elige día, hora y duración; se puede
asociar a un **cliente del CRM** buscándolo por nombre o RUT, y escribir los
temas a tratar.

**Esto sí manda un correo** a cada invitado, con la fecha escrita completa, la
duración, el cliente y los temas. Es el único caso en que el módulo manda correo.

### Entrar

Botón «Entrar» en la fila. La reunión queda **en curso** con el primero que
llega: nadie tiene que «iniciarla» aparte. Ahí se registra su asistencia.

Adentro hay siete botones y nada más: micrófono, cámara, compartir pantalla,
chat, ver a todos en mosaico, configuración de audio y colgar. Arriba, la barra
del sistema muestra el título, el cliente, el tiempo transcurrido y cuántos hay.

### Seguir trabajando mientras hablas

**La llamada ya no se corta al salir de la pantalla.** Se puede ir a
Contabilidad a mirar un saldo, abrir un ticket o revisar una factura sin colgar:
la reunión se achica sola a una **ventanita en la esquina** y sigue igual.

- Se **arrastra** de la barra de arriba, por si tapa algo.
- El botón `⤢` vuelve a la reunión a pantalla completa.
- El botón rojo cuelga, desde donde estés, y pide la nota igual.
- Estando en Reuniones, `⤡` la deja flotando para poder mirar la lista.

Lo único que sigue cortando la llamada es **recargar la página** (F5) o cerrar la
pestaña. El navegador ahora pregunta antes de hacerlo.

### Salir y la nota

Al pulsar «Salir», a **quien convocó** se le pregunta *qué quedó acordado*. Se
puede saltar. Esa nota es la razón de que las reuniones vivan acá y no en Meet:
al mes siguiente nadie se acuerda de qué se habló.

Los demás participantes salen sin que se les pregunte nada, y **la reunión sigue
para los que quedan dentro**.

### Gestionar (el panel)

Botón «Gestionar» en cada fila. Es donde está todo lo demás:

| Sección | Qué permite |
|---|---|
| **Invitados** | Ver quién fue invitado, **quién entró y a qué hora**. Sumar gente —también con la reunión en curso— y sacar a quien todavía no ha entrado. |
| **Enlace de la sala** | Copiarlo para mandárselo a alguien de fuera (un cliente, que no tiene cuenta). Con el aviso de que quien tenga ese enlace entra. |
| **Lo que se acordó** | Corregir la nota después. Puede hacerlo quien convocó y quien estuvo. |
| **Abajo** | Cancelar la reunión (si está viva) o **borrarla del historial** (si ya terminó). |

---

## 3. Las reglas que aplica el sistema

**Quién ve una reunión.** Quien la creó o quien está invitado. La lista de
participantes *es* el permiso. Por encima está el aislamiento por organización,
igual que en el resto del sistema.

**Quién puede qué.**

| Acción | Quién |
|---|---|
| Entrar | Quien convocó y los invitados |
| Sumar a alguien | Cualquiera que esté en la reunión |
| Sacar a alguien | Solo quien convocó, y solo si esa persona **no ha entrado** |
| Corregir la nota | Quien convocó y quien **asistió** |
| Cancelar | Solo quien convocó |
| Borrar del historial | Solo quien convocó, y solo si ya terminó o se canceló |

**Por qué no se puede sacar a alguien que ya entró:** su asistencia es un hecho
registrado, no una invitación que se pueda deshacer.

**Cancelar no borra.** Una reunión agendada con un cliente que no se hizo también
es información. Borrar es aparte, es solo para el historial, y no tiene vuelta
atrás.

**Cualquier rol convoca.** Un Cliente abre una reunión igual que un
Administrador; reunirse no se recorta por permisos de módulo. Se probó con
Administrador, Consultor y Cliente.

**Varias reuniones a la vez no se pisan.** Cada sala tiene un nombre aleatorio de
24 caracteres. Se probaron 20 reuniones simultáneas de cinco personas distintas:
ninguna colisión, cada uno ve solo las suyas, y entrar o terminar una no toca a
las demás.

---

## 4. Qué avisa y por dónde

| Cuándo | Campana | Correo |
|---|---|---|
| Te agendan una reunión | Sí | **Sí** — con fecha, hora, duración, cliente y temas |
| Te llaman ahora | Sí, en vivo | No |
| Te suman a una reunión | Sí | No |
| Empezó la reunión | Sí, una sola vez | No |
| Se canceló | Sí | No |

La regla es: **¿se lo perdería si no abre el sistema hoy?** Una reunión del
jueves sí; que alguien acabe de entrar a una sala, no.

---

## 5. Dónde vive cada cosa

### En la base de datos

| Tabla | Qué guarda |
|---|---|
| `reunion` | Título, sala, cuándo, duración, estado, cliente (`persona_id`), ticket (`tarea_id`), quién convocó, cuándo empezó y terminó **de verdad**, y las notas |
| `reunion_participante` | A quién se invitó, con qué rol, y `entro_at` / `salio_at` |

Migración: `src/DatabaseThings/migrations/2026-08-26_reuniones.sql`

### En el código

| Pieza | Archivo |
|---|---|
| Toda la lógica del servidor | `src/controllers/reuniones.controllers.js` |
| Las rutas de la API | `src/routes/reuniones.routes.js` → montadas en `/api/reuniones` |
| **Quién sirve el video** | `src/utils/videoReunion.js` |
| Las llamadas desde la pantalla | `src/services/reunionesService.js` |
| La pantalla (lista + sala) | `src/components/reuniones/ReunionesPanel.jsx` |
| **La llamada mientras navegas** | `src/contexts/LlamadaContext.jsx` |
| El panel de gestión | `src/components/reuniones/DetalleReunion.jsx` |
| La ventana de video | `src/components/reuniones/SalaJitsi.jsx` |
| El menú | `src/components/Comunicaciones.jsx` y `src/components/MainPage.jsx` |

### La API

```
GET    /api/reuniones?cuando=proximas|pasadas    lista lo que me corresponde
POST   /api/reuniones                            convocar (ahora o agendada)
GET    /api/reuniones/:id                        una reunión
POST   /api/reuniones/:id/entrar                 entrar (devuelve sala y dominio)
POST   /api/reuniones/:id/salir                  registrar la salida
POST   /api/reuniones/:id/terminar               cerrar, con la nota
POST   /api/reuniones/:id/cancelar               cancelar (solo quien convocó)
POST   /api/reuniones/:id/participantes          sumar a alguien
DELETE /api/reuniones/:id/participantes/:usuarioId   sacar a alguien
PATCH  /api/reuniones/:id/notas                  corregir lo acordado
DELETE /api/reuniones/:id                        borrar del historial
```

### El servidor de video

Lo decide **el backend**, con `VIDEO_DOMINIO` en el `.env`. Hoy:
`jitsi.riot.im` (el Jitsi de Element).

Tiene que cumplir **dos** condiciones, y casi ningún servidor público cumple las
dos: no pedir que nadie inicie sesión, y dejarse mostrar dentro de otra página.
Se comprueba así:

```bash
curl -s https://<dominio>/config.js | grep -E "^\s*anonymousdomain"   # si aparece, pide login
curl -sI https://<dominio>/ | grep -i "x-frame-options"               # si aparece, no se deja incrustar
```

Cambiarlo **no obliga a recompilar el frontend**: se cambia la variable, se
reinicia el backend y la próxima reunión ya sale por el servidor nuevo.

---

## 6. Qué NO hace todavía

- **Invitar formalmente a un cliente.** Hoy se le manda el enlace de la sala y
  entra, pero el sistema no sabe quién es ni queda registrado.
- **Sala de espera** para que un externo no entre hasta que lo admitan.
- **Recordatorio** diez minutos antes de una reunión agendada.
- **Que la nota aparezca en la ficha del cliente** y que un acuerdo se convierta
  en tarea con un clic.
- **Convocar desde la ficha del cliente o desde un ticket.**
- **Grabar.** Y si algún día se graba, hay que avisarle a los participantes.

La lista completa, con códigos y prioridad, está en `reuniones-requerimientos.md`.

---

## 7. Qué se probó

**69 pruebas del servidor** (crear, ver, listar, entrar, salir, invitar, quitar,
terminar, notas, cancelar, borrar, avisos, bitácora y 20 reuniones simultáneas):
**69 pasaron, 0 fallaron.**

**25 pruebas en el navegador de verdad**, manejando la pantalla como una persona
(abrir la sección, crear una reunión, entrar a la sala, comprobar que el video
queda incrustado y el reloj corre, salir, escribir la nota, abrir el panel de
gestión): **24 pasaron**. La única marca roja es una advertencia de React que
viene de la librería `react-helmet` y aparece en toda la aplicación, no en este
módulo.

Las pruebas no dejan basura: crean sus propios usuarios y reuniones y los borran
al terminar, y corren con los correos apagados para no escribirle a nadie.
