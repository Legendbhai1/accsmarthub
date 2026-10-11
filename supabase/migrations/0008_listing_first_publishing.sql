-- =====================================================================
-- 0008_listing_first_publishing.sql
--
-- SELLERS PUBLISH FIRST, STORE LATER.
--
-- Until now a listing could only be inserted by an account whose `stores`
-- row was already `approved`, and `place_order()` refused to sell unless
-- that same store was approved. That made store setup a hard prerequisite:
-- a brand-new seller had to fill in a store application, wait for an admin,
-- and only then write their first listing.
--
-- The gate is now the LISTING, not the store. Any confirmed account can
-- create a listing straight away; the insert policy still forces
-- `status = 'pending'` and `stock = 0`, so nothing reaches the storefront
-- until an admin approves it with `set_listing_status()` (which also writes
-- the audit row). A store profile stays available and is still reviewed by
-- admins — it is just no longer the thing that blocks selling.
--
-- What does NOT change:
--   * a seller still cannot self-publish, choose their own status, or set
--     stock by hand — `guard_listing_moderation` pins `status` and `stock`
--     on every non-trusted write;
--   * editing a listing does not silently re-approve it;
--   * `read listings` still hides anything that is not `active` from the
--     public, so a pending draft is visible only to its owner and admins;
--   * rejecting a STORE still pauses that seller's live listings.
--
-- Apply with:
--   SUPABASE_PROJECT_REF=<ref> SUPABASE_ACCESS_TOKEN=sbp_... \
--     node scripts/migrate.mjs supabase/migrations/0008_listing_first_publishing.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Insert: the caller's own listing, pending, unstocked. The previous
--    `exists (... stores ... status = 'approved')` clause is gone.
-- ---------------------------------------------------------------------
drop policy if exists "insert own listing" on public.listings;
create policy "insert own listing" on public.listings for insert
  with check (
    auth.uid() = seller_id and status = 'pending' and stock = 0
  );

-- ---------------------------------------------------------------------
-- 2. place_order(): identical to 0001 except the seller-approval check is
--    removed. `status = 'active' and not hidden` above it is the real gate
--    now — an admin approved that specific listing, which is a stronger
--    signal than the seller having a store row at all.
-- ---------------------------------------------------------------------
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

  -- Buyer pays the full total; the seller's share is held in escrow on the
  -- SELLER's wallet until the buyer confirms. gross = commission + net,
  -- and every term is stored on the order so the split is auditable.
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
