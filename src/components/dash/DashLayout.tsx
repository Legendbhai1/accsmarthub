import { useEffect, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { ArrowRightLeft, ShoppingBag, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/site/Logo";
import { MobileChipNav, MobileTabBar } from "@/components/site/MobileTabBar";
import { TopMenu } from "@/components/site/TopMenu";
import { useSession } from "@/lib/session";

export type NavItem = { label: string; to: string; icon: React.ComponentType<{ className?: string }> };

export function DashLayout({
  title,
  nav,
  badge,
  children,
}: {
  title: string;
  nav: NavItem[];
  badge?: string;
  children?: ReactNode;
}) {
  const { user, signOut } = useSession();
  const location = useLocation();

  useEffect(() => {
    // `instant` overrides the global `scroll-behavior: smooth` so switching
    // dashboard pages jumps straight to the top instead of gliding.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname]);

  // Cross-role navigation: buyers can jump to their seller dashboard (after
  // approval) and sellers back to their buyer account, from the same shell.
  const area = nav[0]?.to.startsWith("/seller")
    ? "seller"
    : nav[0]?.to.startsWith("/admin")
      ? "admin"
      : "buyer";
  const canSell =
    user?.role === "seller" ||
    user?.role === "admin" ||
    user?.sellerStatus === "approved";
  const switchItems: NavItem[] =
    area === "buyer"
      ? canSell
        ? [{ label: "Seller dashboard", to: "/seller", icon: ArrowRightLeft }]
        : [{ label: "Become a seller", to: "/seller/apply", icon: Store }]
      : area === "seller"
        ? [{ label: "Buyer account", to: "/account", icon: ShoppingBag }]
        : [
            { label: "Seller dashboard", to: "/seller", icon: ArrowRightLeft },
            { label: "Buyer account", to: "/account", icon: ShoppingBag },
          ];
  const fullNav: NavItem[] = [...nav, ...switchItems];

  return (
    <div className="relative flex min-h-screen">
      {/* Ambient glass wash — the same light the seller studio and the public
          pages sit in, so the buyer and admin shells read as one product. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-1/4 left-0 h-4/5 w-2/5 rounded-full bg-gradient-to-br from-amber-400/[0.14] to-amber-600/[0.02] blur-3xl" />
        <div className="absolute right-[-18%] top-1/3 h-3/5 w-1/2 rounded-full bg-gradient-to-bl from-violet-400/[0.09] to-amber-400/[0.02] blur-3xl" />
      </div>

      {/* Sidebar (desktop) — translucent glass rail with hairline separators */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border/60 bg-card/70 backdrop-blur-2xl lg:flex">
        <div className="flex h-20 items-center border-b border-border/40 px-6">
          <Logo />
        </div>
        <nav aria-label="Dashboard" className="flex-1 space-y-1 overflow-y-auto px-4 py-3">
          {fullNav.map(({ label, to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/account" || to === "/seller" || to === "/admin"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-amber-400/10 hover:text-foreground",
                  isActive &&
                    "bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 font-semibold text-amber-950 hover:from-amber-300 hover:to-amber-600 hover:text-amber-950",
                )
              }
            >
              <Icon className="size-4.5" />
              {label}
              {badge === label && (
                <span className="ml-auto flex size-5 items-center justify-center rounded-full bg-destructive                  text-[10px] font-bold text-white">
                  1
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border/40 p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-600 text-sm font-bold text-amber-950">
              {(user?.name ?? "?").charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{user?.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{user?.email}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="mt-4 w-full rounded-full bg-primary py-2.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-85"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-border/60 bg-card/70 backdrop-blur-2xl">
          <div className="flex h-20 items-center gap-3 px-4 sm:px-6">
            <div className="lg:hidden">
              <Logo />
            </div>
            <h1 className="ml-auto text-sm font-medium text-muted-foreground lg:ml-0">
              {title}
            </h1>
            <span className="hidden rounded-full border border-amber-500/30 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold capitalize text-amber-800 sm:inline-flex dark:text-amber-300">
              {user?.role}
            </span>
            <TopMenu className="lg:hidden" />
          </div>
        </header>
        <main className="flex-1 px-4 pb-32 pt-4 sm:px-6 lg:px-8 lg:pb-8 lg:pt-8">
          {/* The dashboard's own pages move up here on mobile: the bottom bar
              now holds the shared Home / Marketplace / Categories / Account
              buttons, so these must live somewhere else. */}
          <div className="mb-4">
            <MobileChipNav
              nav={fullNav.map(({ label, to, icon: Icon }) => ({
                label,
                to,
                icon: <Icon className="size-3.5" />,
              }))}
            />
          </div>
          <div className="mx-auto w-full max-w-6xl">{children ?? <Outlet />}</div>
        </main>
      </div>

      {/* Mobile bottom nav — the shared app bar, identical to the one on the
          home page, so tapping Account no longer swaps the buttons out. */}
      <MobileTabBar />
    </div>
  );
}
