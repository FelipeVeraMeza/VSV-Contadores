# QA · VSV PRO

Suite de pruebas contra la base y la API reales. Sin dependencias: solo Node.

```bash
npm run qa              # todo · ~25 s
npm run qa:rapido       # sin rendimiento · para antes de un commit
npm run qa:seguridad    # solo seguridad
node qa/correr.mjs api funcional
```

Necesita el backend levantado (`node src/server.js`). Si no responde, la suite
lo dice y se detiene en vez de dar 78 fallos que no significan nada.

---

## Qué cubre cada suite

| Suite | Pruebas | Qué vigila |
|---|---|---|
| `seguridad` | 22 | Sesiones, aislamiento entre organizaciones, inyección SQL, fuga de datos en errores |
| `sesion` | 9 | Que el 401 llegue cuando toca, la renovación deslizante y el barrido de caducadas |
| `conectados` | 13 | Presencia del equipo y su aislamiento entre organizaciones |
| `roles` | 18 | Permisos de **Consultor y Cliente**, escalada de privilegios, sesión de usuario desactivado |
| `api` | 19 | Contrato de las respuestas, códigos HTTP, validación de entrada |
| `funcional` | 11 | Que las cifras del panel cuadren con la base; límites de correos y cuota |
| `crm` | 21 | Cartera, pipeline, tareas, recaudación; ciclo completo de una tarea |
| `tareas` | 15 | Los tres pendientes de §10.5: lista «vencen hoy», reabrir subtareas, urgencia en el aviso |
| `tareas-ux` | 15 | «Mis tareas» en dos, colaboradores editables, subtareas al crear, últimos tickets |
| `comunicaciones` | 19 | Bandeja, enviados, perfil de remitente, ciclo de plantillas, protecciones del envío masivo |
| `cobro-de-factura` | 14 | Que toda factura emitida obtenga su cobro, sin duplicar |
| `integracion` | 11 | CRM ↔ cobranza ↔ SII ↔ correos; integridad referencial |
| `auditoria` | 7 | Que toda acción sobre dinero deje rastro de quién la hizo |
| `rendimiento` | 11 | Tiempos por endpoint, 10 peticiones simultáneas, tamaño de respuestas |
| `e2e` | 9 | Recorridos completos: alta de prospecto, búsqueda, nota, borrado |
| `regresion` | 26 | Que los cambios no rompan lo que funcionaba |

**187 pruebas · ~58 segundos.**

### Sobre `roles`

El sistema define tres roles —Administrador, Consultor, Cliente— pero en la base
**solo existen Administradores**. Toda la lógica de permisos de los otros dos
nunca se había ejecutado, ni en producción ni en pruebas.

Esta suite crea usuarios temporales de cada rol, los ejercita y los borra. Es la
única forma de saber que el día que se cree un Consultor real, el código que se
estrena ya está probado.

---

## Tres decisiones del diseño

**1 · Se prueba contra la base real, no contra dobles.**
Las pruebas de aislamiento usan sesiones y usuarios existentes. Un doble de
`requireSession` probaría el doble, no el búnker — y los problemas de permisos
aparecen justo ahí.

**2 · Las cifras se contrastan contra SQL, no contra otro endpoint.**
Si el panel y la prueba leyeran del mismo sitio equivocado, coincidirían y no se
notaría nada. Por eso cada aserción consulta la base por su cuenta.

**3 · Lo que la suite crea, la suite lo borra.**
`alTerminar()` registra la limpieza. Sin eso la segunda corrida falla por datos
de la primera, y la base de producción se llena de basura de pruebas.

---

## Notas informativas

Algunas pruebas imprimen `ℹ` sin fallar. Son datos de negocio que alguien tiene
que mirar, no defectos del código:

```
ℹ 1 cobro(s) del mes en $0: METALURGICA CASTINOX SPA
ℹ 2 empresa(s) con cobro del mes pero marcadas de baja
```

Se informan en vez de fallar porque la decisión es del cliente, no del sistema.
Cuando se resuelva, la nota desaparece sola.

---

## Casos que se saltan

`t.skip()` en vez de fallar cuando la causa es del ambiente y no del código:

- **Limitador de envíos activo** — el tope de campañas masivas se agota en una
  corrida seguida. Un 429 ahí es otra protección funcionando, no un fallo.
- **Asistente no disponible** — VSV AI corre en su propio servicio; si no está
  levantado, el recorrido no aplica.
- **Un solo rol con sesión viva** — las pruebas de permisos por rol necesitan al
  menos dos.

---

## Bugs que esta suite encontró

| Fecha | Bug | Impacto |
|---|---|---|
| 03-09-2026 | La búsqueda de personas no filtraba nada | Buscar un prospecto por nombre devolvía las 133 |
| 03-09-2026 | Identificadores mal formados devolvían 500 | 41 rutas · errores falsos en los registros |
| 02-09-2026 | «Reactivar correo» respondía éxito sin hacer nada | Bitácora con registros falsos |
| 02-09-2026 | Se podía enviar campaña con marcas inventadas | La marca llegaba literal al cliente |
| 02-09-2026 | El recordatorio de pago elegía un solo mes | «Sin destinatarios» con 71 deudores a la vista |
| 03-09-2026 | Emitir una factura no dejaba rastro | No se podía saber quién emitió los folios 1478 y 1482 |
| 03-09-2026 | La bitácora guardaba «: null» sin motivo | Registros que parecen información y no lo son |
| 03-09-2026 | **24 facturas sin cobro que las persiga** | $2.132.080 emitidos al SII que la cobranza no veía |
| 04-09-2026 | Un solo cobro por empresa y mes | Las facturas extra no cabían en la cobranza |
| 04-09-2026 | Bandeja y enviados daban 500 por un id inválido | 8 rutas más de correos |

El de la búsqueda vale la pena explicarlo, porque es el tipo de fallo que una
suite atrapa y una revisión a ojo no:

```js
p.telefonos.some(t => t.replace(/\D/g, '').includes(term.replace(/\D/g, '')))
```

Con un término sin dígitos, `term.replace(/\D/g,'')` queda vacío — y
`"56912345678".includes("")` es siempre `true`. Cualquier búsqueda de texto
devolvía la cartera completa.

---

## Falsas alarmas verificadas

Cosas que parecen bugs y no lo son. Se dejan escritas para no volver a
investigarlas:

**El panel muestra 129 prospectos y la API devuelve 132.**
La pantalla abre en «Mías» (`scope=mias`), que cuenta solo lo que el usuario
creó o tiene asignado. «Equipo» da 132. Los 3 de diferencia son de otros
usuarios. La suite cubre los dos casos.

**`/personas?q=1` devuelve 119 de 133.**
La búsqueda también mira teléfonos, y 119 números contienen un `1`. Es el filtro
funcionando, no un descuadre.

**`/personas?q=[` devuelve 80.**
Hay 80 personas con `[` en sus datos de verdad. La búsqueda usa `.includes()`,
no expresiones regulares, así que los caracteres especiales viajan literales.

**Una campaña guardada con `{{numero_factura}}` en el asunto.**
Vino de una planilla Excel, donde esa columna sí existía. Los 7 correos salieron
con el número resuelto: `FACTURA N°1.274 - IMPAGA`.

---

## CI

`.github/workflows/qa.yml` corre en cada push y pull request: verifica sintaxis,
compila el frontend y ejecuta la suite (sin rendimiento — los tiempos de un
runner compartido no se parecen a los de Railway, y un rojo por la máquina
enseña a ignorar el rojo).

Necesita los secretos de base de datos configurados en el repositorio. Sin
ellos avisa y sigue, en vez de fallar: un fork no tiene acceso a Supabase.
