# =============================================================================
# MIGRAR EL DATASET AL CATÁLOGO REAL
# -----------------------------------------------------------------------------
# El dataset se escribió contra un catálogo de cinco herramientas que resultó no
# existir: las rutas eran inventadas (/api/cobros/recaudacion,
# /api/personas/cartera...). El catálogo se corrigió el 02-09-2026 contra el
# backend real y quedaron CUATRO herramientas.
#
# Este script traduce los 45 casos. Se guarda en el repo —en vez de editar los
# JSON a mano— porque deja constancia de POR QUÉ cambió cada caso, que es lo que
# hace falta para interpretar una corrida vieja del benchmark.
#
#   python evaluation/migrar_dataset.py            (muestra qué cambiaría)
#   python evaluation/migrar_dataset.py --aplicar  (lo escribe)
# =============================================================================
from __future__ import annotations

import json
import sys
from pathlib import Path

CARPETA = Path(__file__).parent / "dataset"

for _f in (sys.stdout, sys.stderr):
    if hasattr(_f, "reconfigure"):
        _f.reconfigure(encoding="utf-8", errors="replace")

# ── Cómo se traduce cada herramienta ─────────────────────────────────────────
#
# consultar_recaudacion → consultar_metricas
#     La recaudación vive en /api/crm/metricas (ventasMes, serieRecaudado). No
#     hay endpoint dedicado.
#
# consultar_facturacion → consultar_metricas
#     Igual: facturasPendientes e ingresosEsperados salen de ahí. El endpoint de
#     DTE que se había supuesto (/api/dte-consulta/resumen) no existe.
#
#     ⚠️ ESTO TIENE UNA CONSECUENCIA EN LA MEDICIÓN: la distinción entre
#     facturar y cobrar era una categoría del benchmark, y ahora las dos
#     preguntas van a la MISMA herramienta. Se deja de medir en la selección de
#     herramienta y pasa a medirse en la redacción: con las dos cifras en la
#     respuesta, el modelo tiene que citar la correcta.
#
# consultar_cartera → consultar_metricas   (conteos: prospectos, clientesActivos)
#     salvo cuando se busca a alguien concreto → consultar_personas
#
TRADUCCION = {
    "consultar_recaudacion": "consultar_metricas",
    "consultar_facturacion": "consultar_metricas",
    "consultar_cartera": "consultar_metricas",
}

# Parámetros que el backend real no acepta. Se eliminan del caso esperado: pedir
# un filtro que la API ignora sería medir al modelo contra algo imposible.
PARAMETROS_MUERTOS = {
    "solo_vencidos",      # /api/cobros/resumen no filtra por vencimiento
    "solo_vencidas",
    "monto_minimo",       # tampoco por monto
    "empresa",            # el resumen es agregado, no por empresa
    "tipo_documento",     # no hay endpoint de DTE
    "sin_contacto_dias",  # /api/personas no lo soporta
}

# `periodo` en consultar_metricas es una ventana (mes|semana|trimestre|anio),
# no un YYYY-MM. Un mes concreto se pide con desde/hasta.
VENTANAS = {"mes", "semana", "trimestre", "anio"}


def migrar_turno(t: dict, notas: list[str], id_caso: str) -> dict:
    original = t.get("herramienta")
    if original in TRADUCCION:
        t["herramienta"] = TRADUCCION[original]
        notas.append(f"{id_caso}: {original} → {t['herramienta']}")

    params = t.get("parametros")
    if isinstance(params, dict):
        for muerto in list(params):
            if muerto in PARAMETROS_MUERTOS:
                del params[muerto]
                notas.append(f"{id_caso}: se quitó el parámetro {muerto} (la API no lo acepta)")

        # Un YYYY-MM en consultar_metricas no es válido como `periodo`. Se deja
        # sin parámetros: lo que se mide es que elija la herramienta correcta,
        # y exigirle una traducción que el prompt no explica sería injusto.
        p = params.get("periodo")
        if (t.get("herramienta") == "consultar_metricas" and isinstance(p, str)
                and p not in VENTANAS):
            del params["periodo"]
            notas.append(f"{id_caso}: se quitó periodo={p} (metricas usa ventanas, no YYYY-MM)")

        if "responsable" in params and t.get("herramienta") == "consultar_tareas":
            # /api/crm/tareas filtra por ámbito, no por nombre de responsable.
            valor = params.pop("responsable")
            params["ambito"] = "equipo"
            notas.append(f"{id_caso}: responsable={valor} → ambito=equipo")

        if "tipo" in params and t.get("herramienta") == "consultar_metricas":
            valor = params.pop("tipo")
            notas.append(f"{id_caso}: se quitó tipo={valor} (metricas trae ambos conteos)")

    return t


def main() -> None:
    aplicar = "--aplicar" in sys.argv
    notas: list[str] = []
    total = 0

    for archivo in sorted(CARPETA.glob("*.json")):
        datos = json.loads(archivo.read_text(encoding="utf-8"))
        for caso in datos["casos"]:
            total += 1
            if "turnos" in caso:
                for t in caso["turnos"]:
                    migrar_turno(t, notas, caso["id"])
            else:
                migrar_turno(caso, notas, caso["id"])

        if aplicar:
            archivo.write_text(
                json.dumps(datos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )

    print(f"\n{len(notas)} cambios sobre {total} casos\n")
    for n in notas:
        print(f"  {n}")
    print()
    if aplicar:
        print("Aplicado.\n")
    else:
        print("Simulación. Para escribirlo:  python evaluation/migrar_dataset.py --aplicar\n")


if __name__ == "__main__":
    main()
