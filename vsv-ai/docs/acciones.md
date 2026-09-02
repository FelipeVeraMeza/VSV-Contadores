# De asistente que consulta a agente que actúa

Nota de diseño. **Nada de esto está implementado**: es la decisión de cómo se va
a implementar, tomada antes de escribir el código para no tener que deshacerlo.

---

## La diferencia

Hoy VSV AI responde preguntas:

> «¿Cuántos clientes tienen deuda?» → consulta → responde

Lo siguiente es que ejecute:

> «Crea una tarea para Matías: revisar F29 de agosto» → **crea la tarea**

Parece un paso pequeño. No lo es: es la diferencia entre un error que se nota y
uno que queda escrito en la base de datos.

---

## Por qué no es simplemente «agregar herramientas de escritura»

Una consulta equivocada se descarta leyéndola. Una escritura equivocada queda.

| | Consulta | Escritura |
|---|---|---|
| Si el modelo se equivoca | respuesta rara, se nota | dato incorrecto, persiste |
| Si entiende mal a medias | falta un filtro | tarea al responsable equivocado |
| Deshacer | no hace falta | hay que saber qué se hizo |
| Repetir la orden dos veces | mismo resultado | dos tareas iguales |

El último punto es el más traicionero: si la respuesta se pierde por un corte de
red y el usuario repite la pregunta, una consulta da lo mismo dos veces y una
escritura crea dos tareas.

---

## Las cuatro reglas

### 1 · Confirmación antes de escribir

El modelo no ejecuta: **propone**. La acción se muestra armada y el usuario
aprieta el botón.

```
  «Crea una tarea para Matías: revisar F29 de agosto»

  ┌─────────────────────────────────────────┐
  │  Crear tarea                            │
  │                                         │
  │  Título        Revisar F29 de agosto    │
  │  Responsable   Matías Sepúlveda         │
  │  Vence         30-09-2026               │
  │                                         │
  │            [ Cancelar ]  [ Crear ]      │
  └─────────────────────────────────────────┘
```

Esto no es desconfianza del modelo: es que **el usuario ve lo que entendió antes
de que ocurra**. Si interpretó «Matías» como otra persona, se detecta acá y no
después.

La confirmación se puede relajar más adelante para acciones de bajo riesgo, con
datos de uso reales. No al revés: empezar sin confirmación y agregarla después de
un incidente es la peor secuencia posible.

### 2 · Las escrituras pasan por la API de VSV PRO

Igual que las consultas, por la misma razón: los permisos ya viven ahí. Crear una
tarea desde el asistente tiene que pasar por el mismo endpoint —y las mismas
validaciones— que crearla desde la pantalla.

Esto además resuelve algo gratis: las validaciones de negocio que ya existen
(campos obligatorios, longitudes, claves foráneas) aplican sin reescribirlas.

### 3 · Toda acción queda en la bitácora, marcada como tal

Ya existe `registrar` en `src/utils/bitacora.js`. Las acciones del asistente
usan eso mismo, con la marca de que vinieron de VSV AI y con qué frase se
pidieron.

Sin eso, dentro de un mes alguien pregunta «¿quién creó esta tarea?» y la
respuesta es «Felipe», cuando en realidad fue el asistente interpretando algo que
Felipe dijo. Son dos cosas distintas y hay que poder distinguirlas.

### 4 · Idempotencia

Cada acción confirmada lleva un identificador único generado **antes** de
enviarla. Si la petición se reintenta, la API reconoce el identificador y no crea
un duplicado.

Sin esto, un corte de red en el momento equivocado deja dos tareas idénticas y
nadie sabe cuál borrar.

---

## Qué acciones primero

Ordenadas por daño si salen mal:

| Acción | Riesgo | Cuándo |
|---|---|---|
| Crear tarea / ticket | bajo — se borra | primero |
| Agregar nota a un prospecto | bajo | primero |
| Cambiar estado de una tarea | medio — `tarea` no guarda historial | después |
| Registrar un pago | alto — toca plata | mucho después, si acaso |
| Cualquier cosa en contabilidad | alto — hay circuito de aprobación | no por ahora |

Lo de cambiar estado tiene una razón concreta: la tabla `tarea` no guarda
historial de estados, así que un cambio equivocado **no se puede revertir "a como
estaba"**. Mientras eso siga así, no es una acción de las primeras.

---

## Lo que esto exige del modelo

Las acciones piden algo que las consultas no: **extraer entidades con
precisión**.

«Crea una tarea para Matías» necesita resolver «Matías» a un usuario concreto. Si
hay dos Matías, el modelo no debe elegir uno: debe preguntar.

Eso es una categoría nueva del benchmark —`extraccion_de_entidades`— que hay que
escribir antes de implementar acciones, no después. Un modelo que acierta 96% en
elegir herramienta puede ser bastante peor extrayendo nombres y fechas, y ese
número todavía no lo tenemos.

---

## Orden de trabajo

1. Correr el benchmark actual → elegir modelo *(en curso)*
2. Conectar las herramientas de consulta a la API real
3. Usarlo unas semanas, juntar las preguntas reales
4. **Recién ahí** escribir el dataset de acciones y medirlo
5. Implementar acciones, empezando por crear tarea

El paso 3 no es relleno. Las acciones que valen la pena implementar son las que
la gente efectivamente pide, y eso hoy es una suposición.
