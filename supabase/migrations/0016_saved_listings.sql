-- ============================================================================
-- 0016 — SAVED LISTINGS
-- ============================================================================
-- The heart button on a marketplace card only ever wrote to component state, so
-- a saved account disappeared on reload. This gives it somewhere to live.
--
-- Unlike every other write in this schema there is no RPC here: saving a
-- listing has no financial effect and no cross-row invariant to protect, so
-- plain RLS is the right amount of machinery. The policy pins both columns to
-- the caller, which is what stops one user saving on another's behalf.

create table if not exists public.saved_listings (
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Saving the same listing twice is a no-op rather than an error, so the
  -- primary key makes the insert idempotent.
  primary key (user_id, listing_id)
);

-- The card renders a "saved" flag from a set of ids; the primary key already
-- covers (user_id, listing_id) lookups, so only the reverse order needs one.
create index if not exists saved_listings_listing_idx
  on public.saved_listings (listing_id);

alter table public.saved_listings enable row level security;

drop policy if exists "own saved listings" on public.saved_listings;
create policy "own saved listings" on public.saved_listings for select
  using (auth.uid() = user_id);

drop policy if exists "save a listing for yourself" on public.saved_listings;
create policy "save a listing for yourself" on public.saved_listings for insert
  with check (auth.uid() = user_id);

drop policy if exists "unsave your own listing" on public.saved_listings;
create policy "unsave your own listing" on public.saved_listings for delete
  using (auth.uid() = user_id);

-- No update policy: a saved listing is a pair of ids and nothing else, so the
-- only meaningful mutations are save and unsave.
