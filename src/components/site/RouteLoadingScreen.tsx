import { useState } from "react";
import { useLocation } from "react-router";

/**
 * The page-transition loading screen.
 *
 * Every route change mounts a fresh copy of this overlay — it is keyed on
 * `location.key`, so React replaces the node and the CSS animation replays.
 * That is deliberately the whole mechanism: there is no state and no effect
 * driving it, so it cannot flash the wrong page, cannot leak a timer, and
 * cannot race the router. The animation fades in, holds the brand mark, and
 * fades out over `--route-load-ms`, ending on `visibility: hidden` so the
 * overlay stops capturing clicks the moment it is done.
 *
 * The initial render is skipped: the first paint is not a transition between
 * two pages, and covering it would delay the landing page for no benefit. The
 * ref remembers the first `location.key` and renders nothing for it.
 *
 * The mark is CSS only. `prefers-reduced-motion` neutralises the animation in
 * `index.css`, which collapses the overlay to its end state (hidden) rather
 * than leaving a moving splash on screen.
 *
 * It is NOT one of the three bundled Lottie animations: those are success
 * signals — `add-to-cart`, `shopping-bag`, `order-confirmed` — and each may
 * only mount once the flow it celebrates has actually succeeded. A transition
 * between two pages has not succeeded at anything, so it must not borrow one.
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
      <span className="route-loader-mark brand-gradient relative flex size-16 items-center justify-center rounded-2xl shadow-lg shadow-primary/30">
        <span
          className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/25"
          aria-hidden="true"
        />
        <svg
          viewBox="0 0 24 24"
          className="size-8 text-primary-foreground"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H14a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 6V5.5ZM4 12a2.5 2.5 0 0 1 2.5-2.5H18a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 12.5V12ZM4 18.5A2.5 2.5 0 0 1 6.5 16H14a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 18.5Z" />
        </svg>
      </span>

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
