import type { ReactNode } from "react";
import { useLocation } from "react-router";
import { DashShell } from "@/components/dash/DashShell";
import { flatNav, sellerNav } from "@/components/dash/navs";
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
 * Seller Studio shell.
 *
 * Deliberately just `DashShell` plus the seller nav — the studio used to carry
 * its own bespoke chrome, which is how the public Home / Marketplace /
 * Categories / Account bottom bar ended up mounted inside it. One shell means
 * one navigation, and that navigation is never the public one.
 */
export function SellerLayout({
  title,
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  const { pathname } = useLocation();
  const { user } = useSession();

  // Most studio pages already pass a title. When one does not, take the label
  // from the nav so the header and the highlighted rail entry always agree.
  const derived =
    title ??
    flatNav(sellerNav).find((item) => item.to.split("?")[0] === pathname)
      ?.label ??
    "Seller studio";

  return (
    <DashShell
      nav={sellerNav}
      title={derived}
      subtitle={SELLER_STATUS_LABEL[user?.sellerStatus ?? "none"]}
    >
      {children}
    </DashShell>
  );
}
