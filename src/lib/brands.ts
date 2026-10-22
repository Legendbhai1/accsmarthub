import {
  siDiscord,
  siFacebook,
  siGoogle,
  siInstagram,
  siPinterest,
  siTelegram,
  siTiktok,
  siTwitch,
  siX,
  siYoutube,
} from "simple-icons";

export type Brand = {
  title: string;
  hex: string;
  path: string;
};

/**
 * LinkedIn was removed from simple-icons for trademark reasons, so its
 * official glyph path (24x24 viewBox) is embedded here instead.
 */
const LINKEDIN: Brand = {
  title: "LinkedIn",
  hex: "0A66C2",
  path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z",
};

const BRANDS: Record<string, Brand> = {
  instagram: { title: siInstagram.title, hex: siInstagram.hex, path: siInstagram.path },
  tiktok: { title: siTiktok.title, hex: siTiktok.hex, path: siTiktok.path },
  youtube: { title: siYoutube.title, hex: siYoutube.hex, path: siYoutube.path },
  x: { title: siX.title, hex: siX.hex, path: siX.path },
  linkedin: LINKEDIN,
  facebook: { title: siFacebook.title, hex: siFacebook.hex, path: siFacebook.path },
  twitch: { title: siTwitch.title, hex: siTwitch.hex, path: siTwitch.path },
  pinterest: { title: siPinterest.title, hex: siPinterest.hex, path: siPinterest.path },
  telegram: { title: siTelegram.title, hex: siTelegram.hex, path: siTelegram.path },
  discord: { title: siDiscord.title, hex: siDiscord.hex, path: siDiscord.path },
  google: { title: siGoogle.title, hex: siGoogle.hex, path: siGoogle.path },
};

export function getBrand(key: string): Brand {
  return (
    BRANDS[key.toLowerCase()] ?? {
      title: "Account",
      hex: "6C7A92",
      path: "",
    }
  );
}

/**
 * Whether a brand's official colour is effectively black.
 *
 * TikTok and X are both exactly `#000000`. Drawn literally that is a black
 * tile, which is invisible against the dark canvas — the glyph is there, the
 * user just cannot see it. These brands are rendered with the foreground and
 * background tokens instead, so the tile inverts with the theme the way the
 * real logos do: dark tile with a light glyph in light mode, light tile with a
 * dark glyph in dark mode.
 *
 * The test is a luminance threshold rather than a name list so a brand added
 * later with a near-black hex is handled without anyone remembering to come
 * back here.
 */
export function isMonochromeBrand(hex: string): boolean {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  if (!Number.isFinite(value)) return false;
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  // Rec. 709 luma, 0..1.
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.12;
}

/**
 * The custom properties a card sets to carry its brand colour: a faint wash, a
 * matching hairline, and a readable ink. Set them inline as
 * `style={{ ...brandTint(brand) }}`.
 *
 * Every value here has to be a *real colour*, because it is consumed inside
 * `color-mix()` and as a plain `background`/`border-color`. The brand hexes are
 * already colours; the theme tokens are bare HSL triples, so they get wrapped
 * in `hsl()` — `var(--foreground)` on its own is the text `224 51% 8%`, which
 * is not a colour and makes the whole declaration silently invalid.
 *
 * The wash is deliberately light (14% in light mode, 20% in dark). A saturated
 * brand fill behind body copy is the thing this palette avoids; the tint is
 * here to make a grid of category tiles read as *colourful* without any of it
 * competing with the text on top. The strength lives in the
 * `--tint-wash-mix`/`--tint-line-mix`/`--tint-ink-mix` tokens so both themes
 * can differ, and the fallbacks below mirror the light-mode values.
 *
 * `--tint-ink` is the brand hue mixed 62% toward the theme's foreground, which
 * makes it a readable label in *both* themes: on white it darkens toward the
 * ink, in dark mode it lightens toward the near-white. Raw brand colours are
 * not safe as text — Telegram's `#26A5E4` is 2.8:1 on white, and the official
 * black of TikTok/X is 1.9:1 on the dark card.
 *
 * A monochrome brand has no hue to lend, so it tints with the theme ink
 * instead of an invisible black.
 */
export function brandTint(brand: string): Record<string, string> {
  const entry = getBrand(brand);
  const base = isMonochromeBrand(entry.hex)
    ? "hsl(var(--foreground))"
    : `#${entry.hex}`;
  return tintVars(base);
}

/**
 * The same custom properties, but for a *theme token* rather than a brand hex —
 * `tokenTint("--info")` gives a card the information hue. The token is a bare
 * HSL triple, so it is wrapped in `hsl()`; passing it through raw would make
 * every derived colour invalid. See `brandTint` for what the three values mean.
 */
export function tokenTint(token: string): Record<string, string> {
  return tintVars(`hsl(var(${token}))`);
}

function tintVars(base: string): Record<string, string> {
  return {
    "--tint": base,
    "--tint-wash": `color-mix(in srgb, ${base} var(--tint-wash-mix, 14%), transparent)`,
    "--tint-line": `color-mix(in srgb, ${base} var(--tint-line-mix, 40%), transparent)`,
    "--tint-ink": `color-mix(in srgb, ${base} var(--tint-ink-mix, 62%), hsl(var(--foreground)))`,
  };
}
