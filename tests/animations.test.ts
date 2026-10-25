import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

/**
 * Where the four LottieFiles animations are allowed to appear.
 *
 * Three of them are success signals, so the failure mode that matters is a
 * celebration rendered before — or without — the server agreeing. These pin the
 * gate in the source, because that is the part a refactor is most likely to
 * quietly remove: the animation is a component either way, and it looks fine on
 * screen when it is shown at the wrong moment.
 *
 * The fourth, `empty-box`, is neutral artwork and carries no outcome, so it is
 * the only one the page-transition overlay may use — see
 * `tests/route_loading.test.ts`.
 */

describe("the add-to-cart animation follows the cart write", () => {
  const source = read("src/pages/public/ListingDetail.tsx");

  it("awaits the cart write before flagging the item as added", () => {
    const handler = source.slice(
      source.indexOf("const addToCart"),
      source.indexOf("const addToCart") + 900,
    );
    // `await` must precede `setJustAdded`, or the overlay announces a success
    // that has not happened yet.
    const awaited = handler.indexOf("await cartAdd");
    const flagged = handler.indexOf("setJustAdded(true)");
    expect(awaited).toBeGreaterThan(-1);
    expect(flagged).toBeGreaterThan(awaited);
  });

  it("only surfaces the animation on the success flag", () => {
    expect(source).toMatch(/\{justAdded &&/);
    expect(source).toMatch(/name="add-to-cart"/);
  });

  it("reports the failure instead of animating it", () => {
    const handler = source.slice(
      source.indexOf("const addToCart"),
      source.indexOf("const addToCart") + 900,
    );
    expect(handler).toMatch(/catch/);
    expect(handler).toMatch(/toast\.error/);
  });
});

describe("the shopping-bag animation sits on the empty cart", () => {
  const source = read("src/pages/buyer/BuyerCart.tsx");

  it("renders it only when there are no lines", () => {
    expect(source).toMatch(/lines\.length === 0/);
    expect(source).toMatch(/name="shopping-bag"/);
  });

  it("offers a way out of the empty state", () => {
    // The animation is only useful next to an action; an empty page with
    // artwork and no link is a dead end.
    const empty = source.slice(source.indexOf("lines.length === 0"));
    expect(empty).toMatch(/Explore the marketplace/);
    expect(empty).toMatch(/to="\/marketplace"/);
  });
});

describe("the order-confirmed animation follows the server row", () => {
  const source = read("src/pages/flow/OrderConfirmed.tsx");

  it("mounts it only once the order has loaded", () => {
    // A stale or mistyped order link must not get a confirmation animation for
    // an order that does not exist.
    expect(source).toMatch(/\{order \? \(/);
    expect(source).toMatch(/name="order-confirmed"/);
  });

  it("reads the order back from Supabase", () => {
    expect(source).toMatch(/fetchOrder\(/);
  });
});

describe("the animation component honours the constraints", () => {
  const source = read("src/components/common/LottieAnimation.tsx");

  it("lazy-loads the player and every payload", () => {
    // The engine and the JSON are the two heavy things; neither may be in the
    // entry chunk.
    expect(source).toMatch(/lazy\(/);
    expect(source).toMatch(/import\("lottie-react"\)/);
    expect(source).toMatch(/import\("@\/assets\/animations\//);
  });

  it("respects reduced motion", () => {
    expect(source).toMatch(/useReducedMotion/);
    expect(source).toMatch(/autoplay=\{!reduced\}/);
  });

  it("carries accessible text", () => {
    expect(source).toMatch(/role="img"/);
    expect(source).toMatch(/aria-label=/);
    // The player itself is hidden so the meaning is announced once, not twice.
    expect(source).toMatch(/aria-hidden="true"/);
  });

  it("plays once rather than looping", () => {
    expect(source).toMatch(/loop=\{false\}/);
  });
});

describe("the bundled animations are the requested ones", () => {
  const readme = read("src/assets/animations/README.md");

  it("records the exact LottieFiles IDs and their licence", () => {
    for (const id of [
      "add-to-cart-WCwxTKlisi",
      "shopping-bag-WjAOPr7V8K",
      "order-confirmed-Edkng7cpMO",
      "empty-box-XtO1oiZwG6",
    ]) {
      expect(readme).toContain(id);
    }
    expect(readme).toMatch(/Lottie Simple License/);
  });

  it("bundles a local copy of each, not a remote URL", () => {
    for (const file of [
      "add-to-cart.json",
      "shopping-bag.json",
      "order-confirmed.json",
      "empty-box.json",
    ]) {
      const json = read(`src/assets/animations/${file}`);
      expect(json).toMatch(/"v"\s*:/);
      // A remote asset reference would make the animation depend on a third
      // party at render time.
      expect(json).not.toMatch(/https?:\/\//);
    }
  });
});
