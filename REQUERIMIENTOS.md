# 📋 REQUERIMIENTOS FUNCIONALES Y NO FUNCIONALES - VSV CONTADORES

## 🎯 ACTORES DEL SISTEMA

1. **Usuario Externo (Cliente)**
2. **Administrador (Didianne)**

---

## 1️⃣ USUARIO EXTERNO / CLIENTE

### 📌 REQUERIMIENTOS FUNCIONALES

#### Autenticación
- **RF-1.1** El usuario puede registrarse en el sistema con email y contraseña
- **RF-1.2** El usuario puede iniciar sesión con credenciales válidas
- **RF-1.3** El usuario recibe mensaje de error si credenciales son inválidas
- **RF-1.4** El usuario puede cerrar sesión
- **RF-1.5** La sesión expira automáticamente después de 24 horas de inactividad
- **RF-1.6** El usuario puede cambiar su contraseña

#### Selección de Empresa
- **RF-2.1** El usuario puede ver la(s) empresa(s) asignada(s)
- **RF-2.2** El usuario puede seleccionar qué empresa desea trabajar
- **RF-2.3** El usuario solo ve datos de la empresa seleccionada
- **RF-2.4** El usuario no puede acceder a empresas no asignadas

#### Dashboard
- **RF-3.1** El usuario ve dashboard con resumen general de su empresa
- **RF-3.2** El usuario puede ver ingresos del mes
- **RF-3.3** El usuario puede ver gastos del mes
- **RF-3.4** El usuario puede ver cantidad de DTE emitidos
- **RF-3.5** El usuario puede ver cantidad de empleados activos

#### Contabilidad
- **RF-4.1** El usuario puede ver el plan de cuentas
- **RF-4.2** El usuario puede ver comprobantes registrados
- **RF-4.3** El usuario puede crear nuevos comprobantes
- **RF-4.4** El usuario puede ver reportes contables
- **RF-4.5** El usuario puede descargar balance en PDF
- **RF-4.6** El usuario puede ver movimientos (diario/mayor/balance)

#### Facturación SII
- **RF-5.1** El usuario puede emitir facturas electrónicas (DTE 33)
- **RF-5.2** El usuario puede emitir facturas exentas (DTE 34)
- **RF-5.3** El usuario puede emitir guías de despacho (DTE 52)
- **RF-5.4** El usuario puede emitir notas de crédito/débito (DTE 61/56)
- **RF-5.5** El usuario puede ver historial de documentos emitidos
- **RF-5.6** El usuario puede descargar PDFs de documentos
- **RF-5.7** El usuario puede reenviar correos con documentos

#### RRHH
- **RF-6.1** El usuario puede registrar empleados
- **RF-6.2** El usuario puede ver listado de empleados activos
- **RF-6.3** El usuario puede generar contratos
- **RF-6.4** El usuario puede registrar asistencia
- **RF-6.5** El usuario puede generar liquidaciones de sueldo
- **RF-6.6** El usuario puede descargar documentos RRHH

#### Operación Renta
- **RF-7.1** El usuario puede ver análisis de rentas
- **RF-7.2** El usuario puede consultar cálculo de impuestos
- **RF-7.3** El usuario puede ver análisis de socios
- **RF-7.4** El usuario puede gestionar declaraciones de renta
- **RF-7.5** El usuario puede descargar reportes

#### CRM
- **RF-8.1** El usuario puede ver clientes de su empresa
- **RF-8.2** El usuario puede registrar nuevos clientes
- **RF-8.3** El usuario puede ver bitácora de conversaciones
- **RF-8.4** El usuario puede registrar notas/tickets
- **RF-8.5** El usuario puede ver servicios contratados

#### Bancos
- **RF-9.1** El usuario puede conectar cuentas bancarias
- **RF-9.2** El usuario puede reconciliar movimientos

### 🔒 REQUERIMIENTOS NO FUNCIONALES - USUARIO EXTERNO

#### Seguridad
- **RNF-1.1** Las contraseñas se almacenan hasheadas (bcrypt)
- **RNF-1.2** Los datos sensibles se encriptan (email, RUT)
- **RNF-1.3** El acceso requiere autenticación y sesión válida
- **RNF-1.4** Las sesiones se validan en cada petición
- **RNF-1.5** El usuario solo puede ver datos de empresas asignadas
- **RNF-1.6** Las credenciales SII se encriptan en la BD

#### Performance
- **RNF-2.1** Dashboard carga en menos de 2 segundos
- **RNF-2.2** Listados cargan con paginación (máx 20 registros)
- **RNF-2.3** Búsquedas responden en menos de 1 segundo
- **RNF-2.4** Las imágenes se optimizan antes de guardar

#### Disponibilidad
- **RNF-3.1** Sistema disponible 99.5% del tiempo
- **RNF-3.2** Backups automáticos diarios
- **RNF-3.3** Recuperación ante fallos en menos de 1 hora

#### Usabilidad
- **RNF-4.1** Interfaz responsive (desktop, tablet, mobile)
- **RNF-4.2** Errores mostrados en lenguaje claro
- **RNF-4.3** Confirmación antes de acciones destructivas
- **RNF-4.4** Historial de cambios disponible

#### Compatibilidad
- **RNF-5.1** Compatible con Chrome, Firefox, Safari, Edge (últimas 2 versiones)
- **RNF-5.2** Integración con SII (portal de impuestos)
- **RNF-5.3** Soporte para múltiples navegadores

---

## 2️⃣ ADMINISTRADOR (DIDIANNE)

### 📌 REQUERIMIENTOS FUNCIONALES

#### Gestión de Usuarios
- **RF-10.1** El admin puede ver listado de todos los usuarios
- **RF-10.2** El admin puede crear nuevos usuarios
- **RF-10.3** El admin puede editar datos de usuarios
- **RF-10.4** El admin puede cambiar rol de usuarios
- **RF-10.5** El admin puede desactivar/activar usuarios
- **RF-10.6** El admin puede eliminar usuarios
- **RF-10.7** El admin puede resetear contraseña de usuarios
- **RF-10.8** El admin puede asignar/desasignar empresas a usuarios

#### Gestión de Empresas
- **RF-11.1** El admin puede ver listado de todas las empresas
- **RF-11.2** El admin puede crear nuevas empresas
- **RF-11.3** El admin puede editar datos de empresas
- **RF-11.4** El admin puede cambiar plan de empresa
- **RF-11.5** El admin puede suspender/reactivar empresas
- **RF-11.6** El admin puede eliminar empresas
- **RF-11.7** El admin puede ver sucursales de empresa
- **RF-11.8** El admin puede gestionar credenciales SII por empresa

#### Gestión de Planes
- **RF-12.1** El admin puede ver planes disponibles
- **RF-12.2** El admin puede crear nuevos planes
- **RF-12.3** El admin puede editar planes
- **RF-12.4** El admin puede asignar servicios a planes
- **RF-12.5** El admin puede definir precios por plan

#### Gestión de Servicios
- **RF-13.1** El admin puede ver catálogo de servicios
- **RF-13.2** El admin puede crear nuevos servicios
- **RF-13.3** El admin puede asignar servicios a empresas
- **RF-13.4** El admin puede cambiar estado de servicios

#### Reportes y Analytics
- **RF-14.1** El admin puede generar reportes por periodo
- **RF-14.2** El admin puede ver estadísticas por empresa
- **RF-14.3** El admin puede exportar datos a Excel
- **RF-14.4** El admin puede ver auditoría de cambios
- **RF-14.5** El admin puede consultar historial de transacciones

#### Configuración Global
- **RF-15.1** El admin puede configurar parámetros del sistema
- **RF-15.2** El admin puede gestionar logs del sistema
- **RF-15.3** El admin puede ver estado de servicios externos
- **RF-15.4** El admin puede configurar conexión SII

### 🔒 REQUERIMIENTOS NO FUNCIONALES - ADMINISTRADOR

#### Seguridad
- **RNF-6.1** Solo admins pueden acceder al panel de administración
- **RNF-6.2** Auditoría completa de cambios realizados por admin
- **RNF-6.3** Logs guardados con timestamp y usuario
- **RNF-6.4** Permisos verificados en cada acción sensible
- **RNF-6.5** Sesión de admin requiere re-autenticación para acciones críticas

#### Performance
- **RNF-7.1** Listados de admin cargan en menos de 3 segundos
- **RNF-7.2** Reportes generados en menos de 5 segundos
- **RNF-7.3** Búsquedas en admin responden en menos de 2 segundos
- **RNF-7.4** Exportaciones procesadas en background sin bloquear UI

#### Integridad de Datos
- **RNF-8.1** Transacciones ACID para operaciones críticas
- **RNF-8.2** Validación de datos antes de guardar
- **RNF-8.3** Imposibilidad de eliminar empresas con datos activos sin confirmación
- **RNF-8.4** Backups antes de eliminaciones

#### Auditoría
- **RNF-9.1** Registro de todos los cambios en auditoría
- **RNF-9.2** Rastreo de quién hizo qué y cuándo
- **RNF-9.3** Historial no puede ser modificado (append-only)
- **RNF-9.4** Capacidad de revertir cambios si es necesario

---

## 📊 MATRIZ DE ACCESO

| Funcionalidad | Usuario Externo | Administrador |
|---------------|-----------------|---------------|
| Ver Dashboard | ✅ (su empresa) | ✅ (todas) |
| Ver Contabilidad | ✅ (su empresa) | ✅ (todas) |
| Ver Facturación | ✅ (su empresa) | ✅ (todas) |
| Ver RRHH | ✅ (su empresa) | ✅ (todas) |
| Gestionar Usuarios | ❌ | ✅ |
| Gestionar Empresas | ❌ | ✅ |
| Gestionar Planes | ❌ | ✅ |
| Ver Reportes Globales | ❌ | ✅ |
| Auditoría | ❌ | ✅ |

---

## 🛠️ REQUISITOS TÉCNICOS

### Backend
- Node.js v18+
- Express.js
- PostgreSQL 13+
- bcrypt (contraseñas)
- Crypto (encriptación)

### Frontend
- React 18+
- React Router v6+
- TailwindCSS
- Axios/Fetch

### Integraciones
- SII Portal (emisión DTE)
- SMTP (envío de correos)
- Puppeteer (automatización web)

### Infraestructura
- Railway (hosting backend)
- Vercel (hosting frontend)
- Supabase (BD PostgreSQL)

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

### Para Usuario Externo
- [ ] Sistema de autenticación funcional
- [ ] Gestión de sesiones con expiración
- [ ] Dashboard con métricas básicas
- [ ] Acceso a módulos según rol
- [ ] Encriptación de datos sensibles
- [ ] Validación de permisos en cada acción

### Para Administrador
- [ ] Panel de administración accesible
- [ ] CRUD completo de usuarios
- [ ] CRUD completo de empresas
- [ ] Sistema de auditoría funcional
- [ ] Reportes generables
- [ ] Gestión de planes y servicios

---

## 📞 SOPORTE Y MANTENIMIENTO

- Monitoreo 24/7 de servicios críticos
- Actualizaciones de seguridad mensuales
- Backups diarios a múltiples ubicaciones
- SLA de 99.5% disponibilidad
- Soporte técnico durante horario comercial
