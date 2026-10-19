#!/usr/bin/env bash
# Validates supabase/migrations against a real PostgreSQL server in the three
# states a real environment can be in, and checks that 0013 is idempotent.
#
#   1. Fresh Supabase project: 0001-0006 only, then 0013.
#      (The linked project is in this state: 0007-0012 were never applied.)
#   2. Legacy chain: 0001-0012 in order, then 0013. 0007, 0009 and 0012 abort
#      part-way on PostgreSQL, which is exactly why 0013 exists; the chain must
#      still end with a working database.
#   3. Replay: 0013 applied a second time must be a no-op, not an error.
#
# Requires a local PostgreSQL 17 cluster (see tests/apply-local.sh).
set -u

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

# apply <db> <file> [allow-failure]
apply() {
  local db="$1" src="$2" allow="${3:-no}" out label
  label="$(basename "$src")"
  local staged
  staged="$(stage_file "$src")"
  if out=$("${PSQL[@]}" -d "$db" -f "$staged" 2>&1); then
    echo "     ok   $label"
    return 0
  fi
  if [ "$allow" = "allow" ]; then
    echo "     ok   $label (aborted as expected)"
    return 0
  fi
  echo "     FAIL $label"
  echo "$out" | grep -v NOTICE | sed 's/^/          /'
  return 1
}

reset_db() {
  "${PSQL[@]}" -c "drop database if exists $1;" >/dev/null 2>&1
  "${PSQL[@]}" -c "create database $1;" >/dev/null
}

mig() { echo "$root/supabase/migrations/$1"; }

status=0

# ---------------------------------------------------------------- scenario 1
echo "SCENARIO 1  fresh project (0001-0006 + 0013)"
reset_db s1
apply s1 "$root/tests/bootstrap.sql" || status=1
for f in 0001_core 0002_storage 0003_disputes 0004_payments \
         0005_deposit_settlement 0006_deposit_currency_fix; do
  apply s1 "$(mig "$f.sql")" || status=1
done
apply s1 "$(mig 0013_reconcile_marketplace.sql)" || status=1
apply s1 "$(mig 0014_seller_payouts.sql)" || status=1
apply s1 "$(mig 0015_support_request_safety.sql)" || status=1

# ---------------------------------------------------------------- scenario 2
echo "SCENARIO 2  legacy chain 0001-0012 (0007/0009/0012 abort) then 0013"
reset_db s2
apply s2 "$root/tests/bootstrap.sql" || status=1
for f in 0001_core 0002_storage 0003_disputes 0004_payments \
         0005_deposit_settlement 0006_deposit_currency_fix; do
  apply s2 "$(mig "$f.sql")" || status=1
done
for f in 0007_email_and_store_policy 0008_listing_first_publishing \
         0009_buying_to_delivery_lifecycle 0010_admin_users_edge_function \
         0011_dispute_rls_fix 0012_dispute_resolution_consistency; do
  apply s2 "$(mig "$f.sql")" allow || status=1
done
apply s2 "$(mig 0013_reconcile_marketplace.sql)" || status=1
apply s2 "$(mig 0014_seller_payouts.sql)" || status=1
apply s2 "$(mig 0015_support_request_safety.sql)" || status=1

# ---------------------------------------------------------------- scenario 3
echo "SCENARIO 3  0013 replayed (must be idempotent)"
apply s1 "$(mig 0013_reconcile_marketplace.sql)" || status=1
apply s2 "$(mig 0013_reconcile_marketplace.sql)" || status=1
# 0014 and 0015 are written to be re-runnable: a widen-then-add constraint and
# two `create or replace` functions plus a `drop policy if exists`.
apply s1 "$(mig 0014_seller_payouts.sql)" || status=1
apply s1 "$(mig 0015_support_request_safety.sql)" || status=1
apply s2 "$(mig 0014_seller_payouts.sql)" || status=1
apply s2 "$(mig 0015_support_request_safety.sql)" || status=1

# ------------------------------------------------------- required objects
echo "SCENARIO 4  required objects present in both scenarios"
check() {
  local db="$1" label="$2" sql="$3" got
  got=$("${PSQL[@]}" -d "$db" -tA -c "$sql" 2>&1)
  if [ "$got" = "t" ]; then
    echo "     ok   $db $label"
  else
    echo "     FAIL $db $label (got: $got)"
    status=1
  fi
}

for db in s1 s2; do
  check "$db" "orders.delivery_status exists" \
    "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='delivery_status')"
  check "$db" "orders.refunded_amount exists" \
    "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='refunded_amount')"
  check "$db" "disputes.resolution exists" \
    "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='disputes' and column_name='resolution')"
  check "$db" "dispute_messages.author_role exists" \
    "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='dispute_messages' and column_name='author_role')"
  check "$db" "admin_audit has both historical shapes" \
    "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='admin_audit' and column_name='admin_id') and exists(select 1 from information_schema.columns where table_schema='public' and table_name='admin_audit' and column_name='actor_id')"
  check "$db" "order_events exists" \
    "select exists(select 1 from information_schema.tables where table_schema='public' and table_name='order_events')"
  check "$db" "order_refunds exists" \
    "select exists(select 1 from information_schema.tables where table_schema='public' and table_name='order_refunds')"
  check "$db" "resolve_dispute canonical signature" \
    "select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='resolve_dispute' and pg_get_function_identity_arguments(p.oid)='p_dispute_id uuid, p_outcome text, p_note text, p_partial_amount numeric, p_idempotency_key text')"
  check "$db" "add_dispute_message canonical signature" \
    "select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='add_dispute_message' and pg_get_function_identity_arguments(p.oid)='p_dispute_id uuid, p_body text, p_evidence jsonb')"
  check "$db" "no legacy add_dispute_message overload survives" \
    "select count(*) = 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='add_dispute_message'"
  check "$db" "no legacy resolve_dispute overload survives" \
    "select count(*) = 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='resolve_dispute'"
  check "$db" "settle_order_refund is service_role only" \
    "select not has_function_privilege('authenticated','public.settle_order_refund(text,numeric,text,text,uuid,text)','execute') and has_function_privilege('service_role','public.settle_order_refund(text,numeric,text,text,uuid,text)','execute')"
  check "$db" "log_admin_audit is service_role only" \
    "select not has_function_privilege('authenticated','public.log_admin_audit(uuid,text,text,uuid,text,text)','execute')"
  check "$db" "apply_wallet still not client-callable" \
    "select not has_function_privilege('authenticated','public.apply_wallet(uuid,numeric,numeric,text,text,text)','execute')"
  check "$db" "is_trusted_write no longer trusts every non-client role" \
    "select position('current_user not in' in pg_get_functiondef('public.is_trusted_write()'::regprocedure)) = 0"
  check "$db" "dispute-evidence bucket is private" \
    "select exists(select 1 from storage.buckets where id='dispute-evidence' and public = false)"
  check "$db" "admin_audit has no client insert policy" \
    "select not exists(select 1 from pg_policies where schemaname='public' and tablename='admin_audit' and cmd in ('INSERT','ALL'))"
  check "$db" "order_events has no client write policy" \
    "select not exists(select 1 from pg_policies where schemaname='public' and tablename='order_events' and cmd in ('INSERT','UPDATE','DELETE','ALL'))"
  check "$db" "payout_requests has no client write policy" \
    "select not exists(select 1 from pg_policies where schemaname='public' and tablename='payout_requests' and cmd in ('INSERT','UPDATE','DELETE','ALL'))"
  check "$db" "request_payout is client-callable" \
    "select has_function_privilege('authenticated','public.request_payout(numeric,text,text,text)','execute')"
  check "$db" "resolve_payout exists" \
    "select exists(select 1 from pg_proc where proname='resolve_payout')"
  check "$db" "wallet_ledger accepts payout kinds" \
    "select pg_get_constraintdef(oid) like '%payout_hold%' from pg_constraint where conname='wallet_ledger_kind_check'"
  check "$db" "notifications accepts payout kinds" \
    "select pg_get_constraintdef(oid) like '%payout_paid%' from pg_constraint where conname='notifications_kind_check'"
  check "$db" "self-reports are refused by policy" \
    "select pg_get_expr(polqual, polrelid) is null and pg_get_expr(polwithcheck, polrelid) like '%reported_user_id%' from pg_policy where polname='file report'"
  check "$db" "resolve_report will not pause the reporter" \
    "select position('v_r.reported_user_id <> v_r.reporter_id' in pg_get_functiondef('public.resolve_report(uuid,text,text)'::regprocedure)) > 0"
done

echo
if [ "$status" -ne 0 ]; then
  echo "RESULT: FAILED"
  exit 1
fi
echo "RESULT: all scenarios passed"
