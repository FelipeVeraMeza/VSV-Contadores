# Contabilidad · Manual de usuario

**Para quién es esto:** para alguien que entra a la oficina y tiene que empezar a
contabilizar esta semana. No supone que sepas usar el sistema; sí supone que
sabes qué es un asiento contable.

**Última revisión:** 25 de agosto de 2026

> Si buscas cómo está construido el módulo por dentro —qué archivo hace qué, qué
> se midió, qué falta— eso está en [contabilidad-modulo.md](contabilidad-modulo.md).
> Este documento es el otro lado: qué apretar y en qué orden.

---

## 1. Lo primero: el módulo trabaja sobre UNA empresa

Arriba, en el encabezado del sistema, hay un **selector de empresa**. Todo lo que
veas en Contabilidad depende de él.

| Si el selector dice… | Estás viendo… |
|---|---|
| Una empresa | Los documentos y asientos **de esa empresa** |
| «Todas las empresas» | El **consolidado**: la suma de todas las que puedes ver |

**Elige la empresa antes de hacer cualquier cosa.** Es el error más común de la
primera semana: contabilizar en el consolidado y después no encontrar el asiento,
porque quedó sin dueño.

Dos cosas que dependen de haber elegido empresa y no funcionan en consolidado:

- **Extraer del SII** — el robot necesita saber con qué RUT y clave entrar.
- Cualquier documento nuevo cargado a mano.

---

## 2. El menú: ocho secciones

Todas cuelgan de **Contabilidad** en el menú lateral.

| Sección | Para qué sirve |
|---|---|
| **Compras** | El libro de compras. Facturas que le llegan a la empresa |
| **Ventas** | El libro de ventas. Lo que la empresa emite |
| **Honorarios** | Boletas de honorarios |
| **Recaudaciones** | Caja: marcar qué se cobró |
| **Pagos** | Caja: marcar qué se pagó |
| **Centralización** | Los comprobantes contables ya creados (el libro diario) |
| **Reportes** | Libro Diario · Libro Mayor · Balance General · Estado de Resultados |
| **Traspaso Apertura** | 🔨 En construcción. No hay nada detrás todavía |

Compras, Ventas y Honorarios son **la misma pantalla** con un filtro distinto. Lo
que aprendas en una sirve para las tres.

---

## 3. El rango de fechas

Arriba a la derecha, junto al título, está el selector de período. Manda sobre
todas las secciones a la vez: si lo mueves en Compras, Ventas queda igual.

**Dos formas de poner una fecha, para lo mismo:**

1. **Escribirla.** Haz clic en el número y teclea. Se entiende `25-08-2026`,
   `25/08/2026`, `25.8.26` y `25082026`. Presiona `Enter` o sal del campo y queda
   aplicada.
2. **Elegirla del calendario.** El ícono de calendario al lado de cada campo lo
   abre.

Escribir es más rápido cuando la fecha está lejos: para llegar a enero de 2024 el
calendario son veinte clics y el teclado son ocho teclas.

**Si escribes algo que no se entiende, el campo vuelve solo a la fecha anterior**
y avisa en rojo. Es a propósito: en contabilidad la fecha que se ve en pantalla y
la que se está aplicando no pueden decir cosas distintas.

Los botones redondos de al lado son atajos: **Este mes**, el **año actual**, el
**año anterior** y **Todo**.

---

## 4. El día a día, en orden

Este es el circuito completo. Los pasos 1 a 3 son el trabajo diario; el 4 y el 5
son de cierre de mes.

### Paso 1 · Traer los documentos del SII

Botón **EXTRAER DE SII**, arriba a la derecha de la lista.

Necesita que la empresa tenga **RUT y clave del SII** configurados. Si faltan, el
sistema te lo dice y no hace nada.

> **Extraer NO contabiliza.** Los documentos llegan como **Pendientes** y ahí se
> quedan hasta que alguien decida. Antes el sistema contabilizaba solo al terminar
> de extraer, y una extracción de tres meses dejó 51 asientos que nadie pidió.
> Contabilizar es una decisión tuya.

### Paso 2 · Mirar qué hay

Arriba de la lista hay tres filtros:

- **Pendientes** — es el que viene puesto, porque es el trabajo del día
- **✓ Contabilizados** — lo que ya tiene asiento
- **Todos**

Y un buscador que entiende **folio, RUT y nombre** a la vez. No tienes que elegir
por cuál buscas: escribe y filtra.

### Paso 3 · Contabilizar

Hay dos caminos y conviene saber cuándo usar cada uno.

#### 3a · Fila por fila — cuando el documento tiene algo distinto

Haz clic en la fila y se abre hacia abajo. Ahí ves el asiento propuesto y puedes:

- **Cambiar la cuenta** de cualquier línea, desde el desplegable
- **Cambiar los montos**
- **Agregar o quitar líneas**
- **Marcar que ya se cobró o se pagó**, en el mismo acto (ver sección 6)

El botón **Contabilizar** de la fila lo guarda.

Si el debe y el haber no cuadran, no te deja: te dice cuánto sobra y de qué lado.

#### 3b · En lote — cuando son muchos y todos iguales

Botón **CONTABILIZAR**. Abre un panel de **dos pasos**.

**Paso 1 del panel — qué y con qué cuenta**

**¿Qué quieres contabilizar?** Tres opciones, todas con principio y fin:

| Opción | Para qué |
|---|---|
| **El mes actual** | Lo habitual. Un clic y listo |
| **Varios meses** | De un mes a otro: el trimestre, el semestre, el año |
| **Un período** | Fechas exactas, escritas o del calendario |

> **No existe «todo lo pendiente»**, a propósito. Con la base cargada de
> arrastre eso eran 1.225 documentos de dos años en un solo acto, y contabilizar
> dos años de una vez no es algo que uno quiera hacer sin querer.

Debajo, la frase **«Del … al …»** dice el rango real que se va a usar. Si pones
el «hasta» antes que el «desde», avisa en rojo y no deja seguir — no da vuelta
las fechas solo, porque eso contabilizaría un período que no elegiste.

Después: **con qué cuenta de ingreso** (la única que se pregunta) y **cuántos
documentos entran**, desglosados en ventas y compras.

> **¿Por qué solo se pregunta la cuenta de ingreso?**
> Porque es la única del asiento que es una decisión. El deudor, el proveedor y el
> IVA salen del tipo de documento, no de tu criterio. La de ingreso cambia según
> el giro de la empresa, y hasta hace poco quedaba clavada en 5101-01 para todas.

**Paso 2 del panel — la revisión**

Botón **Revisar los N**. Acá ves **todos** los asientos —ventas y compras, sin
muestras— **antes** de que existan.

De cada uno ves el documento (tipo, folio, quién, fecha) y sus líneas con el
**código de cuenta, el nombre, el debe y el haber**.

**Y le puedes cambiar la cuenta a cualquiera.** Pulsa el código de la línea
—aparece subrayado al pasar el mouse— y se abre el plan de cuentas para elegir
otra. El asiento queda marcado como **«Editado»**, con un botón para deshacerlo,
y arriba se lleva la cuenta de cuántos tocaste.

Es la razón por la que se muestran todos y no una muestra: **no se puede corregir
lo que no se ve**.

Arriba dice **a nombre de quién van a quedar** los asientos: el tuyo. Queda
guardado en cada comprobante y se ve después en la lista.

El botón **«Está bien · contabilizar N»** contabiliza exactamente lo que aprobaste
—con tus correcciones incluidas— y te avisa cuántos quedaron.

> **Esto es lo importante de todo el capítulo:** las cuentas se eligen **antes**.
> Una vez creado el asiento, corregir en qué cuenta quedó obliga a
> descontabilizarlo y rehacerlo de a uno.

⚠️ **Ojo:** si vuelves atrás y cambias la cuenta de ingreso general, las
correcciones puntuales se borran — estaban hechas sobre otra propuesta. Cerrar el
panel también las descarta.

### Paso 4 · Marcar cobros y pagos

Secciones **Recaudaciones** (lo que entra) y **Pagos** (lo que sale).

Solo aparece acá lo que **ya está contabilizado**: primero el asiento, después la
plata. Marcas qué se cobró o se pagó y con qué medio.

También se puede hacer en el momento de contabilizar, desde la fila (3a). El
sistema guarda el asiento y el movimiento de caja **en la misma operación**: o
quedan los dos, o no queda ninguno.

### Paso 5 · Cierre

- **Centralización** — los comprobantes contables que se fueron creando
- **Reportes** — Libro Diario, Libro Mayor, Balance General y Estado de Resultados

---

## 5. Entender el asiento que propone el sistema

No es magia: son tres moldes fijos. Vale la pena conocerlos porque son lo que vas
a estar aprobando todos los días.

### Una venta (factura electrónica)

| Cuenta | | Debe | Haber |
|---|---|---|---|
| `1104-01` | DEUDORES CLIENTES | Total | |
| `5101-01` | VENTAS *(o la que elijas)* | | Neto |
| `2108-02` | IVA DÉBITO FISCAL | | IVA |

### Una compra

| Cuenta | | Debe | Haber |
|---|---|---|---|
| `4201-08` | GASTOS GENERALES | Neto | |
| `1108-02` | IVA CRÉDITO FISCAL | IVA | |
| `2116-01` | FACTURAS POR PAGAR | | Total |

### Un honorario

| Cuenta | | Debe | Haber |
|---|---|---|---|
| `4201-02` | HONORARIOS PROFESIONALES | Total | |
| `2105-04` | HONORARIOS POR PAGAR | | Total |

### El código de cuenta importa tanto como el nombre

El Balance clasifica **por el primer dígito del código**:

| Empieza en | Es |
|---|---|
| `1` | Activo |
| `2` y `3` | Pasivo y patrimonio |
| `4` | Gasto |
| `5` | Ingreso |

Una cuenta cuyo código **no empiece por 1 a 5** aparece en el Libro Mayor pero
**no suma en ninguna parte** del Balance ni del Estado de Resultados, y nada te lo
advierte. El plan de cuentas deja crearlas, así que es un error posible.

Por eso la pantalla de revisión muestra el código y no solo el nombre: una cuenta
mal elegida se lee bien por el nombre y deja la cifra en la mitad equivocada del
informe.

---

## 6. Casos que se ven seguido

### Notas de crédito y de débito

Una **nota de crédito** revierte el documento original: el asiento sale con el
debe y el haber al revés. Una **nota de débito** lo aumenta y va en la misma
dirección que la factura.

**Toda nota necesita saber a qué documento afecta.** El sistema lo busca solo,
pero **solo lo acepta si hay exactamente un candidato del mismo monto**. Con
varios no elige: adivinar sería inventar contabilidad.

Cuando no puede deducirlo:

- **En el lote**, la nota queda fuera y el aviso final te dice cuántas fueron
- **En la fila**, aparece un selector ámbar para que elijas el documento

### El IVA

| Situación | Qué hace el sistema |
|---|---|
| Factura exenta (34) o de exportación (110) | IVA en **0**. Forzar 19% inventaría un crédito fiscal que no existe |
| Documento afecto, con IVA declarado | Respeta el declarado |
| Documento afecto, IVA en 0 pero con neto | Lo calcula al **19%** |

El último caso no es un capricho: los documentos que llegan del SII vienen casi
siempre con el IVA en cero. Es un dato que falta, no una venta sin IVA.

---

## 7. Cuando algo sale mal

### Contabilicé algo que no correspondía

En la columna **Asiento** de la fila hay un ícono de basurero: **quita el
asiento** y el documento vuelve a Pendiente.

> **No borra la factura.** El documento sigue ahí y lo puedes contabilizar de
> nuevo. (Antes ese mismo botón sí borraba el documento, y había que volver a
> extraerlo del SII.)

### El lote me dijo «3 con error»

El aviso rojo trae **el folio y el motivo** de cada uno, no solo el número. Si son
más de cuatro, el resto queda en la consola del navegador (`F12`).

### «Descuadre: debe ≠ haber»

Las líneas no suman lo mismo de los dos lados. Revisa los montos en la fila
expandida. En la pantalla de revisión previa, un asiento descuadrado se marca en
rojo antes de que lo apruebes.

### Contabilicé y no lo encuentro

Casi siempre es la empresa: revisa el selector del encabezado. Si contabilizaste
con «Todas las empresas» puesto, el asiento quedó en el consolidado.

### ¿Quién contabilizó esto?

Cada fila contabilizada muestra **«por [nombre]»** al lado del número de
comprobante. Pasando el mouse sale la fecha y la hora exactas.

---

## 8. Lo que este módulo NO hace

Escrito a propósito, para que no lo busques:

- **Traspaso de apertura** — la sección existe en el menú pero está en construcción
- **Conciliación bancaria** — hay un archivo a medio hacer que ninguna pantalla abre
- **Contabilizar solo, sin que alguien apruebe** — nunca. Ni siquiera al extraer del SII
- **Corregir la cuenta de un asiento ya creado** sin descontabilizarlo primero
- **Avisar** cuando una cuenta tiene un código que el Balance no sabe clasificar

---

## 9. Glosario mínimo

| Palabra | En este sistema significa |
|---|---|
| **Documento** | La factura, boleta o nota, tal como llegó del SII |
| **Pendiente** | Documento sin asiento contable todavía |
| **Contabilizado** | Documento que ya tiene su comprobante |
| **Comprobante** | El asiento contable: una cabecera y sus líneas |
| **Línea** | Una cuenta con su monto al debe o al haber |
| **Descontabilizar** | Borrar el asiento y devolver el documento a Pendiente |
| **Centralizar** | Llevar los asientos al libro diario |
| **Consolidado** | La vista con «Todas las empresas» seleccionado |
| **Folio** | El número del documento. **No identifica nada por sí solo**: se repite entre tipos, años y proveedores |

---

## 10. Los cinco errores de la primera semana

1. **Contabilizar sin elegir la empresa.** El asiento queda en el consolidado.
2. **Aprobar el lote sin mirar las compras.** Todas van a `4201-08 GASTOS
   GENERALES` por omisión. En la revisión se cambian con un clic; después de
   contabilizar hay que descontabilizar una por una.
3. **Buscar una factura solo por el folio.** El folio se repite. Usa el RUT o el
   nombre.
4. **Creer que extraer del SII ya contabilizó.** No lo hace, y es a propósito.
5. **Usar el basurero de la fila pensando que borra el documento.** Borra el
   asiento; el documento se queda.
