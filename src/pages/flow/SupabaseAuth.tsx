import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Lock,
  Mail,
  MailCheck,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/site/Logo";
import {
  PASSWORD_MIN_LENGTH,
  resendConfirmation,
  sendMagicLink,
  signInWithPassword,
  signUpWithPassword,
} from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { roleHome } from "@/components/site/guards";
import { toast } from "sonner";

type Mode = "signin" | "register" | "sent";

/** Where to remember the post-sign-in destination across the email round trip. */
const RETURN_TO_KEY = "accsmarthub.returnTo";

/**
 * Sign in and registration, both by password.
 *
 * Email verification is no longer part of signing in: you enter the address
 * and the password you registered with and you are in, with no round trip
 * through an inbox. The verification link is still used for the two things it
 * is actually good for —
 *
 *   1. registration — `signUp` sends a confirmation link, and if the address
 *      has not been confirmed yet that link is what completes the account;
 *   2. forgot password — `/forgot-password` sends a recovery link that opens
 *      `/reset-password`, where a new password is set.
 *
 * Accounts created before passwords existed have no password at all, so a
 * failed password sign-in offers the old magic link rather than dead-ending.
 *
 * The return trip from a verification link lands back on this route with
 * `?code=…`; supabase-js (with `detectSessionInUrl`) exchanges it for a
 * session on boot, after which this component forwards to the intended
 * destination.
 */
export default function SupabaseAuth() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, isLoading: sessionLoading } = useSession();
  const [mode, setMode] = useState<Mode>(() =>
    params.get("mode") === "register" ? "register" : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once a password sign-in was rejected, which is what reveals the
  // "email me a link instead" escape hatch for passwordless accounts.
  const [passwordRejected, setPasswordRejected] = useState(false);
  // Set once we know this render is the post-click return trip, so a fresh
  // "sent" screen is not shown to someone who just arrived signed in.
  // State, not a ref: this value is read during render to switch the copy and
  // the resend button. A ref mutated in the effect below would not schedule a
  // re-render, so the screen could keep showing "Check your email" while the
  // user is actually mid sign-in.
  const [returning, setReturning] = useState(false);
  // What the "check your inbox" screen is waiting on, so Resend re-sends the
  // right kind of link: the registration confirmation or the sign-in link.
  const [sentFor, setSentFor] = useState<"register" | "link">("link");

  const normalized = email.trim().toLowerCase();

  const returnTo = params.get("returnTo");
  const storedReturnTo = (() => {
    try {
      return sessionStorage.getItem(RETURN_TO_KEY);
    } catch {
      return null;
    }
  })();
  // The URL wins, but sessionStorage is the fallback: GoTrue composes the
  // redirect URL itself, so we do not depend on it preserving our query.
  const destination =
    (returnTo?.startsWith("/") && returnTo) ||
    (storedReturnTo?.startsWith("/") && storedReturnTo) ||
    roleHome.buyer;

  // The emailed link points back at this route. Building it from
  // window.location.origin is what makes the flow work on localhost AND on
  // the Vercel production domain without any code change.
  const redirectTo = `${window.location.origin}/auth?returnTo=${encodeURIComponent(
    destination,
  )}`;

  // Coming back from the email link: supabase-js has already exchanged
  // `?code=…` for a session by the time the provider reports a user.
  useEffect(() => {
    if (user) {
      try {
        sessionStorage.removeItem(RETURN_TO_KEY);
      } catch {
        // storage unavailable — the URL parameter already carries it
      }
      navigate(destination, { replace: true });
    } else if (!sessionLoading && (params.get("code") || params.get("token"))) {
      // Arrived with a token but no session yet. Keep the user on the waiting
      // screen instead of bouncing them back to the email form.
      setReturning(true);
      setMode("sent");
    }
  }, [user, sessionLoading, navigate, destination, params]);

  const rememberDestination = () => {
    try {
      sessionStorage.setItem(RETURN_TO_KEY, destination);
    } catch {
      // storage unavailable — the redirect URL still carries returnTo
    }
  };

  /** Shared by both tabs: hand the form over to the "check your inbox" screen. */
  const showSent = (what: string, forWhat: "register" | "link") => {
    setSentFor(forWhat);
    setMode("sent");
    setPasswordRejected(false);
    toast.success(what, {
      description: `Check ${normalized} and click the link to continue.`,
    });
  };

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithPassword(normalized, password);
      // `onAuthStateChange` reports the new session and the effect above
      // forwards to `destination`; no navigation is needed here.
      toast.success("Signed in.");
    } catch (err) {
      setPasswordRejected(true);
      setError(
        err instanceof Error
          ? err.message
          : "That email and password did not match.",
      );
    } finally {
      setBusy(false);
    }
  };

  const register = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
      setBusy(false);
      return;
    }
    try {
      rememberDestination();
      const { session } = await signUpWithPassword(
        normalized,
        password,
        redirectTo,
      );
      if (session) {
        // Email autoconfirm is on, so the account is live already. Clearing
        // the password keeps it out of a later browser autofill for a shared
        // machine.
        setPassword("");
        toast.success("Account created.", {
          description: "You are signed in — no verification needed.",
        });
        return;
      }
      // Autoconfirm off: the emailed link is what confirms the address.
      showSent("Confirmation link sent", "register");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We could not create that account. Try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  };

  /** Fallback for accounts that have no password: the old one-tap link. */
  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      rememberDestination();
      await sendMagicLink(normalized, redirectTo);
      showSent("Sign-in link sent", "link");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We could not send the link. Try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setError(null);
    try {
      if (sentFor === "register") {
        await resendConfirmation(normalized, redirectTo);
        toast.info("New confirmation link sent.");
      } else {
        await sendMagicLink(normalized, redirectTo);
        toast.info("New sign-in link sent.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend the link.");
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: Exclude<Mode, "sent">) => {
    setMode(next);
    setError(null);
    setPasswordRejected(false);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex items-center px-4 py-5 sm:px-6">
        <Logo />
      </div>

      <main className="flex flex-1 items-start justify-center px-4 pb-16">
        <div className="glass w-full max-w-md p-8">
          {mode !== "sent" && (
            <>
              <h1 className="text-xl font-bold tracking-tight">
                {mode === "register"
                  ? "Create your account"
                  : "Welcome back"}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {mode === "register"
                  ? "Pick a password. We only email you a link to confirm the address."
                  : "Sign in with the password you registered with."}
              </p>

              <form
                onSubmit={mode === "register" ? register : signIn}
                className="mt-6 space-y-4"
              >
                <div className="grid gap-2">
                  <Label htmlFor="sb-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="sb-email"
                      type="email"
                      required
                      autoFocus
                      className="inset-well rounded-xl border-border/60 pl-9"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <div className="flex items-baseline justify-between">
                    <Label htmlFor="sb-password">Password</Label>
                    {mode === "signin" && (
                      <Link
                        to="/forgot-password"
                        className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      >
                        Forgot password?
                      </Link>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="sb-password"
                      type="password"
                      required
                      minLength={PASSWORD_MIN_LENGTH}
                      className="inset-well rounded-xl border-border/60 pl-9"
                      placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={
                        mode === "register" ? "new-password" : "current-password"
                      }
                    />
                  </div>
                </div>

                {error && (
                  <p
                    role="alert"
                    className="rounded-xl bg-destructive/10 px-4 py-3 text-xs text-destructive"
                  >
                    {error}
                  </p>
                )}

                <Button type="submit" className="w-full rounded-xl" disabled={busy}>
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : mode === "register" ? (
                    <UserPlus className="size-4" />
                  ) : (
                    <ArrowRight className="size-4" />
                  )}
                  {mode === "register" ? "Create account" : "Sign in"}
                </Button>

                {/* Escape hatch for an account that has no password at all. */}
                {passwordRejected && mode === "signin" && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full rounded-xl"
                      disabled={busy}
                      onClick={sendLink}
                    >
                      <Mail className="size-4" /> Email me a sign-in link
                    </Button>
                    <p className="text-center text-[11px] leading-snug text-muted-foreground">
                      No password on this account? Use a one-time link instead,
                      or{" "}
                      <Link
                        to="/forgot-password"
                        className="underline underline-offset-2 hover:text-foreground"
                      >
                        set a new password
                      </Link>
                      .
                    </p>
                  </>
                )}
              </form>

              <div className="mt-6 border-t border-border pt-4 text-center text-sm text-muted-foreground">
                {mode === "register" ? (
                  <>
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("signin")}
                      className="font-semibold text-foreground underline-offset-2 hover:underline"
                    >
                      Sign in
                    </button>
                  </>
                ) : (
                  <>
                    New to AccsMartHub?{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("register")}
                      className="font-semibold text-foreground underline-offset-2 hover:underline"
                    >
                      Create an account
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          {mode === "sent" && (
            <>
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10">
                {busy && !user ? (
                  <Loader2 className="size-5 animate-spin text-primary" />
                ) : (
                  <MailCheck className="size-5 text-primary" />
                )}
              </div>                <h1 className="mt-4 text-xl font-bold tracking-tight">
                {returning && !user ? "Finishing sign-in…" : "Check your email"}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {normalized && !returning
                  ? `We sent a link to ${normalized}. Open it to confirm your address and continue — the link works once and expires shortly.`
                  : "Signing you in and taking you to your account…"}
              </p>

              {error && (
                <p
                  role="alert"
                  className="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-xs text-destructive"
                >
                  {error}
                </p>
              )}

              {!returning && (
                <div className="mt-6 flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full rounded-xl"
                    disabled={busy}
                    onClick={resend}
                  >
                    Resend link
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full rounded-xl"
                    disabled={busy}
                    onClick={() => {
                      setMode("signin");
                      setError(null);
                    }}
                  >
                    <ArrowLeft className="size-4" /> Back to sign in
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <footer className="px-4 pb-6 text-center text-xs text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          ← Back to marketplace
        </Link>
      </footer>
    </div>
  );
}
