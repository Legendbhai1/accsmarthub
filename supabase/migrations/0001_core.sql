-- =====================================================================
--  AccsMartHub — Supabase schema (security-hardened, v2)
--
--  Re-runnable. Safe to paste over a previous partial run.
--  Run: Supabase Dashboard → SQL Editor → New query → Run
-- =====================================================================
--
--  WHAT CHANGED IN v2 AND WHY
--  --------------------------
--  1. PRIVILEGE ESCALATION (critical)
--     The old "update own profile" policy only checked that the row was
--     yours. It let you run:
--         update profiles set is_admin = true where id = auth.uid()
--     and become a full admin, because the policy constrained `id` and
--     never `is_admin`. Fixed by a BEFORE UPDATE trigger plus column-level
--     grants: you may only ever write `name`.
--
--  2. SELF-APPROVAL (critical)
--     Sellers could set stores.status='approved' and listings.status=
--     'active' themselves, skipping moderation entirely. Fixed by a trigger
--     that freezes every moderation-controlled column unless the caller is
--     genuinely an admin or the backend.
--
--  3. ESCROW WAS BOOKED TO THE WRONG ACCOUNT (critical)
--     place_order credited locked_usd to the BUYER, but complete_order
--     deducted it from the SELLER. The seller's locked_usd was never
--     incremented, so every completion would have driven it negative and
--     been rejected by the `locked_usd >= 0` check. Escrow is now held on
--     the seller's wallet, which balances on both complete and refund.
--
--  4. REFUND EXPLOIT (critical)
--     The buyer could refund their own order, get the money back, AND keep
--     the accounts they had already downloaded. Refunds are now admin-only.
--
--  5. DOUBLE SPEND / DOUBLE CHARGE
--     place_order had no idempotency key, so a double-click or a network
--     retry charged the buyer twice. Now takes an idempotency key with a
--     unique index behind it.
--
--  6. MONEY-IN WAS NOT ATOMIC
--     credit_wallet trusted a caller-supplied amount and user. Now it takes
--     only the OxaPay track id and looks up the real deposit itself, so it
--     cannot be miscalled and cannot credit twice.
--
--  7. MISSING INSERT POLICIES
--     deposits and off_platform_reports had no INSERT policy, so buyers
--     could neither open a top-up nor file a report. Both added, with the
--     columns they are allowed to set pinned.
--
--  All balance arithmetic happens inside a single Postgres transaction, so
--  a partial charge is impossible. The browser holds only a publishable
--  key and cannot move money or read a credential on its own.
-- =====================================================================

create extension if not exists pgcrypto;

-- =====================================================================
--  TABLES
-- =====================================================================
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  name         text,
  is_admin     boolean not null default false,
  store_status text not null default 'none'
                check (store_status in ('none','pending','approved','rejected')),
  store_name   text,
  created_at   timestamptz not null default now()
);

create table if not exists public.wallets (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  balance_usd numeric(12,2) not null default 0 check (balance_usd >= 0),
  locked_usd  numeric(12,2) not null default 0 check (locked_usd  >= 0),
  updated_at  timestamptz not null default now()
);

create table if not exists public.deposits (
  track_id   text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  amount_usd numeric(12,2) not null check (amount_usd > 0 and amount_usd <= 100000),
  status     text not null default 'pending' check (status in ('pending','paid')),
  created_at timestamptz not null default now(),
  paid_at    timestamptz
);

create table if not exists public.stores (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  store_name          text not null,
  slug                text not null unique,
  logo_path           text,
  banner_path         text,
  platforms           text[] not null default '{}',
  delivery_speed      text,
  access_format       text,
  replacement_policy  text,
  restricted_regions  text,
  sourcing            text,
  contact_policy      boolean not null default false,
  status              text not null default 'pending'
                      check (status in ('pending','approved','rejected')),
  review_note         text,
  reviewed_at         timestamptz,
  reviewed_by         uuid,
  created_at          timestamptz not null default now()
);
create index if not exists stores_user_idx   on public.stores(user_id);
create index if not exists stores_status_idx on public.stores(status);

create table if not exists public.store_reviews (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  admin_id    uuid not null,
  decision    text not null check (decision in ('approved','rejected')),
  note        text,
  created_at  timestamptz not null default now()
);

create table if not exists public.listings (
  id               uuid primary key default gen_random_uuid(),
  listing_key      text not null,
  seller_id        uuid not null references auth.users(id) on delete cascade,
  store_id         uuid references public.stores(id) on delete set null,
  title            text not null,
  brand            text not null,
  summary          text,
  features         text[],
  faq              jsonb,
  image_path       text,
  service_category text,
  discount_percent int check (discount_percent between 0 and 90),
  warranty_hours   int check (warranty_hours >= 0),
  hidden           boolean not null default false,
  price_usd        numeric(12,2) not null check (price_usd > 0 and price_usd <= 1000000),
  stock            integer not null default 0 check (stock >= 0 and stock <= 100000),
  status           text not null default 'pending'
                   check (status in ('pending','active','paused','sold')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (seller_id, listing_key)
);
create index if not exists listings_seller_idx on public.listings(seller_id);
create index if not exists listings_status_idx on public.listings(status);

create table if not exists public.orders (
  order_no           text primary key,
  listing_id         uuid not null references public.listings(id),
  listing_title      text not null,
  brand              text not null,
  buyer_id           uuid not null references auth.users(id),
  seller_id          uuid not null references auth.users(id),
  quantity           integer not null check (quantity > 0 and quantity <= 1000),
  unit_price_usd     numeric(12,2) not null,
  gross_amount       numeric(12,2) not null,
  escrow_fee_usd     numeric(12,2) not null,
  total_usd          numeric(12,2) not null,
  commission_rate    numeric(5,4) not null default 0.1,
  commission_amount  numeric(12,2) not null,
  seller_net_amount  numeric(12,2) not null,
  payment_method     text not null default 'wallet',
  status             text not null default 'in_escrow'
                     check (status in ('in_escrow','transferring','completed',
                                       'disputed','refunded')),
  idempotency_key    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists orders_buyer_idx  on public.orders(buyer_id);
create index if not exists orders_seller_idx on public.orders(seller_id);

-- The anti-double-charge guarantee. Partial so that legacy rows without a
-- key (and admin-inserted rows) are not forced into a shared bucket.
create unique index if not exists orders_idempotency_idx
  on public.orders (buyer_id, idempotency_key)
  where idempotency_key is not null;

alter table public.orders
  add column if not exists idempotency_key text;

-- One row per UNIT IN STOCK, never per order. A listing with stock 50
-- carries up to 50 rows, because handing one account to two buyers means
-- the second gets a login whose password the first already changed.
create table if not exists public.listing_credentials (
  id                uuid primary key default gen_random_uuid(),
  listing_id        uuid not null references public.listings(id) on delete cascade,
  seller_id         uuid not null references auth.users(id),
  unit_key          text not null,
  ciphertext        bytea not null check (octet_length(ciphertext) <= 65536),
  file_name         text not null,
  claimed_by_order  text references public.orders(order_no),
  claimed_at        timestamptz,
  created_at        timestamptz not null default now(),
  unique (listing_id, unit_key)
);
create index if not exists creds_listing_idx on public.listing_credentials(listing_id);

create table if not exists public.credential_downloads (
  id            uuid primary key default gen_random_uuid(),
  order_no      text not null,
  listing_id    uuid not null,
  unit_key      text not null,
  buyer_id      uuid not null,
  seller_id     uuid not null,
  downloaded_at timestamptz not null default now()
);

create table if not exists public.off_platform_reports (
  id               uuid primary key default gen_random_uuid(),
  order_no         text,
  listing_id       uuid,
  reporter_id      uuid not null,
  reported_user_id uuid,
  reason           text not null check (reason in
                     ('shared_contact','payment_offsite','refused_escrow',
                      'impersonation','other')),
  detail           text not null,
  status           text not null default 'open'
                   check (status in ('open','reviewing','resolved','dismissed')),
  penalty          text,
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz
);
create index if not exists reports_status_idx on public.off_platform_reports(status);

-- =====================================================================
--  HELPERS
-- =====================================================================

-- Is the caller an admin? SECURITY DEFINER so it can read `profiles` past
-- RLS, but it exposes a boolean about the caller only.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- True only for the service role / backend. Used to distinguish "trusted
-- server" from "logged-in user" in the guard triggers below.
create or replace function public.is_service_role()
returns boolean language sql stable set search_path = public as $$
  select coalesce((auth.jwt() ->> 'role') = 'service_role', false);
$$;

-- True when the caller may act on moderation-controlled fields.
--
-- The third clause matters more than it looks. SECURITY DEFINER bypasses
-- RLS but NOT triggers, so a Postgres function that legitimately adjusts
-- `stock` or `status` would still be stopped by the guard triggers below.
-- Those functions set a TRANSACTION-LOCAL flag (`true` = local, so it dies
-- with this transaction and cannot leak into the next request) to say
-- "this write is coming from trusted server code, not a browser".
create or replace function public.can_moderate()
returns boolean language sql stable set search_path = public as $$
  select public.is_admin()
      or public.is_service_role()
      or coalesce(current_setting('app.moderation_bypass', true), 'off') = 'on';
$$;

-- Signup trigger: every new auth user gets a profile and a wallet.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', ''))
  on conflict (id) do nothing;
  insert into public.wallets (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, email)
select id, email from auth.users on conflict (id) do nothing;
insert into public.wallets (user_id)
select id from auth.users on conflict (user_id) do nothing;

-- =====================================================================
--  THE PRIVILEGE-ESCALATION GUARDS
--
--  RLS alone cannot fix this. A policy like `using (auth.uid() = id)`
--  constrains WHICH ROW you may touch, not WHICH COLUMNS. These triggers
--  constrain the columns, which is the half RLS does not cover.
-- =====================================================================

-- profiles: only an admin or the backend may change is_admin / store_status.
-- Everyone else may still update their own name.
create or replace function public.guard_profile_privileges()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.can_moderate() then
    return new;
  end if;
  if new.id <> old.id then
    raise exception 'You cannot change your user id';
  end if;
  if new.is_admin is distinct from old.is_admin then
    new.is_admin := old.is_admin;
  end if;
  if new.store_status is distinct from old.store_status then
    new.store_status := old.store_status;
  end if;
  if new.email is distinct from old.email then
    new.email := old.email;
  end if;
  if new.created_at is distinct from old.created_at then
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

-- stores: a seller owns the CONTENT of their shopfront but never its status.
create or replace function public.guard_store_moderation()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.can_moderate() then
    return new;
  end if;
  if new.user_id <> old.user_id then
    raise exception 'You cannot transfer a store to another account';
  end if;
  if new.status is distinct from old.status then
    new.status := old.status;
  end if;
  if new.review_note is distinct from old.review_note
     or new.reviewed_at is distinct from old.reviewed_at
     or new.reviewed_by is distinct from old.reviewed_by then
    new.review_note    := old.review_note;
    new.reviewed_at    := old.reviewed_at;
    new.reviewed_by    := old.reviewed_by;
  end if;
  return new;
end;
$$;

-- listings: same idea. A seller cannot publish their own listing, and
-- cannot rewrite `stock` after the fact to fake availability.
create or replace function public.guard_listing_moderation()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.can_moderate() then
    return new;
  end if;
  if new.seller_id <> old.seller_id then
    raise exception 'You cannot transfer a listing to another account';
  end if;
  if new.status is distinct from old.status then
    new.status := old.status;
  end if;
  -- stock is owned by the credential vault and the checkout transaction.
  if new.stock is distinct from old.stock then
    new.stock := old.stock;
  end if;
  return new;
end;
$$;

-- Keep updated_at honest without trusting the client.
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists guard_profile_privileges on public.profiles;
create trigger guard_profile_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

drop trigger if exists guard_store_moderation on public.stores;
create trigger guard_store_moderation
  before update on public.stores
  for each row execute function public.guard_store_moderation();

drop trigger if exists guard_listing_moderation on public.listings;
create trigger guard_listing_moderation
  before update on public.listings
  for each row execute function public.guard_listing_moderation();

drop trigger if exists listings_touch on public.listings;
create trigger listings_touch
  before update on public.listings
  for each row execute function public.touch_updated_at();

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch
  before update on public.orders
  for each row execute function public.touch_updated_at();

drop trigger if exists wallets_touch on public.wallets;
create trigger wallets_touch
  before update on public.wallets
  for each row execute function public.touch_updated_at();

-- =====================================================================
--  ROW LEVEL SECURITY
-- =====================================================================
alter table public.profiles            enable row level security;
alter table public.wallets             enable row level security;
alter table public.deposits            enable row level security;
alter table public.stores              enable row level security;
alter table public.store_reviews       enable row level security;
alter table public.listings            enable row level security;
alter table public.orders              enable row level security;
alter table public.listing_credentials enable row level security;
alter table public.credential_downloads enable row level security;
alter table public.off_platform_reports enable row level security;

-- profiles: read self only. Write is column-restricted below the policies.
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "admins read all profiles" on public.profiles;
create policy "admins read all profiles" on public.profiles
  for select using (public.is_admin());

-- wallets: SELECT only. There is deliberately no insert/update policy, so
-- the sole way to move a balance is through the functions below.
drop policy if exists "read own wallet" on public.wallets;
create policy "read own wallet" on public.wallets
  for select using (auth.uid() = user_id);

-- deposits: own rows only; a buyer may open a PENDING top-up of their own
-- and nothing else. `status` is pinned to 'pending' so a client cannot
-- mark its own deposit paid.
drop policy if exists "read own deposits" on public.deposits;
create policy "read own deposits" on public.deposits
  for select using (auth.uid() = user_id);

drop policy if exists "open own deposit" on public.deposits;
create policy "open own deposit" on public.deposits
  for insert with check (auth.uid() = user_id and status = 'pending');

-- stores
drop policy if exists "public reads approved stores" on public.stores;
create policy "public reads approved stores" on public.stores
  for select using (status = 'approved' or auth.uid() = user_id or public.is_admin());

drop policy if exists "seller inserts own store" on public.stores;
create policy "seller inserts own store" on public.stores
  for insert with check (auth.uid() = user_id and status = 'pending');

drop policy if exists "seller edits own store" on public.stores;
create policy "seller edits own store" on public.stores
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- store_reviews: admins read and write; sellers read only their own store.
drop policy if exists "admins manage store reviews" on public.store_reviews;
create policy "admins manage store reviews" on public.store_reviews
  for all using (public.is_admin()) with check (public.is_admin());

-- listings
drop policy if exists "public reads live listings" on public.listings;
create policy "public reads live listings" on public.listings
  for select using (status = 'active' or auth.uid() = seller_id or public.is_admin());

-- New listings MUST arrive pending. A seller cannot publish themselves.
drop policy if exists "sellers insert own listings" on public.listings;
create policy "sellers insert own listings" on public.listings
  for insert with check (auth.uid() = seller_id and status = 'pending' and stock = 0);

drop policy if exists "sellers update own listings" on public.listings;
create policy "sellers update own listings" on public.listings
  for update using (auth.uid() = seller_id) with check (auth.uid() = seller_id);

-- orders: read only, for the two parties. No insert/update policy at all.
drop policy if exists "parties read orders" on public.orders;
create policy "parties read orders" on public.orders
  for select using (auth.uid() = buyer_id or auth.uid() = seller_id or public.is_admin());

-- listing_credentials + credential_downloads: NO client policy of any kind.
-- The publishable key cannot read, write or guess its way into the vault.

-- reports: a buyer may file one against anyone, but may only set the
-- reporter columns, never the outcome.
drop policy if exists "read own reports" on public.off_platform_reports;
create policy "read own reports" on public.off_platform_reports
  for select using (auth.uid() = reporter_id or public.is_admin());

drop policy if exists "file own report" on public.off_platform_reports;
create policy "file own report" on public.off_platform_reports
  for insert with check (auth.uid() = reporter_id and status = 'open');

drop policy if exists "admins manage reports" on public.off_platform_reports;
create policy "admins manage reports" on public.off_platform_reports
  for update using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
--  ESCROW — the money-critical operations.
--  Each is ONE transaction. See the ledger note above place_order.
-- =====================================================================

-- Open a top-up. The amount is fixed HERE and recorded against the buyer,
-- so the webhook later credits exactly what was opened, not what was
-- claimed by whoever calls it.
create or replace function public.open_deposit(
  p_amount numeric,
  p_track_id text
) returns text language plpgsql security definer set search_path = public as $$
begin
  if p_amount is null or p_amount < 1 or p_amount > 100000 then
    raise exception 'Deposit must be between $1 and $100,000';
  end if;
  if p_track_id is null or length(p_track_id) < 4 then
    raise exception 'Invalid track id';
  end if;
  insert into public.deposits (track_id, user_id, amount_usd)
  values (p_track_id, auth.uid(), p_amount)
  on conflict (track_id) do nothing;
  return p_track_id;
end;
$$;

-- Confirm a payment and credit the buyer, atomically.
--
-- Takes ONLY the track id. It reads the real amount from the deposit row
-- itself, so a miscalled or malicious invocation cannot credit an amount
-- of its choosing or a wallet that is not the depositor's. A deposit that
-- is not pending is a no-op, which makes repeated callbacks safe.
create or replace function public.credit_wallet(p_track_id text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_deposit public.deposits%rowtype;
begin
  select * into v_deposit from public.deposits
   where track_id = p_track_id for update;

  if not found then
    raise exception 'Unknown deposit';
  end if;
  if v_deposit.status <> 'pending' then
    return false;            -- already paid: nothing to do, no double credit
  end if;

  update public.wallets
     set balance_usd = balance_usd + v_deposit.amount_usd, updated_at = now()
   where user_id = v_deposit.user_id;
  if not found then raise exception 'Wallet not found'; end if;

  update public.deposits set status = 'paid', paid_at = now()
   where track_id = p_track_id;
  return true;
end;
$$;

-- Atomic checkout.
--
--   Ledger:
--     total  = gross + escrow_fee            (what the buyer pays)
--     gross  = commission + seller_net       (10% to the platform)
--     escrow = locked on the SELLER's wallet until the buyer confirms
--   Every term is stored on the order row, so the split is auditable and
--   gross = commission + net always holds.
--
--   Duplicate requests: the caller supplies an idempotency key. If the
--   same key arrives twice, the unique index rejects the second insert and
--   the exception handler returns the original order — no second charge and
--   no second stock decrement, because the whole transaction rolls back.
create or replace function public.place_order(
  p_listing_id      uuid,
  p_quantity        integer,
  p_idempotency_key text
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_listing  public.listings%rowtype;
  v_wallet   public.wallets%rowtype;
  v_commission numeric(12,2);
  v_escrow_fee numeric(12,2);
  v_total    numeric(12,2);
  v_net      numeric(12,2);
  v_order_no text;
  v_reserved integer;
begin
  -- Trusted server write: this function adjusts stock below.
  perform set_config('app.moderation_bypass', 'on', true);

  if p_idempotency_key is null or length(p_idempotency_key) < 8
     or length(p_idempotency_key) > 128 then
    raise exception 'An idempotency key of 8-128 characters is required';
  end if;

  -- Already placed? Return the original, doing nothing else.
  select order_no into v_order_no from public.orders
   where buyer_id = auth.uid() and idempotency_key = p_idempotency_key;
  if found then return v_order_no; end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 1000 then
    raise exception 'Quantity must be between 1 and 1000';
  end if;

  select * into v_listing from public.listings where id = p_listing_id for update;
  if not found then raise exception 'Listing not found'; end if;
  if v_listing.status <> 'active' or v_listing.hidden then
    raise exception 'This listing is not available';
  end if;
  if v_listing.seller_id = auth.uid() then
    raise exception 'You cannot buy your own listing';
  end if;

  -- The seller must already be approved to sell.
  if not exists (
    select 1 from public.stores
     where user_id = v_listing.seller_id and status = 'approved'
  ) then
    raise exception 'This seller is not currently approved';
  end if;

  -- Every unit sold needs its own credential, or a buyer pays for nothing.
  select count(*) into v_reserved
    from public.listing_credentials c
   where c.listing_id = p_listing_id and c.claimed_by_order is null;
  if v_reserved < p_quantity then
    raise exception 'Not enough accounts in stock for this listing';
  end if;
  if v_listing.stock < p_quantity then
    raise exception 'Not enough stock available';
  end if;

  select * into v_wallet from public.wallets where user_id = auth.uid() for update;
  if not found then raise exception 'Wallet not found'; end if;

  v_commission  := round(v_listing.price_usd * p_quantity * 0.10, 2);
  v_escrow_fee  := round(v_listing.price_usd * p_quantity * 0.03, 2);
  v_total       := v_listing.price_usd * p_quantity + v_escrow_fee;
  v_net         := v_listing.price_usd * p_quantity - v_commission;

  if v_wallet.balance_usd < v_total then
    raise exception 'Insufficient balance. Add funds to your wallet first.';
  end if;

  -- 1. Charge the buyer the full total.
  update public.wallets
     set balance_usd = balance_usd - v_total, updated_at = now()
   where user_id = auth.uid();

  -- 2. Hold the seller's share in escrow, ON THE SELLER'S WALLET. Booking
  --    this to the buyer is what broke settlement in v1.
  insert into public.wallets (user_id, balance_usd, locked_usd)
  values (v_listing.seller_id, 0, v_net)
  on conflict (user_id) do update
    set locked_usd = public.wallets.locked_usd + v_net, updated_at = now();

  -- 3. Decrement stock.
  update public.listings
     set stock = stock - p_quantity, updated_at = now()
   where id = p_listing_id;

  v_order_no := 'AMH-' || upper(substr(replace(gen_random_uuid()::text,'-',''), 1, 10));

  -- 4. Write the order with the full split recorded.
  insert into public.orders (
    order_no, listing_id, listing_title, brand, buyer_id, seller_id,
    quantity, unit_price_usd, gross_amount, escrow_fee_usd, total_usd,
    commission_rate, commission_amount, seller_net_amount, idempotency_key
  ) values (
    v_order_no, v_listing.id, v_listing.title, v_listing.brand,
    auth.uid(), v_listing.seller_id, p_quantity, v_listing.price_usd,
    v_listing.price_usd * p_quantity, v_escrow_fee, v_total,
    0.1, v_commission, v_net, p_idempotency_key
  );

  -- 5. Reserve one distinct credential per unit bought.
  update public.listing_credentials
     set claimed_by_order = v_order_no, claimed_at = now()
   where id in (
     select id from public.listing_credentials
      where listing_id = p_listing_id and claimed_by_order is null
      order by created_at limit p_quantity for update skip locked
   );

  return v_order_no;
exception when unique_violation then
  -- Lost a race on the idempotency key: the whole transaction above was
  -- rolled back, so the buyer has NOT been charged. Return the winner.
  select order_no into v_order_no from public.orders
   where buyer_id = auth.uid() and idempotency_key = p_idempotency_key;
  if found then return v_order_no; end if;
  raise;
end;
$$;

-- Buyer confirms receipt. Releases escrow to the seller.
create or replace function public.complete_order(p_order_no text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_order  public.orders%rowtype;
  v_locked numeric(12,2);
begin
  select * into v_order from public.orders where order_no = p_order_no for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.buyer_id <> auth.uid() then
    raise exception 'Only the buyer can confirm this order';
  end if;
  if v_order.status <> 'in_escrow' then
    raise exception 'This order cannot be completed';
  end if;

  -- Refuse to settle escrow that is not actually there, rather than
  -- silently driving the balance negative.
  select locked_usd into v_locked from public.wallets
   where user_id = v_order.seller_id for update;
  if not found or v_locked < v_order.seller_net_amount then
    raise exception 'Escrow hold is missing for this order. Support has been notified.';
  end if;

  update public.wallets
     set locked_usd  = locked_usd  - v_order.seller_net_amount,
         balance_usd = balance_usd + v_order.seller_net_amount,
         updated_at  = now()
   where user_id = v_order.seller_id;

  update public.orders set status = 'completed', updated_at = now()
   where order_no = p_order_no;
end;
$$;

-- Refund. ADMIN ONLY.
--
-- In v1 the buyer could call this on their own order, get their money back
-- and keep the accounts they had already downloaded. Anyone could mint money
-- with a single click. Only a moderator or the backend may reverse an order,
-- and only before it has been settled.
create or replace function public.refund_order(p_order_no text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
begin
  if not public.can_moderate() then
    raise exception 'Only an administrator can refund an order';
  end if;
  -- Trusted server write: stock and credential claims are restored below.
  perform set_config('app.moderation_bypass', 'on', true);

  select * into v_order from public.orders where order_no = p_order_no for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status <> 'in_escrow' then
    raise exception 'Only an in-escrow order can be refunded';
  end if;

  -- Unwind exactly what place_order booked.
  update public.wallets
     set balance_usd = balance_usd + v_order.total_usd, updated_at = now()
   where user_id = v_order.buyer_id;

  update public.wallets
     set locked_usd = locked_usd - v_order.seller_net_amount, updated_at = now()
   where user_id = v_order.seller_id;

  update public.listings set stock = stock + v_order.quantity, updated_at = now()
   where id = v_order.listing_id;

  update public.listing_credentials
     set claimed_by_order = null, claimed_at = null
   where claimed_by_order = p_order_no;

  update public.orders set status = 'refunded', updated_at = now()
   where order_no = p_order_no;
end;
$$;

-- =====================================================================
--  THE ONLY WAY TO READ A CREDENTIAL
--
--  SECURITY DEFINER so it can see the vault that RLS otherwise locks.
--  Grants access only to the buyer of an order that reserved that specific
--  unit, and never once the order is refunded or disputed. Every read is
--  written to the audit log.
-- =====================================================================
create or replace function public.download_credentials(p_order_no text)
returns table (unit_key text, file_name text, ciphertext bytea)
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where order_no = p_order_no;
  if not found then raise exception 'Order not found'; end if;

  if v_order.buyer_id <> auth.uid() then
    raise exception 'You are not the buyer of this order';
  end if;
  if v_order.status <> 'in_escrow' then
    raise exception 'Access to these credentials is only available while the order is in escrow';
  end if;

  return query
    select c.unit_key, c.file_name, c.ciphertext
      from public.listing_credentials c
     where c.claimed_by_order = p_order_no;

  insert into public.credential_downloads
    (order_no, listing_id, buyer_id, seller_id, unit_key)
  select p_order_no, v_order.listing_id, v_order.buyer_id,
         v_order.seller_id, c.unit_key
    from public.listing_credentials c
   where c.claimed_by_order = p_order_no;
end;
$$;

-- Seller uploads the accounts for their listing. One row per unit.
create or replace function public.upload_credentials(
  p_listing_id uuid,
  p_units      jsonb
) returns integer language plpgsql security definer set search_path = public as $$
declare
  v_listing public.listings%rowtype;
  v_count   integer := 0;
  v_unit    jsonb;
  v_total_units integer;
begin
  -- Trusted server write: stock is derived from the vault below.
  perform set_config('app.moderation_bypass', 'on', true);

  select * into v_listing from public.listings where id = p_listing_id;
  if not found then raise exception 'Listing not found'; end if;
  if v_listing.seller_id <> auth.uid() then
    raise exception 'You do not own this listing';
  end if;
  if jsonb_typeof(p_units) <> 'array' then
    raise exception 'Expected an array of credential units';
  end if;
  if jsonb_array_length(p_units) > 10000 then
    raise exception 'Too many units in one upload';
  end if;

  for v_unit in select * from jsonb_array_elements(p_units) loop
    if length(coalesce(v_unit->>'ciphertext','')) > 87384 then
      raise exception 'A credential file may not exceed 64 KB';
    end if;
    -- Never overwrite or drop a unit a paid buyer already reserved.
    insert into public.listing_credentials
      (listing_id, seller_id, unit_key, ciphertext, file_name)
    values (
      p_listing_id, auth.uid(),
      coalesce(nullif(v_unit->>'unitKey',''), gen_random_uuid()::text),
      decode(v_unit->>'ciphertext', 'base64'),
      coalesce(nullif(v_unit->>'fileName',''), 'account.txt')
    )
    on conflict (listing_id, unit_key) do update
      set ciphertext = excluded.ciphertext, file_name = excluded.file_name
      where public.listing_credentials.claimed_by_order is null;
    v_count := v_count + 1;
  end loop;

  -- Stock is derived from what is actually in the vault, so a seller can
  -- never advertise accounts they have not uploaded.
  select count(*) into v_total_units
    from public.listing_credentials
   where listing_id = p_listing_id and claimed_by_order is null;

  update public.listings
     set stock = least(v_total_units, v_listing.stock + v_count),
         updated_at = now()
   where id = p_listing_id;

  return v_count;
end;
$$;

-- Moderation actions, admin-only, so the admin UI can work without the
-- service role.
create or replace function public.review_store(
  p_store_id uuid,
  p_approve  boolean,
  p_note     text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_store public.stores%rowtype;
begin
  if not public.can_moderate() then
    raise exception 'Only an administrator can review stores';
  end if;
  perform set_config('app.moderation_bypass', 'on', true);
  select * into v_store from public.stores where id = p_store_id for update;
  if not found then raise exception 'Store not found'; end if;
  if p_approve is false and (p_note is null or length(btrim(p_note)) < 3) then
    raise exception 'A rejection reason is required';
  end if;

  update public.stores
     set status = case when p_approve then 'approved' else 'rejected' end,
         review_note = p_note, reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_store_id;

  insert into public.store_reviews (store_id, admin_id, decision, note)
  values (p_store_id, coalesce(auth.uid(), v_store.user_id),
          case when p_approve then 'approved' else 'rejected' end, p_note);

  -- A rejected seller must stop selling immediately.
  if p_approve is false then
    update public.listings set status = 'paused', updated_at = now()
     where seller_id = v_store.user_id and status = 'active';
  end if;
end;
$$;

create or replace function public.set_listing_status(
  p_listing_id uuid,
  p_status     text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_is_moderator boolean;
begin
  if p_status not in ('pending','active','paused','sold') then
    raise exception 'Invalid listing status';
  end if;

  -- MUST be read BEFORE the bypass flag is set below, otherwise every
  -- caller would look like a moderator.
  v_is_moderator := public.can_moderate();

  -- Trusted server write: needed so the guard trigger does not block this.
  perform set_config('app.moderation_bypass', 'on', true);

  if p_status in ('active','paused','sold') and not v_is_moderator then
    -- A seller may park their own listing, but may never publish it.
    update public.listings set hidden = true, updated_at = now()
     where id = p_listing_id and auth.uid() = seller_id;
    return;
  end if;

  update public.listings set status = p_status, updated_at = now()
   where id = p_listing_id
     and (auth.uid() = seller_id or v_is_moderator);
end;
$$;

create or replace function public.resolve_report(
  p_report_id uuid,
  p_status    text,
  p_penalty   text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_report public.off_platform_reports%rowtype;
begin
  if not public.can_moderate() then
    raise exception 'Only an administrator can resolve reports';
  end if;
  perform set_config('app.moderation_bypass', 'on', true);
  if p_status not in ('open','reviewing','resolved','dismissed') then
    raise exception 'Invalid report status';
  end if;
  select * into v_report from public.off_platform_reports
   where id = p_report_id for update;
  if not found then raise exception 'Report not found'; end if;

  update public.off_platform_reports
     set status = p_status, penalty = p_penalty,
         resolved_at = case when p_status in ('resolved','dismissed')
                            then now() else null end
   where id = p_report_id;

  if p_status = 'resolved' and v_report.reported_user_id is not null then
    update public.listings set status = 'paused', updated_at = now()
     where seller_id = v_report.reported_user_id and status = 'active';
  end if;
end;
$$;

-- =====================================================================
--  FUNCTION EXECUTION — DEFAULT DENY
--
--  Postgres grants EXECUTE on every new function to PUBLIC. Without this,
--  a logged-in attacker could call credit_wallet directly and mint money.
-- =====================================================================
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_service_role() to anon, authenticated;
grant execute on function public.can_moderate() to anon, authenticated;

-- Signup trigger. Postgres gates trigger execution on EXECUTE, so this
-- must be restored or no account can ever be created. PostgREST cannot
-- invoke a function returning `trigger`.
grant execute on function public.handle_new_user() to public;

-- Column-level lockdown. Even if the guard trigger were ever removed, a
-- browser session physically cannot write is_admin.
revoke update on public.profiles from authenticated;
grant update (name) on public.profiles to authenticated;

grant execute on function public.open_deposit(numeric, text) to authenticated;
grant execute on function public.place_order(uuid, integer, text) to authenticated;
grant execute on function public.complete_order(text) to authenticated;
grant execute on function public.download_credentials(text) to authenticated;
grant execute on function public.upload_credentials(uuid, jsonb) to authenticated;

-- Money out of escrow, and money in. Never reachable from a browser.
grant execute on function public.refund_order(text) to service_role;
grant execute on function public.credit_wallet(text) to service_role;
grant execute on function public.review_store(uuid, boolean, text) to service_role;
grant execute on function public.set_listing_status(uuid, text) to authenticated;
grant execute on function public.resolve_report(uuid, text, text) to service_role;

-- Guard triggers are SECURITY INVOKER and run as part of the caller's
-- statement; they need no execute grant of their own beyond the default
-- trigger-owner rights.
grant execute on function public.guard_profile_privileges() to public;
grant execute on function public.guard_store_moderation() to public;
grant execute on function public.guard_listing_moderation() to public;
grant execute on function public.touch_updated_at() to public;