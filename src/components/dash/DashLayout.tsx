import type { ReactNode } from "react";
import { useLocation } from "react-router";
import { DashShell } from "@/components/dash/DashShell";
import {
  adminNav,
  buyerNav,
  navTitleForPath,
  type NavSection,
} from "@/components/dash/navs";

/**
 * The buyer and admin workspace shell, mounted *by the route* rather than by
 * each page.
 *
 * It used to be the other way round: every page wrapped itself in a
 * `DashLayout`, so the header, the rail and the bottom bar were torn down and
 * rebuilt on every navigation inside a workspace — a jump the user sees as the
 * chrome blinking, plus a fresh entrance animation on chrome that had not
 * changed. Mounting it once above the route's `<Outlet/>` keeps it stable for
 * the whole workspace.
 *
 * The title is derived from the nav, because the shell no longer has a page
 * above it to pass one in. That is also what keeps the header and the
 * highlighted rail entry in agreement instead of drifting apart.
 */
export function DashLayout({
  nav,
  fallbackTitle,
  children,
}: {
  nav: NavSection[];
  /** Shown when the path matches no nav entry — e.g. an order detail page. */
  fallbackTitle: string;
  children?: ReactNode;
}) {
  const { pathname } = useLocation();
  const title = navTitleForPath(nav, pathname, fallbackTitle);

  return (
    <DashShell nav={nav} title={title}>
      {children}
    </DashShell>
  );
}

/**
 * The buyer account shell — `DashLayout` with the buyer nav baked in.
 *
 * The two workspaces share one shell and differ only in the nav they pass, so
 * this is a thin naming layer rather than a second implementation. The buyer
 * workspace is the one that also mounts the public bottom tab bar, which
 * `DashShell` gates on the pathname.
 */
export function BuyerShell({ children }: { children?: ReactNode }) {
  return (
    <DashLayout nav={buyerNav} fallbackTitle="Buyer account">
      {children}
    </DashLayout>
  );
}

/** The admin console shell — `DashLayout` with the admin nav baked in. */
export function AdminShell({ children }: { children?: ReactNode }) {
  return (
    <DashLayout nav={adminNav} fallbackTitle="Admin console">
      {children}
    </DashLayout>
  );
}
