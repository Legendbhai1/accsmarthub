import { useState, type ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { Loader2, LogOut, MailCheck, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resendConfirmation } from "@/lib/supabase";
import { useSession, type Role } from "@/lib/session";
import { toast } from "sonner";

export const roleHome: Record<Role, string> = {
  buyer: "/account",
  seller: "/seller",
  admin: "/admin",
};

/**
 * Holds a signed-in account at the door until the address is confirmed.
 *
 * Server-side this is already enforced — GoTrue refuses to issue a session
 * for an unconfirmed address — but the client has to render *something* when
 * it happens, and a blank redirect loop is not that. Everything destructive
 * here (resend, sign out, use another account) is a real action, so the
 * screen is a dead end only if the user makes it one.
 */
function VerifyEmailGate({
  email,
  onSignOut,
}: {
  email: string;
  onSignOut: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  const resend = async () => {
    setBusy(true);
    try {
      await resendConfirmation(email, `${window.location.origin}/auth`);
      toast.success("Confirmation link sent again.", {
        description: `Open the link in the email sent to ${email}.`,
      });
    } catch {
      toast.error("We could not resend the link.", {
        description: "Wait a moment and try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-start justify-center px-4 py-16">
      <div className="glass w-full max-w-md p-8 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10">
          <MailCheck className="size-5 text-primary" />
        </span>
        <h1 className="mt-4 text-xl font-bold tracking-tight">
          Confirm your email address
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We sent a link to{" "}
          <span className="font-medium text-foreground">{email}</span>. Open it
          to activate this account — until the address is confirmed the
          marketplace stays locked, which is what keeps one person from
          registering a fresh account after every dispute.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <Button
            type="button"
            className="w-full rounded-xl"
            disabled={busy}
            onClick={resend}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Resend confirmation link
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-xl"
            disabled={busy}
            onClick={() => void onSignOut()}
          >
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>

        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
          Open the link in the same browser you signed up in, and check spam if
          it has not arrived after a minute. Wrong address?{" "}
          <Link
            to="/auth"
            className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
          >
            Start over
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

/** Sends signed-out users to /auth?returnTo=… and wrong-role users to their home. */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, isLoading, signOut } = useSession();
  const location = useLocation();

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!user) {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/auth?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }

  // An address that has never been confirmed cannot enter the product, even
  // when a session exists.
  if (!user.emailVerified) {
    return <VerifyEmailGate email={user.email} onSignOut={signOut} />;
  }

  // An approved store application also unlocks the seller area.
  const allowed =
    roles.includes(user.role) ||
    (roles.includes("seller") && user.sellerStatus === "approved");
  if (!allowed) {
    return <Navigate to={roleHome[user.role]} replace />;
  }

  return children;
}
