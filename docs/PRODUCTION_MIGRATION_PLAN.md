# Production migration plan — 0007 through 0027

**Status: NOT APPLIED. Nothing in this document has been run against production.**

Production project ref: `fbalfkvimlfmcpsfzrvn`.
Read-only review only, per the standing directive. Every command below is listed
for approval; none has been executed.

> **Range note.** This plan originally covered `0007`–`0017`. Migrations
> `0018`–`0027` were added afterwards and are included below:
>
> | Migration | What it changes |
> | --- | --- |
> | `0018_cart_checkout_stock_guard.sql` | Replaces `checkout()` so the cart branch guards on a freshly locked `v_available` instead of the always-NULL `v_listing.stock`. Before this, a cart checkout could oversell. |
> | `0019_wallet_pools_and_withdrawals.sql` | Splits `wallets.balance_usd` into `spendable_usd` + `earned_usd` and adds per-audience withdrawal tiers. |
> | `0020_admin_listing_moderation.sql` | Adds the listing moderation columns, the review history and `admin_update_listing()`, and requires a rejection reason. This is the admin approve/reject path. |
> | `0021_security_hardening.sql` | Closes the trusted-write GUC bypass, tightens table/function grants, adds the `listings` DELETE policy, and revokes client execute on `notify()`. |
> | `0022_credential_claim_guard.sql` | Guards credential claiming so a buyer cannot claim more units than they paid for. |
> | `0023_listing_delivery_mode.sql` | Adds `listings.delivery_mode` (`credential` \| `manual`) so delivery is a recorded decision, not inferred from the claimed-credential count. |
> | `0024_revoke_client_grants.sql` | Removes the leftover client INSERT/UPDATE/DELETE and `anon` SELECT grants on the money and audit tables. Revokes only — it never re-grants. |
> | `0025_request_authorization.sql` | Authorizes order requests so a caller cannot act on an order that is not theirs. |
> | `0026_admin_credit_audit.sql` | Makes `admin_credit_wallet()` self-refusing and capped, and records every adjustment in `wallet_ledger`. |
> | `0027_notify_lockdown.sql` | Revokes `execute` on `public.notify(uuid,text,text,text,text)` from `PUBLIC`/`anon`/`authenticated`; leaves it with `service_role`. Without it, any signed-in user can forge a notification into any other user's inbox. Renumbered from `0020` because the listing-moderation migration already claimed that number on another branch. |
>
> `scripts/check-schema.mjs` carries a sentinel for every one of `0001`–`0027`,
> including `0018` (which previously had none) and `0027`.

---

## 1. What production is actually missing

Production was migrated as **`0001`–`0006`, then `0013`+**. That is the single
fact that explains every reported symptom.

| Symptom | Cause |
| --- | --- |
| Seller listing creation fails with `SQLSTATE 42501` | `0008` never ran, so `listings` still carries `0001`'s insert policy — the one that requires an **approved store**. A seller with no store row, or a pending one, is refused by `WITH CHECK`, which surfaces as `42501` and reads to the user as *"You do not have access to that information."* |
| Dispute reason mismatch | The canonical vocabulary lives in `0013`; the client had drifted. Fixed in code (commit `91a44a5`). |
| Other drift | `0007`, `0009`–`0012`, `0014`–`0016` are also absent, so `admin_audit`, `orders.delivery_status`, `order_events`, `order_refunds`, the payout tables and `saved_listings` may all be missing. |

**Important:** `0013` was written as a *reconciliation* migration. On a database
that skipped `0007`–`0012`, `0013` creates what it depends on and no-ops
elsewhere. That is why production is not simply broken — but it also means the
sentinel in `scripts/check-schema.mjs` is the reliable way to see what is
present, rather than assuming a prefix of files ran.

### Run this first (read-only)

```bash
SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=fbalfkvimlfmcpsfzrvn \
  node scripts/check-schema.mjs
```

This performs **no writes**. It reports, per migration, whether its objects
exist. Use its output to confirm the table above before applying anything.

---

## 2. Order of operations

Apply in filename order. The migrations are individually idempotent, but the
order still matters for two reasons: `0013` reconciles objects that `0007`–`0012`
also define, and `0017` **deliberately reverses** a policy that `0008` changes.

### 2.1 Recommended: apply 0007–0020 in one pass

Because production never ran `0008`, the `listings` policy is currently `0001`'s.
`0017` drops and recreates that policy explicitly. Applying the whole range in
order means the policy ends in exactly one known state.

```bash
# Dry run first — prints the plan, writes nothing.
SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=fbalfkvimlfmcpsfzrvn \
  node scripts/migrate.mjs \
    supabase/migrations/0007_email_and_store_policy.sql \
    supabase/migrations/0008_listing_first_publishing.sql \
    supabase/migrations/0009_buying_to_delivery_lifecycle.sql \
    supabase/migrations/0010_admin_users_edge_function.sql \
    supabase/migrations/0011_dispute_rls_fix.sql \
    supabase/migrations/0012_dispute_resolution_consistency.sql \
    supabase/migrations/0013_reconcile_marketplace.sql \
    supabase/migrations/0014_seller_payouts.sql \
    supabase/migrations/0015_support_request_safety.sql \
    supabase/migrations/0016_saved_listings.sql \
    supabase/migrations/0017_store_applications.sql \
    supabase/migrations/0018_cart_checkout_stock_guard.sql \
    supabase/migrations/0019_wallet_pools_and_withdrawals.sql \
    supabase/migrations/0020_admin_listing_moderation.sql \
    supabase/migrations/0021_security_hardening.sql \
    supabase/migrations/0022_credential_claim_guard.sql \
    supabase/migrations/0023_listing_delivery_mode.sql \
    supabase/migrations/0024_revoke_client_grants.sql \
    supabase/migrations/0025_request_authorization.sql \
    supabase/migrations/0026_admin_credit_audit.sql \
    supabase/migrations/0027_notify_lockdown.sql

# Then, once the plan reads correctly, add --apply.
```

### 2.2 Minimum fix for the reported 42501 bug

If the full range is too large to approve in one step, `0017` alone repairs the
listing failure and adds the store-application lifecycle. It is self-contained:
it does not depend on `0008`–`0016` having run.

```bash
node scripts/migrate.mjs --apply \
  supabase/migrations/0017_store_applications.sql
```

`0017` depends only on objects from `0001`–`0006`, which production has:
`stores`, `listings`, `orders`, `wallets`, `apply_wallet`, `admin_audit`,
`is_admin`, `can_moderate`, `store_reviews`.

It also redefines `guard_store_moderation()` itself. That is deliberate. `0007`
is where the resubmission transition (`rejected -> pending`) was introduced,
but production never ran `0007` and `0013` does not carry the function — so
production still had `0001`'s version, which pins `status` on every non-admin
write. A rejected applicant's resubmission was therefore silently reverted:
the wizard's **Resubmit** button did nothing, with no error, on a database
where every column and table `0017` creates looked correct. Carrying the guard
inside `0017` removes that cross-migration dependency, so the lifecycle works
on the `0001–0006 + 0017` path as well as on the full chain.

One `0007` object is still absent on the minimum path and is **not** carried by
`0017`: `sync_profile_store_status()`, the trigger that mirrors `stores.status`
into `profiles.store_status`. Nothing depends on it — `src/lib/session.tsx`
reads the live `stores` row first and treats the profile column as a fallback
for accounts with no store at all — so its absence is cosmetic. Applying the
full range installs it.

---

## 3. The 0008 / 0017 interaction — read before applying

These two migrations disagree, by design.

- **`0008`** removes the approved-store requirement: *the listing is the gate,
  not the store.*
- **`0017`** puts it back: *listing creation requires an approved store.*

`0017` is later, so it wins on any database that runs both. On production,
which never ran `0008`, `0017` changes the behaviour only in that it also ships
the application lifecycle that turns "no approved store" into an *explainable
state* rather than a dead end: the UI routes the seller to the application
instead of showing a form whose save button fails with `42501`.

The sentinels reflect this:

- `0008`'s sentinel is satisfied by **either** shape, so it does not fail on a
  `0017` database.
- `0017`'s sentinel asserts the eligibility clause is **present**, plus the new
  columns and the events table.

If you would rather ship `0008`'s behaviour (no store gate), then **do not apply
`0017`** and instead say so explicitly — the code changes in `SellerApply.tsx`
and the `RequireApprovedSeller` guard are compatible with either, but the
`listing_creation.sql` test asserts the gate and would need its assertions
flipped back.

---

## 4. What each migration touches

| File | Objects | Risk |
| --- | --- | --- |
| `0007` | `admin_audit`, `disposable_email_domains` | Low — new tables |
| `0008` | `listings` insert policy, `place_order()` | **Medium** — replaces a policy and a function |
| `0009` | `orders.delivery_status` + related | Low — additive columns |
| `0010` | admin users edge function support | Low |
| `0011` | dispute RLS fix | Low — policy replacement |
| `0012` | dispute resolution consistency | Low |
| `0013` | reconciliation: `order_events`, `order_refunds`, dispute vocabulary | Medium — wide, but written to no-op where objects exist |
| `0014` | seller payouts | Low — new tables |
| `0015` | support request safety | Low |
| `0016` | `saved_listings` | Low — new table |
| `0017` | `stores` columns, `store_application_events`, `review_store()` audit, `guard_store_moderation()`, `listings` insert policy, `place_order()` | **Medium** — three function/policy replacements |

### Reversible?

All statements are additive (`add column if not exists`, `create table if not
exists`) or replace a definition (`create or replace`, `drop policy ... ; create
policy ...`). To roll back `0017`'s policy change specifically:

```sql
drop policy if exists "insert own listing" on public.listings;
create policy "insert own listing" on public.listings for insert
  with check (auth.uid() = seller_id and status = 'pending' and stock = 0);
```

Rolling back `0017`'s columns is **not** recommended: dropping
`store_application_events` discards the audit history, and dropping the `stores`
columns discards submitted application data.

---

## 5. Verifying a migration actually ran

`scripts/check-schema.mjs` is the authority. After applying:

```bash
SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=fbalfkvimlfmcpsfzrvn \
  node scripts/check-schema.mjs
```

Expect every entry to report present, including:

- `0017` — `stores.categories`, `stores.ownership_attested`,
  `store_application_events`, and `insert own listing` containing `approved`.

Then, in the Supabase SQL editor (read-only):

```sql
-- The eligibility clause must be present.
select pg_get_expr(polwithcheck, polrelid)
  from pg_policy
 where polname = 'insert own listing'
   and polrelid = 'public.listings'::regclass;

-- The lifecycle objects must exist.
select to_regclass('public.store_application_events');
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'stores'
   and column_name in ('categories','warranty_hours','support_email',
                       'ownership_attested','submitted_at');
```

---

## 6. Required environment variables (names only)

Nothing here has a value in the repository, and none should be committed.

| Name | Where | Purpose |
| --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | local shell, for the runner | Supabase Management API auth (`sbp_…`) |
| `SUPABASE_PROJECT_REF` | local shell, for the runner | Target project (`fbalfkvimlfmcpsfzrvn`) |
| `VITE_SUPABASE_URL` | build environment | Client Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | build environment | Client anon key (public by design) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Edge Functions only** | Never in a `VITE_` variable, never in the client bundle |
| Payment provider keys | **Edge Functions only** | Webhook signature verification |

The service-role key and payment secrets must not appear in any `VITE_`-prefixed
variable: everything with that prefix is inlined into the shipped JavaScript.

---

## 7. Not covered by this plan

These need separate approval and are **not** part of the migration range:

- Deploying Edge Functions (`supabase functions deploy`) — the runner only
  applies SQL.
- Any Storage bucket or policy change beyond what `0002` already defines.
- Rotating production credentials. No exposed credential was found in the
  current tracked files or history; if one is later found, identify the type and
  rotate it deliberately rather than silently.
