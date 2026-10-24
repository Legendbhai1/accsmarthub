-- =====================================================================
-- tests/admin_credit_audit.sql
--
-- admin_credit_wallet() is the only function in this schema that MINTS money
-- out of nothing: apply_wallet() with kind 'adjustment' raises a wallet
-- balance with no matching debit anywhere. Every other movement is a transfer
-- between two pools or a deposit that a payment provider funded.
--
-- It is granted to `authenticated` and gated only on can_moderate(). It:
--
--   H1  writes NO audit row, so an adjustment cannot be traced to the
--       administrator who made it. resolve_payout() audits its decision;
--       this does not.
--
--   H2  does not refuse a credit to the CALLER'S OWN wallet. An administrator
--       can mint spendable balance for themselves, and the audit table that
--       would have shown it is the table H1 says is not written.
--
--   H3  has no ceiling. `deposits` caps a single deposit at 100000, but a
--       single adjustment call has no limit at all.
--
-- RUN: tests/run-db-tests.sh tests/admin_credit_audit.sql
-- =====================================================================

\set ON_ERROR_STOP off

begin;

create temp table results (name text, ok boolean);

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
-- Fixtures. admin 3333 credits seller 2222 (and, in H2, itself).
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('22222222-2222-2222-2222-222222222222', 'seller@example.test'),
  ('33333333-3333-3333-3333-333333333333', 'admin@example.test')
on conflict (id) do nothing;

select set_config('app.trusted_write', 'on', false);
insert into public.profiles (id, email, name, is_admin) values
  ('22222222-2222-2222-2222-222222222222', 'seller@example.test', 'Seller', false),
  ('33333333-3333-3333-3333-333333333333', 'admin@example.test', 'Admin', true)
on conflict (id) do update set is_admin = excluded.is_admin;
select set_config('app.trusted_write', 'off', false);

delete from public.admin_audit where actor_id = '33333333-3333-3333-3333-333333333333';

-- ---------------------------------------------------------------------
-- H1 + H4. A credit to another user must leave an audit trail naming the
-- administrator, the target and the amount, and must reach the wallet.
-- ---------------------------------------------------------------------
do $$
declare v_audit integer;
        v_bal numeric;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
  set local role authenticated;
  begin
    perform public.admin_credit_wallet('22222222-2222-2222-2222-222222222222',
                                       25, 'goodwill credit for a late delivery');
    reset role;
  exception when others then
    reset role;
    perform assert_that('an admin can credit a wallet [' || sqlstate || ': ' || sqlerrm || ']', false);
    return;
  end;

  select count(*) into v_audit from public.admin_audit
   where actor_id = '33333333-3333-3333-3333-333333333333'
     and resource_id = '22222222-2222-2222-2222-222222222222'
     and note ilike '%goodwill credit%';
  perform assert_that('a wallet credit writes an audit row', v_audit >= 1);

  select coalesce(spendable_usd, 0) into v_bal from public.wallets
   where user_id = '22222222-2222-2222-2222-222222222222';
  perform assert_that('the credited amount reached the wallet', v_bal = 25);
end $$;

-- ---------------------------------------------------------------------
-- H2. An administrator must not be able to mint money into their own wallet.
-- ---------------------------------------------------------------------
do $$
declare v_self numeric;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
  set local role authenticated;
  begin
    perform public.admin_credit_wallet('33333333-3333-3333-3333-333333333333',
                                       500, 'paying myself');
    reset role;
  exception when others then
    reset role;
  end;

  select coalesce(spendable_usd, 0) + coalesce(earned_usd, 0) into v_self
    from public.wallets where user_id = '33333333-3333-3333-3333-333333333333';
  perform assert_that('an administrator cannot credit their own wallet',
                      coalesce(v_self, 0) = 0);
end $$;

-- ---------------------------------------------------------------------
-- H3. A single adjustment must not exceed the platform's own deposit ceiling.
--     Run last: a refused call leaves the wallet untouched, but an uncapped
--     one moves the balance the check above just pinned.
-- ---------------------------------------------------------------------
do $$
declare v_ok boolean;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
  set local role authenticated;
  begin
    perform public.admin_credit_wallet('22222222-2222-2222-2222-222222222222',
                                       99999999, 'mint a fortune');
    reset role;
    v_ok := false;   -- the call returned, so nothing capped it
  exception when others then
    reset role;
    v_ok := true;    -- refused, which is the point
  end;
  perform assert_that('a single adjustment is capped', v_ok);
end $$;

select done();

select count(*) as total,
       count(*) filter (where ok) as passed,
       count(*) filter (where not ok) as failed
  from results;

rollback;
