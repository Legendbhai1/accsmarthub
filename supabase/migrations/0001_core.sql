-- =====================================================================
-- AccsMartHub — Supabase schema v3
-- Run parts 1-4 in order, each in the SQL Editor. Safe to re-run.
-- =====================================================================
-- PART 1/4 — TABLES
-- =====================================================================

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  is_admin boolean not null default false,
  store_status text not null default 'none'
    check (store_status in ('none','pending','approved','rejected')),
  store_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance_usd numeric(12,2) not null default 0 check (balance_usd >= 0),
  locked_usd numeric(12,2) not null default 0 check (locked_usd >= 0),
  updated_at timestamptz not null default now()
);

-- Append-only. Every balance change writes exactly one row here, so the
-- wallet is reconstructible and any mismatch is provable.
create table if not exists public.wallet_ledger (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in
    ('deposit','purchase','escrow_hold','escrow_release','refund','adjustment')),
  balance_delta numeric(12,2) not null default 0,
  locked_delta numeric(12,2) not null default 0,
  balance_after numeric(12,2) not null,
  locked_after numeric(12,2) not null,
  order_no text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists ledger_user_idx on public.wallet_ledger(user_id, created_at desc);

create table if not exists public.deposits (
  track_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_usd numeric(12,2) not null check (amount_usd > 0 and amount_usd <= 100000),
  currency text not null default 'USD' check (currency = 'USD'),
  provider text not null default 'oxapay',
  provider_amount numeric(12,2),
  status text not null default 'pending' check (status in ('pending','paid','mismatch')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists deposits_user_idx on public.deposits(user_id);

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_name text not null,
  slug text not null unique,
  logo_path text, banner_path text,
  platforms text[] not null default '{}',
  delivery_speed text, access_format text, replacement_policy text,
  restricted_regions text, sourcing text,
  contact_policy boolean not null default false,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_note text, reviewed_at timestamptz, reviewed_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists stores_user_idx on public.stores(user_id);
create index if not exists stores_status_idx on public.stores(status);

create table if not exists public.store_reviews (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  admin_id uuid not null,
  decision text not null check (decision in ('approved','rejected')),
  note text, created_at timestamptz not null default now()
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  listing_key text not null,
  seller_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  title text not null, brand text not null, summary text,
  features text[], faq jsonb, image_path text, service_category text,
  discount_percent int check (discount_percent between 0 and 90),
  warranty_hours int check (warranty_hours >= 0),
  hidden boolean not null default false,
  price_usd numeric(12,2) not null check (price_usd > 0 and price_usd <= 1000000),
  stock integer not null default 0 check (stock >= 0 and stock <= 100000),
  status text not null default 'pending'
    check (status in ('pending','active','paused','sold')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seller_id, listing_key)
);
create index if not exists listings_seller_idx on public.listings(seller_id);
create index if not exists listings_status_idx on public.listings(status);

create table if not exists public.orders (
  order_no text primary key,
  listing_id uuid not null references public.listings(id),
  listing_title text not null, brand text not null,
  buyer_id uuid not null references auth.users(id),
  seller_id uuid not null references auth.users(id),
  quantity integer not null check (quantity > 0 and quantity <= 1000),
  unit_price_usd numeric(12,2) not null,
  gross_amount numeric(12,2) not null,
  escrow_fee_usd numeric(12,2) not null,
  total_usd numeric(12,2) not null,
  commission_rate numeric(5,4) not null default 0.1,
  commission_amount numeric(12,2) not null,
  seller_net_amount numeric(12,2) not null,
  payment_method text not null default 'wallet',
  status text not null default 'in_escrow'
    check (status in ('in_escrow','completed','disputed','refunded','expired')),
  idempotency_key text,
  escrow_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_buyer_idx on public.orders(buyer_id);
create index if not exists orders_seller_idx on public.orders(seller_id);
create index if not exists orders_escrow_idx on public.orders(status, escrow_expires_at);

alter table public.orders add column if not exists idempotency_key text;
alter table public.orders add column if not exists escrow_expires_at timestamptz;
create unique index if not exists orders_idem_idx
  on public.orders (buyer_id, idempotency_key) where idempotency_key is not null;

create table if not exists public.listing_credentials (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  seller_id uuid not null references auth.users(id),
  unit_key text not null,
  ciphertext bytea not null check (octet_length(ciphertext) <= 65536),
  file_name text not null,
  claimed_by_order text references public.orders(order_no),
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (listing_id, unit_key)
);
create index if not exists creds_listing_idx on public.listing_credentials(listing_id);

create table if not exists public.credential_downloads (
  id uuid primary key default gen_random_uuid(),
  order_no text not null, listing_id uuid not null, unit_key text not null,
  buyer_id uuid not null, seller_id uuid not null,
  downloaded_at timestamptz not null default now()
);
create index if not exists cred_dl_order_idx on public.credential_downloads(order_no);

create table if not exists public.off_platform_reports (
  id uuid primary key default gen_random_uuid(),
  order_no text, listing_id uuid,
  reporter_id uuid not null, reported_user_id uuid,
  reason text not null check (reason in
    ('shared_contact','payment_offsite','refused_escrow','impersonation','other')),
  detail text not null,
  status text not null default 'open'
    check (status in ('open','reviewing','resolved','dismissed')),
  penalty text, created_at timestamptz not null default now(), resolved_at timestamptz
);
create index if not exists reports_status_idx on public.off_platform_reports(status);

-- =====================================================================
-- PART 2/4 — TRUST PREDICATES + GUARD TRIGGERS
-- =====================================================================

-- Is the caller a real admin? Reads past RLS but exposes one boolean.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_service_role()
returns boolean language sql stable set search_path = public as $$
  select coalesce((auth.jwt() ->> 'role') = 'service_role', false);
$$;

-- AUTHORISATION: may this caller perform a moderator action?
-- Deliberately does NOT include the trusted-write flag. In v2 a single
-- predicate did both jobs, so anything that could set the flag could also
-- be read as "is a moderator".
create or replace function public.can_moderate()
returns boolean language sql stable set search_path = public as $$
  select public.is_admin() or public.is_service_role();
$$;

-- FIELD GUARDING: is this write coming from trusted server code?
-- SECURITY DEFINER bypasses RLS but NOT triggers, so server functions that
-- legitimately move `stock` or `status` need a way past the guard triggers.
-- The flag is set with is_local=true, so it dies with the transaction and
-- cannot leak into the next request. The third clause lets a SQL Editor
-- session (which runs as the table owner, not anon/authenticated) through,
-- which is what makes admin bootstrap possible at all.
create or replace function public.is_trusted_write()
returns boolean language sql stable set search_path = public as $$
  select public.can_moderate()
      or current_user not in ('anon','authenticated')
      or coalesce(current_setting('app.trusted_write', true), 'off') = 'on';
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name',''))
  on conflict (id) do nothing;
  insert into public.wallets (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- The one and only path that writes a balance. Records the resulting
-- balances in wallet_ledger so the wallet is always reconstructible.
create or replace function public.apply_wallet(
  p_user uuid, p_balance_delta numeric, p_locked_delta numeric,
  p_kind text, p_order_no text, p_note text
) returns void language plpgsql security definer set search_path = public as $$
declare v_balance numeric(12,2); v_locked numeric(12,2);
begin
  insert into public.wallets (user_id, balance_usd, locked_usd)
  values (p_user, 0, 0) on conflict (user_id) do nothing;

  update public.wallets
     set balance_usd = balance_usd + p_balance_delta,
         locked_usd  = locked_usd  + p_locked_delta,
         updated_at  = now()
   where user_id = p_user
   returning balance_usd, locked_usd into v_balance, v_locked;
  -- A negative result trips the table CHECK, which aborts the whole
  -- transaction. No wallet can ever go negative.

  insert into public.wallet_ledger
    (user_id, kind, balance_delta, locked_delta, balance_after, locked_after, order_no, note)
  values (p_user, p_kind, p_balance_delta, p_locked_delta, v_balance, v_locked, p_order_no, p_note);
end;
$$;

create or replace function public.guard_profile_privileges()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_trusted_write() then return new; end if;
  if new.id <> old.id then raise exception 'You cannot change your user id'; end if;
  if new.is_admin is distinct from old.is_admin then new.is_admin := old.is_admin; end if;
  if new.store_status is distinct from old.store_status then new.store_status := old.store_status; end if;
  if new.email is distinct from old.email then new.email := old.email; end if;
  if new.created_at is distinct from old.created_at then new.created_at := old.created_at; end if;
  return new;
end;
$$;

create or replace function public.guard_store_moderation()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_trusted_write() then return new; end if;
  if new.user_id <> old.user_id then raise exception 'Cannot transfer a store'; end if;
  if new.status is distinct from old.status then new.status := old.status; end if;
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

create or replace function public.guard_listing_moderation()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_trusted_write() then return new; end if;
  if new.seller_id <> old.seller_id then raise exception 'Cannot transfer a listing'; end if;
  if new.status is distinct from old.status then new.status := old.status; end if;
  if new.stock is distinct from old.stock then new.stock := old.stock; end if;
  return new;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
drop trigger if exists guard_profile_privileges on public.profiles;
create trigger guard_profile_privileges before update on public.profiles
  for each row execute function public.guard_profile_privileges();
drop trigger if exists guard_store_moderation on public.stores;
create trigger guard_store_moderation before update on public.stores
  for each row execute function public.guard_store_moderation();
drop trigger if exists guard_listing_moderation on public.listings;
create trigger guard_listing_moderation before update on public.listings
  for each row execute function public.guard_listing_moderation();
drop trigger if exists listings_touch on public.listings;
create trigger listings_touch before update on public.listings
  for each row execute function public.touch_updated_at();
drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

insert into public.profiles (id, email) select id, email from auth.users
  on conflict (id) do nothing;
insert into public.wallets (user_id) select id from auth.users
  on conflict (user_id) do nothing;

-- =====================================================================
-- PART 3/4 — ROW LEVEL SECURITY
-- =====================================================================

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.deposits enable row level security;
alter table public.stores enable row level security;
alter table public.store_reviews enable row level security;
alter table public.listings enable row level security;
alter table public.orders enable row level security;
alter table public.listing_credentials enable row level security;
alter table public.credential_downloads enable row level security;
alter table public.off_platform_reports enable row level security;

-- RLS restricts ROWS. It never restricts COLUMNS, so the write column
-- grant at the end of part 4 is what actually stops a user promoting
-- themselves. Both are required.
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for select
  using (auth.uid() = id or public.is_admin());
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- wallets: read only. No insert/update policy exists at all.
drop policy if exists "own wallet" on public.wallets;
create policy "own wallet" on public.wallets for select
  using (auth.uid() = user_id or public.is_admin());

-- ledger: read only, never modified from the client.
drop policy if exists "own ledger" on public.wallet_ledger;
create policy "own ledger" on public.wallet_ledger for select
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "own deposits" on public.deposits;
create policy "own deposits" on public.deposits for select
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "read stores" on public.stores;
create policy "read stores" on public.stores for select
  using (status = 'approved' or auth.uid() = user_id or public.is_admin());
drop policy if exists "insert own store" on public.stores;
create policy "insert own store" on public.stores for insert
  with check (auth.uid() = user_id and status = 'pending' and contact_policy);
drop policy if exists "update own store" on public.stores;
create policy "update own store" on public.stores for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "admins manage store reviews" on public.store_reviews;
create policy "admins manage store reviews" on public.store_reviews for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read listings" on public.listings;
create policy "read listings" on public.listings for select
  using (status = 'active' or auth.uid() = seller_id or public.is_admin());
-- New listings must arrive pending, unstocked, and attached to an
-- approved store: a seller cannot self-publish or fake availability.
drop policy if exists "insert own listing" on public.listings;
create policy "insert own listing" on public.listings for insert
  with check (
    auth.uid() = seller_id and status = 'pending' and stock = 0
    and exists (select 1 from public.stores
                 where user_id = auth.uid() and status = 'approved')
  );
drop policy if exists "update own listing" on public.listings;
create policy "update own listing" on public.listings for update
  using (auth.uid() = seller_id) with check (auth.uid() = seller_id);

drop policy if exists "parties read orders" on public.orders;
create policy "parties read orders" on public.orders for select
  using (auth.uid() = buyer_id or auth.uid() = seller_id or public.is_admin());

-- listing_credentials, credential_downloads, wallet_ledger writes:
-- NO client policy of any kind. Unreachable with the publishable key.

drop policy if exists "read own reports" on public.off_platform_reports;
create policy "read own reports" on public.off_platform_reports for select
  using (auth.uid() = reporter_id or public.is_admin());
drop policy if exists "file report" on public.off_platform_reports;
create policy "file report" on public.off_platform_reports for insert
  with check (auth.uid() = reporter_id and status = 'open');
drop policy if exists "admins manage reports" on public.off_platform_reports;
create policy "admins manage reports" on public.off_platform_reports for update
  using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- PART 4/4 — BUSINESS FUNCTIONS + GRANTS
-- =====================================================================

create or replace function public.open_deposit(p_amount numeric, p_track_id text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if p_amount is null or p_amount < 1 or p_amount > 10000 then
    raise exception 'Deposit must be between $1 and $10,000';
  end if;
  if p_track_id is null or length(p_track_id) < 4 then
    raise exception 'Invalid track id';
  end if;
  insert into public.deposits (track_id, user_id, amount_usd)
  values (p_track_id, auth.uid(), p_amount)
  on conflict (track_id) do update set user_id = excluded.user_id
    where public.deposits.user_id = auth.uid() and public.deposits.status = 'pending';
  return p_track_id;
end;
$$;

-- Confirm a payment. ONLY the trusted server may run this.
--
-- Fixes in v3: it verifies the amount the PROVIDER actually reported
-- against the amount the buyer opened, so a provider callback for the
-- wrong sum can never credit the wrong figure; it refuses to credit a
-- deposit that does not exist rather than 500-ing into an infinite retry
-- loop; and a non-pending deposit returns false so a replayed callback is
-- a no-op instead of a double credit.
create or replace function public.confirm_deposit(
  p_track_id text,
  p_provider_amount numeric,
  p_currency text,
  p_paid_at timestamptz
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_d public.deposits%rowtype;
begin
  if not public.is_trusted_write() then
    raise exception 'Payment confirmation is server-only';
  end if;

  select * into v_d from public.deposits where track_id = p_track_id for update;
  if not found then
    -- Unknown track id: acknowledge so the provider stops retrying, but
    -- credit nobody.
    return false;
  end if;
  if v_d.status = 'paid' then return false; end if;      -- replayed callback

  if upper(coalesce(p_currency,'USD')) <> 'USD' then
    update public.deposits set status = 'mismatch' where track_id = p_track_id;
    raise exception 'Unsupported currency %', p_currency;
  end if;
  if p_provider_amount is null
     or abs(p_provider_amount - v_d.amount_usd) > 0.009 then
    update public.deposits
       set status = 'mismatch', provider_amount = p_provider_amount
     where track_id = p_track_id;
    raise exception 'Amount mismatch: provider reported %, expected %',
      p_provider_amount, v_d.amount_usd;
  end if;

  perform public.apply_wallet(v_d.user_id, v_d.amount_usd, 0,
                              'deposit', null, 'OxaPay ' || p_track_id);
  update public.deposits
     set status = 'paid', provider_amount = p_provider_amount, paid_at = p_paid_at
   where track_id = p_track_id;
  return true;
end;
$$;

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

create or replace function public.complete_order(p_order_no text)
returns void language plpgsql security definer set search_path = public as $$
declare v_o public.orders%rowtype; v_locked numeric(12,2);
begin
  select * into v_o from public.orders where order_no = p_order_no for update;
  if not found then raise exception 'Order not found'; end if;
  if v_o.buyer_id <> auth.uid() then
    raise exception 'Only the buyer can confirm this order';
  end if;
  if v_o.status <> 'in_escrow' then raise exception 'Order cannot be completed'; end if;

  select locked_usd into v_locked from public.wallets
   where user_id = v_o.seller_id for update;
  if not found or v_locked < v_o.seller_net_amount then
    raise exception 'Escrow hold is missing for this order. Support has been notified.';
  end if;

  perform public.apply_wallet(v_o.seller_id, v_o.seller_net_amount,
                              -v_o.seller_net_amount, 'escrow_release', p_order_no, null);
  update public.orders set status = 'completed' where order_no = p_order_no;
end;
$$;

-- Admin-only. A buyer must never be able to reverse their own purchase,
-- or they keep the accounts and get the money back.
create or replace function public.refund_order(p_order_no text)
returns void language plpgsql security definer set search_path = public as $$
declare v_o public.orders%rowtype;
begin
  if not public.can_moderate() then
    raise exception 'Only an administrator can refund an order';
  end if;
  select * into v_o from public.orders where order_no = p_order_no for update;
  if not found then raise exception 'Order not found'; end if;
  if v_o.status <> 'in_escrow' then raise exception 'Only an in-escrow order can be refunded'; end if;

  perform set_config('app.trusted_write','on',true);
  perform public.apply_wallet(v_o.buyer_id, v_o.total_usd, 0, 'refund', p_order_no, null);
  perform public.apply_wallet(v_o.seller_id, 0, -v_o.seller_net_amount,
                              'refund', p_order_no, null);
  update public.listings set stock = stock + v_o.quantity where id = v_o.listing_id;
  update public.listing_credentials
     set claimed_by_order = null, claimed_at = null where claimed_by_order = p_order_no;
  update public.orders set status = 'refunded' where order_no = p_order_no;
end;
$$;

-- Sweeper: releases escrow that the buyer never confirmed, so funds cannot
-- be held hostage forever. Run from cron or the Supabase scheduler.
create or replace function public.release_expired_escrow(p_limit integer)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  if not public.is_trusted_write() then raise exception 'Server-only'; end if;
  for r in
    select order_no, buyer_id, seller_id, seller_net_amount
      from public.orders
     where status = 'in_escrow' and escrow_expires_at < now()
     order by escrow_expires_at
     limit coalesce(p_limit, 100)
     for update skip locked
  loop
    perform set_config('app.trusted_write','on',true);
    perform public.apply_wallet(r.seller_id, r.seller_net_amount, -r.seller_net_amount,
                                'escrow_release', r.order_no, 'auto-released after 14 days');
    update public.orders set status = 'expired' where order_no = r.order_no;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Only while in escrow: after refund/expiry the units are unclaimed again.
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
  if v_o.status <> 'in_escrow' then
    raise exception 'Access to these credentials is only available while the order is in escrow';
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

create or replace function public.upload_credentials(p_listing_id uuid, p_units jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare v_l public.listings%rowtype; v_n integer := 0; v_u jsonb; v_free integer;
begin
  select * into v_l from public.listings where id = p_listing_id;
  if not found then raise exception 'Listing not found'; end if;
  if v_l.seller_id <> auth.uid() then raise exception 'You do not own this listing'; end if;
  if jsonb_typeof(p_units) <> 'array' then raise exception 'Expected an array'; end if;
  if jsonb_array_length(p_units) > 10000 then raise exception 'Too many units'; end if;

  perform set_config('app.trusted_write','on',true);
  for v_u in select * from jsonb_array_elements(p_units) loop
    if length(coalesce(v_u->>'ciphertext','')) > 87384 then
      raise exception 'A credential file may not exceed 64 KB';
    end if;
    insert into public.listing_credentials
      (listing_id, seller_id, unit_key, ciphertext, file_name)
    values (p_listing_id, auth.uid(),
            coalesce(nullif(v_u->>'unitKey',''), gen_random_uuid()::text),
            decode(v_u->>'ciphertext','base64'),
            coalesce(nullif(v_u->>'fileName',''),'account.txt'))
    on conflict (listing_id, unit_key) do update
      set ciphertext = excluded.ciphertext, file_name = excluded.file_name
      where public.listing_credentials.claimed_by_order is null;
    v_n := v_n + 1;
  end loop;

  select count(*) into v_free from public.listing_credentials
   where listing_id = p_listing_id and claimed_by_order is null;
  update public.listings set stock = v_free where id = p_listing_id;
  return v_n;
end;
$$;

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
end;
$$;

create or replace function public.set_listing_status(p_listing_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_mod boolean;
begin
  if p_status not in ('pending','active','paused','sold') then
    raise exception 'Invalid listing status';
  end if;
  -- Read BEFORE the trusted-write flag is set, or every caller would
  -- appear to be a moderator.
  v_mod := public.can_moderate();
  perform set_config('app.trusted_write','on',true);
  if not v_mod then
    update public.listings set hidden = true where id = p_listing_id and auth.uid() = seller_id;
    return;
  end if;
  update public.listings set status = p_status where id = p_listing_id;
end;
$$;

create or replace function public.resolve_report(p_report_id uuid, p_status text, p_penalty text)
returns void language plpgsql security definer set search_path = public as $$
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
  if p_status = 'resolved' and v_r.reported_user_id is not null then
    update public.listings set status = 'paused'
     where seller_id = v_r.reported_user_id and status = 'active';
  end if;
end;
$$;

-- ---------- GRANTS: default deny, then the minimum each role needs --------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_service_role() to anon, authenticated;
grant execute on function public.can_moderate() to anon, authenticated;
-- The guard triggers are SECURITY INVOKER, so they run as the client and
-- need this. Without the grant, every profile/store/listing update errors.
grant execute on function public.is_trusted_write() to anon, authenticated;
-- apply_wallet is deliberately NOT granted: it is only ever reached from
-- inside another SECURITY DEFINER function, where current_user is the owner.
grant execute on function public.handle_new_user() to public;
grant execute on function public.guard_profile_privileges() to public;
grant execute on function public.guard_store_moderation() to public;
grant execute on function public.guard_listing_moderation() to public;
grant execute on function public.touch_updated_at() to public;

-- RLS limits rows; only a column grant limits columns. Without this a user
-- can still write is_admin even if the guard trigger were removed.
revoke update on public.profiles from authenticated;
grant update (name) on public.profiles to authenticated;

grant execute on function public.open_deposit(numeric, text) to authenticated;
grant execute on function public.place_order(uuid, integer, text) to authenticated;
grant execute on function public.complete_order(text) to authenticated;
grant execute on function public.download_credentials(text) to authenticated;
grant execute on function public.upload_credentials(uuid, jsonb) to authenticated;
grant execute on function public.set_listing_status(uuid, text) to authenticated;

-- Admin-gated inside the function, so the admin UI can call these with a
-- normal session. A non-admin is refused before anything is touched.
grant execute on function public.refund_order(text) to authenticated;
grant execute on function public.review_store(uuid, boolean, text) to authenticated;
grant execute on function public.resolve_report(uuid, text, text) to authenticated;

-- Payment confirmation and the escrow sweeper are server-only.
grant execute on function public.confirm_deposit(text, numeric, text, timestamptz)
  to service_role;
grant execute on function public.release_expired_escrow(integer) to service_role;