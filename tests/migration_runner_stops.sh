#!/usr/bin/env bash
# Proves the migration runner stops at the first failure and does not continue
# to a later file.
#
# The bug this locks down: the runner used to apply every migration it was
# given and only report a failure at the end, so 0014-0016 could be applied on
# top of a half-applied 0013. This exercises the stop-on-failure path with
# three real files — a good one, a broken one, and a later one — and asserts
# the later one never ran.
#
#   tests/migration_runner_stops.sh
set -u

DB="${ACCSMART_DB:-accsmarthub_ci}"
PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1 -q)
root="$(cd "$(dirname "$0")/.." && pwd)"
# apply-local.sh reads ACCSMART_DB from the environment; without this it would
# build its own database and the assertions below would inspect the wrong one.
export ACCSMART_DB="$DB"

tmp="$(mktemp -d /tmp/accsmarthub-runner.XXXXXX)"
chmod 755 "$tmp"
trap 'rm -rf "$tmp"' EXIT

printf 'create table if not exists t_good (id int);\n' > "$tmp/0001_good.sql"
printf 'create table oops (id int;\n' > "$tmp/0002_bad.sql"   # deliberate syntax error
printf 'create table if not exists t_later (id int);\n' > "$tmp/0003_later.sql"

fail=0

out="$(bash "$root/tests/apply-local.sh" "$tmp/0001_good.sql" "$tmp/0002_bad.sql" "$tmp/0003_later.sql" 2>&1)"
code=$?

if [ "$code" -eq 0 ]; then
  echo "  FAIL runner exited 0 despite a broken migration"
  fail=1
else
  echo "  ok   runner exited non-zero on the broken migration"
fi

if echo "$out" | grep -q "not attempting anything after 0002_bad.sql"; then
  echo "  ok   runner reported it stopped after 0002_bad.sql"
else
  echo "  FAIL runner did not report where it stopped"
  echo "$out" | sed 's/^/       /'
  fail=1
fi

if echo "$out" | grep -q "0003_later.sql"; then
  # It may be named in the "not attempted" note, but it must not be applied.
  if echo "$out" | grep -qE "^  ok +0003_later.sql"; then
    echo "  FAIL 0003_later.sql was applied after the failure"
    fail=1
  else
    echo "  ok   0003_later.sql was not applied"
  fi
else
  echo "  ok   0003_later.sql was not applied"
fi

# The database itself must show the same thing: the good file applied, the
# later file not.
good="$(sudo -u postgres psql -d "$DB" -tA -c "select to_regclass('public.t_good') is not null" 2>/dev/null)"
later="$(sudo -u postgres psql -d "$DB" -tA -c "select to_regclass('public.t_later') is not null" 2>/dev/null)"

[ "$good" = "t" ] && echo "  ok   the migration before the failure was applied" \
  || { echo "  FAIL the migration before the failure was not applied (got: $good)"; fail=1; }
[ "$later" = "f" ] && echo "  ok   the migration after the failure was not applied" \
  || { echo "  FAIL the migration after the failure was applied (got: $later)"; fail=1; }

sudo -u postgres psql -c "drop database if exists $DB;" >/dev/null 2>&1

if [ "$fail" -ne 0 ]; then
  echo "RESULT: FAILED"
  exit 1
fi
echo "RESULT: runner stops at the first failure"
