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

**Un solo nivel de anidación.** Dentro de una subtarea no se ofrece crear otra.
Sin ese tope se puede anidar sin fin y la pantalla deja de entenderse.

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

- **Tablero kanban** y **calendario** — se descartaron con los cronogramas
- **Notificaciones** cuando te asignan una tarea — no hay avisos de ningún tipo
- **Tareas que se repiten solas** (el F29 de cada mes, por ejemplo)
- **Adjuntos en los comentarios** — solo en la tarea
- **Más de un nivel de subtareas**
- **Registro de cambios por tarea** — quién cambió qué y cuándo. La bitácora
  guarda archivar y desarchivar, no cada edición

---

## 11. Dónde vive cada cosa

| | |
|---|---|
| Tablas | `tarea`, `proyecto`, `tarea_colaborador`, `tarea_comentario`, `tarea_adjunto` |
| Backend | `src/controllers/crm.controllers.js`, `src/routes/crm.routes.js` |
| Permisos | `src/utils/permisosTarea.js` |
| Frontend | `src/components/Tareas.jsx`, `src/components/crm/views/TareasPanel.jsx` |
