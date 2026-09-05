# =============================================================================
# ORQUESTADOR · el ciclo completo de una pregunta
# -----------------------------------------------------------------------------
#   pregunta
#      ↓
#   [1] modelo + prompt + memoria      → ¿qué herramienta hace falta?
#      ↓
#   [2] validación                     → ¿lo que pidió existe y tiene sentido?
#      ↓
#   [3] herramienta → API de VSV PRO   → los permisos se aplican acá
#      ↓
#   [4] modelo + datos                 → redacta la respuesta
#      ↓
#   respuesta
#
# POR QUÉ DOS LLAMADAS AL MODELO Y NO UNA
# La primera decide, la segunda redacta. Se podría intentar en una sola pasada,
# pero entonces el modelo tendría que inventar los datos para redactar — que es
# exactamente el error que este sistema no puede cometer.
#
# El paso [3] es el único que toca datos reales, y pasa por la API con el token
# del usuario. El modelo nunca ve nada que el usuario no pueda ver.
# =============================================================================
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Protocol

log = logging.getLogger("vsv-ai.orquestador")

from core.prompts import VERSION as VERSION_PROMPT, prompt_sistema
from core.resumir import resumir_para_modelo
from memory.conversation import Conversacion, Memoria
from models import provider
from security import validation
from tools.cliente import ResultadoHerramienta

# Tope de herramientas por pregunta. Hoy ninguna pregunta del dataset necesita
# más de una; el límite existe para que un modelo confundido no entre en bucle.
MAXIMO_PASOS = 3


class Cliente(Protocol):
    def ejecutar(self, nombre: str, parametros: dict[str, Any]) -> ResultadoHerramienta: ...


@dataclass
class Traza:
    """Qué pasó adentro. Va al log y es lo que permite auditar una respuesta:
    sin esto, un dato equivocado no se puede rastrear hasta su origen."""
    herramienta: str | None = None
    parametros: dict = field(default_factory=dict)
    errores_validacion: list[str] = field(default_factory=list)
    ms_modelo: int = 0
    ms_herramienta: int = 0
    tokens_entrada: int = 0
    tokens_salida: int = 0
    version_prompt: str = VERSION_PROMPT


@dataclass
class RespuestaAsistente:
    texto: str
    traza: Traza = field(default_factory=Traza)


class Orquestador:
    def __init__(self, *, modelo: str, cliente: Cliente, memoria: Memoria | None = None,
                 host: str | None = None, temperatura: float = 0.1,
                 max_tokens: int = 512, proveedor: str = "ollama"):
        self.modelo = modelo
        self.cliente = cliente
        self.memoria = memoria or Memoria()
        self.host = host
        self.temperatura = temperatura
        self.max_tokens = max_tokens
        self.proveedor = proveedor

    # ── [1] decidir ──────────────────────────────────────────────────────────
    def _preguntar_al_modelo(self, conversacion: Conversacion, traza: Traza) -> str:
        sistema = prompt_sistema()
        contexto = conversacion.contexto_de_datos()
        if contexto:
            sistema += f"\n\n════════════════════════════════════════════════════════════════════\n{contexto}"

        r = provider.generar(
            modelo=self.modelo, sistema=sistema, mensajes=conversacion.mensajes(),
            temperatura=self.temperatura, max_tokens=self.max_tokens, host=self.host,
            proveedor=self.proveedor,
        )
        traza.ms_modelo += r.ms
        traza.tokens_entrada += r.tokens_entrada or 0
        traza.tokens_salida += r.tokens_salida or 0
        return r.texto

    # El modelo corre en OTRA máquina: se puede caer, quedarse sin VRAM o tardar
    # más que el tiempo límite. Eso no es un error del asistente y el usuario
    # merece una explicación, no un 500.
    ERROR_MODELO = ("El asistente no está respondiendo en este momento. "
                    "Inténtalo de nuevo en un rato.")

    # ── ciclo completo ───────────────────────────────────────────────────────
    def responder(self, pregunta: str, *, id_conversacion: str = "default",
                  usuario: str | None = None) -> RespuestaAsistente:
        conversacion = self.memoria.obtener(id_conversacion, usuario)
        conversacion.agregar("user", pregunta)
        traza = Traza()

        for _ in range(MAXIMO_PASOS):
            try:
                crudo = self._preguntar_al_modelo(conversacion, traza)
            except Exception as e:
                log.warning("El modelo %s falló: %s: %s", self.modelo, type(e).__name__, e)
                conversacion.agregar("assistant", self.ERROR_MODELO)
                return RespuestaAsistente(self.ERROR_MODELO, traza)

            # [2] validar
            analisis = validation.analizar(crudo)
            traza.errores_validacion.extend(analisis.errores)

            if not analisis.es_invocacion:
                texto = analisis.texto or (
                    "No pude entender la consulta. ¿La puedes decir de otra forma?"
                )
                conversacion.agregar("assistant", texto)
                return RespuestaAsistente(texto, traza)

            # [3] ejecutar contra la API de VSV PRO
            invocacion = analisis.invocacion
            traza.herramienta = invocacion.herramienta
            traza.parametros = invocacion.parametros

            import time
            inicio = time.monotonic()
            try:
                resultado = self.cliente.ejecutar(invocacion.herramienta, invocacion.parametros)
            except Exception as e:
                # El cliente devuelve errores controlados para lo previsible (un
                # 403, un 500 de la API). Esto es para lo IMPREVISIBLE: DNS
                # caído, TLS vencido, la red que se corta a mitad. Sin este
                # rescate la excepción sube hasta FastAPI y el usuario recibe un
                # 500 genérico, cuando el asistente podría explicarle qué pasó.
                log.warning("La herramienta %s falló: %s: %s",
                            invocacion.herramienta, type(e).__name__, e)
                resultado = ResultadoHerramienta(
                    ok=False, error="no se pudo conectar con VSV PRO"
                )
            traza.ms_herramienta += int((time.monotonic() - inicio) * 1000)

            if resultado.ok:
                conversacion.recordar_dato(
                    invocacion.herramienta, invocacion.parametros, resultado.datos
                )
                # Los datos se RESUMEN antes de mandarlos al modelo. Medido el
                # 04-09-2026: pasarlos enteros llegaba a 93.719 tokens contra un
                # límite de 7.000, y la mitad de las preguntas fallaba con «el
                # asistente no está respondiendo». Ver core/resumir.py.
                observacion = (
                    f"Resultado de {invocacion.herramienta}:\n"
                    f"{resumir_para_modelo(resultado.datos)}\n\n"
                    "Redacta la respuesta usando SOLO estos datos. Si falta algo, dilo. "
                    "Si el resultado trae «_total», ese es el número real: úsalo, "
                    "no cuentes los elementos que ves."
                )
            elif resultado.sin_acceso:
                # Se distingue a propósito: el modelo tiene que decir «no tienes
                # acceso», no «hubo un problema». Son cosas distintas para quien
                # pregunta.
                observacion = (
                    "La consulta fue rechazada por permisos. Dile al usuario que no "
                    "tiene acceso a esa información. No inventes el dato ni finjas "
                    "haberlo consultado."
                )
            else:
                observacion = (
                    f"La consulta falló: {resultado.error}. Dilo con claridad y no "
                    "inventes el dato."
                )

            # [4] redactar con los datos en mano
            conversacion.agregar("user", observacion)

        # Se agotaron los pasos: el modelo sigue pidiendo herramientas.
        texto = "No pude resolver la consulta. ¿La puedes plantear de otra forma?"
        conversacion.agregar("assistant", texto)
        return RespuestaAsistente(texto, traza)
