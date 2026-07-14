"""DOCX to PDF conversion using LibreOffice headless mode."""

import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path


def _libreoffice_bin() -> str:
    for name in ("libreoffice", "soffice"):
        path = shutil.which(name)
        if path:
            return path
    raise RuntimeError(
        "LibreOffice is not installed or not on PATH "
        "(need `libreoffice` or `soffice` for DOCX→PDF)."
    )


def convert_docx_to_pdf(docx_path: str, output_dir: str = None) -> str:
    """Convert a .docx file to PDF using LibreOffice headless mode.

    Args:
        docx_path: Path to the .docx file
        output_dir: Directory for the PDF output (defaults to same dir as docx)

    Returns:
        Path to the generated PDF file

    Raises:
        RuntimeError: If LibreOffice conversion fails
        FileNotFoundError: If input file doesn't exist
    """
    docx_path = Path(docx_path)
    if not docx_path.exists():
        raise FileNotFoundError(f"Input file not found: {docx_path}")

    if output_dir is None:
        output_dir = str(docx_path.parent)
    else:
        Path(output_dir).mkdir(parents=True, exist_ok=True)

    lo = _libreoffice_bin()
    # Isolated profile avoids "LibreOffice is already running" / lock failures
    # when multiple generations or a desktop LO session share the default profile.
    profile_dir = tempfile.mkdtemp(prefix="lo-profile-")
    profile_uri = Path(profile_dir).as_uri()
    env = os.environ.copy()
    # Prefer a writable HOME for LO user dirs on headless servers.
    env.setdefault("HOME", tempfile.gettempdir())

    cmd = [
        lo,
        "--headless",
        "--norestore",
        "--nologo",
        "--nodefault",
        "--nolockcheck",
        f"-env:UserInstallation={profile_uri}",
        "--convert-to",
        "pdf:writer_pdf_Export",
        "--outdir",
        output_dir,
        str(docx_path),
    ]

    last_err = ""
    for attempt in range(1, 4):
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=180, env=env
        )
        pdf_name = docx_path.stem + ".pdf"
        pdf_path = Path(output_dir) / pdf_name
        if result.returncode == 0 and pdf_path.exists():
            try:
                shutil.rmtree(profile_dir, ignore_errors=True)
            except Exception:
                pass
            return str(pdf_path)
        last_err = (result.stderr or result.stdout or "").strip() or f"exit {result.returncode}"
        # Brief backoff for transient profile/lock races
        time.sleep(0.6 * attempt)

    try:
        shutil.rmtree(profile_dir, ignore_errors=True)
    except Exception:
        pass
    raise RuntimeError(f"LibreOffice PDF conversion failed:\n{last_err}")
