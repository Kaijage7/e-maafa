#!/usr/bin/env python3
"""Validate live dashboard and incident-form jurisdiction for every DDMC-195 login."""

from __future__ import annotations

import argparse
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:18080/api")
    parser.add_argument("--input", type=Path, default=Path("test-data/local/DMIS_LOCAL_DDMC_195.csv"))
    parser.add_argument("--output-dir", type=Path, default=Path("test-data/local"))
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--timeout", type=float, default=30.0)
    return parser.parse_args()


def request_json(url: str, *, payload: dict | None = None, token: str | None = None, timeout: float) -> tuple[int, dict]:
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


def validate_scope(base_url: str, row: dict[str, str], timeout: float) -> dict:
    started = time.perf_counter()
    result = {
        "test_number": row["Test #"], "email": row["Email"], "region": row["Region"],
        "district": row["District"], "council": row["Council/LGA"],
        "coverage_source": row["Coverage source"], "dashboard_status": None,
        "form_data_status": None, "assignable_count": None, "my_area": None,
        "checks": {}, "issues": [], "latency_ms": None,
    }
    try:
        login_status, login = request_json(
            f"{base_url}/v1/auth/login",
            payload={"email": row["Email"], "password": LOCAL_PASSWORD},
            timeout=timeout,
        )
        if login_status != 200 or login.get("status") != "OK" or not login.get("token"):
            result["issues"].append(f"login failed: HTTP {login_status}, status={login.get('status')}")
            return result
        token = login["token"]
        dashboard_status, dashboard = request_json(
            f"{base_url}/v1/response/dashboard", token=token, timeout=timeout
        )
        result["dashboard_status"] = dashboard_status
        if dashboard_status != 200:
            result["issues"].append(f"dashboard HTTP {dashboard_status}: {dashboard.get('detail') or dashboard.get('message')}")
            return result
        area = dashboard.get("my_area") or {}
        result["my_area"] = area
        checks = result["checks"]
        checks["district_tier"] = area.get("scope") == "DISTRICT"
        checks["region_matches"] = area.get("region_name") == row["Region"]
        checks["district_matches"] = area.get("district_name") == row["District"]
        if row["Coverage source"] == "council seat":
            checks["council_matches"] = area.get("council_name") == row["Council/LGA"]
        else:
            checks["zanzibar_district_mapping"] = not area.get("council_name")
        checks["statistics_present"] = isinstance(dashboard.get("statistics"), dict)
        for name, passed in checks.items():
            if not passed:
                result["issues"].append(f"dashboard scope check failed: {name}")

        form_status, form = request_json(
            f"{base_url}/v1/response/incidents/form-data", token=token, timeout=timeout
        )
        result["form_data_status"] = form_status
        if form_status != 200:
            result["issues"].append(f"incident form-data HTTP {form_status}: {form.get('detail') or form.get('message')}")
            return result
        assignable = form.get("assignable_users") or []
        result["assignable_count"] = len(assignable)
        own_user_id = int(row["User ID"])
        own_is_assignable = any(int(user.get("id", -1)) == own_user_id for user in assignable)
        result["checks"]["own_user_assignable"] = own_is_assignable
        result["checks"]["form_reference_data_present"] = bool(form.get("hazards")) and bool(form.get("incident_types"))
        if not own_is_assignable:
            result["issues"].append("own DDMC user missing from area-scoped assignable users")
        if not result["checks"]["form_reference_data_present"]:
            result["issues"].append("incident form reference data is empty")
    except (URLError, TimeoutError, json.JSONDecodeError, ValueError, OSError) as error:
        result["issues"].append(f"request/response error: {type(error).__name__}: {error}")
    finally:
        result["latency_ms"] = round((time.perf_counter() - started) * 1000, 1)
    return result


def write_reports(output_dir: Path, results: list[dict], started_at: str, duration: float) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "ddmc-195-scope-results.json"
    csv_path = output_dir / "ddmc-195-scope-results.csv"
    failures = [result for result in results if result["issues"]]
    json_path.write_text(json.dumps({
        "started_at": started_at, "duration_seconds": round(duration, 2), "total": len(results),
        "passed": len(results) - len(failures), "failed": len(failures), "results": results,
    }, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    with csv_path.open("w", newline="", encoding="utf-8-sig") as handle:
        fields = [
            "test_number", "email", "region", "district", "council", "coverage_source",
            "dashboard_status", "form_data_status", "assignable_count", "latency_ms", "result", "issues",
        ]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for result in results:
            writer.writerow({
                **{field: result.get(field) for field in fields if field not in {"result", "issues"}},
                "result": "FAIL" if result["issues"] else "PASS",
                "issues": " | ".join(result["issues"]),
            })
    return json_path, csv_path


def main() -> None:
    args = parse_args()
    if urlparse(args.base_url).hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise SystemExit("Refusing non-loopback target; this harness is local-only")
    if not 1 <= args.workers <= 16:
        raise SystemExit("--workers must be between 1 and 16")
    with args.input.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))
    if len(rows) != 195:
        raise SystemExit(f"Expected 195 DDMC coverage rows, found {len(rows)}")
    started_at = datetime.now(timezone.utc).isoformat()
    started = time.perf_counter()
    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(validate_scope, args.base_url, row, args.timeout): row for row in rows}
        for completed, future in enumerate(as_completed(futures), 1):
            results.append(future.result())
            if completed % 25 == 0 or completed == len(rows):
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
        for result in failures[:30]:
            print(f"FAIL email={result['email']} issues={' | '.join(result['issues'])}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
