# Módulo de Contabilidad · Estado y aislamiento

**Última revisión:** 20 de agosto de 2026
**Responsable del módulo:** Victor (según la tarea madre CONTABILIDAD)
**Estado:** funcionando sobre datos reales · aislamiento por usuario **puesto el
20-08-2026** · queda un cabo suelto entre organizaciones (ver 3.8)

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

Estado real de las cuentas al 19-08-2026 — **los tres están en la misma
organización**:

| Usuario | Rol | `ve_solo_empresas_asignadas` | Empresas en `audita` |
|---|---|---|---|
| Administrador master | Administrador | false | 212 |
| MATIAS OLIVOS | Administrador | false | 215 |
| **VICTOR VOLLAIRE** | Administrador | **true** | **0** |

La organización *VSV CONSULTORES* quedó vacía a propósito, sin borrar, para poder
revertir el cambio.

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

> **E2 y E3 · los 1.172 comprobantes sin dueño.** Un administrador de *otra*
> organización sigue viéndolos en su consolidado, porque `comprobantes` no tiene
> `organizacion_id` y esas filas tampoco tienen `empresa_id`: no pertenecen a
> nadie. Se buscó de dónde deducir el dueño y **no lo hay**: esas 1.172 filas
> tampoco tienen `usuario_id`, así que se cargaron a granel sin dejar rastro.
>
> Arreglarlo de verdad es una migración: agregar `organizacion_id` a
> `comprobantes` y decidir a mano de quién son esas filas. **Es una decisión del
> negocio, no algo que se pueda deducir de los datos**, y por eso quedó sin
> hacer en vez de resuelto a la suerte.
>
> Hoy afecta solo a *VSV CONSULTORES*, que es una organización vacía y sin uso.
> El día que entre un segundo cliente de verdad al sistema, hay que resolverlo
> antes.

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

## 4. Las tareas del módulo

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
