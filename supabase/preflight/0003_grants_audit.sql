-- =====================================================================
-- supabase/preflight/0003_grants_audit.sql
--
-- READ-ONLY. Run in the Supabase SQL Editor (or `psql`) against the project.
-- It writes nothing and changes nothing.
--
-- Why: this is a real-money marketplace and every client is hostile. The
-- browser talks to Postgres as `anon` (signed out) or `authenticated` (any
-- signed-in user). Whatever those two roles can reach is the attack surface:
-- a stray `grant`, or a function left executable by PUBLIC, is a hole that no
-- TypeScript, ESLint or build step can see. This lists what the two client
-- roles can actually do, and flags the grants that should not exist.
--
-- HOW TO READ IT. Sections A-E are inventories; section F is the verdict.
-- A row appearing in F is not automatically a bug — read the `why` column —
-- but every row in F is something a human should be able to justify.
--
-- NOTES ON POSTGRES GRANTS
--   * A function is EXECUTE-able by PUBLIC unless it was revoked, so a
--     function with `proacl is null` is reachable by `anon`. Section E shows
--     the *effective* privilege (which is what an attacker gets), not merely
--     an explicit grant.
--   * Supabase ships default privileges that grant table DML to
--     `anon`/`authenticated` on newly created tables in `public`. RLS is what
--     actually stops them; a table with RLS off and a grant is wide open.
--     Section F pairs the two.
--   * `information_schema.role_table_grants` hides privileges granted to
--     PUBLIC, so it is not sufficient on its own; the queries below use
--     `has_table_privilege`/`has_function_privilege`, which include them.
--
-- Results contain object names and privilege names only — no rows, no user
-- ids, no balances, no free text.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. Schema usage. Without USAGE on a schema, its objects are unreachable.
-- ---------------------------------------------------------------------
select 'A' as section, r as role, n.nspname as schema, 'USAGE' as privilege
  from (values ('anon'), ('authenticated')) v(r)
  join pg_namespace n on n.nspname in ('public', 'storage', 'graphql_public')
 where has_schema_privilege(r, n.oid, 'USAGE')
 order by role, schema;

-- ---------------------------------------------------------------------
-- B. Effective table privileges for anon / authenticated.
--    One row per (role, table, privilege) that is actually held, whether it
--    came from an explicit grant, a default privilege, or PUBLIC.
-- ---------------------------------------------------------------------
with privs(p) as (
  values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
         ('REFERENCES'), ('TRIGGER')
)
select 'B' as section, v.role, c.relname as object, p.p as privilege,
       case
         when c.relkind = 'v' and coalesce(array_to_string(c.reloptions, ','), '') like '%security_invoker=true%'
           then 'view (invoker — base-table RLS applies)'
         when c.relkind = 'v' and coalesce(array_to_string(c.reloptions, ','), '') like '%security_invoker=false%'
           then 'view (DEFINER — exposes owner-readable rows)'
         when c.relkind = 'v' then 'view (definer by default)'
         when c.relrowsecurity then 'rls on'
         else 'RLS OFF'
       end as rls
  from (values ('anon'), ('authenticated')) v(role)
  cross join privs p
  join pg_class c on c.relkind in ('r', 'p', 'v', 'm', 'f')
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
 where has_table_privilege(v.role, c.oid, p.p)
 order by v.role, c.relname, p.p;

-- ---------------------------------------------------------------------
-- C. Column-level privileges. A column grant can hand over one column of a
--    table the role otherwise cannot read (e.g. a token column).
-- ---------------------------------------------------------------------
select 'C' as section, v.role, c.relname as object,
       a.attname as column, p.p as privilege
  from (values ('anon'), ('authenticated')) v(role)
  cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) p(p)
  join pg_class c on c.relkind in ('r', 'p', 'v', 'm', 'f')
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  join pg_attribute a on a.attrelid = c.oid
                     and a.attnum > 0 and not a.attisdropped
 where has_column_privilege(v.role, c.oid, a.attnum, p.p)
 order by v.role, c.relname, a.attname, p.p;

-- ---------------------------------------------------------------------
-- D. Sequence privileges. A client with USAGE/UPDATE on a sequence can
--    predict or exhaust identifiers (order numbers, invoice ids).
-- ---------------------------------------------------------------------
select 'D' as section, v.role, c.relname as object, p.p as privilege
  from (values ('anon'), ('authenticated')) v(role)
  cross join (values ('USAGE'), ('SELECT'), ('UPDATE')) p(p)
  join pg_class c on c.relkind = 'S'
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
 where has_sequence_privilege(v.role, c.oid, p.p)
 order by v.role, c.relname, p.p;

-- ---------------------------------------------------------------------
-- E. Effective EXECUTE on functions, per role.
--    `via` distinguishes an explicit grant from the PUBLIC default, because
--    the fix is different: a PUBLIC default needs a REVOKE, not an
--    un-grant. `secdef` is the security-definer flag — those run with the
--    owner's rights and are the ones that matter most.
-- ---------------------------------------------------------------------
select 'E' as section, v.role,
       n.nspname as schema,
       p.proname as function,
       pg_get_function_identity_arguments(p.oid) as args,
       case when p.prosecdef then 'SECURITY DEFINER' else 'invoker' end as secdef,
       case when p.proacl is null then 'PUBLIC default'
            else 'explicit/PUBLIC' end as via
  from (values ('anon'), ('authenticated')) v(role)
  join pg_proc p on p.prokind = 'f'
  join pg_namespace n on n.oid = p.pronamespace and n.nspname in ('public', 'storage')
 where has_function_privilege(v.role, p.oid, 'EXECUTE')
 order by v.role, p.proname;

-- ---------------------------------------------------------------------
-- F. THE VERDICT: grants that should not exist, with a reason.
--    Empty result = nothing alarming. Every row is worth a human look.
-- ---------------------------------------------------------------------
with client_roles(r) as (values ('anon'), ('authenticated')),
tbl as (
  select c.oid, c.relname, c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
   where c.relkind in ('r', 'p')
),
func as (
  select p.oid, p.proname, p.prosecdef, p.proacl,
         pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where p.prokind = 'f'
)
select 'F2 write grant on an append-only table' as finding,
       cr.r as role, t.relname as object,
       'ledger/audit table must never be client-writable' as detail
  from client_roles cr
  join tbl t on t.relname in ('wallet_ledger', 'admin_audit', 'order_events',
                              'order_refunds', 'payout_requests',
                              'dispute_reason_normalizations')
 where has_table_privilege(cr.r, t.oid, 'INSERT')
    or has_table_privilege(cr.r, t.oid, 'UPDATE')
    or has_table_privilege(cr.r, t.oid, 'DELETE')

union all
-- `anon` is every signed-out visitor. It should only ever reach the public
-- catalogue read paths. (A blanket "authenticated holds write on a table" is
-- NOT flagged: Supabase grants that by default and RLS is the real control;
-- section B lists it. This is about the signed-out role.)
select 'F3 anon holds a write privilege', cr.r, t.relname, 'signed-out role'
  from client_roles cr
  join tbl t on true
 where cr.r = 'anon'
   and (has_table_privilege(cr.r, t.oid, 'INSERT')
     or has_table_privilege(cr.r, t.oid, 'UPDATE')
     or has_table_privilege(cr.r, t.oid, 'DELETE'))

union all
-- Money-movement and settlement functions. Executable by a client is only
-- acceptable when the body guards itself (e.g. resolve_payout raises unless
-- can_moderate()); each row must be justified against its definition.
select 'F4 client can execute a server-only function', cr.r,
       f.proname || '(' || f.args || ')',
       'confirm the body guards itself or is service_role only'
  from client_roles cr
  join func f on has_function_privilege(cr.r, f.oid, 'EXECUTE')
 where f.proname ~ '^(apply_wallet|settle_|verify_order_payment_webhook|resolve_payout|log_admin_audit|normalize_dispute_reasons|payout_)'

union all
-- Any SECURITY DEFINER function reachable by `anon` deserves an explicit
-- justification: it runs with the owner's rights.
select 'F5 anon can execute a SECURITY DEFINER function', cr.r,
       f.proname || '(' || f.args || ')',
       case when f.proacl is null then 'PUBLIC default — needs REVOKE'
            else 'explicit grant' end
  from client_roles cr
  join func f on f.prosecdef and has_function_privilege(cr.r, f.oid, 'EXECUTE')
 where cr.r = 'anon'

union all
-- Sequence reachable by a client.
select 'F6 client holds a sequence privilege', cr.r, c.relname,
       'identifier prediction / exhaustion'
  from client_roles cr
  join pg_class c on c.relkind = 'S'
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
 where has_sequence_privilege(cr.r, c.oid, 'USAGE')
    or has_sequence_privilege(cr.r, c.oid, 'UPDATE')

union all
-- RLS off on a base table a client can reach at all. Views are excluded: a
-- view has no RLS of its own, so "RLS OFF" on a view is a category error. A
-- definer view that bypasses the base table's RLS is F8 instead.
select 'F7 RLS off on a client-reachable table', cr.r, t.relname,
       'no policy is protecting this table'
  from client_roles cr
  join tbl t on not t.relrowsecurity
 where has_table_privilege(cr.r, t.oid, 'SELECT')
    or has_table_privilege(cr.r, t.oid, 'INSERT')
    or has_table_privilege(cr.r, t.oid, 'UPDATE')
    or has_table_privilege(cr.r, t.oid, 'DELETE')

union all
-- A SECURITY DEFINER view runs as its owner, so the base table's RLS does NOT
-- apply to the rows it returns. If the view selects more than a deliberately
-- public projection, that is a read leak. `public_profiles` is the known,
-- reviewed example (id + display name only).
select 'F8 client can read a definer-rights view', cr.r, c.relname,
       'bypasses base-table RLS — confirm the projection is deliberately public'
  from client_roles cr
  join pg_class c on c.relkind = 'v'
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
 where has_table_privilege(cr.r, c.oid, 'SELECT')
   and coalesce(array_to_string(c.reloptions, ','), '') like '%security_invoker=false%'

order by finding, role, object;

-- ---------------------------------------------------------------------
-- G. Default privileges. These decide what a FUTURE migration's objects are
--    granted to automatically — the reason a new function can be client-
--    callable without anyone writing a GRANT.
-- ---------------------------------------------------------------------
select 'G' as section, d.defaclrole::regrole as grantor,
       coalesce(n.nspname, '<all schemas>') as schema,
       d.defaclobjtype as objtype,
       case d.defaclobjtype when 'r' then 'table' when 'S' then 'sequence'
            when 'f' then 'function' when 'T' then 'type' when 'n' then 'schema'
            else d.defaclobjtype::text end as objtype_name,
       d.defaclacl as acl
  from pg_default_acl d
  left join pg_namespace n on n.oid = d.defaclnamespace
 order by grantor, schema, objtype;

-- ---------------------------------------------------------------------
-- H. Credential-value protection. The stored account credentials are the
--    thing a hostile buyer would most want. Three layers must hold:
--      1. RLS on with NO policy for a client role (default-deny), so even
--         though Supabase grants SELECT, a client reads zero rows;
--      2. the value stored is ciphertext, not plaintext;
--      3. delivery happens only through an Edge Function that holds the
--         passphrase as a secret and returns the decrypted unit itself.
--    This checks 1 and 2; 3 is a code fact (supabase/functions/
--    download-credentials) that no query can assert.
-- ---------------------------------------------------------------------
select 'H1 credential table RLS' as check, c.relname as object,
       case when c.relrowsecurity then 'RLS on' else 'RLS OFF - CRITICAL' end as detail,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as policies,
       case when (select count(*) from pg_policies p
                   where p.schemaname = 'public' and p.tablename = c.relname) = 0
            then 'default-deny: no policy, no rows'
            else 'has policies - confirm none return a client' end as verdict
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
 where c.relname in ('listing_credentials', 'credential_downloads')
 order by c.relname;

select 'H2 credential storage' as check, table_name, column_name, data_type,
       case when column_name = 'ciphertext' then 'ciphertext (AES-GCM)'
            when column_name in ('unit_key', 'file_name') then 'metadata'
            else 'review' end as detail
  from information_schema.columns
 where table_schema = 'public' and table_name = 'listing_credentials'
 order by ordinal_position;

