# Módulo de Remuneraciones — Documentación técnica

> Nómina y liquidaciones de sueldo chilenas para VSV-Contadores.
> Cubre desde la **Fase 0** (datos base) hasta la **Fase 7** (novedades fijas, licencias médicas y entrega de liquidaciones).
> Requerimientos funcionales/no funcionales completos en [`docs/remuneraciones-requerimientos.md`](./remuneraciones-requerimientos.md) (76 RF, 29 RNF).

---

## 1. Visión general

El módulo permite a un estudio contable gestionar la nómina de sus empresas cliente:
fichas de trabajadores, haberes/descuentos, licencias médicas, cálculo y aprobación de
liquidaciones, centralización contable, vacaciones, finiquitos, reportes y entrega de
liquidaciones (descarga/PDF y correo).

Se construyó **prácticamente desde cero**: el RRHH anterior (`src/controllers/rrhh.controllers.js`)
era una maqueta con datos ficticios y no se usa para la nómina real. Todas las tablas nuevas
llevan el prefijo `rem_`.

### Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + Vite + TailwindCSS (tema *dark-glass*), react-query, framer-motion, lucide-react 0.285 |
| Backend | Node.js + Express |
| Base de datos | PostgreSQL 17.6 (`pg` pool) |
| Correo | nodemailer (Gmail, credenciales de envíos masivos) |

### Modelo multi-tenant

```
organizacion (el estudio)
  └── empresa (215 empresas cliente)
        └── rem_trabajador … rem_liquidacion … etc.
```

- **Todo** dato de negocio lleva `organizacion_id` y `empresa_id` y filtra por ellos.
- Los catálogos nacionales (`rem_afp`, `rem_salud`) son compartidos; `rem_concepto` admite
  conceptos globales (`organizacion_id = NULL`) y personalizados por organización.
- Caso especial: **"VOLLAIRE & OLIVOS SIMPLE PYME LTDA"** es a la vez el nombre de la
  organización y una empresa (id `1c8456e5-bd9b-4a2f-af3f-c2d568a9269d`), tratada como una
  empresa cliente más ("principal").

### Modo consolidado vs. por empresa

Muchos endpoints y vistas operan en dos modos con el patrón `col`/`val`:

```js
const empresaId = (req.query.empresaId && req.query.empresaId !== 'undefined') ? req.query.empresaId : null;
const col = empresaId ? 'empresa_id' : 'organizacion_id';
const val = empresaId || orgId;
```

- **Con empresa** → datos de esa empresa.
- **Sin empresa** → consolidado de toda la organización (vista "master ve todo").

### Seguridad

- RUT del trabajador cifrado: `rut_encrypted` + `rut_hash` (`src/utils/crypto.js`,
  `src/lib/rut.js`), mismo patrón que `persona`/`usuario`/`empresa`.
- Todas las rutas del módulo están bajo `/api/rrhh` con `requireSession` + `requireAdmin`
  (fase 1–7 = **solo admin**; el rol cliente es el trabajo pendiente).

---

## 2. Fases implementadas

### Fase 0 — Datos base y catálogos
Migración: `src/DatabaseThings/migrations/2026-07-23_remuneraciones_fase0.sql`

Tablas:
- `rem_trabajador` — ficha completa del trabajador (RUT cifrado, datos personales,
  contrato, previsión, remuneración, datos de pago).
- `rem_trabajador_historial` — auditoría *append-only* de cambios de ficha.
- `rem_afp` — catálogo nacional de AFP + comisión de administración.
- `rem_salud` — catálogo Fonasa + isapres.
- `rem_concepto` — catálogo de haberes/descuentos (con flags imponible/tributable/
  afecta_gratificación).
- `rem_parametro_previsional` — indicadores por período (UF, UTM, sueldo mínimo, topes, tasas).
- `rem_config_empresa` — parámetros de nómina por empresa (mutual, gratificación, cuentas).

Seeds: 7 AFP, 14 instituciones de salud, ~40 conceptos, indicadores del período.

### Fase 1 — Ficha de trabajadores
- Backend: `src/controllers/remuneraciones.controllers.js` — CRUD de trabajadores con cifrado
  de RUT e historial de cambios, `getCatalogos`, `listTrabajadores` (consolidado/empresa).
- Frontend: `GestionEmpleados.jsx` (tabla con búsqueda, filtros, paginación) +
  `modals/NuevoEmpleadoModal.jsx` + `modals/EditarEmpleadoModal.jsx`.

### Fase 2 — Novedades y liquidaciones (motor de cálculo)
Migración: `2026-07-23_remuneraciones_fase2.sql`

Tablas: `rem_movimiento_periodo` (novedades del mes), `rem_liquidacion` (cabecera),
`rem_liquidacion_detalle` (líneas), `rem_impuesto_tramo`, `rem_asignacion_familiar_tramo`.

- Motor de cálculo: `src/services/liquidacion.service.js` — **función pura** `calcularLiquidacion(input)`
  que devuelve `{ detalles, totales }` (ver §4).
- Backend: `src/controllers/liquidaciones.controllers.js` — preview, guardar, listar, obtener,
  cambiar estado, eliminar; CRUD de movimientos.
- Frontend: `GestionLiquidaciones.jsx`, `modals/NuevaLiquidacionModal.jsx`,
  `modals/LiquidacionDetalleModal.jsx`.
- Estados: `borrador → revisada → aprobada → pagada` (+ `anulada` / reabrir a borrador),
  con transiciones validadas.

### Fase 3 — Aprobación e indicadores
- Dashboard real (`getMetrics` / `getDashboard`).
- Editor de indicadores por período (`getParametros` / `upsertParametros`) y comisiones AFP
  (`updateAfpComision`) en `ConfiguracionRrhh.jsx` (ya no es mock).
- Libro de remuneraciones + export CSV en `ReportesRrhh.jsx`.
- PDF de liquidación (ventana imprimible) en `LiquidacionDetalleModal.jsx`.

### Fase 4 — Centralización contable
Migración: `2026-07-23_remuneraciones_fase4.sql` (`rem_centralizacion` + columnas `cuenta_*` en
`rem_config_empresa`).

- `src/controllers/centralizacion.controllers.js` — preview / centralizar / estado / reversar.
- Toma las liquidaciones **aprobadas** de un período y genera **un** comprobante en
  `comprobantes` + `comprobantes_detalle` (clase *remuneraciones*), reutilizando el correlativo
  por empresa (`src/utils/comprobantes.js`). Idempotente por (empresa, período).
- Frontend: `CentralizacionRrhh.jsx` + sección "Cuentas contables" en `ConfiguracionRrhh.jsx`.

### Fase 5 — Archivos y pago
- `libroRemuneraciones` enriquecido con datos bancarios + desglose previsional por trabajador.
- `marcarPeriodoPagado` (aprobada → pagada masivo).
- Frontend `ReportesRrhh.jsx`: descargas CSV de Libro, **Nómina bancaria**, **PREVIRED** y
  **LRE** (estas dos con layout base a validar), + "Marcar período pagado".

### Fase 6 — Vacaciones y finiquitos
Migración: `2026-07-24_remuneraciones_fase6.sql` (`rem_vacaciones`, `rem_finiquito`).

- Motor `src/services/finiquito.service.js` — causales del Código del Trabajo, indemnización
  (solo art. 161), vacaciones proporcionales, indemnización por años (tope 11) y por aviso.
- `src/controllers/finiquitos.controllers.js` — vacaciones (saldo/registro) + finiquito
  (preview/guardar/listar/obtener). Saldo vacaciones = devengado − tomadas.
- Frontend: `VacacionesRrhh.jsx` + `FiniquitosRrhh.jsx` (soportan consolidado). PDF imprimible.

### Fase 7 — Novedades fijas, licencias médicas y entrega
Migración: `2026-07-24_remuneraciones_fase7.sql`

Tablas nuevas:
- `rem_haber_descuento_fijo` — haberes/descuentos **recurrentes** por trabajador (se aplican en
  cada liquidación mientras estén vigentes). Ej: colación fija, bono fijo, cuota sindical.
- `rem_licencia_medica` — días de licencia del trabajador por período.

Cambios de motor (`armarInsumos` en `liquidaciones.controllers.js`):
- Fusiona **fijos + movimientos mensuales** en una sola lista de novedades que entra al motor.
- Suma los **días de licencia** del período y descuenta: `días trabajados = 30 − licencia`,
  lo que prorratea el sueldo base automáticamente (**cálculo inmediato**).

Backend nuevo:
- `generarMasivo` — genera la liquidación de **varios** trabajadores (todos los activos del
  período, o una lista de IDs), sin pisar aprobadas/pagadas.
- `getPayslip` — HTML autocontenido imprimible de una liquidación.
- `enviarLiquidacion` — envía la liquidación por correo al trabajador (`src/utils/mailer.js`).
- CRUD de fijos (`listFijos`/`createFijo`/`deleteFijo`) y de licencias
  (`listLicencias`/`createLicencia`/`deleteLicencia`).

Frontend nuevo:
- `HaberesDescuentosRrhh.jsx` — dos tabs: **Fijos (recurrentes)** y **Del mes (variables)**.
- `LicenciasMedicasRrhh.jsx` — alta y registro de licencias (con aviso del efecto en el cálculo).
- `TrabajadorSelect.jsx` — selector de trabajador consolidado, reutilizable.
- `GestionLiquidaciones.jsx` reescrito: carga **consolidado**, período con nombre de mes,
  **selección múltiple**, **descargar** (ventana imprimible → PDF) y **enviar** (uno o varios),
  botón **Generar masivo**.
- **Trabajadores**: la empresa se elige **dentro del modal** (SimplePyme es una empresa más);
  se eliminó el picker de empresa forzado / el toast "Selecciona una empresa".

---

## 3. Modelo de datos (tablas `rem_*`)

| Tabla | Rol | Fase |
|-------|-----|------|
| `rem_trabajador` | Ficha del trabajador (RUT cifrado) | 0 |
| `rem_trabajador_historial` | Auditoría de cambios de ficha | 0 |
| `rem_afp` | Catálogo AFP + comisión | 0 |
| `rem_salud` | Catálogo Fonasa/isapres | 0 |
| `rem_concepto` | Catálogo haberes/descuentos (flags LRE) | 0 |
| `rem_parametro_previsional` | Indicadores por período (UF, UTM, topes, tasas) | 0 |
| `rem_config_empresa` | Config de nómina + cuentas contables por empresa | 0 / 4 |
| `rem_movimiento_periodo` | Novedades **mensuales** (variables) | 2 |
| `rem_liquidacion` | Cabecera de liquidación | 2 |
| `rem_liquidacion_detalle` | Líneas (haberes/descuentos/aportes) | 2 |
| `rem_impuesto_tramo` | Tramos impuesto único 2ª categoría | 2 |
| `rem_asignacion_familiar_tramo` | Tramos de asignación familiar | 2 |
| `rem_centralizacion` | (empresa, período) ↔ comprobante contable | 4 |
| `rem_vacaciones` | Registro de días de feriado legal | 6 |
| `rem_finiquito` | Finiquitos calculados | 6 |
| `rem_haber_descuento_fijo` | Haberes/descuentos **fijos** (recurrentes) | 7 |
| `rem_licencia_medica` | Días de licencia por período | 7 |

**Novedades: fijas vs. mensuales**
- **Fijas** (`rem_haber_descuento_fijo`) → se aplican todos los meses mientras estén vigentes.
- **Mensuales** (`rem_movimiento_periodo`) → valen solo para un período puntual.

Ambas se convierten en la misma lista de "movimientos" al calcular.

---

## 4. Motor de cálculo (`liquidacion.service.js`)

`calcularLiquidacion(input)` es una **función pura** (sin I/O). El controlador arma los insumos
desde la BD (`armarInsumos`) y llama al motor.

Pasos del cálculo:
1. **Sueldo base** proporcional a días trabajados (`sueldoBase × díasTrabajados / 30`).
2. **Haberes** desde novedades (fijos + mensuales).
3. **Gratificación legal** (tope 4,75 sueldos mínimos / 12, o porcentaje).
4. **Totales imponibles** y aplicación de topes (AFP, cesantía).
5. **Descuentos previsionales**: AFP (10% + comisión), salud (7% o plan isapre), cesantía.
6. **Base tributable** e **impuesto único** de 2ª categoría (por tramos en UTM).
7. **Asignación familiar** (haber no imponible, por tramo/cargas).
8. **Otros descuentos** (novedades tipo DESCUENTO).
9. **Aportes patronales** (SIS, AFC empleador, mutual) — informativos, no afectan el líquido.
10. **Totales** finales → `liquido_pagar`.

**Efecto de la licencia médica:** en `armarInsumos` se suman los días de licencia del período;
`días trabajados = max(0, 30 − licencia)`. Así el sueldo base se prorratea de inmediato.
(El subsidio pagado por la isapre/Fonasa **no** se modela; es un cálculo base.)

> ⚠️ Los flags imponible/tributable de `rem_concepto`, las tasas (AFP/SIS/cesantía/mutual) y los
> tramos de impuesto/asignación familiar están sembrados como **PLACEHOLDER**. Son editables
> desde la BD/UI y **deben validarse con el contador antes de habilitar pago real**.

---

## 5. API — endpoints (`/api/rrhh`)

Definidos en `src/routes/rrhh.routes.js`. Todos requieren sesión + admin.

**Trabajadores y catálogos**
```
GET    /catalogos
GET    /trabajadores            (?empresaId → empresa | sin → consolidado)
GET    /trabajadores/:id
POST   /trabajadores
PUT    /trabajadores/:id
DELETE /trabajadores/:id
```

**Novedades mensuales / liquidaciones**
```
GET    /movimientos?trabajadorId&periodo
POST   /movimientos
DELETE /movimientos/:id

POST   /liquidaciones/preview
POST   /liquidaciones                     (guardar una)
POST   /liquidaciones/masivo              (generar varias)
GET    /liquidaciones                     (?empresaId ?periodo)
GET    /liquidaciones/:id
GET    /liquidaciones/:id/payslip         (HTML imprimible)
POST   /liquidaciones/:id/enviar          (correo al trabajador)
PATCH  /liquidaciones/:id/estado
DELETE /liquidaciones/:id
POST   /liquidaciones/marcar-pagado
```

**Fijos y licencias (Fase 7)**
```
GET    /haberes-fijos?trabajadorId
POST   /haberes-fijos
DELETE /haberes-fijos/:id

GET    /licencias?trabajadorId  |  ?empresaId&periodo  (consolidado)
POST   /licencias
DELETE /licencias/:id
```

**Indicadores, reportes, centralización, vacaciones, finiquitos**
```
GET/PUT /parametros          PUT /afp/:id
GET     /reportes/libro
GET/PUT /config-empresa      GET /plan-cuentas
GET     /centralizacion/preview | GET/POST /centralizacion | POST /centralizacion/reversar
GET     /causales
GET/POST /vacaciones         GET /vacaciones/:id
POST    /finiquitos/preview | POST/GET /finiquitos | GET /finiquitos/:id
GET     /dashboard | GET /metrics
```

Cliente HTTP del frontend: `src/services/rrhhService.js` (usa `fetchWithAuth` +
`mapperToCamel` de `src/services/apiClient.js`).

---

## 6. Frontend — navegación y componentes

RRHH se organiza como el CRM: **sub-páginas por `?sub=`** (menú desplegable `subRRHH` en
`src/components/MainPage.jsx`), no pestañas internas. `src/components/RecursosHumanos.jsx`
renderiza según `searchParams.get('sub')`.

| `?sub=` | Componente | Estado |
|---------|-----------|--------|
| `dashboard` | `RrhhDashboard.jsx` | ✅ (consolidado o por empresa) |
| `trabajadores` | `GestionEmpleados.jsx` | ✅ |
| `haberes` | `HaberesDescuentosRrhh.jsx` | ✅ (Fase 7) |
| `licencias` | `LicenciasMedicasRrhh.jsx` | ✅ (Fase 7) |
| `liquidaciones` | `GestionLiquidaciones.jsx` | ✅ |
| `centralizacion` | `CentralizacionRrhh.jsx` | ✅ (pide empresa vía `EmpresaPicker`) |
| `vacaciones` | `VacacionesRrhh.jsx` | ✅ |
| `finiquitos` | `FiniquitosRrhh.jsx` | ✅ |
| `configuracion` | `ConfiguracionRrhh.jsx` | ✅ (cuentas piden empresa) |
| `reportes` | `ReportesRrhh.jsx` | ✅ |
| `documentos` | placeholder | ⏳ próximamente |
| `asistencia` | placeholder | ⏳ próximamente |

**Selección de empresa.** Casi todas las vistas funcionan **sin forzar empresa** (consolidan por
organización). Solo **Centralización** y la card "Cuentas contables" de Configuración piden una
empresa, mediante `EmpresaPicker.jsx` inline (no pantalla completa). En **Trabajadores** la
empresa se elige dentro del modal.

**Diseño.** Tema *dark-glass* (`bg-white/[0.03]`, `border-white/10`). Los selects usan
`ThemedSelect` (`src/components/ui/ThemedSelect.jsx`, wrapper de Radix) — **nunca** `<select>`
nativo. Inputs date/month con `[color-scheme:dark]`.

**Descarga y envío de liquidaciones.** `getPayslip` genera un HTML autocontenido; el front lo
abre en una ventana nueva y llama a `print()` (→ PDF). Para varias, combina los payslips en un
solo documento con saltos de página. El envío por correo usa `src/utils/mailer.js`.

---

## 7. Operación y mantenimiento

**Aplicar una migración**
```bash
node src/DatabaseThings/migrations/aplicar_migracion.mjs src/DatabaseThings/migrations/<archivo>.sql
```

**Reiniciar el backend** (no hay nodemon): tras cambios en controllers/rutas hay que reiniciar
con `Ctrl+C` y `npm run start:all`. El frontend recarga solo con Vite.

**Correo.** `src/utils/mailer.js` usa nodemailer con las credenciales de envíos masivos
(`GMAIL_EMAIL_Masivo` / `GMAIL_PASSWORD_Masivo` en `.env`). Si faltan, los endpoints de envío
responden 503 con un mensaje claro. Recomendado probar primero a un correo propio.

**Íconos.** `lucide-react` es 0.285.0 — no tiene `BookText` (usar `Book`). Verificar íconos
nuevos: `grep "as <Icono>," node_modules/lucide-react/dist/esm/lucide-react.js`.

**Build de verificación**
```bash
npm run build
```

---

## 8. Pendientes y advertencias

- **Rol cliente** (no implementado): el cliente debe ver **solo su empresa**, sin aprobar ni
  centralizar. Hoy el módulo es solo admin.
- **Sub-páginas mock:** Documentos/Contratos y Control de Asistencia son placeholders.
- **Validación previa a pago real** (con el contador): flags imponible/tributable de
  `rem_concepto`, tasas (AFP/SIS/cesantía/mutual), tramos de impuesto único y asignación
  familiar. Hoy son PLACEHOLDER, editables desde la app.
- **Layouts PREVIRED / LRE**: base implementada, contrastar contra el layout oficial vigente.
- **Finiquitos y licencias**: cálculo base; validar legalmente antes de uso formal.

---

*Última actualización: 2026-07-25. Fases 0–7 implementadas.*
