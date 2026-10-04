-- Deposit settlement, corrected for OxaPay's real callback payload.
--
-- THE BUG THIS FIXES
--
-- The webhook passed the callback's `currency` field to settle_deposit() as if
-- it were the deposit's currency. Per OxaPay's published Paid IPN sample:
--
--   { "track_id":"151811887", "status":"Paid", "type":"invoice",
--     "amount":10,            <- invoice denomination ($10)
--     "value":3.6839,         <- crypto units the payer sent
--     "currency":"POL",       <- the CRYPTOCURRENCY paid, NOT the invoice unit
--     "order_id":"ORD-12345", "date":1738493900, "txs":[...] }
--
-- So `currency` is "POL" for a perfectly valid $10 top-up. The previous code
-- compared it against the deposit's 'USD' and raised `currency_mismatch` —
-- which meant EVERY valid cryptocurrency payment was rejected and no buyer was
-- ever credited. There is no `pay_currency` field in the real payload at all;
-- that name was invented.
--
-- The fix separates the two ideas that were wrongly conflated:
--   * Invoice denomination  -> already authoritative in OUR row (amount_usd,
--     currency='USD'). Validated against the echoed `amount`.
--   * Cryptocurrency paid   -> recorded as `pay_currency` for reconciliation,
--     never used to accept or reject a payment.
--
-- Also drops confirm_deposit(): it had no callers anywhere in the app, and it
-- re-raised on a missing provider transaction id, which is precisely the
-- "operator sets it up wrongly" case it should have handled gracefully.

alter table public.deposits add column if not exists pay_currency text;

-- The old wrapper is dead code and its rollback-on-raise bug is unreachable
-- from any caller now. Remove it so nobody re-introduces the old behaviour.
drop function if exists public.confirm_deposit(text, numeric, text, timestamptz);

drop function if exists public.settle_deposit(text, text, numeric, text, timestamptz);

create or replace function public.settle_deposit(
  p_track_id        text,
  p_provider_txn_id text,
  p_invoice_amount  numeric,
  p_pay_currency    text,
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

  -- FOR UPDATE serialises concurrent callbacks for the same deposit; the
  -- loser blocks here and then observes status='paid'.
  select * into v_d
    from public.deposits
   where track_id = btrim(p_track_id)
     for update;

  if not found then
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

  -- Our own invariant, not something the provider can influence. If this ever
  -- fires the deposit row itself is wrong, and no callback should settle it.
  if upper(v_d.currency) <> 'USD' then
    update public.deposits set status = 'mismatch' where track_id = v_d.track_id;
    return query select false, 'deposit_not_usd', 0::numeric;
    return;
  end if;

  v_expected := v_d.amount_usd;

  -- 1. Provider transaction reference is mandatory.
  v_txn := btrim(coalesce(p_provider_txn_id, ''));
  if v_txn = '' then
    update public.deposits set status = 'mismatch' where track_id = v_d.track_id;
    return query select false, 'missing_provider_txn_id', 0::numeric;
    return;
  end if;

  -- 2. ...and may not already be bound to a different deposit, so one provider
  --    payment cannot settle two buyers' top-ups.
  if exists (
    select 1 from public.deposits
     where provider_txn_id = v_txn and track_id <> v_d.track_id
  ) then
    update public.deposits set status = 'mismatch' where track_id = v_d.track_id;
    return query select false, 'provider_txn_reused', 0::numeric;
    return;
  end if;

  -- 3. Invoice denomination. `amount` in the IPN is the invoice unit (10 for a
  --    $10 invoice), NOT the crypto quantity, so this is directly comparable.
  if p_invoice_amount is null
     or abs(round(p_invoice_amount, 2) - round(v_expected, 2)) > 0.001 then
    update public.deposits
       set status = 'mismatch', provider_txn_id = v_txn,
           provider_amount = p_invoice_amount,
           pay_currency = nullif(btrim(coalesce(p_pay_currency, '')), '')
     where track_id = v_d.track_id;
    return query select false, 'amount_mismatch', 0::numeric;
    return;
  end if;

  -- 4. Credit + ledger + mark paid, all in this one transaction.
  perform public.apply_wallet(
    v_d.user_id, v_expected, 0, 'deposit', null,
    'OxaPay ' || v_txn || ' (' || v_d.track_id || ')'
  );

  update public.deposits
     set status = 'paid',
         provider_txn_id = v_txn,
         provider_amount = p_invoice_amount,
         -- Recorded for reconciliation only. Never gates settlement.
         pay_currency = nullif(btrim(coalesce(p_pay_currency, '')), ''),
         paid_at = coalesce(p_paid_at, now())
   where track_id = v_d.track_id;

  return query select true, 'settled', v_expected;
end;
$$;

revoke all on function public.settle_deposit(text, text, numeric, text, timestamptz) from public;
revoke all on function public.settle_deposit(text, text, numeric, text, timestamptz) from anon;
revoke all on function public.settle_deposit(text, text, numeric, text, timestamptz) from authenticated;
grant execute on function public.settle_deposit(text, text, numeric, text, timestamptz) to service_role;
