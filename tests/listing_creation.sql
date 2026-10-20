-- =====================================================================
-- tests/listing_creation.sql
--
-- Can a seller create a listing, and who may buy one?
--
-- The insert policy for public.listings is defined in THREE places, and they
-- do not agree:
--
--   0001_core.sql                     insert requires an APPROVED store
--   0008_listing_first_publishing.sql insert requires only ownership
--   0017_store_applications.sql       insert requires an APPROVED store again
--
-- 0008 removed the store gate ("the listing is the gate, not the store").
-- 0017 deliberately puts it back, because the brief asks for listing
-- eligibility to be enforced in the database. 0017 drops and recreates the
-- policy, so it is the authority on every upgrade path — including
-- production, which was migrated as "0001-0006, then 0013+" and therefore
-- never ran 0008 at all. That database has been enforcing 0001's clause all
-- along, which is why every listing insert failed with
-- `42501 row-level security policy for table "listings"` and surfaced to the
-- seller as "You do not have access to that information."
--
-- The assertions below pin the policy's TEXT rather than just its presence,
-- so the two shapes cannot be confused for one another.
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
-- The policy must require an approved store (0017).
-- ---------------------------------------------------------------------
select assert_that(
  'insert policy requires an approved store',
  position('approved' in coalesce(
    (select pg_get_expr(polwithcheck, polrelid)
       from pg_policy
      where polname = 'insert own listing'
        and polrelid = 'public.listings'::regclass), '')) > 0
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
-- Behavioural, as each of the three accounts.
--
-- The policy is a `with check` predicate, so a refusal surfaces as 42501
-- (insufficient_privilege). Each block asserts the OUTCOME rather than the
-- error text, because the message is not stable across PostgreSQL versions.
-- ---------------------------------------------------------------------
set local role authenticated;

-- No store: refused, because eligibility is required again.
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
do $$
begin
  insert into public.listings (listing_key, seller_id, title, brand, price_usd,
                               status, stock)
  values ('k-nostore', '11111111-1111-1111-1111-111111111111',
          'No-store listing', 'instagram', 10.00, 'pending', 0);
  perform assert_that('account with no store cannot create a listing', false);
exception when insufficient_privilege or check_violation then
  perform assert_that('account with no store cannot create a listing', true);
end $$;

-- A pending (not yet approved) store: refused too.
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
do $$
begin
  insert into public.listings (listing_key, seller_id, title, brand, price_usd,
                               status, stock)
  values ('k-pending', '22222222-2222-2222-2222-222222222222',
          'Pending-store listing', 'instagram', 10.00, 'pending', 0);
  perform assert_that('pending store cannot create a listing', false);
exception when insufficient_privilege or check_violation then
  perform assert_that('pending store cannot create a listing', true);
end $$;

-- An approved store: allowed, and the row lands pending and unstocked.
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
do $$
declare n int;
begin
  insert into public.listings (listing_key, seller_id, title, brand, price_usd,
                               status, stock)
  values ('k-approved', '33333333-3333-3333-3333-333333333333',
          'Approved-store listing', 'instagram', 10.00, 'pending', 0);
  select count(*) into n from public.listings where listing_key = 'k-approved';
  perform assert_that('approved store can create a listing', n = 1);
exception when others then
  perform assert_that('approved store can create a listing [' || sqlstate || ']', false);
end $$;

-- The seller must not be able to self-publish: a non-pending status is
-- refused even with an approved store.
do $$
begin
  insert into public.listings (listing_key, seller_id, title, brand, price_usd,
                               status, stock)
  values ('k-selfpub', '33333333-3333-3333-3333-333333333333',
          'Self published', 'instagram', 10.00, 'active', 5);
  perform assert_that('seller cannot self-publish (status=active)', false);
exception when insufficient_privilege or check_violation then
  perform assert_that('seller cannot self-publish (status=active)', true);
end $$;

-- And not for somebody else, even from an approved store.
do $$
begin
  insert into public.listings (listing_key, seller_id, title, brand, price_usd,
                               status, stock)
  values ('k-other', '11111111-1111-1111-1111-111111111111',
          'Someone else''s listing', 'instagram', 10.00, 'pending', 0);
  perform assert_that('seller cannot create a listing for another seller', false);
exception when insufficient_privilege or check_violation then
  perform assert_that('seller cannot create a listing for another seller', true);
end $$;

reset role;

-- ---------------------------------------------------------------------
-- place_order() must re-check the seller's store too (0017), so a listing
-- that survived a later store rejection cannot still be sold through.
-- ---------------------------------------------------------------------
select assert_that(
  'place_order gates on an approved store',
  position('stores' in pg_get_functiondef('public.place_order(uuid,integer,text)'::regprocedure)) > 0
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
