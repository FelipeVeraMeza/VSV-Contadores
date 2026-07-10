# Requerimientos — Módulos Clientes y Prospectos (CRM VSV Contadores)

**Actualizado:** 2026-07-10 · Verificado contra el código y la base de datos.
**Leyenda:** ✅ Implementado · ⚠️ Parcial · ⏭️ Pendiente · ⛔ Bloqueado (falta migración)

---

## 0. Contexto

| Concepto | Descripción |
|---|---|
| **Prospecto** | Entidad `persona`. Contacto potencial. Puede existir con un solo dato. |
| **Cliente** | Entidad `empresa`. Requiere RUT válido. Es la unidad facturable. |
| **Relación** | N:N vía `persona_empresa`. Una persona puede crear o asociarse a empresas. |
| **Organización** | `empresa.organizacion_id` y `usuario.organizacion_id`. Aísla los datos entre dueños. |
| **Roles** | `Administrador`, `Consultor` (staff) y `Cliente` (usuario externo). |

**Clasificación de un cliente** (una sola pestaña, por prioridad):
`De baja` → `Por completar` → `Suspendidos` → `Activos`.
Las empresas creadas por usuarios de rol `Cliente` salen aparte, en `Creadas por usuarios`.

---

## A. MÓDULO CLIENTES (Empresa)

### A.1 Requerimientos Funcionales

#### Gestión del cliente (CRUD)

| ID | Requerimiento | Estado |
|---|---|---|
| RF-CL-01 | Crear cliente exigiendo RUT válido (dígito verificador, módulo 11). | ✅ |
| RF-CL-02 | La razón social es opcional; si se omite se usa el RUT como nombre provisional. | ✅ |
| RF-CL-03 | Detectar duplicados por RUT e impedir la creación, identificando al cliente existente. | ✅ |
| RF-CL-04 | Registrar al crear: giro, régimen, plan, contacto, representante legal, dirección y nota. | ✅ |
| RF-CL-05 | Al crear, generar la fila de credenciales y la sucursal casa matriz, y asignar la empresa al creador. | ✅ |
| RF-CL-06 | La empresa creada se asigna a la **organización** del usuario. | ✅ |
| RF-CL-07 | Eliminar un cliente de forma permanente, previa confirmación explícita. | ✅ |
| RF-CL-08 | Impedir la eliminación si tiene registros contables/facturación asociados. | ✅ |
| RF-CL-09 | Convertir un prospecto en cliente (crea la empresa y activa la persona). | ✅ |
| RF-CL-10 | **Dar de baja / reactivar** un cliente (`activo = false`) desde el CRM. | ⏭️ La pestaña «De baja» existe pero nada la puebla |

#### Ficha del cliente

| ID | Requerimiento | Estado |
|---|---|---|
| RF-CL-11 | Visualizar y editar datos de contacto y representante legal. | ✅ |
| RF-CL-12 | Editar el Estado de Pago (`AL DIA` / `NO PAGADO` / `SERVICIO SUSPENDIDO`). | ✅ |
| RF-CL-13 | Editar el Estado F29 (`DECLARADO` / `PENDIENTE` / `NO DECLARAR`). | ✅ |
| RF-CL-14 | Calcular el score automáticamente según los estados (no editable). | ✅ |
| RF-CL-15 | Visualizar y editar giro y régimen tributario. | ✅ |
| RF-CL-16 | Visualizar y editar dirección, comuna y ciudad (casa matriz). | ✅ |
| RF-CL-17 | Gestionar credenciales SII y portal web, enmascaradas, con ver y copiar. | ✅ |
| RF-CL-18 | Mostrar el logo del cliente. | ⚠️ Solo por URL |
| RF-CL-19 | Registrar la operación mensual F29 (ventas, compras, neto, bruto, impuesto único, n.º factura). | ✅ |
| RF-CL-20 | Registrar la renta anual (contrató, monto, estado del formulario, renta de marzo). | ✅ |
| RF-CL-21 | Mostrar indicadores de Dirección del Trabajo (atrasados, pendientes de firma). | ✅ |
| RF-CL-22 | Validar el RUT del representante y el correo antes de guardar. | ✅ |
| RF-CL-23 | Permitir vaciar (dejar en blanco) el contenido de un campo. | ✅ |
| RF-CL-24 | Mostrar la fecha de última modificación. | ✅ |
| RF-CL-25 | Destacar visualmente la nota urgente. | ✅ |
| RF-CL-26 | Mostrar recordatorios automáticos según el estado (pago, F29, DT, tickets abiertos). | ✅ |
| RF-CL-27 | Contactar por WhatsApp, teléfono o correo desde la ficha. | ✅ |
| RF-CL-28 | Copiar el RUT y las credenciales al portapapeles. | ✅ |
| RF-CL-29 | Accesos directos a Facturación y Bancos con la empresa activa. | ✅ |
| RF-CL-30 | Subir el logo como archivo. | ⏭️ Requiere storage |
| RF-CL-31 | Recordatorios por vencimiento con conteo de días («vence en 3 días»). | ⏭️ |

#### Plan y servicios

| ID | Requerimiento | Estado |
|---|---|---|
| RF-CL-32 | Mostrar el precio de cada plan según el tramo de facturación de la empresa. | ✅ |
| RF-CL-33 | Desglosar el valor: neto, IVA, total y RRHH gratis incluidos. | ✅ |
| RF-CL-34 | Cambiar de plan con confirmación previa (plan anterior, nuevo y su valor). | ✅ |
| RF-CL-35 | Registrar la fecha del cambio y su historial (autor y motivo). | ✅ |
| RF-CL-36 | Contratar servicios indicando un precio pactado. | ✅ |
| RF-CL-37 | Dar de baja un servicio (suspender, no borrar) con confirmación. | ✅ |
| RF-CL-38 | Reactivar un servicio suspendido, impidiendo duplicar uno ya activo. | ✅ |
| RF-CL-39 | Mostrar la fecha de inicio y de término de cada servicio. | ✅ |
| RF-CL-40 | Calcular el total de honorarios (plan + servicios) en neto y con IVA. | ✅ |
| RF-CL-41 | Comparar el precio sugerido (plan/tramo) contra lo configurado y alertar si se cobra menos. | ✅ |

#### Bitácora y tickets

| ID | Requerimiento | Estado |
|---|---|---|
| RF-CL-42 | Registrar conversaciones y tickets asociados al cliente. | ✅ |
| RF-CL-43 | Asignar prioridad, responsable y fecha de vencimiento a un ticket. | ✅ |
| RF-CL-44 | Marcar un ticket como resuelto o reabrirlo, y contar los abiertos. | ✅ |
| RF-CL-45 | Editar el texto de una nota existente. | ✅ |
| RF-CL-46 | Eliminar una nota. | ✅ |
| RF-CL-47 | Buscar dentro de la bitácora por texto, autor o responsable. | ✅ |
| RF-CL-48 | Registrar automáticamente los cambios de plan en la bitácora. | ✅ |
| RF-CL-49 | Adjuntar archivos a las notas. | ⏭️ Requiere storage |

#### Listado, vistas, búsqueda y orden

| ID | Requerimiento | Estado |
|---|---|---|
| RF-CL-50 | Clasificar cada cliente en una sola vista: Activos / Suspendidos / Por completar / De baja / Creadas por usuarios. | ✅ |
| RF-CL-51 | Mostrar un medidor de completitud de la ficha (0-100 %) por cliente. | ✅ |
| RF-CL-52 | Mostrar un semáforo de riesgo por fila (alerta, impago, F29). | ✅ |
| RF-CL-53 | Buscar por nombre, RUT, correo, teléfono (ignorando formato), representante, giro, dirección y comuna. | ✅ |
| RF-CL-54 | Filtrar por estado: Global, Críticos, F29 Pendientes y Al Día. | ✅ |
| RF-CL-55 | Filtrar por tipo de cliente y por plan. | ✅ |
| RF-CL-56 | Filtrar por usuario creador (solo rol Administrador). | ✅ |
| RF-CL-57 | Ordenar por Cliente, Plan, Score e Impuesto (ascendente/descendente). | ✅ |
| RF-CL-58 | Persistir la vista, los filtros y la búsqueda entre sesiones. | ✅ |
| RF-CL-59 | Mostrar el contador de resultados visibles. | ✅ |
| RF-CL-60 | Filtrar por servicio contratado, o por «sin correo» / «sin teléfono». | ⏭️ |

#### Importación, exportación y acciones masivas

| ID | Requerimiento | Estado |
|---|---|---|
| RF-CL-61 | Exportar los clientes filtrados a Excel (.xlsx). | ✅ |
| RF-CL-62 | Exportar a CSV. | ✅ |
| RF-CL-63 | Excluir las contraseñas de cualquier exportación. | ✅ |
| RF-CL-64 | Importar clientes desde Excel/CSV con detección automática de columnas. | ✅ |
| RF-CL-65 | Mostrar vista previa e informe de importación (creados, duplicados, errores por fila). | ✅ |
| RF-CL-66 | Activar un modo selección y ejecutar acciones masivas: exportar, cambiar estado de pago, eliminar. | ✅ |
| RF-CL-67 | Exportar a PDF. | ⏭️ |

### A.2 Requerimientos No Funcionales

#### Seguridad

| ID | Requerimiento | Estado |
|---|---|---|
| RNF-CL-01 | Toda petición al CRM exige una sesión válida. | ✅ |
| RNF-CL-02 | **Aislamiento por organización**: nadie ve empresas de otro dueño. | ✅ |
| RNF-CL-03 | Los usuarios de rol `Cliente` solo ven las empresas que tienen asignadas en `audita`. | ✅ |
| RNF-CL-04 | La reutilización de una empresa por RUT se acota a la misma organización. | ✅ |
| RNF-CL-05 | El RUT y las credenciales se almacenan cifrados; la búsqueda por RUT usa hash. | ✅ |
| RNF-CL-06 | Las subconsultas (notas, servicios, historial) se acotan a las empresas visibles. | ✅ |
| RNF-CL-07 | Validación de entrada en el servidor (RUT y correo), no solo en el navegador. | ✅ |
| RNF-CL-08 | Las credenciales no deben viajar descifradas; su lectura debe ser bajo demanda. | ⏭️ |
| RNF-CL-09 | Limitación de tasa (rate limiting) en los endpoints. | ⏭️ |
| RNF-CL-10 | Permisos granulares por rol (quién puede eliminar o ver contraseñas). | ⏭️ |

#### Rendimiento y escalabilidad

| ID | Requerimiento | Estado |
|---|---|---|
| RNF-CL-11 | No cargar notas/servicios/historial de empresas que el usuario no puede ver. | ✅ |
| RNF-CL-12 | Paginación en el servidor del listado de clientes. | ⏭️ |
| RNF-CL-13 | Virtualización de la tabla para grandes volúmenes. | ⏭️ |
| RNF-CL-14 | Caché o carga incremental en lugar de recargar todo en cada refresco. | ⏭️ |

#### Integridad de datos

| ID | Requerimiento | Estado |
|---|---|---|
| RNF-CL-15 | La actualización es parcial: solo modifica los campos enviados y permite vaciarlos. | ✅ |
| RNF-CL-16 | Mantener la coherencia de `rut_hash` y `rut_rep_hash` al editar un RUT. | ✅ |
| RNF-CL-17 | Crear, eliminar, cambiar plan y convertir son operaciones transaccionales con rollback. | ✅ |
| RNF-CL-18 | Respetar las restricciones `CHECK` de la base para los estados de pago y F29. | ✅ |
| RNF-CL-19 | Bloqueo optimista para evitar que dos usuarios se sobrescriban. | ⏭️ |
| RNF-CL-20 | Normalización del teléfono (+56, espacios, guiones) en el almacenamiento. | ⚠️ Solo al mostrar |

#### Usabilidad

| ID | Requerimiento | Estado |
|---|---|---|
| RNF-CL-21 | Toda acción destructiva pide confirmación. | ✅ |
| RNF-CL-22 | Retroalimentación inmediata de cada acción. | ✅ |
| RNF-CL-23 | Estado vacío con mensaje propio de cada vista y acción sugerida. | ✅ |
| RNF-CL-24 | Nunca presentar datos de ejemplo como si fueran reales. | ⚠️ Hecho en Métricas; **pendiente en Dashboard** |
| RNF-CL-25 | La interfaz se adapta a distintos tamaños de pantalla. | ⚠️ Scroll horizontal en móvil |
| RNF-CL-26 | Indicadores de carga por sección (skeletons). | ⏭️ |

#### Accesibilidad

| ID | Requerimiento | Estado |
|---|---|---|
| RNF-CL-27 | Los controles clave tienen etiqueta accesible (`aria-label`). | ✅ |
| RNF-CL-28 | Los estados se comunican con texto, no solo con color. | ✅ |
| RNF-CL-29 | Navegación completa por teclado con foco visible consistente. | ⏭️ |

#### Auditoría y trazabilidad

| ID | Requerimiento | Estado |
|---|---|---|
| RNF-CL-30 | Registrar quién creó y quién editó cada cliente, y cuándo (`empresa_auditoria`). | ✅ |
| RNF-CL-31 | Conservar el historial completo de cambios de plan. | ✅ |
| RNF-CL-32 | Mostrar la última modificación en la ficha. | ✅ |
| RNF-CL-33 | El Administrador ve qué usuario creó cada empresa. | ✅ |
| RNF-CL-34 | Auditar quién visualiza las credenciales de un cliente. | ⏭️ |

#### Confiabilidad

| ID | Requerimiento | Estado |
|---|---|---|
| RNF-CL-35 | Un error de render no debe tumbar el módulo (error boundary con reintento). | ✅ |
| RNF-CL-36 | El sistema degrada con gracia si una migración no ha sido aplicada. | ✅ |
| RNF-CL-37 | Ante un fallo de carga, ofrecer reintento explícito y mensaje claro. | ⚠️ |

---

## B. MÓDULO PROSPECTOS (Persona)

### B.1 Requerimientos Funcionales

| ID | Requerimiento | Estado |
|---|---|---|
| RF-PR-01 | Crear un prospecto con **un solo dato**: nombre, teléfono, correo o RUT. | ✅ |
| RF-PR-02 | Validar RUT (dígito verificador), correo (formato) y teléfono (mínimo 8 dígitos). | ✅ |
| RF-PR-03 | Detectar duplicados por RUT, correo, teléfono o nombre+apellidos, permitiendo forzar. | ✅ |
| RF-PR-04 | Registrar múltiples teléfonos y correos por persona. | ✅ |
| RF-PR-05 | Registrar nombres, fecha de nacimiento, dirección, comuna, región, rubro, observaciones y origen. | ✅ |
| RF-PR-06 | Asignar un ejecutivo responsable. | ✅ |
| RF-PR-07 | Asignar etiquetas y servicios de interés. | ✅ |
| RF-PR-08 | Gestionar los estados `prospecto` / `activo` / `inactivo` con historial de cambios. | ✅ |
| RF-PR-09 | Listar mostrando por defecto solo los `prospecto`, con chips para ver los demás. | ✅ |
| RF-PR-10 | Inactivar y reactivar directamente desde el listado. | ✅ |
| RF-PR-11 | **Convertir a Cliente en un paso**: crear (o reutilizar) la empresa, copiarle el contacto de la persona, asociarla, pasar la persona a `activo` y navegar a Clientes. | ✅ |
| RF-PR-12 | La empresa creada hereda la **organización** del usuario. | ✅ |
| RF-PR-13 | Crear, editar y buscar notas del prospecto. | ✅ |
| RF-PR-14 | Asociar y desasociar empresas existentes. | ✅ |
| RF-PR-15 | Fusionar un registro duplicado dentro del registro objetivo. | ✅ |
| RF-PR-16 | Eliminar un prospecto de forma permanente. | ✅ |
| RF-PR-17 | Buscar por nombre, RUT, correo o teléfono. | ✅ |
| RF-PR-18 | Adjuntar archivos a las notas. | ⏭️ |
| RF-PR-19 | Pasar de `prospecto` a `activo` automáticamente al contratar un servicio. | ⏭️ |

### B.2 Requerimientos No Funcionales

| ID | Requerimiento | Estado |
|---|---|---|
| RNF-PR-01 | Toda petición exige una sesión válida. | ✅ |
| RNF-PR-02 | El RUT se almacena cifrado y se busca por hash. | ✅ |
| RNF-PR-03 | Validación de entrada en el servidor. | ✅ |
| RNF-PR-04 | Crear, fusionar y convertir son operaciones transaccionales. | ✅ |
| RNF-PR-05 | La eliminación es permanente y sin papelera (decisión explícita del negocio). | ✅ |
| RNF-PR-06 | **Aislamiento por organización**: un dueño no debe ver los prospectos de otro. | ⛔ **La tabla `persona` no tiene `organizacion_id`. Requiere migración.** |
| RNF-PR-07 | Los usuarios de rol `Cliente` no deberían ver todos los prospectos. | ⏭️ |
| RNF-PR-08 | Paginación en el servidor. | ⏭️ |
| RNF-PR-09 | La búsqueda debe resolverse en la base, no en memoria. | ⚠️ Hoy se filtra en memoria |
| RNF-PR-10 | Auditoría de cambios de estado (historial). | ✅ |
| RNF-PR-11 | Auditoría de ediciones de datos del prospecto. | ⏭️ |
| RNF-PR-12 | La reutilización de empresa por RUT al convertir se acota a la organización. | ✅ |

---

## C. Brechas prioritarias

Ordenadas por riesgo, no por esfuerzo:

1. **RNF-PR-06 ⛔ — Los prospectos NO están aislados por organización.** La tabla `persona` carece de `organizacion_id`, así que `listarPersonas` devuelve **todos los prospectos de todos los dueños**. Es una fuga real entre organizaciones y hoy no se puede cerrar sin una migración. **Es la brecha más grave del sistema.**
2. **RF-CL-10 — No existe forma de dar de baja un cliente desde el CRM.** La pestaña «De baja» está construida, pero ningún endpoint pone `empresa.activo = false`, así que siempre estará vacía.
3. **RNF-CL-08 / RNF-CL-34 — Credenciales.** Viajan descifradas al navegador y nadie audita quién las mira.
4. **RNF-CL-24 — El Dashboard muestra cifras inventadas** (incluidas integraciones marcadas como «Conectado») sin advertencia.
5. **RNF-CL-12 / RNF-PR-08 — Sin paginación:** ambos módulos cargan todo en memoria.
6. **RNF-CL-19 — Sin bloqueo optimista:** dos ediciones simultáneas se pisan en silencio.
