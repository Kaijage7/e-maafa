#!/usr/bin/env bash
# Build and tag immutable release images for e-MAAFA (preferred over building on the production host).
#
# Usage:
#   ./scripts/docker-release.sh                 # tag = git short SHA
#   ./scripts/docker-release.sh 2026.07.14      # explicit tag
#   REGISTRY=registry.example.gov ./scripts/docker-release.sh 2026.07.14
#   PUSH=1 ./scripts/docker-release.sh 2026.07.14
#
# Does NOT deploy. Does NOT claim go-live. Push + server pull is a separate ops step.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAG="${1:-$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d)}"
REGISTRY="${REGISTRY:-}"
PREFIX="${IMAGE_PREFIX:-emaafa}"
PUSH="${PUSH:-0}"

if [[ ! -f "${ROOT}/deploy/ew-pdf/engine/pdf_service.py" ]]; then
  echo "Missing vendored EW engine at deploy/ew-pdf/engine/ (Phase B / D1)." >&2
  echo "See deploy/ew-pdf/README.md" >&2
  exit 1
fi

name() {
  local short="$1"
  if [[ -n "$REGISTRY" ]]; then
    echo "${REGISTRY%/}/${PREFIX}/${short}:${TAG}"
  else
    echo "${PREFIX}/${short}:${TAG}"
  fi
}

BACKEND_IMG="$(name dmis-backend)"
FRONTEND_IMG="$(name dmis-frontend)"
PDF_IMG="$(name ew-pdf)"

echo "Building release tag: ${TAG}"
echo "  backend  -> ${BACKEND_IMG}"
echo "  frontend -> ${FRONTEND_IMG}"
echo "  ew-pdf   -> ${PDF_IMG}"
echo

docker build -t "${BACKEND_IMG}" -f "${ROOT}/backend/Dockerfile" "${ROOT}/backend"
docker build -t "${FRONTEND_IMG}" -f "${ROOT}/frontend/Dockerfile" "${ROOT}/frontend"
# PDF: context is deploy/ew-pdf (in-repo engine/). No monorepo parent required.
docker build -t "${PDF_IMG}" -f "${ROOT}/deploy/ew-pdf/Dockerfile" "${ROOT}/deploy/ew-pdf"

# Also tag :local for compose default when testing images without prod overlay
docker tag "${BACKEND_IMG}" "${PREFIX}/dmis-backend:local"
docker tag "${FRONTEND_IMG}" "${PREFIX}/dmis-frontend:local"
docker tag "${PDF_IMG}" "${PREFIX}/ew-pdf:local"

if [[ "$PUSH" == "1" ]]; then
  if [[ -z "$REGISTRY" ]]; then
    echo "PUSH=1 requires REGISTRY=... (e.g. registry.example.gov)" >&2
    exit 1
  fi
  docker push "${BACKEND_IMG}"
  docker push "${FRONTEND_IMG}"
  docker push "${PDF_IMG}"
  echo "Pushed three images for tag ${TAG}"
else
  echo
  echo "Images built locally. To push:"
  echo "  REGISTRY=your.registry PUSH=1 $0 ${TAG}"
  echo
  echo "On the production host (after pull), example env:"
  echo "  export DMIS_IMAGE_BACKEND=${BACKEND_IMG}"
  echo "  export DMIS_IMAGE_FRONTEND=${FRONTEND_IMG}"
  echo "  export DMIS_IMAGE_EW_PDF=${PDF_IMG}"
  echo "  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d"
fi
