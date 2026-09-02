# =============================================================================
# PRUEBAS DE LA API · el servicio que va a Railway
# -----------------------------------------------------------------------------
# Se levanta la aplicación REAL con TestClient y se le hacen peticiones. No se
# prueba una réplica de la lógica: si el middleware, las cabeceras o el
# healthcheck estuvieran mal, esto tiene que fallar acá y no en Railway.
#
# Lo que más importa verificar:
#   · que exija la sesión de VSV PRO y no otra cosa
#   · que /salud responda 200 aunque el modelo esté caído (o Railway reinicia
#     en bucle un servicio que está sano)
#   · que dos usuarios no compartan conversación
#
#   python tests/test_api.py
# =============================================================================
from __future__ import annotations

import os
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

for _f in (sys.stdout, sys.stderr):
    if hasattr(_f, "reconfigure"):
        _f.reconfigure(encoding="utf-8", errors="replace")

# Se configura ANTES de importar la app: las variables se leen al importar.
os.environ["VSV_API_URL"] = "https://ejemplo-vsv.test/api"
os.environ["VSV_AI_MODELO"] = "modelo-de-prueba"

try:
    from fastapi.testclient import TestClient
except ImportError:
    raise SystemExit("Falta FastAPI.  pip install -r requirements.txt")

from api import main as api_main
from models import provider
from models.provider import Respuesta
from tools.cliente import ResultadoHerramienta

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


cliente = TestClient(api_main.app, raise_server_exceptions=False)
CABECERAS = {"x-session-id": "sesion-de-prueba", "x-company-id": "empresa-1"}


# ═════════════════════════════════════════════════════════════════════════════
print("\nHEALTHCHECK · lo que mira Railway")
# ═════════════════════════════════════════════════════════════════════════════

_disponible_real = provider.esta_disponible
provider.esta_disponible = lambda *a, **k: False
api_main.provider.esta_disponible = lambda *a, **k: False

r = cliente.get("/salud")
revisar("responde 200 con el modelo caído", r.status_code == 200,
        "si devolviera error, Railway reiniciaría en bucle un servicio sano")
revisar("pero informa que el modelo no está", r.json()["modelo_alcanzable"] is False)
revisar("dice qué modelo espera", r.json()["modelo"] == "modelo-de-prueba")
revisar("y si la API de VSV está configurada", r.json()["api_vsv_configurada"] is True)

# El healthcheck no puede tardar: Railway lo llama seguido y un timeout lo
# interpretaría como servicio caído.
import time as _t
_i = _t.monotonic()
cliente.get("/salud")
revisar("responde rápido", (_t.monotonic() - _i) < 1.0,
        f"tardó {(_t.monotonic() - _i):.2f}s")

# La comprobación del catálogo es opcional a propósito: es una llamada de red y
# no puede hacerse en cada healthcheck.
r = cliente.get("/salud")
revisar("por omisión no verifica el catálogo del proveedor",
        "modelo_existe" not in r.json(),
        "verificarlo siempre sería una llamada de red por healthcheck")


# ═════════════════════════════════════════════════════════════════════════════
print("\nAUTENTICACIÓN · la sesión de VSV PRO")
# ═════════════════════════════════════════════════════════════════════════════

r = cliente.post("/api/chat", json={"mensaje": "hola"})
revisar("sin sesión responde 401", r.status_code == 401)

# VSV PRO no usa Bearer. Si alguien lo mandara así, tiene que rechazarse.
r = cliente.post("/api/chat", json={"mensaje": "hola"},
                 headers={"Authorization": "Bearer algo"})
revisar("un Bearer NO sirve como sesión", r.status_code == 401,
        "VSV PRO valida x-session-id contra la tabla sessions")

r = cliente.post("/api/chat", json={"mensaje": "hola"}, headers=CABECERAS)
revisar("con el modelo caído responde 503, no 500", r.status_code == 503,
        f"respondió {r.status_code}")
revisar("y el mensaje es para el usuario, no un volcado",
        "disponible" in r.json().get("detail", "").lower())


# ═════════════════════════════════════════════════════════════════════════════
print("\nVALIDACIÓN DE ENTRADA")
# ═════════════════════════════════════════════════════════════════════════════

provider.esta_disponible = lambda *a, **k: True
api_main.provider.esta_disponible = lambda *a, **k: True

r = cliente.post("/api/chat", json={"mensaje": ""}, headers=CABECERAS)
revisar("rechaza un mensaje vacío", r.status_code == 422)

r = cliente.post("/api/chat", json={"mensaje": "x" * 3000}, headers=CABECERAS)
revisar("rechaza un mensaje enorme", r.status_code == 422,
        "sin tope, una petición larga se convierte en costo de inferencia")

r = cliente.post("/api/chat", json={}, headers=CABECERAS)
revisar("rechaza el cuerpo sin mensaje", r.status_code == 422)


# ═════════════════════════════════════════════════════════════════════════════
print("\nCICLO COMPLETO · con modelo y API simulados")
# ═════════════════════════════════════════════════════════════════════════════

class ModeloFalso:
    def __init__(self):
        self.turnos = 0

    def __call__(self, **kwargs):
        self.turnos += 1
        if self.turnos % 2 == 1:
            return Respuesta(
                texto='{"herramienta": "consultar_metricas", "parametros": {"periodo": "2026-08"}}',
                ms=10, tokens_entrada=100, tokens_salida=20)
        return Respuesta(texto="En agosto se cobraron $4.671.956.", ms=10,
                         tokens_entrada=150, tokens_salida=15)


class ClienteFalso:
    """Registra las cabeceras con que se lo construyó, para verificar que la
    sesión del usuario efectivamente se propaga a VSV PRO."""
    construidos: list[dict] = []

    def __init__(self, sesion=None, empresa_id=None, base_url=None):
        ClienteFalso.construidos.append({"sesion": sesion, "empresa_id": empresa_id})

    def ejecutar(self, nombre, parametros):
        return ResultadoHerramienta(ok=True, datos={"total": 4671956, "pagos": 43})


_generar_real = provider.generar
provider.generar = ModeloFalso()
api_main.ClienteVsvPro = ClienteFalso

r = cliente.post("/api/chat", json={"mensaje": "¿cuánto cobramos en agosto?"},
                 headers=CABECERAS)
revisar("responde 200", r.status_code == 200, f"respondió {r.status_code}: {r.text[:200]}")
cuerpo = r.json()
revisar("con la cifra real", "4.671.956" in cuerpo["respuesta"])
revisar("informa qué herramienta usó", cuerpo["herramienta"] == "consultar_metricas")
revisar("y cuánto tardó", cuerpo["ms"] > 0)

ultimo = ClienteFalso.construidos[-1]
revisar("la sesión del usuario se propaga a VSV PRO",
        ultimo["sesion"] == "sesion-de-prueba",
        "sin esto la API respondería 401 y el asistente no consultaría nada")
revisar("y la empresa activa también",
        ultimo["empresa_id"] == "empresa-1",
        "de la empresa dependen los permisos por empresa")

revisar("cada petición lleva identificador para rastrearla",
        "x-request-id" in r.headers)


# ═════════════════════════════════════════════════════════════════════════════
print("\nAISLAMIENTO · dos usuarios no comparten conversación")
# ═════════════════════════════════════════════════════════════════════════════

api_main.memoria = __import__("memory.conversation", fromlist=["Memoria"]).Memoria()

cliente.post("/api/chat", json={"mensaje": "¿cuánto cobramos?", "conversacion_id": "default"},
             headers={"x-session-id": "usuario-A"})
cliente.post("/api/chat", json={"mensaje": "hola", "conversacion_id": "default"},
             headers={"x-session-id": "usuario-B"})

hilos = list(api_main.memoria._conversaciones.keys())
revisar("son dos hilos distintos", len(hilos) == 2, f"hilos: {hilos}")
revisar("y cada uno lleva su sesión",
        any(h.startswith("usuario-A:") for h in hilos) and
        any(h.startswith("usuario-B:") for h in hilos),
        "si se indexara solo por conversacion_id, dos usuarios con 'default' "
        "compartirían los datos consultados")

hilo_a = api_main.memoria._conversaciones["usuario-A:default"]
revisar("el hilo de A no tiene nada de B",
        all("hola" != t.contenido for t in hilo_a.turnos))

r = cliente.delete("/api/chat/default", headers={"x-session-id": "usuario-A"})
revisar("se puede borrar la conversación", r.status_code == 200)
revisar("y solo borra la del que la pide",
        "usuario-B:default" in api_main.memoria._conversaciones)


# ═════════════════════════════════════════════════════════════════════════════
print("\nERRORES · no se filtra nada interno")
# ═════════════════════════════════════════════════════════════════════════════

def revienta(**kwargs):
    raise RuntimeError("postgres://usuario:clave@servidor-interno/base")

provider.generar = revienta
r = cliente.post("/api/chat", json={"mensaje": "hola"}, headers=CABECERAS)
# El orquestador captura las caídas del modelo y responde con una explicación:
# el modelo corre en otra máquina y que se caiga es esperable, no excepcional.
# Por eso es 200 con un mensaje y no un 500 sin información.
revisar("una caída del modelo se explica al usuario", r.status_code == 200,
        f"respondió {r.status_code}")
revisar("con un texto que invita a reintentar",
        "intént" in r.json().get("respuesta", "").lower(),
        r.text[:150])
revisar("sin filtrar el detalle interno",
        "postgres" not in r.text and "clave" not in r.text,
        f"se filtró: {r.text[:200]}")


# Un fallo en la propia API —no en el modelo— sí tiene que ser 500 mudo.
def _revienta_validando(_):
    raise RuntimeError("ruta interna /srv/vsv-ai/config secreta")

import security.validation as _val
_analizar_real = _val.analizar
_val.analizar = _revienta_validando
provider.generar = lambda **kw: Respuesta(texto="algo", ms=1)

r = cliente.post("/api/chat", json={"mensaje": "hola"}, headers=CABECERAS)
revisar("un error inesperado de la API devuelve 500", r.status_code == 500,
        f"respondió {r.status_code}")
revisar("y no filtra la ruta interna",
        "srv" not in r.text and "secreta" not in r.text, r.text[:150])
_val.analizar = _analizar_real

provider.generar = _generar_real
provider.esta_disponible = _disponible_real


# ═════════════════════════════════════════════════════════════════════════════
print("\nCORS · ninguna página web puede llamar a este servicio")
# ═════════════════════════════════════════════════════════════════════════════

# El navegador NO habla con VSV AI: habla con el backend de VSV PRO, que
# reenvía. Una petición servidor-a-servidor no pasa por CORS, así que la lista
# de orígenes está vacía a propósito — y eso significa que ninguna página puede
# llamar a este servicio desde el navegador.
for origen in ["https://vsv-contadores.vercel.app", "https://sitio-cualquiera.com"]:
    r = cliente.options("/api/chat", headers={
        "Origin": origen,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "x-session-id,content-type",
    })
    revisar(f"no autoriza a {origen.split('//')[1]}",
            r.headers.get("access-control-allow-origin") != origen,
            "con el puente en su lugar, ningún origen debería estar permitido")

# El backend sí llega, porque no manda Origin.
r = cliente.post("/api/chat", json={"mensaje": "hola"}, headers=CABECERAS)
revisar("pero el backend sí puede llamar (sin Origin)", r.status_code in (200, 503),
        f"respondió {r.status_code}")


print(f"\n{'─' * 60}")
if fallos:
    print(f"{pruebas - len(fallos)}/{pruebas} pruebas · {len(fallos)} FALLAS\n")
    for f in fallos:
        print(f"  · {f}")
    sys.exit(1)
print(f"{pruebas}/{pruebas} pruebas ok · la API está lista para Railway\n")
