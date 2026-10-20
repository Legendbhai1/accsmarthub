-- =====================================================================
-- tests/dispute_reason_migration.sql
--
-- The bug this locks down: 0013 pins `disputes.reason` to a canonical
-- vocabulary, but the 0003-era buyer UI stored its human labels ("Not as
-- described"). Adding the constraint over rows like that aborts the whole
-- migration:
--
--   ERROR: check constraint "disputes_reason_check" of relation "disputes"
--          is violated by some row
--
-- and because 0013 was not transactional, the tables it had already created
-- stayed behind. This suite proves the repaired 0013 instead normalises the
-- legacy labels through an explicit, recorded mapping, refuses to guess at
-- anything else, and survives being run twice.
--
-- The runner applies every migration before this file, so 0013 has already
-- executed. The cases here drive `normalize_dispute_reasons()` directly — the
-- same function 0013 calls — to exercise the mapping without needing a
-- separate migration replay.
--
-- Run: tests/run-db-tests.sh tests/dispute_reason_migration.sql
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

-- A helper to build a dispute row with an arbitrary reason, bypassing the
-- constraint on purpose (the constraint is what is under test), so a legacy
-- row can be simulated on the migrated schema.
create or replace function seed_dispute(p_order text, p_reason text)
returns uuid language plpgsql security definer as $$
declare v_id uuid;
begin
  -- Take the constraint off, insert, put it back — exactly the state a
  -- pre-0013 database is in, where any text could be stored.
  alter table public.disputes drop constraint if exists disputes_reason_check;
  insert into public.disputes (order_no, opened_by, reason, detail)
  values (p_order, '11111111-1111-1111-1111-111111111111', p_reason,
          'a detail long enough to look real')
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Fixtures: one order per dispute, because a dispute is unique per order.
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'buyer@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'seller@example.com')
on conflict (id) do nothing;

insert into public.listings
  (id, listing_key, seller_id, title, brand, price_usd, stock, status)
values ('cccccccc-0000-0000-0000-000000000001', 'mig-key-1',
        '22222222-2222-2222-2222-222222222222', 'Mig Account', 'instagram',
        10, 0, 'active')
on conflict (id) do nothing;

insert into public.orders
  (order_no, listing_id, listing_title, brand, buyer_id, seller_id, quantity,
   unit_price_usd, gross_amount, escrow_fee_usd, total_usd,
   commission_amount, seller_net_amount, status)
values
  ('MIG-1', 'cccccccc-0000-0000-0000-000000000001', 'Mig Account', 'instagram',
   '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222', 1, 10, 10, 0.3, 10.3, 1, 9, 'disputed'),
  ('MIG-2', 'cccccccc-0000-0000-0000-000000000001', 'Mig Account', 'instagram',
   '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222', 1, 10, 10, 0.3, 10.3, 1, 9, 'disputed'),
  ('MIG-3', 'cccccccc-0000-0000-0000-000000000001', 'Mig Account', 'instagram',
   '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222', 1, 10, 10, 0.3, 10.3, 1, 9, 'disputed'),
  ('MIG-4', 'cccccccc-0000-0000-0000-000000000001', 'Mig Account', 'instagram',
   '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222', 1, 10, 10, 0.3, 10.3, 1, 9, 'disputed'),
  ('MIG-5', 'cccccccc-0000-0000-0000-000000000001', 'Mig Account', 'instagram',
   '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222', 1, 10, 10, 0.3, 10.3, 1, 9, 'disputed'),
  ('MIG-6', 'cccccccc-0000-0000-0000-000000000001', 'Mig Account', 'instagram',
   '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222', 1, 10, 10, 0.3, 10.3, 1, 9, 'disputed')
on conflict (order_no) do nothing;

-- A legacy row per UI label the 0003-era select could produce, plus a canonical
-- row that must be left completely alone.
select seed_dispute('MIG-1', 'Not as described');
select seed_dispute('MIG-2', 'Transfer failed');
select seed_dispute('MIG-3', 'Seller unresponsive');
select seed_dispute('MIG-4', 'Other');
select seed_dispute('MIG-5', 'not_as_described');   -- already canonical

-- ---------------------------------------------------------------------
-- The normalisation rewrites the labels, records what it did, and leaves the
-- canonical row untouched.
-- ---------------------------------------------------------------------
select public.normalize_dispute_reasons();

select assert_that(
  'legacy label "Not as described" becomes not_as_described',
  (select reason from public.disputes where order_no = 'MIG-1') = 'not_as_described');
select assert_that(
  'legacy label "Transfer failed" becomes transfer_failed',
  (select reason from public.disputes where order_no = 'MIG-2') = 'transfer_failed');
select assert_that(
  'legacy label "Seller unresponsive" becomes seller_unresponsive',
  (select reason from public.disputes where order_no = 'MIG-3') = 'seller_unresponsive');
select assert_that(
  'legacy label "Other" becomes other',
  (select reason from public.disputes where order_no = 'MIG-4') = 'other');
select assert_that(
  'a canonical row is left exactly as it was',
  (select reason from public.disputes where order_no = 'MIG-5') = 'not_as_described');

select assert_that(
  'the rewrite is recorded, one row per legacy value',
  (select count(*) from public.dispute_reason_normalizations
    where canonical_reason in ('not_as_described','transfer_failed','seller_unresponsive','other')) >= 4);
select assert_that(
  'the record names the legacy value and the canonical one',
  exists (select 1 from public.dispute_reason_normalizations
           where legacy_reason = 'Not as described'
             and canonical_reason = 'not_as_described'));

-- ---------------------------------------------------------------------
-- History is preserved: the rows keep their ids and their detail text.
-- ---------------------------------------------------------------------
select assert_that(
  'normalisation preserves the dispute id',
  (select count(*) from public.disputes
    where order_no in ('MIG-1','MIG-2','MIG-3','MIG-4','MIG-5')) = 5);
select assert_that(
  'normalisation preserves the free-text detail',
  (select detail from public.disputes where order_no = 'MIG-1')
    = 'a detail long enough to look real');

-- ---------------------------------------------------------------------
-- Re-running is a no-op: nothing left to rewrite, and the record does not
-- grow. This is the duplicate-run case.
-- ---------------------------------------------------------------------
do $$
declare before_count int; after_count int; rewritten int;
begin
  select count(*) into before_count from public.dispute_reason_normalizations;
  rewritten := public.normalize_dispute_reasons();
  select count(*) into after_count from public.dispute_reason_normalizations;
  perform assert_that('a second run rewrites nothing', rewritten = 0);
  perform assert_that('a second run adds no record rows', after_count = before_count);
end $$;

-- ---------------------------------------------------------------------
-- An unknown value is refused, not silently filed under 'other'. The failure
-- has to leave the database usable: mapped rows stay normalised and the
-- offending value is named.
-- ---------------------------------------------------------------------
select seed_dispute('MIG-6', 'some_invented_reason');

do $$
begin
  perform public.normalize_dispute_reasons();
  perform assert_that('an unmapped reason is refused', false);
exception when others then
  perform assert_that(
    'an unmapped reason is refused',
    position('unmapped' in sqlerrm) > 0);
  perform assert_that(
    'the refusal names the offending value',
    position('some_invented_reason' in sqlerrm) > 0);
end $$;

select assert_that(
  'the refusal does not coerce the row to other',
  (select reason from public.disputes where order_no = 'MIG-6') = 'some_invented_reason');

-- Restore the canonical value and confirm the migration is then able to add
-- the constraint — which is the operation that used to abort.
update public.disputes set reason = 'not_as_described' where order_no = 'MIG-1';
update public.disputes set reason = 'other' where order_no = 'MIG-6';

do $$
begin
  alter table public.disputes drop constraint if exists disputes_reason_check;
  alter table public.disputes
    add constraint disputes_reason_check check (reason in
      ('not_as_described','transfer_failed','seller_unresponsive',
       'item_not_received','other'));
  perform assert_that(
    'the constraint can be added once legacy rows are normalised', true);
exception when others then
  perform assert_that(
    'the constraint can be added once legacy rows are normalised [' || sqlerrm || ']',
    false);
end $$;

select assert_that(
  'the constraint is now present and canonical',
  exists (select 1 from pg_constraint c
           where c.conname = 'disputes_reason_check'
             and c.conrelid = 'public.disputes'::regclass
             and pg_get_constraintdef(c.oid) like '%item_not_received%'));

-- And a bad reason is rejected at the database boundary from here on.
do $$
begin
  update public.disputes set reason = 'Not as described' where order_no = 'MIG-1';
  perform assert_that('a label is rejected by the constraint', false);
exception when check_violation then
  perform assert_that('a label is rejected by the constraint', true);
end $$;

-- ---------------------------------------------------------------------
-- The normalisation function is not callable from a client session: it
-- rewrites dispute history and must stay server-side.
-- ---------------------------------------------------------------------
set local role authenticated;
select assert_that(
  'normalize_dispute_reasons is not executable by authenticated',
  not has_function_privilege('public.normalize_dispute_reasons()', 'execute'));
reset role;

-- The reconciliation record is server-only: RLS is on, there are no policies,
-- so a client session sees nothing even though the table grant is permissive
-- (the same shape as public.disposable_email_domains).
select assert_that(
  'the reconciliation record has RLS enabled',
  (select relrowsecurity from pg_class
    where oid = 'public.dispute_reason_normalizations'::regclass));
select assert_that(
  'the reconciliation record has no policies',
  not exists (select 1 from pg_policies
               where schemaname = 'public'
                 and tablename = 'dispute_reason_normalizations'));
do $$
declare visible int;
begin
  set local role authenticated;
  select count(*) into visible from public.dispute_reason_normalizations;
  reset role;
  perform assert_that('a client session cannot read the reconciliation record',
                      visible = 0);
end $$;

select done();

select count(*) as total,
       count(*) filter (where ok) as passed,
       count(*) filter (where not ok) as failed
  from results;

rollback;
