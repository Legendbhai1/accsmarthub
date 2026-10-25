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
    // Anchor to the rule itself: the token comment above it also names
    // `.section-pop`, and matching from that would read the wrong block.
    const at = css.indexOf("\n  .section-pop {");
    const band = css.slice(at, at + 400);
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
  /** Composite a colour over an arbitrary canvas. The band and the tint card
      sit on different canvases — white in light mode, near-black in dark — so
      reusing a white-only helper would test the wrong thing. */
  const overCanvas = (rgb: number[], alpha: number, canvas: number[]) =>
    rgb.map((v, i) => Math.round(alpha * v + (1 - alpha) * canvas[i]));

  it("paints the band at the themed strength, wrapped in hsl()", () => {
    // Search from the rule, not from the first mention — the token comment
    // above it also says `.section-pop`.
    const at = css.indexOf("\n  .section-pop {");
    const band = css.slice(at, at + 400);
    expect(band).toMatch(/hsl\(var\(--pop/);
    // The strength is a per-theme token so the same class can be bold on a
    // light canvas and restrained on near-black; both stops read it. The
    // fallbacks here are the light-theme values, so they must track that block.
    expect(band).toMatch(/var\(--band-strong, 32%\)/);
    expect(band).toMatch(/var\(--band-soft, 8%\)/);
  });

  it("keeps the band a tint rather than a saturated fill", () => {
    // A full-width band at high strength reads as a colour block, not a zone.
    // At 54% the FAQ hero was a solid mint panel; the band is what makes a
    // section *read* as tinted, so it has to stay well under half strength.
    // Read both blocks by slicing from the theme's own `:root`/`.dark` marker,
    // the same way the contrast test below does.
    const bandOf = (from: number) => {
      const m = css.slice(from).match(/--band-strong:\s*([\d.]+)%/);
      expect(m, "--band-strong should be a percentage").not.toBeNull();
      return Number(m![1]) / 100;
    };
    const darkAt = css.indexOf("  .dark {");
    for (const [name, from] of [
      ["light", css.indexOf("  :root {")],
      ["dark", darkAt],
    ] as const) {
      expect(from, `${name} block should exist`).toBeGreaterThan(-1);
      const strong = bandOf(from);
      expect(strong, `--band-strong (${name})`).toBeLessThanOrEqual(0.36);
      expect(strong, `--band-strong (${name})`).toBeGreaterThanOrEqual(0.1);
    }
  });

  it("keeps muted-foreground at 4.5:1 on the strongest band of every hue", () => {
    // The theme's own triples, not a copy: if either token moves, this fails.
    const token = (name: string, block = "") => {
      const src = block ? css.slice(css.indexOf(block)) : css;
      const m = src.match(new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`));
      expect(m, `--${name} should be a bare HSL triple`).not.toBeNull();
      return hslToRgb(Number(m![1]), Number(m![2]), Number(m![3]));
    };
    const bandMix = (name: string, block = "") => {
      const src = block ? css.slice(css.indexOf(block)) : css;
      const bare = name.replace(/^--/, "");
      const m = src.match(new RegExp(`--${bare}:\\s*([\\d.]+)%`));
      expect(m, `--${bare} should be a percentage`).not.toBeNull();
      return Number(m![1]) / 100;
    };
    // The top of the gradient is the darkest point body copy can sit on, and it
    // is the strongest stop of whichever canvas is being checked. Each canvas
    // composites over its own background, so a dark band is measured against
    // the near-black page rather than against white.
    const canvases = [
      { block: "", bg: token("background") },
      { block: ".dark {", bg: token("background", ".dark {") },
    ];
    for (const { block, bg: canvas } of canvases) {
      const muted = token("muted-foreground", block);
      const alpha = bandMix("--band-strong", block);
      for (const hue of ["primary", "brand-2", "pop-cyan", "pop-orange", "pop-green"]) {
        const bg = overCanvas(token(hue, block), alpha, canvas);
        expect(
          contrast(muted, bg),
          `muted-foreground on the ${alpha * 100}% --${hue} band${block ? " (dark)" : ""}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps the tint wash strength in one token per theme", () => {
    // Both canvases name their own mix, and each has to stay inside its own
    // measured ceiling: 45% in light mode, 37% in dark. The ceiling is *lower*
    // in dark mode, not higher — `--muted-foreground` is a light grey there
    // (86%), and a light pop hue at a high alpha washes it out, so the same
    // mix that is safe on white fails on near-black. (An earlier version of
    // this test asserted dark was always stronger than light; that ordering
    // was incidental and measurement shows it does not hold.)
    const tokens = css.match(/--tint-wash-mix:\s*([\d.]+)%/g) ?? [];
    expect(tokens).toHaveLength(2);
    const values = tokens.map((s) => Number(s.match(/([\d.]+)%/)![1]));
    for (const value of values) {
      // Below ~30% the wash stops reading as a tint at all; above the ceiling
      // the tint suites in this file fail. Both bounds are load-bearing.
      expect(value).toBeGreaterThanOrEqual(30);
      expect(value).toBeLessThanOrEqual(45);
    }
  });

  it("keeps the canvas tinted, so white cards have something to lift off", () => {
    // The storefront measured 52-64% *pure white* by pixel area: the canvas was
    // #FFFFFF and so was every card, so a card had no figure-ground separation
    // and the page read as an unfinished document rather than a shop. The
    // canvas is now a soft cool tint while `--card` stays white, which is what
    // makes a surface read as raised. This is the invariant that regression
    // broke, so it is pinned rather than described.
    const lightBg = css.slice(css.indexOf(":root {"), css.indexOf(".dark {"));
    expect(lightBg).toMatch(/--background:\s*216 44% 94%/);
    expect(lightBg).toMatch(/--card:\s*0 0% 100%/);
    // A white canvas is the specific regression.
    expect(lightBg).not.toMatch(/--background:\s*0 0% 100%/);
    // And the text on it still clears AA.
    const token = (name: string) => {
      const m = lightBg.match(new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`));
      expect(m, `--${name} should be a bare HSL triple`).not.toBeNull();
      return hslToRgb(Number(m![1]), Number(m![2]), Number(m![3]));
    };
    const bg = token("background");
    expect(contrast(token("foreground"), bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("muted-foreground"), bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("paints the tint card as a flat wash, not a fade to white", () => {
    // A gradient that reached `transparent` partway left most of every tile
    // white, so the category grid read as white boxes with coloured corners.
    const card = css.slice(css.indexOf(".tint-card"), css.indexOf(".tint-card") + 300);
    expect(card).toMatch(/var\(--tint-wash, transparent\)/);
    expect(card).not.toMatch(/transparent\s+\d+%/);
  });

  it("paints the empty state as a coloured zone, not a white box", () => {
    // The empty state is the largest surface on a young marketplace, so it is
    // where the page either reads as a shop or as a blank. It has to carry the
    // hue: the panel wash reads `--pop`, and the shared `EmptyState` passes the
    // same token to the icon tile. The rule is read to its closing brace rather
    // than to a fixed offset — a magic window silently stops covering the rule
    // as soon as the rule grows, which is exactly what happened here.
    const start = css.indexOf(".empty-panel");
    const panel = css.slice(start, css.indexOf("}", start) + 1);
    expect(panel).toMatch(/hsl\(var\(--pop, var\(--primary\)\)/);
    expect(panel).not.toMatch(/color-mix\(in srgb, var\(--pop/);
    // Every gradient stop has to be a wash of the hue, so the panel is tinted
    // edge to edge. A stop that reached bare `transparent` left the middle of
    // the panel white — the same failure as the tint card above.
    const washes = panel.match(/hsl\(var\(--pop, var\(--primary\)\) \/ [\d.]+\)/g) ?? [];
    expect(washes.length).toBeGreaterThanOrEqual(3);
    const primitives = read("src/components/common/Primitives.tsx");
    expect(primitives).toMatch(/empty-panel/);
    expect(primitives).toMatch(/\["--pop" as string\]: accent/);
  });

  it("caps the hero orb so the copy on top stays AA", () => {
    // The orbs sit behind the hero paragraph. At 0.55 a rose bloom dropped
    // `--muted-foreground` to 4.42:1, so the cap is load-bearing, not taste.
    const orb = css.slice(css.indexOf(".orb {"), css.indexOf(".orb {") + 300);
    const opacity = Number(orb.match(/opacity:\s*([\d.]+)/)![1]);
    expect(opacity).toBeLessThanOrEqual(0.45);
  });

  it("keeps muted-foreground readable on every brand-tinted card", () => {
    // The tile grid washes each card with its platform's own hex, and those
    // hexes are not the theme's — YouTube's red and Pinterest's crimson are
    // far more saturated than any `--pop-*` token. Same 4.5:1 floor, and the
    // wash is read from the theme rather than hardcoded so a bump has to
    // justify itself here.
    const token = (name: string, block = "") => {
      const src = block ? css.slice(css.indexOf(block)) : css;
      const m = src.match(new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`));
      return hslToRgb(Number(m![1]), Number(m![2]), Number(m![3]));
    };
    const washMix = (block = "") => {
      const src = block ? css.slice(css.indexOf(block)) : css;
      const m = src.match(/--tint-wash-mix:\s*([\d.]+)%/);
      return Number(m![1]) / 100;
    };
    // TikTok/X are #000000, but `brandTint()` never washes a card with them —
    // a monochrome brand falls back to the foreground token — so the black hex
    // is not in this list. It is covered by the `brandTint()` suite above.
    const hexes = ["E4405F", "FF0000", "1877F2", "9146FF", "BD081C", "26A5E4", "5865F2", "4285F4", "0A66C2"];
    for (const block of ["", ".dark {"]) {
      const muted = token("muted-foreground", block);
      const wash = washMix(block);
      for (const hex of hexes) {
        const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
        expect(
          contrast(muted, overCanvas(rgb, wash, token("card", block))),
          `muted-foreground on the ${wash * 100}% #${hex} card${block ? " (dark)" : ""}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps muted-foreground readable on every theme-tinted card", () => {
    // `tint-card` is also fed the *theme's own* hues, not just platform hexes:
    // Trust passes `--primary/--brand-2/--bronze/--info/--success` and Disputes
    // passes the `--pop-*` set through `tokenTint()`. Those are darker and more
    // saturated than a brand hex, so the brand-hex suite above does not cover
    // them — and that gap was real: raising the dark wash to 28% left 8 of the
    // 10 tokens under 4.5:1 (worst 3.82:1 on `--pop-cyan`) while every brand
    // hex still passed. The list is read from the two pages so a new token
    // cannot be added to a tint card without being measured here.
    const tintTokens = ["primary", "brand-2", "bronze", "info", "success", "warning"];
    const popTokens = ["pop-cyan", "pop-green", "pop-orange", "pop-pink"];
    const token = (name: string, block = "") => {
      const src = block ? css.slice(css.indexOf(block)) : css;
      const m = src.match(new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`));
      return hslToRgb(Number(m![1]), Number(m![2]), Number(m![3]));
    };
    const washMix = (block = "") => {
      const src = block ? css.slice(css.indexOf(block)) : css;
      const m = src.match(/--tint-wash-mix:\s*([\d.]+)%/);
      return Number(m![1]) / 100;
    };
    for (const block of ["", ".dark {"]) {
      const muted = token("muted-foreground", block);
      const wash = washMix(block);
      for (const name of [...tintTokens, ...popTokens]) {
        const rgb = token(name, block);
        expect(
          contrast(muted, overCanvas(rgb, wash, token("card", block))),
          `muted-foreground on the ${wash * 100}% --${name} card${block ? " (dark)" : ""}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

/**
 * The glyph on a tinted tile is drawn *on top of* the tile's own wash, so it is
 * the one colour in the palette that has to be measured against a surface made
 * of itself. A hue tuned to fill a shape is not automatically legible as a 2px
 * stroke: at this palette's saturation the cyan, green and orange glyphs fell
 * to 2.5-2.6:1 against their own 14% wash, under the 3:1 floor for a graphic.
 * The tile therefore pulls its glyph toward the theme ink, and this pins both
 * the mix and the contrast it buys.
 */
describe("the tile glyph stays legible on its own wash", () => {
  const srgb = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const luminance = ([r, g, b]: number[]) =>
    0.2126 * srgb(r / 255) + 0.7152 * srgb(g / 255) + 0.0722 * srgb(b / 255);
  const contrast = (a: number[], b: number[]) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const hslToRgb = (h: number, s: number, l: number): number[] => {
    const k = (n: number) => (n + h / 30) % 12;
    const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
    const f = (n: number) =>
      l / 100 - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
  };
  const overCanvas = (rgb: number[], alpha: number, canvas: number[]) =>
    rgb.map((v, i) => Math.round(alpha * v + (1 - alpha) * canvas[i]));
  const mix = (a: number[], b: number[], p: number) =>
    a.map((v, i) => Math.round(p * v + (1 - p) * b[i]));
  const token = (name: string, block = "") => {
    const src = block ? css.slice(css.indexOf(block)) : css;
    const m = src.match(new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`));
    expect(m, `--${name} should be a bare HSL triple`).not.toBeNull();
    return hslToRgb(Number(m![1]), Number(m![2]), Number(m![3]));
  };

  it("mixes the glyph toward the ink rather than drawing the bare hue", () => {
    const at = css.indexOf("\n  .icon-tile {");
    const tile = css.slice(at, at + 700);
    expect(tile).toMatch(/color:\s*color-mix\(in srgb, hsl\(var\(--tile\)\)/);
    expect(tile).not.toMatch(/color:\s*hsl\(var\(--tile\)\);/);
    expect(tile).toMatch(/var\(--tile-ink-mix, 78%\)/);
  });

  it("clears 3:1 for every theme hue in both themes", () => {
    const hues = [
      "primary", "brand-2", "bronze", "info", "success", "warning",
      "pop-cyan", "pop-green", "pop-orange", "pop-pink",
    ];
    const mixMatch = css.match(/--tile-ink-mix:\s*([\d.]+)%/);
    const inkMix = mixMatch ? Number(mixMatch[1]) / 100 : 0.78;
    for (const block of ["", ".dark {"]) {
      const ink = token("foreground", block);
      const canvas = token("card", block);
      for (const name of hues) {
        const hue = token(name, block);
        const bg = overCanvas(hue, 0.14, canvas);
        const glyph = mix(hue, ink, inkMix);
        expect(
          contrast(glyph, bg),
          `--${name} glyph on its tile${block ? " (dark)" : ""}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
