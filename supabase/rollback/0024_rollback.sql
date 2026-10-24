-- =====================================================================
-- supabase/rollback/0024_rollback.sql
--
-- ROLLBACK FOR 0024_revoke_client_grants.sql
--
-- 0024 only REVOKEs, so the rollback only GRANTs back exactly what it took:
--   * `anon`'s SELECT on the private tables;
--   * `authenticated`'s write on the money and audit tables;
--   * `authenticated`'s SELECT on the credential tables;
--   * EXECUTE on the trigger functions, and the function default privilege.
--
-- It restores the state as 0021 left it — NOT the pre-0021 Supabase default,
-- which granted anon writes and TRUNCATE on everything. Rolling 0021 back is
-- a separate, deliberate act.
--
-- Safe to re-run. It grants only; it drops nothing.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Restore `anon`'s SELECT on the private tables.
-- ---------------------------------------------------------------------
grant select on
  public.wallets, public.wallet_ledger, public.deposits, public.orders,
  public.order_events, public.order_payments, public.order_refunds,
  public.payout_requests, public.cart_items, public.notifications,
  public.saved_listings, public.order_requests, public.disputes,
  public.dispute_messages, public.listing_reviews,
  public.store_application_events, public.admin_audit,
  public.dispute_reason_normalizations, public.off_platform_reports,
  public.credential_downloads, public.listing_credentials
to anon;

-- ---------------------------------------------------------------------
-- 2. Restore `authenticated`'s write on the money and audit tables.
-- ---------------------------------------------------------------------
grant insert, update, delete on
  public.wallets, public.wallet_ledger, public.deposits, public.orders,
  public.order_events, public.order_payments, public.order_refunds,
  public.payout_requests, public.store_application_events,
  public.admin_audit, public.dispute_reason_normalizations,
  public.listing_reviews
to authenticated;

-- ---------------------------------------------------------------------
-- 3. Restore `authenticated`'s SELECT on the credential tables.
-- ---------------------------------------------------------------------
grant select on public.listing_credentials, public.credential_downloads
  to authenticated;

-- ---------------------------------------------------------------------
-- 4. Restore EXECUTE on the trigger functions.
-- ---------------------------------------------------------------------
grant execute on function public.handle_new_user() to public;
grant execute on function public.log_store_application_event() to anon, authenticated;
grant execute on function public.sync_profile_store_status() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Restore the sequence privileges.
-- ---------------------------------------------------------------------
grant usage, select, update on all sequences in schema public to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Restore the function and sequence default privileges.
-- ---------------------------------------------------------------------
alter default privileges in schema public
  grant execute on functions to anon;
alter default privileges in schema public
  grant usage, select, update on sequences to anon;

