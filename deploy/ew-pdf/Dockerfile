# EW bulletin PDF sidecar — buildable from dmis-platform git alone (Phase B / D1).
#
#   cd dmis-platform
#   docker build -t emaafa/ew-pdf:local -f deploy/ew-pdf/Dockerfile deploy/ew-pdf
#
# Prefer prebuilt Python wheels (no long GDAL source compile). Runtime libs only.

FROM python:3.12-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl \
      libexpat1 \
      libgdal32 \
      libgeos-c1v5 \
      libproj25 \
      libspatialindex-c6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /ew

COPY engine/requirements.txt /ew/requirements.txt

# Wheels first — avoids multi-hour gdal/fiona compiles on slim images.
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir --only-binary=:all: \
      "numpy" "pandas" "shapely" "pyproj" "pyogrio" "geopandas" "matplotlib" "Pillow" "PyMuPDF" \
 || pip install --no-cache-dir --only-binary=:all: \
      "numpy" "pandas" "shapely" "pyproj" "fiona" "geopandas" "matplotlib" "Pillow" "PyMuPDF" \
 && pip install --no-cache-dir -r /ew/requirements.txt

COPY engine/ /ew/

ENV EWS_PDF_PORT=8600
EXPOSE 8600

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=5 \
  CMD curl -fsS "http://127.0.0.1:${EWS_PDF_PORT}/health" || exit 1

CMD ["python", "-c", "\
import os; from http.server import HTTPServer; \
import pdf_service as p; \
port=int(os.environ.get('EWS_PDF_PORT','8600')); \
print(f'EWS PDF service on 0.0.0.0:{port}'); \
HTTPServer(('0.0.0.0', port), p.Handler).serve_forever()"]
