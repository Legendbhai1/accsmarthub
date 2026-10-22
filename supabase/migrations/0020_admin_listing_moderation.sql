-- =====================================================================
-- 0020_admin_listing_moderation.sql
--
-- THE ADMIN PANEL CAN NOW MODERATE A LISTING, NOT JUST FLIP ITS STATUS.
--
-- The seller side of moderation was fully built: `stores` carries
-- `review_note` / `reviewed_at` / `reviewed_by`, `store_reviews` is the
-- history table, and `review_store()` writes a reason and notifies the
-- applicant. The LISTING side had none of it. `set_listing_status()` took a
-- status and nothing else, so:
--
--   * "Reject" in AdminListings posted `paused` with no reason — the seller
--     was never told why their listing was refused;
--   * there was no record of who moderated a listing or when, so an appeal
--     could not be answered from the database;
--   * an admin could not correct a listing (a typo in the title, a price
--     entered wrong) — they could only approve or pause what the seller
--     submitted, and had to ask the seller to fix it;
--   * `listings` had no moderation columns at all, so nothing could be
--     stored even if the function had accepted it.
--
-- This migration gives listings the same shape stores already have, extends
-- `set_listing_status()` to record a reason and a moderator, adds
-- `admin_update_listing()` so an admin can edit a listing in place, and
-- fixes one more front-end/schema mismatch: the seller's Delete button
-- called `.delete()` on `listings`, which had no DELETE policy, so it was a
-- silent no-op.
--
-- What does NOT change:
--   * a seller still cannot self-publish: `guard_listing_moderation` keeps
--     pinning `status` and `stock` for every non-trusted write, and now pins
--     the new moderation columns too, so a seller cannot forge an
--     "approved by admin" note onto their own listing;
--   * the non-moderator branch of `set_listing_status()` (hide my own
--     listing) is unchanged;
--   * `review_store()` is untouched.
--
-- Apply with:
--   SUPABASE_PROJECT_REF=<ref> SUPABASE_ACCESS_TOKEN=sbp_... \
--     node scripts/migrate.mjs supabase/migrations/0020_admin_listing_moderation.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The moderation columns. `add column if not exists` so this is safe to
--    re-run and safe on a database that already has them.
-- ---------------------------------------------------------------------
alter table public.listings add column if not exists moderation_note text;
alter table public.listings add column if not exists moderated_at timestamptz;
alter table public.listings add column if not exists moderated_by uuid;

-- ---------------------------------------------------------------------
-- 2. The history table. One row per moderation decision, mirroring
--    `store_reviews`. `decision` stores the resulting status, because a
--    listing can be approved, paused, reinstated or sent back to pending.
-- ---------------------------------------------------------------------
create table if not exists public.listing_reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  admin_id uuid not null,
  decision text not null check (decision in ('pending','active','paused','sold')),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists listing_reviews_listing_idx
  on public.listing_reviews (listing_id, created_at desc);

alter table public.listing_reviews enable row level security;

-- Admins read the history. Nobody writes it from a client: only
-- set_listing_status() does, and that runs as its owner.
drop policy if exists "admins read listing reviews" on public.listing_reviews;
create policy "admins read listing reviews" on public.listing_reviews for select
  using (public.is_admin());

grant select on public.listing_reviews to authenticated;

-- ---------------------------------------------------------------------
-- 3. The field guard now covers the moderation columns too.
--
--    Without this a seller could PATCH their own listing with
--    `moderation_note = 'Approved by admin'` and `moderated_by = <an admin>`
--    — the columns are new, so the existing guard did not know about them.
--    Same shape as `guard_store_moderation`, which already pins its
--    review_* columns.
-- ---------------------------------------------------------------------
create or replace function public.guard_listing_moderation()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_trusted_write() then return new; end if;
  if new.seller_id <> old.seller_id then raise exception 'Cannot transfer a listing'; end if;
  if new.status is distinct from old.status then new.status := old.status; end if;
  if new.stock is distinct from old.stock then new.stock := old.stock; end if;
  if new.moderation_note is distinct from old.moderation_note then
    new.moderation_note := old.moderation_note;
  end if;
  if new.moderated_at is distinct from old.moderated_at then
    new.moderated_at := old.moderated_at;
  end if;
  if new.moderated_by is distinct from old.moderated_by then
    new.moderated_by := old.moderated_by;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. A seller may delete their own listing — but only one nobody has
--    ordered. SellerListings has always shown a Delete button; there was no
--    DELETE policy, so the click silently changed nothing. Deleting a
--    listing that has orders is refused because `orders.listing_id` is a
--    non-cascading foreign key: the history has to survive.
-- ---------------------------------------------------------------------
drop policy if exists "delete own un-ordered listing" on public.listings;
create policy "delete own un-ordered listing" on public.listings for delete
  using (
    auth.uid() = seller_id
    and not exists (
      select 1 from public.orders o where o.listing_id = listings.id
    )
  );

-- ---------------------------------------------------------------------
-- 5. set_listing_status(): now takes a reason and records the moderator.
--
--    The 2-argument version is DROPPED, not overloaded. PostgREST resolves
--    an RPC by the argument names it is given, and with both `(uuid,text)`
--    and `(uuid,text,text)` present a call with two named arguments is
--    ambiguous ("function is not unique"). `p_note` has a default, so the
--    existing two-argument call keeps working after the drop.
-- ---------------------------------------------------------------------
drop function if exists public.set_listing_status(uuid, text);

create or replace function public.set_listing_status(
  p_listing_id uuid, p_status text, p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_mod boolean;
  v_listing public.listings%rowtype;
begin
  if p_status not in ('pending','active','paused','sold') then
    raise exception 'Invalid listing status';
  end if;

  select * into v_listing from public.listings where id = p_listing_id for update;
  if not found then raise exception 'Listing not found'; end if;

  -- Read BEFORE the trusted-write flag is set, or every caller would
  -- appear to be a moderator.
  v_mod := public.can_moderate();
  perform set_config('app.trusted_write','on',true);

  if not v_mod then
    -- A seller may only hide their own listing. Status and stock stay pinned
    -- by the guard, so this cannot publish anything.
    update public.listings set hidden = true
     where id = p_listing_id and auth.uid() = seller_id;
    return;
  end if;

  -- Rejecting means pausing, and a pause is the only outcome the seller is
  -- not expecting. Require a reason for it, exactly as review_store() does
  -- for a rejected store.
  if p_status = 'paused' and (p_note is null or length(btrim(p_note)) < 3) then
    raise exception 'A rejection reason is required';
  end if;

  update public.listings
     set status = p_status,
         moderation_note = p_note,
         moderated_at = now(),
         moderated_by = auth.uid()
   where id = p_listing_id;

  insert into public.listing_reviews (listing_id, admin_id, decision, note)
  values (p_listing_id, auth.uid(), p_status, p_note);

  insert into public.admin_audit
    (admin_id, actor_id, action, resource_type, resource_id, target,
     resource_text, detail, note)
  values (auth.uid(), auth.uid(), 'listing.' || p_status, 'listing',
          p_listing_id, p_listing_id::text, v_listing.title,
          'listing status set to ' || p_status, p_note);

  -- Tell the seller, in the same transaction as the decision. 'admin_review'
  -- is an existing kind, so the notifications CHECK constraint is untouched.
  perform public.notify(
    v_listing.seller_id, 'admin_review',
    case p_status
      when 'active' then 'Your listing was approved'
      when 'paused' then 'Your listing was rejected'
      else 'Your listing status changed'
    end,
    case
      when p_note is null or btrim(p_note) = '' then
        format('"%s" is now %s.', v_listing.title, p_status)
      else
        format('"%s" is now %s. Note: %s', v_listing.title, p_status, p_note)
    end,
    p_listing_id::text);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. admin_update_listing(): let an admin correct a listing in place.
--
--    This is the "manage or edit it" half of the request. It changes the
--    content columns only — never `status`, `stock` or `seller_id`, which
--    remain the seller's and the guard's business. An edit is recorded in
--    `admin_audit` and leaves a moderation note, so the seller can see what
--    changed and why.
-- ---------------------------------------------------------------------
create or replace function public.admin_update_listing(
  p_listing_id uuid,
  p_title text,
  p_brand text,
  p_summary text,
  p_price_usd numeric,
  p_hidden boolean,
  p_note text
) returns void language plpgsql security definer set search_path = public as $$
declare v_listing public.listings%rowtype;
begin
  if not public.can_moderate() then raise exception 'Administrators only'; end if;
  if p_title is null or length(btrim(p_title)) < 2 then
    raise exception 'A listing title is required';
  end if;
  if p_brand is null or length(btrim(p_brand)) < 1 then
    raise exception 'A brand is required';
  end if;
  if p_price_usd is null or p_price_usd <= 0 then
    raise exception 'A price greater than zero is required';
  end if;

  select * into v_listing from public.listings where id = p_listing_id for update;
  if not found then raise exception 'Listing not found'; end if;

  perform set_config('app.trusted_write','on',true);
  update public.listings
     set title = btrim(p_title),
         brand = btrim(p_brand),
         summary = nullif(btrim(coalesce(p_summary, '')), ''),
         price_usd = p_price_usd,
         hidden = coalesce(p_hidden, hidden),
         moderation_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), moderation_note),
         moderated_at = now(),
         moderated_by = auth.uid()
   where id = p_listing_id;

  insert into public.admin_audit
    (admin_id, actor_id, action, resource_type, resource_id, target,
     resource_text, detail, note)
  values (auth.uid(), auth.uid(), 'listing.edited', 'listing',
          p_listing_id, p_listing_id::text, btrim(p_title),
          'listing content edited by an administrator', p_note);

  perform public.notify(
    v_listing.seller_id, 'admin_review',
    'An administrator edited your listing',
    format('"%s" was edited by an administrator.%s', v_listing.title,
           case when p_note is null or btrim(p_note) = '' then ''
                else ' Note: ' || p_note end),
    p_listing_id::text);
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Grants. New functions are created with PUBLIC EXECUTE, which must be
--    revoked; replacing a function keeps its old grants, but
--    set_listing_status was dropped above so it is re-granted explicitly.
--    Both functions are admin-gated inside, so `authenticated` is enough.
-- ---------------------------------------------------------------------
revoke all on function public.set_listing_status(uuid, text, text)
  from public, anon;
revoke all on function public.admin_update_listing(uuid, text, text, text, numeric, boolean, text)
  from public, anon;
grant execute on function public.set_listing_status(uuid, text, text) to authenticated;
grant execute on function public.admin_update_listing(uuid, text, text, text, numeric, boolean, text)
  to authenticated;
