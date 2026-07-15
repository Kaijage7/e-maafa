#!/usr/bin/env python3
"""Create, scope-check, advance, audit and clean one controlled incident per DDMC-195 council."""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import csv
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen
from uuid import uuid4


LOCAL_PASSWORD = "Password@2026"
NEXT_STAGE = {
    "waiting_ddmc": "waiting_ded",
    "waiting_ded": "waiting_rdmc",
    "waiting_rdmc": "waiting_ras",
    "waiting_ras": "waiting_eocc",
    "waiting_eocc": "waiting_director",
    "waiting_director": "waiting_ps",
    "waiting_ps": "approved",
}
STAGE_ROLE = {
    "waiting_ddmc": "Dist DC",
    "waiting_ded": "DED",
    "waiting_rdmc": "Reg DC",
    "waiting_ras": "RAS",
    "waiting_eocc": "EOCC",
    "waiting_director": "Director",
    "waiting_ps": "Secretary",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:18080/api")
    parser.add_argument("--ddmc-input", type=Path, default=Path("test-data/local/DMIS_LOCAL_DDMC_195.csv"))
    parser.add_argument("--persona-input", type=Path, default=Path("test-data/local/DMIS_LOCAL_ALL_INCIDENT_PERSONAS.csv"))
    parser.add_argument("--output-dir", type=Path, default=Path("test-data/local"))
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--timeout", type=float, default=40.0)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--db-host", default=os.getenv("DB_HOST", "127.0.0.1"))
    parser.add_argument("--db-port", default=os.getenv("DMIS_DB_PUBLISH_PORT", "5440"))
    parser.add_argument("--db-name", default=os.getenv("DB_NAME", "dmis"))
    parser.add_argument("--db-user", default=os.getenv("DB_USERNAME", "dmis_app"))
    return parser.parse_args()


def http_json(base_url: str, path: str, *, token: str | None = None, json_body: dict | None = None,
              form_body: dict | None = None, timeout: float) -> tuple[int, dict]:
    headers = {"Accept": "application/json"}
    data = None
    method = "GET"
    if json_body is not None:
        data = json.dumps(json_body).encode()
        headers["Content-Type"] = "application/json"
        method = "POST"
    elif form_body is not None:
        data = urlencode(form_body).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
        method = "POST"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = Request(base_url + path, data=data, headers=headers, method=method)
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


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def choose_account(personas: list[dict[str, str]], role: str, coverage: dict[str, str]) -> dict[str, str] | None:
    candidates = [row for row in personas if row["Role"] == role]
    if role in {"DED", "District Commissioner"}:
        exact = [row for row in candidates if row["Council ID"] == coverage["Council ID"]]
        if exact:
            return sorted(exact, key=lambda row: ("council:" not in row["Position key"], row["Email"]))[0]
        district = [
            row for row in candidates
            if row["District ID"] == coverage["District ID"] and not row["Council ID"]
        ]
        return sorted(district, key=lambda row: ("district:" not in row["Position key"], row["Email"]))[0] if district else None
    if role in {"Reg DC", "RAS"}:
        region = [
            row for row in candidates
            if row["Region ID"] == coverage["Region ID"] and not row["District ID"] and not row["Council ID"]
        ]
        return sorted(region, key=lambda row: ("region:" not in row["Position key"], row["Email"]))[0] if region else None
    if role in {"EOCC", "Director", "Secretary"}:
        national = [row for row in candidates if not row["Region ID"] and not row["District ID"] and not row["Council ID"]]
        return sorted(national, key=lambda row: row["Email"])[0] if national else None
    return None


def prepare_accounts(ddmc_rows: list[dict[str, str]], personas: list[dict[str, str]],
                     foreign_rows: list[dict[str, str]] | None = None) -> tuple[dict[str, dict[str, str]], list[str]]:
    by_test: dict[str, dict[str, str]] = {}
    issues: list[str] = []
    foreign_pool = foreign_rows or ddmc_rows
    for coverage in ddmc_rows:
        accounts: dict[str, str] = {"Dist DC": coverage["Email"]}
        for role in {"DED", "District Commissioner", "Reg DC", "RAS", "EOCC", "Director", "Secretary"}:
            account = choose_account(personas, role, coverage)
            if account:
                accounts[role] = account["Email"]
            elif role != "Reg DC" or coverage["Country part"] != "zanzibar":
                issues.append(f"test {coverage['Test #']} {coverage['Council/LGA']}: no {role} account")
        foreign = next(row for row in foreign_pool if row["Council ID"] != coverage["Council ID"])
        accounts["Foreign Dist DC"] = foreign["Email"]
        by_test[coverage["Test #"]] = accounts
    return by_test, issues


def login_accounts(base_url: str, emails: set[str], timeout: float, workers: int) -> tuple[dict[str, str], list[str]]:
    tokens: dict[str, str] = {}
    issues: list[str] = []
    lock = threading.Lock()

    def login(email: str) -> None:
        try:
            status, body = http_json(
                base_url, "/v1/auth/login", json_body={"email": email, "password": LOCAL_PASSWORD}, timeout=timeout
            )
            if status != 200 or body.get("status") != "OK" or not body.get("token"):
                issue = f"login {email}: HTTP {status}, status={body.get('status')}"
                with lock:
                    issues.append(issue)
                return
            with lock:
                tokens[email] = body["token"]
        except (URLError, TimeoutError, OSError, json.JSONDecodeError) as error:
            with lock:
                issues.append(f"login {email}: {type(error).__name__}: {error}")

    with ThreadPoolExecutor(max_workers=min(workers, 8)) as pool:
        list(pool.map(login, sorted(emails)))
    return tokens, issues


def detail(body: dict) -> str:
    return str(body.get("detail") or body.get("message") or body.get("error") or body.get("errors") or "no detail")


def run_workflow(base_url: str, coverage: dict[str, str], accounts: dict[str, str], tokens: dict[str, str],
                 marker: str, timeout: float) -> dict:
    started = time.perf_counter()
    result = {
        "test_number": coverage["Test #"], "country_part": coverage["Country part"],
        "region": coverage["Region"], "district": coverage["District"], "council": coverage["Council/LGA"],
        "ddmc_email": coverage["Email"], "incident_id": None, "create_status": None,
        "own_show_status": None, "foreign_show_status": None, "submit_stage": None,
        "adviser_approve_status": None, "stage_transitions": [], "final_stage": None,
        "auto_skipped_stages": [], "history_count": None, "issues": [], "latency_ms": None,
    }
    try:
        missing_tokens = sorted(email for email in accounts.values() if email not in tokens)
        if missing_tokens:
            result["issues"].append("missing login token(s): " + ", ".join(missing_tokens))
            return result
        title = f"{marker}-{int(coverage['Test #']):03d}"
        form = {
            "title": title,
            "hazard_id": "1",
            "incident_type_id": "1",
            "location_description": f"Controlled local DDMC workflow test: {coverage['Council/LGA']}",
            "reported_at": datetime.now().strftime("%Y-%m-%dT%H:%M"),
            "severity_level": "Minor",
            "status": "Reported",
            "source_of_report": "Field Officer Report",
            "origin_level": "district",
            "region_id": coverage["Region ID"],
            "district_id": coverage["District ID"],
            "council_id": coverage["Council ID"],
            "description": "Automated controlled local test; safe to delete by marker.",
        }
        status, body = http_json(
            base_url, "/v1/response/incidents", token=tokens[accounts["Dist DC"]],
            form_body=form, timeout=timeout,
        )
        result["create_status"] = status
        if status != 200 or not body.get("success") or not body.get("id"):
            result["issues"].append(f"create failed: HTTP {status}: {detail(body)}")
            return result
        incident_id = int(body["id"])
        result["incident_id"] = incident_id

        status, shown = http_json(
            base_url, f"/v1/response/incidents/{incident_id}", token=tokens[accounts["Dist DC"]], timeout=timeout
        )
        result["own_show_status"] = status
        incident = shown.get("incident") or {}
        if status != 200:
            result["issues"].append(f"own DDMC cannot view created incident: HTTP {status}: {detail(shown)}")
        else:
            for field, expected in {
                "region_id": int(coverage["Region ID"]),
                "district_id": int(coverage["District ID"]),
                "council_id": int(coverage["Council ID"]),
                "workflow_status": "draft",
            }.items():
                if incident.get(field) != expected:
                    result["issues"].append(f"created incident {field}={incident.get(field)!r}, expected {expected!r}")

        status, foreign = http_json(
            base_url, f"/v1/response/incidents/{incident_id}",
            token=tokens[accounts["Foreign Dist DC"]], timeout=timeout,
        )
        result["foreign_show_status"] = status
        if status != 404:
            result["issues"].append(f"foreign DDMC show returned HTTP {status}, expected 404")

        status, submitted = http_json(
            base_url, f"/v1/response/incidents/{incident_id}/submit",
            token=tokens[accounts["Dist DC"]], json_body={"comments": f"{marker} submit"}, timeout=timeout,
        )
        if status != 200:
            result["issues"].append(f"submit failed: HTTP {status}: {detail(submitted)}")
            return result
        stage = submitted.get("workflow_status")
        result["submit_stage"] = stage
        if stage != "waiting_ddmc":
            result["issues"].append(f"submit landed at {stage!r}, expected 'waiting_ddmc' (DDMC gate was bypassed)")

        visited: set[str] = set()
        for _ in range(8):
            if stage == "approved":
                break
            if stage in visited:
                result["issues"].append(f"workflow loop detected at {stage}")
                break
            visited.add(str(stage))
            role = STAGE_ROLE.get(str(stage))
            if role is None:
                result["issues"].append(f"unexpected non-terminal stage {stage!r}")
                break
            actor_email = accounts.get(role)
            if not actor_email or actor_email not in tokens:
                result["issues"].append(f"no usable {role} actor for stage {stage}")
                break

            if stage == "waiting_ded" and accounts.get("District Commissioner") in tokens:
                denied_status, denied = http_json(
                    base_url, f"/v1/response/incidents/{incident_id}/approve",
                    token=tokens[accounts["District Commissioner"]],
                    json_body={"comments": f"{marker} forbidden adviser approval"}, timeout=timeout,
                )
                result["adviser_approve_status"] = denied_status
                if denied_status != 403:
                    result["issues"].append(f"District Commissioner approve returned HTTP {denied_status}, expected 403")

            action_status, action = http_json(
                base_url, f"/v1/response/incidents/{incident_id}/approve", token=tokens[actor_email],
                json_body={"comments": f"{marker} {role} approval", "recommendation": "controlled local test"},
                timeout=timeout,
            )
            expected_next = NEXT_STAGE[str(stage)]
            actual_next = action.get("workflow_status")
            result["stage_transitions"].append({
                "from": stage, "role": role, "email": actor_email, "http_status": action_status,
                "expected_to": expected_next, "actual_to": actual_next,
            })
            if action_status != 200:
                result["issues"].append(f"{role} approval at {stage} failed: HTTP {action_status}: {detail(action)}")
                break
            if actual_next != expected_next:
                # Zanzibar intentionally has no generated RDMC/Reg DC seats. The approval
                # automation therefore settles DED directly on its staffed RAS stage and logs
                # waiting_rdmc -> waiting_ras as auto_advanced. Accept only that documented,
                # tightly-bounded skip; every other unexpected jump remains a failure.
                allowed_zanzibar_rdmc_skip = (
                    coverage["Country part"] == "zanzibar"
                    and stage == "waiting_ded"
                    and expected_next == "waiting_rdmc"
                    and actual_next == "waiting_ras"
                )
                if allowed_zanzibar_rdmc_skip:
                    result["auto_skipped_stages"].append("waiting_rdmc")
                else:
                    result["issues"].append(
                        f"{role} approval {stage} -> {actual_next!r}, expected {expected_next!r}"
                    )
                    stage = actual_next
                    break
            stage = actual_next

        result["final_stage"] = stage
        if stage != "approved":
            result["issues"].append(f"workflow ended at {stage!r}, expected 'approved'")
        final_status, final = http_json(
            base_url, f"/v1/response/incidents/{incident_id}", token=tokens[accounts["Dist DC"]], timeout=timeout
        )
        if final_status == 200:
            histories = final.get("workflow_histories") or []
            result["history_count"] = len(histories)
            for skipped in result["auto_skipped_stages"]:
                expected_to = NEXT_STAGE[skipped]
                if not any(
                    history.get("action") == "auto_advanced"
                    and history.get("from_status") == skipped
                    and history.get("to_status") == expected_to
                    for history in histories
                ):
                    result["issues"].append(
                        f"missing auto_advanced history for {skipped} -> {expected_to}"
                    )
            if stage == "approved" and result["history_count"] < 9:
                result["issues"].append(f"workflow history has only {result['history_count']} rows")
        else:
            result["issues"].append(f"final DDMC read failed: HTTP {final_status}: {detail(final)}")
    except (URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError) as error:
        result["issues"].append(f"request/response error: {type(error).__name__}: {error}")
    finally:
        result["latency_ms"] = round((time.perf_counter() - started) * 1000, 1)
    return result


def psql(args: argparse.Namespace, sql: str) -> str:
    env = os.environ.copy()
    env.setdefault("PGPASSWORD", os.getenv("DB_PASSWORD", "dmis_pass"))
    command = [
        "psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-h", args.db_host,
        "-p", str(args.db_port), "-U", args.db_user, "-d", args.db_name, "-c", sql,
    ]
    completed = subprocess.run(command, env=env, text=True, capture_output=True)
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "psql cleanup failed")
    return completed.stdout.strip()


def cleanup(args: argparse.Namespace, marker: str) -> dict:
    safe = marker.replace("'", "''")
    before = psql(args, f"select count(*) from public.incidents where title like '{safe}-%'")
    sql = f"""
        begin;
        create temporary table controlled_incident_ids on commit drop as
            select id from public.incidents where title like '{safe}-%';
        delete from public.email_logs where notification_type = 'incident_workflow'
          and notification_id in (select id from controlled_incident_ids);
        delete from public.sms_logs where notification_type = 'incident_workflow'
          and notification_id in (select id from controlled_incident_ids);
        delete from public.resource_notifications where entity_type = 'incident'
          and entity_id in (select id from controlled_incident_ids);
        delete from public.incidents where id in (select id from controlled_incident_ids);
        commit;
    """
    psql(args, sql)
    after = psql(args, f"select count(*) from public.incidents where title like '{safe}-%'")
    notifications = psql(args, f"select count(*) from public.resource_notifications where entity_type='incident' and title like '%{safe}%'")
    return {"incidents_before": int(before or 0), "incidents_after": int(after or 0), "notifications_after": int(notifications or 0)}


def write_reports(output_dir: Path, marker: str, results: list[dict], preflight: list[str], cleanup_result: dict,
                  started_at: str, duration: float) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "ddmc-195-workflow-results.json"
    csv_path = output_dir / "ddmc-195-workflow-results.csv"
    failures = [result for result in results if result["issues"]]
    json_path.write_text(json.dumps({
        "marker": marker, "started_at": started_at, "duration_seconds": round(duration, 2),
        "total": len(results), "passed": len(results) - len(failures), "failed": len(failures),
        "preflight_issues": preflight, "cleanup": cleanup_result, "results": results,
    }, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    with csv_path.open("w", newline="", encoding="utf-8-sig") as handle:
        fields = [
            "test_number", "country_part", "region", "district", "council", "ddmc_email", "incident_id",
            "create_status", "own_show_status", "foreign_show_status", "submit_stage", "adviser_approve_status",
            "auto_skipped_stages", "final_stage", "history_count", "latency_ms", "result", "issues",
        ]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for result in results:
            writer.writerow({
                **{field: result.get(field) for field in fields if field not in {"result", "issues"}},
                "auto_skipped_stages": ", ".join(result["auto_skipped_stages"]),
                "result": "FAIL" if result["issues"] else "PASS",
                "issues": " | ".join(result["issues"]),
            })
    return json_path, csv_path


def main() -> None:
    args = parse_args()
    if urlparse(args.base_url).hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise SystemExit("Refusing non-loopback target; this harness is local-only")
    if not 1 <= args.workers <= 8:
        raise SystemExit("--workers must be between 1 and 8")
    all_ddmc_rows = read_csv(args.ddmc_input)
    personas = read_csv(args.persona_input)
    if len(all_ddmc_rows) != 195 or len(personas) != 1309:
        raise SystemExit(f"Expected DDMC/persona counts 195/1309, found {len(all_ddmc_rows)}/{len(personas)}")
    ddmc_rows = all_ddmc_rows
    if args.limit is not None:
        if args.limit < 1:
            raise SystemExit("--limit must be positive")
        ddmc_rows = ddmc_rows[:args.limit]

    accounts_by_test, preflight = prepare_accounts(ddmc_rows, personas, all_ddmc_rows)
    all_emails = {email for accounts in accounts_by_test.values() for email in accounts.values()}
    tokens, login_issues = login_accounts(args.base_url, all_emails, args.timeout, args.workers)
    preflight.extend(login_issues)
    print(f"preflight_accounts={len(all_emails)} tokens={len(tokens)} issues={len(preflight)}", flush=True)

    marker = "CODEX-DDMC195-" + datetime.now().strftime("%Y%m%d%H%M%S") + "-" + uuid4().hex[:8].upper()
    started_at = datetime.now(timezone.utc).isoformat()
    started = time.perf_counter()
    results: list[dict] = []
    cleanup_result = {"incidents_before": 0, "incidents_after": -1, "notifications_after": -1}
    try:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = {
                pool.submit(run_workflow, args.base_url, coverage, accounts_by_test[coverage["Test #"]],
                            tokens, marker, args.timeout): coverage
                for coverage in ddmc_rows
            }
            for completed, future in enumerate(as_completed(futures), 1):
                results.append(future.result())
                if completed % 20 == 0 or completed == len(ddmc_rows):
                    failures = sum(1 for result in results if result["issues"])
                    print(f"progress={completed}/{len(ddmc_rows)} failures={failures}", flush=True)
    finally:
        # Give disabled-gateway async tasks time to write their pending audit rows before exact cleanup.
        time.sleep(1.0)
        cleanup_result = cleanup(args, marker)
    results.sort(key=lambda result: int(result["test_number"]))
    duration = time.perf_counter() - started
    json_path, csv_path = write_reports(
        args.output_dir, marker, results, preflight, cleanup_result, started_at, duration
    )
    failures = [result for result in results if result["issues"]]
    print(f"total={len(results)} passed={len(results)-len(failures)} failed={len(failures)} duration_seconds={duration:.2f}")
    print(f"cleanup={json.dumps(cleanup_result, sort_keys=True)}")
    print(f"json_report={json_path}")
    print(f"csv_report={csv_path}")
    for result in failures[:40]:
        print(f"FAIL test={result['test_number']} council={result['council']} issues={' | '.join(result['issues'])}")
    if preflight or failures or cleanup_result.get("incidents_after") != 0 or cleanup_result.get("notifications_after") != 0:
        if preflight:
            for issue in preflight[:40]:
                print(f"PREFLIGHT {issue}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
