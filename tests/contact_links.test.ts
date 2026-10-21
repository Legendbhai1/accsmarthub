import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TELEGRAM_CHANNEL, TELEGRAM_LINKS, TELEGRAM_SUPPORT } from "@/lib/contact";

/**
 * The Telegram destinations are external links, so the internal-link walker in
 * `navigation.test.ts` cannot see them — a typo here is a live 404 or, worse,
 * someone else's channel. These pin the exact handles and the shape of the URL.
 */
describe("telegram destinations", () => {
  it("points the channel at t.me/accsmarthub", () => {
    expect(TELEGRAM_CHANNEL.url).toBe("https://t.me/accsmarthub");
    expect(TELEGRAM_CHANNEL.handle).toBe("@accsmarthub");
  });

  it("points support at the bot t.me/AccsMartHubbot", () => {
    expect(TELEGRAM_SUPPORT.url).toBe("https://t.me/AccsMartHubbot");
    expect(TELEGRAM_SUPPORT.handle).toBe("@AccsMartHubbot");
  });

  it("the handle matches the URL slug, so copy cannot drift from the link", () => {
    for (const link of TELEGRAM_LINKS) {
      expect(link.url).toBe(`https://t.me/${link.handle.slice(1)}`);
    }
  });

  it("has exactly the two links, with no duplicate destinations", () => {
    expect(TELEGRAM_LINKS).toHaveLength(2);
    const urls = TELEGRAM_LINKS.map((l) => l.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe("telegram links are actually rendered", () => {
  const root = process.cwd();
  const read = (rel: string) => readFileSync(join(root, rel), "utf8");

  it("the footer links the channel", () => {
    expect(read("src/components/site/SiteFooter.tsx")).toMatch(/TELEGRAM_CHANNEL/);
  });

  it("the support page links both", () => {
    const source = read("src/pages/buyer/BuyerSupport.tsx");
    expect(source).toMatch(/TELEGRAM_LINKS/);
    // Rendered as a real anchor that leaves the app, not an internal `to=`.
    expect(source).toMatch(/target="_blank"/);
    expect(source).toMatch(/rel="noopener noreferrer"/);
  });
});
