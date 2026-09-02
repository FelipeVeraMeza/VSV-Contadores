# Módulo de Contabilidad · Estado y aislamiento

**Última revisión:** 1 de septiembre de 2026
**Responsable del módulo:** Victor (según la tarea madre CONTABILIDAD)
**Estado:** funcionando sobre datos reales · aislamiento por empresa **puesto el
20-08-2026** · comprobantes **reiniciados a cero el 25-08-2026** (ver 3.9) ·
**cinco tareas cerradas el 01-09-2026** (ver sección 8)

> ⚠️ **Las cifras de la sección 3 son del 19 y 20 de agosto y ya no describen el
> presente.** Se dejan como están porque son el registro de qué se midió y por
> qué se cambió lo que se cambió; para el estado de hoy, ir a la **sección 3.9**.
> Lo que sigue valiendo entero es el diagnóstico: las causas, los cinco arreglos
> y la forma del portero.

> Este documento no existía. Se escribió porque el módulo se estaba discutiendo
> con una suposición equivocada —«a Victor le sale en blanco»— que no resistió
> una medición: veía las 99 empresas de la oficina y toda su contabilidad. La
> sección 3 cuenta qué se midió, qué se arregló y qué falta. Todo está medido
> contra la base real con los dos scripts de la sección 5, no contra lo que
> aparenta la pantalla.

---

## 1. Qué es y dónde vive

Ocho secciones en el menú lateral, todas bajo `/contabilidad?sub=<id>`:

| Sección | Qué hace | Estado |
|---|---|---|
| **Compras** | Libro de compras, contabilizar documento a documento | ✅ datos reales |
| **Ventas** | Libro de ventas, ídem | ✅ datos reales |
| **Honorarios** | Boletas de honorarios | ✅ datos reales |
| **Recaudaciones** | Caja: lo que entra | ✅ datos reales |
| **Pagos** | Caja: lo que sale | ✅ datos reales |
| **Centralización** | Comprobantes contables (libro diario) | ✅ datos reales |
| **Reportes** | Libro Diario · Libro Mayor · Balance General · Estado de Resultados | ✅ datos reales |
| **Traspaso Apertura** | — | 🔨 en construcción |

**«Conexión SII» se eliminó el 20-08-2026.** Era un cartel de «en construcción»
sin nada detrás: ocupaba un lugar en el menú y prometía algo que no existía. Se
quitó de las tres partes donde vivía —el menú (`MainPage.jsx`), el título y el
`case` del router (`Contabilidad.jsx`)— y con ella el ícono `Cloud`, que no se
usaba en ningún otro lado. Sacar el SII de acá **no toca nada del SII de
verdad**: las credenciales, el robot y la facturación siguen intactos.

**Dónde vive cada cosa**

| | |
|---|---|
| Pantalla principal | `src/components/Contabilidad.jsx` |
| Compras / ventas / honorarios | `contabilidad/MovimientosContables.jsx` |
| Caja | `contabilidad/GestionCaja.jsx` |
| Centralización y Libro Diario | `contabilidad/AsientosContables.jsx` |
| Reportes | `contabilidad/ReportesHub.jsx` → `LibroMayor.jsx`, `Balances.jsx` |
| Backend contable | `src/controllers/accounting.controllers.js`, `caja.controllers.js`, `centralizacion.controllers.js` |
| Compras y ventas (lectura) | `src/controllers/dteConsulta.controllers.js` |
| Rutas | `src/routes/accounting.routes.js`, `dteConsulta.routes.js` |

### 1.1 Código que ya no se usa

Está en la carpeta, se lee como si funcionara y **nadie lo renderiza**. Conviene
saberlo antes de perder una tarde arreglando una pantalla que no se abre por
ningún camino:

| Archivo | Situación |
|---|---|
| `ContabilidadStats.jsx` | Nadie lo importa. Además pinta 4 tarjetas con cifras **inventadas en el servidor** ($15.500.000 de activos, siempre iguales para toda empresa y todo usuario) |
| `PlanDeCuentas.jsx` | Nadie lo importa. El plan de cuentas hoy solo se usa como desplegable dentro de Movimientos |
| `RegistroComprasVentas.jsx` | Nadie lo importa |
| `LibroDiarioSuperficial.jsx` | Nadie lo importa |
| `ReportesContables.jsx` | Nadie lo importa |
| `ConciliacionBancaria.jsx` | `Contabilidad.jsx` lo **importa pero no lo usa**: no hay ningún `sub` que lo muestre |

En el backend pasa lo mismo con dos endpoints que devuelven texto escrito a mano
en vez de consultar la base:

- `GET /accounting/metrics` — cifras fijas. Solo lo llamaba `ContabilidadStats`, que está muerto.
- `GET /accounting/journal-entries` — dos asientos de ejemplo ("Apertura de Caja Mensual"). Ningún componente lo llama.

Ninguno de los dos hace daño hoy porque nadie los mira. Sí lo harían el día que
alguien los conecte creyendo que traen datos.

---

## 2. Los dos juegos de libros

Es la pregunta P4 de la tarea madre, y la respuesta ya está en el código:

| Empresa | Sus ventas | Sus compras |
|---|---|---|
| **La firma** (`empresa.es_principal = true`) | `documentos_emitidos` — ojo: `empresa_id` es **el cliente al que se le factura**, no la firma, porque así lo enlaza el Cobro del Mes | `documentos_recibidos` |
| **Cualquier otra empresa** | `documentos_emitidos_empresa` | `documentos_recibidos_empresa` |

El libro se elige por **qué empresa está seleccionada**, no por si hay una
seleccionada o no (`libroDe()` en `dteConsulta.controllers.js`). Con "Todas las
empresas" se leen los dos juegos y se suman.

### 2.1 Dos trampas del asiento, encontradas probando

**El código de la cuenta viaja con tres nombres.** Al **leer** un comprobante las
líneas salen con `cuenta_codigo`; al **escribirlo**, `upsertComprobante` leía solo
`cuenta` o `numero_cuenta`. Una línea con cualquier otro nombre se descartaba **en
silencio**, y la llamada respondía 200 con su número correlativo: el asiento se
daba por guardado y no existía — un comprobante sin líneas no aparece en ninguna
lista, porque todas cruzan con `comprobantes_detalle`. Corregido el 20-08: se
aceptan los tres nombres (releer un asiento y volver a guardarlo ahora funciona)
y un comprobante que se quede sin ninguna línea **falla y se deshace** en vez de
fingir que se guardó.

**El Balance clasifica por el primer dígito del código:** `1` activo, `2`/`3`
pasivo y patrimonio, `4` gasto, `5` ingreso. Una cuenta cuyo código no empiece
por 1-5 aparece en el Libro Mayor pero **no suma en ninguna parte** del Balance ni
del Estado de Resultados, y nada lo advierte. El plan de cuentas deja crearlas.

**Comprobantes contables** (`comprobantes` + `comprobantes_detalle`) son una sola
tabla para todos. Hoy hay **1.173 comprobantes, y 1.172 tienen `empresa_id` en
NULL**: se cargaron en modo consolidado. Eso importa para la sección siguiente.

**Plan de cuentas**: 289 cuentas, **todas de una sola empresa**. No hay ninguna
cuenta base compartida (`empresa_id IS NULL`), aunque el código está preparado
para ellas.

---

## 3. Aislamiento · lo que se creía y lo que se midió

### 3.1 Lo que se creía

> «El módulo de Contabilidad le sale en blanco a Victor para poder trabajarlo
> desde cero, pero Mati y yo sí lo vemos.»

### 3.2 Cómo debería funcionar

El 5 de agosto (`2026-08-05_victor_al_equipo.sql`) se cambió el mecanismo. Antes
Victor tenía **organización propia** y por eso no veía nada; el efecto secundario
fue que tampoco se le podían asignar tareas. Así que se le movió a la
organización del equipo y el «empezar en cero» pasó a lograrse con una bandera
por usuario:

```
usuario.ve_solo_empresas_asignadas = true
        ↓
solo ve las empresas que tenga en `audita`
        ↓
Victor tiene 0 empresas en audita  →  el módulo debería estar vacío
```

Estado de las cuentas **el 19-08-2026**, que es lo que motivó todo esto. Los tres
están en la misma organización:

| Usuario | Rol | `ve_solo_empresas_asignadas` | Empresas en `audita` |
|---|---|---|---|
| Administrador master | Administrador | false | 212 |
| MATIAS OLIVOS | Administrador | false | 215 |
| **VICTOR VOLLAIRE** | Administrador | **true** | **0** |

La organización *VSV CONSULTORES* quedó vacía a propósito, sin borrar, para poder
revertir el cambio.

> ⚠️ **Esa tabla ya no describe el presente.** El 20-08 el negocio corrigió el
> criterio: Victor es de la oficina y debe ver la cartera completa, así que se le
> apagó la bandera (`2026-08-20_victor_ve_todas_las_empresas.sql`). Hoy los tres
> ven lo mismo: 138 en el CRM y 99 en el selector.
>
> El recorte **no se deshizo**, cambió de destinatario: es para las cuentas de
> FUERA de la organización. `veSoloAsignadas()` ya devuelve true para el rol
> `Cliente` por sí sola, sin depender de la bandera, así que todos los porteros
> de 3.7 siguen en pie y siguen aplicando a quien corresponde.

### 3.3 Lo que se midió el 19-08 · el módulo NO estaba en blanco

De 21 comprobaciones, **13 fallaban**:

| # | Qué se pidió | Debería | Devolvía |
|---|---|---|---|
| A1 | Selector de empresas del encabezado | 0 | **99 empresas** |
| B1 | Plan de cuentas, consolidado | 0 | **289 cuentas** |
| B2 | Comprobantes, consolidado | 0 | **1.173** |
| B3 | Balance, consolidado | 0 | **7 cuentas con saldo** |
| B4 | Ventas, consolidado | 0 | **1.182 documentos** |
| B5 | Compras, consolidado | 0 | **128 documentos** |
| C1–C4 | Los mismos datos **eligiendo una empresa que no tiene asignada** | bloqueado | todo, sin resistencia |
| E2, E3, E5 | Lo mismo desde una organización **distinta y vacía** | 0 | **1.172 comprobantes** |

Lo único que respetaba la bandera era la **lista del CRM** (A3 en verde: 0
empresas). Por eso la impresión era que estaba aislado: el CRM se veía vacío, y
de ahí se dedujo que Contabilidad también.

### 3.4 Por qué pasaba · las cuatro causas

**1. El selector global no mira la bandera.**
`listCompaniesLista()` — `src/controllers/companies.controllers.js:49` — es la
fuente única de todos los selectores de empresa del sistema
(`useEmpresasLista` → `GlobalCompanySelector`). Aplica el filtro de `audita`
solo cuando `rol === 'Cliente'`. Victor es Administrador, así que se lo salta y
recibe las 99. `getClientesCRM()` sí mira `veSoloEmpresasAsignadas`; por eso una
lista sale vacía y la otra no.

**2. Compras y ventas eximen al Administrador.**
`rechazoDeAlcance()` — `dteConsulta.controllers.js:87` — abre con
`if (req.user?.rol === 'Administrador') return null;`. La comprobación contra
`audita` que viene después nunca se ejecuta para un administrador. La regla se
escribió pensando en los roles Cliente y Consultor, antes de que existiera la
bandera por usuario.

**3. Contabilidad nunca valida el `empresaId` que recibe.**
Todos los endpoints de `accounting.controllers.js` toman `empresaId` del query y
lo usan tal cual. No hay ninguna comprobación de que esa empresa sea de la
organización de quien pregunta, ni de que la tenga asignada. `clienteSinEmpresa()`
solo frena a los **no** administradores, y solo en la vista consolidada.
Consecuencia: basta escribir el `empresaId` en la URL para leer la contabilidad
de cualquier empresa.

**4. El consolidado incluye lo que no tiene dueño.**
`condicionEmpresaComprobante()` — `accounting.controllers.js:256` — resuelve la
vista consolidada como `empresa_id IS NULL OR empresa_id ∈ (empresas de mi
organización)`. Los 1.172 comprobantes con `empresa_id` en NULL **no pertenecen
a ninguna organización**, así que entran en el consolidado de todas. Un tenant
recién creado, sin una sola empresa, ve esos 1.172 (pruebas E2 y E3).

**Nota aparte:** `accounting.routes.js` importa `requireModulo` y nunca lo aplica.
Hoy no cambia nada —los tres usuarios tienen `puede_ver_contabilidad = true`—,
pero significa que la bandera de módulo por usuario es un candado de pantalla:
esconde la sección del menú y el backend igual responde. Es exactamente lo que el
módulo de Tareas evita con su «triple candado».

### 3.5 El flujo completo, probado de punta a punta

Lo anterior mide qué ve Victor **hoy**. Pero el pedido del negocio es más
concreto: *«Victor debería ver solamente las empresas que él cree, y de esos
clientes gestionar la extracción de datos»*. Eso se probó entero —creando un
cliente de verdad y borrándolo al terminar— con
`verificar_2026-08-19_flujo_victor_crea_cliente.mjs`.

**La mitad buena: crear y trabajar SU cliente funciona completo.**

| Paso | Resultado |
|---|---|
| Victor crea el cliente | ✅ HTTP 201, queda guardado |
| Queda con `organizacion_id` | ✅ |
| Queda asignado a él en `audita` | ✅ 1 fila, a su nombre |
| Lo ve en la lista del CRM | ✅ ve exactamente **1**: el suyo |
| Abre la contabilidad de ese cliente | ✅ responde, 0 filas — correcto, es nuevo |
| Plan de cuentas, comprobantes, compras y ventas de ese cliente | ✅ los cuatro responden |

O sea: **el circuito que se quería ya existe y funciona.** Crear el cliente lo
deja asignado a quien lo creó, y desde ahí la contabilidad de ese cliente se
abre y opera con normalidad. No hay nada que construir en esa mitad.

**La mitad que faltaba: no veía solo lo suyo, veía además todo lo demás.**

| Paso | Debería | Daba (19-08) | Da (20-08) |
|---|---|---|---|
| Selector del encabezado | 1 (el suyo) | **100** | ✅ 1 |
| Plan de cuentas de una empresa ajena | bloqueado | **289 cuentas** | ✅ HTTP 403 |
| Comprobantes de una empresa ajena | bloqueado | los entregaba | ✅ HTTP 403 |
| Ventas de una empresa ajena | bloqueado | **1.179 documentos** | ✅ HTTP 403 |
| Consolidado «Todas las empresas» | solo lo suyo → 0 | **1.173 comprobantes** | ✅ 0 |

La diferencia entre las dos mitades era exactamente esta: **`audita` se escribía
pero casi no se leía.** Al crear el cliente se registraba correctamente que es de
Victor; después, salvo la lista del CRM, nadie volvía a consultarlo. Lo que se
hizo el 20-08 fue, literalmente, ponerse a leerlo (ver 3.7).

### 3.6 Remuneraciones: el mismo agujero, todavía sin datos

Se probó igual, y daba lo mismo:

| Prueba | Debería | Daba (19-08) | Da (20-08) |
|---|---|---|---|
| Trabajadores de SU empresa | responde | ✅ HTTP 200 | ✅ HTTP 200 |
| Trabajadores de una empresa **ajena** | 403 / 404 | ❌ **HTTP 200** | ✅ HTTP 404 |
| Indicadores RRHH de una empresa **ajena** | 403 / 404 | ❌ **HTTP 200** | ✅ HTTP 404 |

> ⚠️ **Cuidado al leer esto:** hoy `rem_trabajador` tiene **0 filas**. No hay un
> solo trabajador cargado en todo el sistema. Que las consultas devuelvan vacío
> **no prueba que estén aisladas**: prueba que no hay nada que mostrar. Lo único
> que vale acá es el código HTTP, y dice que la puerta está abierta. El día que
> se cargue el primer trabajador, se cruza.

**La buena noticia** es que Remuneraciones ya tiene la forma correcta de la
solución. `remuneraciones.controllers.js:21` define un portero:

```js
const empresaPermitida = async (req, empresaId) => { ... }
```

…y lo llama antes de responder. El problema es que solo compara
`organizacion_id`. Como Victor está en la misma organización que todos, pasa.
**Le falta una condición, no una reescritura:** si el usuario tiene
`ve_solo_empresas_asignadas`, exigir además una fila en `audita`.

Ese portero, corregido, es el que se llevó a Contabilidad — que no tenía
ninguno.

### 3.7 Qué se hizo el 20-08-2026

**El portero, en un solo lugar.** `src/utils/scope.js` gana tres piezas que
comparten Contabilidad, Remuneraciones, compras/ventas y los selectores:

| | |
|---|---|
| `veSoloAsignadas(req)` | ¿este usuario ve solo lo asignado? (la bandera, o el rol Cliente) |
| `empresaPermitida(req, id)` | ¿puede tocar esta empresa? Comprueba organización **y** `audita`. Devuelve la empresa o `null` |
| `empresasVisibles(req)` | las empresas que puede ver, para acotar el consolidado. `null` = sin recorte; `[]` = no ve nada |

`empresaPermitida` estaba en `remuneraciones.controllers.js` y solo miraba la
organización. Se movió a `scope.js`, se le agregó la condición de `audita` y
ahora hay **una sola** versión de la regla en todo el sistema. Duplicarla era
justamente cómo se llegó a tener dos comportamientos distintos para lo mismo.

**Los cinco arreglos:**

| Dónde | Qué se cambió |
|---|---|
| `companies.controllers.js` · `listCompaniesLista` | Miraba `rol === 'Cliente'`; ahora mira `veSoloAsignadas`. Es la fuente única de **todos** los selectores, así que este cambio solo arregla el desplegable del encabezado en todas las pantallas a la vez. El `JOIN` va antes del `WHERE`, para que la excepción de «la principal va siempre» tampoco se cuele |
| `accounting.controllers.js` | Gana `puedeVerEmpresa()` al principio de cada endpoint con empresa: plan de cuentas, comprobantes, balance, balance PDF, documentos afectables, guardar comprobante, crear/editar/borrar cuenta, borrar comprobante |
| `accounting.controllers.js` · consolidado | `condicionEmpresaComprobante` recibe las empresas visibles. Para quien ve solo lo asignado, el consolidado son SUS empresas — y los comprobantes sin empresa quedan fuera, porque son de la carga global de la firma |
| `dteConsulta.controllers.js` · `rechazoDeAlcance` | Abría con `if (rol === 'Administrador') return null`, y eso se comía la regla entera. Ahora delega en `empresaPermitida`. El consolidado no se rechaza: se **acota**, para que abrir el módulo no dé un error en pantalla |
| `remuneraciones.controllers.js` · `listTrabajadores` | Sin empresa elegida listaba toda la organización; ahora se acota a las empresas visibles |

**Una decisión de diseño que conviene tener presente:** contabilizar **sin**
empresa seleccionada queda prohibido para quien ve solo lo asignado. Si se
permitiera, su asiento caería en el montón global de la firma y él mismo no
podría volver a verlo nunca.

**Lo que el recorte NO toca: el catálogo del negocio.** Se le quitan las
*empresas*, no las herramientas para dar de alta una. Los planes con su precio
base, los precios por tramo, los servicios y los ejecutivos son de la oficina y
llegan completos —medido: 6 planes, 17 servicios, 17 tramos y 3 ejecutivos, los
mismos que ve un administrador de planta—. Sin eso el formulario de alta quedaría
con los desplegables vacíos y no se podría crear ningún cliente, que es
justamente lo contrario de lo que se busca. Es el **paso 0** de la verificación
de punta a punta, y está ahí como contrapeso: la prueba falla si alguien aprieta
de más.

### 3.8 Lo que quedó abierto

**19 de 21 comprobaciones en verde.** Las dos rojas son la misma cosa:

> **E2 y E3 · los 1.172 comprobantes sin empresa.** Un administrador de *otra*
> organización los ve en su consolidado, porque `comprobantes` no tiene
> `organizacion_id` y esas filas tampoco tienen `empresa_id`.
>
> **CORREGIDO EL DIAGNÓSTICO (20-08-2026).** Acá decía que se habían «cargado a
> granel sin dejar rastro» y que no había de dónde deducir el dueño. Las dos
> cosas eran falsas: se había mirado `usuario_id` —que sí está en NULL— y no
> `contabilizado_por_id`, que está completo. Al preguntar por la columna
> correcta aparece todo:
>
> | | |
> |---|---|
> | Quién | **Victor**, los 1.172, sin excepción |
> | Cuándo | **19-08-2026, entre las 18:51 y las 22:41** — una sola sesión |
> | Qué | 1.048 ventas + 123 compras + 1 venta exenta (DTE 33 y 34) |
> | Período contable | 02-01-2025 a 18-08-2026 (351 de 2025, 821 de 2026) |
>
> O sea: **no es un problema histórico ni una importación vieja.** Es el botón
> «Contabilizar todo» usado en modo consolidado —sin empresa seleccionada— la
> noche anterior a esta auditoría. Todos los asientos cayeron al montón global
> en vez de a la empresa que les correspondía. Es exactamente el camino que
> después se cerró para las cuentas recortadas (ver 3.7, «contabilizar sin
> empresa seleccionada queda prohibido»), solo que Victor no estaba recortado
> cuando los creó.
>
> **Y se pueden recuperar.** Cada comprobante guarda `clase`, `tipo_dte` y
> `folio`, que es la llave del documento que lo originó — y ese documento sí
> sabe de qué empresa es. Cruzándolos:
>
> | | |
> |---|---|
> | Se resuelven sin ambigüedad | **1.159 (98,9 %)** |
> | Quedan ambiguos | **13** — mismo folio y tipo en dos empresas |
> | Sin documento de origen | **0** |
>
> ⚠️ El cruce va por `clase + tipo_dte + folio`, **sin** el RUT. Agregar el RUT
> lo empeora (126 sin correspondencia): el RUT del comprobante está normalizado
> y el del documento no siempre, así que la comparación falla por formato, no
> por contenido.
>
> **PENDIENTE, y no es parte de los cambios del 20-08.** Falta:
>   1. Asignarle su `empresa_id` a los 1.159 que se pueden deducir.
>   2. Revisar a mano los 13 ambiguos (son ventas DTE 33 al RUT 77938492-6).
>   3. Recién entonces decidir si `comprobantes` necesita además su propio
>      `organizacion_id`, o si con `empresa_id` bien puesto basta.
>
> No se hizo en el momento porque toca 1.159 asientos contables ya emitidos, con
> su folio correlativo: es una corrección de datos contables, no un ajuste
> técnico, y va aprobada y aparte.

**Sobre la bandera de módulo por usuario:** `accounting.routes.js` importa
`requireModulo` sin usarlo, pero eso **no** es un agujero: el candado está puesto
un nivel más arriba, en `server.js:109`
(`app.use('/api/accounting', …, requireModulo('contabilidad'), …)`). Sí quedan
fuera de ese candado **`/api/caja` y `/api/dte-consulta`**, que son parte del
mismo módulo: a quien tenga `puede_ver_contabilidad = false` se le esconde la
sección, pero esas dos rutas le responden igual. Hoy no cambia nada porque los
tres usuarios lo tienen en `true`.

### 3.9 Caja · lo que apareció el 20-08

Al probar la funcionalidad completa se auditó `caja.controllers.js`, que no se
había mirado y es la mitad del módulo (Recaudaciones y Pagos). Tenía aislamiento
por organización en el listado, pero:

| Qué | Estado |
|---|---|
| **Editar un movimiento** (`PATCH /caja/:id`) | Hacía el `UPDATE` directo contra el id, **sin mirar de quién era**. Con el id a mano se editaba la caja de otra organización |
| **Eliminar un movimiento** (`DELETE /caja/:id`) | Lo mismo, y además se lleva su asiento contable |
| Crear movimiento | Sin comprobación de empresa |
| Listar, vista global | `empresa_id IS NULL` — la caja de la firma — también para quien solo ve lo asignado |

Los cuatro quedaron cerrados con el mismo portero de 3.7, más
`movimientoFueraDeAlcance()` para los dos que solo reciben un id.

---

### 3.9 Estado al 25-08-2026 · se partió de cero

Lo de 3.8 **ya no está pendiente**: los 1.172 comprobantes sin empresa no se
reasignaron, se borraron junto con todo lo demás. El equipo decidió rehacer la
contabilización completa con el flujo nuevo.

| | Antes (20-08) | Ahora (25-08) |
|---|---|---|
| `comprobantes` | 1.291 | **0** |
| `comprobantes_detalle` | 3.871 | **0** |
| Comprobantes sin `empresa_id` | 29 | **0** |
| `documentos_emitidos` | 1.181 | **1.181** — intactos |
| `documentos_recibidos` | 42 | **42** — intactos |
| `documentos_emitidos_empresa` | 3 | **0** |
| `documentos_recibidos_empresa` | 86 | **0** |

**Los documentos no se tocaron**: las 1.223 facturas de la firma volvieron a
quedar como *Pendientes* y se contabilizan de nuevo. Las empresas administradas
(A&L SOLUCIONES, AMIL SPA y el resto) quedaron vacías del todo, a la espera de
una extracción nueva del SII.

Hay respaldo completo en `src/DatabaseThings/respaldos/` — filas enteras, se
pueden reinsertar. **Esa carpeta está en `.gitignore`**: son datos reales de
clientes.

> **Cuidado con el correlativo.** `numero_comprobante` vuelve a empezar en 1.
> Cualquier número que se haya comunicado fuera del sistema ya no calza.

**Se cerró la puerta que los creó.** Contabilizar sin empresa era posible para
los administradores y de ahí salieron los 29 sin dueño. Ahora hay triple
candado, como en Tareas:

| Capa | Dónde |
|---|---|
| La pantalla no abre sin empresa | `Contabilidad.jsx` — vale también para el Administrador |
| El asiento se rechaza (400) | `accounting.controllers.js` · `guardarComprobante` |
| El movimiento manual también (400) | `dteConsulta.controllers.js` · `crearMovimiento` |

Eso quita la vista consolidada de Contabilidad. Es a propósito: sumar todas las
empresas es una pregunta de reportes, no de un módulo donde cada botón escribe
asientos.

### 3.10 Cuentas imputables · 25-08-2026

El plan es un árbol y solo las hojas reciben movimientos. `plan_cuentas` ya lo
decía en `tipo_cuenta` y **ningún desplegable lo miraba**:

| `tipo_cuenta` | Cuántas | ¿Se imputa? |
|---|---|---|
| `SUBCUENTA` | 197 | sí |
| `MAYOR` · `SUBGRUPO` · `GRUPO` | **92** | no — son títulos |

Ofrecer `1 ACTIVOS` o `1104 DEUDORES POR VENTAS` no falla: el asiento se guarda
igual y deja el saldo colgado de una cuenta madre, descuadrando el Balance sin
aviso. `soloImputables()` vive en `src/lib/documento.js` y se aplica en los
**seis** desplegables (fila de Movimientos, revisión previa, y los modales de
Asiento, Nuevo Asiento, Nuevo Movimiento y Generador de Libro Diario).

---

## 4. Las tareas del módulo

> **Actualizado el 01-09-2026.** La tarea madre ya no está vacía: tiene seis
> subtareas y cinco quedaron cerradas ese día. El detalle de qué se construyó y
> cómo se probó está en la **sección 8**, al final de este documento. Lo que
> sigue es el estado anterior, que explica de dónde venía el módulo.

Dentro del propio sistema, en el proyecto **SOFTWARE SIMPLE PYME**:

**`CONTABILIDAD`** — responsable Victor · estado `en_proceso` · prioridad alta ·
**0 subtareas** · sin fecha de vencimiento · 0 comentarios · 0 adjuntos.

No es una tarea de trabajo: es la tarea madre que debería agrupar los trabajos de
Contabilidad, y está vacía. Su descripción lo dice y deja cinco preguntas
abiertas para poder abrir las subtareas:

| | Pregunta |
|---|---|
| P1 | ¿Qué es lo que más tiempo te quita hoy en Contabilidad? |
| P2 | Sacar compras y ventas del SII: ¿cuál es el paso que más falla? |
| P3 | ¿Qué informe te piden y hoy armas a mano? |
| P4 | Los libros: hay dos conjuntos de tablas. ¿Eso te sirve así o te complica? |
| P5 | ¿Qué revisas cada mes antes de cerrar? |

**P4 ya tiene respuesta** en la sección 2 de este documento.

La descripción también deja escrito el contexto técnico que ya se sabe: para
sacar compras y ventas del SII hay que entrar con el RUT del **representante
legal** de cada empresa y su clave (`sii_password_encrypted`), que es distinto de
facturar, que usa las credenciales de SIMPLE PYME.

**`REMUNERACIONES`** — también de Victor, también `en_proceso`, también **0
subtareas**. Mismo caso.

**Trabajo operativo de contabilidad** que sí está cargado, en el proyecto
*TICKETS COMERCAIL - OPERACIONES* (6 tareas, todas sin subtareas):

| Tarea | Responsable | Estado |
|---|---|---|
| APLAZAR IVA ESMEC | Victor | pendiente (vence 17-08) |
| JL MONTERO SPA | Victor | pendiente |
| hacer f29 NEW MEDIA PRODUCCION | Victor | completada |
| GATICA SPA | Victor | completada |
| aplazar f29 COMPAÑIA DE SOLUCIONES SERVICIOS ARQUITECTURA Y TECNOLOGIA SPA | Mati | pendiente |
| MAURICIO SILVA ALIMENTOS E.I.R.L. - F29 VENCIDOS | Mati | pendiente |
| HACER F29 GERARDO LAGOS PUBLICIDAD E.I.R.L. | Mati | pendiente |

> El módulo de Contabilidad **no tiene ni una sola subtarea** que describa qué
> hay que construirle. Mientras siga así, «avanzar en Contabilidad» no es una
> instrucción que alguien pueda tomar. Las cinco preguntas de arriba son el
> camino más corto: contestarlas convierte la tarea madre en trabajo concreto.

---

## 5. Cómo verificar que sigue en orden

Hay tres scripts, y responden preguntas distintas.

**1 · ¿Se cruza la información?** — solo lee, no escribe nada:

```bash
node src/DatabaseThings/migrations/verificar_2026-08-19_aislamiento_contabilidad.mjs
```

**2 · ¿Funciona el flujo de crear un cliente y trabajarlo?** — este **sí
escribe**: crea una empresa de prueba y la borra al terminar, pase lo que pase, e
informa si quedó algún residuo:

```bash
node src/DatabaseThings/migrations/verificar_2026-08-19_flujo_victor_crea_cliente.mjs
```

**3 · ¿El módulo hace bien su trabajo?** — el ciclo contable completo sobre una
empresa de prueba: crear cuentas, registrar una compra y una venta,
contabilizarlas, cobrar y pagar por caja, revisar Libro Mayor y Balance, y
deshacerlo todo. También escribe y se limpia sola:

```bash
node src/DatabaseThings/migrations/verificar_2026-08-20_contabilidad_funcional.mjs
```

Ninguno levanta el servidor: llaman a los controladores reales contra la base
real, igual que se verificaron las siete fases del módulo de Tareas. Los tres
resuelven los usuarios desde la base (no llevan UUID escritos a mano), así que
sirven en cualquier entorno.

**Lo que comprueba la número 3, y por qué importa:** además de que cada pantalla
responda, verifica que **la contabilidad cuadre** — partida doble (total debe =
total haber), ACTIVO = PASIVO + UTILIDAD, y utilidad = ingresos − gastos. Es lo
único que de verdad dice si el módulo sirve: *un balance descuadrado se ve igual
de bien en pantalla que uno correcto*. También comprueba que el módulo **rechace**
lo que debe rechazar: un asiento descuadrado, una nota de crédito sin documento
afectado, un código de cuenta repetido, un movimiento de caja en 0.

Las comprobaciones afirman **el comportamiento que debería haber**, no el que
hay:

| | 19-08 (antes) | 20-08 (después) |
|---|---|---|
| Aislamiento (21 pruebas) | 8 verdes · 13 rojas | **19 verdes · 2 rojas** (las de 3.8) |
| Flujo de punta a punta | pasos 1-4 ✅, pasos 5-6 ❌ | **todos ✅** |
| Funcional (41 pruebas) | — | **41 verdes** |

Negar el acceso vale de dos formas y las dos cuentan como correctas: cerrar la
puerta (**HTTP 403**) o abrirla a una pieza vacía (**0 filas**). Lo que no vale
es entregar datos.

Las pruebas **D** (que quien sí debe ver, ve) existen a propósito: sin ellas, una
consulta rota que devuelva vacío para todo el mundo pasaría por «aislamiento
perfecto». Son las que avisan si un cambio deja el módulo aislado de más y a
todos sin datos.

---

## 6. Lo que este módulo NO hace

Escrito a propósito, para que nadie lo busque:

- **No baja compras ni ventas del SII solo.** La sección «Conexión SII» existía
  como cartel de «en construcción» y se eliminó el 20-08; hoy los documentos
  llegan por otras vías.
- **No concilia con el banco.** La pantalla existe (`ConciliacionBancaria.jsx`)
  pero no está enchufada a ningún menú.
- **No tiene traspaso de apertura.**
- **No calcula indicadores de portada.** Los que hay son inventados y están
  desconectados (ver 1.1).
- **No separa los comprobantes sin empresa entre organizaciones.** Ver 3.8.

---

## 6bis. Revisión de los módulos vecinos · 20-08-2026

Se auditaron los módulos que no se habían mirado, buscando el mismo patrón que
falló en Contabilidad: **¿se comprueba el `empresaId` que llega, o se usa tal
cual?** Resultado, de peor a mejor:

| Módulo | Estado |
|---|---|
| **Operación Renta** | 🔴 **Está en el menú y es 100% inventado.** Cero consultas a la base. Le responde a cualquier empresa «Cumplimiento: Al día», «Balance Cuadrado», «No se detectan diferencias entre Libro Mayor y Registro de Compras», más KPIs de liquidez y endeudamiento. Es el más peligroso del sistema: no se ve como una maqueta, se ve como un informe |
| **Bancos** | 🔴 **No funciona, y no por falta de datos.** Los 555 movimientos están en Postgres, pero el módulo los lee con el cliente de Supabase y la clave está rechazada: `Unregistered API key`. Todos sus endpoints fallan. Ver 6ter |
| **Bancos · aislamiento** | ✅ **corregido el 20-08.** Sus 4 endpoints tomaban `empresaId` sin comprobarlo, incluidos los dos que ESCRIBEN (subir cartola, conectar el robot). Ahora usan el mismo portero |
| **Facturación / DTE** | ✅ La emisión se acota por las credenciales SII del propio usuario, no por `empresaId`. `getHistorialController` no comprueba nada, **pero su ruta se retiró el 31-jul**: es código muerto, no un hueco |
| **Cobros** | ✅ Filtra por `cm.organizacion_id` |
| **Correos** | ✅ Pasa `organizacion_id` a las consultas (`empresasDe(ids, orgId)`) |
| **Credenciales** | ✅ Se acota por `usuario_id` de la sesión, que es más estricto que por organización |
| **RRHH (`rrhh.controllers.js`)** | ⚠️ Maqueta vieja. Solo quedan 2 endpoints enchufados y únicamente los llama `GestionContratos.jsx`, que ningún menú renderiza |

> **La lección que se repite:** el filtro por organización estaba puesto en la
> vista «global» de casi todos los módulos, y ausente al elegir UNA empresa
> concreta. Es el punto ciego del sistema: se protege lo que se ve en pantalla
> y se confía en el parámetro que manda el navegador.

### 6ter · Bancos: el diagnóstico completo

`bancos.controllers.js` no usa el `pool` de Postgres como el resto del sistema:
abre su propio cliente de Supabase con `VITE_SUPABASE_URL` + `VITE_SUPABASE_KEY`.
Esa clave hoy está rechazada, así que **el módulo entero devuelve error**.

Los datos no se perdieron: `SELECT count(*) FROM movimientos_bancarios` desde
Postgres devuelve **555 filas de 1 empresa**. Están ahí, al alcance de la mano.

**La salida más corta es dejar de usar el cliente de Supabase y leer con el
`pool`,** igual que los otros 26 controladores. No hay que renovar ninguna clave
ni migrar datos: es la misma base, alcanzada por otro camino. De paso el módulo
deja de tener una segunda forma de conectarse que hay que mantener aparte.

### 6quater · Código muerto en Contabilidad, verificado uno por uno

| Archivo | Líneas | Situación |
|---|---|---|
| `PlanDeCuentas.jsx` | 383 | Nadie lo importa |
| `RegistroComprasVentas.jsx` | 385 | Nadie lo importa |
| `LibroDiarioSuperficial.jsx` | 137 | Nadie lo importa |
| `ContabilidadStats.jsx` | 124 | Nadie lo importa. Pinta 4 tarjetas con cifras inventadas |
| `ReportesContables.jsx` | 67 | Nadie lo importa |
| | **1.096** | **total sin usar** |
| `ConciliacionBancaria.jsx` | — | `Contabilidad.jsx` lo **importa pero nunca lo dibuja**: no hay `sub` que lo muestre. El import lo mete igual en el paquete final |

Y en el servidor, dos endpoints que devuelven texto escrito a mano:
`GET /accounting/metrics` (activos $15.500.000 fijos) y
`GET /accounting/journal-entries` (dos asientos de ejemplo). Ninguna pantalla los
llama hoy.

**No se borró nada.** Borrar es una decisión de quien mantiene el repositorio, y
además conviene hacerlo de una vez y con el `git status` limpio, para que quede
en un commit propio y sea fácil de revertir.

---

## 7. Documentos relacionados

| | |
|---|---|
| Estado general del sistema | `docs/ESTADO-Y-PROPUESTAS.md` — ojo: su sección 3 dice que «Victor tiene organización propia», que dejó de ser cierto el 5 de agosto |
| Módulo de Tareas | `docs/tareas-requerimientos.md` — de ahí sale el criterio del «triple candado» y el de verificar contra la base real |
| CRM | `docs/crm-modulo.md` |
| Remuneraciones | `docs/remuneraciones-modulo.md` |

---

## 8. Lo que se construyó el 01-09-2026

Sesión completa de revisión funcional del módulo, con Víctor y Matías como
usuarios de prueba. Se partió de una pregunta concreta —«¿estas cinco tareas
están funcionales?»— y terminó con cinco cerradas, un bug de integridad
corregido y dos funcionalidades nuevas.

**El criterio de prueba que se fijó y hay que mantener:**

> Probar siempre el **componente o el endpoint real**, nunca una réplica de su
> lógica. Se llegó a esa regla por las malas: la primera versión del QA de la
> palomita ejercitaba una copia de la lógica en una página aparte, daba 17/17, y
> al montar el componente de verdad aparecieron dos fallas que la copia no podía
> mostrar.

### 8.1 Resultado por tarea

| Tarea | Estado | Qué pasó |
|---|---|---|
| ELEGIR CUENTAS CONTABLES | 🟢 Cerrada | Ya funcionaba. Probado con ambos usuarios |
| BUG · cuenta inexistente | 🟢 Cerrada | Hallazgo nuevo. Corregido |
| Correlativo por empresa | 🟢 Cerrada | Ya funcionaba; el diagnóstico inicial era mío y estaba mal |
| Palomita / selección | 🟢 Cerrada | Construida |
| APROBAR CONTABILIDAD | 🟢 Cerrada | Construida |
| AÑADIR REMUNERACIONES | 🟡 Pendiente | Bloqueada por una definición contable, no por código |
| NUBOX vs SP CLOUD | ⚪ No aplica | Análisis de Víctor, vence 17-09-2026 |

### 8.2 El bug de integridad contable

**El servidor aceptaba asientos contra cuentas que no existen.** Se probó con la
cuenta inventada `9999-99`: respondió 200 y guardó el comprobante, con los dos
usuarios.

No era cosmético. `comprobantes_detalle.cuenta_codigo` es texto suelto sin clave
foránea, y el libro mayor lo une al plan con `LEFT JOIN`: una cuenta fantasma no
revienta nada, la fila aparece con el nombre en blanco y el monto queda fuera de
toda clasificación. Los informes dejan de cuadrar y nadie sabe por qué.

Por pantalla no pasaba —el selector solo ofrece cuentas válidas—, pero el código
entra igual por la carga masiva de Excel, por el generador de asientos, o cuando
se borra del plan una cuenta ya usada.

**Corregido en `guardarComprobante`**, que ahora comprueba dos cosas antes de
tocar la base:

1. Que el código **exista** en el plan de esa empresa (o en las cuentas base).
   Una cuenta de otra empresa no sirve.
2. Que sea **imputable**, o sea tipo `SUBCUENTA`. Los `GRUPO`, `SUBGRUPO` y
   `MAYOR` son títulos del plan («ACTIVOS», «DISPONIBLE»): agrupan, no reciben
   movimientos. Cargar contra un título descuadra el balance, porque el total
   del grupo deja de ser la suma de sus cuentas.

Si falla, responde 400 **diciendo cuál es la cuenta**. Verificado 17/17 con
ambos usuarios, incluidos los casos de dos cuentas malas a la vez y una cuenta
de otra empresa. Se revisó el histórico antes de tocar nada: cero detalles
apuntando a cuentas inexistentes, así que la validación no deja fuera ningún
asiento ya guardado.

### 8.3 El correlativo por empresa · una corrección de diagnóstico

Se reportó como problema que la numeración fuera global. **Era un error de
lectura mío:** vi el `nextval` en el valor por omisión de la columna y concluí
que venía de una secuencia global, sin revisar el código que inserta.

Ese `nextval` **nunca se usa**. El INSERT siempre pasa el número explícito,
calculado por `siguienteNumeroComprobante(client, empresaId)` — `MAX+1` de esa
empresa, con `pg_advisory_xact_lock` para que dos contabilizaciones simultáneas
no se pisen.

Probado desde cero, 7/7: empresa A → 1, 2, 3 · empresa B → 1, 2 (independiente)
· 6 asientos **simultáneos** en la misma empresa → 4,5,6,7,8,9 sin repetir ni
saltar. Y está reforzado en la base con el índice único
`(empresa_id, numero_comprobante)`.

### 8.4 La palomita de selección

**Antes era todo o nada.** «Contabilizar todo» tomaba los pendientes del período
completo; para dejar afuera un documento había que achicar el rango de fechas
hasta que no lo tomara, o contabilizar y borrar el asiento después.

Ahora en el panel de revisión hay una palomita por documento, «marcar todos»
arriba con estado indeterminado en selección parcial, un contador *«N de M
entran al lote»* y el botón dice cuántos entran de verdad.

**Decisión de diseño:** se guardan las claves **desmarcadas**, no las marcadas.
Así por omisión entran todas —lo habitual— y un documento nuevo del período no
queda fuera por accidente.

**Dos bugs que solo aparecieron al montar el componente real:**

- `useEffect` escrito sin el prefijo `React.` — este archivo no importa el hook
  suelto. Reventaba al abrir el panel, y el build no lo detecta porque es error
  de ejecución.
- **Las exclusiones sobrevivían al cancelar.** `cerrarPanel()` limpiaba las
  correcciones de cuenta pero no las palomitas: desmarcar 2 de 5, cancelar y
  reabrir dejaba 3 de 5. Se habría contabilizado menos de lo esperado, sin
  aviso, arrastrando una decisión de otro día o de otra empresa.

QA final sobre el componente real: **22/22**, con los cuatro criterios
acordados (marcar 1 → solo ese · marcar 3 → exactamente esos · todos → todos ·
ninguno → botón desactivado y no contabiliza aunque se fuerce el clic).

### 8.5 La aprobación por contador

**Antes solo existía la firma de quien contabilizó.** Eso dice a quién
preguntarle, pero no que alguien más lo haya mirado.

El circuito construido:

```
Contabilizado ──► Aprobado
      │
      └────────► Rechazado (+ motivo) ──► se corrige ──► Contabilizado
```

**Decisiones de negocio (Felipe):**

| | |
|---|---|
| Quién aprueba | **Cualquiera, incluso lo propio** |
| Mientras espera | El asiento **cuenta en los libros** desde que se contabiliza |
| Un rechazado | **Se corrige y vuelve a la fila**, conservando número e historial |

Sobre la primera: la versión inicial bloqueaba aprobar lo propio —el clásico
control de cuatro ojos—. Se cambió el mismo día porque el equipo son tres
personas y Víctor lleva Contabilidad: exigir que otro le apruebe cada asiento
significaba dejar el trabajo detenido cada vez que estuviera solo. **Una regla
que obliga a esperar a alguien que no está no se cumple: se termina buscando la
vuelta.**

Lo que se pierde, dicho claro: la aprobación deja de ser un control de dos
personas y pasa a ser un registro de dos pasos. Lo que se conserva —y es lo que
sirve meses después— es la **trazabilidad**: cada asiento guarda quién lo
contabilizó y quién lo aprobó, con fecha y hora, aunque coincidan.

Si el equipo crece y se quiere volver al control de dos, está anotado en el
código cómo reactivarlo: comparar `contabilizado_por_id` con quien pide, **por
id y no por nombre** (dos personas pueden llamarse igual y el nombre se edita).

**Corregir un asiento borra su aprobación anterior.** Lo que se aprobó ya no es
lo que dice el asiento ahora; dejar el «Aprobado por Matías» sería avalar líneas
que Matías nunca vio. Es también el camino de vuelta del rechazo.

**Migración:** `2026-09-01_comprobante_aprobacion.sql`, idempotente, aplicada.
Agrega `aprobado_por`, `aprobado_por_id`, `aprobado_at`, `motivo_rechazo`, un
CHECK con los tres estados válidos y un índice parcial para la bandeja de
pendientes. Se hizo aprovechando que había **cero comprobantes**: con volumen
habría que decidir qué estado darle a todo lo ya contabilizado sin revisar.

**En pantalla** (`AsientosContables.jsx`): columna «Revisión» con los botones
Aprobar y Rechazar. Rechazar pide el motivo antes de mandar —cancelarlo o
dejarlo en blanco no manda nada—. Un aprobado muestra quién lo aprobó; un
devuelto ofrece re-aprobar y muestra el motivo completo al desplegar la fila.

Probado: **30/30** contra los endpoints, **13/13** en la pantalla real, **6/6**
el camino de vuelta del rechazo.

### 8.6 Tres bugs propios, todos invisibles al build

Vale la pena dejarlos escritos porque son el mismo patrón:

| Dónde | Qué pasaba |
|---|---|
| `crearTarea` (CRM) | `$8` reusado con dos contextos de tipo → **ninguna tarea se podía crear** |
| `MovimientosContables` | `useEffect` sin el prefijo `React.` → reventaba al abrir el panel |
| `revisarComprobante` | `registrar` sin importar → el UPDATE se aplicaba pero respondía 500 |

Los tres pasaron `node --check` y el build sin una queja. **El build no prueba
nada de lo que importa:** valida JavaScript, no lo que ocurre al ejecutar ni lo
que dice Postgres.

De ahí salió el método que quedó anotado en la memoria del proyecto: preparar
todas las consultas del backend contra Postgres con `PREPARE` antes de dar por
bueno un cambio de SQL, y montar el componente real antes de dar por buena una
pantalla.

### 8.7 Lo que sigue pendiente

**AÑADIR REMUNERACIONES A LA CONTABILIDAD** — no hay ningún flujo. Hay una
liquidación cargada en `rem_liquidacion`, pero ninguna pantalla ni endpoint la
convierte en asiento.

El bloqueo **no es técnico**: falta definir contra qué cuenta del plan va cada
concepto. El asiento típico sería algo así, pero los códigos exactos los tiene
que decir el contador:

```
Gastos de remuneraciones .... DEBE
Leyes sociales .............. DEBE
    Sueldos por pagar ............ HABER
    AFP por pagar ................ HABER
    Salud por pagar .............. HABER
    Impuesto único por pagar ..... HABER
```

Sin ese mapeo el sistema no puede adivinar contra qué cuenta va cada concepto.

**Un dato que cambia la prioridad de todo lo demás:** al 01-09-2026 hay **cero
comprobantes** en la base y **solo 1 empresa de 99** tiene plan de cuentas —la
propia VOLLAIRE & OLIVOS—. El módulo está construido y probado, pero todavía no
se usa. Antes de refinar nada más, las empresas necesitan su plan de cuentas:
sin eso no se puede contabilizar a nadie.
