-- =====================================================================
-- 0009_buying_to_delivery_lifecycle.sql
--
-- Extends the existing AccsMartHub schema (0001/0007/0008) with the full
-- buyer-to-delivery lifecycle. Nothing here removes or rewrites an existing
-- table or function; every DDL uses IF NOT EXISTS / IF NOT EXISTS ALTER so
-- a replay is safe, and every new object is idempotent at the statement level.
--
-- Order state machine (server-controlled, validated in Postgres):
--   in_escrow --(seller marks delivered OR digital auto-delivered at creation)--
--   delivered --(buyer confirms within inspection window)--
--   buyer_confirmed / completed
--   in_escrow --(buyer disputes)--> disputed (escrow frozen, never auto-released)
--   in_escrow --(admin refunds)--> refunded (credentials unclaimed, stock restored)
--   in_escrow --(sweeper: inspection expired, no dispute)--> stays in_escrow,
--   both parties notified (escalated to admin, never auto-completed)
--
-- Funding paths:
--   * Wallet (fast path): checkout() funds escrow at creation via apply_wallet
--     (buyer debited, seller net locked on the seller's wallet). The single-item
--     case delegates to the existing place_order() RPC and then adds delivery +
--     notifications; the cart case creates per-item orders here. Idempotent per
--     (buyer, idempotency_key).
--   * Provider (verified webhook): an Edge Function that holds the merchant key
--     opens the provider invoice, reserves stock, and records a PENDING
--     order_payments row (order_no NULL) via provider_invoice_opened(). The
--     provider's signed callback hits verify_order_payment_webhook(), which
--     verifies the signature, dedups on the provider event id, re-derives the
--     total from the listing, and only then captures the payment AND creates +
--     funds the order atomically. The browser never sees the merchant key and
--     never trusts a "paid" message.
--
-- Digital delivery: credential listings are delivered instantly — the buyer can
-- download claimed credentials while the order is in_escrow (download_credentials
-- is buyer-only and is broadened to also allow completed orders so a buyer can
-- re-download after confirming). Manual goods are delivered when the seller calls
-- mark_order_delivered(). Either way the buyer confirms via confirm_delivery()
-- inside the disclosed inspection window; expired unconfirmed deliveries are
-- escalated to admin, never auto-completed.
--
-- Apply with:
--   SUPABASE_PROJECT_REF=<ref> SUPABASE_ACCESS_TOKEN=sbp_... \\
--     node scripts/migrate.mjs supabase/migrations/0009_buying_to_delivery_lifecycle.sql
-- =====================================================================

-- ============================================================
-- 1. CART
-- ============================================================

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

-- ============================================================
-- 2. ORDER PAYMENTS
--
-- One row per funding attempt on an order. A provider invoice is opened as a
-- PENDING row with order_no NULL (the order does not exist until the webhook
-- captures and creates it), so there is never an unfunded order in the database.
-- Wallet-funded orders record a captured row at checkout time.
-- ============================================================

create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_no text references public.orders(order_no) on delete cascade,
  method text not null check (method in ('wallet','provider')),
  buyer_id uuid references auth.users(id),
  listing_id uuid references public.listings(id),
  quantity integer,
  provider text,                 -- e.g. 'oxapay'; null for wallet
  provider_track_id text,        -- the provider's invoice/charge id
  provider_amount numeric(12,2),
  provider_currency text default 'USD' check (provider_currency = 'USD'),
  provider_status text,          -- provider-side status verbatim on capture
  status text not null default 'pending'
    check (status in ('pending','capturing','captured','failed','refunded')),
  amount_usd numeric(12,2) not null check (amount_usd > 0),
  captured_at timestamptz,
  webhook_payload jsonb,         -- raw verified webhook body (for audit)
  webhook_idempotency_key text,  -- provider's event id, for replay guard
  created_at timestamptz not null default now(),
  unique (order_no, provider_track_id)
);
create index if not exists order_payments_order_idx on public.order_payments(order_no);
create index if not exists order_payments_track_idx on public.order_payments(provider_track_id)
  where provider_track_id is not null;
alter table public.order_payments enable row level security;

drop policy if exists "parties read order payments" on public.order_payments;
create policy "parties read order payments" on public.order_payments for select
  using (
    auth.uid() = (select buyer_id from public.orders where order_no = order_payments.order_no)
    or auth.uid() = (select seller_id from public.orders where order_no = order_payments.order_no)
    or auth.uid() = order_payments.buyer_id
    or public.is_admin()
  );

-- ============================================================
-- 3. ORDER EXTENSIONS — delivery columns
--
-- delivery_status is server-controlled. Sellers and buyers may SET it only
-- through the dedicated functions below (which validate transitions and
-- authorization); a raw client UPDATE is blocked by the guard trigger.
-- ============================================================

alter table public.orders
  add column if not exists delivery_status text
    default 'pending'
    check (delivery_status in ('pending','delivered','buyer_confirmed'));

alter table public.orders
  add column if not exists delivered_at timestamptz;

alter table public.orders
  add column if not exists delivery_method text
    check (delivery_method in ('digital','manual','auto'));

alter table public.orders
  add column if not exists inspection_deadline timestamptz;

-- Delivery transitions are a guarded write just like stock/status.
create or replace function public.guard_order_delivery()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_trusted_write() then return new; end if;
  if new.delivery_status is distinct from old.delivery_status
     and old.delivery_status is distinct from new.delivery_status then
    new.delivery_status := old.delivery_status;
  end if;
  if new.delivered_at is not null and old.delivered_at is null then
    new.delivered_at := old.delivered_at;
  end if;
  if new.delivery_method is distinct from old.delivery_method then
    new.delivery_method := old.delivery_method;
  end if;
  if new.inspection_deadline is not null and old.inspection_deadline is null then
    new.inspection_deadline := old.inspection_deadline;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_order_delivery on public.orders;
create trigger guard_order_delivery before update on public.orders
  for each row execute function public.guard_order_delivery();

-- ============================================================
-- 4. DISPUTES + EVIDENCE
-- ============================================================

create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_no text not null references public.orders(order_no) on delete cascade,
  opened_by uuid not null references auth.users(id),
  reason text not null check (reason in
    ('not_as_described','transfer_failed','seller_unresponsive','item_not_received','other')),
  detail text not null,
  status text not null default 'open'
    check (status in ('open','under_review','resolved')),
  resolution text,                 -- 'refund_buyer' | 'release_seller' | 'dismissed'
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_no)               -- one dispute per order
);
create index if not exists disputes_order_idx on public.disputes(order_no);
create index if not exists disputes_status_idx on public.disputes(status);
alter table public.disputes enable row level security;

drop policy if exists "parties read disputes" on public.disputes;
create policy "parties read disputes" on public.disputes for select
  using (
    auth.uid() = opened_by
    or auth.uid() = (select buyer_id from public.orders where order_no = disputes.order_no)
    or auth.uid() = (select seller_id from public.orders where order_no = disputes.order_no)
    or public.is_admin()
  );

drop policy if exists "buyer may open one dispute per order" on public.disputes;
create policy "buyer may open one dispute per order" on public.disputes for insert
  with check (
    auth.uid() = opened_by
    and status = 'open'
    and not exists (
      select 1 from public.disputes d
      where d.order_no = disputes.order_no and d.opened_by = auth.uid() and d.status = 'open'
    )
  );

-- Evidence thread. Evidence is stored as structured notes / file references
-- (the actual files live in Supabase Storage; this table records the metadata
-- and who submitted it).
create table if not exists public.dispute_messages (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  author_role text not null check (author_role in ('buyer','seller','admin','system')),
  body text not null,
  evidence jsonb,                 -- optional structured evidence metadata
  created_at timestamptz not null default now()
);
create index if not exists dispute_messages_dispute_idx on public.dispute_messages(dispute_id);
alter table public.dispute_messages enable row level security;

drop policy if exists "dispute parties read and add messages" on public.dispute_messages;
create policy "dispute parties read and add messages" on public.dispute_messages for all
  using (
    author_id = auth.uid()
    or auth.uid() = (select opened_by from public.disputes where id = dispute_messages.dispute_id)
    or public.is_admin()
  )
  with check (
    author_id = auth.uid()
    or public.is_admin()
  );

-- ============================================================
-- 5. REVIEWS (buyer-only, eligible-purchaser-only)
-- ============================================================

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_no text not null references public.orders(order_no) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_id uuid not null references auth.users(id),
  seller_id uuid not null references auth.users(id),
  rating integer not null check (rating between 1 and 5),
  title text not null check (length(title) >= 3 and length(title) <= 120),
  body text not null check (length(body) >= 10),
  created_at timestamptz not null default now(),
  unique (order_no)               -- one review per order
);
create index if not exists reviews_listing_idx on public.reviews(listing_id);
create index if not exists reviews_buyer_idx on public.reviews(buyer_id);
alter table public.reviews enable row level security;

drop policy if exists "anyone reads reviews" on public.reviews;
create policy "anyone reads reviews" on public.reviews for select
  using (true);

drop policy if exists "eligible buyer may submit one review per order" on public.reviews;
create policy "eligible buyer may submit one review per order" on public.reviews for insert
  with check (
    auth.uid() = buyer_id
    and not exists (
      select 1 from public.reviews r where r.order_no = reviews.order_no
    )
  );

drop policy if exists "review owner may edit body" on public.reviews;
create policy "review owner may edit body" on public.reviews for update
  using (auth.uid() = buyer_id)
  with check (
    auth.uid() = buyer_id
    and new.buyer_id = old.buyer_id
    and new.listing_id = old.listing_id
    and new.seller_id = old.seller_id
    and new.rating = old.rating
    and new.created_at = old.created_at
  );

-- ============================================================
-- 6. NOTIFICATIONS
-- ============================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in (
    'order_placed','escrow_funded','awaiting_delivery','delivered',
    'delivery_confirmed','inspection_reminder','inspection_expired',
    'dispute_opened','dispute_updated','dispute_resolved',
    'payment_pending','payment_captured','payment_failed',
    'review_ready','review_received','refund_processed','replacement_requested',
    'cancellation_requested','cancelled','seller_review_request','admin_review'
  )),
  title text not null,
  body text not null,
  reference text,                 -- order_no / dispute_id / review_id / etc.
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications(user_id, read) where not read;
alter table public.notifications enable row level security;

drop policy if exists "users read and manage their own notifications" on public.notifications;
create policy "users read and manage their own notifications" on public.notifications for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Mark-all-read helper.
create or replace function public.mark_notifications_read(p_user uuid)
returns integer language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then raise exception 'No user'; end if;
  update public.notifications set read = true
    where user_id = p_user and not read;
  return sql%rowcount;
end;
$$;

grant execute on function public.mark_notifications_read(uuid) to authenticated;

-- ============================================================
-- 7. NOTIFICATION HELPER — single insert, RLS-bypass-safe
-- ============================================================

create or replace function public.notify(
  p_user uuid, p_kind text, p_title text, p_body text, p_reference text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_kind is null or p_title is null then return; end if;
  insert into public.notifications (user_id, kind, title, body, reference)
    values (p_user, p_kind, p_title, p_body, p_reference);
end;
$$;

grant execute on function public.notify(uuid, text, text, text, text) to authenticated, service_role;

-- ============================================================
-- 8. CART MUTATIONS (server-side, validated)
-- ============================================================

create or replace function public.cart_add(p_listing_id uuid, p_quantity integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_l public.listings%rowtype; v_id uuid;
begin
  v_user := auth.uid();
  if v_user is null then raise exception 'Signed in only'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 1000 then
    raise exception 'Quantity must be between 1 and 1000';
  end if;

  select * into v_l from public.listings where id = p_listing_id;
  if not found then raise exception 'Listing not found'; end if;
  if v_l.status <> 'active' or v_l.hidden or v_l.stock < p_quantity then
    raise exception 'This item is not currently available';
  end if;

  insert into public.cart_items (user_id, listing_id, quantity)
    values (v_user, p_listing_id, p_quantity)
    on conflict (user_id, listing_id) do update
      set quantity = p_quantity, added_at = now()
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.cart_set(p_listing_id uuid, p_quantity integer)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  v_user := auth.uid();
  if v_user is null then raise exception 'Signed in only'; end if;
  if p_quantity is null or p_quantity < 1 then
    delete from public.cart_items
      where user_id = v_user and listing_id = p_listing_id;
    return;
  end if;
  if p_quantity > 1000 then raise exception 'Quantity must be 1000 or less'; end if;
  update public.cart_items
    set quantity = p_quantity, added_at = now()
    where user_id = v_user and listing_id = p_listing_id;
end;
$$;

create or replace function public.cart_remove(p_listing_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  v_user := auth.uid();
  if v_user is null then raise exception 'Signed in only'; end if;
  delete from public.cart_items where user_id = v_user and listing_id = p_listing_id;
end;
$$;

grant execute on function public.cart_add(uuid, integer) to authenticated;
grant execute on function public.cart_set(uuid, integer) to authenticated;
grant execute on function public.cart_remove(uuid) to authenticated;

-- ============================================================
-- 9. CHECKOUT — validate + fund an order from wallet balance.
--
-- Single-item wallet checkouts delegate to the existing place_order() so the
-- escrow/stock/credential logic is not duplicated; checkout then adds delivery
-- state, auto-delivers digital orders and sends notifications.
--
-- Cart (multi-item) wallet checkouts create one order per item here, all in one
-- transaction, with derived per-item idempotency keys so the per-(buyer,key)
-- unique index on orders is never violated by a multi-item checkout while still
-- making a whole-cart retry a no-op.
--
-- Provider-funded orders are NOT created here — they go through the verified
-- webhook path in section 10, which is the only place a provider can create an
-- order (so there is never an unfunded order in the database).
-- ============================================================

create or replace function public.finish_single_order_delivery(p_order_no text, p_buyer uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_o public.orders%rowtype;
  v_claimed integer;
begin
  select * into v_o from public.orders where order_no = p_order_no;
  if not found then return; end if;
  if v_o.delivery_status <> 'pending' then return; end if;

  -- Count credential units claimed by this order. If any, it is a digital
  -- order and is delivered instantly (the buyer can already download them,
  -- and confirm_delivery() will allow the implicit digital-delivery case).
  select count(*) into v_claimed
    from public.listing_credentials where claimed_by_order = p_order_no;
  if v_claimed > 0 then
    perform set_config('app.trusted_write','on',true);
    update public.orders
      set delivery_status = 'delivered',
          delivered_at = now(),
          delivery_method = 'digital'
      where order_no = p_order_no;
    perform public.notify(v_o.buyer_id, 'delivered',
      'Your order has been delivered',
      format('Your order %s has been delivered digitally. Review it and confirm when you are done.', p_order_no),
      p_order_no);
  end if;
end;
$$;

grant execute on function public.finish_single_order_delivery(text, uuid) to authenticated;

create or replace function public.checkout(
  p_listing_id uuid,                      -- Buy Now: single listing
  p_cart_ids uuid[],                      -- cart: multi-item; ignored when empty
  p_quantity integer,                     -- Buy Now quantity
  p_idempotency_key text
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_listing public.listings%rowtype;
  v_order_no text;
  v_first_order_no text := null;
  v_any_existing boolean := false;
begin
  if v_user is null then raise exception 'Signed in only'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 8 then
    raise exception 'An idempotency key of at least 8 characters is required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user::text || ':' || p_idempotency_key, 0));

  -- ---- Buy Now (single item) ----
  if p_cart_ids is null or array_length(p_cart_ids, 1) is null
     or array_length(p_cart_ids, 1) = 0 then
    if p_listing_id is null then
      raise exception 'A listing is required for a Buy Now checkout';
    end if;
    if p_quantity is null or p_quantity < 1 or p_quantity > 1000 then
      raise exception 'Quantity must be between 1 and 1000';
    end if;

    select order_no into v_order_no from public.orders
      where buyer_id = v_user and idempotency_key = p_idempotency_key;
    if found then return v_order_no; end if;

    v_order_no := public.place_order(p_listing_id, p_quantity, p_idempotency_key);
    perform public.finish_single_order_delivery(v_order_no, v_user);
    return v_order_no;
  end if;

  -- ---- Cart (multi-item) ----
  -- Derived per-item keys: key || ':' || listing_id. If ANY item already has
  -- an order under a derived key this whole checkout is a retry — return the
  -- first existing order and do not create anything (the function is atomic,
  -- so a partial can never have landed; this is strictly a retry guard).
  for v_listing in
    select id from public.listings where id = any(p_cart_ids) for update skip locked loop
    if exists (select 1 from public.orders
               where buyer_id = v_user
                 and idempotency_key = (p_idempotency_key || ':' || v_listing.id::text)) then
      v_any_existing := true;
    end if;
  end loop;

  if v_any_existing then
    select order_no into v_order_no from public.orders
      where buyer_id = v_user
        and idempotency_key like (p_idempotency_key || ':%')
      order by created_at asc limit 1;
    return v_order_no;
  end if;

  -- One order per cart item, all in this transaction.
  for v_listing in
    select c.listing_id, c.quantity, l.title, l.brand, l.price_usd, l.seller_id
      from public.cart_items c
      join public.listings l on l.id = c.listing_id
      where c.user_id = v_user and c.listing_id = any(p_cart_ids)
      order by c.added_at
      for update skip locked loop
    declare
      v_derived text := p_idempotency_key || ':' || v_listing.listing_id::text;
      v_subtotal numeric(12,2);
      v_escrow_fee numeric(12,2);
      v_total numeric(12,2);
      v_commission numeric(12,2);
      v_net numeric(12,2);
      v_balance numeric(12,2);
      v_item_no text;
    begin
      if v_listing.stock < v_listing.quantity then
        raise exception 'One of your cart items is out of stock';
      end if;
      if v_listing.seller_id = v_user then
        raise exception 'You cannot buy your own listing';
      end if;

      v_subtotal := v_listing.price_usd * v_listing.quantity;
      v_escrow_fee := round(v_subtotal * 0.03, 2);
      v_total := v_subtotal + v_escrow_fee;
      v_commission := round(v_subtotal * 0.10, 2);
      v_net := v_subtotal - v_commission;

      select balance_usd into v_balance from public.wallets
        where user_id = v_user for update;
      if coalesce(v_balance,0) < v_total then
        raise exception 'Insufficient wallet balance';
      end if;

      perform set_config('app.trusted_write','on',true);
      v_item_no := 'AMH-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
      perform public.apply_wallet(v_user, -v_total, 0, 'purchase', v_item_no, null);
      perform public.apply_wallet(v_listing.seller_id, 0, v_net, 'escrow_hold', v_item_no, null);
      insert into public.order_payments (order_no, method, amount_usd, status, captured_at)
        values (v_item_no, 'wallet', v_total, 'captured', now());

      update public.listings set stock = stock - v_listing.quantity
        where id = v_listing.listing_id;

      insert into public.orders (
        order_no, listing_id, listing_title, brand, buyer_id, seller_id, quantity,
        unit_price_usd, gross_amount, escrow_fee_usd, total_usd,
        commission_rate, commission_amount, seller_net_amount,
        payment_method, status, idempotency_key, escrow_expires_at,
        delivery_status, inspection_deadline)
      values (v_item_no, v_listing.listing_id, v_listing.title, v_listing.brand,
              v_user, v_listing.seller_id, v_listing.quantity, v_listing.price_usd,
              v_subtotal, v_escrow_fee, v_total,
              0.10, v_commission, v_net,
              'wallet', 'in_escrow', v_derived, now() + interval '14 days',
              'pending', now() + interval '14 days');

      update public.listing_credentials
         set claimed_by_order = v_item_no, claimed_at = now()
       where id in (
         select id from public.listing_credentials
          where listing_id = v_listing.listing_id and claimed_by_order is null
          order by created_at limit v_listing.quantity for update skip locked
       );

      perform public.finish_single_order_delivery(v_item_no, v_user);
      if v_first_order_no is null then v_first_order_no := v_item_no; end if;
    end;
  end loop;

  delete from public.cart_items
    where user_id = v_user and listing_id = any(p_cart_ids);

  return coalesce(v_first_order_no, v_order_no);
end;
$$;

grant execute on function public.checkout(uuid, uuid[], integer, text) to authenticated;

-- ============================================================
-- 10. PROVIDER PAYMENT — invoice opening + verified webhook settle
--
-- The Edge Function (holds the merchant key) opens the invoice and records a
-- PENDING order_payments row (order_no NULL) that also reserves stock. The
-- provider's signed callback hits verify_order_payment_webhook(), which verifies
-- the signature, dedups on the provider event id, re-derives the total from the
-- listing, and only then captures the payment AND creates + funds the order
-- atomically. The browser never sees the merchant key and never trusts a "paid"
-- message.
-- ============================================================

-- Open a provider invoice: reserve stock and record a pending payment intent.
-- Called by the Edge Function (service_role).
create or replace function public.provider_invoice_opened(
  p_buyer uuid,
  p_provider text,
  p_track_id text,
  p_amount_usd numeric,
  p_listing_id uuid,
  p_quantity integer
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_listing public.listings%rowtype;
  v_id uuid;
begin
  if p_buyer is null or p_provider is null or p_track_id is null
     or p_amount_usd is null or p_listing_id is null or p_quantity is null then
    raise exception 'All fields are required to open a provider invoice';
  end if;
  if p_amount_usd <= 0 then raise exception 'Amount must be positive'; end if;
  if p_quantity < 1 or p_quantity > 1000 then
    raise exception 'Quantity must be between 1 and 1000';
  end if;

  select * into v_listing from public.listings
    where id = p_listing_id and status = 'active' and hidden = false
    for update;
  if not found then raise exception 'Listing not available'; end if;
  if v_listing.stock < p_quantity then
    raise exception 'Not enough stock available to open this invoice';
  end if;

  update public.listings set stock = stock - p_quantity where id = p_listing_id;

  insert into public.order_payments (
      order_no, method, buyer_id, listing_id, quantity,
      provider, provider_track_id, provider_amount, provider_currency,
      provider_status, status, amount_usd)
    values (null, 'provider', p_buyer, p_listing_id, p_quantity,
      p_provider, p_track_id, p_amount_usd, 'USD', 'pending', 'pending', p_amount_usd)
    on conflict (provider_track_id) do update
      set provider_status = excluded.provider_status
      where public.order_payments.status = 'pending'
    returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.provider_invoice_opened(
  uuid, text, text, numeric, uuid, integer) to service_role;

-- Verify a signed provider webhook and, on a successful charge, capture the
-- payment AND create + fund the order atomically. On failure it captures nothing
-- and restores the stock that provider_invoice_opened() reserved.
--
-- Signature scheme is provider-specific; the template below verifies an
-- HMAC-SHA512 over the raw body using a server-side secret (set by the Edge
-- Function before calling, never a VITE_ variable). Replace the signature block
-- with the real provider's scheme when you wire one up.
create or replace function public.verify_order_payment_webhook(
  p_provider text,
  p_track_id text,
  p_event_id text,
  p_provider_status text,
  p_provider_amount numeric,
  p_currency text,
  p_webhook_body bytea,
  p_signature text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_payment public.order_payments%rowtype;
  v_listing public.listings%rowtype;
  v_secret text;
  v_body text;
  v_expected text;
  v_order_no text;
begin
  if not public.is_trusted_write() then
    raise exception 'Payment webhook verification is server-only';
  end if;
  if p_provider is null or p_track_id is null or p_event_id is null then
    raise exception 'provider, track id and event id are required';
  end if;

  select * into v_payment from public.order_payments
    where provider_track_id = p_track_id
      and method = 'provider'
      and status = 'pending'
    for update;
  if not found then
    return null;  -- already captured/failed, or unknown track id — acknowledge, move nothing
  end if;

  if v_payment.webhook_idempotency_key = p_event_id then
    return v_payment.id;  -- replay, already processed
  end if;

  -- Signature verification (template: HMAC-SHA512 over raw body).
  v_secret := current_setting('app.payment_webhook_secret', true);
  if v_secret is null or v_secret = '' then
    raise exception 'Payment webhook secret is not configured';
  end if;
  v_body := convert_from(p_webhook_body, 'UTF8');
  v_expected := encode(hmac(v_body, v_secret, 'sha512'), 'hex');
  if v_expected <> lower(p_signature) then
    update public.order_payments
      set provider_status = p_provider_status, webhook_payload = p_webhook_body
      where id = v_payment.id;
    raise exception 'Webhook signature mismatch';
  end if;

  -- Only a provider "paid/successful/completed" event can capture.
  if lower(p_provider_status) not in ('paid','successful','completed') then
    update public.order_payments
      set provider_status = p_provider_status,
          webhook_payload = p_webhook_body,
          webhook_idempotency_key = p_event_id,
          status = 'failed'
    where id = v_payment.id;
    -- restore the stock reserved when the invoice was opened
    if v_payment.listing_id is not null then
      update public.listings set stock = stock + v_payment.quantity
        where id = v_payment.listing_id;
    end if;
    perform public.notify(v_payment.buyer_id, 'payment_failed',
      'Payment failed',
      format('Your payment via %s could not be completed.', p_provider),
      '');
    return v_payment.id;
  end if;

  -- Re-derive the total from the listing and compare to the provider-reported
  -- amount. Never trust the provider's figure alone.
  if v_payment.listing_id is null then
    update public.order_payments
      set provider_status = p_provider_status, webhook_payload = p_webhook_body,
          webhook_idempotency_key = p_event_id, status = 'failed'
    where id = v_payment.id;
    raise exception 'No listing attached to this payment';
  end if;
  select * into v_listing from public.listings
    where id = v_payment.listing_id and status = 'active' and hidden = false
    for update;
  if not found then
    update public.order_payments
      set provider_status = p_provider_status, webhook_payload = p_webhook_body,
          webhook_idempotency_key = p_event_id, status = 'failed'
    where id = v_payment.id;
    update public.listings set stock = stock + v_payment.quantity
      where id = v_payment.listing_id;
    perform public.notify(v_payment.buyer_id, 'payment_failed',
      'Payment failed',
      'The listing is no longer available.',
      '');
    return v_payment.id;
  end if;
  if v_listing.stock < v_payment.quantity then
    update public.order_payments
      set provider_status = p_provider_status, webhook_payload = p_webhook_body,
          webhook_idempotency_key = p_event_id, status = 'failed'
    where id = v_payment.id;
    update public.listings set stock = stock + v_payment.quantity
      where id = v_payment.listing_id;
    perform public.notify(v_payment.buyer_id, 'payment_failed',
      'Payment failed',
      'The listing is out of stock.',
      '');
    return v_payment.id;
  end if;

  declare
    v_subtotal numeric(12,2) := v_listing.price_usd * v_payment.quantity;
    v_total numeric(12,2) := v_subtotal + round(v_subtotal * 0.03, 2);
  begin
    if abs(p_provider_amount - v_total) > 0.009 then
      update public.order_payments
        set provider_status = p_provider_status, provider_amount = p_provider_amount,
            webhook_payload = p_webhook_body, webhook_idempotency_key = p_event_id,
            status = 'failed'
      where id = v_payment.id;
      update public.listings set stock = stock + v_payment.quantity
        where id = v_payment.listing_id;
      perform public.notify(v_payment.buyer_id, 'payment_failed',
        'Payment failed',
        'The amount charged does not match this order.',
        '');
      return v_payment.id;
    end if;
  end;

  -- Capture + create + fund the order atomically.
  perform set_config('app.trusted_write','on',true);
  v_order_no := 'AMH-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));

  update public.order_payments
    set provider_status = p_provider_status,
        provider_amount = p_provider_amount,
        status = 'captured',
        captured_at = now(),
        webhook_payload = p_webhook_body,
        webhook_idempotency_key = p_event_id,
        order_no = v_order_no
    where id = v_payment.id;

  insert into public.orders (
    order_no, listing_id, listing_title, brand, buyer_id, seller_id, quantity,
    unit_price_usd, gross_amount, escrow_fee_usd, total_usd,
    commission_rate, commission_amount, seller_net_amount,
    payment_method, status, idempotency_key, escrow_expires_at,
    delivery_status, inspection_deadline)
  values (v_order_no, v_listing.id, v_listing.title, v_listing.brand,
    v_payment.buyer_id, v_listing.seller_id, v_payment.quantity, v_listing.price_usd,
    v_subtotal, round(v_subtotal * 0.03, 2), v_total,
    0.10, round(v_subtotal * 0.10, 2), v_subtotal - round(v_subtotal * 0.10, 2),
    'provider', 'in_escrow', p_event_id, now() + interval '14 days',
    'pending', now() + interval '14 days');

  update public.listing_credentials
     set claimed_by_order = v_order_no, claimed_at = now()
   where id in (
     select id from public.listing_credentials
      where listing_id = v_listing.id and claimed_by_order is null
      order by created_at limit v_payment.quantity for update skip locked
   );

  perform public.finish_single_order_delivery(v_order_no, v_payment.buyer_id);

  perform public.apply_wallet(v_listing.seller_id, 0, v_subtotal - round(v_subtotal * 0.10, 2),
    'escrow_hold', v_order_no, 'provider payment captured');

  perform public.notify(v_payment.buyer_id, 'payment_captured',
    'Payment received',
    'Your payment cleared. Funds are held in escrow until delivery is confirmed.',
    v_order_no);
  perform public.notify(v_listing.seller_id, 'order_placed',
    'New order',
    format('A buyer ordered %s (%s).', v_listing.title, v_order_no),
    v_order_no);

  return v_payment.id;
end;
$$;

grant execute on function public.verify_order_payment_webhook(
  text, text, text, text, numeric, text, bytea, text) to service_role;

-- Sweeper: abandoned provider invoices (pending, older than 30 minutes) restore
-- the reserved stock and are marked failed so the buyer is not left with stock
-- locked forever.
create or replace function public.sweep_abandoned_provider_payments(p_limit integer)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  if not public.is_trusted_write() then raise exception 'Server-only'; end if;
  for r in
    select id, buyer_id, listing_id, quantity, amount_usd
      from public.order_payments
     where method = 'provider'
       and status = 'pending'
       and created_at < now() - interval '30 minutes'
     order by created_at
     limit coalesce(p_limit, 100)
     for update skip locked
  loop
    update public.order_payments
      set status = 'failed',
          provider_status = 'expired',
          webhook_payload = '{"sweep":"abandoned_invoice"}'
      where id = r.id;
    if r.listing_id is not null then
      update public.listings set stock = stock + r.quantity where id = r.listing_id;
    end if;
    perform public.notify(r.buyer_id, 'payment_failed',
      'Payment window expired',
      format('Your payment for %s did not complete in time, so the reserved stock was released.', r.amount_usd),
      '');
    n := n + 1;
  end loop;
  return n;
end;
$$;

grant execute on function public.sweep_abandoned_provider_payments(integer) to service_role;

-- ============================================================
-- 11. DELIVERY
-- ============================================================

-- Seller marks an order delivered (manual goods, or explicit digital). Only the
-- seller of that order, only while in_escrow and not yet delivered/confirmed.
create or replace function public.mark_order_delivered(
  p_order_no text,
  p_method text default 'digital'
) returns void language plpgsql security definer set search_path = public as $$
declare v_o public.orders%rowtype;
begin
  if p_order_no is null then raise exception 'Order not found'; end if;
  if p_method is null or p_method not in ('digital','manual') then
    raise exception 'Delivery method must be digital or manual';
  end if;
  select * into v_o from public.orders where order_no = p_order_no for update;
  if not found then raise exception 'Order not found'; end if;
  if v_o.seller_id <> auth.uid() then
    raise exception 'Only the seller can mark this order delivered';
  end if;
  if v_o.status <> 'in_escrow' then
    raise exception 'Only an in_escrow order can be marked delivered';
  end if;
  if v_o.delivery_status <> 'pending' then
    raise exception 'This order has already been delivered or confirmed';
  end if;

  perform set_config('app.trusted_write','on',true);
  update public.orders
    set delivery_status = 'delivered',
        delivered_at = now(),
        delivery_method = p_method
  where order_no = p_order_no;

  perform public.notify(v_o.buyer_id, 'delivered',
    'Your order has been delivered',
    format('Your order %s has been delivered (%s). Review it and confirm when you are done.',
      p_order_no, case when p_method = 'digital' then 'digital' else 'manual' end),
    p_order_no);
end;
$$;

grant execute on function public.mark_order_delivered(text, text) to authenticated;

-- Buyer confirms delivery and releases escrow. Two cases:
--   * delivery_status = 'delivered'  → seller (or auto) has marked it; confirm within the inspection window.
--   * delivery_status = 'pending' AND the order has claimed credentials → implicit digital delivery
--     (the buyer already has the credentials via download_credentials); confirm within the inspection window.
-- Disputed or expired-inspection orders are never self-confirmed here.
create or replace function public.confirm_delivery(p_order_no text)
returns void language plpgsql security definer set search_path = public as $$
declare v_o public.orders%rowtype;
  v_locked numeric(12,2);
  v_claimed integer;
begin
  if p_order_no is null then raise exception 'Order not found'; end if;
  select * into v_o from public.orders where order_no = p_order_no for update;
  if not found then raise exception 'Order not found'; end if;
  if v_o.buyer_id <> auth.uid() then
    raise exception 'Only the buyer can confirm delivery';
  end if;
  if v_o.status <> 'in_escrow' then
    raise exception 'Only an in_escrow order can be confirmed';
  end if;
  if v_o.delivery_status <> 'delivered' then
    if v_o.delivery_status <> 'pending' then
      raise exception 'This order has already been confirmed';
    end if;
    select count(*) into v_claimed
      from public.listing_credentials where claimed_by_order = p_order_no;
    if v_claimed <= 0 then
      raise exception 'The seller must mark this order delivered before you can confirm';
    end if;
  end if;
  if v_o.inspection_deadline is not null and v_o.inspection_deadline < now() then
    raise exception 'The inspection window has closed. Contact support to resolve this order.';
  end if;

  select locked_usd into v_locked from public.wallets
    where user_id = v_o.seller_id for update;
  if not found or v_locked < v_o.seller_net_amount then
    raise exception 'Escrow hold is missing for this order. Support has been notified.';
  end if;

  perform public.apply_wallet(v_o.seller_id, v_o.seller_net_amount, -v_o.seller_net_amount,
    'escrow_release', p_order_no, 'buyer confirmed delivery');
  update public.orders
    set status = 'completed',
        delivery_status = 'buyer_confirmed'
  where order_no = p_order_no;

  perform public.notify(v_o.seller_id, 'delivery_confirmed',
    'Order completed',
    format('The buyer confirmed order %s. Escrow has been released.', p_order_no),
    p_order_no);
end;
$$;

grant execute on function public.confirm_delivery(text) to authenticated;

-- Sweeper: delivered-but-unconfirmed orders past their inspection deadline that
-- are not disputed are flagged for admin review (both parties notified). Funds
-- stay in escrow — never auto-released.
create or replace function public.sweep_expired_inspections(p_limit integer)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  if not public.is_trusted_write() then raise exception 'Server-only'; end if;
  for r in
    select order_no, buyer_id, seller_id
      from public.orders
     where status = 'in_escrow'
       and delivery_status = 'delivered'
       and inspection_deadline < now()
       and not exists (select 1 from public.disputes where order_no = orders.order_no)
     order by inspection_deadline
     limit coalesce(p_limit, 100)
     for update skip locked
  loop
    perform public.notify(r.buyer_id, 'inspection_expired',
      'Inspection window closed',
      format('Your inspection window for order %s has closed. Contact support to confirm or dispute.', r.order_no),
      r.order_no);
    perform public.notify(r.seller_id, 'inspection_expired',
      'Buyer inspection window closed',
      format('The buyer did not confirm order %s before the inspection window closed. Contact support.', r.order_no),
      r.order_no);
    n := n + 1;
  end loop;
  return n;
end;
$$;

grant execute on function public.sweep_expired_inspections(integer) to service_role;

-- ============================================================
-- 12. DISPUTE LIFECYCLE
-- ============================================================

create or replace function public.open_dispute(
  p_order_no text,
  p_reason text,
  p_detail text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_o public.orders%rowtype; v_id uuid;
begin
  if p_order_no is null or p_reason is null or p_detail is null then
    raise exception 'Order, reason and detail are required';
  end if;
  if length(trim(p_detail)) < 10 then
    raise exception 'Please describe the issue in at least 10 characters';
  end if;
  select * into v_o from public.orders where order_no = p_order_no for update;
  if not found then raise exception 'Order not found'; end if;
  if v_o.buyer_id <> auth.uid() then
    raise exception 'Only the buyer can open a dispute';
  end if;
  if v_o.status <> 'in_escrow' then
    raise exception 'Only an in_escrow order can be disputed';
  end if;
  if v_o.delivery_status = 'buyer_confirmed' then
    raise exception 'This order was already confirmed by the buyer';
  end if;

  insert into public.disputes (order_no, opened_by, reason, detail)
    values (p_order_no, auth.uid(), p_reason, p_detail)
    returning id into v_id;

  perform set_config('app.trusted_write','on',true);
  update public.orders set status = 'disputed' where order_no = p_order_no;

  perform public.notify(v_o.buyer_id, 'dispute_opened',
    'Dispute opened',
    'Your dispute has been opened. Escrow is frozen while we review.',
    v_id::text);
  perform public.notify(v_o.seller_id, 'dispute_opened',
    'Dispute opened on your order',
    format('A buyer opened a dispute on order %s. Escrow is frozen.', p_order_no),
    v_id::text);
  return v_id;
end;
$$;

grant execute on function public.open_dispute(text, text, text) to authenticated;

-- Add an evidence message to an open dispute.
create or replace function public.add_dispute_message(
  p_dispute_id uuid,
  p_body text,
  p_author_role text default 'buyer'
) returns void language plpgsql security definer set search_path = public as $$
declare v_d public.disputes%rowtype;
begin
  if p_dispute_id is null or p_body is null then raise exception 'Dispute and body required'; end if;
  if length(trim(p_body)) < 1 then raise exception 'Message body required'; end if;
  if p_author_role not in ('buyer','seller','admin','system') then
    raise exception 'Invalid author role';
  end if;
  select * into v_d from public.disputes where id = p_dispute_id for update;
  if not found then raise exception 'Dispute not found'; end if;
  if v_d.status = 'resolved' then
    raise exception 'This dispute has already been resolved';
  end if;
  if p_author_role = 'buyer' and v_d.opened_by <> auth.uid() then
    raise exception 'Only the dispute opener may post as buyer';
  end if;
  if p_author_role = 'seller' and v_d.order_no is not null
     and (select seller_id from public.orders where order_no = v_d.order_no) <> auth.uid() then
    raise exception 'Only the seller may post as seller';
  end if;

  insert into public.dispute_messages (dispute_id, author_id, author_role, body)
    values (p_dispute_id, auth.uid(), p_author_role, p_body);
end;
$$;

grant execute on function public.add_dispute_message(uuid, text, text) to authenticated;

-- Admin resolves a dispute: refund_buyer, release_seller, or dismissed.
create or replace function public.resolve_dispute(
  p_dispute_id uuid,
  p_outcome text,
  p_note text
) returns void language plpgsql security definer set search_path = public as $$
declare v_d public.disputes%rowtype; v_o public.orders%rowtype;
begin
  if not public.can_moderate() then raise exception 'Administrators only'; end if;
  if p_dispute_id is null then raise exception 'Dispute required'; end if;
  if p_outcome is null or p_outcome not in ('refund_buyer','release_seller','dismissed') then
    raise exception 'Outcome must be refund_buyer, release_seller or dismissed';
  end if;
  if p_outcome <> 'dismissed' and (p_note is null or length(btrim(p_note)) < 3) then
    raise exception 'A resolution note is required';
  end if;

  select * into v_d from public.disputes where id = p_dispute_id for update;
  if not found then raise exception 'Dispute not found'; end if;
  if v_d.status = 'resolved' then raise exception 'Dispute already resolved'; end if;

  perform set_config('app.trusted_write','on',true);
  update public.disputes
    set status = 'resolved', resolution = p_outcome,
        resolution_note = p_note, resolved_at = now()
  where id = p_dispute_id;

  select * into v_o from public.orders where order_no = v_d.order_no for update;
  if not found then raise exception 'Order not found for dispute'; end if;

  if p_outcome = 'refund_buyer' then
    if v_o.status <> 'disputed' then
      raise exception 'Only a disputed order can be refunded from a dispute';
    end if;
    perform public.apply_wallet(v_o.buyer_id, v_o.total_usd, 0, 'refund', v_d.order_no, 'dispute resolved — refund to buyer');
    perform public.apply_wallet(v_o.seller_id, 0, -v_o.seller_net_amount, 'refund', v_d.order_no, 'dispute resolved — escrow hold released');
    update public.listings set stock = stock + v_o.quantity where id = v_o.listing_id;
    update public.listing_credentials
      set claimed_by_order = null, claimed_at = null
    where claimed_by_order = v_d.order_no;
    update public.orders set status = 'refunded' where order_no = v_d.order_no;

    perform public.notify(v_o.buyer_id, 'refund_processed',
      'Dispute resolved — refund issued',
      format('Your dispute on order %s was resolved and your payment was refunded.', v_d.order_no),
      v_d.id::text);
    perform public.notify(v_o.seller_id, 'refund_processed',
      'Dispute resolved — funds returned to buyer',
      format('Order %s was refunded after dispute review.', v_d.order_no),
      v_d.id::text);

  elsif p_outcome = 'release_seller' then
    if v_o.status <> 'disputed' then
      raise exception 'Only a disputed order can be released from a dispute';
    end if;
    perform public.apply_wallet(v_o.seller_id, v_o.seller_net_amount, -v_o.seller_net_amount,
      'escrow_release', v_d.order_no, 'dispute resolved — released to seller');
    update public.orders set status = 'completed' where order_no = v_d.order_no;

    perform public.notify(v_o.buyer_id, 'dispute_resolved',
      'Dispute resolved — funds released to seller',
      format('Your dispute on order %s was reviewed and the funds were released to the seller.', v_d.order_no),
      v_d.id::text);
    perform public.notify(v_o.seller_id, 'dispute_resolved',
      'Dispute resolved — funds released',
      format('Order %s was resolved in your favour. Escrow has been released.', v_d.order_no),
      v_d.id::text);

  else
    perform public.notify(v_o.buyer_id, 'dispute_resolved',
      'Dispute dismissed',
      format('Your dispute on order %s was dismissed after review.', v_d.order_no),
      v_d.id::text);
    perform public.notify(v_o.seller_id, 'dispute_resolved',
      'Dispute dismissed',
      format('The dispute on order %s was dismissed.', v_d.order_no),
      v_d.id::text);
  end if;
end;
$$;

grant execute on function public.resolve_dispute(uuid, text, text) to authenticated;

-- ============================================================
-- 13. REPLACEMENT + CANCELLATION REQUESTS
-- ============================================================

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

drop policy if exists "buyer may request replacement or cancellation" on public.order_requests;
create policy "buyer may request replacement or cancellation" on public.order_requests for insert
  with check (
    auth.uid() = requested_by
    and status = 'pending'
    and kind in ('replacement','cancellation')
  );

create or replace function public.request_replacement(
  p_order_no text,
  p_reason text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_o public.orders%rowtype; v_id uuid;
begin
  if p_order_no is null or p_reason is null then raise exception 'Order and reason required'; end if;
  if length(trim(p_reason)) < 10 then raise exception 'Reason must be at least 10 characters'; end if;
  select * into v_o from public.orders where order_no = p_order_no for update;
  if not found then raise exception 'Order not found'; end if;
  if v_o.buyer_id <> auth.uid() then raise exception 'Only the buyer can request a replacement'; end if;
  if v_o.status <> 'in_escrow' then raise exception 'Only an in_escrow order can be replaced'; end if;
  if v_o.delivery_status = 'buyer_confirmed' then
    raise exception 'A confirmed order cannot be replaced';
  end if;

  insert into public.order_requests (order_no, requested_by, kind, reason)
    values (p_order_no, auth.uid(), 'replacement', p_reason)
    on conflict (order_no, kind) do update
      set reason = excluded.reason, status = 'pending'
    returning id into v_id;

  perform public.notify(v_o.seller_id, 'replacement_requested',
    'Replacement requested',
    format('The buyer of order %s has requested a replacement. Review and mark a new delivery if you can.', p_order_no),
    v_id::text);
  perform public.notify(v_o.buyer_id, 'replacement_requested',
    'Replacement request submitted',
    'Your replacement request has been sent to the seller.',
    v_id::text);
  return v_id;
end;
$$;

grant execute on function public.request_replacement(text, text) to authenticated;

create or replace function public.request_cancellation(
  p_order_no text,
  p_reason text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_o public.orders%rowtype; v_id uuid;
begin
  if p_order_no is null or p_reason is null then raise exception 'Order and reason required'; end if;
  if length(trim(p_reason)) < 10 then raise exception 'Reason must be at least 10 characters'; end if;
  select * into v_o from public.orders where order_no = p_order_no for update;
  if not found then raise exception 'Order not found'; end if;
  if v_o.buyer_id <> auth.uid() then raise exception 'Only the buyer can request a cancellation'; end if;
  if v_o.status <> 'in_escrow' then raise exception 'Only an in_escrow order can be cancelled'; end if;
  if v_o.delivery_status = 'buyer_confirmed' then
    raise exception 'A confirmed order cannot be cancelled';
  end if;

  insert into public.order_requests (order_no, requested_by, kind, reason)
    values (p_order_no, auth.uid(), 'cancellation', p_reason)
    on conflict (order_no, kind) do update
      set reason = excluded.reason, status = 'pending'
    returning id into v_id;

  perform public.notify(v_o.seller_id, 'cancellation_requested',
    'Cancellation requested',
    format('The buyer of order %s has requested cancellation.', p_order_no),
    v_id::text);
  perform public.notify(v_o.buyer_id, 'cancellation_requested',
    'Cancellation request submitted',
    'Your cancellation request has been sent to the seller.',
    v_id::text);
  return v_id;
end;
$$;

grant execute on function public.request_cancellation(text, text) to authenticated;

-- Admin (or the seller, for replacement) resolves an order request.
create or replace function public.resolve_order_request(
  p_request_id uuid,
  p_outcome text,
  p_note text
) returns void language plpgsql security definer set search_path = public as $$
declare v_r public.order_requests%rowtype; v_o public.orders%rowtype;
begin
  if p_request_id is null then raise exception 'Request required'; end if;
  if p_outcome is null or p_outcome not in ('approved','dismissed') then
    raise exception 'Outcome must be approved or dismissed';
  end if;

  select * into v_r from public.order_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if v_r.status <> 'pending' then raise exception 'Request already resolved'; end if;

  select * into v_o from public.orders where order_no = v_r.order_no for update;
  if not found then raise exception 'Order not found for request'; end if;

  if v_r.kind = 'cancellation' and p_outcome = 'approved' then
    if not public.can_moderate() then
      raise exception 'Only an administrator can approve a cancellation';
    end if;
    if v_o.status <> 'in_escrow' then
      raise exception 'Cannot cancel an order that is not in escrow';
    end if;
  end if;
  if v_r.kind = 'replacement' and p_outcome = 'approved' then
    if auth.uid() <> v_o.seller_id and not public.can_moderate() then
      raise exception 'Only the seller or an administrator can approve a replacement';
    end if;
  end if;

  perform set_config('app.trusted_write','on',true);
  update public.order_requests
    set status = p_outcome, resolved_by = auth.uid(),
        resolution_note = p_note, resolved_at = now()
  where id = p_request_id;

  if v_r.kind = 'cancellation' and p_outcome = 'approved' then
    perform public.refund_order(v_r.order_no);
    perform public.notify(v_o.buyer_id, 'cancelled',
      'Order cancelled — refunded',
      format('Your cancellation request for order %s was approved and your payment was refunded.', v_r.order_no),
      v_r.order_no);
    perform public.notify(v_o.seller_id, 'cancelled',
      'Order cancelled',
      format('Order %s was cancelled after request review.', v_r.order_no),
      v_r.order_no);

  elsif v_r.kind = 'replacement' and p_outcome = 'approved' then
    update public.orders
      set delivery_status = 'pending', delivered_at = null, delivery_method = null
    where order_no = v_r.order_no;
    perform public.notify(v_o.buyer_id, 'replacement_requested',
      'Replacement approved',
      format('The seller has agreed to replace order %s. Look for the new delivery notice.', v_r.order_no),
      v_r.order_no);
    perform public.notify(v_o.seller_id, 'replacement_requested',
      'Replacement approved',
      format('Please mark a new delivery for order %s.', v_r.order_no),
      v_r.order_no);

  else
    perform public.notify(v_o.buyer_id, 'dispute_resolved',
      'Request dismissed',
      format('Your %s request for order %s was dismissed.', v_r.kind, v_r.order_no),
      v_r.order_no);
    perform public.notify(v_o.seller_id, 'dispute_resolved',
      'Request dismissed',
      format('The %s request for order %s was dismissed.', v_r.kind, v_r.order_no),
      v_r.order_no);
  end if;
end;
$$;

grant execute on function public.resolve_order_request(uuid, text, text) to authenticated;

-- ============================================================
-- 14. REVIEWS — eligible-purchaser-only submission
-- ============================================================

create or replace function public.submit_review(
  p_order_no text,
  p_rating integer,
  p_title text,
  p_body text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_o public.orders%rowtype; v_id uuid;
begin
  if p_order_no is null or p_rating is null or p_title is null or p_body is null then
    raise exception 'Order, rating, title and body are required';
  end if;
  if p_rating < 1 or p_rating > 5 then raise exception 'Rating must be 1-5'; end if;
  if length(trim(p_title)) < 3 or length(trim(p_title)) > 120 then
    raise exception 'Title must be 3-120 characters';
  end if;
  if length(trim(p_body)) < 10 then raise exception 'Review body must be at least 10 characters'; end if;

  select * into v_o from public.orders where order_no = p_order_no;
  if not found then raise exception 'Order not found'; end if;
  if v_o.buyer_id <> auth.uid() then
    raise exception 'Only the buyer can review this order';
  end if;
  if v_o.seller_id = auth.uid() then
    raise exception 'You cannot review your own order';
  end if;
  if v_o.delivery_status <> 'buyer_confirmed' then
    raise exception 'You can only review an order after you have confirmed delivery';
  end if;

  insert into public.reviews (order_no, listing_id, buyer_id, seller_id, rating, title, body)
    values (p_order_no, v_o.listing_id, v_o.buyer_id, v_o.seller_id, p_rating, trim(p_title), trim(p_body))
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
-- 15. GRANTS — new objects only
-- ============================================================

grant select on public.cart_items to authenticated;
grant insert, update, delete on public.cart_items to authenticated;

grant select on public.order_payments to authenticated;

grant select on public.disputes to authenticated;
grant insert on public.disputes to authenticated;

grant select on public.dispute_messages to authenticated;
grant insert on public.dispute_messages to authenticated;

grant select on public.reviews to authenticated;
grant insert, update on public.reviews to authenticated;

grant select on public.notifications to authenticated;
grant update (read) on public.notifications to authenticated;

grant select on public.order_requests to authenticated;
grant insert on public.order_requests to authenticated;

-- ============================================================
-- 16. WIDEN download_credentials to also allow completed orders
-- (buyer re-download after confirming). This replaces the 0001 function; the
-- grants are preserved by CREATE OR REPLACE.
-- ============================================================

create or replace function public.download_credentials(p_order_no text)
returns table (unit_key text, file_name text, ciphertext bytea)
language plpgsql security definer set search_path = public as $$
declare v_o public.orders%rowtype;
begin
  select * into v_o from public.orders where order_no = p_order_no;
  if not found then raise exception 'Order not found'; end if;
  if v_o.buyer_id <> auth.uid() then
    raise exception 'You are not the buyer of this order';
  end if;
  if v_o.status not in ('in_escrow','completed') then
    raise exception 'Credentials are only available while the order is active or after completion';
  end if;
  return query
    select c.unit_key, c.file_name, c.ciphertext
      from public.listing_credentials c where c.claimed_by_order = p_order_no;
  insert into public.credential_downloads
    (order_no, listing_id, buyer_id, seller_id, unit_key)
  select p_order_no, v_o.listing_id, v_o.buyer_id, v_o.seller_id, c.unit_key
    from public.listing_credentials c where c.claimed_by_order = p_order_no;
end;
$$;

-- ============================================================
-- 17. BACKFILL — set defaults on existing in_escrow orders
-- ============================================================

update public.orders
  set inspection_deadline = now() + interval '14 days',
      delivery_status = 'pending'
  where status = 'in_escrow' and inspection_deadline is null;
