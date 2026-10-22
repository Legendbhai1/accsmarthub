-- =====================================================================
-- 0021_security_hardening.sql
--
-- FIVE HOLES, ALL REPRODUCIBLE WITH THE PUBLISHABLE KEY FROM A BROWSER.
--
-- Every item below was demonstrated against a database built from this
-- repository's own migrations, in a session that had done nothing but
-- `set local role authenticated`. The reproduction is in the comment above
-- each fix.
--
--   S1  A signed-in user could TRUNCATE any table, wallets included.
--   S2  A signed-in user could write a notification into anyone's inbox.
--   S3  A signed-in user could set `app.trusted_write` themselves and then
--       self-publish a listing, self-approve a store, or set any stock.
--   S4  A signed-in user could mark a stranger's order delivered.
--   S5  Anonymous requests could reach RPCs that assume a session.
--
-- None of these are visible to tsc, eslint, vitest or vite build. Run
-- `tests/verify-migrations.sh` after applying; it pins each one.
--
-- Apply with:
--   SUPABASE_PROJECT_REF=<ref> SUPABASE_ACCESS_TOKEN=sbp_... \
--     node scripts/migrate.mjs supabase/migrations/0021_security_hardening.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- S1. Table privileges: TRUNCATE, REFERENCES and TRIGGER are never
--     justified for a PostgREST client, and TRUNCATE is not subject to
--     row level security at all.
--
--     Reproduced:
--       set local role authenticated;
--       truncate public.wallets;        --> TRUNCATE TABLE   (no error)
--
--     Every table carried `alter default privileges ... grant all`, so a
--     client held DELETE/INSERT/UPDATE/TRUNCATE/REFERENCES/TRIGGER on all
--     58 public objects. RLS hides rows, not privileges, and it does not
--     apply to TRUNCATE or REFERENCES — so the widest grant was the one
--     control that could not stop it. `anon` is additionally made
--     read-only: every write in this application needs a session.
-- ---------------------------------------------------------------------
revoke truncate, references, trigger on all tables in schema public
  from anon, authenticated;
revoke insert, update, delete on all tables in schema public
  from anon;

-- The views are read projections; they must not carry write privileges
-- either. `anon` is already covered above, this closes `authenticated`.
revoke insert, update, delete, truncate, references, trigger
  on public.public_profiles from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.v_admin_disputes from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.v_admin_ledger from anon, authenticated;

-- New tables must not inherit the wide grant either. Default privileges
-- only cover objects created by the role that runs this statement, which
-- is the migration role — the same role future migrations use.
alter default privileges in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
alter default privileges in schema public
  revoke insert, update, delete on tables from anon;

-- ---------------------------------------------------------------------
-- S2. notify() was callable by any signed-in user, with the recipient as
--     an argument.
--
--     Reproduced:
--       set local role authenticated;
--       select public.notify('<victim uuid>', 'admin_review',
--              'Your account is suspended', 'Pay a fee to appeal', null);
--       --> the row lands in the victim's inbox
--
--     That is a phishing primitive aimed at the platform's own users, sent
--     from the platform's own notification feed. notify() is only ever
--     called from inside a SECURITY DEFINER function (checkout, delivery,
--     moderation, settlement), where current_user is the function owner, so
--     it does not need a client grant at all.
-- ---------------------------------------------------------------------
revoke all on function public.notify(uuid, text, text, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- S3. is_trusted_write() trusted a GUC that the client can set.
--
--     Reproduced:
--       set local role authenticated;
--       select set_config('app.trusted_write','on',true);
--       update public.listings set status='active', stock=9999
--        where seller_id = auth.uid();   --> published, stock forged
--       update public.stores set status='approved' ...  --> self-approved
--       set_config('app.bootstrap','on',true) + is_admin=true  --> escalation
--
--     The guard triggers short-circuit on this predicate, so whoever sets
--     the flag turns off every field guard at once. The opt-in flag is
--     still the right mechanism *inside* trusted code — but a flag alone
--     cannot be the whole check, because any client can set it. The
--     unforgeable half is the effective role: a client session is always
--     `anon` or `authenticated`, while a SECURITY DEFINER function runs as
--     its owner. Requiring BOTH means an internal function still opts in
--     explicitly, and a client's `set_config` no longer means anything.
--
--     `app.bootstrap` is kept for the SQL-editor path that seeds the first
--     administrator; that session runs as a non-client role, so it still
--     passes the role half.
-- ---------------------------------------------------------------------
create or replace function public.is_trusted_write()
returns boolean language sql stable set search_path = public as $$
  select current_user not in ('anon', 'authenticated')
     and (
       public.can_moderate()
       or coalesce(current_setting('app.trusted_write', true), 'off') = 'on'
       or coalesce(current_setting('app.bootstrap', true), 'off') = 'on'
     );
$$;

-- ---------------------------------------------------------------------
-- S4. Internal state mutators were reachable as RPCs.
--
--     Reproduced:
--       set local role authenticated;             -- an unrelated account
--       select public.finish_single_order_delivery(
--                '<someone else''s order_no>', '<the real buyer uuid>');
--       --> delivery_status becomes 'delivered'
--
--     finish_single_order_delivery() trusts its arguments and checks no
--     ownership, and it is called only from checkout()/settlement — both
--     SECURITY DEFINER, so the owner can still reach it. Same story for the
--     provider/payment helpers: provider_invoice_opened() decrements stock
--     and opens a payment row, and the sweeps and webhook verifier are
--     server jobs. None of them is called from the browser.
-- ---------------------------------------------------------------------
revoke all on function public.finish_single_order_delivery(text, uuid)
  from public, anon, authenticated;
revoke all on function public.provider_invoice_opened(
  uuid, text, text, numeric, uuid, integer) from public, anon, authenticated;
revoke all on function public.sweep_abandoned_provider_payments(integer)
  from public, anon, authenticated;
revoke all on function public.verify_order_payment_webhook(
  text, text, text, text, numeric, text, bytea, text)
  from public, anon, authenticated;
revoke all on function public.tg_log_order_event()
  from public, anon, authenticated;
revoke all on function public.tg_log_dispute_event()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- S5. The `anon` role could execute RPCs that require a session.
--
--     Reproduced:
--       set local role anon;
--       select public.checkout(null, null, 1, 'k');
--       --> reaches the function body (it only then raises 'Signed in only')
--
--     Each of these raises on a null auth.uid(), so none was exploitable on
--     its own — but an anonymous request should not reach the money and
--     order machinery at all, and a future edit that drops one `auth.uid()`
--     check would become a live hole rather than a refused call.
--
--     These functions carry a PUBLIC grant (`=X`) as well as the anon/
--     authenticated grants, and `revoke ... from anon` does NOT remove a
--     PUBLIC grant — anon keeps executing through PUBLIC. Every statement
--     below therefore revokes `from public, anon`; the explicit
--     `authenticated` grant made by the migrations is what remains.
--
--     The genuinely public helpers (is_admin, can_moderate, is_service_role,
--     is_trusted_write, is_dispute_party, evidence_dispute_id,
--     dispute_reasons, is_disposable_domain) keep their grants, because RLS
--     policies and the storage policies call them as the querying role.
-- ---------------------------------------------------------------------
revoke execute on function public.cart_add(uuid, integer) from public, anon;
revoke execute on function public.cart_remove(uuid) from public, anon;
revoke execute on function public.cart_set(uuid, integer) from public, anon;
revoke execute on function public.checkout(uuid, uuid[], integer, text) from public, anon;
revoke execute on function public.place_order(uuid, integer, text) from public, anon;
revoke execute on function public.open_deposit(numeric, text) from public, anon;
revoke execute on function public.open_dispute(text, text, text) from public, anon;
revoke execute on function public.add_dispute_message(uuid, text, jsonb) from public, anon;
revoke execute on function public.resolve_dispute(uuid, text, text, numeric, text) from public, anon;
revoke execute on function public.resolve_dispute_with_audit(uuid, text, text) from public, anon;
revoke execute on function public.start_dispute_review(uuid) from public, anon;
revoke execute on function public.resolve_order_request(uuid, text, text) from public, anon;
revoke execute on function public.request_replacement(text, text) from public, anon;
revoke execute on function public.request_cancellation(text, text) from public, anon;
revoke execute on function public.submit_review(text, integer, text, text) from public, anon;
revoke execute on function public.confirm_delivery(text) from public, anon;
revoke execute on function public.complete_order(text) from public, anon;
revoke execute on function public.mark_order_delivered(text, text, text) from public, anon;
revoke execute on function public.mark_order_delivered(text, text) from public, anon;
revoke execute on function public.refund_order(text, text, text) from public, anon;
revoke execute on function public.refund_order_partial(text, numeric, text, text) from public, anon;
revoke execute on function public.download_credentials(text) from public, anon;
revoke execute on function public.upload_credentials(uuid, jsonb) from public, anon;
revoke execute on function public.credential_status(uuid) from public, anon;
revoke execute on function public.request_payout(numeric, text, text, text) from public, anon;
revoke execute on function public.resolve_payout(uuid, text, text, text) from public, anon;
revoke execute on function public.resolve_report(uuid, text, text) from public, anon;
revoke execute on function public.review_store(uuid, boolean, text) from public, anon;
revoke execute on function public.set_listing_status(uuid, text, text) from public, anon;
revoke execute on function public.admin_credit_wallet(uuid, numeric, text) from public, anon;
revoke execute on function public.admin_set_admin(uuid, boolean) from public, anon;
revoke execute on function public.admin_update_listing(
  uuid, text, text, text, numeric, boolean, text) from public, anon;
revoke execute on function public.mark_notifications_read(uuid) from public, anon;
revoke execute on function public.dispute_message_role(uuid, uuid) from public, anon;
revoke execute on function public.dispute_message_author_role(uuid) from public, anon;
