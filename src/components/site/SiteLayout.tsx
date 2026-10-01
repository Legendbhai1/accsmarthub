import { useEffect, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { Compass, Home, LayoutGrid, User } from "lucide-react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { cn } from "@/lib/utils";

const MOBILE_TABS = [
  { label: "Home", to: "/", icon: Home },
  { label: "Marketplace", to: "/marketplace", icon: Compass },
  { label: "Categories", to: "/marketplace?view=categories", icon: LayoutGrid },
  { label: "Account", to: "/account", icon: User },
];

export function SiteLayout({ children }: { children?: ReactNode }) {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 pb-28 md:pb-0">
        {children ?? <Outlet />}
      </main>
      <SiteFooter />

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4 md:hidden"
      >
        <div className="grid w-full max-w-md grid-cols-4 gap-1 rounded-full border border-border bg-white p-1.5 shadow-[0_10px_30px_-12px_rgba(21,23,43,0.35)]">
          {MOBILE_TABS.map(({ label, to, icon: Icon }) => (
            <NavLink
              key={label}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 rounded-full px-1 py-2 text-[10px] font-medium text-muted-foreground transition-colors",
                  isActive && "bg-[#15172b] text-white",
                )
              }
            >
              <Icon className="size-4.5" />
              <span className="truncate">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
