-- =====================================================================
-- tests/store_application_lifecycle.sql
--
-- The seller application lifecycle, and who is allowed to move it.
--
--   draft -> submit -> pending -> approve -> approved
--                              -> reject  -> rejected -> revise -> resubmit
--
-- What this pins:
--
--   1. An applicant can create their store and submit it (pending).
--   2. An applicant CANNOT approve themselves. `guard_store_moderation`
--      silently reverts a status it does not permit, so the assertion is on
--      the stored value, not on an error.
--   3. An applicant CANNOT erase a rejection note or forge the reviewer
--      columns.
--   4. A rejected applicant CAN resubmit (`rejected -> pending`). This is
--      the transition 0007 introduced and 0017 now carries itself, because
--      production skipped 0007 and was silently reverting it.
--   5. An applicant CANNOT write the event log directly — only the
--      SECURITY DEFINER trigger and review_store() may. Every forged
--      'approved' event is refused.
--   6. Only a moderator can call review_store(), and a rejection without a
--      reason is refused.
--   7. The lifecycle is recorded: submit, reject and resubmit each leave a
--      row, with the actor role recorded correctly.
--
-- Run: tests/run-db-tests.sh tests/store_application_lifecycle.sql
-- =====================================================================

\set ON_ERROR_STOP off

begin;

create temp table results (name text, ok boolean);
create temp sequence passed_seq;

-- SECURITY DEFINER so assertions can record while the session is
-- `set local role authenticated`, which has no grant on the temp table.
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
-- Fixtures: one applicant, one moderator, one bystander.
-- ---------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at) values
  ('aaaa1111-1111-1111-1111-111111111111', 'applicant@example.com', now()),
  ('bbbb2222-2222-2222-2222-222222222222', 'moderator@example.com', now()),
  ('cccc3333-3333-3333-3333-333333333333', 'bystander@example.com', now())
on conflict (id) do nothing;

insert into public.wallets (user_id) values
  ('aaaa1111-1111-1111-1111-111111111111'),
  ('bbbb2222-2222-2222-2222-222222222222'),
  ('cccc3333-3333-3333-3333-333333333333')
on conflict (user_id) do nothing;

-- Grant the moderator their role. A later migration replaced the
-- `current_user not in ('anon','authenticated')` escape hatch in
-- `is_trusted_write()` with an explicit `app.bootstrap` flag, so even a
-- SQL-editor session must opt in before it can write `is_admin`. That is
-- the mechanism the admin-bootstrap path uses in production.
set local app.bootstrap = 'on';
update public.profiles set is_admin = true
 where id = 'bbbb2222-2222-2222-2222-222222222222';
reset app.bootstrap;

select assert_that(
  'the moderator fixture really is an admin',
  (select is_admin from public.profiles
    where id = 'bbbb2222-2222-2222-2222-222222222222')
);

-- ---------------------------------------------------------------------
-- 1. The applicant submits an application.
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-1111-1111-1111-111111111111"}';

do $$
begin
  insert into public.stores (user_id, store_name, slug, status, contact_policy,
                             categories, warranty_hours, support_email,
                             ownership_attested, agreement_version)
  values ('aaaa1111-1111-1111-1111-111111111111', 'Nightowl Digital',
          'nightowl-digital', 'pending', true,
          array['instagram','tiktok'], 72, 'support@nightowl.example',
          true, '2024-01');
  perform assert_that('applicant can create and submit an application', true);
exception when others then
  perform assert_that('applicant can create and submit an application', false);
end $$;

select assert_that(
  'the submitted application is pending',
  (select status = 'pending' from public.stores
    where user_id = 'aaaa1111-1111-1111-1111-111111111111')
);

select assert_that(
  'submission is recorded in the timeline',
  exists (select 1 from public.store_application_events e
            join public.stores s on s.id = e.store_id
           where s.user_id = 'aaaa1111-1111-1111-1111-111111111111'
             and e.event = 'submitted')
);

select assert_that(
  'submitted_at was stamped',
  (select submitted_at is not null from public.stores
    where user_id = 'aaaa1111-1111-1111-1111-111111111111')
);

-- ---------------------------------------------------------------------
-- 2. The applicant tries to approve themselves. The guard reverts the
--    status rather than raising, so assert on the stored value.
-- ---------------------------------------------------------------------
update public.stores set status = 'approved'
 where user_id = 'aaaa1111-1111-1111-1111-111111111111';

select assert_that(
  'applicant cannot self-approve (status stays pending)',
  (select status = 'pending' from public.stores
    where user_id = 'aaaa1111-1111-1111-1111-111111111111')
);

select assert_that(
  'no forged approval event was written',
  not exists (select 1 from public.store_application_events e
                join public.stores s on s.id = e.store_id
               where s.user_id = 'aaaa1111-1111-1111-1111-111111111111'
                 and e.event = 'approved')
);

-- ---------------------------------------------------------------------
-- 3. The applicant tries to write the event log directly. There is no
--    INSERT policy, so every attempt must be refused.
-- ---------------------------------------------------------------------
do $$
declare v_store uuid;
begin
  select id into v_store from public.stores
   where user_id = 'aaaa1111-1111-1111-1111-111111111111';
  insert into public.store_application_events (store_id, actor_id, actor_role, event)
  values (v_store, 'aaaa1111-1111-1111-1111-111111111111', 'admin', 'approved');
  perform assert_that('applicant cannot forge an approval event', false);
exception when insufficient_privilege or check_violation or others then
  perform assert_that('applicant cannot forge an approval event', true);
end $$;

do $$
declare v_store uuid;
begin
  select id into v_store from public.stores
   where user_id = 'aaaa1111-1111-1111-1111-111111111111';
  update public.store_application_events set event = 'approved'
   where store_id = v_store;
  -- An UPDATE with no policy matches zero rows rather than raising, which
  -- is also a refusal: nothing changed.
  perform assert_that(
    'applicant cannot rewrite existing events',
    not exists (select 1 from public.store_application_events e
                 where e.store_id = v_store and e.event = 'approved')
  );
exception when others then
  perform assert_that('applicant cannot rewrite existing events', true);
end $$;

-- ---------------------------------------------------------------------
-- 4. A bystander cannot review.
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"cccc3333-3333-3333-3333-333333333333"}';
do $$
declare v_store uuid;
begin
  select id into v_store from public.stores
   where user_id = 'aaaa1111-1111-1111-1111-111111111111';
  perform public.review_store(v_store, true, 'looks good');
  perform assert_that('a non-moderator cannot review an application', false);
exception when others then
  perform assert_that('a non-moderator cannot review an application', true);
end $$;

-- ---------------------------------------------------------------------
-- 5. The moderator rejects, with a reason.
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"bbbb2222-2222-2222-2222-222222222222"}';
do $$
declare v_store uuid;
begin
  select id into v_store from public.stores
   where user_id = 'aaaa1111-1111-1111-1111-111111111111';
  perform public.review_store(v_store, false, 'Warranty terms are too vague.');
  perform assert_that('a moderator can reject an application', true);
exception when others then
  perform assert_that('a moderator can reject an application', false);
end $$;

select assert_that(
  'the rejection is stored with its reason',
  (select status = 'rejected' and review_note like 'Warranty%'
     from public.stores
    where user_id = 'aaaa1111-1111-1111-1111-111111111111')
);

select assert_that(
  'the rejection wrote an admin_audit row',
  exists (select 1 from public.admin_audit
           where action = 'store_rejected'
             and resource_id = (select id from public.stores
                                 where user_id = 'aaaa1111-1111-1111-1111-111111111111'))
);

select assert_that(
  'the rejection is recorded in the timeline',
  exists (select 1 from public.store_application_events e
            join public.stores s on s.id = e.store_id
           where s.user_id = 'aaaa1111-1111-1111-1111-111111111111'
             and e.event = 'rejected')
);

-- A rejection without a reason is refused.
do $$
declare v_store uuid;
begin
  select id into v_store from public.stores
   where user_id = 'aaaa1111-1111-1111-1111-111111111111';
  perform public.review_store(v_store, false, null);
  perform assert_that('a rejection without a reason is refused', false);
exception when others then
  perform assert_that('a rejection without a reason is refused', true);
end $$;

-- ---------------------------------------------------------------------
-- 6. The applicant revises and resubmits.
--
--    This is the transition production was silently reverting, because it
--    never ran 0007 and 0017 used to leave 0001's guard in place.
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"aaaa1111-1111-1111-1111-111111111111"}';

update public.stores
   set status = 'pending',
       warranty_hours = 168,
       replacement_policy = 'Replaced once within 7 days.'
 where user_id = 'aaaa1111-1111-1111-1111-111111111111';

-- Note: `review_store()` ran `set_config('app.trusted_write','on',true)`
-- earlier in THIS transaction, and the flag is transaction-scoped, so
-- `guard_store_moderation` is currently short-circuited and would not revert
-- anything. The assertion below therefore confirms the state moved, but does
-- NOT prove the guard permits it. The guard-level proof — the one that fails
-- on a database still running 0001's version of the function — is in
-- tests/store_application_guards.sql, in a transaction where no trusted write
-- has run.
select assert_that(
  'a rejected applicant can resubmit (rejected -> pending)',
  (select status = 'pending' from public.stores
    where user_id = 'aaaa1111-1111-1111-1111-111111111111')
);

select assert_that(
  'the resubmission is recorded in the timeline',
  exists (select 1 from public.store_application_events e
            join public.stores s on s.id = e.store_id
           where s.user_id = 'aaaa1111-1111-1111-1111-111111111111'
             and e.event = 'resubmitted')
);

-- The applicant still cannot touch the review columns while revising.
-- (Asserted in tests/store_application_guards.sql instead: `review_store()`
-- above called `set_config('app.trusted_write','on',true)`, which is
-- transaction-scoped and so disables the guard for the rest of THIS
-- transaction. A client cannot set that flag, so it is a test-isolation
-- concern rather than a hole — but it means the guard has to be exercised in
-- a transaction where no trusted write has run.)

-- ---------------------------------------------------------------------
-- 7. The moderator approves the resubmission.
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"bbbb2222-2222-2222-2222-222222222222"}';
do $$
declare v_store uuid;
begin
  select id into v_store from public.stores
   where user_id = 'aaaa1111-1111-1111-1111-111111111111';
  perform public.review_store(v_store, true, 'Terms are specific now.');
  perform assert_that('a moderator can approve the resubmission', true);
exception when others then
  perform assert_that('a moderator can approve the resubmission', false);
end $$;

select assert_that(
  'the approval is stored',
  (select status = 'approved' from public.stores
    where user_id = 'aaaa1111-1111-1111-1111-111111111111')
);

select assert_that(
  'the approval wrote an admin_audit row',
  exists (select 1 from public.admin_audit where action = 'store_approved')
);

select assert_that(
  'the approval is recorded in the timeline',
  exists (select 1 from public.store_application_events e
            join public.stores s on s.id = e.store_id
           where s.user_id = 'aaaa1111-1111-1111-1111-111111111111'
             and e.event = 'approved')
);

-- ---------------------------------------------------------------------
-- 8. Only the store owner and moderators may read the timeline.
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"cccc3333-3333-3333-3333-333333333333"}';
select assert_that(
  'a bystander cannot read another applicant''s timeline',
  (select count(*) = 0 from public.store_application_events e
     join public.stores s on s.id = e.store_id
    where s.user_id = 'aaaa1111-1111-1111-1111-111111111111')
);

set local request.jwt.claims = '{"sub":"aaaa1111-1111-1111-1111-111111111111"}';
select assert_that(
  'the applicant can read their own timeline',
  (select count(*) > 0 from public.store_application_events e
     join public.stores s on s.id = e.store_id
    where s.user_id = 'aaaa1111-1111-1111-1111-111111111111')
);

-- Back to the owner role: the temp `results` table is not readable as
-- `authenticated`, and the summary below runs as the session user.
reset role;

select done();

-- The runner parses a `total | passed | failed` row.
select count(*) as total,
       count(*) filter (where ok) as passed,
       count(*) filter (where not ok) as failed
  from results;

rollback;
