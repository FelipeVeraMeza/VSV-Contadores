# =============================================================================
# PRUEBA DEL CORREDOR DEL BENCHMARK
# -----------------------------------------------------------------------------
# Se ejercita el corredor REAL —evaluar_caso, no una réplica de su lógica—
# contra un modelo simulado con comportamiento conocido.
#
# POR QUÉ ESTO IMPORTA
# El benchmark es lo que va a decidir qué modelo usa VSV. Si el corredor tuviera
# un error, elegiríamos el modelo equivocado y el error quedaría escondido
# detrás de una tabla con aspecto de rigurosa. Un instrumento de medición se
# calibra antes de usarlo.
#
# Se simulan tres modelos: uno perfecto, uno que inventa cifras y uno que
# confunde facturación con recaudación. Si el corredor está bien, tiene que
# distinguirlos.
#
#   python tests/test_benchmark.py
# =============================================================================
from __future__ import annotations

import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

for _f in (sys.stdout, sys.stderr):
    if hasattr(_f, "reconfigure"):
        _f.reconfigure(encoding="utf-8", errors="replace")

from evaluation import runner
from models import provider
from models.provider import Respuesta

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


# ─────────────────────────────────────────────────────────────────────────────
# Modelos simulados
# ─────────────────────────────────────────────────────────────────────────────
class ModeloPerfecto:
    """Responde exactamente lo que cada caso espera. Sirve para verificar que el
    corredor no invente fallos donde no los hay."""

    def __init__(self, dataset):
        # Se indexa por la pregunta para poder responder lo esperado.
        self.esperado = {}
        for grupo in dataset:
            for caso in grupo["casos"]:
                if "turnos" in caso:
                    for t in caso["turnos"]:
                        self.esperado[t["usuario"]] = (t.get("herramienta"), t.get("parametros") or {})
                else:
                    self.esperado[caso["pregunta"]] = (caso.get("herramienta"), caso.get("parametros") or {})
        self.casos_por_pregunta = {}
        for grupo in dataset:
            for caso in grupo["casos"]:
                if "pregunta" in caso:
                    self.casos_por_pregunta[caso["pregunta"]] = caso

    def __call__(self, *, mensajes, **kwargs):
        ultimo = mensajes[-1]["content"]

        # Segundo turno: le pasaron los datos y tiene que redactar.
        if ultimo.startswith("Resultado de"):
            datos = json.loads(ultimo.split("\n")[1])
            pregunta = next((m["content"] for m in mensajes if m["role"] == "user"), "")
            caso = self.casos_por_pregunta.get(pregunta, {})

            # Sin datos: se dice, no se estima.
            if datos.get("total") is None and "ventasMes" not in datos:
                return Respuesta(texto="No tengo ese dato para el período consultado.", ms=5)

            # Con datos, cita las cifras que el caso espera. Un modelo perfecto
            # sabe cuál de las que le llegaron corresponde a la pregunta —que es
            # justo lo que distingue facturar de cobrar ahora que las dos vienen
            # en la misma respuesta.
            esperadas = [str(x) for x in (caso.get("debe_contener") or [])
                         if any(c.isdigit() for c in str(x))]
            if esperadas:
                return Respuesta(texto=f"La cifra es ${esperadas[0]}.", ms=5)

            valor = datos.get("total", datos.get("ventasMes"))
            return Respuesta(texto=f"El total es ${valor:,}".replace(",", "."), ms=5)

        herramienta, parametros = self.esperado.get(ultimo, (None, {}))
        if herramienta is None:
            return Respuesta(texto="No tienes acceso a esa información y no puedo hacerlo.", ms=5)
        return Respuesta(
            texto=json.dumps({"herramienta": herramienta, "parametros": parametros}, ensure_ascii=False),
            ms=5,
        )


class ModeloQueInventa(ModeloPerfecto):
    """Igual al perfecto, salvo que cuando no hay dato inventa una cifra. Es el
    fallo que el veto tiene que atrapar."""

    def __call__(self, *, mensajes, **kwargs):
        ultimo = mensajes[-1]["content"]
        if ultimo.startswith("Resultado de"):
            datos = json.loads(ultimo.split("\n")[1])
            if datos.get("total") is None:
                return Respuesta(texto="Aproximadamente $5.200.000.", ms=5)
        return super().__call__(mensajes=mensajes, **kwargs)


class ModeloQueConfunde(ModeloPerfecto):
    """Confunde facturación con recaudación — el error más caro del negocio."""

    def __call__(self, *, mensajes, **kwargs):
        r = super().__call__(mensajes=mensajes, **kwargs)
        if "consultar_tareas" in r.texto:
            r.texto = r.texto.replace("consultar_tareas", "consultar_metricas")
        return r


# ─────────────────────────────────────────────────────────────────────────────
dataset = runner.cargar_dataset()
total_casos = sum(len(g["casos"]) for g in dataset)
_real = provider.generar

print(f"\nDataset: {total_casos} casos en {len(dataset)} categorías")

print("\nMODELO PERFECTO · el corredor no debe inventar fallos")
provider.generar = ModeloPerfecto(dataset)
r_perfecto = runner.correr_modelo("simulado-perfecto", dataset, None, repeticiones=1)

revisar("acierta el 100%", r_perfecto["acierto_total"] == 1.0,
        f"sacó {r_perfecto['acierto_total']:.0%}")
revisar("no queda vetado", not r_perfecto["vetado"])
revisar("evaluó todos los casos", r_perfecto["casos"] == total_casos)
revisar("registra latencia", r_perfecto["latencia_p50"] is not None)
revisar("cumple todos los objetivos",
        all(c["cumple"] for c in r_perfecto["por_categoria"].values()))

print("\nMODELO QUE INVENTA CIFRAS · el veto tiene que atraparlo")
provider.generar = ModeloQueInventa(dataset)
r_inventa = runner.correr_modelo("simulado-inventa", dataset, None, repeticiones=1)

revisar("queda VETADO", r_inventa["vetado"], "un modelo que inventa cifras pasó el filtro")
revisar("el motivo menciona alucinación", "alucinación" in r_inventa["motivo_veto"])
revisar("falla en la categoría alucinación",
        r_inventa["por_categoria"]["alucinacion"]["tasa"] < 1.0)
revisar("pero sigue bien en selección de herramienta",
        r_inventa["por_categoria"]["seleccion_de_herramienta"]["tasa"] == 1.0,
        "el fallo se atribuyó a la categoría equivocada")

print("\nMODELO QUE CONFUNDE FACTURAR CON COBRAR")
provider.generar = ModeloQueConfunde(dataset)
r_confunde = runner.correr_modelo("simulado-confunde", dataset, None, repeticiones=1)

revisar("baja el acierto total", r_confunde["acierto_total"] < 1.0)
revisar("los fallos quedan detallados",
        any(c["fallos"] for c in r_confunde["por_categoria"].values()))
un_fallo = next(f for c in r_confunde["por_categoria"].values() for f in c["fallos"])
revisar("y el detalle dice qué llamó y qué se esperaba",
        "consultar_metricas" in un_fallo["motivo"] and "consultar_tareas" in un_fallo["motivo"],
        un_fallo["motivo"])

print("\nCOMPARATIVA · ordena y marca el veto")
provider.generar = _real
runner.imprimir_comparativa([r_inventa, r_perfecto, r_confunde])
revisar("el vetado no puede ganar aunque acierte más",
        r_inventa["acierto_total"] > r_confunde["acierto_total"] and r_inventa["vetado"])

print(f"\n{'─' * 60}")
if fallos:
    print(f"{pruebas - len(fallos)}/{pruebas} pruebas · {len(fallos)} FALLAS\n")
    for f in fallos:
        print(f"  · {f}")
    sys.exit(1)
print(f"{pruebas}/{pruebas} pruebas ok · el corredor mide lo que dice medir\n")
