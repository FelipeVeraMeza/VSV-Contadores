# Facturador — Requerimientos y estado real

**Fecha de la revisión:** 31-jul-2026 · *actualizado el 14-ago-2026 (ver el final).*

> **⚠️ Para el estado de HOY del Cobro del Mes y Correo Masivo, ir a
> [cobro-del-mes-agosto-2026.md](cobro-del-mes-agosto-2026.md)** (28-ago-2026).
> Ahí está el cierre de agosto, las reglas nuevas del ciclo —no se factura a
> quien debe, precio por tramo, tope de variación—, diez bugs corregidos y, sobre
> todo, **los pendientes**: ~$200.000 de junio dados por pagados sin factura, la
> nota de crédito que no avisa al cliente y la tabla `bitacora` que no existe.

> **Lo último (14-ago-2026):** separador de miles en los montos, botón para
> descargar la factura al terminar la emisión, y un bug latente de la proyección
> del lote. Está todo al final, en **«Trabajo del 14-ago-2026»**, junto con las
> tres tareas del facturador que quedaron esperando definiciones.
>
> Además, el **correo desde Railway ya funciona**: el dominio
> `vsvconsultores.com` se verificó en Resend ese mismo día, así que lo que dice
> RNF-04 más abajo quedó viejo. Ver
> [correo-envio-diagnostico.md](correo-envio-diagnostico.md).
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

> ✅ **RESUELTO el 14-ago-2026.** Lo de abajo describe cómo estaba hasta esa
> fecha y se deja como historia. Hoy el correo **sí sale desde Railway**: se
> verificó el dominio `vsvconsultores.com` en Resend (3 registros DNS en el
> cPanel de DonWeb) y el envío pasa por HTTPS, que Railway no bloquea. Probado
> desde producción. Detalle en
> [correo-envio-diagnostico.md](correo-envio-diagnostico.md).

*(Estado hasta el 14-ago)* **Ningún correo salía desde Railway.** Railway bloquea
los puertos de SMTP y Resend rechazaba los envíos porque el dominio
`vsvconsultores.com` no estaba verificado.

Todo lo que se probó el 31-jul funcionó **porque se corrió desde el computador
local**.

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

---

## Trabajo del 14-ago-2026

Dos pedidos que estaban como subtareas de **FACTURADOR** en el módulo de Tareas.
El resto de esa rama quedó bloqueado esperando definiciones (ver el final).

### Separador de miles en los montos

Los campos de plata eran `<input type="number">`. Ese tipo de campo **no admite
separador de miles** —el navegador no lo permite— así que un honorario de
1.190.000 se veía `1190000` y había que contar los ceros con el dedo. En una
factura eso es un error caro.

Ahora se dibujan con puntos mientras **el valor guardado sigue siendo solo
dígitos**. Es importante que sea así: el resto del facturador hace
`Number(row.precio)` para la proyección y `String(...).replace(/[^0-9]/g,'')`
antes de mandar al SII.

```
estado:   "1190000"      ← lo que se guarda y viaja
pantalla: "1.190.000"    ← lo que se ve
```

Helper compartido en `src/components/facturacion/utils/montos.js`. Aplicado en
los tres campos de monto: afecta individual, afecta masiva (columna Valor Neto de
la tabla) y exenta.

> 🐛 **Bug latente que apareció al probar esto y que nadie había reportado.**
> Cuando el honorario venía del CRM ya formateado (`"190.000"`), la fila lo
> guardaba tal cual y la *Proyección Neta* del lote hacía `Number("190.000")`,
> que en JavaScript da **190** — el punto se lee como separador decimal. El total
> proyectado salía en `1.380` en vez de `1.380.000`, y era **imposible de notar**
> porque el número se veía plausible. Se corrigió limpiando el valor al
> asignarlo desde el CRM (`soloDigitos`).

### Botón «Descargar factura» al terminar la emisión

En el cuadro de «¡Proceso Finalizado!» estaba solo *Volver al CRM*. Si la
descarga automática no salía —o se cerraba la ventana sin querer— la única forma
de recuperar el documento era ir a buscarlo al SII a mano.

El botón va **arriba** de *Volver al CRM* a propósito: ese botón cierra el cuadro
y con él la última oportunidad de bajar el documento. Está en los dos modales:
afecta (DTE 33) y exenta (DTE 34).

**No hay copia guardada del PDF.** El servidor levanta el robot, entra al SII y
lo trae, así que **tarda entre 30 y 90 segundos**. El botón lo avisa antes de
apretarlo y muestra «Buscándola en el SII…» mientras trabaja; sin eso parece
colgado y se aprieta tres veces. Si falla, el mensaje aclara que **la factura YA
fue emitida** y que esto es solo la copia en PDF.

Componente: `src/components/facturacion/modals/dte/BotonDescargarFolio.jsx`.

### Lo que quedó bloqueado

Las tres tienen las preguntas escritas en sus comentarios (formato P1/P2/P3) y
están asignadas a **Mati** con aviso en la campana.

| Tarea | Por qué no avanza |
|---|---|
| **FACTURADOR** (madre) | «Emitir UNA factura debería funcionar igual que la masiva» y «enviar por WhatsApp más rápido» son ideas, no algo programable. Falta saber qué pasos de más tiene la individual, cómo se manda hoy por WhatsApp, y un ejemplo real de mensaje de error. |
| **EMISOR DE FACTURAS** (alta) | Bloqueada por una **decisión**, no por código. El 11-ago se construyó el selector de «Empresa Emisora» y el 12-ago **se revirtió entero** porque se prefirió la factura sin selector. Hoy el código está igual que antes de todo eso. Si siempre se factura con SIMPLE PYME, la tarea se cierra sin escribir una línea. |
| **EMISOR DE NOTA DE CRÉDITO** (alta) | **Ya arreglada** el 11-ago (faltaba importar `apiDTE` en `NotaCreditoDebitoModal.jsx`, por eso tiraba *"apiDTE is not defined"*). Solo espera redeploy y una emisión real de prueba. |

> Sobre WhatsApp, la decisión que define esa tarea: abrir WhatsApp Web con el
> mensaje ya escrito es **gratis** y sale en días; que se mande solo necesita
> contratar la **API de WhatsApp Business** y se paga por mensaje.
