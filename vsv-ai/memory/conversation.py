# =============================================================================
# MEMORIA CONVERSACIONAL
# -----------------------------------------------------------------------------
# Sin esto, VSV AI sería un buscador con lenguaje natural. La diferencia entre
# un buscador y un asistente es exactamente esta:
#
#   — ¿Cuánto cobramos en agosto?
#   — $4.671.956
#   — ¿Y julio?              ← sin memoria, esta pregunta no significa nada
#
# QUÉ SE GUARDA Y QUÉ NO
# Se guardan los turnos y los DATOS que devolvieron las herramientas. Los datos
# importan tanto como el texto: «¿entonces subimos?» se responde comparando dos
# cifras que ya se consultaron, sin volver a llamar a la herramienta.
#
# LÍMITE DE TURNOS
# Toda conversación se recorta a los últimos N turnos. No es una optimización de
# memoria: el prompt del sistema ya son ~5.000 caracteres, y un contexto que
# crece sin fin hace que el modelo empiece a ignorar las reglas del principio.
# =============================================================================
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

TURNOS_MAXIMOS = 12       # 6 intercambios; suficiente para un hilo de trabajo.
DATOS_MAXIMOS = 4         # resultados de herramienta que se recuerdan


@dataclass
class Turno:
    rol: str              # 'user' | 'assistant'
    contenido: str
    momento: float = field(default_factory=time.time)


@dataclass
class DatoConsultado:
    """Lo que devolvió una herramienta, para poder comparar sin volver a llamar."""
    herramienta: str
    parametros: dict[str, Any]
    resultado: Any
    momento: float = field(default_factory=time.time)


class Conversacion:
    def __init__(self, id_conversacion: str, usuario: str | None = None):
        self.id = id_conversacion
        self.usuario = usuario
        self.turnos: list[Turno] = []
        self.datos: list[DatoConsultado] = []

    # ── Turnos ───────────────────────────────────────────────────────────────
    def agregar(self, rol: str, contenido: str) -> None:
        self.turnos.append(Turno(rol, contenido))
        if len(self.turnos) > TURNOS_MAXIMOS:
            self.turnos = self.turnos[-TURNOS_MAXIMOS:]

    def mensajes(self) -> list[dict]:
        """Los turnos en el formato que espera el modelo."""
        return [{"role": t.rol, "content": t.contenido} for t in self.turnos]

    # ── Datos de herramientas ────────────────────────────────────────────────
    def recordar_dato(self, herramienta: str, parametros: dict, resultado: Any) -> None:
        self.datos.append(DatoConsultado(herramienta, parametros, resultado))
        if len(self.datos) > DATOS_MAXIMOS:
            self.datos = self.datos[-DATOS_MAXIMOS:]

    def contexto_de_datos(self) -> str:
        """Resumen de lo ya consultado, para inyectar en el prompt.

        Se entrega como texto y no como otro turno para que el modelo lo lea
        como referencia y no como algo que él mismo dijo."""
        if not self.datos:
            return ""
        lineas = []
        for d in self.datos:
            params = ", ".join(f"{k}={v}" for k, v in d.parametros.items()) or "sin filtros"
            lineas.append(f"· {d.herramienta}({params}) → {d.resultado}")
        return (
            "DATOS YA CONSULTADOS EN ESTA CONVERSACIÓN\n"
            "Puedes usarlos para comparar o responder sin llamar de nuevo a la "
            "herramienta:\n" + "\n".join(lineas)
        )

    def __len__(self) -> int:
        return len(self.turnos)


class Memoria:
    """Almacén en proceso. Para producción va a Redis o Postgres — el contrato
    de esta clase es lo que hay que respetar, no su implementación."""

    def __init__(self):
        self._conversaciones: dict[str, Conversacion] = {}

    def obtener(self, id_conversacion: str, usuario: str | None = None) -> Conversacion:
        if id_conversacion not in self._conversaciones:
            self._conversaciones[id_conversacion] = Conversacion(id_conversacion, usuario)
        return self._conversaciones[id_conversacion]

    def olvidar(self, id_conversacion: str) -> None:
        self._conversaciones.pop(id_conversacion, None)
