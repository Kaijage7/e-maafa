#!/usr/bin/env bash
# DMIS local regression gate (F25) — runs the SAME checks as .github/workflows/ci.yml, but executable
# right now without git/GitHub (call manually, from a git pre-push hook, or cron).
#
#   ./ci.sh                # full gate: backend build+tests + frontend AOT build
#   ./ci.sh gates          # only the security/RBAC JUnit gates (fast, needs dev Postgres on :5440)
#
# Backend @SpringBootTest gates need the dev Postgres (localhost:5440, db=dmis/dmis_app/dmis_pass).
set -euo pipefail
cd "$(dirname "$0")"
JAVA_HOME="${JAVA_HOME:-$HOME/tools/jdk}"; export JAVA_HOME
MVN="${MVN:-$HOME/tools/maven/bin/mvn}"

run_gates() {
  echo "== backend security/RBAC gates (RbacWriteCoverageTest, SecurityEnforcementTest, F24/F29/F31) =="
  ( cd backend && "$MVN" -B -q \
      -Dtest=RbacWriteCoverageTest,SecurityEnforcementTest,PortalUnsubscribeConfirmationTest,ApprovalWorkflowRoleVocabTest \
      -Dsurefire.failIfNoSpecifiedTests=false test )
}

case "${1:-all}" in
  gates) run_gates ;;
  all)
    echo "== backend: full build + test suite =="
    ( cd backend && "$MVN" -B verify )
    echo "== frontend: AOT production build (fails on template/type errors) =="
    ( cd frontend && npm ci && npx ng build --configuration production )
    ;;
  *) echo "usage: ./ci.sh [all|gates]"; exit 2 ;;
esac
echo "✅ CI gate passed"
