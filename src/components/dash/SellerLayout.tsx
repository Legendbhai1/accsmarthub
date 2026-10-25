import type { ReactNode } from "react";
import { useLocation } from "react-router";
import { DashShell } from "@/components/dash/DashShell";
import { navTitleForPath, sellerNav } from "@/components/dash/navs";
import { useSession, type SellerStatus } from "@/lib/session";

/**
 * The seller area is open to any confirmed account — a listing can be created
 * before a store profile exists — so the raw role alone does not say where
 * someone stands. Printing `role · status` produced "buyer · none", which told
 * the user nothing; this says what the state means and what happens next.
 */
export const SELLER_STATUS_LABEL: Record<SellerStatus, string> = {
  none: "No store yet — apply to start selling",
  pending: "Application under review",
  approved: "Approved seller",
  rejected: "Application not approved",
};

/**
 * Seller Studio shell, mounted *by the route* rather than by each page.
 *
 * Deliberately just `DashShell` plus the seller nav — the studio used to carry
 * its own bespoke chrome, which is how the public Home / Marketplace /
 * Categories / Account bottom bar ended up mounted inside it. One shell means
 * one navigation, and that navigation is never the public one.
 *
 * It sits above the route's `<Outlet/>`, so the rail, header and drawer stay
 * mounted as the seller moves between studio pages instead of being rebuilt on
 * every tap. The title comes from the nav so it cannot disagree with the
 * highlighted rail entry; the pages no longer pass one in.
 */
export function SellerShell({ children }: { children?: ReactNode }) {
  const { pathname } = useLocation();
  const { user } = useSession();

  // The pathname never carries a query string, so the nav's `?new=1` shortcut
  // entry is compared by its path alone inside `navTitleForPath`.
  const title = navTitleForPath(sellerNav, pathname, "Seller studio");

  return (
    <DashShell
      nav={sellerNav}
      title={title}
      subtitle={SELLER_STATUS_LABEL[user?.sellerStatus ?? "none"]}
    >
      {children}
    </DashShell>
  );
}
