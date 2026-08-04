# Calendario y planificación · Requerimientos

**Fecha:** 4 de agosto de 2026
**Estado:** propuesta, sin construir
**Origen:** «necesito un calendario para tener en cuenta qué se hace cada día, algo así como un Asana combinado con un Jira»

---

## 0. Antes de los requerimientos: qué significa "Asana + Jira"

Las dos herramientas resuelven problemas distintos, y mezclarlas sin criterio
lleva a construir mucho que después nadie usa. Conviene separarlas:

**Asana** organiza *trabajo con fecha*. Su aporte real es la vista calendario, la
carga por persona y poder mover una tarea de día arrastrándola.

**Jira** organiza *trabajo en ciclos*. Sprints, estimación en puntos, tablero por
columnas, backlog priorizado, velocidad y gráficos de avance. Está pensado para
equipos de desarrollo que planifican de a dos semanas.

**Una oficina contable no trabaja por sprints.** Trabaja contra **fechas legales
que no se negocian**: el F29 vence el 12, las cotizaciones el 10 o el 13, la
renta en abril. Nadie estima el F29 en puntos de historia ni discute si entra al
sprint: entra porque la ley lo dice.

Por eso la lectura de fondo de este documento es:

> Lo que hace falta no es Jira. Es un **calendario de obligaciones recurrentes**
> que se llene solo, más la vista de calendario de Asana. De Jira vale la pena
> rescatar dos cosas —el tablero por columnas y el historial de cambios— y
> descartar el resto.

Con 93 clientes activos, una sola obligación mensual son **93 tareas al mes** que
hoy alguien tiene que acordarse de crear. Ahí está el valor, no en los sprints.

---

## 1. Requerimientos funcionales

### 1.1 Vista de calendario

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-CAL-01 | Mostrar un calendario mensual con las tareas ubicadas en su fecha límite | Alta |
| RF-CAL-02 | Permitir vista semanal y vista de día | Media |
| RF-CAL-03 | Al pulsar un día, listar sus tareas con responsable, prioridad y estado | Alta |
| RF-CAL-04 | Distinguir visualmente atrasadas, de hoy y futuras | Alta |
| RF-CAL-05 | Reprogramar una tarea arrastrándola a otro día | Media |
| RF-CAL-06 | Crear una tarea pulsando un día vacío, con la fecha ya puesta | Alta |
| RF-CAL-07 | Filtrar el calendario por responsable, proyecto, prioridad y cliente | Alta |
| RF-CAL-08 | Alternar entre *mis tareas* y *las del equipo* sin salir de la vista | Alta |
| RF-CAL-09 | Marcar los días feriados de Chile | Baja |

### 1.2 Obligaciones recurrentes — el núcleo

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-REC-01 | Definir obligaciones periódicas (mensual, trimestral, anual) con su día de vencimiento | Alta |
| RF-REC-02 | Asociar una obligación a uno, varios o todos los clientes de la cartera | Alta |
| RF-REC-03 | Generar automáticamente las tareas del período sin intervención | Alta |
| RF-REC-04 | Asignar responsable por defecto, por obligación o por cliente | Alta |
| RF-REC-05 | Correr el vencimiento al día hábil siguiente si cae feriado o fin de semana | Alta |
| RF-REC-06 | No duplicar: si la tarea del período ya existe, no crear otra | Alta |
| RF-REC-07 | Dejar de generar cuando el cliente sale de la cartera | Alta |
| RF-REC-08 | Ver, por obligación y período, quién ya cumplió y quién no | Alta |
| RF-REC-09 | Plantillas iniciales cargadas: F29, F22, cotizaciones previsionales, libro de compraventas | Media |

> **Por qué RF-REC-05 no es un detalle.** Si el 12 cae domingo, el sistema no
> puede avisar el domingo. Un calendario tributario que ignora los feriados
> genera avisos que nadie puede cumplir, y a la segunda vez la gente deja de
> mirarlo.

### 1.3 Carga de trabajo

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-CAR-01 | Ver cuántas tareas tiene cada persona por día y por semana | Alta |
| RF-CAR-02 | Señalar los días en que alguien queda sobrecargado | Media |
| RF-CAR-03 | Reasignar una tarea desde la propia vista de carga | Media |
| RF-CAR-04 | Estimación de duración por tarea, en horas | Baja |

### 1.4 Tablero por columnas *(lo rescatable de Jira)*

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-TAB-01 | Tablero con una columna por estado del flujo | Media |
| RF-TAB-02 | Mover una tarea de columna arrastrándola | Media |
| RF-TAB-03 | Agrupar el tablero por responsable o por proyecto | Baja |

### 1.5 Historial *(lo otro rescatable de Jira)*

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-HIS-01 | Registrar cada cambio de estado, responsable y fecha, con autor y momento | Alta |
| RF-HIS-02 | Mostrar ese historial dentro de la tarea | Media |

> **Por qué el historial importa acá más que en Jira.** En una oficina contable
> la pregunta «¿quién dijo que esto estaba presentado?» tiene consecuencias
> frente al SII. Hoy no hay forma de responderla.

### 1.6 Avisos

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-AVI-01 | Avisar dentro de la aplicación cuando se asigna una tarea | Alta |
| RF-AVI-02 | Resumen diario por correo con lo que vence hoy y lo atrasado | Media |
| RF-AVI-03 | Aviso anticipado configurable antes de un vencimiento legal | Media |

---

## 2. Requerimientos no funcionales

> **RNF-CAL-01 · Aislamiento.** Todo filtra por `organizacion_id`, incluidas las
> obligaciones recurrentes y sus tareas generadas. Extiende RNF-TA-01.

> **RNF-CAL-02 · Un mes se pide en una consulta.** El calendario no puede hacer
> una consulta por día. Con 93 clientes y varias obligaciones, un mes puede
> superar las 300 tareas: se piden acotadas por rango de fechas, nunca todas.

> **RNF-CAL-03 · La generación es idempotente.** Correr el generador dos veces el
> mismo día no puede duplicar tareas. Se apoya en una restricción de unicidad en
> la base, no en que el código se acuerde de revisar.

> **RNF-CAL-04 · La generación deja rastro.** Cuántas se crearon, para qué
> período y con qué resultado, en `bitacora_sistema`. Si un mes no se generó,
> tiene que poder saberse sin adivinar.

> **RNF-CAL-05 · Los feriados son datos, no código.** La tabla de feriados se
> carga y se corrige sin tocar el programa: cambian cada año.

> **RNF-CAL-06 · Zona horaria.** Todo en hora de Chile. Un vencimiento el 12 a
> las 23:00 no puede aparecer como día 13 por una conversión a UTC.

---

## 3. Comparación con lo que existe hoy

| Requerimiento | Asana | Jira | **Nuestro sistema** |
|---|---|---|---|
| Proyectos y tareas | ✅ | ✅ | ✅ |
| Subtareas | ✅ | ✅ | ✅ un nivel |
| Responsable y colaboradores | ✅ | ✅ | ✅ |
| Estados y prioridades | ✅ | ✅ | ✅ 5 estados, 4 prioridades |
| Comentarios y adjuntos | ✅ | ✅ | ✅ |
| Buscar y filtrar | ✅ | ✅ | ✅ en el servidor |
| Archivar | ✅ | ✅ | ✅ |
| Avance de proyecto | ✅ | ✅ | ✅ |
| **Vista calendario** | ✅ | ✅ | ⚠️ un cuadrito en el dashboard del CRM: pinta un punto en los días con tareas, sin poder abrirlos |
| **Vista semana / día** | ✅ | ✅ | ❌ |
| **Arrastrar para reprogramar** | ✅ | ✅ | ❌ |
| **Carga por persona** | ✅ | ✅ | ❌ |
| **Tablero por columnas** | ✅ | ✅ | ❌ |
| **Historial de cambios** | ✅ | ✅ | ❌ solo archivar/desarchivar |
| **Avisos y notificaciones** | ✅ | ✅ | ❌ nada |
| **Tareas recurrentes** | ✅ | ⚠️ con complemento | ❌ |
| **Obligaciones tributarias por cliente** | ❌ | ❌ | ❌ *(y es lo que más falta)* |
| **Feriados chilenos** | ⚠️ | ⚠️ | ❌ |
| Sprints y backlog | ❌ | ✅ | ❌ *(no hace falta)* |
| Estimación en puntos | ❌ | ✅ | ❌ *(no hace falta)* |
| Velocidad y burndown | ❌ | ✅ | ❌ *(no hace falta)* |
| Epics | ⚠️ | ✅ | ❌ *(el proyecto ya cumple ese rol)* |

**Resumen honesto:** el módulo de Tareas ya cubre lo básico de Asana. Lo que
falta es todo lo que tiene que ver con *el tiempo*: verlo, repartirlo y que se
llene solo.

---

## 4. Lo que recomiendo NO construir

Vale tanto como lo que sí. Cada uno de estos suena bien en una demo y se
abandona a las dos semanas en un equipo de tres personas:

| Qué | Por qué no |
|---|---|
| **Sprints y backlog** | El trabajo contable no se planifica en ciclos elegibles: viene con fecha legal. Un sprint solo agrega una ceremonia semanal |
| **Puntos de historia** | Estimar en abstracto sirve para comparar velocidad entre equipos. Con tres personas, «esto son dos horas» es más útil y más honesto |
| **Burndown y velocidad** | Gráficos que se miran una vez. La pregunta real es «¿alguien va a llegar tarde con el F29?», que la responde la carga por persona |
| **Epics** | El proyecto ya agrupa. Un nivel más solo agrega dónde perder tareas |
| **Flujos configurables** | Que cada proyecto tenga estados distintos suena flexible y termina en que nadie sabe qué significa "en revisión" |
| **Dependencias entre tareas** | Útil en obra o desarrollo. Acá casi todo es independiente por cliente |

---

## 5. Fases propuestas

| Fase | Qué | Riesgo | Depende de |
|---|---|---|---|
| **C1** | Modelo: feriados, obligaciones y su generación | Bajo | — |
| **C2** | Vista calendario: mes, semana, día, con filtros | Bajo | C1 |
| **C3** | Generador automático + tablero de cumplimiento por obligación | **Medio** | C1 |
| **C4** | Carga por persona y reasignación | Bajo | C2 |
| **C5** | Historial de cambios por tarea | Bajo | — |
| **C6** | Avisos: en la aplicación y resumen diario por correo | Medio | C1 |
| **C7** | Tablero por columnas y arrastrar para reprogramar | Bajo | C2 |

**La fase 3 es la delicada.** Un generador que crea cientos de tareas
automáticamente y se equivoca deja la lista de todos inservible. Arranca
generando **en borrador, para un solo cliente**, y solo se suelta sobre la
cartera completa cuando un período salga limpio.

---

## 6. Advertencia de alcance

Esto es, en trabajo, **del tamaño del módulo de Tareas completo** — las siete
fases que acaban de cerrarse.

No está en las once metas del mes. Si entra, algo sale: con tres horas diarias
no caben las dos cosas. La decisión es del negocio, no técnica.

Si hubiera que elegir **una sola cosa** de todo este documento, sería el
**generador de obligaciones recurrentes** (C1 + C3): es lo único que ni Asana ni
Jira resuelven, lo que hoy se sostiene con la memoria de las personas, y lo que
más caro sale cuando falla — porque cuando falla, se pasa un plazo legal.
