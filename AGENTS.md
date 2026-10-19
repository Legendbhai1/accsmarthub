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
  (`fbalfkvimlfmcpsfzrvn`) as of the last audit, and applying them *in order*
  leaves the database inconsistent: `0007` and `0012` create `admin_audit` with
  different columns, and `0009` replaces `resolve_dispute` with a different
  outcome vocabulary than `0012`'s wrapper expects.
  `0013_reconcile_marketplace.sql` is the single, idempotent, order-independent
  migration that brings any environment to the state the code requires.
- `src/convex/**` is dead code (no runtime imports). `tsconfig.app.json`
  excludes it; ESLint still lints it.
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
