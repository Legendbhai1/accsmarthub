import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isTabActive, MOBILE_TABS } from "@/components/site/MobileTabBar";
import { profileHrefForWorkspace, workspaceForPath } from "@/components/dash/navs";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("MobileTabBar active state", () => {
  it("lights the Account tab on /account and every /account/* subroute", () => {
    for (const path of [
      "/account",
      "/account/orders",
      "/account/profile",
      "/account/wallet",
      "/account/orders/AMH-1",
    ]) {
      expect(isTabActive("/account", path), path).toBe(true);
    }
  });

  it("does not light the Account tab on public pages or sibling paths", () => {
    for (const path of ["/", "/marketplace", "/marketplace/abc", "/accountant"]) {
      expect(isTabActive("/account", path), path).toBe(false);
    }
  });

  it("keeps Home exact and treats /marketplace as owning its sub-pages", () => {
    expect(isTabActive("/", "/")).toBe(true);
    expect(isTabActive("/", "/marketplace")).toBe(false);
    expect(isTabActive("/marketplace", "/marketplace")).toBe(true);
    expect(isTabActive("/marketplace", "/marketplace/abc")).toBe(true);
    expect(isTabActive("/marketplace/categories", "/marketplace/categories")).toBe(
      true,
    );
    // The categories tab must not light up on a plain listing page.
    expect(isTabActive("/marketplace/categories", "/marketplace/abc")).toBe(false);
  });

  it("preserves the four public tabs and their destinations", () => {
    expect(MOBILE_TABS.map((t) => t.to)).toEqual([
      "/",
      "/marketplace",
      "/marketplace/categories",
      "/account",
    ]);
    expect(MOBILE_TABS.map((t) => t.label)).toEqual([
      "Home",
      "Marketplace",
      "Categories",
      "Account",
    ]);
  });

  it("keeps the fixed bar and safe-area inset behaviour", () => {
    const bar = read("src/components/site/MobileTabBar.tsx");
    // `md:hidden` keeps it to phones; the padding keeps it above the home
    // indicator. Both predate this change and must survive.
    expect(bar).toMatch(/fixed inset-x-0 bottom-0/);
    expect(bar).toMatch(/md:hidden/);
    expect(bar).toMatch(/env\(safe-area-inset-bottom\)/);
  });
});

describe("the header person icon resolves a profile destination per workspace", () => {
  it("points the buyer workspace at /account/profile", () => {
    expect(profileHrefForWorkspace(workspaceForPath("/account"))).toBe(
      "/account/profile",
    );
    expect(profileHrefForWorkspace(workspaceForPath("/account/wallet"))).toBe(
      "/account/profile",
    );
  });

  it("points Seller Studio at its own profile page", () => {
    expect(profileHrefForWorkspace(workspaceForPath("/seller"))).toBe(
      "/seller/profile",
    );
  });

  it("falls back to the shared account profile for admin and unknown paths", () => {
    expect(profileHrefForWorkspace(workspaceForPath("/admin"))).toBe(
      "/account/profile",
    );
    expect(profileHrefForWorkspace(null)).toBe("/account/profile");
  });

  it("renders a labelled, clickable link in the dashboard header", () => {
    const shell = read("src/components/dash/DashShell.tsx");
    // A real Link with an accessible name, not a dead icon.
    expect(shell).toMatch(/aria-label="Your profile"/);
    expect(shell).toMatch(/<Link to=\{to\}/);
    expect(shell).toMatch(/<ProfileIcon \/>/);
  });

  it("routes signed-in public users to their profile and signed-out users to /auth", () => {
    const header = read("src/components/site/SiteHeader.tsx");
    // The public header keeps a real profile link for signed-in accounts…
    expect(header).toMatch(/navigate\("\/account\/profile"\)/);
    // …and sends signed-out visitors to the auth page.
    expect(header).toMatch(/<Link to="\/auth"/);
  });
});
