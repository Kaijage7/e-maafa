"""
EWS PDF microservice — a THIN HTTP wrapper around the existing engine pipeline. The engine is used AS-IS:
this file only imports the public generate_* functions and serves them over HTTP so the native EWS can
generate the exact TMA 722E_4 / PMO Multirisk / agency bulletins automatically. No engine code is modified.

POST /generate/<kind>  body = the entity's bulletin JSON  ->  application/pdf
  kinds: 722e4|tma, multirisk|dmd, mow, gst, moh, moa, nemc
GET  /health
"""
import json
import os
import sys
import tempfile
import traceback
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from src.pipeline import (  # noqa: E402  (engine pipeline, unchanged)
    generate_722e4, generate_multirisk, generate_mow,
    generate_gst, generate_moh, generate_moa, generate_nemc,
)

GEN = {
    "722e4": generate_722e4, "tma": generate_722e4,
    "multirisk": generate_multirisk, "dmd": generate_multirisk,
    "mow": generate_mow, "gst": generate_gst, "moh": generate_moh,
    "moa": generate_moa, "nemc": generate_nemc,
    # Ministry of Livestock & Fisheries flows like MoH (event-based outbreaks) — reuse the MoH builder.
    "mlf": generate_moh,
}


class Handler(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"status": "ok", "kinds": sorted(set(GEN))})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        parts = self.path.strip("/").split("/")
        kind = parts[1].lower() if len(parts) >= 2 and parts[0] == "generate" else ""
        fn = GEN.get(kind)
        if not fn:
            self._json(400, {"error": f"unknown kind '{kind}'", "kinds": sorted(set(GEN))})
            return
        try:
            n = int(self.headers.get("Content-Length", 0) or 0)
            data = json.loads(self.rfile.read(n) or b"{}")
            with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
                json.dump(data, f)
                inp = f.name
            outdir = tempfile.mkdtemp(prefix="ewspdf_")
            result = fn(inp, output_dir=outdir, output_format="pdf")
            pdf = result["pdf"]
            blob = open(pdf, "rb").read()
            self.send_response(200)
            self.send_header("Content-Type", "application/pdf")
            self.send_header("Content-Length", str(len(blob)))
            self.send_header("Content-Disposition", f'inline; filename="{os.path.basename(pdf)}"')
            self.end_headers()
            self.wfile.write(blob)
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            self._json(500, {"error": str(e)})

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    port = int(os.environ.get("EWS_PDF_PORT", "8600"))
    print(f"EWS PDF service on :{port} (engine as-is) — POST /generate/<722e4|multirisk|mow|gst|moh|moa|nemc>")
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()
