import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

/**
 * The route-transition loading screen.
 *
 * Two things have to stay true for it to be the feature that was asked for and
 * not a bug: it must appear on a *navigation* and never on the landing paint,
 * and it must live for a second or two without a JavaScript timer that could
 * outlive its component. These assert the mechanism in the source, because a
 * screenshot cannot tell a CSS-driven overlay from a leaked `setTimeout`, and a
 * leaked timer is the failure that shows up as a random overlay mid-scroll.
 */
describe("the overlay is mounted once, above every route", () => {
  const app = read("src/App.tsx");

  it("renders it in the root layout, not in a page wrapper", () => {
    // Mounted at the pathless root so it covers the public shell, the three
    // dashboard shells and the transactional pages alike. Pinned to a single
    // page's wrapper it would vanish on the others.
    expect(app).toMatch(/import \{ RouteLoadingScreen \}/);
    expect(app).toMatch(/<RouteLoadingScreen \/>/);
  });

  it("keeps the error boundary on the same route as the overlay", () => {
    expect(app).toMatch(/errorElement: <ErrorPage \/>/);
    expect(app).toMatch(/<Outlet \/>/);
  });
});

describe("the overlay covers navigations and skips the first paint", () => {
  const source = read("src/components/site/RouteLoadingScreen.tsx");

  it("remembers the first location key and renders nothing for it", () => {
    // The landing render is not a transition between two pages. Covering it
    // would delay the homepage for no benefit.
    expect(source).toMatch(/useState\(location\.key\)/);
    expect(source).toMatch(/location\.key === initialKey/);
  });

  it("keys the overlay on the route so a new navigation replays it", () => {
    // React remounts a keyed node, which restarts the CSS animation. Without
    // the key the overlay would play once and never again.
    expect(source).toMatch(/key=\{location\.key\}/);
  });

  it("drives the animation from CSS, with no timer of its own", () => {
    // A `setTimeout` here is the bug this guards: it would fire after the
    // component had gone, or leave the overlay up if the route changed first.
    expect(source).not.toMatch(/setTimeout/);
    expect(source).not.toMatch(/setInterval/);
    expect(source).toMatch(/className="route-loader /);
  });

  it("hides itself from assistive tech", () => {
    // The router already moves focus and announces the new page; a second
    // announcement per navigation would double every message.
    expect(source).toMatch(/aria-hidden="true"/);
  });

  it("borrows the neutral artwork, never a success signal", () => {
    // `add-to-cart`, `shopping-bag` and `order-confirmed` each mean "the flow
    // succeeded". A page transition has not succeeded at anything, so reusing
    // one would make a success signal lie. `empty-box` is neutral artwork with
    // no outcome attached, which is why it is the only permitted choice.
    expect(source).toMatch(/name="empty-box"/);
    for (const signal of ["add-to-cart", "shopping-bag", "order-confirmed"]) {
      expect(source, signal).not.toMatch(new RegExp(`name="${signal}"`));
    }
  });
});

describe("the overlay is suppressed in the work-surface workspaces", () => {
  const source = read("src/components/site/RouteLoadingScreen.tsx");

  it("skips seller and admin, keeps the public storefront and the buyer", () => {
    // Seller Studio and the admin console are rails, not browsable pages: a
    // full-screen transition between two of their screens reads as a flicker.
    expect(source).toMatch(/isDashboardPath\(location\.pathname\)/);
    expect(source).toMatch(/isDashboardPath/);
  });

  it("matches the two workspaces by path, not by role", () => {
    // The overlay renders above the route tree and has no session. A role would
    // also be the wrong question: an admin browsing /marketplace is on a public
    // page and should still see the transition.
    const fn = source.slice(source.indexOf("function isDashboardPath"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toMatch(/"\/seller"/);
    expect(body).toMatch(/"\/admin"/);
    expect(body).not.toMatch(/\/account/);
  });
});

describe("the overlay's duration is the one that was asked for", () => {
  const css = read("src/index.css");

  it("runs for one to two seconds", () => {
    const match = css.match(/--route-load-ms:\s*(\d+)ms/);
    expect(match, "--route-load-ms is not defined in the theme").toBeTruthy();
    const ms = Number(match![1]);
    expect(ms).toBeGreaterThanOrEqual(1000);
    expect(ms).toBeLessThanOrEqual(2000);
  });

  it("defines the three keyframes the component names", () => {
    for (const name of ["route-loader-veil", "route-loader-mark", "route-loader-bar"]) {
      expect(css, `${name} is missing`).toContain(`@keyframes ${name}`);
    }
  });

  it("ends hidden so the finished overlay cannot swallow clicks", () => {
    // `opacity: 0` alone would leave a full-screen element over the page,
    // intercepting every tap until something unmounted it.
    const veil = css.slice(css.indexOf("@keyframes route-loader-veil"));
    const end = veil.slice(0, veil.indexOf("\n  }"));
    expect(end).toMatch(/visibility: hidden/);
  });

  it("is neutralised under reduced motion", () => {
    // The global `prefers-reduced-motion` block collapses every animation, so
    // the overlay lands on its final (hidden) frame instead of moving.
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toMatch(/animation-duration: 0\.01ms !important/);
  });
});
