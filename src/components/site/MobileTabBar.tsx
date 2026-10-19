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
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <div className="mx-auto grid w-full max-w-lg grid-cols-4 px-2 pt-1.5">
        {MOBILE_TABS.map(({ label, to, icon: Icon }) => {
          const active = isTabActive(to, pathname);
          return (
            <NavLink
              key={label}
              to={to}
              end={to === "/"}
              aria-current={active ? "page" : undefined}
              className={cn(
                // `min-h-12` keeps every target at the 48px touch minimum.
                "flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
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
