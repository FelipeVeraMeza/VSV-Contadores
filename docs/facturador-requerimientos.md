# Facturador — Requerimientos y estado real

**Fecha de la revisión:** 31-jul-2026
**Alcance:** módulo Facturación completo — Emitir DTE, Historial de Documentos,
Cobro del Mes y Correo Masivo.

**Cómo leer el estado:**

| Símbolo | Significado |
|---|---|
| ✅ | Funciona |
| ⚠️ | Funciona a medias, o solo en ciertas condiciones |
| ❌ | No existe |

---

## 1. Requerimientos funcionales

*Lo que el módulo tiene que **hacer**.*

### 1.1 Emisión de documentos

| ID | Requerimiento | Estado | Nota |
|---|---|---|---|
| RF-01 | Emitir una factura afecta (DTE 33) individual | ✅ | |
| RF-02 | Emitir facturas en lote desde CSV o carga manual | ✅ | |
| RF-03 | Emitir factura exenta (DTE 34) | ✅ | |
| RF-04 | Emitir nota de crédito y de débito (DTE 61 / 56) | ✅ | |
| RF-05 | Emitir boleta de honorarios | ✅ | |
| RF-06 | Detener un lote a medio camino | ⚠️ | Funciona, pero si el servidor se reinicia se pierde el avance (ver RNF-05) |
| RF-07 | Descargar el PDF de un documento emitido | ✅ | Corregido el 31-jul, ver RNF-02 |

### 1.2 Envío de correo a clientes

| ID | Requerimiento | Estado | Nota |
|---|---|---|---|
| RF-08 | Enviar la factura por correo al cliente al emitirla | ⚠️ | **Solo funciona desde el computador local.** Ver RNF-04 |
| RF-09 | Reenviar la factura de un folio puntual | ✅ | Entra al SII, baja el PDF y lo manda |
| RF-10 | Reenviar varias facturas seleccionadas | ✅ | |
| RF-11 | Ver el registro de todos los correos enviados | ✅ | Estaba roto: pedía los datos sin sesión y salía vacío. Corregido el 31-jul |
| RF-12 | Distinguir enviados, fallidos y omitidos | ✅ | |
| RF-13 | Aceptar clientes con más de un correo | ✅ | Venían separados con `;` y nodemailer no los entendía. Corregido el 31-jul |

### 1.3 Cobro del mes

| ID | Requerimiento | Estado | Nota |
|---|---|---|---|
| RF-14 | Generar los cobros del mes desde la cartera | ✅ | |
| RF-15 | Facturar en lote los cobros del mes | ✅ | |
| RF-16 | Registrar el folio emitido en cada cobro | ✅ | |
| RF-17 | Marcar un cobro como pagado | ✅ | |
| RF-18 | Corregir el monto a mano | ✅ | |
| RF-19 | Sincronizar notas de crédito (anulaciones) | ✅ | |

### 1.4 Recordatorio de pago

| ID | Requerimiento | Estado | Nota |
|---|---|---|---|
| RF-20 | Mandar recordatorio **solo a quien debe** | ✅ | Antes salía de las facturas enviadas e incluía a los que ya pagaron. Corregido el 31-jul |
| RF-21 | Excluir a los clientes dados de baja | ✅ | Corregido el 31-jul |
| RF-22 | Mandar recordatorio solo a los seleccionados | ✅ | Antes el botón ignoraba la selección y mandaba a los 93. Corregido el 31-jul |
| RF-23 | Ver quién debe y quién ya pagó antes de mandar | ✅ | Filtros Deben / Ya pagaron. Corregido el 31-jul |
| RF-24 | Confirmar a cuántos y a quiénes se va a mandar | ✅ | |
| RF-25 | Fecha de vencimiento correcta en el texto | ✅ | Estaba fija en "5 de julio". Ahora se calcula: el 5 del mes siguiente |
| RF-26 | Ver el avance del envío en pantalla | ✅ | |
| RF-27 | Retomar el avance si se cambia de pantalla | ✅ | Corregido el 31-jul |

### 1.5 Lo que falta

| ID | Requerimiento | Estado | Por qué importa |
|---|---|---|---|
| RF-28 | **Registrar quién hizo cada acción y cuándo** | ❌ | Hoy no se puede responder "¿quién emitió esta factura?" ni "¿a quién se le mandó el recordatorio?". El 31-jul hizo falta dos veces |
| RF-29 | **Saber a quién ya se le envió un recordatorio** | ❌ | El envío no deja nada en la base. Si se corre dos veces, los clientes reciben el correo repetido |
| RF-30 | **Reanudar un envío interrumpido** | ❌ | Si se corta a la mitad, hay que empezar de cero o adivinar dónde quedó |

---

## 2. Requerimientos no funcionales

*Cómo se tiene que **comportar** el módulo.*

### RNF-01 · Seguridad: solo usuarios autenticados — ❌

**24 de las 25 rutas del facturador no piden sesión.** Solo el registro de
correos la exige.

Cualquiera que alcance la dirección de la API, sin cuenta ni contraseña, puede:

- emitir una factura real al SII (`POST /dte/emitir-manual`)
- facturar en lote (`POST /dte/emitir-masivo`)
- mandarle correo a los 93 clientes (`POST /dte/enviar-recordatorios`)
- leer todos los documentos emitidos (`GET /dte/historial`)
- frenar el robot a media corrida (`POST /dte/detener-masivo`)

**Por qué no se arregló todavía:** el frontend llama a esas rutas **sin mandar la
cabecera de sesión**. Si se les exige sesión sin tocar también el frontend, el
facturador deja de funcionar entero. Las dos cosas van juntas, y hay que
probarlas. Es el trabajo más importante que queda.

### RNF-02 · Seguridad: no exponer archivos del servidor — ✅ *(corregido el 31-jul)*

La ruta de descarga pegaba el nombre del archivo a la ruta sin validarlo:

```js
const filePath = path.resolve(process.cwd(), 'tmp', fileName);
```

Comprobado contra el servidor: `GET /api/dte/download/..%2Fpackage.json`
devolvía **HTTP 200** con el archivo. Cambiando el nombre por `..%2F..%2F.env`
entregaba el archivo de configuración: la contraseña de la base de datos, la
`ENCRYPTION_KEY` —la que cifra los RUT y las claves del SII de los 216
clientes— y las claves de los servicios externos. Sin necesidad de tener cuenta.

Ahora exige sesión y verifica que la ruta final siga dentro de `tmp/`.

### RNF-03 · Seguridad: aislamiento entre organizaciones — ⚠️

`cobro_mensual` guarda `organizacion_id` y `empresa_id`. `correos_facturas`
**no guarda ninguna de las dos**: es una tabla global.

Hoy no se nota porque hay una sola organización. Cuando entre la segunda,
cualquier administrador vería los correos enviados de la otra firma.

### RNF-04 · Confiabilidad: funcionar en producción — ❌

**Ningún correo sale desde Railway.** Railway bloquea los puertos de SMTP y
Resend rechaza los envíos porque el dominio `vsvconsultores.com` no está
verificado.

Todo lo que se probó el 31-jul funcionó **porque se corrió desde el computador
local**. Está documentado con los dos caminos posibles en
[correo-envio-diagnostico.md](correo-envio-diagnostico.md).

### RNF-05 · Confiabilidad: no perder el estado al reiniciar — ❌

El avance de los envíos y de los robots vive en **7 variables en memoria**
(`estadoRobot`, `estadoRecordatorio`, `correoEnCurso`, y cuatro más).

Si el servidor se reinicia a media corrida:

- se pierde el avance y no queda registro de dónde iba
- el candado que impide dos envíos simultáneos se suelta, y dos procesos podrían
  pisarse

### RNF-06 · Trazabilidad — ❌

No hay bitácora de emisiones, envíos ni cambios de estado de cobro. Es la
contraparte de RF-28 y RF-29.

Además, `cobro_mensual.updated_at` **no es confiable**: esa tabla no tiene
trigger de actualización, a diferencia de `empresa` y `usuario`. O sea que el
campo solo se llena si la aplicación lo escribe a mano.

### RNF-07 · Usabilidad: saber qué está pasando — ✅ *(mejorado el 31-jul)*

El motor de envío no imprimía nada cuando el correo salía bien por la vía
habitual: en pantalla solo se veía el aviso de que Resend había fallado, y
parecía que no se estaba enviando nada. Ahora cada envío confirma:

```
📧 [1/92] Recordatorio → A&L SOLUCIONES (ayl...@gmail.com)
   ⚠️ Resend falló: ... Probando por SMTP...
   ✅ [1/92] Entregado a ayl.transportesyservicios@gmail.com
```

### RNF-08 · Usabilidad: no perder el trabajo al navegar — ✅ *(corregido el 31-jul)*

Al cambiar de sub-página se perdía el filtro, la selección y el indicador de
avance. Ahora el filtro va en la dirección web, la selección se guarda en el
navegador y, al volver, la pantalla se reengancha al envío que siga corriendo.

### RNF-09 · Límites de uso — ⚠️

El limitador de peticiones es **global**: 1000 cada 15 minutos para toda la API,
compartidas entre todos los usuarios. No hay límite propio para los envíos
masivos ni tope de destinatarios por corrida.

### RNF-10 · Integridad de los datos de contacto — ✅ *(corregido el 31-jul)*

Los correos se validan y se normalizan antes de enviar. Las direcciones que
vienen juntas en un mismo campo se separan bien, y las inválidas se descartan
avisando en pantalla en vez de fallar en silencio.

---

## 3. Resumen

**De 40 requerimientos revisados: 30 cumplen, 4 a medias, 6 no existen.**

El 31-jul se corrigieron 12: el registro de correos que salía vacío, el
recordatorio que le llegaba a quienes ya habían pagado, la fecha vencida en el
texto, los clientes con dos correos, el botón que ignoraba la selección, la
pérdida de estado al navegar, y la fuga del archivo de configuración.

### Prioridad de lo que queda

| # | Qué | Por qué primero |
|---|---|---|
| 1 | **Autenticar las 24 rutas** (RNF-01) | Es lo único que queda en nivel crítico. Hay que tocar backend y frontend juntos |
| 2 | **Bitácora en base de datos** (RF-28, RF-29, RNF-06) | Sin esto no se puede responder quién hizo qué. Ya hizo falta dos veces |
| 3 | **`organizacion_id` en `correos_facturas`** (RNF-03) | Antes de que entre el segundo tenant, después es más caro |
| 4 | **Correo en producción** (RNF-04) | Verificar el dominio en Resend o activar la API de Gmail |
