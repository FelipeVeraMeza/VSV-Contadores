# =============================================================================
# CATÁLOGO DE HERRAMIENTAS · VSV AI
# -----------------------------------------------------------------------------
# Esto es el CONTRATO que el modelo tiene que entender: qué puede consultar y
# con qué parámetros. No contiene SQL ni lógica de negocio — cada herramienta
# termina llamando a un endpoint de VSV PRO, que es donde viven los permisos.
#
# ⚠️ TODAS LAS RUTAS SE VERIFICARON CONTRA EL BACKEND REAL el 02-09-2026.
# La primera versión de este archivo apuntaba a rutas inventadas —
# /api/cobros/recaudacion, /api/personas/cartera, /api/crm/tareas/resumen— y
# CUATRO DE CINCO herramientas habrían dado 404 en producción. Al agregar o
# cambiar una herramienta hay que llamar al endpoint de verdad y mirar qué
# devuelve, no deducirlo del nombre.
#
# POR QUÉ HERRAMIENTAS Y NO CONSULTAS FIJAS
# Un diseño con N consultas predefinidas mapea FRASES. Este mapea CAPACIDADES:
#
#   "¿Quién me debe?"                    ┐
#   "Muéstrame los morosos"              │
#   "¿Hay alguien atrasado?"             ├─► consultar_deudas({ ... })
#   "¿Qué empresas no han pagado?"       │
#   "¿Quién me debe más de 100 lucas?"   ┘   (esta última con monto_minimo)
#
# La última funciona sin programar nada nuevo, porque el filtro es un parámetro.
#
# REGLA QUE NO SE NEGOCIA: una herramienta devuelve DATOS, nunca texto
# redactado. El modelo redacta. Si una herramienta devolviera frases, el modelo
# las repetiría sin poder compararlas ni combinarlas — y ahí se cae la memoria
# conversacional («¿y julio?», «¿entonces subimos?»).
# =============================================================================
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Parametro:
    tipo: str
    descripcion: str = ""
    formato: str | None = None
    valores: list[str] | None = None

    def describir(self, nombre: str) -> str:
        if self.formato:
            extra = f" ({self.formato})"
        elif self.valores:
            extra = f" ({'|'.join(self.valores)})"
        else:
            extra = ""
        return f"    - {nombre}: {self.tipo}{extra} — {self.descripcion}"


@dataclass(frozen=True)
class Herramienta:
    nombre: str
    descripcion: str
    parametros: dict[str, Parametro]
    endpoint: str
    devuelve: str
    # Notas para quien mantenga esto; no van al modelo.
    nota: str = ""

    def describir(self) -> str:
        params = "\n".join(p.describir(n) for n, p in self.parametros.items()) \
            or "    (ninguno)"
        return f"{self.nombre}\n  {self.descripcion}\n  Parámetros:\n{params}"


HERRAMIENTAS: list[Herramienta] = [
    Herramienta(
        nombre="consultar_deudas",
        # La descripción es lo que el modelo lee para decidir. Se escribe
        # pensando en cómo pregunta la gente, no en cómo se llama la tabla.
        descripcion=(
            "Cobros del despacho a sus clientes: cuánto está pendiente, cuánto "
            "vencido, cuántas facturas hay por emitir. Úsala para preguntas "
            "sobre quién debe, morosos, atrasos o cuentas por cobrar."
        ),
        parametros={
            "periodo": Parametro(
                tipo="string", formato="YYYY-MM",
                descripcion="Mes a consultar. Si no se indica, el mes en curso.",
            ),
        },
        endpoint="GET /api/cobros/resumen",
        devuelve=("{ periodo, total, porEmitir, facturables, pendientePago, "
                  "pagada, pendienteRecibo, vencidos }"),
        # ⚠️ La ruta exige rol Administrador (cobros.routes.js hace
        # `router.use(requireSession, requireAdmin)`), así que a un Consultor le
        # responderá 403. Es correcto: el asistente dirá «no tienes acceso», que
        # es justo lo que mide 04-comportamiento-ante-negativas.json.
        nota="Solo Administrador. Un Consultor recibe 403 y eso es lo esperado.",
    ),
    Herramienta(
        nombre="consultar_metricas",
        descripcion=(
            "Panorama del negocio: cuánto se ha recaudado este mes y en los "
            "últimos seis, cuántos clientes y prospectos hay, cuántas tareas "
            "están pendientes o vencidas, y el estado del embudo comercial. "
            "Úsala para preguntas sobre recaudación, cobros del mes, cartera, "
            "conversión o el estado general."
        ),
        parametros={
            "periodo": Parametro(
                tipo="string", valores=["mes", "semana", "trimestre", "anio"],
                descripcion="Ventana de tiempo. Por omisión, el mes en curso.",
            ),
            "desde": Parametro(tipo="string", formato="YYYY-MM-DD",
                               descripcion="Inicio de un rango a medida."),
            "hasta": Parametro(tipo="string", formato="YYYY-MM-DD",
                               descripcion="Fin del rango a medida."),
        },
        endpoint="GET /api/crm/metricas",
        devuelve=("{ metricas: { ventasMes, tasaConversion, prospectos, "
                  "clientesActivos, facturasPendientes, cobrosVencidos, "
                  "ingresosEsperados, cobradoHoy, tareasPendientes, "
                  "tareasVencidas, tareasCompletadas, vencenHoy, "
                  "serieRecaudado: [{mes, recaudado}], pipeline: [{etapa, n}] } }"),
        # `serieRecaudado` trae los últimos 6 meses, así que «¿y julio?» se
        # responde SIN volver a llamar: el dato ya está en la respuesta.
        #
        # Mide por FECHA DE PAGO, igual que el dashboard del CRM. Esa distinción
        # hizo que el dashboard mostrara 7,5 veces menos de lo real hasta el
        # 01-09-2026 (crm-modulo.md §11.1). Si el asistente usara otro criterio,
        # daría cifras distintas que la pantalla para lo mismo.
        nota="serieRecaudado cubre 6 meses: sirve para comparar sin otra llamada.",
    ),
    Herramienta(
        nombre="consultar_tareas",
        descripcion=(
            "Lista del trabajo pendiente del equipo: tickets y tareas con su "
            "responsable, estado y vencimiento. Úsala cuando pregunten QUÉ "
            "tareas hay o DE QUIÉN son. Para cuántas hay en total, usa "
            "consultar_metricas."
        ),
        parametros={
            "ambito": Parametro(
                tipo="string", valores=["mias", "equipo"],
                descripcion="«mias» es lo que tengo a cargo; «equipo», todo.",
            ),
            "estado": Parametro(
                tipo="string",
                descripcion="Filtra por estado: pendiente, en_progreso, completada.",
            ),
            # "q", no "busqueda": es el nombre que lee el endpoint. Con otro
            # nombre el filtro se ignora en silencio y devuelve TODO —medido el
            # 04-09-2026: 100 tareas en vez de las 29 que coincidían—. El modelo
            # entonces resume sobre datos sin filtrar y responde cualquier cosa.
            "q": Parametro(
                tipo="string",
                descripcion="Texto a buscar en el título de la tarea.",
            ),
        },
        endpoint="GET /api/crm/tareas",
        devuelve="{ tareas: [{ id, titulo, estado, responsable, fecha_limite }], total, hayMas }",
    ),
    Herramienta(
        nombre="consultar_personas",
        descripcion=(
            "Buscar un cliente o prospecto concreto por nombre, y ver su "
            "estado. Úsala cuando pregunten POR ALGUIEN en particular. Para "
            "cuántos clientes o prospectos hay, usa consultar_metricas."
        ),
        parametros={
            # Mismo caso que arriba: con "busqueda" el servidor devolvía las
            # 133 personas en vez de las 118 que coincidían.
            "q": Parametro(
                tipo="string", descripcion="Nombre o parte del nombre a buscar.",
            ),
            "tipo": Parametro(
                tipo="string", valores=["cliente", "prospecto"],
                descripcion="Para acotar a uno de los dos.",
            ),
        },
        endpoint="GET /api/personas",
        devuelve="{ personas: [{ id, nombre, tipo, estado, ultimo_contacto }], total }",
    ),
    # ── Agregadas el 04-09-2026 ──────────────────────────────────────────────
    # Medido: preguntar «¿cuánto le cobro a ELECTROPROYECT?» respondía «no lo
    # encuentro». El problema era que `consultar_personas` busca en /personas,
    # que son PROSPECTOS: las empresas ya dadas de alta viven en otra lista y no
    # había forma de llegar a ellas.
    Herramienta(
        nombre="buscar_empresa",
        descripcion=(
            "Buscar una EMPRESA CLIENTE por su nombre o RUT, y ver su plan, "
            "cuánto se le cobra al mes, si debe algo y cuándo se le facturó por "
            "última vez. Úsala cuando pregunten por un cliente del despacho por "
            "su nombre —«cuánto le cobro a X», «X está al día»—. Para prospectos "
            "que todavía no son clientes, usa consultar_personas."
        ),
        parametros={
            # El nombre TIENE que ser "q": es el que lee el endpoint. Con
            # cualquier otro la URL sale bien formada, el servidor responde 200
            # y devuelve una lista vacía — o sea, falla en silencio y el modelo
            # concluye que la empresa no existe.
            "q": Parametro(
                tipo="string",
                descripcion="Nombre de la empresa o su RUT. Basta una parte del nombre.",
            ),
        },
        endpoint="GET /api/clientes/crm/buscar",
        devuelve="{ empresas: [{ id, razonSocial, rut, activo }] }",
    ),
    Herramienta(
        nombre="consultar_catalogo",
        descripcion=(
            "Ver los PLANES que ofrece el despacho y cuánto cuesta cada uno, "
            "incluidos sus tramos de precio según el nivel de facturación del "
            "cliente, y los servicios disponibles. Úsala cuando pregunten qué "
            "planes hay, cuánto cuesta un plan, o qué servicios se ofrecen."
        ),
        parametros={},
        endpoint="GET /api/clientes/catalogo",
        devuelve=(
            "{ planes: [{ nombre, precioBase, empresas, "
            "tramos: [{ min, max, precioNeto, rrhhGratis }] }], "
            "servicios: [{ nombre, categoria, activo }] }"
        ),
    ),
]

POR_NOMBRE: dict[str, Herramienta] = {h.nombre: h for h in HERRAMIENTAS}
NOMBRES: list[str] = [h.nombre for h in HERRAMIENTAS]


def describir_herramientas() -> str:
    """Lo que se le pasa al modelo. Se arma desde el catálogo para que no puedan
    separarse: si se agrega una herramienta acá, el modelo la ve enseguida."""
    return "\n\n".join(h.describir() for h in HERRAMIENTAS)
