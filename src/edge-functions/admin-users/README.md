# admin-users Edge Function

This function is the server-side replacement for the browser-side call
`supabase.auth.admin.getUserById(...)` that AdminUsers previously used.

## Why this exists

`supabase.auth.admin` requires a service-role key, and the service-role key
bypasses Row Level Security. Putting it in the browser disables the platform’s
authorization model for the entire app. The correct pattern is:

- browser asks a server runtime to list admin-visible users;
- server runtime verifies the caller is an authenticated admin;
- server runtime returns only the fields the UI needs.

## Contract

```ts
interface AdminUsersRequest {
  page: number;
  per_page: number;
  status: "all" | "admin" | "seller" | "buyer";
  search: string;
}

interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  last_sign_in_at: string | null;
  role: string | null;
}

interface AdminUsersResponse {
  users: AdminUserRow[];
  total: number;
  page: number;
  per_page: number;
}
```

- `page` and `per_page` must be validated and clamped.
- `status` must be one of the four known values.
- `search` must be limited to a reasonable length and treated as a plain
  substring on `email` and `name`.
- The function must only run when the caller’s verified session indicates admin
  access. Do not rely on the frontend to pass an admin flag.
- The function must not return password hashes, tokens, or any authentication
  metadata other than `last_sign_in_at`.

## Required setup

1. Implement the function in `src/edge-functions/admin-users/index.ts` (or the
   equivalent Edge Function layout for your hosting setup).
2. Use a trusted runtime path for admin verification. In Supabase this usually
   means validating the caller JWT and checking the admin flag in `profiles`
   inside a server-side function or Edge Function that runs with a service role
   only internally.
3. Do not ship the service-role key to the browser.
4. Point `AdminUsers` at this function via `supabase.functions.invoke("admin-users", ...)`.
5. Only then enable the admin users page in production.

## Local development note

Until the function is deployed, AdminUsers on the client will show an actionable
error message instead of pretending to work.
