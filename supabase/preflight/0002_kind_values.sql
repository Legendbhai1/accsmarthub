-- =====================================================================
-- supabase/preflight/0002_kind_values.sql
--
-- READ-ONLY. Run in the Supabase SQL Editor before applying 0014.
--
-- 0014 replaces `wallet_ledger_kind_check` and `notifications_kind_check`
-- with wider lists. It drops the old constraint and adds the new one in the
-- same migration, so if any existing row holds a kind outside the new list the
-- ALTER fails and 0014 stops. These queries name any such row in advance.
--
-- Results are counts and kind names only — no balances, no user ids, no
-- message bodies.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. wallet_ledger.kind values 0014's constraint would reject.
--    Expected: zero rows. The new list is a superset of 0001's.
-- ---------------------------------------------------------------------
select kind, count(*) as rows
  from public.wallet_ledger
 where kind not in (
   'deposit','purchase','escrow_hold','escrow_release','refund','adjustment',
   'payout_hold','payout_paid','payout_returned'
 )
 group by kind
 order by kind;

-- Every kind in use, for the record.
select kind, count(*) as rows
  from public.wallet_ledger
 group by kind
 order by kind;

-- ---------------------------------------------------------------------
-- B. notifications.kind values 0014's constraint would reject.
--    Expected: zero rows. The new list is a superset of 0009's.
-- ---------------------------------------------------------------------
select kind, count(*) as rows
  from public.notifications
 where kind not in (
   'order_placed','escrow_funded','awaiting_delivery','delivered',
   'delivery_confirmed','inspection_reminder','inspection_expired',
   'dispute_opened','dispute_updated','dispute_resolved',
   'payment_pending','payment_captured','payment_failed',
   'review_ready','review_received','refund_processed','replacement_requested',
   'cancellation_requested','cancelled','seller_review_request','admin_review',
   'payout_requested','payout_paid','payout_rejected'
 )
 group by kind
 order by kind;

-- Every kind in use, for the record.
select kind, count(*) as rows
  from public.notifications
 group by kind
 order by kind;

-- ---------------------------------------------------------------------
-- C. The one-line answer: how many rows would block 0014, across both tables.
--    Both figures must be 0 before 0014 is applied.
-- ---------------------------------------------------------------------
select
  (select count(*) from public.wallet_ledger
    where kind not in (
      'deposit','purchase','escrow_hold','escrow_release','refund','adjustment',
      'payout_hold','payout_paid','payout_returned')) as blocking_ledger_rows,
  (select count(*) from public.notifications
    where kind not in (
      'order_placed','escrow_funded','awaiting_delivery','delivered',
      'delivery_confirmed','inspection_reminder','inspection_expired',
      'dispute_opened','dispute_updated','dispute_resolved',
      'payment_pending','payment_captured','payment_failed',
      'review_ready','review_received','refund_processed','replacement_requested',
      'cancellation_requested','cancelled','seller_review_request','admin_review',
      'payout_requested','payout_paid','payout_rejected')) as blocking_notification_rows;

-- ---------------------------------------------------------------------
-- D. Which numbered migrations the project is actually running. There is no
--    `supabase_migrations` history table here (the project was migrated by
--    hand), so this reports the objects 0013 introduces as a proxy.
--    All four `false` = a 0001-0006 project, the state the review found.
-- ---------------------------------------------------------------------
select to_regclass('public.order_events')          is not null as m0013_order_events,
       to_regclass('public.order_refunds')         is not null as m0013_order_refunds,
       to_regclass('public.public_profiles')       is not null as m0013_public_profiles,
       to_regclass('public.payout_requests')       is not null as m0014_payout_requests,
       to_regclass('public.saved_listings')        is not null as m0016_saved_listings,
       to_regclass('public.schema_migrations')     is not null as runner_ledger_exists;

-- If the runner ledger exists, it lists what the hardened runner has applied.
-- (Commented out so this file stays valid when the ledger is absent.)
-- select filename, applied_at from public.schema_migrations order by filename;
