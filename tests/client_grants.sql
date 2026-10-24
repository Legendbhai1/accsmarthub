-- =====================================================================
-- tests/client_grants.sql
--
-- 0024 revokes the Supabase default table privileges from `anon` and
-- `authenticated` and re-grants, explicitly, only what the product uses.
-- The risk in a migration like that is not that it does too little — it is
-- that it takes away an access some page depends on, and nothing fails
-- until a user hits that page. So the assertions below pin BOTH directions:
--
--   * nothing a hostile client should not have (writes to money tables, the
--     credential tables, the trigger functions);
--   * nothing a legitimate client DOES use (the public catalogue reads, the
--     direct writes, the column grants, the client RPCs, the RLS helpers).
--
-- The RLS helpers matter most: policies are `to public` and call
-- `is_admin()`/`is_dispute_party()`, so if 0024 revoked EXECUTE on those,
-- every policy would error at evaluation time and the whole site would
-- break — a mistake that looks like a revocation success.
--
-- Run: tests/run-db-tests.sh tests/client_grants.sql
-- =====================================================================

\set ON_ERROR_STOP off

begin;

create temp table results (name text, ok boolean);

-- SECURITY DEFINER so assertions can record their result while the session
-- is `set local role authenticated`.
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
-- Fixtures: one ordinary user, so the behavioural tests below have a real
-- profile row to act on.
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('22222222-2222-2222-2222-222222222222', 'client@example.test');
-- handle_new_user() fires on the auth.users insert and creates the profile.
insert into public.profiles (id, email, name, is_admin) values
  ('22222222-2222-2222-2222-222222222222', 'client@example.test', 'Client', false)
on conflict (id) do update set name = excluded.name, is_admin = false;

-- ---------------------------------------------------------------------
-- A. anon holds no write anywhere.
-- ---------------------------------------------------------------------
do $$
declare v_bad int;
begin
  select count(*) into v_bad
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
   where c.relkind in ('r', 'p')
     and (has_table_privilege('anon', c.oid, 'INSERT')
       or has_table_privilege('anon', c.oid, 'UPDATE')
       or has_table_privilege('anon', c.oid, 'DELETE')
       or has_table_privilege('anon', c.oid, 'TRUNCATE'));
  perform assert_that('anon holds no write privilege on any table', v_bad = 0);
end $$;

do $$
declare v_bad int;
begin
  select count(*) into v_bad
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
   where c.relkind = 'S'
     and (has_sequence_privilege('anon', c.oid, 'USAGE')
       or has_sequence_privilege('anon', c.oid, 'UPDATE'));
  perform assert_that('anon holds no sequence privilege', v_bad = 0);
end $$;

-- ---------------------------------------------------------------------
-- B. anon cannot read the private tables.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['wallets','wallet_ledger','deposits','orders',
                           'cart_items','notifications','listing_credentials',
                           'credential_downloads','admin_audit',
                           'dispute_messages','payout_requests']
  loop
    perform assert_that(format('anon cannot read %s', t),
      not has_table_privilege('anon', format('public.%I', t), 'SELECT'));
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- C. authenticated holds no write on the money/audit tables.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['wallets','wallet_ledger','deposits','orders',
                           'order_events','order_payments','order_refunds',
                           'payout_requests','admin_audit',
                           'store_application_events','listing_reviews',
                           'dispute_reason_normalizations']
  loop
    perform assert_that(format('authenticated cannot write %s', t),
      not has_table_privilege('authenticated', format('public.%I', t), 'INSERT')
      and not has_table_privilege('authenticated', format('public.%I', t), 'UPDATE')
      and not has_table_privilege('authenticated', format('public.%I', t), 'DELETE'));
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- D. The credential tables are unreadable by either client role.
-- ---------------------------------------------------------------------
select assert_that('authenticated cannot read listing_credentials',
  not has_table_privilege('authenticated', 'public.listing_credentials', 'SELECT'));
select assert_that('authenticated cannot read credential_downloads',
  not has_table_privilege('authenticated', 'public.credential_downloads', 'SELECT'));

-- Behavioural: a signed-in client selecting the table gets no rows.
do $$
declare v_n int;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
  begin
    select count(*) into v_n from public.listing_credentials;
    perform assert_that('signed-in client reads 0 credential rows', v_n = 0);
  exception when insufficient_privilege then
    perform assert_that('signed-in client reads 0 credential rows', true);
  end;
  reset role;
end $$;

-- Behavioural: a direct write to the ledger is refused.
do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
  begin
    insert into public.wallet_ledger (user_id, kind, balance_delta)
    values ('22222222-2222-2222-2222-222222222222', 'adjustment', 1000000);
    perform assert_that('client cannot insert a ledger row', false);
  exception when insufficient_privilege then
    perform assert_that('client cannot insert a ledger row', true);
  end;
  reset role;
end $$;

-- ---------------------------------------------------------------------
-- E. Everything the product uses is still granted.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['listings','stores','reviews','store_reviews','profiles']
  loop
    perform assert_that(format('anon can still read %s', t),
      has_table_privilege('anon', format('public.%I', t), 'SELECT'));
    perform assert_that(format('authenticated can still read %s', t),
      has_table_privilege('authenticated', format('public.%I', t), 'SELECT'));
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['orders','wallets','wallet_ledger','deposits',
                           'payout_requests','cart_items','notifications',
                           'saved_listings','order_requests','disputes',
                           'dispute_messages','off_platform_reports']
  loop
    perform assert_that(format('authenticated can still read %s', t),
      has_table_privilege('authenticated', format('public.%I', t), 'SELECT'));
  end loop;
end $$;

select assert_that('authenticated can insert listings',
  has_table_privilege('authenticated', 'public.listings', 'INSERT'));
select assert_that('authenticated can update listings',
  has_table_privilege('authenticated', 'public.listings', 'UPDATE'));
select assert_that('authenticated can delete listings',
  has_table_privilege('authenticated', 'public.listings', 'DELETE'));
select assert_that('authenticated can insert stores',
  has_table_privilege('authenticated', 'public.stores', 'INSERT'));
select assert_that('authenticated can insert reviews',
  has_table_privilege('authenticated', 'public.reviews', 'INSERT'));
select assert_that('authenticated can write cart_items',
  has_table_privilege('authenticated', 'public.cart_items', 'INSERT')
  and has_table_privilege('authenticated', 'public.cart_items', 'DELETE'));
select assert_that('authenticated can write notifications',
  has_table_privilege('authenticated', 'public.notifications', 'UPDATE'));

-- Column grants the product relies on. `profiles` is the interesting one:
-- 0001 revokes table-level UPDATE and grants only the `name` column, so the
-- client's whole write surface on its own profile is that one column.
select assert_that('authenticated may update profiles.name',
  has_column_privilege('authenticated', 'public.profiles', 'name', 'UPDATE'));
select assert_that('authenticated may NOT update the profiles table',
  not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'));
select assert_that('authenticated may update reviews.body',
  has_column_privilege('authenticated', 'public.reviews', 'body', 'UPDATE'));
select assert_that('authenticated may update notifications.read',
  has_column_privilege('authenticated', 'public.notifications', 'read', 'UPDATE'));

-- Behavioural: the client cannot make itself an admin.
do $$
declare v_admin boolean;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
  begin
    update public.profiles set is_admin = true
     where id = '22222222-2222-2222-2222-222222222222';
    select is_admin into v_admin from public.profiles
     where id = '22222222-2222-2222-2222-222222222222';
    perform assert_that('client cannot self-escalate profiles.is_admin',
                        coalesce(v_admin, false) = false);
  exception when insufficient_privilege then
    perform assert_that('client cannot self-escalate profiles.is_admin', true);
  end;
  reset role;
end $$;

-- ---------------------------------------------------------------------
-- F. The RLS helpers must stay callable, or every policy errors.
-- ---------------------------------------------------------------------
select assert_that('anon can still execute is_admin()',
  has_function_privilege('anon', 'public.is_admin()', 'EXECUTE'));
select assert_that('authenticated can still execute is_admin()',
  has_function_privilege('authenticated', 'public.is_admin()', 'EXECUTE'));
select assert_that('authenticated can still execute is_dispute_party(uuid)',
  has_function_privilege('authenticated', 'public.is_dispute_party(uuid)', 'EXECUTE'));
select assert_that('anon can still execute is_disposable_domain(text)',
  has_function_privilege('anon', 'public.is_disposable_domain(text)', 'EXECUTE'));

-- Client RPCs, spot-checked across the money path.
select assert_that('authenticated can execute place_order',
  has_function_privilege('authenticated', 'public.place_order(uuid,integer,text)', 'EXECUTE'));
select assert_that('authenticated can execute checkout',
  has_function_privilege('authenticated', 'public.checkout(uuid,uuid[],integer,text)', 'EXECUTE'));
select assert_that('authenticated can execute confirm_delivery',
  has_function_privilege('authenticated', 'public.confirm_delivery(text)', 'EXECUTE'));
select assert_that('authenticated can execute open_dispute',
  has_function_privilege('authenticated', 'public.open_dispute(text,text,text)', 'EXECUTE'));

-- ---------------------------------------------------------------------
-- G. The trigger functions are not client-callable.
-- ---------------------------------------------------------------------
do $$
declare r record; v_bad int := 0;
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
     where p.prorettype = 'trigger'::regtype
  loop
    if has_function_privilege('anon', format('public.%I(%s)', r.proname, r.args), 'EXECUTE')
       or has_function_privilege('authenticated', format('public.%I(%s)', r.proname, r.args), 'EXECUTE')
    then
      v_bad := v_bad + 1;
    end if;
  end loop;
  perform assert_that('no trigger function is client-callable', v_bad = 0);
end $$;

-- ---------------------------------------------------------------------
-- H. The server-only money function stays server-only.
-- ---------------------------------------------------------------------
select assert_that('authenticated cannot execute apply_wallet',
  not has_function_privilege('authenticated',
    'public.apply_wallet(uuid,numeric,numeric,text,text,text,text)', 'EXECUTE'));

select done();

select count(*) as total,
       count(*) filter (where ok) as passed,
       count(*) filter (where not ok) as failed
  from results;

rollback;
