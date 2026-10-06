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
 * Email sign-in / registration: emails the user a sign-in link.
 *
 * WHY A LINK AND NOT A 6-DIGIT CODE
 *
 * The six-digit code only appears if the auth email template renders
 * `{{ .Token }}`. Writing that template needs a paid plan or a custom SMTP
 * provider — on the free tier with Supabase's default provider the template
 * API rejects the change outright. The default template is a *link* template,
 * so magic links are the flow that actually works on this project today.
 *
 * The cost is that `emailRedirectTo` MUST be set, otherwise GoTrue falls back
 * to the project's `SITE_URL`. That is what produced
 * `redirect_to=http://localhost:5173` in real users' inboxes, sending
 * production signups to a dead address.
 *
 * `shouldCreateUser: true` lets the same endpoint both register a brand new
 * account and log in an existing one.
 *
 * This is now the FALLBACK path only. Accounts created by `signUp` have a
 * password and sign in with `signInWithPassword`; the link is kept for people
 * who registered before passwords existed, or who lost theirs.
 */
export async function sendMagicLink(email: string, redirectTo: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: redirectTo,
    },
  });
  if (error) throw error;
}

/** Mirrors the project's `password_min_length` setting in Supabase Auth. */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Create an account with a password.
 *
 * Registration is the one place an emailed verification link belongs, so
 * `emailRedirectTo` is passed here. Whether signup hands back a live session
 * depends on the project's `mailer_autoconfirm` setting:
 *
 *   * autoconfirm on  -> `session` true and `emailConfirmed` true: the
 *     address was confirmed as part of signup and the account is usable now;
 *   * autoconfirm off -> `session` false: the emailed link is what activates
 *     the account, so the caller shows the "check your inbox" screen.
 *
 * `emailConfirmed` is reported separately because a session can exist for an
 * address that has not been confirmed yet, and the route guards hold those
 * accounts at the verification screen.
 */
export async function signUpWithPassword(
  email: string,
  password: string,
  redirectTo: string,
): Promise<{ session: boolean; emailConfirmed: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
  return {
    session: !!data.session,
    emailConfirmed:
      !!data.session?.user.email_confirmed_at ||
      !!data.user?.email_confirmed_at,
  };
}

/**
 * Sign in with the password the account was registered with.
 *
 * No email round trip: this is a plain credential check, which is the whole
 * point of the change. It fails for an account that has no password at all
 * (one created through the old magic-link-only registration), which is why
 * `SupabaseAuth` offers the emailed link as a fallback on failure.
 */
export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

/** Re-send the registration confirmation link. */
export async function resendConfirmation(
  email: string,
  redirectTo: string,
): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: redirectTo },
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