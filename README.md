## Overview

This project uses the following tech stack:

- Vite
- TypeScript
- React Router v7 (all imports from `react-router` instead of `react-router-dom`)
- React 18
- Tailwind CSS v4
- shadcn/ui
- Lucide Icons
- Supabase (Auth, Database, Storage, Edge Functions)
- Framer Motion
- Sonner toasts

All relevant app code lives in `src`. Supabase schema lives in `supabase/migrations`.

## Setup

This project is set up to run against a Supabase project. The app is
Supabase-backed; there is no Convex backend in the current code.

## Environment Variables

These are the public, browser-safe variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

For the admin users feature, the hosting environment also needs a trusted
server-side variable:

- `VITE_SUPABASE_SERVICE_ROLE_KEY`

Never put `VITE_SUPABASE_SERVICE_ROLE_KEY` in local `.env` files that get
committed, and never ship it to the browser bundle. The service role key
bypasses Row Level Security. Admin reads must go through a server runtime or
Edge Function instead.

## Using Authentication

Supabase Auth is the identity layer. Email link sign-in and password sign-up
are both supported. The `/auth` page handles sign-in/sign-up.

The app derives roles from the `profiles` table and the seller store status.
Do not trust client-only role flags for privileged operations.

## Authorization

Frontend route guards are a UX layer only. Every privileged operation must be
enforced server-side:

- admin actions rely on `is_admin()` / `can_moderator()` inside Postgres, or
  on a server runtime that verifies the caller before touching data;
- wallet movements are only done by Postgres functions or webhooks that are
  themselves authorized;
- dispute open/resolve, store review, listing moderation, and settings changes
  must not be possible from the browser unless the underlying DB function or
  Edge Function independently validates authorization.

## Protected Routes

Dashboard routes are wrapped with a role gate. The gate sends unauthenticated
visitors to `/auth` with the intended return path preserved.

## Frontend Conventions

Pages live in `src/pages`. Shared components live in `src/components`.

shadcn/ui primitives are in `src/components/ui`.

Use the existing design tokens and hover/focus states. Keep screens responsive
and avoid unnecessary shadows or nested cards.

## Page routing

Routing is configured in `src/App.tsx`.

## Admin pages

Admin pages read from Supabase. Some admin features, such as listing all users,
are intentionally server-backed because they require privileged access that must
not live in the browser. If an admin page is not wired to a backend yet, it
should say so plainly rather than pretending to work with fake data.

## Submitting stores, listings, deposits, and disputes

- Store applications: `src/lib/supabaseMutations.ts` exports `submitStore` and
  `reviewStore`.
- Listings: `createListing`, `updateListing`, `deleteListing`.
- Deposits: `openDeposit`, `verifyDeposit`, `createDeposit`.
- Orders: `placeOrder`, `checkoutBuyNow`, `checkoutCart`, `completeOrder`,
  `confirmDelivery`, `markOrderDelivered`, and the request/replacement flows.
- Disputes: `openDispute`, `addDisputeMessage`, `resolveDispute`.
- Reports: `fileReport`, `resolveReport`.

## Data model

The schema is forward-migrated through `supabase/migrations`. Do not drop or
truncate production tables. New objects should be added with `IF NOT EXISTS`
wherever possible, and destructive changes should go through explicit review.

## Tests

Run typecheck, build, and tests from the repository root with `npm` or `pnpm`
based on the current lockfile. There are no long-running services to start by
hand.

## Deployment

The project is deployed through the hosting provider configured for this repo.
Build failures should be reproduced locally with the same package manager and
lockfile before being reported as deployment issues.

## Secrets

If any secret is ever committed, rotate it immediately. Do not rely on removing
the file alone. For this project, the main values to rotate if exposed are:

- `VITE_SUPABASE_PUBLISHABLE_KEY` only if it was ever paired with a service role
  key or otherwise misused as a secret;
- `VITE_SUPABASE_SERVICE_ROLE_KEY` if it was ever committed or exposed client-side;
- any provider keys referenced by Edge Functions, such as payment provider keys.
