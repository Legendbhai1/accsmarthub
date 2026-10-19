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
