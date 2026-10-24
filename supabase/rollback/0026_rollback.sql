-- =====================================================================
-- Rollback for 0026_admin_credit_audit.sql
--
-- Restores the LATEST prior definition of admin_credit_wallet(), taken
-- verbatim from 0004_payments.sql (the last migration to write it). Run
-- this to undo 0026: it removes the audit row, the reason requirement,
-- the self-credit refusal and the ceiling, returning the function to a
-- bare can_moderate() gate.
--
-- This re-opens the hole 0026 closed. It exists so the change is
-- reversible, not because the old behaviour is desirable.
-- =====================================================================

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

revoke all on function public.admin_credit_wallet(uuid, numeric, text)
  from public, anon, authenticated;
grant execute on function public.admin_credit_wallet(uuid, numeric, text)
  to authenticated;
