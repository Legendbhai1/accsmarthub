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

/**
 * The storefront's colour is a *band*, not a fill: a section is tinted with a
 * hue at a low mix so the text on top keeps its contrast. Raising the wash is
 * the whole point of a "colourful" pass, but it is also the one change that can
 * quietly make `text-muted-foreground` fail AA on a saturated section. These pin
 * the strength *and* the contrast it implies, so a future bump has to bring a
 * darker grey with it.
 */
describe("the section band is colourful without dropping contrast", () => {
  const srgb = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const luminance = ([r, g, b]: number[]) =>
    0.2126 * srgb(r / 255) + 0.7152 * srgb(g / 255) + 0.0722 * srgb(b / 255);
  const contrast = (a: number[], b: number[]) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  /** `hsl()` as the browser resolves it, for a bare `H S% L%` triple. */
  const hslToRgb = (h: number, s: number, l: number): number[] => {
    const k = (n: number) => (n + h / 30) % 12;
    const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
    const f = (n: number) =>
      l / 100 - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
  };
  const overWhite = (rgb: number[], alpha: number) =>
    rgb.map((v) => Math.round(alpha * v + (1 - alpha) * 255));

  it("paints the band at 24% down to 6%, wrapped in hsl()", () => {
    const band = css.slice(css.indexOf(".section-pop"), css.indexOf(".section-pop") + 400);
    expect(band).toMatch(/hsl\(var\(--pop/);
    expect(band).toMatch(/24%/);
    expect(band).toMatch(/6%/);
  });

  it("keeps muted-foreground at 4.5:1 on the strongest band of every hue", () => {
    // The theme's own triples, not a copy: if either token moves, this fails.
    const token = (name: string) => {
      const m = css.match(new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`));
      expect(m, `--${name} should be a bare HSL triple`).not.toBeNull();
      return hslToRgb(Number(m![1]), Number(m![2]), Number(m![3]));
    };
    const muted = token("muted-foreground");
    // The 24% band is the top of the gradient and the darkest point body copy
    // can sit on.
    for (const hue of ["primary", "brand-2", "pop-cyan", "pop-orange", "pop-green"]) {
      const bg = overWhite(token(hue), 0.24);
      expect(
        contrast(muted, bg),
        `muted-foreground on the 24% --${hue} band`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the tint wash strength in one token per theme", () => {
    // Both canvases name the mix, and dark is stronger than light — a hue at
    // 18% is a clear tint on white but is swallowed on the dark card.
    const light = css.match(/--tint-wash-mix:\s*([\d.]+)%/g) ?? [];
    expect(light).toHaveLength(2);
    const values = light.map((s) => Number(s.match(/([\d.]+)%/)![1]));
    expect(Math.min(...values)).toBe(18);
    expect(Math.max(...values)).toBeGreaterThan(18);
  });

  it("paints the tint card as a flat wash, not a fade to white", () => {
    // A gradient that reached `transparent` partway left most of every tile
    // white, so the category grid read as white boxes with coloured corners.
    const card = css.slice(css.indexOf(".tint-card"), css.indexOf(".tint-card") + 300);
    expect(card).toMatch(/var\(--tint-wash, transparent\)/);
    expect(card).not.toMatch(/transparent\s+\d+%/);
  });

  it("keeps muted-foreground readable on every brand-tinted card", () => {
    // The tile grid washes each card with its platform's own hex, and those
    // hexes are not the theme's — YouTube's red and Pinterest's crimson are
    // far more saturated than any `--pop-*` token. Same 4.5:1 floor.
    const token = (name: string) => {
      const m = css.match(new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`));
      return hslToRgb(Number(m![1]), Number(m![2]), Number(m![3]));
    };
    const muted = token("muted-foreground");
    for (const hex of ["E4405F", "FF0000", "1877F2", "9146FF", "BD081C", "26A5E4", "5865F2", "4285F4", "0A66C2"]) {
      const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
      expect(
        contrast(muted, overWhite(rgb, 0.18)),
        `muted-foreground on the 18% #${hex} card`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
