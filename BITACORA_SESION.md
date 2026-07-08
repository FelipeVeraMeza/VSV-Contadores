# 🗓️ Bitácora de la sesión de trabajo

> Registro cronológico de todo lo que se pidió y se hizo en este chat. Para "cómo funciona el sistema" ver `DOCUMENTACION.md`.

---

## Índice
1. Auditoría de permisos y limpieza del login
2. Restricción de módulos a administradores
3. Datos con empresa/organización NULL
4. Empresa principal en la vista de Contabilidad
5. Desasignación de la cuenta de prueba
6. Dónde se guardan empresas / compras / ventas
7. CRM: "Creadas por usuarios" + quién creó cada empresa
8. Renombrar el usuario a "Administrador master"
9. Bug: el admin no veía nada (SQL) → corregido
10. Asignar todas las empresas al admin
11. Separar mejor las empresas (filtro + pestaña)
12. Selector de empresa: "Empresa principal" y sin duplicados
13. Arquitectura: multi-tenant (Opción A)
14. Implementación multi-tenant por organización
15. Mejora profesional de Activos/Inactivos
16. Modo selección (botón "Seleccionar todos")
17. Auditoría de la cuenta "Prueba usuario"
18. Rediseño de "Mi Perfil"
19. Credenciales de facturación (SII)
20. Modelo final: `credencial_global` por usuario
21. Documentación

---

### 1. Auditoría de permisos y limpieza del login
- Se revisaron los 2 usuarios y sus permisos.
- Se **quitaron las credenciales demo** del login (ya no aparece "ejemplo@vsv.cl", solo "Correo").
- Archivo: `LoginPage.jsx`.

### 2. Restricción de módulos a administradores
- **Dashboard, Recursos Humanos y Operación Renta** quedaron solo para administradores.
- Se ocultaron del menú del Cliente (`MainPage.jsx`) y se protegieron las rutas con `requireAdmin` (`dashboard.routes.js`, `rrhh.routes.js`, `renta.routes.js`).

### 3. Datos con empresa/organización NULL
- Se identificaron y migraron registros sin empresa asignada a la empresa correcta (VOLLAIRE & OLIVOS).

### 4. Empresa principal en la vista de Contabilidad
- Cuando no hay empresa seleccionada, se muestra el nombre correcto de la empresa principal en `Contabilidad.jsx`.

### 5. Desasignación de la cuenta de prueba
- Se eliminó la asignación de empresa de "Prueba usuario" en la tabla `audita` (quedó sin empresas, como correspondía).

### 6. Dónde se guardan empresas / compras / ventas
- Se explicó la estructura: empresas en `empresa`, relación usuario–empresa en `audita`, compras/ventas en campos de `empresa`.

### 7. CRM: "Creadas por usuarios" + quién creó cada empresa
- El administrador debe poder ver todas las empresas y **quién las creó**; los clientes/otros solo lo suyo.
- Se agregó la lógica de creador (`usuarioCreador`) en `getClientesCRM`.

### 8. Renombrar el usuario a "Administrador master"
- El usuario "Didianne Grace Vollaire" pasó a llamarse **"Administrador master"** (se probó "Admin" y se revirtió a "Administrador master").

### 9. Bug: el admin no veía nada (SQL) → corregido
- Causa: en el `ORDER BY` se usaron **comillas dobles** (`"Sin asignar"`), que en PostgreSQL son un nombre de columna → la consulta fallaba y el admin no veía empresas.
- Se corrigió usando `NULLS LAST` y una subconsulta para el creador (sin duplicar filas). Verificado: 203 empresas, sin duplicados.

### 10. Asignar todas las empresas al admin
- Las 202 empresas "Sin asignar" se asignaron al **Administrador master** en `audita`.

### 11. Separar mejor las empresas (filtro + pestaña)
- Se agregó (solo para el admin) un **filtro "Creado por"** y una **pestaña "Creadas por usuarios"**.
- La columna e info de "Creado por" quedó **solo** dentro de esa pestaña.
- Las empresas creadas por clientes **no** se mezclan en Activos/Inactivos.

### 12. Selector de empresa: "Empresa principal" y sin duplicados
- Para el admin, "EMPRESA PRINCIPAL" muestra **"VOLLAIRE & OLIVOS SIMPLE PYME LTDA"**.
- Se eliminó el **duplicado** de esa empresa en la lista.

### 13. Arquitectura: multi-tenant (Opción A)
- Se discutió cómo entregar el sistema a otra persona sin que se crucen los datos.
- Se eligió la **Opción A: modelo de Organización (multi-tenant real)**. Las 202 empresas se quedan con el dueño actual; la persona nueva empieza con su espacio vacío.

### 14. Implementación multi-tenant por organización
- Tabla `organizacion`; columnas `organizacion_id` en `usuario` y `empresa`; migración de todo a la organización principal.
- `middleware/auth.js` carga `organizacionId` en la sesión.
- Todas las consultas de empresas filtran por organización (CRM, login, listados).
- Al crear empresas/usuarios se asigna la organización del creador.
- La detección de admin pasó a ser por **rol** (no por nombre); el creador se clasifica por **rol** (`usuarioCreadorRol`).
- Verificado: admin ve 203; organización nueva ve 0; cliente ve solo la suya.

### 15. Mejora profesional de Activos/Inactivos
- Se separó **estado del negocio** (pestañas por `activo`/`estado_pago`: Activos, Suspendidos, Por completar, De baja) de **completitud de la ficha** (medidor 0–100 por cliente).
- "Inactivos" pasó a ser **"Por completar"** (onboarding).
- Verificado: 104 activos · 41 suspendidos · 58 por completar · 0 de baja.

### 16. Modo selección (botón "Seleccionar todos")
- Se quitó el checkbox permanente de la cabecera (se veía feo).
- Ahora hay un botón **"Seleccionar"** → activa el modo y aparece **"Seleccionar todos"** y "Cancelar".

### 17. Auditoría de la cuenta "Prueba usuario"
- Rol Cliente, activa, en la organización principal, con 1 empresa, sin fuga de datos, módulos de admin bloqueados. Apta como cuenta de prueba.

### 18. Rediseño de "Mi Perfil"
- Hero con avatar de iniciales, badge de rol y correo; inputs con iconos; **medidor de fuerza** de contraseña; aviso "las contraseñas no coinciden".
- Archivo: `ProfileEditor.jsx`.

### 19. Credenciales de facturación (SII)
- Se detectó que ya existía la tabla `empresa_credenciales` (encriptada).
- Se aclaró que las 5 credenciales del emisor (DTE_RUT, DTE_DV, DTE_PASS, SII_PFX_PASS, DTE_CIUDAD) vivían en el `.env` compartido.
- Se construyó un panel de credenciales (varias iteraciones: por empresa → por organización → **por usuario**).

### 20. Modelo final: `credencial_global` por usuario
- Tabla **`credencial_global`** (PK `usuario_id`) con los 5 campos, sensibles encriptados.
- **Cada usuario** (admin o cliente) tiene su propio set, **independiente de la empresa seleccionada**.
- Se **eliminó** la tabla `organizacion_credenciales_sii` y la **empresa de prueba `20724432-5`**.
- Un solo panel `CredencialesSII.jsx` embebido en Mi Perfil para todos; endpoints `GET/PUT /api/credenciales/global`.
- Se corrigió un bug del RUT (`cleanRut` partía mal el cuerpo) y se validó el guardado:
  - Admin: `11030124-3`, clave `Facil25@`, .pfx `5229`, Santiago.
  - Prueba usuario: `20724432-5`, clave `1234`, .pfx `123456`, Santiago.

### 21. Documentación
- `DOCUMENTACION.md` — cómo funciona el sistema.
- `BITACORA_SESION.md` — este registro cronológico.

---

## Archivos tocados (resumen)

**Frontend**
- `src/components/autenticacion/LoginPage.jsx`
- `src/components/MainPage.jsx`
- `src/components/Contabilidad.jsx`
- `src/components/CRM.jsx`
- `src/components/crm/views/CrmTableList.jsx`
- `src/components/ui/GlobalCompanySelector.jsx`
- `src/components/ProfileEditor.jsx`
- `src/components/facturacion/tabs/CredencialesSII.jsx`
- `src/components/Facturacion.jsx`
- `src/services/siiService.js`
- `src/hooks/useAuth.jsx`

**Backend**
- `src/middleware/auth.js`
- `src/controllers/clientes.controllers.js`
- `src/controllers/companies.controllers.js`
- `src/controllers/auth.controllers.js`
- `src/controllers/users.controllers.js`
- `src/controllers/credenciales.controllers.js`
- `src/routes/credenciales.routes.js`
- `src/routes/dashboard.routes.js`, `rrhh.routes.js`, `renta.routes.js`
- `src/server.js`

**Base de datos (migraciones)**
- `src/DatabaseThings/migrations/2026-07-06_organizacion_multitenant.sql`
- `src/DatabaseThings/migrations/2026-07-06_credencial_global.sql`
- (intermedias) `2026-07-06_credenciales_emisor_sii.sql`, `2026-07-06_empresa_credenciales_dte.sql`

---

## Pendientes al cierre de la sesión
1. Conectar `credencial_global` a los scripts de facturación (dejar de usar `.env`).
2. Validar `organizacion_id` en endpoints con `empresaId` directo.
3. Conexión real al SII (hoy simulada).
4. Flujo para crear una organización nueva (Persona X) desde la interfaz.

> Recordatorio: tras cambios en el backend hay que **reiniciar el servidor** (`npm run server`); en el navegador, **Ctrl+F5**.
