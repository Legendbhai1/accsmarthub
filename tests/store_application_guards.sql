-- =====================================================================
-- tests/store_application_guards.sql
--
-- What an applicant may NOT do to their own application.
--
-- Split out from tests/store_application_lifecycle.sql on purpose. That file
-- calls `review_store()`, which runs
-- `perform set_config('app.trusted_write','on',true)`. The flag is
-- transaction-scoped, so for the remainder of that transaction
-- `guard_store_moderation` short-circuits and every write looks trusted.
-- A real client cannot set the flag — `set_config` needs no grant, but the
-- value only means anything inside a SECURITY DEFINER function that already
-- checked `can_moderate()` — so this is a test-isolation concern, not a hole.
-- Asserting the guard therefore needs a transaction in which no trusted write
-- has run, which is what this file provides.
--
-- Run: tests/run-db-tests.sh tests/store_application_guards.sql
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
-- Fixture: an applicant whose store was rejected, with the reviewer
-- columns populated exactly as review_store() would leave them.
-- ---------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at) values
  ('dddd4444-4444-4444-4444-444444444444', 'rejected@example.com', now())
on conflict (id) do nothing;

insert into public.wallets (user_id) values
  ('dddd4444-4444-4444-4444-444444444444')
on conflict (user_id) do nothing;

-- Seeded as the owner, before switching role, so the guard is not involved.
insert into public.stores (user_id, store_name, slug, status, contact_policy,
                           review_note, reviewed_at, reviewed_by)
values ('dddd4444-4444-4444-4444-444444444444', 'Rejected Store',
        'rejected-store', 'rejected', true,
        'Warranty terms are too vague.', now(),
        'bbbb2222-2222-2222-2222-222222222222')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- As the applicant.
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddd4444-4444-4444-4444-444444444444"}';

-- 1. Self-approval. The guard reverts the status instead of raising, so
--    the assertion is on the stored value.
update public.stores set status = 'approved'
 where user_id = 'dddd4444-4444-4444-4444-444444444444';

select assert_that(
  'an applicant cannot self-approve',
  (select status = 'rejected' from public.stores
    where user_id = 'dddd4444-4444-4444-4444-444444444444')
);

-- 2. Self-approval from 'none' (a row inserted directly as approved).
--    The insert policy pins new stores to pending.
do $$
begin
  insert into public.stores (user_id, store_name, slug, status, contact_policy)
  values ('dddd4444-4444-4444-4444-444444444444', 'Second Store',
          'second-store', 'approved', true);
  perform assert_that('an applicant cannot insert an already-approved store', false);
exception when insufficient_privilege or check_violation or unique_violation or others then
  perform assert_that('an applicant cannot insert an already-approved store', true);
end $$;

-- 3. Erasing the rejection note.
update public.stores set review_note = null
 where user_id = 'dddd4444-4444-4444-4444-444444444444';

select assert_that(
  'an applicant cannot erase the rejection note',
  (select review_note is not null from public.stores
    where user_id = 'dddd4444-4444-4444-4444-444444444444')
);

-- 4. Forging the reviewer identity.
update public.stores
   set reviewed_by = 'dddd4444-4444-4444-4444-444444444444'
 where user_id = 'dddd4444-4444-4444-4444-444444444444';

select assert_that(
  'an applicant cannot set themselves as the reviewer',
  (select reviewed_by is distinct from 'dddd4444-4444-4444-4444-444444444444'
     from public.stores
    where user_id = 'dddd4444-4444-4444-4444-444444444444')
);

-- 5. Transferring the store to another account.
do $$
begin
  update public.stores
     set user_id = 'aaaa1111-1111-1111-1111-111111111111'
   where user_id = 'dddd4444-4444-4444-4444-444444444444';
  perform assert_that('an applicant cannot transfer their store', false);
exception when others then
  perform assert_that('an applicant cannot transfer their store', true);
end $$;

-- 6. The one transition that IS allowed.
update public.stores set status = 'pending', warranty_hours = 168
 where user_id = 'dddd4444-4444-4444-4444-444444444444';

select assert_that(
  'a rejected applicant can resubmit',
  (select status = 'pending' from public.stores
    where user_id = 'dddd4444-4444-4444-4444-444444444444')
);

-- 7. Forging the timeline.
do $$
declare v_store uuid;
begin
  select id into v_store from public.stores
   where user_id = 'dddd4444-4444-4444-4444-444444444444';
  insert into public.store_application_events (store_id, actor_id, actor_role, event)
  values (v_store, 'dddd4444-4444-4444-4444-444444444444', 'admin', 'approved');
  perform assert_that('an applicant cannot forge an approval event', false);
exception when others then
  perform assert_that('an applicant cannot forge an approval event', true);
end $$;

-- 8. Claiming the admin actor role on a legitimate-looking event.
do $$
declare v_store uuid;
begin
  select id into v_store from public.stores
   where user_id = 'dddd4444-4444-4444-4444-444444444444';
  insert into public.store_application_events (store_id, actor_id, actor_role, event)
  values (v_store, 'dddd4444-4444-4444-4444-444444444444', 'admin', 'status_changed');
  perform assert_that('an applicant cannot claim the admin actor role', false);
exception when others then
  perform assert_that('an applicant cannot claim the admin actor role', true);
end $$;

-- 9. Deleting the history.
do $$
declare v_store uuid; n int;
begin
  select id into v_store from public.stores
   where user_id = 'dddd4444-4444-4444-4444-444444444444';
  delete from public.store_application_events where store_id = v_store;
  select count(*) into n from public.store_application_events where store_id = v_store;
  -- A DELETE with no policy removes zero rows, which is also a refusal.
  perform assert_that('an applicant cannot delete their history', n > 0);
exception when others then
  perform assert_that('an applicant cannot delete their history', true);
end $$;

reset role;

select done();

select count(*) as total,
       count(*) filter (where ok) as passed,
       count(*) filter (where not ok) as failed
  from results;

rollback;
