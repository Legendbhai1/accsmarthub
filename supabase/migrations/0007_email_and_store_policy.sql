-- =====================================================================
-- 0007_email_and_store_policy.sql
--
-- Four fixes in one file, all idempotent:
--
--  1. REGISTRATION MUST ONLY ACCEPT REAL MAILBOXES. The client refuses
--     known disposable domains (src/lib/emailPolicy.ts) with friendly copy,
--     but a client check is trivially bypassed — so `handle_new_user()` also
--     refuses them server-side. GoTrue collapses any trigger failure into a
--     generic "Database error saving new user", which is why the friendly
--     copy lives in the browser and this check is the door that cannot be
--     walked through with devtools.
--
--  2. A REJECTED SELLER MUST BE ABLE TO RESUBMIT. `guard_store_moderation`
--     pinned `status` for every non-admin write, so a rejected application
--     could never re-enter the queue: the resubmit button did nothing
--     visible because the UPDATE was silently reverted. Self-approval
--     stays impossible — only `rejected -> pending` is opened up; every
--     other non-admin transition is still pinned.
--
--  3. `profiles.store_status` / `profiles.store_name` were never written by
--     anything (no trigger, `review_store` does not touch profiles), so the
--     session derived role from a column that always read 'none' and an
--     approved seller stayed role "buyer". A sync trigger plus a backfill
--     makes the column true. The client has also been switched to read the
--     store row directly, so nothing breaks either way.
--
--  4. THE ADMIN PANEL NEEDS REAL POWERS: promote/demote administrators
--     (`admin_set_admin`) and a real audit trail (`admin_audit`), which
--     `set_listing_status` also writes to when a moderator acts.
--
-- Apply with:
--   SUPABASE_PROJECT_REF=<ref> SUPABASE_ACCESS_TOKEN=sbp_... \
--     node scripts/migrate.mjs supabase/migrations/0007_email_and_store_policy.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1a. The blocklist itself. Server-side copy of the client list; RLS is
-- enabled with NO policies, so it is not readable through PostgREST —
-- the only reader is `is_disposable_domain()` below.
-- ---------------------------------------------------------------------
create table if not exists public.disposable_email_domains (
  domain text primary key,
  added_at timestamptz not null default now()
);
alter table public.disposable_email_domains enable row level security;

-- ---------------------------------------------------------------------
-- 4a. The audit trail the admin panel reads. Only SECURITY DEFINER
-- functions insert; admins may read.
-- ---------------------------------------------------------------------
create table if not exists public.admin_audit (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid,
  action text not null,
  target text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_time_idx on public.admin_audit (created_at desc);
alter table public.admin_audit enable row level security;
drop policy if exists "admins read audit" on public.admin_audit;
create policy "admins read audit" on public.admin_audit for select
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- 1b. Seed: same list the browser uses (src/lib/emailPolicy.ts), longest
-- suffix matching handled by the equality-or-subdomain test below.
-- Inserted with ON CONFLICT so re-running the migration never fails and
-- an operator can add a domain by hand without it being wiped.
-- ---------------------------------------------------------------------
insert into public.disposable_email_domains (domain) values
  ('0-mail.com'), ('0815.ru'), ('10mail.org'), ('10minemail.com'),
  ('10minutemail.co.za'), ('10minutemail.com'), ('10minutemail.net'),
  ('10minutemail.org'), ('1secmail.com'), ('1secmail.net'), ('1secmail.org'),
  ('1zhuan.com'), ('20minutemail.com'), ('20minutemail.ru'), ('2prong.com'),
  ('30minutemail.com'), ('33mail.com'), ('4warding.com'), ('4warding.net'),
  ('4warding.org'), ('60minutemail.com'), ('675hosting.com'), ('675hosting.net'),
  ('675hosting.org'), ('6url.com'), ('7tags.com'), ('9ox.net'), ('a-bc.net'),
  ('afromail.com'), ('allthetronics.com'), ('alphard.com.br'), ('amilegit.com'),
  ('anonymbox.com'), ('antichef.com'), ('antireg.ru'), ('antispam.de'),
  ('baxomale.ht.cx'), ('binkmail.com'), ('bio-muesli.net'), ('bladesmail.net'),
  ('bloatbox.com'), ('bofthew.com'), ('boximail.com'), ('brefmail.com'),
  ('brennend.org'), ('broadbandninja.com'), ('bsnow.net'), ('buffemail.com'),
  ('bugmenot.com'), ('bumpymail.com'), ('burnermail.io'), ('bustmail.com'),
  ('buymoreplays.com'), ('byom.de'), ('casualdx.com'), ('cbair.com'),
  ('cmail.com'), ('cmail.net'), ('cmail.org'), ('coldspotmail.com'),
  ('courrieltemporaire.com'), ('crapmail.org'), ('crazymailing.com'),
  ('cubiclink.com'), ('curryworld.de'), ('cust.in'), ('cx81.de'), ('d3vil.org'),
  ('dafthack.com'), ('dancetig.net'), ('deadaddress.com'), ('delikkt.de'),
  ('despam.com'), ('despammed.com'), ('devnullmail.com'),
  ('digitalsanctuary.com'), ('discard.email'), ('discardmail.com'),
  ('discardmail.de'), ('disposablemail.com'), ('dispostable.com'),
  ('dodgeit.com'), ('dodgit.com'), ('dropmail.me'), ('dudmail.com'),
  ('dump-email.info'), ('dumpmail.de'), ('dumpyemail.com'), ('e4ward.com'),
  ('emailias.com'), ('emailinfive.com'), ('emaill.de'), ('emailmiser.com'),
  ('emailsensei.com'), ('emailtemporanea.net'), ('emailtemporario.com.br'),
  ('emailthe.net'), ('emailias.net'), ('emailigo.de'), ('etempmail.com'),
  ('fakeinbox.com'), ('fakemail.net'), ('fakemailz.com'), ('fightallspam.com'),
  ('filzmail.com'), ('firesurfer.de'), ('frapmail.com'), ('freemail.tokyo'),
  ('garliclife.com'), ('getmaildomain.com'), ('getonspam.com'),
  ('ghosttexter.de'), ('grr.la'), ('guerrillamail.biz'), ('guerrillamail.com'),
  ('guerrillamail.de'), ('guerrillamail.info'), ('guerrillamail.net'),
  ('guerrillamail.org'), ('guerrillamailblock.com'), ('gustr.com'),
  ('harakirimail.com'), ('hot-mail.cf'), ('hot-mail.ga'), ('hotmail.kz'),
  ('hulapla.de'), ('mailinator.com'), ('mailinator.net'), ('mailinator.org'),
  ('mailinator2.com'), ('maildrop.cc'), ('mailcatch.com'), ('mailexpire.com'),
  ('mailforspam.com'), ('mailinator.gq'), ('mailnesia.com'), ('mailpoof.com'),
  ('mailsac.com'), ('mega.zik.dj'), ('meltmail.com'), ('mintemail.com'),
  ('minuteinbox.com'), ('moakt.com'), ('mohmal.com'), ('moncourrier.fr'),
  ('monemail.fr'), ('monmail.fr'), ('msa.minsmail.com'), ('mytemp.email'),
  ('mytrashmail.com'), ('neverbox.com'), ('no-spam.cf'), ('no-spam.ga'),
  ('no-spam.net'), ('no-spam.org'), ('nospam.ze.tc'), ('nospam4.us'),
  ('nowmymail.com'), ('nurfuerspam.de'), ('objectmail.com'), ('obobbo.com'),
  ('one-time.email'), ('oneoffemail.com'), ('onewaymail.com'), ('owlpic.com'),
  ('pokemail.net'), ('proxymail.eu'), ('punkass.com'),
  ('putthisinyourspamdatabase.com'), ('quickinbox.com'), ('rcpt.at'),
  ('reallymymail.com'), ('realtyalerts.ca'), ('recode.me'), ('recursor.net'),
  ('regbypass.com'), ('rejectmail.com'), ('rhyta.com'), ('rklips.com'),
  ('rmj.ru'), ('royal.net'), ('safetymail.info'), ('sandelf.de'),
  ('saynotospams.com'), ('scatmail.com'), ('skeefmail.com'), ('slaskowy.sh'),
  ('smellfear.com'), ('sneakmail.de'), ('sogetthis.com'), ('spam.la'),
  ('spam4.me'), ('spambob.com'), ('spambob.net'), ('spambob.org'),
  ('spambox.us'), ('spamcannon.com'), ('spamcannon.net'),
  ('spamcorptastic.com'), ('spamcowboy.com'), ('spamcowboy.net'),
  ('spamcowboy.org'), ('spamday.com'), ('spamex.com'), ('spamgourmet.com'),
  ('spamgourmet.net'), ('spamgourmet.org'), ('spamherelies.com'),
  ('spamhereplease.com'), ('spamimap.com'), ('spaminator.de'),
  ('spamkill.info'), ('spaml.com'), ('spammotel.com'), ('spamobox.com'),
  ('spamproject.com'), ('spamslicer.com'), ('spamspot.com'),
  ('spamthis.co.uk'), ('speed.1s.fr'), ('spoofmail.de'), ('superrito.com'),
  ('talkinator.com'), ('teewars.org'), ('teleworm.us'), ('temp-mail.io'),
  ('temp-mail.org'), ('temp-mail.ru'), ('tempail.com'), ('tempalias.com'),
  ('tempinbox.com'), ('tempmail.dev'), ('tempmail.plus'), ('tempmailo.com'),
  ('tempr.email'), ('temporary-mail.net'), ('temporaryemailaddress.com'),
  ('thanksnospam.info'), ('the-lastik.com'), ('throwawaymail.com'),
  ('tmail.ws'), ('trash-mail.com'), ('trashmail.com'), ('trashmail.de'),
  ('trashmail.me'), ('trashmail.net'), ('trashmail.org'), ('trashmailid.com'),
  ('tutye.com'), ('veryrealemail.com'), ('viditag.com'),
  ('viewcastmedia.com'), ('mailsiphon.com'), ('wegwerfemail.de'),
  ('wegwerfmail.de'), ('wegwerfmail.net'), ('wegwerfmail.org'),
  ('wetrainbayarea.com'), ('wh4i.org'), ('wegwerfemail.com'),
  ('wetrainbayarea.org'), ('whatiaas.com'), ('whatpaas.com'),
  ('womenswrongs.com'), ('xsph.ru'), ('yep.it'), ('yogamaven.com'),
  ('yopmail.com'), ('yopmail.fr'), ('yopmail.net'), ('youmailr.com'),
  ('zehnminuten.de'), ('zippymail.info'), ('zoznammail.sk'),
  ('0-mail.info'), ('boun.cr'), ('mailf5.com'), ('mt2015.com'),
  ('mailwithpass.com'), ('moonlightmail.com'), ('reversemail.com'),
  ('tafmail.com')
on conflict (domain) do nothing;

-- ---------------------------------------------------------------------
-- 1c. The predicate. Returns true when `p_domain` is a known disposable
-- domain or a subdomain of one. SECURITY DEFINER so it can read the table
-- despite the empty RLS policy set; STABLE so it can sit in predicates.
-- ---------------------------------------------------------------------
create or replace function public.is_disposable_domain(p_domain text)
returns boolean language plpgsql stable security definer
set search_path = public as $$
declare
  v text := lower(btrim(coalesce(p_domain, '')));
begin
  if v = '' then return false; end if;
  return exists (
    select 1 from public.disposable_email_domains d
     where v = d.domain or v like '%.' || d.domain
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 2a. Signup refuses disposable domains, addresses without a dot in the
-- domain (a typo or a localhost name — never a deliverable mailbox), and
-- anything malformed. Kept byte-compatible with the original body
-- otherwise: profile + wallet rows still land in the same statement.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_domain text;
begin
  v_domain := substring(lower(coalesce(new.email, '')) from '@([^@]+)$');
  if v_domain is null or v_domain = '' or position(' ' in v_domain) > 0 then
    raise exception 'Enter a valid email address';
  end if;
  if position('.', v_domain) = 0 then
    raise exception 'Temporary or invalid email addresses are not allowed. Use a permanent email you own.';
  end if;
  if public.is_disposable_domain(v_domain) then
    raise exception 'Temporary email addresses are not allowed. Use a permanent email you own.';
  end if;

  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name',''))
  on conflict (id) do nothing;
  insert into public.wallets (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3a. Requeue: the one non-admin status transition that is now allowed.
-- Every other attempt (notably self-approval `pending -> approved`) is
-- still pinned to the old value, and the review fields stay pinned for
-- non-admin writes so an applicant cannot erase their own rejection note.
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

-- ---------------------------------------------------------------------
-- 3b. Keep profiles.store_status / store_name true. SECURITY DEFINER:
-- the statement that fired the trigger may be an ordinary seller INSERT,
-- which has no UPDATE grant on those columns and would otherwise be
-- blocked. Runs as the table owner, so the privilege guard passes too
-- (same mechanism review_store relies on).
-- ---------------------------------------------------------------------
create or replace function public.sync_profile_store_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
     set store_status = new.status,
         store_name = new.store_name
   where id = new.user_id
     and (store_status is distinct from new.status
          or store_name is distinct from new.store_name);
  return new;
end;
$$;

drop trigger if exists sync_profile_store_status on public.stores;
create trigger sync_profile_store_status after insert or update of status, store_name
  on public.stores for each row execute function public.sync_profile_store_status();

-- Backfill the rows that the missing trigger left stale (and duplicate
-- applications: the oldest store row per user is the one that wins, which
-- matches what the client now selects with ORDER BY created_at LIMIT 1).
with latest as (
  select distinct on (user_id) user_id, status, store_name
    from public.stores
   order by user_id, created_at asc
)
update public.profiles p
   set store_status = l.status,
       store_name = l.store_name
  from latest l
 where p.id = l.user_id
   and (p.store_status is distinct from l.status
        or p.store_name is distinct from l.store_name);

-- ---------------------------------------------------------------------
-- 4b. Promote / demote administrators from the admin panel.
-- Gated by can_moderate(), refuses self-demotion (an admin who locks
-- themselves out cannot hand the key back), and records the change.
-- ---------------------------------------------------------------------
create or replace function public.admin_set_admin(p_user uuid, p_make_admin boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_email text;
begin
  if not public.can_moderate() then raise exception 'Administrators only'; end if;
  if p_user is null then raise exception 'No user selected'; end if;
  if p_user = auth.uid() and p_make_admin is false then
    raise exception 'You cannot remove your own admin access';
  end if;

  select email into v_email from public.profiles where id = p_user;
  if v_email is null then raise exception 'No profile for that user'; end if;

  perform set_config('app.trusted_write','on',true);
  update public.profiles set is_admin = p_make_admin where id = p_user;

  insert into public.admin_audit (admin_id, action, target, detail)
  values (auth.uid(),
          case when p_make_admin then 'admin.grant' else 'admin.revoke' end,
          p_user::text, v_email);
end;
$$;

-- ---------------------------------------------------------------------
-- 4c. Listing moderation now leaves a trace. Same body as 0001 except
-- the audit insert inside the moderator branch — the non-moderator
-- (hide-my-own-listing) branch is unchanged.
-- ---------------------------------------------------------------------
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
  insert into public.admin_audit (admin_id, action, target, detail)
  values (auth.uid(), 'listing.' || p_status, p_listing_id::text,
          (select title from public.listings where id = p_listing_id));
end;
$$;

-- ---------------------------------------------------------------------
-- Grants. New functions must be granted explicitly: replacing 0001-era
-- functions keeps their grants, creating brand-new ones does not.
-- ---------------------------------------------------------------------
grant execute on function public.is_disposable_domain(text) to anon, authenticated, service_role;
grant execute on function public.sync_profile_store_status() to public;
grant execute on function public.admin_set_admin(uuid, boolean) to authenticated;
