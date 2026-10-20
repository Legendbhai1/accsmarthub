# AccsMartHub — repository notes for agents

Vite + React 18 + TypeScript + Tailwind v4 + shadcn/ui + React Router v7
(imports come from `react-router`, never `react-router-dom`) + Supabase
(Auth, Postgres/RLS, Storage, Edge Functions). Package manager: `npm`
(lockfile is `package-lock.json`; `bun.lock` is stale).

Commands: `npm run build` (tsc -b && vite build), `npm run lint`, `npm test`,
`npm run dev`.

## Architecture facts that matter

- **All money and state transitions are Postgres functions** in
  `supabase/migrations/`. The browser calls them with `supabase.rpc(...)` using
  the caller's own session so the database's ownership checks run. The
  service-role key is never used from the browser and must never be a `VITE_`
  variable.
- **`public.is_trusted_write()`** is the field-guard escape hatch. Guard
  triggers (`guard_listing_moderation`, `guard_store_moderation`,
  `guard_order_delivery`, …) pin `status`/`stock`/delivery columns for
  non-trusted writers. Server functions set
  `set_config('app.trusted_write','on',true)` (transaction-local) before
  writing those columns. Read `can_moderate()` *before* setting the flag.
- **Wallet ledger is append-only** (`wallet_ledger`). `apply_wallet()` is the
  only writer and is deliberately not granted to `authenticated`.
- **Escrow model**: the buyer's wallet is debited at checkout; the seller's net
  is *locked* on the **seller's** wallet (`locked_usd`) as `escrow_hold` and
  released on completion. So `wallets.locked_usd` for a seller is escrow held
  on their behalf.
- Fees: 10% platform commission (`commission_amount`), 3% escrow/protection fee
  (`escrow_fee_usd`). `total_usd = gross_amount + escrow_fee_usd`.
- **Order states** (`orders.status`): `in_escrow`, `completed`, `disputed`,
  `refunded`, `expired`. Delivery is a *separate* axis:
  `orders.delivery_status` = `pending` | `delivered` | `buyer_confirmed`.
  There is no `transferring`/`paid`/`processing` state; `paid` is expressed by
  `order_payments.status = 'captured'`.
- Payment provider is **OxaPay** (crypto). `create-deposit-invoice` opens an
  invoice with the merchant key held server-side; `oxapay-webhook` verifies
  HMAC-SHA512 over the raw body and settles through `settle_deposit()`
  (service_role only).
- Storage buckets: `store-assets` and `listing-assets` (public read, seller
  writes only under `<uid>/`). `dispute-evidence` is private.

## Known hazards

- `supabase/migrations/0007`–`0012` were never applied to the linked project
  (`fbalfkvimlfmcpsfzrvn`) as of the last audit. Their SQL syntax and shape
  errors (broken `position()`, `new.`/`old.` in a WITH CHECK, a mismatched
  `admin_audit.note`/`detail`, two conflicting `admin_audit` shapes, and a
  divergent dispute vocabulary) were repaired in place in commit `b055240`, so
  a fresh database now applies `0001`–`0013` in order cleanly — verified
  against PostgreSQL 17 by `tests/verify-migrations.sh`.
  `0013_reconcile_marketplace.sql` remains the single, idempotent,
  order-independent migration that brings any environment to the state the code
  requires, and is safe to re-run.
- `src/convex/**` is dead code (no runtime imports). `tsconfig.app.json`
  excludes it; ESLint still lints it.
- Widening a `check (kind in (...))` constraint means naming the *current* live
  list, not the one in the migration that first created the table. `0013`
  re-declared `notifications` with `create table if not exists`, which is a
  no-op on an existing table, so `0009`'s kind list stayed authoritative. A
  later migration that copies the wrong list silently breaks inserts. `0014`
  adds `payout_*` kinds on top of `0009`'s list for exactly this reason.
- A support request is not a report against anyone. `off_platform_reports`
  rows filed from BuyerSupport leave `reported_user_id` null: `resolve_report()`
  pauses every active listing owned by `reported_user_id`, so filing a ticket
  against yourself used to suspend your own listings on resolution. `0015`
  enforces this in the insert policy and guards the pause as well.
- The seeded "demo" helpers in `src/lib/db.ts` (`getSeller`, `api.*`,
  `DEMO_SELLER_ID`) throw on purpose. Do not reintroduce fabricated data.
- `ThemeProvider` must stay mounted in `src/main.tsx`. `SiteHeader`, `TopMenu`
  and the Toaster all call `useTheme()` from `@/lib/theme`, and that hook throws
  when no provider is above it — every page using the site header renders blank
  otherwise. The provider belongs in the root, not inside a route.
- `Toaster` (from `@/components/ui/sonner`) must stay mounted in
  `src/main.tsx`. Eighteen files call `toast.*`; without the mounted toaster
  those calls resolve to nothing and the user sees no feedback at all.
  Note it uses the app's own `useTheme`, not `next-themes` (which is installed
  but never mounted, so its `useTheme` would always report "system").
- Route errors are caught by the pathless root route's `errorElement`
  (`src/pages/ErrorPage.tsx`). Keep child paths absolute — the root adds no
  path segment. The real error and stack are shown only when
  `import.meta.env.DEV`, so development stays diagnosable while production
  does not leak internal table or column names.

## The theme is mocha and cream, and it lives in the tokens

- **The palette is a warm neutral set: cream, mocha, espresso, bronze.** The
  values are recorded in `src/index.css`'s `:root` block with their hex
  comments. Anything that needs a colour uses a token (`bg-card`,
  `text-muted-foreground`, `bg-primary-hover`, `text-bronze`) — the previous
  violet/indigo theme was removed rather than left beside a second system.
  Re-check computed styles in a browser after changing tokens; a token can be
  correct in CSS and still be overridden by a literal class in TSX.
- **There is no blue in the brand.** `--info` is a muted slate, and it means
  "information" only. If something needs to say "this is the brand" it uses
  `--primary` (mocha) or `--bronze`. Do not reintroduce a blue accent.
- **Bronze is a detail, not a fill.** `--bronze` belongs on hairlines, the
  active indicator and at most one icon tile. It is flat: no metallic
  gradient, no shine. `bg-primary` is a flat mocha, and `.brand-gradient` is a
  near-flat two-stop for the wordmark tile only — the primary button
  deliberately does not use it, because a gradient on the main action reads as
  glossy.
- **One radius system: 8 / 12 / 16px, and no pills.** `--radius` is 12px, so
  `rounded-lg` = 12, `rounded-xl` = 16, `rounded-2xl` = 20. Buttons, chips,
  badges, inputs and fields all share it; a pill (`rounded-full`) is reserved
  for things that are genuinely round — avatars, status dots, switches,
  sliders, progress bars, the hamburger's bars. A `rounded-full` on a button
  or a filter chip is the specific mistake this pass removed.
- **Surfaces are opaque.** `backdrop-blur` is not used anywhere in app code:
  the sticky header, the dashboard header and the mobile tab bar are solid
  `bg-card` with a hairline border. Translucent panels over a warm wash turn
  muddy and were part of the look being replaced.
- **Dark mode is warm, not blue-black.** `.dark` is the same palette turned
  down. The `heroText`/`--background` values differ from light only in
  lightness; do not "fix" dark mode by making it slate or navy.
- **Motion is 140–240ms and reduced-motion is honoured.** Hover/focus is
  150ms, entrances 200ms, drawers 200ms. `src/index.css` drops decorative
  animation and transitions under `prefers-reduced-motion`; `LottieAnimation`
  seeks to the last frame instead of playing. Status that moves (spinners,
  progress) is left running on purpose.
- **The header fits a 360px phone.** It overflowed by 69px before: the logo,
  bell, avatar, both auth buttons and the hamburger could not fit in one row.
  The Log in / Create account buttons are now `hidden sm:inline-flex`, because
  the hamburger sheet already carries "Sign in to buy or sell". If you add
  anything else to the header row, re-check `document.documentElement.scrollWidth`
  at 360px — it must equal `clientWidth`.

## Styling and routing traps (learned the hard way)

- **Tailwind v4 needs an explicit build hook.** `tailwindcss` v4 does not run
  through PostCSS by default and there is no `tailwind.config.js` here. It is
  wired up by the `@tailwindcss/vite` plugin in `vite.config.ts`, and
  `src/index.css` must use v4 syntax: `@import "tailwindcss"`, not the v3
  `@tailwind base/components/utilities` directives. If the plugin is missing
  the build still *succeeds* — it just emits the raw directives and zero
  utilities, and the entire UI silently falls back to browser defaults
  (bullet-list nav, purple links, unstyled buttons, unconstrained images).
  Check the built CSS size and grep for a real utility (`.flex{`) if anything
  looks unstyled.
- **Never `@apply` a class inside a rule that defines that same class.** The
  old `src/index.css` had a block of no-ops like
  `.bg-amber-400 { @apply bg-amber-400 }` added while Tailwind was not running.
  They are circular once it does run; `@theme inline` is the correct way to
  register design tokens.
- **A route must not set both `element` and `children`.** The section routes
  used `element: <SellerLayout><SellerDashboard /></SellerLayout>`, and
  `SellerLayout` renders `{children ?? <Outlet/>}` — so the index page was
  always the `children` and the outlet never rendered. Every sub-page
  (`/seller/orders`, `/account/wallet`, `/admin/users`) silently rendered the
  index dashboard while the URL said otherwise. Section routes mount the bare
  layout; the `index` child supplies the dashboard. `tests/routes.test.ts`
  guards this.
- **The route tree lives in `src/routes.tsx`**, not `src/App.tsx`, so it can be
  asserted in tests without a DOM — `createBrowserRouter` touches `document`
  at import time and the test environment has no jsdom. `src/App.tsx` only
  wraps `routes` in the pathless root that carries the error boundary.
- **An internal link is not type-checked.** `to="/categories"` compiles
  whether or not a route exists, so a typo becomes a 404 that only surfaces
  when someone clicks it. This is not hypothetical: `/categories` was linked
  from the header, the footer and the mobile tab bar; `/forgot-password` from
  two places; and `/reset-password` was passed as Supabase's recovery
  `redirectTo`, so the link in a real password-reset email pointed at a route
  that did not exist. `tests/navigation.test.ts` now walks every `to="…"`,
  `to: "…"`, `navigate(…)` and `redirect(…)` string in `src` and fails on any
  that does not resolve to a declared route. When you add a route, add it to
  `src/routes.tsx`; when you link to one, the test will tell you if you
  mistyped it.
- **One shell per audience, and the public bottom bar belongs to the public
  shell only.** `MobileTabBar` is mounted by `PublicLayout` and `SiteLayout`
  and nothing else. It used to be rendered from four places — including both
  dashboard layouts — which is how the public Home / Marketplace / Categories /
  Account tabs appeared inside Seller Studio on top of the studio's own nav.
  Buyer, seller and admin all render `DashShell` (`src/components/dash/`),
  which uses a desktop rail plus a mobile drawer and has no bottom bar at all.
  `tests/navigation.test.ts` asserts the dashboards never reference the bar.
- **A `fixed` bottom bar needs its scroll container to reserve room.** The
  public shell sets `pb-24 md:pb-0` on `<main>`; without it the bar covers the
  last row of content and the footer. If you add a fixed element, reserve the
  space where the scrolling content lives rather than padding the element.
- **Tailwind v4 renamed `bg-gradient-to-*` to `bg-linear-to-*`.** The old
  names still work, but a class referenced in TSX with *no* definition at all
  fails silently: `text-gradient` was used by the wordmark, the hero headline
  and the 404 page for a long time while never existing in `src/index.css`, so
  all three accents rendered as plain text. If a class looks like it should do
  something and does not, grep the built CSS for it before assuming a
  specificity problem.
- **Colour belongs to a token, not to a literal.** The palette is charcoal plus
  a single violet accent, with status kept separate (`--success`, `--warning`,
  `--info`, `--destructive`). Hardcoded `amber`/`emerald`/`sky`/hex values had
  spread across ~50 files, which is how a saturated amber ended up meaning
  "brand", "pending" and "warning" at the same time. Use `bg-primary`,
  `text-warning`, `border-success/30` and so on; a star rating is the one
  deliberate exception (`fill-amber-400`), because a star is yellow.
- **Do not label the held-funds model "escrow".** The backend holds money in an
  internal `wallet_ledger` and has no licensed escrow provider, and there is no
  payout provider either (`0014_seller_payouts.sql` reserves a withdrawal and
  leaves settlement to an admin). The user-facing copy says "held in-platform"
  and "payment protection" for that reason. Do not reintroduce "escrow" as a
  guarantee, and do not claim KYC, ratings or sales history that is not
  recorded.
- **A green build says nothing about the database.** Production drifted from
  this repository by ten migrations: it was originally set up as "0001–0006,
  then 0013+", so `0007`–`0012` were silently skipped. `0013` reconciles the
  objects it knows about but not the `listings` insert policy that `0008`
  rewrites, so production kept enforcing `0001`'s "your store must be approved"
  clause and *every* attempt to create a listing failed with
  `42501 row-level security policy for table "listings"` — surfaced to the
  seller as the generic "You do not have access to that information." Nothing
  in `tsc`, `eslint`, `vitest` or `vite build` can see a missing migration; only
  the database can. Run `npm run check:schema` against the project before
  shipping anything that depends on a new migration. It is read-only and prints
  which files are missing. `tests/listing_creation.sql` pins the *text* of the
  policy (that it does not mention `approved`), not merely that the policy
  exists, because "exists but is the old one" was the entire bug.
- **A migration runner that keeps going after a failure is worse than none.**
  `scripts/migrate.mjs` used to apply statements one at a time, each in its own
  implicit transaction, and continue to the next file after a failure. A
  half-applied `0013` (its `order_events`/`order_refunds` committed, its
  `disputes_reason_check` never reached) is exactly what that produces. It now
  sends each file as ONE query wrapped in `begin; … commit;`, stops dead at the
  first failure, refuses to wrap a file containing `create index concurrently`
  / `vacuum` / `reindex` (those cannot run in a transaction), and records what
  it applied in `public.schema_migrations`. Plan mode is the default and writes
  nothing at all — not even the ledger table. `tests/migration_runner.test.ts`
  and `tests/migration_runner_stops.sh` pin this; `npm run test:db:migrations`
  runs the whole readiness check.
- **Dispute reasons are a snake_case vocabulary, not the labels the UI
  renders.** `disputes.reason` is constrained by `0013` to
  `not_as_described | transfer_failed | seller_unresponsive |
  item_not_received | other`, and `open_dispute()` validates the same set. The
  buyer page used to render its own label array and post the selected label as
  `p_reason`, so every dispute opened from the UI failed with
  `Invalid dispute reason` (P0001). The vocabulary now lives in
  `src/lib/disputeReasons.ts` (values, labels, `isDisputeReason`,
  `disputeReasonLabel`) and `tests/dispute_reasons.test.ts` asserts the UI
  module, the RPC guard and the CHECK constraint are the same set — three
  copies that had silently drifted. Legacy label-valued rows are normalised by
  `public.normalize_dispute_reasons()` (server-only, audited in
  `dispute_reason_normalizations`); an unrecognised value raises rather than
  being filed under `other`. `supabase/preflight/*.sql` are the read-only
  queries to run against production before applying `0013`/`0014`.
- **Migrations must be applied in order, and the drift checker proves they
  are.** When adding a migration, add a sentinel for it to
  `scripts/check-schema.mjs`: a *query* that is false without that specific
  migration, not a `to_regclass` that a later migration also satisfies. A
  sentinel that is true on the broken database is worse than none — `0015`
  redefines `resolve_report`, which `0001` also defines, so presence alone
  proved nothing; the sentinel now checks for `0015`'s specific self-report
  guard.
- **`wallet_ledger.kind` decides where a credit belongs.** `purchase`,
  `escrow_hold` and `escrow_release` are trade money; `deposit` and
  `adjustment` are top-ups; `refund` can be either. Because every kind shares
  one `balance_usd` column, the balance a buyer tops up and the balance a
  seller earns into are the *same number*. Do not add a "spendable balance"
  derived by subtracting trade credits — that subtraction is ambiguous, since a
  buyer's `escrow_release` refund would be wrongly deducted. Separating them
  needs a schema change to `apply_wallet()` (a `purpose` column), which is a
  financial migration and belongs behind explicit approval.

- **A step list is a contract, and `STEPS` is its only copy.** The seller
  application now asks four questions — store, platforms, delivery & access,
  compliance. Questions 4 ("Warranty & policies") and 5 ("Support") were
  removed. Progress, per-step validation, the saved draft, the submitted
  payload and the review summary are all *derived* from `STEPS`, so trimming
  that array is the whole change; do not reintroduce a parallel count.
- **Dropping a question is not the same as dropping a column.** The warranty,
  refund and support columns still exist, `SellerSettings` still edits them,
  and existing stores keep their values. `submitStore` and `updateStore` route
  every optional column through `defined()`, so a wizard submission *omits* a
  field it does not collect instead of writing `null` over a value the seller
  already stored. Writing an unasked field unconditionally is how the settings
  form used to erase the logo and the warranty window.
- **The three Lottie animations are success signals, so their trigger is the
  contract.** `src/assets/animations/*.json` are the exact LottieFiles payloads
  named in `src/assets/animations/README.md` (IDs and licence), bundled locally
  rather than fetched from the CDN. Each mounts only on success —
  `add-to-cart` after `cartAdd` resolves, `shopping-bag` on an empty cart,
  `order-confirmed` only once the order row is back from Supabase.
  `tests/animations.test.ts` pins that, plus reduced-motion, accessible text,
  `loop={false}` and the lazy-loaded chunks. Do not move a player up so it
  renders before its flow succeeds; that is the failure the tests exist to
  catch.
- **The workspace switcher must keep its label at every width.** It was
  `hidden sm:inline`, which left a bare icon on a phone — the one place the
  rail is a drawer and the switcher is the only visible way to change
  workspace. The header wordmark yields below `sm` to make room. The stray
  chevron that sat beside the hamburger was a *second* control reading as an
  identical menu button; it was removed, not restyled.

