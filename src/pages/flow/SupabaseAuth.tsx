import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  KeyRound,
  Loader2,
  Mail,
  MailCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/site/Logo";
import { sendMagicLink } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { roleHome } from "@/components/site/guards";
import { toast } from "sonner";

type Mode = "email" | "sent";

/** Where to remember the post-sign-in destination across the email round trip. */
const RETURN_TO_KEY = "accsmarthub.returnTo";

/**
 * Supabase email verification — magic link.
 *
 * Enter an address, Supabase emails a one-time sign-in link, and clicking it
 * both verifies the address AND creates the account if it is new — so the same
 * screen signs in and registers. There is no password anywhere.
 *
 * A link (rather than a 6-digit code) because the code requires `{{ .Token }}`
 * in the auth email template, and the free tier refuses template edits unless
 * a custom SMTP provider is connected. See `sendMagicLink` for the detail.
 *
 * The return trip lands back on this route with `?code=…`; supabase-js (with
 * `detectSessionInUrl`) exchanges it for a session on boot, after which this
 * component forwards to the intended destination.
 */
export default function SupabaseAuth() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, isLoading: sessionLoading } = useSession();
  const [mode, setMode] = useState<Mode>("email");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once we know this render is the post-click return trip, so a fresh
  // "sent" screen is not shown to someone who just arrived signed in.
  // State, not a ref: this value is read during render to switch the copy and
  // the resend button. A ref mutated in the effect below would not schedule a
  // re-render, so the screen could keep showing "Check your email" while the
  // user is actually mid sign-in.
  const [returning, setReturning] = useState(false);

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

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      try {
        sessionStorage.setItem(RETURN_TO_KEY, destination);
      } catch {
        // storage unavailable — the redirect URL still carries returnTo
      }
      await sendMagicLink(normalized, redirectTo);
      setMode("sent");
      toast.success("Sign-in link sent", {
        description: `Check ${normalized} and click the link to continue.`,
      });
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
      await sendMagicLink(normalized, redirectTo);
      toast.info("New link sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend the link.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex items-center px-4 py-5 sm:px-6">
        <Logo />
      </div>

      <main className="flex flex-1 items-start justify-center px-4 pb-16">
        <div className="glass w-full max-w-md p-8">
          {mode === "email" && (
            <>
              <h1 className="text-xl font-bold tracking-tight">
                Sign in or create your account
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                We&apos;ll email you a secure sign-in link — no password to
                remember.
              </p>

              <form onSubmit={sendLink} className="mt-6 space-y-4">
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
                  ) : (
                    <ArrowRight className="size-4" />
                  )}
                  Email me a sign-in link
                </Button>
                <Button asChild variant="ghost" className="w-full rounded-xl">
                  <Link to="/forgot-password">
                    <KeyRound className="size-4" /> I already have an account
                  </Link>
                </Button>
              </form>
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
              </div>
              <h1 className="mt-4 text-xl font-bold tracking-tight">
                {returning && !user ? "Finishing sign-in…" : "Check your email"}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {normalized && !returning
                  ? `We sent a sign-in link to ${normalized}. Click it to verify your address and continue — the link works once and expires shortly.`
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
                      setMode("email");
                      setError(null);
                    }}
                  >
                    <ArrowLeft className="size-4" /> Use a different email
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