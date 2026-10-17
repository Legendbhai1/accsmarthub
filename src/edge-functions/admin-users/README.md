# admin-users Edge Function

This design note is superseded. The implemented function lives at
[`supabase/functions/admin-users/index.ts`](../../../supabase/functions/admin-users/index.ts),
its contract and deployment steps are in
[`supabase/functions/admin-users/README.md`](../../../supabase/functions/admin-users/README.md),
and the database half (the admin-gated, paginated `admin_list_users` RPC) is in
[`supabase/migrations/0010_admin_users_edge_function.sql`](../../../supabase/migrations/0010_admin_users_edge_function.sql).

Key rule that has not changed: the service-role key must never reach the
browser, and must never be placed in a `VITE_*` variable.
