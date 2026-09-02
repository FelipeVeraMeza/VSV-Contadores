# Asistente con modelo local · qué hace falta y qué cuesta

**Fecha:** 1 de septiembre de 2026
**Decisión tomada:** el modelo corre en infraestructura de VSV. Los datos de
clientes no salen hacia Google ni hacia ningún tercero.
**Estado:** análisis para decidir dónde correrlo. Nada instalado todavía.

Este documento complementa `asistente-diseno.md`, que define **qué** hace el
asistente. Este define **dónde corre el modelo**.

---

## 1. Por qué no se entrena un modelo desde cero

Se evaluó y no es viable. Los números, para que quede escrito:

| | Entrenar desde cero |
|---|---|
| Costo de cómputo | US$ 2.000.000 – 100.000.000 |
| Datos necesarios | Billones de palabras |
| Equipo | Decenas de investigadores |
| Tiempo | Meses de entrenamiento continuo |

**VSV tiene 1.283 documentos emitidos y 449 tareas.** Para entrenar un modelo de
lenguaje eso no alcanza ni para una fracción de lo necesario. No es un problema
de presupuesto: no existen suficientes datos en el rubro contable chileno entero.

### Por qué tampoco sirve afinar uno existente (fine-tuning)

Esto sí es técnicamente posible, pero **resuelve el problema equivocado**.

El fine-tuning enseña **estilo y formato**, no hechos. Si se afina con los cobros
de agosto, el modelo aprende a *sonar* como VSV, pero al preguntarle cuánto se
cobró va a **inventar una cifra plausible** en vez de consultar la base. Y en
septiembre estaría desactualizado, porque los datos quedaron congelados.

Para datos que cambian a diario —cobros, tickets, facturas— la herramienta
correcta es consultar la base en el momento, que es lo que hace el diseño de
`asistente-diseno.md`.

> **Lo que sí se logra:** un modelo de código abierto corriendo en servidor
> propio. No lo entrenó VSV, pero es de VSV: nadie más lo ve, no hay costo por
> consulta, y funciona sin depender de un tercero.

---

## 2. El hardware que ya existe

Medido en el equipo de Felipe el 01-09-2026:

| | |
|---|---|
| GPU | **NVIDIA RTX 2060 · 6 GB VRAM** (1,5 GB libres con Windows y Chrome abiertos) |
| CPU | AMD Ryzen 5 5600X · 6 núcleos |
| RAM | 16 GB (3,7 GB libres en ese momento) |
| Ollama | **No instalado** |

**Esto alcanza para probar**, que es lo que importa ahora. No alcanza para
producción con tres personas usándolo a la vez.

---

## 3. Qué modelo cabe en 6 GB

La VRAM es el límite real. Un modelo que no cabe corre en CPU y se vuelve
inusable (30+ segundos por respuesta).

| Modelo | Tamaño | ¿Cabe en 6 GB? | Sirve para esto |
|---|---|---|---|
| **Llama 3.2 3B** | ~2 GB | Sí, cómodo | ✅ Suficiente: clasificar la pregunta y redactar |
| **Qwen 2.5 7B** | ~4,4 GB | Justo, cerrando Chrome | ✅ Mejor redacción en español |
| Llama 3.1 8B | ~4,7 GB | Muy justo | ⚠️ Riesgo de quedarse sin VRAM |
| Modelos de 70B | ~40 GB | No | — |

**La tarea del asistente es modesta**, y eso juega a favor: no tiene que razonar
ni escribir código. Tiene que (a) elegir cuál de 5 consultas responde la
pregunta, y (b) redactar una frase con los datos que devolvió esa consulta. Un
modelo de 3B hace eso bien.

> Esto es consecuencia directa de la decisión de arquitectura del otro documento:
> como **la IA nunca escribe SQL**, no hace falta un modelo grande. Si la IA
> tuviera que generar consultas, un 3B no bastaría.

---

## 4. Las tres opciones de dónde correrlo

### Opción A · El equipo de Felipe (para probar)

| | |
|---|---|
| Costo | **$0** |
| Qué se necesita | Instalar Ollama y bajar el modelo (~2 GB) |
| Sirve para | Probar si la calidad de respuesta alcanza, antes de gastar |
| No sirve para | Producción: si el equipo se apaga, el asistente muere |

**Es el paso siguiente natural.** Antes de pagar un servidor conviene comprobar
con datos reales que un modelo local responde lo suficientemente bien.

### Opción B · Servidor con GPU (producción)

| | |
|---|---|
| Costo | **US$ 150 – 400 / mes** según GPU |
| Dónde | Railway no ofrece GPU. Alternativas: RunPod, Vast.ai, Hetzner, o una máquina física en la oficina |
| Ventaja | Los datos nunca salen · sin costo por consulta · sin límite de uso |
| Desventaja | Costo fijo aunque nadie pregunte · hay que mantenerlo |

### Opción C · Máquina física en la oficina

| | |
|---|---|
| Costo | **US$ 700 – 1.500** una vez (PC con RTX 4060 Ti 16 GB) |
| Ventaja | Se paga una vez · control total · los datos ni siquiera salen de la oficina |
| Desventaja | Si se corta la luz o internet, no hay asistente · alguien tiene que mantenerlo |

A partir de ~5 meses sale más barato que alquilar. Y para un estudio contable que
maneja claves del SII, tener el modelo físicamente en la oficina tiene un
argumento que no es solo económico.

---

## 5. La comparación honesta

|  | Modelo local | Gemini (API) |
|---|---|---|
| **Privacidad** | ✅ Los datos nunca salen | ⚠️ Van a Google |
| **Costo** | Fijo: US$150-400/mes o US$700-1.500 una vez | Hoy $0 (capa gratuita); crece con el uso |
| **Velocidad** | 2–5 seg (RTX 2060) | ~1 seg |
| **Calidad en español** | Buena con 7B, aceptable con 3B | Mejor |
| **Mantenimiento** | Tuyo | Ninguno |
| **Funciona sin internet** | ✅ | ❌ |

**Lo que inclina la balanza en tu caso:** manejas RUTs encriptados, claves del SII
de 99 empresas y datos financieros de terceros. Mandar eso a un tercero es una
decisión que hay que poder defender ante un cliente que pregunte. Con modelo
local, la respuesta es simple: *no sale de acá*.

---

## 6. El diseño no cambia · solo el proveedor

Esto es lo importante y hay que construirlo así desde el principio:

```
El asistente llama a:   generarRespuesta(prompt)
                              ↓
                    src/services/ia/proveedor.js
                         ↙            ↘
              Ollama local        Gemini (respaldo)
```

**Todo el resto del código no sabe qué modelo hay detrás.** Cambiar de uno a otro
es cambiar una variable en el `.env`. Eso permite:

- Empezar probando en el equipo de Felipe, sin gastar
- Pasar a servidor cuando esté decidido
- Tener Gemini como respaldo si el servidor local se cae
- Cambiar de modelo cuando salga uno mejor, sin tocar el asistente

Es el mismo patrón que ya usa `whatsapp/ia.js`: el cliente se construye de forma
perezosa y el modelo se puede sobreescribir por organización.

---

## 7. Lo que propongo hacer ahora

**Paso 1 · Probar sin gastar nada** (esta semana)

1. Instalar Ollama en el equipo de Felipe
2. Bajar Llama 3.2 3B (~2 GB)
3. Probarlo con **preguntas y datos reales de VSV**: las cinco consultas del
   diseño, con las cifras que devuelve la base
4. Medir: ¿cuánto tarda? ¿redacta bien en español? ¿elige la consulta correcta?

**Con eso se decide con evidencia**, no con folletos. Si la calidad alcanza, se
elige servidor. Si no alcanza, se sabe antes de haber gastado.

**Paso 2 · Construir el asistente** con la capa de proveedor intercambiable, de
modo que funcione con Ollama local y con Gemini de respaldo.

**Paso 3 · Decidir dónde vive** en producción, con los datos del paso 1 sobre la
mesa.

---

## 8. Lo que necesito de ti

| | |
|---|---|
| 1 | ¿Instalo Ollama en tu equipo para la prueba del paso 1? Son ~2 GB de descarga y no toca nada del sistema |
| 2 | Para producción: ¿servidor alquilado (mensual) o máquina en la oficina (una vez)? Se puede decidir después de la prueba |
| 3 | ¿Gemini queda como respaldo si el local se cae, o prefieres que si no hay modelo local simplemente no haya asistente? |
