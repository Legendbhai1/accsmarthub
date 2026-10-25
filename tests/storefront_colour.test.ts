import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

/**
 * The storefront pages a shopper actually lands on — the marketplace and the
 * auth screens — used to render as a single narrow column on a white canvas.
 *
 * The marketplace was `max-w-md` at every width, so on a laptop it was a 448px
 * strip centred in a 1440px viewport: measured from a real screenshot, two
 * thirds of the screen was empty white gutter and only ~4% of the pixels
 * carried any hue, against ~40% on the homepage. The tokens were already a
 * colourful commerce palette; the colour simply never reached these pages.
 *
 * These assert the shape of the fix in the source, because rendering it needs
 * a router, a session and a live Supabase project — none of which the test
 * environment has. The contrast maths the washes rely on is pinned separately
 * in `tests/theme.test.ts`.
 */
describe("the marketplace uses the width it is given", () => {
  const page = read("src/pages/public/Marketplace.tsx");

  it("widens past the phone column at sm and up", () => {
    // The bug: every content container was `max-w-md` with no breakpoint, so
    // the page never grew on a desktop. Each of those containers now carries a
    // `sm:max-w-7xl` partner.
    const phoneColumns = page.match(/max-w-md/g) ?? [];
    const wideColumns = page.match(/sm:max-w-7xl/g) ?? [];
    expect(phoneColumns.length).toBeGreaterThan(0);
    expect(wideColumns.length).toBe(phoneColumns.length);
  });

  it("lays the listings out as a responsive grid, not a two-up phone grid", () => {
    // Two columns on a phone is right; two columns on a 1440px screen is the
    // empty-gutter look. The grid gains columns as the viewport does.
    expect(page).toMatch(
      /grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4/,
    );
  });

  it("wraps the listings in a coloured band", () => {
    // `.section-pop` is the theme's "coloured zone" treatment. The listings are
    // the largest surface on the page, so the band is what stops the storefront
    // reading as a white sheet.
    expect(page).toMatch(/section-pop/);
    expect(page).toMatch(/\["--pop" as string\]: "var\(--pop-cyan\)"/);
  });

  it("tints each listing card with its platform colour", () => {
    expect(page).toMatch(/brandTint\(listing\.brand\)/);
    expect(page).toMatch(/tint-card/);
  });
});

describe("the auth page is not a blank white sheet", () => {
  const auth = read("src/pages/flow/SupabaseAuth.tsx");

  it("paints the brand wash behind the form", () => {
    expect(auth).toMatch(/brand-wash/);
  });

  it("caps the card with the brand ramp", () => {
    expect(auth).toMatch(/brand-gradient/);
  });

  it("keeps the wash out of the form's stacking context", () => {
    // The wash sits behind everything; a form control over a bloom would lose
    // contrast, which is the failure the `-z-10` prevents.
    expect(auth).toMatch(/-z-10/);
  });
});
