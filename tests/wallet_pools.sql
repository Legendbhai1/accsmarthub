-- =====================================================================
-- tests/wallet_pools.sql
--
-- Are the buyer and seller balances genuinely separate, and are the two
-- withdrawal tiers enforced?
--
-- 0019 splits `wallets.balance_usd` into `spendable_usd` (money the account
-- put in) and `earned_usd` (money the account made selling), keeping
-- `balance_usd` as a generated total. The rules that depend on that split are
-- what this file pins:
--
--   * a deposit credits spendable ONLY, never earned
--   * an escrow release credits earned ONLY, never spendable
--   * a purchase draws spendable first, then spills into earned
--   * a non-seller withdraws from spendable, minimum $20, 1.5% fee
--   * an approved seller withdraws from earned, minimum $10, 1% fee
--   * a deposit cannot be withdrawn as sale proceeds
--   * a rejected withdrawal returns the money to the pool it came from
--
-- Run: tests/run-db-tests.sh tests/wallet_pools.sql
-- =====================================================================

\set ON_ERROR_STOP off

begin;

create temp table results (name text, ok boolean);

-- SECURITY DEFINER so assertions record their result even while the session
-- is `set local role authenticated` (which has no grant on the temp table).
create or replace function assert_that(name text, ok boolean) returns void
language plpgsql security definer as $$
begin
  insert into results values (name, coalesce(ok, false));
end $$;

create or replace function done() returns void language plpgsql as $$
declare total int; passed int; r record;
begin
  select count(*), count(*) filter (where ok) into total, passed from results;
  raise notice '% | % | %', total, passed, total - passed;
  for r in select * from results where not ok loop
    raise notice '   FAILED: %', r.name;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Fixtures: a plain buyer, an approved seller, and an admin.
-- ---------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at) values
  ('b0000000-0000-0000-0000-00000000000b', 'buyer@example.com',   now()),
  ('50000000-0000-0000-0000-000000000005', 'seller@example.com',  now()),
  ('a0000000-0000-0000-0000-00000000000a', 'admin@example.com',   now())
on conflict (id) do nothing;

-- The profile guard (`guard_profile_privileges`) pins is_admin/store_status
-- for an untrusted write, so the fixture must announce itself as a trusted
-- writer before promoting the admin and approving the store. Getting this
-- order wrong makes the admin look like an ordinary account and every
-- admin-only assertion below would fail for the wrong reason.
select set_config('app.trusted_write', 'on', true);

update public.profiles set is_admin = true
 where id = 'a0000000-0000-0000-0000-00000000000a';
update public.profiles set store_status = 'approved'
 where id = '50000000-0000-0000-0000-000000000005';

insert into public.stores (user_id, store_name, slug, status) values
  ('50000000-0000-0000-0000-000000000005', 'Seller Store', 'seller-store', 'approved')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- The generated total. `balance_usd` must always be the sum of the pools,
-- so a reader that was never taught about the split still sees the truth.
-- ---------------------------------------------------------------------
select assert_that(
  'balance_usd is a generated column',
  (select is_generated from information_schema.columns
    where table_schema = 'public' and table_name = 'wallets'
      and column_name = 'balance_usd') = 'ALWAYS'
);

-- ---------------------------------------------------------------------
-- A deposit credits spendable ONLY.
-- ---------------------------------------------------------------------
select set_config('app.trusted_write', 'on', true);
select public.credit_wallet('b0000000-0000-0000-0000-00000000000b', 100);

select assert_that(
  'a deposit lands in spendable',
  (select spendable_usd = 100 and earned_usd = 0
     from public.wallets where user_id = 'b0000000-0000-0000-0000-00000000000b')
);
select assert_that(
  'balance_usd reflects the deposit as a total',
  (select balance_usd = 100
     from public.wallets where user_id = 'b0000000-0000-0000-0000-00000000000b')
);

-- ---------------------------------------------------------------------
-- An escrow release credits earned ONLY. 0019 must have redirected this
-- without editing 0009/0013, purely from the kind.
--
-- The real sequence is hold-then-release: checkout locks the seller's net
-- on their wallet, and confirmation releases it into their balance. The
-- hold must come first or the locked_usd floor is breached.
-- ---------------------------------------------------------------------
select public.apply_wallet(
  '50000000-0000-0000-0000-000000000005', 0, 40,
  'escrow_hold', 'AMH-TEST01', null);

select assert_that(
  'an escrow hold moves no balance, only locked funds',
  (select earned_usd = 0 and spendable_usd = 0 and locked_usd = 40
     from public.wallets where user_id = '50000000-0000-0000-0000-000000000005')
);

select public.apply_wallet(
  '50000000-0000-0000-0000-000000000005', 40, -40,
  'escrow_release', 'AMH-TEST01', 'buyer confirmed delivery');

select assert_that(
  'an escrow release lands in earned, not spendable',
  (select earned_usd = 40 and spendable_usd = 0 and locked_usd = 0
     from public.wallets where user_id = '50000000-0000-0000-0000-000000000005')
);

-- ---------------------------------------------------------------------
-- A purchase draws spendable first.
-- ---------------------------------------------------------------------
select public.apply_wallet(
  'b0000000-0000-0000-0000-00000000000b', -30, 0, 'purchase', 'AMH-TEST02', null);

select assert_that(
  'a purchase draws from spendable',
  (select spendable_usd = 70 and earned_usd = 0
     from public.wallets where user_id = 'b0000000-0000-0000-0000-00000000000b')
);

-- ---------------------------------------------------------------------
-- A seller's purchase spills into earnings once spendable is exhausted,
-- so sale proceeds stay usable for buying. The seller currently has $0
-- spendable and $40 earned, so a $30 purchase must come wholly from earned.
-- ---------------------------------------------------------------------
select public.apply_wallet(
  '50000000-0000-0000-0000-000000000005', -30, 0, 'purchase', 'AMH-TEST03', null);

select assert_that(
  'a purchase with no spendable pool draws earned directly',
  (select spendable_usd = 0 and earned_usd = 10
     from public.wallets where user_id = '50000000-0000-0000-0000-000000000005')
);

-- Now give the seller a spendable pool and spend across both.
select public.apply_wallet(
  '50000000-0000-0000-0000-000000000005', 20, 0, 'deposit', null, 'top up');

select assert_that(
  'a seller can hold both pools at once',
  (select spendable_usd = 20 and earned_usd = 10
     from public.wallets where user_id = '50000000-0000-0000-0000-000000000005')
);

-- Spend 30: 20 spendable + 10 earned, emptying both.
select public.apply_wallet(
  '50000000-0000-0000-0000-000000000005', -30, 0, 'purchase', 'AMH-TEST04', null);

select assert_that(
  'a purchase spanning both pools empties spendable and draws earned',
  (select spendable_usd = 0 and earned_usd = 0
     from public.wallets where user_id = '50000000-0000-0000-0000-000000000005')
);

-- A purchase beyond the total must be refused by the CHECK, not silently
-- allowed to go negative.
do $$
begin
  perform public.apply_wallet(
    '50000000-0000-0000-0000-000000000005', -5, 0, 'purchase', 'AMH-TEST05', null);
  perform assert_that('a purchase beyond total balance is refused', false);
exception when check_violation then
  perform assert_that('a purchase beyond total balance is refused', true);
end $$;

-- Restore the seller's earnings for the withdrawal-tier tests below.
select public.apply_wallet(
  '50000000-0000-0000-0000-000000000005', 40, 0,
  'escrow_release', 'AMH-TEST06', 'restore for tier tests');

select assert_that(
  'the seller is back to $40 of earnings and nothing else',
  (select spendable_usd = 0 and earned_usd = 40 and locked_usd = 0
     from public.wallets where user_id = '50000000-0000-0000-0000-000000000005')
);

-- ---------------------------------------------------------------------
-- WITHDRAWAL TIERS. A buyer (no approved store) is on the $20 / 1.5% tier
-- and withdraws the money they deposited.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'b0000000-0000-0000-0000-00000000000b')::text, true);

-- $10 is below the buyer floor of $20.
do $$
begin
  perform public.request_payout(10, 'USDT (TRC-20)', 'TXbuyer000000000000000000000000000');
  perform assert_that('a buyer cannot withdraw below $20', false);
exception when others then
  perform assert_that('a buyer cannot withdraw below $20',
    sqlerrm like '%minimum withdrawal is $20%');
end $$;

-- $20 is exactly the floor and must succeed.
do $$
declare v_id uuid; v_fee numeric; v_net numeric;
begin
  v_id := public.request_payout(20, 'USDT (TRC-20)', 'TXbuyer000000000000000000000000000');
  select fee_usd, net_usd into v_fee, v_net
    from public.payout_requests where id = v_id;
  perform assert_that('a buyer can withdraw at the $20 floor',
    v_id is not null and v_fee = 0.30 and v_net = 19.70);
exception when others then
  perform assert_that('a buyer can withdraw at the $20 floor', false);
end $$;

select assert_that(
  'a buyer withdrawal is taken from spendable',
  (select spendable_usd = 50 and earned_usd = 0 and locked_usd = 20
     from public.wallets where user_id = 'b0000000-0000-0000-0000-00000000000b')
);

-- The buyer has NO earnings, so the seller tier's lower floor must not apply
-- to them even though they could otherwise afford it.
do $$
begin
  perform public.request_payout(10, 'USDT (TRC-20)', 'TXbuyer000000000000000000000000000');
  perform assert_that('the $10 seller floor does not apply to a buyer', false);
exception when others then
  perform assert_that('the $10 seller floor does not apply to a buyer', true);
end $$;

-- ---------------------------------------------------------------------
-- An approved seller is on the $10 / 1% tier, and withdraws from EARNED.
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', '50000000-0000-0000-0000-000000000005')::text, true);

do $$
declare v_id uuid; v_fee numeric; v_pool text;
begin
  v_id := public.request_payout(10, 'Bank transfer', 'GB00TEST00000000');
  select fee_usd, pool into v_fee, v_pool
    from public.payout_requests where id = v_id;
  perform assert_that('a seller can withdraw at the $10 floor',
    v_fee = 0.10 and v_pool = 'earn');
exception when others then
  perform assert_that('a seller can withdraw at the $10 floor', false);
end $$;

select assert_that(
  'a seller withdrawal is taken from earned',
  (select earned_usd = 30 and spendable_usd = 0 and locked_usd = 10
     from public.wallets where user_id = '50000000-0000-0000-0000-000000000005')
);

-- The seller has $30 of earnings left, so a $25 withdrawal is inside the
-- pool. What must fail is an amount above it.
do $$
begin
  perform public.request_payout(35, 'Bank transfer', 'GB00TEST00000000');
  perform assert_that('a seller cannot withdraw more than their earnings', false);
exception when others then
  perform assert_that('a seller cannot withdraw more than their earnings',
    sqlerrm like '%sale proceeds%');
end $$;

-- ---------------------------------------------------------------------
-- THE HOLE 0019 CLOSES: a deposit is not withdrawable as sale proceeds.
-- The seller's spendable pool must be invisible to the seller tier.
-- ---------------------------------------------------------------------
reset role;
select set_config('app.trusted_write', 'on', true);
select public.apply_wallet(
  '50000000-0000-0000-0000-000000000005', 500, 0, 'deposit', null, 'big top up');

select assert_that(
  'a seller can hold a large deposited balance',
  (select spendable_usd = 500 and earned_usd = 30
     from public.wallets where user_id = '50000000-0000-0000-0000-000000000005')
);

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '50000000-0000-0000-0000-000000000005')::text, true);

do $$
begin
  -- $100 is well inside the $500 deposited, but the seller tier reads only
  -- the $30 of earnings, so this must be refused.
  perform public.request_payout(100, 'Bank transfer', 'GB00TEST00000000');
  perform assert_that('a deposit cannot be withdrawn as sale proceeds', false);
exception when others then
  perform assert_that('a deposit cannot be withdrawn as sale proceeds',
    sqlerrm like '%sale proceeds%');
end $$;

-- ---------------------------------------------------------------------
-- A rejection returns the money to the pool it came from — and only an
-- administrator can make that decision. The session still carries the
-- seller's identity from the tier tests above, so the first attempt must
-- be refused before the admin settles it.
-- ---------------------------------------------------------------------
reset role;
select set_config('app.trusted_write', 'on', true);

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '50000000-0000-0000-0000-000000000005')::text, true);

do $$
declare v_id uuid;
begin
  select id into v_id from public.payout_requests
   where seller_id = '50000000-0000-0000-0000-000000000005'
     and status = 'requested'
   order by requested_at desc limit 1;
  perform public.resolve_payout(v_id, 'rejected', 'seller self-approval', null);
  perform assert_that('a seller cannot settle their own withdrawal', false);
exception when others then
  perform assert_that('a seller cannot settle their own withdrawal',
    sqlerrm like '%Only an administrator%');
end $$;

-- Now act as the administrator. This is the same session role, so only the
-- claims change — which is exactly the switch can_moderate() keys off.
select set_config('request.jwt.claims',
  json_build_object('sub', 'a0000000-0000-0000-0000-00000000000a')::text, true);

do $$
declare v_id uuid;
begin
  select id into v_id from public.payout_requests
   where seller_id = '50000000-0000-0000-0000-000000000005'
     and status = 'requested'
   order by requested_at desc limit 1;
  perform public.resolve_payout(v_id, 'rejected', 'Test rejection', null);
  perform assert_that('a rejected withdrawal is returned to its pool',
    (select earned_usd = 40 and spendable_usd = 500 and locked_usd = 0
       from public.wallets where user_id = '50000000-0000-0000-0000-000000000005'));
exception when others then
  perform assert_that('a rejected withdrawal is returned to its pool', false);
end $$;

-- ---------------------------------------------------------------------
-- The ledger records which pool moved.
-- ---------------------------------------------------------------------
-- `wallet_purpose_for_kind` is an internal helper with no grant to
-- `authenticated`, so the mapping is asserted from the owner role.
reset role;

select assert_that(
  'every ledger row names a pool',
  (select count(*) = 0 from public.wallet_ledger where purpose is null)
);
select assert_that(
  'the default pool mapping is earn for escrow/payout and spend otherwise',
  public.wallet_purpose_for_kind('escrow_release') = 'earn'
    and public.wallet_purpose_for_kind('escrow_hold') = 'earn'
    and public.wallet_purpose_for_kind('payout_hold') = 'earn'
    and public.wallet_purpose_for_kind('payout_paid') = 'earn'
    and public.wallet_purpose_for_kind('payout_returned') = 'earn'
    and public.wallet_purpose_for_kind('deposit') = 'spend'
    and public.wallet_purpose_for_kind('purchase') = 'spend'
    and public.wallet_purpose_for_kind('refund') = 'spend'
    and public.wallet_purpose_for_kind('adjustment') = 'spend'
);
select assert_that(
  'no ledger row records a negative balance',
  (select count(*) = 0 from public.wallet_ledger where balance_after < 0)
);
select assert_that(
  'the wallet total always equals the sum of the pools',
  (select count(*) = 0 from public.wallets
    where balance_usd <> spendable_usd + earned_usd)
);
-- A ledger row must describe an actual movement: a zero balance delta is only
-- legitimate when locked funds moved instead.
select assert_that(
  'no ledger row records a movement of nothing',
  (select count(*) = 0 from public.wallet_ledger
    where balance_delta = 0 and locked_delta = 0)
);

select done();

select count(*) as total,
       count(*) filter (where ok) as passed,
       count(*) filter (where not ok) as failed
  from results;

rollback;
