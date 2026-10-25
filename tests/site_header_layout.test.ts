import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

/**
 * The header is one flex row of wordmark, primary nav, search and account
 * controls. It overflowed its container — and so put a horizontal scrollbar on
 * every page — from `md` all the way to 1279px: measured with the real layout,
 * the row's children totalled 1187px at a 1014px viewport, i.e. 173px of
 * overflow, and the document scrolled to 1272px.
 *
 * The nav alone is 500px wide, and there is no width at which 500px of nav
 * plus the wordmark, the search field and the auth buttons all fit below
 * `xl` (1280px). So the nav is an `xl` feature and the hamburger covers
 * everything under it. These assertions are on the source because the
 * environment has no layout engine; the measured result is recorded in
 * AGENTS.md.
 */
describe("the site header fits every width", () => {
  const header = read("src/components/site/SiteHeader.tsx");

  it("shows the inline nav and the hamburger at exactly opposite breakpoints", () => {
    // The load-bearing invariant: the hamburger is the only navigation below
    // `xl`, so the two must switch at the same breakpoint. They are one line
    // apart in the file and were once both `lg`; moving one alone silently
    // leaves 1024-1279px with no navigation at all.
    expect(header).toMatch(/aria-label="Primary" className="[^"]*xl:flex/);
    expect(header).toMatch(/className="xl:hidden"[\s\S]*?aria-label="Open menu"/);
    expect(header).not.toMatch(/aria-label="Primary" className="[^"]*lg:flex/);
  });

  it("carries every primary link in the sheet the hamburger opens", () => {
    // Hiding the nav below `xl` is only safe while the sheet lists the same
    // links. It maps the one `NAV_LINKS` array, so the two cannot drift.
    const navLinksInSheet = header.match(/\{NAV_LINKS\.map\(/g) ?? [];
    expect(navLinksInSheet.length).toBe(2);
  });

  it("sizes the search field for the width it is given", () => {
    // The field was a fixed `w-56` that grew to `w-64` on focus — a hard 256px
    // floor in a row with no room to spare. It now shrinks at `md` and keeps
    // its full width from `sm` up, and it may not grow on focus.
    expect(header).toMatch(/hidden min-w-0 md:block/);
    expect(header).toMatch(/w-40[^"]*sm:w-56/);
    expect(header).not.toMatch(/focus:w-64/);
  });

  it("keeps the search reachable but not squeezed on the narrowest phones", () => {
    // Below `md` the field is hidden rather than allowed to crush the account
    // controls; the homepage and marketplace both carry their own search.
    expect(header).toMatch(/hidden min-w-0 md:block/);
  });

  it("carries a promo strip, and drops it on the narrowest phones", () => {
    // A storefront header has an offer line above the nav row. It is `sm:block`
    // because at 360px the row is already at its width budget — the strip is
    // the first thing to go, not the search field or the account controls.
    expect(header).toMatch(/brand-gradient-animated hidden text-primary-foreground sm:block/);
    expect(header).toMatch(/sm:block[\s\S]{0,400}?Every listing is admin-reviewed/);
  });
});
