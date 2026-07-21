# WhatsApp en el CRM — Requerimientos (estado real, implementado)

> Estado: **FUNCIONANDO (Fase 2)**. Multi-WhatsApp por QR (Baileys) + respuesta
> automática con IA (Google Gemini). **Todo persistido en Postgres** (conversaciones,
> mensajes, credenciales y conocimiento). Acceso por rol.
> Fecha: 2026-07-16

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

- **Proveedor WhatsApp:** `@whiskeysockets/baileys` (QR, sin Chromium). N sesiones en paralelo.
- **Proveedor IA:** `@google/genai` (Gemini `gemini-3.1-flash-lite`, capa gratis).
- **Sesión WhatsApp:** tabla `whatsapp_credencial` (sobrevive redeploys de Railway).
- **Conversaciones / mensajes:** tablas `whatsapp_conversacion` / `whatsapp_mensaje`.
- **Historial de la IA:** se reconstruye desde los mensajes de la BD (una sola fuente de verdad).

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
| RF-10 | **Toggle de IA por número**: activar/pausar la auto-respuesta de toda una sesión. | ✅ |
| RF-11 | **Toggle de IA por conversación**: silenciar la IA en un chat para que un humano tome el control. | ✅ |
| RF-12 | **Plantillas** de mensajes rápidos con reemplazo de `{nombre}`. | ✅ |
| RF-13 | **Marcar como leído** al abrir una conversación (resetea el contador). | ✅ |
| RF-14 | **Comando `/reiniciar`**: el cliente reinicia el hilo de la IA. No borra el chat: marca `ia_reset_at` y la IA solo lee lo posterior. | ✅ |
| RF-15 | **Base de conocimiento configurable en BD** (`whatsapp_conocimiento` + `whatsapp_ia_config`); si está vacía, cae al archivo `conocimiento.js`. | ✅ (contenido pendiente de cargar) |
| RF-16 | **Manejo de mensajes no-texto**: responde pidiendo que lo escriban. | ✅ |
| RF-17 | **Cola por remitente**: serializa respuestas para no desordenar el historial. | ✅ |
| RF-18 | **Solo chats 1-a-1**: ignora grupos, estados, canales y los mensajes propios. | ✅ |
| RF-19 | **Autenticación**: todos los endpoints exigen sesión válida (`requireSession`). | ✅ |
| RF-20 | **Multi-WhatsApp**: varias sesiones/números en paralelo, cada una con su QR y estado. | ✅ |
| RF-21 | **Acceso por rol**: Administrador ve todas las sesiones de su organización; Cliente solo la de su empresa. | ✅ |
| RF-22 | **Crear / eliminar números** (solo Administrador). | ✅ |
| RF-23 | **Persistencia total en Postgres** (conversaciones, mensajes, credenciales, conocimiento). | ✅ |
| RF-24 | **Reconexión al arrancar el servidor** de las sesiones ya vinculadas. | ✅ |
| RF-25 | **Vincular conversación ↔ empresa** cruzando el teléfono contra `empresa.whatsapp` / `telefono_corporativo`. Si el número está en 2 empresas, no adivina. | ✅ |

### Endpoints
```
GET    /api/whatsapp/sesiones                        listar (según el rol)
POST   /api/whatsapp/sesiones                        crear número          [Admin]
GET    /api/whatsapp/sesiones/:id/estado             estado + QR
POST   /api/whatsapp/sesiones/:id/iniciar            conectar
POST   /api/whatsapp/sesiones/:id/cerrar             desvincular
DELETE /api/whatsapp/sesiones/:id                    eliminar (baja lógica) [Admin]
PATCH  /api/whatsapp/sesiones/:id/auto               toggle IA del número
GET    /api/whatsapp/sesiones/:id/conversaciones     lista de chats
GET    /api/whatsapp/conversaciones/:convId/mensajes historial (marca leído)
POST   /api/whatsapp/conversaciones/:convId/mensajes enviar manual
PATCH  /api/whatsapp/conversaciones/:convId/auto     toggle IA del chat
```

---

## 2. Requerimientos No Funcionales (RNF)

| # | Categoría | Requerimiento | Estado |
|---|-----------|---------------|--------|
| RNF-01 | Seguridad | Endpoints protegidos por sesión (`requireSession`) **+ autorización por alcance**: para un Cliente no se confía en el header `x-company-id` (lo manda el navegador), se resuelve su empresa contra la BD. | ✅ |
| RNF-02 | Seguridad | Secretos fuera del repositorio. | ❌ **INCUMPLIDO** — ver L-09: el `.env` está en el historial de GitHub. |
| RNF-03 | Rendimiento | Respuestas de IA rápidas: modelo flash-lite, sin "thinking", `max_tokens` acotado. | ✅ |
| RNF-04 | Costo | Gemini capa gratis; historial acotado a 20 turnos; prompt de sistema cacheable. | ✅ |
| RNF-05 | Disponibilidad | Reconexión automática; el server arranca aunque falte la key de IA (init perezoso). | ✅ |
| RNF-06 | Robustez | Un error de IA no tumba el proceso (se captura en la cola); el chat sigue vivo. | ✅ |
| RNF-07 | Portabilidad | Proveedor de IA intercambiable: la interfaz `responder({historial, mensaje, conocimiento})` permitió cambiar OpenAI → Claude → Gemini tocando solo `ia.js`. | ✅ |
| RNF-08 | Eficiencia | Sin Chromium: Baileys usa WebSocket → server liviano. | ✅ |
| RNF-09 | Mantenibilidad | Capas separadas: motor (`whatsappBot`) / datos (`whatsappRepo`) / controlador / rutas / servicio front / UI. Ningún SQL fuera del repositorio. | ✅ |
| RNF-10 | Usabilidad | UI responsiva, estados claros, auto-scroll, indicadores de conexión e IA. | ✅ |
| RNF-11 | Persistencia | Sesión de WhatsApp en BD (`whatsapp_credencial`): sobrevive reinicios **y redeploys**. | ✅ |
| RNF-12 | Integridad | Sin mensajes duplicados: índice único sobre `wa_message_id`; la IA no responde dos veces al mismo mensaje. | ✅ |
| RNF-13 | Trazabilidad | Cada mensaje saliente registra si lo generó la IA (`es_ia`) y qué usuario lo envió (`enviado_por`). | ✅ |

---

## 3. Limitaciones conocidas / Deuda técnica

| # | Limitación | Impacto | Solución propuesta |
|---|-----------|---------|--------------------|
| ~~L-01~~ | ~~Conversaciones y mensajes en memoria~~ | — | ✅ **RESUELTO**: tablas `whatsapp_conversacion` / `whatsapp_mensaje`. |
| ~~L-02~~ | ~~Sesión efímera en Railway~~ | — | ✅ **RESUELTO**: credenciales en `whatsapp_credencial`. |
| ~~L-03~~ | ~~1 sola sesión por proceso~~ | — | ✅ **RESUELTO**: gestor multi-sesión. |
| L-04 | **Tiempo real por polling** (cada 3-4 s), no push. | Pequeño retraso al recibir. | Migrar a WebSocket/SSE (fase posterior). |
| L-05 | **Conocimiento sin cargar.** Las tablas existen pero están vacías; la IA cae al `conocimiento.js` de ejemplo. | La IA solo sabe datos genéricos. | Cargar filas reales en `whatsapp_conocimiento`. |
| L-06 | **No hay notas/tickets automáticos con IA** (estaba en el diseño). | Funcionalidad futura. | Implementar en fase de IA avanzada. |
| L-07 | **Baileys es "no oficial"**: va contra los ToS de WhatsApp. | Riesgo de baneo del número (bajo para volumen pyme). | Migrar a Meta Cloud API / Twilio si se requiere oficialidad. |
| **L-08** | **Sin lock multi-instancia.** Si Railway escala a 2+ instancias, ambas intentarían conectar la misma sesión. | Conflicto de sesiones. | Lock en BD (`SELECT ... FOR UPDATE`) o fijar 1 sola instancia. |
| **L-09** | **`RNF-02` incumplido hoy**: el `.env` (contraseña de Postgres, `ENCRYPTION_KEY`, claves SII/Gmail) está en el historial de GitHub. | Filtración de credenciales. | Rotar TODAS las credenciales + purgar el historial (BFG / `git filter-repo`). |

---

## 4. Configuración requerida

- **`.env`** (local y Railway): `GEMINI_API_KEY=...` (gratis en https://aistudio.google.com/apikey).
- **Modelo IA:** `MODELO_POR_DEFECTO` en `src/services/whatsapp/ia.js`, o por organización en `whatsapp_ia_config.modelo`.
- **Conocimiento:** filas en `whatsapp_conocimiento` (respaldo: `src/services/whatsapp/conocimiento.js`).
- **Migraciones:** `2026-07-16_whatsapp_multisesion.sql` y `2026-07-16_whatsapp_fixes.sql`.
- **Arranque local:** `npm run start:all` (backend :4000 + frontend :3000). Node no recarga solo: reiniciar tras cambiar código del servidor.
