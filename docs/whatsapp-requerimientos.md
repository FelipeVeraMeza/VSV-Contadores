# WhatsApp en el CRM — Requerimientos (estado real, implementado)

> Estado: **FUNCIONANDO en local (Fase 1)**. Conexión por QR (Baileys) + respuesta
> automática con IA (Google Gemini). Persistencia de conversaciones en memoria.
> Fecha: 2026-07-15

## 0. Resumen de la arquitectura

```
 Navegador (CRM)                Servidor Express (:4000)               WhatsApp / IA
 ┌─────────────────┐  HTTP     ┌──────────────────────────┐
 │ WhatsappPanel   │ ───────▶  │ routes/whatsapp.routes   │
 │  (polling)      │           │ controllers/whatsapp     │
 └─────────────────┘           │ services/whatsapp/       │
        ▲                      │   whatsappBot.js (Baileys)│ ◀──WebSocket──▶ WhatsApp
        │  JSON                │   ia.js (Gemini)          │ ◀──REST──▶ Google AI
        └──────────────────────┤   conocimiento.js         │
                               └──────────────────────────┘
```

- **Proveedor WhatsApp:** `@whiskeysockets/baileys` (QR, sin Chromium).
- **Proveedor IA:** `@google/genai` (Gemini `gemini-3.1-flash-lite`, capa gratis).
- **Sesión WhatsApp:** carpeta `whatsapp_auth/` (gitignored).
- **Conversaciones / historial IA:** en memoria (se pierden al reiniciar el server).

---

## 1. Requerimientos Funcionales (RF)

| # | Requerimiento | Estado |
|---|---------------|--------|
| RF-01 | **Conectar por QR** desde el CRM: botón "Conectar" que muestra el QR como imagen en el navegador. | ✅ |
| RF-02 | **Mostrar estado de conexión** (desconectado / conectando / qr / conectado) mediante polling cada 3 s. | ✅ |
| RF-03 | **Reconexión automática** ante caídas de red (incluye el código 515 "restartRequired" tras escanear). | ✅ |
| RF-04 | **Listar conversaciones** con nombre, teléfono, último mensaje, hora, no leídos; ordenadas por más reciente. | ✅ |
| RF-05 | **Buscar** conversaciones por nombre o teléfono. | ✅ |
| RF-06 | **Ver el historial** de una conversación: mensajes entrantes/salientes, hora y estado de entrega. | ✅ |
| RF-07 | **Recibir mensajes entrantes** y reflejarlos casi en tiempo real (polling cada 3 s). | ✅ |
| RF-08 | **Enviar mensajes manuales** desde el panel. | ✅ |
| RF-09 | **Responder automáticamente con IA** (Gemini): genera y envía la respuesta al cliente. | ✅ |
| RF-10 | **Toggle global de IA**: activar/pausar la auto-respuesta para todos los chats. | ✅ |
| RF-11 | **Toggle de IA por conversación**: silenciar la IA en un chat para que un humano tome el control. | ✅ |
| RF-12 | **Plantillas** de mensajes rápidos con reemplazo de `{nombre}`. | ✅ |
| RF-13 | **Marcar como leído** al abrir una conversación (resetea el contador). | ✅ |
| RF-14 | **Comando `/reiniciar`**: el cliente puede reiniciar el hilo de la IA. | ✅ |
| RF-15 | **Base de conocimiento configurable** (`conocimiento.js`) que la IA usa como fuente. | ✅ (contenido pendiente de llenar) |
| RF-16 | **Manejo de mensajes no-texto**: responde pidiendo que lo escriban. | ✅ |
| RF-17 | **Cola por remitente**: serializa respuestas para no desordenar el historial. | ✅ |
| RF-18 | **Solo chats 1-a-1**: ignora grupos, estados, canales y los mensajes propios. | ✅ |
| RF-19 | **Autenticación**: todos los endpoints exigen sesión válida (`requireSession`). | ✅ |

### Endpoints
```
GET   /api/whatsapp/estado                         estado + QR
POST  /api/whatsapp/iniciar                         arranca/reusa la sesión
GET   /api/whatsapp/conversaciones                  lista
GET   /api/whatsapp/conversaciones/:jid/mensajes    historial (marca leído)
POST  /api/whatsapp/conversaciones/:jid/mensajes    enviar manual
PATCH /api/whatsapp/auto                             toggle IA global
PATCH /api/whatsapp/conversaciones/:jid/auto         toggle IA por chat
```

---

## 2. Requerimientos No Funcionales (RNF)

| # | Categoría | Requerimiento | Estado |
|---|-----------|---------------|--------|
| RNF-01 | Seguridad | Endpoints protegidos por sesión (`requireSession` contra la BD). | ✅ |
| RNF-02 | Seguridad | Secretos en `.env` (gitignored); `whatsapp_auth/` gitignored (no se sube la sesión). | ✅ |
| RNF-03 | Rendimiento | Respuestas de IA rápidas: modelo flash-lite, sin "thinking", `max_tokens` acotado. | ✅ |
| RNF-04 | Costo | Gemini capa gratis; historial acotado a 20 turnos; prompt de sistema cacheable. | ✅ |
| RNF-05 | Disponibilidad | Reconexión automática; el server arranca aunque falte la key de IA (init perezoso). | ✅ |
| RNF-06 | Robustez | Un error de IA no tumba el proceso (se captura en la cola); el chat sigue vivo. | ✅ |
| RNF-07 | Portabilidad | Proveedor de IA intercambiable: la interfaz `responder()/olvidar()` permitió cambiar OpenAI → Claude → Gemini tocando solo `ia.js`. | ✅ |
| RNF-08 | Eficiencia | Sin Chromium: Baileys usa WebSocket → server liviano. | ✅ |
| RNF-09 | Mantenibilidad | Capas separadas: motor / controlador / rutas / servicio front / UI. | ✅ |
| RNF-10 | Usabilidad | UI responsiva, estados claros, auto-scroll, indicadores de conexión e IA. | ✅ |
| RNF-11 | Persistencia | Sesión de WhatsApp en disco (`whatsapp_auth/`): sobrevive reinicios locales. | ✅ |

---

## 3. Limitaciones conocidas / Deuda técnica

| # | Limitación | Impacto | Solución propuesta |
|---|-----------|---------|--------------------|
| L-01 | **Conversaciones y mensajes en memoria** (no BD). | Se pierden al reiniciar el server. | Crear tablas `whatsapp_conversacion` / `whatsapp_mensaje` en Postgres (ya diseñadas en `whatsapp-integracion-diseno.md`). |
| L-02 | **Sesión efímera en Railway.** El filesystem de Railway se borra en cada redeploy. | Hay que re-escanear el QR tras cada deploy. | Guardar las credenciales de Baileys en la BD en vez de en `whatsapp_auth/`. |
| L-03 | **1 sola sesión / número por proceso.** | No multi-número ni multi-tenant. | Fuera de alcance por ahora. |
| L-04 | **Tiempo real por polling** (cada 3-4 s), no push. | Pequeño retraso al recibir. | Migrar a WebSocket/SSE (fase posterior). |
| L-05 | **`conocimiento.js` con placeholders.** | La IA solo sabe datos genéricos. | Llenar con info real de VSV (servicios, precios, horarios, FAQ). |
| L-06 | **IA sugiere → no hay flujo de notas/tickets automáticos** (estaba en el diseño). | Funcionalidad futura. | Implementar en fase de IA avanzada. |
| L-07 | **Uso de whatsapp-web.js "no oficial".** Baileys va contra los ToS de WhatsApp. | Riesgo de baneo del número (bajo para volumen pyme). | Migrar a Meta Cloud API / Twilio si se requiere oficialidad. |

---

## 4. Configuración requerida

- **`.env`** (local y Railway): `GEMINI_API_KEY=...` (gratis en https://aistudio.google.com/apikey).
- **Modelo IA:** constante `MODELO` en `src/services/whatsapp/ia.js`.
- **Conocimiento:** editar `src/services/whatsapp/conocimiento.js`.
- **Arranque local:** `npm run start:all` (backend :4000 + frontend :3000). Node no recarga solo: reiniciar tras cambiar código del servidor.
