# =====================================================================
# ACHICAR LOS DATOS ANTES DE MANDÁRSELOS AL MODELO
# ---------------------------------------------------------------------
# EL PROBLEMA, MEDIDO EL 04-09-2026
# La mitad de las preguntas fallaban con «el asistente no está respondiendo».
# El log del servicio decía la verdad:
#
#   Groq 413: Request too large. Limit 7000 tokens, Requested 93719
#
# El orquestador hacía `json.dumps(resultado.datos)` y se lo pasaba entero al
# modelo. Preguntar «¿qué tareas tengo?» mandaba las 487 tareas completas —con
# descripción, fechas, colaboradores y adjuntos— para que el modelo redactara
# una frase. Trece veces por encima del límite.
#
# No es un problema de plan ni de modelo: es mandar un camión de datos para
# responder una pregunta de dos líneas. Aunque el límite fuera diez veces mayor,
# seguiría siendo lento y caro.
#
# QUÉ HACE ESTE MÓDULO
# Recorta la respuesta ANTES de que llegue al modelo:
#
#   · Las listas largas se cortan y se dice cuántas quedaron fuera. El modelo no
#     necesita las 487 tareas para decir «tienes 487, estas son las más
#     urgentes».
#   · De cada elemento se dejan los campos que sirven para responder, no todos.
#     Una tarea necesita título, estado, prioridad y fecha; no su descripción de
#     dos párrafos ni la lista de quién la comentó.
#   · Los totales y conteos NUNCA se tocan: son justamente lo que se pregunta.
#
# POR QUÉ SE DICE CUÁNTAS FALTAN
# Si se recortara en silencio, el modelo diría «tienes 10 tareas» mirando una
# lista de 10 que en realidad son 487. Mentiría sin saberlo. Por eso el recorte
# viaja explícito: «(mostrando 5 de 487)».
# =====================================================================
from __future__ import annotations

import json
from typing import Any

# Cuántos elementos de una lista se le muestran al modelo. Cinco alcanza para
# que pueda dar ejemplos concretos —«las más urgentes son estas»— y más allá
# solo suma tokens sin cambiar la respuesta: el total real viaja aparte.
TOPE_LISTA = 5

# Tope duro del texto que se manda, en caracteres.
#
# El cálculo, medido el 04-09-2026 contra el límite real de Groq (7.000 tokens
# por minuto en el plan gratuito):
#
#   prompt de sistema + herramientas .... ~2.900 tokens  (v2, más guía)
#   la pregunta y el historial .......... ~  300 tokens
#   margen de seguridad ................. ~  800 tokens
#   ------------------------------------------------
#   queda para los datos ................ ~3.000 tokens
#
# Un carácter en español pesa ~0.4 tokens (más que en inglés por las tildes y
# porque los nombres propios se parten en varias piezas). 4.500 caracteres son
# entonces ~1.800 tokens, y el total queda con holgura bajo el límite.
#
# Se llegó a estos números por medición, no por estimación: con 12.000
# caracteres la petición pedía 7.083 tokens y Groq la rechazaba por 83. Al
# crecer el prompt a v2 se bajó de 6.000 a 4.500 para mantener el margen.
TOPE_CARACTERES = 4_500

# Campos que NO aportan para redactar una respuesta y sí pesan mucho. Se quitan
# de cada elemento de una lista; en el nivel de arriba no se toca nada.
RUIDO = {
    "descripcion", "observaciones", "cuerpo", "html", "detalle", "nota",
    "logo", "logo_url", "adjuntos", "comentarios", "colaboradores",
    "created_at", "updated_at", "createdAt", "updatedAt",
    "organizacion_id", "organizacionId", "empresa_id", "usuario_id",
    "rut_encrypted", "email_encrypted", "rut_hash", "email_hash",
}


def _limpiar_elemento(item: Any) -> Any:
    """Deja de un elemento solo lo que sirve para responder."""
    if not isinstance(item, dict):
        return item
    limpio = {}
    for k, v in item.items():
        if k in RUIDO:
            continue
        # Un texto larguísimo dentro de un elemento pesa tanto como diez
        # elementos completos. Se corta y se dice que está cortado.
        if isinstance(v, str) and len(v) > 120:
            limpio[k] = v[:120] + "…"
        elif isinstance(v, (dict, list)):
            # Un nivel más abajo no se necesita para redactar: se resume a
            # cuántos elementos tiene, que a veces sí es la respuesta.
            limpio[k] = f"({len(v)} elementos)" if isinstance(v, list) else "(objeto)"
        else:
            limpio[k] = v
    return limpio


def _recortar(valor: Any) -> Any:
    """Recorta listas largas dejando dicho cuántas quedaron fuera."""
    if isinstance(valor, list):
        total = len(valor)
        if total <= TOPE_LISTA:
            return [_limpiar_elemento(x) for x in valor]
        # El recorte VIAJA EXPLÍCITO: sin esto el modelo contaría los que ve
        # y diría que son cinco, cuando son 487.
        return {
            "_total": total,
            "_mostrando": TOPE_LISTA,
            "_nota": f"Se muestran {TOPE_LISTA} de {total}. Al responder, usa el total real ({total}).",
            "elementos": [_limpiar_elemento(x) for x in valor[:TOPE_LISTA]],
        }
    if isinstance(valor, dict):
        return {k: _recortar(v) for k, v in valor.items()}
    return valor


def resumir_para_modelo(datos: Any) -> str:
    """
    Convierte el resultado de una herramienta en un texto que quepa en el
    contexto del modelo. Devuelve JSON, que es lo que el modelo lee mejor.
    """
    recortado = _recortar(datos)
    texto = json.dumps(recortado, ensure_ascii=False, default=str)

    # Red de seguridad: si aun así quedó enorme —un solo objeto con cincuenta
    # campos de texto, por ejemplo— se corta duro. Es preferible una respuesta
    # con datos incompletos, y dicho, que un error de «no puedo responder».
    if len(texto) > TOPE_CARACTERES:
        texto = texto[:TOPE_CARACTERES] + (
            '…"}\n\n[DATOS RECORTADOS: la respuesta era demasiado grande. '
            "Responde con lo que hay y advierte que puede faltar información.]"
        )
    return texto
