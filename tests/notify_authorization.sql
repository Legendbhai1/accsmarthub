-- AccsMartHub — notification authorization tests.
--
-- RUN:
--   tests/run-db-tests.sh tests/notify_authorization.sql
--
-- WHAT THIS PINS
--
-- public.notify(uuid, text, text, text, text) is SECURITY DEFINER and takes
-- the recipient as an argument, so before 0020 any authenticated user could
-- forge a notification into any other user's inbox. 0020 revokes execute from
-- PUBLIC/anon/authenticated and leaves it with service_role only.
--
-- Two things must hold at once, and the file asserts both:
--   1. A client role calling notify() directly is refused (spoofing blocked).
--   2. A real, user-triggered internal flow still writes the notification,
--      because the internal call runs as the definer owner, not as
--      `authenticated`.
--
-- The whole file ends in ROLLBACK: no fixture or helper survives.

begin;

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

grant all on public.test_results to anon, authenticated, service_role;
grant execute on function public.test_record(text, boolean, text)
  to anon, authenticated, service_role;

-- ----------------------------------------------------------------- fixtures
-- buyer 1111…  seller 2222…  stranger 4444…
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'buyer@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'seller@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'stranger@example.com')
on conflict (id) do nothing;

select set_config('app.trusted_write', 'on', false);
insert into public.profiles (id, email, name, is_admin) values
  ('11111111-1111-1111-1111-111111111111', 'buyer@example.com', 'Buyer', false),
  ('22222222-2222-2222-2222-222222222222', 'seller@example.com', 'Seller', false),
  ('44444444-4444-4444-4444-444444444444', 'stranger@example.com', 'Stranger', false)
on conflict (id) do update set is_admin = excluded.is_admin;

insert into public.wallets (user_id, spendable_usd) values
  ('11111111-1111-1111-1111-111111111111', 1000),
  ('44444444-4444-4444-4444-444444444444', 0)
on conflict (user_id) do update set spendable_usd = excluded.spendable_usd;

insert into public.stores (id, user_id, store_name, slug, status, contact_policy)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222', 'Seller Store', 'seller-store',
        'approved', true)
on conflict (id) do nothing;

-- A manual-delivery listing, so checkout leaves the order pending and the
-- seller has to call mark_order_delivered() — the internal notify() path.
insert into public.listings
  (id, listing_key, seller_id, store_id, title, brand, price_usd, stock, status, hidden)
values ('bbbbbbbb-0000-0000-0000-000000000002', 'key-notify-2',
        '22222222-2222-2222-2222-222222222222',
        'aaaaaaaa-0000-0000-0000-000000000001',
        'Manual Account', 'instagram', 100, 5, 'active', false)
on conflict (id) do nothing;
select set_config('app.trusted_write', 'off', false);

-- ===================================================== 1. spoofing is blocked
-- The attacker tries to write a convincing "your payout was sent" row into the
-- buyer's inbox. As a client role this must fail with insufficient_privilege.
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';

do $$
declare blocked boolean := false; msg text;
begin
  begin
    perform public.notify(
      '11111111-1111-1111-1111-111111111111', 'payout_paid',
      'Withdrawal sent', 'Your $5000 withdrawal has been sent.', 'forged');
  exception when others then blocked := true; msg := sqlstate || ': ' || sqlerrm; end;
  perform public.test_record(
    'stranger cannot call notify() directly', blocked, coalesce(msg, 'no error raised'));
end $$;

-- The same must hold for a plain signed-in user with no special role, and for
-- an unauthenticated caller.
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
do $$
declare blocked boolean := false;
begin
  begin
    perform public.notify(
      '22222222-2222-2222-2222-222222222222', 'payout_paid', 'x', 'y', null);
  exception when others then blocked := true; end;
  perform public.test_record('buyer cannot call notify() directly', blocked, '');
end $$;
reset role;

set local role anon;
do $$
declare blocked boolean := false;
begin
  begin
    perform public.notify(
      '11111111-1111-1111-1111-111111111111', 'payout_paid', 'x', 'y', null);
  exception when others then blocked := true; end;
  perform public.test_record('anon cannot call notify() directly', blocked, '');
end $$;
reset role;

select public.test_record(
  'no forged notification was written',
  (select count(*) = 0 from public.notifications where kind = 'payout_paid'),
  'payout_paid rows=' || (select count(*)::text from public.notifications where kind = 'payout_paid'));

-- ======================================= 2. the direct insert is still denied
-- Even with notify() locked down, the underlying table must stay closed to
-- clients. This is the RLS policy the definer function used to bypass.
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
do $$
declare blocked boolean := false;
begin
  begin
    insert into public.notifications (user_id, kind, title, body)
    values ('11111111-1111-1111-1111-111111111111', 'payout_paid', 'x', 'y');
  exception when others then blocked := true; end;
  perform public.test_record('client cannot insert into another inbox (RLS)', blocked, '');
end $$;
reset role;

-- ============================ 3. legitimate internal notifications still work
-- Buyer checks out; seller marks the order delivered. mark_order_delivered() is
-- a user-triggered SECURITY DEFINER function that calls notify() for the buyer.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select public.cart_add('bbbbbbbb-0000-0000-0000-000000000002', 1);
select public.checkout(null, array['bbbbbbbb-0000-0000-0000-000000000002'::uuid], null, 'key-notify-1');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select public.mark_order_delivered(
  (select order_no from public.orders limit 1)::text, 'manual'::text, null::text);
reset role;

select public.test_record(
  'internal flow still notifies the buyer after the revoke',
  (select count(*) > 0 from public.notifications
     where user_id = '11111111-1111-1111-1111-111111111111' and kind = 'delivered'),
  'buyer delivered rows=' || (select count(*)::text from public.notifications
     where user_id = '11111111-1111-1111-1111-111111111111' and kind = 'delivered'));

-- ================================================= 4. service_role still works
-- A server-side caller keeps the privilege; this is what the Edge Functions and
-- the settlement path rely on.
set local role service_role;
do $$
declare ok boolean := false;
begin
  begin
    perform public.notify(
      '11111111-1111-1111-1111-111111111111', 'payment_captured', 'Top-up confirmed',
      'Your deposit landed.', null);
    ok := true;
  exception when others then ok := false; end;
  perform public.test_record('service_role can still call notify()', ok, '');
end $$;
reset role;

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
