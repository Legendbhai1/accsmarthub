import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, ArrowRight, Loader2, Mail, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/site/Logo";
import { useSession, type Role } from "@/lib/session";
import { roleHome } from "@/components/site/guards";
import { cn } from "@/lib/utils";

type Mode = "login" | "register" | "otp" | "forgot";

export default function Auth() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { signIn } = useSession();

  const [mode, setMode] = useState<Mode>(params.get("mode") === "register" ? "register" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("buyer");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);

  const returnTo = params.get("returnTo");

  const finish = (chosenRole: Role) => {
    // Demo only: role is chosen at sign-in. In production this comes from the
    // server session after real authentication.
    const demoRole: Role =
      email.toLowerCase().startsWith("admin") ? "admin" : chosenRole;
    signIn(email, demoRole);
    navigate(returnTo?.startsWith("/") ? returnTo : roleHome[demoRole], { replace: true });
  };

  const submitCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    // Simulated network latency for realism in the demo.
    window.setTimeout(() => {
      setBusy(false);
      setMode("otp");
    }, 500);
  };

  const submitOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    window.setTimeout(() => finish(role), 500);
  };

  const submitForgot = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    window.setTimeout(() => {
      setBusy(false);
      setMode("login");
    }, 600);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex items-center px-4 py-5 sm:px-6">
        <Logo />
      </div>

      <main className="flex flex-1 items-start justify-center px-4 pb-16">
        <div className="glass w-full max-w-md p-8">
          {mode === "login" && (
            <>
              <h1 className="text-xl font-bold tracking-tight">Welcome back</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Sign in to buy, sell and manage your transfers.
              </p>
              <form onSubmit={submitCredentials} className="mt-6 space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      required
                      className="inset-well rounded-xl border-border/60 pl-9"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => setMode("forgot")}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    className="inset-well rounded-xl border-border/60"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                <Button type="submit" className="w-full rounded-xl" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : "Continue"}
                  <ArrowRight className="size-4" />
                </Button>
              </form>
              <p className="mt-5 text-center text-sm text-muted-foreground">
                New to AccsMartHub?{" "}
                <button className="font-medium text-primary hover:underline" onClick={() => setMode("register")}>
                  Create an account
                </button>
              </p>
            </>
          )}

          {mode === "register" && (
            <>
              <h1 className="text-xl font-bold tracking-tight">Create your account</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Join as a buyer, a seller — or both.
              </p>
              <form onSubmit={submitCredentials} className="mt-6 space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Full name</Label>
                  <Input
                    id="name"
                    required
                    className="inset-well rounded-xl border-border/60"
                    placeholder="Alex Morgan"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="reg-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="reg-email"
                      type="email"
                      required
                      className="inset-well rounded-xl border-border/60 pl-9"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="reg-password">Password</Label>
                  <Input
                    id="reg-password"
                    type="password"
                    required
                    minLength={8}
                    className="inset-well rounded-xl border-border/60"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>I want to</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { value: "buyer", label: "Buy accounts" },
                        { value: "seller", label: "Sell accounts" },
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setRole(option.value)}
                        aria-pressed={role === option.value}
                        className={cn(
                          "rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                          role === option.value
                            ? "border-primary/50 bg-primary/10 text-primary"
                            : "border-border/70 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <Button type="submit" className="w-full rounded-xl" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : "Create account"}
                  <ArrowRight className="size-4" />
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  By continuing you agree to the Terms of Service and Privacy
                  Policy.
                </p>
              </form>
              <p className="mt-5 text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <button className="font-medium text-primary hover:underline" onClick={() => setMode("login")}>
                  Sign in
                </button>
              </p>
            </>
          )}

          {mode === "otp" && (
            <>
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10">
                <MailCheck className="size-5 text-primary" />
              </div>
              <h1 className="mt-4 text-xl font-bold tracking-tight">Check your email</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                We sent a 6-digit code to {email || "your email"}. Enter it
                below to verify your address.
              </p>
              <form onSubmit={submitOtp} className="mt-6 space-y-4">
                <Input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  className="inset-well rounded-xl border-border/60 text-center text-lg font-semibold tracking-[0.5em]"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  aria-label="Verification code"
                />
                <p className="text-xs text-muted-foreground">
                  Demo tip: any 6 digits will work.
                </p>
                <Button type="submit" className="w-full rounded-xl" disabled={busy || otp.length !== 6}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : "Verify & continue"}
                  <ArrowRight className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full rounded-xl"
                  onClick={() => setMode("login")}
                >
                  <ArrowLeft className="size-4" /> Use a different email
                </Button>
              </form>
            </>
          )}

          {mode === "forgot" && (
            <>
              <h1 className="text-xl font-bold tracking-tight">Reset your password</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Enter your email and we'll send a reset link.
              </p>
              <form onSubmit={submitForgot} className="mt-6 space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="forgot-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="forgot-email"
                      type="email"
                      required
                      className="inset-well rounded-xl border-border/60 pl-9"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full rounded-xl" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : "Send reset link"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full rounded-xl"
                  onClick={() => setMode("login")}
                >
                  <ArrowLeft className="size-4" /> Back to sign in
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
