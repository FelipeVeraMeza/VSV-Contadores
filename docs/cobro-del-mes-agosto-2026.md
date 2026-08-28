# Cobro del Mes — cierre de agosto 2026 y arreglos del ciclo

**Fecha del trabajo:** 27 y 28 de agosto de 2026
**Alcance:** Cobro del Mes, Correo Masivo, robot de facturación masiva, cartera del CRM
**Estado:** agosto **facturado y cerrado** · 91 facturas vigentes · $4.185.738 neto

> Este documento existe para que otra sesión pueda retomar sin reconstruir el
> contexto. Cuenta **qué se hizo**, **qué se arregló y por qué**, y sobre todo
> **qué quedó pendiente**, que es lo que se pierde entre conversaciones.
>
> Todo lo que dice está medido contra la base real, no contra lo que aparenta la
> pantalla. Donde hay una cifra, hay una consulta detrás.

---

## 1. Resultado de agosto

| | |
|---|---|
| Facturas emitidas | 92 (folios 1375–1474, más 4 a mano del 07 al 24) |
| Anuladas con nota de crédito | 1 — YOVANKA MATULIC (NC 124) |
| **Vigentes** | **91 · $4.185.738 neto · $4.909.630 bruto** |
| Correos enviados | 92 · 0 rebotes |
| Fuera del ciclo | TCG HUB SPA (se cobra vía la EIRL de Isidora Torres) |

**Cartera tras la sincronización:** 93 activas · 132 suspendidas.

**Mora vigente:** 6 cobros de julio · $535.714 (ROVIRA $350.000, TREPAVERDE,
REICHEL, SKINPACK, GOOK, KEOA). Las 6 empresas están suspendidas pero su deuda
sigue viva y visible en el filtro **Vencidos**.

---

## 2. Reglas de negocio que se implementaron

### 2.1 No se factura a quien tiene deuda vencida

Decisión del usuario, 27-08. Al cliente con una factura vencida sin pagar **no se
le emite otra**: seguir facturándole agranda una deuda que ya no se está pagando.

- La previsualización trae la mora de cada cliente (`cobrosDelMesParaFacturar`).
- Los morosos aparecen en la lista con su deuda, **bloqueados**, y ordenados
  arriba junto al resto de lo que requiere decisión.
- **El filtro está en el backend** (`facturarCobrosMasivo`), no solo en la
  pantalla: el body lo arma el navegador y un cliente puede caer en mora entre
  que se abre la previsualización y se emite. Emitir en el SII es irreversible.
- Para desbloquear a alguien basta registrar el pago de su factura vencida.

### 2.2 El precio varía mes a mes según el tramo

Corrección importante a un supuesto equivocado. La matriz `plan_precio_tramo`
(cargada el 2026-06-25) define el precio por plan **según cuánto factura el
cliente**: EXECUTIVE va de $50.000 (hasta $3M) a $350.000 (sobre $100M).

Cuando el precio de la planilla sube o baja respecto al mes anterior, **casi
siempre es un cambio de tramo, no un error**. Por eso:

- La planilla mensual del usuario **manda** sobre el precio.
- El precio vive en `empresa.precio_mensual`, que es de donde el cobro toma el
  monto (`COALESCE(empresa.precio_mensual, plan.precio_base, 0)`).
- No se guarda como "adicional de un mes": si se borrara al mes siguiente, el
  sistema volvería al tramo 1 y cobraría de menos sin que nadie lo note.

### 2.3 Tope de variación del 20%

Si un monto editado a mano se aparta ≥20% de lo pactado, la fila se marca en
rojo, **el botón de emitir se bloquea** y aparece una casilla que nombra empresa
y cifras. Editar otro monto invalida la aprobación.

Nació de un caso real: **PARTY CARS**, junio 2026 — $50.000 pactados,
**$500.000 facturados** (un cero de más), detectado recién cuando ya estaba
pagada.

### 2.4 Segunda factura del mismo mes, a propósito

El robot descarta a quien ya tiene factura del período (`[DEDUP BD]`). A veces
corresponde emitir otra igual. La bandera `reemitir` permite saltarse ese
candado, pero **solo marcando la fila a mano**: vienen desmarcadas, el atajo
"marcar todas" las excluye, y la confirmación final las nombra.

---

## 3. Bugs encontrados y corregidos

Todos verificados contra la base antes y después.

| # | Bug | Consecuencia real |
|---|---|---|
| 1 | `vincularFolios` enganchaba a un cobro reabierto su factura **anterior** del mismo mes | CALDERÓN y SUSANA quedaron marcadas como facturadas sin estarlo. Ahora exige que el folio sea posterior a la reapertura. |
| 2 | El correo se registraba con `organizacion_id = NULL` | Los 95 correos del lote eran **invisibles** en Correo Masivo. La organización se buscaba por folio, pero el folio se escribe al cobro recién al final del lote. Ahora hay respaldo por `documentos_emitidos`. |
| 3 | El progreso se perdía al cambiar de sección | El robot seguía en el servidor pero la pantalla arrancaba en blanco. Ahora al montar pregunta si hay lote activo y se reengancha. |
| 4 | El recordatorio de pago avisaba el **neto** | El cliente habría transferido $11.495 de menos. Ahora usa el total del documento emitido. |
| 5 | El "Total del mes" sumaba las anuladas | Mostraba $4.246.238 en vez de $4.185.738. |
| 6 | Las anuladas no caían en ningún filtro de Correo Masivo | 91 + 0 + 5 = 96 de 97. Se agregó el filtro **Anuladas**. |
| 7 | Facturas emitidas sin correo eran invisibles | `correos_facturas` solo tiene fila si hubo intento. Ahora se cruzan con `documentos_emitidos` y salen como **"Sin enviar"**. |
| 8 | El reenvío masivo no avisaba al terminar | Refrescaba a ciegas a los 30 y 90 s. Ahora hay `/dte/progreso-reenvio` y se sondea hasta el final. |
| 9 | PDFs de facturas **commiteados al repositorio** | 4 documentos tributarios de clientes en git. Sacados del control de versiones, `.gitignore` actualizado y limpieza automática de los de más de 24 h. |
| 10 | Contadores del preview no cuadraban | El botón decía "Facturar 97" cuando emitiría 89. El conteo ahora sale del backend, que es el único que conoce la mora de todos los períodos. |

---

## 4. Textos de los correos

Hay **tres** correos distintos y conviene no confundirlos.

| Origen | Asunto | Adjunto |
|---|---|---|
| Emisión / "Reenviar factura" | `Factura N°1417 - Servicio Contabilidad FULL EMPRENDEDOR - Simple Pyme` | PDF de la factura |
| Botón "Cobrar" | `Recordatorio de pago – Factura N°1417 (agosto de 2026)` | solo firma |
| Nota de crédito | **no envía nada** (ver pendientes) | — |

El recordatorio **antes decía solo** "la factura correspondiente al servicio":
con dueños que tienen dos empresas —SOCIEDAD DE INVERSIONES PONCE Y AÑAZCO y
AÑAZCO Y PONCE llegan al mismo correo— era imposible saber cuál pagar. Ahora
lleva folio, período y monto bruto.

En la factura se cambió *"evitar la suspensión del servicio"* por *"mantener la
continuidad"*: era una advertencia dura para un cliente que aún está en plazo.

---

## 5. Pendientes

Ordenados por gravedad. Los tres primeros son **plata mal contabilizada**.

### 🔴 5.1 Cobros PAGADA sin folio ni monto

En junio hay clientes en estado PAGADA con `monto_facturado = 0` y **sin folio**:
COMERCIAL Y SERVICIOS DYNAMIC ($100.000), SMART GLOBAL ($50.000), TRANSPORTES
AMADO BERMEJO, INNOVA GAB, CASTINOX. **Nunca se les emitió factura** y el sistema
los da por cobrados.

Probable origen: la conciliación con planilla marca PAGADA todo lo que no aparece
como deudor, incluyendo lo que jamás se facturó.

**~$200.000 solo en junio.** No se revisó el resto de los meses.

### 🔴 5.2 Facturas históricas fuera de lo pactado

Enero–junio 2026 acumulan **~$3 millones** de diferencia entre lo pactado y lo
emitido. El tope del 20% (2.3) protege hacia adelante; esto es lo ya ocurrido.

### 🟠 5.3 Ocho cobros de meses pasados nunca emitidos

Enero (4), marzo, abril, mayo (2) — de empresas que **siguen activas**. Total
**$343.508**. No están en mora porque nunca se facturaron: están fuera de todo
indicador.

### 🟠 5.4 La nota de crédito no avisa al cliente

`nota_credito_debito.mjs` descarga el PDF pero **no manda correo** (el código lo
dice explícito en la línea ~292).

Caso concreto: **YOVANKA MATULIC** recibió su factura por $71.995 a las 14:06 del
28-08, se anuló 13 minutos después, y **ella no lo sabe**. Está esperando pagar
algo que ya no debe.

Lo que falta: enviar el PDF de la nota con un texto del tipo *"anulamos la
factura N°1471; no es necesario realizar el pago"*. El script ya tiene el PDF;
es agregar el envío con el mismo `enviarConReintentos`.

### 🟠 5.5 La tabla `bitacora` no existe

El código llama a `registrar()` para dejar constancia de las emisiones, pero la
tabla se llama `bitacora_sistema` / `bitacora_gestion`. **Emitir 92 facturas
irreversibles no deja rastro de quién lo hizo.**

### 🟡 5.6 La periodicidad sigue sin datos

`empresa_servicio.periodicidad` existe (mensual, trimestral, anual, una_vez) pero
**está vacía**: cero servicios activos con periodicidad y 101 empresas
facturables sin ningún servicio registrado. `generarCobros` la ignora y factura a
todos, todos los meses.

No se implementó a propósito: sin datos, todos caerían al default `'mensual'` (no
cambia nada) o alguno dejaría de facturarse sin que nadie lo note. **Hace falta
que el usuario diga cuáles de sus clientes no son mensuales.**

### 🟡 5.7 Sin campo de observaciones en la ficha de empresa

No hay dónde anotar por qué TCG HUB va en $0 (se cobra vía la EIRL de Isidora).
El próximo mes alguien verá ese cero y volverá a preguntar.

### 🟡 5.8 Emisiones a mano sin datos completos

Los folios 1367–1373 se guardaron como "CLIENTE EXTERNO (NUEVO)", sin razón social
ni RUT, y con `monto_total = 0`. Se repararon los existentes, pero **el modal de
factura individual sigue sin pasar esos datos al registro**.

---

## 6. Cómo verificar el estado

Consultas útiles para la próxima sesión. Van contra la base real.

```sql
-- Estado del mes en curso
SELECT estado, COUNT(*), SUM(monto_esperado)::bigint
  FROM cobro_mensual
 WHERE periodo = date_trunc('month', CURRENT_DATE)::date
 GROUP BY estado;

-- Lo que realmente se emitiría (sin morosos ni montos en $0)
SELECT COUNT(*), SUM(monto_esperado)::bigint
  FROM cobro_mensual cm
 WHERE cm.periodo = date_trunc('month', CURRENT_DATE)::date
   AND cm.estado = 'POR_EMITIR' AND cm.monto_esperado > 0
   AND cm.empresa_id NOT IN (
       SELECT empresa_id FROM cobro_mensual
        WHERE estado = 'PENDIENTE_PAGO' AND fecha_vencimiento < CURRENT_DATE);

-- Facturas emitidas a las que nunca se les mandó correo
SELECT d.folio, e.razon_social, e.email_corporativo
  FROM documentos_emitidos d JOIN empresa e ON e.id = d.empresa_id
 WHERE d.tipo_dte = 33 AND d.fecha_emision >= date_trunc('month', CURRENT_DATE)
   AND NOT EXISTS (SELECT 1 FROM correos_facturas cf
                    WHERE TRIM(cf.folio) = d.folio::text);

-- Notas de crédito no aplicadas al ciclo de cobro
SELECT nc.folio, e.razon_social, nc.folio_ref, cm.estado
  FROM documentos_emitidos nc JOIN empresa e ON e.id = nc.empresa_id
  LEFT JOIN cobro_mensual cm ON cm.folio = nc.folio_ref::text
 WHERE nc.tipo_dte = 61 AND cm.estado <> 'ANULADA';
```

El envío de correo se puede auditar contra Resend sin tocar la base:
`GET https://api.resend.com/emails?limit=100` con `RESEND_API_KEY`.

---

## 7. Notas operativas

- **Correo:** sale por **Resend** (única vía activa; Gmail API y SMTP no están
  configurados). Dominio `vsvconsultores.com` verificado, región `sa-east-1`.
- **Cuota:** 100 correos/día, y **se reinicia a medianoche UTC = 20:00 en Chile**.
  Un lote de 92 lanzado después de las 20:00 queda partido en dos días.
- **Los PDFs de facturas no van al repositorio.** `.gitignore` ya los cubre y el
  robot limpia los de más de 24 h al iniciar cada lote.
- **Cuidado con los backticks en SQL embebido:** las consultas van en template
  literals; un backtick dentro de un comentario `--` rompe el archivo entero.
  Pasó dos veces el 28-08 y una tumbó el servidor. Validar con `node --check`.

---

## 8. Archivos tocados

| Archivo | Qué cambió |
|---|---|
| `src/controllers/cobros.controllers.js` | mora en la previsualización, filtro de morosos en el backend, `facturables`, `suspendida`, `folioDelMes`, total sin anuladas, `vincularFolios` con corte por fecha |
| `src/components/facturacion/tabs/CobrosMensuales.jsx` | rediseño completo, tope de variación, retomar progreso, botones con color |
| `src/components/facturacion/tabs/CorreoMasivo.jsx` | selector de mes, filtro Anuladas, estado "Sin enviar", botones renombrados, seguimiento del reenvío |
| `src/controllers/dte.controllers.js` | facturas sin correo en el log, `estadoReenvio`, `progresoReenvioController` |
| `src/routes/dte.routes.js` | ruta `/progreso-reenvio` |
| `src/services/apiDTE.js` | `getCorreosLog(periodo)`, `getProgresoReenvio` |
| `src/components/Facturacion.jsx` | cadena de alturas para que la tabla no se corte |
| `.../scripts/factura_masiva.mjs` | bandera `reemitir`, limpieza de PDFs |
| `.../revisar para envios/mensajes_facturador_masivo.mjs` | organización por respaldo, `limpiarPdfsViejos`, texto de la factura |
| `.../revisar para envios/recordatorio_pago.mjs` | folio/período/monto en el recordatorio, monto bruto |
| `.gitignore` | PDFs fuera del control de versiones |

Ninguno se commiteó: el usuario maneja git él mismo.
