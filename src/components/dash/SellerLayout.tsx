import { useEffect, type ReactNode, useId } from "react";
import { NavLink, useLocation } from "react-router";
import {
  LayoutDashboard,
  ShoppingBag,
  PlusCircle,
  Receipt,
  Wallet,
  BarChart3,
  AlertCircle,
  MessageSquare,
  Settings,
  User,
  Fingerprint,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileChipNav, MobileTabBar, TopMenu } from "@/components/site/MobileTabBar";
import { useSession } from "@/lib/session";

export type SellerNavItem = {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV: SellerNavItem[] = [
  { label: "Dashboard", to: "/seller", icon: LayoutDashboard },
  { label: "My listings", to: "/seller/listings", icon: ShoppingBag },
  { label: "Create listing", to: "/seller/listings?new=1", icon: PlusCircle },
  { label: "Orders", to: "/seller/orders", icon: Receipt },
  { label: "Transactions", to: "/seller/transactions", icon: Wallet },
  { label: "Analytics", to: "/seller/analytics", icon: BarChart3 },
  { label: "Disputes", to: "/seller/disputes", icon: AlertCircle },
  { label: "Support", to: "/account/support", icon: MessageSquare },
  { label: "Earnings", to: "/seller/earnings", icon: Wallet },
  { label: "Store settings", to: "/seller/settings", icon: Settings },
  { label: "Profile", to: "/seller/profile", icon: User },
];

const FOOTER_NOTE = [
  { label: "Help centre", to: "/account/support" },
  { label: "Seller guidelines", to: "/seller/apply" },
  { label: "Report a problem", to: "/account/support" },
];

export function SellerLayout({ children }: { children?: ReactNode }) {
  const { user, signOut } = useSession();
  const location = useLocation();
  const id = useId();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname]);

  return (
    <div className="seller-dashboard min-h-screen bg-[var(--seller-bg)]">
      {/* Ambient glass sheets behind the shell */}
      <div aria-hidden="true" className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute left-0 top-[-30%] h-[80%] w-[45%] rounded-full bg-gradient-to-br from-amber-300/[0.10] to-amber-500/[0.02]" />
        <div className="absolute right-[-20%] top-[20%] h-[70%] w-[55%] rounded-full bg-gradient-to-bl from-violet-300/[0.08] to-amber-400/[0.02]" />
        <div className="absolute bottom-0 left-1/2 h-[40%] w-full border-t border-border/40" />
      </div>

      <div className="seller-shell relative z-10 flex min-h-screen">
        {/* Left rail */}
        <aside
          aria-label="Seller navigation"
          className="seller-sidebar flex w-[260px] shrink-0 flex-col border-r border-border/50 bg-card/70 backdrop-blur-xl lg:block"
        >
          {/* Brand strip */}
          <div className="seller-brand flex h-22 items-center gap-3 border-b border-border/40 px-5">
            <span className="seller-brand-mark flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-base font-semibold text-white shadow-sm">
              <Fingerprint className="size-4.5" />
            </span>
            <span className="text-sm font-semibold tracking-tight">Studio</span>
            <span className="ml-auto rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
              seller
            </span>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <ul className="space-y-1">
              {NAV.map(({ label, to, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === "/seller"}
                    className={({ isActive }) =>
                      cn(
                        "seller-nav-item block rounded-xl px-3.5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-amber-400/10 hover:text-foreground",
                        isActive && "seller-nav-item-active bg-amber-400/15 text-amber-700 shadow-sm",
                      )
                    }
                  >
                    <Icon className={cn("mr-3 shrink-0 inline-flex size-4.5", isActive ? "text-amber-600" : "")} />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          {/* Footer */}
          <div className="seller-sidebar-footer border-t border-border/40 p-4">
            <ul className="space-y-1">
              {FOOTER_NOTE.map(({ label, to }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    className={({ isActive }) =>
                      cn(
                        "seller-footer-nav block rounded-xl px-3.5 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-amber-400/10 hover:text-foreground",
                        isActive && "text-amber-700",
                      )
                    }
                  >
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
            <div className="seller-sidebar-user mt-5 rounded-xl border border-border/40 bg-card/60 px-4 py-4 backdrop-blur-sm">
              <p className="truncate text-sm font-semibold text-foreground">{user?.name ?? "Seller"}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
              <div className="mt-3 flex animate-pulse items-center gap-2 text-[10px] uppercase tracking-widest text-amber-600">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                live session
              </div>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="mt-3 flex w-full items-center justify-between rounded-xl bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <span className="flex items-center gap-2">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Sign out
              </span>
              <span className="text-muted-foreground/60">/</span>
            </button>
          </div>
        </aside>

        {/* Main */}
        <div className="seller-main flex min-w-0 flex-1 flex-col lg:pl-[260px]">
          <header className="seller-topbar sticky top-0 z-30 border-b border-border/40 bg-card/70 backdrop-blur-xl">
            <div className="seller-topbar-inner flex h-16 items-center gap-3 px-4 sm:px-6">
              <div className="lg:hidden">
                <span className="inline-flex items-center gap-2 rounded-lg bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-700">
                  <Fingerprint className="size-3.5" />
                  Studio
                </span>
              </div>
              <TopMenu className="ml-auto lg:hidden" />
              <div className="glass pill">
                <span className="inline-flex items-center gap-2 rounded-full bg-amber-400/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700 shadow-sm">
                  <span className="size-1.5 rounded-full bg-amber-500" />
                  seller studio
                </span>
              </div>
            </div>
          </header>

          <main className="seller-content flex-1 px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pt-6">
            {/* Mobile nav chips at the top */}
            <div className="mb-4 lg:hidden">
              <MobileChipNav
                nav={NAV.map(({ label, to, icon: Icon }) => ({
                  label,
                  to,
                  icon: <Icon className="size-3.5" />,
                }))}
              />
            </div>

            <div className="mx-auto w-full max-w-4xl">
              {children ?? <div className="glass p-6"><slot /></div>}
            </div>
          </main>
        </div>
      </div>

      <MobileTabBar />
    </div>
  );
}
