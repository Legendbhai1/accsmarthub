import { createClient } from "@supabase/supabase-js";

/**
 * Supabase browser client.
 *
 * IMPORTANT — read before adding keys here:
 *
 * `SUPABASE_PUBLISHABLE_KEY` (the `sb_publishable_...` value) is the direct
 * replacement for Supabase's old `anon` key. It is designed to be public: it
 * only grants the access that Row Level Security allows, and RLS is what
 * actually protects the data. It is safe in client code.
 *
 * `SUPABASE_SERVICE_ROLE_KEY` (the `secret` key) is the opposite — it bypasses
 * RLS entirely. It must NEVER appear in this file, in any `VITE_`-prefixed
 * variable, or in any code that reaches the browser. All privileged work
 * (escrow maths, credential decryption) happens inside Postgres functions or
 * Edge Functions instead, which is why the schema does not need it.
 */
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
    /** Keep the session in localStorage so a refresh does not sign the user out. */
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});

export const SUPABASE_PROJECT_URL = SUPABASE_URL;

/**
 * Email sign-in: asks Supabase to email a 6-digit code.
 *
 * `shouldCreateUser: true` lets the same endpoint both register a brand new
 * account and log in an existing one, which is why the sign-in screen needs
 * no separate "create account" mode.
 */
export async function sendEmailCode(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}

/** Exchanges the emailed 6-digit code for a real session. */
export async function verifyEmailCode(email: string, token: string) {
  const { error } = await supabase.auth.verifyOtp({
    email,
    token: token.trim(),
    type: "email",
  });
  if (error) throw error;
}

/** Current Supabase user, or null when signed out. */
export async function getSupabaseUser() {
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

/** The signed-in user's id, or null. Safe to call before sign-in completes. */
export async function getSupabaseUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function signOutSupabase() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** Convenience: the access token for calls that need Authorization. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}