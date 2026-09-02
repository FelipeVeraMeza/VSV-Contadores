# =============================================================================
# ADAPTADOR DE MODELO · el punto que hace intercambiable todo lo demás
# -----------------------------------------------------------------------------
# Todo el sistema llama a `generar(...)`. Qué modelo hay detrás lo decide una
# variable de entorno. Eso permite tres cosas que de otro modo serían reescribir
# el proyecto:
#
#   · ejecutar el benchmark sobre varios candidatos sin tocar nada más
#   · cambiar de modelo cuando salga uno mejor
#   · mover el modelo a un servidor con GPU cambiando solo OLLAMA_HOST
#
# Ese último punto es el que sostiene la arquitectura acordada: VSV AI corre en
# Railway, el modelo corre donde haya GPU, y se hablan por HTTP. El servicio no
# sabe ni le importa si el modelo está en la misma máquina o en otra ciudad.
#
# NO se elige el modelo acá. Se elige con el benchmark (evaluation/), que es el
# punto del proyecto: la decisión sale de una tabla comparativa, no de la fama
# de un modelo ni del hardware que había a mano.
# =============================================================================
from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

TIEMPO_LIMITE_S = 180  # Un modelo cargando en frío puede tardar bastante.


@dataclass
class Respuesta:
    """Forma única de salida, venga del proveedor que venga."""
    texto: str
    ms: int
    tokens_entrada: int | None = None
    tokens_salida: int | None = None
    modelo: str = ""


def _host_ollama(host: str | None = None) -> str:
    return (host or os.environ.get("OLLAMA_HOST") or "http://localhost:11434").rstrip("/")


def _post_json(url: str, cuerpo: dict, tiempo_limite: int = TIEMPO_LIMITE_S) -> dict:
    datos = json.dumps(cuerpo).encode("utf-8")
    peticion = urllib.request.Request(
        url, data=datos, headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(peticion, timeout=tiempo_limite) as r:
        return json.loads(r.read().decode("utf-8"))


def _generar_ollama(*, sistema: str, mensajes: list[dict], modelo: str,
                    temperatura: float = 0.1, max_tokens: int = 512,
                    host: str | None = None) -> Respuesta:
    """Se habla con la API HTTP y no con una librería: así el modelo puede correr
    en otra máquina —un servidor con GPU— cambiando solo la URL."""
    inicio = time.monotonic()
    datos = _post_json(
        f"{_host_ollama(host)}/api/chat",
        {
            "model": modelo,
            "messages": [{"role": "system", "content": sistema}, *mensajes],
            "stream": False,
            "options": {
                # Temperatura baja a propósito: acá no se quiere creatividad, se
                # quiere que elija SIEMPRE la misma herramienta para la misma
                # pregunta. Un asistente que un día elige una cosa y al otro día
                # otra no es confiable, y el benchmark dejaría de ser
                # reproducible.
                "temperature": temperatura,
                "num_predict": max_tokens,
            },
        },
    )
    return Respuesta(
        texto=(datos.get("message") or {}).get("content", ""),
        ms=int((time.monotonic() - inicio) * 1000),
        tokens_entrada=datos.get("prompt_eval_count"),
        tokens_salida=datos.get("eval_count"),
        modelo=modelo,
    )


# ---------------------------------------------------------------------------
# GROQ · los mismos modelos abiertos, en la máquina de otro
# ---------------------------------------------------------------------------
# Groq no tiene modelo propio: ejecuta Llama, Qwen y Mistral —los mismos que se
# descargan con `ollama pull`— en su hardware. Eso es lo que lo distingue de
# usar un modelo cerrado:
#
#   · el modelo es abierto y el día que haya GPU propia, corre igual
#   · cambiar de proveedor es cambiar una variable, no reescribir el sistema
#   · no hay nada que quede atado a Groq
#
# La capa gratuita da 14.400 consultas al día. VSV, con cinco personas
# preguntando unas veinte veces cada una, usa alrededor del 1%.
#
# ⚠️ LO QUE SÍ CAMBIA: los datos salen de la infraestructura de VSV. Mientras se
# use un proveedor externo hay que seudonimizar los nombres de empresa antes de
# enviarlos —para eso existe tools/anonimizar.py—. Con el modelo corriendo en
# casa esa capa se desactiva.
GROQ_REINTENTOS = 4
ESPERA_MAXIMA_S = 30.0


def _espera_sugerida(cuerpo: str, cabeceras) -> float:
    """Cuánto esperar tras un 429.

    Groq dice el tiempo exacto en el mensaje («try again in 1.5675s») y también
    en la cabecera `retry-after`. Se usa ese dato en vez de una espera fija:
    esperar de más desperdicia tiempo y esperar de menos vuelve a fallar.
    """
    coincidencia = re.search(r"try again in ([\d.]+)s", cuerpo)
    if coincidencia:
        try:
            return min(float(coincidencia.group(1)) + 0.3, ESPERA_MAXIMA_S)
        except ValueError:
            pass
    try:
        return min(float(cabeceras.get("retry-after") or 0) or 2.0, ESPERA_MAXIMA_S)
    except (TypeError, ValueError):
        return 2.0


def _generar_groq(*, sistema: str, mensajes: list[dict], modelo: str,
                  temperatura: float = 0.1, max_tokens: int = 512) -> Respuesta:
    clave = os.environ.get("GROQ_API_KEY")
    if not clave:
        raise RuntimeError("Falta GROQ_API_KEY.")

    inicio = time.monotonic()
    datos = json.dumps({
        "model": modelo,
        "messages": [{"role": "system", "content": sistema}, *mensajes],
        "temperature": temperatura,
        "max_tokens": max_tokens,
        "stream": False,
    }).encode("utf-8")

    def construir():
        return urllib.request.Request(
            "https://api.groq.com/openai/v1/chat/completions",
            data=datos,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {clave}",
                # Sin User-Agent, urllib manda "Python-urllib/3.x" y Cloudflare
                # responde 403 código 1010 antes de que la petición llegue a
                # Groq. El síntoma parece un problema de clave y no lo es.
                "User-Agent": "vsv-ai/0.1",
                "Accept": "application/json",
            },
            method="POST",
        )

    # La capa gratuita limita TOKENS POR MINUTO (8.000), no solo consultas al
    # día. Un pico de uso lo agota en segundos, pero Groq dice exactamente
    # cuánto esperar —normalmente 1 a 10 s— y después atiende con normalidad.
    #
    # Sin este reintento, dos personas preguntando a la vez verían un error
    # cuando lo único que hacía falta era esperar un segundo.
    for intento in range(GROQ_REINTENTOS):
        try:
            with urllib.request.urlopen(construir(), timeout=TIEMPO_LIMITE_S) as r:
                respuesta = json.loads(r.read().decode("utf-8"))
            break
        except urllib.error.HTTPError as e:
            cuerpo = e.read().decode("utf-8", errors="replace")
            if e.code == 429 and intento < GROQ_REINTENTOS - 1:
                time.sleep(_espera_sugerida(cuerpo, e.headers))
                continue
            if e.code == 429:
                raise RuntimeError(
                    f"Groq: se alcanzó el límite de uso. {cuerpo[:200]}"
                ) from e
            if e.code == 401:
                raise RuntimeError("Groq: la clave no es válida.") from e
            raise RuntimeError(f"Groq respondió {e.code}: {cuerpo[:300]}") from e

    eleccion = (respuesta.get("choices") or [{}])[0]
    uso = respuesta.get("usage") or {}
    return Respuesta(
        texto=(eleccion.get("message") or {}).get("content", ""),
        ms=int((time.monotonic() - inicio) * 1000),
        tokens_entrada=uso.get("prompt_tokens"),
        tokens_salida=uso.get("completion_tokens"),
        modelo=modelo,
    )


PROVEEDORES = {"ollama", "groq"}


def generar(*, modelo: str, sistema: str, mensajes: list[dict],
            proveedor: str = "ollama", temperatura: float = 0.1,
            max_tokens: int = 512, host: str | None = None) -> Respuesta:
    """Punto único de entrada.

    temperatura y max_tokens vienen del protocolo del benchmark: TODOS los
    modelos tienen que recibir las mismas condiciones o la comparación no vale.
    """
    if not modelo:
        raise ValueError("Falta indicar el modelo.")
    if proveedor not in PROVEEDORES:
        raise ValueError(
            f"Proveedor '{proveedor}' desconocido. Disponibles: {', '.join(sorted(PROVEEDORES))}."
        )
    if proveedor == "groq":
        return _generar_groq(sistema=sistema, mensajes=mensajes, modelo=modelo,
                             temperatura=temperatura, max_tokens=max_tokens)
    return _generar_ollama(sistema=sistema, mensajes=mensajes, modelo=modelo,
                           temperatura=temperatura, max_tokens=max_tokens, host=host)


def modelos_groq() -> list[str]:
    """Qué modelos ofrece Groq ahora mismo.

    El catálogo cambia: un modelo que funcionaba puede desaparecer y entonces
    TODAS las consultas dan 404 sin decir por qué. Esto permite que /salud lo
    detecte antes de que alguien pregunte.
    """
    clave = os.environ.get("GROQ_API_KEY")
    if not clave:
        return []
    try:
        peticion = urllib.request.Request(
            "https://api.groq.com/openai/v1/models",
            headers={"Authorization": f"Bearer {clave}", "User-Agent": "vsv-ai/0.1"},
        )
        with urllib.request.urlopen(peticion, timeout=10) as r:
            datos = json.loads(r.read().decode("utf-8"))
        return sorted(m["id"] for m in datos.get("data", []) if m.get("id"))
    except (urllib.error.URLError, OSError, json.JSONDecodeError, KeyError):
        return []


def modelos_disponibles(host: str | None = None) -> list[dict]:
    """Qué modelos hay en el Ollama al que se esté apuntando."""
    try:
        with urllib.request.urlopen(f"{_host_ollama(host)}/api/tags", timeout=10) as r:
            datos = json.loads(r.read().decode("utf-8"))
    except (urllib.error.URLError, OSError, json.JSONDecodeError):
        return []  # Ollama no está corriendo: el corredor lo informa con claridad.
    return [
        {
            "nombre": m.get("name"),
            "gb": round((m.get("size") or 0) / 1e9, 1),
            "familia": (m.get("details") or {}).get("family"),
            "parametros": (m.get("details") or {}).get("parameter_size"),
        }
        for m in datos.get("models", [])
    ]


def esta_disponible(host: str | None = None, proveedor: str | None = None) -> bool:
    """Si se puede generar ahora mismo.

    Con Groq basta con tener la clave: comprobarlo con una llamada real gastaría
    cuota del límite diario cada vez que alguien abre el panel.
    """
    proveedor = proveedor or os.environ.get("VSV_AI_PROVEEDOR", "ollama")
    if proveedor == "groq":
        return bool(os.environ.get("GROQ_API_KEY"))
    try:
        with urllib.request.urlopen(f"{_host_ollama(host)}/api/tags", timeout=5) as r:
            return r.status == 200
    except (urllib.error.URLError, OSError):
        return False
