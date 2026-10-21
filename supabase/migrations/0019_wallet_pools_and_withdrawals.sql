-- ============================================================================
-- 0019 — SEPARATE BUYER AND SELLER BALANCES, AND PER-AUDIENCE WITHDRAWALS
-- ============================================================================
-- Until now every account had ONE balance column (`wallets.balance_usd`) that
-- all money flowed into, whatever its origin. That made two things impossible
-- to express, and one of them was a real hole:
--
--   1. A seller who topped up $100 could immediately withdraw it as though it
--      were sale proceeds. Depositing and cashing straight back out is not
--      trading, and it let the platform be used as a pass-through.
--   2. The two audiences were meant to have different withdrawal floors and
--      fees (sellers $10 / 1%, buyers $20 / 1.5%), which cannot be enforced
--      against a single pool without knowing where the money came from.
--
-- THE MODEL
--   `wallets.spendable_usd` — money the account PUT IN: crypto deposits and
--     refunds. This is what checkout spends.
--   `wallets.earned_usd`    — money the account MADE SELLING: escrow released
--     to the seller. This is what a seller withdraws.
--
--   `balance_usd` is kept and is now a GENERATED column equal to
--   `spendable_usd + earned_usd`. Every existing reader keeps working and
--   still sees the account's total, while the split is authoritative and
--   cannot drift because Postgres computes it.
--
--   Deposits credit `spendable` only. Escrow release credits `earned` only.
--   A purchase draws `spendable` first and only spills into `earned` when the
--   spendable pool is exhausted, so a seller's proceeds remain usable for
--   buying while a deposit is never withdrawable as earnings.
--
-- WITHDRAWAL RULES (enforced in request_payout, by audience)
--   approved seller / admin : from `earned`, minimum $10, 1.0% fee
--   everyone else           : from `spendable`, minimum $20, 1.5% fee
--
--   The fee is deducted from the requested amount: requesting $100 pays out
--   $99 and the $1 is retained by the platform. `fee_usd` and `net_usd` are
--   recorded on the request so a statement reconciles without recomputation.

-- ============================================================================
-- 1. THE TWO POOLS
-- ============================================================================
alter table public.wallets
  add column if not exists spendable_usd numeric(12,2) not null default 0;
alter table public.wallets
  add column if not exists earned_usd numeric(12,2) not null default 0;

-- Convert `balance_usd` from a stored column into a generated one. The split
-- is derived from the append-only ledger, so an existing wallet keeps exactly
-- the money it had, attributed to the pool it actually came from.
--
-- Guarded on `is_generated = 'NEVER'` so a re-run is a no-op rather than a
-- second drop that would discard the generated column and recompute it.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'wallets'
       and column_name = 'balance_usd' and is_generated = 'NEVER'
  ) then
    -- Default every wallet to spendable, then re-attribute from history.
    -- Defaulting to spendable matters: a wallet with no ledger rows is one
    -- nothing has ever moved through, and treating it as earnings would make
    -- a fresh balance withdrawable under the seller rules.
    update public.wallets set spendable_usd = balance_usd, earned_usd = 0;

    -- `deposit`/`refund`/`adjustment` are top-ups; `purchase` draws them down.
    -- Their net is what is left of the money the account put in. Anything the
    -- ledger does not explain is left as spendable, never as earnings.
    update public.wallets w
       set spendable_usd = least(sub.net_in, w.balance_usd),
           earned_usd = w.balance_usd - least(sub.net_in, w.balance_usd)
      from (
        select l.user_id,
               greatest(0, coalesce(sum(l.balance_delta) filter (
                 where l.kind in ('deposit','purchase','refund','adjustment')
               ), 0)) as net_in
          from public.wallet_ledger l
         group by l.user_id
      ) sub
     where w.user_id = sub.user_id;

    alter table public.wallets drop column balance_usd;
    alter table public.wallets add column balance_usd numeric(12,2)
      generated always as (spendable_usd + earned_usd) stored;
  end if;
end
$$;

alter table public.wallets drop constraint if exists wallets_spendable_nonneg;
alter table public.wallets add constraint wallets_spendable_nonneg
  check (spendable_usd >= 0);
alter table public.wallets drop constraint if exists wallets_earned_nonneg;
alter table public.wallets add constraint wallets_earned_nonneg
  check (earned_usd >= 0);

-- ============================================================================
-- 2. THE LEDGER RECORDS WHICH POOL MOVED
-- ============================================================================
-- The kind says *why* money moved; the purpose says *which pool* it moved in.
-- They are separate because `refund` can be either (a buyer refund is
-- spendable, a seller escrow release is earned) and the kind alone cannot say.

-- Which pool a kind belongs to when the caller does not say. Defined before
-- the backfill below so the migration, `apply_wallet` and any future reader
-- all agree instead of restating the same CASE three times.
create or replace function public.wallet_purpose_for_kind(p_kind text)
returns text language sql immutable set search_path = public as $$
  select case
    when p_kind in ('escrow_hold','escrow_release',
                    'payout_hold','payout_paid','payout_returned') then 'earn'
    else 'spend'
  end;
$$;

revoke all on function public.wallet_purpose_for_kind(text) from public, anon, authenticated;

alter table public.wallet_ledger
  add column if not exists purpose text;

update public.wallet_ledger
   set purpose = public.wallet_purpose_for_kind(kind)
 where purpose is null;

alter table public.wallet_ledger alter column purpose set not null;
alter table public.wallet_ledger alter column purpose set default 'spend';
alter table public.wallet_ledger drop constraint if exists wallet_ledger_purpose_check;
alter table public.wallet_ledger add constraint wallet_ledger_purpose_check
  check (purpose in ('spend','earn'));

-- ============================================================================
-- 3. apply_wallet — THE ONLY WRITER, NOW POOL-AWARE
-- ============================================================================
-- The old 6-argument form is dropped rather than left beside the new one: a
-- `create or replace` with an extra argument creates an OVERLOAD, and the
-- existing 6-argument calls would keep resolving to the old body — which
-- would silently write the retired single-pool column.
drop function if exists public.apply_wallet(uuid, numeric, numeric, text, text, text);

create or replace function public.apply_wallet(
  p_user uuid,
  p_balance_delta numeric,
  p_locked_delta numeric,
  p_kind text,
  p_order_no text,
  p_note text,
  p_purpose text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_purpose text;
  v_delta numeric(12,2) := coalesce(p_balance_delta, 0);
  v_locked_delta numeric(12,2) := coalesce(p_locked_delta, 0);
  v_spendable numeric(12,2);
  v_earned numeric(12,2);
  v_locked numeric(12,2);
begin
  insert into public.wallets (user_id) values (p_user)
    on conflict (user_id) do nothing;

  v_purpose := coalesce(
    nullif(btrim(coalesce(p_purpose, '')), ''),
    public.wallet_purpose_for_kind(p_kind)
  );
  if v_purpose not in ('spend','earn') then
    raise exception 'Unknown wallet pool %', v_purpose;
  end if;

  -- Lock the row so two concurrent movements cannot read the same pool.
  select spendable_usd, earned_usd, locked_usd
    into v_spendable, v_earned, v_locked
    from public.wallets where user_id = p_user for update;

  if v_delta <> 0 then
    -- A purchase that outruns the spendable pool draws the remainder from
    -- earnings, so a seller can still buy with what they made. Two ledger
    -- rows are written because two pools genuinely moved; collapsing them
    -- would make the statement impossible to reconcile.
    if v_purpose = 'spend' and v_delta < 0 and v_spendable + v_delta < 0 then
      -- Only write the spendable row when spendable actually moved. When the
      -- pool was already empty the whole purchase comes from earnings, and a
      -- `-0` row would be a ledger entry that describes no movement.
      if v_spendable <> 0 then
        update public.wallets
           set spendable_usd = 0, updated_at = now()
         where user_id = p_user
         returning earned_usd into v_earned;

        insert into public.wallet_ledger
          (user_id, kind, purpose, balance_delta, locked_delta,
           balance_after, locked_after, order_no, note)
        values (p_user, p_kind, 'spend', -v_spendable, 0,
                v_earned, v_locked, p_order_no, p_note);
      end if;

      v_delta := v_delta + v_spendable;   -- the part earnings must cover
      v_spendable := 0;
      v_purpose := 'earn';
    end if;

    if v_purpose = 'spend' then
      update public.wallets
         set spendable_usd = spendable_usd + v_delta,
             locked_usd = locked_usd + v_locked_delta,
             updated_at = now()
       where user_id = p_user
       returning spendable_usd, earned_usd, locked_usd
         into v_spendable, v_earned, v_locked;
    else
      update public.wallets
         set earned_usd = earned_usd + v_delta,
             locked_usd = locked_usd + v_locked_delta,
             updated_at = now()
       where user_id = p_user
       returning spendable_usd, earned_usd, locked_usd
         into v_spendable, v_earned, v_locked;
    end if;

    insert into public.wallet_ledger
      (user_id, kind, purpose, balance_delta, locked_delta,
       balance_after, locked_after, order_no, note)
    values (p_user, p_kind, v_purpose, v_delta, v_locked_delta,
            v_spendable + v_earned, v_locked, p_order_no, p_note);
  else
    -- Locked-only movement: escrow being held, or a hold being settled. No
    -- pool balance changes, so this is one row against the named pool.
    update public.wallets
       set locked_usd = locked_usd + v_locked_delta, updated_at = now()
     where user_id = p_user
     returning spendable_usd, earned_usd, locked_usd
       into v_spendable, v_earned, v_locked;

    insert into public.wallet_ledger
      (user_id, kind, purpose, balance_delta, locked_delta,
       balance_after, locked_after, order_no, note)
    values (p_user, p_kind, v_purpose, 0, v_locked_delta,
            v_spendable + v_earned, v_locked, p_order_no, p_note);
  end if;
end;
$$;

revoke all on function public.apply_wallet(uuid, numeric, numeric, text, text, text, text)
  from public, anon, authenticated;

-- ============================================================================
-- 4. PAYOUT REQUESTS RECORD THEIR POOL AND THEIR FEE
-- ============================================================================
alter table public.payout_requests
  add column if not exists pool text not null default 'earn';
alter table public.payout_requests
  add column if not exists fee_rate numeric(6,4) not null default 0;
alter table public.payout_requests
  add column if not exists fee_usd numeric(12,2) not null default 0;
alter table public.payout_requests
  add column if not exists net_usd numeric(12,2) not null default 0;

alter table public.payout_requests drop constraint if exists payout_requests_pool_check;
alter table public.payout_requests add constraint payout_requests_pool_check
  check (pool in ('spend','earn'));
alter table public.payout_requests drop constraint if exists payout_requests_fee_check;
alter table public.payout_requests add constraint payout_requests_fee_check
  check (fee_usd >= 0 and net_usd >= 0);

-- Existing rows predate the fee: their full amount was the payout.
update public.payout_requests
   set fee_rate = 0, fee_usd = 0, net_usd = amount_usd
 where net_usd = 0 and amount_usd > 0;

-- ============================================================================
-- 5. REQUEST A WITHDRAWAL — FLOOR AND FEE DEPEND ON WHO IS ASKING
-- ============================================================================
-- `seller_id` keeps its name so the RLS policy and every existing read stay
-- valid; it is the id of the account that requested the withdrawal, which is
-- a buyer as often as a seller now.
create or replace function public.request_payout(
  p_amount numeric,
  p_method text,
  p_destination text,
  p_idempotency_key text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_key text;
  v_is_seller boolean;
  v_pool text;
  v_min numeric(12,2);
  v_rate numeric(6,4);
  v_available numeric(12,2);
  v_fee numeric(12,2);
  v_net numeric(12,2);
begin
  if v_user is null then
    raise exception 'You must be signed in to request a withdrawal';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount greater than zero';
  end if;
  if p_amount <> round(p_amount, 2) then
    raise exception 'Amounts are recorded to two decimal places';
  end if;
  if p_method is null or p_method not in ('Bank transfer','USDT (TRC-20)','Payoneer') then
    raise exception 'Choose a valid payout method';
  end if;
  if p_destination is null or length(btrim(p_destination)) < 3 then
    raise exception 'Enter the account or address to pay out to';
  end if;
  if length(btrim(p_destination)) > 200 then
    raise exception 'That payout destination is too long';
  end if;

  -- An approved store (or an administrator) is a seller: they withdraw sale
  -- proceeds on the lower floor. Everyone else withdraws the money they put
  -- in, on the higher floor and fee.
  select exists (
    select 1 from public.stores s
     where s.user_id = v_user and s.status = 'approved'
  ) or coalesce((
    select p.is_admin or p.store_status = 'approved'
      from public.profiles p where p.id = v_user
  ), false) into v_is_seller;

  if v_is_seller then
    v_pool := 'earn'; v_min := 10; v_rate := 0.0100;
  else
    v_pool := 'spend'; v_min := 20; v_rate := 0.0150;
  end if;

  if p_amount < v_min then
    raise exception 'The minimum withdrawal is $% for your account', to_char(v_min, 'FM999999990.00');
  end if;

  v_fee := round(p_amount * v_rate, 2);
  v_net := p_amount - v_fee;
  if v_net <= 0 then
    raise exception 'The withdrawal fee leaves nothing to pay out; request a larger amount';
  end if;

  v_key := nullif(btrim(coalesce(p_idempotency_key, '')), '');

  -- Replay of the same submission returns the original request rather than
  -- reserving the money a second time.
  if v_key is not null then
    select id into v_id from public.payout_requests
     where seller_id = v_user and idempotency_key = v_key;
    if found then return v_id; end if;
  end if;

  -- Lock the wallet, then check the pool the money must come from. A deposit
  -- is not earnings and cannot be withdrawn under the seller rules, which is
  -- the whole point of the split.
  select case when v_pool = 'earn' then earned_usd else spendable_usd end
    into v_available
    from public.wallets where user_id = v_user for update;
  if not found then
    raise exception 'You do not have a wallet yet';
  end if;

  if v_available < p_amount then
    if v_pool = 'earn' then
      raise exception 'You can withdraw at most $% of sale proceeds (your earnings balance)',
        to_char(v_available, 'FM999999990.00');
    else
      raise exception 'You can withdraw at most $% of deposited funds (your spendable balance)',
        to_char(v_available, 'FM999999990.00');
    end if;
  end if;

  insert into public.payout_requests
    (seller_id, amount_usd, method, destination, idempotency_key,
     pool, fee_rate, fee_usd, net_usd)
  values (v_user, round(p_amount, 2), p_method, btrim(p_destination), v_key,
          v_pool, v_rate, v_fee, v_net)
  returning id into v_id;

  -- Reserve the funds from the correct pool. balance -amount / locked +amount
  -- keeps the total the same, so the money is still the account's until an
  -- admin settles it.
  perform public.apply_wallet(v_user, -round(p_amount, 2), round(p_amount, 2),
    'payout_hold', null, 'payout request ' || v_id, v_pool);

  perform public.notify(v_user, 'payout_requested',
    'Withdrawal requested',
    format('Your withdrawal of $%s is being reviewed (%s fee, you receive $%s). The amount is held until it is settled.',
      to_char(round(p_amount, 2), 'FM999999990.00'),
      to_char(v_fee, 'FM999999990.00'),
      to_char(v_net, 'FM999999990.00')),
    v_id::text);

  return v_id;
end;
$$;

-- ============================================================================
-- 6. SETTLE A WITHDRAWAL (admin only)
-- ============================================================================
create or replace function public.resolve_payout(
  p_payout_id uuid,
  p_decision text,
  p_note text,
  p_paid_reference text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_p public.payout_requests%rowtype;
begin
  if not public.can_moderate() then
    raise exception 'Only an administrator can settle a payout';
  end if;
  if p_payout_id is null then raise exception 'Payout request is required'; end if;
  if p_decision is null or p_decision not in ('paid','rejected') then
    raise exception 'Decision must be paid or rejected';
  end if;
  -- A bare status flip would leave no record of who decided what or why.
  if p_note is null or length(btrim(p_note)) < 3 then
    raise exception 'A reason is required for a payout decision';
  end if;

  select * into v_p from public.payout_requests where id = p_payout_id for update;
  if not found then raise exception 'Payout request not found'; end if;

  if v_p.status not in ('requested','approved') then
    raise exception 'This payout was already settled (it is %)', v_p.status;
  end if;

  perform set_config('app.trusted_write','on',true);

  if p_decision = 'paid' then
    -- The money leaves the platform here, outside this system. Release the
    -- hold only; the pool was already reduced when the request was made. The
    -- fee is retained, so the reference records what was actually sent.
    perform public.apply_wallet(v_p.seller_id, 0, -v_p.amount_usd,
      'payout_paid', null, 'payout ' || p_payout_id || ' paid', v_p.pool);

    update public.payout_requests
       set status = 'paid', reviewed_at = now(), reviewed_by = auth.uid(),
           review_note = btrim(p_note),
           paid_reference = nullif(btrim(coalesce(p_paid_reference,'')), '')
     where id = p_payout_id;

    perform public.notify(v_p.seller_id, 'payout_paid',
      'Withdrawal sent',
      format('Your withdrawal of $%s has been sent (a $%s fee was deducted, so $%s was paid out).',
        to_char(v_p.amount_usd, 'FM999999990.00'),
        to_char(v_p.fee_usd, 'FM999999990.00'),
        to_char(v_p.net_usd, 'FM999999990.00')),
      p_payout_id::text);
  else
    -- Rejected: give the money straight back to the pool it came from.
    perform public.apply_wallet(v_p.seller_id, v_p.amount_usd, -v_p.amount_usd,
      'payout_returned', null, 'payout ' || p_payout_id || ' rejected', v_p.pool);

    update public.payout_requests
       set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid(),
           review_note = btrim(p_note)
     where id = p_payout_id;

    perform public.notify(v_p.seller_id, 'payout_rejected',
      'Withdrawal not completed',
      format('Your withdrawal of $%s was not completed. The amount is back in your balance. Reason: %s',
        to_char(v_p.amount_usd, 'FM999999990.00'), btrim(p_note)),
      p_payout_id::text);
  end if;

  perform public.log_admin_audit(auth.uid(), 'payout.' || p_decision, 'payout',
    p_payout_id, p_payout_id::text,
    format('%s of $%s (fee $%s, net $%s, %s pool) | %s',
      p_decision,
      to_char(v_p.amount_usd, 'FM999999990.00'),
      to_char(v_p.fee_usd, 'FM999999990.00'),
      to_char(v_p.net_usd, 'FM999999990.00'),
      v_p.pool, btrim(p_note)));
end;
$$;

-- ============================================================================
-- 7. GRANTS — default deny, then the two entry points
-- ============================================================================
revoke all on function public.request_payout(numeric, text, text, text)
  from public, anon, authenticated;
grant execute on function public.request_payout(numeric, text, text, text)
  to authenticated;

revoke all on function public.resolve_payout(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.resolve_payout(uuid, text, text, text)
  to authenticated;
