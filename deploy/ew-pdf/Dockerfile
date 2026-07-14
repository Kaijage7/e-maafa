# EW bulletin PDF sidecar — thin HTTP wrapper around the engine under extracted/…/ew.
# Build from monorepo root (maafa), not from dmis-platform alone:
#   docker build -f dmis-platform/deploy/ew-pdf/Dockerfile -t emaafa/ew-pdf:local .
#
# Binds to 0.0.0.0 inside the container network only; publish to host only if needed.

FROM python:3.12-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      gdal-bin libgdal-dev \
      libgeos-dev \
      curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /ew

# Engine tree (pipeline + builders). Keep path stable with local start-all.sh layout.
COPY extracted/maafa.pmo.go.tz/ew/requirements.txt /ew/requirements.txt
RUN pip install --no-cache-dir -r /ew/requirements.txt

COPY extracted/maafa.pmo.go.tz/ew/ /ew/

ENV EWS_PDF_PORT=8600
EXPOSE 8600

# Health: GET /health
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${EWS_PDF_PORT}/health" || exit 1

# Listen on all interfaces inside the container network (not host-public by default).
CMD ["python", "-c", "\
import os; from http.server import HTTPServer; \
import pdf_service as p; \
port=int(os.environ.get('EWS_PDF_PORT','8600')); \
print(f'EWS PDF service on 0.0.0.0:{port}'); \
HTTPServer(('0.0.0.0', port), p.Handler).serve_forever()"]
