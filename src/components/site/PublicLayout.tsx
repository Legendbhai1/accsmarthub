import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { MobileTabBar } from "@/components/site/MobileTabBar";

/**
 * The public marketplace shell.
 *
 * This is the *only* component that mounts `MobileTabBar`. Previously the bar
 * was rendered from four places — here, inside `Marketplace`, and inside both
 * dashboard layouts — which is exactly how the public Home / Marketplace /
 * Categories / Account tabs appeared inside Seller Studio. A dashboard now
 * renders `DashShell` and therefore cannot show this bar at all.
 */
export function PublicLayout() {
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
      {/* `pb-24` reserves room for the fixed bottom bar on small screens so it
          never covers the last row of content or the footer. `md` drops both,
          because the bar itself is `md:hidden`. */}
      <main className="flex-1 pb-24 md:pb-0">
        <Outlet />
      </main>
      <SiteFooter />
      <MobileTabBar />
    </div>
  );
}
