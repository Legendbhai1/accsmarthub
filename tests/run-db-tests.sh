#!/usr/bin/env bash
# Runs a multi-statement SQL test file against a throwaway local PostgreSQL
# database, in ONE session, so temp tables, SET LOCAL ROLE and ROLLBACK work.
#
#   tests/run-db-tests.sh tests/order_lifecycle.sql
#
# The database is built from tests/bootstrap.sql plus every migration in
# supabase/migrations in order, so the tests always run against the schema the
# repository actually defines.
set -u

DB="${ACCSMART_DB:-accsmarthub_tests}"
PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1 -q)

root="$(cd "$(dirname "$0")/.." && pwd)"

stage="$(mktemp -d /tmp/accsmarthub-sql.XXXXXX)"
chmod 755 "$stage"
trap 'rm -rf "$stage"' EXIT

stage_file() {
  local src="$1" label
  label="$(basename "$src")"
  cp "$src" "$stage/$label"
  chmod 644 "$stage/$label"
  echo "$stage/$label"
}

# Migrations that abort part-way on a real PostgreSQL server. Each one is
# documented in 0013_reconcile_marketplace.sql; 0013 re-establishes the state
# they were meant to leave behind.
KNOWN_BROKEN=""

"${PSQL[@]}" -c "drop database if exists $DB;" >/dev/null 2>&1
"${PSQL[@]}" -c "create database $DB;" >/dev/null

"${PSQL[@]}" -d "$DB" -f "$(stage_file "$root/tests/bootstrap.sql")" >/dev/null

for f in "$root"/supabase/migrations/*.sql; do
  name="$(basename "$f")"
  staged="$(stage_file "$f")"
  if "${PSQL[@]}" -d "$DB" -f "$staged" >/dev/null 2>&1; then
    continue
  fi
  case " $KNOWN_BROKEN " in
    *" $name "*) ;;
    *) echo "migration $name failed to apply; aborting" >&2; exit 2 ;;
  esac
done

# The test file itself runs with ON_ERROR_STOP off so one failing assertion is
# reported rather than aborting the whole suite; the summary at the end is what
# decides the exit code.
test_file="${1:-}"
if [ -z "$test_file" ]; then
  echo "usage: tests/run-db-tests.sh <path.sql>" >&2
  exit 2
fi

out="$(sudo -u postgres psql -d "$DB" -f "$(stage_file "$test_file")" 2>&1)"

echo "$out" | grep -vE '^\s*$' | sed 's/^/  /'

# The final summary block is `total | passed | failed`.
summary="$(echo "$out" | grep -E '^[[:space:]]*[0-9]+[[:space:]]*\|[[:space:]]*[0-9]+[[:space:]]*\|[[:space:]]*[0-9]+' | tail -1)"
if [ -z "$summary" ]; then
  echo "RESULT: FAILED (no summary produced — the test file did not complete)"
  exit 1
fi

failed="$(echo "$summary" | awk -F'|' '{gsub(/ /,"",$3); print $3}')"
total="$(echo "$summary" | awk -F'|' '{gsub(/ /,"",$1); print $1}')"
passed="$(echo "$summary" | awk -F'|' '{gsub(/ /,"",$2); print $2}')"

if [ "$failed" != "0" ]; then
  echo "RESULT: FAILED ($passed/$total passed, $failed failed)"
  exit 1
fi
echo "RESULT: $passed/$total passed"
