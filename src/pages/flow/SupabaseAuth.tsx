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
 * How long to wait for supabase-js to turn `?code=…` into a session before
 * calling the link dead. The exchange is a single request, so this is generous.
 */
const LINK_WAIT_MS = 10_000;

/** Shown when the exchange of `?code=…` never produced a session. */
const LINK_DEAD_COPY =
  "That sign-in link could not be completed. It may have expired, already have been used, or been opened in a different browser than the one that asked for it — request a new one below.";

/** GoTrue's `?error=` codes, in words. */
const LINK_ERROR_COPY: Record<string, string> = {
  otp_expired: "That sign-in link has expired. Request a new one below.",
  otp_disabled: "That sign-in link can no longer be used. Request a new one below.",
  access_denied: "That sign-in link has already been used. Request a new one below.",
  invalid_request: "That sign-in link is not valid. Request a new one below.",
};

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
    // A link GoTrue refused comes back with `?error=…` and no code, and the
    // honest place to land is the "we could not sign you in" screen rather than
    // a blank form with no explanation.
    params.get("error")
      ? "sent"
      : params.get("mode") === "register"
        ? "register"
        : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once a password sign-in was rejected, which is what reveals the
  // "email me a link instead" escape hatch for passwordless accounts.
  const [passwordRejected, setPasswordRejected] = useState(false);
  // What the "check your inbox" screen is waiting on, so Resend re-sends the
  // right kind of link: the registration confirmation or the sign-in link.
  const [sentFor, setSentFor] = useState<"register" | "link">("link");
  // Set by the deadline below when `?code=…` never became a session. In state
  // because it changes on a timer; everything else here is derived.
  const [linkExpired, setLinkExpired] = useState(false);
  // Set once the user asks for another link or backs out, which retires the
  // link they arrived on.
  const [linkDismissed, setLinkDismissed] = useState(false);

  const normalized = email.trim().toLowerCase();

  // GoTrue reports a link it would not accept by redirecting here with `?error=`
  // (and no code at all), so there is nothing to wait for in that case.
  const linkErrorCode = params.get("error");
  const linkErrorDetail = params.get("error_description");
  const linkError =
    linkErrorDetail ??
    (linkErrorCode ? (LINK_ERROR_COPY[linkErrorCode] ?? linkErrorCode) : null);

  // The whole emailed-link return trip is DERIVED from the URL plus the two
  // flags above, instead of being mirrored into state by an effect. Mirroring
  // is what made this screen unrecoverable: the effect that set "returning" had
  // to be the same one that unset it, and when the exchange failed silently
  // nothing ever did — the page sat on "Finishing sign-in…" for ever with the
  // Resend and Back buttons hidden behind `!returning`.
  const hasLinkParams = !!(params.get("code") || params.get("token"));
  const awaitingLink = hasLinkParams && !linkDismissed;
  const linkFailed = (!!linkError || linkExpired) && !linkDismissed;
  const returning = awaitingLink && !linkExpired && !user;
  // A dead link lands on the "check your inbox" screen, the only one that
  // offers "Resend link" and "Back to sign in" — a dead link must not be a dead
  // end for someone who has no password to fall back on.
  const screen: Mode = returning || linkFailed ? "sent" : mode;
  const shownError =
    error ?? (linkFailed ? (linkError ?? LINK_DEAD_COPY) : null);

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
      return;
    }
    if (sessionLoading || !awaitingLink || linkExpired) return;

    // The exchange runs inside supabase-js and can fail without ever firing an
    // event: an expired or already-used link, or — the common one — a link
    // opened somewhere other than the browser that requested it, such as a mail
    // app's built-in viewer, where the PKCE verifier stored for that link does
    // not exist. So the wait gets a deadline, after which the screen says what
    // went wrong and offers a way forward. Setting state from the timer callback
    // is fine; setting it in the effect body is not.
    const timer = setTimeout(() => setLinkExpired(true), LINK_WAIT_MS);
    return () => clearTimeout(timer);
  }, [user, sessionLoading, navigate, destination, awaitingLink, linkExpired]);

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
      toast.success("Signed in.");
      // Navigate here rather than waiting for the effect above to notice the
      // new session: that path needs the profile row to load before `user`
      // stops being null, and when that read failed the result was a "Signed
      // in." toast on a form that never moved. The route guards render a
      // spinner until the profile arrives, so leaving now is safe.
      navigate(destination, { replace: true });
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
      // The link this page arrived on is now spent, whether or not it was the
      // one that failed.
      setLinkDismissed(true);
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
          {screen !== "sent" && (
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

                {shownError && (
                  <p
                    role="alert"
                    className="rounded-xl bg-destructive/10 px-4 py-3 text-xs text-destructive"
                  >
                    {shownError}
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

          {screen === "sent" && (
            <>
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10">
                {busy && !user ? (
                  <Loader2 className="size-5 animate-spin text-primary" />
                ) : (
                  <MailCheck className="size-5 text-primary" />
                )}
              </div>
              <h1 className="mt-4 text-xl font-bold tracking-tight">
                {returning && !user
                  ? "Finishing sign-in…"
                  : linkFailed
                    ? "That link did not work"
                    : "Check your email"}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {returning
                  ? "Signing you in and taking you to your account…"
                  : normalized
                    ? `We sent a link to ${normalized}. Open it to confirm your address and continue — the link works once and expires shortly.`
                    : "Request a new sign-in link below to continue."}
              </p>

              {shownError && (
                <p
                  role="alert"
                  className="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-xs text-destructive"
                >
                  {shownError}
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
                      // Retire the link this page arrived on: without this the
                      // derivations above would keep sending the user back to
                      // the failure screen they are trying to leave.
                      setLinkDismissed(true);
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
