import { useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Loader2, MailCheck, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/site/Logo";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

/**
 * Request a password-reset email.
 *
 * Supabase sends a single-use recovery link. Opening it lands on
 * /reset-password, where `detectSessionInUrl` turns the token in the URL
 * into a short-lived session and the new password can be set.
 *
 * We deliberately always show the same confirmation, whether or not the
 * address exists — otherwise this page becomes a way to discover which
 * emails have accounts.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        {
          // Must be allow-listed in Supabase → Auth → URL Configuration,
          // otherwise Supabase silently redirects to the Site URL instead
          // and the user lands on the homepage with a dead link.
          redirectTo: `${window.location.origin}/reset-password`,
        },
      );
      if (err) throw err;
      setSent(true);
      toast.success("Recovery email sent", {
        description: "Check your inbox for the reset link.",
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We could not send that email. Try again in a moment.",
      );
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
          {sent ? (
            <>
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10">
                <MailCheck className="size-5 text-primary" />
              </div>
              <h1 className="mt-4 text-xl font-bold tracking-tight">
                Check your email
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                If an account exists for {email.trim().toLowerCase()}, a reset
                link is on its way. The link expires in one hour and can only
                be used once.
              </p>
              <div className="mt-5 rounded-xl bg-muted/50 px-4 py-3.5 text-xs text-muted-foreground">
                <p>
                  Nothing arrived? Check spam, then confirm your Supabase
                  redirect URLs include this site&apos;s address.
                </p>
              </div>
              <Button asChild variant="ghost" className="mt-4 w-full rounded-xl">
                <Link to="/auth">
                  <ArrowLeft className="size-4" /> Back to sign in
                </Link>
              </Button>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold tracking-tight">
                Reset your password
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Enter the email on your account and we&apos;ll send you a link
                to choose a new password.
              </p>

              <form onSubmit={submit} className="mt-6 space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    required
                    autoFocus
                    className="inset-well rounded-xl border-border/60"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
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
                    <Send className="size-4" />
                  )}
                  Send reset link
                </Button>
                <Button asChild variant="ghost" className="w-full rounded-xl">
                  <Link to="/auth">
                    <ArrowLeft className="size-4" /> Back to sign in
                  </Link>
                </Button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}