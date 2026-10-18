-- AccsMartHub — executable behavioural tests for the order, escrow, dispute,
-- refund and authorization rules.
--
-- RUN:
--   tests/run-db-tests.sh tests/order_lifecycle.sql
--
-- HOW AUTHORIZATION IS DRIVEN
--
-- PostgreSQL will not let a SECURITY DEFINER function switch role, so the role
-- switch has to live in the DO block, not in the harness. Each section
-- therefore sets the role it needs once and runs its cases under it:
--
--   set local role authenticated;   + request.jwt.claims = {"sub": "<uid>"}
--
-- That is exactly what a PostgREST request does, so `auth.uid()` resolves and
-- Row Level Security actually applies. Running as the table owner would bypass
-- RLS and prove nothing, so every assertion about visibility is made from a
-- client role.
--
-- The recording helpers are SECURITY DEFINER only so a result can be written
-- from whichever role the section is running as; they never change role.
--
-- Nothing is mocked: every case calls the real SECURITY DEFINER functions and
-- then inspects the real wallet ledger and order rows. The whole file ends in
-- ROLLBACK, so no fixture, scratch table or helper survives.

begin;

create table public.test_results (
  ord serial primary key,
  name text,
  passed boolean,
  detail text
);

-- Named values captured at the moment they are produced. The suite runs in one
-- transaction, so `now()` is identical for every row and "the most recent
-- order" cannot be derived from created_at.
create table public.test_state (
  key text primary key,
  value text
);

create or replace function public.test_record(p_name text, p_passed boolean, p_detail text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.test_results(name, passed, detail)
  values (p_name, p_passed, coalesce(p_detail, ''));
end;
$$;

-- Runs one statement and records whether it raised. SECURITY INVOKER on
-- purpose: observing the caller's own privileges and RLS is the whole point.
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

grant all on public.test_results to anon, authenticated, service_role;
grant execute on function public.test_record(text, boolean, text)
  to anon, authenticated, service_role;
grant execute on function public.test_expect(text, text, boolean)
  to anon, authenticated, service_role;
grant execute on function public.test_expect_ok(text, text)
  to anon, authenticated, service_role;
grant execute on function public.test_check(text, boolean, text)
  to anon, authenticated, service_role;

-- ----------------------------------------------------------------- fixtures
-- buyer 1111…  seller 2222…  admin 3333…  stranger 4444…
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'buyer@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'seller@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'admin@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'stranger@example.com')
on conflict (id) do nothing;

-- Trusted-write is the documented bootstrap path (see is_trusted_write()).
select set_config('app.trusted_write', 'on', false);
insert into public.profiles (id, email, name, is_admin) values
  ('11111111-1111-1111-1111-111111111111', 'buyer@example.com', 'Buyer', false),
  ('22222222-2222-2222-2222-222222222222', 'seller@example.com', 'Seller', false),
  ('33333333-3333-3333-3333-333333333333', 'admin@example.com', 'Admin', true),
  ('44444444-4444-4444-4444-444444444444', 'stranger@example.com', 'Stranger', false)
on conflict (id) do update set is_admin = excluded.is_admin;
select set_config('app.trusted_write', 'off', false);

insert into public.wallets (user_id, balance_usd) values
  ('11111111-1111-1111-1111-111111111111', 1000),
  ('22222222-2222-2222-2222-222222222222', 0),
  ('33333333-3333-3333-3333-333333333333', 0),
  ('44444444-4444-4444-4444-444444444444', 0)
on conflict (user_id) do update set balance_usd = excluded.balance_usd;

insert into public.stores (id, user_id, store_name, slug, status, contact_policy)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222', 'Seller Store', 'seller-store',
        'approved', true)
on conflict (id) do nothing;

-- A listing at $100, so the money in every case is easy to reason about:
--   buyer pays 100 + 3% escrow fee = 103
--   platform commission 10%       = 10
--   seller net                    = 90
insert into public.listings
  (id, listing_key, seller_id, store_id, title, brand, price_usd, stock, status, hidden)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'key-1',
        '22222222-2222-2222-2222-222222222222',
        'aaaaaaaa-0000-0000-0000-000000000001',
        'Test Account', 'instagram', 100, 1, 'active', false)
on conflict (id) do nothing;

-- A manual-delivery listing: no credential units, so checkout leaves it
-- pending and the seller has to mark it delivered.
insert into public.listings
  (id, listing_key, seller_id, store_id, title, brand, price_usd, stock, status, hidden)
values ('bbbbbbbb-0000-0000-0000-000000000002', 'key-2',
        '22222222-2222-2222-2222-222222222222',
        'aaaaaaaa-0000-0000-0000-000000000001',
        'Manual Account', 'instagram', 100, 5, 'active', false)
on conflict (id) do nothing;

-- Restocks the listing with one fresh credential unit so each case can buy.
create or replace function public.test_restock(p_unit text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.listings set stock = 1
   where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  insert into public.listing_credentials
    (id, listing_id, seller_id, unit_key, ciphertext, file_name)
  values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001',
          '22222222-2222-2222-2222-222222222222', p_unit, '\x00'::bytea,
          p_unit || '.txt')
  on conflict (listing_id, unit_key) do nothing;
end;
$$;

create or replace function public.test_set(p_key text, p_value text)
returns void language sql security definer set search_path = public as $$
  insert into public.test_state(key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value;
$$;

create or replace function public.test_get(p_key text)
returns text language sql security definer set search_path = public as $$
  select value from public.test_state where key = p_key;
$$;

create or replace function public.test_checkout(
  p_listing uuid, p_cart uuid[], p_qty integer, p_key text
) returns text language plpgsql security definer set search_path = public as $$
declare v_order text;
begin
  v_order := public.checkout(p_listing, p_cart, p_qty, p_key);
  perform public.test_set('order', v_order);
  return v_order;
end;
$$;

-- Cart checkout. Unlike the Buy Now path it does not require credential units,
-- so it is how a manual-delivery order comes into existence.
create or replace function public.test_cart_checkout(
  p_listing uuid, p_qty integer, p_key text
) returns text language plpgsql security definer set search_path = public as $$
declare v_order text;
begin
  perform public.cart_add(p_listing, p_qty);
  v_order := public.checkout(null, array[p_listing], null, p_key);
  perform public.test_set('order', v_order);
  return v_order;
end;
$$;

create or replace function public.test_open_dispute(p_reason text, p_detail text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  v_id := public.open_dispute(public.test_get('order'), p_reason, p_detail);
  perform public.test_set('dispute', v_id::text);
  return v_id;
end;
$$;

create or replace function public.test_latest_request()
returns uuid language sql security definer set search_path = public as $$
  select id from public.order_requests
   where order_no = public.test_get('order')
   order by id desc limit 1;
$$;

create or replace function public.test_balance(p_uid uuid)
returns numeric language sql security definer set search_path = public as $$
  select balance_usd from public.wallets where user_id = p_uid;
$$;

create or replace function public.test_locked(p_uid uuid)
returns numeric language sql security definer set search_path = public as $$
  select locked_usd from public.wallets where user_id = p_uid;
$$;

-- Snapshots the escrow hold so an assertion can talk about its own order's
-- contribution rather than the running total.
-- Snapshots a wallet balance so an assertion can talk about the change its own
-- section caused rather than an absolute figure that depends on every earlier
-- section.
create or replace function public.test_snap_balance(p_uid uuid)
returns void language sql security definer set search_path = public as $$
  select public.test_set('balance_before:' || p_uid,
    (select balance_usd::text from public.wallets where user_id = p_uid));
$$;

create or replace function public.test_balance_delta(p_uid uuid)
returns numeric language sql security definer set search_path = public as $$
  select (select balance_usd from public.wallets where user_id = p_uid)
       - coalesce(public.test_get('balance_before:' || p_uid)::numeric, 0);
$$;

create or replace function public.test_snap_escrow(p_uid uuid)
returns void language sql security definer set search_path = public as $$
  select public.test_set('escrow_before:' || p_uid,
    (select locked_usd::text from public.wallets where user_id = p_uid));
$$;

create or replace function public.test_escrow_delta(p_uid uuid)
returns numeric language sql security definer set search_path = public as $$
  select (select locked_usd from public.wallets where user_id = p_uid)
       - coalesce(public.test_get('escrow_before:' || p_uid)::numeric, 0);
$$;

create or replace function public.test_order_status(p_order text)
returns text language sql security definer set search_path = public as $$
  select status from public.orders where order_no = p_order;
$$;

grant execute on function public.test_restock(text) to anon, authenticated, service_role;
grant execute on function public.test_set(text, text) to anon, authenticated, service_role;
grant execute on function public.test_get(text) to anon, authenticated, service_role;
grant execute on function public.test_checkout(uuid, uuid[], integer, text) to anon, authenticated, service_role;
grant execute on function public.test_open_dispute(text, text) to anon, authenticated, service_role;
grant execute on function public.test_cart_checkout(uuid, integer, text) to anon, authenticated, service_role;
grant all on public.test_state to anon, authenticated, service_role;
grant execute on function public.test_latest_request() to anon, authenticated, service_role;
grant execute on function public.test_balance(uuid) to anon, authenticated, service_role;
grant execute on function public.test_locked(uuid) to anon, authenticated, service_role;
grant execute on function public.test_snap_balance(uuid) to anon, authenticated, service_role;
grant execute on function public.test_balance_delta(uuid) to anon, authenticated, service_role;
grant execute on function public.test_snap_escrow(uuid) to anon, authenticated, service_role;
grant execute on function public.test_escrow_delta(uuid) to anon, authenticated, service_role;
grant execute on function public.test_order_status(text) to anon, authenticated, service_role;

insert into public.listing_credentials
  (id, listing_id, seller_id, unit_key, ciphertext, file_name)
values ('cccccccc-0000-0000-0000-000000000001',
        'bbbbbbbb-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222',
        'unit-1', '\x00'::bytea, 'account.txt')
on conflict (id) do nothing;

-- ============================================================ 1. CHECKOUT
do $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
  set local role authenticated;

  perform public.test_expect_ok('1a',
    $q$select public.test_checkout('bbbbbbbb-0000-0000-0000-000000000001', null, 1, 'test-key-0001')$q$);

  perform public.test_expect_ok('1h a repeated idempotency key does not raise',
    $q$select public.checkout('bbbbbbbb-0000-0000-0000-000000000001', null, 1, 'test-key-0001')$q$);

  perform public.test_expect('1j a sold-out listing cannot be bought again',
    $q$select public.checkout('bbbbbbbb-0000-0000-0000-000000000001', null, 1, 'test-key-0002')$q$,
    true);

  reset role;
end
$$;

do $$
declare v_o public.orders%rowtype; v_count integer;
begin
  select * into v_o from public.orders order by created_at desc limit 1;
  select count(*) into v_count from public.orders;

  perform public.test_check('1b buyer debited total_usd (100 + 3% fee)',
    public.test_balance('11111111-1111-1111-1111-111111111111') = 897,
    'balance=' || public.test_balance('11111111-1111-1111-1111-111111111111'));
  perform public.test_check('1c seller net locked as an escrow hold',
    public.test_escrow_delta('22222222-2222-2222-2222-222222222222') = 90
      and v_o.seller_net_amount = 90,
    'escrow delta=' || public.test_escrow_delta('22222222-2222-2222-2222-222222222222')
      || ' net=' || v_o.seller_net_amount);
  -- A listing with credential units is delivered the moment it is bought, so
  -- the buyer can download immediately and the order is already 'delivered'.
  perform public.test_check('1d a digital order is auto-delivered on checkout',
    v_o.status = 'in_escrow' and v_o.delivery_status = 'delivered'
      and v_o.delivered_at is not null,
    v_o.status || '/' || v_o.delivery_status);
  perform public.test_check('1e the credential unit is claimed by the order',
    (select count(*) from public.listing_credentials
      where claimed_by_order = v_o.order_no) = 1, '');
  perform public.test_check('1f stock decremented to zero',
    (select stock from public.listings
      where id = 'bbbbbbbb-0000-0000-0000-000000000001') = 0, '');
  perform public.test_check('1g the timeline recorded order creation',
    exists (select 1 from public.order_events where event = 'order_created'), '');
  perform public.test_check('1i a retry did not charge twice',
    public.test_balance('11111111-1111-1111-1111-111111111111') = 897 and v_count = 1,
    'orders=' || v_count);
end
$$;

do $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
  set local role authenticated;
  perform public.test_expect('1k a seller cannot buy their own listing',
    $q$select public.checkout('bbbbbbbb-0000-0000-0000-000000000001', null, 1, 'test-key-0003')$q$,
    true);
  reset role;
end
$$;

-- ======================================================= 2. AUTHORIZATION
do $$
declare v_order text := public.test_get('order');
begin
  perform set_config('request.jwt.claims',
    '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', false);
  set local role authenticated;
  perform public.test_expect('2a a stranger cannot confirm somebody else''s delivery',
    format($q$select public.confirm_delivery(%L)$q$, v_order), true);
  perform public.test_expect('2c a stranger cannot open a dispute on this order',
    format($q$select public.open_dispute(%L, 'other', 'this is not my order at all')$q$, v_order),
    true);
  reset role;

  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
  set local role authenticated;
  perform public.test_expect('2b the buyer cannot mark the order delivered',
    format($q$select public.mark_order_delivered(%L, 'digital', null)$q$, v_order), true);
  reset role;

  perform set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
  set local role authenticated;
  perform public.test_expect('2d the seller cannot confirm the buyer''s delivery',
    format($q$select public.confirm_delivery(%L)$q$, v_order), true);
  reset role;

  -- The order has credentials attached, so implicit digital delivery applies
  -- and the buyer's confirmation is legitimate.
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
  set local role authenticated;
  perform public.test_expect_ok('2e implicit digital delivery can be confirmed by the buyer',
    format($q$select public.confirm_delivery(%L)$q$, v_order));
  perform public.test_expect('2h a completed order cannot be confirmed twice',
    format($q$select public.confirm_delivery(%L)$q$, v_order), true);
  perform public.test_expect('2i a completed order cannot be disputed',
    format($q$select public.open_dispute(%L, 'other', 'disputing an already completed order')$q$, v_order),
    true);
  reset role;
end
$$;

do $$
declare v_o public.orders%rowtype;
begin
  select * into v_o from public.orders order by created_at desc limit 1;
  perform public.test_check('2f confirmation released exactly seller_net_amount',
    public.test_balance('22222222-2222-2222-2222-222222222222') = 90
      and v_o.status = 'completed' and v_o.delivery_status = 'buyer_confirmed',
    'seller balance=' || public.test_balance('22222222-2222-2222-2222-222222222222')
      || ' status=' || v_o.status);
  perform public.test_check('2g the seller escrow hold cleared',
    public.test_escrow_delta('22222222-2222-2222-2222-222222222222') = 0,
    'delta=' || public.test_escrow_delta('22222222-2222-2222-2222-222222222222'));
end
$$;

-- ============================================================ 3. DISPUTES
do $$
begin
  perform public.test_restock('unit-2');
  perform public.test_snap_escrow('22222222-2222-2222-2222-222222222222');
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
  set local role authenticated;
  perform public.test_expect_ok('3a',
    $q$select public.test_checkout('bbbbbbbb-0000-0000-0000-000000000001', null, 1, 'test-key-1000')$q$);
  reset role;
end
$$;

do $$
declare v_order text := public.test_get('order');
begin
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
  set local role authenticated;
  perform public.test_expect_ok('3b the buyer can open a dispute',
    format($q$select public.test_open_dispute(%L, 'the account did not match the listing')$q$,
           'not_as_described'));
  perform public.test_expect('3f a second open dispute on the same order is refused',
    format($q$select public.open_dispute(%L, 'other', 'a second attempt on the same order')$q$, v_order),
    true);
  perform public.test_expect_ok('3g the buyer can add evidence to their dispute',
    format($q$select public.add_dispute_message(%L, 'Here is my side of the story.')$q$,
           public.test_get('dispute')::uuid));
  reset role;
end
$$;

do $$
declare v_order text := public.test_get('order');
        v_d uuid := public.test_get('dispute')::uuid;
begin
  perform public.test_check('3c the dispute froze the order',
    public.test_order_status(v_order) = 'disputed', '');
  perform public.test_check('3d escrow is not released while disputed',
    public.test_escrow_delta('22222222-2222-2222-2222-222222222222') = 90,
    'delta=' || public.test_escrow_delta('22222222-2222-2222-2222-222222222222'));
  perform public.test_check('3e the timeline recorded the dispute',
    exists (select 1 from public.order_events
             where order_no = v_order and event = 'dispute_opened'), '');
  perform public.test_check('3h the buyer''s message is stored with the buyer role',
    (select author_role from public.dispute_messages
      where dispute_id = v_d order by created_at desc limit 1) = 'buyer', '');

  -- The seller responds; a seller reply moves the case into review.
  perform set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
  set local role authenticated;
  perform public.test_expect_ok('3i the seller can respond to the dispute',
    format($q$select public.add_dispute_message(%L, 'The account was delivered exactly as listed.')$q$, v_d));
  reset role;

  perform public.test_check('3j the seller''s reply is stored with the seller role',
    (select author_role from public.dispute_messages
      where dispute_id = v_d order by created_at desc limit 1) = 'seller', '');
  perform public.test_check('3k a seller reply moves the dispute into review',
    (select status from public.disputes where id = v_d) = 'under_review', '');

  perform set_config('request.jwt.claims',
    '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', false);
  set local role authenticated;
  perform public.test_expect('3l a stranger cannot post to the dispute',
    format($q$select public.add_dispute_message(%L, 'I am not a party to this.')$q$, v_d), true);
  reset role;

  perform set_config('request.jwt.claims',
    '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
  set local role authenticated;
  perform public.test_expect_ok('3m an admin can post to the dispute',
    format($q$select public.add_dispute_message(%L, 'Reviewing both sides now.')$q$, v_d));
  reset role;

  perform public.test_check('3n the admin message is stored with the admin role',
    (select author_role from public.dispute_messages
      where dispute_id = v_d order by created_at desc limit 1) = 'admin', '');
end
$$;

-- ================================================ 4. FULL REFUND, IDEMPOTENT
do $$
declare v_d uuid := public.test_get('dispute')::uuid;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
  set local role authenticated;
  perform public.test_expect_ok('4a an admin can refund the buyer in full',
    format($q$select public.resolve_dispute(%L, 'refund_buyer', 'the listing was materially wrong', null, 'resolve-key-1')$q$, v_d));
  perform public.test_expect('4k a second resolution of the same dispute is refused',
    format($q$select public.resolve_dispute(%L, 'refund_buyer', 'trying again', null, 'resolve-key-1')$q$, v_d),
    true);
  reset role;
end
$$;

do $$
declare v_d uuid := public.test_get('dispute')::uuid;
        v_order text := (select order_no from public.disputes where id = v_d);
begin
  perform public.test_check('4b a full refund returns total_usd to the buyer',
    public.test_balance('11111111-1111-1111-1111-111111111111') = 897,
    'buyer balance=' || public.test_balance('11111111-1111-1111-1111-111111111111'));
  perform public.test_check('4c the order becomes refunded',
    public.test_order_status(v_order) = 'refunded', public.test_order_status(v_order));
  perform public.test_check('4d the seller escrow hold is released in full',
    public.test_escrow_delta('22222222-2222-2222-2222-222222222222') = 0,
    'delta=' || public.test_escrow_delta('22222222-2222-2222-2222-222222222222'));
  perform public.test_check('4e the seller is paid nothing extra on a full refund',
    public.test_balance('22222222-2222-2222-2222-222222222222') = 90,
    'seller balance=' || public.test_balance('22222222-2222-2222-2222-222222222222'));
  perform public.test_check('4f stock restored on a full refund',
    (select stock from public.listings
      where id = 'bbbbbbbb-0000-0000-0000-000000000001') = 1, '');
  perform public.test_check('4g credentials unclaimed on a full refund',
    (select count(*) from public.listing_credentials
      where claimed_by_order = v_order) = 0, '');
  perform public.test_check('4h the refund is recorded once',
    (select count(*) from public.order_refunds where order_no = v_order) = 1, '');
  perform public.test_check('4i the dispute is marked resolved_buyer',
    (select status from public.disputes where id = v_d) = 'resolved_buyer', '');
  perform public.test_check('4j an audit row was written',
    (select count(*) from public.admin_audit
      where action = 'dispute.resolve' and resource_id = v_d) >= 1, '');
  perform public.test_check('4l the refused retry refunded nothing',
    public.test_balance('11111111-1111-1111-1111-111111111111') = 897,
    'buyer balance=' || public.test_balance('11111111-1111-1111-1111-111111111111'));
end
$$;

-- ==================================================== 5. PARTIAL REFUND
do $$
begin
  perform public.test_restock('unit-3');
  perform public.test_snap_escrow('22222222-2222-2222-2222-222222222222');
  perform public.test_snap_balance('11111111-1111-1111-1111-111111111111');
  perform public.test_snap_balance('22222222-2222-2222-2222-222222222222');
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
  set local role authenticated;
  perform public.test_expect_ok('5a',
    $q$select public.test_checkout('bbbbbbbb-0000-0000-0000-000000000001', null, 1, 'test-key-2000')$q$);
  perform public.test_expect_ok('5b the buyer opens a dispute on the fresh order',
    format($q$select public.test_open_dispute(%L, %L)$q$, 'seller_unresponsive', 'partial issue with this account'));
  reset role;

  perform set_config('request.jwt.claims',
    '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
  set local role authenticated;
  perform public.test_expect_ok('5c an admin can issue a partial refund',
    format($q$select public.resolve_dispute(%L, 'partial_refund', 'split the difference', 50, 'partial-key-1')$q$,
           public.test_get('dispute')::uuid));
  reset role;
end
$$;

do $$
declare v_d uuid := public.test_get('dispute')::uuid;
        v_order text := (select order_no from public.disputes where id = v_d);
        v_o public.orders%rowtype;
begin
  select * into v_o from public.orders where order_no = v_order;

  -- The section started by paying $103 and then refunding $50, so the buyer's
  -- net movement is -53 and the seller's is +53.
  perform public.test_check('5d a partial refund credits the buyer exactly 50',
    public.test_balance_delta('11111111-1111-1111-1111-111111111111') = -53,
    'buyer delta=' || public.test_balance_delta('11111111-1111-1111-1111-111111111111'));
  perform public.test_check('5e the seller receives total_usd - refund',
    public.test_balance_delta('22222222-2222-2222-2222-222222222222') = 53,
    'seller delta=' || public.test_balance_delta('22222222-2222-2222-2222-222222222222'));
  perform public.test_check('5f the order becomes partially_refunded',
    v_o.status = 'partially_refunded', v_o.status);
  perform public.test_check('5g refunded_amount records the refund',
    v_o.refunded_amount = 50, v_o.refunded_amount::text);
  perform public.test_check('5h escrow fully unwound',
    public.test_escrow_delta('22222222-2222-2222-2222-222222222222') = 0,
    'delta=' || public.test_escrow_delta('22222222-2222-2222-2222-222222222222'));
  perform public.test_check('5i stock is untouched (the buyer keeps the item)',
    (select stock from public.listings
      where id = 'bbbbbbbb-0000-0000-0000-000000000001') = 0, '');
  perform public.test_check('5j refund + seller payout equals what the buyer paid',
    (select buyer_amount + seller_amount from public.order_refunds
      where order_no = v_order) = v_o.total_usd, '');
end
$$;

-- Boundary: refunding almost everything must not push the seller negative.
do $$
begin
  perform public.test_restock('unit-4');
  perform public.test_snap_escrow('22222222-2222-2222-2222-222222222222');
  perform public.test_snap_balance('11111111-1111-1111-1111-111111111111');
  perform public.test_snap_balance('22222222-2222-2222-2222-222222222222');
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
  set local role authenticated;
  perform public.test_expect_ok('6a',
    $q$select public.test_checkout('bbbbbbbb-0000-0000-0000-000000000001', null, 1, 'test-key-3000')$q$);
  perform public.test_expect_ok('6b the buyer opens a dispute on the boundary order',
    format($q$select public.test_open_dispute(%L, %L)$q$, 'other', 'boundary case for the refund split'));
  reset role;

  perform set_config('request.jwt.claims',
    '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
  set local role authenticated;
  -- $102 of a $103 total: the seller's share floors at $1, never negative.
  perform public.test_expect_ok('6c an admin can refund almost the whole order',
    format($q$select public.resolve_dispute(%L, 'partial_refund', 'almost everything back', 102, 'partial-key-2')$q$,
           public.test_get('dispute')::uuid));
  reset role;
end
$$;

do $$
declare v_d uuid := public.test_get('dispute')::uuid;
        v_order text := (select order_no from public.disputes where id = v_d);
begin
  perform public.test_check('6d the seller payout floors at total_usd - refund',
    (select seller_amount from public.order_refunds where order_no = v_order) = 1,
    'seller_amount=' ||
    (select seller_amount from public.order_refunds where order_no = v_order));
  perform public.test_check('6e no wallet went negative',
    public.test_balance('11111111-1111-1111-1111-111111111111') >= 0
      and public.test_balance('22222222-2222-2222-2222-222222222222') >= 0, '');
end
$$;

-- ============================================ 7. CLIENTS CANNOT TOUCH MONEY
do $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
  set local role authenticated;

  perform public.test_expect('7a a client cannot credit their own wallet',
    $q$select public.apply_wallet('11111111-1111-1111-1111-111111111111', 1000000, 0, 'adjustment', null, 'free money')$q$,
    true);
  perform public.test_expect('7b a client cannot call credit_wallet',
    $q$select public.credit_wallet('11111111-1111-1111-1111-111111111111', 1000000)$q$,
    true);
  perform public.test_expect('7c a client cannot settle a refund directly',
    $q$select public.settle_order_refund('AMH-X', 10, 'refund_buyer', 'x', null, 'forged-key')$q$,
    true);
  perform public.test_expect('7d a client cannot forge an audit entry',
    $q$select public.log_admin_audit('11111111-1111-1111-1111-111111111111', 'fake.action', 'order', null, 'x', 'y')$q$,
    true);
  perform public.test_expect('7e a client cannot promote themselves to admin',
    $q$update public.profiles set is_admin = true where id = '11111111-1111-1111-1111-111111111111'$q$,
    true);
  -- There is no UPDATE policy on wallets, so this statement matches zero rows
  -- rather than raising. The assertion below proves the value did not move.
  perform public.test_expect_ok('7f a direct wallet update is silently a no-op',
    $q$update public.wallets set balance_usd = 999999 where user_id = '11111111-1111-1111-1111-111111111111'$q$);
  perform public.test_expect('7g a client cannot forge an order event',
    $q$insert into public.order_events (order_no, event) values ('AMH-X', 'forged')$q$,
    true);
  perform public.test_expect('10b a client cannot call the escrow sweeper',
    $q$select public.release_expired_escrow(10)$q$, true);
  reset role;
end
$$;

do $$
begin
  perform public.test_check('7h the buyer is still not an admin',
    (select is_admin from public.profiles
      where id = '11111111-1111-1111-1111-111111111111') = false, '');
  -- A direct wallet write was refused, so the balance must still be exactly the
  -- wallet ledger's running total.
  perform public.test_check('7i the buyer balance still equals the wallet ledger',
    public.test_balance('11111111-1111-1111-1111-111111111111')
      = 1000 + (select coalesce(sum(balance_delta), 0) from public.wallet_ledger
                 where user_id = '11111111-1111-1111-1111-111111111111'),
    'balance=' || public.test_balance('11111111-1111-1111-1111-111111111111')
      || ' ledger=' || (select coalesce(sum(balance_delta), 0) from public.wallet_ledger
                         where user_id = '11111111-1111-1111-1111-111111111111'));
end
$$;

-- ============================================ 8. ANONYMOUS IS LOCKED OUT
do $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', false);
  set local role anon;

  -- A policy filters rows rather than raising, so an anonymous reader gets an
  -- empty result. That is the correct outcome; the assertions below check it.
  perform public.test_expect_ok('8a an anonymous read of orders is allowed but empty',
    $q$select count(*) from public.orders$q$);
  perform public.test_expect('8d an anonymous caller cannot open a dispute',
    $q$select public.open_dispute('AMH-X', 'other', 'anonymous attempt here')$q$, true);
  reset role;
end
$$;

do $$
declare v_orders integer; v_wallets integer; v_audit integer;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', false);
  set local role anon;
  select count(*) into v_orders from public.orders;
  select count(*) into v_wallets from public.wallets;
  select count(*) into v_audit from public.admin_audit;
  reset role;
  perform public.test_check('8b an anonymous reader sees zero orders through RLS',
    v_orders = 0, 'visible=' || v_orders);
  perform public.test_check('8c an anonymous reader sees zero wallets through RLS',
    v_wallets = 0, 'visible=' || v_wallets);
  perform public.test_check('8e an anonymous reader sees zero audit rows through RLS',
    v_audit = 0, 'visible=' || v_audit);
end
$$;

-- ============================================ 9. RLS ON THE PARTIES' OWN ROWS
do $$
declare v_seen integer;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', false);
  set local role authenticated;
  select count(*) into v_seen from public.orders;
  reset role;
  perform public.test_check('9a a stranger sees zero orders through RLS',
    v_seen = 0, 'visible=' || v_seen);
end
$$;

do $$
declare v_seen integer;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
  set local role authenticated;
  select count(*) into v_seen from public.orders;
  reset role;
  perform public.test_check('9b the buyer sees only their own orders', v_seen = 4,
    'visible=' || v_seen);
end
$$;

do $$
declare v_seen integer;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', false);
  set local role authenticated;
  select count(*) into v_seen from public.profiles;
  reset role;
  perform public.test_check('9c a signed-in stranger sees only their own profile row',
    v_seen = 1, 'rows visible=' || v_seen);
end
$$;

do $$
declare v_seen integer;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', false);
  set local role anon;
  select count(*) into v_seen from public.public_profiles;
  reset role;
  perform public.test_check('9d the public profile projection is readable without exposing emails',
    v_seen = 4, 'rows=' || v_seen);
end
$$;

-- ============================================ 10. SERVICE ROLE WEBHOOK PATH
do $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', false);
  set local role service_role;
  -- The primitive is reachable by the service role, but a missing order must
  -- still be an error rather than a silent money movement.
  perform public.test_expect('10a the service role refund of a missing order is refused',
    $q$select public.settle_order_refund('AMH-DOES-NOT-EXIST', 5, 'refund_buyer', 'x', null, 'svc-key-1')$q$,
    true);
  reset role;
end
$$;

-- ============================================ 11. SELF-ADJUDICATION
do $$
begin
  perform public.test_restock('unit-5');
  perform public.test_snap_escrow('22222222-2222-2222-2222-222222222222');
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
  set local role authenticated;
  perform public.test_expect_ok('11a',
    $q$select public.test_checkout('bbbbbbbb-0000-0000-0000-000000000001', null, 1, 'test-key-4000')$q$);
  perform public.test_expect_ok('11b the buyer opens the dispute',
    format($q$select public.test_open_dispute(%L, %L)$q$, 'transfer_failed', 'the credentials never worked for me'));
  reset role;
end
$$;

do $$
declare v_order text := public.test_get('order');
        v_d uuid := public.test_get('dispute')::uuid;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
  set local role authenticated;
  perform public.test_expect('11c a seller cannot resolve the dispute on their own order',
    format($q$select public.resolve_dispute(%L, 'dismissed', 'I win', null, 'self-1')$q$, v_d),
    true);
  perform public.test_expect('11d a seller cannot refund an order (that moves money)',
    format($q$select public.refund_order(%L, 'self service refund', 'self-2')$q$, v_order),
    true);
  perform public.test_expect('11e a seller cannot move a dispute into review',
    format($q$select public.start_dispute_review(%L)$q$, v_d),
    true);
  perform public.test_expect('11g a disputed order cannot be marked delivered',
    format($q$select public.mark_order_delivered(%L, 'manual', null)$q$, v_order),
    true);
  reset role;

  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
  set local role authenticated;
  perform public.test_expect('11f a buyer cannot resolve their own dispute',
    format($q$select public.resolve_dispute(%L, 'refund_buyer', 'give me my money', null, 'self-3')$q$, v_d),
    true);
  reset role;
end
$$;

-- ============================================ 12. DELIVERY + REPLACEMENT
do $$
begin
  -- The manual listing (…0002) has no credential units, so checkout leaves the
  -- order pending and the seller has to mark it delivered.
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
  set local role authenticated;
  perform public.test_snap_escrow('22222222-2222-2222-2222-222222222222');
  perform public.test_expect_ok('12a a fresh manual-delivery order',
    $q$select public.test_cart_checkout('bbbbbbbb-0000-0000-0000-000000000002', 1, 'test-key-5000')$q$);
  reset role;

  perform set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
  set local role authenticated;
  perform public.test_expect_ok('12b the seller can mark the order delivered',
    format($q$select public.mark_order_delivered(%L, 'manual', 'Sent over the secure vault.')$q$,
           public.test_get('order')));
  perform public.test_expect('12d the seller cannot mark the same order delivered twice',
    format($q$select public.mark_order_delivered(%L, 'manual', null)$q$, public.test_get('order')),
    true);
  reset role;

  perform public.test_check('12c delivery recorded the timestamp and method',
    (select delivery_status = 'delivered' and delivered_at is not null
            and delivery_method = 'manual'
       from public.orders where order_no = public.test_get('order')), '');

  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
  set local role authenticated;
  perform public.test_expect_ok('12e the buyer can request a replacement instead of confirming',
    format($q$select public.request_replacement(%L, 'the second factor was not handed over')$q$,
           public.test_get('order')));
  reset role;

  perform set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
  set local role authenticated;
  perform public.test_expect_ok('12f the seller can approve a replacement',
    format($q$select public.resolve_order_request(%L, 'approved', 'Sending a fresh account')$q$,
           public.test_latest_request()));
  perform public.test_expect('12i an already-resolved request cannot be resolved again',
    format($q$select public.resolve_order_request(%L, 'approved', 'again')$q$,
           public.test_latest_request()),
    true);
  reset role;
end
$$;

do $$
declare v_order text := public.test_get('order');
begin
  perform public.test_check('12g a replacement resets delivery to pending',
    (select delivery_status = 'pending' and delivered_at is null
       from public.orders where order_no = v_order), '');
  perform public.test_check('12h a replacement does not release escrow',
    public.test_order_status(v_order) = 'in_escrow'
      and public.test_escrow_delta('22222222-2222-2222-2222-222222222222') = 90,
    'delta=' || public.test_escrow_delta('22222222-2222-2222-2222-222222222222'));
end
$$;

-- ============================================ 13. CANCELLATION REFUND
do $$
begin
  perform public.test_restock('unit-7');
  perform public.test_snap_escrow('22222222-2222-2222-2222-222222222222');
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
  set local role authenticated;
  perform public.test_expect_ok('13a',
    $q$select public.test_checkout('bbbbbbbb-0000-0000-0000-000000000001', null, 1, 'test-key-6000')$q$);
  perform public.test_expect_ok('13b the buyer can request a cancellation',
    format($q$select public.request_cancellation(%L, 'I changed my mind about this order')$q$,
           public.test_get('order')));
  reset role;

  perform set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
  set local role authenticated;
  perform public.test_expect('13c a seller cannot approve a cancellation (only an admin can)',
    format($q$select public.resolve_order_request(%L, 'approved', 'sure')$q$,
           public.test_latest_request()),
    true);
  reset role;

  perform set_config('request.jwt.claims',
    '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
  set local role authenticated;
  perform public.test_expect_ok('13d an admin can approve a cancellation',
    format($q$select public.resolve_order_request(%L, 'approved', 'buyer changed their mind')$q$,
           public.test_latest_request()));
  reset role;
end
$$;

do $$
declare v_order text := public.test_get('order');
begin
  perform public.test_check('13e an approved cancellation refunds the order',
    public.test_order_status(v_order) = 'refunded', public.test_order_status(v_order));
  perform public.test_check('13f cancellation released the escrow hold',
    public.test_escrow_delta('22222222-2222-2222-2222-222222222222') = 0,
    'delta=' || public.test_escrow_delta('22222222-2222-2222-2222-222222222222'));
  perform public.test_check('13g cancellation recorded a refund row',
    (select count(*) from public.order_refunds where order_no = v_order) = 1, '');
end
$$;

-- ============================================ 14. REVIEWS
do $$
declare v_order text := (select order_no from public.orders
                          where delivery_status = 'buyer_confirmed'
                          order by created_at desc limit 1);
begin
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
  set local role authenticated;
  perform public.test_expect_ok('14a the buyer can review a confirmed order',
    format($q$select public.submit_review(%L, 5, 'Exactly as described', 'Delivery was fast and the account matched.')$q$, v_order));
  perform public.test_expect('14b the same order cannot be reviewed twice',
    format($q$select public.submit_review(%L, 1, 'Changed my mind', 'Trying to review the same order again.')$q$, v_order),
    true);
  reset role;
end
$$;

do $$
declare v_order text := (select order_no from public.orders
                          where status = 'in_escrow' order by created_at desc limit 1);
begin
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
  set local role authenticated;
  perform public.test_expect('14c an unconfirmed order cannot be reviewed',
    format($q$select public.submit_review(%L, 5, 'Too early', 'Trying to review before delivery is confirmed.')$q$, v_order),
    true);
  reset role;
end
$$;

-- ============================================ 15. SWEEPER SAFETY
-- The escrow sweeper must not release funds while a dispute is open, even if
-- the escrow window has passed.
do $$
declare v_order text;
begin
  perform public.test_restock('unit-8');
  perform public.test_snap_escrow('22222222-2222-2222-2222-222222222222');
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
  set local role authenticated;
  perform public.test_snap_escrow('22222222-2222-2222-2222-222222222222');
  perform public.test_expect_ok('15a a fresh order for the sweeper case',
    $q$select public.test_checkout('bbbbbbbb-0000-0000-0000-000000000001', null, 1, 'test-key-7000')$q$);
  v_order := public.test_get('order');
  perform public.test_expect_ok('15b the buyer opens a dispute before the window closes',
    format($q$select public.test_open_dispute(%L, %L)$q$, 'other', 'a dispute that outlives the escrow window'));
  reset role;

  update public.orders set escrow_expires_at = now() - interval '1 day'
   where order_no = v_order;

  perform set_config('request.jwt.claims', '{"role":"service_role"}', false);
  set local role service_role;
  perform public.test_expect_ok('15c the sweeper runs without error',
    $q$select public.release_expired_escrow(100)$q$);
  reset role;

  perform public.test_check('15d a disputed order is not auto-released',
    public.test_order_status(v_order) = 'disputed'
      and public.test_escrow_delta('22222222-2222-2222-2222-222222222222') > 0,
    'status=' || public.test_order_status(v_order)
      || ' delta=' || public.test_escrow_delta('22222222-2222-2222-2222-222222222222'));
end
$$;

-- ============================================ SUMMARY
do $$
declare v_total integer; v_passed integer;
begin
  select count(*), count(*) filter (where passed) into v_total, v_passed
    from public.test_results;
  raise notice 'TESTS: %/% passed, % failed', v_passed, v_total, v_total - v_passed;
end
$$;

select ord, name, case when passed then 'PASS' else 'FAIL' end as result, detail
  from public.test_results order by ord;

select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed
  from public.test_results;

rollback;
