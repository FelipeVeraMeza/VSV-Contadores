# =============================================================================
# VSV AI · imagen para Railway
# -----------------------------------------------------------------------------
# Se usa Dockerfile y no la detección automática porque el repo tiene un
# package.json en la raíz: Railway detectaría Node y desplegaría el backend de
# VSV PRO en vez de este servicio.
#
# La imagen NO contiene el modelo. VSV AI le habla por HTTP a OLLAMA_HOST, que
# apunta a donde haya GPU. Meter el modelo acá daría una imagen de varios GB que
# igual no podría ejecutarlo: Railway no tiene GPU.
# =============================================================================
FROM python:3.12-slim

# PYTHONUNBUFFERED: sin esto los logs se quedan en el búfer y en Railway se ven
# a destiempo o se pierden al reiniciar — justo cuando más se necesitan.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Las dependencias primero, en su propia capa: mientras requirements.txt no
# cambie, un despliegue de código reutiliza la capa y no reinstala nada.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Usuario sin privilegios. Si alguien lograra ejecutar algo dentro del
# contenedor, no lo hace como root.
RUN useradd --create-home --shell /bin/false vsvai && chown -R vsvai:vsvai /app
USER vsvai

EXPOSE 8000

# Railway inyecta $PORT y hay que respetarlo: con un puerto fijo el healthcheck
# nunca responde y el despliegue queda dando vueltas sin decir por qué.
# Se usa `sh -c` para que $PORT se expanda.
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
