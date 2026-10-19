-- ============================================================================
-- 0014 — SELLER PAYOUT REQUESTS
-- ============================================================================
-- 0013 credits a seller's wallet balance when an order completes. Nothing let
-- them move that balance out. This migration adds the missing half: a seller
-- can request a withdrawal, the funds are held the moment the request is made,
-- and an administrator either marks it paid or returns the money.
--
-- WHY A REQUEST QUEUE RATHER THAN A DIRECT TRANSFER
--   There is no payout provider wired up, so no code here can move money off
--   the platform. What it CAN do honestly is reserve the balance so it cannot
--   be spent twice, record the request, and give an administrator an audited
--   way to settle it out-of-band. That is what the application tells sellers:
--   withdrawals are recorded and reviewed, not yet sent automatically.
--
-- MONEY MOVEMENT
--   request_payout()  balance -amount, locked +amount   (reserve)
--   resolve_payout('paid')      locked -amount          (settled externally)
--   resolve_payout('rejected')  balance +amount, locked -amount  (returned)
--
--   The invariant across a payout's life: `balance + locked` only ever changes
--   by an administrator's decision, and a rejection restores it exactly.
--
-- SECURITY
--   Both functions are SECURITY DEFINER and move money only through
--   apply_wallet(), which is not client-callable. request_payout() derives the
--   seller from auth.uid() and never trusts a caller-supplied id or balance.
--   resolve_payout() requires can_moderate(), so no seller can approve their
--   own withdrawal. Neither function is reachable from the client except
--   through these two guarded entry points.

-- ============================================================================
-- 1. WIDEN TWO CONSTRAINTS
-- ============================================================================
-- wallet_ledger.kind was constrained in 0001 and never widened. A payout hold
-- is not a purchase and not an escrow release, so it gets its own kind rather
-- than being mislabelled as an 'adjustment'.
alter table public.wallet_ledger drop constraint if exists wallet_ledger_kind_check;
alter table public.wallet_ledger add constraint wallet_ledger_kind_check
  check (kind in (
    'deposit','purchase','escrow_hold','escrow_release','refund','adjustment',
    'payout_hold','payout_paid','payout_returned'
  ));

-- notifications.kind was enumerated in 0009 and the later `create table if not
-- exists` in 0013 was a no-op against the existing table, so 0009's list is
-- still the live constraint. Payout notifications need their own kinds.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'order_placed','escrow_funded','awaiting_delivery','delivered',
    'delivery_confirmed','inspection_reminder','inspection_expired',
    'dispute_opened','dispute_updated','dispute_resolved',
    'payment_pending','payment_captured','payment_failed',
    'review_ready','review_received','refund_processed','replacement_requested',
    'cancellation_requested','cancelled','seller_review_request','admin_review',
    'payout_requested','payout_paid','payout_rejected'
  ));

-- ============================================================================
-- 2. THE REQUEST TABLE
-- ============================================================================
create table if not exists public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete cascade,
  amount_usd numeric(12,2) not null check (amount_usd > 0),
  method text not null check (method in ('Bank transfer','USDT (TRC-20)','Payoneer')),
  -- Free-text destination. A bank account number, a wallet address or an email
  -- depending on method. Readable by the seller and by admins only.
  destination text not null check (length(btrim(destination)) between 3 and 200),
  status text not null default 'requested'
    check (status in ('requested','approved','paid','rejected','cancelled')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  -- Required by resolve_payout() for any decision, so the audit trail is never
  -- a bare status flip.
  review_note text,
  paid_reference text,
  idempotency_key text
);

create index if not exists payout_seller_idx
  on public.payout_requests (seller_id, requested_at desc);
create index if not exists payout_queue_idx
  on public.payout_requests (status, requested_at);

-- One request per idempotency key, scoped to the seller who sent it, so a
-- double-submitted form cannot reserve the same money twice.
create unique index if not exists payout_idem_idx
  on public.payout_requests (seller_id, idempotency_key)
  where idempotency_key is not null;

alter table public.payout_requests enable row level security;

-- A seller sees only their own requests; an administrator sees all of them.
drop policy if exists "own payout requests" on public.payout_requests;
create policy "own payout requests" on public.payout_requests for select
  using (auth.uid() = seller_id or public.is_admin());

-- No insert/update/delete policy exists on purpose: every write goes through
-- request_payout() or resolve_payout(), both SECURITY DEFINER. A client cannot
-- create a request with a chosen amount, nor mark one paid.

-- ============================================================================
-- 3. REQUEST A PAYOUT
-- ============================================================================
create or replace function public.request_payout(
  p_amount numeric,
  p_method text,
  p_destination text,
  p_idempotency_key text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_balance numeric(12,2);
  v_key text;
begin
  if v_user is null then
    raise exception 'You must be signed in to request a payout';
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

  v_key := nullif(btrim(coalesce(p_idempotency_key, '')), '');

  -- Replay of the same submission returns the original request rather than
  -- reserving the money a second time.
  if v_key is not null then
    select id into v_id from public.payout_requests
     where seller_id = v_user and idempotency_key = v_key;
    if found then return v_id; end if;
  end if;

  -- Lock the wallet so two concurrent requests cannot both read the same
  -- balance and each reserve it.
  select balance_usd into v_balance
    from public.wallets where user_id = v_user for update;
  if not found then
    raise exception 'You do not have a wallet yet';
  end if;

  -- Only genuinely available money. Locked funds (escrow in flight, or an
  -- earlier payout already reserved) are deliberately excluded.
  if v_balance < p_amount then
    raise exception 'You can withdraw at most % (your available balance)', v_balance;
  end if;

  insert into public.payout_requests
    (seller_id, amount_usd, method, destination, idempotency_key)
  values (v_user, round(p_amount, 2), p_method, btrim(p_destination), v_key)
  returning id into v_id;

  -- Reserve the funds. balance -amount / locked +amount keeps the total the
  -- same, so the money is still the seller's until an admin settles it.
  perform public.apply_wallet(v_user, -round(p_amount, 2), round(p_amount, 2),
    'payout_hold', null, 'payout request ' || v_id);

  perform public.notify(v_user, 'payout_requested',
    'Withdrawal requested',
    format('Your withdrawal of $%s is being reviewed. The amount is held until it is settled.', p_amount),
    v_id::text);

  return v_id;
end;
$$;

-- ============================================================================
-- 4. RESOLVE A PAYOUT (admin only)
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

  -- 'approved' is accepted as the settled state so an admin who marked a
  -- request approved out-of-band can still close it out.
  if v_p.status not in ('requested','approved') then
    raise exception 'This payout was already settled (it is %)', v_p.status;
  end if;

  perform set_config('app.trusted_write','on',true);

  if p_decision = 'paid' then
    -- The money leaves the platform here, outside this system. Release the
    -- hold only; the balance was already reduced when the request was made.
    perform public.apply_wallet(v_p.seller_id, 0, -v_p.amount_usd,
      'payout_paid', null, 'payout ' || p_payout_id || ' paid');

    update public.payout_requests
       set status = 'paid', reviewed_at = now(), reviewed_by = auth.uid(),
           review_note = btrim(p_note), paid_reference = nullif(btrim(coalesce(p_paid_reference,'')), '')
     where id = p_payout_id;

    perform public.notify(v_p.seller_id, 'payout_paid',
      'Withdrawal sent',
      format('Your withdrawal of $%s has been sent.', v_p.amount_usd),
      p_payout_id::text);
  else
    -- Rejected: give the money straight back to the spendable balance.
    perform public.apply_wallet(v_p.seller_id, v_p.amount_usd, -v_p.amount_usd,
      'payout_returned', null, 'payout ' || p_payout_id || ' rejected');

    update public.payout_requests
       set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid(),
           review_note = btrim(p_note)
     where id = p_payout_id;

    perform public.notify(v_p.seller_id, 'payout_rejected',
      'Withdrawal not completed',
      format('Your withdrawal of $%s was not completed. The amount is back in your balance. Reason: %s',
        v_p.amount_usd, btrim(p_note)),
      p_payout_id::text);
  end if;

  perform public.log_admin_audit(auth.uid(), 'payout.' || p_decision, 'payout',
    p_payout_id, p_payout_id::text,
    format('%s of $%s | %s', p_decision, v_p.amount_usd, btrim(p_note)));
end;
$$;

-- ============================================================================
-- 5. GRANTS — default deny, then the two entry points
-- ============================================================================
revoke all on function public.request_payout(numeric, text, text, text)
  from public, anon, authenticated;
grant execute on function public.request_payout(numeric, text, text, text)
  to authenticated;

revoke all on function public.resolve_payout(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.resolve_payout(uuid, text, text, text)
  to authenticated;
