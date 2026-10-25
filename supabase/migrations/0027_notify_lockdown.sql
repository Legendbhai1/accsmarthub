-- 0027_notify_lockdown.sql
--
-- public.notify(uuid, text, text, text, text) is an *internal* helper. It
-- takes the recipient as its first argument and inserts straight into
-- public.notifications with no check on the caller, so any authenticated
-- user could write an arbitrary notification into any other user's inbox —
-- a phishing/forgery vector, and a bypass of the notifications RLS policy
-- (`auth.uid() = user_id`) because the function is SECURITY DEFINER.
--
-- Why a revoke and not a body guard:
--
--   * Every one of the call sites is inside another SECURITY DEFINER
--     function (open_dispute, resolve_dispute, resolve_payout,
--     mark_order_delivered, verify_order_payment_webhook, ...). There is no
--     browser caller: nothing in `src/` or in the Edge Functions calls
--     `.rpc('notify')`.
--   * A recipient guard (`p_user <> auth.uid()`) would be wrong here. Inside
--     a SECURITY DEFINER function `auth.uid()` is still the *original* JWT
--     subject, so a buyer's checkout notifying the seller would fail the
--     guard. The correct discriminator is `current_user`, which is the
--     function owner (not `authenticated`) when reached through a definer.
--
-- The function body is deliberately left unchanged so the change stays
-- reviewable as a pure privilege fix. `service_role` keeps execute so a
-- server-side caller (and the existing tests) can still use it.
--
-- Re-runnable: `revoke`/`grant` are idempotent.

revoke all on function public.notify(uuid, text, text, text, text) from public;
revoke all on function public.notify(uuid, text, text, text, text) from anon;
revoke all on function public.notify(uuid, text, text, text, text) from authenticated;

grant execute on function public.notify(uuid, text, text, text, text) to service_role;

comment on function public.notify(uuid, text, text, text, text) is
  'Internal notification writer. SECURITY DEFINER and NOT granted to '
  'authenticated/anon: it takes the recipient as an argument, so exposing it '
  'to clients allowed writing into any user''s inbox (0020).';
