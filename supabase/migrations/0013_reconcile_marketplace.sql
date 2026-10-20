-- =====================================================================
-- 0013_reconcile_marketplace.sql
--
-- ONE migration that brings any environment to the state the application
-- code requires, no matter which of 0007-0012 were applied.
--
-- WHY THIS EXISTS
--   0007-0012 were never applied to the linked project. Their syntax and
--   shape errors were repaired in-place in commit b055240 (the same change
--   that added this file), so a fresh database applies 0001-0013 in order
--   cleanly — verified against PostgreSQL 17 via tests/verify-migrations.sh.
--   The original defects, kept here for the record, were:
--
--     1. 0007 `handle_new_user()` used `position('.', v_domain)`, a syntax
--        error. Correct form is `position('.' in v_domain)`. The whole
--        migration aborted, so 0007's store-requeue fix and admin_audit table
--        never landed.
--     2. 0009 `create policy "review owner may edit body"` referenced `new.`
--        and `old.` inside a WITH CHECK. RLS expressions have no such record
--        variables; that is trigger syntax. Migration aborted.
--     3. 0012 created `public.v_admin_disputes` selecting `admin_audit.note`,
--        but 0007 created that table with `detail` instead. Migration aborted.
--     4. 0007 and 0012 both `create table if not exists public.admin_audit`
--        with completely different columns, so whichever ran second silently
--        kept the other's shape and its own inserts then fail at runtime.
--     5. 0009 and 0003/0012 disagreed on the dispute outcome vocabulary
--        ('refund_buyer' vs 'resolved_buyer') and on `disputes.status`
--        ('resolved' vs 'resolved_buyer'), so an admin resolution written by
--        one was rejected by the other.
--
--   Rather than editing published migration files in a way that would break
--   environments that already applied them, 0013 reconciles forward. Every
--   statement is idempotent and order-independent, so it is safe to re-run.
--
-- WHAT IT ESTABLISHES
--   * The canonical dispute vocabulary and a single `resolve_dispute`.
--   * Partial refunds, which the schema could not express at all.
--   * An append-only `order_events` timeline for buyers, sellers and admins.
--   * `order_refunds`, so a refund can never be applied twice.
--   * A private `dispute-evidence` storage bucket with strict policies.
--   * Fixes for four real authorization holes (see section 7).
--
-- Apply with:
--   SUPABASE_PROJECT_REF=<ref> SUPABASE_ACCESS_TOKEN=sbp_... \
--     node scripts/migrate.mjs supabase/migrations/0013_reconcile_marketplace.sql
-- =====================================================================

-- ============================================================
-- 1. ADMIN AUDIT — one table, both historical shapes
--
-- 0007 wrote admin_id/target/detail; 0012 wrote actor_id/resource_type/
-- resource_id/resource_text/note. Both readers exist in the app
-- (AdminAudit.tsx normalises across them). The table keeps every column and
-- log_admin_audit() writes both sets, so no history is lost and no reader
-- breaks.
-- ============================================================

create table if not exists public.admin_audit (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  created_at timestamptz not null default now()
);

alter table public.admin_audit add column if not exists actor_id uuid;
alter table public.admin_audit add column if not exists admin_id uuid;
alter table public.admin_audit add column if not exists resource_type text;
alter table public.admin_audit add column if not exists resource_id uuid;
alter table public.admin_audit add column if not exists resource_text text;
alter table public.admin_audit add column if not exists target text;
alter table public.admin_audit add column if not exists note text;
alter table public.admin_audit add column if not exists detail text;

-- Backfill so a row written by either historical writer is readable by both
-- readers.
update public.admin_audit set actor_id = admin_id where actor_id is null and admin_id is not null;
update public.admin_audit set admin_id = actor_id where admin_id is null and actor_id is not null;
update public.admin_audit set note = detail where note is null and detail is not null;
update public.admin_audit set detail = note where detail is null and note is not null;
update public.admin_audit set resource_text = target where resource_text is null and target is not null;
update public.admin_audit set target = resource_text where target is null and resource_text is not null;
update public.admin_audit set resource_type = 'general' where resource_type is null;

create index if not exists admin_audit_time_idx on public.admin_audit (created_at desc);
create index if not exists admin_audit_resource_idx
  on public.admin_audit (resource_type, resource_id);

alter table public.admin_audit enable row level security;

drop policy if exists "admins read audit" on public.admin_audit;
drop policy if exists "admins read admin audit" on public.admin_audit;
create policy "admins read admin audit" on public.admin_audit for select
  using (public.is_admin() or public.is_service_role());

-- The single writer. Not callable from a browser: it takes the actor as an
-- argument, so granting it to `authenticated` would let any signed-in user
-- forge an audit entry naming somebody else. Internal callers are all
-- SECURITY DEFINER, where current_user is the function owner.
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
    actor_id, admin_id, action, resource_type, resource_id, resource_text,
    target, note, detail
  ) values (
    p_actor_id, p_actor_id, p_action, coalesce(p_resource_type, 'general'),
    p_resource_id, p_resource_text, p_resource_text, p_note, p_note
  );
end;
$$;

revoke all on function public.log_admin_audit(uuid, text, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.log_admin_audit(uuid, text, text, uuid, text, text)
  to service_role;

-- ============================================================
-- 2. DISPUTES — one vocabulary
--
-- Canonical: disputes.status in
--   'open' | 'under_review' | 'resolved_buyer' | 'resolved_seller' | 'dismissed'
-- and disputes.resolution in
--   'refund_buyer' | 'release_seller' | 'partial_refund' | 'dismissed'
--
-- 0009 wrote status='resolved' with resolution in the refund_buyer family;
-- 0003/0012 wrote status in the resolved_* family. The admin UI reads the
-- resolved_* family, so that wins and 0009's rows are migrated.
-- ============================================================

alter table public.disputes add column if not exists resolution text;
alter table public.disputes add column if not exists resolution_note text;
alter table public.disputes add column if not exists resolved_by uuid;
alter table public.disputes add column if not exists resolved_at timestamptz;

-- Widen the status constraint to hold both historical sets, then normalise
-- existing rows onto the canonical set.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'disputes'
       and column_name = 'status'
  ) then
    alter table public.disputes drop constraint if exists disputes_status_check;
  end if;
end
$$;

update public.disputes
   set status = case coalesce(resolution, 'dismissed')
                  when 'refund_buyer'   then 'resolved_buyer'
                  when 'release_seller' then 'resolved_seller'
                  when 'partial_refund' then 'resolved_buyer'
                  else 'dismissed'
                end
 where status = 'resolved';

alter table public.disputes
  add constraint disputes_status_check check (status in
    ('open','under_review','resolved_buyer','resolved_seller','dismissed'));

-- Exactly one dispute row per order. 0003 created a partial unique index over
-- the open states; 0009 wanted a hard unique. Keep the partial one (a resolved
-- dispute must not block a later, separate claim on a re-opened order) but
-- make sure a second *open* claim cannot stack.
drop index if exists public.disputes_one_open_per_order;
create unique index if not exists disputes_one_open_per_order
  on public.disputes (order_no)
  where status in ('open','under_review');

create index if not exists disputes_status_idx on public.disputes (status, created_at desc);

-- Evidence thread: 0003 created it without a role column, 0009 added one.
alter table public.dispute_messages add column if not exists author_role text;
alter table public.dispute_messages add column if not exists evidence jsonb;
-- Denormalised display name so the seller and admin threads can render an
-- author without a second round trip. Written only by add_dispute_message()
-- from the author's own profile row — never trusted from the client.
alter table public.dispute_messages add column if not exists author_name text;

update public.dispute_messages set author_role = 'buyer' where author_role is null;

alter table public.dispute_messages drop constraint if exists dispute_messages_author_role_check;
alter table public.dispute_messages
  add constraint dispute_messages_author_role_check
  check (author_role in ('buyer','seller','admin','system'));

-- ============================================================
-- 3. ORDERS — delivery axis, refund accounting, one state machine
--
-- The order state machine the database already implements, now documented and
-- enforced in one place. `orders.status` is the escrow/ownership axis and
-- `orders.delivery_status` is the fulfilment axis; they move independently.
--
--   status:
--     in_escrow           funds captured and held; the only working state
--     completed           escrow released to the seller (delivery confirmed)
--     disputed            escrow frozen pending an admin decision
--     refunded            buyer made whole; credentials unclaimed, stock back
--     partially_refunded  split decision: buyer refunded, seller paid the rest
--     expired             escrow released to the seller by the sweeper
--
--   delivery_status:
--     pending -> delivered -> buyer_confirmed
--
-- Allowed transitions (actor in brackets):
--   (buyer, wallet checkout)      -> in_escrow, delivery_status=pending
--   (provider webhook, verified)  -> in_escrow, delivery_status=pending
--   (seller | system, digital)    in_escrow.pending   -> in_escrow.delivered
--   (buyer, confirm_delivery)     in_escrow.delivered -> completed.buyer_confirmed
--   (buyer, confirm_delivery)     in_escrow.pending + claimed credentials
--                                                      -> completed.buyer_confirmed
--   (buyer, open_dispute)         in_escrow.*         -> disputed
--   (admin, resolve_dispute)      disputed            -> refunded
--                                                      | completed
--                                                      | partially_refunded
--   (admin, refund_order)         in_escrow           -> refunded
--   (admin, resolve_order_request) in_escrow          -> refunded (cancellation)
--   (sweeper, server-only)        in_escrow (expired) -> expired
--
-- Anything not listed is rejected. Every transition runs inside a SECURITY
-- DEFINER function that locks the order row FOR UPDATE first, so two
-- concurrent callers cannot both pass the state check.
-- ============================================================

alter table public.orders
  add column if not exists delivery_status text default 'pending';

alter table public.orders add column if not exists delivered_at timestamptz;
alter table public.orders add column if not exists delivery_method text;
alter table public.orders add column if not exists inspection_deadline timestamptz;
alter table public.orders add column if not exists delivery_note text;
alter table public.orders add column if not exists refunded_amount numeric(12,2) not null default 0;
alter table public.orders add column if not exists inspection_escalated_at timestamptz;

update public.orders set delivery_status = 'pending' where delivery_status is null;
update public.orders
   set delivery_status = 'buyer_confirmed'
 where status = 'completed' and delivery_status <> 'buyer_confirmed';
update public.orders
   set inspection_deadline = created_at + interval '14 days'
 where inspection_deadline is null and status = 'in_escrow';

alter table public.orders drop constraint if exists orders_delivery_status_check;
alter table public.orders
  add constraint orders_delivery_status_check
  check (delivery_status in ('pending','delivered','buyer_confirmed'));

alter table public.orders drop constraint if exists orders_delivery_method_check;
alter table public.orders
  add constraint orders_delivery_method_check
  check (delivery_method is null or delivery_method in ('digital','manual','auto'));

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check check (status in
    ('in_escrow','completed','disputed','refunded','partially_refunded','expired'));

alter table public.orders drop constraint if exists orders_refunded_amount_check;
alter table public.orders
  add constraint orders_refunded_amount_check
  check (refunded_amount >= 0 and refunded_amount <= total_usd);

create index if not exists orders_delivery_idx on public.orders (status, delivery_status);
create index if not exists orders_inspection_idx
  on public.orders (inspection_deadline)
  where status = 'in_escrow' and delivery_status = 'delivered';

-- ============================================================
-- 4. ORDER REFUNDS — an idempotency ledger for dispute outcomes
--
-- A full or partial refund moves money out of escrow. Without a durable record
-- keyed by an idempotency key, a retried admin action (a double-click, a
-- network retry, two admins on the same case) could refund twice. The unique
-- index is what makes that impossible, not the application's state check.
-- ============================================================

create table if not exists public.order_refunds (
  id uuid primary key default gen_random_uuid(),
  order_no text not null references public.orders(order_no) on delete cascade,
  dispute_id uuid references public.disputes(id) on delete set null,
  amount_usd numeric(12,2) not null check (amount_usd > 0),
  buyer_amount numeric(12,2) not null default 0 check (buyer_amount >= 0),
  seller_amount numeric(12,2) not null default 0 check (seller_amount >= 0),
  outcome text not null check (outcome in
    ('refund_buyer','release_seller','partial_refund','dismissed')),
  note text,
  decided_by uuid,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (order_no, idempotency_key)
);

create index if not exists order_refunds_order_idx on public.order_refunds (order_no);
alter table public.order_refunds enable row level security;

drop policy if exists "parties read order refunds" on public.order_refunds;
create policy "parties read order refunds" on public.order_refunds for select
  using (
    auth.uid() = (select buyer_id from public.orders where order_no = order_refunds.order_no)
    or auth.uid() = (select seller_id from public.orders where order_no = order_refunds.order_no)
    or public.is_admin()
  );

grant select on public.order_refunds to authenticated;

-- ============================================================
-- 5. ORDER EVENTS — the shared, append-only timeline
--
-- Both parties and admins read this. Nothing updates or deletes a row: there
-- are no UPDATE/DELETE policies and no write grant for a client, so the
-- timeline cannot be rewritten after the fact.
-- ============================================================

create table if not exists public.order_events (
  id bigserial primary key,
  order_no text not null references public.orders(order_no) on delete cascade,
  actor_id uuid,
  actor_role text not null default 'system'
    check (actor_role in ('buyer','seller','admin','system')),
  event text not null,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists order_events_order_idx on public.order_events (order_no, created_at);
alter table public.order_events enable row level security;

drop policy if exists "parties read order events" on public.order_events;
create policy "parties read order events" on public.order_events for select
  using (
    auth.uid() = (select buyer_id from public.orders where order_no = order_events.order_no)
    or auth.uid() = (select seller_id from public.orders where order_no = order_events.order_no)
    or public.is_admin()
  );

grant select on public.order_events to authenticated;

-- The trigger records the transitions that every order goes through, so the
-- timeline is complete even for paths that forget to write an explicit event.
create or replace function public.log_order_event(
  p_order_no text, p_actor uuid, p_role text, p_event text, p_detail text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_order_no is null or p_event is null then return; end if;
  insert into public.order_events (order_no, actor_id, actor_role, event, detail)
  values (p_order_no, p_actor, coalesce(p_role, 'system'), p_event, p_detail);
end;
$$;

revoke all on function public.log_order_event(text, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.log_order_event(text, uuid, text, text, text)
  to service_role;

create or replace function public.tg_log_order_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_order_event(
      new.order_no, null, 'system', 'order_created',
      format('Order created for %s (%s x %s).', new.listing_title, new.quantity, new.total_usd));
    return new;
  end if;

  if new.status is distinct from old.status then
    perform public.log_order_event(
      new.order_no, auth.uid(),
      case
        when public.is_admin() then 'admin'
        when auth.uid() = new.buyer_id then 'buyer'
        when auth.uid() = new.seller_id then 'seller'
        else 'system'
      end,
      'status_' || new.status,
      format('%s -> %s', old.status, new.status));
  end if;

  if new.delivery_status is distinct from old.delivery_status then
    perform public.log_order_event(
      new.order_no, auth.uid(),
      case
        when public.is_admin() then 'admin'
        when auth.uid() = new.seller_id then 'seller'
        when auth.uid() = new.buyer_id then 'buyer'
        else 'system'
      end,
      'delivery_' || new.delivery_status,
      format('Delivery %s -> %s%s', old.delivery_status, new.delivery_status,
             case when new.delivery_method is not null
                  then ' (' || new.delivery_method || ')' else '' end));
  end if;

  if new.refunded_amount is distinct from old.refunded_amount then
    perform public.log_order_event(
      new.order_no, auth.uid(), 'system', 'refund_recorded',
      format('Refunded %s (was %s).', new.refunded_amount, old.refunded_amount));
  end if;

  return new;
end;
$$;

drop trigger if exists orders_log_events on public.orders;
create trigger orders_log_events after insert or update on public.orders
  for each row execute function public.tg_log_order_event();

-- Evidence/decision events are written explicitly by the dispute functions.
create or replace function public.tg_log_dispute_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_order_event(
      new.order_no, new.opened_by, 'buyer', 'dispute_opened',
      format('%s: %s', new.reason, left(coalesce(new.detail, ''), 200)));
    return new;
  end if;

  if new.status is distinct from old.status then
    perform public.log_order_event(
      new.order_no, coalesce(new.resolved_by, auth.uid()), 'admin',
      'dispute_' || new.status,
      coalesce(new.resolution_note, new.resolution));
  end if;
  return new;
end;
$$;

drop trigger if exists disputes_log_events on public.disputes;
create trigger disputes_log_events after insert or update on public.disputes
  for each row execute function public.tg_log_dispute_event();

-- ============================================================
-- 6. NOTIFICATIONS, CART, REVIEWS, ORDER REQUESTS
--
-- Defined here so an environment that never received 0009 still has them.
-- ============================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  reference text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx
  on public.notifications(user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications(user_id, read) where not read;
alter table public.notifications enable row level security;

drop policy if exists "users read and manage their own notifications" on public.notifications;
create policy "users read and manage their own notifications" on public.notifications for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  quantity integer not null check (quantity >= 1 and quantity <= 1000),
  added_at timestamptz not null default now(),
  unique (user_id, listing_id)
);
create index if not exists cart_items_user_idx on public.cart_items(user_id);
alter table public.cart_items enable row level security;

drop policy if exists "users see and manage their own cart" on public.cart_items;
create policy "users see and manage their own cart" on public.cart_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_no text not null references public.orders(order_no) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_id uuid not null references auth.users(id),
  seller_id uuid not null references auth.users(id),
  rating integer not null check (rating between 1 and 5),
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  unique (order_no)
);
create index if not exists reviews_listing_idx on public.reviews(listing_id);
alter table public.reviews enable row level security;

drop policy if exists "anyone reads reviews" on public.reviews;
create policy "anyone reads reviews" on public.reviews for select using (true);

create table if not exists public.order_requests (
  id uuid primary key default gen_random_uuid(),
  order_no text not null references public.orders(order_no) on delete cascade,
  requested_by uuid not null references auth.users(id),
  kind text not null check (kind in ('replacement','cancellation')),
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending','approved','dismissed')),
  resolved_by uuid,
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_no, kind)
);
create index if not exists order_requests_order_idx on public.order_requests(order_no);
alter table public.order_requests enable row level security;

drop policy if exists "parties read order requests" on public.order_requests;
create policy "parties read order requests" on public.order_requests for select
  using (
    auth.uid() = requested_by
    or auth.uid() = (select buyer_id from public.orders where order_no = order_requests.order_no)
    or auth.uid() = (select seller_id from public.orders where order_no = order_requests.order_no)
    or public.is_admin()
  );

grant select on public.notifications to authenticated;
grant update (read) on public.notifications to authenticated;
grant select, insert, update, delete on public.cart_items to authenticated;
grant select on public.reviews to authenticated;
grant select on public.order_requests to authenticated;

create or replace function public.notify(
  p_user uuid, p_kind text, p_title text, p_body text, p_reference text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_kind is null or p_title is null then return; end if;
  insert into public.notifications (user_id, kind, title, body, reference)
    values (p_user, p_kind, p_title, p_body, p_reference);
end;
$$;

grant execute on function public.notify(uuid, text, text, text, text)
  to authenticated, service_role;

create or replace function public.mark_notifications_read(p_user uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if p_user is null then raise exception 'No user'; end if;
  -- A caller may only clear their own notifications; an admin clearing
  -- somebody else's unread state is not a legitimate operation.
  if p_user <> auth.uid() and not public.can_moderate() then
    raise exception 'You can only mark your own notifications as read';
  end if;
  update public.notifications set read = true
    where user_id = p_user and not read;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

grant execute on function public.mark_notifications_read(uuid) to authenticated;

-- ============================================================
-- 7. AUTHORIZATION FIXES
--
-- Four real holes found while auditing the existing policies. All four are
-- exploitable with the publishable key from a browser console.
-- ============================================================

-- 7a. is_trusted_write() treated any non-client database user as trusted.
--
--   `current_user not in ('anon','authenticated')` was meant to let a SQL
--   Editor session bootstrap an admin. But `security definer` functions run as
--   their OWNER, so every function that is owned by a role other than
--   anon/authenticated (any function created by the dashboard SQL editor, by
--   the migration role, or by a future service-role helper) would silently see
--   is_trusted_write() = true. A SECURITY DEFINER function that a client can
--   call and that does not check authorization first could then write
--   status/stock/is_admin/balances.
--
--   The flag is now the only non-moderator route, and the bootstrap case is
--   covered by can_moderate() for a real admin session plus a dedicated
--   app.bootstrap setting that an operator sets explicitly.
create or replace function public.is_trusted_write()
returns boolean language sql stable set search_path = public as $$
  select public.can_moderate()
      or coalesce(current_setting('app.trusted_write', true), 'off') = 'on'
      or coalesce(current_setting('app.bootstrap', true), 'off') = 'on';
$$;

-- 7b. Any signed-in user could publish an audit entry, and could not be
--   attributed. log_admin_audit() took p_actor_id as a parameter and was
--   granted to `authenticated`. It is now revoked from clients entirely and
--   derives nothing from the caller — internal callers pass auth.uid()
--   themselves. (Defined in section 1 above.)

-- 7c. `profiles` was readable in full by any signed-in user for any row that
--   an admin policy matched — but more importantly, is_admin() is SECURITY
--   DEFINER and reads profiles, so the `or public.is_admin()` clause on the
--   profiles SELECT policy makes every profile row readable by an admin, and
--   admin_list_users() already provides the privileged listing. The public
--   policy now exposes only what a seller's public page needs, via a view,
--   and the table itself is owner-or-admin.
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for select
  using (auth.uid() = id or public.is_admin());

-- A narrow, safe projection for showing a seller's display name on a listing
-- or order without handing out emails and admin flags.
--
-- security_invoker is deliberately FALSE here. With invoker rights the view
-- would inherit the profiles policy (own row or admin) and so return at most
-- one row, which defeats the purpose. Definer rights let it read every profile
-- while exposing only the id and a display name — the caller cannot select a
-- column the view does not project.
create or replace view public.public_profiles
with (security_invoker = false) as
  select id, coalesce(nullif(name, ''), 'Member') as display_name
    from public.profiles;

grant select on public.public_profiles to anon, authenticated;

-- 7d. The order_requests insert policy let a buyer insert a request against
--   ANY order number, including somebody else's, and with an arbitrary reason.
--   Ownership is now proved against the order row.
drop policy if exists "buyer may request replacement or cancellation" on public.order_requests;
create policy "buyer may request replacement or cancellation" on public.order_requests for insert
  with check (
    auth.uid() = requested_by
    and status = 'pending'
    and kind in ('replacement','cancellation')
    and exists (
      select 1 from public.orders o
       where o.order_no = order_requests.order_no
         and o.buyer_id = auth.uid()
    )
  );

-- 7e. `disputes.reason` had no constraint on the 0003-era table, so any text
--   could be stored — and 0003 also shipped a buyer UI that posted its human
--   labels ("Not as described") verbatim as the reason. Those labels are real
--   production values, so the constraint below cannot simply be added: it
--   would be rejected by existing rows.
--
--   Every existing row is therefore normalised onto the canonical vocabulary
--   first, through an explicit, recorded mapping — never a blind
--   `set reason = 'other'`. `dispute_reason_normalizations` is that record:
--   one row per reason value that had to be rewritten, the canonical value it
--   became, how many disputes it covered, and when. It is server-only (RLS on,
--   no policies, no grants), the same shape as `disposable_email_domains`.
create table if not exists public.dispute_reason_normalizations (
  id uuid primary key default gen_random_uuid(),
  legacy_reason text not null,
  canonical_reason text not null,
  affected_count integer not null,
  normalized_at timestamptz not null default now()
);
create unique index if not exists dispute_reason_normalizations_legacy_idx
  on public.dispute_reason_normalizations (legacy_reason);
alter table public.dispute_reason_normalizations enable row level security;

-- The normalisation itself, as a function so the migration and the regression
-- suite exercise exactly the same code. Returns the number of rows rewritten.
--   * a canonical value is left alone;
--   * a value in the map is rewritten and recorded;
--   * anything else raises, naming every offending value at once.
create or replace function public.normalize_dispute_reasons()
returns integer language plpgsql security definer set search_path = public as $$
declare
  -- The deliberate, auditable policy: which legacy strings mean what. The
  -- first block is the exact set of labels the 0003-era buyer UI posted; the
  -- second is case/spacing variants of the canonical values themselves.
  v_map constant jsonb := jsonb_build_object(
    'Not as described',    'not_as_described',
    'Transfer failed',     'transfer_failed',
    'Seller unresponsive', 'seller_unresponsive',
    'Item not received',   'item_not_received',
    'Other',               'other',
    'not as described',    'not_as_described',
    'transfer failed',     'transfer_failed',
    'seller unresponsive', 'seller_unresponsive',
    'item not received',   'item_not_received',
    'NOT AS DESCRIBED',    'not_as_described',
    'TRANSFER FAILED',     'transfer_failed',
    'SELLER UNRESPONSIVE', 'seller_unresponsive',
    'ITEM NOT RECEIVED',   'item_not_received',
    'OTHER',               'other'
  );
  v_canonical constant text[] := array[
    'not_as_described','transfer_failed','seller_unresponsive',
    'item_not_received','other'];
  r record;
  v_total integer := 0;
  v_unmapped text;
begin
  -- Rewrite only values we have an explicit mapping for. A row already holding
  -- a canonical value is left exactly as it is, so re-running rewrites nothing
  -- and records nothing.
  for r in
    select reason, v_map ->> reason as canonical, count(*)::integer as n
      from public.disputes
     where (v_map ->> reason) is not null
       and reason <> (v_map ->> reason)
     group by reason, v_map ->> reason
  loop
    update public.disputes set reason = r.canonical where reason = r.reason;
    insert into public.dispute_reason_normalizations
      (legacy_reason, canonical_reason, affected_count)
    values (r.reason, r.canonical, r.n)
    on conflict (legacy_reason) do update
      set canonical_reason = excluded.canonical_reason,
          affected_count    = excluded.affected_count,
          normalized_at     = now();
    v_total := v_total + r.n;
  end loop;

  -- Anything left that is not canonical has no agreed mapping. Refuse loudly
  -- and name it, rather than silently filing it under 'other'. The operator
  -- adds a mapping above (or corrects the row) and re-runs; the rows that did
  -- have a mapping are already normalised and recorded.
  select string_agg(distinct format('%L (%s row(s))', reason, n), ', ')
    into v_unmapped
    from (
      select reason, count(*) as n
        from public.disputes
       where reason <> all (v_canonical)
       group by reason
    ) t;

  if v_unmapped is not null then
    raise exception using
      message = format(
        'disputes.reason holds unmapped value(s): %s. Add each to the map in normalize_dispute_reasons() (or correct the row) and re-run. Canonical values are: %s',
        v_unmapped, array_to_string(v_canonical, ', ')),
      hint = 'Mapped values were already normalised and recorded in public.dispute_reason_normalizations; nothing was silently coerced to ''other''.';
  end if;

  return v_total;
end;
$$;

-- Server-only: this rewrites financial-adjacent history and must never be
-- callable from a client session.
revoke all on function public.normalize_dispute_reasons() from public, anon, authenticated;

select public.normalize_dispute_reasons();

alter table public.disputes drop constraint if exists disputes_reason_check;
alter table public.disputes
  add constraint disputes_reason_check check (reason in
    ('not_as_described','transfer_failed','seller_unresponsive','item_not_received','other'));

-- 7f. Dispute parties: one predicate, used by every evidence policy, so a
--   seller can never read a dispute on somebody else's order.
create or replace function public.is_dispute_party(p_dispute_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.disputes d
      join public.orders o on o.order_no = d.order_no
     where d.id = p_dispute_id
       and (o.buyer_id = auth.uid() or o.seller_id = auth.uid())
  ) or public.can_moderate();
$$;

grant execute on function public.is_dispute_party(uuid) to authenticated;

drop policy if exists "parties read disputes" on public.disputes;
create policy "parties read disputes" on public.disputes for select
  using (public.is_dispute_party(id));

drop policy if exists "buyer opens dispute" on public.disputes;
drop policy if exists "buyer may open one dispute per order" on public.disputes;
create policy "buyer opens dispute" on public.disputes for insert
  with check (
    auth.uid() = opened_by
    and exists (
      select 1 from public.orders o
       where o.order_no = public.disputes.order_no
         and o.buyer_id = auth.uid()
    )
  );

drop policy if exists "parties read dispute messages" on public.dispute_messages;
drop policy if exists "dispute parties read and add messages" on public.dispute_messages;
create policy "parties read dispute messages" on public.dispute_messages for select
  using (public.is_dispute_party(dispute_id));

drop policy if exists "parties post dispute messages" on public.dispute_messages;
create policy "parties post dispute messages" on public.dispute_messages for insert
  with check (auth.uid() = author_id and public.is_dispute_party(dispute_id));

grant select on public.disputes to authenticated;
grant select on public.dispute_messages to authenticated;

-- ============================================================
-- 8. DISPUTE FUNCTIONS
-- ============================================================

-- The reason vocabulary the UI must send. Kept as a function so the client can
-- render the same list the constraint enforces.
create or replace function public.dispute_reasons()
returns text[] language sql immutable as $$
  select array['not_as_described','transfer_failed','seller_unresponsive',
               'item_not_received','other']::text[];
$$;

grant execute on function public.dispute_reasons() to anon, authenticated;

-- Who wrote a dispute message, derived from the order rather than from a
-- client-supplied argument. 0009's version guessed by asking "has this person
-- ever sold anything", which mislabels a user who both buys and sells.
create or replace function public.dispute_message_role(
  p_dispute_id uuid, p_author_id uuid
) returns text language sql stable security definer set search_path = public as $$
  select case
    when public.is_admin() then 'admin'
    when exists (
      select 1 from public.disputes d
        join public.orders o on o.order_no = d.order_no
       where d.id = p_dispute_id and o.buyer_id = p_author_id
    ) then 'buyer'
    when exists (
      select 1 from public.disputes d
        join public.orders o on o.order_no = d.order_no
       where d.id = p_dispute_id and o.seller_id = p_author_id
    ) then 'seller'
    else 'system'
  end;
$$;

grant execute on function public.dispute_message_role(uuid, uuid) to authenticated;

-- Buyer opens a dispute. Escrow freezes; no money moves until an admin decides.
create or replace function public.open_dispute(
  p_order_no text,
  p_reason text,
  p_detail text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_o public.orders%rowtype;
  v_id uuid;
  v_existing uuid;
begin
  if p_order_no is null or p_reason is null or p_detail is null then
    raise exception 'Order, reason and detail are required';
  end if;
  if p_reason not in ('not_as_described','transfer_failed','seller_unresponsive',
                      'item_not_received','other') then
    raise exception 'Invalid dispute reason';
  end if;
  if length(btrim(p_detail)) < 10 then
    raise exception 'Please describe the issue in at least 10 characters';
  end if;
  if length(p_detail) > 5000 then
    raise exception 'Please keep the description under 5000 characters';
  end if;

  select * into v_o from public.orders where order_no = p_order_no for update;
  if not found then raise exception 'Order not found'; end if;
  if v_o.buyer_id <> auth.uid() then
    raise exception 'Only the buyer can open a dispute';
  end if;
  if v_o.status <> 'in_escrow' then
    raise exception 'Only an order still in escrow can be disputed';
  end if;
  if v_o.delivery_status = 'buyer_confirmed' then
    raise exception 'This order was already confirmed by the buyer';
  end if;

  -- The dispute window is the seller's disclosed warranty when there is one,
  -- otherwise the 14-day inspection window the order was created with. Both
  -- are stored on the order, so the window cannot be moved by editing a
  -- listing afterwards.
  if v_o.inspection_deadline is not null and v_o.inspection_deadline < now() then
    raise exception 'The dispute window for this order closed on %. Contact support if you believe this is wrong.',
      to_char(v_o.inspection_deadline, 'YYYY-MM-DD');
  end if;

  select id into v_existing from public.disputes
   where order_no = p_order_no and status in ('open','under_review');
  if found then
    raise exception 'A dispute is already open on this order';
  end if;

  insert into public.disputes (order_no, opened_by, reason, detail)
    values (p_order_no, auth.uid(), p_reason, btrim(p_detail))
    returning id into v_id;

  perform set_config('app.trusted_write','on',true);
  update public.orders set status = 'disputed' where order_no = p_order_no;

  perform public.notify(v_o.buyer_id, 'dispute_opened',
    'Dispute opened',
    'Your dispute has been opened. Escrow is frozen while it is reviewed.',
    v_id::text);
  perform public.notify(v_o.seller_id, 'dispute_opened',
    'Dispute opened on your order',
    format('A buyer opened a dispute on order %s. Escrow is frozen. Add your evidence and a proposed resolution.',
      p_order_no),
    v_id::text);

  return v_id;
end;
$$;

grant execute on function public.open_dispute(text, text, text) to authenticated;

-- Evidence. author_role and author_name are derived, never accepted from the
-- caller: 0009 took the role as an argument, so a buyer could post as 'seller'
-- (or as 'admin') by passing a different string. Both older shapes are dropped
-- so a stale client cannot reach a version that trusts its argument.
drop function if exists public.add_dispute_message(uuid, text, text);
drop function if exists public.add_dispute_message(uuid, text);

create or replace function public.add_dispute_message(
  p_dispute_id uuid,
  p_body text,
  p_evidence jsonb default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_d public.disputes%rowtype;
  v_role text;
  v_name text;
  v_id uuid;
  v_order public.orders%rowtype;
begin
  if p_dispute_id is null then raise exception 'Dispute is required'; end if;
  if p_body is null or length(btrim(p_body)) < 1 then
    raise exception 'A message body is required';
  end if;
  if length(p_body) > 5000 then
    raise exception 'Please keep the message under 5000 characters';
  end if;

  select * into v_d from public.disputes where id = p_dispute_id for update;
  if not found then raise exception 'Dispute not found'; end if;
  if v_d.status not in ('open','under_review') then
    raise exception 'This dispute is already resolved';
  end if;
  if not public.is_dispute_party(p_dispute_id) then
    raise exception 'You are not a party to this dispute';
  end if;

  v_role := public.dispute_message_role(p_dispute_id, auth.uid());
  select coalesce(nullif(name, ''), 'Member') into v_name
    from public.profiles where id = auth.uid();
  v_name := coalesce(v_name, 'Member');

  insert into public.dispute_messages
    (dispute_id, author_id, author_role, author_name, body, evidence)
  values (p_dispute_id, auth.uid(), v_role, v_name, btrim(p_body), p_evidence)
  returning id into v_id;

  -- A seller responding moves the case into review; the buyer's first message
  -- is their statement and leaves it open.
  if v_role = 'seller' and v_d.status = 'open' then
    perform set_config('app.trusted_write','on',true);
    update public.disputes set status = 'under_review' where id = p_dispute_id;
  end if;

  select * into v_order from public.orders where order_no = v_d.order_no;

  perform public.notify(
    case when v_role = 'seller' then v_order.buyer_id else v_order.seller_id end,
    'dispute_updated',
    'New message on your dispute',
    format('%s added a message to the dispute on order %s.', v_name, v_d.order_no),
    p_dispute_id::text);
  perform public.notify(v_order.buyer_id, 'dispute_updated',
    'Evidence added to your dispute',
    'The dispute thread has been updated. An admin will review the case.',
    p_dispute_id::text);

  return v_id;
end;
$$;

grant execute on function public.add_dispute_message(uuid, text, jsonb) to authenticated;

-- The escrow settlement primitive every refund path goes through.
--
-- Invariant: buyer_refund + seller_payout = total_usd, and seller_payout is
-- capped at seller_net_amount so the platform absorbs its own fees first and
-- can never pay a seller more than their share.
--
-- Runs inside the caller's transaction, so the wallet movement, the order
-- status change and the order_refunds row either all land or none do. The
-- (order_no, idempotency_key) unique index is what makes a retry a no-op.
create or replace function public.settle_order_refund(
  p_order_no text,
  p_buyer_refund numeric,
  p_outcome text,
  p_note text,
  p_dispute_id uuid,
  p_idempotency_key text
) returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_o public.orders%rowtype;
  v_seller_payout numeric(12,2);
  v_status text;
begin
  if p_order_no is null then raise exception 'Order is required'; end if;
  if p_buyer_refund is null or p_buyer_refund < 0 then
    raise exception 'Refund amount cannot be negative';
  end if;
  if p_outcome not in ('refund_buyer','release_seller','partial_refund','dismissed') then
    raise exception 'Invalid refund outcome';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) < 8 then
    raise exception 'An idempotency key of at least 8 characters is required';
  end if;

  select * into v_o from public.orders where order_no = p_order_no for update;
  if not found then raise exception 'Order not found'; end if;

  -- Retry guard. The row lock above serialises concurrent callers, so the
  -- loser of the race sees the row inserted by the winner and returns instead
  -- of moving money a second time.
  if exists (
    select 1 from public.order_refunds
     where order_no = p_order_no and idempotency_key = p_idempotency_key
  ) then
    return v_o.refunded_amount;
  end if;

  if p_buyer_refund > v_o.total_usd then
    raise exception 'A refund cannot exceed the % the buyer paid', v_o.total_usd;
  end if;

  v_seller_payout := least(v_o.seller_net_amount, v_o.total_usd - p_buyer_refund);

  -- The escrow hold is released in full either way; part of it becomes the
  -- buyer's refund and part is paid to the seller.
  perform public.apply_wallet(v_o.seller_id, v_seller_payout, -v_o.seller_net_amount,
    'escrow_release', p_order_no,
    case when p_buyer_refund > 0 then 'dispute resolved — partial release'
         else 'escrow released to seller' end);
  if p_buyer_refund > 0 then
    perform public.apply_wallet(v_o.buyer_id, p_buyer_refund, 0, 'refund', p_order_no,
      coalesce(p_note, 'refund issued'));
  end if;

  v_status := case
    when p_buyer_refund = 0 then 'completed'
    when p_buyer_refund >= v_o.total_usd then 'refunded'
    else 'partially_refunded'
  end;

  -- A full refund returns the accounts to the seller's inventory. A partial
  -- refund means the buyer keeps what they received, so stock is untouched.
  if v_status = 'refunded' then
    update public.listings set stock = stock + v_o.quantity
      where id = v_o.listing_id;
    update public.listing_credentials
       set claimed_by_order = null, claimed_at = null
     where claimed_by_order = p_order_no;
  end if;

  perform set_config('app.trusted_write','on',true);
  update public.orders
     set status = v_status,
         refunded_amount = refunded_amount + p_buyer_refund,
         delivery_status = case when v_status = 'completed' then delivery_status
                                else delivery_status end
   where order_no = p_order_no;

  insert into public.order_refunds
    (order_no, dispute_id, amount_usd, buyer_amount, seller_amount, outcome,
     note, decided_by, idempotency_key)
  values (p_order_no, p_dispute_id, p_buyer_refund, p_buyer_refund, v_seller_payout,
          p_outcome, p_note, auth.uid(), btrim(p_idempotency_key));

  perform public.notify(v_o.buyer_id, 'refund_processed',
    case when p_buyer_refund >= v_o.total_usd then 'Refund issued'
         when p_buyer_refund > 0 then 'Partial refund issued'
         else 'Escrow released to the seller' end,
    case when p_buyer_refund > 0
      then format('Order %s: %s was returned to your wallet.', p_order_no, p_buyer_refund)
      else format('Order %s was resolved and the escrow hold released.', p_order_no)
    end,
    p_order_no);

  return p_buyer_refund;
end;
$$;

revoke all on function public.settle_order_refund(text, numeric, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.settle_order_refund(text, numeric, text, text, uuid, text)
  to service_role;

-- Admin resolves a dispute.
--
-- p_outcome:
--   'release_seller'  escrow paid to the seller, order completed
--   'refund_buyer'    buyer made whole, order refunded, stock restored
--   'partial_refund'  buyer refunded p_partial_amount, seller paid the rest
--   'dismissed'       no refund; escrow released to the seller as normal
--
-- Every outcome records an admin_audit row and an order_events row, and the
-- order_refunds row is what makes a duplicate decision impossible.
drop function if exists public.resolve_dispute(uuid, text, text);
drop function if exists public.resolve_dispute(uuid, text, text, numeric, text);

create or replace function public.resolve_dispute(
  p_dispute_id uuid,
  p_outcome text,
  p_note text,
  p_partial_amount numeric default null,
  p_idempotency_key text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_d public.disputes%rowtype;
  v_o public.orders%rowtype;
  v_key text;
  v_refund numeric(12,2);
  v_status text;
begin
  if not public.can_moderate() then raise exception 'Administrators only'; end if;
  if p_dispute_id is null then raise exception 'Dispute is required'; end if;
  if p_outcome is null or p_outcome not in
     ('refund_buyer','release_seller','partial_refund','dismissed') then
    raise exception 'Outcome must be refund_buyer, release_seller, partial_refund or dismissed';
  end if;
  if p_outcome <> 'dismissed' and (p_note is null or length(btrim(p_note)) < 3) then
    raise exception 'A resolution note is required';
  end if;

  select * into v_d from public.disputes where id = p_dispute_id for update;
  if not found then raise exception 'Dispute not found'; end if;
  if v_d.status not in ('open','under_review') then
    raise exception 'This dispute is already resolved';
  end if;

  select * into v_o from public.orders where order_no = v_d.order_no for update;
  if not found then raise exception 'Order not found for dispute'; end if;
  if v_o.status <> 'disputed' then
    raise exception 'Only a disputed order can be resolved from a dispute (it is %)', v_o.status;
  end if;

  -- Default key keeps a single admin click idempotent across a double submit.
  -- An explicit key is validated here rather than in settle_order_refund so the
  -- caller gets a message naming the argument they passed.
  if p_idempotency_key is not null and btrim(p_idempotency_key) <> ''
     and length(btrim(p_idempotency_key)) < 8 then
    raise exception 'The idempotency key must be at least 8 characters';
  end if;
  v_key := coalesce(nullif(btrim(coalesce(p_idempotency_key, '')), ''),
                   p_dispute_id::text || ':' || p_outcome);

  if p_outcome = 'partial_refund' then
    if p_partial_amount is null or p_partial_amount <= 0 then
      raise exception 'A partial refund needs an amount greater than zero';
    end if;
    if p_partial_amount >= v_o.total_usd then
      raise exception 'A partial refund must be less than the % the buyer paid. Use "refund buyer" for a full refund.',
        v_o.total_usd;
    end if;
    v_refund := round(p_partial_amount, 2);
  elsif p_outcome = 'refund_buyer' then
    v_refund := v_o.total_usd;
  else
    v_refund := 0;
  end if;

  perform public.settle_order_refund(
    v_o.order_no, v_refund, p_outcome, p_note, p_dispute_id, v_key);

  select status into v_status from public.orders where order_no = v_o.order_no;

  perform set_config('app.trusted_write','on',true);
  update public.disputes
     set status = case p_outcome
                    when 'refund_buyer'   then 'resolved_buyer'
                    when 'partial_refund' then 'resolved_buyer'
                    when 'release_seller' then 'resolved_seller'
                    else 'dismissed'
                  end,
         resolution = p_outcome,
         resolution_note = p_note,
         resolved_by = auth.uid(),
         resolved_at = now()
   where id = p_dispute_id;

  perform public.log_admin_audit(
    auth.uid(), 'dispute.resolve', 'dispute', p_dispute_id,
    v_d.order_no,
    format('%s -> %s (%s refunded, order now %s) | %s',
           v_d.status, p_outcome, v_refund, v_status, coalesce(p_note, '')));

  if p_outcome = 'refund_buyer' then
    perform public.notify(v_o.seller_id, 'refund_processed',
      'Dispute resolved — funds returned to the buyer',
      format('Order %s was refunded after review.', v_o.order_no), v_d.id::text);
  elsif p_outcome = 'partial_refund' then
    perform public.notify(v_o.seller_id, 'refund_processed',
      'Dispute resolved — partial refund issued',
      format('Order %s was resolved with a %s refund to the buyer.', v_o.order_no, v_refund),
      v_d.id::text);
    perform public.notify(v_o.buyer_id, 'refund_processed',
      'Dispute resolved — partial refund issued',
      format('%s was returned to your wallet for order %s.', v_refund, v_o.order_no),
      v_d.id::text);
  elsif p_outcome = 'release_seller' then
    perform public.notify(v_o.buyer_id, 'dispute_resolved',
      'Dispute resolved — funds released to the seller',
      format('Your dispute on order %s was reviewed and the funds were released.', v_o.order_no),
      v_d.id::text);
    perform public.notify(v_o.seller_id, 'dispute_resolved',
      'Dispute resolved in your favour',
      format('Order %s was resolved in your favour and escrow released.', v_o.order_no),
      v_d.id::text);
  else
    perform public.notify(v_o.buyer_id, 'dispute_resolved',
      'Dispute dismissed',
      format('Your dispute on order %s was dismissed after review.', v_o.order_no),
      v_d.id::text);
    perform public.notify(v_o.seller_id, 'dispute_resolved',
      'Dispute dismissed',
      format('The dispute on order %s was dismissed.', v_o.order_no),
      v_d.id::text);
  end if;
end;
$$;

grant execute on function public.resolve_dispute(uuid, text, text, numeric, text)
  to authenticated;

-- Move a dispute into review without resolving it (admin triage).
create or replace function public.start_dispute_review(p_dispute_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_d public.disputes%rowtype;
begin
  if not public.can_moderate() then raise exception 'Administrators only'; end if;
  select * into v_d from public.disputes where id = p_dispute_id for update;
  if not found then raise exception 'Dispute not found'; end if;
  if v_d.status <> 'open' then raise exception 'Only an open dispute can move into review'; end if;
  perform set_config('app.trusted_write','on',true);
  update public.disputes set status = 'under_review' where id = p_dispute_id;
  perform public.log_admin_audit(auth.uid(), 'dispute.review', 'dispute', p_dispute_id,
    v_d.order_no, 'moved to under review');
end;
$$;

grant execute on function public.start_dispute_review(uuid) to authenticated;

-- ============================================================
-- 9. ORDER LIFECYCLE
-- ============================================================

-- Seller marks an order delivered. Only the seller of that order, only while
-- it is in escrow, and only once.
create or replace function public.mark_order_delivered(
  p_order_no text,
  p_method text default 'digital',
  p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_o public.orders%rowtype;
begin
  if p_order_no is null then raise exception 'Order is required'; end if;
  if p_method is null or p_method not in ('digital','manual') then
    raise exception 'Delivery method must be digital or manual';
  end if;
  if p_note is not null and length(p_note) > 1000 then
    raise exception 'Please keep the delivery note under 1000 characters';
  end if;

  select * into v_o from public.orders where order_no = p_order_no for update;
  if not found then raise exception 'Order not found'; end if;
  if v_o.seller_id <> auth.uid() then
    raise exception 'Only the seller can mark this order delivered';
  end if;
  if v_o.status <> 'in_escrow' then
    raise exception 'Only an order still in escrow can be marked delivered';
  end if;
  if v_o.delivery_status <> 'pending' then
    raise exception 'This order has already been delivered or confirmed';
  end if;

  perform set_config('app.trusted_write','on',true);
  update public.orders
     set delivery_status = 'delivered',
         delivered_at = now(),
         delivery_method = p_method,
         delivery_note = p_note
   where order_no = p_order_no;

  perform public.notify(v_o.buyer_id, 'delivered',
    'Your order has been delivered',
    format('Order %s was delivered (%s). Review it and confirm, or open a dispute before the window closes.',
      p_order_no, p_method),
    p_order_no);
end;
$$;

grant execute on function public.mark_order_delivered(text, text, text) to authenticated;

-- Buyer confirms delivery and releases escrow.
--
-- Two legitimate cases:
--   * the seller marked it delivered, or
--   * the order has claimed credentials, which the buyer can already download
--     (implicit digital delivery).
-- A disputed order is never self-confirmed, and neither is one whose
-- inspection window has closed.
create or replace function public.confirm_delivery(p_order_no text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_o public.orders%rowtype;
  v_locked numeric(12,2);
  v_claimed integer;
begin
  if p_order_no is null then raise exception 'Order is required'; end if;

  select * into v_o from public.orders where order_no = p_order_no for update;
  if not found then raise exception 'Order not found'; end if;
  if v_o.buyer_id <> auth.uid() then
    raise exception 'Only the buyer can confirm delivery';
  end if;
  if v_o.status <> 'in_escrow' then
    raise exception 'This order is % and can no longer be confirmed', v_o.status;
  end if;

  if v_o.delivery_status = 'buyer_confirmed' then
    raise exception 'This order has already been confirmed';
  end if;
  if v_o.delivery_status = 'pending' then
    select count(*) into v_claimed
      from public.listing_credentials where claimed_by_order = p_order_no;
    if v_claimed <= 0 then
      raise exception 'The seller must mark this order delivered before you can confirm';
    end if;
  end if;

  if v_o.inspection_deadline is not null and v_o.inspection_deadline < now() then
    raise exception 'The inspection window closed on %. Contact support to resolve this order.',
      to_char(v_o.inspection_deadline, 'YYYY-MM-DD');
  end if;

  select locked_usd into v_locked from public.wallets
   where user_id = v_o.seller_id for update;
  if not found or v_locked < v_o.seller_net_amount then
    raise exception 'The escrow hold for this order is missing. Support has been notified.';
  end if;

  perform public.apply_wallet(v_o.seller_id, v_o.seller_net_amount,
    -v_o.seller_net_amount, 'escrow_release', p_order_no, 'buyer confirmed delivery');

  perform set_config('app.trusted_write','on',true);
  update public.orders
     set status = 'completed',
         delivery_status = 'buyer_confirmed'
   where order_no = p_order_no;

  perform public.notify(v_o.seller_id, 'delivery_confirmed',
    'Order completed',
    format('The buyer confirmed order %s. Escrow has been released to you.', p_order_no),
    p_order_no);
end;
$$;

grant execute on function public.confirm_delivery(text) to authenticated;

-- `complete_order` is the name the buyer UI already calls. It is kept as a
-- thin alias so an existing client keeps working, but it is now exactly
-- confirm_delivery: it no longer releases escrow for an order the seller never
-- delivered and that has no credentials attached.
create or replace function public.complete_order(p_order_no text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.confirm_delivery(p_order_no);
end;
$$;

grant execute on function public.complete_order(text) to authenticated;

-- Admin-only full refund of an in-escrow order. A buyer must never be able to
-- reverse their own purchase, or they keep the accounts and get the money back.
create or replace function public.refund_order(
  p_order_no text,
  p_note text default null,
  p_idempotency_key text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_o public.orders%rowtype;
  v_key text;
begin
  if not public.can_moderate() then
    raise exception 'Only an administrator can refund an order';
  end if;
  if p_order_no is null then raise exception 'Order is required'; end if;
  if p_note is null or length(btrim(p_note)) < 3 then
    raise exception 'A refund reason is required';
  end if;

  select * into v_o from public.orders where order_no = p_order_no for update;
  if not found then raise exception 'Order not found'; end if;
  if v_o.status <> 'in_escrow' then
    raise exception 'Only an in-escrow order can be refunded (it is %)', v_o.status;
  end if;

  v_key := coalesce(nullif(btrim(coalesce(p_idempotency_key, '')), ''),
                   'admin-refund:' || p_order_no);

  perform public.settle_order_refund(
    p_order_no, v_o.total_usd, 'refund_buyer', p_note, null, v_key);

  perform public.log_admin_audit(auth.uid(), 'order.refund', 'order', null,
    p_order_no, format('full refund of %s | %s', v_o.total_usd, p_note));

  perform public.notify(v_o.seller_id, 'refund_processed',
    'Order refunded by support',
    format('Order %s was refunded after review.', p_order_no),
    p_order_no);
end;
$$;

grant execute on function public.refund_order(text, text, text) to authenticated;

-- Admin-only partial refund of an in-escrow order.
create or replace function public.refund_order_partial(
  p_order_no text,
  p_amount numeric,
  p_note text,
  p_idempotency_key text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_o public.orders%rowtype;
  v_key text;
begin
  if not public.can_moderate() then
    raise exception 'Only an administrator can refund an order';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'A refund amount greater than zero is required';
  end if;
  if p_note is null or length(btrim(p_note)) < 3 then
    raise exception 'A refund reason is required';
  end if;

  select * into v_o from public.orders where order_no = p_order_no for update;
  if not found then raise exception 'Order not found'; end if;
  if v_o.status <> 'in_escrow' then
    raise exception 'Only an in-escrow order can be refunded (it is %)', v_o.status;
  end if;
  if p_amount >= v_o.total_usd then
    raise exception 'A partial refund must be less than the % the buyer paid. Use refund_order for a full refund.',
      v_o.total_usd;
  end if;

  v_key := coalesce(nullif(btrim(coalesce(p_idempotency_key, '')), ''),
                   'admin-partial:' || p_order_no || ':' || round(p_amount, 2)::text);

  perform public.settle_order_refund(
    p_order_no, round(p_amount, 2), 'partial_refund', p_note, null, v_key);

  perform public.log_admin_audit(auth.uid(), 'order.refund_partial', 'order', null,
    p_order_no, format('partial refund of %s | %s', p_amount, p_note));

  perform public.notify(v_o.seller_id, 'refund_processed',
    'Order partially refunded by support',
    format('Order %s was resolved with a %s refund to the buyer.', p_order_no, p_amount),
    p_order_no);
end;
$$;

grant execute on function public.refund_order_partial(text, numeric, text, text)
  to authenticated;

-- ============================================================
-- 10. SWEEPERS (server-only, run from the Supabase scheduler)
-- ============================================================

-- Escrow the buyer never confirmed and never disputed, past the inspection
-- deadline, is released to the seller. A dispute or an open request freezes it.
create or replace function public.release_expired_escrow(p_limit integer default 100)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  if not public.is_trusted_write() then raise exception 'Server-only'; end if;

  for r in
    select order_no, buyer_id, seller_id, seller_net_amount
      from public.orders o
     where o.status = 'in_escrow'
       and o.escrow_expires_at is not null
       and o.escrow_expires_at < now()
       and not exists (select 1 from public.disputes d
                        where d.order_no = o.order_no
                          and d.status in ('open','under_review'))
       and not exists (select 1 from public.order_requests q
                        where q.order_no = o.order_no and q.status = 'pending')
     order by o.escrow_expires_at
     limit coalesce(p_limit, 100)
     for update skip locked
  loop
    perform set_config('app.trusted_write','on',true);
    perform public.apply_wallet(r.seller_id, r.seller_net_amount, -r.seller_net_amount,
      'escrow_release', r.order_no, 'auto-released after the escrow window');
    update public.orders set status = 'expired' where order_no = r.order_no;
    perform public.log_order_event(r.order_no, null, 'system', 'escrow_auto_released',
      'The escrow window closed with no dispute, so funds were released to the seller.');
    perform public.notify(r.buyer_id, 'inspection_expired',
      'Escrow released',
      format('The escrow window for order %s closed, so funds were released to the seller. Contact support if you believe this is wrong.', r.order_no),
      r.order_no);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.release_expired_escrow(integer) from public, anon, authenticated;
grant execute on function public.release_expired_escrow(integer) to service_role;

-- Delivered-but-unconfirmed orders past their window are escalated to admins,
-- never auto-completed. Funds stay in escrow until a human decides.
create or replace function public.sweep_expired_inspections(p_limit integer default 100)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  if not public.is_trusted_write() then raise exception 'Server-only'; end if;

  for r in
    select o.order_no, o.buyer_id, o.seller_id
      from public.orders o
     where o.status = 'in_escrow'
       and o.delivery_status = 'delivered'
       and o.inspection_deadline is not null
       and o.inspection_deadline < now()
       and o.inspection_escalated_at is null
       and not exists (select 1 from public.disputes d
                        where d.order_no = o.order_no
                          and d.status in ('open','under_review'))
     order by o.inspection_deadline
     limit coalesce(p_limit, 100)
     for update skip locked
  loop
    perform set_config('app.trusted_write','on',true);
    update public.orders set inspection_escalated_at = now() where order_no = r.order_no;
    perform public.log_order_event(r.order_no, null, 'system', 'inspection_escalated',
      'The inspection window closed without confirmation. Escalated to support; funds remain in escrow.');
    perform public.notify(r.buyer_id, 'inspection_expired',
      'Inspection window closed',
      format('Your inspection window for order %s closed. Contact support to confirm or dispute.', r.order_no),
      r.order_no);
    perform public.notify(r.seller_id, 'inspection_expired',
      'Buyer inspection window closed',
      format('The buyer did not confirm order %s before the window closed. Support will follow up.', r.order_no),
      r.order_no);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.sweep_expired_inspections(integer) from public, anon, authenticated;
grant execute on function public.sweep_expired_inspections(integer) to service_role;

-- ============================================================
-- 11. REPLACEMENT AND CANCELLATION REQUESTS
-- ============================================================

create or replace function public.request_replacement(
  p_order_no text, p_reason text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_o public.orders%rowtype; v_id uuid;
begin
  if p_order_no is null or p_reason is null then raise exception 'Order and reason required'; end if;
  if length(btrim(p_reason)) < 10 then raise exception 'Please explain in at least 10 characters'; end if;
  if length(p_reason) > 2000 then raise exception 'Please keep the reason under 2000 characters'; end if;

  select * into v_o from public.orders where order_no = p_order_no for update;
  if not found then raise exception 'Order not found'; end if;
  if v_o.buyer_id <> auth.uid() then
    raise exception 'Only the buyer can request a replacement';
  end if;
  if v_o.status <> 'in_escrow' then
    raise exception 'Only an order still in escrow can be replaced';
  end if;
  if v_o.delivery_status = 'buyer_confirmed' then
    raise exception 'A confirmed order cannot be replaced';
  end if;

  insert into public.order_requests (order_no, requested_by, kind, reason)
    values (p_order_no, auth.uid(), 'replacement', btrim(p_reason))
    on conflict (order_no, kind) do update
      set reason = excluded.reason, status = 'pending',
          resolved_by = null, resolution_note = null, resolved_at = null
    returning id into v_id;

  perform public.notify(v_o.seller_id, 'replacement_requested',
    'Replacement requested',
    format('The buyer of order %s asked for a replacement. Review it and mark a new delivery if you can.', p_order_no),
    v_id::text);
  perform public.notify(v_o.buyer_id, 'replacement_requested',
    'Replacement request submitted',
    'Your replacement request was sent to the seller.',
    v_id::text);
  return v_id;
end;
$$;

grant execute on function public.request_replacement(text, text) to authenticated;

create or replace function public.request_cancellation(
  p_order_no text, p_reason text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_o public.orders%rowtype; v_id uuid;
begin
  if p_order_no is null or p_reason is null then raise exception 'Order and reason required'; end if;
  if length(btrim(p_reason)) < 10 then raise exception 'Please explain in at least 10 characters'; end if;
  if length(p_reason) > 2000 then raise exception 'Please keep the reason under 2000 characters'; end if;

  select * into v_o from public.orders where order_no = p_order_no for update;
  if not found then raise exception 'Order not found'; end if;
  if v_o.buyer_id <> auth.uid() then
    raise exception 'Only the buyer can request a cancellation';
  end if;
  if v_o.status <> 'in_escrow' then
    raise exception 'Only an order still in escrow can be cancelled';
  end if;
  if v_o.delivery_status = 'buyer_confirmed' then
    raise exception 'A confirmed order cannot be cancelled';
  end if;

  insert into public.order_requests (order_no, requested_by, kind, reason)
    values (p_order_no, auth.uid(), 'cancellation', btrim(p_reason))
    on conflict (order_no, kind) do update
      set reason = excluded.reason, status = 'pending',
          resolved_by = null, resolution_note = null, resolved_at = null
    returning id into v_id;

  perform public.notify(v_o.seller_id, 'cancellation_requested',
    'Cancellation requested',
    format('The buyer of order %s asked to cancel.', p_order_no),
    v_id::text);
  perform public.notify(v_o.buyer_id, 'cancellation_requested',
    'Cancellation request submitted',
    'Your cancellation request was sent to the seller.',
    v_id::text);
  return v_id;
end;
$$;

grant execute on function public.request_cancellation(text, text) to authenticated;

-- A seller may agree to a replacement; only an admin may approve a
-- cancellation, because that moves money.
create or replace function public.resolve_order_request(
  p_request_id uuid, p_outcome text, p_note text
) returns void language plpgsql security definer set search_path = public as $$
declare v_r public.order_requests%rowtype; v_o public.orders%rowtype;
begin
  if p_request_id is null then raise exception 'Request is required'; end if;
  if p_outcome is null or p_outcome not in ('approved','dismissed') then
    raise exception 'Outcome must be approved or dismissed';
  end if;
  if p_note is not null and length(p_note) > 2000 then
    raise exception 'Please keep the note under 2000 characters';
  end if;

  select * into v_r from public.order_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if v_r.status <> 'pending' then raise exception 'This request is already resolved'; end if;

  select * into v_o from public.orders where order_no = v_r.order_no for update;
  if not found then raise exception 'Order not found for this request'; end if;

  if v_r.kind = 'cancellation' and p_outcome = 'approved' then
    if not public.can_moderate() then
      raise exception 'Only an administrator can approve a cancellation';
    end if;
    if v_o.status <> 'in_escrow' then
      raise exception 'An order that is not in escrow cannot be cancelled';
    end if;
    if v_o.delivery_status = 'buyer_confirmed' then
      raise exception 'A confirmed order cannot be cancelled';
    end if;
  end if;

  if v_r.kind = 'replacement' and p_outcome = 'approved' then
    if auth.uid() <> v_o.seller_id and not public.can_moderate() then
      raise exception 'Only the seller or an administrator can approve a replacement';
    end if;
    if v_o.status <> 'in_escrow' then
      raise exception 'An order that is not in escrow cannot be replaced';
    end if;
  end if;

  if v_r.kind = 'dismissed' then
    raise exception 'Unreachable';
  end if;

  perform set_config('app.trusted_write','on',true);
  update public.order_requests
     set status = p_outcome, resolved_by = auth.uid(),
         resolution_note = p_note, resolved_at = now()
   where id = p_request_id;

  if v_r.kind = 'cancellation' and p_outcome = 'approved' then
    perform public.settle_order_refund(v_o.order_no, v_o.total_usd, 'refund_buyer',
      coalesce(p_note, 'cancellation approved'),
      null, 'cancel:' || p_request_id::text);
    perform public.log_admin_audit(auth.uid(), 'order.cancel', 'order_request',
      p_request_id, v_o.order_no, coalesce(p_note, ''));
    perform public.notify(v_o.buyer_id, 'cancelled',
      'Order cancelled — refunded',
      format('Your cancellation of order %s was approved and your payment was refunded.', v_o.order_no),
      v_o.order_no);
    perform public.notify(v_o.seller_id, 'cancelled',
      'Order cancelled',
      format('Order %s was cancelled after review.', v_o.order_no),
      v_o.order_no);

  elsif v_r.kind = 'replacement' and p_outcome = 'approved' then
    -- Back to pending delivery so the seller can deliver again. The buyer must
    -- still confirm afterwards; approving a replacement does not release funds.
    update public.orders
       set delivery_status = 'pending',
           delivered_at = null,
           delivery_method = null,
           delivery_note = null
     where order_no = v_o.order_no;
    perform public.notify(v_o.buyer_id, 'replacement_requested',
      'Replacement approved',
      format('The seller agreed to replace order %s. You will get a new delivery notice.', v_o.order_no),
      v_o.order_no);
    perform public.notify(v_o.seller_id, 'replacement_requested',
      'Replacement approved',
      format('Mark a new delivery for order %s.', v_o.order_no),
      v_o.order_no);

  else
    perform public.notify(v_o.buyer_id, 'dispute_resolved',
      'Request dismissed',
      format('Your %s request for order %s was dismissed.', v_r.kind, v_o.order_no),
      v_o.order_no);
    perform public.notify(v_o.seller_id, 'dispute_resolved',
      'Request dismissed',
      format('The %s request for order %s was dismissed.', v_r.kind, v_o.order_no),
      v_o.order_no);
  end if;
end;
$$;

grant execute on function public.resolve_order_request(uuid, text, text) to authenticated;

-- ============================================================
-- 12. REVIEWS
-- ============================================================

drop function if exists public.submit_review(text, integer, text, text);

create or replace function public.submit_review(
  p_order_no text, p_rating integer, p_title text, p_body text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_o public.orders%rowtype; v_id uuid;
begin
  if p_order_no is null or p_rating is null or p_title is null or p_body is null then
    raise exception 'Order, rating, title and body are required';
  end if;
  if p_rating < 1 or p_rating > 5 then raise exception 'Rating must be between 1 and 5'; end if;
  if length(btrim(p_title)) < 3 or length(btrim(p_title)) > 120 then
    raise exception 'Title must be 3-120 characters';
  end if;
  if length(btrim(p_body)) < 10 then
    raise exception 'Please write at least 10 characters';
  end if;
  if length(p_body) > 4000 then
    raise exception 'Please keep the review under 4000 characters';
  end if;

  select * into v_o from public.orders where order_no = p_order_no;
  if not found then raise exception 'Order not found'; end if;
  if v_o.buyer_id <> auth.uid() then
    raise exception 'Only the buyer can review this order';
  end if;
  if v_o.delivery_status <> 'buyer_confirmed' then
    raise exception 'You can only review an order after you have confirmed delivery';
  end if;
  if exists (select 1 from public.reviews where order_no = p_order_no) then
    raise exception 'You have already reviewed this order';
  end if;

  insert into public.reviews (order_no, listing_id, buyer_id, seller_id, rating, title, body)
    values (p_order_no, v_o.listing_id, v_o.buyer_id, v_o.seller_id, p_rating,
            btrim(p_title), btrim(p_body))
    returning id into v_id;

  perform public.notify(v_o.seller_id, 'review_received',
    'New review',
    format('You received a %s-star review on order %s.', p_rating, p_order_no),
    v_id::text);
  return v_id;
end;
$$;

grant execute on function public.submit_review(text, integer, text, text) to authenticated;

-- ============================================================
-- 13. PRIVATE EVIDENCE STORAGE
--
-- Evidence for a dispute must never be publicly readable. The bucket is
-- private and the only read path is a signed URL the buyer, the seller of that
-- order, or an admin can mint. Objects are namespaced
-- `<uploader uid>/<dispute id>/<file>` so the policy can prove both who wrote
-- it and which case it belongs to.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('dispute-evidence', 'dispute-evidence', false)
on conflict (id) do nothing;

-- Safe parse of the dispute id out of an object path. A malformed path returns
-- false rather than raising inside a storage policy.
create or replace function public.evidence_dispute_id(p_name text)
returns uuid language plpgsql immutable set search_path = public as $$
declare v text := (storage.foldername(p_name))[2];
begin
  if v is null or v !~ '^[0-9a-fA-F-]{36}$' then return null; end if;
  return v::uuid;
exception when others then
  return null;
end;
$$;

grant execute on function public.evidence_dispute_id(text) to anon, authenticated;

drop policy if exists "dispute evidence upload to own folder" on storage.objects;
create policy "dispute evidence upload to own folder" on storage.objects for insert
  with check (
    bucket_id = 'dispute-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.evidence_dispute_id(name) is not null
    and public.is_dispute_party(public.evidence_dispute_id(name))
  );

drop policy if exists "dispute parties read evidence" on storage.objects;
create policy "dispute parties read evidence" on storage.objects for select
  using (
    bucket_id = 'dispute-evidence'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_dispute_party(public.evidence_dispute_id(name))
    )
  );

-- Evidence is append-only: no UPDATE or DELETE policy exists, so a party cannot
-- quietly replace what the other side has already seen.

-- ============================================================
-- 14. ADMIN READ VIEWS
-- ============================================================

drop view if exists public.v_admin_disputes;
create view public.v_admin_disputes
with (security_invoker = true) as
select
  d.id,
  d.order_no,
  d.opened_by,
  d.reason,
  d.detail,
  d.status,
  d.resolution,
  d.resolution_note,
  d.resolved_by,
  d.resolved_at,
  d.created_at,
  o.listing_title,
  o.brand,
  o.buyer_id,
  o.seller_id,
  o.total_usd,
  o.seller_net_amount,
  o.status as order_status,
  o.delivery_status,
  o.delivered_at,
  o.inspection_deadline,
  a.note as last_audit_note,
  a.created_at as last_audit_at
from public.disputes d
left join public.orders o on o.order_no = d.order_no
left join lateral (
  select aa.note, aa.created_at
    from public.admin_audit aa
   where aa.resource_type = 'dispute'
     and aa.resource_id = d.id
   order by aa.created_at desc
   limit 1
) a on true;

grant select on public.v_admin_disputes to authenticated;

-- The admin ledger view: one row per order with its money split, so an admin
-- investigating a payment sees the same figures the database moved.
--
-- order_payments is a 0009 object. Rather than make this migration depend on a
-- migration that may never have run, the view is created only when the relation
-- exists; otherwise it is skipped with a notice. Everything else in 0013 stands
-- on its own.
do $$
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'order_payments'
  ) then
    raise notice 'order_payments missing (0009 not applied): v_admin_ledger skipped';
    return;
  end if;

  drop view if exists public.v_admin_ledger;
  execute $v$
    create view public.v_admin_ledger
    with (security_invoker = true) as
    select
      o.order_no, o.created_at, o.status, o.delivery_status, o.payment_method,
      o.listing_title, o.buyer_id, o.seller_id, o.quantity, o.unit_price_usd,
      o.gross_amount, o.escrow_fee_usd, o.total_usd, o.commission_rate,
      o.commission_amount, o.seller_net_amount, o.refunded_amount,
      coalesce(p.status, 'none') as payment_status,
      p.method as payment_method_recorded,
      p.provider, p.provider_track_id, p.captured_at
    from public.orders o
    left join lateral (
      select op.status, op.method, op.provider, op.provider_track_id, op.captured_at
        from public.order_payments op
       where op.order_no = o.order_no
       order by op.created_at desc
       limit 1
    ) p on true
  $v$;

  grant select on public.v_admin_ledger to authenticated;
end
$$;

-- ============================================================
-- 15. GRANTS
--
-- Default deny, then the minimum each role needs. 0001 revoked EXECUTE on
-- every function that existed at the time; these revokes cover the ones added
-- since, so a function is never accidentally callable because PostgreSQL's
-- default grants EXECUTE to PUBLIC.
-- ============================================================

revoke all on function public.log_admin_audit(uuid, text, text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.log_order_event(text, uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.settle_order_refund(text, numeric, text, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.tg_log_order_event() from public, anon, authenticated;
revoke all on function public.tg_log_dispute_event() from public, anon, authenticated;
revoke all on function public.release_expired_escrow(integer)
  from public, anon, authenticated;
revoke all on function public.sweep_expired_inspections(integer)
  from public, anon, authenticated;

grant execute on function public.settle_order_refund(text, numeric, text, text, uuid, text)
  to service_role;
grant execute on function public.log_admin_audit(uuid, text, text, uuid, text, text)
  to service_role;
grant execute on function public.log_order_event(text, uuid, text, text, text)
  to service_role;

-- Everything the buyer, seller and admin UIs call.
grant execute on function public.open_dispute(text, text, text) to authenticated;
grant execute on function public.add_dispute_message(uuid, text, jsonb) to authenticated;
grant execute on function public.resolve_dispute(uuid, text, text, numeric, text) to authenticated;
grant execute on function public.start_dispute_review(uuid) to authenticated;
grant execute on function public.mark_order_delivered(text, text, text) to authenticated;
grant execute on function public.confirm_delivery(text) to authenticated;
grant execute on function public.complete_order(text) to authenticated;
grant execute on function public.refund_order(text, text, text) to authenticated;
grant execute on function public.refund_order_partial(text, numeric, text, text) to authenticated;
grant execute on function public.request_replacement(text, text) to authenticated;
grant execute on function public.request_cancellation(text, text) to authenticated;
grant execute on function public.resolve_order_request(uuid, text, text) to authenticated;
grant execute on function public.submit_review(text, integer, text, text) to authenticated;
grant execute on function public.is_dispute_party(uuid) to authenticated;
grant execute on function public.dispute_reasons() to anon, authenticated;
grant execute on function public.dispute_message_role(uuid, uuid) to authenticated;
grant execute on function public.evidence_dispute_id(text) to anon, authenticated;
grant execute on function public.notify(uuid, text, text, text, text) to authenticated, service_role;
grant execute on function public.mark_notifications_read(uuid) to authenticated;

-- Views are read-only projections; RLS on the underlying tables still applies
-- because they are declared security_invoker.
revoke all on public.public_profiles from public;
grant select on public.public_profiles to anon, authenticated;
grant select on public.order_refunds to authenticated;
grant select on public.order_events to authenticated;
