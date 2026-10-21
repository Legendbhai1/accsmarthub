import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brandTint, getBrand, tokenTint } from "@/lib/brands";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const css = read("src/index.css");

/**
 * The theme's colour tokens are bare HSL triples (`--primary: 262 88% 60%`),
 * consumed as `hsl(var(--primary))`. That is fine for a Tailwind utility, which
 * knows to wrap them, but it is *not* a colour: put a token straight into
 * `color-mix()` or a bare `background:` and the whole declaration is silently
 * invalid. The pop hues have to be wrapped in `hsl()` at every use site.
 *
 * This was a real bug: the homepage section bands used
 * `color-mix(in srgb, var(--pop-cyan) ...)`, which painted nothing, so the
 * "colourful zones" were plain white and looked like the feature was missing
 * rather than broken.
 */
describe("colour tokens are wrapped before they are used as colours", () => {
  it("never feeds a bare token to color-mix()", () => {
    // The failure mode is `color-mix(in srgb, var(--pop-cyan) 9%, ...)` — a
    // `var()` opening the colour argument instead of `hsl(var(...))`.
    const bare = /color-mix\(in srgb,\s*var\(/g;
    expect(css.match(bare) ?? []).toEqual([]);
  });

  it("keeps the section band and the brand rule wrapped", () => {
    const band = css.slice(css.indexOf(".section-pop"), css.indexOf(".section-pop") + 400);
    expect(band).toMatch(/color-mix\(in srgb, hsl\(var\(--pop/);
    const rule = css.slice(css.indexOf(".brand-rule"), css.indexOf(".brand-rule") + 300);
    expect(rule).toMatch(/hsl\(var\(--rule-from/);
  });
});

describe("brandTint() emits real colours", () => {
  // A custom property that resolves to the text "330 85% 58%" is not a colour,
  // so every value has to be either a hex or an `hsl(...)`.
  const realColour = (value: string) =>
    /^#[0-9a-f]{6}$/i.test(value) ||
    /^hsl\(var\(--[a-z0-9-]+\)\)$/.test(value) ||
    /^color-mix\(in srgb, (hsl\(|#)/.test(value);

  it("returns only colours, never a bare triple, for every brand", () => {
    for (const brand of [
      "instagram",
      "tiktok",
      "youtube",
      "x",
      "linkedin",
      "facebook",
      "twitch",
      "pinterest",
      "telegram",
      "discord",
      "google",
      "unknown-brand",
    ]) {
      const vars = brandTint(brand);
      for (const [name, value] of Object.entries(vars)) {
        expect(realColour(value), `${brand} ${name}=${value}`).toBe(true);
      }
      // The wash and the hairline are derived from `--tint`, so that one has to
      // be a colour for the other two to resolve.
      expect(realColour(vars["--tint"]), `${brand} --tint`).toBe(true);
    }
  });

  it("wraps the monochrome fallback in hsl()", () => {
    // TikTok is #000000; the tint has to fall back to the theme ink, and the
    // ink is a bare triple, so it must arrive wrapped.
    expect(brandTint("tiktok")["--tint"]).toBe("hsl(var(--foreground))");
    expect(brandTint("x")["--tint"]).toBe("hsl(var(--foreground))");
  });

  it("uses the brand hex directly for a coloured brand", () => {
    expect(brandTint("telegram")["--tint"]).toBe(`#${getBrand("telegram").hex}`);
  });
});

describe("tokenTint() wraps a theme token the same way", () => {
  it("wraps the token in hsl() so it is a colour", () => {
    expect(tokenTint("--info")["--tint"]).toBe("hsl(var(--info))");
    expect(tokenTint("--pop-orange")["--tint"]).toBe("hsl(var(--pop-orange))");
  });

  it("derives the same three values brandTint() does", () => {
    expect(Object.keys(tokenTint("--info")).sort()).toEqual(
      Object.keys(brandTint("telegram")).sort(),
    );
    for (const value of Object.values(tokenTint("--info"))) {
      expect(value).toContain("hsl(var(--info))");
    }
  });
});
