-- =====================================================================
-- tests/request_authorization.sql
--
-- Two authorization holes in SECURITY DEFINER functions, both reachable
-- with the publishable key from a browser. Each is demonstrated against a
-- database built from this repository's own migrations.
--
--   H1  resolve_order_request() checks WHO may APPROVE a cancellation or a
--       replacement, but not who may DISMISS one. Because the function is
--       SECURITY DEFINER, the `select ... for update` reads the request row
--       with the owner's rights, so RLS does not hide it from the caller.
--       Any signed-in stranger who knows a request id can therefore close
--       someone else's request — and a *dismissed* cancellation is the
--       denial-of-refund primitive: the buyer's request is gone and the
--       money stays in escrow.
--
--   H2  mark_notifications_read(p_user) takes the user id as an ARGUMENT and
--       never compares it to auth.uid(). Any signed-in caller can clear
--       another user's inbox, hiding a delivery notice, a dispute reply or a
--       cancellation from the person who needed to see it.
--
-- RUN: tests/run-db-tests.sh tests/request_authorization.sql
-- =====================================================================

\set ON_ERROR_STOP off

begin;

create temp table results (name text, ok boolean);

create or replace function assert_that(name text, ok boolean) returns void
language plpgsql security definer as $$
begin
  insert into results values (name, coalesce(ok, false));
end $$;

create or replace function done() returns void language plpgsql as $$
declare total int; passed int; r record;
begin
  select count(*), count(*) filter (where ok) into total, passed from results;
  raise notice '% | % | %', total, passed, total - passed;
  for r in select * from results where not ok loop
    raise notice '   FAILED: %', r.name;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Fixtures. buyer 1111, seller 2222, admin 3333, stranger 4444.
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'buyer@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'seller@example.test'),
  ('33333333-3333-3333-3333-333333333333', 'admin@example.test'),
  ('44444444-4444-4444-4444-444444444444', 'stranger@example.test')
on conflict (id) do nothing;

-- `guard_profile_privileges` pins is_admin for non-trusted writers, so the
-- seed flips the trusted flag for the insert and turns it straight back off.
select set_config('app.trusted_write', 'on', false);
insert into public.profiles (id, email, name, is_admin) values
  ('11111111-1111-1111-1111-111111111111', 'buyer@example.test', 'Buyer', false),
  ('22222222-2222-2222-2222-222222222222', 'seller@example.test', 'Seller', false),
  ('33333333-3333-3333-3333-333333333333', 'admin@example.test', 'Admin', true),
  ('44444444-4444-4444-4444-444444444444', 'stranger@example.test', 'Stranger', false)
on conflict (id) do update set is_admin = excluded.is_admin;
select set_config('app.trusted_write', 'off', false);

insert into public.stores (id, user_id, store_name, slug, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222', 'Seller Store', 'seller-store', 'approved')
on conflict (id) do nothing;

insert into public.listings (id, listing_key, seller_id, store_id, title, brand,
                             price_usd, stock, status, delivery_mode)
values ('bbbbbbbb-0000-0000-0000-0000000000f1', 'unit-authz',
        '22222222-2222-2222-2222-222222222222',
        'aaaaaaaa-0000-0000-0000-000000000001',
        'Authz Test Account', 'TestBrand', 100, 5, 'active', 'manual')
on conflict (id) do nothing;

insert into public.orders (order_no, listing_id, listing_title, brand, buyer_id,
                           seller_id, quantity, unit_price_usd, gross_amount,
                           escrow_fee_usd, total_usd, commission_amount,
                           seller_net_amount, status)
values ('AMH-AUTHZ-1', 'bbbbbbbb-0000-0000-0000-0000000000f1',
        'Authz Test Account', 'TestBrand',
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        1, 100, 100, 3, 103, 10, 90, 'in_escrow')
on conflict (order_no) do nothing;

-- The buyer has asked for a replacement. It is pending.
insert into public.order_requests (id, order_no, requested_by, kind, reason, status)
values ('cccccccc-0000-0000-0000-0000000000f1', 'AMH-AUTHZ-1',
        '11111111-1111-1111-1111-111111111111', 'replacement',
        'the second factor was not handed over', 'pending')
on conflict (id) do nothing;

-- The buyer has two unread notifications; the seller has one.
insert into public.notifications (id, user_id, kind, title, body, read) values
  ('dddddddd-0000-0000-0000-0000000000f1', '11111111-1111-1111-1111-111111111111',
   'order_placed', 'Order confirmed', 'Your order is held in-platform.', false),
  ('dddddddd-0000-0000-0000-0000000000f2', '11111111-1111-1111-1111-111111111111',
   'dispute_resolved', 'Seller replied', 'The seller answered your dispute.', false),
  ('dddddddd-0000-0000-0000-0000000000f3', '22222222-2222-2222-2222-222222222222',
   'order_placed', 'New sale', 'You have a new order.', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- H1. resolve_order_request must be scoped to a party or a moderator.
-- ---------------------------------------------------------------------
do $$
declare v_status text;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', false);
  set local role authenticated;
  begin
    perform public.resolve_order_request('cccccccc-0000-0000-0000-0000000000f1',
                                         'dismissed', 'not my business');
    reset role;
    select status into v_status from public.order_requests
     where id = 'cccccccc-0000-0000-0000-0000000000f1';
    perform assert_that('a stranger cannot dismiss someone else''s request',
                        v_status <> 'dismissed');
  exception when others then
    reset role;
    perform assert_that('a stranger cannot dismiss someone else''s request', true);
  end;
end $$;

do $$
declare v_status text;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', false);
  set local role authenticated;
  begin
    perform public.resolve_order_request('cccccccc-0000-0000-0000-0000000000f1',
                                         'approved', 'sure');
    reset role;
    select status into v_status from public.order_requests
     where id = 'cccccccc-0000-0000-0000-0000000000f1';
    perform assert_that('a stranger cannot approve someone else''s request',
                        v_status <> 'approved');
  exception when others then
    reset role;
    perform assert_that('a stranger cannot approve someone else''s request', true);
  end;
end $$;

-- The buyer asked for it; the buyer must not be able to adjudicate it either.
do $$
declare v_status text;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
  set local role authenticated;
  begin
    perform public.resolve_order_request('cccccccc-0000-0000-0000-0000000000f1',
                                         'dismissed', 'I withdraw it');
    reset role;
    select status into v_status from public.order_requests
     where id = 'cccccccc-0000-0000-0000-0000000000f1';
    perform assert_that('the requesting buyer cannot adjudicate their own request',
                        v_status <> 'dismissed');
  exception when others then
    reset role;
    perform assert_that('the requesting buyer cannot adjudicate their own request', true);
  end;
end $$;

-- Positive control: the seller IS a party, so this must still work.
do $$
declare v_status text;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
  set local role authenticated;
  begin
    perform public.resolve_order_request('cccccccc-0000-0000-0000-0000000000f1',
                                         'approved', 'Sending a fresh account');
    reset role;
    select status into v_status from public.order_requests
     where id = 'cccccccc-0000-0000-0000-0000000000f1';
    perform assert_that('the seller can still approve their own replacement request',
                        v_status = 'approved');
  exception when others then
    reset role;
    perform assert_that('the seller can still approve their own replacement request', false);
  end;
end $$;

-- An administrator is not a party but must still be able to adjudicate.
do $$
declare v_status text;
begin
  insert into public.order_requests (id, order_no, requested_by, kind, reason, status)
  values ('cccccccc-0000-0000-0000-0000000000f2', 'AMH-AUTHZ-1',
          '11111111-1111-1111-1111-111111111111', 'cancellation',
          'the account was locked on delivery', 'pending')
  on conflict (id) do nothing;

  perform set_config('request.jwt.claims',
    '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
  set local role authenticated;
  begin
    perform public.resolve_order_request('cccccccc-0000-0000-0000-0000000000f2',
                                         'dismissed', 'still within warranty');
    reset role;
    select status into v_status from public.order_requests
     where id = 'cccccccc-0000-0000-0000-0000000000f2';
    perform assert_that('an administrator can still adjudicate any request',
                        v_status = 'dismissed');
  exception when others then
    reset role;
    perform assert_that('an administrator can still adjudicate any request [' || sqlstate || ': ' || sqlerrm || ']', false);
  end;
end $$;

-- ---------------------------------------------------------------------
-- H2. mark_notifications_read must only ever touch the caller's own inbox.
-- ---------------------------------------------------------------------
do $$
declare v_unread integer;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', false);
  set local role authenticated;
  begin
    perform public.mark_notifications_read('11111111-1111-1111-1111-111111111111');
  exception when others then null;
  end;
  reset role;
  -- Only the two seeded rows, since H1's replacement approval legitimately
  -- added notifications of its own.
  select count(*) into v_unread from public.notifications
   where id in ('dddddddd-0000-0000-0000-0000000000f1',
                'dddddddd-0000-0000-0000-0000000000f2')
     and not read;
  perform assert_that('a stranger cannot clear another user''s inbox', v_unread = 2);
end $$;

do $$
declare v_unread integer;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
  set local role authenticated;
  perform public.mark_notifications_read('11111111-1111-1111-1111-111111111111');
  reset role;
  select count(*) into v_unread from public.notifications
   where user_id = '11111111-1111-1111-1111-111111111111' and not read;
  perform assert_that('the buyer can still mark their own inbox read', v_unread = 0);
end $$;

do $$
declare v_unread integer;
begin
  select count(*) into v_unread from public.notifications
   where id = 'dddddddd-0000-0000-0000-0000000000f3' and not read;
  perform assert_that('the seller''s own notification was not touched', v_unread = 1);
end $$;

select done();

select count(*) as total,
       count(*) filter (where ok) as passed,
       count(*) filter (where not ok) as failed
  from results;

rollback;
