# Bitácora CRM — Trabajo del 19-jul-2026

Resumen de **todo lo que se hizo hoy en el CRM** (Clientes y Prospectos), para retomar desde aquí.

---

## 1. Módulo CLIENTES (empresas)

### Crear / eliminar
- **Crear cliente real** (antes era un stub): inserta la empresa, credenciales y casa matriz, la asigna a la organización del usuario. Valida RUT (dígito verificador) y **detecta duplicados por RUT**.
- **Eliminar cliente** con confirmación (borra en transacción; si tiene registros contables asociados, avisa y no borra).
- Se permite crear/guardar **empresas sin RUT** (para "inicio de actividades"); el RUT se agrega después.

### Ficha del cliente
- **Estado de Pago y Estado F29 editables** (dropdowns con los valores válidos de la BD).
- **RUT de la empresa editable** + **Honorario mensual editable** (nuevo).
- Giro, régimen, dirección/comuna/ciudad editables. Validación de RUT rep. y correo al guardar.
- **Permite vaciar campos** (antes el `COALESCE` conservaba el valor viejo).
- **Acciones rápidas**: WhatsApp, Llamar, Correo, Copiar RUT/clave. **Recordatorios** automáticos por estado.
- **Renta Anual**: renombrada a **AT 2026** y se **quitó "Renta Marzo Bruto"**.
- **Última modificación** visible.

### Plan y servicios
- Precio por **tramo de facturación**, confirmación al cambiar de plan, historial.
- **Total honorarios = honorario REAL del Excel (NETO)**, no el sugerido por tramo.
- Reactivar servicios suspendidos, fechas de servicio, "sugerido vs. cobrado".
- **Se eliminaron 361 `empresa_servicio` de prueba** (duplicaban el honorario e inflaban el total).

### Bitácora / tickets
- **Editar y borrar notas**; buscador dentro de la bitácora.
- Tickets con **prioridad / responsable / vencimiento**.

### Tabla y pestañas
- **Pestañas nuevas**: `Todas · Activos · Nuevos · Suspendidos · De baja` (se **eliminó "Por completar"**).
  - **Todas** = cartera vigente del Excel. **Nuevos** = inicio de actividades / verificación pendiente.
- Columna **"Neto mensual"** (honorario) en vez de "Impuesto a pagar".
- Orden por columnas, búsqueda ampliada (nombre/RUT/correo/tel/giro/dirección/comuna), filtros por tipo y plan, **filtros persistentes**, contador de resultados, selección múltiple + acciones en lote.
- **Importar/Exportar** Excel/CSV. Error boundary + estados vacíos con CTA + aria-labels.

---

## 2. Módulo PROSPECTOS (personas)

- **Aislamiento por organización** (`persona.organizacion_id`) — antes se veían los de todos.
- **Estado "perdido"** + **motivo** al inactivar/perder (queda en historial).
- **Próxima acción** + **último contacto** + **consentimiento de contacto** (Ley 19.628).
- **Leads estancados** (>15 días sin contacto) y **"Mi cartera"** (por ejecutivo).
- **Selección múltiple** + acciones en lote (activar / inactivar / perder / eliminar).
- **Importar prospectos** desde Excel con **filtro por fecha** ("desde 10-jul-2026").
- **Convertir a Cliente** en un paso: crea/reutiliza la empresa, le pasa el contacto de la persona, la activa y navega a Clientes.
- Columna **"Qué necesita"** en la lista.

---

## 3. Backend / seguridad / integridad

- `getClientesCRM` filtra por **organización** y por **`en_cartera`** (oculta las que no están en el Excel).
- **UPDATE dinámico** (permite vaciar) + **validación server-side** (RUT/correo).
- **Auditoría**: tabla `empresa_auditoria` (quién creó/editó y cuándo).
- Se **quitó la restricción única de `rut_rep_hash`** (un representante puede tener varias empresas).
- `empresa.rut_encrypted` / `rut_hash` ahora **aceptan NULL** (empresas sin RUT).

---

## 4. Reconciliación de datos con el Excel

**Fuente:** `C:\Users\felip\Downloads\CONTABILIDAD 2026 (3).xlsx`, **hoja JUNIO** (la más actualizada).

- Se sincronizaron **~140 empresas** comparando campo por campo (el Excel manda; solo se cambió lo distinto; no se rellena con celdas vacías):
  estado de pago, estado F29, N° factura, correo, teléfono, representante, RUT rep, claves (rep. legal y SII), plan, ventas/compras netas, impuesto único, impuesto a pagar, contrató renta, formulario renta.
- Se importó el **honorario neto (NETO)** en 141 empresas (**no estaba en la BD**). Honorario mensual total de activos ≈ **$4.855.972**.
- **Cartera final: 142 empresas** (`en_cartera=true`). Las 73 que no están en el Excel quedaron **archivadas/ocultas** (no borradas).
- Clasificación final: **Activos 101 · Nuevos 4 · Suspendidos 4 · De baja 30** (+ archivadas ocultas).
- Creadas manualmente desde el Excel: **ESTUDIO CREATIVO ALTAVOZ**, **MADSAL** y **GLOBALINK** (estas 2 sin RUT aún → pestaña Nuevos).
- **ERICES Y TRESKOW**: se normalizó su RUT (estaba con "k" minúscula) → ya reconcilia. Queda De baja.
- **FRANCIS PAOLA**: estaba 2 veces en el Excel; se unificó en **una** ficha (manda **SERVICIO SUSPENDIDO**, EXECUTIVE, honorario $50.000, NO FACTURAR).

### Reglas usadas
- **Mapeo estado:** PAGADO→AL DÍA · NO PAGADO · SERVICIO SUSPENDIDO · TÉRMINO DE GIRO / DE BAJA → De baja · INICIO/VERIFICACIÓN PENDIENTE → Nuevos.
- **NETO (col F) = honorario mensual** (lo que paga a la firma), NO el impuesto a pagar.
- **CLAVE = clave del rep. legal · CLAVE SII = clave del SII · RUT rl = RUT del rep.**
- **No se suben:** IMPORTANTE, FECHA DE PAGO. No hay columna en BD para compras/ventas exentas ni giro/régimen.

---

## 5. Columnas / migraciones nuevas (BD)

| Tabla | Cambio |
|---|---|
| `persona` | + `organizacion_id`, `proximo_contacto`, `consentimiento_contacto`; enum `estado_persona` + `'perdido'` |
| `empresa` | + `es_nuevo`, `en_cartera`, `honorario_neto`; `rut_encrypted`/`rut_hash` nullable; drop unique `rut_rep_hash` |
| `empresa_auditoria` | tabla nueva (auditoría de creación/edición) |
| `bitacora_gestion` | + `prioridad`, `responsable_nombre`, `fecha_vencimiento`, `updated_at` |

Migraciones en `src/DatabaseThings/migrations/` (2026-07-02_*, 2026-07-10_*). Algunos cambios de columnas de empresa se aplicaron con scripts directos.

---

## 6. Pendientes / cómo seguir

1. **Dashboard del CRM: sigue con datos INVENTADOS** (KPIs, embudo, morosidad, y marca WhatsApp/Gmail como "Conectado" siendo falso). **Es lo siguiente a hacer real** (ya hay datos: 142 empresas, honorarios, estados, prospectos).
2. **Layout**: al abrir una ficha, el panel derecho se solapa con los filtros ("Todos los tipos / planes"). Falta ajustar (pendiente de captura).
3. **MADSAL** y **GLOBALINK**: cargarles el RUT cuando lo tengan (campo RUT ya editable en la ficha).
4. **FRANCIS PAOLA**: borrar la fila duplicada en el Excel para que la sincronización no la vuelva a partir.
5. Módulo de **Tareas/Reuniones** y **WhatsApp programado** (mensaje a las 8am) — diseñados, no construidos.
6. Deuda no funcional: **credenciales bajo demanda + auditoría de acceso**, paginación server-side, permisos por rol (RBAC).

---

## 7. Archivo de trabajo

- Excel fuente de verdad: **`CONTABILIDAD 2026 (3).xlsx` → hoja JUNIO**.
- Export de la BD para comparar: `C:\Users\felip\Downloads\clientes_base_de_datos.xlsx`.
- La sincronización es **idempotente** (solo cambia lo distinto); se puede re-correr tras editar el Excel.
