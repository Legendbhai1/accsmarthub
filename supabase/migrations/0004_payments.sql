-- Payments: the wallet-crediting RPC the OxaPay webhook depends on.
--
-- 0001_core.sql never defined `credit_wallet`, but the `oxapay-webhook` Edge
-- Function calls it as the final step of every deposit. It therefore returned
-- "function not found" on every callback, so a deposit could be marked paid
-- and still never credited. This adds it.
--
-- Deliberately NOT executable by anon/authenticated: crediting a wallet is the
-- one privileged money movement in the schema, and only the webhook (which
-- runs as service_role, after verifying OxaPay's HMAC) may call it.

create or replace function public.credit_wallet(p_user_id uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id is null then raise exception 'user is required'; end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Credit amount must be greater than zero';
  end if;
  if p_amount > 100000 then
    raise exception 'Credit amount is above the single-deposit ceiling';
  end if;

  perform public.apply_wallet(p_user_id, p_amount, 0, 'deposit', null, 'crypto deposit');
end;
$$;

revoke all on function public.credit_wallet(uuid, numeric) from public;
revoke all on function public.credit_wallet(uuid, numeric) from anon;
revoke all on function public.credit_wallet(uuid, numeric) from authenticated;
grant execute on function public.credit_wallet(uuid, numeric) to service_role;

-- Admin reconciliation: an admin needs a way to fix a deposit that the webhook
-- marked paid but could not credit (the "mark paid first, credit second"
-- ordering in the webhook deliberately prefers this manual path).
create or replace function public.admin_credit_wallet(
  p_user_id uuid, p_amount numeric, p_note text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_moderate() then raise exception 'Administrators only'; end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Credit amount must be greater than zero';
  end if;
  perform public.apply_wallet(p_user_id, p_amount, 0, 'adjustment', null, p_note);
end;
$$;

grant execute on function public.admin_credit_wallet(uuid, numeric, text) to authenticated;