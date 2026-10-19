import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  workspaceForPath,
  workspaceLinks,
} from "@/components/dash/navs";
import { friendlyError } from "@/lib/supabaseData";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("workspaceForPath", () => {
  it.each([
    ["/account", "buyer"],
    ["/account/orders", "buyer"],
    ["/account/orders/AMH-1", "buyer"],
    ["/seller", "seller"],
    ["/seller/listings", "seller"],
    ["/admin", "admin"],
    ["/admin/disputes", "admin"],
  ])("maps %s to the %s workspace", (path, expected) => {
    expect(workspaceForPath(path)).toBe(expected);
  });

  it.each(["/", "/marketplace", "/marketplace/abc", "/trust", "/faq"])(
    "treats the public path %s as no workspace",
    (path) => {
      expect(workspaceForPath(path)).toBeNull();
    },
  );

  it("does not confuse a prefix match for a sibling path", () => {
    // `/accountant` is not inside `/account`; a naive startsWith("/account")
    // would say it was.
    expect(workspaceForPath("/accountant")).toBeNull();
    expect(workspaceForPath("/sellerly")).toBeNull();
  });
});

describe("workspaceLinks", () => {
  it("never offers the workspace the user is already standing in", () => {
    // The bug: the switcher offered "Seller studio" while the user was inside
    // Seller Studio, so the control navigated to the current page.
    for (const path of ["/seller", "/seller/listings", "/seller/orders"]) {
      const labels = workspaceLinks("seller", path).map((l) => l.label);
      expect(labels, `from ${path}`).not.toContain("Seller studio");
    }
    for (const path of ["/account", "/account/wallet"]) {
      const labels = workspaceLinks("buyer", path).map((l) => l.label);
      expect(labels, `from ${path}`).not.toContain("Buyer account");
    }
    for (const path of ["/admin", "/admin/users"]) {
      const labels = workspaceLinks("admin", path).map((l) => l.label);
      expect(labels, `from ${path}`).not.toContain("Admin console");
    }
  });

  it("offers the other workspace when standing in one", () => {
    const fromSeller = workspaceLinks("seller", "/seller").map((l) => l.to);
    expect(fromSeller).toContain("/account");

    const fromBuyer = workspaceLinks("buyer", "/account").map((l) => l.to);
    expect(fromBuyer).toContain("/seller");
  });

  it("offers the admin console to an admin and to nobody else", () => {
    expect(
      workspaceLinks("admin", "/seller").map((l) => l.to),
    ).toContain("/admin");
    expect(
      workspaceLinks("buyer", "/seller").map((l) => l.to),
    ).not.toContain("/admin");
    expect(
      workspaceLinks("seller", "/account").map((l) => l.to),
    ).not.toContain("/admin");
  });

  it("keeps support chat reachable from every workspace", () => {
    // Support is a destination, not a workspace, so it must never be filtered
    // out by the "hide where you already are" rule.
    for (const [role, path] of [
      ["buyer", "/account"],
      ["seller", "/seller"],
      ["admin", "/admin"],
    ] as const) {
      expect(
        workspaceLinks(role, path).map((l) => l.to),
        `support missing for ${role} at ${path}`,
      ).toContain("/account/support");
    }
  });

  it("never offers a link twice", () => {
    for (const [role, path] of [
      ["buyer", "/account"],
      ["seller", "/seller"],
      ["admin", "/admin"],
      ["buyer", "/seller"],
    ] as const) {
      const targets = workspaceLinks(role, path).map((l) => l.to);
      expect(new Set(targets).size, `duplicate in ${role}@${path}`).toBe(
        targets.length,
      );
    }
  });
});

describe("the buyer balance bar stays inside the buyer workspace", () => {
  const shell = read("src/components/dash/DashShell.tsx");

  it("renders the balance strip only when the path is the buyer workspace", () => {
    // Gated on the workspace derived from the pathname, not on the role: a
    // seller looking at their own account page still gets it, and the seller
    // studio and admin console never do.
    expect(shell).toMatch(/here === "buyer" && <BuyerBalanceBar\s*\/>/);
  });

  it("links the balance strip at the wallet page", () => {
    const bar = shell.slice(shell.indexOf("function BuyerBalanceBar"));
    expect(bar).toMatch(/to="\/account\/wallet"/);
  });
});

describe("friendlyError explains a rejected listing", () => {
  it("names the cause for an RLS failure on listings", () => {
    const message = friendlyError(
      new Error(
        'new row violates row-level security policy for table "listings"',
      ),
    );
    // It must NOT be the generic dead end, and it must point at the store
    // application, because that is the actual prerequisite when the policy
    // still carries 0001's approved-store clause.
    expect(message).not.toBe("You do not have access to that information.");
    expect(message).toMatch(/store|seller application/i);
  });

  it("still returns the generic message for an unrelated RLS failure", () => {
    expect(
      friendlyError(
        new Error('new row violates row-level security policy for table "orders"'),
      ),
    ).toBe("You do not have access to that information.");
  });
});
