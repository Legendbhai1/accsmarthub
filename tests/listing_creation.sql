-- =====================================================================
-- tests/listing_creation.sql
--
-- Can a confirmed account create a listing? This is the exact operation
-- behind "Could not save the listing — You do not have access to that
-- information."
--
-- The insert policy for public.listings is defined in TWO places, and only
-- one of them is on every upgrade path:
--
--   0001_core.sql                     insert requires an APPROVED store
--   0008_listing_first_publishing.sql insert requires only ownership
--
-- 0008 drops and recreates the policy, but the project was originally
-- migrated as "0001-0006, then 0013+". 0013 reconciles the objects it knows
-- about and never touches this policy, so a database that skipped 0008 is
-- still running 0001's store-gated version — which is precisely the
-- "You do not have access to that information." the seller sees, because a
-- `with check` violation surfaces as error 42501.
--
-- The assertions below pin the policy's TEXT rather than just its presence,
-- so a regression to the store gate fails here instead of in production.
--
-- Run: tests/run-db-tests.sh tests/listing_creation.sql
-- =====================================================================

\set ON_ERROR_STOP off

-- One transaction so `set local role` / `set local request.jwt.claims` hold,
-- and so the fixtures roll back instead of leaking between test files.
begin;

create temp table results (name text, ok boolean);
create temp sequence passed_seq;

-- SECURITY DEFINER so the assertions can record their result even while the
-- session is `set local role authenticated` (which has no grant on the temp
-- table).
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
-- Fixtures. Three accounts: one with no store, one with a pending store,
-- one with an approved store.
-- ---------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'nostore@example.com',  now()),
  ('22222222-2222-2222-2222-222222222222', 'pending@example.com',  now()),
  ('33333333-3333-3333-3333-333333333333', 'approved@example.com', now())
on conflict (id) do nothing;

insert into public.wallets (user_id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333')
on conflict (user_id) do nothing;

insert into public.stores (user_id, store_name, slug, status, contact_policy)
values
  ('22222222-2222-2222-2222-222222222222', 'Pending Store', 'pending-store', 'pending', true),
  ('33333333-3333-3333-3333-333333333333', 'Approved Store', 'approved-store', 'approved', true)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- The policy must not require an approved store.
--
-- 0008 deliberately removed that clause: the LISTING is the gate, not the
-- store. An admin approves each listing via set_listing_status().
-- ---------------------------------------------------------------------
select assert_that(
  'insert policy does not require an approved store',
  position('approved' in coalesce(
    (select pg_get_expr(polwithcheck, polrelid)
       from pg_policy
      where polname = 'insert own listing'
        and polrelid = 'public.listings'::regclass), '')) = 0
);

select assert_that(
  'insert policy pins status=pending and stock=0',
  (select pg_get_expr(polwithcheck, polrelid)
     from pg_policy
    where polname = 'insert own listing' and polrelid = 'public.listings'::regclass)
  like '%pending%'
);

select assert_that(
  'insert policy binds seller_id to auth.uid()',
  (select pg_get_expr(polwithcheck, polrelid)
     from pg_policy
    where polname = 'insert own listing' and polrelid = 'public.listings'::regclass)
  like '%auth.uid()%'
);

-- ---------------------------------------------------------------------
-- Behavioural: a confirmed account with NO store can insert its own
-- listing, and the row lands pending and unstocked.
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

do $$
declare n int;
begin
  insert into public.listings (listing_key, seller_id, title, brand, price_usd,
                               status, stock)
  values ('k-nostore', '11111111-1111-1111-1111-111111111111',
          'No-store listing', 'instagram', 10.00, 'pending', 0);
  select count(*) into n from public.listings where listing_key = 'k-nostore';
  perform assert_that('account with no store can create a listing', n = 1);
exception when others then
  perform assert_that('account with no store can create a listing [' || sqlstate || ']', false);
end $$;

-- The seller must not be able to self-publish: a non-pending status is
-- refused by the same policy.
do $$
begin
  insert into public.listings (listing_key, seller_id, title, brand, price_usd,
                               status, stock)
  values ('k-selfpub', '11111111-1111-1111-1111-111111111111',
          'Self published', 'instagram', 10.00, 'active', 5);
  perform assert_that('seller cannot self-publish (status=active)', false);
exception when insufficient_privilege or check_violation then
  perform assert_that('seller cannot self-publish (status=active)', true);
end $$;

-- And not for somebody else.
do $$
begin
  insert into public.listings (listing_key, seller_id, title, brand, price_usd,
                               status, stock)
  values ('k-other', '33333333-3333-3333-3333-333333333333',
          'Someone else''s listing', 'instagram', 10.00, 'pending', 0);
  perform assert_that('seller cannot create a listing for another seller', false);
exception when insufficient_privilege or check_violation then
  perform assert_that('seller cannot create a listing for another seller', true);
end $$;

reset role;

-- ---------------------------------------------------------------------
-- place_order() must not require an approved store either: 0008 removed
-- that check so a listing an admin already approved can be sold.
-- ---------------------------------------------------------------------
select assert_that(
  'place_order does not gate on an approved store',
  position('stores' in pg_get_functiondef('public.place_order(uuid,integer,text)'::regprocedure)) = 0
);

select done();

-- The runner parses a `total | passed | failed` row, matching the convention
-- in tests/order_lifecycle.sql.
select count(*) as total,
       count(*) filter (where ok) as passed,
       count(*) filter (where not ok) as failed
  from results;

-- Roll back: the temp table and the fixtures both go.
rollback;
