-- Deposit settlement: one atomic, idempotent, server-only call.
--
-- WHY THIS REPLACES THE OLD FLOW
--
-- The webhook previously did "mark paid" and "credit wallet" as two SEPARATE
-- REST calls, i.e. two transactions. If the credit failed, the deposit was
-- already `paid`, the retry found nothing pending, and the buyer was never
-- credited -- permanently, with no retry able to recover it. Everything now
-- happens inside one Postgres transaction: lock, validate, credit, ledger,
-- mark paid.
--
-- The older `confirm_deposit` also had a durability bug: it ran
--   update ... set status = 'mismatch';  raise exception '...';
-- and `raise exception` ROLLS THE TRANSACTION BACK, so the mismatch was
-- never actually recorded. The deposit stayed `pending` and OxaPay retried it
-- up to five times, and the operator was left with no record that anything had
-- gone wrong. This version returns a reason instead of raising, so a mismatch
-- is durably written.
--
-- SECURITY
--   service_role EXECUTE only. anon/authenticated are revoked, so no browser
--   call can credit a wallet even with a valid user JWT.

-- The provider's own transaction identifier. Without it there is nothing to
-- stop one provider payment being replayed against two different deposits.
alter table public.deposits add column if not exists provider_txn_id text;

-- At most one deposit may ever be settled per provider transaction.
create unique index if not exists deposits_provider_txn_idx
  on public.deposits (provider_txn_id) where provider_txn_id is not null;

create or replace function public.settle_deposit(
  p_track_id        text,
  p_provider_txn_id text,
  p_provider_amount numeric,
  p_currency        text,
  p_paid_at         timestamptz
) returns table (settled boolean, reason text, credited numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_d        public.deposits%rowtype;
  v_expected numeric(12,2);
  v_txn      text;
begin
  if not public.is_trusted_write() then
    raise exception 'Deposit settlement is server-only';
  end if;

  if p_track_id is null or btrim(p_track_id) = '' then
    return query select false, 'missing_track_id', 0::numeric;
    return;
  end if;

  -- FOR UPDATE serialises two concurrent callbacks for the same deposit. The
  -- loser blocks here, then reads status='paid' and returns already_paid, so
  -- the pair can credit exactly once.
  select * into v_d
    from public.deposits
   where track_id = btrim(p_track_id)
     for update;

  if not found then
    -- Unknown track id. Acknowledged (not raised) so the provider stops
    -- retrying, but nobody is credited.
    return query select false, 'unknown_deposit', 0::numeric;
    return;
  end if;

  if v_d.status = 'paid' then
    return query select false, 'already_paid', 0::numeric;
    return;
  end if;
  if v_d.status = 'mismatch' then
    return query select false, 'already_mismatch', 0::numeric;
    return;
  end if;

  v_expected := v_d.amount_usd;

  -- 1. Provider transaction reference must be present.
  v_txn := btrim(coalesce(p_provider_txn_id, ''));
  if v_txn = '' then
    update public.deposits set status = 'mismatch' where track_id = v_d.track_id;
    return query select false, 'missing_provider_txn_id', 0::numeric;
    return;
  end if;

  -- 2. ...and must not already be bound to a DIFFERENT deposit. This is what
  -- stops one provider payment settling two buyers' top-ups.
  if exists (
    select 1 from public.deposits
     where provider_txn_id = v_txn and track_id <> v_d.track_id
  ) then
    update public.deposits set status = 'mismatch' where track_id = v_d.track_id;
    return query select false, 'provider_txn_reused', 0::numeric;
    return;
  end if;

  -- 3. Currency. Recorded on the row so an operator can see what arrived.
  if upper(btrim(coalesce(p_currency, 'USD'))) <> 'USD' then
    update public.deposits
       set status = 'mismatch', provider_txn_id = v_txn,
           provider_amount = p_provider_amount
     where track_id = v_d.track_id;
    return query select false, 'currency_mismatch', 0::numeric;
    return;
  end if;

  -- 4. Amount. Compared after rounding to the currency's minor unit, with a
  -- sub-cent tolerance so a provider sending 49.999999 still settles.
  if p_provider_amount is null
     or abs(round(p_provider_amount, 2) - round(v_expected, 2)) > 0.001 then
    update public.deposits
       set status = 'mismatch', provider_txn_id = v_txn,
           provider_amount = p_provider_amount
     where track_id = v_d.track_id;
    return query select false, 'amount_mismatch', 0::numeric;
    return;
  end if;

  -- 5. Credit + ledger + mark paid, all in this one transaction. If any step
  --    raises, the whole settlement rolls back and the deposit stays pending
  --    for a legitimate retry.
  perform public.apply_wallet(
    v_d.user_id, v_expected, 0, 'deposit', null,
    'OxaPay ' || v_txn || ' (' || v_d.track_id || ')'
  );

  update public.deposits
     set status = 'paid',
         provider_txn_id = v_txn,
         provider_amount = p_provider_amount,
         paid_at = coalesce(p_paid_at, now())
   where track_id = v_d.track_id;

  return query select true, 'settled', v_expected;
end;
$$;

revoke all on function public.settle_deposit(text, text, numeric, text, timestamptz) from public;
revoke all on function public.settle_deposit(text, text, numeric, text, timestamptz) from anon;
revoke all on function public.settle_deposit(text, text, numeric, text, timestamptz) from authenticated;
grant execute on function public.settle_deposit(text, text, numeric, text, timestamptz) to service_role;

-- Keep `confirm_deposit` working for any existing caller, but route it through
-- the new implementation so the rollback bug above cannot be reached again.
-- It returns the `settled` boolean and never raises for a business rejection.
create or replace function public.confirm_deposit(
  p_track_id text,
  p_provider_amount numeric,
  p_currency text,
  p_paid_at timestamptz
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_settled boolean; v_reason text;
begin
  select settled, reason into v_settled, v_reason
  from public.settle_deposit(
    p_track_id, null, p_provider_amount, p_currency, p_paid_at
  );
  if v_reason in ('missing_provider_txn_id', 'provider_txn_reused') then
    raise exception 'Provider transaction reference required: %', v_reason;
  end if;
  return v_settled;
end;
$$;

grant execute on function public.confirm_deposit(text, numeric, text, timestamptz) to service_role;
