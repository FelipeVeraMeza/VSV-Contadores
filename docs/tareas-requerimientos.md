# Módulo de Tareas · Requerimientos

**Última revisión:** 31 de julio de 2026
**Estado:** en construcción por fases (ver el final del documento)

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

**Una tarea se ve por exactamente dos caminos:** estar metido en ella
—responsable, creador o colaborador, que manda siempre— o ser integrante de su
proyecto y que la tarea no sea privada.

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
quedaban «sin proyecto» y con el modelo nuevo no las habría visto nadie.

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
