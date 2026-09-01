# Módulo CRM · Cómo funciona, qué tiene y qué falta

**Última revisión:** 1 de septiembre de 2026 · verificado contra el código y la base de datos.
Lo anterior al 4 de agosto se mantiene tal cual; lo nuevo de esta revisión está en la
sección 11 (dashboard).
**Documento único del módulo.** Se fundieron acá y ya no existen por separado:
`requerimientos-clientes-prospectos.md`, `crm-fase0-modelo-persona.md`,
`crm-fase0-estudio-integraciones.md`, `bitacora-crm-2026-07-19.md`,
`whatsapp-requerimientos.md` y `whatsapp-integracion-diseno.md`.

Queda fuera a propósito `correo-envio-diagnostico.md`: no es del CRM sino de la
infraestructura de correo que usa sobre todo Facturación para los recordatorios.

**Leyenda:** ✅ hecho · ⚠️ parcial · ⏭️ pendiente · ⛔ bloqueado

---

## 1. Los dos conceptos que hay que tener claros

Todo el CRM se sostiene sobre esta distinción. Confundirlas es el origen de la
mayoría de las dudas:

| | **Prospecto** | **Cliente** |
|---|---|---|
| Es una | `persona` | `empresa` |
| Se crea con | **un solo dato** (nombre, teléfono, correo o RUT) | **RUT válido** obligatorio |
| Sirve para | perseguir una oportunidad | facturar |
| Se relacionan | N:N a través de `persona_empresa` | |

Una persona puede estar detrás de varias empresas, y una empresa puede tener
varios contactos. **Convertir** un prospecto crea (o reutiliza) la empresa,
le copia el contacto, y pasa la persona a `activo`.

---

## 2. Cómo se divide la pantalla

```
CRM
├── Dashboard        indicadores del negocio
├── Clientes         las empresas: la cartera facturable
├── Prospectos       las personas: el embudo comercial
├── WhatsApp         conversaciones
├── Correo           envíos y registro
├── Interacciones    historial de contacto
└── Analítica        cortes y gráficos
```

---

## 3. Clientes · cómo funciona hoy

### 3.1 Clasificación de la cartera

Un cliente cae en **una sola** pestaña, por este orden de prioridad:

```
De baja  →  Por completar  →  Suspendidos  →  Activos
```

Las empresas creadas por usuarios de rol `Cliente` salen aparte, en
**Creadas por usuarios**.

Hoy hay **216 empresas**, de las cuales **121 están de baja** y **93 activas en
cartera**. Las activas son exactamente las que se facturan.

### 3.2 Reglas de negocio

Estas no son evidentes mirando la pantalla y conviene tenerlas escritas:

**Servicio suspendido.** Si el mes pasado **no se le emitió factura**, el cliente
dejó el servicio. No es un campo que alguien marque: se deduce del ciclo de cobro.

**Estado de pago.** Se calcula, no se escribe. En este orden:

```
activo = false            →  DE BAJA
sin factura el mes pasado →  SERVICIO SUSPENDIDO
tiene deuda vencida       →  NO PAGADO
en cualquier otro caso    →  AL DIA
```

**Moroso de verdad** es quien tiene una factura emitida, vencida y sin pagar.
La lista distingue entre *deuda vencida* (ya se pasó el plazo) y *deuda total*
(incluye lo facturado que aún está en plazo), porque un cliente al que se le
acaba de emitir la factura del mes **ya debe, solo que todavía no se atrasa**.

**Score.** Se recalcula solo según los estados. No es editable.

### 3.3 Qué se corrigió el 4 de agosto

> **El "Estado de Pago" de la ficha contradecía a la lista, y cambiarlo no servía
> de nada.**
>
> La ficha escribía en `empresa.estado_pago`, un texto que venía de la
> importación original y que **ninguna pantalla leía para decidir nada**. La lista
> siempre calculó la morosidad desde el ciclo de cobro. Resultado: se cambiaba el
> estado, se guardaba correctamente, y la lista seguía igual.
>
> Ese día el campo afirmaba que **12 clientes no habían pagado** mientras el ciclo
> de cobro mostraba a los **93 al día**.
>
> **Qué se hizo:** el campo pasó a calcularse desde el ciclo de cobro y dejó de
> ser editable. La acción «Registrar pago» —individual o en lote— ahora marca los
> cobros pendientes del cliente como `PAGADA`, que es lo que de verdad ocurre.
> Se confirma con el monto exacto antes de aplicar, porque es plata.
>
> **Verificado:** 133 clientes, **cero contradicciones**.
>
> Desapareció el botón «Marcar No Pagado»: un cliente debe o no debe según sus
> cobros, no según lo que alguien apunte a mano.

### 3.4 Requerimientos funcionales

| ID | Requerimiento | Estado |
|---|---|---|
| RF-CL-01 | Crear cliente exigiendo RUT válido (módulo 11) | ✅ |
| RF-CL-02 | Razón social opcional; si falta se usa el RUT | ✅ |
| RF-CL-03 | Detectar duplicados por RUT e impedir la creación | ✅ |
| RF-CL-04 | Registrar giro, régimen, plan, contacto, representante, dirección y nota | ✅ |
| RF-CL-05 | Al crear: fila de credenciales, casa matriz y asignación al creador | ✅ |
| RF-CL-06 | La empresa se asigna a la organización del usuario | ✅ |
| RF-CL-07 | Eliminar de forma permanente, con confirmación explícita | ✅ |
| RF-CL-08 | Impedir la eliminación si tiene registros contables asociados | ✅ |
| RF-CL-09 | Convertir un prospecto en cliente | ✅ |
| RF-CL-10 | Dar de baja y reactivar un cliente | ✅ *(121 dados de baja hoy)* |
| RF-CL-11 | Ver y editar contacto y representante legal | ✅ |
| RF-CL-12 | Estado de Pago | ✅ **calculado, ya no editable** |
| RF-CL-13 | Estado F29 (`DECLARADO` / `PENDIENTE` / `NO DECLARAR`) | ✅ |
| RF-CL-14 | Score automático según los estados | ✅ |
| RF-CL-15 | Ver y editar giro y régimen tributario | ✅ |
| RF-CL-16 | Ver y editar dirección, comuna y ciudad | ✅ |
| RF-CL-17 | Credenciales SII y portal web, enmascaradas, con ver y copiar | ✅ |
| RF-CL-18 | Logo del cliente | ⚠️ solo por URL |
| RF-CL-19 | Operación mensual F29 (ventas, compras, neto, bruto, n.º factura) | ✅ |
| RF-CL-20 | Renta anual | ✅ |
| RF-CL-21 | Indicadores de Dirección del Trabajo | ✅ |
| RF-CL-22 | Validar RUT del representante y correo antes de guardar | ✅ |
| RF-CL-23 | Permitir vaciar un campo | ✅ |
| RF-CL-24 | Mostrar la última modificación | ✅ |
| RF-CL-25 | **Registrar el pago de un cliente desde el CRM** | ✅ *nuevo, 04-08* |

### 3.5 Requerimientos no funcionales

| ID | Requerimiento | Estado |
|---|---|---|
| RNF-CL-01 | Toda petición exige sesión válida | ✅ |
| RNF-CL-02 | RUT cifrado en la base, búsqueda por hash | ✅ |
| RNF-CL-03 | Aislamiento por organización | ✅ |
| RNF-CL-08 | Las credenciales viajan descifradas al navegador | ⏭️ **sin resolver** |
| RNF-CL-12 | Paginación en el servidor | ⏭️ **todo en memoria** |
| RNF-CL-19 | Bloqueo optimista al editar | ⏭️ dos ediciones se pisan en silencio |
| RNF-CL-27 | Etiquetas accesibles en los controles | ✅ |
| RNF-CL-28 | Los estados se comunican con texto, no solo con color | ✅ |
| RNF-CL-29 | Navegación completa por teclado | ⏭️ |
| RNF-CL-30 | Auditoría de creación y edición | ✅ |
| RNF-CL-31 | Historial completo de cambios de plan | ✅ |
| RNF-CL-34 | Auditar quién mira las credenciales | ⏭️ |
| RNF-CL-35 | Un error de render no tumba el módulo | ✅ |

---

## 4. Prospectos · resumen

Se revisará a fondo por separado. El estado, en corto:

**Funciona:** crear con un solo dato, validar RUT y correo, detectar duplicados,
varios teléfonos y correos, ejecutivo responsable, etiquetas, estados con
historial, inactivar y reactivar desde el listado, convertir a cliente en un paso,
notas, asociar empresas, fusionar duplicados y buscar por cualquier dato.

**Pendiente:** adjuntar archivos a las notas · pasar a `activo` automáticamente al
contratar · paginación y búsqueda en el servidor · auditoría de ediciones.

> **La brecha más grave de julio ya está cerrada.** `persona` no tenía
> `organizacion_id`, así que el listado devolvía los prospectos de **todos** los
> dueños. Hoy la columna existe y las 3 personas cargadas la tienen.

---

## 5. WhatsApp · funcionando desde el 16 de julio

Es la pestaña más terminada del CRM y conviene que se sepa, porque suele darse
por pendiente.

**Cómo está armado:** conexión por **código QR** con `@whiskeysockets/baileys`
—sin Chromium, por WebSocket— y respuesta automática con **Gemini**. Todo se
guarda en Postgres: conversaciones, mensajes, credenciales y conocimiento.

```
Navegador (CRM)          Servidor (:4000)              WhatsApp / IA
WhatsappPanel  ──HTTP──▶ whatsapp.routes
 (consulta                whatsappBot.js (Baileys) ◀──WebSocket──▶ WhatsApp
  cada 3 s)               ia.js (Gemini)           ◀──REST──────▶ Google AI
                          whatsappRepo.js (BD)
```

**Los 25 requerimientos funcionales están implementados.** En resumen: conectar
por QR, ver el estado, reconexión automática, listar y buscar conversaciones,
recibir y enviar, **responder solo con IA**, pausar la IA por número o por chat
para que tome un humano, plantillas con `{nombre}`, marcar como leído, comando
`/reiniciar` para el cliente, **varios números en paralelo**, acceso por rol, y
**vincular la conversación con la empresa** cruzando el teléfono contra la ficha.

**Lo que le falta:**

| | Qué | Por qué importa |
|---|---|---|
| L-04 | Es por consulta cada 3-4 s, no push | Pequeño retraso al recibir |
| L-05 | **La base de conocimiento está vacía** | La IA responde con datos genéricos de ejemplo, no con los de la oficina |
| L-06 | No crea notas ni tickets solo | Estaba en el diseño original |
| L-07 | **Baileys es "no oficial"** | Va contra los términos de WhatsApp: riesgo de que bloqueen el número |
| L-08 | Sin candado entre instancias | Si el servidor escala a dos, ambas intentan conectar la misma sesión |

> **L-05 es lo más rentable de arreglar.** Todo el motor está hecho; lo que falta
> es cargar qué sabe la IA sobre la oficina. Sin eso responde bien pero no sabe
> nada útil.

> **L-07 es la decisión pendiente del mes.** No es «implementar WhatsApp» —eso ya
> está— sino si se migra a la vía oficial de Meta para no arriesgar el número.

---

## 6. Brechas abiertas, por riesgo

1. **Las credenciales del SII viajan descifradas al navegador** y nadie audita
   quién las mira. Es el dato más sensible que maneja el sistema.
2. **Sin paginación en ninguno de los dos módulos.** Hoy son 216 empresas y se
   aguanta; el problema aparece cuando alguien cargue la cartera completa de otra
   oficina.
3. **Sin bloqueo optimista.** Si dos personas editan el mismo cliente, la última
   pisa a la primera sin avisar. Con tres usuarios es improbable, no imposible.
4. **El Dashboard de empresa muestra cifras inventadas** — no consulta la base.
   Ver `ESTADO-Y-PROPUESTAS.md` §2.2.
5. **El logo solo se acepta por URL**, no se puede subir un archivo.

---

## 7. Mejoras propuestas para mover y manejar información

Ordenadas por cuánto ahorran al día, no por esfuerzo.

### 7.1 Alto impacto

**Edición en línea desde la tabla.** Hoy, cambiar el plan o el ejecutivo de un
cliente obliga a abrir la ficha, editar, guardar y cerrar. Poder hacerlo desde la
fila ahorra cuatro clics por cambio, y esos cambios se hacen de a muchos.

**Acciones en lote más allá de borrar.** Ya existen la selección múltiple y
«Registrar pago». Faltan las que se piden solas: **cambiar plan**, **asignar
ejecutivo**, **dar de baja** y **enviar correo** al grupo seleccionado.

**Importar actualizaciones, no solo altas.** Hoy se importa para crear. Lo que
más se necesita es **actualizar en masa** desde una planilla, calzando por RUT:
subir honorarios, corregir correos, cambiar planes. Es el puente natural para la
meta de dejar Excel — se usa una vez para migrar y después se apaga.

**Búsqueda y paginación en el servidor.** Lo mismo que se hizo en Tareas. Además
de la velocidad, permite buscar sobre **toda** la cartera y no solo sobre lo que
ya se descargó.

### 7.2 Impacto medio

**Vistas guardadas.** Que cada persona guarde sus filtros habituales —«mis
clientes morosos», «los que no han declarado»— en vez de rearmarlos cada mañana.

**Columnas configurables.** La tabla muestra lo mismo para todos. Quien cobra
quiere ver deuda; quien declara quiere ver F29.

**Copiar al portapapeles.** Un botón junto al RUT, el correo y el teléfono. Suena
menor y es de lo que más se usa: hoy hay que abrir la ficha y seleccionar a mano.

**Ficha por pestañas.** La ficha es un scroll largo. Separada en *Datos ·
Tributario · Credenciales · Servicios · Notas* se encuentra todo mucho más rápido.

**Historial de cambios del cliente.** Existe para el plan; falta para el resto.
La misma necesidad que en Tareas: poder responder «¿quién cambió esto?».

### 7.3 Menor

Duplicar un cliente como plantilla · subir el logo como archivo · exportar solo
lo filtrado en vez de todo · atajos de teclado para buscar y crear.

---

## 8. Decisiones históricas que conviene no repetir

Absorbidas de los estudios de Fase 0 y la bitácora de julio:

**Modelo persona-céntrico.** Se eligió que el prospecto fuera `persona` y no una
tabla aparte de "leads", para que al convertirse en cliente no haya que migrar
nada: la misma fila cambia de estado y se asocia a una empresa.

**La eliminación es permanente, sin papelera.** Decisión explícita del negocio.

**Los estados de persona se automatizan** con historial: `prospecto` → `activo` →
`inactivo`, y cada cambio queda registrado.

**Integraciones (WhatsApp, correo, IA).** El estudio de Fase 0 evaluó las
opciones; las decisiones de fondo —vía oficial o no oficial para WhatsApp,
verificación del dominio de correo— **siguen pendientes** y están en
`ESTADO-Y-PROPUESTAS.md` §5.

---

## 9. Revisión de la interfaz de Clientes · 04-08-2026

Hecha mirando la pantalla real y contrastando cada cosa con el código y la base.

### A · Cosas que no cuadran con los datos

**81 clientes son invisibles.** La lista filtra `en_cartera IS NOT FALSE`, así que
de los 121 dados de baja solo se ven **40**. Los otros **81 no aparecen en ninguna
pestaña**: existen en la base y no hay forma de llegar a ellos desde el CRM. Si un
ex cliente vuelve, no se puede encontrar su ficha.

**El contador «De baja» dice 40 y en la base son 121.** No está mal calculado —
cuenta lo que muestra— pero nadie puede adivinar que hay 81 escondidos.

### B · Botones que dicen una cosa y hacen otra

**«ACTIVAR EMPRESA» no activa al cliente.** Lo *selecciona* como empresa de
trabajo para el resto de la aplicación. El problema es dónde está: un botón verde
grande, arriba del todo, a cuatro centímetros de una etiqueta que dice **ESTADO
DEL SERVICIO: ACTIVO**. Cualquiera entiende que sirve para reactivar un cliente
dado de baja. Debería decir **«Trabajar con esta empresa»**.

**La barra del 70%** mide cuántos campos de la ficha están completos. En ninguna
parte lo dice: se ve una barra naranja y un número sin explicación.

**«Score 60»** tampoco se explica. Se calcula solo desde los estados, pero quien
lo mira no sabe si 60 es bueno, malo, ni qué habría que hacer para subirlo.

### C · La columna «Estados» se lee como si repitiera

Cada fila apila tres etiquetas:

```
PEND. PAGO $10.000     ← lo que debe en total
F29 DECLARADO
JULIO: POR PAGAR       ← el estado del cobro de este mes
```

La primera y la tercera **son datos distintos** —deuda acumulada contra el cobro
del mes en curso— pero puestas una debajo de la otra se leen como lo mismo dicho
dos veces. Y tres etiquetas por fila hacen que la tabla ocupe el triple de alto:
con 93 clientes son muchas pantallas de desplazamiento.

### D · Falta lo que más se usa

- **El correo no se ve en la lista.** Solo aparece el teléfono, y el correo es
  justamente el dato con el que salen los recordatorios de pago.
- **No hay columna de ejecutivo responsable.** No se puede mirar la lista y saber
  de quién es cada cliente.
- **No se ve la última interacción**, así que no se distingue a quién no se
  contacta hace tres meses.

### E · La ficha es una isla

Desde un cliente solo se puede saltar a **Facturador** y **Bancos**. No hay forma
de ir a:

| Debería llevar a | Para responder |
|---|---|
| Sus documentos emitidos | «¿qué le facturamos el mes pasado?» |
| Su cobro del mes | «¿ya se le emitió?» |
| Los correos que recibió | «¿le llegó el recordatorio?» |
| Sus tareas | «¿qué tenemos pendiente con él?» |

Hoy esas cuatro preguntas obligan a salir del CRM, cambiar de módulo y volver a
buscar al mismo cliente a mano.

### F · Qué se arregló el mismo día

| Antes | Ahora |
|---|---|
| Botón **«Activar Empresa»** junto a la etiqueta *Estado del servicio: ACTIVO* | **«Trabajar con esta empresa»**, con aviso de qué hace: contabilidad, facturación y bancos pasan a esa empresa. Ya no se confunde con reactivar un cliente de baja |
| El correo solo aparecía **si no había teléfono** | Se ven **los dos**, y el correo se copia de un clic sin abrir la ficha |
| Barra «70%» sin explicación | Al pasar el cursor **lista los campos que faltan**, uno por uno. Deja de ser un adorno y pasa a ser una lista de tareas |
| «Score 60» sin explicación | Dice qué significa el número y aclara que **lo calcula la base**, no una persona |
| Tres etiquetas apiladas: deuda, F29 y cobro del mes | **Dos filas**: arriba la cobranza —deuda y cobro del mes juntos, que es lo que se compara—, abajo el F29. Cada cliente ocupa un tercio menos de alto |

### G · Segunda tanda, el mismo día

| Antes | Ahora |
|---|---|
| **81 clientes inalcanzables**: los que salieron de la planilla no aparecían en ninguna pestaña | Botón **«Fuera de cartera»**. Verificado: 133 en cartera + 83 fuera = 216, sin repetidos. Un ex cliente que vuelve ya se encuentra en vez de duplicarse |
| La ficha solo llevaba a Facturador y Bancos | Cuatro accesos más: **Cobro del mes**, **Correos**, **Tareas** — las preguntas que antes obligaban a salir del CRM y buscar al cliente a mano en otro módulo |
| El filtro por responsable solo funcionaba dentro de «Creadas por usuarios» | Funciona **en toda la lista**, y la columna «Responsable» se ve siempre |

**Verificado, 10 de 10:** los tres conjuntos de cartera cuadran, ningún cliente se
contradice con su deuda, Victor recibe 404 al editar, cambiar el plan o eliminar
un cliente ajeno, el dueño sí puede, el giro ya se vacía y la razón social sigue
protegida con un aviso claro.

### H · Lo que queda pendiente de la interfaz

1. **Última interacción**, para ver a quién no se contacta hace meses. Requiere
   traer el dato desde `nota` / interacciones: es cambio de backend, no de pantalla.
2. **Edición en línea** desde la tabla, sin abrir la ficha.
3. **Acciones en lote** más allá de registrar pago y eliminar: cambiar plan,
   asignar responsable, dar de baja.

### H · Qué haría, por orden

1. **Renombrar «Activar Empresa»** — es el único que puede provocar un error real
2. **Mostrar el correo en la lista** y poder copiarlo de un clic
3. **Explicar la barra y el score** con una ayuda al pasar el cursor
4. **Juntar las tres etiquetas de estado en una sola línea** y separar visualmente
   la deuda del cobro del mes
5. **Una pestaña «Fuera de cartera»** para llegar a los 81 invisibles
6. **Accesos desde la ficha** a facturas, cobro, correos y tareas del cliente
7. **Columna de ejecutivo** y filtro por ejecutivo

---

## 10. Requerimientos pendientes propuestos

Lo que hoy **no está escrito como requerimiento** y debería, para poder decidir
qué entra y qué no. Prioridad: **A** = se nota todos los días · **B** = se nota
cuando crece · **C** = comodidad.

### 10.1 Buscador

| ID | Requerimiento | Prio |
|---|---|---|
| RF-BUS-01 | Buscar en el **servidor**, no sobre lo ya descargado | A |
| RF-BUS-02 | Buscar por RUT **con o sin** puntos y guion, indistintamente | A |
| RF-BUS-03 | Buscar por razón social, nombre de fantasía, representante, correo, teléfono, giro y comuna | A |
| RF-BUS-04 | Tolerar acentos y mayúsculas (*jose* encuentra *José*) | A |
| RF-BUS-05 | Buscar varias palabras sueltas en cualquier orden | B |
| RF-BUS-06 | Resaltar en el resultado el texto que coincidió | C |
| RF-BUS-07 | Recordar las últimas búsquedas del usuario | C |
| RF-BUS-08 | Buscar por RUT debe funcionar aunque el RUT esté **cifrado** en la base | A |

> **RF-BUS-08 no es un detalle.** El RUT se guarda cifrado y se busca por hash,
> lo que permite la coincidencia exacta pero **no la parcial**: hoy no se puede
> buscar «empieza con 76». O se acepta esa limitación por escrito, o se agrega
> una columna con los últimos dígitos en claro para poder buscar.

### 10.2 Filtros

| ID | Requerimiento | Prio |
|---|---|---|
| RF-FIL-01 | Filtrar por estado de pago, estado F29, plan, ejecutivo, comuna y régimen | A |
| RF-FIL-02 | Combinar varios filtros a la vez | A |
| RF-FIL-03 | Ver los filtros activos como etiquetas, y quitarlos de a uno | A |
| RF-FIL-04 | Botón de **limpiar todo** | A |
| RF-FIL-05 | Mostrar **cuántos** resultados calzan, no solo la lista | A |
| RF-FIL-06 | Los filtros viven en la URL, para compartir o recargar sin perderlos | B |
| RF-FIL-07 | **Vistas guardadas** con nombre («mis morosos», «sin declarar») | B |
| RF-FIL-08 | Filtrar por rango de deuda y por antigüedad de la deuda | B |
| RF-FIL-09 | Filtrar por «sin correo», «sin teléfono», «sin representante» — para completar datos | B |

### 10.3 Tablas

| ID | Requerimiento | Prio |
|---|---|---|
| RF-TAB-01 | **Paginación en el servidor** con total real | A |
| RF-TAB-02 | Ordenar por cualquier columna, ida y vuelta | A |
| RF-TAB-03 | Elegir qué columnas se ven, y que la elección se recuerde | B |
| RF-TAB-04 | Encabezado fijo al desplazar | B |
| RF-TAB-05 | **Editar en línea** los campos frecuentes sin abrir la ficha | A |
| RF-TAB-06 | Selección múltiple con «seleccionar todo lo filtrado», no solo lo visible | B |
| RF-TAB-07 | Acciones en lote: cambiar plan, asignar ejecutivo, dar de baja, enviar correo | A |
| RF-TAB-08 | Copiar al portapapeles el RUT, el correo o el teléfono desde la fila | B |
| RF-TAB-09 | Exportar **solo lo filtrado**, no siempre todo | A |
| RF-TAB-10 | Densidad de fila ajustable (cómoda / compacta) | C |

### 10.4 Traslado y manejo de información

| ID | Requerimiento | Prio |
|---|---|---|
| RF-DAT-01 | **Importar actualizaciones** calzando por RUT, no solo altas nuevas | A |
| RF-DAT-02 | Previsualizar la importación: qué se crea, qué se actualiza y qué se rechaza, **antes** de aplicar | A |
| RF-DAT-03 | Informe de errores por fila, descargable, para corregir y reintentar | A |
| RF-DAT-04 | Deshacer una importación completa | B |
| RF-DAT-05 | Plantilla de importación descargable con las columnas esperadas | B |
| RF-DAT-06 | Historial de cambios por cliente: qué cambió, quién y cuándo | B |
| RF-DAT-07 | Fusionar dos clientes duplicados conservando el historial de ambos | B |
| RF-DAT-08 | Subir el logo como archivo, no solo por URL | C |

### 10.5 No funcionales

| ID | Requerimiento | Prio |
|---|---|---|
| RNF-CRM-01 | La primera pantalla carga en **menos de 2 segundos** con 1.000 clientes | A |
| RNF-CRM-02 | La búsqueda responde en **menos de 500 ms** | A |
| RNF-CRM-03 | **Bloqueo optimista**: avisar si alguien más editó mientras tanto, en vez de pisar | A |
| RNF-CRM-04 | Las credenciales **no viajan descifradas** al navegador | A |
| RNF-CRM-05 | Auditar quién consulta credenciales de un cliente | A |
| RNF-CRM-06 | Toda operación en lote deja constancia en la bitácora | A |
| RNF-CRM-07 | Las acciones destructivas se confirman diciendo **qué y cuánto** se va a afectar | A |
| RNF-CRM-08 | Uso completo por teclado, con foco visible | B |
| RNF-CRM-09 | La tabla se usa en un teléfono sin desplazamiento horizontal | B |
| RNF-CRM-10 | Importar 1.000 filas sin bloquear la pantalla | B |

---

## 11. Dashboard · auditoría y corrección del 01-09-2026

La pantalla de inicio del CRM nunca se había revisado contra la base. Al hacerlo
aparecieron nueve problemas, dos de ellos graves. Todo lo que sigue se verificó
contra producción antes y después de cada cambio.

**Archivos:** `metricasDashboard` y `eliminarTareasCompletadas` en
`crm.controllers.js`; `src/components/crm/views/CrmDashboard.jsx`.

### 11.1 Las ventas del mes estaban mal medidas ⛔ → ✅

El indicador principal y el gráfico de seis meses agrupaban los cobros por el
**período** al que corresponde el servicio, no por la **fecha en que se pagaron**.
Son cosas distintas: el cobro de julio se paga en agosto.

| Mes | Mostraba | Entró en caja |
|-----|---------:|--------------:|
| Agosto 2026 | $616.214 | **$4.671.956** |

Siete veces y media menos. El gráfico tenía el mismo desfase: cada barra corrida un
mes, y la última siempre hundida porque a ese período le faltaba casi toda la
cobranza.

Peor era el efecto en la meta: el día 1 de cada mes el indicador caía a $0 —no existe
aún ningún cobro con el período nuevo— y **se quedaba en 0% todo el mes**, porque los
pagos que iban entrando se registran contra el período anterior.

**Corregido.** `ventas_mes` y la serie del gráfico agrupan por `fecha_pago`. Decisión
de negocio de Felipe: la meta mide **caja**, no devengo. Así el número parte en cero
el día 1 y sube con cada pago.

`ingresos_esperados` («Por cobrar») sigue midiéndose por período y debe seguir así:
es lo emitido o por emitir del mes corriente que nadie ha pagado.

### 11.2 «Limpiar todas» borraba el trabajo de toda la firma ⛔ → ✅

El botón del widget de tareas eliminaba, para un administrador en modo «Equipo»,
**todas las tareas completadas de la organización**:

- **216 tareas** cerradas — el historial completo de trabajo terminado
- **356 comentarios** y **15 adjuntos**, que cuelgan de `tarea` con `ON DELETE CASCADE`
- **100** de ellas pertenecían a proyectos de Tickets, ajenos a este widget

El aviso decía «¿Eliminar N tarea(s)?» con el número de las que se veían en pantalla.
`tarea` no guarda historial: no hay vuelta atrás.

**Corregido.** El lote respeta las mismas reglas que el borrado individual: solo lo
propio, nunca una tarea madre —el CASCADE se llevaría a sus hijas abiertas—, nunca las
archivadas. Queda en bitácora y el aviso explica qué se borra y qué no.

### 11.3 Las reuniones marcaban cero desde siempre ⛔ → ✅

Los dos indicadores buscaban tareas con `tipo = 'reunion'`. Esas tareas **no existen**:
las 447 registradas son de tipo `'tarea'`. Las reuniones viven en la tabla `reunion`,
que el dashboard nunca consultaba.

**Corregido.** Los indicadores y el feed leen `reunion` con el mismo criterio de
visibilidad del módulo (creador o participante). Pasaron de 0 a 7.

El menú **Crear → Reunión / Ticket** creaba una tarea marcada con ese tipo: una
reunión sin hora de término, sin participantes y sin aviso al cliente, guardada donde
nadie la buscaría. Ahora llevan a su módulo.

### 11.4 Tres widgets contaban «ganado» de tres maneras ⚠️ → ✅

| Widget | Decía |
|--------|-------|
| Embudo | Ganados: **2** |
| Conversión | **0** de 130 |
| Ranking | **0** para los tres |

Daniel Tiznado y Eduardo están marcados «Ganado» en su estado comercial pero conservan
`estado = 'prospecto'` porque nadie los convirtió a cliente. El embudo contaba ambas
condiciones; los otros dos, solo la primera.

**Corregido.** Los tres usan la definición del embudo: cliente activo **o** marcado
como ganado. La conversión pasó a 2%.

### 11.5 El embudo perdía una persona y contaba otra dos veces ⚠️ → ✅

Seis `COUNT` con condiciones que se pisaban: un prospecto perdido caía en «Perdidos» y
también en «Prospectos» —tenía el estado comercial vacío—, mientras «En pausa» no
calzaba con ningún patrón y desaparecía. Las barras sumaban 132 sobre 133.

**Corregido.** Una sola clasificación con `CASE` en cascada; lo que no calza cae en
«Otros», que se muestra en vez de esconderse. Las barras suman el total exacto.

### 11.6 El botón «Mías / Equipo» no filtraba las tareas ⚠️ → ✅

En «Mías» se enviaba `scope: ''`, que el servicio descarta por vacío y el backend
resuelve como «todas»; en «Equipo» se enviaba `'equipo'`, que desde los integrantes por
proyecto significa lo mismo. **Las dos posiciones devolvían la misma lista.**

Además el indicador contaba `responsable_id OR creado_por` mientras la lista pedía
responsable o colaborador. Como el administrador creó casi todo al importar, la
pantalla decía **165 pendientes** sobre una lista de 48.

**Corregido.** Ambos usan la misma definición de «mías». Indicador y lista coinciden.

### 11.7 Correcciones menores ✅

- Las tareas **en proceso** y **en revisión** no salían en la lista: filtraba
  `estado === 'pendiente'` y dejaba fuera 12 que sí son trabajo abierto.
- «Tareas completadas» no tenía tope superior: con rango personalizado contaba también
  lo cerrado después del «hasta».
- El basurero de cada fila **borraba sin preguntar** —está pegado al círculo de
  completar, del mismo tamaño— y **se tragaba los errores**: si el servidor rechazaba
  por permisos, la fila desaparecía igual.
- Dos cobros invisibles: CASTINOX y AWKA tenían `organizacion_id` nulo en su cobro de
  septiembre. Corregidos tomando la organización desde su empresa.
- Código muerto: `reunionesHoyList` calculaba una lista que nadie usaba sobre un tipo
  inexistente; `vencidas.includes()` recorría el arreglo entero por cada tarea.

### 11.8 Rediseño de la pantalla

El problema no era el color sino la **jerarquía**: catorce cifras del mismo tamaño,
cada una con su marco y su círculo, todas en mayúsculas y negrita. Nada destacaba
porque todo gritaba.

Criterio: **informe de gestión, no tablero de colores.**

- Tres pesos tipográficos y ninguno más; `tabular-nums` en toda cifra para que los
  dígitos se alineen en columna.
- El color **solo donde hay que actuar**: rojo para vencido y cobros atrasados.
- El embudo pasó de seis colores saturados a una familia que se aclara al avanzar la
  etapa, más verde de ganado y rojo de perdido — las etapas son una progresión, no
  categorías sueltas. Se agregó el porcentaje junto a cada cifra.
- Diez cifras sueltas agrupadas en dos tarjetas, separadas por reglas verticales.
- El calendario se achicó: con el 81% de las tareas sin fecha estaba casi vacío y
  ocupaba un tercio de la pantalla.
- Las tres columnas de tareas comparten alto (medían 166, 346 y 311 px).
- El gráfico recuperó su eje Y: sin él el área no se dibujaba y no se podía leer un
  monto. Dominio desde cero, para que las alturas sean comparables.

**Contraste medido, no estimado.** Se midió cada combinación de color y tamaño contra
su fondo real: **0 fallos** en WCAG AA. Tres textos que fallaban —la pestaña
«Cerradas» en 2.56, los días del calendario en 1.48 y los subtextos de las filas— se
corrigieron subiendo el gris.

### 11.9 Pendiente del dashboard

- ⏭️ **No hay meta mensual configurada.** `crm_config` está vacía, así que la tarjeta
  «Meta del mes» y la barra de avance salen en cero por más que las ventas ya se
  calculen bien. Se fija desde «Definir». Referencia: los últimos seis meses promedian
  unos $3,9M mensuales.
- ⏭️ **«Sin contacto: 129»** es correcto pero son 129 de 130 prospectos: como alerta no
  distingue nada. Falta un criterio de cartera.
- ⏭️ **187 de 231 tareas activas no tienen fecha de vencimiento** (81%). Por eso el
  calendario se ve vacío y «Vencen hoy» marca cero. No es falla del sistema: no se
  están poniendo las fechas.
- ⛔ **Nada de esto está en producción.** Falta desplegar y reiniciar; `config.js`
  apunta a `localhost:4000` en vez de Railway.

---

## 12. Dónde vive cada cosa

| | |
|---|---|
| Backend clientes | `src/controllers/clientes.controllers.js` |
| Backend prospectos | `src/controllers/personas.controllers.js` |
| Backend cobranza | `src/controllers/cobros.controllers.js` |
| Estado de pago derivado | `estadoDePago()` en `clientes.controllers.js` |
| Registrar pago | `PUT /cobros/empresa/:empresaId/pagar` |
| Pantalla principal | `src/components/CRM.jsx` |
| Tabla de clientes | `src/components/crm/views/CrmTableList.jsx` |
| Ficha del cliente | `src/components/crm/modals/ClientDetailDrawer.jsx` |
| Dashboard (pantalla) | `src/components/crm/views/CrmDashboard.jsx` |
| Dashboard (cifras) | `metricasDashboard()` en `crm.controllers.js` |
| Tablas | `empresa`, `persona`, `persona_empresa`, `cobro_mensual`, `empresa_servicio`, `plan`, `audita` |

> ⚠️ `audita` **no es** un registro de auditoría, pese al nombre: es la tabla que
> relaciona usuarios con empresas. La auditoría real está en `bitacora_sistema` y
> `empresa_auditoria`.
