# Asistente virtual de VSV · diseño

**Fecha:** 1 de septiembre de 2026
**Estado:** diseño para aprobar. **Nada construido todavía.**
**Qué es:** un asistente interno para Víctor, Matías y Felipe que responde
preguntas sobre los datos del sistema en lenguaje normal.

---

## 1. Qué problema resuelve

Hoy, para saber cuánto se cobró en agosto hay que entrar a Facturación, elegir el
período, mirar la tabla y sumar. Para saber quién debe hace más de 30 días, no
hay pantalla: se arma a mano. Para saber cuántos tickets tiene Víctor abiertos,
hay que ir a Tickets y filtrar.

Son preguntas que se hacen todos los días y cuya respuesta ya está en la base.

**El asistente no reemplaza ninguna pantalla.** Responde lo que hoy obliga a
navegar tres menús o abrir un Excel.

### Lo que NO va a hacer

Conviene decirlo antes de construir, porque define el alcance:

- **No modifica datos.** Solo lee. No crea tareas, no marca cobros como pagados,
  no contabiliza. Un asistente que escribe necesita otro nivel de garantías.
- **No inventa cifras.** Ver la sección 3: nunca escribe SQL.
- **No reemplaza el criterio contable.** Dice qué hay en la base; qué hacer con
  eso lo decide una persona.

---

## 2. Lo que ya existe y se aprovecha

No se parte de cero:

| Pieza | Dónde | Qué aporta |
|---|---|---|
| Cliente de Gemini | `src/services/whatsapp/ia.js` | Ya configurado, con modelo por defecto y arranque perezoso si falta la key |
| Conocimiento por organización | `whatsapp_conocimiento` | El patrón de cargar contexto desde la base, no de un archivo |
| Sesión y permisos | `middleware/auth.js` | `requireSession`, `requireModulo`, aislamiento por `organizacion_id` |
| Alcance por empresa | `utils/scope.js` | `empresasVisibles`, `puedeVerEmpresa`, `veSoloAsignadas` |
| Bitácora | `utils/bitacora.js` | Para registrar qué se preguntó y qué se respondió |

**Vive dentro de VSV PRO**, como una sección más. Un proyecto separado obligaría
a rehacer login, permisos y aislamiento por organización — tres cosas que aquí ya
funcionan y están probadas.

---

## 3. La decisión de arquitectura · consultas predefinidas

> **La IA nunca escribe SQL.** Elige cuál de las consultas ya programadas
> responde la pregunta, y redacta la respuesta con los datos que esa consulta
> devuelve.

```
Usuario escribe la pregunta
        ↓
La IA la clasifica: ¿cuál de las N consultas responde esto?
        ↓
Se ejecuta esa consulta — SQL fijo, escrito y probado, con
los filtros de organización y empresa del usuario que pregunta
        ↓
La IA redacta la respuesta CON esos datos
        ↓
Se muestra la respuesta + de dónde salió
```

**Por qué así y no dejando que la IA genere el SQL.** Una IA que escribe
consultas responde cualquier cosa sin programar nada nuevo, que es tentador. El
problema es que cuando se equivoca **no se nota**: devuelve un número con la
forma correcta. En datos contables y de cobranza, una cifra que parece bien y
está mal es peor que un error visible — alguien le cobra de más a un cliente, o
deja de cobrarle.

Con consultas predefinidas, el costo es que agregar una pregunta nueva es trabajo
de programación. Es un costo aceptable: en la práctica las preguntas se repiten.

**Consecuencia de diseño:** cuando la pregunta no calza con ninguna consulta, el
asistente **lo dice** en vez de improvisar. Eso hay que aceptarlo desde el
principio; un asistente que a veces contesta «no sé responder eso todavía» es
mucho más confiable que uno que siempre contesta algo.

---

## 4. Las consultas de la primera versión

Las cinco están **probadas contra la base real** el 01-09-2026. Los datos de
ejemplo son los que devolvieron.

### 4.1 Cobranza

| Consulta | Ejemplo de respuesta real |
|---|---|
| **Cuánto se cobró** (por mes) | ago-2026: **$4.671.956** en 101 pagos · jul: $4.102.280 en 98 |
| **Quién debe** (vencidos) | 6 empresas · la mayor COMERCIALIZADORA ROVIRA $350.000, 28 días de atraso |

Ojo con esta: mide por **fecha de pago**, no por período del cobro. Es la
distinción que causó que el dashboard mostrara 7,5 veces menos de lo real (ver
`crm-modulo.md` §11.1). El asistente tiene que usar el mismo criterio que el
dashboard o dará cifras distintas para lo mismo, que es peor que no responder.

### 4.2 Facturación

| Consulta | Ejemplo real |
|---|---|
| **Cuánto se facturó** (por mes) | ago-2026: **$6.515.335** en 107 documentos · jun: $8.662.227 en 117 |

### 4.3 Trabajo del equipo

| Consulta | Ejemplo real |
|---|---|
| **Tickets abiertos por persona** | Víctor **164** (14 vencidos) · Felipe 29 · Matías 18 (1 vencido) |

### 4.4 Comercial

| Consulta | Ejemplo real |
|---|---|
| **Prospectos sin contacto** | **131** llevan más de 15 días sin contacto |

> Esa última cifra ilustra algo: 131 de 132 prospectos. El asistente va a
> responder el número correcto, pero el número correcto no siempre es una
> respuesta útil. Cuando un resultado es así de extremo, conviene que lo diga:
> «131 de 132, o sea prácticamente toda la cartera».

---

## 5. Permisos · lo que ve cada quien

El asistente **hereda los permisos del usuario que pregunta**. No es una capa
nueva: usa la misma que el resto del sistema.

```
Cada consulta lleva SIEMPRE:
  · organizacion_id  del usuario que pregunta
  · si ve_solo_empresas_asignadas = true → solo sus empresas (tabla audita)
```

Hoy los tres usuarios son Administrador y ven todo, así que esto no cambia nada
en la práctica. Pero se construye así desde el principio: el día que entre
alguien con acceso restringido, el asistente no puede ser la puerta trasera que
le muestre lo que su pantalla le oculta.

**Regla:** el filtro va en el SQL de cada consulta, no en el prompt de la IA. La
IA no decide qué puede ver nadie.

---

## 6. Qué se guarda de cada pregunta

En una tabla nueva `asistente_consulta`:

| Campo | Para qué |
|---|---|
| `usuario_id`, `organizacion_id` | Quién preguntó |
| `pregunta` | El texto tal cual lo escribió |
| `consulta_usada` | Cuál de las predefinidas se eligió, o `null` si ninguna |
| `respondio` | Si se pudo responder |
| `ms` , `tokens` | Cuánto tardó y cuánto costó |
| `created_at` | Cuándo |

**Para qué sirve de verdad:** las preguntas que quedaron sin responder son la
lista de qué construir después. No hay que adivinar qué necesita el equipo — se
ve en la tabla.

---

## 7. El costo, dicho con números

Gemini flash-lite (el que ya se usa en WhatsApp) está en la capa gratuita hasta
cierto volumen. Con tres usuarios haciendo unas pocas preguntas al día, el
consumo es bajo.

Aun así el diseño incluye **un tope por organización y por día**, configurable.
Cuando se alcanza, el asistente lo dice en vez de seguir gastando en silencio. Es
la misma lógica que la cuota de correos que ya existe.

---

## 8. Cómo se prueba

Siguiendo las dos reglas que quedaron de la sesión del 01-09 (ver
`sesion-01-09-2026.md` §2):

1. **Cada consulta SQL se prepara contra Postgres** antes de darla por buena.
   Un error de tipos no lo detecta el build.
2. **Se prueba el endpoint real**, no una réplica de la lógica.

Además, específico de esto:

- **Las cifras se contrastan con la pantalla.** Si el asistente dice que en
  agosto se cobraron $4.671.956, el dashboard tiene que decir lo mismo. Dos
  fuentes con cifras distintas para lo mismo destruyen la confianza en las dos.
- **Se prueba con preguntas mal escritas**, que es como se pregunta de verdad:
  «cuanto cobramos», «quien me debe», «tickets de victor».
- **Se prueba qué pasa cuando no sabe responder.** Debe decirlo claro, no
  improvisar.

---

## 9. Lo que hay que decidir antes de construir

| | Pregunta |
|---|---|
| 1 | ¿Las cinco consultas de la sección 4 son las correctas, o hay otras que se preguntan más seguido? |
| 2 | ¿Dónde va en el menú? ¿Sección propia, o un botón flotante disponible en todas las pantallas? |
| 3 | ¿Se guarda el historial de conversación, o cada pregunta es independiente? Guardarlo permite «¿y en julio?» después de preguntar por agosto |

---

## 10. Plan de construcción

| Paso | Qué incluye |
|---|---|
| **1** | Tabla `asistente_consulta` + las 5 consultas SQL, probadas contra la base |
| **2** | Endpoint que recibe la pregunta, clasifica, ejecuta y redacta |
| **3** | Pantalla: caja de texto, respuesta, y de dónde salió el dato |
| **4** | Tope de gasto y registro |
| **5** | Pruebas: cifras contra la pantalla, preguntas mal escritas, qué pasa si no sabe |

Cada paso deja algo verificable. No se pasa al siguiente sin probar el anterior.
