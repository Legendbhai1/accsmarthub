-- 0010_admin_users_edge_function.sql
--
-- PURPOSE
--   The admin Users page used to call supabase.auth.admin.getUserById from the
--   browser, which only works with a service-role key in the bundle. This
--   migration provides the database half of the server-side replacement:
--   a single, admin-gated, paginated read that the admin-users Edge Function
--   calls. No service-role key ever reaches the browser.
--
-- SCHEMA REALITY (see 0001_core.sql)
--   public.profiles has: id, email, name, is_admin, store_status, store_name,
--   created_at. There is no profiles.role column and no profiles.last_sign_in_at.
--   The UI role is derived:
--     admin  -> profiles.is_admin
--     seller -> profiles.store_status = 'approved'
--     buyer  -> everything else
--   last_sign_in_at and the authoritative email live in auth.users, which is not
--   exposed through PostgREST, so the read happens in a SECURITY DEFINER function
--   owned by the migration role.
--
-- SECURITY
--   - Refuses callers that are not admins (can_moderate() = is_admin() or
--     service_role) with SQLSTATE 42501.
--   - Fixed search_path, schema-qualified names, no dynamic SQL.
--   - Only the six columns the admin UI needs are returned.
--   - EXECUTE is revoked from PUBLIC/anon and granted to authenticated and
--     service_role only. A non-admin authenticated caller is still refused by
--     the internal check.
--   - Safe to re-run.

-- Stable, bounded pagination + the role filters the UI offers.
create index if not exists profiles_created_at_idx
  on public.profiles (created_at desc, id);
create index if not exists profiles_is_admin_idx
  on public.profiles (is_admin)
  where is_admin;
create index if not exists profiles_store_status_idx
  on public.profiles (store_status);

create or replace function public.admin_list_users(
  p_search text default '',
  p_role text default 'all',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  email text,
  name text,
  last_sign_in_at timestamptz,
  role text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_role text := lower(coalesce(nullif(btrim(p_role), ''), 'all'));
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total bigint := 0;
begin
  -- Defence in depth: the Edge Function also verifies the JWT and the
  -- profiles.is_admin flag before it reaches this function.
  if not public.can_moderate() then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  if v_role not in ('all', 'admin', 'seller', 'buyer') then
    raise exception 'invalid role filter: %', v_role using errcode = '22023';
  end if;

  -- Total for the current filters, computed before LIMIT/OFFSET so an
  -- out-of-range page still reports the real total instead of zero.
  select count(*)
  into v_total
  from public.profiles p
  left join auth.users u on u.id = p.id
  where (
      v_search is null
      or coalesce(u.email, p.email) ilike '%' || v_search || '%'
      or p.name ilike '%' || v_search || '%'
    )
    and (
      v_role = 'all'
      or (v_role = 'admin' and p.is_admin)
      or (v_role = 'seller' and not p.is_admin and p.store_status = 'approved')
      or (v_role = 'buyer' and not p.is_admin and p.store_status <> 'approved')
    );

  return query
  select
    p.id,
    coalesce(u.email, p.email) as email,
    nullif(p.name, '') as name,
    u.last_sign_in_at,
    case
      when p.is_admin then 'admin'
      when p.store_status = 'approved' then 'seller'
      else 'buyer'
    end as role,
    v_total as total_count
  from public.profiles p
  left join auth.users u on u.id = p.id
  where (
      v_search is null
      or coalesce(u.email, p.email) ilike '%' || v_search || '%'
      or p.name ilike '%' || v_search || '%'
    )
    and (
      v_role = 'all'
      or (v_role = 'admin' and p.is_admin)
      or (v_role = 'seller' and not p.is_admin and p.store_status = 'approved')
      or (v_role = 'buyer' and not p.is_admin and p.store_status <> 'approved')
    )
  order by u.last_sign_in_at desc nulls last, p.created_at desc, p.id
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.admin_list_users(text, text, integer, integer) from public;
revoke all on function public.admin_list_users(text, text, integer, integer) from anon;
grant execute on function public.admin_list_users(text, text, integer, integer)
  to authenticated, service_role;
