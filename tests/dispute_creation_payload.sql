-- =====================================================================
-- tests/dispute_creation_payload.sql
--
-- The regression this locks down: `open_dispute()` validates `p_reason`
-- against the canonical snake_case vocabulary, but the buyer page used to
-- post the human label it rendered. Every dispute opened from the UI failed:
--
--   ERROR: Invalid dispute reason   (SQLSTATE P0001)
--
-- These cases call the RPC with the exact payload the fixed UI sends — the
-- canonical value — and confirm it succeeds, then confirm the old label is
-- still rejected so the vocabulary cannot quietly widen back to labels.
--
-- Run: tests/run-db-tests.sh tests/dispute_creation_payload.sql
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
-- Fixtures: a buyer, a seller, a listing and three orders the buyer owns.
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'buyer@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'seller@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'stranger@example.com')
on conflict (id) do nothing;

insert into public.listings
  (id, listing_key, seller_id, title, brand, price_usd, stock, status)
values ('dddddddd-0000-0000-0000-000000000001', 'pay-key-1',
        '22222222-2222-2222-2222-222222222222', 'Payload Account', 'instagram',
        50, 0, 'active')
on conflict (id) do nothing;

-- An order still in escrow, with a dispute window that has not closed.
insert into public.orders
  (order_no, listing_id, listing_title, brand, buyer_id, seller_id, quantity,
   unit_price_usd, gross_amount, escrow_fee_usd, total_usd,
   commission_amount, seller_net_amount, status, delivery_status,
   inspection_deadline)
values
  ('PAY-1', 'dddddddd-0000-0000-0000-000000000001', 'Payload Account', 'instagram',
   '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222', 1, 50, 50, 1.5, 51.5, 5, 45,
   'in_escrow', 'pending', now() + interval '7 days'),
  ('PAY-2', 'dddddddd-0000-0000-0000-000000000001', 'Payload Account', 'instagram',
   '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222', 1, 50, 50, 1.5, 51.5, 5, 45,
   'in_escrow', 'pending', now() + interval '7 days'),
  ('PAY-3', 'dddddddd-0000-0000-0000-000000000001', 'Payload Account', 'instagram',
   '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222', 1, 50, 50, 1.5, 51.5, 5, 45,
   'in_escrow', 'pending', now() + interval '7 days')
on conflict (order_no) do nothing;

-- ---------------------------------------------------------------------
-- The buyer opens a dispute with the canonical value the fixed UI sends.
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

do $$
declare v_id uuid;
begin
  v_id := public.open_dispute(
    'PAY-1', 'not_as_described',
    'The account did not match the listing description.');
  perform assert_that(
    'open_dispute accepts the UI payload (canonical value)',
    v_id is not null);
exception when others then
  perform assert_that(
    'open_dispute accepts the UI payload (canonical value) [' || sqlstate || ' ' || sqlerrm || ']',
    false);
end $$;

select assert_that(
  'the dispute row holds the canonical value',
  (select reason from public.disputes where order_no = 'PAY-1') = 'not_as_described');
select assert_that(
  'opening a dispute freezes the order',
  (select status from public.orders where order_no = 'PAY-1') = 'disputed');

-- ---------------------------------------------------------------------
-- The old label is still refused. This is the exact failure the UI hit, and
-- it must not become acceptable again.
-- ---------------------------------------------------------------------
do $$
begin
  perform public.open_dispute('PAY-2', 'Not as described',
    'The account did not match the listing description.');
  perform assert_that('the old UI label is still refused', false);
exception when others then
  perform assert_that(
    'the old UI label is still refused',
    position('Invalid dispute reason' in sqlerrm) > 0);
end $$;

select assert_that(
  'the refused label left no dispute behind',
  not exists (select 1 from public.disputes where order_no = 'PAY-2'));

do $$
begin
  perform public.open_dispute('PAY-3', 'invented_reason',
    'The account did not match the listing description.');
  perform assert_that('an unsupported reason is refused', false);
exception when others then
  perform assert_that(
    'an unsupported reason is refused',
    position('Invalid dispute reason' in sqlerrm) > 0);
end $$;

-- ---------------------------------------------------------------------
-- Only the buyer may open the dispute. A stranger is refused before the
-- reason is even considered.
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
do $$
begin
  perform public.open_dispute('PAY-2', 'not_as_described',
    'The account did not match the listing description.');
  perform assert_that('a non-buyer cannot open a dispute', false);
exception when others then
  perform assert_that(
    'a non-buyer cannot open a dispute',
    position('Only the buyer' in sqlerrm) > 0);
end $$;

reset role;

-- ---------------------------------------------------------------------
-- The database boundary itself rejects a label, independently of the RPC, so
-- even a direct insert cannot reintroduce one.
-- ---------------------------------------------------------------------
do $$
begin
  insert into public.disputes (order_no, opened_by, reason, detail)
  values ('PAY-2', '11111111-1111-1111-1111-111111111111',
          'Not as described', 'a detail long enough to look real');
  perform assert_that('the constraint rejects a label at the table', false);
exception when check_violation then
  perform assert_that('the constraint rejects a label at the table', true);
end $$;

-- ---------------------------------------------------------------------
-- The canonical vocabulary the database advertises matches the UI's.
-- ---------------------------------------------------------------------
select assert_that(
  'dispute_reasons() lists the five canonical values',
  (select public.dispute_reasons()) =
  array['not_as_described','transfer_failed','seller_unresponsive',
        'item_not_received','other']::text[]);

select done();

select count(*) as total,
       count(*) filter (where ok) as passed,
       count(*) filter (where not ok) as failed
  from results;

rollback;
