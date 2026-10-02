import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, ArrowRight, Loader2, Mail, MailCheck, ShieldCheck } from "lucide-react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/site/Logo";
import { roleHome } from "@/components/site/guards";
import { toast } from "sonner";

type Mode = "email" | "otp";

/**
 * One account buys and sells — there is no role picker. Signing in sends a
 * six-digit code to the address; entering a correct code both verifies the
 * email and creates the account if it is new.
 */
export default function Auth() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { signIn } = useAuthActions();

  const [mode, setMode] = useState<Mode>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const returnTo = params.get("returnTo");
  const destination = returnTo?.startsWith("/") ? returnTo : roleHome.buyer;

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn("email-otp", { email: email.trim().toLowerCase() });
      setMode("otp");
      toast.success("Verification code sent", {
        description: `Check ${email} for a 6-digit code. It expires in 15 minutes.`,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "We could not send the code. Try again.",
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
      const res = await signIn("email-otp", {
        email: email.trim().toLowerCase(),
        code: otp.trim(),
      });
      if (!res.signingIn) {
        setError("That code is not valid. Check it and try again.");
        return;
      }
      navigate(destination, { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "That code is not valid. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn("email-otp", { email: email.trim().toLowerCase() });
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
                One account buys and sells. We&apos;ll email you a verification
                code — no password to remember.
              </p>

              <form onSubmit={sendCode} className="mt-6 space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
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

              <div className="mt-5 grid gap-2 rounded-xl bg-muted/50 px-4 py-3.5 text-xs text-muted-foreground">
                <p className="flex items-start gap-2">
                  <ShieldCheck className="mt-px size-3.5 shrink-0 text-primary" />
                  Your email must be verified before you can pay or open a store.
                </p>
                <p className="flex items-start gap-2">
                  <ShieldCheck className="mt-px size-3.5 shrink-0 text-primary" />
                  Want to sell? Set up your store after signing in and wait for
                  admin approval.
                </p>
              </div>
            </>
          )}

          {mode === "otp" && (
            <>
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10">
                <MailCheck className="size-5 text-primary" />
              </div>
              <h1 className="mt-4 text-xl font-bold tracking-tight">Check your email</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                We sent a 6-digit verification code to {email}. Enter it below
                to verify your address and continue.
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