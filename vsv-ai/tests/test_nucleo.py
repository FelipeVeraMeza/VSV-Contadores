# =============================================================================
# PRUEBAS DEL NÚCLEO · sin modelo, sin red
# -----------------------------------------------------------------------------
# Se prueba lo que es DETERMINISTA: validación, memoria, orquestación. El modelo
# se prueba aparte, con el benchmark, porque su salida no es determinista y
# mezclar las dos cosas daría pruebas que fallan por azar.
#
# Se corre con:  python tests/test_nucleo.py
# =============================================================================
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# La consola de Windows usa cp1252 y revienta con «─» o «·». Se fuerza UTF-8
# antes de imprimir nada: un corredor de pruebas que falla por un guion no sirve.
for flujo in (sys.stdout, sys.stderr):
    if hasattr(flujo, "reconfigure"):
        flujo.reconfigure(encoding="utf-8", errors="replace")

from core.orchestrator import Orquestador
from memory.conversation import TURNOS_MAXIMOS, Memoria
from security import validation
from tools.catalogo import NOMBRES, POR_NOMBRE, describir_herramientas
from tools.cliente import ClienteSimulado

fallos: list[str] = []
pruebas = 0


def revisar(descripcion: str, condicion: bool, detalle: str = "") -> None:
    global pruebas
    pruebas += 1
    if condicion:
        print(f"  ok   {descripcion}")
    else:
        print(f"  FALLA {descripcion}" + (f"\n        {detalle}" if detalle else ""))
        fallos.append(descripcion)


# ═════════════════════════════════════════════════════════════════════════════
print("\nVALIDACIÓN · lo que devuelve el modelo")
# ═════════════════════════════════════════════════════════════════════════════

a = validation.analizar('{"herramienta": "consultar_deudas", "parametros": {"periodo": "2026-08"}}')
revisar("JSON limpio se entiende", a.es_invocacion and a.invocacion.herramienta == "consultar_deudas")
revisar("el parámetro llega tal cual", a.invocacion.parametros.get("periodo") == "2026-08")

# La conversión de tipos se prueba directamente: hoy ninguna herramienta declara
# un booleano, pero el validador tiene que seguir sabiendo convertirlos para
# cuando alguna lo haga.
from security.validation import _convertir
revisar("convierte 'true' a booleano", _convertir("true", "boolean") == (True, None))
revisar("convierte '150.000' a número", _convertir("$150.000", "number") == (150000, None))
revisar("rechaza 'cien lucas' como número", _convertir("cien lucas", "number")[1] is not None)

# El modelo suele envolver en ```json aunque se le pida que no. Castigarlo por
# eso mediría formato y no comprensión.
a = validation.analizar('```json\n{"herramienta": "consultar_metricas", "parametros": {}}\n```')
revisar("acepta el JSON envuelto en cerca de código", a.es_invocacion)

a = validation.analizar('Claro, consulto eso.\n{"herramienta": "consultar_tareas", "parametros": {}}')
revisar("encuentra el JSON con texto alrededor", a.es_invocacion)

a = validation.analizar("Hola, ¿en qué te ayudo?")
revisar("la prosa NO se toma como invocación", not a.es_invocacion and a.texto)

a = validation.analizar('{"herramienta": "borrar_todo", "parametros": {}}')
revisar("rechaza una herramienta inventada", not a.es_invocacion and a.errores)

# Un parámetro de más no cambia lo que se consulta: se descarta, no se rechaza
# la llamada entera.
a = validation.analizar('{"herramienta": "consultar_deudas", "parametros": {"color": "rojo"}}')
revisar("descarta el parámetro inexistente y sigue", a.es_invocacion and "color" not in a.invocacion.parametros)
revisar("pero lo deja anotado", bool(a.errores))

a = validation.analizar('{"herramienta": "consultar_tareas", "parametros": {"ambito": "fantasma"}}')
revisar("rechaza un valor fuera de la lista", "ambito" not in a.invocacion.parametros)

a = validation.analizar('{"herramienta": "consultar_tareas", "parametros": {"ambito": "equipo"}}')
revisar("acepta un valor de la lista", a.invocacion.parametros.get("ambito") == "equipo")

a = validation.analizar("")
revisar("respuesta vacía se reporta como error", bool(a.errores))

a = validation.analizar('{"herramienta": "consultar_personas", "parametros": {"busqueda": "ROVIRA"}}')
revisar("un nombre de empresa pasa tal cual", a.invocacion.parametros.get("busqueda") == "ROVIRA")

# Los períodos viajan como texto: convertirlos a número rompería "2026-08".
a = validation.analizar('{"herramienta": "consultar_metricas", "parametros": {"periodo": "mes"}}')
revisar("el periodo llega como texto", a.invocacion.parametros.get("periodo") == "mes")


# ═════════════════════════════════════════════════════════════════════════════
print("\nMEMORIA · lo que hace que sea un asistente y no un buscador")
# ═════════════════════════════════════════════════════════════════════════════

memoria = Memoria()
c = memoria.obtener("hilo-1")
c.agregar("user", "¿Cuánto cobramos en agosto?")
c.agregar("assistant", "$4.671.956")
revisar("guarda los turnos", len(c) == 2)
revisar("los entrega en formato de mensajes", c.mensajes()[0]["role"] == "user")

c.recordar_dato("consultar_metricas", {"periodo": "2026-08"}, {"total": 4671956})
contexto = c.contexto_de_datos()
revisar("el dato consultado queda disponible", "4671956" in contexto)
revisar("y con qué parámetros se pidió", "2026-08" in contexto)

# Un contexto que crece sin fin hace que el modelo ignore las reglas del
# principio del prompt.
for i in range(30):
    c.agregar("user", f"pregunta {i}")
revisar(f"recorta a {TURNOS_MAXIMOS} turnos", len(c) == TURNOS_MAXIMOS)
revisar("y conserva los últimos", c.turnos[-1].contenido == "pregunta 29")

revisar("dos conversaciones no se mezclan", memoria.obtener("hilo-2") is not c)
memoria.olvidar("hilo-1")
revisar("se puede olvidar una conversación", len(memoria.obtener("hilo-1")) == 0)


# ═════════════════════════════════════════════════════════════════════════════
print("\nCATÁLOGO · el contrato con el modelo")
# ═════════════════════════════════════════════════════════════════════════════

descripcion = describir_herramientas()
revisar("todas las herramientas se describen", all(n in descripcion for n in NOMBRES))
revisar("con sus parámetros", "periodo" in descripcion and "busqueda" in descripcion)
revisar("y los valores permitidos", "mias|equipo" in descripcion)

# Las rutas se verificaron contra el backend real. Un endpoint inventado da 404
# en producción y el síntoma —«no tengo ese dato»— parece un problema del
# modelo cuando en realidad la ruta nunca existió.
from tools.catalogo import HERRAMIENTAS
revisar("todos los endpoints van a /api/", all(h.endpoint.split(" ", 1)[1].startswith("/api/")
                                               for h in HERRAMIENTAS))
revisar("y declaran su método", all(h.endpoint.split(" ", 1)[0] in ("GET", "POST")
                                    for h in HERRAMIENTAS))

# La base y la ruta traen ambas el /api. Sin desduplicar queda /api/api/... y
# TODAS las herramientas fallan — pasó el 02-09-2026.
from tools.cliente import ClienteVsvPro
for base, esperado in [
    ("http://localhost:4000/api", "http://localhost:4000/api/cobros/resumen"),
    ("http://localhost:4000/api/", "http://localhost:4000/api/cobros/resumen"),
    ("http://localhost:4000", "http://localhost:4000/api/cobros/resumen"),
]:
    c = ClienteVsvPro(base_url=base)
    ruta = POR_NOMBRE["consultar_deudas"].endpoint.split(" ", 1)[1]
    b = c.base_url
    if b.endswith("/api") and ruta.startswith("/api/"):
        ruta = ruta[4:]
    revisar(f"la URL no se duplica con base {base!r}", f"{b}{ruta}" == esperado,
            f"quedó {b}{ruta}")


# ═════════════════════════════════════════════════════════════════════════════
print("\nORQUESTADOR · el ciclo completo, con un modelo de mentira")
# ═════════════════════════════════════════════════════════════════════════════

class ModeloFalso:
    """Devuelve respuestas preparadas, en orden. Permite probar el ciclo sin
    depender de un modelo real —que no es determinista— ni de la red."""

    def __init__(self, respuestas):
        self.respuestas = list(respuestas)
        self.recibido = []

    def __call__(self, **kwargs):
        from models.provider import Respuesta
        self.recibido.append(kwargs)
        texto = self.respuestas.pop(0) if self.respuestas else "No tengo más que decir."
        return Respuesta(texto=texto, ms=10, tokens_entrada=100, tokens_salida=20)


from models import provider as _provider
_generar_real = _provider.generar

modelo = ModeloFalso([
    # `mes` y no "2026-08": consultar_metricas acepta ventanas, no un mes
    # concreto. El validador rechaza el YYYY-MM y hace bien — la API lo
    # ignoraría y la respuesta sería de otro período sin que nadie lo note.
    '{"herramienta": "consultar_metricas", "parametros": {"periodo": "mes"}}',
    "En agosto se cobraron $4.671.956 en 43 pagos.",
])
_provider.generar = modelo

cliente = ClienteSimulado({"consultar_metricas": {"total": 4671956, "pagos": 43}})
orquestador = Orquestador(modelo="falso", cliente=cliente, memoria=Memoria())
r = orquestador.responder("¿Cuánto cobramos en agosto?")

revisar("llama a la herramienta correcta", cliente.llamadas[0][0] == "consultar_metricas")
revisar("con los parámetros correctos", cliente.llamadas[0][1] == {"periodo": "mes"})
revisar("y redacta con el dato real", "4.671.956" in r.texto)
revisar("la traza deja registrada la herramienta", r.traza.herramienta == "consultar_metricas")
revisar("y cuenta los tokens", r.traza.tokens_entrada == 200)

# El dato tiene que llegar al modelo para que redacte; si no llegara, redactaría
# de memoria — que es inventar.
segunda = modelo.recibido[1]["mensajes"][-1]["content"]
revisar("el resultado se le pasa al modelo para redactar", "4671956" in segunda)

# Un saludo no gasta una llamada a la API.
modelo2 = ModeloFalso(["Hola, ¿en qué te ayudo?"])
_provider.generar = modelo2
cliente2 = ClienteSimulado()
r2 = Orquestador(modelo="falso", cliente=cliente2, memoria=Memoria()).responder("hola")
revisar("un saludo no llama a ninguna herramienta", len(cliente2.llamadas) == 0)
revisar("y responde en prosa", "ayudo" in r2.texto)

# Ante un rechazo por permisos, el modelo tiene que decir «no tienes acceso»,
# no inventar una excusa ni fingir que consultó.
from tools.cliente import ResultadoHerramienta

class ClienteSinAcceso:
    def ejecutar(self, nombre, parametros):
        return ResultadoHerramienta(ok=False, sin_acceso=True, error="sin permiso")

modelo3 = ModeloFalso([
    '{"herramienta": "consultar_deudas", "parametros": {}}',
    "No tienes acceso a esa información.",
])
_provider.generar = modelo3
r3 = Orquestador(modelo="falso", cliente=ClienteSinAcceso(), memoria=Memoria()).responder("¿quién debe?")
revisar("el rechazo por permisos llega al modelo como tal",
        "permisos" in modelo3.recibido[1]["mensajes"][-1]["content"])
revisar("y la respuesta lo dice sin inventar", "acceso" in r3.texto.lower())

# La memoria conversacional: «¿y julio?» tiene que funcionar.
modelo4 = ModeloFalso([
    '{"herramienta": "consultar_metricas", "parametros": {"periodo": "2026-08"}}',
    "En agosto se cobraron $4.671.956.",
    '{"herramienta": "consultar_metricas", "parametros": {"periodo": "2026-07"}}',
    "En julio se cobraron $3.900.000.",
])
_provider.generar = modelo4
cliente4 = ClienteSimulado({"consultar_metricas": {"total": 4671956}})
orq4 = Orquestador(modelo="falso", cliente=cliente4, memoria=Memoria())
orq4.responder("¿cuánto cobramos en agosto?", id_conversacion="h")
orq4.responder("¿y julio?", id_conversacion="h")
sistema_del_tercer_turno = modelo4.recibido[2]["sistema"]
revisar("en el turno siguiente el modelo ve lo ya consultado",
        "DATOS YA CONSULTADOS" in sistema_del_tercer_turno)
revisar("con la cifra de agosto disponible para comparar",
        "4671956" in sistema_del_tercer_turno)

_provider.generar = _generar_real


# ═════════════════════════════════════════════════════════════════════════════
print("\nPROMPT")
# ═════════════════════════════════════════════════════════════════════════════

from datetime import date
from core.prompts import prompt_sistema

p = prompt_sistema(date(2026, 9, 2))
revisar("incluye la fecha de hoy", "2026-09-02" in p)
revisar("y el mes anterior bien calculado", "2026-08" in p)
revisar("enero mira a diciembre del año pasado", "2025-12" in prompt_sistema(date(2026, 1, 15)))
revisar("describe las herramientas", "consultar_deudas" in p)
revisar("distingue facturar de cobrar", "FACTURAR ≠ COBRAR" in p)
revisar("explica qué es una luca", "luca" in p)


# ═════════════════════════════════════════════════════════════════════════════
print(f"\n{'─' * 60}")
if fallos:
    print(f"{pruebas - len(fallos)}/{pruebas} pruebas · {len(fallos)} FALLAS\n")
    for f in fallos:
        print(f"  · {f}")
    sys.exit(1)
print(f"{pruebas}/{pruebas} pruebas ok\n")
