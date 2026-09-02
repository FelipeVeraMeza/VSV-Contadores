# =============================================================================
# PROTOCOLO DE EJECUCIÓN · VSV AI Benchmark v1.0
# -----------------------------------------------------------------------------
# Estas constantes existen para que los resultados sean COMPARABLES entre
# modelos y REPRODUCIBLES en el tiempo. Si un modelo recibiera mejores
# condiciones que otro, la tabla comparativa no valdría nada.
#
# Todo lo que se fija acá queda escrito en el informe de cada corrida: dentro de
# seis meses se tiene que poder decir «el modelo se eligió con ESTAS
# condiciones», no «creo que era mejor».
#
# ⚠️ CAMBIAR CUALQUIERA DE ESTOS VALORES INVALIDA LA COMPARACIÓN con corridas
# anteriores. Si se cambia, se sube la versión y se vuelve a correr todo.
# =============================================================================
from __future__ import annotations

import platform
import subprocess

VERSION = "1.0"

# ── Condiciones idénticas para todos los modelos ─────────────────────────────
TEMPERATURA = 0.1
# Baja a propósito: no se busca creatividad sino que elija SIEMPRE la misma
# herramienta para la misma pregunta. Con temperatura alta el benchmark dejaría
# de ser reproducible y el asistente sería impredecible.

MAX_TOKENS_SALIDA = 512
# Suficiente para un JSON de llamada o una respuesta corta. Si un modelo
# necesita más, es que está divagando.

# ── Repeticiones ─────────────────────────────────────────────────────────────
REPETICIONES = 3
# Los LLM no son deterministas ni con temperatura 0.1. Una sola pasada puede
# premiar o castigar a un modelo por azar. Con 3 se distingue un acierto estable
# de uno afortunado.
#
# 45 casos × 3 repeticiones × N modelos.

CRITERIO_ACIERTO = "todas"
# Un caso se cuenta como acertado solo si acierta en TODAS las repeticiones.
# Estricto a propósito: un asistente que acierta 2 de cada 3 veces no es uno que
# funciona el 66% del tiempo, es uno en el que no se puede confiar.

# ── Criterio de veto ─────────────────────────────────────────────────────────
# Un modelo que falla acá NO gana, aunque sea el más rápido o el mejor en el
# resto. Inventar una cifra financiera es el error que no se detecta solo.
VETO = {
    "alucinacion": {"maximo": 0.01, "descripcion": "Máximo 1% de respuestas inventadas"},
}

# ── Objetivos por categoría ──────────────────────────────────────────────────
OBJETIVOS = {
    "seleccion_de_herramienta": 0.95,
    "espanol_real": 0.95,
    "memoria_conversacional": 0.90,
    "comportamiento_ante_negativas": 0.95,
    "alucinacion": 0.99,   # ≥99% de acierto = ≤1% de alucinación
}


def percentil(valores: list[float], p: int) -> float | None:
    """P50 y P95 dicen más que el promedio: un modelo con promedio de 2 s pero
    P95 de 9 s se siente lento aunque el promedio diga lo contrario."""
    if not valores:
        return None
    orden = sorted(valores)
    i = max(0, min(len(orden) - 1, -(-p * len(orden) // 100) - 1))
    return orden[i]


def _nvidia_smi(consulta: str) -> str | None:
    try:
        salida = subprocess.run(
            ["nvidia-smi", f"--query-gpu={consulta}", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5, check=True,
        )
        return salida.stdout.strip().split("\n")[0].strip()
    except (OSError, subprocess.SubprocessError):
        return None


def vram_en_uso_mb() -> int | None:
    """VRAM en uso. Devuelve None si no hay GPU NVIDIA: la medición es
    informativa y no puede detener el benchmark."""
    valor = _nvidia_smi("memory.used")
    try:
        return int(valor) if valor else None
    except ValueError:
        return None


def entorno() -> dict:
    """Datos del equipo donde se corrió. Van en el informe: un benchmark sin el
    hardware anotado no se puede reproducir ni interpretar."""
    import os
    from datetime import datetime, timezone

    info = {
        "fecha": datetime.now(timezone.utc).isoformat(),
        "python": platform.python_version(),
        "plataforma": f"{platform.system()} {platform.machine()}",
        "protocolo_version": VERSION,
        "cpu": platform.processor() or "desconocida",
        "nucleos": os.cpu_count(),
    }
    gpu = _nvidia_smi("name,memory.total,driver_version")
    info["gpu"] = gpu or "sin GPU NVIDIA detectada"
    return info
