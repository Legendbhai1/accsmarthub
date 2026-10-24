-- =====================================================================
-- 0024_revoke_client_grants.sql
--
-- CLOSE THE TWO GAPS 0021 LEFT, WITHOUT RE-GRANTING ANYTHING.
--
-- 0021_security_hardening.sql already took the widest grants away:
--   * TRUNCATE / REFERENCES / TRIGGER from `anon` and `authenticated`;
--   * INSERT / UPDATE / DELETE on every table from `anon`.
-- It deliberately stopped there. It did NOT remove
--   (a) `anon`'s SELECT on the private tables, or
--   (b) `authenticated`'s INSERT/UPDATE/DELETE on the money and audit
--       tables,
-- and it did not touch function EXECUTE defaults.
--
-- So today a hostile signed-in client holds INSERT/UPDATE/DELETE on
-- `wallets`, `wallet_ledger`, `orders`, `admin_audit` and the rest, and RLS
-- is the ONLY thing refusing the write. Every one of those tables is written
-- by a SECURITY DEFINER function that runs as the owner, so no client needs
-- the privilege at all. This migration removes it, which means a single
-- mistake in a future policy is no longer sufficient to move money.
--
-- WHAT THIS FILE DOES NOT DO. It only REVOKEs. It never GRANTs, because a
-- blanket re-grant is how you silently undo a deliberate earlier revoke —
-- `0001_core.sql:778` revokes UPDATE on `public.profiles` from
-- `authenticated` on purpose, and the column grant on `name` is the whole
-- intended surface. An earlier draft of this migration re-granted table
-- UPDATE there and re-opened a self-escalation path that `test 7e` catches.
--
-- Every statement is idempotent and safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. `anon` may read only the public catalogue. 0021 removed its writes;
--    this removes its reads of everything a signed-out visitor has no
--    business seeing — money, orders, private messages, the cart, the
--    notification inbox, credentials and the audit trail.
-- ---------------------------------------------------------------------
revoke select on
  public.wallets, public.wallet_ledger, public.deposits, public.orders,
  public.order_events, public.order_payments, public.order_refunds,
  public.payout_requests, public.cart_items, public.notifications,
  public.saved_listings, public.order_requests, public.disputes,
  public.dispute_messages, public.listing_reviews,
  public.store_application_events, public.admin_audit,
  public.dispute_reason_normalizations, public.off_platform_reports,
  public.credential_downloads, public.listing_credentials
from anon;

-- Belt and braces: 0021 already did this, but re-asserting it here means
-- running 0024 alone is still safe on a database that skipped 0021.
revoke insert, update, delete, truncate on
  public.wallets, public.wallet_ledger, public.deposits, public.orders,
  public.order_events, public.order_payments, public.order_refunds,
  public.payout_requests, public.cart_items, public.notifications,
  public.saved_listings, public.order_requests, public.disputes,
  public.dispute_messages, public.listing_reviews,
  public.store_application_events, public.admin_audit,
  public.dispute_reason_normalizations, public.off_platform_reports,
  public.credential_downloads, public.listing_credentials
from anon;

-- ---------------------------------------------------------------------
-- 2. `authenticated`: remove write on the money and audit tables. Every
--    write to these goes through a SECURITY DEFINER function, which is
--    unaffected by the caller's privileges. The tables a client DOES write
--    directly (listings, stores, reviews, profiles, cart_items,
--    notifications, saved_listings, order_requests, disputes,
--    dispute_messages, off_platform_reports, store_reviews) keep their
--    grants and their RLS policies.
-- ---------------------------------------------------------------------
revoke insert, update, delete, truncate on
  public.wallets, public.wallet_ledger, public.deposits, public.orders,
  public.order_events, public.order_payments, public.order_refunds,
  public.payout_requests, public.store_application_events,
  public.admin_audit, public.dispute_reason_normalizations,
  public.listing_reviews
from authenticated;

-- ---------------------------------------------------------------------
-- 3. The credential tables are default-deny (RLS on, no policy) and their
--    values are AES-GCM ciphertext delivered only through an Edge Function
--    that holds the passphrase. A client should not hold SELECT at all.
-- ---------------------------------------------------------------------
revoke select on public.listing_credentials, public.credential_downloads
  from authenticated;

-- ---------------------------------------------------------------------
-- 5. Sequences. A client INSERT into a table with a sequence-backed default
--    needs USAGE on that sequence. The only such columns are
--    `wallet_ledger.id`, `order_events.id` and `store_application_events.id`
--    — all money/audit tables whose client write this migration removes — so
--    no client role needs USAGE, SELECT or UPDATE on any sequence. Revoking
--    it removes the last way a client could touch the ledger's key space.
-- ---------------------------------------------------------------------
revoke usage, select, update on all sequences in schema public
  from anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Trigger functions return `trigger` and can only be fired by their
--    trigger, so no client role should be able to call one directly. The
--    RLS helpers (`is_admin`, `is_dispute_party`, `is_disposable_domain`)
--    and the client RPCs are NOT touched: policies are evaluated as the
--    caller, so revoking a helper would make every policy error.
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
     where p.prokind = 'f'
       and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function public.%I(%s) from anon, authenticated, public',
                   r.proname, r.args);
  end loop;
end
$$;

-- ---------------------------------------------------------------------
-- 7. Default privileges. 0021 fixed the table defaults; this closes the
--    function and sequence ones, so a future `create function` or
--    `create sequence` is not automatically anon-executable/usable. A
--    migration that wants an anonymous caller must grant it explicitly (as
--    the dispute helpers do), which is the intent.
-- ---------------------------------------------------------------------
alter default privileges in schema public
  revoke execute on functions from anon;
alter default privileges in schema public
  revoke usage, select, update on sequences from anon;

-- ---------------------------------------------------------------------
-- 8. Assert the invariants. A failure rolls the whole transaction back
--    rather than shipping a half-revoked schema.
-- ---------------------------------------------------------------------
do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
   where c.relkind in ('r', 'p')
     and (has_table_privilege('anon', c.oid, 'INSERT')
       or has_table_privilege('anon', c.oid, 'UPDATE')
       or has_table_privilege('anon', c.oid, 'DELETE'));
  if v_bad > 0 then
    raise exception 'anon still holds a write privilege on % table(s)', v_bad;
  end if;

  select count(*) into v_bad
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
   where c.relname in ('wallet_ledger', 'wallets', 'orders', 'order_payments',
                       'order_events', 'order_refunds', 'deposits',
                       'payout_requests', 'admin_audit',
                       'store_application_events', 'listing_reviews',
                       'dispute_reason_normalizations')
     and (has_table_privilege('authenticated', c.oid, 'INSERT')
       or has_table_privilege('authenticated', c.oid, 'UPDATE')
       or has_table_privilege('authenticated', c.oid, 'DELETE'));
  if v_bad > 0 then
    raise exception 'authenticated still holds a write privilege on % money/audit table(s)', v_bad;
  end if;

  if has_table_privilege('anon', 'public.listing_credentials', 'SELECT')
     or has_table_privilege('authenticated', 'public.listing_credentials', 'SELECT') then
    raise exception 'listing_credentials is still readable by a client role';
  end if;

  -- The public catalogue must stay readable, or browsing breaks.
  if not has_table_privilege('anon', 'public.listings', 'SELECT')
     or not has_table_privilege('authenticated', 'public.listings', 'SELECT') then
    raise exception 'listings lost SELECT — browsing would break';
  end if;

  -- A policy helper must stay callable, or every policy errors.
  if not has_function_privilege('anon', 'public.is_admin()', 'EXECUTE') then
    raise exception 'anon lost EXECUTE on is_admin() — RLS policies would error';
  end if;
end
$$;
