# =============================================================================
# ARRANCAR VSV AI EN LOCAL
# -----------------------------------------------------------------------------
# Lee la configuración del .env de la raíz del repo —el mismo que usa el backend
# de Node— para no tener dos sitios donde configurar lo mismo.
#
#   python iniciar.py
#
# En Railway NO se usa este archivo: allá las variables las inyecta la
# plataforma y el Dockerfile arranca uvicorn directamente.
# =============================================================================
from __future__ import annotations

import os
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
sys.path.insert(0, str(RAIZ))

for _f in (sys.stdout, sys.stderr):
    if hasattr(_f, "reconfigure"):
        _f.reconfigure(encoding="utf-8", errors="replace")


def cargar_env(ruta: Path) -> int:
    """Carga el .env sin depender de python-dotenv: el núcleo no tiene
    dependencias y esto no va a ser la primera."""
    if not ruta.exists():
        return 0
    cargadas = 0
    for linea in ruta.read_text(encoding="utf-8", errors="replace").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        clave, valor = linea.split("=", 1)
        clave, valor = clave.strip(), valor.strip().strip('"').strip("'")
        # Lo que ya esté en el entorno manda: permite probar otro modelo con
        # `VSV_AI_MODELO=x python iniciar.py` sin editar el .env.
        if clave and clave not in os.environ:
            os.environ[clave] = valor
            cargadas += 1
    return cargadas


cargar_env(RAIZ.parent / ".env")

# El puerto sale de VSV_AI_URL para que backend y servicio no se desalineen.
url = os.environ.get("VSV_AI_URL", "http://localhost:8000")
try:
    puerto = int(url.rsplit(":", 1)[-1].split("/")[0])
except (ValueError, IndexError):
    puerto = 8000

proveedor = os.environ.get("VSV_AI_PROVEEDOR", "ollama")
modelo = os.environ.get(
    "VSV_AI_MODELO",
    "qwen/qwen3.8-27b" if proveedor == "groq" else "qwen2.5:7b",
)
os.environ["VSV_AI_MODELO"] = modelo

print(f"\nVSV AI · puerto {puerto}")
print(f"  proveedor  {proveedor}")
print(f"  modelo     {modelo}")

if proveedor == "groq" and not os.environ.get("GROQ_API_KEY"):
    raise SystemExit("\n✗ Falta GROQ_API_KEY en el .env de la raíz.")
if not os.environ.get("VSV_API_URL"):
    # VSV AI consulta los datos llamando de vuelta al backend. Sin esta
    # dirección responde, pero sin ningún dato.
    api = os.environ.get("API_BASE_URL") or "http://localhost:4000/api"
    os.environ["VSV_API_URL"] = api
    print(f"  API VSV    {api}  (deducida)")
else:
    print(f"  API VSV    {os.environ['VSV_API_URL']}")

print()

import uvicorn  # noqa: E402  (después de cargar el entorno)

uvicorn.run("api.main:app", host="127.0.0.1", port=puerto, log_level="info")
