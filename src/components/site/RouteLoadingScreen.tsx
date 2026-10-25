import { useState } from "react";
import { useLocation } from "react-router";
import { LottieAnimation } from "@/components/common/LottieAnimation";

/**
 * The page-transition loading screen.
 *
 * Every route change mounts a fresh copy of this overlay — it is keyed on
 * `location.key`, so React replaces the node and the CSS animation replays.
 * That is deliberately the whole mechanism: there is no state and no effect
 * driving it, so it cannot flash the wrong page, cannot leak a timer, and
 * cannot race the router. The animation fades in, holds the mark and the
 * empty-box artwork, and fades out over `--route-load-ms`, ending on
 * `visibility: hidden` so the overlay stops capturing clicks the moment it is
 * done.
 *
 * The initial render is skipped: the first paint is not a transition between
 * two pages, and covering it would delay the landing page for no benefit. The
 * ref remembers the first `location.key` and renders nothing for it.
 *
 * `prefers-reduced-motion` neutralises the CSS animation in `index.css`, which
 * collapses the overlay to its end state (hidden) rather than leaving a moving
 * splash on screen; the Lottie player separately holds its last frame instead
 * of autoplaying.
 *
 * It uses `empty-box` and none of the other three bundled animations: those are
 * success signals — `add-to-cart`, `shopping-bag`, `order-confirmed` — and each
 * may only mount once the flow it celebrates has actually succeeded. A
 * transition between two pages has not succeeded at anything, so it must not
 * borrow one. `empty-box` is neutral artwork with no outcome attached.
 *
 * The overlay is suppressed inside the seller and admin workspaces, whose pages
 * are work surfaces rather than browsable ones — see `isDashboardPath`.
 */
export function RouteLoadingScreen() {
  const location = useLocation();
  // The key of the landing render, captured once. State rather than a ref
  // because it is read during render, and reading a ref in render is a lint
  // error under the React Compiler rules. It never changes, so the landing
  // render is the only one it suppresses.
  const [initialKey] = useState(location.key);

  // The landing render is not a page switch; skip it.
  if (location.key === initialKey) return null;

  // Seller Studio and the admin console are work surfaces: their navigation is
  // a persistent rail, so a full-screen transition between two of their pages
  // reads as a flicker rather than as a page load. The public storefront and
  // the buyer account keep it.
  if (isDashboardPath(location.pathname)) return null;

  return (
    <div
      // Keyed on the route so a new navigation remounts the node and replays
      // the animation. `aria-hidden` because the router already moves focus and
      // announces the new page — a second announcement per navigation would
      // double every message.
      key={location.key}
      aria-hidden="true"
      className="route-loader fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-background"
    >
      <LottieAnimation
        name="empty-box"
        size={132}
        label="Loading the page"
        className="route-loader-mark"
      />

      <span className="font-display text-sm font-semibold tracking-tight text-muted-foreground">
        Accs<span className="text-gradient">Mart</span>Hub
      </span>

      {/* The progress rail. It is the one thing that reads as "loading" rather
          than "a logo appeared", so it is drawn explicitly. */}
      <span
        className="route-loader-rail h-1 w-40 overflow-hidden rounded-full bg-muted"
        aria-hidden="true"
      >
        <span className="route-loader-bar block h-full w-full rounded-full bg-primary" />
      </span>
    </div>
  );
}

/**
 * The seller and admin workspaces, whose page transitions are not overlaid.
 *
 * Kept as a path test rather than a session-role test on purpose: the overlay
 * renders above the route tree and has no access to the session, and a role
 * would be the wrong question anyway — an admin browsing `/marketplace` is on a
 * public page and should still see the transition.
 */
function isDashboardPath(pathname: string): boolean {
  return (
    pathname === "/seller" ||
    pathname.startsWith("/seller/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/")
  );
}
