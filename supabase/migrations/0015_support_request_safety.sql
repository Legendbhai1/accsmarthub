-- ============================================================================
-- 0015 — SUPPORT REQUESTS MUST NOT PENALISE THE REPORTER
-- ============================================================================
-- BuyerSupport filed a general support request through the off-platform report
-- table, and set `reported_user_id` to the reporter's OWN id. resolve_report()
-- pauses every active listing belonging to `reported_user_id` when a report is
-- resolved, so resolving a buyer's support ticket suspended that buyer's own
-- listings. It also made the ticket read as "you reported yourself".
--
-- Two fixes, because the existing bad rows still need to be safe:
--   1. The insert policy no longer accepts a self-report, so no new one can be
--      created through the client.
--   2. resolve_report() skips the pause when the reporter is the subject, which
--      neutralises any row that predates this migration.
--
-- A general support request has no subject to penalise. Leaving
-- `reported_user_id` null is what makes that explicit: resolve_report() already
-- treats null as "nobody to act against".

-- ---------------------------------------------------------------------------
-- 1. No new self-reports
-- ---------------------------------------------------------------------------
drop policy if exists "file report" on public.off_platform_reports;
create policy "file report" on public.off_platform_reports for insert
  with check (
    auth.uid() = reporter_id
    and status = 'open'
    -- A report is always about someone else. Filing one against yourself would
    -- only ever be a support request, and resolving it would penalise you.
    and (reported_user_id is null or reported_user_id <> auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 2. Resolving a self-report must not touch the reporter's listings
-- ---------------------------------------------------------------------------
create or replace function public.resolve_report(
  p_report_id uuid, p_status text, p_penalty text
) returns void language plpgsql security definer set search_path = public as $$
declare v_r public.off_platform_reports%rowtype;
begin
  if not public.can_moderate() then raise exception 'Administrators only'; end if;
  if p_status not in ('open','reviewing','resolved','dismissed') then
    raise exception 'Invalid report status';
  end if;
  select * into v_r from public.off_platform_reports where id = p_report_id for update;
  if not found then raise exception 'Report not found'; end if;
  perform set_config('app.trusted_write','on',true);
  update public.off_platform_reports set status = p_status, penalty = p_penalty,
         resolved_at = case when p_status in ('resolved','dismissed') then now() else null end
   where id = p_report_id;
  -- Pause the reported seller's live listings, but never the reporter's own.
  -- A null subject (a general support request) has nobody to pause.
  if p_status = 'resolved'
     and v_r.reported_user_id is not null
     and v_r.reported_user_id <> v_r.reporter_id then
    update public.listings set status = 'paused'
     where seller_id = v_r.reported_user_id and status = 'active';
  end if;
end;
$$;

revoke all on function public.resolve_report(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.resolve_report(uuid, text, text)
  to authenticated;
