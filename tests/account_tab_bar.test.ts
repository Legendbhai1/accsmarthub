import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MobileTabBar, MOBILE_TABS } from "@/components/site/MobileTabBar";
import {
  adminNav,
  buyerNav,
  navTitleForPath,
  sellerNav,
} from "@/components/dash/navs";

/**
 * Regression guards for the buyer bottom tab bar on `/account`.
 *
 * The bar was *mounted* correctly and still invisible. Two independent causes:
 *
 *  1. It was `position: fixed` inside the route's animated wrapper, and that
 *     wrapper animated `transform`. With `animation-fill-mode: both` it keeps
 *     `transform: translateY(0)` after the animation ends, and a transform
 *     other than `none` makes the element a containing block for fixed
 *     descendants — so the bar anchored to the bottom of a long document
 *     instead of the viewport and scrolled out of sight.
 *  2. Only the *buyer* shell mounted it at all, and the whole shell lived
 *     inside each page, so it was torn down and rebuilt on every navigation.
 *
 * These are source- and CSS-level assertions on purpose: a rendering test would
 * need a router, a session and a Supabase stub, and would still pass if the
 * transform crept back into the wrapper's class list.
 */
const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("the route wrapper cannot break position: fixed", () => {
  const css = read("src/index.css");

  it("does not put a transform on the wrapper that contains the dashboards", () => {
    const wrapper = read("src/routes.tsx");
    // The wrapper's class list must not animate a transform. `fade-in` is the
    // safe half of the old pair; `slide-in-from-bottom-4` is the dangerous one.
    const classList = wrapper.match(
      /const PageWrapper = \(\) => \(\s*<div className="([^"]+)"/,
    )?.[1];
    expect(classList, "PageWrapper's class list changed shape").toBeDefined();
    expect(classList).not.toMatch(/slide-in-from/);
    expect(classList).toMatch(/page-enter/);
  });

  it("defines page-enter as an opacity-only keyframe", () => {
    const block = css.slice(css.indexOf("@keyframes page-enter"));
    const body = block.slice(0, block.indexOf("}\n  }") + 1);
    // An opacity-only entrance does not create a containing block, so a fixed
    // descendant inside it still anchors to the viewport.
    expect(body).toMatch(/opacity/);
    expect(body).not.toMatch(/transform/);
  });

  it("keeps the transform-bearing keyframe available for non-fixed content", () => {
    // Removing it outright would silently drop the entrance from anywhere else
    // that uses it, which is its own quiet regression.
    expect(css).toMatch(/@keyframes slide-in-from-bottom-4/);
  });

  it("mounts the shell outside the animated wrapper in every workspace", () => {
    const wrapper = read("src/routes.tsx");
    for (const [shell, marker] of [
      ["BuyerShell", "BuyerLayout"],
      ["SellerShell", "SellerLayout"],
      ["AdminShell", "AdminLayout"],
    ] as const) {
      const fn = wrapper.slice(wrapper.indexOf(`function ${marker}`));
      const body = fn.slice(0, fn.indexOf("\n}"));
      // `<Shell><PageWrapper /></Shell>` — the shell wraps the wrapper, so the
      // fixed bar it renders is not a descendant of the animated element.
      expect(body, marker).toMatch(
        new RegExp(`<${shell}>\\s*<PageWrapper />`),
      );
    }
  });
});

describe("the buyer shell mounts the bar for the whole account workspace", () => {
  it("gates the bar on the buyer workspace derived from the pathname", () => {
    const shell = read("src/components/dash/DashShell.tsx");
    expect(shell).toMatch(/here === "buyer" && <MobileTabBar \/>/);
  });

  it("keeps the bar out of the seller studio and the admin console", () => {
    // Both render `DashShell`, so the gate is what stops the public Home /
    // Marketplace / Categories / Account bar appearing over their own nav.
    const shell = read("src/components/dash/DashShell.tsx");
    expect(shell).toMatch(/workspaceForPath/);
    expect(shell).not.toMatch(/here === "seller" && <MobileTabBar/);
    expect(shell).not.toMatch(/here === "admin" && <MobileTabBar/);
  });

  it("reserves bottom padding where the scrolling content lives", () => {
    const shell = read("src/components/dash/DashShell.tsx");
    expect(shell).toMatch(/pb-24 md:pb-0/);
  });
});

describe("no page mounts its own dashboard shell any more", () => {
  it("keeps the shell at the route level so navigation does not remount it", () => {
    // A page that wraps itself in `DashLayout`/`SellerLayout` rebuilds the
    // header, rail and bar on every navigation inside the workspace — the
    // flicker this change removed.
    const pages = [
      ...["buyer", "admin"].flatMap((dir) =>
        tsxFiles(`src/pages/${dir}`).map((f) => `src/pages/${dir}/${f}`),
      ),
      ...tsxFiles("src/pages/seller").map((f) => `src/pages/seller/${f}`),
    ];
    expect(pages.length).toBeGreaterThan(20);
    for (const page of pages) {
      const source = read(page);
      expect(source, `${page} mounts DashLayout`).not.toMatch(/<DashLayout\b/);
      expect(source, `${page} mounts SellerLayout`).not.toMatch(/<SellerLayout\b/);
    }
  });
});

describe("the shell derives a real title for every workspace page", () => {
  it("always prints exactly the rail's label, so header and highlight agree", () => {
    // This is the contract: whatever the rail calls a destination is what the
    // page head calls it. Deriving both from one list is what stops them
    // drifting apart, so assert the invariant over every entry rather than a
    // hand-copied string per page.
    //
    // Entries carrying a query string (`/seller/listings?new=1`, "Create
    // listing") are actions *on* an existing page rather than destinations of
    // their own, so they are excluded — the page itself keeps the label of its
    // canonical entry.
    for (const nav of [buyerNav, sellerNav, adminNav]) {
      for (const item of nav.flatMap((s) => s.items)) {
        if (item.to.includes("?")) continue;
        expect(navTitleForPath(nav, item.to, "fallback"), item.to).toBe(
          item.label,
        );
      }
    }
  });

  it("keeps the canonical label when a rail action shares its path", () => {
    // "Create listing" links at `/seller/listings?new=1`; the page is still
    // "My listings", because the query only opens an editor over it.
    expect(
      navTitleForPath(sellerNav, "/seller/listings", "Seller studio"),
    ).toBe("My listings");
  });

  it("names pages that are reachable but absent from the rail", () => {
    // `/seller/apply` and an order detail are real destinations with no rail
    // entry; falling back to the workspace name would lose the page identity.
    expect(navTitleForPath(sellerNav, "/seller/apply", "Seller studio")).toBe(
      "Apply to sell",
    );
    expect(
      navTitleForPath(buyerNav, "/account/orders/AMH-1", "Buyer account"),
    ).toBe("Order");
  });

  it("falls back to the workspace name for anything unrecognised", () => {
    expect(navTitleForPath(buyerNav, "/account/unknown", "Buyer account")).toBe(
      "Buyer account",
    );
  });
});

describe("the tab bar keeps one definition and one mount per surface", () => {
  it("declares exactly the four public tabs", () => {
    expect(MOBILE_TABS.map((t) => t.label)).toEqual([
      "Home",
      "Marketplace",
      "Categories",
      "Account",
    ]);
  });

  it("renders a nav landmark from the shared component", () => {
    // Guard against the component being re-declared inline somewhere else,
    // which is how the original four-mount bug started.
    expect(typeof MobileTabBar).toBe("function");
    expect(read("src/components/site/MobileTabBar.tsx")).toMatch(
      /aria-label="Primary"/,
    );
  });
});

function tsxFiles(rel: string): string[] {
  return readdirSync(join(root, rel)).filter((f) => f.endsWith(".tsx"));
}
