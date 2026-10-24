-- AccsMartHub — tests for 0022_credential_claim_guard.sql
--
-- RUN:
--   tests/run-db-tests.sh tests/credential_claim_guard.sql
--
-- The bug this pins: a checkout decrements `listings.stock` by the full
-- quantity and charges the buyer for the full quantity, but the claim
-- statement is a bounded `update ... limit <quantity>` that silently claims
-- FEWER rows when the credential pool is smaller than the stock counter. The
-- buyer is then charged for units the order can never deliver.
--
-- Three shapes are covered, as requested:
--   1. five buyers racing for one credential unit
--   2. fifty parallel buys against a balance that can only fund some of them
--   3. a cart whose listing has only partial credential stock
-- plus the invariant that a manual-delivery listing (zero credentials) still
-- works, and that no checkout can drive `listings.stock` negative.
--
-- Cases 1 and 2 need a real second connection, so they use dblink and report
-- SKIPPED (not FAIL) when `settlement_test.dsn` is unset — the same convention
-- tests/settlement.sql uses. Run with:
--   ACCSMART_PGOPTIONS="-c settlement_test.dsn=postgresql://postgres@127.0.0.1:5432/accsmarthub_tests" \
--     tests/run-db-tests.sh tests/credential_claim_guard.sql

begin;

-- Needed for the two concurrency cases; harmless when they are skipped.
create extension if not exists dblink;

create table public.test_results (
  ord serial primary key,
  name text,
  passed boolean,
  detail text
);

create or replace function public.test_record(p_name text, p_passed boolean, p_detail text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.test_results(name, passed, detail)
  values (p_name, p_passed, coalesce(p_detail, ''));
end;
$$;

-- SECURITY INVOKER on purpose: observing the caller's own privileges and RLS
-- is the point.
create or replace function public.test_expect(
  p_name text, p_sql text, p_should_raise boolean
) returns void language plpgsql set search_path = public as $$
begin
  begin
    execute p_sql;
    perform public.test_record(p_name, not p_should_raise,
      case when p_should_raise then 'statement unexpectedly succeeded' else '' end);
  exception when others then
    perform public.test_record(p_name, p_should_raise, sqlstate || ': ' || sqlerrm);
  end;
end;
$$;

create or replace function public.test_expect_ok(p_name text, p_sql text)
returns void language sql set search_path = public as $$
  select public.test_expect(p_name, p_sql, false);
$$;

create or replace function public.test_check(p_name text, p_passed boolean, p_detail text)
returns void language sql security definer set search_path = public as $$
  select public.test_record(p_name, p_passed, p_detail);
$$;

create or replace function public.test_skip(p_name text, p_detail text)
returns void language sql security definer set search_path = public as $$
  select public.test_record(p_name, false, 'SKIPPED: ' || p_detail);
$$;

grant all on public.test_results to anon, authenticated, service_role;
grant execute on function public.test_record(text, boolean, text) to anon, authenticated, service_role;
grant execute on function public.test_expect(text, text, boolean) to anon, authenticated, service_role;
grant execute on function public.test_expect_ok(text, text) to anon, authenticated, service_role;
grant execute on function public.test_check(text, boolean, text) to anon, authenticated, service_role;
grant execute on function public.test_skip(text, text) to anon, authenticated, service_role;

-- ----------------------------------------------------------------- fixtures
-- buyer 1111…  seller 2222…  admin 3333…  strangers 4x/5x/6x/7x
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'buyer@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'seller@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'admin@example.com'),
  ('44444444-4444-4444-4444-444444444444', 's1@example.com'),
  ('55555555-5555-5555-5555-555555555555', 's2@example.com'),
  ('66666666-6666-6666-6666-666666666666', 's3@example.com'),
  ('77777777-7777-7777-7777-777777777777', 's4@example.com')
on conflict (id) do nothing;

select set_config('app.trusted_write', 'on', false);
insert into public.profiles (id, email, name, is_admin) values
  ('11111111-1111-1111-1111-111111111111', 'buyer@example.com', 'Buyer', false),
  ('22222222-2222-2222-2222-222222222222', 'seller@example.com', 'Seller', false),
  ('33333333-3333-3333-3333-333333333333', 'admin@example.com', 'Admin', true),
  ('44444444-4444-4444-4444-444444444444', 's1@example.com', 'S1', false),
  ('55555555-5555-5555-5555-555555555555', 's2@example.com', 'S2', false),
  ('66666666-6666-6666-6666-666666666666', 's3@example.com', 'S3', false),
  ('77777777-7777-7777-7777-777777777777', 's4@example.com', 'S4', false)
on conflict (id) do update set is_admin = excluded.is_admin;
select set_config('app.trusted_write', 'off', false);

insert into public.wallets (user_id, spendable_usd) values
  ('11111111-1111-1111-1111-111111111111', 100000),
  ('22222222-2222-2222-2222-222222222222', 0),
  ('33333333-3333-3333-3333-333333333333', 0),
  ('44444444-4444-4444-4444-444444444444', 100000),
  ('55555555-5555-5555-5555-555555555555', 100000),
  ('66666666-6666-6666-6666-666666666666', 100000),
  ('77777777-7777-7777-7777-777777777777', 100000)
on conflict (user_id) do update set spendable_usd = excluded.spendable_usd;

insert into public.stores (id, user_id, store_name, slug, status, contact_policy)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222', 'Seller Store', 'seller-store',
        'approved', true)
on conflict (id) do nothing;

-- A credential-backed listing at $100. `stock` is the counter the checkout
-- decrements; the credential rows are the units it can actually deliver.
-- The two are seeded independently so a mismatch is expressible.
insert into public.listings
  (id, listing_key, seller_id, store_id, title, brand, price_usd, stock, status,
   hidden, delivery_mode)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'key-1',
        '22222222-2222-2222-2222-222222222222',
        'aaaaaaaa-0000-0000-0000-000000000001',
        'Digital Account', 'instagram', 100, 1, 'active', false, 'credential')
on conflict (id) do nothing;

-- A manual-delivery listing: no credential units at all, so a checkout must
-- claim zero and still succeed.
insert into public.listings
  (id, listing_key, seller_id, store_id, title, brand, price_usd, stock, status,
   hidden, delivery_mode)
values ('bbbbbbbb-0000-0000-0000-000000000002', 'key-2',
        '22222222-2222-2222-2222-222222222222',
        'aaaaaaaa-0000-0000-0000-000000000001',
        'Manual Account', 'instagram', 100, 5, 'active', false, 'manual')
on conflict (id) do nothing;

-- Sets the stock counter, the credential pool AND the declared delivery mode
-- independently, so a listing whose counter over-reports its pool -- or whose
-- mode disagrees with its pool -- can be built.
create or replace function public.test_set_stock(
  p_listing uuid, p_stock integer, p_units integer, p_mode text default 'credential'
) returns void language plpgsql security definer set search_path = public as $$
begin
  -- `guard_listing_moderation` pins `stock` for a non-trusted writer, so the
  -- fixture has to declare itself trusted the same way a server function does.
  perform set_config('app.trusted_write', 'on', true);
  update public.listings
     set stock = p_stock, delivery_mode = p_mode
   where id = p_listing;
  delete from public.listing_credentials where listing_id = p_listing;
  insert into public.listing_credentials
    (listing_id, seller_id, unit_key, ciphertext, file_name)
  select p_listing, '22222222-2222-2222-2222-222222222222',
         p_listing::text || '-' || g, '\x00'::bytea, 'u' || g || '.txt'
    from generate_series(1, p_units) g;
end;
$$;

create or replace function public.test_set_balance(p_user uuid, p_amount numeric)
returns void language sql security definer set search_path = public as $$
  update public.wallets set spendable_usd = p_amount where user_id = p_user;
$$;

create or replace function public.test_orders_for(p_listing uuid, p_buyer uuid)
returns integer language sql security definer set search_path = public as $$
  select count(*)::integer from public.orders
   where listing_id = p_listing and buyer_id = p_buyer;
$$;

-- ------------------------------------------------- 1. partial-stock cart (no dblink)
-- A listing whose counter says 5 but whose credential pool holds 2. The old
-- code claimed 2, decremented stock by 5, charged for 5, and returned an
-- order the buyer could never fully receive.
do $$
declare v_listing constant uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  v_order text; v_claimed integer; v_stock integer; v_before numeric;
begin
  perform public.test_set_stock(v_listing, 5, 2);
  perform public.test_set_balance('11111111-1111-1111-1111-111111111111', 100000);
  select spendable_usd into v_before from public.wallets
   where user_id = '11111111-1111-1111-1111-111111111111';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
  perform public.cart_add(v_listing, 5);
  perform public.test_expect('1a a cart cannot claim fewer units than it pays for',
    format($q$select public.checkout(null, array[%L::uuid], null, 'cart-partial-1')$q$, v_listing),
    true);
  reset role;

  -- The raise must roll the whole checkout back: no order, no charge, no stock
  -- movement, no claimed units.
  perform public.test_check('1b the failed checkout created no order',
    public.test_orders_for(v_listing, '11111111-1111-1111-1111-111111111111') = 0, '');
  perform public.test_check('1c the buyer was not charged',
    (select spendable_usd from public.wallets
      where user_id = '11111111-1111-1111-1111-111111111111') = v_before, '');
  perform public.test_check('1d the stock counter was not decremented',
    (select stock from public.listings where id = v_listing) = 5, '');
  perform public.test_check('1e no credential was claimed',
    (select count(*) from public.listing_credentials
      where listing_id = v_listing and claimed_by_order is not null) = 0, '');
end
$$;

-- --------------------------------------------- 2. exact pool still works (no dblink)
-- The guard must not reject a legitimate digital checkout where the pool holds
-- exactly the quantity bought.
do $$
declare v_listing constant uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  v_order text; v_claimed integer;
begin
  perform public.test_set_stock(v_listing, 3, 3);
  perform public.test_set_balance('11111111-1111-1111-1111-111111111111', 100000);

  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
  perform public.cart_add(v_listing, 3);
  v_order := public.checkout(null, array[v_listing], null, 'cart-exact-1');
  reset role;

  perform public.test_check('2a a checkout with an exact credential pool succeeds',
    v_order is not null, coalesce(v_order, 'null'));
  perform public.test_check('2b all three units were claimed',
    (select count(*) from public.listing_credentials
      where listing_id = v_listing and claimed_by_order = v_order) = 3, '');
  perform public.test_check('2c the stock counter reached zero',
    (select stock from public.listings where id = v_listing) = 0, '');
end
$$;

-- ------------------------------- 3. manual-delivery listing (zero pool) still works
-- Zero credentials is legitimate: the seller delivers by hand. The guard must
-- accept 0 and must not require an exact match.
do $$
declare v_listing constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  v_order text;
begin
  perform public.test_set_stock(v_listing, 5, 0, 'manual');
  perform public.test_set_balance('11111111-1111-1111-1111-111111111111', 100000);

  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
  perform public.cart_add(v_listing, 2);
  v_order := public.checkout(null, array[v_listing], null, 'cart-manual-1');
  reset role;

  perform public.test_check('3a a manual-delivery listing (no units) still checks out',
    v_order is not null, coalesce(v_order, 'null'));
  perform public.test_check('3b it claimed nothing, as expected',
    (select count(*) from public.listing_credentials
      where listing_id = v_listing and claimed_by_order is not null) = 0, '');
  perform public.test_check('3c it stays pending delivery for the seller',
    (select delivery_status from public.orders where order_no = v_order) = 'pending', '');
end
$$;

-- ------------------------------------------- 4. Buy Now path (place_order) is covered
-- place_order already had a count-before-claim check; this pins that the
-- post-claim guard does not regress it, and that the buy-now path still works.
do $$
declare v_listing constant uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  v_order text;
begin
  perform public.test_set_stock(v_listing, 2, 2);
  perform public.test_set_balance('11111111-1111-1111-1111-111111111111', 100000);

  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
  perform public.test_expect_ok('4a buy now succeeds with an exact pool',
    format($q$select public.checkout(%L::uuid, null, 2, 'buynow-exact-1')$q$, v_listing));
  reset role;

  perform public.test_check('4b buy now claimed both units',
    (select count(*) from public.listing_credentials
      where listing_id = v_listing and claimed_by_order is not null) = 2, '');
end
$$;

-- --------------------------------- 5. a rejected checkout leaves the cart intact
-- The rollback must not consume the buyer's cart items either, so a retry
-- after the seller restocks is possible.
do $$
declare v_listing constant uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  v_in_cart integer;
begin
  perform public.test_set_stock(v_listing, 4, 1);
  perform public.test_set_balance('11111111-1111-1111-1111-111111111111', 100000);

  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
  perform public.cart_add(v_listing, 4);
  perform public.test_expect('5a the partial-stock checkout is refused',
    format($q$select public.checkout(null, array[%L::uuid], null, 'cart-keep-1')$q$, v_listing),
    true);
  reset role;

  perform public.test_check('5b the cart item survived the rollback',
    (select quantity from public.cart_items
      where user_id = '11111111-1111-1111-1111-111111111111' and listing_id = v_listing) = 4, '');
end
$$;

-- ============================================================ 6. true concurrency
-- Needs a real second backend. Reports SKIPPED when no DSN is configured.
do $$
declare dsn text;
begin
  dsn := current_setting('settlement_test.dsn', true);
  if dsn is null or dsn = '' then
    perform public.test_skip('6a five buyers racing for one unit: exactly one wins',
      'set settlement_test.dsn to run');
    perform public.test_skip('6b fifty parallel buys with a limited balance never oversell',
      'set settlement_test.dsn to run');
    return;
  end if;
end
$$;

-- 6a. Five separate sessions each try to buy the last credential unit of a
-- listing with stock 1 and one unit. Exactly one order may exist afterwards,
-- and the listing's stock must not go negative.
--
-- Every row the racing sessions touch is created THROUGH the dblink
-- connection, not by this transaction. A separate backend cannot see this
-- transaction's uncommitted rows, and would block forever on an uncommitted
-- row it tries to lock (tests/settlement.sql documents the same trap). The
-- racing users are therefore ids this transaction never writes.
do $$
declare dsn text; i integer;
  uids uuid[] := array[
    'c0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000002',
    'c0000000-0000-0000-0000-000000000003',
    'c0000000-0000-0000-0000-000000000004',
    'c0000000-0000-0000-0000-000000000005'];
  v_seller constant uuid := 'c0000000-0000-0000-0000-0000000000ff';
  v_store constant uuid := 'c0000000-0000-0000-0000-0000000000aa';
  v_listing constant uuid := 'c0000000-0000-0000-0000-0000000000bb';
  v_wins integer; v_stock integer; v_claimed integer; v_orders integer;
begin
  dsn := current_setting('settlement_test.dsn', true);
  if dsn is null or dsn = '' then return; end if;

  -- Committed setup on the shared connection.
  perform dblink_exec(dsn, $q$set app.trusted_write = on$q$);
  perform dblink_exec(dsn, format(
    $q$insert into auth.users (id, email)
       select u, 'race1-' || u || '@example.com' from unnest(%L::uuid[]) u
       on conflict (id) do nothing$q$, uids));
  perform dblink_exec(dsn, format(
    $q$insert into auth.users (id, email) values (%L, 'race1-seller@example.com')
       on conflict (id) do nothing$q$, v_seller));
  perform dblink_exec(dsn, format(
    $q$insert into public.profiles (id, email, name)
       select u, 'race1-' || u || '@example.com', 'R1' from unnest(%L::uuid[]) u
       on conflict (id) do nothing$q$, uids));
  perform dblink_exec(dsn, format(
    $q$insert into public.profiles (id, email, name) values (%L, 'race1-seller@example.com', 'RS')
       on conflict (id) do nothing$q$, v_seller));
  perform dblink_exec(dsn, format(
    $q$insert into public.wallets (user_id, spendable_usd)
       select u, 100000 from unnest(%L::uuid[]) u
       on conflict (user_id) do update set spendable_usd = 100000$q$, uids));
  perform dblink_exec(dsn, format(
    $q$insert into public.wallets (user_id, spendable_usd) values (%L, 0)
       on conflict (user_id) do update set spendable_usd = 0$q$, v_seller));
  perform dblink_exec(dsn, format(
    $q$insert into public.stores (id, user_id, store_name, slug, status, contact_policy)
       values (%L, %L, 'Race1 Store', 'race1-store', 'approved', true)
       on conflict (id) do update set status = 'approved'$q$, v_store, v_seller));
  perform dblink_exec(dsn, format(
    $q$insert into public.listings
         (id, listing_key, seller_id, store_id, title, brand, price_usd, stock, status,
          hidden, delivery_mode)
       values (%L, 'race1', %L, %L, 'Race Account', 'instagram', 100, 1, 'active',
               false, 'credential')
       on conflict (id) do update set stock = 1, status = 'active', hidden = false$q$,
    v_listing, v_seller, v_store));
  perform dblink_exec(dsn, format(
    $q$delete from public.listing_credentials where listing_id = %L$q$, v_listing));
  perform dblink_exec(dsn, format(
    $q$insert into public.listing_credentials
         (listing_id, seller_id, unit_key, ciphertext, file_name)
       values (%L, %L, 'race1-1', '\x00'::bytea, 'r.txt')$q$, v_listing, v_seller));

  -- Fire all five, then collect. Each connection runs as its own buyer.
  for i in 1..5 loop
    perform dblink_connect('b' || i, dsn);
    perform dblink_exec('b' || i, $q$set role authenticated$q$);
    perform dblink_exec('b' || i, format(
      $q$set request.jwt.claims = '{"sub":"%s"}'$q$, uids[i]));
    perform dblink_send_query('b' || i, format(
      $q$select public.checkout(%L::uuid, null, 1, 'race-buy-%s')$q$, v_listing, i));
  end loop;

  v_wins := 0;
  for i in 1..5 loop
    begin
      perform 1 from dblink_get_result('b' || i) as t(order_no text);
      v_wins := v_wins + 1;
    exception when others then
      null;  -- this buyer lost the race; the exception is the expected outcome
    end;
    begin
      perform 1 from dblink_get_result('b' || i) as t(order_no text);
    exception when others then null;
    end;
    perform dblink_disconnect('b' || i);
  end loop;

  select stock into v_stock from public.listings where id = v_listing;
  select count(*) into v_claimed from public.listing_credentials
   where listing_id = v_listing and claimed_by_order is not null;
  select count(*) into v_orders from public.orders where listing_id = v_listing;

  perform public.test_check('6a five buyers racing for one unit: exactly one wins',
    v_orders = 1, format('orders=%s (expected 1)', v_orders));
  perform public.test_check('6b the raced listing never went oversold',
    v_stock >= 0 and v_claimed = 1,
    format('stock=%s claimed=%s', v_stock, v_claimed));
end
$$;

-- 6c. Fifty parallel buys against a balance that can only fund some of them.
-- The invariant: no order is created without a matching charge, the wallet
-- never goes negative, stock never goes negative, and the ledger still
-- reconstructs the balance.
do $$
declare dsn text; i integer;
  v_buyer constant uuid := 'c0000000-0000-0000-0000-0000000000ee';
  v_seller constant uuid := 'c0000000-0000-0000-0000-0000000000ff';
  v_store constant uuid := 'c0000000-0000-0000-0000-0000000000aa';
  v_listing constant uuid := 'c0000000-0000-0000-0000-0000000000cc';
  v_orders integer; v_balance numeric; v_stock integer; v_sum_delta numeric;
begin
  dsn := current_setting('settlement_test.dsn', true);
  if dsn is null or dsn = '' then return; end if;

  perform dblink_exec(dsn, $q$set app.trusted_write = on$q$);
  perform dblink_exec(dsn, format(
    $q$insert into auth.users (id, email) values (%L, 'race50@example.com')
       on conflict (id) do nothing$q$, v_buyer));
  perform dblink_exec(dsn, format(
    $q$insert into public.profiles (id, email, name) values (%L, 'race50@example.com', 'R50')
       on conflict (id) do nothing$q$, v_buyer));
  -- $206 funds exactly two orders at $103 each. The other 48 must fail.
  perform dblink_exec(dsn, format(
    $q$insert into public.wallets (user_id, spendable_usd) values (%L, 206)
       on conflict (user_id) do update set spendable_usd = 206$q$, v_buyer));
  perform dblink_exec(dsn, format(
    $q$insert into public.listings
         (id, listing_key, seller_id, store_id, title, brand, price_usd, stock, status,
          hidden, delivery_mode)
       values (%L, 'race50', %L, %L, 'Race50', 'instagram', 100, 50, 'active',
               false, 'credential')
       on conflict (id) do update set stock = 50, status = 'active', hidden = false$q$,
    v_listing, v_seller, v_store));
  perform dblink_exec(dsn, format(
    $q$delete from public.listing_credentials where listing_id = %L$q$, v_listing));
  perform dblink_exec(dsn, format(
    $q$insert into public.listing_credentials
         (listing_id, seller_id, unit_key, ciphertext, file_name)
       select %L, %L, 'race50-' || g, '\x00'::bytea, 'r' || g || '.txt'
         from generate_series(1, 50) g$q$, v_listing, v_seller));

  for i in 1..50 loop
    perform dblink_connect('p' || i, dsn);
    perform dblink_exec('p' || i, $q$set role authenticated$q$);
    perform dblink_exec('p' || i, format(
      $q$set request.jwt.claims = '{"sub":"%s"}'$q$, v_buyer));
    -- place_order requires an idempotency key of at least 8 characters, so
    -- this must be zero-padded; 'par-1' would be rejected for length and the
    -- case would pass without ever exercising the money path.
    perform dblink_send_query('p' || i, format(
      $q$select public.checkout(%L::uuid, null, 1, 'par-%s')$q$, v_listing, lpad(i::text, 4, '0')));
  end loop;

  for i in 1..50 loop
    begin
      perform 1 from dblink_get_result('p' || i) as t(order_no text);
    exception when others then null;
    end;
    begin
      perform 1 from dblink_get_result('p' || i) as t(order_no text);
    exception when others then null;
    end;
    perform dblink_disconnect('p' || i);
  end loop;

  select count(*) into v_orders from public.orders
   where listing_id = v_listing and buyer_id = v_buyer;
  select spendable_usd into v_balance from public.wallets where user_id = v_buyer;
  select stock into v_stock from public.listings where id = v_listing;
  select coalesce(sum(balance_delta), 0) into v_sum_delta from public.wallet_ledger
   where user_id = v_buyer;

  -- $206 buys exactly two orders at $103; three would need $309.
  perform public.test_check('6c fifty parallel buys with $206 buy exactly two',
    v_orders = 2, format('orders=%s (expected 2)', v_orders));
  perform public.test_check('6d the wallet never went negative',
    v_balance >= 0, format('balance=%s', v_balance));
  perform public.test_check('6e the stock never went negative',
    v_stock >= 0, format('stock=%s', v_stock));
  perform public.test_check('6f ledger matches the wallet after the race',
    v_balance = 206 + v_sum_delta,
    format('balance=%s ledger_delta=%s', v_balance, v_sum_delta));
end
$$;

-- ================================================ 7. explicit delivery mode
-- 0023 makes the mode a declared column. These cases pin the two assertions
-- and, above all, the slip-through: a CREDENTIAL listing that claims ZERO
-- units must be refused, not silently delivered as a manual order.
do $$
declare v_listing constant uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
begin
  -- A credential listing whose counter says 3 but whose pool is empty. This is
  -- the drift the mode makes expressible: before 0023 the claim was 0, which
  -- the old `claimed in (0, quantity)` guard accepted as "manual".
  perform public.test_set_stock(v_listing, 3, 0, 'credential');
  perform public.test_set_balance('11111111-1111-1111-1111-111111111111', 100000);

  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
  perform public.cart_add(v_listing, 1);
  perform public.test_expect('7a a credential listing cannot claim zero units',
    format($q$select public.checkout(null, array[%L::uuid], null, 'mode-slip-1')$q$, v_listing),
    true);
  reset role;

  -- Check by idempotency key, not by listing: earlier cases legitimately
  -- created orders on this same listing for this same buyer.
  perform public.test_check('7b the slip-through created no order',
    not exists (select 1 from public.orders
                 where idempotency_key like 'mode-slip-1:%'), '');
  perform public.test_check('7c the slip-through did not decrement stock',
    (select stock from public.listings where id = v_listing) = 3, '');
end
$$;

-- A manual listing must not claim units even if rows happen to exist: the mode
-- is the contract, not the row count.
do $$
declare v_listing constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
begin
  perform public.test_set_stock(v_listing, 5, 2, 'manual');
  perform public.test_set_balance('11111111-1111-1111-1111-111111111111', 100000);

  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
  perform public.cart_add(v_listing, 1);
  perform public.test_expect_ok('7d a manual listing checks out even with stray credential rows',
    format($q$select public.checkout(null, array[%L::uuid], null, 'mode-manual-2')$q$, v_listing));
  reset role;

  perform public.test_check('7e the manual order claimed nothing',
    (select count(*) from public.listing_credentials
      where listing_id = v_listing and claimed_by_order is not null) = 0, '');
end
$$;

-- Buy Now on a manual listing. Before 0023 place_order required
-- `v_free >= quantity`, so every manual listing failed Buy Now with
-- "Not enough accounts in stock". The mode makes the precheck skip manual
-- listings, so this must now succeed.
do $$
declare v_listing constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
begin
  perform public.test_set_stock(v_listing, 5, 0, 'manual');
  perform public.test_set_balance('11111111-1111-1111-1111-111111111111', 100000);

  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
  perform public.test_expect_ok('7f buy now works on a manual listing',
    format($q$select public.checkout(%L::uuid, null, 2, 'mode-buynow-manual')$q$, v_listing));
  reset role;
end
$$;

-- The mode is not writable by a client: guard_listing_moderation pins it.
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
  update public.listings
     set delivery_mode = 'manual'
   where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  reset role;
  perform public.test_check('7g a seller cannot flip the delivery mode',
    (select delivery_mode from public.listings
      where id = 'bbbbbbbb-0000-0000-0000-000000000001') = 'credential', '');
end
$$;

-- ============================================================ SUMMARY
do $$
declare v_total integer; v_passed integer; v_skipped integer;
begin
  select count(*), count(*) filter (where passed),
         count(*) filter (where detail like 'SKIPPED:%')
    into v_total, v_passed, v_skipped
    from public.test_results;
  raise notice 'TESTS: %/% passed, % failed, % skipped',
    v_passed, v_total, v_total - v_passed, v_skipped;
end
$$;

select ord, name, case when passed then 'PASS' else 'FAIL' end as result, detail
  from public.test_results order by ord;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed and detail not like 'SKIPPED:%') as failed,
       count(*) filter (where not passed and detail like 'SKIPPED:%') as skipped
  from public.test_results;

rollback;
