import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

/**
 * The header person icon.
 *
 * The public header (`SiteHeader`, which wraps the homepage) had no profile
 * control: signed-out visitors saw only Log in / Create account, and signed-in
 * users had to open the account dropdown to reach their profile. The icon a
 * shopper reaches for on a phone was simply absent — the dashboard shell and
 * the marketplace header grew one, the homepage's did not.
 *
 * These assert the control and its destinations in the source. Rendering it
 * would need a router and a session, and would still pass if the link pointed
 * somewhere the guards bounce off — which is the bug being fixed.
 */
describe("the public header has a person icon", () => {
  const header = read("src/components/site/SiteHeader.tsx");

  it("imports the person icon", () => {
    expect(header).toMatch(/^\s+User,$/m);
  });

  it("sends a signed-in shopper to their profile", () => {
    expect(header).toMatch(/to=\{user \? "\/account\/profile" : authTo\}/);
  });

  it("sends a signed-out visitor to sign in", () => {
    // Same ternary: the signed-out branch is the computed `authTo`.
    expect(header).toMatch(/user \? "\/account\/profile" : authTo/);
  });

  it("labels the control for screen readers, both ways", () => {
    expect(header).toMatch(/aria-label=\{user \? "Your profile" : "Sign in"\}/);
    expect(header).toMatch(/title=\{user \? "Your profile" : "Sign in"\}/);
  });

  it("uses the app's Button and Link rather than a raw anchor", () => {
    // `asChild` keeps the icon inside the themed Button while the Link owns the
    // navigation, so focus and keyboard behaviour come from the router.
    expect(header).toMatch(/asChild/);
    expect(header).toMatch(/<Link/);
  });
});

describe("the shell header returns to the page after sign-in", () => {
  // This used to live on the marketplace page's own header, which hardcoded
  // `returnTo=/marketplace`. That header is gone — `/marketplace` renders the
  // shared shell header like every other public page — so the shell carries the
  // behaviour now, computed from the current location.
  const header = read("src/components/site/SiteHeader.tsx");

  it("uses returnTo, which the auth page actually reads", () => {
    // The auth page reads `returnTo` (and the stored fallback); it has never
    // read `next`. A `?next=` link dropped the destination, so signing in from
    // the marketplace landed the user somewhere other than the marketplace.
    expect(header).toMatch(/returnTo=\$\{encodeURIComponent/);
    expect(header).not.toMatch(/\/auth\?next=/);
  });

  it("points the person icon at the profile when signed in", () => {
    expect(header).toMatch(/to=\{user \? "\/account\/profile" : authTo\}/);
  });

  it("preserves the current path and query in the sign-in destination", () => {
    expect(header).toMatch(/location\.pathname \+ location\.search/);
  });
});

describe("the auth page reads the parameter the headers emit", () => {
  const auth = read("src/pages/flow/SupabaseAuth.tsx");

  it("parses returnTo and uses it as the destination", () => {
    expect(auth).toMatch(/params\.get\("returnTo"\)/);
    expect(auth).toMatch(/const destination =/);
  });

  it("does not read a `next` parameter", () => {
    expect(auth).not.toMatch(/params\.get\("next"\)/);
  });
});
