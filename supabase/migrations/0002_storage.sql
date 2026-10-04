-- Storage buckets and policies.
--
-- 0001_core.sql created the `logo_path` / `banner_path` / `image_path` columns
-- but never created the buckets or the storage RLS policies those columns point
-- at, so any upload from the app would fail. This migration adds them.
--
-- Apply with:
--   SUPABASE_PROJECT_REF=<ref> SUPABASE_ACCESS_TOKEN=sbp_... \
--     bun -e 'const m = await import("./scripts/migrate.mjs")' -- 0002
--
-- or directly through the SQL editor.

-- Public read for seller branding and listing imagery.
insert into storage.buckets (id, name, public)
values ('store-assets', 'store-assets', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('listing-assets', 'listing-assets', true)
on conflict (id) do nothing;

-- Anyone may read: these buckets are public.
drop policy if exists "store-assets public read" on storage.objects;
create policy "store-assets public read" on storage.objects for select
  using (bucket_id = 'store-assets');

drop policy if exists "listing-assets public read" on storage.objects;
create policy "listing-assets public read" on storage.objects for select
  using (bucket_id = 'listing-assets');

-- Sellers may upload under their own folder: <auth.uid()>/...
drop policy if exists "store-assets own insert" on storage.objects;
create policy "store-assets own insert" on storage.objects for insert
  with check (
    bucket_id = 'store-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "listing-assets own insert" on storage.objects;
create policy "listing-assets own insert" on storage.objects for insert
  with check (
    bucket_id = 'listing-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- …and overwrite or delete only their own objects.
drop policy if exists "store-assets own update" on storage.objects;
create policy "store-assets own update" on storage.objects for update
  using (
    bucket_id = 'store-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "store-assets own delete" on storage.objects;
create policy "store-assets own delete" on storage.objects for delete
  using (
    bucket_id = 'store-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "listing-assets own update" on storage.objects;
create policy "listing-assets own update" on storage.objects for update
  using (
    bucket_id = 'listing-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "listing-assets own delete" on storage.objects;
create policy "listing-assets own delete" on storage.objects for delete
  using (
    bucket_id = 'listing-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );