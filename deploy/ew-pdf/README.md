# EW PDF sidecar (Docker)

## Purpose

HTTP wrapper (`pdf_service.py`) that generates bulletin PDFs (722e4, multirisk, agency kinds). Used by the Angular app via `/ew-api/` (frontend nginx proxy).

## Build (from dmis-platform only)

```bash
cd dmis-platform
docker build -t emaafa/ew-pdf:local -f deploy/ew-pdf/Dockerfile deploy/ew-pdf
```

No monorepo parent path is required. The runtime tree is **`engine/`** in this folder.

## Contents of `engine/`

| Path | Role |
|------|------|
| `pdf_service.py` | HTTP entry |
| `src/` | Pipeline and builders |
| `assets/` | Logos, icons, geodata for maps |
| `examples/` | Sample JSON for smoke tests |
| `requirements.txt` | Python deps |

Excluded from vendor (not needed at runtime): historical `output/`, sample `documents/` PDFs, tests.

## Refresh from local workspace (optional)

If you still have the full tree outside git:

```bash
# from maafa workspace (optional maintainer machine only)
rsync -a --delete \
  --exclude output/ --exclude documents/ --exclude tests/ --exclude docs/ \
  --exclude __pycache__/ --exclude .streamlit/ \
  extracted/maafa.pmo.go.tz/ew/ \
  dmis-platform/deploy/ew-pdf/engine/
```

Then rebuild the image. Prefer committing the vendored tree so CI and servers do not depend on `extracted/`.

## Smoke (after build)

```bash
docker run --rm -d --name ew-pdf-smoke -p 18600:8600 emaafa/ew-pdf:local
curl -fsS http://127.0.0.1:18600/health
docker stop ew-pdf-smoke
```

Generate smoke is Phase C in `docs/go-live/DOCKER-FIX-PLAN.md`.
