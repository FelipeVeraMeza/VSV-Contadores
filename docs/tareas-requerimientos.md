# Módulo de Tareas · Requerimientos

**Última revisión:** 1 de septiembre de 2026
**Estado:** en construcción por fases (ver el final del documento)

> **Lo último (26-ago-2026):** el caso «Tareas Victor» — 225 tareas importadas
> que su dueño no veía. De ahí salió el **tercer camino de visibilidad** (si ves
> la madre, ves sus subtareas), la herencia del responsable y el traspaso en
> cascada. Está en la **sección 13**, al final.
>
> **Antes (14-ago-2026):** nueve pedidos del equipo resueltos y una vista
> nueva de árbol, en la **sección 10**, junto con lo que
> quedó bloqueado esperando respuestas. Lo de acá arriba es la especificación
> original de julio y sigue valiendo.

Este documento recoge la especificación que definió el módulo, más las decisiones
de diseño que se tomaron al implementarla y las razones de cada una. Se escribe
acá porque la especificación original vivía solo en una conversación: si no queda
en el repositorio, la próxima persona que toque el módulo no tiene con qué
contrastar lo que encuentra en el código.

La referencia declarada es **Asana**, adaptada a un ERP/CRM. Quedan
explícitamente **fuera del alcance** los cronogramas y las líneas de tiempo
(diagramas de Gantt): son donde se va la mayor parte del esfuerzo en este tipo de
herramientas y donde menos se usa.

---

## 1. Estructura del módulo

```
Tareas
├── Inicio
├── Proyectos
├── Tareas
├── Mis tareas
└── Equipo        (solo Administradores)
```

La *Papelera* figuraba como opcional en la especificación y **se descartó**:
archivar (RF-TA-17) cubre el mismo caso sin una segunda vida útil que mantener.

### 1.1 Inicio

Vista principal del módulo. Muestra:

- Resumen de tareas activas
- Tareas vencidas
- Tareas próximas a vencer
- Tareas finalizadas recientemente
- Accesos rápidos para crear proyectos o tareas

### 1.2 Proyectos

Administra los proyectos de la organización.

**Al crear un proyecto** se registra: nombre, descripción, responsable, color o
etiqueta, estado, fecha de inicio (opcional) y fecha estimada de término
(opcional).

**Cada proyecto muestra:** nombre, responsable, cantidad de tareas, completadas,
pendientes, porcentaje de avance e integrantes.

**Acciones:** crear tarea, editar proyecto, archivar proyecto, eliminar proyecto.

### 1.3 Tareas

Vista general. Permite crear, editar, eliminar, buscar, filtrar y ordenar.

**Cada tarea contiene:** nombre, descripción, proyecto, responsable,
colaboradores, prioridad, estado, fecha de creación, fecha límite, archivos
adjuntos, comentarios y subtareas.

**Acciones:** cambiar estado, cambiar responsable, adjuntar archivos, agregar
comentarios, crear subtareas, marcar como finalizada, archivar.

### 1.4 Mis tareas

Solo las tareas asignadas al usuario y aquellas donde participa como colaborador.
Filtros: activas, finalizadas, todas.

### 1.5 Equipo

**Solo Administradores.** Todas las tareas de la organización.
Filtros: usuario, proyecto, estado, prioridad.

Se protege con el mismo triple candado que el facturador: se esconde del menú, la
página rebota si se entra por URL, y el backend responde 403. Un candado solo en
la pantalla no es un candado.

---

## 2. Estados y prioridades

### Estados

| Estado | Significado |
|---|---|
| `pendiente` | Creada, sin empezar |
| `en_proceso` | Alguien la está haciendo |
| `en_revision` | Entregada, esperando el visto bueno |
| `completada` | Aprobada y cerrada |
| `cancelada` | Se decidió no hacerla |

**"Archivada" NO es un estado.** La especificación la listaba como el quinto
estado y se implementó distinto, a propósito: si archivar fuera un estado, al
archivar se perdería si la tarea estaba completada o cancelada — justo lo que uno
quiere saber al revisar el archivo. Son dos ejes independientes: *en qué va* la
tarea, y *si sigue a la vista*. Se materializa en la columna `tarea.archivada_at`
(NULL = a la vista). Al desarchivar, la tarea vuelve exactamente como estaba.

### Dónde se cambia el estado (27-08-2026)

**Finalizar una tarea exige abrirla.** En la lista, el árbol e Inicio el círculo
de la izquierda era un botón: un clic lo cerraba todo, sin confirmar y sin decir
nada. Estaba pegado al borde de una fila que además es clicable entera, así que
apuntar mal cerraba la tarea equivocada — pasó el 27-08-2026 con cuatro tareas.
La que se cierra sale del filtro «Activas» y desaparece de la pantalla, o sea que
el error tampoco se ve.

Ahora ese círculo es un **indicador de estado** y el clic abre la tarea. El
estado se cambia con los cuatro botones del panel de detalle.

Donde sí se cierra de un gesto —el detalle, arrastrar al tablero, el widget de
tareas del dashboard del CRM, que no tiene panel— el aviso trae **«Deshacer»**,
que devuelve la tarea al estado que tenía. Vive en
`src/components/tareas/deshacer.jsx`, una sola implementación para las cuatro
pantallas.

### Prioridades

`baja` · `media` · `alta` · `critica`

---

## 3. Subtareas

Cada tarea puede contener subtareas. Una subtarea **es** una tarea (misma tabla,
con `parent_id`), así que registra los mismos campos: nombre, responsable,
estado, prioridad, fecha límite, comentarios y archivos.

**Dos niveles de anidación.** El equipo pidió poder crear subtareas dentro de
subtareas («CREAR SUB TAREAS EN LAS SUBTAREAS»); antes el tope era uno. Dos
alcanza para desglosar un trabajo sin que la pantalla se vuelva un árbol
ilegible. El tercer nivel lo rechaza el servidor, y la pantalla directamente
deja de ofrecer el campo en el último nivel (`puedeTenerSubtareas`) en vez de
dejar intentarlo y fallar después.

**Heredan el proyecto de su tarea principal.** Sin eso quedaban «sin proyecto» y
no las veía nadie del equipo: había 16 huérfanas cuando se detectó.

**Qué se ve de cada subtarea en la lista.** Responsable, fecha de entrega,
prioridad, cuántas subtareas propias tiene, comentarios, archivos y un adelanto
de la descripción. Antes solo se veía el título, así que para saber de qué iba
cada una había que abrirlas de a una.

---

## 4. La regla de avance (RF-TA-15)

La especificación decía dos cosas que no cuadraban entre sí: que el avance del
proyecto se calcula "según el estado de sus tareas", y que las subtareas
"actualizan automáticamente el porcentaje de avance de la tarea principal". Sin
una sola regla, los porcentajes no coinciden entre pantallas y nadie sabe cuál
creer. Se fijaron tres decisiones:

**1. El proyecto cuenta solo tareas principales.** Si contara subtareas, una
tarea partida en diez pasos pesaría diez veces más que otra igual de grande que
nadie desglosó: el porcentaje diría más sobre el estilo de cada uno que sobre el
proyecto. Las subtareas muestran su propio porcentaje *dentro* de la tarea.

**2. `en_revision` cuenta como activa,** no como terminada. Está entregada, no
aprobada.

**3. Lo archivado y lo cancelado sale del cálculo entero** — ni en el numerador
ni en el denominador. Archivar una tarea no debería mover el porcentaje del
proyecto; si lo moviera, parecería un error del sistema.

En el código esto vive en `TAREAS_QUE_CUENTAN`, un solo fragmento SQL compartido
por numerador y denominador, para que no se puedan desincronizar.

```
avance = tareas principales completadas / tareas principales que cuentan
         (sin archivar, sin canceladas, sin subtareas)
```

---

## 5. Búsqueda y filtros

**Búsqueda por:** nombre, proyecto, responsable, estado, prioridad.

**Filtros por:** proyecto, estado, prioridad, responsable, fecha límite.

Todos los filtros los resuelve el **servidor**, no el navegador. Con pocas tareas
da lo mismo; con dos mil hay que esperar a que baje todo para ver tres
resultados. La lista viene paginada (60 por vez, «Ver más» trae el resto) y el
contador dice «X de Y», donde Y lo cuenta el servidor: así no miente cuando la
lista está cortada.

---

## 5ter. Cómo se ven las tareas · «VISUALIZACIÓN DE TAREAS»

Dos vistas sobre exactamente los mismos datos y los mismos filtros:

| Vista | Para qué | Cómo se opera |
|---|---|---|
| **Lista** | «¿qué tengo que hacer?» | Una fila por tarea, ordenada por urgencia |
| **Tablero** | «¿cómo va el trabajo?» | Una columna por estado; se arrastra la tarjeta para moverla |

El tablero **no vuelve a pedir las tareas**: dibuja las que ya trajo la lista. Si
pidiera las suyas, los contadores de una vista y otra dejarían de calzar.

Al entrar al tablero el filtro de estado pasa a «todas»: las columnas *son* los
estados, así que entrar filtrando por «Activas» dejaría la columna de finalizadas
vacía para siempre. Por lo mismo, en tablero el filtro de estado se reduce a
vivas / archivadas.

**Agrupar** (solo en lista): por proyecto, responsable o prioridad. Se agrupa
sobre lo que está en pantalla, no sobre el total — por eso el encabezado dice
cuántas hay *ahí*, no cuántas existen.

La vista elegida se recuerda entre visitas: cada persona tiende a quedarse con
una.

---

## 5quater. Plantillas de tareas

El trabajo de la oficina se repite —dar de alta un cliente, cerrar un F29, armar
la carpeta de renta— y esos pasos se volvían a escribir a mano cada vez, con el
riesgo de que se olvidara alguno.

Una plantilla guarda la estructura una vez —la tarea y todos sus pasos— y la
vuelca en un clic, creando la tarea **y sus subtareas** de una sola vez.

**Guarda un plazo en días, no una fecha.** Una fecha fija envejece: la plantilla
«cierre de F29» con fecha 20-08-2026 sirve un mes y después miente. `dias_plazo`
sirve siempre y la fecha se calcula el día que se usa (a las 18:00, fin de
jornada, no la hora exacta en que se apretó el botón).

**Quien la usa manda sobre la plantilla.** Título, responsable, fecha, prioridad
y proyecto se pueden cambiar antes de crear. Si no fuera así habría que crear la
tarea y después corregirla a mano, que es el trabajo que la plantilla venía a
evitar.

**Dos caminos para crearlas:** desde cero, o «guardar como plantilla» sobre una
tarea que ya existe —con sus subtareas—. El segundo es el natural: la primera vez
se arma la tarea a mano y recién ahí se ve que va a repetirse.

`veces_usada` lleva la cuenta. Una plantilla que nadie usó en seis meses es ruido
en la lista y conviene poder verlo.

Borrar una plantilla **no toca** las tareas ya creadas con ella: una vez creadas
son tareas normales.

---

## 5bis. Integrantes del proyecto · el modelo, desde el 5 de agosto

El negocio cambió el modelo de visibilidad. Lo pidió textual la tarea «SISTEMA DE
TAREAS» del proyecto SOFTWARE SIMPLE PYME:

> «Quien crea la tarea puede definir quién la ve. Al crear un proyecto se debe
> añadir a los usuarios que uno desee, y todos los usuarios del proyecto pueden
> ver todas las tareas, a no ser que quien cree la tarea lo configure de otra
> forma.»

**Antes:** espacio compartido. Cualquier administrador de la organización veía
todos los proyectos y todas las tareas, y los «integrantes» se deducían de quién
aparecía en las tareas.

**Ahora:** pertenencia explícita.

| | |
|---|---|
| `proyecto_integrante` | Quién pertenece, agregado a mano. **Sin fila, no se ve el proyecto — ni siendo Administrador** |
| Rol `responsable` | Puede agregar y quitar personas |
| Rol `integrante` | Ve y trabaja, no reparte accesos |
| `tarea.visibilidad` | `proyecto` (por defecto) o `privada` |

**Una tarea se ve por exactamente tres caminos:** estar metido en ella
—responsable, creador o colaborador, que manda siempre—, ser integrante de su
proyecto y que la tarea no sea privada, o **ver su tarea madre** (desde el
26-ago-2026, ver §13). Una subtarea es un pedazo de la tarea de arriba: quien ve
la madre ve de qué se compone, salvo que la subtarea esté marcada como privada.

**Por qué los integrantes dejaron de deducirse.** Mientras la lista era
informativa, deducirla era cómodo. Desde que decide quién ve qué es un permiso, y
un permiso no puede salir de un efecto secundario: asignarle una tarea a alguien
le daría acceso al proyecto entero sin que nadie lo decidiera.

**Resguardos:**

- Quien crea el proyecto queda dentro como responsable. Si no, crearía un
  proyecto que no puede ver.
- No se puede invitar a alguien de otra organización.
- No se puede quitar al único responsable: el proyecto quedaría huérfano y sin
  forma de arreglarlo desde la pantalla.
- La migración dio de alta a todos los que ya participaban, para que nadie
  perdiera acceso a lo que estaba usando.

**Subtareas: dos niveles.** El equipo pidió poder crear subtareas dentro de
subtareas; antes el tope era uno. Dos alcanza para desglosar sin que la pantalla
se vuelva un árbol ilegible, y el tercero lo rechaza el servidor con un mensaje
claro. Además **toda subtarea hereda el proyecto de su tarea principal**: antes
quedaban «sin proyecto» y con el modelo nuevo no las habría visto nadie. Desde el
26-ago hereda también el **responsable** cuando no se le pasa uno propio (§13):
caía en «quien la crea», que al importar es siempre el administrador.

---

## 6. Permisos

| | Usuario | Administrador |
|---|---|---|
| Crear tareas | ✅ | ✅ |
| Editar las tareas asignadas | ✅ | ✅ |
| Comentar y adjuntar archivos | ✅ | ✅ |
| Crear y administrar proyectos | — | ✅ |
| Ver todas las tareas de la organización | — | ✅ |
| Reasignar responsables | — | ✅ |
| Archivar y eliminar tareas | — | ✅ |

La implementación deduce los permisos de campos que ya existen
(`responsable_id`, `creado_por`, `tarea_colaborador`) en vez de una matriz
configurable por tarea. Ver `src/utils/permisosTarea.js`.

⚠️ **Los permisos arrancan en modo permisivo:** registran en la bitácora lo que
habrían bloqueado y dejan pasar. Se activan de verdad con
`PERMISOS_TAREA_ESTRICTO=true`, después de revisar unos días que no corten nada
legítimo.

---

## 7. Requerimientos funcionales

| ID | Requerimiento | Estado |
|---|---|---|
| RF-TA-01 | Crear proyectos | ✅ |
| RF-TA-02 | Editar proyectos | ✅ |
| RF-TA-03 | Archivar proyectos | ✅ |
| RF-TA-04 | Crear tareas asociadas a un proyecto | ✅ |
| RF-TA-05 | Asignar responsable y colaboradores | ✅ |
| RF-TA-06 | Definir prioridad de la tarea | ✅ |
| RF-TA-07 | Definir estado de la tarea | ✅ |
| RF-TA-08 | Crear subtareas | ✅ |
| RF-TA-09 | Adjuntar archivos a tareas y subtareas | ✅ |
| RF-TA-10 | Registrar comentarios por tarea | ✅ |
| RF-TA-11 | Buscar tareas por distintos criterios | ✅ |
| RF-TA-12 | Filtrar por proyecto, estado, prioridad y responsable | ✅ |
| RF-TA-13 | Visualizar "Mis tareas" | ✅ |
| RF-TA-14 | Visualizar tareas del equipo (Administradores) | ✅ |
| RF-TA-15 | Calcular el avance de un proyecto según el estado de sus tareas | ✅ |
| RF-TA-16 | Registrar fecha de creación y última modificación | ✅ |
| RF-TA-17 | Archivar tareas y proyectos sin eliminar la información | ✅ |

---

## 8. Requerimientos no funcionales

Estos no estaban en la especificación original. Se agregan porque son las cosas
que rompen el módulo cuando ya está en uso, no cuando se está construyendo.

> **RNF-TA-01 · Aislamiento por organización.**
> Todas las consultas de tareas, proyectos, comentarios y archivos —incluido el
> selector de responsables— deberán filtrar por `organizacion_id`.
>
> Ya está implementado, pero queda escrito porque si no es un requerimiento, la
> próxima consulta que alguien agregue se olvida del filtro. Con Victor en su
> propia organización, eso ahora se nota de inmediato.

> **RNF-TA-02 · Búsqueda y paginación en el servidor.** ✅
> La búsqueda y los filtros se resuelven en la base de datos, no en el navegador.
>
> La lista pide 60 tareas por vez y el resto llega con "Ver más"; el servidor
> recorta a 500 aunque se le pida más. El total lo cuenta la base, así que el
> contador no miente cuando la lista está paginada. La búsqueda escapa los
> comodines de LIKE: un `%` escrito por el usuario se busca como texto.

> **RNF-TA-03 · Tamaño de los archivos adjuntos.** ✅
> Hay **dos** topes: **7 MB por archivo** y **25 MB sumando todos los de una
> tarea**. Un tope por archivo solo no impide subir cien archivos.
>
> Los adjuntos se guardan **dentro de la base de datos**
> (`tarea_adjunto.contenido`), así que cada respaldo se los lleva. Los límites
> viven en un solo lugar del servidor y viajan a la pantalla, que muestra cuánto
> lleva ocupado y avisa en ámbar sobre el 80%.
>
> ⚠️ Subir `MAX_ADJUNTO` obliga a subir también el límite de `express.json` en
> `server.js`: el archivo viaja en base64 y crece un tercio por el camino. Hoy
> 7 MB de archivo ≈ 9,4 MB de JSON contra un tope de 10 MB.
>
> Mover los archivos a almacenamiento aparte sigue siendo la solución buena, y
> queda pendiente para cuando duela.

> **RNF-TA-04 · Fecha de modificación confiable.**
> `updated_at` deberá mantenerse por *trigger* en la base, nunca por la
> aplicación.
>
> Una columna que depende de que el código se acuerde de escribirla es peor que
> no tenerla, porque igual se toman decisiones mirándola. Se aprendió con
> `cobro_mensual` el 30 de julio, cuando no se pudo rastrear por qué faltó un
> cliente en un envío.

---

## 9. Decisiones que se apartan de la especificación

| Qué pedía | Qué se hizo | Por qué |
|---|---|---|
| "Archivada" como estado | Columna `archivada_at` aparte | Archivar no debe borrar el estado que tenía |
| Papelera opcional | Descartada | Archivar cubre el caso sin una segunda vida útil |
| Integrantes del proyecto | Derivados de quienes participan en sus tareas | Un dato menos que mantener a mano y que siempre está al día |
| Comentarios con adjuntos (opcional) | Descartado | Los archivos ya se adjuntan a la tarea; en dos lugares nadie los encuentra |
| Subtareas suman al avance del proyecto | Solo cuentan tareas principales | Ver la sección 4 |

---

## 10. Fases de construcción

**Las siete fases están cerradas.** Cada una se verificó llamando a los
controladores reales contra la base de datos, no con datos simulados; los datos
de prueba se borran al terminar y las tablas quedan como estaban.

| Fase | Qué | Estado | Pruebas |
|---|---|---|---|
| 1 | Modelo: estados, prioridades, campos de proyecto, `updated_at` | ✅ 31-07 | 10/10 |
| 2 | Las cinco secciones del módulo | ✅ 03-08 | 7/7 |
| 3 | Pantalla Proyectos | ✅ 03-08 | 10/10 |
| 4 | Pantalla Inicio | ✅ 03-08 | 13/13 |
| 5 | Archivar tareas y proyectos | ✅ 04-08 | 11/11 |
| 6 | Buscar y filtrar en el servidor | ✅ 04-08 | 13/13 |
| 7 | Límite de tamaño de los adjuntos | ✅ 04-08 | 10/10 |

**Migración:** `src/DatabaseThings/migrations/2026-07-31_tareas_fase1_modelo.sql`

### Defectos que encontraron las pruebas

Vale la pena dejarlos escritos: son los que se habrían visto en producción.

| Dónde | Qué pasaba |
|---|---|
| Inicio, modo Equipo | La pantalla reventaba entera. Se mandaba un parámetro que no aparecía en la consulta y Postgres no podía deducir su tipo |
| Contadores de Inicio | Una tarea que vencía **hoy** se contaba a la vez como atrasada y como de hoy. El mismo trabajo sumado dos veces, y sensación de ir atrasado desde temprano. Ahora el corte es por día |
| Lista de tareas | `proyectoId` y `soloRaiz` se descartaban en el servicio del frontend: filtrar por proyecto no hacía nada y las subtareas aparecían sueltas |
| Ámbitos | Ni "mías" ni "todas" miraban `tarea_colaborador`: a quien lo sumaban como colaborador no le aparecía la tarea, contra lo que pide RF-TA-13 |

---

## 12. Lo que este módulo NO hace

Escrito a propósito, para que nadie lo busque:

- **Calendario** — se descartó junto con los cronogramas
- **Tareas que se repiten solas** (el F29 de cada mes, por ejemplo). Las
  plantillas se le acercan, pero hay que dispararlas a mano
- **Adjuntos en los comentarios** — solo en la tarea
- **Tres o más niveles de subtareas** — el tope es dos
- **Avisos por correo o WhatsApp** — las notificaciones son solo dentro del
  sistema, y se consultan cada 60 segundos (no es tiempo real)
- **Registro de cambios por tarea** — quién cambió qué y cuándo. La bitácora
  guarda archivar, desarchivar y lo de plantillas, no cada edición
- **Reordenar tarjetas dentro de una columna** del tablero — se arrastra entre
  columnas para cambiar el estado, pero el orden dentro de cada una lo decide la
  urgencia, no la mano

Ya **no** están en esta lista, porque se hicieron el 5 de agosto: el tablero
kanban, las notificaciones dentro del sistema y el segundo nivel de subtareas.

---

## 11. Dónde vive cada cosa

| | |
|---|---|
| Tablas | `tarea`, `proyecto`, `proyecto_integrante`, `tarea_colaborador`, `tarea_comentario`, `tarea_adjunto`, `notificacion`, `tarea_plantilla`, `tarea_plantilla_item` |
| Backend | `src/controllers/crm.controllers.js`, `src/controllers/plantillas.controllers.js`, `src/routes/crm.routes.js` |
| Permisos | `src/utils/permisosTarea.js` |
| Notificaciones | `src/utils/notificaciones.js`, `src/components/ui/CampanaNotificaciones.jsx` |
| Frontend | `src/components/Tareas.jsx`, `src/components/crm/views/TareasPanel.jsx` |
| | `src/components/tareas/InicioPanel.jsx`, `ProyectosPanel.jsx`, `TableroTareas.jsx`, `PlantillasTarea.jsx` |

**Migraciones que armaron el módulo** (en `src/DatabaseThings/migrations/`):
`2026-07-31_tareas_fase1_modelo.sql`, `2026-08-05_proyecto_nombre_unico.sql`,
`2026-08-05_proyecto_integrantes.sql`, `2026-08-05_subtarea_hereda_proyecto.sql`,
`2026-08-05_notificaciones.sql`, `2026-08-05_plantillas_tarea.sql`.

---

## 10. Trabajo del 14-ago-2026

Nueve pedidos que el equipo había dejado como tareas dentro del propio módulo
(la rama **SISTEMA DE TAREAS** del proyecto SOFTWARE SIMPLE PYME), más una vista
nueva que salió de mirar los datos reales.

> ⚠️ **Lección del día, y vale para todo el proyecto:** varias de estas tareas
> figuraban como resueltas en un comentario de cierre, y no lo estaban. La más
> clara: NOTIFICACIONES DE TAREAS decía *"El aviso lleva a la tarea"* desde el
> 05-ago, pero el código llevaba a la lista completa. **Un comentario que dice
> "cerrado" no es prueba de nada.** Y al revés: los pedidos concretos estaban en
> los COMENTARIOS de cada tarea, no en su descripción — leer solo la descripción
> hace perder la mitad del alcance.

### 10.1 Vista de ÁRBOL · `src/components/tareas/ArbolTareas.jsx`

Tercer botón junto a Lista y Tablero.

**El problema medido:** de 59 tareas, la lista mostraba **10**. La consulta pide
`soloRaiz=1`, así que las 49 subtareas solo existían dentro del panel de detalle,
de a una. El árbol real tiene tres niveles (10 raíces → 36 → 13).

**Qué hace:** dibuja la jerarquía completa, agrupada por proyecto, con estado,
prioridad, responsable y vencimiento a la derecha de cada fila. Nace desplegado.

**Decisiones:**

- **No toca el backend.** La API ya devolvía `parentId`; `soloRaiz` era opcional.
- Pide **300 por página** en vez de 60 (`POR_PAGINA_ARBOL`): un árbol al que le
  falta media rama se dibuja mal, porque un hijo cuyo padre quedó en la página
  siguiente aparecería suelto arriba como si fuera raíz.
- Fuerza el filtro a **"Todas"**. Con "Activas" un padre ya cerrado no viene y
  sus hijas abiertas se dibujan sueltas. Ojo: esto hay que forzarlo **también al
  inicializar el estado**, no solo al cambiar de vista — la vista se restaura
  desde `localStorage` sin pasar por `cambiarVista`. El síntoma en el log del
  servidor era `/api/crm/tareas?limite=300&estado=activas`.
- Una hija cuyo padre no está en la lista se dibuja **como raíz** en vez de
  desaparecer, para que el total siempre cuadre.

### 10.2 Los ocho arreglos

| Pedido | Qué se encontró |
|---|---|
| **La notificación abre su tarea** | Llevaba a `/tareas?sub=todas`. Ahora `?tarea=<id>` abre ese detalle al llegar; sirve para subtareas porque el panel pide sus datos por id. |
| **Inicio: tareas clickeables** | Inicio era de solo lectura. Las filas abren la tarea por el mismo camino que la campana. |
| **Inicio: finalizar desde ahí** | Círculo en cada fila; los seis contadores se recalculan al cerrar una. |
| **Subtareas finalizadas visibles** | Era peor de lo que parecía: al cerrar una subtarea desaparecía de todos lados. **El filtro "Finalizadas" mostraba 3 y ahora muestra 20** — había 17 invisibles. Cada una muestra su tarea madre, pulsable. |
| **Ctrl+V adjunta una imagen** | Se renombra con fecha y hora: el portapapeles entrega todo como `image.png`. |
| **Imágenes dentro del texto** | Ver 10.3. |
| **Editar plantillas** | **Ya existía.** El lápiz estaba con `opacity-0` y solo aparecía al pasar el mouse. Ahora siempre visible; eliminar sigue oculto porque no tiene vuelta atrás. |
| **El nombre de la tarea ≠ el de la plantilla** | Causa: `titulo: p.titulo \|\| p.nombre` en el controlador **y un campo que nunca existió en el formulario**. Dar de alta tres clientes dejaba tres tareas llamadas igual. |
| **Pasos arrastrables** | Arrastre del navegador, sin librería (mismo criterio que el tablero). Con flechas subir/bajar además, porque en táctil arrastrar no funciona. |

### 10.3 Imágenes dentro del comentario y la descripción

Pegando con el cursor en el comentario o la descripción, la imagen se sube como
adjunto y en el texto queda una marca `[img:<id>]` en el punto exacto del cursor.
Al dibujar el texto, la marca se reemplaza por la imagen. Pegando fuera de esos
campos se adjunta como antes.

**Por qué marcas y no un editor de texto enriquecido:** los comentarios ya son
texto plano en `tarea_comentario.texto`. Guardar HTML obligaría a migrar lo ya
escrito y a sanear el HTML que llegue — un problema mayor que el que resuelve.

Además, **vista previa en pop-up** de los adjuntos que no son imagen: los PDF se
abren dentro del sistema en vez de bajarlos al computador; Word y Excel avisan
que el navegador no puede mostrarlos y ofrecen descargar.

> 🐛 **Trampa que costó encontrar y que conviene recordar:** la expresión que
> detecta las marcas lleva bandera `g`, y `.test()` sobre una regex global
> **avanza su `lastIndex`**. Preguntar dos veces por el mismo texto devuelve
> `true, false, true, false`, así que las imágenes de la descripción se habrían
> visto un render sí y otro no. Para preguntar "¿tiene imágenes?" hay una regex
> aparte, sin `g` (`tieneImagenes`).

### 10.4 Lo que quedó bloqueado

Cada una tiene las preguntas escritas en sus comentarios, en formato P1/P2/P3, y
está asignada a **Mati** con aviso en la campana.

| Tarea | Qué falta |
|---|---|
| **Plantillas predeterminadas de los productos** | La lista de productos, sus pasos, los días de cada paso y el responsable. Es conocimiento de la oficina: una plantilla con pasos inventados es peor que no tenerla. |
| **Plantillas asignables a empresa / cliente / prospecto** | Decisión de alcance. La base ya aguanta (`tarea.persona_id` y `empresa_id` existen y `crearTarea` los acepta), pero `usarPlantilla` no los recibe y `/personas/catalogos` no devuelve empresas ni personas. |

### 10.5 Lo que se puede hacer sin preguntarle a nadie

Pendiente al cierre del 14-ago, **los tres cerrados el 04-09-2026** (ver §15):

1. ~~**Bug:** una subtarea finalizada que se vuelve a marcar como activa no se
   puede abrir.~~ ✅
2. ~~**Pop-up de tarea asignada con su urgencia.** La campana y el sonido están; el
   pop-up del pedido original nunca se hizo.~~ ✅
3. ~~**Vista "Tareas de hoy"** en Inicio. Hay contador de "vencen hoy" pero no
   lista. Estaba pedido en un comentario y se cerró sin hacerlo.~~ ✅

### 10.6 Estado de los datos al 14-ago-2026

59 tareas, ninguna archivada. **37 de las 39 abiertas no tienen fecha de
vencimiento**, así que nada puede aparecer atrasado y los contadores de Inicio
—que son lo primero que se ve— quedan casi siempre en cero. Es el dato más flojo
del módulo hoy, y ninguna funcionalidad lo arregla: hay que cargar las fechas.

---

## 13. Trabajo del 26-ago-2026 · el caso «Tareas Victor»

**El síntoma:** se importaron 225 tareas para Victor colgando de una madre
llamada «Tareas Victor», y **él no veía ninguna**. Veía la madre —figuraba como
su responsable— con el contador diciendo 225 y el árbol mostrando una rama pelada.

**Lo que había pasado, en orden:**

1. La importación corrió con **«Responsable de todas» en *Sin asignar***. El
   servidor rellena ese hueco con quien está creando, así que las 225 hijas
   quedaron a nombre del **administrador que importó**.
2. La madre se creó igual, y **después** se le puso Victor a mano. Cambiar el
   responsable de una tarea **no bajaba a sus subtareas**, así que la madre decía
   una cosa y las 225 hijas otra.
3. La madre no tenía proyecto, así que las hijas tampoco (no hay nada que
   heredar). Sin proyecto no hay integrantes, y sin ser responsable, creador ni
   colaborador **no quedaba ningún camino** para que Victor las viera.

Medido contra la base antes de tocar nada: de 387 tareas vivas, Victor veía
**156**; ninguna de las 225.

**Los tres arreglos, uno por cada eslabón:**

| Dónde | Qué cambia |
|---|---|
| `crm.controllers.js` · `puedeVerTarea` | Tercer camino de visibilidad: **si ves la madre, ves sus subtareas**. Dos saltos hacia arriba (madre y abuela), que es el tope del modelo. Lo `privado` sigue mandando: una subtarea marcada así no se ve por este camino. |
| `crm.controllers.js` · `crearTarea` | La subtarea **hereda el responsable de su madre** si no le pasan uno. Antes caía en «quien la crea». |
| `crm.controllers.js` · `actualizarTarea` + `TareasPanel.jsx` | Cambiar el responsable de una tarea con subtareas **pregunta si traspasarlas también** (`cascadaResponsable`). No se hace solo: hay madres con cada hija en manos distintas a propósito. |

Y en el importador, un aviso antes de que pase: dejando «Sin asignar», dice
cuántas tareas van a quedar a nombre de quien importa y que solo él las verá.

**Datos:** las 225 subtareas se reasignaron a Victor. `creado_por` se dejó como
estaba —el administrador que las cargó las sigue viendo—, así que hoy las ven
esos dos y nadie más. Victor pasó de ver 156 tareas a **381**.

**Por qué el tercer camino y no solo arreglar los datos.** La migración del
05-ago ya había visto la mitad del problema y la tapó heredando el proyecto. Pero
cuando la madre **no tiene proyecto** no hay nada que heredar y el agujero
vuelve. Heredar la visibilidad lo cierra por el lado correcto: no importa cómo
esté armada la madre.

> ⚠️ **Lo que este arreglo NO cambia:** las subtareas siguen sin aparecer sueltas
> en la lista diaria (`soloRaiz`). Se ven dentro de su madre, en la vista Árbol,
> en «Finalizadas» o con el interruptor «Con subtareas». Es a propósito —200
> tareas importadas dejarían la lista inservible— pero es la primera pregunta que
> hace quien importa un lote y no lo encuentra.

---

## 14. Trabajo del 01-sep-2026 · auditoría del módulo y cierre de SISTEMA DE TAREAS

Día largo. Se auditó el módulo completo —backend, datos y frontend—, se cerró la
tarea madre `SISTEMA DE TAREAS` con sus 22 subtareas, y aparecieron bugs que
llevaban tiempo sin verse.

### 14.1 El bug que rompió la creación de tareas en producción

**Nadie podía crear ninguna tarea, en ningún proyecto.** Lo reportó Matías desde
la oficina: cartel rojo «No se pudo crear la tarea» al intentar abrir un ticket.

La causa la introduje yo esa misma mañana, arreglando otra cosa. Al agregar
`completed_at` a la creación escribí:

```sql
VALUES (..., $8, ..., CASE WHEN $8 = 'completada' THEN NOW() ELSE NULL END)
```

El parámetro `$8` queda usado dos veces: como valor de la columna `estado`
(varchar) y dentro del `CASE` comparado con un literal. **Postgres deduce el tipo
de cada parámetro por cómo se usa, sacó dos distintos y rechazó la consulta
entera** con «inconsistent types deduced for parameter $8».

Corregido fijando el tipo en **ambas** apariciones (`$8::text`). Castear solo la
del `CASE` no alcanza — probado.

> **Lo importante no es el bug, es que pasó `node --check` y `vite build` sin una
> queja.** Un error de tipos de Postgres vive dentro del string SQL y no se ve
> hasta ejecutar la consulta.

De ahí salió el método que quedó en la memoria del proyecto: **preparar todas las
consultas del backend contra Postgres con `PREPARE`** antes de dar por bueno un
cambio de SQL. `PREPARE` valida sintaxis, nombres de tabla y columna, y deducción
de tipos, sin ejecutar ni tocar datos.

Corriéndolo sobre las **359 consultas estáticas** del backend aparecieron dos
bugs más que nadie había visto:

| Dónde | Qué pasaba |
|---|---|
| `completarAccion` (`personas.controllers.js`) | El mismo error de tipos: **marcar como hecha una acción de seguimiento de un prospecto fallaba siempre** con un 500. Anterior a esa sesión, nunca reportado |
| `uploadAccountingExcel` | `INSERT INTO clientes` sobre una tabla **que no existe**. El comentario original decía «Asumiendo tabla clientes, ajusta el nombre» y ese ajuste nunca se hizo. Además guardaba la clave del SII **en texto plano** |

El segundo no se reescribió: ninguna pantalla llama a ese endpoint y las 164
claves cargadas entraron por otra vía. Se dejó fallando con un mensaje que
explica qué pasa, en vez de silenciarlo — silenciarlo haría creer que las claves
se guardaron.

### 14.2 Seis bugs del módulo de Tickets

| # | Bug | Gravedad |
|---|---|---|
| 1 | **Cualquiera podía borrar la tarea de cualquiera** — solo se comprobaba la organización. Incluso las privadas que no puede ver, arrastrando subtareas, comentarios y adjuntos | Alta |
| 2 | **Borrar un prospecto borraba sus tickets** — `ON DELETE CASCADE` en `persona_id` | Alta |
| 3 | **110 tareas completadas sin fecha de cierre** — no aparecían en Inicio ni en «tareas del mes» | Media |
| 4 | **Tareas canceladas invisibles** — no salían ni en «Activas» ni en «Finalizadas» | Media |
| 5 | 2 madres cerradas con hijas abiertas | Baja |
| 6 | El contador de subtareas incluía las archivadas | Baja |

Los números 2, 4 y 6 estaban **latentes**: no mordían ese día, pero el 2 iba a
activarse pronto porque se acababa de agregar el campo «Cliente» al crear
tickets. Migración `2026-09-01_tarea_persona_set_null.sql`, aplicada.

### 14.3 Robustez del backend · lo que aparecía al forzarlo

Probando entradas límite contra los endpoints reales:

- **Una URL mal escrita tumbaba la pantalla con error 500.** `GET /tareas/no-es-uuid`
  devolvía error de servidor en vez de «no existe». Peor: `?responsableId=algo`
  o `?proyectoId=algo` reventaban **la lista completa** por un parámetro mal
  formado. Un filtro sin sentido no debe caerse: ahora simplemente no filtra.
- **Cuatro formas de crear una tarea daban 500 sin explicar nada** — todas con el
  mismo cartel rojo. Ahora cada una responde con su motivo:

| Antes | Ahora |
|---|---|
| Título de más de 200 caracteres | *«El título no puede pasar de 200 caracteres (tiene 247).»* |
| Fecha inválida | *«La fecha de entrega no es una fecha válida.»* |
| Proyecto borrado | *«El proyecto indicado ya no existe.»* |
| Cliente borrado | *«El cliente indicado ya no existe.»* |

**77 comprobaciones, 0 fallos** al terminar.

### 14.4 Las dos últimas subtareas de SISTEMA DE TAREAS

**TICKETS ASIGNADOS A CLIENTES.** Estaba dada por construida y **el vínculo desde
WhatsApp se perdía siempre**: el panel mandaba `detalle.personaId` al crear el
ticket, pero esa propiedad **nunca venía en la respuesta del servidor**. Parecía
hecho y no lo estaba.

Ahora el servidor cruza el teléfono del chat con la agenda del CRM. Se comparan
los **últimos 8 dígitos** y no el número completo: ambos lados guardan
`56XXXXXXXXX`, pero basta que alguien escriba uno con `+56`, con espacios o sin
código de país para que la comparación exacta falle. Probado con seis formas del
mismo número; las seis identifican a la persona y un número ajeno no la confunde.

También apareció que **el cliente de un ticket no se podía cambiar ni quitar**:
`actualizarTarea` nunca tocaba `persona_id` ni `empresa_id`. Si te equivocabas al
abrir el ticket, no había forma de corregirlo desde ninguna pantalla.

**CREAR PLANTILLAS DE TAREAS.** Se cerraron sus tres subtareas abiertas:

- *Las plantillas pueden asignarse a un cliente* — el endpoint que usa una
  plantilla no recibía cliente ni empresa, así que el dato se perdía. Ahora los
  acepta y, lo importante, **las subtareas también los heredan**: los 18 pasos de
  «Formaliza tu pyme» son del mismo cliente; sin heredarlo quedaba ligada la
  madre y las 18 sueltas.
- *Visualizar las plantillas de mejor forma* — la lista solo decía «18 pasos»;
  para ver cuáles había que entrar a editar. Y dentro del editor los pasos eran
  **texto fijo**: para arreglar una falta de ortografía en el paso 12 había que
  borrarlo y reescribirlo, reapareciendo al final.
- *Editar plantillas* — ya funcionaba, solo esperaba despliegue.

### 14.5 Estado de los permisos

Sigue en **modo permisivo**: un usuario puede editar y comentar tareas ajenas, y
el sistema lo anota en la bitácora pero lo deja pasar. Está puesto a propósito y
documentado en el código.

**Dato para decidir:** los bloqueos registrados en la bitácora (15 al cierre) son **todos de
las pruebas de ese día**. En semanas de uso real, el modo estricto no habría
estorbado a nadie. Se activa con `PERMISOS_TAREA_ESTRICTO=true`.

### 14.6 Estado final

`SISTEMA DE TAREAS` cerrada, **22 de 22 subtareas**. Integridad verificada: cero
referencias rotas, cero completadas sin fecha, cero madres cerradas con hijas
abiertas, cero valores fuera de catálogo.

Pendientes anotados en las tareas, ninguno bloqueante:

- Falta **contenido** de plantillas: hay una sola para toda la operación.
- Ejecutor y fecha de entrega **por paso** de plantilla — es cambio de modelo.
- Crear ticket desde un **correo**: ese botón no existe.

---

## 15. Trabajo del 04-09-2026 · los tres pendientes de §10.5

Los tres puntos que quedaron anotados el 14-ago como «se pueden hacer sin
preguntarle a nadie» y que llevaban tres semanas sin hacerse.

### 15.1 La lista «Vencen hoy» en Inicio

**Lo que pasaba.** La tarjeta «Vencen hoy» daba el número desde el primer día,
pero no había lista: las tareas de hoy se dibujaban dentro de «Próximas a
vencer», mezcladas con las de los otros seis días. Uno leía «3» y no tenía
dónde ver cuáles eran esas tres — que es justo lo que uno quiere saber a las
09:00.

**Lo que se hizo.** Un cuarto grupo, `hoy`, entre `vencida` y `proxima`. Se
agrega en las dos expresiones `CASE` de la consulta (la que etiqueta y la que
numera dentro de cada grupo), así que los cuatro grupos siguen siendo
excluyentes: ninguna tarea puede caer en dos y contarse dos veces. La pantalla
pasó de tres bloques a cuatro.

**Y un defecto que apareció de paso.** El filtro de la lista comparaba el
INSTANTE (`vence_at <= NOW() + INTERVAL '7 days'`) mientras el contador de
arriba cortaba por DÍA. Una tarea que vencía el séptimo día a las 18:00 la
contaba la tarjeta y no la mostraba la lista, si uno miraba la pantalla por la
mañana. Ahora los dos cortan por día.

### 15.2 Reabrir una subtarea

**Lo que pasaba.** Las subtareas no salen sueltas en la lista —las esconde
`soloRaiz`, porque se ven dentro de su madre—, así que la única lista que las
muestra por su cuenta es «Finalizadas». Al reabrir una, dejaba de calzar con
ese filtro y salía de ahí; en la lista normal tampoco aparecía. Quedaba viva
pero sin ningún lugar donde encontrarla, salvo saber que existe el interruptor
«Con subtareas» o entrar por el árbol.

**Lo que se hizo.** El interruptor ya estaba desde el 26-ago; lo que faltaba
era que alguien lo dijera. Ahora, al reabrir una subtarea, un aviso explica
dónde quedó y trae un botón «Mostrarla» que enciende ese interruptor. Vale para
los dos caminos: la casilla de la lista de subtareas y los botones de estado
del panel de detalle.

Se comprobó además que la tarea **nunca dejó de ser alcanzable por su id**
—`?tarea=<id>`, que es el camino de la campana y del enlace directo—, así que
el problema era de visibilidad, no de acceso.

### 15.3 El pop-up con la urgencia

**Lo que pasaba.** La campana y el sonido se hicieron; el pop-up no. Y la
campana no distingue: una tarea crítica y una de prioridad baja encienden el
mismo punto rojo de 16 píxeles en una esquina. La urgencia era la mitad del
pedido y era la mitad que faltaba.

**Por qué hacía falta tocar la base.** El aviso no sabía qué tan urgente era lo
que estaba avisando. Sin ese dato, el pop-up tendría que ir a buscar la tarea
para saber de qué color pintarse: un viaje más por cada aviso, y nada que
dibujar si la tarea se borró. Se guarda en el aviso la prioridad que la tarea
tenía **cuando se asignó**.

| | |
|---|---|
| Migración | `2026-09-04_notificacion_prioridad.sql` |
| Columna | `notificacion.prioridad`, opcional, con `CHECK` del catálogo |

**Cómo se comporta.** El pop-up sale solo con `tarea_asignada` —si saltara con
todo, en una semana nadie lo miraría— y dice la urgencia con color **y con
palabra**, porque el color solo obliga a saberse el código. Lo crítico no se
cierra solo; lo bajo se va a los diez segundos.

| Urgencia | Cuánto dura |
|---|---|
| Crítica | hasta que la cierres |
| Alta | 30 s |
| Media | 15 s |
| Baja | 10 s |

**Lo que NO hace:** no pide permisos del navegador ni manda notificaciones del
sistema operativo. Eso es otra cosa y hay que pedirle permiso al usuario; esto
funciona dentro de la pestaña, que es donde la persona ya está.

### 15.4 Pruebas

`qa/casos/tareas.test.mjs`, 15 pruebas. Cubren que los cuatro grupos de Inicio
sean excluyentes, que la lista de hoy cuadre con su contador, el ciclo completo
de reabrir una subtarea, y que la urgencia viaje con el aviso y la base rechace
una prioridad inventada.

Las consultas nuevas se validaron con `PREPARE` contra Postgres antes de darlas
por buenas: `node --check` no ve los errores que están dentro del SQL.

---

## 16. Trabajo del 04-09-2026 (tarde) · los ocho pedidos del equipo

Vinieron con captura desde la tarea «SISTEMA DE TAREAS» (22/30). Siete son
correcciones de lo que ya existía y uno es nuevo.

| # | Pedido | Qué se hizo |
|---|---|---|
| 1 | Quitar el método de selección y estandarizar | `SelectorPersonas`: un desplegable con buscador y casillas |
| 2 | No se pueden editar colaboradores | Ahora se editan en el detalle, con el mismo desplegable |
| 3 | Descripción adaptable | `CampoDescripcion`: crece con lo escrito, con tope y scroll |
| 4 | Imágenes en la descripción | Se dibujan dentro del texto, no en un bloque aparte |
| 5 | No se pueden crear subtareas desde «+ Tarea» | Se escriben en el formulario y se crean con la madre |
| 6 | Separar «mis tareas» de «donde colaboro» | Dos ámbitos nuevos y pestañas en la sección |
| 7 | El filtro «Activas» muestra subtareas finalizadas | La lista de subtareas del detalle respeta el filtro |
| 8 | Nueva sección «Mis últimos tickets creados» | Bloque propio en Inicio |

### 16.1 El desplegable, y por qué reemplaza a la parrilla (1 y 2)

Los colaboradores se elegían de una parrilla de botones —uno por usuario, todos
dibujados a la vez— donde lo elegido se distinguía de lo no elegido **solo por
el color de fondo**. Con cuatro personas se entiende; con veinte hay que leer
una por una para saber quién está dentro.

`SelectorPersonas` lo reemplaza: se abre, se busca escribiendo, se marca con una
casilla, y lo elegido se ve arriba como fichas con su «×». Un mismo componente
para los dos lados —crear y editar—, que es la parte de «estandarizar».

**Y editar era imposible.** En el detalle, los colaboradores eran texto plano:
se fijaban al crear la tarea y no había ninguna pantalla donde cambiarlos. El
servidor ya lo aceptaba (`setColaboradores` en `actualizarTarea`); faltaba
solamente el control.

### 16.2 La descripción (3 y 4)

Tenía alto fijo de dos o tres líneas. Un ticket de veinte líneas se leía por una
rendija, y agrandarlo pedía arrastrar una esquina — que, como dice el pedido, no
es intuitivo. Ahora crece sola hasta **320 px** y de ahí en adelante hace scroll
adentro, para no empujar los comentarios y los adjuntos fuera de la pantalla.

Las imágenes se guardan como marcas `[img:<id>]` dentro del texto. Se dibujaban
en un bloque **debajo** del campo, lejos del párrafo que las explica. Ahora el
campo tiene dos caras: mientras se escribe es un textarea —hay que poder editar
las marcas—; al soltarlo se dibuja el texto con sus imágenes en su lugar. Un
clic vuelve a editar.

### 16.3 Subtareas al crear (5)

El botón «+ Tarea» creaba la tarea y había que abrirla para desglosarla. Pero
uno sabe los pasos **justo cuando está escribiendo la tarea**, no después. Se
escriben en el formulario y se crean enseguida colgando de la recién nacida.

Si alguna falla, la madre igual quedó creada y el aviso dice cuántas se pudieron:
no se pierde el trabajo escrito.

### 16.4 «Mis tareas», en dos (6)

> «Separar tareas mías de tareas en las cuales tengo colaboración y no están
> asignadas directamente a mí.»

No es lo mismo lo que uno **debe hacer** que aquello de lo que uno **está al
tanto**. Mezcladas, la lista propia miente sobre cuánto trabajo hay encima.

Dos ámbitos nuevos en el servidor, `asignadas` y `colaboro`. La segunda excluye
a propósito aquello de lo que uno es responsable: sin esa exclusión, lo mío
aparecería en las dos listas y separarlas no habría servido de nada.

Medido al implementarlo: **290 asignadas + 5 donde colaboro = 295 «mías»**. Las
dos mitades suman exactamente el total, sin perder ni duplicar a nadie — y hay
una prueba que lo verifica en cada corrida.

Van como pestañas dentro de «Mis tareas», no como dos secciones nuevas del menú:
es la misma pregunta mirada de dos formas, y partir el menú por eso lo alarga
sin que nadie lo pida.

### 16.5 El filtro «Activas» y las subtareas finalizadas (7)

La lista de afuera **sí** respetaba el filtro; se comprobó contra la API (0
subtareas cerradas con `estado=activas`). El que no lo respetaba era **la lista
de subtareas dentro del detalle**, que mostraba todas siempre. Con el filtro en
«Activas» seguían viéndose las finalizadas, que es lo de la captura.

Ahora esa lista sigue el mismo criterio que la de afuera, con un interruptor
—«Ver N finalizadas»— para cuando se quieran revisar.

### 16.6 Mis últimos tickets creados (8)

Los cuatro bloques de Inicio responden «¿qué me toca?». Este responde la otra
pregunta, la de quien **reporta**: de lo que yo abrí, ¿en qué va y quién lo
tiene? Sin esto, quien crea un ticket y se lo asigna a otro lo pierde de vista
en el momento mismo de crearlo.

Muestra el estado y el responsable —no el vencimiento— y la fecha es la de
creación. **Incluye lo ya cerrado a propósito:** «lo que abrí ayer y ya está
listo» es justamente lo que uno quiere ver; filtrándolo, un ticket resuelto
desaparecería sin que quien lo abrió se entere de que se resolvió.

### 16.7 Pruebas

`qa/casos/tareas-ux.test.mjs`, 15 pruebas: los dos ámbitos y la regla de que sus
mitades sumen el total, el ciclo completo de editar colaboradores (agregar,
quitar, no duplicar), las subtareas creadas junto con la madre, y que «mis
últimos» traiga solo lo que uno creó, ordenado y sin archivadas.

El SQL nuevo se validó con `PREPARE` contra Postgres, y la maqueta de Inicio se
midió en el navegador: cuatro columnas alineadas arriba, la sección nueva a lo
ancho debajo, sin scroll horizontal.

### 16.8 Verificación uno por uno · 04-09-2026

Se revisó cada pedido contra el sistema real antes de darlo por cerrado.

| # | Pedido | Cómo se verificó | Estado |
|---|---|---|---|
| 1 | Quitar el método de selección | Cero usos de la parrilla en todo el repo. El modal de Integrantes ya usaba `<select>` | ✅ |
| 2 | Editar colaboradores | Ciclo completo por API: agregar, quitar, no duplicar | ✅ |
| 3 | Descripción adaptable | Medida en el navegador: 56 px → 204 px al escribir; tope 320 px; `overflow-y: auto` pasado el tope | ✅ |
| 4 | Imágenes en la descripción | Se dibujan dentro del texto (`CampoDescripcion`) | ✅ |
| 5 | Subtareas desde «+ Tarea» | Tres pasos creados junto con la madre y contados por ella | ✅ |
| 6 | Separar «mis tareas» | Las mitades suman el total en los 3 usuarios reales | ✅ |
| 7 | El filtro «Activas» | **223 subtareas cerradas** dejaron de mostrarse | ✅ |
| 8 | Mis últimos tickets creados | Solo lo propio, ordenado, sin archivadas | ✅ |

**Los componentes se probaron en un navegador de verdad**, montados con Vite y
manejados con Puppeteer — no leídos: se abrió el desplegable, se buscó, se marcó
y se quitó una persona, y se midió el alto del campo al escribir. Once
comprobaciones, todas en verde y sin errores de JavaScript.

Nota de lo medido en el punto 1: al abrir el desplegable el buscador aparece
solo con más de seis personas, el responsable queda excluido de la lista de
colaboradores, y cada clic guarda **una sola vez** (se comprobó que el contador
suba exactamente uno, no dos).

**Suite completa: 14 suites, 217 pruebas, todo en verde.** Sin regresiones en
seguridad, roles, API, CRM, comunicaciones, cobranza ni auditoría.

---

## 17. Quién está conectado · 04-09-2026

> «Añadir quién está conectado, pero solo de la organización: si hay clientes,
> yo no sé quién está conectado — solo de la organización en la que esté.»

Un indicador en el encabezado, al lado de la campana: cuántos del equipo están
en línea, y quiénes. Sirve para saber si a quien le vas a asignar algo está al
otro lado, o si le estás dejando un ticket que no verá hasta mañana.

### 17.1 El aislamiento es el requisito, no un detalle

El filtro sale de `organizacion_id` **de la sesión**, nunca de un parámetro: un
id que llega por la URL es un id que alguien puede cambiar. Esto expone hábitos
de trabajo —a qué hora entra cada quien, cuánto lleva conectado— y eso no cruza
la frontera entre despachos.

Se prueba creando un usuario real de OTRA organización con sesión viva y
comprobando que **no aparece**, incluso forzando `?organizacionId=`, `?org=` y
`?organizacion_id=` en la URL. Una fuga acá no se vería como un error: se vería
como una lista un poco más larga.

### 17.2 Hizo falta una columna nueva

Para decir «está conectado» hay que saber cuándo fue la última señal de vida, y
con lo que había **no se podía deducir**:

- `created_at` es cuándo entró. Alguien que entró hace 58 horas y cerró el
  navegador enseguida figuraría igual que quien está trabajando.
- `expires_at` tampoco: la renovación deslizante solo lo mueve cuando quedan
  menos de 12 h. Medido el 04-09-2026, había sesiones «renovadas hace 480
  minutos» de gente que podía haber estado activa hace un minuto.

Migración `2026-09-04_sessions_last_seen.sql`. El middleware la refresca **como
mucho una vez por minuto**: escribir en cada petición sería un UPDATE por cada
clic de cada persona, y para un semáforo de presencia un minuto de resolución
sobra.

### 17.3 Conectado es una ventana, no un interruptor

Nadie avisa al cerrar el navegador: se cierra la pestaña y ya.

| Última señal | Cómo se ve |
|---|---|
| menos de 5 min | **En línea** (punto verde) |
| 5 a 30 min | **Inactivo**, con cuánto hace (punto ámbar) |
| más de 30 min | no se muestra |

Prometer «está ahí» cuando la persona pudo irse a almorzar es peor que no decir
nada; de ahí los dos estados en vez de un binario.

**Una fila por persona, no por sesión.** Alguien con el sistema abierto en el
computador y en el teléfono tiene dos sesiones vivas y es una sola persona.

**Si no hay nadie más conectado, el indicador no se dibuja:** un «1» que siempre
eres tú es ruido permanente en el encabezado.

### 17.4 Pruebas

`qa/casos/conectados.test.mjs`, 13 pruebas: el aislamiento (incluido el intento
por parámetro), los tres tramos de la ventana, que una sesión vencida no cuente
aunque la señal sea reciente, que un usuario desactivado desaparezca, que dos
dispositivos sean una fila, y que la respuesta **no exponga** RUT, correo,
clave ni identificadores de sesión — presencia es nombre y estado, nada más.
