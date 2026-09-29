import { Navigate, useLocation } from "react-router";
import { useSession, type Role } from "@/lib/session";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

export const roleHome: Record<Role, string> = {
  buyer: "/account",
  seller: "/seller",
  admin: "/admin",
};

/** Sends signed-out users to /auth?returnTo=… and wrong-role users to their home. */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, isLoading } = useSession();
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

  // An approved store application also unlocks the seller area.
  const allowed =
    roles.includes(user.role) ||
    (roles.includes("seller") && user.sellerStatus === "approved");
  if (!allowed) {
    return <Navigate to={roleHome[user.role]} replace />;
  }

  return children;
}
