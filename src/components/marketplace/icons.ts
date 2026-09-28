import { siDiscord, siFacebook, siInstagram, siPinterest, siTelegram, siTiktok, siTwitch, siX, siYoutube } from "simple-icons";

export type BrandEntry = {
  title: string;
  hex: string;
  path: string;
};

/**
 * LinkedIn was removed from the simple-icons package for trademark reasons,
 * so its official glyph path is embedded here instead (24x24 viewBox).
 */
const LINKEDIN: BrandEntry = {
  title: "LinkedIn",
  hex: "0A66C2",
  path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z",
};

const BRANDS: Record<string, BrandEntry> = {
  instagram: {
    title: siInstagram.title,
    hex: siInstagram.hex,
    path: siInstagram.path,
  },
  tiktok: {
    title: siTiktok.title,
    hex: siTiktok.hex,
    path: siTiktok.path,
  },
  youtube: {
    title: siYoutube.title,
    hex: siYoutube.hex,
    path: siYoutube.path,
  },
  x: {
    title: siX.title,
    hex: siX.hex,
    path: siX.path,
  },
  linkedin: LINKEDIN,
  facebook: {
    title: siFacebook.title,
    hex: siFacebook.hex,
    path: siFacebook.path,
  },
  twitch: {
    title: siTwitch.title,
    hex: siTwitch.hex,
    path: siTwitch.path,
  },
  pinterest: {
    title: siPinterest.title,
    hex: siPinterest.hex,
    path: siPinterest.path,
  },
  telegram: {
    title: siTelegram.title,
    hex: siTelegram.hex,
    path: siTelegram.path,
  },
  discord: {
    title: siDiscord.title,
    hex: siDiscord.hex,
    path: siDiscord.path,
  },
};

/** Case-insensitive lookup so legacy names like "X (Twitter)" still resolve. */
export function getBrand(key: string): BrandEntry {
  const normalized = key.toLowerCase();
  return (
    BRANDS[normalized] ?? {
      title: "Account",
      hex: "6C7A92",
      path: "",
    }
  );
}

export const brandEntries: [string, BrandEntry][] = Object.entries(BRANDS);
