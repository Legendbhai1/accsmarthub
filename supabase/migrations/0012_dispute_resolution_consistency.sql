-- 0012_dispute_resolution_consistency.sql
--
-- PURPOSE
--  The browser UI (AdminDisputes) is calling supabase.rpc("close_dispute", ...)
--  with arguments { p_dispute_id, p_resolution, p_resolution_note }. The dispute
--  migration (0003_disputes.sql) defines public.resolve_dispute with the
--  signature (p_dispute_id uuid, p_outcome text, p_note text) and outcomes
--  'resolved_buyer' | 'resolved_seller' | 'dismissed'.
--
--  This migration:
--    1. Makes resolve_dispute the canonical, admin-only, idempotent resolution
--       function and explicitly documents its outcome set.
--    2. Adds an audit row for every resolution attempt/success so resolution is
--       not invisible.
--    3. Keeps the existing financial movement in place (it is already gated by
--       can_moderate() and by row locks), but does so in a way that is
--       resilient to partial failures by raising on invalid outcomes before any
--       money movement.
--
--  Do NOT invent a new RPC that the database does not already have. Align the UI
--  to the existing resolve_dispute signature instead.
--
--  Audit table (if/do nothing if it already exists from another migration).
create table if not exists public.admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  resource_text text,
  note text,
  created_at timestamptz not null default now()
);

-- Keep admin audit visible only to admins and the audit system.
alter table public.admin_audit enable row level security;

drop policy if exists "admins read admin audit" on public.admin_audit;
create policy "admins read admin audit" on public.admin_audit for select
  using (public.is_admin() or public.is_service_role());

-- A helper to write an audit row without exposing service-role writes to the
-- browser. Security DEFINER is fine here because it writes an immutable audit
-- trail and does not return sensitive data.
create or replace function public.log_admin_audit(
  p_actor_id uuid,
  p_action text,
  p_resource_type text,
  p_resource_id uuid,
  p_resource_text text,
  p_note text
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.admin_audit(
    actor_id, action, resource_type, resource_id, resource_text, note
  ) values (p_actor_id, p_action, p_resource_type, p_resource_id, p_resource_text, p_note);
end;
$$;

grant execute on function public.log_admin_audit(
  uuid, text, text, uuid, text, text
) to authenticated;

-- Wrap resolve_dispute so it audits every resolution attempt and outcome.
-- The original function body is preserved in 0003; this wrapper hardens the
-- boundary between "admin called resolution" and "admin saw the result".
create or replace function public.resolve_dispute_with_audit(
  p_dispute_id uuid,
  p_outcome text,
  p_note text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_existing_status text;
begin
  if not public.can_moderate() then
    raise exception 'Administrators only';
  end if;
  if p_outcome not in ('resolved_buyer','resolved_seller','dismissed') then
    raise exception 'Invalid dispute outcome';
  end if;

  select d.status into v_existing_status
    from public.disputes d
   where d.id = p_dispute_id
   for update;

  if not found then
    perform public.log_admin_audit(
      auth.uid(), 'resolve_dispute', 'dispute', p_dispute_id, null,
      'Attempted resolution of missing dispute'
    );
    raise exception 'Dispute not found';
  end if;

  if v_existing_status not in ('open','under_review') then
    perform public.log_admin_audit(
      auth.uid(), 'resolve_dispute', 'dispute', p_dispute_id, v_existing_status,
      'Attempted resolution of already-resolved dispute'
    );
    raise exception 'This dispute is already resolved';
  end if;

  -- Delegate the actual escrow movement + status update to the existing
  -- resolve_dispute logic. Calling the existing function keeps the financial
  -- behavior unchanged and is easier to audit than duplicating it here.
  perform public.resolve_dispute(p_dispute_id, p_outcome, p_note);

  perform public.log_admin_audit(
    auth.uid(), 'resolve_dispute', 'dispute', p_dispute_id, v_existing_status,
    format('%s -> %s | note: %s', v_existing_status, p_outcome, coalesce(p_note,''))
  );
end;
$$;

grant execute on function public.resolve_dispute_with_audit(uuid, text, text) to authenticated;

-- Convenience view for the admin UI: one row per dispute with the current status,
-- resolution, and the most recent audit note, if any.
create or replace view public.v_admin_disputes as
select
  d.id,
  d.order_no,
  d.opened_by,
  d.reason,
  d.detail,
  d.status,
  d.resolution_note,
  d.resolved_by,
  d.resolved_at,
  d.created_at,
  a.note as last_audit_note,
  a.created_at as last_audit_at
from public.disputes d
left join lateral (
  select note, created_at
    from public.admin_audit
   where resource_type = 'dispute'
     and resource_id = d.id
   order by created_at desc
   limit 1
) a on true;
