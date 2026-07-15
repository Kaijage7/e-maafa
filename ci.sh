#!/usr/bin/env bash
# DMIS local regression gate (F25) — runs the SAME checks as .github/workflows/ci.yml, but executable
# right now without git/GitHub (call manually, from a git pre-push hook, or cron).
#
#   ./ci.sh                # full gate: backend build+tests + frontend AOT build
#   ./ci.sh gates          # only the security/RBAC JUnit gates (fast, requires Docker)
#   ./ci.sh audit          # release dependency advisories (networked; no app/services started)
#
# Backend @SpringBootTest gates use a hermetic PostgreSQL 16 Testcontainer. Docker is mandatory for
# this release gate so database-test skips can never be reported as success.
set -euo pipefail
cd "$(dirname "$0")"
JAVA_HOME="${JAVA_HOME:-$HOME/tools/jdk}"; export JAVA_HOME
MVN="${MVN:-$HOME/tools/maven/bin/mvn}"

require_docker() {
  if ! docker info >/dev/null 2>&1; then
    echo "ERROR: Docker is required for the hermetic PostgreSQL integration suite."
    exit 1
  fi
}

run_gates() {
  require_docker
  echo "== backend security/RBAC gates (RbacWriteCoverageTest, SecurityEnforcementTest, F24/F29/F31) =="
  ( cd backend && env RUN_TESTCONTAINERS=true "$MVN" -B -q \
      -Dtest=RbacWriteCoverageTest,SecurityEnforcementTest,PortalUnsubscribeConfirmationTest,ApprovalWorkflowRoleVocabTest \
      -Dsurefire.failIfNoSpecifiedTests=false test )
}

run_dependency_audit() {
  echo "== backend: OWASP Dependency-Check (release scope, fail at CVSS 7+) =="
  ( cd backend && "$MVN" -B org.owasp:dependency-check-maven:12.2.2:check \
      '-DnvdDatafeedUrl=https://dependency-check.github.io/DependencyCheck_Builder/nvd_cache/nvdcve-{0}.json.gz' \
      -DfailBuildOnCVSS=7 -Dformat=JSON -DskipTestScope=true )
  echo "== frontend: npm advisory audit (production + development dependencies) =="
  ( cd frontend && npm audit --audit-level=low )
}

case "${1:-all}" in
  gates) run_gates ;;
  audit) run_dependency_audit ;;
  all)
    require_docker
    echo "== backend: full build + test suite =="
    ( cd backend && env RUN_TESTCONTAINERS=true "$MVN" -B verify )
    echo "== frontend: AOT production build (fails on template/type errors) =="
    ( cd frontend && npm ci && npx ng build --configuration production )
    ;;
  *) echo "usage: ./ci.sh [all|gates|audit]"; exit 2 ;;
esac
echo "✅ CI gate passed"
