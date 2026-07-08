# 📘 Documentación del Sistema VSV Pro

> Documento de referencia de todo lo implementado: arquitectura multi-tenant, CRM, permisos, perfil y credenciales de facturación. Actualizado 2026-07-06.

---

## 1. Visión general

VSV Pro es un sistema contable multi-empresa. Se transformó en **multi-tenant por organización**: cada "dueño" (administrador) tiene su propio espacio aislado, para poder entregar el sistema a otra persona sin que los datos se crucen.

**Stack:** React + Vite (frontend) · Node/Express (backend) · PostgreSQL/Supabase (BD).

**Roles:**
| Rol | Qué puede hacer |
|-----|-----------------|
| **Administrador** | Ve TODA su organización (empresas, CRM, etc.) + módulos de administración |
| **Cliente** | Ve solo las empresas que tiene asignadas; sin módulos de administración |

---

## 2. Multi-tenant por organización (aislamiento)

### Idea
Todo (usuarios y empresas) pertenece a una **organización**. Las consultas **siempre filtran por `organizacion_id`**, así ningún dueño ve datos de otro.

```
┌─ ORGANIZACIÓN A: VOLLAIRE & OLIVOS ─┐   ┌─ ORGANIZACIÓN B: Persona X (futura) ─┐
│  Usuarios: Admin, Prueba usuario    │   │  Usuarios: Admin de X                │
│  Empresas: 202                      │   │  Empresas: 0 (empieza vacío)         │
└─────────────────────────────────────┘   └──────────────────────────────────────┘
              ↑ No se ven entre sí ↑
```

### Base de datos
- Tabla **`organizacion`** (`id`, `nombre`, `created_at`).
- Columna **`organizacion_id`** en `usuario` y `empresa` (con índices).
- Organización principal actual: **VOLLAIRE & OLIVOS SIMPLE PYME LTDA**.
- Todos los usuarios y empresas existentes fueron migrados a esa organización.

### Backend
- **`middleware/auth.js`** → carga `organizacionId` en `req.user` en cada request (desde la sesión).
- **`getClientesCRM`** (clientes.controllers.js):
  - Filtra siempre por `e.organizacion_id`.
  - **Administrador**: ve todas las empresas de su organización.
  - **Cliente**: ve solo las asignadas en `audita`.
- **Al crear** empresas (`crearEmpresaCRM`, `createCompany`) y usuarios (`createUser`) → se les asigna la organización del creador automáticamente.
- **Login** y listados (`getCompanies`, `getAssignedCompanies`) → filtran por organización.

### Cómo entregar el sistema a otra persona (Persona X)
1. Crear una organización nueva.
2. Crear un usuario Administrador dentro de esa organización.
3. Persona X entra y ve su espacio **vacío y aislado**. Tus 202 empresas se quedan contigo.

### ⚠️ Pendiente de endurecer
Falta validar `organizacion_id` en endpoints que reciben un `empresaId` directo (contabilidad, facturación, bancos), para que nadie acceda a una empresa de otra organización pasando un ID a mano. Hoy nadie puede *seleccionar* una empresa de otra org, pero conviene blindar el backend.

---

## 3. CRM

### 3.1 Estados del cliente (pestañas)
Antes las pestañas eran "Activos / Inactivos" derivadas de si tenía datos de contacto (poco profesional). Ahora se separan dos conceptos:

- **Estado del negocio** (pestañas) → basado en campos reales (`activo`, `estado_pago`).
- **Completitud de la ficha** (medidor) → calidad de datos.

**Pestañas** (clasificación con prioridad: baja > por completar > suspendido > activo):

| Pestaña | Condición |
|---------|-----------|
| **Activos** | operando, `estado_pago` al día, ficha con datos |
| **Suspendidos** | `estado_pago = 'SERVICIO SUSPENDIDO'` |
| **Por completar** | ficha sin datos de contacto (onboarding; ej. solo RUT) |
| **De baja** | `activo = false` |

> Verificado con datos reales: 104 activos · 41 suspendidos · 58 por completar · 0 de baja = 203 (antes de eliminar la de prueba).

### 3.2 Medidor de completitud
Cada fila muestra una barra "Ficha X%" evaluando 10 campos (razón social, giro, régimen, teléfono, correo, representante, RUT rep, dirección, comuna, ciudad). 🔴 <40% · 🟡 40–79% · 🟢 ≥80%. Los placeholders del alta ("Sin especificar", etc.) no cuentan.

### 3.3 Pestaña "Creadas por usuarios" (solo admin)
- Muestra las empresas creadas por **clientes** (no por el admin), clasificadas por el **rol del creador** (`usuarioCreadorRol === 'Cliente'`).
- Trae una columna **"Creado por"** y un **filtro por creador**.
- Estas empresas **solo** aparecen en esta pestaña (no se mezclan en Activos/Inactivos).

### 3.4 Modo selección (limpio)
- Por defecto la tabla se ve **sin checkboxes**.
- Botón **"Seleccionar"** → activa el modo, aparecen los checkboxes + botón **"Seleccionar todos"** y **"Cancelar"**.
- Con al menos uno marcado aparece la barra de acciones masivas (exportar, marcar estado, eliminar).

### Archivos CRM
- `src/components/CRM.jsx` — lógica de estados, completitud, filtros, vista.
- `src/components/crm/views/CrmTableList.jsx` — tabla, pestañas, medidor, modo selección.
- `src/controllers/clientes.controllers.js` — datos (incluye `activo`, `usuarioCreador`, `usuarioCreadorRol`).

---

## 4. Login y permisos

- **Credenciales demo eliminadas** del login (ya no aparece "ejemplo@vsv.cl", solo "Correo").
- **Menú por rol** (`MainPage.jsx`): el Cliente ve solo CRM, Contabilidad, Facturación, Bancos, Mi Perfil. **No** ve Dashboard, RRHH ni Operación Renta.
- **Rutas protegidas** con `requireAdmin`: `dashboard.routes.js`, `rrhh.routes.js`, `renta.routes.js` (y administración de usuarios/empresas). Un cliente que intente entrar por URL recibe 403.

---

## 5. Selector de empresa (header)

- Componente `GlobalCompanySelector`.
- Para el **Administrador**, cuando no hay empresa seleccionada, muestra **"VOLLAIRE & OLIVOS SIMPLE PYME LTDA"** como empresa principal (antes decía "EMPRESA PRINCIPAL").
- Para clientes sigue diciendo "EMPRESA PRINCIPAL".
- Se evita el **duplicado**: la empresa real con el mismo nombre no vuelve a listarse.

---

## 6. Mi Perfil (rediseñado)

Componente `ProfileEditor.jsx`. Diseño profesional:
- **Hero** con avatar de iniciales, nombre, badge de rol y correo.
- **Información personal** (nombre, email, RUT) con iconos.
- **Cambiar contraseña** con **medidor de fuerza** (Débil/Media/Buena/Fuerte) y aviso "las contraseñas no coinciden".
- **Credenciales SII (Facturación)** → sección de credenciales (ver punto 7).

---

## 7. Credenciales de facturación (SII)

### Modelo: `credencial_global` — **por usuario**
Cada usuario (admin **o** cliente) tiene su **propio** set de 5 credenciales para facturar, **independiente de la empresa seleccionada** (igual que antes estaban en el `.env`).

**Tabla `credencial_global`** (PK `usuario_id`):
| Columna | Origen (.env) | Encriptado |
|---------|---------------|-----------|
| `dte_rut_encrypted` | DTE_RUT | ✅ |
| `dte_dv` | DTE_DV | no (dígito) |
| `dte_pass_encrypted` | DTE_PASS | ✅ |
| `pfx_pass_encrypted` | SII_PFX_PASS | ✅ |
| `ciudad` | DTE_CIUDAD | no |

> Reemplazó a la antigua `organizacion_credenciales_sii` (eliminada) y a un intento previo por-empresa.

### Encriptación
- `utils/crypto.js` con **AES-256-CBC** (`ENCRYPTION_KEY` del `.env`). En la BD solo se ven cadenas cifradas.
- Las contraseñas de **login de usuario** usan **bcrypt** (hash irreversible; no se pueden recuperar, solo resetear).

### Backend
- `credenciales.controllers.js`: `getCredencialGlobal` / `saveCredencialGlobal` (por `req.user.usuarioId`) + helper `obtenerCredencialGlobal(usuarioId)`.
- `credenciales.routes.js`: `GET/PUT /api/credenciales/global` (requireSession).

### Frontend
- `src/components/facturacion/tabs/CredencialesSII.jsx` — panel único (5 campos), embebido en Mi Perfil para todos.
- `src/services/siiService.js` — `getCredencialGlobalApi` / `saveCredencialGlobalApi`.

### ⚠️ Pendiente
Los scripts de facturación (puppeteer, `src/components/facturacion/scripts/*.mjs`) **todavía leen `process.env.DTE_*`**. Falta inyectarles la credencial del usuario logueado desde `credencial_global` (el helper `obtenerCredencialGlobal()` ya está listo) para que cada quien facture con la suya.

---

## 8. Resumen de cambios en la base de datos

| Cambio | Detalle |
|--------|---------|
| Tabla `organizacion` | Nueva (tenants) |
| `usuario.organizacion_id`, `empresa.organizacion_id` | Nuevas columnas + índices |
| Migración de datos | Todos los usuarios/empresas → organización principal |
| Tabla `credencial_global` | Nueva (credenciales de facturación por usuario) |
| Tabla `organizacion_credenciales_sii` | Creada y luego **eliminada** (reemplazada) |
| `empresa_credenciales` | Se le agregaron `dte_dv`, `pfx_pass_encrypted`, `ciudad` (quedaron sin uso al migrar a `credencial_global`) |
| Empresa de prueba `20724432-5` | **Eliminada** |

Migraciones en `src/DatabaseThings/migrations/`:
- `2026-07-06_organizacion_multitenant.sql`
- `2026-07-06_credencial_global.sql`
- (`2026-07-06_credenciales_emisor_sii.sql` y `2026-07-06_empresa_credenciales_dte.sql` quedaron como histórico de pasos intermedios)

---

## 9. Endpoints principales del backend

| Método | Ruta | Descripción | Acceso |
|--------|------|-------------|--------|
| POST | `/api/auth/login` | Inicia sesión | público |
| GET | `/api/clientes/crm` | Datos del CRM (filtrados por org) | sesión |
| POST | `/api/clientes/crm` | Crear empresa | sesión |
| GET | `/api/credenciales/global` | Leer credencial del usuario | sesión |
| PUT | `/api/credenciales/global` | Guardar credencial del usuario | sesión |
| GET | `/api/dashboard` | Dashboard | admin |
| — | `/api/rrhh`, `/api/renta` | Módulos | admin |

---

## 10. Cómo correr el proyecto

```bash
npm run server     # backend (Express) en puerto 4000
npm run dev        # frontend (Vite) en puerto 3000
npm run start:all  # ambos a la vez
npm run build      # compila el frontend
```

> **Importante:** el backend (`node ./src/server.js`) **no se recarga solo**. Después de cambios en el backend hay que **reiniciarlo** (Ctrl+C y volver a levantarlo). En el navegador, tras cambios de frontend, hacer **Ctrl+F5**.

---

## 11. Cuentas actuales

| Usuario | Rol | Correo | Nota |
|---------|-----|--------|------|
| Administrador master | Administrador | admin@vsv.cl | Dueño de la organización principal |
| Prueba usuario | Cliente | usuarioprueba@gmail.com | Cuenta de prueba |

> Las contraseñas están con bcrypt (no recuperables). Si se necesita entrar, se **resetean** a una nueva.

---

## 12. Pendientes (siguientes pasos)

1. **Conectar `credencial_global` a los scripts de facturación** (que dejen de usar `.env`).
2. **Validar `organizacion_id`** en endpoints con `empresaId` directo (blindaje multi-tenant).
3. **Conexión real al SII** (validar clave + traer DTEs): hoy simulada (mock); requiere certificado `.pfx` + integración SOAP.
4. Flujo de alta para **crear una organización nueva** (Persona X) desde la interfaz.
