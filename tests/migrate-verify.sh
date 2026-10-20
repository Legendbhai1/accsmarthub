#!/usr/bin/env bash
# Everything that has to hold for a migration to be safe to apply, in one
# command:
#
#   tests/migrate-verify.sh
#
#   1. every migration applies cleanly, in order, to a fresh PostgreSQL 17
#   2. the three states a real environment can be in, plus the production
#      shape where 0001-0006 already hold legacy dispute reasons
#   3. 0013 is idempotent and the required objects survive
#   4. the runner stops at the first failure
#   5. the read-only preflight SQL is syntactically valid against a migrated
#      database
#
# Requires a local PostgreSQL 17 cluster (see tests/apply-local.sh).
set -u

root="$(cd "$(dirname "$0")/.." && pwd)"
status=0

run() {
  local label="$1"; shift
  echo "== $label"
  if "$@"; then
    echo "   ok"
  else
    echo "   FAILED"
    status=1
  fi
}

run "all migrations apply to a fresh database" \
  bash "$root/tests/apply-local.sh"

run "the migration scenarios (fresh, legacy, replay, production shape)" \
  bash "$root/tests/verify-migrations.sh"

run "the runner stops at the first failure" \
  bash "$root/tests/migration_runner_stops.sh"

run "dispute reasons normalise and the constraint applies" \
  bash "$root/tests/run-db-tests.sh" "$root/tests/dispute_reason_migration.sql"

run "the UI's dispute payload is accepted by open_dispute" \
  bash "$root/tests/run-db-tests.sh" "$root/tests/dispute_creation_payload.sql"

run "the preflight SQL runs read-only against a migrated database" \
  bash "$root/tests/preflight-smoke.sh"

echo
if [ "$status" -ne 0 ]; then
  echo "RESULT: FAILED"
  exit 1
fi
echo "RESULT: migration readiness verified"
