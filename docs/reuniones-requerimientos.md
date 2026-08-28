# Reuniones · Requerimientos

**Creado:** 26 de agosto de 2026
**Módulo:** Comunicaciones → Reuniones (estuvo en Tickets hasta el 27-08-2026) · Ver también `docs/reuniones-modulo.md` (arquitectura)

Estado: ✅ hecho · 🟡 a medias · ❌ falta

---

## 1. Cómo se invita HOY (el estado real, sin adornos)

Se invita **en el momento de crear la reunión**, marcando personas en «Con quién».
A cada una le llega un aviso en la campana, en vivo si tiene el sistema abierto.
Entran desde Comunicaciones → Reuniones → Entrar.

Y ahí se acaba. Lo que **no** se puede hacer todavía:

| Lo que falta | Por qué importa |
|---|---|
| **Agregar a alguien después de creada** | Es el caso más común: la reunión ya empezó y hay que sumar a otro. Hoy no hay dónde. |
| **Invitar a un cliente** | Solo entran usuarios del sistema. Los clientes no tienen cuenta, así que hoy una reunión con cliente no se puede hacer por acá. |
| **Copiar el enlace** | No hay forma de sacar el link para pegarlo en un WhatsApp o un correo. |
| **Invitación por correo** | El aviso vive dentro del sistema; si la persona no entra, no se entera. |
| **Agregarla al calendario** | Sin un `.ics`, la reunión no aparece en el Google Calendar de nadie. |

Los primeros tres son de horas de trabajo. Los otros dos son de un día.

---

## 2. Requerimientos funcionales

### Convocar

| ID | Requerimiento | Estado |
|---|---|---|
| RF-RE-01 | Abrir una sala inmediata («reunirse ahora») y entrar sin pasos intermedios | ✅ |
| RF-RE-02 | Agendar una reunión con fecha, hora y duración | ✅ |
| RF-RE-03 | Ponerle título y temas a tratar | ✅ |
| RF-RE-04 | Asociarla a un cliente del CRM, buscándolo por nombre o RUT | ✅ |
| RF-RE-05 | Asociarla a un ticket (la tabla lo soporta; falta el botón en la pantalla del ticket) | 🟡 |
| RF-RE-06 | Convocar desde la ficha del cliente | ❌ |
| RF-RE-07 | Convocar desde un ticket | ❌ |
| RF-RE-08 | Reuniones que se repiten (semanal, mensual) | ❌ |

### Invitar

| ID | Requerimiento | Estado |
|---|---|---|
| RF-RE-10 | Invitar usuarios del sistema al crear la reunión | ✅ |
| RF-RE-11 | **Agregar o quitar invitados después de creada** | ❌ |
| RF-RE-12 | **Copiar el enlace de la sala** para mandarlo por fuera | ❌ |
| RF-RE-13 | **Invitar a alguien sin cuenta (cliente) con un enlace público** | ❌ |
| RF-RE-14 | Que ese enlace público caduque con la reunión y no sirva después | ❌ |
| RF-RE-15 | Que el invitado externo entre con su nombre, y quede registrado quién fue | ❌ |
| RF-RE-16 | Mandar la invitación por correo, con el enlace | ❌ |
| RF-RE-17 | Mandar la invitación por WhatsApp (el sistema ya manda WhatsApp) | ❌ |
| RF-RE-18 | Adjuntar un archivo de calendario (`.ics`) para Google Calendar o Outlook | ❌ |
| RF-RE-19 | Sala de espera: que el externo no entre hasta que alguien de la casa lo admita | ❌ |

> **RF-RE-13 es el que cambia el módulo de categoría.** Sin él esto sirve para
> hablar entre nosotros; con él sirve para atender clientes, que es donde está el
> valor. Requiere una página pública de acceso y un enlace firmado que no permita
> adivinar otras salas.

### Avisos

| ID | Requerimiento | Estado |
|---|---|---|
| RF-RE-20 | Avisar por la campana al que fue invitado | ✅ |
| RF-RE-21 | Que el aviso llegue en vivo, sin refrescar la pantalla | ✅ |
| RF-RE-22 | Avisar cuando la reunión empieza (alguien entró a la sala) | ✅ |
| RF-RE-23 | Avisar una sola vez por reunión, no una por cada persona que entra | ✅ |
| RF-RE-24 | Avisar si la reunión se cancela | ✅ |
| RF-RE-25 | Recordatorio 10-15 minutos antes de una reunión agendada | ❌ |
| RF-RE-26 | Que el aviso de «te están llamando» sea más notorio que la campana (ventana + sonido) | ❌ |
| RF-RE-27 | No avisarle a quien convoca de sus propias acciones | ✅ |

### La sala

| ID | Requerimiento | Estado |
|---|---|---|
| RF-RE-30 | Video y audio entre los participantes, dentro del sistema | ✅ |
| RF-RE-31 | Entrar sin pantallas intermedias ni cuentas de terceros | ✅ |
| RF-RE-32 | Silenciar micrófono y apagar cámara | ✅ |
| RF-RE-33 | Compartir pantalla | ✅ |
| RF-RE-34 | Chat escrito durante la reunión | ✅ |
| RF-RE-35 | Ver a todos en mosaico | ✅ |
| RF-RE-36 | Elegir micrófono, cámara y parlante | ✅ |
| RF-RE-37 | Ver el tiempo transcurrido | ✅ |
| RF-RE-38 | Salir sin cortarle la reunión a los demás | ✅ |
| RF-RE-39 | Si la sala no carga, ofrecer abrirla en otra pestaña | ✅ |
| RF-RE-40 | Grabar la reunión | ❌ |
| RF-RE-41 | Levantar la mano y reacciones | ❌ (se quitaron a propósito, para simplificar) |
| RF-RE-42 | Fondo desenfocado | 🟡 (lo trae Jitsi, no está expuesto en la barra) |

### Registro

| ID | Requerimiento | Estado |
|---|---|---|
| RF-RE-50 | Registrar quién entró de verdad y a qué hora | ✅ |
| RF-RE-51 | Registrar a qué hora salió cada uno | ✅ |
| RF-RE-52 | Distinguir al invitado que no asistió | ✅ |
| RF-RE-53 | Pedir la nota de lo acordado al colgar, a quien convocó | ✅ |
| RF-RE-54 | Poder saltar la nota sin quedar atrapado | ✅ |
| RF-RE-55 | Guardar cuándo empezó y terminó de verdad, no solo lo agendado | ✅ |
| RF-RE-56 | **Que la nota aparezca en la ficha del cliente** | ❌ |
| RF-RE-57 | Que la nota aparezca en el ticket asociado | ❌ |
| RF-RE-58 | Convertir un acuerdo de la nota en una tarea, con un clic | ❌ |
| RF-RE-59 | Editar la nota después de cerrada la reunión | ❌ |
| RF-RE-60 | Adjuntar archivos a la reunión (lo que se mostró en pantalla) | ❌ |

### Consultar

| ID | Requerimiento | Estado |
|---|---|---|
| RF-RE-70 | Ver las próximas reuniones | ✅ |
| RF-RE-71 | Ver el historial de las pasadas, con sus notas | ✅ |
| RF-RE-72 | Ver quién está dentro de una sala en curso, antes de entrar | ✅ |
| RF-RE-73 | Buscar reuniones por cliente | 🟡 (la API filtra; falta el filtro en pantalla) |
| RF-RE-74 | Ver las reuniones de un cliente dentro de su ficha | ❌ |
| RF-RE-75 | Vista de calendario (semana / mes) | ❌ |
| RF-RE-76 | Que aparezcan en el Inicio de Tickets junto a lo que vence hoy | ❌ |

### Administrar

| ID | Requerimiento | Estado |
|---|---|---|
| RF-RE-80 | Cancelar una reunión, avisando a los invitados | ✅ |
| RF-RE-81 | Que cancelar no borre: queda en el historial como cancelada | ✅ |
| RF-RE-82 | Cambiar la hora de una reunión agendada | ❌ |
| RF-RE-83 | Editar título, temas o cliente después de creada | ❌ |
| RF-RE-84 | Cerrar una reunión que quedó abierta por olvido | 🟡 (solo entrando de nuevo y colgando) |

---

## 3. Requerimientos no funcionales

### Privacidad y datos

| ID | Requerimiento | Estado |
|---|---|---|
| RNF-RE-01 | El audio y el video **no pasan por el servidor del sistema**: van directo entre los participantes | ✅ |
| RNF-RE-02 | El sistema no guarda ninguna grabación ni copia de la conversación | ✅ |
| RNF-RE-03 | El nombre de la sala es aleatorio de 24 caracteres: no se puede adivinar ni recorrer | ✅ |
| RNF-RE-04 | Una reunión solo la ve quien la creó o fue invitado, dentro de su organización | ✅ |
| RNF-RE-05 | El navegador no guarda el nombre de la sala en su historial (`doNotStoreRoom`) | ✅ |
| RNF-RE-06 | Advertir a los participantes si alguna vez se graba (exigencia legal en Chile: grabar sin aviso no corresponde) | ❌ (no hay grabación todavía) |
| RNF-RE-07 | El enlace público para clientes debe caducar y no permitir llegar a otra sala | ❌ (junto con RF-RE-13) |

### Seguridad

| ID | Requerimiento | Estado |
|---|---|---|
| RNF-RE-10 | Toda la API exige sesión válida | ✅ |
| RNF-RE-11 | Aislamiento por organización, por encima de los permisos de la reunión | ✅ |
| RNF-RE-12 | Solo quien convocó puede cancelar | ✅ |
| RNF-RE-13 | Si el proveedor usa token, lo firma el servidor y dura lo mínimo (2 h) | ✅ |
| RNF-RE-14 | La clave privada del proveedor nunca llega al navegador | ✅ |
| RNF-RE-15 | Quedar registrado en la bitácora: quién convocó y quién cerró | ✅ |

### El proveedor de video

| ID | Requerimiento | Estado |
|---|---|---|
| RNF-RE-20 | Cambiar de proveedor debe ser una variable de entorno, no una reescritura | ✅ |
| RNF-RE-21 | El cambio no debe obligar a recompilar ni redesplegar el frontend | ✅ |
| RNF-RE-22 | El servidor de video debe permitir entrar **sin iniciar sesión** | ✅ |
| RNF-RE-23 | Debe permitir mostrarse dentro del sistema (sin `X-Frame-Options` que lo impida) | ✅ |
| RNF-RE-24 | Debe existir una salida si el servidor gratuito falla (JaaS ya implementado) | ✅ |
| RNF-RE-25 | Para uso con clientes, un servicio con respaldo, no comunitario | ❌ (decisión pendiente) |

### Rendimiento y capacidad

| ID | Requerimiento | Estado |
|---|---|---|
| RNF-RE-30 | Entrar a la sala en menos de 5 segundos en una conexión normal | 🟡 (sin medir) |
| RNF-RE-31 | Aguantar al menos 6 personas a la vez sin que se corte | 🟡 (sin probar) |
| RNF-RE-32 | La lista de reuniones debe cargar en menos de 1 segundo | ✅ (tope de 100, con índices) |
| RNF-RE-33 | Liberar cámara y micrófono al salir, sin dejar la luz encendida | ✅ |
| RNF-RE-34 | No abrir una conexión de video por cada vez que se dibuja la pantalla | ✅ |

### Compatibilidad

| ID | Requerimiento | Estado |
|---|---|---|
| RNF-RE-40 | Funcionar en Chrome y Edge de escritorio | ✅ |
| RNF-RE-41 | Funcionar en Firefox y Safari | 🟡 (sin probar) |
| RNF-RE-42 | Funcionar en teléfono, sin pedir instalar la app de Jitsi | 🟡 (`disableDeepLinking` puesto; sin probar) |
| RNF-RE-43 | Funcionar detrás del firewall de la oficina, o decir claramente que no se puede | 🟡 (sin probar; si falla, hace falta un TURN) |
| RNF-RE-44 | Requiere HTTPS para cámara y micrófono | ✅ |

### Usabilidad

| ID | Requerimiento | Estado |
|---|---|---|
| RNF-RE-50 | Entrar a una reunión en un solo clic desde la lista | ✅ |
| RNF-RE-51 | No mostrar nombres de sala ni datos técnicos al usuario | ✅ |
| RNF-RE-52 | Barra de la llamada con lo necesario y nada más (7 botones) | ✅ |
| RNF-RE-53 | Todo en español | ✅ |
| RNF-RE-54 | Que se entienda qué pasa cuando algo falla, y qué hacer | ✅ |
| RNF-RE-55 | No perder lo escrito en la nota si falla el guardado | 🟡 |
| RNF-RE-56 | Manejo por teclado y lectores de pantalla | ❌ |

### Mantenimiento

| ID | Requerimiento | Estado |
|---|---|---|
| RNF-RE-60 | Migración idempotente, se puede aplicar dos veces | ✅ |
| RNF-RE-61 | Un solo archivo decide el proveedor de video (`utils/videoReunion.js`) | ✅ |
| RNF-RE-62 | Sin dependencias nuevas (el token se firma con `crypto` de Node) | ✅ |
| RNF-RE-63 | Documentado en el repositorio, con el porqué de cada decisión | ✅ |
| RNF-RE-64 | Errores del proveedor no pueden tumbar el módulo ni el servidor | ✅ |

---

## 4. Lo que yo haría primero

El orden no es por dificultad, es por cuánto cambia el día a día:

1. **RF-RE-11 y RF-RE-12** — agregar invitados después, y copiar el enlace. Son
   horas de trabajo y quitan la frustración de hoy.
2. **RF-RE-13 + RNF-RE-07** — el cliente entra por enlace. Es lo que convierte
   esto de herramienta interna en herramienta de atención.
3. **RF-RE-56 y RF-RE-58** — que la nota llegue a la ficha del cliente y que un
   acuerdo se convierta en tarea. Es lo que justifica que las reuniones vivan acá
   y no en Meet.
4. **RF-RE-25** — el recordatorio antes de la hora. Barato y evita reuniones
   perdidas.
5. **RF-RE-06 y RF-RE-07** — convocar desde la ficha y desde el ticket, que es
   donde uno se da cuenta de que hay que reunirse.
6. **RNF-RE-25** — decidir el proveedor definitivo antes de sentar a un cliente
   en una sala comunitaria.
