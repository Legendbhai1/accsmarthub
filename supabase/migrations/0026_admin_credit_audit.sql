-- =====================================================================
-- 0026_admin_credit_audit.sql
--
-- admin_credit_wallet() is the only function in this schema that MINTS money
-- out of nothing. Every other movement is a transfer between two pools the
-- platform already holds, or a deposit a payment provider funded. This one
-- calls apply_wallet(..., 'adjustment', ...) and raises a balance with no
-- matching debit anywhere in the ledger.
--
-- It was granted to `authenticated` and gated on can_moderate() alone:
--
--   * no audit row, so an adjustment could not be traced to the
--     administrator who made it — while resolve_payout(), its sibling, does
--     write one;
--   * no refusal of a credit to the caller's own wallet, so an administrator
--     could mint spendable balance for themselves — and the table that would
--     have shown it is the table the first point says was not written;
--   * no ceiling. `deposits` caps a single deposit at 100000; a single
--     adjustment had no limit at all.
--
-- The fix keeps the function's purpose (a support gesture — a goodwill
-- credit, a correction after a failed transfer) and makes it accountable:
-- a reason is required, the reason and the amount are written to
-- admin_audit, the caller may not be the beneficiary, and one call is
-- bounded by the same ceiling a deposit is.
--
-- Rollback: supabase/rollback/0026_rollback.sql restores the 0004 body
-- verbatim.
-- =====================================================================

create or replace function public.admin_credit_wallet(
  p_user_id uuid, p_amount numeric, p_note text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_balance numeric;
begin
  if not public.can_moderate() then raise exception 'Administrators only'; end if;
  if p_user_id is null then raise exception 'A user is required'; end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Credit amount must be greater than zero';
  end if;

  -- An adjustment is a support action, so it needs a reason on the record.
  -- A bare credit with no note is indistinguishable from an error later.
  if p_note is null or length(btrim(p_note)) < 3 then
    raise exception 'A reason is required for a wallet adjustment';
  end if;

  -- Minting to yourself is the self-dealing case: the credit and the
  -- decision to make it are the same person. A second administrator must
  -- perform it.
  if p_user_id = auth.uid() then
    raise exception 'You cannot adjust your own wallet';
  end if;

  -- One call is bounded by the same ceiling a single deposit is, so an
  -- adjustment cannot outrun the deposit path it stands in for.
  if p_amount > 100000 then
    raise exception 'A single adjustment cannot exceed 100000';
  end if;

  perform public.apply_wallet(p_user_id, p_amount, 0, 'adjustment', null, btrim(p_note));

  -- Read the resulting balance for the audit detail. apply_wallet has
  -- already committed the movement, so this is the after-image.
  select coalesce(spendable_usd, 0) + coalesce(earned_usd, 0)
    into v_balance from public.wallets where user_id = p_user_id;

  perform public.log_admin_audit(
    auth.uid(), 'wallet.adjustment', 'wallet', p_user_id, p_user_id::text,
    format('credited $%s | balance now $%s | %s',
      to_char(p_amount, 'FM999999990.00'),
      to_char(coalesce(v_balance, 0), 'FM999999990.00'),
      btrim(p_note)));
end;
$$;

-- `create or replace` keeps the existing grants, but they are restated so
-- the privilege surface is readable from the migration alone: anon must
-- never reach this, authenticated may.
revoke all on function public.admin_credit_wallet(uuid, numeric, text)
  from public, anon, authenticated;
grant execute on function public.admin_credit_wallet(uuid, numeric, text)
  to authenticated;
