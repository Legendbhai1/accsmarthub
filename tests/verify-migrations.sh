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
apply s1 "$(mig 0016_saved_listings.sql)" || status=1

# ---------------------------------------------------------------- scenario 2
echo "SCENARIO 2  legacy chain 0001-0012 then 0013"
reset_db s2
apply s2 "$root/tests/bootstrap.sql" || status=1
for f in 0001_core 0002_storage 0003_disputes 0004_payments \
         0005_deposit_settlement 0006_deposit_currency_fix; do
  apply s2 "$(mig "$f.sql")" || status=1
done
# 0007, 0009 and 0012 used to abort part-way on PostgreSQL; commit b055240
# repaired them in place, so the whole chain must now apply cleanly.
for f in 0007_email_and_store_policy 0008_listing_first_publishing \
         0009_buying_to_delivery_lifecycle 0010_admin_users_edge_function \
         0011_dispute_rls_fix 0012_dispute_resolution_consistency; do
  apply s2 "$(mig "$f.sql")" || status=1
done
apply s2 "$(mig 0013_reconcile_marketplace.sql)" || status=1
apply s2 "$(mig 0014_seller_payouts.sql)" || status=1
apply s2 "$(mig 0015_support_request_safety.sql)" || status=1
apply s2 "$(mig 0016_saved_listings.sql)" || status=1

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
apply s1 "$(mig 0016_saved_listings.sql)" || status=1
apply s2 "$(mig 0016_saved_listings.sql)" || status=1

# ---------------------------------------------------------------- scenario 5
# The production shape: a 0001-0006 project that already holds disputes whose
# reason is a UI label, then 0013 applied on top. 0013 used to abort here with
# "check constraint ... is violated by some row". It must now normalise the
# labels, record what it rewrote, and add the constraint.
echo "SCENARIO 5  0001-0006 with legacy dispute reasons, then 0013"
reset_db s5
apply s5 "$root/tests/bootstrap.sql" || status=1
for f in 0001_core 0002_storage 0003_disputes 0004_payments \
         0005_deposit_settlement 0006_deposit_currency_fix; do
  apply s5 "$(mig "$f.sql")" || status=1
done

cat > "$stage/legacy_disputes.sql" <<'SQL'
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'buyer@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'seller@example.com')
on conflict (id) do nothing;
insert into public.listings
  (id, listing_key, seller_id, title, brand, price_usd, stock, status)
values ('eeeeeeee-0000-0000-0000-000000000001', 'legacy-1',
        '22222222-2222-2222-2222-222222222222', 'Legacy Account', 'instagram',
        10, 0, 'active')
on conflict (id) do nothing;
insert into public.orders
  (order_no, listing_id, listing_title, brand, buyer_id, seller_id, quantity,
   unit_price_usd, gross_amount, escrow_fee_usd, total_usd,
   commission_amount, seller_net_amount, status)
select 'LEG-' || g, 'eeeeeeee-0000-0000-0000-000000000001', 'Legacy Account',
       'instagram', '11111111-1111-1111-1111-111111111111',
       '22222222-2222-2222-2222-222222222222', 1, 10, 10, 0.3, 10.3, 1, 9,
       'disputed'
  from generate_series(1, 5) g
on conflict (order_no) do nothing;
-- The exact labels the 0003-era buyer UI posted.
insert into public.disputes (order_no, opened_by, reason, detail) values
  ('LEG-1', '11111111-1111-1111-1111-111111111111', 'Not as described', 'legacy one'),
  ('LEG-2', '11111111-1111-1111-1111-111111111111', 'Transfer failed', 'legacy two'),
  ('LEG-3', '11111111-1111-1111-1111-111111111111', 'Seller unresponsive', 'legacy three'),
  ('LEG-4', '11111111-1111-1111-1111-111111111111', 'Other', 'legacy four'),
  ('LEG-5', '11111111-1111-1111-1111-111111111111', 'not_as_described', 'legacy five');
SQL
apply s5 "$stage/legacy_disputes.sql" || status=1

# Now the migration that used to abort.
apply s5 "$(mig 0013_reconcile_marketplace.sql)" || status=1
apply s5 "$(mig 0014_seller_payouts.sql)" || status=1
apply s5 "$(mig 0015_support_request_safety.sql)" || status=1
apply s5 "$(mig 0016_saved_listings.sql)" || status=1

check s5 "legacy labels were normalised, none left" \
  "select not exists (select 1 from public.disputes where reason not in ('not_as_described','transfer_failed','seller_unresponsive','item_not_received','other'))"
check s5 "the normalisation is recorded" \
  "select count(*) >= 4 from public.dispute_reason_normalizations"
check s5 "the record names the legacy label" \
  "select exists (select 1 from public.dispute_reason_normalizations where legacy_reason = 'Not as described' and canonical_reason = 'not_as_described')"
check s5 "all five disputes survived" \
  "select count(*) = 5 from public.disputes where order_no like 'LEG-%'"
check s5 "the reason constraint is present" \
  "select exists (select 1 from pg_constraint where conname = 'disputes_reason_check' and conrelid = 'public.disputes'::regclass)"
check s5 "the normalisation function is not client-callable" \
  "select not has_function_privilege('authenticated','public.normalize_dispute_reasons()','execute')"

# ---------------------------------------------------------------- scenario 6
# The full chain, from a pristine database, through every hardening
# migration. 0020 adds listing moderation (columns, history, admin edit);
# 0021 closes the trusted-write bypass, the over-broad grants and the missing
# listing DELETE policy; 0022-0027 tighten credential claims, delivery mode,
# client grants, request authorization, wallet adjustment and notify(). A
# fresh apply is the only way to prove the whole series still runs in order —
# and, since two branches independently claimed the number 0020, that the
# renumbered 0027 still applies cleanly on top of the rest.
echo "SCENARIO 6  full chain 0001-0027 on a fresh database"
reset_db s6
apply s6 "$root/tests/bootstrap.sql" || status=1
for f in 0001_core 0002_storage 0003_disputes 0004_payments \
         0005_deposit_settlement 0006_deposit_currency_fix \
         0007_email_and_store_policy 0008_listing_first_publishing \
         0009_buying_to_delivery_lifecycle 0010_admin_users_edge_function \
         0011_dispute_rls_fix 0012_dispute_resolution_consistency \
         0013_reconcile_marketplace 0014_seller_payouts \
         0015_support_request_safety 0016_saved_listings \
         0017_store_applications 0018_cart_checkout_stock_guard \
         0019_wallet_pools_and_withdrawals \
         0020_admin_listing_moderation 0021_security_hardening \
         0022_credential_claim_guard 0023_listing_delivery_mode \
         0024_revoke_client_grants 0025_request_authorization \
         0026_admin_credit_audit 0027_notify_lockdown; do
  apply s6 "$(mig "$f.sql")" || status=1
done

check s6 "listings gained the moderation columns" \
  "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='listings' and column_name='moderation_note') and exists(select 1 from information_schema.columns where table_schema='public' and table_name='listings' and column_name='moderated_by')"
check s6 "listing_reviews history exists" \
  "select to_regclass('public.listing_reviews') is not null"
check s6 "admin_update_listing exists" \
  "select to_regprocedure('public.admin_update_listing(uuid,text,text,text,numeric,boolean,text)') is not null"
check s6 "listing moderation records the moderator and a reason" \
  "select position('moderated_by' in pg_get_functiondef('public.set_listing_status(uuid,text,text)'::regprocedure)) > 0 and position('A rejection reason is required' in pg_get_functiondef('public.set_listing_status(uuid,text,text)'::regprocedure)) > 0"
check s6 "no legacy two-argument set_listing_status survives" \
  "select count(*) = 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='set_listing_status'"
check s6 "sellers can delete their own listing" \
  "select exists(select 1 from pg_policies where schemaname='public' and tablename='listings' and cmd='DELETE')"
check s6 "a client cannot grant itself a trusted write" \
  "select position('current_user not in' in pg_get_functiondef('public.is_trusted_write()'::regprocedure)) > 0"
check s6 "truncate is revoked from client roles" \
  "select not has_table_privilege('authenticated','public.wallets','truncate') and not has_table_privilege('anon','public.wallets','truncate')"
check s6 "notify is no longer client-callable" \
  "select not has_function_privilege('authenticated','public.notify(uuid,text,text,text,text)','execute')"
check s6 "anon can no longer reach the checkout RPC" \
  "select not has_function_privilege('anon','public.checkout(uuid,uuid[],integer,text)','execute')"
check s6 "authenticated can still reach the checkout RPC" \
  "select has_function_privilege('authenticated','public.checkout(uuid,uuid[],integer,text)','execute')"

# ------------------------------------------------------- required objects
echo "SCENARIO 4  required objects present in both scenarios"

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
  check "$db" "saved_listings pins every write to the caller" \
    "select count(*) = 3 from pg_policies where schemaname='public' and tablename='saved_listings' and cmd in ('SELECT','INSERT','DELETE') and coalesce(qual, with_check) like '%auth.uid()%'"
  check "$db" "saved_listings has no update policy" \
    "select not exists(select 1 from pg_policies where schemaname='public' and tablename='saved_listings' and cmd in ('UPDATE','ALL'))"
  check "$db" "resolve_report will not pause the reporter" \
    "select position('v_r.reported_user_id <> v_r.reporter_id' in pg_get_functiondef('public.resolve_report(uuid,text,text)'::regprocedure)) > 0"
done

echo
if [ "$status" -ne 0 ]; then
  echo "RESULT: FAILED"
  exit 1
fi
echo "RESULT: all scenarios passed"
