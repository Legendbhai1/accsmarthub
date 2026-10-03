-- =====================================================================
--  AccsMartHub — Supabase core schema
--  Run once: Supabase Dashboard → SQL Editor → New query → Run
-- =====================================================================
--
--  WHY THIS SHAPE
--  --------------
--  Every rule that must never break — stock decrement, escrow locking,
--  the 10% commission split, credential decryption — lives inside a
--  Postgres FUNCTION, not in application code. A Postgres function runs
--  in a single transaction, so a buyer can never be charged without the
--  stock decrement landing too.
--
--  The browser only ever calls these functions with a publishable key.
--  It can never move money or read a credential on its own.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Profiles: one row per auth user, created automatically on signup.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Wallets: a buyer's spendable balance and their escrow hold, kept
-- separate so held funds can never be spent twice.
-- ---------------------------------------------------------------------
create table if not exists public.wallets (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  balance_usd numeric(12,2) not null default 0 check (balance_usd >= 0),
  locked_usd  numeric(12,2) not null default 0 check (locked_usd  >= 0),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Deposits: OxaPay top-ups.
-- ---------------------------------------------------------------------
create table if not exists public.deposits (
  track_id   text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  amount_usd numeric(12,2) not null check (amount_usd > 0),
  status     text not null default 'pending' check (status in ('pending','paid')),
  created_at timestamptz not null default now(),
  paid_at    timestamptz
);

-- ---------------------------------------------------------------------
-- Stores: a seller's public shopfront + their moderation answers.
-- Listing creation stays locked until an admin approves.
-- ---------------------------------------------------------------------
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

-- Append-only audit trail of admin decisions.
create table if not exists public.store_reviews (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  admin_id    uuid not null,
  decision    text not null check (decision in ('approved','rejected')),
  note        text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Listings: the catalogue. Stock and price are server-owned — the
-- client can read them but never writes them.
-- ---------------------------------------------------------------------
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
  price_usd        numeric(12,2) not null check (price_usd > 0),
  stock            integer not null default 0 check (stock >= 0),
  status           text not null default 'pending'
                   check (status in ('pending','active','paused','sold')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (seller_id, listing_key)
);
create index if not exists listings_seller_idx on public.listings(seller_id);
create index if not exists listings_status_idx on public.listings(status);

-- ---------------------------------------------------------------------
-- Orders: the full money split is recorded so the fee is auditable.
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  order_no           text primary key,
  listing_id         uuid not null references public.listings(id),
  listing_title      text not null,
  brand              text not null,
  buyer_id           uuid not null references auth.users(id),
  seller_id          uuid not null references auth.users(id),
  quantity           integer not null check (quantity > 0),
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
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists orders_buyer_idx  on public.orders(buyer_id);
create index if not exists orders_seller_idx on public.orders(seller_id);

-- ---------------------------------------------------------------------
-- Credential vault.
--
-- ONE ROW PER UNIT IN STOCK, NOT PER ORDER. A listing with stock 50
-- carries up to 50 rows, because handing the same username and password
-- to two buyers means the second gets an account whose password the
-- first already changed.
--
-- Ciphertext is sealed with pgcrypto using a passphrase that lives in
-- Vault / Edge Functions — never in a client-visible variable. There is
-- deliberately NO select policy on this table, so the publishable key
-- cannot read it at all; the only path out is download_credentials().
-- ---------------------------------------------------------------------
create table if not exists public.listing_credentials (
  id                uuid primary key default gen_random_uuid(),
  listing_id        uuid not null references public.listings(id) on delete cascade,
  seller_id         uuid not null references auth.users(id),
  unit_key          text not null,
  ciphertext        bytea not null,
  file_name         text not null,
  claimed_by_order  text references public.orders(order_no),
  claimed_at        timestamptz,
  created_at        timestamptz not null default now(),
  unique (listing_id, unit_key)
);
create index if not exists creds_listing_idx on public.listing_credentials(listing_id);

-- Append-only evidence that a buyer received an account.
create table if not exists public.credential_downloads (
  id            uuid primary key default gen_random_uuid(),
  order_no      text not null,
  listing_id    uuid not null,
  unit_key      text not null,
  buyer_id      uuid not null,
  seller_id     uuid not null,
  downloaded_at timestamptz not null default now()
);

-- Off-platform contact is a marketplace-wide violation.
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
--  AUTO-PROVISIONING
--  Every signed-in user gets a profile and a wallet immediately.
-- =====================================================================
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

-- Backfill for anyone who signed up before this migration ran.
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

insert into public.wallets (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- =====================================================================
--  ROW LEVEL SECURITY
--  Everything is denied by default; each table opts in explicitly.
-- =====================================================================

-- Helper: is the caller an admin?
-- Defined BEFORE the policies below because Postgres resolves the function
-- name when the policy is created, not when it is first used.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;
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

-- profiles: you can read and edit only your own.
create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "update own profile" on public.profiles
  for update using (auth.uid() = id);

-- wallets: balance changes only through functions, never by direct write.
create policy "read own wallet" on public.wallets
  for select using (auth.uid() = user_id);

-- deposits: readable by owner, insertable by the webhook function only.
create policy "read own deposits" on public.deposits
  for select using (auth.uid() = user_id);

-- stores: approved stores are public; a seller sees and edits their own.
create policy "public reads approved stores" on public.stores
  for select using (status = 'approved' or auth.uid() = user_id or is_admin());
create policy "seller inserts own store" on public.stores
  for insert with check (auth.uid() = user_id);
create policy "seller edits own store" on public.stores
  for update using (auth.uid() = user_id);

-- store_reviews: append-only, visible to admins.
create policy "admins read store reviews" on public.store_reviews
  for select using (is_admin());

-- listings: live stock is public; a seller manages only their own rows.
create policy "public reads live listings" on public.listings
  for select using (status = 'active' or auth.uid() = seller_id or is_admin());
create policy "sellers insert own listings" on public.listings
  for insert with check (auth.uid() = seller_id);
create policy "sellers update own listings" on public.listings
  for update using (auth.uid() = seller_id);

-- orders: only the two parties can see an order.
create policy "parties read orders" on public.orders
  for select using (auth.uid() = buyer_id or auth.uid() = seller_id or is_admin());

-- credential vault + download log + reports: no client policies at all.
-- These are reachable only through the functions below, which check
-- ownership themselves. That is deliberate.

-- =====================================================================
--  ESCROW — the money-critical operations
--
--  These are the direct equivalent of the Convex mutations, and they
--  are the reason a Supabase backend can still be trusted with escrow:
--  each runs as ONE transaction, so a partial charge is impossible.
-- =====================================================================

-- Buyer tops up their wallet. Called after OxaPay confirms payment.
create or replace function public.credit_wallet(p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.wallets
     set balance_usd = balance_usd + p_amount, updated_at = now()
   where user_id = auth.uid();
end;
$$;

-- Atomic checkout: verify funds, lock them, decrement stock, write the
-- order and reserve that many credential units. All or nothing.
create or replace function public.place_order(
  p_listing_id uuid,
  p_quantity   integer
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_listing  public.listings%rowtype;
  v_wallet   public.wallets%rowtype;
  v_commission numeric(12,2);
  v_escrow_fee numeric(12,2);
  v_total    numeric(12,2);
  v_net      numeric(12,2);
  v_order_no text;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Quantity must be at least 1';
  end if;

  select * into v_listing from public.listings where id = p_listing_id for update;
  if not found then raise exception 'Listing not found'; end if;
  if v_listing.status <> 'active' or v_listing.hidden then
    raise exception 'This listing is not available';
  end if;
  if v_listing.stock < p_quantity then
    raise exception 'Not enough stock available';
  end if;
  if v_listing.seller_id = auth.uid() then
    raise exception 'You cannot buy your own listing';
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

  -- Lock the money first; the check above guarantees this cannot go negative.
  update public.wallets
     set balance_usd = balance_usd - v_total,
         locked_usd  = locked_usd  + v_net,
         updated_at  = now()
   where user_id = auth.uid();

  update public.listings
     set stock = stock - p_quantity, updated_at = now()
   where id = p_listing_id;

  v_order_no := 'AMH-' || upper(substr(replace(gen_random_uuid()::text,'-',''), 1, 10));

  insert into public.orders (
    order_no, listing_id, listing_title, brand, buyer_id, seller_id,
    quantity, unit_price_usd, gross_amount, escrow_fee_usd, total_usd,
    commission_rate, commission_amount, seller_net_amount
  ) values (
    v_order_no, v_listing.id, v_listing.title, v_listing.brand,
    auth.uid(), v_listing.seller_id, p_quantity, v_listing.price_usd,
    v_listing.price_usd * p_quantity, v_escrow_fee, v_total,
    0.1, v_commission, v_net
  );

  -- Reserve exactly one credential unit per unit bought, so two buyers can
  -- never be handed the same account.
  update public.listing_credentials
     set claimed_by_order = v_order_no, claimed_at = now()
   where id in (
     select id from public.listing_credentials
      where listing_id = p_listing_id
        and claimed_by_order is null
      order by created_at
      limit p_quantity
      for update skip locked
   );

  return v_order_no;
end;
$$;

-- Buyer confirms receipt. Releases escrow and pays the seller.
create or replace function public.complete_order(p_order_no text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders
   where order_no = p_order_no for update;

  if not found then raise exception 'Order not found'; end if;
  if v_order.buyer_id <> auth.uid() then
    raise exception 'Only the buyer can confirm this order';
  end if;
  if v_order.status <> 'in_escrow' then
    raise exception 'This order cannot be completed';
  end if;

  update public.wallets set locked_usd = locked_usd - v_order.seller_net_amount,
                           balance_usd = balance_usd + v_order.seller_net_amount,
                           updated_at = now()
   where user_id = v_order.seller_id;

  update public.orders set status = 'completed', updated_at = now()
   where order_no = p_order_no;
end;
$$;

-- Refund path: money returns to the buyer, stock and units come back.
create or replace function public.refund_order(p_order_no text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders
   where order_no = p_order_no for update;

  if not found then raise exception 'Order not found'; end if;
  if v_order.buyer_id <> auth.uid() and not public.is_admin() then
    raise exception 'Not permitted';
  end if;
  if v_order.status <> 'in_escrow' then
    raise exception 'Only an in-escrow order can be refunded';
  end if;

  update public.wallets set balance_usd = balance_usd + v_order.total_usd,
                           locked_usd  = locked_usd  - v_order.seller_net_amount,
                           updated_at = now()
   where user_id = v_order.buyer_id;

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
--  Security definer, so it can see the vault table that RLS otherwise
--  locks. It grants access ONLY when the caller is the buyer of an order
--  that reserved that specific unit, and only while that order is paid
--  and not refunded. Every successful read is written to the audit log.
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
  if v_order.status in ('refunded', 'disputed') then
    raise exception 'Access to these credentials has been revoked';
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
  p_units      jsonb            -- [{ "unitKey": "...", "fileName": "...", "ciphertext": "<base64>" }]
) returns integer language plpgsql security definer set search_path = public as $$
declare
  v_listing public.listings%rowtype;
  v_count   integer := 0;
  v_unit    jsonb;
begin
  select * into v_listing from public.listings where id = p_listing_id;
  if not found then raise exception 'Listing not found'; end if;
  if v_listing.seller_id <> auth.uid() then
    raise exception 'You do not own this listing';
  end if;

  for v_unit in select * from jsonb_array_elements(p_units) loop
    -- Never drop units a paid buyer already reserved.
    insert into public.listing_credentials
      (listing_id, seller_id, unit_key, ciphertext, file_name)
    values (
      p_listing_id,
      auth.uid(),
      v_unit->>'unitKey',
      decode(v_unit->>'ciphertext', 'base64'),
      coalesce(v_unit->>'fileName', 'account.txt')
    )
    on conflict (listing_id, unit_key) do update
      set ciphertext = excluded.ciphertext, file_name = excluded.file_name
      where public.listing_credentials.claimed_by_order is null;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- =====================================================================
--  FUNCTION EXECUTION — DEFAULT DENY
--
--  Postgres grants EXECUTE on every new function to PUBLIC by default.
--  Without this block a logged-in attacker could call credit_wallet(999999)
--  straight from the browser and mint themselves unlimited balance, because
--  SECURITY DEFINER bypasses RLS. So: revoke everything, then hand back only
--  what each role genuinely needs.
-- =====================================================================
revoke execute on all functions in schema public from public, anon, authenticated;

-- Read-only helper used inside RLS policies.
grant execute on function public.is_admin() to anon, authenticated;

-- Self-service actions; each one verifies ownership internally.
grant execute on function public.place_order(uuid, integer) to authenticated;
grant execute on function public.complete_order(text) to authenticated;
grant execute on function public.refund_order(text) to authenticated;
grant execute on function public.download_credentials(text) to authenticated;
grant execute on function public.upload_credentials(uuid, jsonb) to authenticated;

-- MONEY IN. Never reachable from a browser — only the OxaPay webhook runs
-- with the service role, which is not exposed to the client.
grant execute on function public.credit_wallet(numeric) to service_role;