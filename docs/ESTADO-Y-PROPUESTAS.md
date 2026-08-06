# Estado del sistema y propuestas pendientes

**Última actualización:** 4 de agosto de 2026
**Para qué sirve:** retomar el trabajo sin tener que reconstruir el contexto.
Qué existe de verdad, qué está simulado, qué está decidido y qué falta decidir.

> Todo lo que dice este documento está medido contra el código y la base de
> datos, no contra la impresión que da la pantalla. Donde hay una suposición, se
> dice que lo es.

---

## 1. Qué es el sistema

Plataforma interna de una oficina contable. React + Vite en el navegador,
Express + PostgreSQL (Supabase) en el servidor. Robots con Puppeteer para el SII.

**Multiempresa por organización.** Cada administrador es dueño de su propia
organización y no ve nada de las demás. Se filtra por `organizacion_id`.

| | |
|---|---|
| Tablas | **73** |
| Tablas con aislamiento por organización | **28** |
| Empresas activas en cartera | **93** |
| Usuarios activos | 3, todos Administradores |
| Organizaciones | 2 — *VOLLAIRE & OLIVOS SIMPLE PYME* y *VSV CONSULTORES* |

**Roles:** `Administrador`, `Consultor`, `Cliente`. No existe un nivel "master"
en la base: la cuenta maestra es un Administrador más, distinguido solo porque
entra con correo en vez de RUT.

**Ingreso:** todos entran con el **RUT sin dígito verificador**. Solo la cuenta
maestra usa correo.

---

## 2. Estado por módulo

### 2.1 Funcionando de verdad

| Módulo | Evidencia |
|---|---|
| **Facturación / DTE** | 7 fases cerradas. Credenciales SII por usuario, candado por cuenta, aislamiento verificado en 30 endpoints |
| **Tareas** | 7 fases cerradas, 86 comprobaciones contra la base real |
| **CRM / Clientes** | 29 consultas reales. Personas, prospectos, ficha, importación |
| **Cobros** | `cobro_mensual` con estados reales. 93 cobros de julio: 81 pendientes, 12 pagados |
| **Contabilidad** | Compras, ventas, honorarios, centralización, libros |
| **Remuneraciones** | 8 fases. Liquidaciones es el controlador más grande del sistema (49 consultas) |
| **Usuarios y permisos** | 4 candados de administrador, módulos por usuario, bitácora |
| **Correo masivo** | Funciona **en local**. Ver la advertencia de la sección 4 |
| **WhatsApp** | **Fase 2 funcionando**: 25 requerimientos implementados. QR con Baileys, respuesta automática con Gemini, varios números en paralelo, todo guardado en Postgres |

### 2.2 Simulado — muestra datos inventados

⚠️ **Estos módulos se abren, se ven bien y no consultan la base de datos.**

| Módulo | Qué pasa |
|---|---|
| **Operación Renta** | `renta.controllers.js` devuelve valores escritos a mano: régimen, cumplimiento, próxima declaración. Cero consultas |
| **RRHH (indicadores)** | `rrhh.controllers.js` responde siempre 15 empleados y $12.500.000 de masa salarial, sea cual sea la empresa |
| **Dashboard de empresa** | Importa la conexión a la base y no la usa nunca |
| **Reportes** | Sin consultas propias a la base |

> **Riesgo real:** si alguien toma una decisión mirando Operación Renta o los
> indicadores de RRHH, la está tomando con datos falsos.
>
> **Decisión pendiente:** construirlos o esconderlos del menú. Esconder toma una
> hora.

### 2.3 A medio camino

| Módulo | Estado |
|---|---|
| **Bancos / conciliación** | Existe y tiene **555 movimientos bancarios reales**. No usa la conexión normal sino el cliente de Supabase directo, y llama a un script externo. **Necesita una revisión a fondo antes de prometer nada sobre él** |

---

## 3. Lo que se resolvió y conviene no volver a discutir

Decisiones ya tomadas, implementadas y verificadas:

**Aislamiento entre organizaciones.** Victor tiene organización propia y no ve
tareas, proyectos, clientes ni correos de la otra. Verificado en cada fase.

**Facturación simultánea.** El candado es por cuenta del SII, no global: dos
personas facturan a la vez con credenciales distintas. El SII no permite dos
sesiones con la misma cuenta, y eso es lo que el candado respeta.

**Credenciales del SII por usuario**, guardadas cifradas, con respaldo en `.env`
solo para la cuenta maestra.

**Módulos por usuario**, no por rol. Un Consultor puede tener contabilidad y no
facturación.

**Bitácora.** Quién hizo qué, cuándo y con qué resultado.

**`updated_at` por trigger** en las tablas que importan. La lección del 30 de
julio: una fecha que depende de que el código se acuerde de escribirla es peor
que no tenerla, porque igual se toman decisiones mirándola.

**Archivar no es un estado.** Es una columna aparte. Como estado se perdería si
la tarea estaba terminada o cancelada, que es justo lo que interesa al revisar.

---

## 4. Deudas y riesgos abiertos

### 4.1 Grave

**El correo no funciona en producción.** Funciona desde un computador local. En
Railway los puertos de correo están bloqueados y el dominio `vsvconsultores.com`
no está verificado. Es un **trámite externo**, no programación.

**No hay respaldos propios.** Con 93 clientes, es lo primero que debería existir.
Hoy se depende de lo que haga el proveedor por su cuenta.

**El sistema corre desde un computador.** No hay despliegue reproducible. Si esa
persona no está, nadie levanta el servicio.

### 4.2 Importante

**No hay pruebas permanentes.** Cada verificación se escribe y se borra. Si
alguien toca el avance de proyectos, nada avisa que se rompió.

**Los permisos por tarea están apagados.** El código existe y decide bien, pero
arranca en modo permisivo: anota en la bitácora lo que habría bloqueado y deja
pasar. Se enciende con `PERMISOS_TAREA_ESTRICTO=true`.

**No hay notificaciones de ningún tipo.** Si asignas una tarea, la persona se
entera cuando abre la pantalla.

**`config.js` alterna a mano entre local y producción.** Está comprometido a
`localhost` en el árbol de trabajo. **Si eso se sube y se despliega, la página en
producción deja de funcionar entera.** Debería salir de un archivo de entorno.

### 4.3 Menor

- Los adjuntos se guardan dentro de la base: cada respaldo se los lleva. Hay
  topes (7 MB por archivo, 25 MB por tarea), pero la solución buena es
  almacenamiento aparte.
- El paquete del CRM pesa 691 KB — el más grande, conviene partirlo.

---

## 5. Decisiones que esperan respuesta

| Decisión | Por qué urge |
|---|---|
| **WhatsApp: ¿se migra a la vía oficial?** | Ya funciona con Baileys, que es **no oficial**: va contra los términos de WhatsApp y arriesga el bloqueo del número. La vía oficial de Meta exige verificación de empresa y tarda semanas |
| **Conciliación: proveedor de API o cartola** | Los bancos chilenos no dan API abierta a pymes. Recomendación: cartola con calce automático |
| **Tareas: espacio compartido o privado por persona** | Hoy cualquier administrador ve todo. Recomendación: dejarlo compartido. Cambiarlo con 500 tareas cargadas es otro trabajo |
| **Operación Renta y RRHH: construir o esconder** | Hoy muestran datos inventados |
| **Módulo Agenda: entra al mes o no** | Ver sección 7 |

---

## 6. Las once metas del mes

| # | Meta | Estado real |
|---|---|---|
| 4 | Usuarios multiplataforma | ✅ hecho y verificado |
| 1 | CRM, facturador y notas | 🟡 facturador y notas cerrados; CRM sin criterio de "listo" |
| 11 | Extracción SII automática | 🟡 los robots existen, falta que corran solos |
| 10 | Remuneraciones mejorado | 🟡 construido, falta definir "mejorado" |
| 7 | Creación de empresas | 🟡 existe, sin repaso completo |
| 6 | Colores y visual | 🟡 tema claro migrado, falta pulido |
| 9 | Correos masivos | 🔴 funciona en local, **no en producción** |
| 2 | Dejar de usar Excel | ⬜ falta lo principal: **migrar los datos** |
| 3 | WhatsApp | 🟡 **más avanzado de lo que parecía**: responde y guarda contactos desde el 16-jul. Falta cargar qué sabe la IA sobre la oficina, y decidir si se migra a la vía oficial |
| 5 | Responsive | ⬜ alcance demasiado ancho |
| 8 | Conciliación bancaria | 🟡 hay 555 movimientos reales; **revisar antes de prometer** |

**Faltan en la lista y deberían estar:** respaldos, despliegue reproducible,
capacitación del equipo, y qué se hace con los módulos simulados.

**Y falta lo esencial:** ninguna meta define qué es "100%". Sin criterio escrito
no se puede dar por cumplida ni por incumplida.

---

## 7. Propuestas por construir

### 7.1 Módulo Agenda — la principal

**En una frase:** un calendario que se llena solo con las obligaciones de cada
cliente, avisa antes de que venza el plazo, y muestra quién está al día.

**El problema:** 93 clientes por cuatro obligaciones habituales son **cerca de
370 vencimientos al mes** que hoy viven en la memoria de las personas. No se sabe
quién va atrasado hasta que es tarde, y cuando falla se pasa un plazo legal.

**Por qué no sirve comprar Asana o Jira:** ninguno sabe que el F29 vence el 12.
Habría que crear las 93 tareas a mano igual.

**Cuatro pantallas:** Calendario (mes/semana/día, arrastrar para reprogramar) ·
Obligaciones (se define una vez lo que se repite) · Cumplimiento (la grilla de
quién presentó y quién no) · Carga del equipo.

**Cuatro tablas nuevas:** `feriado`, `obligacion`, `obligacion_empresa`,
`tarea_historial`. Nada existente se toca.

**Fases:** C1 modelo · C2 calendario · C3 generador + cumplimiento · C4 carga ·
C5 historial · C6 avisos · C7 tablero.

**Lo mínimo que ya sirve: C1 + C3.**

**Lo que se necesita de la oficina** (no sale del código): la lista real de
obligaciones con su día, qué obligación aplica a qué cliente, y quién responde
por cada una. Una o dos horas con quien lleva la operación.

**Costo:** del tamaño del módulo de Tareas completo. No está en las once metas.

📄 Detalle completo en `agenda-propuesta.md` y `calendario-requerimientos.md`.

### 7.2 Lo que el módulo de Tareas no hace

Por si alguien lo busca: no hay tablero kanban, calendario, notificaciones,
tareas recurrentes, adjuntos en comentarios, más de un nivel de subtareas, ni
registro de cambios por tarea.

De todos, **el que más se va a echar de menos son las notificaciones**.

### 7.3 Explícitamente descartado

Sprints, puntos de historia, burndown, epics, flujos configurables por proyecto,
dependencias entre tareas, y presentar al SII automáticamente. Todo eso resuelve
problemas de equipos grandes de desarrollo, no de una oficina de tres personas.

---

## 8. Cómo retomar

**Si hay una hora:** definir por escrito qué es "listo" para las once metas. Es
lo más barato y lo que más discusión evita a fin de mes.

**Si hay una tarde:** activar respaldos y sacar `config.js` del control manual.
Son las dos deudas que hoy pueden costar caro.

**Si se aprueba Agenda:** arrancar por C1 (modelo) y C3 (generador), en ese
orden, y **generar en borrador para un solo cliente** antes de soltarlo sobre los
93. Un generador equivocado deja la lista de todos inservible.

**Antes de cualquier despliegue:** revisar que `config.js` apunte a producción.

---

## 9. Dónde vive cada cosa

| | |
|---|---|
| Requerimientos del facturador | `docs/facturador-requerimientos.md` |
| Requerimientos de Tareas | `docs/tareas-requerimientos.md` |
| Propuesta de Agenda | `docs/agenda-propuesta.md` |
| Requerimientos del calendario | `docs/calendario-requerimientos.md` |
| Remuneraciones | `docs/remuneraciones-requerimientos.md` |

| CRM: clientes y prospectos | `docs/crm-modulo.md` |
| Diagnóstico del correo | `docs/correo-envio-diagnostico.md` |
| Migraciones | `src/DatabaseThings/migrations/` |
| Aplicar una migración | `node src/DatabaseThings/migrations/aplicar_migracion.mjs <archivo.sql>` |
| Levantar todo | `npm run start:all` — backend en 4000, página en 3000 |

**Advertencia sobre el servidor:** Node lee los archivos una sola vez, al
arrancar. Después de cambiar código del backend **hay que reiniciarlo**; si el
puerto 4000 ya está ocupado, el nuevo muere en silencio con `exited with code 1`
y el viejo sigue respondiendo con el código antiguo. Costó una hora descubrirlo
el 4 de agosto.
