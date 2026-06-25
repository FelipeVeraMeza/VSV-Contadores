# CRM PYME — Fase 0: Estudio de integraciones (WhatsApp / Correo / IA)

> Estado: **ESTUDIO / DISEÑO**. Comparativa para decidir proveedores. No implementa nada.
> Fecha: 2026-06-25
> ⚠️ Los precios son **referenciales** y cambian con frecuencia: verificar en el sitio oficial de cada proveedor antes de contratar.

---

## 1. WhatsApp

Dos familias: **oficiales** (API de WhatsApp Business — legales, estables, requieren número dedicado + aprobación de plantillas + webhook HTTPS) y **no oficiales** (automatizan WhatsApp Web vía QR — gratis e inmediatos, pero **contra los Términos de Servicio de Meta**, con riesgo de bloqueo del número).

| Proveedor | Tipo | Costo aprox. | Riesgo bloqueo | Escalabilidad | Notas |
|---|---|---|---|---|---|
| **Meta Cloud API** (directo) | Oficial | Gratis el software; Meta cobra por conversación/plantilla | Muy bajo | Alta | Requiere Meta Business verificado, número dedicado, webhook HTTPS. Más setup, pero es la fuente. |
| **Twilio** | Oficial (BSP) | Markup sobre Meta + fee por mensaje | Muy bajo | Alta | Integración muy documentada, soporte. Más caro que Meta directo. |
| **360dialog** | Oficial (BSP) | Tarifa mensual + costos Meta (sin markup por msg) | Muy bajo | Alta | Popular en LATAM/Europa; suele salir más barato a volumen que Twilio. |
| **WATI** | Oficial (sobre Meta) + UI | Suscripción mensual (planes) | Muy bajo | Media/Alta | Trae bandeja de entrada, plantillas y automatizaciones ya hechas (menos desarrollo). |
| **Evolution API** | No oficial (self-host) | Gratis (open source) + tu servidor | **Alto** | Media | API self-hosted sobre WhatsApp Web; flexible pero frágil y contra ToS. |
| **Baileys** | No oficial (librería) | Gratis (open source) | **Alto** | Baja/Media | Librería Node (WebSocket). Máximo control, máxima fragilidad/mantención. |
| **whatsapp-web.js** | No oficial (QR/Chromium) | Gratis | **Alto** | Baja | Corre un Chromium headless; 1 sesión por número. Bueno para MVP. |

**Implicancia técnica común a los oficiales:** necesitan un **webhook público HTTPS** para recibir mensajes (hoy el server corre en `:4000` sin exponer). Habría que exponerlo (dominio + TLS, o un túnel/reverse proxy).

**Recomendación:**
- **MVP rápido / bajo presupuesto:** whatsapp-web.js o Evolution API, **asumiendo el riesgo de bloqueo** (usar un número que no sea el principal del estudio).
- **Producción seria:** **Meta Cloud API directo** (si hay quien haga el setup) o **360dialog** (más simple, buen precio a volumen). **WATI** si se quiere menos desarrollo y una bandeja lista.

---

## 2. Correo electrónico

Separar dos necesidades: **enviar** (transaccional/saliente) y **leer respuestas** (entrante, para historial e IA).

| Proveedor | Enviar | Leer respuestas | Costo aprox. | Notas |
|---|---|---|---|---|
| **SMTP genérico (Gmail/M365 del estudio)** | ✅ | ✅ vía IMAP | Incluido en la cuenta | Lo más rápido para *enviar* (con app password / OAuth). Leer respuestas por IMAP es simple pero limitado a volumen bajo. |
| **Gmail API** | ✅ | ✅ (hilos, labels) | Gratis (cuotas) | OAuth Google; ideal si el estudio usa Gmail/Workspace. Da hilos completos para historial e IA. |
| **Microsoft 365 (Graph API)** | ✅ | ✅ | Incluido en licencia M365 | Equivalente a Gmail API si usan Outlook/M365. |
| **SendGrid** | ✅ (gran volumen) | Parcial (Inbound Parse) | Plan gratis + pago por volumen | Fuerte en envío masivo y entregabilidad; lectura entrante vía Inbound Parse (webhook). |
| **Mailgun** | ✅ | ✅ (routes/inbound) | Pago por volumen | Similar a SendGrid; buen manejo de entrante. |
| **Amazon SES** | ✅ (muy barato) | ✅ (vía S3/SNS) | El más barato a volumen | Setup más técnico (AWS); excelente costo. |

**Recomendación:**
- **Para empezar y ver resultado rápido:** **SMTP** (enviar) con la cuenta del estudio. Es lo más fácil de conectar (nodemailer ya encaja con el stack actual).
- **Para historial + respuestas + IA bien hecho:** **Gmail API** o **Microsoft Graph**, según qué use el estudio. Dan los hilos completos, que es lo que la IA necesita para resumir conversaciones.

---

## 3. Inteligencia Artificial (enriquecimiento de datos, notas y tickets)

Tarea: leer texto de WhatsApp/correo/formularios y **extraer** (nombre, teléfono, correo, RUT, dirección, rubro, servicios, intereses) + **resumir** conversaciones en notas y **detectar** tickets. Son tareas de extracción/clasificación → no requieren el modelo más caro.

| Proveedor | Modelos | Precio referencial (USD / 1M tokens) | Notas |
|---|---|---|---|
| **Anthropic (Claude)** | Opus 4.8 | $5 entrada / $25 salida | Máxima capacidad |
| | Sonnet 4.6 | $3 / $15 | Mejor equilibrio calidad/costo |
| | **Haiku 4.5** | **$1 / $5** | **El más económico — ideal para extracción/clasificación de alto volumen** |
| **OpenAI (GPT)** | Familia GPT | Verificar (varía por modelo) | Ecosistema amplio |
| **Google AI (Gemini)** | Familia Gemini | Verificar | Buen costo; integra con Google Workspace |
| **Azure AI** | Modelos OpenAI en Azure | Verificar | Útil si ya hay infra Microsoft/M365 |

> Precios de Anthropic según la referencia oficial del SDK (cacheada 2026-06-04). Para OpenAI/Google/Azure verificar el pricing vigente — cambia seguido.

**Recomendación:**
- **Claude Haiku 4.5** para el grueso del enriquecimiento (extracción de datos, clasificación) por costo; **Sonnet 4.6** para resúmenes de conversaciones donde se quiera más calidad.
- **Patrón de uso (principio rector):** la IA **sugiere** los datos/notas/tickets y el usuario **valida** antes de guardar. Nada se persiste automáticamente sin posibilidad de corrección, y queda marcado con `es_ia = true` para trazabilidad.
- Si el estudio ya está en el ecosistema Microsoft (M365), **Azure AI** simplifica facturación y cumplimiento; si están en Google Workspace, **Gemini** encaja con Gmail.

---

## 4. Resumen de decisiones a tomar

| Tema | Opción rápida (MVP) | Opción producción |
|---|---|---|
| WhatsApp | whatsapp-web.js / Evolution (riesgo ToS) | Meta Cloud API / 360dialog / WATI |
| Correo | SMTP de la cuenta del estudio | Gmail API / Microsoft Graph |
| IA | Claude Haiku 4.5 | Haiku 4.5 + Sonnet 4.6 (según tarea) |
| Webhook HTTPS | No requerido (whatsapp-web.js) | Requerido (exponer server con dominio + TLS) |

**Lo único que necesito de ti para cerrar Fase 0:**
1. ¿El estudio usa **Gmail/Workspace** o **Microsoft/M365**? (define el camino de correo e IA).
2. Para WhatsApp, ¿se prioriza **rapidez/bajo costo** (no oficial) o **estabilidad/legalidad** (oficial)?
3. ¿Hay un **número de WhatsApp dedicado** disponible, o se usaría el actual del estudio?
