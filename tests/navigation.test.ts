import { readdirSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { routes } from "@/routes";
import { PublicLayout } from "@/components/site/PublicLayout";
import { adminNav, buyerNav, flatNav, sellerNav } from "@/components/dash/navs";

/**
 * Guards the navigation split between the public marketplace and the signed-in
 * workspaces.
 *
 * The bug this locks down: `MobileTabBar` — the public Home / Marketplace /
 * Categories / Account bar — was rendered from four places, two of which were
 * the buyer/admin and seller dashboard layouts. The bar therefore appeared
 * inside Seller Studio, on top of the studio's own navigation.
 *
 * These are source-level assertions on purpose. A rendering test would need a
 * router, a session and a Supabase stub to observe the same fact, and would
 * still pass if someone re-added the bar to a dashboard that the test did not
 * mount. Reading the module that owns each layout catches the regression at
 * the only place it can be introduced.
 */
const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("mobile navigation does not leak into dashboards", () => {
  const dashboards = [
    "src/components/dash/DashShell.tsx",
    "src/components/dash/DashLayout.tsx",
    "src/components/dash/SellerLayout.tsx",
    "src/components/dash/navs.ts",
  ];

  it.each(dashboards)("%s never references the public tab bar", (file) => {
    const source = read(file);
    expect(source).not.toMatch(/MobileTabBar/);
    // The old shared chip strip was only ever used by the dashboards and is
    // gone; a reintroduction means a second nav system creeping back in.
    expect(source).not.toMatch(/MobileChipNav/);
  });

  it("mounts the public tab bar from the public layouts only", () => {
    for (const file of [
      "src/components/site/PublicLayout.tsx",
      "src/components/site/SiteLayout.tsx",
    ]) {
      expect(read(file), `${file} should mount MobileTabBar`).toMatch(
        /<MobileTabBar\s*\/>/,
      );
    }
  });

  it("gives the dashboards their own drawer instead of a bottom bar", () => {
    const shell = read("src/components/dash/DashShell.tsx");
    // The drawer is what replaces the bottom bar on small screens.
    expect(shell).toMatch(/SheetContent/);
    expect(shell).toMatch(/side="left"/);
  });
});

type RouteLike = {
  path?: string;
  index?: boolean;
  element?: { type?: unknown; props?: Record<string, unknown> };
  children?: RouteLike[];
};

type Entry = { path: string; route: RouteLike; parents: RouteLike[] };

function flatten(
  rs: RouteLike[],
  base = "",
  parents: RouteLike[] = [],
): Entry[] {
  return rs.flatMap((route) => {
    const path = route.path ? `${base}/${route.path}`.replace(/\/+/g, "/") : base;
    return [
      { path: path || "/", route, parents },
      ...flatten(route.children ?? [], path, [...parents, route]),
    ];
  });
}

const all = flatten(routes as RouteLike[]);

/** The layout route contributes no path, so it is identified by element type. */
const isWrappedInPublicLayout = (entry: Entry) =>
  entry.parents.some((p) => p.element?.type === PublicLayout);

describe("public routes are wrapped in the public layout", () => {
  // Each of these is a marketplace page that must show the header, footer and
  // bottom bar; none may be a bare element under the error boundary.
  const publicPaths = [
    "/",
    "/marketplace",
    "/marketplace/categories",
    "/marketplace/:id",
    "/faq",
    "/trust",
    "/disputes",
  ];

  it.each(publicPaths)("%s is nested under PublicLayout", (path) => {
    const entries = all.filter((r) => r.path === path);
    expect(entries.length, `no route declared for ${path}`).toBeGreaterThan(0);
    expect(
      entries.some(isWrappedInPublicLayout),
      `${path} is not nested inside PublicLayout`,
    ).toBe(true);
  });

  it("does not wrap the transactional pages in the bottom bar", () => {
    // Checkout and the auth screens keep the header but drop the tab bar.
    for (const path of ["/checkout", "/auth", "/auth/reset"]) {
      const entries = all.filter((r) => r.path === path);
      expect(entries.length, `no route declared for ${path}`).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(
          isWrappedInPublicLayout(entry),
          `${path} must not render the public bottom bar`,
        ).toBe(false);
      }
    }
  });

  it("does not wrap any dashboard route in the public layout", () => {
    for (const entry of all) {
      if (/^\/(account|seller|admin)(\/|$)/.test(entry.path)) {
        expect(
          isWrappedInPublicLayout(entry),
          `${entry.path} renders the public bottom bar inside a dashboard`,
        ).toBe(false);
      }
    }
  });
});

describe("every internal link in the app resolves to a declared route", () => {
  const declared = new Set(all.map((r) => r.path.replace(/\/:[^/]+/g, "/:id")));

  /**
   * `/account/orders/:id` style params are not enumerable, so compare shapes.
   * `path` has already had query strings stripped by the caller.
   */
  const resolves = (path: string) => {
    if (declared.has(path)) return true;
    return [...declared].some((candidate) => {
      const parts = candidate.split("/");
      const actual = path.split("/");
      if (parts.length !== actual.length) return false;
      return parts.every((p, i) => p.startsWith(":") || p === actual[i]);
    });
  };

  /** Absolute internal links written as string literals anywhere in `src`. */
  const collectLinks = () => {
    const found: { file: string; to: string }[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "ui" || entry.name === "convex") continue;
          walk(full);
        } else if (/\.tsx?$/.test(entry.name)) {
          const source = readFileSync(full, "utf8");
          // `to="/x"` (JSX), `to: "/x"` (config objects), navigate("/x"),
          // redirect("/x"). The object-property form matters: the header,
          // footer and tab-bar link tables all use it, and it was the form
          // that carried the `/categories` 404.
          for (const re of [
            /\bto=["'](\/[^"'#?]*)/g,
            /\bto:\s*["'](\/[^"'#?]*)/g,
            /\bnavigate\(["'](\/[^"'#?]*)/g,
            /\bredirect\(["'](\/[^"'#?]*)/g,
          ]) {
            for (const m of source.matchAll(re)) {
              found.push({ file: full.replace(`${root}/`, ""), to: m[1] });
            }
          }
        }
      }
    };
    walk(join(root, "src"));
    return found;
  };

  const links = collectLinks();

  it("finds links to check", () => {
    expect(links.length).toBeGreaterThan(20);
  });

  it("has no internal link pointing at an undeclared route", () => {
    // This is the bug class that produced `/categories` in three places,
    // `/forgot-password` in two, and `/reset-password` in a recovery email's
    // `redirectTo` — all of them 404s that no type check can see.
    const broken = links.filter(({ to }) => !resolves(to));
    expect(
      broken.map((b) => `${b.file} -> ${b.to}`),
      "these links point at routes that do not exist",
    ).toEqual([]);
  });

  it("resolves every dashboard nav entry", () => {
    for (const section of [...buyerNav, ...sellerNav, ...adminNav]) {
      for (const item of section.items) {
        expect(resolves(item.to.split("?")[0]), `nav link ${item.to}`).toBe(true);
      }
    }
  });
});

describe("nav config is internally consistent", () => {
  const sections = { buyer: buyerNav, seller: sellerNav, admin: adminNav };

  it.each(Object.entries(sections))(
    "%s nav has no duplicate targets",
    (_name, nav) => {
      const targets = flatNav(nav).map((i) => i.to);
      expect(new Set(targets).size).toBe(targets.length);
    },
  );

  it.each(Object.entries(sections))(
    "%s nav marks only section roots as `end`",
    (_name, nav) => {
      for (const item of flatNav(nav)) {
        if (item.end) {
          // An `end` match on a sub-page would stop that page from ever
          // highlighting its own entry.
          expect(item.to.split("/").filter(Boolean).length).toBeLessThanOrEqual(1);
        }
      }
    },
  );
});
