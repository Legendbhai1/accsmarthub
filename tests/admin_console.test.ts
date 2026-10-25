import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The admin console's figures are its whole point, so a *failed* fetch must
 * not render as an empty platform.
 *
 * `fetchPlatformStats` read every Supabase result as `data ?? []`, so an RLS
 * rejection or a table missing on production (the project ran `0001`-`0006`
 * then `0013`+, skipping the migrations in between) produced a dashboard of
 * confident zeros — "$0 volume, 0 users" — with nothing to say the numbers had
 * never been fetched. An operator reading that would conclude the marketplace
 * was empty rather than broken.
 */
const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("platform stats surface a failed fetch", () => {
  const source = read("src/lib/supabaseQueries.ts");

  it("checks for a query error before aggregating", () => {
    const fn = source.slice(source.indexOf("async function fetchPlatformStats"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body).toMatch(/\.find\(\(r\) => r\.error\)/);
    expect(body).toMatch(/throw new Error\(friendlyError\(/);
  });

  it("still treats a genuinely empty result as zero, not an error", () => {
    // An empty table is a real answer; only an `error` is a failure.
    const fn = source.slice(source.indexOf("async function fetchPlatformStats"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body).toMatch(/ordersResult\.data \?\? \[\]/);
  });
});

describe("the admin dashboard renders the failure instead of zeros", () => {
  const page = read("src/pages/admin/AdminDashboard.tsx");

  it("consults the query error", () => {
    expect(page).toMatch(/statsQuery\.error/);
  });

  it("offers a retry rather than a dead end", () => {
    expect(page).toMatch(/statsQuery\.refresh/);
  });

  it("shows a loading state before the figures arrive", () => {
    // `!stats` with no error is "still loading". Rendering the grid there would
    // print zeros for a frame even on a healthy fetch.
    expect(page).toMatch(/aria-busy="true"/);
    expect(page).toMatch(/animate-pulse/);
  });

  it("no longer claims there are simply no metrics", () => {
    // The old empty-state copy explained zeros as "nothing has happened yet",
    // which is the misreading this change removes.
    expect(page).not.toMatch(/No metrics yet/);
  });
});
