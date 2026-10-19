import { describe, expect, it } from "vitest";
import { routes } from "@/routes";

/**
 * Guards the shape of the dashboard route tree.
 *
 * A route that declares both `element` and `children` renders the `element`
 * and relies on it rendering an `<Outlet/>` for the child match. The
 * buyer/seller/admin wrappers render their `children` prop instead, so a
 * sub-page route such as `/seller/orders` silently rendered the index page
 * (`/seller` -> SellerDashboard) while the URL said otherwise. Nothing in the
 * UI surfaced the mistake because the dashboard still looked plausible.
 */
type RouteLike = {
  path?: string;
  index?: boolean;
  element?: { props?: { children?: unknown } };
  children?: RouteLike[];
};

function flatten(rs: RouteLike[], base = ""): { path: string; route: RouteLike }[] {
  return rs.flatMap((route) => {
    const path = route.path ? `${base}/${route.path}`.replace(/\/+/g, "/") : base;
    return [{ path: path || "/", route }, ...flatten(route.children ?? [], path)];
  });
}

const all = flatten(routes as RouteLike[]);
const parents = all.filter(({ route }) => (route.children ?? []).length > 0);

describe("router configuration", () => {
  it("has the dashboard sections with nested child routes", () => {
    const paths = parents.map((p) => p.path);
    expect(paths).toContain("/account");
    expect(paths).toContain("/seller");
    expect(paths).toContain("/admin");
  });

  it.each(["/account", "/seller", "/admin"])(
    "%s lets its layout render the outlet instead of passing children",
    (path) => {
      const entry = parents.find((p) => p.path === path);
      expect(entry, `no nested route found for ${path}`).toBeDefined();
      const children = entry!.route.element?.props?.children;
      expect(
        children,
        `${path} passes children to its layout element; the nested route can never render`,
      ).toBeUndefined();
    },
  );

  it("gives every nested child of a dashboard section a distinct path", () => {
    for (const path of ["/account", "/seller", "/admin"]) {
      const entry = parents.find((p) => p.path === path);
      expect(entry, `no nested route found for ${path}`).toBeDefined();
      const childPaths = (entry!.route.children ?? [])
        .filter((c) => !c.index)
        .map((c) => `${path}/${c.path}`.replace(/\/+/g, "/"));
      for (const cp of childPaths) {
        expect(cp, `child path ${cp} collides with its parent`).not.toBe(path);
      }
    }
  });

  it("keeps the legacy /listing/:id redirect to the canonical route", () => {
    const legacy = all.find(({ path }) => path === "/listing/:id");
    expect(legacy, "the /listing/:id compatibility redirect is missing").toBeDefined();
    expect(legacy!.route.element ?? legacy!.route.path).toBeDefined();
    expect(all.some(({ path }) => path === "/marketplace/:id")).toBe(true);
  });
});
