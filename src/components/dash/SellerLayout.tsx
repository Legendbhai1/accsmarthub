import { useEffect, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import {
  AlertCircle,
  ArrowRightLeft,
  BarChart3,
  Fingerprint,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  PlusCircle,
  Receipt,
  Settings,
  ShoppingBag,
  User,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileChipNav, MobileTabBar } from "@/components/site/MobileTabBar";
import { TopMenu } from "@/components/site/TopMenu";
import { useSession } from "@/lib/session";

export type SellerNavItem = {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
};

const STUDIO_NAV: SellerNavItem[] = [
  { label: "Dashboard", to: "/seller", icon: LayoutDashboard },
  { label: "My listings", to: "/seller/listings", icon: ShoppingBag },
  // `?new=1` opens the listing editor directly — the editor already reads
  // this param, so the button is a shortcut rather than a separate page.
  { label: "Create listing", to: "/seller/listings?new=1", icon: PlusCircle },
  { label: "Orders", to: "/seller/orders", icon: Receipt },
  { label: "Transactions", to: "/seller/transactions", icon: Wallet },
  { label: "Analytics", to: "/seller/analytics", icon: BarChart3 },
  { label: "Disputes", to: "/seller/disputes", icon: AlertCircle },
  { label: "Earnings", to: "/seller/earnings", icon: Wallet },
  { label: "Store settings", to: "/seller/settings", icon: Settings },
  { label: "Profile", to: "/seller/profile", icon: User },
];

const STUDIO_SECONDARY: SellerNavItem[] = [
  { label: "Support chat", to: "/account/support", icon: MessageSquare },
  { label: "Buyer account", to: "/account", icon: ArrowRightLeft },
];

/**
 * The seller studio shell.
 *
 * Deliberately its own layout rather than a variant of `DashLayout`: the
 * seller area is a workbench (inventory, ledger, disputes) and it reads as a
 * distinct workspace — its own rail, its own top bar and its own glass
 * surface — while the buyer dashboard keeps the shared app chrome.
 */
export function SellerLayout({
  title,
  badge,
  children,
}: {
  title?: string;
  badge?: string;
  children?: ReactNode;
}) {
  const { user, signOut } = useSession();
  const location = useLocation();

  useEffect(() => {
    // `instant` overrides the global `scroll-behavior: smooth` so moving
    // between studio pages jumps to the top instead of gliding.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname]);

  const initials = (user?.name ?? "?").charAt(0).toUpperCase();

  return (
    <div className="seller-studio relative min-h-screen bg-background">
      {/* Ambient glass washes behind the shell */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <div className="absolute -top-1/3 left-0 h-4/5 w-2/5 rounded-full bg-gradient-to-br from-amber-400/[0.12] to-amber-600/[0.02] blur-3xl" />
        <div className="absolute right-[-20%] top-1/4 h-3/5 w-1/2 rounded-full bg-gradient-to-bl from-violet-400/[0.08] to-amber-400/[0.02] blur-3xl" />
      </div>

      {/* Rail (desktop) */}
      <aside className="seller-sidebar fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border/50 backdrop-blur-2xl lg:flex">
        <div className="seller-brand flex h-20 items-center gap-3 border-b border-border/40 px-5">
          <span className="seller-brand-mark flex size-9 items-center justify-center bg-gradient-to-br from-amber-400 to-amber-600 shadow-sm">
            <Fingerprint className="size-5 text-white" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold tracking-tight">
              Seller studio
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {user?.email}
            </span>
          </span>
        </div>

        <nav aria-label="Seller" className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {STUDIO_NAV.map(({ label, to, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={to === "/seller"}
                  className={({ isActive }) =>
                    cn(
                      "seller-nav-item flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-amber-400/10 hover:text-foreground",
                      isActive &&
                        "seller-nav-item-active bg-amber-400/15 text-amber-800 hover:bg-amber-400/15 hover:text-amber-800 dark:text-amber-300",
                    )
                  }
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {badge === label && (
                    <span className="flex size-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
                      1
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>

          <p className="mt-6 px-3.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Elsewhere
          </p>
          <ul className="mt-1 space-y-1">
            {STUDIO_SECONDARY.map(({ label, to, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-amber-400/10 hover:text-foreground"
                >
                  <Icon className="size-4 shrink-0" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="seller-sidebar-footer border-t border-border/40 p-4">
          <div className="seller-sidebar-user flex items-center gap-3 border border-border/40 bg-card/60 px-4 py-3 backdrop-blur-sm">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-sm font-bold text-white">
              {initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">
                {user?.name}
              </span>
              <span className="block truncate text-xs capitalize text-muted-foreground">
                {user?.role}
                {user?.sellerStatus ? ` · ${user.sellerStatus}` : ""}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-muted/60 py-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="relative z-10 flex min-w-0 flex-col lg:pl-64">
        <header className="seller-topbar sticky top-0 z-30 border-b border-border/40 bg-card/70 backdrop-blur-xl">
          <div className="seller-topbar-inner flex h-16 items-center gap-3 px-4 sm:px-6">
            <span className="inline-flex items-center gap-2 rounded-full bg-amber-400/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300 lg:hidden">
              <Fingerprint className="size-3.5" />
              Studio
            </span>
            <h1 className="ml-auto truncate text-sm font-medium text-muted-foreground lg:ml-0">
              {title ?? "Seller studio"}
            </h1>
            <span className="hidden rounded-full border border-amber-500/30 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-800 sm:inline-flex dark:text-amber-300">
              seller
            </span>
            <TopMenu className="lg:hidden" />
          </div>
        </header>

        <main className="seller-content flex-1 px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
          {/* The shared bottom bar carries the global tabs, so the studio's
              own sections scroll here on small screens. */}
          <div className="mb-4">
            <MobileChipNav
              nav={STUDIO_NAV.map(({ label, to, icon: Icon }) => ({
                label,
                to,
                icon: <Icon className="size-3.5" />,
              }))}
            />
          </div>
          <div className="mx-auto w-full max-w-5xl">
            {children ?? <Outlet />}
          </div>
        </main>
      </div>

      <MobileTabBar />
    </div>
  );
}
