import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowRight, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/site/Logo";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

/** Supabase rejects these, so catching it here saves a round trip. */
function weakness(password: string): string | null {
  if (password.length < 8) return "Use at least 8 characters.";
  if (!/[a-zA-Z]/.test(password)) return "Include at least one letter.";
  if (!/[0-9]/.test(password)) return "Include at least one number.";
  return null;
}

/**
 * Set a new password from a recovery link.
 *
 * Supabase puts a single-use token in the URL fragment. The client is
 * configured with `detectSessionInUrl`, so by the time this renders the
 * token has already been exchanged for a short-lived recovery session.
 *
 * If that exchange failed — link expired, already used, or opened in a
 * different browser — there is no session and we say so plainly instead of
 * showing a form that cannot possibly work.
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState<"checking" | "ok" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setReady(data.session ? "ok" : "invalid");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const weak = weakness(password);
    if (weak) {
      setError(weak);
      return;
    }
    if (password !== confirm) {
      setError("Those two passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      toast.success("Password updated", {
        description: "You are signed in with your new password.",
      });
      navigate("/account", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "We could not update your password.",
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
          {ready === "checking" && (
            <div className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Checking your reset link…
            </div>
          )}

          {ready === "invalid" && (
            <>
              <div className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10">
                <KeyRound className="size-5 text-destructive" />
              </div>
              <h1 className="mt-4 text-xl font-bold tracking-tight">
                This link is no longer valid
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Reset links expire after an hour and can only be used once.
                Request a fresh one and open it in the same browser.
              </p>
              <Button asChild className="mt-5 w-full rounded-xl">
                <Link to="/forgot-password">
                  Request a new link
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </>
          )}

          {ready === "ok" && (
            <>
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10">
                <KeyRound className="size-5 text-primary" />
              </div>
              <h1 className="mt-4 text-xl font-bold tracking-tight">
                Choose a new password
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                At least 8 characters, including a letter and a number.
              </p>

              <form onSubmit={submit} className="mt-6 space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    required
                    autoFocus
                    autoComplete="new-password"
                    className="inset-well rounded-xl border-border/60"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    required
                    autoComplete="new-password"
                    className="inset-well rounded-xl border-border/60"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
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
                    <ArrowRight className="size-4" />
                  )}
                  Save new password
                </Button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}