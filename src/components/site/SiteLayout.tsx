import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { MobileTabBar } from "@/components/site/MobileTabBar";

/**
 * Public shell for pages that render their own body rather than a routed child
 * (`Faq` and `Trust` wrap their markup in this). Route-driven public pages use
 * `PublicLayout`, which puts the same chrome around `<Outlet/>`.
 *
 * Both exist so the bottom bar has one definition and is mounted from public
 * pages only — never from a dashboard.
 */
export function SiteLayout({ children }: { children?: ReactNode }) {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 pb-24 md:pb-0">{children}</main>
      <SiteFooter />
      <MobileTabBar />
    </div>
  );
}
