# 💼 Módulo de Remuneraciones — Requerimientos, Modelo de Datos y Roadmap

> Documento de referencia del **Módulo de Remuneraciones** de VSV-Contadores.
> Estado: **implementado (fases 0–8, solo rol admin)** · Última actualización: 2026-07-25.
> Complemento técnico de implementación: [`docs/remuneraciones-modulo.md`](./remuneraciones-modulo.md).
>
> **Leyenda de estado:** ✅ implementado · ◐ parcial (base lista, falta afinar/validar) · ○ pendiente.

---

## 0. Contexto y estado del sistema

| Pieza | Estado hoy | Nota |
|---|---|---|
| Módulo RRHH anterior (maqueta) | Reemplazado. `rrhh.controllers.js` (datos hardcodeados) ya **no** alimenta la nómina real. | Se conservan `getEmployees`/`getDocuments` solo por compatibilidad. |
| Tablas de nómina (`rem_*`) | **18 tablas creadas** vía migraciones. | Ver §2. |
| Multi-tenant | `organizacion` → `empresa`; todo filtra por `organizacion_id`/`empresa_id`. | Heredado; la mayoría de vistas funcionan consolidadas o por empresa. |
| Control de acceso | Rutas bajo `/api/rrhh` con `requireSession` + `requireAdmin`. | **Fase actual = solo admin.** Rol cliente ○. |
| Integración contable | Centralización → `comprobantes` + `comprobantes_detalle` sobre `plan_cuentas`. | ✅ operativa e idempotente. |
| Cifrado | RUT del trabajador `rut_encrypted` + `rut_hash`. | ✅ reutiliza `src/utils/crypto.js`, `src/lib/rut.js`. |
| Correo | `nodemailer` (Gmail, creds de envíos masivos) en `src/utils/mailer.js`. | ✅ envío de liquidaciones. |

---

## 1. Alcance y actores

### 1.1 Alcance
Gestión completa de remuneraciones **multiempresa** dentro de una organización: ficha de
trabajadores, parámetros previsionales, cálculo de liquidaciones (haberes/descuentos según
normativa chilena), aprobación, archivos de pago (PREVIRED, banco, LRE/DT), centralización
contable, reportes, finiquitos, vacaciones, licencias, asistencia y entrega de documentos.

### 1.2 Actores
| Actor | Descripción | Visibilidad | Estado |
|---|---|---|---|
| **Administrador (contador)** | Dueño de la organización (multi-empresa). | Todas las empresas de su `organizacion_id`. | ✅ |
| **Cliente (empresa)** | Usuario de una empresa cliente. | Solo su(s) empresa(s). | ○ pendiente |
| **Trabajador** | Empleado. No es usuario del sistema; recibe su liquidación por correo. | — | ✅ (recepción) |
| **Sistema** | Cálculos, centralización, generación de archivos, envíos. | — | ✅ |

---

## 2. Modelo de datos real (18 tablas `rem_*`)

> Todas llevan `organizacion_id` y/o `empresa_id`, `created_at` (y `updated_at` donde aplica).
> Los tipos son PostgreSQL. Columnas clave; el detalle completo está en las migraciones
> `src/DatabaseThings/migrations/2026-07-*_remuneraciones_*.sql`.

### 2.1 Catálogos (compartidos / por organización)
| Tabla | Rol | Columnas clave |
|---|---|---|
| **rem_afp** | Catálogo nacional de AFP | `nombre`, `tasa_comision`, `activo` |
| **rem_salud** | Fonasa + isapres | `nombre`, `tipo` (FONASA/ISAPRE), `activo` |
| **rem_concepto** | Haberes/descuentos (LRE) | `codigo`, `descripcion`, `naturaleza` (HABER/DESCUENTO), `imponible`, `tributable`, `afecta_gratificacion`, `cuenta_codigo`, `obsoleto`, `organizacion_id` (NULL = global) |
| **rem_parametro_previsional** | Indicadores por período | `periodo`, `uf`, `utm`, `uta`, `sueldo_minimo`, `tope_imponible_afp_uf`, `tope_imponible_cesantia_uf`, `tasa_sis`, `tasa_cesantia_trabajador`, `tasa_cesantia_empleador_indef/plazo` |
| **rem_impuesto_tramo** | Impuesto único 2ª cat. | `periodo`, `tramo`, `desde_utm`, `hasta_utm`, `factor`, `rebaja_utm` |
| **rem_asignacion_familiar_tramo** | Tramos asig. familiar | `periodo`, `tramo` (A–D), `renta_max`, `monto` |

### 2.2 Trabajador y configuración
| Tabla | Rol | Columnas clave |
|---|---|---|
| **rem_trabajador** (57 col) | Ficha completa | Personales (`nombres`, `apellido_*`, `rut_encrypted`, `rut_hash`, `fecha_nacimiento`, `estado_civil`, dirección, `email`); contrato (`fecha_ingreso/termino`, `tipo_contrato`, `estado_contrato`, `departamento`, `cargo`); previsión (`afp_id`, `salud_id`, `plan_isapre_monto/moneda`, `asignacion_familiar_tramo`, `cargas_normales/maternales/invalidas`, `seguro_cesantia`, `apv_*`); remuneración (`tipo_sueldo_base`, `sueldo_base`, `gratificacion_tipo/pct`, `semana_corrida`, `zona_extrema_pct`, `ajuste_ley_20281`, `cargo_excepcional_ley_21561`); vacaciones (`dias_vacaciones_tomadas`, `*_vac_progresivas`); pago (`tipo_pago`, `banco`, `tipo_cuenta`, `numero_cuenta`) |
| **rem_trabajador_historial** | Auditoría append-only | `trabajador_id`, `campo`, `valor_anterior`, `valor_nuevo`, `usuario_id`, `usuario_nombre` |
| **rem_config_empresa** | Nómina por empresa | `empresa_id` (PK), `mutual`, `tasa_mutual`, `moneda`, `gratificacion_default`, `cuenta_*` (mapeo contable: sueldos, aportes, líquido, afp, salud, cesantía, impuesto, mutual, otros) |

> **Nota:** las *cargas familiares* hoy son **columnas** de `rem_trabajador` (cantidades + tramo), no una tabla propia. La *mutual* son columnas de `rem_config_empresa`. Las *isapres* viven en `rem_salud`. No existen aún `rem_carga_familiar`, `rem_mutual`, `rem_convenio`, `rem_sindicato` (ver §11).

### 2.3 Novedades del período
| Tabla | Rol | Columnas clave |
|---|---|---|
| **rem_haber_descuento_fijo** | Conceptos **fijos** (recurrentes) por trabajador | `trabajador_id`, `concepto_id`, `monto`, `glosa`, `vigencia_desde/hasta`, `activo` |
| **rem_movimiento_periodo** | Novedades **variables** del mes | `trabajador_id`, `periodo`, `concepto_id`, `codigo`, `cantidad`, `monto`, `glosa` |
| **rem_licencia_medica** | Días de licencia (ajustan la liquidación) | `trabajador_id`, `periodo`, `tipo`, `folio`, `fecha_inicio/fin`, `dias` |
| **rem_asistencia_periodo** | Registro de jornada (informativo) | `trabajador_id`, `periodo`, `dias_trabajados`, `dias_ausente`, `atrasos_min`, `horas_extra`, `obs` |

### 2.4 Liquidación y contabilidad
| Tabla | Rol | Columnas clave |
|---|---|---|
| **rem_liquidacion** | Cabecera | `trabajador_id`, `periodo`, `estado`, `dias_trabajados`, `total_imponible`, `total_no_imponible`, `total_haberes`, `base_tributable`, `total_descuentos`, `liquido_pagar`, `aportes_patronales`, `parametro_snapshot` (JSONB), `aprobado_por/at` |
| **rem_liquidacion_detalle** | Líneas calculadas | `liquidacion_id`, `codigo`, `descripcion`, `naturaleza` (HABER/DESCUENTO/APORTE), `imponible`, `tributable`, `monto`, `orden` |
| **rem_centralizacion** | (empresa, período) ↔ comprobante | `empresa_id`, `periodo`, `comprobante_id`, `numero_comprobante`, `total_debe`, `total_haber` |

### 2.5 Gestión laboral
| Tabla | Rol | Columnas clave |
|---|---|---|
| **rem_vacaciones** | Registro de días de feriado | `trabajador_id`, `tipo`, `dias`, `fecha_desde/hasta`, `glosa` |
| **rem_finiquito** | Cálculo de término | `trabajador_id`, `fecha_termino`, `causal`, `dio_aviso`, `anos_servicio`, `dias_vac_pendientes`, `vac_proporcional`, `indem_anos`, `indem_aviso`, `total`, `estado`, `snapshot` (JSONB) |

**Relaciones (resumen):**
`organizacion 1─N empresa 1─N rem_trabajador 1─N rem_liquidacion 1─N rem_liquidacion_detalle`.
`rem_liquidacion N─1 rem_parametro_previsional` (por período, snapshot).
`rem_centralizacion N─1 comprobantes` (integración contable).

---

## 3. Requerimientos Funcionales (RF)

> Convención **RF-R##**. Estado a nivel de subsección; la matriz de acceso está en §4.

### 3.A Gestión de Trabajadores (ficha) — ✅ (ficha) / ○ (sub-pestañas)
- **RF-R01** Registrar trabajador (nombre, RUT, nacimiento, estado civil, dirección, comuna, teléfono, correo). ✅
- **RF-R02** Validar RUT (DV) y almacenarlo cifrado, sin duplicados por empresa. ✅
- **RF-R03** Editar trabajador; todo cambio queda en historial (RF-R60). ✅ (backend; UI de historial ○)
- **RF-R04** Listar por empresa con filtros (estado, depto, cargo, tipo contrato) y búsqueda. ✅
- **RF-R05..R10** Salud/AFP, cargas, contrato (ingreso/término/tipo/estado), baja, depto y cargo. ✅
- **RF-R11..R15** Ley 20.281, semana corrida, Ley 21.561; vacaciones progresivas; tipo de sueldo; sueldo base + zona extrema; gratificación. ✅ (datos) / ◐ (algunos aún no impactan el motor — ver §10.4)
- **RF-R16..R18** Cotización especial, tramo asig. familiar, jubilado; seguro accidentes/cesantía; APV. ◐ (APV sin institución/monto detallado)
- **RF-R19** Datos de pago (tipo, banco, cuenta). ✅

### 3.B Parámetros e indicadores — ✅
- **RF-R20** Catálogo AFP + comisión, cálculo automático (10% + comisión). ✅
- **RF-R21** Catálogo instituciones de salud. ✅
- **RF-R22** Indicadores mensuales (UF, UTM, mínimo, topes, tramos impuesto y asig. familiar). ✅ editables por UI
- **RF-R23** Mutualidad y tasa por empresa. ✅
- **RF-R24** Historizar indicadores por período (recálculo con valores del mes). ✅

### 3.C Catálogo de conceptos — ✅ (visor) / ○ (edición)
- **RF-R25/R26** Catálogo de haberes y descuentos con tratamiento tributario (40+ códigos del manual sembrados). ✅
- **RF-R27** Marcar conceptos duplicados/obsoletos (105, 799). ✅
- **RF-R28** Crear conceptos personalizados por organización. ○ (soportado en BD; falta UI de creación/edición)

### 3.D Novedades del período — ✅ (fijos, mensuales, licencias) / ○ (Excel)
- **RF-R29** Novedades mensuales por trabajador (HHEE, comisiones, bonos, descuentos, etc.). ✅
- **RF-R29b** Haberes/descuentos **fijos** recurrentes por trabajador. ✅ (extensión)
- **RF-R30** Licencias médicas que afectan días trabajados. ✅ (reducen días → recálculo inmediato)
- **RF-R31** Carga masiva de novedades (Excel) con validación. ○

### 3.E Cálculo de la liquidación — ✅ (base) / ◐ (afinamientos)
- **RF-R32..R38** Sueldo base por tipo, gratificación, HHEE, imponible/tributable con topes, AFP/salud/cesantía/APV, impuesto único, aportes patronales, asignación familiar, líquido y desglose. ✅ (motor `liquidacion.service.js`)
- **RF-R39** Recalcular en borrador; bloquear si aprobada/pagada. ✅
- **RF-R40** Liquidaciones **por lote** (todos los activos de una empresa/período). ✅ (`generarMasivo`)
- **RF-R41** Período parcial (ingreso/egreso a mitad de mes) prorrateando por días. ◐ (prorrateo por días existe; falta prorrateo automático por fecha de ingreso/término)
- **◐ Pendiente de afinar en el motor:** semana corrida, zona extrema, ajuste Ley 20.281, APV como descuento, 2% adicional de salud. (Los flags están en la ficha; el cálculo fino falta.)

### 3.F Revisión, aprobación y estados — ✅
- **RF-R42** Estados: Borrador → Revisada → Aprobada → Pagada (+ Anulada / Reabierta), transiciones controladas. ✅
- **RF-R43** Aprobar (individual o lote) con registro de quién y cuándo. ✅
- **RF-R44** Impedir centralizar/generar pagos si no está aprobada. ✅
- **RF-R45** Anular/reabrir con motivo obligatorio. ◐ (reapertura existe; falta capturar motivo obligatorio)

### 3.G Archivos y salidas de pago — ✅ (base) / ◐ (layout oficial)
- **RF-R46** Nómina bancaria (CSV). ✅
- **RF-R47** PREVIRED (CSV base). ◐ (validar layout oficial)
- **RF-R48** Libro DT / LRE (CSV base). ◐ (validar layout oficial)
- **RF-R49** Registrar pago realizado y reflejarlo en caja/bancos. ◐ (marca "Pagada"; falta asiento en `movimientos_*`)

### 3.H Centralización contable — ✅
- **RF-R50..R54** Asiento automático a `comprobantes`, mapeo concepto→cuenta por empresa, validación de cuadre, vínculo y reversa, idempotencia por período/empresa. ✅

### 3.I Reportes — ✅ (base) / ○ (estadísticas)
- **RF-R55** Libro de Remuneraciones (mensual). ✅
- **RF-R56** Liquidación individual (PDF imprimible). ✅
- **RF-R57** Certificados (antigüedad, renta). ✅ (certificado de vacaciones ○)
- **RF-R58** Exportación PREVIRED / DT. ◐
- **RF-R59** Exportar a Excel/CSV/PDF. ✅ (CSV); Excel nativo ○

### 3.J Auditoría e historial — ✅ (registro) / ○ (vista)
- **RF-R60** Historial append-only de la ficha (`rem_trabajador_historial`). ✅ (se registra; falta UI para verlo)
- **RF-R61** Auditoría de acciones sensibles (aprobación/centralización guardan quién/cuándo). ◐

### 3.K Finiquitos — ✅ (base, validar legal)
- **RF-R62..R66** Vacaciones proporcionales, indemnización años (tope 11), finiquito total, causal del Código del Trabajo, PDF. ✅ (cálculo base — validar legalmente)

### 3.L Vacaciones y control — ✅
- **RF-R67** Saldo de vacaciones (devengado − tomadas). ✅
- **RF-R68** Registrar goce y actualizar saldo. ✅ (comprobante de vacaciones ○)

### 3.M Envío a trabajadores — ✅ (envío) / ○ (registro)
- **RF-R69** Enviar liquidación por correo (individual o varios). ✅
- **RF-R70** Registrar resultado del envío (enviado/rebote/error) por trabajador/período. ○

### 3.N Flujo de trabajo — ✅
- **RF-R71** Guiar el flujo (registro → config → cálculo → aprobación → pagos → centralización → envío). ✅
- **RF-R72** Estado del período por empresa (borrador/aprobadas/pagadas/centralizadas). ✅ (Dashboard)

---

## 4. Control de acceso (admin vs cliente)

- **RF-R73** El **admin** opera todas las empresas de su `organizacion_id`. ✅
- **RF-R74/R75** El **cliente** solo ve su(s) empresa(s) y con acciones restringidas. ○ (todo el módulo es admin hoy)
- **RF-R76** Toda consulta/escritura filtra por `organizacion_id`/`empresa_id`. ✅

### Matriz de acceso objetivo (al habilitar rol cliente)
| Funcionalidad | Admin | Cliente |
|---|---|---|
| Ver / crear / editar trabajadores | ✅ todas | ✅ su empresa (configurable) |
| Ingresar novedades / calcular | ✅ | ✅ (configurable) |
| **Aprobar** liquidaciones | ✅ | ❌ |
| Generar archivos de pago | ✅ | ❌ / solo lectura |
| **Centralizar** | ✅ | ❌ |
| Editar parámetros / mapeo | ✅ | ❌ |
| Ver reportes / liquidaciones | ✅ todas | ✅ su empresa |

---

## 5. Requerimientos No Funcionales (RNF)

### 5.1 Seguridad
- **RNF-R01** RUT cifrado (`*_encrypted` + `*_hash`). ✅
- **RNF-R02** Todo endpoint exige sesión y verifica organización/empresa. ✅
- **RNF-R03** Acciones sensibles verifican rol en backend. ✅ (`requireAdmin`)
- **RNF-R04** Aislamiento multi-tenant a nivel de consulta. ✅
- **RNF-R05** Liquidaciones aprobadas / asientos = inmutables (reapertura auditada). ◐

### 5.2 Rendimiento y escalabilidad
- **RNF-R06** Cálculo por lote para miles de trabajadores. ◐ (lote síncrono por trabajador; falta background + progreso)
- **RNF-R07** Listados paginados < 2 s. ✅ (Trabajadores) / ◐ (otros)
- **RNF-R08** Liquidación individual < 1 s. ✅
- **RNF-R09** Índices por `organizacion_id`/`empresa_id`/`trabajador_id`/`periodo`. ✅

### 5.3 Integridad de datos
- **RNF-R10** Operaciones críticas transaccionales (ACID). ✅ (centralización, guardado)
- **RNF-R11** Asiento no se crea si no cuadra. ✅
- **RNF-R12** Idempotencia en centralización. ✅
- **RNF-R13** Validar datos obligatorios antes de calcular. ◐ (falta parámetro del período; validaciones de ficha parciales)

### 5.4 Auditoría y trazabilidad
- **RNF-R14** Historial de ficha append-only. ✅
- **RNF-R15** Registro de aprobaciones/centralizaciones. ◐
- **RNF-R16** Trazabilidad liquidación ↔ comprobante ↔ archivo. ◐

### 5.5 Cumplimiento normativo (Chile)
- **RNF-R17** Cálculos conforme a normativa. ◐ (**valores PLACEHOLDER**, validar con contador)
- **RNF-R18** Indicadores parametrizables por período (no hardcodeados). ✅
- **RNF-R19** Formatos PREVIRED / DT (LRE). ◐ (base, validar layout)

### 5.6 Multimoneda
- **RNF-R20** Soporte multimoneda. ◐ (columna `moneda` existe; conversión ○)

### 5.7 Disponibilidad y respaldo
- **RNF-R21/R22** Disponibilidad y recuperación ante fallo de lote. ◐ (heredado de infra; lote sin reintentos)

### 5.8 Usabilidad
- **RNF-R23** UI clara para aprobar (revisión ágil en lote). ✅
- **RNF-R24** Errores claros + confirmación en acciones destructivas. ✅
- **RNF-R25** Consistencia visual (Tailwind + tema claro simple-pyme). ✅

### 5.9 Mantenibilidad e integración
- **RNF-R26** Controladores/rutas propios. ✅
- **RNF-R27** BD versionada con migraciones. ✅
- **RNF-R28** Reutilizar utilidades (cifrado, RUT, correo). ✅
- **RNF-R29** Modelo para convenios/sindicatos. ○

---

## 6. Supuestos
- El trabajador **no** es usuario del sistema (recibe su liquidación por correo).
- Postgres y patrón de cifrado operativos.
- `plan_cuentas` por empresa cargado para poder centralizar.
- Indicadores del período cargados/actualizados mensualmente.

## 7. Exclusiones (v1)
- Reloj control / biometría en tiempo real (se ingresa como asistencia/novedad).
- Portal de autoatención del trabajador.
- Integración API directa con PREVIRED/DT (v1 genera el archivo para carga manual).
- Conversión multimoneda por tipo de cambio diario.
- Operación de convenios/sindicatos (aún sin modelo de datos).

## 8. Decisiones tomadas (antes "pendientes")
1. **Trabajador = tabla nueva `rem_trabajador`** (con `persona_id` opcional). ✔
2. **Fase inicial solo admin**; rol cliente después con la matriz de §4. ✔
3. **Multimoneda:** v1 CLP, diseño preparado (`moneda` en config). ✔
4. **Indicadores:** carga manual mensual desde Configuración. ✔
5. **Mapeo contable:** usa las cuentas del `plan_cuentas` existente por empresa. ✔

## 9. Fases — estado real
| Fase | Contenido | Estado |
|---|---|---|
| 0 | Datos base + catálogos | ✅ |
| 1 | Ficha de trabajadores | ✅ |
| 2 | Novedades + motor de cálculo | ✅ |
| 3 | Aprobación, indicadores, libro, PDF | ✅ |
| 4 | Centralización contable | ✅ |
| 5 | Archivos legales (PREVIRED/LRE/nómina) | ✅ (◐ layout) |
| 6 | Vacaciones y finiquitos | ✅ |
| 7 | Haberes/descuentos fijos, licencias, descarga/envío, masivo | ✅ |
| 8 | Asistencia, Centro de Documentos, Certificados | ✅ |
| — | **Rol cliente** | ○ **próximo bloque grande** |

---

## 10. Cómo funciona (arquitectura en tiempo de ejecución)

### 10.1 Navegación
Sidebar (`MainPage.jsx` + `src/config/rrhhNav.js`) con **7 secciones**: Dashboard, Trabajadores,
Remuneraciones, Gestión Laboral, Documentos, Reportes, Configuración. Cada sección abre una
página (`RecursosHumanos.jsx`, ruteo por `?sub=`) y sus sub-páginas se muestran como **pestañas**
dentro de la página. Casi todas las vistas funcionan **consolidadas** (toda la organización) o
**por empresa** (selector global).

### 10.2 Frontend → Backend
Componentes en `src/components/rrhh/*` → `src/services/rrhhService.js` (`fetchWithAuth` +
conversión camelCase) → rutas `/api/rrhh` (`rrhh.routes.js`) → controladores
(`remuneraciones.controllers.js`, `liquidaciones.controllers.js`, `centralizacion.controllers.js`,
`finiquitos.controllers.js`, `asistencia.controllers.js`).

### 10.3 Motor de cálculo (`src/services/liquidacion.service.js`)
Función **pura** `calcularLiquidacion(input)`. El controlador arma los insumos con `armarInsumos`
(ficha + parámetro del período + AFP/salud + **fijos + movimientos** + **días de licencia** +
config) y llama al motor. Pasos: (1) sueldo base proporcional a días, (2) haberes, (3) gratificación,
(4) imponibles y topes, (5) AFP/salud/cesantía, (6) impuesto único, (7) asignación familiar,
(8) otros descuentos, (9) aportes patronales, (10) totales → líquido. Una **licencia** de N días
hace `días = 30 − N`.

### 10.4 Puntos a validar antes de producción
- **Valores PLACEHOLDER:** flags imponible/tributable de conceptos, tasas (AFP/SIS/cesantía/mutual),
  tramos de impuesto y asignación familiar → validar con el contador (editables desde Configuración).
- **Layouts PREVIRED / LRE** contra el formato oficial vigente.
- **Motor:** semana corrida, zona extrema, Ley 20.281, APV, 2% salud (flags en ficha, cálculo fino pendiente).

---

## 11. Mejoras futuras (backlog para planificar)

### 11.1 Bloques grandes
- **Rol Cliente** (matriz §4): vistas y permisos por empresa, sin aprobar/centralizar. *(Alto impacto.)*
- **Ficha del trabajador con pestañas**: al clickear un trabajador, abrir Información General ·
  Contrato · Remuneraciones · Previsión · Vacaciones · Documentos · Historial (hoy es modal simple).
- **Motor de cálculo completo**: semana corrida, zona extrema, Ley 20.281, APV, 2% salud, prorrateo
  automático por fecha de ingreso/término.

### 11.2 Sub-páginas pendientes (ya están en el menú como "Próximamente")
- **Cargas familiares** (tabla `rem_carga_familiar` con detalle por carga) · **Contratos** (generar y
  almacenar contratos/anexos) · **Cargos y Departamentos** (catálogo estructurado) · **Documentos del
  trabajador** (repositorio de archivos por ficha) · **Historial** (vista de `rem_trabajador_historial`).
- **Documentos laborales** y **Envíos** (registro de correos enviados, RF-R70).
- **Estadísticas** (dashboard de reportes con gráficos: masa salarial, dotación, licencias, finiquitos)
  y **Exportaciones** masivas.
- **Plantillas** de PDF/correo configurables.

### 11.3 Cumplimiento y archivos
- Validar/ajustar **PREVIRED** y **LRE** al layout oficial; exportación **Excel** nativa.
- Registrar el **pago** en `movimientos_caja`/`movimientos_bancarios` (RF-R49).
- Reapertura/anulación con **motivo obligatorio** y auditoría completa (RF-R45, RNF-R15).

### 11.4 Escalabilidad y operación
- **Generación masiva en background** con barra de progreso y reintentos (RNF-R06).
- **Carga masiva de novedades por Excel** con validación e informe de errores (RF-R31).
- **Multimoneda** operativa con tipo de cambio.
- **Convenios colectivos y sindicatos** (modelo + operación) (RNF-R29).
- Integración **API** con PREVIRED/DT y/o **reloj control** para asistencia real.

---

*Refina este documento a medida que se implementen los ítems ◐/○. El detalle técnico de cada
fase está en [`docs/remuneraciones-modulo.md`](./remuneraciones-modulo.md).*
