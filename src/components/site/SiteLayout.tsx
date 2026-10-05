import { useEffect, type ReactNode } from "react";
import { Outlet, useLocation } from "react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { MobileTabBar } from "@/components/site/MobileTabBar";

export function SiteLayout({ children }: { children?: ReactNode }) {
  const location = useLocation();

  useEffect(() => {
    // `instant` matters: index.css sets `scroll-behavior: smooth` on <html>,
    // which would otherwise animate a long glide to the top on every route
    // change and read as laggy.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 pb-28 md:pb-0">
        {children ?? <Outlet />}
      </main>
      <SiteFooter />

      {/* Mobile bottom navigation — the same bar the marketplace and the
          dashboards render, so the buttons never change under you. */}
      <MobileTabBar />
    </div>
  );
}
