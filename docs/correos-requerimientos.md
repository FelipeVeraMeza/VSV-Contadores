# Envío de correos a clientes — Requerimientos y estado real

**Fecha:** 16-ago-2026 · **última revisión:** 01-sep-2026 (ver sección 9)
**Alcance:** el módulo de envío de correos personalizados (CRM → pestaña Correo),
más todo lo que lo rodea: el remitente, las plantillas, las firmas y el registro.

**Cómo leer el estado:**

| Símbolo | Significado |
|---|---|
| ✅ | Hecho y verificado |
| 🟡 | Hecho en código, **sin probar en producción** |
| ⚠️ | Funciona a medias, o solo en ciertas condiciones |
| ❌ | No existe |

> **Advertencia sobre el estado.** Al 16-ago **nada de este módulo está desplegado
> ni ha enviado un correo real**. Todo lo marcado 🟡 compila, la consulta corre
> contra la base real y la vista previa se calculó con datos reales, pero **nunca
> se apretó enviar**. No dar por bueno lo 🟡 hasta hacer una corrida de verdad.

> **Segunda pasada (16-ago, misma jornada).** Se cerraron los agujeros más caros
> del listado original: registro por destinatario, desuscripción, adjuntos, botón
> de detener, anti-duplicado, detección de correos repetidos, enlaces con texto,
> destino de prueba configurable y responder-a. Están **probados contra la base
> real** (transacción revertida, sin dejar datos) y la firma del token de baja
> tiene prueba de intento de suplantación. Ver la **sección 7** al final.

---

## 0. De dónde sale este documento

El módulo se construyó el 16-ago sobre una pantalla que existía como maqueta
(`EmailPanel.jsx`, con datos falsos y sin backend). Al construirlo aparecieron
requerimientos que nadie había escrito, y otros que se descubrieron mirando los
datos reales. Este documento los recoge todos —incluidos los obvios— porque la
lección de los otros módulos es que **lo que no queda escrito se re-descubre
tarde y caro**.

Contexto técnico que condiciona todo lo demás:

- El correo sale por **Resend** (HTTPS), no por SMTP. Railway bloquea SMTP.
- El dominio **`vsvconsultores.com` está verificado** desde el 14-ago. Eso permite
  enviar desde *cualquier* dirección de ese dominio, y **solo** de ese dominio.
- Hoy pueden enviar **tres personas**: Administrador master, Matías y Victor. Los
  tres tienen rol Administrador, que es lo que exige la ruta.
- La cartera son **137 empresas**, de las cuales **132 tienen correo cargado**.

---

## 1. Requerimientos funcionales

### 1.1 Elegir a quién se le escribe

| ID | Requerimiento | Estado | Nota |
|---|---|---|---|
| RF-CO-01 | Elegir varias empresas de la cartera para un mismo envío | 🟡 | |
| RF-CO-02 | Buscar por razón social, RUT, plan o correo | 🟡 | |
| RF-CO-03 | Seleccionar de una vez todas las visibles según el filtro | 🟡 | |
| RF-CO-04 | Excluir automáticamente a las que no tienen correo válido | 🟡 | Son 5 de 137 |
| RF-CO-05 | Decir **cuántas** y **cuáles** quedaron fuera, sin esconderlo | 🟡 | Si no, uno cree que le escribió a toda la cartera |
| RF-CO-06 | Aceptar fichas con **varios correos** separados por `;` `,` o espacio | 🟡 | Hay clientes así en la base |
| RF-CO-07 | Filtrar por plan, estado de pago o servicio contratado | ❌ | Hoy solo por texto libre. «Escribirle a todos los del plan GO» no se puede en un paso |
| RF-CO-08 | Guardar una lista de destinatarios para reusarla | ❌ | Cada campaña se arma de cero |
| RF-CO-09 | Escribir a un correo suelto que no es de la cartera | ❌ | Hoy solo se elige de la lista de empresas |
| RF-CO-10 | Escribir a **prospectos**, no solo a clientes | ❌ | La tabla `persona` existe y tiene correos |
| RF-CO-11 | Detectar que el **mismo correo** está en dos empresas distintas | ❌ | Hoy esa persona recibiría el mismo correo dos veces sin que nadie lo note |

### 1.2 Redactar

| ID | Requerimiento | Estado | Nota |
|---|---|---|---|
| RF-CO-12 | Escribir asunto y cuerpo | 🟡 | |
| RF-CO-13 | Insertar **datos del cliente** que se reemplazan por empresa | 🟡 | 8 campos, ver 1.3 |
| RF-CO-14 | Insertar el dato **en el punto del cursor**, no al final | 🟡 | |
| RF-CO-15 | Avisar de marcas mal escritas (`{{valorplan}}`) antes de enviar | 🟡 | Se muestran en rojo |
| RF-CO-16 | Firma de texto | 🟡 | |
| RF-CO-17 | **Imagen** en la firma (logo) | 🟡 | Se achica a 400px y viaja como data URI |
| RF-CO-18 | Dar formato: negrita, cursiva, **enlaces** | ❌ | Es texto plano. Un enlace se ve como URL cruda; para «haga clic aquí» no hay forma |
| RF-CO-19 | Adjuntar archivos (PDF del informe, cartola, etc.) | ❌ | **El más pedido de los que faltan** |
| RF-CO-20 | Guardar un borrador sin enviarlo | ❌ | Si se cierra la pestaña, se pierde lo escrito |
| RF-CO-21 | Responder-a (`reply-to`) distinto del remitente | ❌ | |
| RF-CO-22 | Copia y copia oculta (CC / CCO) | ❌ | |

### 1.3 Datos que se reemplazan por empresa

Los 8 que existen hoy. Se resuelven **en el servidor** con lo que hay en la base
en el momento del envío.

| Marca | Sale de | Estado de los datos |
|---|---|---|
| `{{empresa}}` | `empresa.razon_social` | ✅ completo |
| `{{rut}}` | `empresa.rut_encrypted` (descifrado) | ✅ |
| `{{plan}}` | `plan.nombre` | ⚠️ **26 empresas sin plan** → sale «FREE» |
| `{{valor_plan}}` | `empresa.honorario_neto` | ⚠️ **34 empresas en $0** |
| `{{representante}}` | `empresa.nombre_rep` | ⚠️ 10 en blanco (medido el 11-ago) |
| `{{giro}}` | `empresa.giro` | ❌ **vacío en TODAS**. La marca existe pero no sirve |
| `{{correo}}` | `empresa.email_corporativo` | ✅ |
| `{{mes}}` | calculado | ✅ |

| ID | Requerimiento | Estado |
|---|---|---|
| RF-CO-23 | Avisar cuántas empresas recibirían un dato **en blanco o en cero** | 🟡 |
| RF-CO-24 | Listar cuáles son, para poder corregirlas antes | 🟡 |
| RF-CO-25 | Poder definir un **valor por defecto** por marca («si no tiene plan, decir "sin plan"») | ❌ |
| RF-CO-26 | Más marcas: dirección, comuna, teléfono, fecha de vencimiento del cobro | ❌ |

### 1.4 Vista previa

| ID | Requerimiento | Estado | Nota |
|---|---|---|---|
| RF-CO-27 | Ver el correo real de cada empresa, ya reemplazado | 🟡 | |
| RF-CO-28 | Navegar entre destinatarios con flechas | 🟡 | Revisar 2 o 3 evita el «se envió con la marca sin reemplazar» |
| RF-CO-29 | Ver el remitente que se va a usar | 🟡 | |
| RF-CO-30 | La previa muestra **texto plano**, no el HTML final | ⚠️ | Lo que se ve no es exactamente lo que llega |
| RF-CO-31 | Enviar **una prueba** a una casilla interna antes del envío real | 🟡 | Destino fijo en el código |
| RF-CO-32 | Elegir a qué dirección va la prueba | ❌ | Está fijo en `felipe.veram2001@gmail.com` |

### 1.5 Enviar

| ID | Requerimiento | Estado | Nota |
|---|---|---|---|
| RF-CO-33 | Enviar a todos los seleccionados | 🟡 | |
| RF-CO-34 | Confirmación explícita antes, diciendo a cuántos | 🟡 | |
| RF-CO-35 | Envío en segundo plano, que sobreviva al cierre del navegador | 🟡 | |
| RF-CO-36 | Barra de avance en vivo | 🟡 | |
| RF-CO-37 | Retomar la barra si se vuelve a entrar a media corrida | 🟡 | |
| RF-CO-38 | Pausa entre correos para no chocar con el límite de Resend | 🟡 | 600 ms fijos |
| RF-CO-39 | Listar los que fallaron, con el motivo | 🟡 | |
| RF-CO-40 | **Detener** un envío a medio camino | ❌ | Una vez que arranca, no hay botón de pánico. El facturador masivo sí lo tiene |
| RF-CO-41 | Reintentar solo los fallidos | ❌ | Hay que rehacer la campaña entera |
| RF-CO-42 | Programar el envío para una fecha y hora | ❌ | |
| RF-CO-43 | Impedir mandar **la misma campaña dos veces** por error | ❌ | Nada detecta que ya se envió eso mismo hace 5 minutos |

### 1.6 Plantillas

| ID | Requerimiento | Estado | Nota |
|---|---|---|---|
| RF-CO-44 | Guardar un correo como plantilla | 🟡 | |
| RF-CO-45 | Editar una plantilla existente | 🟡 | Mismo nombre = actualiza; otro nombre = crea |
| RF-CO-46 | Eliminar | 🟡 | |
| RF-CO-47 | Plantillas **propias** y plantillas **del equipo** | 🟡 | 🔒 mía · 👥 compartida |
| RF-CO-48 | No ver las plantillas privadas de otra persona | 🟡 | |
| RF-CO-49 | Guardar el asunto **con las marcas sin resolver** | 🟡 | Si se resolvieran al guardar, quedaría congelado el precio del día |
| RF-CO-50 | Rechazar al guardar una plantilla con marcas inventadas | 🟡 | Se corta donde se escribe una vez, no en cada uso |
| RF-CO-51 | Contar cuántas veces se usó cada una | 🟡 | Solo suma con envíos reales, no con pruebas |
| RF-CO-52 | Plantillas iniciales cargadas | ✅ | 4: Bienvenida, Recordatorio de pago, Recordatorio F29, Cambio de plan |
| RF-CO-53 | Convertir una plantilla propia en compartida desde la pantalla | ❌ | El backend lo soporta; falta el botón |
| RF-CO-54 | Duplicar una plantilla | ❌ | Se logra guardando con otro nombre, pero no es evidente |
| RF-CO-55 | Ordenar o agrupar las plantillas cuando sean muchas | ❌ | Con 4 no molesta; con 30 sí |

### 1.7 Remitente y firma por persona

| ID | Requerimiento | Estado | Nota |
|---|---|---|---|
| RF-CO-56 | Cada uno manda desde **su propia** dirección | 🟡 | Antes todo salía como Matías |
| RF-CO-57 | Guardar la firma propia y que se cargue sola al redactar | 🟡 | |
| RF-CO-58 | Guardar la imagen de la firma propia | 🟡 | |
| RF-CO-59 | Validar que el remitente sea del dominio verificado | 🟡 | Con otro dominio Resend rechaza con 403 |
| RF-CO-60 | Avisar en pantalla si no configuró el suyo | 🟡 | |
| RF-CO-61 | **Los 3 usuarios tienen su remitente configurado** | ❌ | Ninguno lo tiene. Sale el de la variable de entorno |
| RF-CO-62 | Que un administrador configure el remitente de otro | ❌ | Cada uno el suyo |

### 1.8 Registro y trazabilidad

> **Este es el bloque más flojo del módulo y el que más caro sale.**

| ID | Requerimiento | Estado | Nota |
|---|---|---|---|
| RF-CO-63 | Dejar registro **por destinatario** de qué se envió y cuándo | ❌ | **No existe.** Terminada la campaña, no queda rastro de a quién le llegó qué |
| RF-CO-64 | Poder responder «¿le llegó el aviso a este cliente?» | ❌ | Hoy no se puede contestar |
| RF-CO-65 | Ver el histórico de campañas enviadas | ❌ | |
| RF-CO-66 | Registro en bitácora de que hubo un envío | 🟡 | Solo el resumen: quién, cuándo, asunto y cuántos. No a quiénes |
| RF-CO-67 | Registrar **rebotes** (correo inexistente, buzón lleno) | ❌ | Resend los informa por webhook; nadie lo escucha |
| RF-CO-68 | Registrar aperturas y clics | ❌ | Resend lo ofrece. Decidir si se quiere |
| RF-CO-69 | Marcar en la ficha del cliente el último correo que se le mandó | ❌ | |

### 1.9 Permisos

| ID | Requerimiento | Estado |
|---|---|---|
| RF-CO-70 | Solo rol Administrador puede enviar | ✅ |
| RF-CO-71 | Cada uno solo ve empresas de **su** organización | ✅ Filtrado en el servidor, no en la pantalla |
| RF-CO-72 | Los datos se resuelven en el servidor, no se confía en el navegador | ✅ |
| RF-CO-73 | Registro de quién envió cada campaña | 🟡 |

---

## 2. Requerimientos no funcionales

### RNF-CO-01 · El remitente debe ser del dominio verificado — 🟡

Resend **solo** deja enviar desde un dominio verificado. Con cualquier otro
devuelve 403 y el correo no sale.

Se valida al guardar el perfil, con el mensaje explicando por qué. Sin esa
validación el error aparecería a mitad de una campaña de 130 correos.

### RNF-CO-02 · Nada se envía sin vista previa — 🟡

Un envío a 130 clientes no se puede deshacer. La previa es obligatoria: el botón
de enviar está deshabilitado hasta que haya destinatarios, asunto y texto.

### RNF-CO-03 · Los datos se resuelven en el SERVIDOR — ✅

La pantalla manda `empresaIds` + el texto con marcas. Los valores salen de la
base en el servidor.

Dos motivos: **(a)** si viajaran ya reemplazados, cualquiera podría mandar un
correo a nombre de la firma diciendo que el plan vale otra cosa; **(b)** el monto
es el de hoy y no el que estaba en pantalla hace media hora.

### RNF-CO-04 · Aislamiento por organización — ✅

La consulta de empresas filtra por `organizacion_id` **en el servidor**. Es lo que
impide que alguien mande correos a la cartera de otro despacho pasando ids a mano.

### RNF-CO-05 · El texto que se escribe es TEXTO, no HTML — ✅

El cuerpo se escapa antes de armar el HTML. Si se aceptara HTML del navegador, un
cliente podría recibir etiquetas crudas o algo peor.

La contrapartida es RF-CO-18: no se puede poner un enlace con texto.

### RNF-CO-06 · La imagen de la firma debe ser data URI — 🟡

Se valida el formato. Si se aceptara una URL externa y ese enlace muere, la firma
queda como un cuadro roto en **todos** los correos ya enviados; y una URL
arbitraria sería una forma de meter contenido de terceros en un correo que sale a
nombre de la firma.

> ⚠️ **Contrapartida conocida:** varios clientes de correo —Gmail entre ellos,
> según configuración— **bloquean imágenes incrustadas** hasta que el destinatario
> las acepta. No se puede resolver desde el envío. Por eso el botón de prueba.

### RNF-CO-07 · El avance vive en memoria — ⚠️

`estadoCampana` es un objeto en memoria del proceso. **Si el servidor se reinicia
a media corrida:**

- se pierde el avance y no queda registro de dónde iba
- el candado que impide dos envíos simultáneos se suelta

Es exactamente el mismo problema que RNF-05 del facturador. Con RF-CO-63
(registro por destinatario) se resolvería de paso: se sabría quién ya recibió.

### RNF-CO-08 · Ritmo de envío — ⚠️

600 ms fijos entre correos. Sale de que Resend limita peticiones por segundo.

**No está medido contra el límite real del plan contratado.** Si el plan es más
restrictivo, los últimos de una tanda larga van a rebotar sin que nadie lo sepa
(porque tampoco hay registro de rebotes — RF-CO-67).

### RNF-CO-09 · Límite diario del plan de Resend — ❌ SIN VERIFICAR

**El riesgo operativo más concreto que queda abierto.** El plan gratuito de Resend
ronda los **100 correos diarios**. La cartera con correo son **132**.

Una campaña a toda la cartera **superaría el límite**, y los que sobren se
rechazan. Con el estado actual eso pasaría **en silencio**.

> ►► Hay que confirmar qué plan está contratado antes del primer envío masivo.

### RNF-CO-10 · Un envío a la vez — 🟡

Si ya hay una campaña corriendo, la segunda se rechaza con 409. Evita que dos
personas manden a la vez y se pisen el ritmo.

### RNF-CO-11 · Limitador de peticiones — ✅

El envío usa `envioMasivoLimiter`: 5 cada 15 minutos por usuario. Corta el doble
clic por nervios. La vista previa no lleva limitador porque no manda nada.

### RNF-CO-12 · Tiempo de respuesta — 🟡

El envío responde de inmediato y sigue en segundo plano. 130 correos tardan
minutos; si la petición esperara, el navegador cortaría por tiempo y nadie sabría
cuántos salieron.

### RNF-CO-13 · Reintento ante fallo puntual — ❌

Si un correo falla, se anota y se sigue. No hay reintento. Un corte de red de 10
segundos pierde todos los de esa ventana.

### RNF-CO-14 · Tamaño del correo — ⚠️

La imagen de la firma se achica a 400px, pero **no hay tope al peso final**. Una
firma pesada multiplicada por 130 envíos es tráfico y puede afectar la entrega.

---

## 3. Requerimientos legales y de reputación — ❌ NINGUNO IMPLEMENTADO

> **Este bloque no es opcional y hoy está completamente vacío.**

| ID | Requerimiento | Por qué importa |
|---|---|---|
| RL-CO-01 | Enlace para **desuscribirse** en correos masivos | En Chile la Ley 19.628 y las prácticas de envío lo exigen para comunicación comercial. Gmail y Outlook **penalizan** al remitente que no lo incluye |
| RL-CO-02 | Respetar a quien se dio de baja: no volver a escribirle | Sin RL-CO-01 no hay a quién respetar |
| RL-CO-03 | Distinguir correo **transaccional** (una factura, un recordatorio de pago de un servicio contratado) de correo **comercial** (una promoción) | El primero no necesita baja; el segundo sí. Hoy el módulo no distingue |
| RL-CO-04 | Registrar el consentimiento | |
| RL-CO-05 | Atender rebotes para no seguir escribiendo a casillas muertas | Escribir repetidamente a direcciones inexistentes **daña la reputación del dominio** y termina mandando todo a spam, incluidas las facturas |

> ⚠️ **Consecuencia práctica de ignorar esto:** el dominio recién verificado el
> 14-ago no tiene reputación acumulada. Una campaña masiva sin baja, con rebotes
> sin atender, es la forma más rápida de que `vsvconsultores.com` termine en spam
> — y ahí caen también las facturas y los recordatorios, que sí son críticos.

---

## 4. Lo que hay que hacer, en orden

Ordenado por *daño que evita*, no por dificultad.

**Antes del primer envío masivo — bloqueante:**

1. **Confirmar el plan de Resend** (RNF-CO-09). 132 contra un tope de 100 no calza.
2. **Configurar el remitente de los tres** (RF-CO-61). Hoy todos saldrían con el
   correo por omisión, que es lo que este trabajo vino a arreglar.
3. **Desplegar y probar** con el botón de prueba, mirando cómo llega a Gmail.

**Corto plazo — lo que va a doler la primera semana:**

4. **Registro por destinatario** (RF-CO-63). Sin esto no se puede contestar «¿le
   llegó?», que es la primera pregunta que va a aparecer.
5. **Enlace de baja** (RL-CO-01) antes de cualquier correo no transaccional.
6. **Adjuntar archivos** (RF-CO-19). Es el que más se va a pedir.
7. **Botón de detener** (RF-CO-40).

**Después:**

8. Rebotes por webhook (RF-CO-67, RL-CO-05).
9. Filtrar por plan y guardar listas (RF-CO-07, RF-CO-08).
10. Enlaces con texto en el cuerpo (RF-CO-18).
11. Escribir a prospectos (RF-CO-10).
12. Limpiar el dato de `{{giro}}`, o sacar la marca hasta que sirva.

---

## 5. Deuda de datos que arrastra este módulo

No son problemas del correo, pero se ven desde acá y afectan lo que reciben los
clientes:

| Qué | Cuántas | Efecto en el correo |
|---|---|---|
| Empresas sin correo cargado | 5 de 137 | No reciben nada. Se listan, pero nadie las corrige |
| `honorario_neto` en cero | 34 | «su plan tiene un valor de $0» |
| Sin plan asignado | 26 | Sale «FREE» |
| `giro` vacío | **todas** | La marca `{{giro}}` no sirve |
| Mismo correo en 2+ empresas | sin medir | Esa persona recibe el mismo correo repetido |

---

## 6. Dónde está cada cosa

| Pieza | Archivo |
|---|---|
| Pantalla | `src/components/crm/views/EnvioCorreos.jsx` |
| Llamadas | `src/services/correosService.js` |
| Rutas | `src/routes/correos.routes.js` |
| Controlador | `src/controllers/correos.controllers.js` |
| Envío real (cascada) | `src/utils/mailer.js` → `mensajes_facturador_masivo.mjs` |
| Subida de imagen | `src/components/ui/LogoUploader.jsx` (reusado) |
| Tabla de plantillas | migración `2026-08-16_plantillas_correo.sql` |
| Imagen de firma | migración `2026-08-16_firma_imagen_correo.sql` |
| Remitente y firma por usuario | migración `2026-08-16_correo_por_usuario.sql` |

La maqueta anterior (`EmailPanel.jsx`) quedó en el repositorio sin usar. Tenía una
**bandeja de entrada**, que es un problema distinto —recibir, no enviar— y
requiere conectarse a un buzón por IMAP o a la API de Gmail. Si algún día se
retoma, ese archivo es el punto de partida del diseño.

---

## 7. Segunda pasada · 16-ago-2026

Se atacó el listado de la sección 4 en el orden ahí propuesto. Lo que cambió de
estado:

| ID | Requerimiento | Antes | Ahora |
|---|---|---|---|
| RF-CO-63 | Registro por destinatario | ❌ | 🟡 tablas `correo_campana` + `correo_envio` |
| RF-CO-64 | «¿le llegó a este cliente?» | ❌ | 🟡 `GET /correos/empresa/:id/envios` |
| RF-CO-65 | Histórico de campañas | ❌ | 🟡 backend listo, **falta la pantalla** |
| RF-CO-11 | Mismo correo en varias empresas | ❌ | 🟡 se avisa en la vista previa |
| RF-CO-18 | Enlaces con texto | ❌ | 🟡 `[texto](https://…)` |
| RF-CO-19 | Adjuntar archivos | ❌ | 🟡 7 MB c/u, 15 MB en total |
| RF-CO-21 | Responder-a | ❌ | 🟡 |
| RF-CO-32 | Elegir destino de la prueba | ❌ | 🟡 |
| RF-CO-40 | Detener a medio camino | ❌ | 🟡 |
| RF-CO-43 | Impedir campaña repetida | ❌ | 🟡 huella + ventana de 30 min |
| RL-CO-01 | Enlace de desuscripción | ❌ | 🟡 al pie de todo correo real |
| RL-CO-02 | Respetar a quien se dio de baja | ❌ | 🟡 se filtra en el servidor |

### 7.1 Decisiones que conviene no deshacer

**El token de baja va firmado, no guardado.** Se firma con HMAC sobre
`ENCRYPTION_KEY`. Así el enlace funciona sin crear una fila por cada correo
enviado, y sobre todo: **nadie puede dar de baja a otro cambiando la dirección en
la URL**, porque la firma no calza. Hay prueba explícita de ese intento.

**La baja es POST, no GET.** Los antivirus y varios clientes de correo
*pre-visitan* los enlaces para revisarlos. Con un GET que diera de baja, el
cliente quedaría desuscrito sin haber pulsado nada.

**La ruta de baja es pública, fuera de `/api/correos`.** Esas rutas exigen sesión
y rol Administrador; quien se da de baja es un cliente sin cuenta. Un enlace de
baja que pide iniciar sesión no es un enlace de baja. La protección está en la
firma, no en la sesión.

**La baja se guarda por CORREO, no por empresa.** La misma dirección está en
varias fichas —se midió: 5 casos reales— y quien pide no recibir más no está
pidiendo dejar de recibir *de una empresa*.

**El enlace de baja NO se pone en el correo de prueba.** Daría de baja a la
casilla interna y dejaría de llegar cualquier prueba futura.

**Detener no cancela lo enviado.** Es una bandera que el bucle mira antes de cada
correo. Lo que ya salió no vuelve; se corta lo que falta, que es lo único que
todavía se puede evitar.

**El registro guarda el texto YA RESUELTO.** Ocupa más y vale la pena:
reconstruirlo después mezclando la plantilla con los datos de hoy daría un texto
distinto al que se envió, porque el plan del cliente pudo cambiar.

**Una campaña `detenida` no cuenta como repetida.** Si se detuvo, lo normal es
querer reintentarla; bloquearla sería castigar el haber frenado a tiempo.

**Los adjuntos se escriben UNA vez a disco.** La cascada de envío los lee por
ruta de archivo (así los usa el facturador con los PDF del SII). Escribirlos por
destinatario sería 130 veces el mismo trabajo. Se borran al terminar.

### 7.2 Lo que se probó

Contra la base real, en una transacción revertida —no quedó ningún dato—:

- Se crea la campaña y **una fila por destinatario**
- Se puede contestar «¿le llegó a este cliente?» con su estado y su motivo
- La baja queda registrada y **no se duplica ni escribiéndola en mayúsculas**
- El filtro de bajas efectivamente excluye a esa empresa
- La huella detecta la campaña repetida, y una **detenida sí se puede reintentar**
- La base **rechaza un estado inventado** (la restricción CHECK funciona)

Y sobre la firma del token, en aislamiento: ida y vuelta, normalización a
minúsculas, rechazo de firma alterada, de token vacío, de token sin punto,
invalidez al cambiar `ENCRYPTION_KEY`, y **el intento de suplantación** —reusar
una firma legítima con otro correo— correctamente rechazado.

### 7.3 Hallazgo de datos

La detección de correos repetidos encontró **5 direcciones en dos empresas cada
una** en la cartera real. Una de ellas conecta con un problema ya conocido:

```
j.jarakern@gmail.com  →  T-LEX SPA  |  TELEX SPA
```

Es el mismo par que la tarea **REPRESENTANTE LEGAL EN VARIAS EMPRESAS** marcó por
tener RUT cruzados. Vale la pena mirarlos juntos.

### 7.4 Lo que sigue faltando

| | Estado |
|---|---|
| **Pantalla** del historial de campañas y de la lista de bajas | backend listo, falta la UI |
| ~~**Página pública** `/baja`~~ | ✅ **hecha y probada punta a punta** contra el servidor: token válido e inválido, ofuscación del correo, intento de suplantación por HTTP, baja repetida |
| RF-CO-07 · filtrar destinatarios por plan o estado de pago | ❌ |
| RF-CO-08 · guardar listas de destinatarios | ❌ |
| RF-CO-10 · escribir a prospectos | ❌ |
| RF-CO-41 · reintentar solo los fallidos | ❌ (el registro ya sabe cuáles son) |
| RF-CO-42 · programar el envío | ❌ |
| RF-CO-67 · rebotes por webhook de Resend | ❌ |
| RNF-CO-09 · **confirmar el plan de Resend** | ❌ sigue sin verificar |
| RF-CO-61 · **configurar el remitente de los tres** | ❌ ninguno lo tiene |

### 7.5 La página de baja · `/baja`

`src/components/publico/BajaCorreo.jsx`, registrada **fuera** de `ProtectedRoute`.

Tres decisiones del lado de la pantalla, que acompañan a las del backend:

- **El correo se muestra ofuscado** (`p******e@ejemplo.cl`). Lo decide el
  servidor. Si mostrara la dirección completa, cualquiera con el enlace sabría
  de quién es.
- **Hay que confirmar con un botón.** Abrir la página no da de baja a nadie: los
  antivirus pre-visitan enlaces, y con eso se desuscribiría a gente que nunca
  pulsó nada.
- **Se aclara qué SIGUE llegando.** «Seguirás recibiendo los correos necesarios
  del servicio que tienes contratado, como el envío de tus facturas.» Si alguien
  deja de recibir su factura sin saberlo, el problema es peor que el que vino a
  resolver.

Probada contra el servidor corriendo: token válido, token inválido (400),
**intento de suplantación por HTTP** —otro correo con una firma legítima—
rechazado, baja registrada con su motivo, y darse de baja dos veces sigue
respondiendo bien. El correo de prueba se borró.

---

## 8. Envío desde una planilla Excel · 16-ago-2026

**El caso real que lo motivó:** el F29 del mes. 46 clientes, cada uno con sus
propias cifras de compras, ventas e impuesto a pagar. Esas cifras **no están en
el sistema** —se calculan aparte y viven en un Excel— así que el envío desde el
CRM no sirve para esto.

Medido con la planilla real (`CONTABILIDAD 2026-2.xlsx`): 46 filas, 9 columnas,
46 de 46 con correo válido.

### 8.1 Cómo funciona

**Cada COLUMNA del Excel se convierte sola en un dato insertable**, sin
configurar nada:

| Columna del Excel | Marca |
|---|---|
| `RAZON SOCIAL` | `{{razon_social}}` |
| `IMPUESTO A PAGAR` | `{{impuesto_a_pagar}}` |
| `COMPRAS NETAS` | `{{compras_netas}}` |

La columna de correo se detecta sola: primero por nombre (CORREO / MAIL /
EMAIL), y si no aparece, la primera columna cuyos valores tengan una arroba.
Igual se muestra cuál eligió, porque adivinar mal significa no mandarle a nadie.

### 8.2 Decisiones

**Los números se formatean con separador de miles.** En esta planilla todo lo
numérico es dinero y `920319` en un correo a un cliente se lee mal. Los textos
—RUT, razón social— se dejan tal cual.

**Una marca inventada queda VISIBLE en la vista previa**, no se borra. Si se
borrara, el cliente recibiría una frase incompleta y nadie se enteraría.

**Todo lo demás es idéntico al envío desde el CRM**: mismas bajas, misma cuota,
mismo registro por destinatario, misma detección de correos repetidos. Solo
cambia de dónde salen los datos. El registro aguanta destinatarios que no son
clientes del sistema porque `correo_envio.empresa_id` acepta nulos y la razón
social se guarda como texto.

### 8.3 Estado · ✅ terminado y probado punta a punta

| | |
|---|---|
| `desdePlanilla` + rama en `previewCampana` | ✅ |
| **Rama en `enviarCampana`** — el envío de verdad | ✅ |
| **Pantalla: pestañas Cartera / Planilla, subir archivo, elegir hoja y columna** | ✅ |
| Guardar plantillas con marcas de planilla | ✅ |

**Cómo se usa:** en *Correo Masivo*, la columna «A quién» tiene dos pestañas.
En **Planilla** se sube el `.xlsx`/`.csv`, se marcan solas las filas que traen
correo, y las columnas aparecen como botones para insertar en el texto.

### 8.4 Lo que hubo que cambiar por dentro

**El envío se unificó.** `enviarCampana` recibía solo `empresaIds`. Ahora los
dos orígenes se normalizan a la misma forma —quién, a qué correos, con qué
asunto y qué texto ya resueltos— *antes* del bucle, así que de ahí para abajo el
envío no sabe ni necesita saber de dónde salieron los datos. Un `if` por origen
dentro del bucle habrían sido dos caminos separándose con cada arreglo.

**El resultado se marca por id de fila, no por (campaña, empresa).** Este era un
error silencioso esperando a pasar: los destinatarios de una planilla no tienen
empresa, y `WHERE empresa_id = NULL` no calza con nada. Los correos habrían
salido bien y el registro los habría dejado en `pendiente` para siempre.

**El texto se resuelve una sola vez.** Antes se combinaba al guardar la fila y
otra vez al enviar. Ahora se calcula una vez y se usa para las dos cosas: lo
enviado y lo registrado no pueden diferir.

**Guardar plantillas acepta `marcasExtra`.** El servidor rechaza las marcas que
no conoce, y las del Excel no existen en el CRM: sin esto no se podía guardar la
plantilla del F29. Las marcas de verdad mal escritas se siguen rechazando.

### 8.5 Pruebas

`probar_envio_planilla_e2e.mjs` y `probar_regresion_cartera.mjs` — servidor y
base reales, con el Excel real. 18 + 13 comprobaciones, todas OK. Salieron dos
correos de prueba a la casilla interna.

Lo que se verificó y no era obvio:

- El preview reconoce las 9 columnas y les toca a cada uno **sus** cifras
- `correo_envio` acepta la fila **sin empresa** (`empresa_id` nulo)
- El resultado **queda marcado** `enviado`, que es lo que el cambio de arriba
  arregla
- La prueba **gasta cuota** (1 → 2 → 3 de 100)
- **La cartera no se rompió**: sigue ligando la fila a la empresa y reemplazando
  `{{plan}}` y `{{valor_plan}}` como siempre

> ⚠️ **Ojo al leer el Excel en Node:** la build ESM de `xlsx` no trae `fs`
> enlazado, así que `XLSX.readFile()` falla con «Cannot access file». Hay que
> leer el buffer aparte y usar `XLSX.read(buffer, { type: 'buffer' })`. En el
> navegador no pasa, porque ahí se lee con `arrayBuffer()` —que es justamente lo
> que hace la pantalla.

> ⚠️ **Y al probar contra el servidor local desde un script:** el `fetch` de Node
> resuelve `localhost` a `::1` primero y el servidor escucha en IPv4, así que la
> petición muere con `ECONNRESET` antes de llegar. Hay que apuntar a `127.0.0.1`.

### 8.6 Plantilla «F29 disponible para pago»

Cargada en la base, **compartida** con los tres administradores. Es copia del
correo que ya se mandaba a mano, con los datos convertidos en marcas:

- Asunto: `F29 disponible para pago - {{razon_social}}`
- Usa `{{razon_social}}`, `{{rut}}`, `{{ventas_exentas}}`, `{{ventas_netas}}`,
  `{{compras_exentas}}`, `{{compras_netas}}`, `{{impuesto_a_pagar}}`

**Hay que cambiar a mano cada mes el período del paso 3** («Elegir el mes de
JUNIO 2026»). Va literal y no como marca a propósito: el F29 se declara el mes
siguiente al del período, así que un `{{mes}}` automático pondría el mes
equivocado la mitad de las veces. Queda anotado en la descripción de la
plantilla.

La **firma va nula** en la plantilla para que cada uno mande con la suya —la
imagen incluida— en vez de que la plantilla se la pise.

Verificada contra la planilla real: las 7 marcas existen como columna, los 46
clientes quedan dentro y a cada uno le tocan sus cifras.

---

## 9. Interfaz de Correo · 01-sep-2026

Se cerraron las tareas `COMUNICACIONES` y `CORREO`, con sus cinco subtareas. El
pedido de fondo era «el desplazamiento dentro de la sección es poco amigable, en
particular en la sección Correo», y tenía una causa concreta y medible.

### 9.1 El desplazamiento incómodo · dos barras de scroll anidadas

El editor del texto tenía `maxHeight: 460` con `overflow-y-auto`, y vivía dentro
del panel de Redactar, **que también scrollea**. Con un correo un poco largo
quedaban dos barras a pocos píxeles una de otra: la rueda del mouse movía una u
otra según dónde estuviera el puntero, y el texto se escapaba mientras se
escribía.

Se quitó el tope: el editor **crece con el texto** y scrollea una sola
superficie, la del panel. La barra de formato quedó **pegada arriba** (`sticky`),
porque sin eso, en un correo largo, había que subir hasta el principio para poner
una palabra en negrita.

> Detalle que costó: el `overflow-hidden` del marco anulaba el `sticky` — un
> ancestro con overflow recortado se convierte en el contenedor de
> desplazamiento y el sticky deja de pegarse. Se cambió por `isolate`, con
> `rounded-t-xl` en la barra para que la esquina siga limpia.

**Medido en el navegador con 40 líneas de texto:** 1 superficie con scroll donde
antes había 2. El editor creció de 260 a 824 px sin scrollear por dentro, y la
barra de formato sigue visible al llegar al final.

### 9.2 Las plantillas · de tira de pastillas a listado

Eran pastillas en línea que se envolvían en varias filas: con cinco o seis
empujaban todo el formulario hacia abajo y había que scrollear para llegar al
asunto — parte del mismo problema. Además, con los nombres cortados no se
distinguía una de otra.

Ahora ocupan **una sola línea** y se despliega la lista, mostrando el nombre **y
el asunto** de cada una, que es lo que permite distinguir dos parecidas; antes el
asunto solo aparecía pasando el mouse por encima. Se conservan el candado (mía),
las dos personas (la ve el equipo), la marca de cuál está cargada, las veces que
se usó y el botón de eliminar.

### 9.3 «Planilla» → «Contactos»

El botón decía «Planilla», que nombra el **archivo** y no la acción; puesto al
lado de «Cartera» no se entendía que ahí se suben contactos de afuera.

Quedó como **«Contactos»**, no «Cargar contactos», y por una razón medida: en el
panel real de 288 px el texto completo en mayúsculas se cortaba en
`CARGAR CONTAC…`, que se lee peor que el nombre corto. El verbo quedó en el globo
de ayuda y en la zona de abajo, que ya explica el paso.

### 9.4 Aviso del resultado en la campana

El envío masivo corre en el **servidor** y sigue aunque se cierre el navegador.
Solo había un mensaje en pantalla, que se pierde al cambiar de página: si la
persona se iba a otra cosa —lo normal en un envío de minutos— nunca se enteraba
de cuántos salieron ni de si algo falló.

Ahora queda un aviso permanente en la campana, con el texto adaptado a tres
casos: todo bien, con fallos, o **se cortó** (que es justamente lo que hay que
avisar: sin esto el envío moría en silencio).

> **Detalle que costó encontrar:** `notificar()` descarta el aviso cuando quien
> actúa es el mismo destinatario —pensado para no avisarte de lo que tú mismo
> hiciste—. Como acá hay que avisarle justamente a quien lanzó el envío, se llama
> **sin `actor`**. Probado: los 3 casos crean el aviso, aparece sin leer en la
> campana, y con `actor` = destinatario se descarta (7/7).

Una **prueba** no genera aviso: es un correo a uno mismo para revisar cómo quedó.

### 9.5 El formulario queda en limpio tras enviar

Antes seguía todo puesto: asunto, texto, adjuntos y destinatarios marcados. Para
escribir otra cosa había que ir borrando campo por campo, y **el riesgo real era
pulsar «Enviar» de nuevo sobre la misma lista** y mandarles el correo dos veces.

Se limpian asunto, cuerpo, adjuntos, selección, vista previa, plantilla cargada,
búsqueda y —si venía de un Excel— la planilla, porque esos contactos ya
recibieron el correo. Para eso el servidor ahora informa si el envío era de
prueba: **una prueba no limpia nada**.

### 9.6 El dominio `vsv.cl` no existe

Aparte del pedido, se corrigió el dominio inexistente en tres lugares. Uno era
grave: **la pantalla de login decía «contacta a soporte@vsv.cl para resetear tu
clave»** — un correo que no recibe a nadie, dejando a la persona esperando sin
poder entrar. Ahora indica pedírsela al administrador. Los otros dos eran
ejemplos en formularios (`ejemplo@vsv.cl` → `ejemplo@vsvconsultores.com`).

### 9.7 Sobre el aviso rojo del pantallazo

En la captura adjunta a la tarea estaba marcado «REPARAR ESTO» sobre el aviso
rojo *«No configuraste el tuyo: sale desde el correo por omisión»*.

**No es un error**: informa que todavía no se ha puesto un remitente propio y el
correo saldrá desde la dirección de la casa. Se arregla desde «Mi correo y
firma», en la misma pantalla. Si se quiere que deje de aparecer, hay que
configurar el remitente de cada usuario; no hay nada que corregir en el código.
