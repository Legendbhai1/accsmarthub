import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Mail,
  MailCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/site/Logo";
import { sendEmailCode, verifyEmailCode } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { roleHome } from "@/components/site/guards";
import { toast } from "sonner";

type Mode = "email" | "otp" | "done";

/**
 * Supabase email verification.
 *
 * Enter an address, Supabase emails a six-digit code, entering the correct
 * code verifies the address AND creates the account if it is new — so the
 * same screen both signs in and registers. There is no password anywhere.
 *
 * This deliberately does NOT redirect into the dashboards on success. Those
 * screens still read from the previous backend, so a redirect here would
 * bounce straight back to the sign-in screen. The verified state is shown
 * in place instead, and the data layer is moved across next.
 */
export default function SupabaseAuth() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useSession();
  const [mode, setMode] = useState<Mode>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = email.trim().toLowerCase();

  // Wait for the session provider to pick up the new Supabase session before
  // navigating, otherwise the destination guard bounces straight back here.
  const returnTo = params.get("returnTo");
  const destination = returnTo?.startsWith("/") ? returnTo : roleHome.buyer;

  useEffect(() => {
    if (mode === "done" && user) {
      navigate(destination, { replace: true });
    }
  }, [mode, user, destination, navigate]);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendEmailCode(normalized);
      setMode("otp");
      toast.success("Verification code sent", {
        description: `Check ${normalized} for a 6-digit code.`,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We could not send the code. Try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await verifyEmailCode(normalized, otp);
      setMode("done");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "That code is not valid.",
      );
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setError(null);
    try {
      await sendEmailCode(normalized);
      toast.info("New code sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend the code.");
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
                We&apos;ll email you a 6-digit verification code — no
                password to remember.
              </p>

              <form onSubmit={sendCode} className="mt-6 space-y-4">
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
                  Email me a code
                </Button>
              </form>
            </>
          )}

          {mode === "otp" && (
            <>
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10">
                <MailCheck className="size-5 text-primary" />
              </div>
              <h1 className="mt-4 text-xl font-bold tracking-tight">
                Check your email
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                We sent a 6-digit verification code to {normalized}. Enter it
                below to verify your address.
              </p>

              <form onSubmit={verify} className="mt-6 space-y-4">
                <Input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  autoFocus
                  className="inset-well rounded-xl border-border/60 text-center text-lg font-semibold tracking-[0.5em]"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  aria-label="Verification code"
                />

                {error && (
                  <p
                    role="alert"
                    className="rounded-xl bg-destructive/10 px-4 py-3 text-xs text-destructive"
                  >
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  className="w-full rounded-xl"
                  disabled={busy || otp.length !== 6}
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowRight className="size-4" />
                  )}
                  Verify &amp; continue
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full rounded-xl"
                  disabled={busy}
                  onClick={resend}
                >
                  Resend code
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full rounded-xl"
                  disabled={busy}
                  onClick={() => {
                    setMode("email");
                    setOtp("");
                    setError(null);
                  }}
                >
                  <ArrowLeft className="size-4" /> Use a different email
                </Button>
              </form>
            </>
          )}

          {mode === "done" && (
            <>
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10">
                <CheckCircle2 className="size-5 text-primary" />
              </div>
              <h1 className="mt-4 text-xl font-bold tracking-tight">
                Email verified
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {normalized} is confirmed. Taking you to your account…
              </p>
              <Button asChild className="mt-5 w-full rounded-xl">
                <Link to="/">
                  Continue
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
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