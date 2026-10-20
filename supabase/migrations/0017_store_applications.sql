-- =====================================================================
-- 0017_store_applications.sql
--
-- THE SELLER APPLICATION BECOMES A REAL, AUDITED LIFECYCLE — AND STORE
-- ELIGIBILITY IS ENFORCED ON THE SERVER AGAIN.
--
-- Two things land here, both requested by the product brief:
--
--   1. The store application grows the fields a real review needs
--      (categories, warranty, refund policy, support details, compliance
--      attestations) and a status HISTORY
--      (`store_application_events`) so the applicant and the admin can see
--      what happened, when and why. `review_store()` starts writing the
--      `admin_audit` row it never wrote before.
--
--   2. Listing creation and order placement require an APPROVED store
--      again. This deliberately reverses `0008_listing_first_publishing
--      .sql`, which had removed that gate; the brief asks for the
--      eligibility rule to be enforced in the database and for `0008` to
--      be reconciled rather than left as a silently different policy on
--      databases that skipped it. `0008`'s policy is dropped and replaced
--      here, so every upgrade path converges on one rule.
--
-- Why this is the safe direction for the drift bug
-- ------------------------------------------------
-- Production was migrated as "0001-0006, then 0013+", so it never ran
-- `0008`. It has been enforcing `0001`'s approved-store clause all along —
-- which is why every listing insert failed with
-- `42501 row-level security policy for table "listings"`. Making the gate
-- explicit and canonical here means the repaired policy is the same one on
-- every database, instead of production and a fresh install disagreeing.
--
-- What does NOT change:
--   * a seller still cannot self-publish, choose their own status, or set
--     stock by hand — `guard_listing_moderation` pins those;
--   * a seller still cannot self-approve a store — `guard_store_moderation`
--     pins `status` and the review columns for non-admin writes, and only
--     `rejected -> pending` (resubmission) is open;
--   * `admin_audit` and `store_application_events` accept no client writes.
--
-- Idempotent: every statement is `if not exists` / `create or replace` /
-- `drop ... if exists` followed by a create. Safe to re-run.
--
-- Apply with:
--   SUPABASE_PROJECT_REF=<ref> SUPABASE_ACCESS_TOKEN=sbp_... \
--     node scripts/migrate.mjs --apply supabase/migrations/0017_store_applications.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Application fields. All additive with defaults, so existing rows are
--    valid the moment the column appears and no backfill is needed.
-- ---------------------------------------------------------------------
alter table public.stores
  add column if not exists categories text[] not null default '{}',
  add column if not exists warranty_hours integer,
  add column if not exists refund_policy text,
  add column if not exists support_email text,
  add column if not exists support_hours text,
  add column if not exists support_channel text,
  add column if not exists ownership_attested boolean not null default false,
  add column if not exists compliance_accepted_at timestamptz,
  add column if not exists agreement_version text,
  add column if not exists submitted_at timestamptz;

-- A negative warranty period is not a policy, it is a typo. Named so the
-- client can tell the two apart from a generic 23514.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'stores_warranty_hours_check'
       and conrelid = 'public.stores'::regclass
  ) then
    alter table public.stores
      add constraint stores_warranty_hours_check
      check (warranty_hours is null or warranty_hours between 0 and 8760);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. The status timeline.
--
--    Shaped like `order_events` (0013): an append-only log with RLS on and
--    NO client insert/update/delete policy. Only the SECURITY DEFINER
--    trigger below and `review_store()` write it, so an applicant cannot
--    invent an approval in their own history.
-- ---------------------------------------------------------------------
create table if not exists public.store_application_events (
  id bigserial primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  actor_id uuid,
  actor_role text not null default 'system'
    check (actor_role in ('seller','admin','system')),
  event text not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists store_application_events_store_idx
  on public.store_application_events (store_id, created_at);
alter table public.store_application_events enable row level security;

drop policy if exists "parties read store application events"
  on public.store_application_events;
create policy "parties read store application events"
  on public.store_application_events for select
  using (
    auth.uid() = (select user_id from public.stores where id = store_application_events.store_id)
    or public.is_admin()
  );

grant select on public.store_application_events to authenticated;

-- ---------------------------------------------------------------------
-- 3. Record the timeline automatically.
--
--    A trigger rather than client calls, for the same reason `order_events`
--    uses one: every path that touches `stores` — the seller's own update,
--    a resubmission, an admin review — produces an event without each
--    caller having to remember. SECURITY DEFINER so the seller's ordinary
--    UPDATE can write a row into a table it has no insert grant on.
-- ---------------------------------------------------------------------
create or replace function public.log_store_application_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_role text; v_event text; v_note text;
begin
  v_role := case when public.is_admin() then 'admin' else 'seller' end;

  if tg_op = 'INSERT' then
    v_event := 'submitted';
    v_note := null;
  elsif new.status is distinct from old.status then
    v_event := case new.status
                 when 'approved' then 'approved'
                 when 'rejected' then 'rejected'
                 when 'pending'  then 'resubmitted'
                 else 'status_changed'
               end;
    v_note := new.review_note;
    -- A status change is an admin decision, never a seller's own doing:
    -- `guard_store_moderation` only lets a seller move rejected -> pending,
    -- and that is the resubmission, not an approval.
    if new.status = 'pending' then v_role := 'seller'; end if;
  else
    return new;
  end if;

  insert into public.store_application_events (store_id, actor_id, actor_role, event, note)
  values (new.id, auth.uid(), v_role, v_event, v_note);
  return new;
end;
$$;

drop trigger if exists log_store_application_event on public.stores;
create trigger log_store_application_event after insert or update of status
  on public.stores for each row execute function public.log_store_application_event();

-- `submitted_at` is the first submission and stays put across later edits;
-- a resubmission is visible in the timeline instead of overwriting it.
create or replace function public.stamp_store_submitted_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.submitted_at is null then new.submitted_at := now(); end if;
  return new;
end;
$$;

drop trigger if exists stamp_store_submitted_at on public.stores;
create trigger stamp_store_submitted_at before insert or update on public.stores
  for each row execute function public.stamp_store_submitted_at();

-- ---------------------------------------------------------------------
-- 3b. Resubmission is the one non-admin status change allowed.
--
--     0007 rewrote `guard_store_moderation` to permit `rejected -> pending`,
--     but production never ran 0007 (it was migrated as 0001-0006 then
--     0013+), and 0013 does not carry this function. So on production the
--     0001 version was still installed, which pins `status` for every
--     non-admin write — meaning a rejected applicant's resubmission was
--     silently reverted and the wizard's "Resubmit" button could never
--     work, no matter what 0017 did to the timeline.
--
--     Defined here so 0017's lifecycle is self-sufficient: it no longer
--     depends on a migration that a given database may have skipped. The
--     body is 0007's, unchanged — self-approval (`pending -> approved`) is
--     still pinned, and the review fields still cannot be written by an
--     applicant erasing their own rejection note.
-- ---------------------------------------------------------------------
create or replace function public.guard_store_moderation()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_trusted_write() then return new; end if;
  if new.user_id <> old.user_id then raise exception 'Cannot transfer a store'; end if;
  if new.status is distinct from old.status
     and not (old.status = 'rejected' and new.status = 'pending') then
    new.status := old.status;
  end if;
  if new.review_note is distinct from old.review_note
     or new.reviewed_at is distinct from old.reviewed_at
     or new.reviewed_by is distinct from old.reviewed_by then
    new.review_note := old.review_note;
    new.reviewed_at := old.reviewed_at;
    new.reviewed_by := old.reviewed_by;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_store_moderation on public.stores;
create trigger guard_store_moderation before update on public.stores
  for each row execute function public.guard_store_moderation();

-- ---------------------------------------------------------------------
-- 4. `review_store()` — same signature and same behaviour, plus the audit
--    row it should always have written. The rejection path still requires a
--    reason and still pauses the seller's live listings.
-- ---------------------------------------------------------------------
create or replace function public.review_store(p_store_id uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_s public.stores%rowtype;
begin
  if not public.can_moderate() then raise exception 'Administrators only'; end if;
  select * into v_s from public.stores where id = p_store_id for update;
  if not found then raise exception 'Store not found'; end if;
  if p_approve is false and (p_note is null or length(btrim(p_note)) < 3) then
    raise exception 'A rejection reason is required';
  end if;
  perform set_config('app.trusted_write','on',true);
  update public.stores set status = case when p_approve then 'approved' else 'rejected' end,
         review_note = p_note, reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_store_id;
  insert into public.store_reviews (store_id, admin_id, decision, note)
  values (p_store_id, auth.uid(), case when p_approve then 'approved' else 'rejected' end, p_note);
  if p_approve is false then
    update public.listings set status = 'paused' where seller_id = v_s.user_id and status = 'active';
  end if;

  -- The audit trail the admin console reads. `review_store` never wrote one,
  -- so a store approval was the one moderation action with no record.
  insert into public.admin_audit (actor_id, action, resource_type, resource_id, resource_text, note)
  values (auth.uid(),
          case when p_approve then 'store_approved' else 'store_rejected' end,
          'store', p_store_id, v_s.store_name, p_note);
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Eligibility, restored and made canonical.
--
--    The insert policy is the one `0001` wrote and `0008` removed. Dropping
--    and recreating it here means a database that ran 0008 and one that
--    skipped it both end up enforcing the same rule — which is the whole
--    point of reconciling rather than weakening.
-- ---------------------------------------------------------------------
drop policy if exists "insert own listing" on public.listings;
create policy "insert own listing" on public.listings for insert
  with check (
    auth.uid() = seller_id and status = 'pending' and stock = 0
    and exists (select 1 from public.stores
                 where user_id = auth.uid() and status = 'approved')
  );

-- `place_order()`: 0008's body, with the seller-approval check put back.
-- An admin-approved listing is still required; this adds the second gate
-- that the seller's store is approved too, so a seller whose store was
-- later rejected or paused cannot keep selling through a listing that
-- survived the pause.
create or replace function public.place_order(
  p_listing_id uuid, p_quantity integer, p_idempotency_key text
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_listing public.listings%rowtype;
  v_commission numeric(12,2); v_fee numeric(12,2);
  v_total numeric(12,2); v_net numeric(12,2);
  v_order_no text; v_free integer; v_balance numeric(12,2);
begin
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 128 then
    raise exception 'An idempotency key of 8-128 characters is required';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 1000 then
    raise exception 'Quantity must be between 1 and 1000';
  end if;

  -- Serialise identical concurrent requests on ONE row lock before any
  -- check runs. The unique index alone only catches the race at INSERT
  -- time; this makes the read-check-write sequence atomic too.
  perform pg_advisory_xact_lock(
    hashtextextended(auth.uid()::text || ':' || p_idempotency_key, 0));

  select order_no into v_order_no from public.orders
   where buyer_id = auth.uid() and idempotency_key = p_idempotency_key;
  if found then return v_order_no; end if;

  select * into v_listing from public.listings where id = p_listing_id for update;
  if not found then raise exception 'Listing not found'; end if;
  if v_listing.status <> 'active' or v_listing.hidden then
    raise exception 'This listing is not available';
  end if;
  if v_listing.seller_id = auth.uid() then
    raise exception 'You cannot buy your own listing';
  end if;
  if not exists (select 1 from public.stores
                  where user_id = v_listing.seller_id and status = 'approved') then
    raise exception 'This seller is not currently approved';
  end if;

  select count(*) into v_free from public.listing_credentials
   where listing_id = p_listing_id and claimed_by_order is null;
  if v_free < p_quantity then
    raise exception 'Not enough accounts in stock for this listing';
  end if;
  if v_listing.stock < p_quantity then
    raise exception 'Not enough stock available';
  end if;

  select balance_usd into v_balance from public.wallets
   where user_id = auth.uid() for update;

  v_commission := round(v_listing.price_usd * p_quantity * 0.10, 2);
  v_fee        := round(v_listing.price_usd * p_quantity * 0.03, 2);
  v_total      := v_listing.price_usd * p_quantity + v_fee;
  v_net        := v_listing.price_usd * p_quantity - v_commission;

  if coalesce(v_balance,0) < v_total then
    raise exception 'Insufficient balance. Add funds to your wallet first.';
  end if;

  perform set_config('app.trusted_write','on',true);
  v_order_no := 'AMH-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));

  -- Buyer pays the full total; the seller's share is held on the SELLER's
  -- wallet until the buyer confirms. gross = commission + net, and every
  -- term is stored on the order so the split is auditable.
  perform public.apply_wallet(auth.uid(), -v_total, 0, 'purchase', v_order_no, null);
  perform public.apply_wallet(v_listing.seller_id, 0, v_net,
                              'escrow_hold', v_order_no, null);

  update public.listings set stock = stock - p_quantity where id = p_listing_id;

  insert into public.orders (
    order_no, listing_id, listing_title, brand, buyer_id, seller_id, quantity,
    unit_price_usd, gross_amount, escrow_fee_usd, total_usd,
    commission_rate, commission_amount, seller_net_amount,
    idempotency_key, escrow_expires_at)
  values (v_order_no, v_listing.id, v_listing.title, v_listing.brand,
          auth.uid(), v_listing.seller_id, p_quantity, v_listing.price_usd,
          v_listing.price_usd * p_quantity, v_fee, v_total,
          0.1, v_commission, v_net, p_idempotency_key, now() + interval '14 days');

  update public.listing_credentials
     set claimed_by_order = v_order_no, claimed_at = now()
   where id in (
     select id from public.listing_credentials
      where listing_id = p_listing_id and claimed_by_order is null
      order by created_at limit p_quantity for update skip locked);

  return v_order_no;
end;
$$;

-- ---------------------------------------------------------------------
-- 14. Reload PostgREST's schema cache.
--
-- PostgREST caches the table and column definitions it will accept, and only
-- refreshes that cache when told to. Without this, every column added above is
-- live in Postgres but invisible to the API, and a write naming one fails with
--
--   Could not find the 'agreement_version' column of 'stores'
--   in the schema cache
--
-- which is exactly the error an unapplied 0017 produces — so the two causes
-- are indistinguishable to whoever is holding the form. The Supabase
-- dashboard sends this itself after a migration; the CLI runner used here
-- does not, so the migration carries it.
--
-- `NOTIFY` is transactional: it is delivered when this file's transaction
-- commits, so the cache can never be reloaded ahead of the schema it
-- describes.
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';
