# 🗣️ Preguntas para la reunión con jefaturas

> Preguntas de negocio para levantar decisiones y prioridades sobre CRM, Contabilidad y Facturador.
> Marcadas con ⭐ las de mayor impacto.

---

## 🟣 CRM

- ⭐ **¿Qué define exactamente cada estado del cliente?** ¿"Suspendido" es por no pago, por decisión del cliente, o ambos? ¿Qué debe pasar automáticamente cuando alguien deja de pagar?
- **¿Quién puede crear/editar clientes?** ¿Solo el equipo, o el cliente puede auto-registrarse / completar su propia ficha?
- ¿Qué datos son **obligatorios** para considerar una ficha "completa"? (hoy se mide sobre 10 campos)
- ¿Manejan **prospectos/leads** antes de que sean clientes? ¿Con qué etapas?
- ¿Usan de verdad **WhatsApp y Correo** desde el CRM, o son informativos? ¿Quieren integrarlos en serio?
- ⭐ **¿Qué métricas quieren ver primero?** (clientes al día, morosidad, DTs atrasados, ingresos por plan…)
- ¿Los **planes y servicios** los define jefatura? ¿Con qué precios y reglas?

## 🟢 Contabilidad

- ⭐ **¿Qué reportes son los críticos** del mes a mes? (F29, libro compras/ventas, honorarios, balance…)
- ¿La **sincronización con el SII** (traer compras/ventas) debe ser automática o manual? ¿Cada cuánto?
- ¿Cómo funciona hoy **Recaudaciones y Pagos**? ¿Se hace "efectivo" en lote o uno por uno? ¿Quién aprueba?
- ¿La **Centralización** (asientos) debe generarse sola o revisarse antes?
- ¿Qué tan importante es **Traspaso de Apertura** y **Conexión SII** (hoy en construcción)?
- ¿Qué nivel de **detalle/auditoría** necesitan? (quién tocó qué y cuándo)

## 🟠 Facturador

- ⭐ **¿Prioridad #1: conectar de verdad al SII** (emitir/validar/traer DTEs) o dejarlo preparado? *(Hoy la conexión está simulada; es el trabajo grande pendiente.)*
- ⭐ **¿Con qué RUT emiten** — el del equipo, o cada empresa cliente emite con el suyo? *(Define el modelo de credenciales.)*
- ¿Quién carga el **certificado digital `.pfx`** y dónde debe guardarse?
- ¿Qué **tipos de documento** deben emitir sí o sí? (factura, exenta, boleta, nota de crédito, guía…)
- ¿Necesitan **facturación masiva** (varios documentos de una) o solo manual?
- ¿Qué pasa con la **clave tributaria del cliente** — la entrega el cliente o la maneja el equipo?

## 🎯 Estratégicas (transversales)

- ⭐ **¿El sistema se va a entregar/vender a otra persona o empresa?** *(Ya está multi-tenant para eso — conviene confirmar el plan.)*
- ¿Cuál es la **prioridad de los próximos 30 días**: SII real, seguridad, reportes, o pulir lo actual?
- ¿Qué tan sensible es el tema de **seguridad/credenciales**? ¿Hay auditoría o requisito legal?
- ¿Cuántos **usuarios/clientes** esperan tener? (para dimensionar)

---

## 💡 Nota clave
La pregunta más determinante es la de **facturación real vs simulada**. De ahí depende el esfuerzo más grande pendiente: si la respuesta es "conexión real al SII", implica un proyecto serio (certificado digital `.pfx` + integración SOAP con el SII).

## 📌 Contexto útil para responder si te devuelven la pregunta
- El sistema ya es **multi-tenant** (cada dueño aislado por organización).
- El CRM ya separa **estado del negocio** (Activos/Suspendidos/Por completar/De baja) de **completitud de la ficha**.
- Las **credenciales de facturación** ya se guardan **encriptadas por usuario** (`credencial_global`), pero **aún no están conectadas** a los scripts que emiten (siguen leyendo del `.env`).
- La **conexión al SII** hoy es **simulada (mock)**.
