#!/usr/bin/env python3
"""Exhaustively authenticate and validate every exported local incident persona.

Safety: the default target must be loopback. Tokens are validated in memory and never written to
disk. Run the isolated backend with the local profile and the login limiter disabled for this batch.
"""

from __future__ import annotations

import argparse
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
import csv
from datetime import datetime, timezone
import json
from pathlib import Path
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


LOCAL_PASSWORD = "Password@2026"
STAGE_OWNERS = {"Dist DC", "DED", "Reg DC", "RAS", "EOCC", "Director", "Secretary"}
ADVISERS = {"DAS", "District Commissioner", "District Planning Officer", "RC", "Regional Planning Officer"}
LOGISTICS = {"District Logistic Officer", "Regional Logistic Officer"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:18080/api")
    parser.add_argument("--input", type=Path, default=Path("test-data/local/DMIS_LOCAL_ALL_INCIDENT_PERSONAS.csv"))
    parser.add_argument("--output-dir", type=Path, default=Path("test-data/local"))
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--timeout", type=float, default=20.0)
    return parser.parse_args()


def request_json(url: str, *, payload: dict | None = None, token: str | None = None, timeout: float = 20.0) -> tuple[int, dict]:
    data = json.dumps(payload).encode() if payload is not None else None
    headers = {"Accept": "application/json"}
    if payload is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = Request(url, data=data, headers=headers, method="POST" if payload is not None else "GET")
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", "replace")
            return response.status, json.loads(raw) if raw else {}
    except HTTPError as error:
        raw = error.read().decode("utf-8", "replace")
        try:
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            body = {"raw": raw[:500]}
        return error.code, body


def decode_claims(token: str) -> dict:
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("JWT does not have three segments")
    payload = parts[1] + "=" * (-len(parts[1]) % 4)
    return json.loads(base64.urlsafe_b64decode(payload).decode("utf-8"))


def doctrine(role: str) -> tuple[set[str], set[str]]:
    required = {"incidents.view"}
    forbidden: set[str] = set()
    if role in STAGE_OWNERS:
        required |= {"incidents.approve", "incidents.comment"}
    elif role in ADVISERS:
        required.add("incidents.comment")
        forbidden.add("incidents.approve")
    elif role in LOGISTICS:
        required |= {
            "resource_allocation.view", "resource_allocation.dispatch", "warehouse_and_stock.view"
        }
        forbidden.add("incidents.approve")
    return required, forbidden


def validate_persona(base_url: str, row: dict[str, str], timeout: float) -> dict:
    started = time.perf_counter()
    result = {
        "test_number": row["Test #"],
        "user_id": row["User ID"],
        "email": row["Email"],
        "expected_role": row["Role"],
        "region": row["Region"],
        "district": row["District"],
        "council": row["Council/LGA"],
        "http_status": None,
        "login_status": None,
        "received_roles": [],
        "permission_count": 0,
        "checks": {},
        "issues": [],
        "latency_ms": None,
    }
    try:
        status, body = request_json(
            f"{base_url}/v1/auth/login",
            payload={"email": row["Email"], "password": LOCAL_PASSWORD},
            timeout=timeout,
        )
        result["http_status"] = status
        result["login_status"] = body.get("status")
        if status != 200:
            result["issues"].append(f"login HTTP {status}: {body.get('message') or body.get('error') or 'no detail'}")
            return result
        if body.get("status") != "OK":
            result["issues"].append(f"login status is {body.get('status')!r}, expected 'OK'")
            return result
        token = body.get("token")
        user = body.get("user") or {}
        if not token:
            result["issues"].append("successful login returned no token")
            return result

        roles = user.get("roles") or []
        permissions = set(user.get("permissions") or [])
        result["received_roles"] = roles
        result["permission_count"] = len(permissions)
        checks = result["checks"]
        checks["email_matches"] = str(user.get("email", "")).lower() == row["Email"].lower()
        checks["role_present"] = row["Role"] in roles
        checks["password_change_clear"] = user.get("mustChangePassword") is False
        checks["totp_not_blocking_local"] = user.get("totpEnabled") is False

        claims = decode_claims(token)
        claim_roles = ((claims.get("realm_access") or {}).get("roles") or [])
        claim_permissions = set(claims.get("permissions") or [])
        checks["jwt_subject_matches"] = str(claims.get("sub")) == str(row["User ID"])
        checks["jwt_email_matches"] = str(claims.get("email", "")).lower() == row["Email"].lower()
        checks["jwt_role_present"] = row["Role"] in claim_roles
        checks["jwt_permissions_match_response"] = claim_permissions == permissions
        checks["jwt_has_positive_lifetime"] = int(claims.get("exp", 0)) > int(claims.get("iat", 0))

        required, forbidden = doctrine(row["Role"])
        missing = sorted(required - permissions)
        unexpected = sorted(forbidden & permissions)
        checks["required_permissions_present"] = not missing
        checks["forbidden_permissions_absent"] = not unexpected
        if missing:
            result["issues"].append("missing required permissions: " + ", ".join(missing))
        if unexpected:
            result["issues"].append("forbidden permissions present: " + ", ".join(unexpected))
        for check, passed in checks.items():
            if not passed and not (check in {"required_permissions_present", "forbidden_permissions_absent"}):
                result["issues"].append(f"check failed: {check}")
    except (URLError, TimeoutError, json.JSONDecodeError, ValueError, OSError) as error:
        result["issues"].append(f"request/response error: {type(error).__name__}: {error}")
    finally:
        result["latency_ms"] = round((time.perf_counter() - started) * 1000, 1)
    return result


def write_reports(output_dir: Path, results: list[dict], started_at: str, duration: float) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "incident-persona-auth-results.json"
    csv_path = output_dir / "incident-persona-auth-results.csv"
    failures = [result for result in results if result["issues"]]
    summary = {
        "started_at": started_at,
        "duration_seconds": round(duration, 2),
        "total": len(results),
        "passed": len(results) - len(failures),
        "failed": len(failures),
        "results": results,
    }
    json_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    with csv_path.open("w", newline="", encoding="utf-8-sig") as handle:
        fields = [
            "test_number", "user_id", "email", "expected_role", "region", "district", "council",
            "http_status", "login_status", "received_roles", "permission_count", "latency_ms", "result", "issues",
        ]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for result in results:
            writer.writerow({
                **{field: result.get(field) for field in fields if field not in {"received_roles", "result", "issues"}},
                "received_roles": " | ".join(result["received_roles"]),
                "result": "FAIL" if result["issues"] else "PASS",
                "issues": " | ".join(result["issues"]),
            })
    return json_path, csv_path


def main() -> None:
    args = parse_args()
    parsed = urlparse(args.base_url)
    if parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise SystemExit("Refusing non-loopback target; this harness is local-only")
    if not 1 <= args.workers <= 16:
        raise SystemExit("--workers must be between 1 and 16")
    health_status, health = request_json(f"{args.base_url}/actuator/health", timeout=args.timeout)
    if health_status != 200 or health.get("status") != "UP":
        raise SystemExit(f"Backend is not healthy: HTTP {health_status} {health}")
    with args.input.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))
    if len(rows) != 1309:
        raise SystemExit(f"Expected 1309 exported incident personas, found {len(rows)}")

    started_at = datetime.now(timezone.utc).isoformat()
    started = time.perf_counter()
    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(validate_persona, args.base_url, row, args.timeout): row for row in rows}
        for completed, future in enumerate(as_completed(futures), 1):
            results.append(future.result())
            if completed % 100 == 0 or completed == len(rows):
                failures = sum(1 for result in results if result["issues"])
                print(f"progress={completed}/{len(rows)} failures={failures}", flush=True)
    results.sort(key=lambda result: int(result["test_number"]))
    duration = time.perf_counter() - started
    json_path, csv_path = write_reports(args.output_dir, results, started_at, duration)
    failures = [result for result in results if result["issues"]]
    print(f"total={len(results)} passed={len(results)-len(failures)} failed={len(failures)} duration_seconds={duration:.2f}")
    print(f"json_report={json_path}")
    print(f"csv_report={csv_path}")
    if failures:
        by_issue: dict[str, int] = {}
        for result in failures:
            for issue in result["issues"]:
                by_issue[issue] = by_issue.get(issue, 0) + 1
        for issue, count in sorted(by_issue.items(), key=lambda item: (-item[1], item[0]))[:20]:
            print(f"failure_count={count} issue={issue}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
