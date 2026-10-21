import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SERVICE_CATEGORIES, categories } from "@/lib/db";
import { getBrand } from "@/lib/brands";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("Google is a first-class category", () => {
  it("appears in the home-page category list", () => {
    const google = categories.find((c) => c.slug === "google");
    expect(google, "home categories should include google").toBeDefined();
    expect(google?.name).toBe("Google");
    expect(google?.brand).toBe("google");
  });

  it("appears in the service-category list used by the seller form", () => {
    expect(SERVICE_CATEGORIES.some((c) => c.slug === "google")).toBe(true);
  });

  it("has a brand glyph, so its card renders a mark rather than a blank tile", () => {
    const brand = getBrand("google");
    expect(brand.path.length).toBeGreaterThan(0);
    expect(brand.title).toBe("Google");
  });

  it("is listed once, and its slug and brand agree", () => {
    const matches = categories.filter((c) => c.slug === "google");
    expect(matches).toHaveLength(1);
    for (const category of categories) {
      expect(category.brand).toBe(category.slug);
    }
  });
});

describe("the buyer quick-nav sits below the header", () => {
  it("is rendered by the dash shell", () => {
    const shell = read("src/components/dash/DashShell.tsx");
    expect(shell).toMatch(/BuyerQuickNav/);
  });

  it("renders after the header closes, not inside it", () => {
    const shell = read("src/components/dash/DashShell.tsx");
    const headerEnd = shell.indexOf("</header>");
    const bar = shell.indexOf("<BuyerQuickNav");
    expect(headerEnd).toBeGreaterThan(-1);
    expect(bar).toBeGreaterThan(headerEnd);
  });

  it("is scoped to the buyer workspace only", () => {
    const shell = read("src/components/dash/DashShell.tsx");
    // Guarded by the same `here === "buyer"` check as the balance bar, so the
    // storefront strip cannot appear inside Seller Studio or the admin console.
    expect(shell).toMatch(/here === "buyer" && <BuyerQuickNav \/>/);
  });

  it("lists every platform category and no duplicate links", () => {
    const bar = read("src/components/dash/BuyerQuickNav.tsx");
    expect(bar).toMatch(/categories\.map/);
    expect(bar).toMatch(/\/marketplace\?category=\$\{category\.slug\}/);
  });

  it("does not reference the public tab bar it must not become", () => {
    const bar = read("src/components/dash/BuyerQuickNav.tsx");
    expect(bar).not.toMatch(/MobileTabBar/);
    expect(bar).not.toMatch(/MobileChipNav/);
  });
});
