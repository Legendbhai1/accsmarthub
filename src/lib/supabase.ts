import { createClient, type AuthSession, type User } from "@supabase/supabase-js";

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

/**
 * The single browser client.
 *
 * Only the publishable (anon) key is ever used here. Privileged work — admin
 * user listing, audit writes, payment confirmation — happens in Edge Functions
 * with the service-role key in server-side secrets. Never add a service-role
 * key to a `VITE_*` variable: Vite inlines those into the public bundle.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});

export const SUPABASE_PROJECT_URL = SUPABASE_URL;

/** The minimum password length enforced by GoTrue. */
export const PASSWORD_MIN_LENGTH = 6;

type AuthResult = { session: AuthSession | null; user: User | null };

/** Sign in with password using the browser Supabase client. */
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw new Error(error.message);
  return { session: data.session ?? null, user: data.user ?? null };
}

/**
 * Register a new user with password using the browser Supabase client.
 * `emailConfirmed` is true only when GoTrue considers the address verified
 * (auto-confirm projects return a session immediately).
 */
export async function signUpWithPassword(
  email: string,
  password: string,
  redirectTo: string,
): Promise<AuthResult & { emailConfirmed: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw new Error(error.message);
  return {
    session: data.session ?? null,
    user: data.user ?? null,
    emailConfirmed: Boolean(data.user?.email_confirmed_at),
  };
}

/** Send a magic link (passwordless sign-in) using the browser Supabase client. */
export async function sendMagicLink(
  email: string,
  redirectTo: string,
): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
  });
  if (error) throw new Error(error.message);
  return { session: data.session ?? null, user: data.user ?? null };
}

/** Resend a confirmation link (for email verification) using the browser Supabase client. */
export async function resendConfirmation(
  email: string,
  redirectTo: string,
): Promise<AuthResult> {
  const { data, error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw new Error(error.message);
  return { session: data.session ?? null, user: data.user ?? null };
}
