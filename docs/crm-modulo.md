# Módulo CRM · Cómo funciona, qué tiene y qué falta

**Última revisión:** 4 de agosto de 2026 · verificado contra el código y la base de datos.
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

### F · Qué haría, por orden

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

## 11. Dónde vive cada cosa

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
| Tablas | `empresa`, `persona`, `persona_empresa`, `cobro_mensual`, `empresa_servicio`, `plan`, `audita` |

> ⚠️ `audita` **no es** un registro de auditoría, pese al nombre: es la tabla que
> relaciona usuarios con empresas. La auditoría real está en `bitacora_sistema` y
> `empresa_auditoria`.
