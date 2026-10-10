import { NavLink, useLocation } from "react-router";
import type { ReactNode } from "react";
import { Compass, Home, LayoutGrid, User } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The single mobile bottom tab bar.
 *
 * It used to be defined twice — once in `SiteLayout` and again inside
 * `Marketplace` — and the two copies disagreed. The Marketplace copy carried
 * an extra shopping-bag button pointing at `/account/purchased` while the
 * person button next to it pointed at `/account`, so the same "account"
 * concept had two icons in one bar. Worse, tapping Account dropped you into
 * `DashLayout`, which renders a *third*, completely different set of buttons,
 * so the bar appeared to change shape on every navigation.
 *
 * One definition, one place it is rendered from: the same four buttons — the
 * ones on the home page — now stay put on the marketplace and across the
 * dashboards. Dashboard sub-pages stay reachable through the scrolling chip
 * row in `DashLayout`'s header instead of hijacking the bottom bar.
 */
const MOBILE_TABS = [
  { label: "Home", to: "/", icon: Home },
  { label: "Marketplace", to: "/marketplace", icon: Compass },
  { label: "Categories", to: "/categories", icon: LayoutGrid },
  { label: "Account", to: "/account", icon: User },
] as const;

/** Is this tab the one the current URL belongs to? */
function isTabActive(to: string, pathname: string): boolean {
  if (to === "/") return pathname === "/";
  // `/account` also owns its sub-pages (orders, wallet, …) so the Account tab
  // stays lit while you move around inside the account area.
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
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4 md:hidden"
    >
      <div className="grid w-full max-w-md grid-cols-4 gap-1 rounded-full border border-border bg-card/85 p-1.5 shadow-[0_14px_36px_-14px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
        {MOBILE_TABS.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={label}
            to={to}
            end={to === "/"}
            aria-current={isTabActive(to, pathname) ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-1 rounded-full px-1 py-2 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              isTabActive(to, pathname) &&
                "bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 text-amber-950 hover:from-amber-300 hover:to-amber-600 hover:text-amber-950",
            )}
          >
            <Icon className="size-4.5" />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/**
 * The scrolling chip row that carries a dashboard's own sub-pages once the
 * shared bottom bar takes over the global navigation.
 */
export function MobileChipNav({ nav }: { nav: { label: string; to: string; icon: ReactNode }[] }) {
  return (
    <nav
      aria-label="Dashboard sections"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden"
      style={{ scrollbarWidth: "none" }}
    >
      {nav.map(({ label, to, icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/account" || to === "/seller" || to === "/admin"}
          className={({ isActive }) =>
            cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors",
              isActive
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
            )
          }
        >
          {icon}
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
