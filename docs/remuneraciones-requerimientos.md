# 💼 Módulo de Remuneraciones — Requerimientos Funcionales y No Funcionales

> Documento base para el nuevo **Módulo de Remuneraciones** de VSV-Contadores.
> Estado: **borrador para revisión** · Fecha: 2026-07-23 · Autor: equipo VSV + Claude.
> Alcance: reemplaza y amplía la maqueta RRHH actual (`src/components/rrhh/*`,
> `src/controllers/rrhh.controllers.js`) por un módulo real, calculado y contabilizado.

---

## 0. Contexto y hallazgos (estado actual del sistema)

Antes de los requerimientos, lo que **ya existe** y condiciona el diseño:

| Pieza | Estado hoy | Implicancia para Remuneraciones |
|---|---|---|
| Módulo RRHH (UI) | Maqueta. `rrhh.controllers.js` devuelve datos **hardcodeados** (empleados y liquidaciones ficticias). | Se reescribe el backend; la UI se reaprovecha parcialmente. |
| Tablas de nómina en BD | **No existen** (0 de 50 tablas). | Se crean todas las tablas nuevas vía migraciones (`src/DatabaseThings/migrations`). |
| Multi-tenant | `organizacion` → `empresa`; `usuario.rol` (admin/cliente); `usuario.organizacion_id`, `usuario.empresa_id`. Todo filtra por `organizacion_id`/`empresa_id`. | El módulo hereda el mismo aislamiento por organización y empresa. |
| Control de acceso | `admin_modulos.puede_ver_rrhh`; `audita` (usuario↔empresa asignada); middleware `requireSession` / `requireAdmin`. | Se reutiliza; hoy RRHH es `requireAdmin` → **fase 1 = solo admin**. |
| Integración contable | `comprobantes` + `comprobantes_detalle` (debe/haber por `cuenta_codigo`) sobre `plan_cuentas` por empresa. | La centralización de nómina genera un comprobante aquí. |
| Cifrado de datos | RUT como `rut_encrypted` + `rut_hash` (patrón en `persona`, `usuario`, `empresa`). Utilidades en `src/config/security.js`, `src/lib/rut.js`. | El trabajador reutiliza el mismo patrón de cifrado. |
| Pagos | `movimientos_caja`, `movimientos_bancarios`. | El pago de líquidos puede reflejarse aquí. |

**Decisión de arranque (según lo conversado):** implementar y validar primero el
comportamiento **con el rol admin** (que ve todas las empresas de su organización) y,
recién después, habilitar el **rol cliente** (que solo ve su(s) empresa(s)).

---

## 1. Alcance y actores

### 1.1 Alcance
Gestión completa de remuneraciones **multiempresa** dentro de una organización:
ficha de trabajadores, parámetros previsionales, cálculo de liquidaciones de sueldo
(haberes/descuentos según normativa chilena), aprobación, archivos de pago
(PREVIRED, banco, LRE/DT), centralización contable automática, reportes, finiquitos y
control de vacaciones. Fuera de alcance en v1: ver §11 (Exclusiones).

### 1.2 Actores
| Actor | Descripción | Visibilidad |
|---|---|---|
| **Administrador (contador)** | Dueño de la organización (multi-empresa). Opera la nómina de todas las empresas asignadas. | Todas las empresas de su `organizacion_id`. |
| **Cliente (empresa)** | Usuario de una empresa cliente. | Solo su(s) empresa(s) asignada(s) vía `audita`. |
| **Trabajador** | Empleado de una empresa. **No** es usuario del sistema (fase 1); solo recibe su liquidación por correo. | — |
| **Sistema (procesos automáticos)** | Cálculos, centralización contable, generación de archivos, envíos programados. | — |

---

## 2. Modelo de datos propuesto (resumen)

Tablas nuevas (todas con `organizacion_id` y/o `empresa_id`, `created_at`, `updated_at`).
El detalle fino de columnas se define en la fase de diseño técnico; aquí el mapa lógico
que sustenta los RF.

- **`rem_trabajador`** — ficha del trabajador (datos personales, contrato, previsión, pago). RUT cifrado.
- **`rem_trabajador_historial`** — auditoría de cambios de ficha (append-only).
- **`rem_carga_familiar`** — cargas (normal / maternal / inválida) por trabajador.
- **`rem_parametro_previsional`** — indicadores por período: UF, UTM, UTA, sueldo mínimo, tope imponible (AFP/salud, cesantía), asignación familiar por tramo, gratificación tope 4,75 IMM.
- **`rem_afp`** — catálogo de AFP y su comisión + SIS (parametrizable por período).
- **`rem_isapre`** / **`rem_salud`** — catálogo de instituciones de salud (Fonasa + isapres).
- **`rem_mutual`** — mutualidad y tasa de seguro de accidentes por empresa.
- **`rem_concepto`** — catálogo de haberes/descuentos (código, tipo, imponible, tributable, afecta gratificación, cuenta contable asociada).
- **`rem_liquidacion`** — cabecera de liquidación (trabajador, período, estado, totales).
- **`rem_liquidacion_detalle`** — líneas de haberes/descuentos calculados por liquidación.
- **`rem_movimiento_periodo`** — novedades del mes por trabajador (horas extra, comisiones, bonos, inasistencias, días trabajados, licencias).
- **`rem_licencia`** — licencias médicas / permisos que afectan el cálculo.
- **`rem_vacaciones`** — saldo y movimientos de vacaciones (legales, progresivas, zona extrema).
- **`rem_finiquito`** — cálculo y estado de finiquitos.
- **`rem_centralizacion`** — vínculo liquidación(es) ↔ `comprobantes` generado.
- **`rem_config_empresa`** — parámetros por empresa (cuentas contables por concepto, convenios, moneda, mutual, etc.).
- **`rem_convenio`** / **`rem_sindicato`** — convenios colectivos y sindicatos (fase posterior).

---

## 3. Requerimientos Funcionales (RF)

> Convención: **RF-R##**. Cada RF aplica salvo indicación de rol. La matriz de acceso
> admin/cliente está en §5.

### 3.A Gestión de Trabajadores (ficha)

**Datos personales**
- **RF-R01** Registrar un trabajador con: nombre(s) y apellidos, RUT, fecha de nacimiento, estado civil, dirección (calle, número, block, depto), comuna, teléfono y correo electrónico.
- **RF-R02** Validar el RUT (dígito verificador) y almacenarlo cifrado (`rut_encrypted` + `rut_hash`), evitando duplicados por empresa.
- **RF-R03** Editar los datos de un trabajador; todo cambio queda registrado en historial (RF-R60).
- **RF-R04** Listar trabajadores por empresa con filtros (estado, departamento, cargo, tipo de contrato) y búsqueda por nombre/RUT.

**Contrato y relación laboral**
- **RF-R05** Registrar sistema de salud (Fonasa o Isapre desde catálogo) y, si Isapre, el plan pactado (monto en UF o pesos).
- **RF-R06** Registrar AFP del trabajador desde catálogo (con su comisión + SIS vigente).
- **RF-R07** Registrar cargas familiares (número y tipo: normales, maternales, inválidas) y condición de persona con discapacidad.
- **RF-R08** Registrar fecha de ingreso, fecha de término (si aplica), tipo de contrato (plazo fijo / indefinido) y estado del contrato (activo / inactivo).
- **RF-R09** Permitir dar de baja temporal o definitiva a un trabajador (cambio de estado, con motivo y fecha).
- **RF-R10** Registrar departamento (unidad organizacional) y cargo.

**Configuración de remuneración y beneficios**
- **RF-R11** Configurar indicadores del contrato: ajuste sueldo base Ley 20.281 (sí/no), beneficio semana corrida (sí/no), cargo excepcional Ley 21.561 (sí/no).
- **RF-R12** Registrar vacaciones: días de vacaciones tomadas, fecha inicial de vacaciones progresivas, fecha del certificado, indicador "consume primeros días de progresivas", vacaciones zona extrema (sí/no).
- **RF-R13** Seleccionar tipo de sueldo base: Mes / Mes + comisión / Sueldo empresarial / Horas / Horas + horas / Días.
- **RF-R14** Registrar sueldo base (en pesos) y % adicional por zona extrema (si aplica).
- **RF-R15** Configurar gratificación legal: No / % del sueldo base / Tope 4,75 IMM.

**Datos previsionales y de salud adicionales**
- **RF-R16** Registrar cotizaciones especiales (aportes adicionales pactados, sí/no), tramo de asignación familiar (1–4 o "No"), condición de jubilado (sí/no).
- **RF-R17** Registrar afecto a seguro de accidentes (sí/no) y seguro de cesantía (sí/no) con mes/año de inicio de pago.
- **RF-R18** Registrar APV individual (sí/no) y APV colectivo (sí/no), con su institución y monto/modalidad.

**Datos de pago**
- **RF-R19** Registrar tipo de pago (efectivo, transferencia, cheque u otro) y, si aplica, banco, tipo de cuenta y número de cuenta.

### 3.B Parámetros e indicadores previsionales

- **RF-R20** Mantener el catálogo de **AFP** con su comisión + SIS por período (Capital, Cuprum, Hábitat, Modelo, PlanVital, ProVida, Uno). El descuento AFP = 10% obligatorio + comisión (+ SIS según corresponda). El sistema calcula automáticamente según la AFP del trabajador.
- **RF-R21** Mantener el catálogo de **instituciones de salud** (Fonasa; isapres: Banmédica, Colmena, Golden Cross, Consalud, Cruz Blanca, Cruz del Norte, Esencial, F.A.S.T., Banco Estado, iSalud, Isapre Codelco, Nueva Masvida, Vida Tres, etc.).
- **RF-R22** Mantener los **indicadores mensuales**: UF, UTM/UTA, sueldo mínimo (IMM), topes imponibles (AFP/salud y cesantía en UF), tope gratificación 4,75 IMM, tabla de tramos de asignación familiar, tramos del impuesto único de 2ª categoría.
- **RF-R23** Mantener la **mutualidad** y tasa de seguro de accidentes (base + adicional) por empresa.
- **RF-R24** Historizar los indicadores por período para permitir recálculo de meses anteriores con los valores vigentes de ese mes.

### 3.C Catálogo de conceptos (haberes y descuentos)

- **RF-R25** Mantener el catálogo de **haberes** con: código, descripción, imponible (sí/no), tributable (sí/no), afecta gratificación (sí/no), cuenta contable asociada. Incluye al menos los códigos del manual: 100 (Sueldo base), 101 (Comisión ventas), 102/105 (Asignación familiar), 103 (Bono desgaste), 107 (HHEE 50%), 113 (Familiar retroactivo), 114 (Asignación maternal), 115 (Gratificación legal), 117 (Comisiones), 118 (Colación), 119 (Movilización), 300/423 (Vipcos), 403 (HHEE 75%), 404 (HHEE 100%), 405/406 (Horas part time), 777/778 (Horas feriados), 799 (Gratificación legal dup.), 850 (Bono producción), 899 (Aguinaldo), 914 (Semana corrida), 920 (Ajuste ley sueldo base comisiones).
- **RF-R26** Mantener el catálogo de **descuentos**: 200 (Previsión AFP/IPS), 201 (Salud 7%), 202 (2% adicional salud), 205 (Impuesto único), 207 (Cuenta de descuentos art. 58), 420 (APV individual), 421 (Aporte empleador AFC), 902/903/904 (CCAF/CCAP créditos-leasing-seguros), 915/916 (APV individual tributable/no tributable), 917/918 (APV colectivo), 938 (Retención 3% préstamo solidario Ley 21.252).
- **RF-R27** Permitir marcar conceptos duplicados/obsoletos (p. ej. 105, 799) sin borrarlos, para no romper históricos.
- **RF-R28** Permitir crear conceptos personalizados por organización (haberes/descuentos propios) con su tratamiento imponible/tributable y cuenta contable.

### 3.D Movimientos / novedades del período

- **RF-R29** Ingresar novedades mensuales por trabajador: horas extra (50/75/100%), comisiones, bonos, días trabajados, inasistencias/atrasos, colación/movilización variables, anticipos.
- **RF-R30** Registrar licencias médicas y permisos que afecten días trabajados e imponible del mes.
- **RF-R31** Carga masiva de novedades del período (planilla/Excel) para empresas con muchos trabajadores, con validación previa e informe de errores.

### 3.E Cálculo de la liquidación

- **RF-R32** Calcular la liquidación mensual de un trabajador aplicando: sueldo base según su tipo, semana corrida, gratificación (según configuración), horas extra, asignaciones y bonos.
- **RF-R33** Calcular el **total imponible** y **total tributable** según el tratamiento de cada concepto y los topes imponibles vigentes del período.
- **RF-R34** Calcular descuentos previsionales: AFP (10% + comisión), salud (7% + 2% adicional si aplica), seguro de cesantía (parte trabajador), APV.
- **RF-R35** Calcular el **impuesto único de 2ª categoría** según la tabla de tramos del período sobre la base tributable.
- **RF-R36** Calcular aportes del **empleador** (SIS, AFC/cesantía empleador, mutual/seguro de accidentes) para la centralización y PREVIRED.
- **RF-R37** Calcular asignación familiar según tramo del trabajador y número de cargas.
- **RF-R38** Calcular el **líquido a pagar** = total haberes − total descuentos, y mostrar el desglose completo (haberes, descuentos, aportes patronales, base imponible, base tributable).
- **RF-R39** Recalcular una liquidación mientras esté en estado borrador; bloquear el recálculo una vez aprobada (salvo reapertura auditada).
- **RF-R40** Procesar liquidaciones **por lote** (todos los trabajadores activos de una empresa para un período) en una sola acción.
- **RF-R41** Soportar liquidaciones de período parcial (ingreso o egreso a mitad de mes) prorrateando por días.

### 3.F Revisión, aprobación y estados

- **RF-R42** Manejar estados de la liquidación: **Borrador → Revisada → Aprobada → Pagada** (+ Anulada / Reabierta), con transiciones controladas.
- **RF-R43** Permitir revisar y aprobar liquidaciones (individual o en lote) con registro de quién y cuándo.
- **RF-R44** Impedir generar archivos de pago o centralizar si la liquidación no está aprobada.
- **RF-R45** Permitir anular/reabrir una liquidación con motivo obligatorio y registro en auditoría.

### 3.G Archivos y salidas de pago

- **RF-R46** Generar la **nómina de pago bancaria** (archivo para banco) con los líquidos por trabajador.
- **RF-R47** Generar el archivo/planilla **PREVIRED** para pago de cotizaciones previsionales.
- **RF-R48** Generar el **Libro de Remuneraciones Electrónico (LRE)** para la Dirección del Trabajo.
- **RF-R49** Registrar el pago realizado (fecha, medio) y reflejarlo, si corresponde, en `movimientos_caja`/`movimientos_bancarios`.

### 3.H Centralización contable

- **RF-R50** Generar automáticamente el **asiento contable** (comprobante) de la nómina de un período, con líneas debe/haber por concepto mapeadas a `plan_cuentas` de la empresa.
- **RF-R51** Configurar por empresa el **mapeo concepto → cuenta contable** (haberes a gasto, descuentos e impuestos a pasivos/retenciones, líquido a pagar a pasivo).
- **RF-R52** Validar que el asiento **cuadre** (Σ debe = Σ haber) antes de crear el `comprobante`; si no cuadra, informar el descuadre y no contabilizar.
- **RF-R53** Registrar el vínculo liquidación(es) ↔ comprobante (`rem_centralizacion`) y permitir reversar la centralización (anular comprobante) si se reabre la nómina.
- **RF-R54** Evitar doble centralización de un mismo período/empresa (idempotencia).

### 3.I Reportes

- **RF-R55** Emitir el **Libro de Remuneraciones** (mensual/anual) por empresa.
- **RF-R56** Emitir la **liquidación de sueldo** individual (PDF) con desglose de haberes y descuentos.
- **RF-R57** Emitir comprobantes de antigüedad laboral y de vacaciones.
- **RF-R58** Exportar el **Libro de Remuneraciones para PREVIRED** y para la **DT** (formatos de carga).
- **RF-R59** Exportar reportes a Excel/PDF y permitir descarga.

### 3.J Auditoría e historial

- **RF-R60** Registrar historial de cambios (append-only) de la ficha del trabajador: campo modificado, valor anterior/nuevo, usuario, fecha.
- **RF-R61** Registrar auditoría de acciones sensibles: aprobación, anulación, centralización, generación de archivos de pago, cambios de parámetros.

### 3.K Finiquitos

- **RF-R62** Calcular **vacaciones proporcionales** (1,25 días hábiles por mes trabajado) al término de la relación laboral.
- **RF-R63** Calcular la **indemnización por años de servicio** según antigüedad y topes legales.
- **RF-R64** Calcular el **finiquito** total (haberes pendientes + vacaciones proporcionales + indemnizaciones − descuentos).
- **RF-R65** Seleccionar la **causal de término** según el Código del Trabajo y reflejarla en el documento.
- **RF-R66** Emitir el documento de finiquito (PDF) y dejarlo disponible para descarga/envío.

### 3.L Vacaciones y control

- **RF-R67** Llevar el **saldo de vacaciones** por trabajador (legales 15 días hábiles/año, progresivas, zona extrema) con devengo y consumo.
- **RF-R68** Registrar solicitudes/goce de vacaciones y actualizar el saldo; emitir comprobante de vacaciones.

### 3.M Envío a trabajadores

- **RF-R69** Enviar la liquidación por **correo electrónico** al trabajador (individual o masivo), con prueba previa a una casilla interna antes del envío real (patrón ya usado en correos masivos del sistema).
- **RF-R70** Registrar el resultado del envío (enviado/rebote/error) por trabajador y período.

### 3.N Flujo de trabajo (orquestación)

- **RF-R71** Guiar el flujo: registro de empresa → registro de trabajadores → configuración de parámetros por empresa → cálculo → revisión/aprobación → archivos de pago → centralización → emisión y envío de comprobantes.
- **RF-R72** Mostrar el **estado del período** por empresa (cuántas liquidaciones en borrador/aprobadas/pagadas/centralizadas) en un panel.

---

## 4. Control de acceso (admin vs cliente)

- **RF-R73** El **admin** ve y opera la nómina de **todas** las empresas de su `organizacion_id`.
- **RF-R74** El **cliente** solo ve y opera la(s) empresa(s) que tenga asignada(s) (`audita`), y solo si `admin_modulos.puede_ver_rrhh = true`.
- **RF-R75** La visibilidad del módulo se controla por `admin_modulos.puede_ver_rrhh`; las acciones críticas (aprobar, centralizar, generar pagos, editar parámetros) pueden restringirse solo a admin en fase 1.
- **RF-R76** Toda consulta/escritura filtra obligatoriamente por `organizacion_id` y `empresa_id`; ningún actor accede a datos fuera de su alcance (aislamiento multi-tenant).

### Matriz de acceso (fase 1 → fase 2)

| Funcionalidad | Admin | Cliente (fase 2) |
|---|---|---|
| Ver ficha de trabajadores | ✅ todas las empresas | ✅ su empresa |
| Crear/editar trabajadores | ✅ | ✅ (configurable) |
| Ingresar novedades del mes | ✅ | ✅ (configurable) |
| Calcular liquidaciones | ✅ | ✅ (configurable) |
| **Aprobar** liquidaciones | ✅ | ❌ (solo admin en fase 1) |
| Generar archivos de pago (PREVIRED/banco/DT) | ✅ | ❌ / solo lectura |
| **Centralizar contablemente** | ✅ | ❌ |
| Editar parámetros previsionales / mapeo cuentas | ✅ | ❌ |
| Ver reportes y liquidaciones | ✅ todas | ✅ su empresa |
| Calcular/emitir finiquitos | ✅ | ❌ / configurable |

---

## 5. Requerimientos No Funcionales (RNF)

### 5.1 Seguridad
- **RNF-R01** RUT y datos sensibles del trabajador se almacenan **cifrados** (mismo esquema `*_encrypted` + `*_hash` del sistema).
- **RNF-R02** Todo endpoint del módulo exige sesión válida (`requireSession`) y verifica pertenencia a la organización/empresa antes de responder.
- **RNF-R03** Las acciones sensibles (aprobar, centralizar, pagar, editar parámetros) verifican rol/permiso en el backend, no solo en la UI.
- **RNF-R04** Aislamiento multi-tenant garantizado a nivel de consulta: imposible leer/escribir datos de otra `organizacion_id`.
- **RNF-R05** Las liquidaciones aprobadas y los asientos centralizados son **inmutables**; cualquier cambio exige reapertura auditada.

### 5.2 Rendimiento y escalabilidad
- **RNF-R06** El cálculo por lote debe soportar **miles de trabajadores** por empresa sin degradar la app (proceso por lote / en background, con progreso).
- **RNF-R07** Los listados usan **paginación** (máx. 20–50 por página) y responden en < 2 s.
- **RNF-R08** El cálculo de una liquidación individual responde en < 1 s; el lote de una empresa mediana (≤ 200 trabajadores) en tiempo razonable con feedback de progreso.
- **RNF-R09** Índices por `organizacion_id`, `empresa_id`, `trabajador_id`, `periodo`.

### 5.3 Integridad de datos
- **RNF-R10** Operaciones críticas (cálculo de lote, centralización, generación de finiquito) son **transaccionales** (ACID); si falla un paso, se revierte todo.
- **RNF-R11** El asiento contable no se crea si no cuadra (Σ debe = Σ haber).
- **RNF-R12** Idempotencia en centralización y generación de archivos (no duplicar por período/empresa).
- **RNF-R13** Validación de datos obligatorios de la ficha antes de permitir calcular (AFP, salud, sueldo base, tipo de contrato).

### 5.4 Auditoría y trazabilidad
- **RNF-R14** Historial de cambios de ficha del trabajador **append-only**, con usuario, timestamp y valores anterior/nuevo.
- **RNF-R15** Registro auditable de aprobaciones, anulaciones, centralizaciones y pagos (quién, qué, cuándo).
- **RNF-R16** Trazabilidad liquidación ↔ comprobante contable ↔ archivo de pago.

### 5.5 Cumplimiento normativo (Chile)
- **RNF-R17** Cálculos conforme a normativa vigente: topes imponibles, impuesto único 2ª categoría, gratificación (art. 50 / tope 4,75 IMM), semana corrida (art. 45), asignaciones (art. 41), asignación familiar por tramos, seguro de cesantía, finiquitos (Código del Trabajo).
- **RNF-R18** Los indicadores (UF, UTM, sueldo mínimo, tramos) son **parametrizables por período** y no quedan hardcodeados en el código (a diferencia de la maqueta actual).
- **RNF-R19** Formatos de salida compatibles con **PREVIRED** y **DT (LRE)**.

### 5.6 Multimoneda
- **RNF-R20** El módulo soporta empresas con operaciones en otras monedas (USD u otras): los montos pueden expresarse/convertirse según la moneda de la empresa (v1 puede limitarse a CLP con el diseño preparado para multimoneda).

### 5.7 Disponibilidad y respaldo
- **RNF-R21** Disponibilidad objetivo 99,5%; respaldos diarios (heredado de la infraestructura Supabase/Railway del sistema).
- **RNF-R22** Recuperación ante fallo del proceso de lote sin dejar liquidaciones en estado inconsistente.

### 5.8 Usabilidad
- **RNF-R23** Interfaz responsive y clara para visualizar y **aprobar** liquidaciones (revisión ágil en lote).
- **RNF-R24** Errores en lenguaje claro; confirmación antes de acciones destructivas o irreversibles (aprobar, centralizar, pagar, anular).
- **RNF-R25** Consistencia visual con el resto del sistema (Tailwind + componentes UI existentes).

### 5.9 Mantenibilidad e integración
- **RNF-R26** Backend Node/Express con controladores y rutas propios (`remuneraciones.controllers.js`, `remuneraciones.routes.js`), siguiendo el patrón existente.
- **RNF-R27** Esquema de BD versionado mediante **migraciones** (`src/DatabaseThings/migrations`), aplicables con `aplicar_migracion.mjs`.
- **RNF-R28** Reutilización de utilidades existentes (cifrado, RUT, generación PDF, envío de correos) en lugar de reimplementarlas.
- **RNF-R29** Soporte para múltiples **convenios colectivos y sindicatos** (modelado en datos; operativo en fase posterior).

---

## 6. Supuestos
- Los trabajadores **no** son usuarios del sistema en v1 (solo reciben su liquidación por correo).
- Existe conexión y credenciales de BD Postgres (Supabase) y el patrón de cifrado ya operativo.
- El plan de cuentas por empresa (`plan_cuentas`) está o estará cargado para poder centralizar.
- Los indicadores previsionales del período serán cargados/actualizados mensualmente (manual o importados).

## 7. Exclusiones (v1)
- Reloj control / marcaje biométrico de asistencia en tiempo real (se ingresa como novedad).
- Portal de autoatención del trabajador.
- Integración automática (API) directa con PREVIRED/DT (v1 genera el **archivo** para carga manual).
- Multimoneda con conversión automática por tipo de cambio diario (v1: CLP, diseño preparado).
- Gestión operativa de convenios/sindicatos (solo modelo de datos en v1).

## 8. Decisiones pendientes (para confirmar contigo)
1. **¿El trabajador reutiliza `persona` o es una tabla nueva `rem_trabajador`?** → Propuesta: tabla nueva (los campos de nómina son muy específicos), con vínculo opcional a `persona`.
2. **Fase 1 solo admin, cliente en fase 2** — confirmar que el cliente en fase 2 podrá *ingresar novedades y ver*, pero **no** aprobar/centralizar.
3. **Alcance real de multimoneda en v1** (¿solo CLP con diseño preparado, o USD operativo ya?).
4. **Origen de los indicadores** (UF/UTM/mínimo/tramos): ¿carga manual mensual, o importación desde alguna fuente?
5. **Mapeo contable**: ¿usar cuentas ya existentes en `plan_cuentas` o crear cuentas de remuneraciones estándar?

---

## 9. Fases de implementación propuestas

1. **Fase 0 — Datos.** Migraciones: `rem_trabajador`, `rem_afp`, `rem_isapre`, `rem_concepto`, `rem_parametro_previsional`, `rem_config_empresa`. Seed de AFP, isapres y catálogo de conceptos del manual.
2. **Fase 1 — Ficha de trabajadores (admin).** CRUD completo de trabajadores + historial. Reemplaza la maqueta.
3. **Fase 2 — Novedades y cálculo.** Ingreso de novedades + motor de cálculo de liquidación (individual y lote).
4. **Fase 3 — Aprobación y salidas.** Estados/aprobación + liquidación PDF + libro de remuneraciones.
5. **Fase 4 — Centralización contable.** Asiento automático a `comprobantes`/`comprobantes_detalle` con mapeo de cuentas.
6. **Fase 5 — Archivos legales.** PREVIRED, LRE/DT, nómina bancaria.
7. **Fase 6 — Finiquitos y vacaciones.**
8. **Fase 7 — Rol cliente.** Habilitar visibilidad/acciones para el rol cliente según la matriz.
9. **Fase 8 — Envío a trabajadores y multimoneda/convenios.**
