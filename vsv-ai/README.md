# VSV AI

Sistema de inteligencia artificial privado y especializado para VSV PRO.
Python · sin dependencias de terceros en el núcleo.

**Estado:** funcionando de punta a punta con datos reales · 174 pruebas en verde.
Responde en ~1 s usando Groq (gratis) con modelos abiertos.

---

## Arquitectura

Dos ideas sostienen el diseño:

1. **El frontend habla con UNA sola dirección** — el backend de VSV PRO, que
   hace de puente. `config.js` no tiene ninguna URL del asistente.
2. **Dónde vive VSV AI y dónde corre el modelo son decisiones separadas.**

```
USUARIO
   │
   ▼
VERCEL · VSV PRO (React)
   │  API_BASE_URL
   ▼
RAILWAY · backend VSV PRO ──────┐
   │  /api/asistente            │  la sesión del usuario
   ▼                            │  viaja en cada llamada
RAILWAY · VSV AI (Python)       │
   │                            │
   ├── core/  orquestador       │
   ├── tools/ herramientas ─────┘
   │
   ▼  HTTP
MODELO · Groq (gratis) o una GPU propia
```

VSV AI **no contiene el modelo**: se lo pide por HTTP. Hoy lo ejecuta Groq
—modelos abiertos, capa gratuita—; mañana puede ser una GPU en la oficina
cambiando dos variables de entorno.

El navegador nunca habla con VSV AI. Por eso el servicio no necesita CORS: una
petición servidor-a-servidor no pasa por ahí.

---

## Las cuatro decisiones que sostienen el diseño

**1 · La IA nunca escribe SQL.** Elige qué herramienta llamar y con qué
parámetros. El SQL vive en VSV PRO, escrito y probado.

**2 · Las herramientas pasan por la API de VSV PRO, no por PostgreSQL.** Los
permisos (`puedeVerEmpresa`, `empresasVisibles`, aislamiento por organización) ya
existen y llevan meses corrigiéndose. Reimplementarlos daría dos sistemas que se
desincronizan — y el día que diverjan, el síntoma es una fuga entre empresas.
Con este diseño, saltarse el aislamiento no es difícil: es imposible.

**3 · El modelo se elige por benchmark**, no por fama ni por el hardware
disponible.

**4 · El núcleo no depende de nada.** `core`, `models`, `tools`, `security` y
`memory` funcionan solo con la biblioteca estándar de Python. FastAPI se usa
únicamente para servir la API. Así el benchmark y las pruebas corren sin instalar
nada, y una dependencia rota no puede bloquear la evaluación.

---

## Estructura

```
vsv-ai/
├── api/
│   └── main.py            FastAPI · lo que Railway ejecuta
├── core/
│   ├── orchestrator.py    el ciclo completo de una pregunta
│   └── prompts.py         versionado, para atribuir cambios de resultado
├── models/
│   └── provider.py        adaptador · el modelo se cambia con una variable
├── tools/
│   ├── catalogo.py        el contrato con el modelo
│   └── cliente.py         el puente hacia la API de VSV PRO
├── memory/
│   └── conversation.py    lo que hace que «¿y julio?» funcione
├── security/
│   └── validation.py      lo que el modelo pide vs. lo que se puede ejecutar
├── rag/                   conocimiento propio            (Fase 5)
├── evaluation/
│   ├── dataset/           45 casos con datos reales de VSV
│   ├── protocolo.py       condiciones fijas de medición
│   ├── runner.py          el corredor
│   └── reports/           resultados de cada corrida
└── tests/
    ├── test_nucleo.py     44 pruebas · sin modelo, sin red
    └── test_benchmark.py  13 pruebas · calibra el corredor
```

---

## El ciclo de una pregunta

```
"¿Cuánto cobramos en agosto?"
   │
   ▼
[1] modelo + prompt + memoria
   │      → {"herramienta": "consultar_recaudacion", "parametros": {"periodo": "2026-08"}}
   ▼
[2] security/validation.py
   │      ¿existe la herramienta? ¿los parámetros son del tipo correcto?
   ▼
[3] tools/cliente.py → GET /api/cobros/recaudacion    ← los permisos se aplican acá
   │      → {"total": 4671956, "pagos": 43}
   ▼
[4] modelo + datos
   │      → "En agosto se cobraron $4.671.956 en 43 pagos."
   ▼
respuesta
```

**Dos llamadas al modelo, no una.** La primera decide, la segunda redacta. En
una sola pasada el modelo tendría que inventar los datos para redactar — que es
exactamente el error que este sistema no puede cometer.

---

## Correr las pruebas

No requieren instalar nada ni tener el modelo levantado.

```bash
python tests/test_nucleo.py       # 50 · validación, memoria, orquestación
python tests/test_benchmark.py    # 13 · calibra el corredor del benchmark
python tests/test_api.py          # 31 · autenticación, aislamiento, errores
python tests/test_robustez.py     # 44 · qué pasa cuando algo sale mal
node ../tmp/test_puente.mjs       # 36 · el puente en el backend de VSV PRO
```

`test_benchmark.py` corre el corredor real contra tres modelos simulados: uno
perfecto, uno que inventa cifras y uno que confunde facturar con cobrar. Si el
corredor está bien, tiene que distinguirlos — y el que inventa cifras tiene que
quedar vetado aunque saque 96%.

Un instrumento de medición se calibra antes de usarlo: si el corredor tuviera un
error, elegiríamos el modelo equivocado y el error quedaría escondido detrás de
una tabla con aspecto de rigurosa.

---

## Ejecutar el benchmark

```bash
# 1 · Instalar Ollama (https://ollama.com) y bajar candidatos
ollama pull qwen2.5:7b
ollama pull llama3.1:8b

# 2 · Ver qué hay disponible
python evaluation/runner.py

# 3 · Comparar
python evaluation/runner.py --modelo qwen2.5:7b --modelo llama3.1:8b
```

El informe completo queda en `evaluation/reports/`, con el hardware y el
protocolo anotados: dentro de seis meses se tiene que poder decir «el modelo se
eligió con estas condiciones», no «creo que era mejor».

---

## Levantar la API

```bash
pip install -r requirements.txt
uvicorn api.main:app --reload
```

| Variable | Para qué | Por omisión |
|---|---|---|
| `OLLAMA_HOST` | Dónde corre el modelo | `http://localhost:11434` |
| `VSV_API_URL` | API de VSV PRO | — |
| `VSV_AI_MODELO` | Modelo a usar | `qwen2.5:7b` |

`GET /salud` informa si el modelo está alcanzable: el servicio puede estar arriba
y el modelo caído, y eso hay que poder verlo.

---

## Dos cosas que costaron caro y no hay que repetir

### 1 · Las rutas del catálogo se verifican contra el backend, no se deducen

La primera versión de `tools/catalogo.py` apuntaba a `/api/cobros/recaudacion`,
`/api/personas/cartera` y `/api/crm/tareas/resumen`. **Ninguna existía.** Cuatro
de cinco herramientas daban 404.

Lo peligroso es el síntoma: el asistente decía «no tengo ese dato», que suena a
problema del modelo. Se ve idéntico a una alucinación bien manejada, y se puede
perder mucho tiempo culpando al modelo por una ruta mal escrita.

Al agregar o cambiar una herramienta: llamar al endpoint de verdad, mirar qué
devuelve, y anotar la fecha de verificación.

### 2 · El dataset tiene que reflejar la API real

Los 45 casos se escribieron contra herramientas imaginadas —con filtros
`monto_minimo` y `solo_vencidos` que la API no soporta—. Se migraron con
`evaluation/migrar_dataset.py`, que deja constancia de qué cambió y por qué.

**Un benchmark contra una API imaginaria mide una fantasía.** Y su tabla se ve
igual de rigurosa que una de verdad.

---

## Límites de Groq · lo que hay que saber

La capa gratuita tiene **dos** límites, y el que muerde no es el que se anuncia:

| | |
|---|---|
| 14.400 consultas al día | holgado — VSV usa ~1% |
| **8.000 tokens por minuto** | **este es el que aprieta** |

El prompt son ~1.300 tokens y se envía dos veces por consulta, así que son unas
**3 preguntas por minuto** antes de que Groq empiece a pedir espera.

El adaptador reintenta respetando el tiempo que Groq indica, así que el usuario
espera unos segundos en vez de ver un error. Pero conviene saberlo:

- La cuota es **de la organización**, no del proceso. Correr el benchmark
  mientras alguien usa el asistente deja al asistente sin cuota.
- Para VSV —cinco personas, consultas puntuales— alcanza de sobra.

---

## El dataset · 45 casos con datos reales

Las cifras esperadas se midieron contra la base de producción el 01-09-2026.

| Archivo | Casos | Qué mide |
|---|---|---|
| `01-herramientas.json` | 15 | Que elija la herramienta correcta y arme bien los parámetros |
| `02-espanol-chileno.json` | 12 | Que entienda «quien me debe», «100 lucas», «qué onda con» |
| `03-contexto.json` | 5 | Que «¿y julio?» funcione tras preguntar por agosto |
| `04-comportamiento-ante-negativas.json` | 6 | Que diga «no tengo acceso» en vez de fingir |
| `05-alucinacion.json` | 7 | **Que diga «no sé» en vez de inventar** |

### Por qué la alucinación importa más que el resto

Un modelo que elige mal la herramienta da una respuesta evidentemente
equivocada: se nota y se corrige. Un modelo que **inventa una cifra** da una
respuesta con la forma correcta —$4.328.000, 87 documentos— y nadie la
cuestiona.

En cobranza eso significa reclamarle a un cliente una deuda que no tiene. Es el
único error del sistema que no se detecta solo. Por eso es criterio de **veto**:
un modelo que falla acá no entra a producción aunque gane en todo lo demás.

`05-alucinacion.json` incluye **dos controles positivos**: casos donde el dato sí
existe y hay que darlo exacto. Sin ellos, un modelo que respondiera «no sé» a
todo sacaría 100% y sería inútil.

### Sobre la seguridad como métrica

El dataset **no mide «¿el modelo protege los datos?»**, y es deliberado.

El modelo nunca está en posición de proteger nada: las herramientas llaman a la
API con el token del usuario y es esa API la que aplica los permisos. Una métrica
de seguridad del modelo daría 100% por construcción, y un 100% que no puede bajar
de 100% no informa.

Lo que se mide es el **comportamiento** ante una negativa: que lo diga con
claridad en vez de inventar una excusa o afirmar que lo hizo.

---

## Métricas objetivo

| Métrica | Objetivo | Por qué |
|---|---|---|
| Selección de herramienta | ≥ 95% | Si elige mal, responde otra cosa |
| Español real | ≥ 95% | Nadie escribe con tildes al apuro |
| Contexto | ≥ 90% | Sin esto es un buscador, no un asistente |
| Ante negativas | ≥ 95% | Que no finja |
| **Alucinación** | **≤ 1%** | El único error que no se detecta solo · **veto** |
| Latencia P95 | ≤ 3 s | Más que eso y se deja de usar |

---

## Qué es y qué no es

**Es** un sistema de IA propio: modelo de código abierto corriendo en
infraestructura de VSV, con herramientas internas, conocimiento propio, memoria y
evaluación. El modelo es el motor lingüístico; la inteligencia del sistema está
alrededor.

**No es** un modelo entrenado desde cero. Eso cuesta entre US$2M y US$100M y
necesita billones de palabras; VSV tiene 1.283 documentos emitidos. No es una
limitación de presupuesto sino de escala.

---

## Fases

| | Fase | Estado |
|---|---|---|
| 1 | Arquitectura y núcleo | **hecho** |
| 2 | Benchmark de modelos | corredor listo · **falta ejecutarlo** |
| 3 | Elegir modelo | pendiente |
| 4 | Conectar herramientas a la API real | pendiente |
| 5 | RAG · conocimiento propio | pendiente |
| 6 | Memoria persistente (Redis) | pendiente |
| 7 | Producción | **requiere decidir dónde corre la GPU** |
| 8 | Dataset real de uso | pendiente |
| 9 | Fine-tuning | solo si hace falta |

El fine-tuning **solo se activa** si el benchmark muestra fallos sistemáticos que
el prompt no corrige — bajo 90% persistente en selección de herramienta. Si el
modelo base alcanza 96%, el esfuerzo rinde más construyendo más herramientas.

---

## Lo que falta decidir

**Dónde corre la GPU en producción.** Railway no tiene GPU. Las opciones:

| | Inversión | Mensual | A 36 meses |
|---|---|---|---|
| PC en la oficina VSV | ~US$1.100 | ~US$8 | **US$1.388** |
| Servidor alquilado | — | ~US$200 | US$7.200 |

El PC propio se paga solo frente a alquilar en el mes 6. Y para un estudio que
maneja claves del SII, tener el modelo físicamente en la oficina es más
defendible que cualquier nube.

Esta decisión **no bloquea el desarrollo**: el benchmark corre en el PC de
desarrollo, y `OLLAMA_HOST` permite mover el modelo después sin tocar código.
