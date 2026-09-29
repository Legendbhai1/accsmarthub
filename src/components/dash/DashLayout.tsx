import { useEffect, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { ArrowRightLeft, ShoppingBag, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/site/Logo";
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
    window.scrollTo(0, 0);
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
  const mobileNav: NavItem[] = [...nav.slice(0, 4), ...switchItems.slice(0, 1)];

  return (
    <div className="flex min-h-screen">
      {/* Sidebar (desktop) */}
      <aside className="panel fixed inset-y-0 left-0 z-40 hidden w-60 flex-col rounded-none border-y-0 border-l-0 lg:flex">
        <div className="flex h-16 items-center border-b border-border/70 px-5">
          <Logo />
        </div>
        <nav aria-label="Dashboard" className="flex-1 space-y-1 overflow-y-auto p-3">
          {fullNav.map(({ label, to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/account" || to === "/seller" || to === "/admin"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  isActive && "bg-primary/12 text-primary",
                )
              }
            >
              <Icon className="size-4.5" />
              {label}
              {badge === label && (
                <span className="ml-auto flex size-5 items-center justify-center rounded-full bg-red-500/15 text-[10px] font-bold text-red-600">
                  1
              </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border/70 p-4">
          <p className="truncate text-sm font-medium">{user?.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          <button
            type="button"
            onClick={signOut}
            className="mt-3 w-full rounded-xl border border-border/70 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-30 border-b border-border/70 bg-background/70 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            {/* Mobile: horizontal nav */}
            <div className="flex items-center gap-2 overflow-x-auto lg:hidden">
              <Logo />
            </div>
            <h1 className="ml-auto text-sm font-medium text-muted-foreground lg:ml-0">
              {title}
            </h1>
            <span className="hidden rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary sm:inline">
              {user?.role}
            </span>
          </div>
        </header>
        <main className="flex-1 p-4 pb-24 sm:p-6 lg:pb-6">
          {children ?? <Outlet />}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MobileDashNav nav={mobileNav} badge={badge} />
    </div>
  );
}

function MobileDashNav({ nav, badge }: { nav: NavItem[]; badge?: string }) {
  return (
    <nav
      aria-label="Dashboard mobile navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/90 backdrop-blur-xl lg:hidden"
    >
      <div className="flex overflow-x-auto">
        {nav.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/account" || to === "/seller" || to === "/admin"}
            className={({ isActive }) =>
              cn(
                "flex min-w-20 flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium text-muted-foreground",
                isActive && "text-primary",
              )
            }
          >
            <span className="relative">
              <Icon className="size-5" />
              {badge === label && (
                <span className="absolute -right-1 -top-0.5 size-2 rounded-full bg-red-500" />
              )}
            </span>
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
