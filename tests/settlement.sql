-- AccsMartHub — executable settlement tests for public.settle_deposit().
--
-- RUN:
--   tests/run-db-tests.sh tests/settlement.sql
--
--   To also exercise the real two-connection race in assertion 7a (otherwise
--   reported SKIPPED), point the runner at a reachable database:
--     ACCSMART_PGOPTIONS="-c settlement_test.dsn=postgresql://user@host:5432/db" \
--       tests/run-db-tests.sh tests/settlement.sql
--
-- Runs in ONE session (temp tables + ROLLBACK). Prints every assertion plus a
-- `total/passed/failed` summary as the last result set. All fixtures are
-- removed before the rollback.
--
-- The concurrent case needs a second authenticated connection, so it reports
-- SKIPPED unless `settlement_test.dsn` is set — it does not pretend to have
-- tested simultaneity when it did not.

begin;

create extension if not exists dblink;

create temp table results (
  ord     serial primary key,
  name    text,
  passed  boolean,
  detail  text,
  skipped boolean not null default false
);

-- Deposit settlement is a server-only operation: settle_deposit() refuses to
-- run unless is_trusted_write() is true. In production the caller is the
-- oxapay-webhook Edge Function using the service-role key, and is_trusted_write()
-- sees can_moderate() = is_service_role() = true.
--
-- This file runs as the migration role, which is neither anon nor authenticated
-- but also carries no service-role JWT, so it must opt in the same way
-- tests/order_lifecycle.sql does. Migration 0013 replaced the old
-- "current_user not in ('anon','authenticated')" test with this explicit flag
-- (any SECURITY DEFINER function owned by another role used to pass that check
-- silently), so the harness has to set the flag rather than rely on its role.
select set_config('app.trusted_write', 'on', false);

-- Deterministic fixture id; never collides with a real user.
insert into auth.users (id, email)
values ('11111111-1111-1111-1111-111111111111', 'settlement-test@example.com')
on conflict (id) do nothing;

-- ============================================================ 1. crediting
insert into public.deposits (track_id, user_id, amount_usd)
values ('t_ok', '11111111-1111-1111-1111-111111111111', 50.00);

insert into results(name, passed, detail)
select '1a settles a valid payment', (settled and reason = 'settled' and credited = 50.00), reason
from public.settle_deposit('t_ok', 'OX-1', 50.00, 'USDT', now());

insert into results(name, passed, detail)
select '1b wallet credited exactly once',
       (select balance_usd from public.wallets where user_id = '11111111-1111-1111-1111-111111111111') = 50.00,
       (select balance_usd from public.wallets where user_id = '11111111-1111-1111-1111-111111111111')::text;

insert into results(name, passed, detail)
select '1c exactly one ledger row',
       (select count(*) from public.wallet_ledger where user_id = '11111111-1111-1111-1111-111111111111') = 1,
       (select count(*) from public.wallet_ledger where user_id = '11111111-1111-1111-1111-111111111111')::text;

insert into results(name, passed, detail)
select '1d deposit marked paid', status = 'paid', status from public.deposits where track_id = 't_ok';

insert into results(name, passed, detail)
select '1e provider txn persisted', provider_txn_id = 'OX-1', coalesce(provider_txn_id, '<null>')
from public.deposits where track_id = 't_ok';

insert into results(name, passed, detail)
select '1f crypto recorded for reconciliation', pay_currency = 'USDT', coalesce(pay_currency, '<null>')
from public.deposits where track_id = 't_ok';

-- ====================================================== 2. duplicate callback
insert into results(name, passed, detail)
select '2a replay is a no-op', (not settled and reason = 'already_paid'), reason
from public.settle_deposit('t_ok', 'OX-1', 50.00, 'USDT', now());

insert into results(name, passed, detail)
select '2b replay credits nothing',
       (select balance_usd from public.wallets where user_id = '11111111-1111-1111-1111-111111111111') = 50.00,
       (select balance_usd from public.wallets where user_id = '11111111-1111-1111-1111-111111111111')::text;

insert into results(name, passed, detail)
select '2c no duplicate ledger row',
       (select count(*) from public.wallet_ledger where user_id = '11111111-1111-1111-1111-111111111111') = 1,
       (select count(*) from public.wallet_ledger where user_id = '11111111-1111-1111-1111-111111111111')::text;

-- ============================== 3. crypto currency must NOT reject a payment
-- Regression: the IPN's `currency` is the crypto paid ("POL"), not the
-- deposit currency. Treating it as 'USD' rejected every valid crypto payment.
insert into public.deposits (track_id, user_id, amount_usd)
values ('t_crypto', '11111111-1111-1111-1111-111111111111', 10.00);

insert into results(name, passed, detail)
select '3a POL payment settles (regression: was currency_mismatch)',
       (settled and reason = 'settled'), reason
from public.settle_deposit('t_crypto', 'OX-CRYPTO', 10, 'POL', now());

insert into results(name, passed, detail)
select '3b crypto payment credited in USD',
       (select balance_usd from public.wallets where user_id = '11111111-1111-1111-1111-111111111111') = 60.00,
       (select balance_usd from public.wallets where user_id = '11111111-1111-1111-1111-111111111111')::text;

-- ======================================================== 4. amount mismatch
insert into public.deposits (track_id, user_id, amount_usd)
values ('t_amt', '11111111-1111-1111-1111-111111111111', 25.00);

insert into results(name, passed, detail)
select '4a wrong amount rejected', (not settled and reason = 'amount_mismatch'), reason
from public.settle_deposit('t_amt', 'OX-AMT', 24.00, 'USDT', now());

insert into results(name, passed, detail)
select '4b mismatch durably recorded (regression: was rolled back)',
       status = 'mismatch', status from public.deposits where track_id = 't_amt';

insert into results(name, passed, detail)
select '4c no credit on mismatch',
       (select balance_usd from public.wallets where user_id = '11111111-1111-1111-1111-111111111111') = 60.00,
       (select balance_usd from public.wallets where user_id = '11111111-1111-1111-1111-111111111111')::text;

-- ================================================ 5. provider transaction reuse
insert into public.deposits (track_id, user_id, amount_usd)
values ('t_reuse', '11111111-1111-1111-1111-111111111111', 40.00);

insert into results(name, passed, detail)
select '5a reused provider txn rejected', (not settled and reason = 'provider_txn_reused'), reason
from public.settle_deposit('t_reuse', 'OX-CRYPTO', 40.00, 'USDT', now());

insert into results(name, passed, detail)
select '5b no credit on txn reuse',
       (select balance_usd from public.wallets where user_id = '11111111-1111-1111-1111-111111111111') = 60.00,
       (select balance_usd from public.wallets where user_id = '11111111-1111-1111-1111-111111111111')::text;

insert into results(name, passed, detail)
select '5c reuse recorded as mismatch', status = 'mismatch', status
from public.deposits where track_id = 't_reuse';

-- ============================================ 6. malformed / unknown payloads
insert into public.deposits (track_id, user_id, amount_usd)
values ('t_notxn', '11111111-1111-1111-1111-111111111111', 15.00);

insert into results(name, passed, detail)
select '6a missing provider txn rejected', (not settled and reason = 'missing_provider_txn_id'), reason
from public.settle_deposit('t_notxn', '', 15.00, 'USDT', now());

insert into results(name, passed, detail)
select '6b unknown deposit is a safe no-op', (not settled and reason = 'unknown_deposit'), reason
from public.settle_deposit('t_nope', 'OX-X', 15.00, 'USDT', now());

insert into results(name, passed, detail)
select '6c empty track id rejected', (not settled and reason = 'missing_track_id'), reason
from public.settle_deposit('', 'OX-Y', 15.00, 'USDT', now());

-- ================================================ 7. true concurrency (2 sess)
-- dblink opens SEPARATE connections, so the fixture cannot be inserted from
-- this session: a row that is not yet committed here is invisible there, and
-- the race would report `unknown_deposit` on both sides instead of testing
-- anything. The deposit is therefore created over the dblink connection, where
-- the statement autocommits, and removed again by the cleanup at the end.
--
-- The nested session is a real second backend, so this exercises the
-- FOR UPDATE row lock in settle_deposit() for real. When no DSN is configured
-- the case reports SKIPPED rather than FAIL.
do $$
declare dsn text; n bigint; bal numeric; r1 record; r2 record;
  -- A DIFFERENT user from the one inserted above. That row is still
  -- uncommitted in this transaction, so a dblink insert of the same id would
  -- block on it and deadlock against the outer transaction.
  uid constant uuid := '33333333-3333-3333-3333-333333333333';
begin
  dsn := current_setting('settlement_test.dsn', true);
  if dsn is null or dsn = '' then
    insert into results(name, passed, detail, skipped)
    values ('7a concurrent callbacks credit exactly once', false,
            'SKIPPED: set settlement_test.dsn (needs a DB password) to run', true);
    return;
  end if;

  perform dblink_connect('c1', dsn);
  perform dblink_connect('c2', dsn);
  -- Production needs neither of these: the caller is the service-role Edge
  -- Function, so is_trusted_write() is already true.
  perform dblink_exec('c1', 'set app.trusted_write = on');
  perform dblink_exec('c2', 'set app.trusted_write = on');
  -- The user row must be committed on this connection too: deposits.user_id
  -- references auth.users, and the outer transaction's own insert is invisible
  -- to a separate backend.
  perform dblink_exec('c1',
    $q$insert into auth.users (id, email)
       values ('33333333-3333-3333-3333-333333333333', 'race-test@example.com')
       on conflict (id) do nothing$q$);
  perform dblink_exec('c1',
    $q$insert into public.wallets (user_id)
       values ('33333333-3333-3333-3333-333333333333')
       on conflict (user_id) do nothing$q$);
  perform dblink_exec('c1',
    $q$insert into public.deposits (track_id, user_id, amount_usd)
       values ('t_conc', '33333333-3333-3333-3333-333333333333', 20.00)$q$);

  -- Dispatch both before collecting either: they then race on the row lock.
  perform dblink_send_query('c1', $q$select settled, reason from public.settle_deposit('t_conc','OX-C',20.00,'USDT',now())$q$);
  perform dblink_send_query('c2', $q$select settled, reason from public.settle_deposit('t_conc','OX-C',20.00,'USDT',now())$q$);
  select * into r1 from dblink_get_result('c1') as t(settled boolean, reason text);
  select * into r2 from dblink_get_result('c2') as t(settled boolean, reason text);
  -- A dblink connection stays "busy" until the final (empty) result set is
  -- collected, and any later dblink_exec on it fails with "another command is
  -- already in progress". Drain both before reusing either.
  perform 1 from dblink_get_result('c1') as t(settled boolean, reason text);
  perform 1 from dblink_get_result('c2') as t(settled boolean, reason text);

  select count(*) into n from public.wallet_ledger
   where user_id = uid and note like '%OX-C%';
  select balance_usd into bal from public.wallets where user_id = uid;

  -- This section's writes were committed on the other connection, so the
  -- outer ROLLBACK cannot undo them. Remove them here, where the delete
  -- actually commits, or the fixture outlives the suite.
  perform dblink_exec('c1',
    $q$delete from public.wallet_ledger
        where user_id = '33333333-3333-3333-3333-333333333333';
       delete from public.wallets
        where user_id = '33333333-3333-3333-3333-333333333333';
       delete from public.deposits where track_id = 't_conc';
       delete from auth.users where id = '33333333-3333-3333-3333-333333333333';$q$);

  perform dblink_disconnect('c1');
  perform dblink_disconnect('c2');

  insert into results(name, passed, detail)
  values ('7a concurrent callbacks credit exactly once',
          n = 1 and bal = 20.00,
          'ledger rows for OX-C: ' || n::text || ', balance: ' || coalesce(bal,0)::text
            || ', outcomes: ' || coalesce(r1.reason,'?') || '/' || coalesce(r2.reason,'?'));
end $$;

-- ================================================================= summary
-- The Management API returns only the LAST result set, so the per-assertion
-- detail and the totals are emitted together in one set.
--
-- `skipped` is tracked separately from `failed`: assertion 7a cannot run
-- without a second authenticated connection, and reporting it as a failure
-- would make the suite permanently red for a reason unrelated to the code.
-- It is still printed as SKIPPED rather than PASS, so the suite never claims
-- to have proven simultaneity when it did not.
select name, passed, detail,
       (select count(*) from results) as total,
       (select count(*) from results where passed) as pass_count,
       (select count(*) from results where not passed) as fail_count
  from results order by ord;

-- Runner-compatible summary: the last line matching `total | passed | failed`
-- decides the exit code (see tests/run-db-tests.sh). A skipped case is
-- excluded from `failed` so an unrunnable assertion does not mask a real one.
select count(*) as total,
       count(*) filter (where passed) as passed,
       count(*) filter (where not passed and not skipped) as failed
  from results;

-- ================================================================ cleanup
delete from public.deposits where track_id like 't\_%';
delete from public.wallet_ledger where user_id = '11111111-1111-1111-1111-111111111111';
delete from public.wallets where user_id = '11111111-1111-1111-1111-111111111111';
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';

rollback;
