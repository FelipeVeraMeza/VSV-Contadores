# =============================================================================
# API DE VSV AI · FastAPI
# -----------------------------------------------------------------------------
# Este servicio es lo que Railway ejecuta. NO contiene el modelo: se lo pide por
# HTTP a donde sea que esté corriendo (OLLAMA_HOST). Esa separación es la que
# permite mover el modelo a un servidor con GPU sin tocar una línea de acá.
#
#     Vercel  →  Railway (VSV PRO)  →  Railway (VSV AI)  →  GPU (modelo)
#                                       este archivo
#
# LA SESIÓN NO SE GUARDA. Llega en cada petición y se reenvía a VSV PRO, que la
# valida contra la tabla `sessions`. VSV AI no tiene credenciales propias ni una
# sesión de servicio: si el usuario no puede ver algo, el asistente tampoco.
#
# ⚠️ CABECERAS: VSV PRO usa `x-session-id` y `x-company-id`, NO
# `Authorization: Bearer` (ver src/middleware/auth.js). Cambiar esto rompe todas
# las consultas con 401.
# =============================================================================
from __future__ import annotations

import logging
import os
import time
import uuid

from core.orchestrator import Orquestador
from memory.conversation import Memoria
from models import provider
from tools.cliente import ClienteVsvPro

try:
    from fastapi import Depends, FastAPI, Header, HTTPException, Request
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse
    from pydantic import BaseModel, Field
except ImportError as e:  # pragma: no cover
    raise SystemExit("Falta FastAPI. Instalar con:  pip install -r requirements.txt") from e


logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s  %(levelname)-7s %(message)s",
)
log = logging.getLogger("vsv-ai")

PROVEEDOR = os.environ.get("VSV_AI_PROVEEDOR", "ollama")
# El modelo por omisión depende del proveedor: los nombres no son los mismos.
#
# ⚠️ EL CATÁLOGO DE GROQ CAMBIA. `llama-3.3-70b-versatile` estaba acá y para el
# 02-09-2026 ya no existía: cualquier consulta habría dado 404 con un mensaje
# que no dice que el modelo fue retirado. Si el asistente empieza a fallar de
# golpe sin haber tocado nada, comprobar primero qué modelos hay:
#   curl -H "Authorization: Bearer $GROQ_API_KEY" https://api.groq.com/openai/v1/models
MODELO = os.environ.get(
    "VSV_AI_MODELO",
    "qwen/qwen3.8-27b" if PROVEEDOR == "groq" else "qwen2.5:7b",
)
VSV_API_URL = os.environ.get("VSV_API_URL", "")

# CORS · normalmente vacío, y es lo correcto.
#
# El navegador NO habla con este servicio: habla con el backend de VSV PRO, que
# reenvía acá (src/controllers/asistente.controllers.js). Una petición
# servidor-a-servidor no pasa por CORS, así que no hay ningún origen que
# permitir.
#
# La variable existe por si alguna vez se quiere apuntar el frontend
# directamente —para depurar en local, por ejemplo—. Dejarla vacía en
# producción es más seguro: ninguna página web puede llamar a este servicio.
ORIGENES = [
    o.strip() for o in os.environ.get("ORIGENES_PERMITIDOS", "").split(",") if o.strip()
]

app = FastAPI(
    title="VSV AI",
    description="Asistente interno de VSV PRO",
    version="0.1.0",
    docs_url=None if os.environ.get("RAILWAY_ENVIRONMENT") == "production" else "/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGENES,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    # Las mismas que usa VSV PRO. Si acá faltara x-session-id, el navegador
    # bloquearía la petición en el preflight y el síntoma sería un error de CORS
    # que no dice nada sobre la causa.
    allow_headers=["Content-Type", "x-session-id", "x-company-id"],
)

# En proceso por ahora. Para producción va a Redis: con más de una instancia en
# Railway, dos peticiones de la misma conversación pueden caer en instancias
# distintas y la memoria se perdería a medias — que es peor que no tenerla.
memoria = Memoria()


# ─────────────────────────────────────────────────────────────────────────────
class PeticionChat(BaseModel):
    mensaje: str = Field(..., min_length=1, max_length=2000)
    conversacion_id: str = Field(default="default", max_length=64)


class RespuestaChat(BaseModel):
    respuesta: str
    herramienta: str | None = None
    ms: int
    modelo: str


class Sesion:
    """La sesión del usuario tal como la maneja VSV PRO."""

    def __init__(self, session_id: str, empresa_id: str | None):
        self.session_id = session_id
        self.empresa_id = empresa_id


def _sesion(
    x_session_id: str | None = Header(default=None, alias="x-session-id"),
    x_company_id: str | None = Header(default=None, alias="x-company-id"),
) -> Sesion:
    if not x_session_id:
        raise HTTPException(401, "Falta la sesión de VSV PRO.")
    return Sesion(x_session_id, x_company_id)


# ─────────────────────────────────────────────────────────────────────────────
@app.middleware("http")
async def registrar(request: Request, call_next):
    """Un identificador por petición: sin esto, un dato equivocado no se puede
    rastrear hasta su origen entre los registros."""
    id_peticion = uuid.uuid4().hex[:8]
    inicio = time.monotonic()
    respuesta = await call_next(request)
    ms = int((time.monotonic() - inicio) * 1000)
    log.info("%s %s %s → %s (%d ms)", id_peticion, request.method,
             request.url.path, respuesta.status_code, ms)
    respuesta.headers["x-request-id"] = id_peticion
    return respuesta


@app.exception_handler(Exception)
async def error_no_previsto(request: Request, exc: Exception):
    """Nunca se filtra la excepción al cliente: puede traer la URL interna de la
    API o parte de una consulta. Se registra completa y se responde algo neutro."""
    log.exception("Error no previsto en %s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Error interno del asistente."})


# ─────────────────────────────────────────────────────────────────────────────
@app.get("/salud")
def salud(verificar_modelo: bool = False):
    """Healthcheck de Railway.

    Devuelve 200 aunque el modelo esté caído: si devolviera error, Railway
    reiniciaría el servicio en un bucle sin arreglar nada — el modelo vive en
    otra máquina. El estado del modelo se informa en el cuerpo.

    `?verificar_modelo=1` comprueba además que el modelo configurado siga
    existiendo en el proveedor. No se hace siempre porque es una llamada de red
    en cada healthcheck, y Railway los hace seguido.
    """
    disponible = provider.esta_disponible(proveedor=PROVEEDOR)
    respuesta = {
        "servicio": "ok",
        "modelo_alcanzable": disponible,
        "modelo": MODELO,
        "proveedor": PROVEEDOR,
        "api_vsv_configurada": bool(VSV_API_URL),
        "modelos": ([m["nombre"] for m in provider.modelos_disponibles()]
                    if disponible and PROVEEDOR == "ollama" else []),
    }

    if verificar_modelo and PROVEEDOR == "groq":
        catalogo = provider.modelos_groq()
        if catalogo:
            respuesta["modelo_existe"] = MODELO in catalogo
            respuesta["modelos"] = catalogo
            if MODELO not in catalogo:
                # El aviso importa: sin él, el síntoma es un 404 por consulta
                # que parece un problema de red o de clave.
                log.warning("El modelo %s ya no está en Groq. Disponibles: %s",
                            MODELO, ", ".join(catalogo[:6]))

    return respuesta


@app.post("/api/chat", response_model=RespuestaChat)
def chat(peticion: PeticionChat, sesion: Sesion = Depends(_sesion)):
    if not VSV_API_URL:
        raise HTTPException(503, "El asistente no está configurado (falta VSV_API_URL).")
    if not provider.esta_disponible(proveedor=PROVEEDOR):
        # 503 y no 500: es temporal y el frontend puede decir «vuelve a intentar».
        raise HTTPException(503, "El asistente no está disponible en este momento.")

    orquestador = Orquestador(
        modelo=MODELO,
        proveedor=PROVEEDOR,
        cliente=ClienteVsvPro(sesion=sesion.session_id, empresa_id=sesion.empresa_id),
        memoria=memoria,
    )
    # La conversación se guarda por usuario: si se indexara solo por
    # conversacion_id, dos usuarios con el id "default" compartirían el hilo —y
    # con él, los datos ya consultados.
    id_hilo = f"{sesion.session_id}:{peticion.conversacion_id}"
    resultado = orquestador.responder(peticion.mensaje, id_conversacion=id_hilo)

    return RespuestaChat(
        respuesta=resultado.texto,
        herramienta=resultado.traza.herramienta,
        ms=resultado.traza.ms_modelo + resultado.traza.ms_herramienta,
        modelo=MODELO,
    )


@app.delete("/api/chat/{conversacion_id}")
def olvidar(conversacion_id: str, sesion: Sesion = Depends(_sesion)):
    memoria.olvidar(f"{sesion.session_id}:{conversacion_id}")
    return {"ok": True}
