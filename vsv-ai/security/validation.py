# =============================================================================
# VALIDACIÓN · lo que el modelo pide vs. lo que se puede ejecutar
# -----------------------------------------------------------------------------
# El modelo devuelve texto. Ese texto NO es una orden: es una propuesta que hay
# que validar antes de convertirla en una llamada real.
#
# POR QUÉ EXISTE ESTE ARCHIVO
# Un modelo puede inventar el nombre de una herramienta, inventar un parámetro,
# o mandar `monto_minimo: "cien lucas"` donde se espera un número. Si eso pasara
# tal cual a la capa de herramientas, el error aparecería mucho más abajo —o
# peor, no aparecería y la consulta se ejecutaría con un filtro que nadie pidió.
#
# LO QUE ESTO NO ES: la barrera de permisos. Los permisos los aplica la API de
# VSV PRO con el token del usuario. Acá solo se valida la FORMA.
# =============================================================================
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

from tools.catalogo import POR_NOMBRE

# El modelo a veces envuelve el JSON en ```json ... ``` aunque se le pida que no.
# Se acepta y se limpia: castigarlo por eso mediría formato, no comprensión.
_CERCA_DE_CODIGO = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.MULTILINE)


@dataclass
class Invocacion:
    """Una llamada a herramienta ya validada y lista para ejecutar."""
    herramienta: str
    parametros: dict[str, Any] = field(default_factory=dict)


@dataclass
class Analisis:
    """Qué se entendió de la respuesta del modelo."""
    invocacion: Invocacion | None = None
    texto: str | None = None          # respuesta en prosa, cuando no pidió herramienta
    errores: list[str] = field(default_factory=list)

    @property
    def es_invocacion(self) -> bool:
        return self.invocacion is not None


def _extraer_json(texto: str) -> dict | None:
    """Saca el objeto JSON de la respuesta, tolerando cercas de código y algo de
    texto alrededor. Devuelve None si no hay ninguno."""
    limpio = _CERCA_DE_CODIGO.sub("", texto).strip()
    try:
        valor = json.loads(limpio)
        return valor if isinstance(valor, dict) else None
    except json.JSONDecodeError:
        pass

    # Segundo intento: el primer objeto balanceado que aparezca en el texto.
    inicio = limpio.find("{")
    while inicio != -1:
        profundidad, en_cadena, escapado = 0, False, False
        for i in range(inicio, len(limpio)):
            c = limpio[i]
            if escapado:
                escapado = False
                continue
            if c == "\\":
                escapado = True
            elif c == '"':
                en_cadena = not en_cadena
            elif not en_cadena and c == "{":
                profundidad += 1
            elif not en_cadena and c == "}":
                profundidad -= 1
                if profundidad == 0:
                    try:
                        valor = json.loads(limpio[inicio:i + 1])
                        if isinstance(valor, dict):
                            return valor
                    except json.JSONDecodeError:
                        break
        inicio = limpio.find("{", inicio + 1)
    return None


def _convertir(valor: Any, tipo: str) -> tuple[Any, str | None]:
    """Convierte al tipo declarado. Se es tolerante con lo que no cambia el
    significado —"true", "150000"— y estricto con lo que sí."""
    if tipo == "boolean":
        if isinstance(valor, bool):
            return valor, None
        if isinstance(valor, str) and valor.lower() in ("true", "false"):
            return valor.lower() == "true", None
        return None, f"se esperaba booleano, llegó {valor!r}"

    if tipo == "number":
        if isinstance(valor, bool):
            return None, f"se esperaba número, llegó {valor!r}"
        if isinstance(valor, (int, float)):
            return valor, None
        if isinstance(valor, str):
            candidato = valor.replace(".", "").replace(",", "").replace("$", "").strip()
            if candidato.lstrip("-").isdigit():
                return int(candidato), None
        return None, f"se esperaba número, llegó {valor!r}"

    if tipo == "string":
        if isinstance(valor, str):
            return valor, None
        if isinstance(valor, (int, float)):
            return str(valor), None
        return None, f"se esperaba texto, llegó {valor!r}"

    return valor, None


def analizar(respuesta: str) -> Analisis:
    """Convierte la salida cruda del modelo en algo ejecutable o en prosa."""
    if not respuesta or not respuesta.strip():
        return Analisis(errores=["el modelo no respondió nada"])

    crudo = _extraer_json(respuesta)
    if crudo is None or "herramienta" not in crudo:
        # No pidió herramienta: es una respuesta en prosa y eso es válido.
        return Analisis(texto=respuesta.strip())

    nombre = crudo.get("herramienta")
    if not isinstance(nombre, str) or nombre not in POR_NOMBRE:
        return Analisis(errores=[f"herramienta desconocida: {nombre!r}"])

    herramienta = POR_NOMBRE[nombre]
    entrantes = crudo.get("parametros") or {}
    if not isinstance(entrantes, dict):
        return Analisis(errores=["'parametros' tiene que ser un objeto"])

    limpios: dict[str, Any] = {}
    errores: list[str] = []

    for clave, valor in entrantes.items():
        if clave not in herramienta.parametros:
            # Se descarta en vez de fallar: un parámetro de más no cambia lo que
            # se consulta, y rechazar la llamada entera por eso sería peor.
            errores.append(f"parámetro ignorado, no existe en {nombre}: {clave!r}")
            continue
        if valor is None:
            continue

        esperado = herramienta.parametros[clave]
        convertido, error = _convertir(valor, esperado.tipo)
        if error:
            errores.append(f"{clave}: {error}")
            continue
        if esperado.valores and convertido not in esperado.valores:
            errores.append(
                f"{clave}: {convertido!r} no está entre {'|'.join(esperado.valores)}"
            )
            continue
        limpios[clave] = convertido

    return Analisis(invocacion=Invocacion(nombre, limpios), errores=errores)
