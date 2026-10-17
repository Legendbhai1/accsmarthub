# admin-users Edge Function

Server-side replacement for the browser call `supabase.auth.admin.getUserById(...)`.
The browser only ever holds the publishable key; the service-role key stays in
Edge Function secrets.

## Flow

1. Read the caller's `Authorization: Bearer <access_token>` header and validate
   the JWT with `auth.getUser(token)`.
2. Look up `public.profiles.is_admin` for the caller with the service-role
   client and refuse with `403` when it is not `true`.
3. Call `public.admin_list_users(...)` with the **caller's** token, so the
   database's `can_moderate()` check runs a second time (defence in depth).

`public.admin_list_users` is defined in
[`../../migrations/0010_admin_users_edge_function.sql`](../../migrations/0010_admin_users_edge_function.sql).
It is the only place that reads `auth.users.last_sign_in_at`; the schema has no
`profiles.role` and no `profiles.last_sign_in_at`, so the UI role is derived:

| role | source |
| --- | --- |
| `admin` | `profiles.is_admin` |
| `seller` | `profiles.store_status = 'approved'` (and not admin) |
| `buyer` | everything else |

## Contract

Request (`POST` JSON body, or `GET` query string):

```ts
{
  page?: number;      // >= 1, default 1
  per_page?: number;  // 1..100, default 50
  role?: "all" | "admin" | "seller" | "buyer"; // default "all"
  search?: string;    // substring on email or name, max 100 chars
}
```

`status` is accepted as a legacy alias for `role`.

Response `200`:

```ts
{
  users: { id: string; email: string | null; name: string | null;
           last_sign_in_at: string | null; role: "admin" | "seller" | "buyer" }[];
  total: number;
  page: number;
  per_page: number;
}
```

Errors: `400` invalid input, `401` missing/invalid session, `403` not an admin,
`405` unsupported method, `500` server failure (details stay in logs), `503`
missing function secrets. No tokens, password hashes, or auth metadata other
than `last_sign_in_at` are returned.

## Deploy

```bash
# 1. Apply the RPC and indexes (0010).
supabase link --project-ref <project-ref>
supabase db push

# 2. Deploy the function.
supabase functions deploy admin-users

# 3. Confirm the secrets exist. Hosted Supabase injects SUPABASE_URL,
#    SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY automatically; set them
#    with `supabase secrets set NAME=...` only if your project does not.
supabase secrets list
```

Then verify from the app: a signed-in admin loads `/admin/users`; a signed-in
non-admin gets `403`; signed-out callers get `401`. If the admin page shows
"Admin users service is not configured", the function is missing secrets (503).

## Local checks

```bash
deno check supabase/functions/admin-users/index.ts
npm run build && npm test
```

`src/edge-functions/admin-users/README.md` is the older design note; this file is
the contract the code actually implements.
