import { NavLink, useLocation } from "react-router";
import { Compass, Home, LayoutGrid, User } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The public mobile bottom tab bar.
 *
 * Mounted by `PublicLayout` (and `SiteLayout`) and nothing else. It used to be
 * rendered from four places — including both dashboard layouts — which is how
 * the public Home / Marketplace / Categories / Account tabs showed up inside
 * Seller Studio. Dashboards now use `DashShell` and never mount this.
 *
 * Categories points at `/marketplace/categories`. The tab previously linked to
 * `/categories`, which was not a declared route, so tapping it landed on the
 * 404 page.
 */
const MOBILE_TABS = [
  { label: "Home", to: "/", icon: Home },
  { label: "Marketplace", to: "/marketplace", icon: Compass },
  { label: "Categories", to: "/marketplace/categories", icon: LayoutGrid },
  { label: "Account", to: "/account", icon: User },
] as const;

/** Is this tab the one the current URL belongs to? */
function isTabActive(to: string, pathname: string): boolean {
  if (to === "/") return pathname === "/";
  // `/account` also owns its sub-pages, so the Account tab stays lit while the
  // user moves around inside the account area.
  if (to === "/account") {
    return pathname === "/account" || pathname.startsWith("/account/");
  }
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function MobileTabBar() {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Primary"
      // A floating, rounded bar rather than a full-width slab: it sits above
      // the safe area instead of through it, so the home indicator never
      // overlaps a tab. `md:hidden` keeps it to phones and small tablets.
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden"
    >
      <div className="mx-auto flex w-full max-w-md items-center justify-around gap-1 rounded-2xl border border-border bg-background/95 p-1.5 shadow-lg shadow-foreground/5 backdrop-blur-md">
        {MOBILE_TABS.map(({ label, to, icon: Icon }) => {
          const active = isTabActive(to, pathname);
          return (
            <NavLink
              key={label}
              to={to}
              end={to === "/"}
              aria-current={active ? "page" : undefined}
              className={cn(
                // `min-h-11` keeps every target at the touch minimum while
                // the bar itself stays compact.
                "flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-5" />
              <span className="truncate">{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
