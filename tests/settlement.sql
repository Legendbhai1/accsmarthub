-- AccsMartHub — executable settlement tests for public.settle_deposit().
--
-- RUN:
--   SUPABASE_PROJECT_REF=<ref> SUPABASE_ACCESS_TOKEN=<pat> \
--     bun scripts/test-db.mjs tests/settlement.sql
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
  ord    serial primary key,
  name   text,
  passed boolean,
  detail text
);

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
do $$
declare dsn text; n bigint; r1 record; r2 record;
begin
  dsn := current_setting('settlement_test.dsn', true);
  if dsn is null or dsn = '' then
    insert into results(name, passed, detail)
    values ('7a concurrent callbacks credit exactly once', false,
            'SKIPPED: set settlement_test.dsn (needs a DB password) to run');
    return;
  end if;

  perform dblink_connect('c1', dsn);
  perform dblink_connect('c2', dsn);
  insert into public.deposits (track_id, user_id, amount_usd)
  values ('t_conc', '11111111-1111-1111-1111-111111111111', 20.00);

  -- Dispatch both before collecting either: they then race on the row lock.
  perform dblink_send_query('c1', $q$select settled, reason from public.settle_deposit('t_conc','OX-C',20.00,'USDT',now())$q$);
  perform dblink_send_query('c2', $q$select settled, reason from public.settle_deposit('t_conc','OX-C',20.00,'USDT',now())$q$);
  select * into r1 from dblink_get_result('c1') as t(settled boolean, reason text);
  select * into r2 from dblink_get_result('c2') as t(settled boolean, reason text);
  perform dblink_disconnect('c1');
  perform dblink_disconnect('c2');

  select count(*) into n from public.wallet_ledger
   where user_id = '11111111-1111-1111-1111-111111111111' and note like '%OX-C%';

  insert into results(name, passed, detail)
  values ('7a concurrent callbacks credit exactly once', n = 1,
          'ledger rows for OX-C: ' || n::text);
end $$;

-- ================================================================= summary
-- The Management API returns only the LAST result set, so the per-assertion
-- detail and the totals are emitted together in one set.
select name, passed, detail,
       (select count(*) from results) as total,
       (select count(*) from results where passed) as pass_count,
       (select count(*) from results where not passed) as fail_count
  from results order by ord;

-- ================================================================ cleanup
delete from public.deposits where track_id like 't\_%';
delete from public.wallet_ledger where user_id = '11111111-1111-1111-1111-111111111111';
delete from public.wallets where user_id = '11111111-1111-1111-1111-111111111111';
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';

rollback;
