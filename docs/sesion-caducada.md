# La sesión que caducaba en silencio

**Reportado:** 4 de septiembre de 2026
**Estado:** corregido

> «A veces inicio sesión y pasa mucho tiempo, y después debo cerrar sesión y
> volver a entrar. ¿Qué pasa?»

## El diagnóstico, que no era el que parecía

Lo primero que uno supone es que la sesión dura poco. **No es eso.** Dura 24
horas y se renueva sola: cada petición que hace el sistema, si le quedan menos
de 12 h, la estira otra vez a 24. Trabajando, no debería echarte nunca.

El problema era **qué pasaba cuando por fin caducaba**:

```javascript
if (res.status === 401) {
    console.warn("🔐 Sesión expirada o denegada...");   // y nada más
}
```

`fetchWithAuth` recibía el 401, lo escribía en la consola del navegador —donde
nadie mira— y devolvía la respuesta como si nada hubiera pasado.

La pantalla se quedaba ahí, con los datos viejos en memoria. Uno seguía
pulsando botones y no respondía nada; o aparecían listas vacías, que es peor,
porque se leen como «se borraron mis datos» y no como «se cayó la sesión».

**Nadie avisaba.** Por eso la salida era cerrar sesión y volver a entrar: era la
única forma de enterarse de lo que había pasado.

## Lo que se hizo

### 1 · Un solo lugar decide qué hacer con un 401

`src/services/sesionCaducada.js`. Limpia el almacenamiento y vuelve al login
con `?expired=true`. Va aparte y no dentro de cada servicio porque había **tres
respuestas distintas al mismo 401**: `apiClient` lo ignoraba, `asistenteService`
lanzaba un error y `dteConsultasService` devolvía una lista vacía.

Tiene una marca para actuar **una sola vez**: siempre hay varias peticiones en
vuelo —la campana, el panel, la lista— y sin ella cada una intentaría redirigir
por su cuenta.

### 2 · El login dice por qué estás ahí

El sistema ya redirigía con `?expired=true` desde antes… y **nadie lo leía**.
Uno aparecía en el login sin explicación, como si hubiera cerrado sesión solo.
Ahora sale un aviso que lo dice.

### 3 · Las sesiones caducadas se barren

Hallazgo de paso: la tabla `sessions` tenía **604 filas y solo 5 vivas**. Nadie
las borraba nunca. Ninguna consulta las usa —el middleware filtra por
`expires_at > NOW()`— pero se cargan, se indexan y se respaldan igual.

`src/utils/limpiezaSesiones.js` barre al arrancar y cada seis horas. En la
primera corrida se llevó **599 filas**; la tabla quedó en 5.

## Lo que NO se cambió

**La duración sigue en 24 horas.** Alargarla es cambiar comodidad por
seguridad: una sesión robada sirve más tiempo. Con el aviso funcionando, el
motivo original de la queja desaparece sin tener que tocar ese equilibrio.

Tampoco se agregó el aviso «tu sesión está por caducar» con botón de renovar.
Es lo siguiente si esto no alcanza, pero primero conviene ver si con el cierre
limpio basta.

## Pruebas

`qa/casos/sesion.test.mjs`, 9 pruebas:

- El 401 llega sin sesión, con una inventada y con una **vencida** (401, no 500:
  un 500 la pantalla lo leería como «se rompió algo»)
- La renovación estira una sesión de 2 h a ~24 h
- Una sesión con 23 h por delante **no** se reescribe (evita una escritura por
  petición)
- El barrido se lleva las vencidas y **nunca** una viva — se prueba con una que
  vence en un minuto, que es el borde donde un error de signo se notaría
