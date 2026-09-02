# =============================================================================
# CLIENTE DE HERRAMIENTAS · el puente hacia VSV PRO
# -----------------------------------------------------------------------------
# ESTA ES LA DECISIÓN MÁS IMPORTANTE DEL PROYECTO, y conviene dejarla escrita
# donde se implementa:
#
# Las herramientas llaman a la API de VSV PRO. NO a PostgreSQL.
#
# La tentación de conectarse directo a la base es fuerte: es más rápido y ahorra
# un salto de red. Pero los permisos —puedeVerEmpresa, empresasVisibles, el
# aislamiento por organización— ya existen en VSV PRO y llevan meses
# corrigiéndose. Reimplementarlos acá daría dos sistemas que se desincronizan, y
# el día que diverjan el síntoma es una fuga de datos entre empresas.
#
# Con este diseño, saltarse el aislamiento no es difícil: es imposible. El token
# del usuario viaja en cada llamada y la API decide qué puede ver.
# =============================================================================
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

from tools.catalogo import POR_NOMBRE

TIEMPO_LIMITE_S = 20


@dataclass
class ResultadoHerramienta:
    ok: bool
    datos: Any = None
    error: str | None = None
    # Distingue "no tienes permiso" de "se cayó la API". El modelo tiene que
    # decir cosas distintas en cada caso, y confundirlos es justamente lo que
    # mide 04-comportamiento-ante-negativas.json.
    sin_acceso: bool = False


class ClienteVsvPro:
    """Llama a VSV PRO con la sesión del usuario.

    OJO CON LAS CABECERAS: VSV PRO no usa `Authorization: Bearer`. La sesión
    viaja en `x-session-id` y se valida contra la tabla `sessions`
    (src/middleware/auth.js). La empresa activa va en `x-company-id`, y de ella
    dependen los permisos por empresa.

    Mandar Bearer daría 401 en todas las consultas: el middleware ni siquiera lo
    mira.
    """

    def __init__(self, base_url: str | None = None, sesion: str | None = None,
                 empresa_id: str | None = None):
        self.base_url = (base_url or os.environ.get("VSV_API_URL", "")).rstrip("/")
        self.sesion = sesion
        self.empresa_id = empresa_id

    def ejecutar(self, nombre: str, parametros: dict[str, Any]) -> ResultadoHerramienta:
        herramienta = POR_NOMBRE.get(nombre)
        if herramienta is None:
            return ResultadoHerramienta(ok=False, error=f"herramienta desconocida: {nombre}")

        metodo, ruta = herramienta.endpoint.split(" ", 1)

        # VSV_API_URL suele venir con el /api incluido —es la misma dirección
        # que usa el frontend— y las rutas del catálogo también lo llevan. Sin
        # esto queda /api/api/cobros/resumen y TODAS las herramientas dan 404.
        base = self.base_url
        if base.endswith("/api") and ruta.startswith("/api/"):
            ruta = ruta[4:]
        url = f"{base}{ruta}"
        if parametros:
            url += "?" + urllib.parse.urlencode(
                {k: ("true" if v is True else "false" if v is False else v)
                 for k, v in parametros.items()}
            )

        cabeceras = {"Accept": "application/json"}
        if self.sesion:
            cabeceras["x-session-id"] = self.sesion
        if self.empresa_id:
            cabeceras["x-company-id"] = self.empresa_id

        try:
            peticion = urllib.request.Request(url, headers=cabeceras, method=metodo)
            with urllib.request.urlopen(peticion, timeout=TIEMPO_LIMITE_S) as r:
                return ResultadoHerramienta(ok=True, datos=json.loads(r.read().decode("utf-8")))
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                return ResultadoHerramienta(
                    ok=False, sin_acceso=True,
                    error="El usuario no tiene acceso a esa información.",
                )
            return ResultadoHerramienta(ok=False, error=f"la API respondió {e.code}")
        except (urllib.error.URLError, OSError, json.JSONDecodeError) as e:
            return ResultadoHerramienta(ok=False, error=f"no se pudo consultar: {e}")


class ClienteSimulado:
    """Para el benchmark y las pruebas: devuelve datos fijos sin tocar la red.

    El benchmark mide si el modelo ELIGE bien la herramienta y arma bien los
    parámetros. Si dependiera de la API real, una caída de red se registraría
    como fallo del modelo y la medición no valdría."""

    def __init__(self, respuestas: dict[str, Any] | None = None):
        self.respuestas = respuestas or {}
        self.llamadas: list[tuple[str, dict]] = []

    def ejecutar(self, nombre: str, parametros: dict[str, Any]) -> ResultadoHerramienta:
        self.llamadas.append((nombre, parametros))
        if nombre in self.respuestas:
            return ResultadoHerramienta(ok=True, datos=self.respuestas[nombre])
        return ResultadoHerramienta(ok=False, error="sin datos simulados para esta herramienta")
