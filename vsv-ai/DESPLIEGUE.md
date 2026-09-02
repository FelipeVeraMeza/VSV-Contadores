# Desplegar VSV AI en Railway

Guía para dejar el asistente funcionando en producción.

---

## Lo que hay que entender antes de empezar

**VSV AI se despliega en Railway. El modelo se ejecuta en otro lado.**

Railway no ofrece GPU. Un modelo de 7B en CPU tarda 15-40 segundos por
respuesta, y como el ciclo hace dos llamadas al modelo —una para decidir, otra
para redactar— serían 30-80 segundos por pregunta. Eso no es un asistente lento:
es uno que nadie usa.

```
Vercel · VSV PRO
   │
   ▼
Railway · backend VSV PRO        (ya existe · hace de puente)
   │  /api/asistente
   ▼
Railway · VSV AI  ←──────────────  esto se despliega acá
   │
   ▼  el modelo, ejecutado por:
Groq (gratis)  ·  o una GPU propia
```

**El navegador nunca habla con VSV AI.** Va al backend, que reenvía. Por eso el
frontend tiene una sola dirección y VSV AI no necesita CORS.

---

## Resumen · lo que hay que hacer

Cinco pasos, unos 15 minutos:

1. Crear el servicio en Railway con **Root Directory = `vsv-ai`**
2. Ponerle 4 variables
3. Añadir **1 variable** al backend que ya existe
4. Comprobar `/salud`
5. Preguntarle algo desde VSV PRO

El frontend no se toca: no tiene ninguna dirección del asistente.

---

## 1 · Crear el servicio en Railway

En el mismo proyecto donde ya está el backend:

1. **New → GitHub Repo** → el repositorio de VSV Contadores
2. **Settings → Root Directory** → `vsv-ai`

   Este paso es obligatorio. Sin él, Railway ve el `package.json` de la raíz,
   detecta Node y despliega el backend de VSV PRO otra vez.
3. Railway toma el `Dockerfile` y el `railway.json` de esa carpeta.

---

## 2 · Variables de entorno del servicio VSV AI

**Settings → Variables**:

| Variable | Valor | Obligatoria |
|---|---|---|
| `VSV_API_URL` | `https://vsv-contadores-production-b077.up.railway.app/api` | sí |
| `VSV_AI_PROVEEDOR` | `groq` (o `ollama` con GPU propia) | sí |
| `GROQ_API_KEY` | la clave de console.groq.com | sí, con Groq |
| `VSV_AI_MODELO` | el que gane el benchmark | sí |
| `OLLAMA_HOST` | dónde corre el modelo | solo con `ollama` |
| `RAILWAY_ENVIRONMENT` | `production` | recomendada — oculta `/docs` |
| `LOG_LEVEL` | `INFO` | no |

`PORT` la inyecta Railway sola. No hay que definirla.

**`ORIGENES_PERMITIDOS` se deja vacía.** El navegador no habla con este
servicio: habla con el backend, que reenvía. Una petición servidor-a-servidor no
pasa por CORS, así que no hay ningún origen que permitir — y dejarlo vacío
significa que ninguna página web puede llamar a VSV AI.

---

## 3 · Variable en el backend de VSV PRO

En el servicio que **ya existe**, una sola variable:

| Variable | Valor |
|---|---|
| `VSV_AI_URL` | `https://vsv-ai-production-XXXX.up.railway.app` |

Sin ella el asistente queda apagado: el panel lo avisa y deja la caja de
escritura desactivada. Así se puede desplegar el backend antes que VSV AI sin
romper nada.

**El frontend no se toca.** `config.js` no tiene ninguna dirección del
asistente: todo pasa por `API_BASE_URL`.

---

## 4 · Quién ejecuta el modelo

### Opción A · Groq · gratis, y es la recomendada para empezar

Groq ejecuta modelos **abiertos** —Qwen, Llama, GPT-OSS— en su hardware. No es
un modelo cerrado: son los mismos que se descargan con `ollama pull`.

| | |
|---|---|
| Costo | US$0, sin tarjeta |
| Límite | 14.400 consultas al día |
| Uso estimado de VSV | ~100 al día, cerca del 1% |
| Latencia | ~0,5 s |

```
VSV_AI_PROVEEDOR = groq
GROQ_API_KEY     = gsk_...
VSV_AI_MODELO    = qwen/qwen3.8-27b
```

**Lo que hay que tener claro:** los datos salen de la infraestructura de VSV.
Mientras se use un proveedor externo conviene seudonimizar los nombres de
empresa antes de enviarlos —`tools/anonimizar.py`—. Los RUT y las claves del SII
no salen nunca: ninguna herramienta los expone.

### Opción B · GPU propia · cuando el volumen o la privacidad lo justifiquen

Ollama en una máquina con GPU, expuesta con un túnel (Cloudflare Tunnel o
Tailscale):

```
VSV_AI_PROVEEDOR = ollama
OLLAMA_HOST      = https://gpu.vsv.cl
```

| | Inversión | Mensual | A 36 meses |
|---|---|---|---|
| PC en la oficina | ~US$1.100 | ~US$8 | US$1.388 |
| Servidor alquilado | — | ~US$200 | US$7.200 |

Los datos no salen de la oficina y no hay límite de consultas. El costo es la
inversión y depender de la luz y la conexión.

**Cambiar de una a otra son dos variables de entorno.** Por eso conviene empezar
con Groq: es gratis, y si algún día hace falta la GPU, el asistente no se entera
del cambio.

---

## 5 · Verificar

```bash
curl "https://vsv-ai-production-XXXX.up.railway.app/salud?verificar_modelo=1"
```

```json
{
  "servicio": "ok",
  "modelo_alcanzable": true,
  "modelo": "qwen/qwen3.8-27b",
  "modelo_existe": true,
  "proveedor": "groq",
  "api_vsv_configurada": true
}
```

| Qué ves | Qué significa |
|---|---|
| `modelo_alcanzable: false` | falta `GROQ_API_KEY` (o `OLLAMA_HOST` no responde) |
| `modelo_existe: false` | **el modelo fue retirado del catálogo** — ver abajo |
| `api_vsv_configurada: false` | falta `VSV_API_URL` |

`?verificar_modelo=1` es opcional porque hace una llamada de red; sin él el
healthcheck responde en milisegundos, que es lo que Railway necesita.

El healthcheck devuelve 200 aunque el modelo esté caído. Es deliberado: si
devolviera error, Railway reiniciaría en bucle un servicio que está sano —el
modelo vive en otra máquina y reiniciar no lo arregla.

### El catálogo de Groq cambia

Un modelo que funcionaba puede desaparecer, y entonces **todas** las consultas
dan 404 con un mensaje que no explica la causa. Pasó el 02-09-2026 con
`llama-3.3-70b-versatile`.

Si el asistente empieza a fallar de golpe sin haber tocado nada:

```bash
curl -H "Authorization: Bearer $GROQ_API_KEY" https://api.groq.com/openai/v1/models
```

y se cambia `VSV_AI_MODELO` por uno de la lista.

---

## Problemas frecuentes

**Railway despliega el backend de Node en vez de VSV AI**
Falta el Root Directory en `vsv-ai`.

**El panel da error de CORS**
El origen de Vercel no está en `ORIGENES_PERMITIDOS`. Van separados por coma,
sin barra al final.

**Todas las consultas responden «no tienes acceso»**
`VSV_API_URL` mal escrita, o el backend de VSV PRO no acepta el origen. VSV AI
reenvía la sesión del usuario en `x-session-id`; si esa cabecera no llega, la API
responde 401.

**El asistente responde pero sin datos**
El modelo está eligiendo mal la herramienta. Es lo que mide el benchmark: correr
`evaluation/runner.py` con el modelo en uso y mirar la categoría
`seleccion_de_herramienta`.

---

## Antes de dar por cerrado

- [ ] `/salud` responde con `modelo_alcanzable: true`
- [ ] El benchmark se corrió y el modelo elegido no quedó vetado
- [ ] `ORIGENES_PERMITIDOS` tiene el dominio real de Vercel
- [ ] `RAILWAY_ENVIRONMENT=production` (oculta `/docs`)
- [ ] Una consulta real desde VSV PRO devuelve una cifra correcta
- [ ] Un usuario con permisos recortados recibe «no tienes acceso», no un dato

Esa última prueba es la que hay que hacer con una cuenta real de menor
privilegio. El aislamiento lo aplica la API de VSV PRO, pero conviene verlo
funcionando de punta a punta antes de abrirlo al equipo.
