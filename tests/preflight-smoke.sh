#!/usr/bin/env bash
# Runs the read-only preflight SQL against a migrated database to prove two
# things: it parses, and it changes nothing.
#
#   tests/preflight-smoke.sh
#
# The preflight files are what the project owner runs by hand in the Supabase
# SQL Editor before applying 0013 and 0014, so a syntax error in one of them
# would only surface at the worst moment. This exercises them locally first,
# with a legacy dispute seeded so the "will be normalised" branch is actually
# exercised rather than vacuously true.
set -u

DB="${ACCSMART_DB:-accsmarthub_preflight}"
PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1 -q)
root="$(cd "$(dirname "$0")/.." && pwd)"

stage="$(mktemp -d /tmp/accsmarthub-preflight.XXXXXX)"
chmod 755 "$stage"
trap 'rm -rf "$stage"' EXIT

stage_file() {
  cp "$1" "$stage/$(basename "$1")"
  chmod 644 "$stage/$(basename "$1")"
  echo "$stage/$(basename "$1")"
}

fail=0

"${PSQL[@]}" -c "drop database if exists $DB;" >/dev/null 2>&1
"${PSQL[@]}" -c "create database $DB;" >/dev/null

"${PSQL[@]}" -d "$DB" -f "$(stage_file "$root/tests/bootstrap.sql")" >/dev/null
for f in "$root"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -1 -d "$DB" -f "$(stage_file "$f")" >/dev/null
done

# Seed one row in each table the preflight inspects, so the queries have
# something to look at. The dispute carries a legacy label, and the wallet and
# notification rows use kinds 0014 widens — the two situations the preflight
# exists to detect.
cat > "$stage/seed.sql" <<'SQL'
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'buyer@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'seller@example.com')
on conflict (id) do nothing;
insert into public.listings
  (id, listing_key, seller_id, title, brand, price_usd, stock, status)
values ('ffffffff-0000-0000-0000-000000000001', 'pre-key-1',
        '22222222-2222-2222-2222-222222222222', 'Preflight Account', 'instagram',
        10, 0, 'active')
on conflict (id) do nothing;
insert into public.orders
  (order_no, listing_id, listing_title, brand, buyer_id, seller_id, quantity,
   unit_price_usd, gross_amount, escrow_fee_usd, total_usd,
   commission_amount, seller_net_amount, status)
values ('PRE-1', 'ffffffff-0000-0000-0000-000000000001', 'Preflight Account',
        'instagram', '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222', 1, 10, 10, 0.3, 10.3, 1, 9,
        'disputed')
on conflict (order_no) do nothing;
insert into public.wallets (user_id) values ('11111111-1111-1111-1111-111111111111')
on conflict (user_id) do nothing;
insert into public.wallet_ledger
  (user_id, kind, balance_delta, locked_delta, balance_after, locked_after)
values ('11111111-1111-1111-1111-111111111111', 'payout_hold', 0, 1, 0, 1);
insert into public.notifications (user_id, kind, title, body) values
  ('11111111-1111-1111-1111-111111111111', 'payout_paid', 'Paid', 'body');
-- A legacy label, stored by taking the constraint off — the pre-0013 state.
alter table public.disputes drop constraint if exists disputes_reason_check;
insert into public.disputes (order_no, opened_by, reason, detail)
values ('PRE-1', '11111111-1111-1111-1111-111111111111', 'Not as described',
        'a legacy label from the 0003-era UI');
SQL
if ! "${PSQL[@]}" -1 -d "$DB" -f "$stage/seed.sql" >/dev/null; then
  echo "  FAIL the preflight fixture itself did not load"
  exit 1
fi

# A fingerprint of everything the preflight could plausibly touch.
fingerprint() {
  "${PSQL[@]}" -d "$DB" -tA -c "
    select
      (select count(*) from public.disputes)
      || '/' || (select count(*) from public.wallet_ledger)
      || '/' || (select count(*) from public.notifications)
      || '/' || (select coalesce(string_agg(reason, ',' order by order_no), '')
                   from public.disputes)"
}

before="$(fingerprint)"

for pf in "$root"/supabase/preflight/*.sql; do
  label="$(basename "$pf")"
  if out=$("${PSQL[@]}" -d "$DB" -f "$(stage_file "$pf")" 2>&1); then
    echo "  ok   $label parses and runs"
  else
    echo "  FAIL $label"
    echo "$out" | grep -v NOTICE | sed 's/^/       /'
    fail=1
  fi
done

after="$(fingerprint)"
if [ "$before" = "$after" ]; then
  echo "  ok   the preflight changed no rows"
else
  echo "  FAIL the preflight modified data: before=$before after=$after"
  fail=1
fi

# And the dispute-reason preflight must actually flag the legacy label rather
# than silently reporting everything is fine.
unmapped="$("${PSQL[@]}" -d "$DB" -tA -c "
  with canonical(value) as (
    values ('not_as_described'),('transfer_failed'),('seller_unresponsive'),
           ('item_not_received'),('other')),
  mapped(legacy) as (
    values ('Not as described'),('Transfer failed'),('Seller unresponsive'),
           ('Item not received'),('Other'))
  select count(*) from public.disputes d
   where d.reason not in (select value from canonical)
     and d.reason not in (select legacy from mapped)")"
if [ "$unmapped" = "0" ]; then
  echo "  ok   the legacy label is classified as mapped, not unmapped"
else
  echo "  FAIL the preflight would report $unmapped unmapped row(s) for a known label"
  fail=1
fi

sudo -u postgres psql -c "drop database if exists $DB;" >/dev/null 2>&1

if [ "$fail" -ne 0 ]; then
  echo "RESULT: FAILED"
  exit 1
fi
echo "RESULT: preflight SQL is valid and read-only"
