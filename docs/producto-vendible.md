# De sistema interno a producto vendible

**Fecha:** 4 de agosto de 2026
**Estado:** análisis, sin construir
**Origen:** «que sea ordenado tanto para una página interna como venta al público»

---

## 1. La diferencia, en una frase

> Un sistema interno puede fallar y alguien lo arregla. Un producto vendido no
> puede fallar sin que se entere un cliente que paga.

Todo lo que sigue existe **solo** porque hay alguien afuera. Nada de esto se nota
mientras el sistema lo usan tres personas que se conocen.

---

## 2. Lo que ya está resuelto y vale oro

Esto es lo más caro de agregar después, y ya está hecho:

**Aislamiento real por organización.** Cada dueño ve solo lo suyo, verificado en
30 endpoints. Es la base de cualquier producto multiempresa, y reconstruirla sobre
un sistema que no la tiene es prácticamente reescribirlo.

**Roles y módulos por usuario.** Se puede vender por funcionalidad: una oficina
contrata contabilidad y otra contabilidad más remuneraciones.

**Credenciales del SII por usuario, cifradas.** Cada oficina factura con las suyas.

**Bitácora.** Quién hizo qué y cuándo.

---

## 3. Lo que falta, por bloque

### 3.1 Entrar y salir solo *(autoservicio)*

| ID | Requerimiento | Prio |
|---|---|---|
| RF-PRD-01 | Registro de una oficina nueva sin que nadie del equipo intervenga | A |
| RF-PRD-02 | Verificación del correo al registrarse | A |
| RF-PRD-03 | **Recuperar la contraseña** sin pedírsela a nadie | A |
| RF-PRD-04 | El dueño invita a su propio equipo y le asigna roles | A |
| RF-PRD-05 | Guía de primeros pasos: cargar clientes, definir planes, conectar el SII | B |
| RF-PRD-06 | Datos de ejemplo que se puedan borrar de una vez | C |

> **RF-PRD-03 es el más urgente.** Hoy, si alguien olvida su contraseña, hay que
> resolverlo a mano en la base de datos. Con un cliente pagando, eso es una
> llamada un domingo.

### 3.2 Cobrar

| ID | Requerimiento | Prio |
|---|---|---|
| RF-PRD-07 | Planes con precio y qué incluye cada uno | A |
| RF-PRD-08 | Límites por plan (usuarios, clientes, almacenamiento) aplicados de verdad | A |
| RF-PRD-09 | Cobro recurrente y registro de pagos | A |
| RF-PRD-10 | Suspender por falta de pago **sin borrar datos** | A |
| RF-PRD-11 | Período de prueba con fecha de término | B |
| RF-PRD-12 | Facturar al cliente su propia suscripción | B |

> La ironía: el sistema sabe cobrarle a los clientes de la oficina, pero no sabe
> cobrarle a la oficina.

### 3.3 Confianza y ley

| ID | Requerimiento | Prio |
|---|---|---|
| RNF-PRD-01 | **Respaldos automáticos y restauración probada** | A |
| RNF-PRD-02 | El cliente puede **exportar todos sus datos** cuando quiera | A |
| RNF-PRD-03 | Eliminación de cuenta con borrado real, en un plazo declarado | A |
| RNF-PRD-04 | Términos de servicio y política de privacidad | A |
| RNF-PRD-05 | Cumplir la ley chilena de protección de datos personales | A |
| RNF-PRD-06 | Cifrado en tránsito y en reposo de los datos sensibles | A |
| RNF-PRD-07 | Registro de accesos a datos de terceros | A |
| RNF-PRD-08 | Segundo factor de autenticación, al menos para administradores | B |

> **RNF-PRD-05 no es opcional.** El sistema guarda RUT, credenciales del SII y
> datos tributarios de terceros: es de lo más sensible que existe. Chile
> actualizó su ley de protección de datos personales y el régimen es bastante más
> exigente que el anterior, con una autoridad que puede multar. **Antes de vender
> hay que revisarlo con alguien que sepa de la materia** — esto no es una opinión
> técnica.

> **RNF-PRD-02 también protege a la venta,** no solo al cliente: nadie contrata un
> sistema del que no puede sacar sus datos si se arrepiente.

### 3.4 Que no se caiga

| ID | Requerimiento | Prio |
|---|---|---|
| RNF-PRD-09 | Despliegue reproducible: cualquiera del equipo levanta el sistema | A |
| RNF-PRD-10 | Ambientes separados de prueba y producción | A |
| RNF-PRD-11 | Alertas cuando algo falla, **antes** de que llame el cliente | A |
| RNF-PRD-12 | Registro de errores centralizado | A |
| RNF-PRD-13 | Pruebas automáticas que corran en cada cambio | A |
| RNF-PRD-14 | Compromiso de disponibilidad declarado y medido | B |
| RNF-PRD-15 | Actualizar sin dejar el sistema fuera de servicio | B |

> Hoy el sistema **corre desde un computador** y no hay pruebas permanentes.
> Ninguna de las dos cosas se sostiene con un cliente pagando.

### 3.5 Que se vea suyo

| ID | Requerimiento | Prio |
|---|---|---|
| RF-PRD-13 | Logo y colores de cada oficina | B |
| RF-PRD-14 | Correos que salen a nombre de la oficina, no del proveedor | A |
| RF-PRD-15 | Dominio propio por cliente | C |
| RF-PRD-16 | Documentos y reportes con la marca del cliente | B |

### 3.6 Atender

| ID | Requerimiento | Prio |
|---|---|---|
| RF-PRD-17 | Canal de soporte dentro del sistema | B |
| RF-PRD-18 | Ayuda en pantalla y guías breves | B |
| RF-PRD-19 | Entrar como un cliente para diagnosticar, **con su permiso y dejando rastro** | B |
| RF-PRD-20 | Novedades de cada versión, visibles | C |

---

## 4. Los cuatro bloqueos reales

Ordenados por lo que impide vender **mañana**:

1. **No hay respaldos.** Perder los datos de un cliente que paga no se arregla
   con una disculpa.
2. **No hay recuperación de contraseña.** El primer olvido es una intervención
   manual en la base.
3. **Corre desde un computador.** No hay a quién delegar levantar el servicio.
4. **La protección de datos no está revisada.** Con RUT y credenciales del SII de
   terceros, es un riesgo legal, no técnico.

Los cuatro se resuelven **antes** de la primera venta, no después.

---

## 5. Lo que NO hay que hacer todavía

Tan importante como lo anterior:

| Qué | Por qué esperar |
|---|---|
| Dominio propio por cliente | Complejidad alta, valor casi nulo con pocos clientes |
| Segundo factor para todos | Empezar por los administradores; obligarlo a todos frena la adopción |
| Panel de métricas del negocio | Con menos de diez clientes, una planilla basta |
| Interfaz para programadores | Nadie la ha pedido |
| Traducción a otros idiomas | El SII es chileno |

---

## 6. Una advertencia honesta

Convertir esto en producto **no es una fase más del mes**: es un proyecto propio,
y la mayor parte no es programar pantallas sino respaldos, despliegue, soporte,
cobranza y asuntos legales.

Vale la pena hacerlo si hay un cliente concreto dispuesto a pagar. Como apuesta
—«hagámoslo vendible por si acaso»— compite directamente con las once metas del
mes y las once son más urgentes.

**Recomendación:** resolver los cuatro bloqueos de la sección 4 igual, porque
**también hacen falta para uso interno**. Respaldos, recuperar contraseña y un
despliegue que no dependa de una persona no son cosas de producto: son cosas de
un sistema del que ya dependen 93 clientes.
