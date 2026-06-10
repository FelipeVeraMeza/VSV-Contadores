# Integración WhatsApp — Diseño / Arquitectura

> Estado: **DISEÑO**. No implementado. El SQL de este documento es propuesta, **no** una migración para correr todavía.
> Proveedor de WhatsApp: **por definir**. Proveedor de IA: **por definir**.
> Fecha: 2026-06-10

## 1. Requisitos (lo pedido)

| # | Requisito | Cómo lo resuelve el diseño |
|---|-----------|----------------------------|
| 1 | Abrir conversación dentro de la plataforma | Vista de chat en el CRM (lista + panel de mensajes) |
| 2 | Mantener historial de conversaciones | Tablas `whatsapp_conversacion` + `whatsapp_mensaje` |
| 3 | Permitir uso de plantillas | Tabla `whatsapp_plantilla` + selector al redactar |
| 4 | Registrar mensajes enviados y recibidos | `whatsapp_mensaje.direccion` ('in'/'out') + estado de entrega |
| 5 | Apartado para tareas y notas | Tabla `tarea` + reuso de `bitacora_gestion` (notas/tickets) enlazadas a la conversación |
| 6 | IA genera notas de conversaciones importantes y tickets | Módulo `aiService` (provider-agnóstico) que resume → nota y detecta → ticket |

## 2. Decisión clave pendiente: proveedor de WhatsApp

Toda la integración cuelga de esto. Resumen para decidir:

| Proveedor | Costo | Setup | Riesgo | Notas |
|-----------|-------|-------|--------|-------|
| **whatsapp-web.js (QR)** | Gratis | Bajo (escanear QR) | Alto (contra ToS, frágil, 1 sesión, corre Chromium en el server) | Rápido para pyme/MVP |
| **Meta WhatsApp Cloud API** | Por conversación | Alto (Meta Business, número dedicado, plantillas aprobadas, webhook HTTPS) | Bajo | Oficial y escalable |
| **Twilio WhatsApp** | Por mensaje | Medio | Bajo | Oficial, integración más simple que Meta directo |

**Implicancia técnica común a los oficiales (Meta/Twilio):** se necesita un **webhook público HTTPS** para recibir mensajes entrantes (hoy el server corre en `:4000` sin exponer). whatsapp-web.js no necesita webhook (recibe por eventos del socket), pero exige un proceso persistente con navegador headless.

## 3. Arquitectura: capa de proveedor (adapter)

Para no atarnos a un proveedor, todo pasa por una interfaz. Cambiar de proveedor = cambiar el adapter, no el resto del sistema.

```
                ┌─────────────────────────────────────┐
   UI Chat ───► │  Controllers /whatsapp/*            │
                └──────────────┬──────────────────────┘
                               │
                ┌──────────────▼──────────────┐
                │  whatsappService (núcleo)    │  ← persiste en BD, dispara IA
                └──────────────┬──────────────┘
                               │  usa interfaz WhatsAppProvider
        ┌──────────────────────┼───────────────────────┐
        ▼                      ▼                         ▼
 WhatsAppWebJsProvider   MetaCloudProvider        TwilioProvider
 (QR, socket events)     (REST + webhook)         (REST + webhook)
```

### Interfaz `WhatsAppProvider`
```js
// src/services/whatsapp/WhatsAppProvider.js  (contrato)
//   sendText(to, body)                  -> { waMessageId }
//   sendTemplate(to, plantilla, vars)   -> { waMessageId }
//   sendMedia(to, url, tipo, caption)   -> { waMessageId }
//   normalizeInbound(payloadCrudo)      -> { from, tipo, cuerpo, mediaUrl, waMessageId, timestamp }
//   onStatusUpdate(payloadCrudo)        -> { waMessageId, estado }   // entregado/leído/error
```
- **Entrantes (oficiales):** el webhook recibe → `normalizeInbound` → `whatsappService.registrarEntrante(...)`.
- **Entrantes (whatsapp-web.js):** el listener `client.on('message')` → mismo flujo.

## 4. Modelo de datos (PROPUESTA — no ejecutar aún)

```sql
-- Conversaciones (un hilo por contacto/teléfono)
CREATE TABLE whatsapp_conversacion (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      uuid REFERENCES empresa(id) ON DELETE SET NULL,  -- null si el contacto aún no es cliente
    telefono        varchar(30) NOT NULL,
    nombre_contacto varchar(255),
    estado          varchar(20) DEFAULT 'abierta',   -- abierta | cerrada | archivada
    asignado_a      uuid REFERENCES usuario(id) ON DELETE SET NULL,
    no_leidos       integer DEFAULT 0,
    ultimo_mensaje_preview text,
    ultimo_mensaje_at timestamptz,
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now(),
    UNIQUE (telefono)
);

-- Mensajes (entrantes y salientes)
CREATE TABLE whatsapp_mensaje (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversacion_id uuid NOT NULL REFERENCES whatsapp_conversacion(id) ON DELETE CASCADE,
    direccion       varchar(3) NOT NULL,             -- 'in' | 'out'
    tipo            varchar(20) DEFAULT 'text',       -- text | image | document | audio | template
    cuerpo          text,
    media_url       text,
    wa_message_id   varchar(128),                     -- id del proveedor (idempotencia)
    estado          varchar(20) DEFAULT 'enviado',    -- pendiente|enviado|entregado|leido|error
    enviado_por     uuid REFERENCES usuario(id) ON DELETE SET NULL,  -- null si entrante
    es_ia           boolean DEFAULT false,            -- si lo generó/sugirió la IA
    timestamp       timestamptz DEFAULT now(),
    created_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_wa_msg_conv ON whatsapp_mensaje (conversacion_id, timestamp);
CREATE UNIQUE INDEX idx_wa_msg_waid ON whatsapp_mensaje (wa_message_id) WHERE wa_message_id IS NOT NULL;

-- Plantillas reutilizables
CREATE TABLE whatsapp_plantilla (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre          varchar(100) NOT NULL,
    categoria       varchar(50),
    contenido       text NOT NULL,                    -- con placeholders {{1}}, {{nombre}}
    variables       jsonb,                            -- definición de variables
    proveedor_template_id varchar(128),               -- id de plantilla aprobada (Meta/Twilio)
    aprobada        boolean DEFAULT false,
    activa          boolean DEFAULT true,
    created_at      timestamptz DEFAULT now()
);

-- Tareas (apartado solicitado), opcionalmente ligadas a una conversación
CREATE TABLE tarea (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      uuid REFERENCES empresa(id) ON DELETE CASCADE,
    conversacion_id uuid REFERENCES whatsapp_conversacion(id) ON DELETE SET NULL,
    titulo          varchar(255) NOT NULL,
    descripcion     text,
    estado          varchar(20) DEFAULT 'pendiente',  -- pendiente | en_proceso | hecha
    prioridad       varchar(10) DEFAULT 'media',       -- baja | media | alta
    asignado_a      uuid REFERENCES usuario(id) ON DELETE SET NULL,
    vence_at        timestamptz,
    creado_por      uuid REFERENCES usuario(id) ON DELETE SET NULL,
    es_ia           boolean DEFAULT false,
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

-- Notas y tickets: REUSAR bitacora_gestion (ya existe con tipo_mensaje).
-- Solo se le enlaza la conversación de origen y se marca si lo generó la IA.
ALTER TABLE bitacora_gestion ADD COLUMN IF NOT EXISTS conversacion_id uuid REFERENCES whatsapp_conversacion(id) ON DELETE SET NULL;
ALTER TABLE bitacora_gestion ADD COLUMN IF NOT EXISTS es_ia boolean DEFAULT false;
```

> Decisión de diseño: **notas y tickets NO tienen tabla nueva** — se apoyan en `bitacora_gestion` (`tipo_mensaje` = 'conversacion' | 'ticket'), que ya construimos en la ficha del cliente. Así el historial del cliente y el de WhatsApp quedan unificados.

## 5. Módulo de IA (provider-agnóstico)

```
aiService.analizarConversacion(conversacionId) =>
   1. Trae los últimos N mensajes del hilo
   2. Llama a LLMProvider.complete(prompt)  // Claude / OpenAI según config
   3. Devuelve {
        resumen,                 // texto → se guarda como nota (bitacora tipo 'conversacion', es_ia=true)
        crearTicket: bool,
        ticket: { asunto, prioridad },   // si aplica → bitacora tipo 'ticket', es_ia=true
        crearTarea: bool,
        tarea: { titulo, vence_at }      // opcional
      }
```
- **Interfaz `LLMProvider.complete(systemPrompt, mensajes)`** → adapters `AnthropicProvider` / `OpenAIProvider`. Se enchufa cuando se defina el proveedor + API key (variable de entorno).
- **Disparadores:** (a) manual con botón "Analizar con IA"; (b) automático: job tras cerrar la conversación o cada X mensajes nuevos.
- **Importante:** la IA *sugiere* nota/ticket; el usuario confirma antes de guardar (evita ruido). Configurable a automático.

## 6. Endpoints (propuesta)

```
GET    /api/whatsapp/conversaciones                 lista (con no_leidos, último mensaje)
GET    /api/whatsapp/conversaciones/:id/mensajes     historial del hilo
POST   /api/whatsapp/conversaciones/:id/mensajes     enviar (texto o plantilla)
PATCH  /api/whatsapp/conversaciones/:id              estado/asignación/marcar leído
POST   /api/whatsapp/webhook                         recepción entrante (oficiales) — PÚBLICO
GET    /api/whatsapp/plantillas                      catálogo
POST   /api/whatsapp/conversaciones/:id/analizar-ia  dispara análisis IA
# Tareas
GET    /api/tareas      POST /api/tareas      PATCH /api/tareas/:id
```
Tiempo real opcional: WebSocket/SSE para que entren mensajes sin recargar (fase posterior; al inicio basta con polling).

## 7. UI — mockup

```
 CRM ▸ WhatsApp
┌───────────────┬──────────────────────────────────┬──────────────────────┐
│ Conversaciones│  ACME SpA  · +56 9 1234 5678       │  Tareas / Notas / IA │
│ [buscar...]   │ ─────────────────────────────────  │ ──────────────────── │
│ ● ACME SpA  3 │  ‹ Hola, necesito el F29     09:12  │ [✨ Analizar con IA] │
│   Juan Pérez  │           Claro, lo reviso › 09:15  │                      │
│   Constru...  │  ‹ ¿Para cuándo?            09:16   │ Notas (IA)           │
│   ...         │                                     │ · Cliente pide F29.. │
│               │ ─────────────────────────────────  │                      │
│               │ [Plantilla ▾] [escribe...]  [Enviar]│ Tickets              │
│               │                                     │ ⚠ F29 pendiente (alta)│
│               │                                     │ [+ Nueva tarea]      │
└───────────────┴──────────────────────────────────┴──────────────────────┘
```

## 8. Roadmap por fases

- **Fase 0 — Esqueleto (sin proveedor):** tablas, interfaz `WhatsAppProvider`, vista de chat con datos mock, plantillas y tareas CRUD. Funciona end-to-end con un "MockProvider".
- **Fase 1 — Proveedor real:** implementar el adapter elegido (envío + recepción) y persistencia real del historial. (Requiere: credenciales / QR / webhook según proveedor.)
- **Fase 2 — Plantillas:** envío de plantillas (y aprobación Meta/Twilio si aplica).
- **Fase 3 — Tareas y notas manuales** ligadas a la conversación.
- **Fase 4 — IA:** `LLMProvider` + análisis (resumen→nota, detección→ticket), primero manual y luego automático.

## 9. Para arrancar necesito de tu parte

1. **Proveedor de WhatsApp** (whatsapp-web.js / Meta / Twilio) — y si es oficial, cómo expondremos el **webhook HTTPS**.
2. **Número** que se usará (¿dedicado o el actual del estudio?).
3. **Proveedor de IA + API key** (Claude/OpenAI) cuando lleguemos a Fase 4.
4. ¿La IA **sugiere y el usuario confirma**, o crea notas/tickets **automático**?
```
