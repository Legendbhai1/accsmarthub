#!/usr/bin/env bash
# Applies the AccsMartHub migrations to a throwaway local PostgreSQL database so
# the SQL can be validated without touching the linked Supabase project.
#
#   tests/apply-local.sh [migration ...]
#
# With no arguments it applies tests/bootstrap.sql followed by every migration
# in supabase/migrations in filename order. Pass explicit files to apply only
# those (bootstrap is always applied first).
#
# It intentionally fails loudly: a migration that does not apply to a real
# PostgreSQL server is a migration that will not apply to Supabase.
set -u

DB="${ACCSMART_DB:-accsmarthub_ci}"
PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1 -q)

root="$(cd "$(dirname "$0")/.." && pwd)"

# The postgres OS user cannot read the workspace, so stage every file we apply
# in a world-readable scratch directory.
stage="$(mktemp -d /tmp/accsmarthub-sql.XXXXXX)"
chmod 755 "$stage"
trap 'rm -rf "$stage"' EXIT

"${PSQL[@]}" -c "drop database if exists $DB;" >/dev/null 2>&1
"${PSQL[@]}" -c "create database $DB;" >/dev/null

run() {
  local file="$1"
  local label staged
  label="$(basename "$file")"
  staged="$stage/$label"
  cp "$file" "$staged"
  chmod 644 "$staged"
  if out=$("${PSQL[@]}" -d "$DB" -f "$staged" 2>&1); then
    echo "  ok   $label"
  else
    echo "  FAIL $label"
    echo "$out" | sed 's/^/       /'
    return 1
  fi
}

status=0
run "$root/tests/bootstrap.sql" || status=1

if [ "$#" -gt 0 ]; then
  files=("$@")
else
  files=("$root"/supabase/migrations/*.sql)
fi

for f in "${files[@]}"; do
  run "$f" || status=1
done

if [ "$status" -ne 0 ]; then
  echo "RESULT: FAILED"
  exit 1
fi
echo "RESULT: all migrations applied cleanly to $DB"
