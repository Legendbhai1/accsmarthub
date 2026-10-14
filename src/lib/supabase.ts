import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ??
  "https://fbalfkvimlfmcpsfzrvn.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_gxaxKk8NujigM7fRaPmu-Q_37lGtu0q";

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    "Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});

export const SUPABASE_PROJECT_URL = SUPABASE_URL;

/**
 * A Supabase client that can be used from serverless runtime code.
 *
 * In the browser this is NOT used to bypass RLS. In Edge/Node runtime code,
 * this helper is meant to be wired to a trusted authority (for example a
 * server-side session or a management API token) so privileged reads such as
 * paginating all users can be done server-side.
 *
 * If nothing is configured, this throws at call time with a message that points
 * at the deployment step. This keeps the browser from silently falling back to
 * an unprivileged client when an admin feature is missing.
 */
export function invokableSupabase() {
  const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "Admin users service is not configured: set VITE_SUPABASE_SERVICE_ROLE_KEY in the hosting secrets and deploy the admin-users Edge Function.",
    );
  }
  return createClient(SUPABASE_URL, serviceRoleKey);
}
