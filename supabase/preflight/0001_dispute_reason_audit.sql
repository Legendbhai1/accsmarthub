-- =====================================================================
-- supabase/preflight/0001_dispute_reason_audit.sql
--
-- READ-ONLY. Run this in the Supabase SQL Editor (or `psql`) against the
-- project BEFORE applying 0013. It writes nothing and changes nothing.
--
-- Why: 0013 pins `disputes.reason` to a canonical vocabulary. The 0003-era
-- table had no constraint, and the buyer UI of that era posted its human
-- labels ("Not as described"), so production may hold values the constraint
-- would reject. 0013 now normalises those through an explicit mapping and
-- refuses to guess at anything else, so the operator needs to know in advance
-- whether an unmapped value is going to stop it.
--
-- Results contain no personal data: only distinct reason values, their row
-- counts, and timestamps. Nothing here selects a user id, email or free text.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. Every distinct disputes.reason, and whether 0013 will accept it.
--    `verdict` is the whole answer:
--      canonical          - already correct, untouched by 0013
--      will be normalised - a known legacy label; 0013 rewrites it and
--                           records the change in dispute_reason_normalizations
--      UNMAPPED           - 0013 will raise. Add a mapping (or fix the row)
--                           before applying it.
-- ---------------------------------------------------------------------
with canonical(value) as (
  values ('not_as_described'), ('transfer_failed'), ('seller_unresponsive'),
         ('item_not_received'), ('other')
),
mapped(legacy) as (
  values ('Not as described'), ('Transfer failed'), ('Seller unresponsive'),
         ('Item not received'), ('Other'),
         ('not as described'), ('transfer failed'), ('seller unresponsive'),
         ('item not received'),
         ('NOT AS DESCRIBED'), ('TRANSFER FAILED'), ('SELLER UNRESPONSIVE'),
         ('ITEM NOT RECEIVED'), ('OTHER')
)
select d.reason,
       count(*) as rows,
       case
         when d.reason in (select value from canonical) then 'canonical'
         when d.reason in (select legacy from mapped)  then 'will be normalised'
         else 'UNMAPPED'
       end as verdict,
       min(d.created_at) as oldest,
       max(d.created_at) as newest
  from public.disputes d
 group by d.reason
 order by (d.reason in (select value from canonical)) asc,
          (d.reason in (select legacy from mapped)) asc,
          d.reason;

-- ---------------------------------------------------------------------
-- B. The one-line answer. If `unmapped` is 0, 0013 will apply without a stop.
-- ---------------------------------------------------------------------
select count(*) filter (
         where reason not in (
           'not_as_described','transfer_failed','seller_unresponsive',
           'item_not_received','other')
           and reason not in (
             'Not as described','Transfer failed','Seller unresponsive',
             'Item not received','Other',
             'not as described','transfer failed','seller unresponsive',
             'item not received',
             'NOT AS DESCRIBED','TRANSFER FAILED','SELLER UNRESPONSIVE',
             'ITEM NOT RECEIVED','OTHER')
       ) as unmapped_rows,
       count(*) as total_disputes
  from public.disputes;

-- ---------------------------------------------------------------------
-- C. Has 0013 already run part-way? The reconciliation record only exists
--    once 0013 has normalised something. A missing table is expected on a
--    0001-0006 project and is not an error.
-- ---------------------------------------------------------------------
select to_regclass('public.dispute_reason_normalizations') is not null
         as normalization_record_exists,
       to_regclass('public.order_events') is not null
         as order_events_exists,
       to_regclass('public.order_refunds') is not null
         as order_refunds_exists,
       exists (
         select 1 from pg_constraint c
          where c.conname = 'disputes_reason_check'
            and c.conrelid = 'public.disputes'::regclass
       ) as reason_constraint_present;

-- ---------------------------------------------------------------------
-- D. What has 0013 already rewritten? Run this ONLY if section C reported
--    normalization_record_exists = true (otherwise the table is absent and
--    the query errors). This is the audit trail to keep.
-- ---------------------------------------------------------------------
-- select legacy_reason, canonical_reason, affected_count, normalized_at
--   from public.dispute_reason_normalizations
--  order by normalized_at;
