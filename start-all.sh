#!/usr/bin/env bash
# DMIS local stack — one command. Forward ONLY port 4200 in VSCode; it proxies the rest.
set -u
ROOT=/home/kaijage/model/maafa
VENV=$ROOT/ew-venv          # PERSISTENT venv (not /tmp, which is wiped)
EW=$ROOT/extracted/maafa.pmo.go.tz/ew
export JAVA_HOME=/home/kaijage/tools/jdk
export PATH="$JAVA_HOME/bin:/home/kaijage/tools/maven/bin:$PATH"

echo "[1/5] Postgres…"; docker start dmis-pg >/dev/null 2>&1 || echo "  (ensure dmis-pg container exists)"

echo "[2/5] Backend :8080…"; fuser -k 8080/tcp >/dev/null 2>&1; sleep 2
# run-secrets.env holds the REAL M-Gov SMS + Gmail SMTP creds — without it the gateways
# report "not configured" and every send is logged as pending. Prefer the stable jar
# (dmis-run.jar) only when it is fresh: faster boot, no mvn, survives `mvn clean` of target/.
# If source or migrations are newer than the jar, run from Maven so crash recovery does not boot stale code.
( cd "$ROOT/dmis-platform/backend" \
  && set -a && [ -f run-secrets.env ] && . ./run-secrets.env; set +a \
  && fresh_jar() { [ -f "$1" ] && [ -z "$(find src/main/java src/main/resources -type f -newer "$1" -print -quit)" ]; } \
  && if fresh_jar dmis-run.jar; then \
       setsid "$JAVA_HOME/bin/java" -Xmx1024m -jar dmis-run.jar --spring.profiles.active=local >/tmp/dmis-backend.log 2>&1 < /dev/null & \
     elif fresh_jar target/dmis-platform-0.1.0.jar; then \
       setsid "$JAVA_HOME/bin/java" -Xmx1024m -jar target/dmis-platform-0.1.0.jar --spring.profiles.active=local >/tmp/dmis-backend.log 2>&1 < /dev/null & \
     else \
       SPRING_PROFILES_ACTIVE=local setsid mvn -q spring-boot:run >/tmp/dmis-backend.log 2>&1 < /dev/null & \
     fi )

# [3/5] RETIRED: the Streamlit authoring engine (:8501) is replaced by the native Angular EW consoles.
#   ( cd "$EW" && DMIS_URL=http://localhost:8080 nohup "$VENV/bin/streamlit" run dashboard.py … )  # removed

echo "[4/5] EW generate service :8600 (kind-routed, localhost-only)…"; fuser -k 8600/tcp >/dev/null 2>&1; sleep 1
( cd "$EW" && EWS_PDF_PORT=8600 setsid "$VENV/bin/python" pdf_service.py >/tmp/ew-genapi.log 2>&1 < /dev/null & )

echo "[5/5] Frontend :4200 (proxies /api + /ew-engine + /ew-api)…"; fuser -k 4200/tcp >/dev/null 2>&1; sleep 2
( cd "$ROOT/dmis-platform/frontend" && setsid npm exec ng serve -- --host 0.0.0.0 --port 4200 --proxy-config proxy.conf.json --poll 2000 >/tmp/dmis-ngserve.log 2>&1 < /dev/null & )

echo "Open http://localhost:4200  (login admin@example.com / admin). Wait ~30s for first compile."
