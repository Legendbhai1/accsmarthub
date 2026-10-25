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
  only writer and is deliberately not granted to `authenticated`. Since `0019`
  each movement names a **pool** — `spend` (money the account put in) or
  `earn` (money it made selling) — and `wallets` carries the two balances as
  `spendable_usd` + `earned_usd`, with `balance_usd` a generated total.
- **Withdrawal terms differ by audience.** `request_payout()` pays a seller
  from `earned_usd` at a $10 floor and 1%, and a buyer from `spendable_usd` at
  a $20 floor and 1.5%, storing `pool`/`fee_rate`/`fee_usd`/`net_usd`. A
  deposit therefore cannot be withdrawn as sale proceeds.
- **Telegram is the support channel.** `src/lib/contact.ts` holds
  `TELEGRAM_CHANNEL` (`t.me/accsmarthub`) and `TELEGRAM_SUPPORT`
  (`t.me/AccsMartHubbot`); the footer and the support page both read it, so the
  handle and the link cannot drift. They are external links, so the internal
  route walker cannot see them — `tests/contact_links.test.ts` pins them.
- **A category is one entry in `src/lib/db.ts`.** `SERVICE_CATEGORIES` and the
  home-page `categories` list both feed the marketplace, category grid and
  seller form by iteration, and `src/lib/brands.ts` supplies the glyph keyed by
  the same slug. Google was added this way; adding a platform means adding it
  to all three, not editing a component.
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
- `0014`–`0019` are ordinary forward migrations and are **not** reconciled by
  `0013`. `0019_wallet_pools_and_withdrawals.sql` is the one that splits the
  wallet into pools and rewrites `request_payout()`; a database that stops at
  `0018` still serves every page but has a single-pool wallet, so the two
  balance figures read the same number and a deposit can be withdrawn under the
  seller's terms. `npm run check:schema` has a sentinel for it; apply it before
  shipping the wallet or payout screens.
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

## The theme is vibrant commerce on a tinted canvas, and it lives in the tokens

- **The canvas is tinted and the cards are white.** `--background` is a soft
  cool tint (#E9EEF6) while `--card` stays pure white, so a card reads as a
  raised surface and the page reads as a shop. It used to be white-on-white:
  the storefront then measured 52–64% *pure white* by pixel area and the whole
  page read as an unfinished document — separation came only from
  `--shadow-*`, which is not enough on a full-width page. `--muted` sits one
  step *below* the canvas (a recessed well) and `--surface-2` one step above it.
  Anything that needs a colour uses a token (`bg-card`, `text-muted-foreground`,
  `bg-primary-hover`, `text-bronze`) — earlier palettes were removed rather
  than left beside a second system. Re-check computed styles in
  a browser after changing tokens; a token can be correct in CSS and still be
  overridden by a literal class in TSX.
- **Type is Sora over Plus Jakarta Sans.** `--font-display` is Sora and is used
  through the `font-display` utility on headings, the wordmark and section
  titles; `--font-sans` is Plus Jakarta Sans and is the body default. Both are
  imported at the top of `src/index.css` — a `font-display` class with no
  matching family silently falls back to the body font, so check the computed
  `font-family` if a heading looks wrong.
- **The brand is blue, with rose and amber as its two supporting hues.**
  `--primary` is a vivid commerce blue (#0B64F4), `--brand-2` rose (#DE177A) and
  `--brand-3` amber (#BD6705); `.brand-gradient` sweeps blue -> rose and
  `.text-gradient` sweeps the same ramp as text. `--info` is a real sky blue
  (#096C9A) and means "information" only. If something needs to say "this is
  the brand" it uses `--primary`, the ramp, or `--bronze`.
- **`--pop-*` exists so sections can differ.** `--pop-orange`, `--pop-cyan`,
  `--pop-green` and `--pop-pink` are extra hues with no brand meaning. They
  reach the page through `.orb`, `.icon-tile`, the `.section-pop` band and a
  `SectionHeading`'s `accent`, which is how the home sections, the trust
  pillars and the commitment row get visual variety without each section
  inventing its own colour. Do not use a `--pop-*` hue for a button, a status
  or any text.
- **An `.icon-tile` glyph is mixed toward the ink, not drawn as the bare hue.**
  The tile paints a 14% wash of `--tile` and draws the glyph on top of it, so
  the glyph is measured against a surface made of itself. A raw hue is tuned to
  fill a shape, not to stroke a 2px line on its own wash: at the palette's
  saturation the cyan, green and orange glyphs fell to 2.5–2.6:1, under the 3:1
  floor for a graphic. The rule mixes `--tile-ink-mix` (default 78%, i.e. 22%
  ink) so every glyph clears 3:1 in light mode. `tests/theme.test.ts` recomputes
  it for all ten hues in both themes, so raising a pop hue means re-checking the
  mix rather than eyeballing it.
- **A section can carry its own hue, and a card its own brand.** Three classes
  do the colour work, all in `src/index.css` and all driven by custom
  properties set inline:
  - `.section-pop` tints a whole band with `--pop` (a bare HSL triple like
    every token, so it is wrapped in `hsl()`). It is the "coloured zone"
    treatment — a homepage reads as a sequence of zones rather than one long
    white column.
  - `.tint-card` gives a card a faint wash plus a matching hairline from
    `--tint`/`--tint-wash`/`--tint-line`, so a grid of category tiles reads as
    a spread of platforms. `.tint-chip` is the same wash as a small badge.
  - `brandTint(brand)` and `tokenTint(token)` (in `src/lib/brands.ts`) emit
    those properties. Use the first for anything keyed to a platform, the
    second for anything keyed to a theme token (`tokenTint("--info")`).
  The mix strengths are tokens (`--tint-wash-mix`, `--tint-line-mix`,
  `--tint-ink-mix`) and each theme has its own: a 32% hue is a clear tint on a
  white card but is swallowed on a dark one, so light uses 40/56/62 and dark
  37/58/55. The ceilings are *measured*, not chosen: light can go to 45% and
  dark to 37% before `--muted-foreground` drops under 4.5:1 on the crimson
  platform hex, which is the tightest case. Note the dark ceiling is the
  *lower* one — a light ink on a near-black card is washed out by a lighter
  hue faster than a dark ink on a white card, so the ordering is not "dark is
  always stronger". `--tint-ink` is the hue mixed toward the theme ink, which
  is what keeps a label readable in *both* themes — a raw brand hex is not safe
  as text.
- **`.section-pop` strength is a per-theme token too, and the band fades at
  its edges.** `--band-strong` / `--band-soft` set the middle and the top/bottom
  stop of the band (32%/8% on the light canvas, 20%/6% on dark). The same mix
  does not land the same way on a light canvas and a near-black one, so they are
  not hardcoded in the rule. The gradient runs soft → strong → soft rather than
  strong → weak, because two adjacent bands used to meet at their strongest stop
  and the seam between them read as a hard edge — the "glitchy colour blocks"
  that a strong band produced. Held at 32%: a full-width `--pop-green` band at
  54% read as a saturated mint block rather than a tinted zone, while anything
  under ~28% stops reading as a coloured zone at all.
  `--muted-foreground` is tuned alongside them: it is a slate dark enough to
  clear 4.5:1 on the *strongest* band and on a brand-tinted card in either
  theme, which is what lets the bands be this saturated. The two move together
  — the band ceiling on a given canvas is a function of this ink, so raising a
  band means raising the ink (deepening it from #323C53 to #29344C is what
  bought the band its last few points when the canvas came down).
  `tests/theme.test.ts` recomputes that ratio from the tokens for both themes
  and bounds `--band-strong` between 10% and 36%.
- **The dark ink is lighter than the light ink is dark, and that is not a
  mistake to "fix".** Dark `--muted-foreground` is `215 25% 86%`, not the 76%
  it looks like it should be: a wash lifts a near-black card far more than it
  lifts a white one, so the *same* wash needs a *lighter* ink to stay readable.
  At 76% the dark brand tint fell under 4.5:1 on the `--pop-cyan` tile while
  every platform brand hex still passed, because the brand-hex suite did not
  cover the theme tokens that `Trust.tsx`
  (`--primary/--brand-2/--bronze/--info/--success`) and `Disputes.tsx`
  (`--pop-*`) feed into `tint-card`. `tests/theme.test.ts` now measures those
  too; if you add a token to a tint card, add it to that list.
- **`.empty-panel` is the empty state, and on a new marketplace it is the
  largest surface on the page.** An unbranded white panel with one grey glyph
  is what made the storefront read as unfinished. It carries a full-panel wash
  of `--pop` *plus* the hero's two corner blooms and a `--pop` icon tile, so
  "nothing here yet" is a coloured zone rather than a blank. The full-panel
  base matters: the radial blooms alone faded to `transparent` by 62% and left
  the centre — where the copy sits — white. `EmptyState` takes an `accent` and
  an `icon`; pass a `--pop-*` token for the hue.
- **The orbs are capped at 0.45 opacity on purpose.** They sit behind the hero
  copy, and at 0.55 a rose bloom under the centred paragraph dropped
  `--muted-foreground` to 4.42:1. Do not raise it without re-measuring the
  rendered hero.
- **A pop/tint token is a bare HSL triple, so wrap it in `hsl()` before using
  it as a colour.** This is the trap that made the coloured bands invisible
  when they were first added: `color-mix(in srgb, var(--pop-cyan) 9%, ...)` is
  invalid — `var(--pop-cyan)` resolves to the text `189 90% 40%`, which is not
  a colour, so the whole declaration is dropped silently and the section
  renders plain. `hsl(var(--pop-cyan))` is the fix, and it is the same
  convention `.orb` and `.icon-tile` use. `tests/theme.test.ts` pins that no
  `color-mix()` opens its colour argument with a bare `var(`, and that
  `brandTint()`/`tokenTint()` only ever emit real colours.
- **Colour is an accent, not a background.** The brand ramp belongs on the
  wordmark tile, the hero wash, the CTA panel, the promo banner, an active rail
  indicator and one icon tile — never as a saturated fill behind body copy or
  on every card. A `.section-pop` band, a `.tint-card` wash and an
  `.empty-panel` are the *deliberate* exceptions: they are hue at 8–44%, chosen
  so the text on top keeps its contrast, not saturated fills. `bg-primary` is a
  flat blue, and `.brand-gradient` is deliberately not used on the primary
  button, because a gradient on the main action reads as glossy.
- **The animated gradients stop at rose.** Amber and the `--pop-*` hues are
  lighter, so ending a *panning* ramp on one drops the contrast of the white
  text the CTA and promo panels carry. `.brand-gradient-animated` therefore
  pans blue -> rose -> blue; the extra hues reach the page through the
  orbs and the icon tiles, where nothing sits on top of them.
- **One radius system: 8 / 12 / 16px, and no pills.** `--radius` is 12px, so
  `rounded-lg` = 12, `rounded-xl` = 16, `rounded-2xl` = 20. Buttons, chips,
  badges, inputs and fields all share it; a pill (`rounded-full`) is reserved
  for things that are genuinely round — avatars, status dots, switches,
  sliders, progress bars, the hamburger's bars. A `rounded-full` on a button
  or a filter chip is the specific mistake this pass removed.
- **The two sticky headers are the one deliberate blur.** `SiteHeader` and
  `DashShell`'s header are `bg-card/85 backdrop-blur-xl`, because rows really
  do scroll under them. Every other surface is opaque: a translucent panel over
  the brand wash turns muddy. Do not copy the blur onto a card.
- **Dark mode is deep navy, not blue-black.** `.dark` is the same saturated
  identity turned down: a near-black navy canvas, and the primary becomes a
  lighter blue so it still reads on the dark surface. Do not "fix" dark mode
  by making it neutral slate or pure black.
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
- **One shell per audience, and the public bottom bar belongs to the buyer
  shell.** `MobileTabBar` (`src/components/site/`) is mounted by
  `PublicLayout` and by `DashShell` **for the buyer workspace
  only** (`workspaceForPath(pathname) === "buyer"`, i.e. `/account` and its
  sub-pages). It used to be rendered from four places — including both
  dashboard layouts — which is how the public Home / Marketplace / Categories /
  Account tabs appeared inside Seller Studio on top of the studio's own nav;
  the buyer workspace then had *no* bottom bar at all, which is the other half
  of the bug (its navigation was only reachable through the drawer). Seller
  Studio and the admin console still never mount it — both render `DashShell`
  (`src/components/dash/`) too, so the mount is gated on the workspace, not on
  "is this a dashboard". `tests/navigation.test.ts` asserts that gate and that
  `SellerLayout` never references the bar.
- **`PublicLayout` is the only public shell; a page must not mount its own
  copy of the chrome.** `SiteLayout` used to be a second full-page shell
  (header + footer + tab bar) that a public page could nest *inside*
  `PublicLayout`'s, and `/faq` and `/trust` did exactly that — two headers, two
  footers and two tab bars on one page. `/marketplace` hit the same class of bug
  from the other direction: a hand-rolled 144px header bar, with its own search
  field, under the sticky `SiteHeader`. `SiteLayout` had no callers once those
  two stopped using it and is deleted; `PublicLayout` owns the chrome for every
  route under it, and `tests/navigation.test.ts` now reads every file in
  `src/pages/public/` and fails if one mounts `SiteHeader`/`SiteFooter`/
  `MobileTabBar`/`SiteLayout`. A page's own `<header>` for its title is fine —
  it is the nav bar and the footer that must stay singular.
- **The sign-in destination is computed by the shell header, not hardcoded per
  page.** `SiteHeader` builds `authTo` from `useLocation()` —
  `/auth?returnTo=<current path + search>`, or a bare `/auth` on `/` and
  `/auth` — and every signed-out affordance in the header (person icon, Log in,
  Create account, the mobile sheet's "Sign in to buy or sell") uses it. This
  moved here when the marketplace's own header was removed: that header
  hardcoded `returnTo=/marketplace`, and dropping it silently broke "sign in
  from the marketplace returns you to the marketplace". `tests/profile_icon.test.ts`
  and `tests/mobile_tab_bar.test.ts` pin the computed link.
- **The header person icon is a per-workspace link, resolved by a mapper.** The
  dashboard header renders `ProfileIcon`, which resolves its destination with
  `profileHrefForWorkspace(workspaceForPath(pathname))` (`src/components/dash/navs.ts`):
  Seller Studio → `/seller/profile`, everything else → `/account/profile`. Keep
  the destination in the mapper rather than inlining a path in the JSX, so the
  icon cannot point at
  a route that does not exist for that workspace.
- **A `fixed` bottom bar needs its scroll container to reserve room.** Both the
  public shell (`PublicLayout`) and `DashShell`'s buyer workspace
  set `pb-24 md:pb-0` on `<main>`; without it the bar covers the last row of
  content and the footer. If you add a fixed element, reserve the space where
  the scrolling content lives rather than padding the element.
- **Tailwind v4 renamed `bg-gradient-to-*` to `bg-linear-to-*`.** The old
  names still work, but a class referenced in TSX with *no* definition at all
  fails silently: `text-gradient` was used by the wordmark, the hero headline
  and the 404 page for a long time while never existing in `src/index.css`, so
  all three accents rendered as plain text. If a class looks like it should do
  something and does not, grep the built CSS for it before assuming a
  specificity problem.
- **Colour belongs to a token, not to a literal.** The palette is blue plus
  the blue/rose brand ramp, with status kept separate (`--success`,
  `--warning`, `--info`, `--destructive`). Hardcoded `amber`/`emerald`/`sky`/hex
  values had spread across ~50 files, which is how a saturated amber ended up
  meaning "brand", "pending" and "warning" at the same time. Use `bg-primary`,
  `text-warning`, `border-success/30` and so on; a star rating is the one
  deliberate exception (`fill-amber-400`), because a star is yellow.
- **`wallet_ledger.kind` decides where a credit belongs, and 0019 gives that a
  column.** `wallets` now carries the balance in two pools — `spendable_usd`
  (deposits and refunds) and `earned_usd` (released escrow) — with
  `balance_usd` a *generated* total over the two, so the balance a buyer tops
  up and the balance a seller earns into are separate numbers and every
  existing reader of `balance_usd` still works. `apply_wallet()` takes the pool
  it moves money in, and `wallet_ledger` records it. Do not add a "spendable
  balance" derived by subtracting trade credits from one number — that
  subtraction was ambiguous; the split is the schema change that removes the
  ambiguity.
- **The two audiences withdraw on different terms, and the tier lives in one
  module.** `request_payout()` gives a seller a $10 floor at 1% against
  `earned_usd` and a buyer a $20 floor at 1.5% against `spendable_usd`, and
  records `pool`, `fee_rate`, `fee_usd` and `net_usd` on the request.
  `src/lib/withdrawalTiers.ts` is the client's single copy; `WithdrawalPanel`
  renders it for both pages. `tests/withdrawal_tiers.test.ts` reads the SQL and
  asserts the two agree — the same class of drift as the dispute vocabulary.
- **The admin pays the net, not the gross.** The payout queue shows the amount
  to send (`net_usd`) and the fee retained, and the confirm dialog names the
  net. The dialog used to name the gross request, which overpays by the fee on
  every payout now that a fee exists.
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
- **`ACCSMART_DB` and `settlement_test.dsn` must name the same database, or
  the dblink suites fail for a reason that has nothing to do with the code.**
  `tests/run-db-tests.sh` builds `$ACCSMART_DB` (default `accsmarthub_tests`),
  but the concurrency cases in `settlement.sql` and `credential_claim_guard.sql`
  open a *second* connection to whatever `settlement_test.dsn` points at. If the
  two differ, the outer session writes to one database and the dblink session to
  another, and the race assertions read 0 rows — `7a concurrent callbacks credit
  exactly once` reports `ledger rows for OX-C: 0`, which looks exactly like a
  settlement bug. `ACCSMART_DB` must be **exported**, not just set: `FOO=x cmd`
  in a loop body does not export it, so the harness silently falls back to its
  default while the DSN still names the intended one. Set both, with `export`,
  before running anything that uses dblink. The DSN also needs a loopback
  connection that authenticates without prompting: on the local cluster that
  means `host all all 127.0.0.1/32 trust` in `pg_hba.conf` (reload, do not
  restart), or a DSN that carries a password. A `scram-sha-256` loopback rule
  and a passwordless DSN fail with `fe_sendauth: no password supplied`, and the
  suite then aborts mid-transaction with `current transaction is aborted`
  cascading down every later assertion.
- **`wallet_ledger.kind` decides where a credit belongs, and the pool column
  says which balance it lands in.** `purchase`, `escrow_hold` and
  `escrow_release` are trade money; `deposit` and `adjustment` are top-ups;
  `refund` can be either. Since `0019` the two balances are separate columns —
  see the pool entry above — so a reader that needs "what can this account
  spend" asks for `spendable_usd` rather than deriving it from `balance_usd`.
  Do not reintroduce a subtraction over one shared column: a buyer's
  `escrow_release` refund would be wrongly deducted.

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
- **The purchase tick is a fourth success signal, and it is inline SVG, not
  another Lottie.** `src/components/common/SuccessTick.tsx` is the crisp
  disc-plus-check that fires the moment `placeOrder` resolves — the checkout
  holds it for `TICK_HOLD_MS` (850ms) and then navigates, and the confirmation
  page keeps a 20px copy as a seal beside the status. It is SVG rather than a
  Lottie because it has to be legible at 20px, where the `order-confirmed`
  scene's own text layers are not, and because a `stroke-dashoffset` draw costs
  no extra payload. Same gate as the Lotties: it may only mount once the server
  has agreed, so it is keyed off a `paid` flag set *after* `await placeOrder`,
  never off `placing` (which is true for a request that will fail too). Under
  reduced motion the expanding ring is dropped — motion with nothing in it —
  but the tick itself is shown finished, because the outcome is information.
  `tests/success_tick.test.ts` pins the `await`-before-flag ordering, the
  cleared-on-failure flag, the 600–1400ms hold and the status guard on the seal.
- **The header carries a promo strip above the nav row.** A storefront header
  has an offer line; its absence was a large part of why the shell read as a
  documentation site. It is `hidden … sm:block` on purpose: at 360px the header
  row is already at its width budget (see the overflow note above), so the strip
  is the first thing to go, not the search field or the account controls.
  `tests/site_header_layout.test.ts` pins that breakpoint pairing.
- **The workspace switcher must keep its label at every width.** It was
  `hidden sm:inline`, which left a bare icon on a phone — the one place the
  rail is a drawer and the switcher is the only visible way to change
  workspace. The header wordmark yields below `sm` to make room. The stray
  chevron that sat beside the hamburger was a *second* control reading as an
  identical menu button; it was removed, not restyled.

- **A `SECURITY DEFINER` function that takes the recipient as an argument must
  not be granted to `authenticated`.** `public.notify(uuid, text, text, text,
  text)` inserted straight into `notifications` with no check on the caller, so
  any signed-in user could forge a notification into any other user's inbox —
  a phishing vector that also bypassed the table's `auth.uid() = user_id` RLS
  policy. `0027_notify_lockdown.sql` revokes execute from
  `PUBLIC`/`anon`/`authenticated` and leaves it with `service_role`; the
  function body is unchanged, so the fix is reviewable as a pure privilege
  change. The right discriminator inside a definer is `current_user` (the
  owner, not `authenticated`), *not* `auth.uid()`, which stays the original JWT
  subject. `tests/notify_authorization.sql` pins both halves: a client call is
  refused, and a real user-triggered flow (`mark_order_delivered`) still writes
  the row. The same revoke also lands in `0021_security_hardening.sql`, so a
  database that runs only one of the two is still closed.
- **`has_function_privilege` is the only sentinel that catches a grant.** A
  `to_regprocedure`/`to_regclass` probe for a function that an earlier migration
  also defines proves nothing; for a privilege fix the *only* thing that changes
  is the grant, so the probe must assert it directly. `scripts/check-schema.mjs`
  carries a sentinel for every migration, including `0018`, which previously had
  none while `0018` was the fix for the dead cart oversell guard.
- **CI is the gate now.** `.github/workflows/ci.yml` runs `tsc -b`, `eslint`,
  `vitest`, `vite build`, and — against a real PostgreSQL 15 and 17 — the
  migration chain plus every behavioural SQL suite. The database job uses a
  throwaway local cluster, so no Supabase token or secret is involved and it is
  safe on fork PRs. `settlement.sql`'s concurrency case is given a
  `settlement_test.dsn` so it runs rather than reporting SKIPPED.
- **Two migrations were numbered `0020` and only one survives as `0020`.** The
  listing-moderation migration (`0020_admin_listing_moderation.sql`) and the
  notify lockdown (`0020_notify_lockdown.sql`) were authored on separate
  branches. Both were committed as `0020`, which git merges without a word —
  but `tests/verify-migrations.sh` applies migrations *by filename in the order
  its own lists give*, and `scripts/migrate.mjs` records them in
  `public.schema_migrations` keyed on filename, so two files sharing a number
  is an ordering ambiguity the tooling cannot resolve for you. The notify
  lockdown was renumbered `0027_notify_lockdown.sql` on the merge so the
  sequence is unambiguous and its ledger entry is distinct. Its sentinel in
  `check-schema.mjs` moved with it; the guard's *effect* is already delivered
  by `0021`, so `0027` is a belt-and-braces re-assertion, not the only fix.

- **The delivery mode is a column now, not a guess.** `listings.delivery_mode`
  (`credential` | `manual`, added by `0023`) is what decides how an order is
  delivered, instead of `finish_single_order_delivery()` inferring it from the
  claimed-credential count. `credential` means every unit charged for must be
  claimed (`claimed = quantity`); `manual` means the platform hands nothing over
  and the claim is skipped entirely. The mode is set at insert (default
  `manual`), promoted to `credential` by `upload_credentials()`, and pinned by
  `guard_listing_moderation` for a non-trusted writer exactly like `status` and
  `stock`.
- **Inferring the mode was the whole bug.** A credential listing whose `stock`
  counter drifted above its credential pool could be checked out with
  `claimed = 0`; `finish_single_order_delivery` then read that as "manual" and
  the buyer paid for a digital product that was never handed over. `0022`'s
  `claimed in (0, quantity)` could not tell that apart from a legitimate manual
  listing — only the explicit mode can.
- **`place_order` (Buy Now) used to reject every manual listing.** It required
  `v_free >= quantity`, and a manual listing has no units, so the precheck now
  applies only to `credential` listings. The cart `checkout` never had that
  precheck, which is why manual listings only worked through the cart.
- **The product is credential-only today.** Every seller-facing path attaches
  units (`upload_credentials` sets `stock = count(unclaimed)`, and the UI copy
  says "stock is the number of unclaimed accounts"), and no RPC sets `stock`
  without credentials. So `manual` is a correct, tested backend mode with no
  seller-facing way to *create* one yet — a manual listing is what you get for
  an un-credentialed row (tests, a future admin/fulfilment path), not something
  the current UI can produce.
- **Each migration has a matching rollback.** `supabase/rollback/*.sql` restore
  the LATEST prior definition of every function a migration replaced, extracted
  verbatim from the migration that last wrote it. Roll 0023 back *before* 0022:
  0023 re-defines the same three order functions on top of 0022, so undoing 0022
  underneath it would leave the two out of order.
- **The client-facing grant surface has its own read-only audit.**
  `supabase/preflight/0003_grants_audit.sql` lists what `anon` and
  `authenticated` can actually reach (tables, columns, sequences, functions,
  default privileges) and flags the ones that should not exist. It uses
  `has_table_privilege`/`has_function_privilege`, not
  `information_schema.role_table_grants`, because the latter hides privileges
  granted to PUBLIC — and a function with `proacl is null` is EXECUTE-able by
  `anon` by default. `F8` flags `security_invoker=false` views, which return
  rows the caller could not read from the base table.
- **Replacing a function means copying the LATEST definition forward, not the
  one you remember.** `resolve_order_request` is written three times (0009,
  0013, 0025). 0013 added a note-length limit, a confirmed-order check and the
  `settle_order_refund` settlement path; 0009's earlier body lacks all three.
  Rewriting the function from 0009 silently dropped every 0013 refinement —
  and the same mistake on `mark_notifications_read` replaced a working
  ownership guard with 0009's `return sql%rowcount`, which is **not valid
  PL/pgSQL** (the correct form is `get diagnostics v_n = row_count`). Read the
  live definition with `pg_get_functiondef(...)` and diff it against the file
  before editing: `select pg_get_functiondef('public.f(uuid)'::regprocedure)`.
  A `create or replace` that shortens a function is a regression the compiler
  cannot see, because `check_function_bodies` does not reject `sql%rowcount`.
- **A migration that changes authorization needs a party guard, not just a
  role guard.** `resolve_order_request` checked *who may approve* and left
  *who may dismiss* open: it is `SECURITY DEFINER`, so its `select ... for
  update` reads the request row with the owner's rights and RLS does not hide
  it. Any signed-in stranger who knew a request id could close it, and a
  dismissed cancellation is the denial-of-refund primitive. The fix checks
  `can_moderate()` first, then that the caller is the order's buyer or seller,
  then that the caller is not the request's own author. `tests/request_authorization.sql`
  pins all three plus the admin path.
- **The admin console must degrade on a database that is behind the migrations,
  because production is.** Production is `0001`-`0006` then `0013`+, so `0020`
  (which gives `listings` its moderation columns and the three-argument
  `set_listing_status`) is absent there. Both assumptions failed live:
  `set_listing_status(p_listing_id, p_note, p_status)` answered `PGRST202`
  ("Could not find the function … in the schema cache") so Approve and Reject
  did nothing, and a select naming `moderation_note` answered `42703` so the
  queue never loaded. `setListingStatus` now retries with the two named
  arguments the older function declares, `admin_update_listing` explains the
  missing migration instead of surfacing `PGRST202`, and `AdminListings`
  re-reads without `moderation_note` on `42703`. `isSchemaCacheError` is the
  one "the schema is behind" test; `isMissingRpcError` is the RPC-signature
  one. `tests/admin_listing_fallback.test.ts` pins all three. Apply `0020` to
  production as well — the fallbacks keep the console usable, not complete.
- **The public header carries a person icon, and an auth link must use
  `returnTo`.** `SiteHeader` had no profile control, so the homepage had no
  one-tap route to the account; it now links to `/account/profile` when signed
  in and `/auth` when signed out. The auth page reads `returnTo` (and the
  stored fallback) and has never read `next`, so the marketplace's
  `/auth?next=/marketplace` silently dropped its destination — the two call
  sites now emit `returnTo`. `tests/profile_icon.test.ts` pins both.
- **The route-transition overlay is CSS-driven and keyed on the route.**
  `RouteLoadingScreen` is mounted once by the pathless root in `src/App.tsx`,
  above every shell, so the transition is the same on the public pages, the
  three dashboard workspaces and the transactional pages. It renders nothing
  for the landing render (the first `location.key` is held in state, not a ref
  — reading a ref during render is a lint error here), then remounts on every
  subsequent navigation via `key={location.key}`, which is what replays the
  animation. It has no `setTimeout`: the overlay, the mark and the progress
  rail are three keyframes sharing `--route-load-ms` (1200ms), and the veil
  ends on `visibility: hidden` so a finished overlay cannot swallow clicks.
  Do **not** reuse `add-to-cart`, `shopping-bag` or `order-confirmed` for it:
  those are success signals and a transition has not succeeded at anything.
  `tests/route_loading.test.ts` pins the mechanism, the duration window and
  the reduced-motion path.
- **Colour tokens are only half the job — the container has to use the width.**
  The palette is a vibrant commerce set and the homepage renders ~40% coloured
  pixels, but the marketplace and auth pages measured near-monochrome at
  1440px (`auth` 0.7%, `marketplace` 3.9%) while being colourful on a phone
  (`categories` 74.7% at 390px). The cause was layout, not tokens:
  `Marketplace.tsx` used `max-w-md` on every container with no breakpoint, so a
  1440px viewport showed a 448px column with two thirds of the screen as empty
  white gutter. Each container now carries a `sm:max-w-7xl` partner and the
  listing grid gains columns (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`), and
  the listings sit in a `.section-pop` band. Measured after: `marketplace`
  25%, `auth` 4.3%. When a page "looks colourless" on a desktop, screenshot it
  at 1440px and count hues before touching a token — a phone screenshot will
  lie to you. `tests/storefront_colour.test.ts` pins the wide containers, the
  responsive grid and the band. Note the site header overflowed horizontally
  (30px at 768px, 173px at 1024px) from its auth buttons — see the header note
  below; that was a separate, pre-existing bug.


## The site header is one row, and it has to fit

- **The primary nav is an `xl` feature, and the hamburger is its mirror.** The
  nav is 500px wide on its own. With the wordmark, the search field and the
  account buttons, the row's children measured 1187px inside a 1014px viewport
  at 1024px — 173px of overflow, so `document.documentElement.scrollWidth`
  (1272) exceeded `clientWidth` (1014) and *every* page grew a horizontal
  scrollbar from `md` to 1279px. There is no width below `xl` where 500px of
  nav fits, so the nav is `xl:flex` and the hamburger is `xl:hidden`. Those two
  breakpoints are load-bearing as a pair: they sit one line apart, and if one
  moves without the other, 1024-1279px is left with no navigation at all.
  `tests/site_header_layout.test.ts` pins the pair, that the sheet maps the same
  `NAV_LINKS`, and that the search field is `w-40 sm:w-56` (it used to be a
  fixed `w-56` that grew to `w-64` on focus — a hard 256px floor in a row with
  no room). Verified: zero overflow at 360/390/640/768/820/1024/1180/1279/1280/
  1366/1440/1600px, and the nav/hamburger swap is exclusive at every one.


## CI (`.github/workflows/ci.yml`)

- **CI needs Node 22, not 20.** `@supabase/*@2.118` declares
  `engines.node >= 22`, and its realtime client looks for a *global*
  `WebSocket`. On Node 20 `createClient()` throws "Node.js detected but native
  WebSocket not found", which fails to even load every suite that transitively
  imports `src/lib/supabase.ts` — reported as failed *suites* with zero failed
  tests, which reads like a broken test rather than a broken runtime. The
  installed `ws` package is not assigned to `globalThis`, so it cannot serve as
  a fallback; the native global (Node 22+) is the only source. The workflow
  pins `node-version: 22`.
- **The database job must own port 5432.** The runner image ships its own
  PostgreSQL (16) whose `main` cluster holds 5432, so a matrix cluster created
  alongside it lands on 5433 — while the SQL suites connect over the default
  socket and reach the wrong server. The job drops every preinstalled cluster,
  then creates the matrix version explicitly on 5432. Both jobs pin
  `runs-on: ubuntu-24.04` rather than `ubuntu-latest`, so the gate does not
  move when GitHub promotes a new image (the first run landed on the brand-new
  `ubuntu-26.04`).
- The app job runs `tsc -b`, `eslint`, `vitest` and `vite build`; the database
  job runs `tests/verify-migrations.sh` and every suite in `tests/*.sql` on
  PostgreSQL 15 and 17. **Keep the suite list in the workflow in step with
  `package.json`'s `test:db`** — they are two copies of the same list and
  drifted once already.

