# Módulo Agenda · Propuesta

**Fecha:** 4 de agosto de 2026
**Estado:** propuesta para aprobación
**Decisión que se pide:** si se construye, y con qué alcance

---

## 1. En una frase

> Un calendario que se llena solo con las obligaciones de cada cliente, avisa
> antes de que venza el plazo, y muestra en cualquier momento quién está al día
> y quién no.

---

## 2. El problema, con números

La oficina tiene **93 clientes activos**. Cada uno genera obligaciones que se
repiten todos los meses y tienen fecha legal fija.

Una sola obligación mensual son **93 tareas al mes**. Con cuatro obligaciones
habituales por cliente son **cerca de 370 vencimientos mensuales** que hoy no
están en ningún sistema: viven en la memoria de las personas, en planillas
sueltas y en la costumbre.

Eso tiene tres consecuencias concretas:

**No se sabe quién va atrasado hasta que ya es tarde.** No hay forma de mirar el
día 10 y responder «¿a cuántos clientes les falta el F29?». Se revisa cliente por
cliente, o se confía.

**Todo depende de que alguien se acuerde.** Si la persona que lleva un cliente
está con licencia, nadie más sabe qué le faltaba.

**Cuando falla, se pasa un plazo legal.** Y eso no se arregla con una disculpa:
son multas e intereses del cliente, y la responsabilidad es de la oficina.

Ninguna herramienta del mercado resuelve esto. **Asana y Jira no saben que el F29
vence el 12** — habría que crear las 93 tareas a mano igual.

---

## 3. Qué hace el módulo

Cuatro pantallas, dentro de Tareas.

### 3.1 Calendario

El mes completo, con cada tarea en su día.

- Vistas de **mes, semana y día**
- Se pulsa un día y se ven sus tareas: cliente, responsable, prioridad, estado
- Colores según urgencia: **atrasado**, **vence hoy**, **próximo**, **cumplido**
- Se **arrastra** una tarea a otro día para reprogramarla
- Se pulsa un día vacío y se crea una tarea con esa fecha ya puesta
- Filtros por responsable, cliente, proyecto y tipo de obligación
- Interruptor **mis tareas / las del equipo**
- Los **feriados** aparecen marcados

### 3.2 Obligaciones

Donde se define, una sola vez, lo que se repite.

Cada obligación tiene: nombre, periodicidad (mensual, trimestral, anual), día de
vencimiento, a qué clientes aplica, responsable por defecto y con cuántos días de
anticipación avisar.

Ejemplo de cómo queda configurado:

| Obligación | Cada | Vence | Aplica a |
|---|---|---|---|
| F29 · IVA | mes | día 12 | todos los activos |
| Cotizaciones previsionales | mes | día 10 | los que tienen trabajadores |
| Libro de compras y ventas | mes | día 8 | todos los activos |
| F22 · Renta | año | abril | todos los activos |
| Declaración jurada | año | marzo | según corresponda |

> Los días son **configurables**: cambian según el tipo de contribuyente y a
> veces el SII los mueve. El sistema no los trae escritos a fuego.

**Si el vencimiento cae sábado, domingo o feriado, se corre al siguiente día
hábil.** Esto no es un adorno: un aviso que llega un domingo nadie lo puede
cumplir, y a la segunda vez la gente deja de mirar el sistema.

### 3.3 Cumplimiento

La pantalla que responde la pregunta importante: **¿quién no ha presentado?**

Una grilla de clientes contra obligaciones del período:

```
                    F29    Previred   Libro CV
CLIENTE A            ✅        ✅         ✅
CLIENTE B            ⏳        ✅         ✅
CLIENTE C            ❌        ❌         ✅     ← atrasado
```

Se filtra por período y obligación, se ve el total (*"78 de 93 presentados"*), y
desde ahí mismo se manda un recordatorio a los que faltan.

### 3.4 Carga del equipo

Cuántas tareas tiene cada persona, por día y por semana.

Sirve para dos cosas: ver quién va a quedar sepultado la semana del 10, y
**reasignar arrastrando** antes de que pase, no después.

---

## 4. Cómo se llena solo

Es la parte que hace que el módulo valga la pena.

Todos los días, temprano, el sistema revisa qué obligaciones corresponden y crea
las tareas del período con su fecha de vencimiento ya corrida por feriados, su
responsable asignado y el cliente asociado.

**Cuatro resguardos, porque un generador equivocado es peor que no tener nada:**

1. **No duplica.** Si la tarea del período ya existe, no crea otra. Lo garantiza
   una restricción en la base de datos, no la buena memoria del programa.
2. **Respeta la cartera.** Si un cliente se da de baja, deja de generarle.
3. **Deja rastro.** Cuántas creó, para qué período y con qué resultado. Si un mes
   no se generó, se sabe sin adivinar.
4. **Arranca en borrador.** Las primeras corridas se revisan antes de que las
   tareas aparezcan en la lista de todos.

---

## 5. Los avisos

Hoy el sistema **no avisa nada**. Si le asignas una tarea a alguien, se entera
cuando abre la pantalla.

- Aviso **dentro de la aplicación** cuando te asignan algo o algo tuyo vence
- **Resumen diario por correo**: lo que vence hoy y lo que está atrasado
- **Aviso anticipado** configurable por obligación — el F29 avisa el día 8, no el 12

> Depende de que el dominio de correo esté verificado. Es el mismo trámite
> pendiente de la meta de correos masivos.

---

## 6. Historial

Cada cambio de estado, responsable y fecha queda registrado con autor y momento,
visible dentro de la tarea.

En una oficina contable la pregunta «¿quién dijo que esto estaba presentado?»
tiene consecuencias frente al SII. Hoy no hay forma de responderla.

---

## 7. Qué NO hace, a propósito

Decirlo importa tanto como lo anterior. Todo esto suena bien en una demo y se
abandona a las dos semanas en un equipo de tres personas:

| Qué | Por qué no |
|---|---|
| Sprints y backlog | El trabajo contable no se elige: viene con fecha legal |
| Puntos de historia | «Esto son dos horas» es más útil y más honesto |
| Burndown y velocidad | Gráficos que se miran una vez |
| Epics | El proyecto ya agrupa; un nivel más es dónde perder tareas |
| Flujos distintos por proyecto | Termina en que nadie sabe qué significa "en revisión" |
| Dependencias entre tareas | Acá casi todo es independiente por cliente |
| Presentar al SII automáticamente | **Fuera de alcance.** El módulo avisa y registra; presentar lo hace una persona |

---

## 8. Qué se agrega a la base de datos

Cuatro tablas nuevas. Nada de lo existente se toca ni se migra.

| Tabla | Para qué |
|---|---|
| `feriado` | Los días no hábiles de Chile. Datos, no código: cambian cada año |
| `obligacion` | La definición: nombre, periodicidad, día, anticipación |
| `obligacion_empresa` | A qué clientes aplica y quién responde por cada uno |
| `tarea_historial` | Cada cambio, con autor y momento |

A `tarea` se le agregan tres columnas para saber de qué obligación y período
nació, con una **restricción de unicidad** que hace imposible duplicar.

Todo filtra por organización, como el resto del sistema.

---

## 9. Fases

| Fase | Qué | Riesgo |
|---|---|---|
| **C1** | Modelo: feriados, obligaciones y su asignación a clientes | Bajo |
| **C2** | Calendario: mes, semana, día, con filtros | Bajo |
| **C3** | Generador automático + pantalla de Cumplimiento | **Medio** |
| **C4** | Carga del equipo y reasignación | Bajo |
| **C5** | Historial de cambios | Bajo |
| **C6** | Avisos: en pantalla y resumen diario | Medio |
| **C7** | Tablero por columnas y arrastrar para reprogramar | Bajo |

**La C3 es la que hay que cuidar.** Un generador que crea cientos de tareas y se
equivoca deja la lista de todos inservible y quema la confianza en el módulo.
Arranca generando **en borrador y para un solo cliente**; se suelta sobre los 93
recién cuando un período completo salga limpio.

Si hay que partir por lo mínimo que ya sirve: **C1 + C3**. Eso solo ya resuelve
el problema de fondo, aunque el calendario todavía se vea feo.

---

## 10. Qué necesito de la oficina

Esto no lo puedo sacar del código. Sin estas tres cosas el módulo no arranca:

1. **La lista real de obligaciones** que lleva la oficina, con su día de
   vencimiento. Las cinco del ejemplo son una suposición mía, no un dato.
2. **Qué obligación aplica a qué cliente.** No todos tienen trabajadores ni todos
   declaran lo mismo.
3. **Quién responde por cada una** por defecto.

Es una conversación de una o dos horas con quien lleva la operación. Es el
insumo más importante del módulo: si esa lista queda mal, todo lo demás queda mal.

---

## 11. Cómo sabremos que funcionó

Sin esto, en dos meses nadie sabrá si valió la pena:

- **Cero plazos legales pasados** por olvido en el trimestre siguiente
- La pregunta *"¿cuántos clientes van atrasados con el F29?"* se responde en
  **menos de diez segundos**, mirando una pantalla
- **Nadie crea a mano** una tarea de obligación mensual
- Cuando alguien falta, **otra persona puede tomar su cartera** sin preguntarle

---

## 12. Lo que cuesta, dicho derecho

En trabajo, esto es **del tamaño del módulo de Tareas completo** — las siete
fases que acaban de cerrarse.

**No está en las once metas del mes.** Si entra, algo sale: con tres horas
diarias no caben las dos cosas. Es una decisión del negocio, no técnica.

Mi recomendación: **aprobar C1 + C3 ahora** y dejar el resto para después del
cierre del mes. Es lo único que ni Asana ni Jira resuelven, hoy se sostiene con
la memoria de las personas, y cuando falla se pasa un plazo legal.
